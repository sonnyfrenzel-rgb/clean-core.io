'use client';

import { useRef, useState } from 'react';
import { Check, Loader2, AlertCircle, Send } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import {
  SURVEY_QUESTIONS,
  SURVEY_FREETEXT_PROMPT,
  SURVEY_FREETEXT_LEAD,
  SURVEY_FREETEXT_MAX,
  getOption,
} from '@/lib/survey/definition';
import { chosen, type SurveyAnswer } from '@/lib/survey/store';

/**
 * The survey, after the tap.
 *
 * **Nothing on this page records itself.** Every answer needs a real press.
 *
 * It used to submit the emailed answer from an effect, on mount, and the reasoning
 * was written down here: a POST rather than a GET, because "a gateway does not run
 * scripts, so it never gets past the page". The first real send disproved that
 * sentence. Of the thirty-seven invitations sent on 2 September at 07:12, twelve
 * came back as recorded answers between 07:13:39 and 07:15:01 — inside the
 * eighty-three seconds the job took to send them — each with four to twelve seconds
 * between the page being fetched and the answer being written, and each answering
 * only the question that was a link in the mail. Nobody reads a mail four seconds
 * after it is sent. Microsoft Defender Safe Links, Proofpoint and Mimecast open
 * every link in a headless browser and execute its JavaScript to look for phishing.
 * The POST defended the half that was never under attack.
 *
 * So the emailed answer is now carried in as a *preselection*: the option arrives
 * highlighted, the reader confirms it with one press, and until they do it is not
 * an answer and is not counted as one. `isTrusted` is checked on every press
 * because a synthetic event dispatched by a script reports false — a rendered page
 * is not a reader.
 *
 * The cost is one extra tap for someone who answered in the mail. The alternative
 * is a result set that is a census of security appliances, which is what the first
 * run produced.
 *
 * The free-text box keeps its button, because typing has to be committed
 * deliberately.
 */

type Status = 'idle' | 'unconfirmed' | 'saving' | 'saved' | 'error';

export default function SurveyClient({
  token,
  initialQuestion,
  initialOption,
  existingAnswers,
  existingComment,
  closesOn,
}: {
  token: string;
  initialQuestion: string | null;
  initialOption: string | null;
  existingAnswers: Record<string, SurveyAnswer>;
  existingComment: string;
  closesOn: string;
}) {
  // What the reader chose in the email. A proposal, not an answer: it arrives
  // highlighted so the press that confirms it is a single one, and it is dropped
  // if the server already holds an answer to that question — a returning reader's
  // own earlier answer outranks a link they tapped once.
  const proposed =
    initialQuestion &&
    initialOption &&
    getOption(initialQuestion, initialOption) &&
    !(initialQuestion in existingAnswers)
      ? { question: initialQuestion, option: initialOption }
      : null;

  // What is on screen, including the unconfirmed proposal.
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>(
    proposed ? { ...existingAnswers, [proposed.question]: proposed.option } : existingAnswers,
  );
  // What the server actually holds. Everything counted, and everything read back
  // at the foot of the page, comes from here — so the page can never tell someone
  // an answer is recorded before it is.
  const [saved, setSaved] = useState<Record<string, SurveyAnswer>>(existingAnswers);
  const [status, setStatus] = useState<Record<string, Status>>(
    proposed ? { [proposed.question]: 'unconfirmed' } : {},
  );
  const [comment, setComment] = useState(existingComment);
  // What is actually on the server. `comment !== sentComment` is the only honest
  // definition of "there is something here that has not been sent", and it is what
  // both the button and the line beside it are driven from.
  const [sentComment, setSentComment] = useState(existingComment);
  const [commentStatus, setCommentStatus] = useState<Status>(existingComment ? 'saved' : 'idle');

  async function post(questionId: string, value: SurveyAnswer): Promise<boolean> {
    try {
      const res = await fetch('/api/survey/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Array.isArray(value)
            ? { token, questionId, optionIds: value }
            : { token, questionId, optionId: value },
        ),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * One request at a time per question, and only the newest press may speak.
   *
   * Every press used to start its own request and then write `saved` and the
   * status from the value it had captured. Tap A, tap B before A's request has
   * come back, and if A finishes last it writes A into `saved` and reports
   * "saved" — while B is what is highlighted on screen and what the server
   * holds. The read-back at the foot of the page then contradicted the
   * selection, and the two requests could also reach the server in the wrong
   * order (QA review of 33471220d6e9, finding f7110f3d6619).
   *
   * `queues` serialises the requests for one question, so the server's last
   * write is the reader's last press; `latest` is the sequence number of that
   * press, and a request that is no longer the latest settles nothing.
   * Questions stay tappable — the answer on screen is the answer being sent.
   */
  const queues = useRef<Record<string, Promise<void>>>({});
  const latest = useRef<Record<string, number>>({});

  /** A press on this page. An event handler, so setting state here is the normal path. */
  async function record(questionId: string, value: SurveyAnswer) {
    const seq = (latest.current[questionId] ?? 0) + 1;
    latest.current[questionId] = seq;
    setStatus((s) => ({ ...s, [questionId]: 'saving' }));
    setAnswers((a) => ({ ...a, [questionId]: value }));

    const run = (queues.current[questionId] ?? Promise.resolve()).then(async () => {
      const ok = await post(questionId, value);
      // The requests are serialised, so a success is what the server holds now,
      // superseded or not: if the newer press then fails, the read-back has to
      // show this answer, not the one before it.
      if (ok) setSaved((s) => ({ ...s, [questionId]: value }));
      // Superseded while it was in flight: the press that superseded it owns
      // the status.
      if (latest.current[questionId] !== seq) return;
      setStatus((s) => ({ ...s, [questionId]: ok ? 'saved' : 'error' }));
    });
    queues.current[questionId] = run;
    await run;
  }

  /**
   * The gate every answer passes through.
   *
   * `isTrusted` is false for an event a script dispatched and true only for one the
   * browser raised from a real pointer or key. It is the cheapest thing that
   * separates a person from the headless browser a mail gateway opens the link
   * with — and after 2 September it is the difference between an answer and a
   * scan. Keyboard activation of a `<button>` raises a trusted click, so this
   * costs nothing in accessibility.
   */
  function press(e: { isTrusted: boolean }, run: () => void) {
    if (!e.isTrusted) return;
    run();
  }

  /**
   * Toggling one box on a multi-select question sends the whole selection, not the
   * box. Sending the single change would leave the server guessing what the other
   * boxes look like, and unticking the last one would be indistinguishable from
   * never having answered.
   */
  function toggle(questionId: string, optionId: string) {
    const current = chosen(answers[questionId]);
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    void record(questionId, next);
  }

  // There is deliberately no effect here that writes an answer. The one that used
  // to sit at this spot is what the doc comment above is about.

  /**
   * The note gets the same treatment as the answers: requests go out one at a
   * time, so the server's last write is the last send, and only the newest send
   * sets the status. Editing the box re-enables the button while a send is still
   * in flight, and two overlapping sends could otherwise land in either order
   * and leave `sentComment` on the text the server no longer holds.
   */
  const commentQueue = useRef<Promise<void>>(Promise.resolve());
  const commentLatest = useRef(0);

  async function saveComment() {
    const seq = commentLatest.current + 1;
    commentLatest.current = seq;
    const text = comment;
    setCommentStatus('saving');
    const run = commentQueue.current.then(async () => {
      let ok = false;
      try {
        const res = await fetch('/api/survey/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, comment: text }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (ok) setSentComment(text);
      if (commentLatest.current !== seq) return;
      setCommentStatus(ok ? 'saved' : 'error');
    });
    commentQueue.current = run;
    await run;
  }

  const commentUnsent = comment.trim() !== sentComment.trim();
  // Counted from the server's copy, never from the selection on screen.
  const doneCount = SURVEY_QUESTIONS.filter((q) => chosen(saved[q.id]).length > 0).length;
  const totalQuestions = SURVEY_QUESTIONS.length;
  const proposedLabel = proposed ? getOption(proposed.question, proposed.option)?.label : null;

  return (
    <div className="space-y-8">
      {/*
        A progress strip instead of a completion panel.
        The green "Recorded. Thank you." card that used to sit here read as the
        end of the interaction — which it was not, and the first person to use it
        stopped there. A count of what is left cannot be mistaken for a finish.
      */}
      <div className="rounded-2xl border border-cc-line bg-cc-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-bold text-cc-ink">
            {doneCount} of {totalQuestions} answered
          </p>
          {proposed && status[proposed.question] === 'unconfirmed' && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-cc-warning">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> not recorded yet
            </span>
          )}
          {proposed && status[proposed.question] === 'saving' && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-cc-ink-muted">
              <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" /> saving
            </span>
          )}
          {proposed && status[proposed.question] === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-cc-success">
              <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> saved
            </span>
          )}
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <span
              key={i}
              className={[
                'h-1.5 flex-1 rounded-full',
                i < doneCount ? 'bg-cc-success' : 'bg-cc-line',
              ].join(' ')}
            />
          ))}
        </div>
        {proposed && proposedLabel && status[proposed.question] === 'unconfirmed' && (
          <p className="mt-3 text-sm text-cc-ink-muted leading-relaxed">
            You picked{' '}
            <span className="font-bold text-cc-ink">&ldquo;{proposedLabel}&rdquo;</span> in the
            email. It is selected in the first question below — one tap records it, and you can
            pick a different one instead.
          </p>
        )}
      </div>

      {/*
        Every question is on the page now, the emailed one included. It used to be
        answered only by the link in the mail and never rendered here, which meant
        that once the automatic submit was removed there was no way left to answer
        it at all.
      */}
      {SURVEY_QUESTIONS.map((q) => (
        <section key={q.id}>
          <h2 className="text-lg sm:text-xl font-bold text-cc-ink tracking-tight leading-snug">
            {q.prompt}
          </h2>
          {q.lead && <p className="text-sm text-cc-ink-muted mt-1 leading-relaxed">{q.lead}</p>}

          <div className="mt-4 space-y-2">
            {q.options.map((o) => {
              const selected = chosen(answers[q.id]).includes(o.id);
              // Selected but not yet on the server. Amber rather than green,
              // because green here has meant "recorded" everywhere else on this
              // page and a preselection has not been recorded by anyone.
              // A choice tile, not one of the four buttons of DESIGN.md §1.5:
              // its state is the border, the ring and the marker, with no fill
              // of its own (block D, D.26).
              const awaiting = selected && status[q.id] === 'unconfirmed';
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={(e) => press(e, () => (q.multi ? toggle(q.id, o.id) : record(q.id, o.id)))}
                  aria-pressed={selected}
                  className={[
                    'w-full text-left rounded-xl border p-4 transition-colors cursor-pointer',
                    awaiting
                      ? 'border-cc-warning-line ring-1 ring-cc-warning-line'
                      : selected
                        ? 'border-cc-success ring-1 ring-cc-success'
                        : 'border-cc-line hover:border-cc-field-border',
                  ].join(' ')}
                >
                  <span className="flex items-start gap-3">
                    {/* A square for "pick as many as you like", a circle for
                        "pick one". The shape is the only thing that tells a
                        reader which rules apply before they tap. */}
                    <span
                      className={[
                        'mt-0.5 shrink-0 w-5 h-5 border-2 flex items-center justify-center',
                        q.multi ? 'rounded-md' : 'rounded-full',
                        awaiting
                          ? 'border-cc-warning-line bg-cc-surface'
                          : selected
                            ? 'border-cc-success bg-cc-success'
                            : 'border-cc-field-border',
                      ].join(' ')}
                    >
                      {selected && !awaiting && (
                        <Check className="w-3 h-3 text-cc-on-dark" strokeWidth={4} aria-hidden="true" />
                      )}
                      {awaiting && <span className="w-2 h-2 rounded-full bg-cc-warning-line" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-cc-ink leading-snug">
                        {o.label}
                      </span>
                      {o.hint && (
                        <span className="block text-xs text-cc-ink-muted mt-1 leading-relaxed">
                          {o.hint}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {status[q.id] === 'unconfirmed' && (
            <p className="text-xs font-bold text-cc-warning mt-2">
              Carried over from your email tap — not recorded until you tap it here.
            </p>
          )}
          {status[q.id] === 'error' && (
            <p className="text-xs font-bold text-cc-error mt-2">
              That did not save. Please tap it again.
            </p>
          )}
        </section>
      ))}

      {/*
        Free text — the only control on this page with a button, and the reason
        the page confused its first reader.

        Every question above records on the tap. This box cannot: typing has to be
        committed deliberately, so it needs a button. But a dark primary button at
        the foot of a questionnaire is the universal shape of "submit the form",
        and it was greyed out until something was typed — so a reader who had
        answered everything saw a dead submit button and concluded, reasonably,
        that nothing had been submitted.

        Three changes, and each is doing one job. The button is a secondary style,
        not the product's dark primary, so it stops reading as the page's terminal
        action. It lives inside the box, so it visibly belongs to the box. And its
        disabled state is never silent: the line beside it always says which of
        "nothing to send", "not sent yet" or "sent" is true, because a greyed-out
        control that explains itself is not the same object as one that does not.
      */}
      <section>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-cc-line bg-cc-surface-muted px-2 py-0.5 cc-text-label text-cc-ink-muted">
            Optional
          </span>
        </div>
        <h2 className="mt-2 text-lg sm:text-xl font-bold text-cc-ink tracking-tight leading-snug">
          {SURVEY_FREETEXT_PROMPT}
        </h2>
        <p className="text-sm text-cc-ink-muted mt-1 leading-relaxed">{SURVEY_FREETEXT_LEAD}</p>

        <div className="mt-4 rounded-2xl border border-cc-line bg-cc-surface p-4">
          <label htmlFor="survey-comment" className="sr-only">
            {SURVEY_FREETEXT_PROMPT}
          </label>
          <textarea
            id="survey-comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value.slice(0, SURVEY_FREETEXT_MAX));
              setCommentStatus('idle');
            }}
            rows={4}
            maxLength={SURVEY_FREETEXT_MAX}
            placeholder="What got in the way, what you expected, what you would build instead…"
            className="w-full rounded-xl border border-cc-field-border bg-cc-surface p-3 text-sm text-cc-ink leading-relaxed focus-visible:border-cc-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-cc-focus resize-y"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* The ghost button: never the page's primary (see above). `busy`
                swallows a second press while the note is on its way. */}
            <CcButton
              variant="ghost"
              density="cozy"
              icon={<Send className="w-4 h-4" aria-hidden="true" />}
              busy={commentStatus === 'saving'}
              onClick={saveComment}
              disabled={commentStatus !== 'saving' && !commentUnsent}
            >
              Send this note
            </CcButton>

            {/* Never a silent grey button. One of these is always true. */}
            <span className="text-xs leading-relaxed">
              {commentStatus === 'error' ? (
                <span className="font-bold text-cc-error">That did not send. Try again.</span>
              ) : commentStatus === 'saving' ? (
                <span className="text-cc-ink-muted">Sending…</span>
              ) : commentUnsent ? (
                <span className="font-bold text-cc-ink-muted">
                  Not sent yet — this button sends the note, nothing else.
                </span>
              ) : sentComment ? (
                <span className="font-bold text-cc-success">Sent — thank you.</span>
              ) : (
                <span className="text-cc-ink-muted">
                  Nothing typed, so nothing to send. Your answers above are saved either way.
                </span>
              )}
            </span>

            <span className="ml-auto text-xs text-cc-ink-muted">
              {comment.length}/{SURVEY_FREETEXT_MAX}
            </span>
          </div>
        </div>
      </section>

      {/*
        What the reader actually said, read back to them.
        Without this the only record of a vote is a green border on a button
        somewhere further up the page, and "did that count?" is a fair question to
        be left with after tapping something that navigated nowhere.
      */}
      <div className="rounded-2xl border border-cc-line bg-cc-surface-muted p-5">
        <h2 className="cc-text-label text-cc-ink">
          Your answers
        </h2>
        <dl className="mt-4 space-y-3">
          {SURVEY_QUESTIONS.map((q) => {
            // The server's copy, not the screen's. An unconfirmed preselection
            // reads as what it is rather than as an answer.
            const picks = chosen(saved[q.id]);
            return (
              <div key={q.id} className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-xs text-cc-ink-muted leading-relaxed sm:w-1/2 shrink-0">
                  {q.prompt}
                </dt>
                <dd className="text-sm font-bold text-cc-ink leading-relaxed sm:w-1/2">
                  {picks.length === 0 ? (
                    status[q.id] === 'unconfirmed' ? (
                      <span className="font-medium text-cc-warning">
                        picked in the email — not recorded yet
                      </span>
                    ) : (
                      <span className="font-medium text-cc-ink-muted">not answered</span>
                    )
                  ) : (
                    picks.map((id) => getOption(q.id, id)?.label ?? id).join(' · ')
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-5 text-sm text-cc-ink-muted leading-relaxed border-t border-cc-line pt-4">
          {doneCount === totalQuestions ? (
            <>
              <span className="font-bold text-cc-ink">That is everything.</span> You can close
              this page — every answer is already saved. Open the link again any time until{' '}
              <span className="font-bold text-cc-ink">{closesOn}</span> to change one.
            </>
          ) : (
            <>
              Leave any of them unanswered if you would rather. Each tap saves as you make it,
              and you can come back until{' '}
              <span className="font-bold text-cc-ink">{closesOn}</span>.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

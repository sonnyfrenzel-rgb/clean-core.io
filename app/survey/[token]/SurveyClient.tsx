'use client';

import { useState } from 'react';
import { Check, Loader2, AlertCircle, Send } from 'lucide-react';
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

  /** A press on this page. An event handler, so setting state here is the normal path. */
  async function record(questionId: string, value: SurveyAnswer) {
    setStatus((s) => ({ ...s, [questionId]: 'saving' }));
    setAnswers((a) => ({ ...a, [questionId]: value }));
    const ok = await post(questionId, value);
    if (ok) setSaved((s) => ({ ...s, [questionId]: value }));
    setStatus((s) => ({ ...s, [questionId]: ok ? 'saved' : 'error' }));
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

  async function saveComment() {
    setCommentStatus('saving');
    try {
      const res = await fetch('/api/survey/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, comment }),
      });
      if (res.ok) setSentComment(comment);
      setCommentStatus(res.ok ? 'saved' : 'error');
    } catch {
      setCommentStatus('error');
    }
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
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-black text-gray-950">
            {doneCount} of {totalQuestions} answered
          </p>
          {proposed && status[proposed.question] === 'unconfirmed' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <AlertCircle className="w-3.5 h-3.5" /> not recorded yet
            </span>
          )}
          {proposed && status[proposed.question] === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> saving
            </span>
          )}
          {proposed && status[proposed.question] === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
              <Check className="w-3.5 h-3.5" strokeWidth={3} /> saved
            </span>
          )}
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <span
              key={i}
              className={[
                'h-1.5 flex-1 rounded-full',
                i < doneCount ? 'bg-green-600' : 'bg-gray-200',
              ].join(' ')}
            />
          ))}
        </div>
        {proposed && proposedLabel && status[proposed.question] === 'unconfirmed' && (
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            You picked{' '}
            <span className="font-bold text-gray-950">&ldquo;{proposedLabel}&rdquo;</span> in the
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
          <h2 className="text-lg sm:text-xl font-black text-gray-950 tracking-tight leading-snug">
            {q.prompt}
          </h2>
          {q.lead && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{q.lead}</p>}

          <div className="mt-4 space-y-2">
            {q.options.map((o) => {
              const selected = chosen(answers[q.id]).includes(o.id);
              // Selected but not yet on the server. Amber rather than green,
              // because green here has meant "recorded" everywhere else on this
              // page and a preselection has not been recorded by anyone.
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
                      ? 'border-amber-500 bg-amber-50'
                      : selected
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
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
                          ? 'border-amber-500 bg-white'
                          : selected
                            ? 'border-green-600 bg-green-600'
                            : 'border-gray-300',
                      ].join(' ')}
                    >
                      {selected && !awaiting && (
                        <Check className="w-3 h-3 text-white" strokeWidth={4} />
                      )}
                      {awaiting && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-950 leading-snug">
                        {o.label}
                      </span>
                      {o.hint && (
                        <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
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
            <p className="text-xs font-bold text-amber-700 mt-2">
              Carried over from your email tap — not recorded until you tap it here.
            </p>
          )}
          {status[q.id] === 'error' && (
            <p className="text-xs font-bold text-red-600 mt-2">
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
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-gray-500">
            Optional
          </span>
        </div>
        <h2 className="mt-2 text-lg sm:text-xl font-black text-gray-950 tracking-tight leading-snug">
          {SURVEY_FREETEXT_PROMPT}
        </h2>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{SURVEY_FREETEXT_LEAD}</p>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
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
            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-950 leading-relaxed outline-none focus:border-green-600 resize-y"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={saveComment}
              disabled={commentStatus === 'saving' || !commentUnsent}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-950 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-white disabled:text-gray-400 cursor-pointer"
            >
              {commentStatus === 'saving' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send this note
            </button>

            {/* Never a silent grey button. One of these is always true. */}
            <span className="text-xs leading-relaxed">
              {commentStatus === 'error' ? (
                <span className="font-bold text-red-600">That did not send. Try again.</span>
              ) : commentStatus === 'saving' ? (
                <span className="text-gray-500">Sending…</span>
              ) : commentUnsent ? (
                <span className="font-bold text-gray-600">
                  Not sent yet — this button sends the note, nothing else.
                </span>
              ) : sentComment ? (
                <span className="font-bold text-green-700">Sent — thank you.</span>
              ) : (
                <span className="text-gray-500">
                  Nothing typed, so nothing to send. Your answers above are saved either way.
                </span>
              )}
            </span>

            <span className="ml-auto text-xs text-gray-400">
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
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <h2 className="text-sm font-black text-gray-950 uppercase tracking-wider">
          Your answers
        </h2>
        <dl className="mt-4 space-y-3">
          {SURVEY_QUESTIONS.map((q) => {
            // The server's copy, not the screen's. An unconfirmed preselection
            // reads as what it is rather than as an answer.
            const picks = chosen(saved[q.id]);
            return (
              <div key={q.id} className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-xs text-gray-500 leading-relaxed sm:w-1/2 shrink-0">
                  {q.prompt}
                </dt>
                <dd className="text-sm font-bold text-gray-950 leading-relaxed sm:w-1/2">
                  {picks.length === 0 ? (
                    status[q.id] === 'unconfirmed' ? (
                      <span className="font-medium text-amber-700">
                        picked in the email — not recorded yet
                      </span>
                    ) : (
                      <span className="font-medium text-gray-400">not answered</span>
                    )
                  ) : (
                    picks.map((id) => getOption(q.id, id)?.label ?? id).join(' · ')
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-5 text-sm text-gray-600 leading-relaxed border-t border-gray-200 pt-4">
          {doneCount === totalQuestions ? (
            <>
              <span className="font-bold text-gray-950">That is everything.</span> You can close
              this page — every answer is already saved. Open the link again any time until{' '}
              <span className="font-bold text-gray-950">{closesOn}</span> to change one.
            </>
          ) : (
            <>
              Leave any of them unanswered if you would rather. Each tap saves as you make it,
              and you can come back until{' '}
              <span className="font-bold text-gray-950">{closesOn}</span>.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

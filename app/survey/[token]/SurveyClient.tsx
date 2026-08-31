'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, AlertCircle, Send } from 'lucide-react';
import {
  PAGE_QUESTIONS,
  SURVEY_QUESTIONS,
  SURVEY_FREETEXT_PROMPT,
  SURVEY_FREETEXT_MAX,
  getOption,
} from '@/lib/survey/definition';
import { chosen, type SurveyAnswer } from '@/lib/survey/store';

/**
 * The survey, after the tap.
 *
 * The answer chosen in the email arrives as `initialQuestion`/`initialOption` and
 * is submitted from here, on mount, with `fetch`. That is the whole reason the
 * recording endpoint is a POST: a corporate mail gateway pre-fetches every link in
 * a message, and a GET that wrote a vote would have produced a survey of security
 * appliances. A gateway does not run scripts, so it never gets past the page.
 *
 * From the reader's side it is still one tap — the request goes out while the page
 * is still painting, and the confirmation is already there when they look.
 *
 * Every following question works the same way: tap, recorded, no submit button and
 * no page change. The free-text box is the one exception, because typing has to be
 * committed deliberately.
 */

type Status = 'idle' | 'saving' | 'saved' | 'error';

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
  // The answer tapped in the email is known before the first paint, so it is
  // seeded into state rather than set from an effect. That is not a workaround
  // for the lint rule — it is what the rule is pointing at: the selection is
  // already true when the page renders, and setting it afterwards would show the
  // reader an unselected option for one frame and then move it.
  const tapped =
    initialQuestion && initialOption && getOption(initialQuestion, initialOption)
      ? { question: initialQuestion, option: initialOption }
      : null;

  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>(
    tapped ? { ...existingAnswers, [tapped.question]: tapped.option } : existingAnswers,
  );
  const [status, setStatus] = useState<Record<string, Status>>(
    tapped ? { [tapped.question]: 'saving' } : {},
  );
  const [comment, setComment] = useState(existingComment);
  const [commentStatus, setCommentStatus] = useState<Status>(existingComment ? 'saved' : 'idle');
  const submittedInitial = useRef(false);

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

  /** A tap on this page. An event handler, so setting state here is the normal path. */
  async function record(questionId: string, value: SurveyAnswer) {
    setStatus((s) => ({ ...s, [questionId]: 'saving' }));
    setAnswers((a) => ({ ...a, [questionId]: value }));
    const ok = await post(questionId, value);
    setStatus((s) => ({ ...s, [questionId]: ok ? 'saved' : 'error' }));
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

  // Only the network call is left in the effect, and the state it sets is set
  // after an await. The ref guard is for StrictMode, which runs effects twice in
  // development and this one writes to the database.
  useEffect(() => {
    if (submittedInitial.current || !tapped) return;
    submittedInitial.current = true;
    post(tapped.question, tapped.option).then((ok) => {
      setStatus((s) => ({ ...s, [tapped.question]: ok ? 'saved' : 'error' }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, initialOption]);

  async function saveComment() {
    setCommentStatus('saving');
    try {
      const res = await fetch('/api/survey/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, comment }),
      });
      setCommentStatus(res.ok ? 'saved' : 'error');
    } catch {
      setCommentStatus('error');
    }
  }

  const answeredCount = PAGE_QUESTIONS.filter((q) => chosen(answers[q.id]).length > 0).length;
  const initialLabel =
    initialQuestion && initialOption ? getOption(initialQuestion, initialOption)?.label : null;

  const totalQuestions = PAGE_QUESTIONS.length + (tapped ? 1 : 0);
  const doneCount = answeredCount + (tapped ? 1 : 0);

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
          {tapped && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
              {status[initialQuestion!] === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : status[initialQuestion!] === 'error' ? (
                <span className="inline-flex items-center gap-1.5 text-red-600">
                  <AlertCircle className="w-3.5 h-3.5" /> not saved
                </span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} /> saved
                </>
              )}
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
        {tapped && initialLabel && (
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            You answered <span className="font-bold text-gray-950">&ldquo;{initialLabel}&rdquo;</span>{' '}
            in the email. Everything below is still open.
          </p>
        )}
      </div>

      {PAGE_QUESTIONS.map((q) => (
        <section key={q.id}>
          <h2 className="text-lg sm:text-xl font-black text-gray-950 tracking-tight leading-snug">
            {q.prompt}
          </h2>
          {q.lead && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{q.lead}</p>}

          <div className="mt-4 space-y-2">
            {q.options.map((o) => {
              const selected = chosen(answers[q.id]).includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => (q.multi ? toggle(q.id, o.id) : record(q.id, o.id))}
                  aria-pressed={selected}
                  className={[
                    'w-full text-left rounded-xl border p-4 transition-colors cursor-pointer',
                    selected
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
                        selected ? 'border-green-600 bg-green-600' : 'border-gray-300',
                      ].join(' ')}
                    >
                      {selected && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
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

          {status[q.id] === 'error' && (
            <p className="text-xs font-bold text-red-600 mt-2">
              That did not save. Please tap it again.
            </p>
          )}
        </section>
      ))}

      {/* Free text */}
      <section>
        <h2 className="text-lg sm:text-xl font-black text-gray-950 tracking-tight leading-snug">
          {SURVEY_FREETEXT_PROMPT}
        </h2>
        <textarea
          value={comment}
          onChange={(e) => {
            setComment(e.target.value.slice(0, SURVEY_FREETEXT_MAX));
            setCommentStatus('idle');
          }}
          rows={4}
          maxLength={SURVEY_FREETEXT_MAX}
          placeholder="What got in the way, what you expected, what you would build instead…"
          className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-950 leading-relaxed outline-none focus:border-green-600 resize-y"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveComment}
            disabled={commentStatus === 'saving' || comment.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 cursor-pointer"
          >
            {commentStatus === 'saving' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send it
          </button>
          {commentStatus === 'saved' && (
            <span className="text-xs font-bold text-green-700">Saved — thank you.</span>
          )}
          {commentStatus === 'error' && (
            <span className="text-xs font-bold text-red-600">That did not save. Try again.</span>
          )}
          <span className="text-xs text-gray-400">
            {comment.length}/{SURVEY_FREETEXT_MAX}
          </span>
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
            const picks = chosen(answers[q.id]);
            return (
              <div key={q.id} className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-xs text-gray-500 leading-relaxed sm:w-1/2 shrink-0">
                  {q.prompt}
                </dt>
                <dd className="text-sm font-bold text-gray-950 leading-relaxed sm:w-1/2">
                  {picks.length === 0 ? (
                    <span className="font-medium text-gray-400">not answered</span>
                  ) : (
                    picks.map((id) => getOption(q.id, id)?.label ?? id).join(' · ')
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-5 text-sm text-gray-600 leading-relaxed border-t border-gray-200 pt-4">
          {answeredCount === PAGE_QUESTIONS.length ? (
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

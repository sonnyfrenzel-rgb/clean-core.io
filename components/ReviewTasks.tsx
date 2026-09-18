'use client';

import { ListChecks } from 'lucide-react';
import type { ReviewTask, ReviewTaskKind, ReviewTasks as ReviewTaskResult } from '@/lib/abap/review-tasks';

/**
 * Check tasks instead of knowledge nobody established — roadmap 7.5, the screen
 * half.
 *
 * **The rule this panel is built around: a task is a question, not a verdict.**
 * Every row here stands where the product would otherwise have filled an absence
 * with its most flattering reading — forty days without an execution as "nobody
 * uses this", an include nobody read as "nothing in there", a call whose target
 * the program works out at run time as "nothing is called". So each row says
 * four things and no fifth: what is not established, where it stands, the one
 * step that would settle it, and the sentence this product does not write while
 * the step is open.
 *
 * Three things follow, and `tests/review-tasks-guard.spec.ts` holds all three:
 *
 *   1. **No status, anywhere.** No tick, no percentage, no colour that reads as
 *      good or bad. A task that has not been carried out is not a failure, and a
 *      panel that painted it red would be making the judgement the module
 *      refuses to make.
 *   2. **Every row carries its anchor.** A line, an include name, the expression
 *      that will hold a target, or the import a window belongs to. A task nobody
 *      can follow to its evidence is an opinion.
 *   3. **The empty state is not a clean bill.** Zero tasks is a statement about
 *      these three checks, and it says so in those words —
 *      `lib/abap/coverage.ts` exists because "no findings" and "nothing to find"
 *      are different sentences and only one of them was true.
 *
 * **No model, by construction.** Everything rendered here comes out of
 * `lib/abap/review-tasks.ts`, which is deterministic and imports nothing that
 * reaches a network. This file derives nothing itself: it takes the result, so
 * that the engine behind it never has to be shipped to a browser.
 */

export const REVIEW_TASKS_LEAD =
  'A check task is a question, not a result. Each one names what this reading could not establish, the ' +
  'line or the import it stands on, the one step that would settle it, and the sentence Clean-Core.io ' +
  'does not write while it is open. Nothing here was asked of a model.';

export const REVIEW_TASKS_NONE_TITLE = 'Nothing open in these three checks';

export const REVIEW_TASKS_METHOD =
  'These three checks are the ones this product can make on its own: an include it was not given, a call ' +
  'whose target the program works out while it runs, and a usage window shorter than the thirteen months ' +
  'that hold a year-end run. They are not a list of everything worth checking in your code.';

/** The answer sentence above the list — ADR-029: the answer first, then the count. */
export function reviewTasksTitle(count: number): string {
  if (count === 0) return REVIEW_TASKS_NONE_TITLE;
  if (count === 1) return '1 thing is not established here, and it names the step that would settle it';
  return `${count} things are not established here, and each names the step that would settle it`;
}

/**
 * The empty state, in the words it has to be said in.
 *
 * Three absences and three sentences, for the reason
 * `components/workspace/NotDeterminedCard.tsx` keeps three apart: no source
 * staged is not the same statement as a source with nothing open in it, and
 * printing the second for the first reports the result of a reading that never
 * happened.
 */
export function reviewTasksNoneLine(noSource: boolean, usageConsulted: boolean): string {
  if (noSource) {
    return (
      'No source has been staged, so none of these three checks has been made. The usage import that was ' +
      'made declares a window of at least thirteen months, which is the only one of the three a usage ' +
      'import on its own can answer.'
    );
  }
  return (
    'This reading was given every include it names, no call takes its target from a value worked out while ' +
    'the program runs, and ' +
    (usageConsulted
      ? 'the usage import declares a window of at least thirteen months. '
      : 'no usage was imported, so nothing here rests on one. ') +
    'That is what these three checks looked at; it is not a statement about the rest of the program.'
  );
}

const KIND_LABEL: Record<ReviewTaskKind, string> = {
  'usage-window': 'Usage window',
  'include-not-read': 'Include not read',
  'dynamic-call': 'Target worked out at run time',
};

export default function ReviewTasks({ result }: { result: ReviewTaskResult }) {
  // Nothing has been staged and nothing has been imported: there is no question
  // yet, so there is nothing to answer. The one case where silence is honest.
  if (result.noSource && !result.usageConsulted) return null;

  const count = result.counts.total;

  return (
    <section
      data-review-tasks=""
      aria-labelledby="review-tasks-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <ListChecks className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-5">
          <div className="space-y-2">
            <h3
              id="review-tasks-title"
              data-review-tasks-title
              className="text-base font-bold text-slate-900 tracking-tight"
            >
              {reviewTasksTitle(count)}
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {count === 0
                ? reviewTasksNoneLine(result.noSource, result.usageConsulted)
                : REVIEW_TASKS_LEAD}
            </p>
          </div>

          {count > 0 && (
            <ul className="space-y-4 m-0 list-none p-0">
              {result.tasks.map((task) => (
                <ReviewTaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}

          <p className="text-xs text-slate-500 leading-relaxed">{REVIEW_TASKS_METHOD}</p>
        </div>
      </div>
    </section>
  );
}

function ReviewTaskRow({ task }: { task: ReviewTask }) {
  return (
    <li
      data-review-task={task.kind}
      data-review-task-id={task.id}
      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
          {KIND_LABEL[task.kind]}
        </span>
        {task.anchors.map((anchor) => (
          // Inline, not a flex row: a flex container blockifies its children,
          // and the anchors would reach a reader — and `innerText` — as one line
          // each.
          <code
            key={`${anchor.kind}-${anchor.label}`}
            data-review-task-anchor={anchor.kind}
            className="font-mono text-[11px] font-bold text-slate-900"
          >
            {anchor.label}
          </code>
        ))}
      </div>

      <p data-review-task-detail className="mt-3 text-xs text-slate-600 leading-relaxed">
        {task.notDetermined.detail}
      </p>

      <p data-review-task-step className="mt-2 text-xs font-semibold text-slate-700 leading-relaxed">
        Next step: {task.task}
      </p>

      <p data-review-task-withheld className="mt-2 text-xs text-slate-500 leading-relaxed">
        Not said while this is open: {task.withheld.charAt(0).toLowerCase()}
        {task.withheld.slice(1)}
      </p>
    </li>
  );
}

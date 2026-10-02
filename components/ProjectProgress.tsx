import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROGRESS_TONE_CLASS, type ProjectProgress as Progress } from '@/lib/project-progress';

/**
 * One project's status as a reader takes it in — `lib/project-progress.ts`.
 * Used by both "My workspace" lists.
 *
 * Two lines: a dot and one plain sentence (where it stands), then the step it
 * is at and the one next action (what to do). No step bar and no legend (owner
 * feedback 02.10.2026): the seven steps one by one are one level deeper, on the
 * project itself. The dot is never the only cue — the sentence says it.
 *
 * `nextAction` replaces the "Next:" link when the row offers the action itself
 * (the list report's "Run analysis" button), so one action is never offered
 * twice in one cell.
 */
export default function ProjectProgressCell({
  progress,
  projectHref,
  id,
  nextAction,
}: {
  progress: Progress;
  /** `/project/{id}` — the stage path of the next step is appended. */
  projectHref: string;
  id: string;
  nextAction?: React.ReactNode;
}) {
  return (
    <span
      className="flex w-full min-w-0 flex-col gap-1"
      data-project-progress={id}
      data-project-stage={progress.stage}
      data-project-tone={progress.tone}
    >
      <span className="flex items-start gap-2">
        <span
          aria-hidden={true}
          data-project-dot=""
          className={cn('mt-1 inline-block h-3 w-3 shrink-0 rounded-full', PROGRESS_TONE_CLASS[progress.tone])}
        />
        <span className="text-[13px] leading-snug font-semibold text-cc-ink" data-project-sentence="">
          {progress.sentence}
        </span>
      </span>
      {progress.stepLabel ? (
        <span className="pl-5 text-[12px] font-medium text-cc-ink-muted tabular-nums" data-project-step="">
          {progress.stepLabel}
        </span>
      ) : null}
      {!nextAction && progress.next ? (
        <span className="pl-5">
          <Link
            href={`${projectHref}/${progress.next.path}`}
            data-project-next=""
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-cc-ink underline underline-offset-2"
          >
            {`Next: ${progress.next.label}`}
            <ArrowRight size={12} aria-hidden={true} />
          </Link>
        </span>
      ) : null}
      {nextAction ? <span className="pl-5">{nextAction}</span> : null}
    </span>
  );
}

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SEGMENT_CLASS,
  SEGMENT_LABEL,
  SEGMENT_ORDER,
  type ProjectProgress as Progress,
} from '@/lib/project-progress';

/**
 * One project's progress as a reader can take it in — the plain sentence, the
 * seven steps as a bar that agrees with its count, and the next action as a
 * link (`lib/project-progress.ts`). Used by both "My workspace" lists.
 *
 * Colour is never the only cue (§1.1): every segment names its step and its
 * state for a screen reader and in its tooltip, the stale one is also drawn
 * dashed, and the legend says what each look means.
 */

export function ProgressBar({ progress, id }: { progress: Progress; id: string }) {
  return (
    <ol className="m-0 flex w-full list-none gap-1 p-0" aria-label={progress.countLabel} data-progress-bar={id}>
      {progress.segments.map((segment) => (
        <li
          key={segment.key}
          title={`${segment.label} — ${SEGMENT_LABEL[segment.state]} (${segment.badge}): ${segment.detail}`}
          data-phase={segment.key}
          data-phase-state={segment.phaseState}
          data-segment-state={segment.state}
          className={cn('h-2 flex-1 rounded-full', SEGMENT_CLASS[segment.state])}
        >
          <span className="sr-only">{`${segment.label}: ${SEGMENT_LABEL[segment.state]} — ${segment.badge}`}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ProjectProgressCell({
  progress,
  projectHref,
  id,
}: {
  progress: Progress;
  /** `/project/{id}` — the stage path of the next step is appended. */
  projectHref: string;
  id: string;
}) {
  return (
    <span className="flex w-full min-w-0 flex-col gap-1" data-project-progress={id} data-project-stage={progress.stage}>
      <span className="text-[13px] leading-snug font-semibold text-cc-ink" data-project-sentence="">
        {progress.sentence}
      </span>
      <ProgressBar progress={progress} id={id} />
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[12px] font-medium text-cc-ink-muted tabular-nums" data-project-count="">
          {progress.countLabel}
        </span>
        {progress.next ? (
          <Link
            href={`${projectHref}/${progress.next.path}`}
            data-project-next=""
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-cc-ink underline underline-offset-2"
          >
            {`Next: ${progress.next.label}`}
            <ArrowRight size={12} aria-hidden={true} />
          </Link>
        ) : null}
      </span>
    </span>
  );
}

/** One line above the list: what each look of a segment means. */
export function ProgressLegend() {
  return (
    <p
      className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-cc-ink-muted"
      data-progress-legend=""
    >
      <span className="font-semibold text-cc-ink">Steps</span>
      {SEGMENT_ORDER.map((state) => (
        <span key={state} className="inline-flex items-center gap-1">
          <span aria-hidden={true} className={cn('inline-block h-2 w-4 rounded-full', SEGMENT_CLASS[state])} />
          {SEGMENT_LABEL[state]}
        </span>
      ))}
    </p>
  );
}

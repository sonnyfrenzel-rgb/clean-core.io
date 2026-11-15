'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROGRESS_TONE_CLASS } from '@/lib/project-progress';
import { REDESIGN_TOTAL, type HomeNext, type HomeStatus } from '@/lib/home-status';
import { homeNextIn, wt } from '@/lib/workspace-messages';

/**
 * The Status and Next step cells of a row on the home page (AB-14b, mockup `statusBlock`, `nextCell`).
 *
 * Status: the dot with its three looks (never green), the status word, and the line under it — plain, a warning with
 * a clock, or an error with a cross; colour is never the only cue, the words carry it. On a started or finished
 * re-design the small six-segment bar (H-O4, the owner's question: two looks, no legend, only on re-design) stands
 * before the line "2 of 6 steps done", which says the same in words.
 *
 * Next step: one link that says what it does and the tool it opens below it, or "Nothing open". An analysis run is
 * never started from here directly: the caller gives `onRun`, which opens the confirmation dialog with cost and model.
 */
export function HomeStatusBlock({ status }: { status: HomeStatus }) {
  return (
    <span className="flex min-w-0 items-start gap-2" data-home-status={status.kind}>
      <span aria-hidden={true} className={cn('mt-1 inline-block h-3 w-3 shrink-0 rounded-full', PROGRESS_TONE_CLASS[status.tone])} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] leading-snug font-semibold text-cc-ink" data-home-status-title="">
          {status.title}
        </span>
        <span
          data-home-status-detail={status.detailTone}
          className={cn(
            'inline-flex flex-wrap items-center gap-2 text-[12px] leading-snug font-medium',
            status.detailTone === 'err' ? 'text-cc-error' : status.detailTone === 'warn' ? 'text-cc-ink' : 'text-cc-ink-muted',
          )}
        >
          {status.stepsDone !== null ? <RedesignBar done={status.stepsDone} /> : null}
          {status.detailTone === 'warn' ? <Clock size={13} aria-hidden={true} className="shrink-0 text-cc-warning-mark" /> : null}
          {status.detailTone === 'err' ? <XCircle size={13} aria-hidden={true} className="shrink-0" /> : null}
          <span>{status.detail}</span>
        </span>
      </span>
    </span>
  );
}

/** Six segments, two looks: done (ink) and not done (line). Decorative — the sentence beside it says the count. */
function RedesignBar({ done }: { done: number }) {
  return (
    <span aria-hidden={true} data-home-redesign-bar={done} title={wt('homeList.redesignBar')} className="inline-flex items-center gap-px">
      {Array.from({ length: REDESIGN_TOTAL }, (_, i) => (
        <i key={i} className={cn('inline-block h-1.5 w-3 rounded-full', i < done ? 'bg-cc-ink' : 'bg-cc-line')} />
      ))}
    </span>
  );
}

const NEXT_LINK = 'inline-flex items-center gap-1 text-left text-[13px] leading-snug font-semibold text-cc-ink underline underline-offset-2';

export function HomeNextCell({
  projectId,
  next,
  onRun,
  compact = false,
}: {
  projectId: string;
  next: HomeNext | null;
  /** Given when the next step is a run this account may start: opens the confirmation dialog. */
  onRun?: () => void;
  /** On a phone card the tool line is left out (the card is narrow; the link says what it does). */
  compact?: boolean;
}) {
  if (!next) {
    return <span className="text-[12px] font-medium text-cc-ink-muted" data-home-next="none">{wt('homeList.nothingOpen')}</span>;
  }
  const label = (
    <>
      <span>{next.label}</span>
      <ArrowRight size={14} aria-hidden={true} className="shrink-0" />
    </>
  );
  return (
    <span className="flex min-w-0 flex-col items-start gap-1" data-home-next={next.path}>
      {next.run && onRun ? (
        <button type="button" className={NEXT_LINK} onClick={onRun} data-home-run={projectId}>
          {label}
        </button>
      ) : (
        <Link href={`/project/${encodeURIComponent(projectId)}/${next.path}`} className={NEXT_LINK} data-home-next-link={projectId}>
          {label}
        </Link>
      )}
      {compact ? null : <span className="text-[12px] font-medium text-cc-ink-muted">{homeNextIn(next.tool)}</span>}
    </span>
  );
}

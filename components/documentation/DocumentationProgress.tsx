'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Minus, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import { formatElapsed } from '@/lib/generation-progress';
import { DOC_STAGE_ORDER, type DocPartView, type DocProgressEnd, type DocStageKey, type DocStageView } from '@/lib/documentation-progress';
import { docPartLabel, wt } from '@/lib/workspace-messages';

/**
 * What the Documentation tool is doing — roadmap 3.0.13 (owner, dev
 * acceptance 14.10.2026), the counterpart of Transformation's generation
 * screen (`components/transformation/GenerationChain.tsx`): from the first
 * paint the card says what runs, with the stages in their order, the elapsed
 * time of the running one, the expected time before a model call, and a clear
 * end — written, up to date, stopped with its reason and *Try again*, or
 * nothing more to write and why.
 *
 * Rendering only: the stages come from `documentationProgress`
 * (`lib/documentation-progress.ts`), the times from `useDocStageClock` below.
 * Once everything is written the steps fold away behind one line, so the
 * description stays the first thing a reader reads.
 */

export type DocStageTimes = Partial<Record<DocStageKey, { startedAt: number | null; endedAt: number | null }>>;

/**
 * The stage times after a change of states, stamped at `at`. A stage that
 * becomes active again after it ended — *Try again* after a stop, or a second
 * run — starts a new attempt: its time is not the stopped attempt's plus the
 * pause.
 */
export function nextDocStageTimes(prev: DocStageTimes, stages: readonly DocStageView[], at: number): DocStageTimes {
  const next: DocStageTimes = { ...prev };
  for (const stage of stages) {
    const t = next[stage.key];
    if (stage.state === 'active') {
      if (!t || t.endedAt !== null) next[stage.key] = { startedAt: at, endedAt: null };
    } else if (t && t.endedAt === null && t.startedAt !== null) {
      next[stage.key] = { ...t, endedAt: at };
    }
  }
  return next;
}

/**
 * Stamps when each stage became active and when it stopped being active — from the states, never a timer of its own.
 * Stamped with the clock at the change itself: the page's `now` ticks only while a run is on, so between two runs
 * it still holds the time the last one ended.
 */
export function useDocStageClock(stages: DocStageView[]): DocStageTimes {
  const [times, setTimes] = useState<DocStageTimes>({});
  const signature = stages.map((s) => `${s.key}:${s.state}`).join('|');
  const last = useRef('');
  useEffect(() => {
    // Runs after every render; only a change of the states stamps anything.
    if (last.current === signature) return;
    last.current = signature;
    const at = Date.now();
    setTimes((prev) => nextDocStageTimes(prev, stages, at));
  }, [signature, stages]);
  return times;
}

const DOT: Record<DocStageView['state'], string> = {
  pending: 'border-cc-neutral-border bg-cc-surface text-cc-ink-muted',
  active: 'border-cc-ink bg-cc-ink text-cc-on-dark',
  done: 'border-cc-ink bg-cc-surface text-cc-ink',
  failed: 'border-cc-error bg-cc-error-bg text-cc-error',
  skipped: 'border-cc-neutral-border bg-cc-surface-muted text-cc-ink-muted',
};

function DotIcon({ state }: { state: DocStageView['state'] }) {
  if (state === 'done') return <Check size={14} aria-hidden={true} />;
  if (state === 'failed') return <X size={14} aria-hidden={true} />;
  if (state === 'skipped') return <Minus size={14} aria-hidden={true} />;
  return <MoreHorizontal size={14} aria-hidden={true} />;
}

function stageWord(stage: DocStageView, t: DocStageTimes[DocStageKey], now: number): string {
  if (stage.state === 'active') return t?.startedAt != null ? formatElapsed(now - t.startedAt) : '0:00';
  if (stage.state === 'done') return t?.startedAt != null && t.endedAt != null ? `${wt('doc.stage.done')} · ${formatElapsed(t.endedAt - t.startedAt)}` : wt('doc.stage.done');
  if (stage.state === 'failed') return wt('doc.stage.stopped');
  if (stage.state === 'skipped') return wt('doc.stage.notNeeded');
  return wt('doc.stage.waiting');
}

const PART_WORD: Record<DocPartView['state'], string> = {
  waiting: 'waiting',
  writing: 'writing',
  written: 'written',
  failed: 'stopped',
};

function Parts({ parts, now }: { parts: DocPartView[]; now: number }) {
  return (
    <ol data-doc-parts="" className="m-0 mt-2 grid list-none gap-1 border-t border-cc-line p-0 pt-2">
      {parts.map((p) => (
        <li key={p.index} data-doc-part={p.index + 1} data-part-state={p.state} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px]">
          <span className="font-semibold text-cc-ink">{docPartLabel(p.index, parts.length, p.steps)}</span>
          <span className={cn('font-cc-mono text-[12px] font-semibold sm:ml-auto', p.state === 'failed' ? 'text-cc-error' : 'text-cc-ink-muted')}>
            {PART_WORD[p.state]}
            {p.startedAt !== null ? ` · ${formatElapsed((p.endedAt ?? now) - p.startedAt)}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StageList({ stages, times, now, parts }: { stages: DocStageView[]; times: DocStageTimes; now: number; parts: DocPartView[] | null }) {
  return (
    <ol data-doc-stages="" className="m-0 mt-3 list-none p-0">
      {stages.map((stage, i) => (
        <li key={stage.key} data-doc-stage={stage.key} data-stage-state={stage.state} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
          {i < stages.length - 1 ? <span aria-hidden={true} className="absolute top-7 bottom-0 left-[13px] w-0.5 bg-cc-neutral-border" /> : null}
          <span aria-hidden={true} className={cn('relative z-[1] grid h-7 w-7 place-items-center rounded-full border-2 motion-safe:transition-colors motion-safe:duration-200', DOT[stage.state])}>
            <DotIcon state={stage.state} />
          </span>
          <div
            className={cn(
              'min-w-0 rounded-cc-row border bg-cc-surface px-3 py-2',
              stage.state === 'active' ? 'border-cc-ink' : stage.state === 'failed' ? 'border-cc-error-border' : 'border-cc-line',
            )}
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[14px] font-bold text-cc-ink">{stage.label}</span>
              <span className="text-[12px] font-semibold text-cc-ink-muted">{stage.note}</span>
              <span data-doc-stage-time="" className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted tabular-nums max-sm:w-full sm:ml-auto">
                {stageWord(stage, times[stage.key], now)}
              </span>
            </div>
            {stage.detail ? (
              <p data-doc-stage-detail="" className={cn('m-0 mt-1 text-[13px] font-medium [overflow-wrap:anywhere]', stage.state === 'failed' ? 'text-cc-error' : 'text-cc-ink-muted')}>
                {stage.detail}
              </p>
            ) : null}
            {stage.facts.length > 0 ? (
              <ul className="m-0 mt-1 grid list-none gap-1 p-0 text-[13px]">
                {stage.facts.map((f) => (
                  <li key={f} data-doc-stage-fact="" className="flex min-w-0 flex-wrap items-baseline gap-2">
                    <span className="min-w-0 flex-[1_1_220px] font-medium text-cc-ink">{f}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {stage.key === 'business' && parts && parts.length > 1 ? <Parts parts={parts} now={now} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DocumentationProgress({
  stages,
  end,
  times,
  parts = null,
  openedAt,
  endedAt = null,
  now,
  onRetry,
  retrying = false,
}: {
  stages: DocStageView[];
  end: DocProgressEnd;
  times: DocStageTimes;
  parts?: DocPartView[] | null;
  /** When the tool opened — the total elapsed time counts from here. */
  openedAt: number;
  /** When the card reached its end, so the total stops. */
  endedAt?: number | null;
  now: number;
  /** *Try again* on a stop; absent where nothing on this page can try again. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const runningStage = stages.find((s) => s.state === 'active') ?? null;
  const total = formatElapsed((end.kind === 'running' ? now : endedAt ?? now) - openedAt);
  const settled = end.kind === 'written' || end.kind === 'up-to-date';
  const list = <StageList stages={stages} times={times} now={now} parts={parts} />;
  // Finished: one quiet line, not a card that keeps asking for attention (owner, 16.10.2026: "sollte
  // verschwinden wenn fertig oder anders aussehen"). The steps stay one click away.
  if (settled) {
    return (
      <section
        aria-label={wt('doc.progressTitle')}
        data-doc-progress=""
        data-doc-progress-end={end.kind}
        className="cc-no-print mb-4 text-[13px] text-cc-ink-muted"
      >
        <details data-doc-progress-fold="">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
            <Check size={14} aria-hidden={true} className="shrink-0 text-cc-success" />
            <span data-doc-progress-end-text="" className="min-w-0 [overflow-wrap:anywhere]">{end.text}</span>
            <span aria-label="Elapsed" data-doc-progress-elapsed="" className="font-cc-mono tabular-nums">{total}</span>
            <span className="font-semibold underline-offset-2 hover:underline">{wt('doc.progressShowSteps')}</span>
          </summary>
          {list}
        </details>
        <span aria-live="polite" data-doc-progress-live="" className="sr-only">{end.text}</span>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="doc-progress-title"
      aria-busy={end.kind === 'running' ? true : undefined}
      data-doc-progress=""
      data-doc-progress-end={end.kind}
      className="cc-no-print mb-6 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="doc-progress-title" className="m-0 min-w-0 cc-text-h2 text-cc-ink">
          {wt('doc.progressTitle')}
        </h2>
        <span aria-label="Elapsed" data-doc-progress-elapsed="" className="font-cc-mono text-[13px] font-semibold text-cc-ink-muted tabular-nums">
          {total}
        </span>
      </div>
      {end.kind !== 'running' ? (
        <div
          data-doc-progress-end-text=""
          className={cn(
            'mt-3 flex flex-wrap items-center gap-3 rounded-cc-row border px-3 py-2 text-[13px] font-medium',
            end.kind === 'failed' ? 'border-cc-error-border bg-cc-error-bg text-cc-ink' : 'border-cc-line bg-cc-surface-muted text-cc-ink',
          )}
        >
          <span className="min-w-0 flex-[1_1_240px] [overflow-wrap:anywhere]">{end.text}</span>
          {end.kind === 'failed' && onRetry ? (
            <CcButton density="cozy" onClick={onRetry} busy={retrying} icon={<RefreshCw size={16} aria-hidden={true} />} data-doc-progress-retry="">
              Try again
            </CcButton>
          ) : null}
        </div>
      ) : null}
      {settled ? (
        <details data-doc-progress-fold="" className="mt-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-cc-ink-muted">{wt('doc.progressShowSteps')}</summary>
          {list}
        </details>
      ) : (
        list
      )}
      <span aria-live="polite" data-doc-progress-live="" className="sr-only">
        {end.kind === 'running' ? (runningStage ? runningStage.label : '') : end.text}
      </span>
    </section>
  );
}

/** The stage keys in their order, for the specs. */
export const DOCUMENTATION_PROGRESS_ORDER: readonly DocStageKey[] = DOC_STAGE_ORDER;

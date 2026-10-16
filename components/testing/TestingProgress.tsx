'use client';

import React, { useEffect, useState } from 'react';
import { Check, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  testGenEndText,
  testGenStages,
  testGenTotal,
  testingExpectedLine,
  type TestGenProgress,
  type TestGenStageView,
} from '@/lib/testing-progress';

/**
 * What the Testing tool is doing while it writes a suite — owner request
 * 16.10.2026. The same card as Documentation's ("What this tool is doing",
 * `components/documentation/DocumentationProgress.tsx`): the stages in their
 * order, the elapsed time of the running one and of the whole run, the
 * expected time of the model call, and — once written — one quiet line with
 * the total, the steps one click away.
 *
 * Rendering only: the stages come from `lib/testing-progress.ts`, entered by
 * `hooks/useTestGeneration.ts`. `now` ticks here, once a second, only while
 * the run is on; a spec passes its own.
 */

const DOT: Record<TestGenStageView['state'], string> = {
  pending: 'border-cc-neutral-border bg-cc-surface text-cc-ink-muted',
  active: 'border-cc-ink bg-cc-ink text-cc-on-dark',
  done: 'border-cc-ink bg-cc-surface text-cc-ink',
  failed: 'border-cc-error bg-cc-error-bg text-cc-error',
};

function DotIcon({ state }: { state: TestGenStageView['state'] }) {
  if (state === 'done') return <Check size={14} aria-hidden={true} />;
  if (state === 'failed') return <X size={14} aria-hidden={true} />;
  return <MoreHorizontal size={14} aria-hidden={true} />;
}

function StageList({ stages, expected }: { stages: TestGenStageView[]; expected: string | null }) {
  return (
    <ol data-test-gen-stages="" className="m-0 mt-3 list-none p-0">
      {stages.map((stage, i) => (
        <li key={stage.key} data-test-gen-stage={stage.key} data-stage-state={stage.state} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
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
              <span data-test-gen-stage-time="" className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted tabular-nums max-sm:w-full sm:ml-auto">
                {stage.time}
              </span>
            </div>
            {stage.key === 'model' && expected && (stage.state === 'active' || stage.state === 'pending') ? (
              <p data-test-gen-expected="" className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted [overflow-wrap:anywhere]">
                {expected}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A clock that ticks once a second while `running`, and stands still otherwise. */
function useTick(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // The first tick comes after a second; until then the elapsed time reads 0:00 at the least.
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return now;
}

export default function TestingProgress({ progress, now: fixedNow }: { progress: TestGenProgress; now?: number }) {
  const ticked = useTick(progress.outcome === 'running' && fixedNow === undefined);
  const now = fixedNow ?? ticked;
  const stages = testGenStages(progress, now);
  const total = testGenTotal(progress, now);
  const end = testGenEndText(progress);
  const running = stages.find((s) => s.state === 'active') ?? null;

  // Written: one quiet line, the steps one click away (as Documentation, owner 16.10.2026).
  if (progress.outcome === 'written') {
    return (
      <section aria-label="What this tool did" data-test-gen-progress="" data-test-gen-end="written" className="text-[13px] text-cc-ink-muted">
        <details data-test-gen-fold="">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
            <Check size={14} aria-hidden={true} className="shrink-0 text-cc-success" />
            <span data-test-gen-end-text="" className="min-w-0 [overflow-wrap:anywhere]">{end}</span>
            <span aria-label="Elapsed" data-test-gen-elapsed="" className="font-cc-mono tabular-nums">{total}</span>
            <span className="font-semibold underline-offset-2 hover:underline">Show the steps</span>
          </summary>
          <StageList stages={stages} expected={null} />
        </details>
        <span aria-live="polite" className="sr-only">{end}</span>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="test-gen-progress-title"
      aria-busy={progress.outcome === 'running' ? true : undefined}
      data-test-gen-progress=""
      data-test-gen-end={progress.outcome}
      className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="test-gen-progress-title" className="m-0 min-w-0 text-[15px] font-bold text-cc-ink">
          What this tool is doing
        </h3>
        <span aria-label="Elapsed" data-test-gen-elapsed="" className="font-cc-mono text-[13px] font-semibold text-cc-ink-muted tabular-nums">
          {total}
        </span>
      </div>
      {end ? (
        <p data-test-gen-end-text="" className="m-0 mt-3 rounded-cc-row border border-cc-error-border bg-cc-error-bg px-3 py-2 text-[13px] font-medium text-cc-ink [overflow-wrap:anywhere]">
          {end}
        </p>
      ) : null}
      <StageList stages={stages} expected={testingExpectedLine()} />
      <span aria-live="polite" className="sr-only">
        {end ?? (running ? running.label : '')}
      </span>
    </section>
  );
}

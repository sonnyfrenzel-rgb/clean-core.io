import React from 'react';
import { cn } from '@/lib/utils';
import type { LastRun } from './testing-summary';

/**
 * From written to verified — four steps in one row (proposal A, Testing):
 * Written → Run → Passed → Failed.
 *
 * Each step shows a number only where the record has one. Before a run,
 * "Passed" and "Failed" are a dash and "no run", never a zero that reads as a
 * result and never a rate over nothing. Counts come from `lastRun` — the
 * receipt, or this session's run — so this row and the tile above agree.
 *
 * The bar under each step is its state: the warning mark for scenarios that
 * are a model's proposal, information for passes against mocks (no chart is
 * green, `DESIGN.md` §1.8), error for failures, and a faint line where
 * nothing is known.
 */
export default function TestPipeline({ written, run }: { written: number; run: LastRun }) {
  const counts = run.kind === 'recorded' || run.kind === 'session' ? run.counts : null;
  const steps: Array<{ key: string; label: string; value: string; sub: string; bar: string; on: boolean }> = [
    {
      key: 'written',
      label: 'Written',
      value: String(written),
      sub: written === 1 ? 'scenario' : 'scenarios',
      bar: 'bg-cc-warning-mark',
      on: written > 0,
    },
    {
      key: 'run',
      label: 'Run',
      value: counts ? String(counts.total) : run.kind === 'earlier' ? '—' : '0',
      sub: counts
        ? counts.noResult > 0
          ? `against mocks · ${counts.noResult} without a result`
          : 'against mocks'
        : run.kind === 'earlier'
          ? 'not on this version'
          : 'against mocks',
      bar: 'bg-cc-neutral',
      on: !!counts && counts.total > 0,
    },
    {
      key: 'passed',
      label: 'Passed',
      value: counts ? String(counts.passed) : '—',
      sub: counts ? 'against mocks' : 'no run',
      bar: 'bg-cc-information',
      on: !!counts && counts.passed > 0,
    },
    {
      key: 'failed',
      label: 'Failed',
      value: counts ? String(counts.failed) : '—',
      sub: counts ? 'against mocks' : 'no run',
      bar: 'bg-cc-error',
      on: !!counts && counts.failed > 0,
    },
  ];

  return (
    <ol data-test-pipeline={run.kind} className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4 md:gap-0">
      {steps.map((s, i) => (
        <li
          key={s.key}
          data-pipeline-step={s.key}
          className={cn(
            'min-w-0 border border-cc-line bg-cc-surface px-4 py-3',
            'rounded-cc-row md:rounded-none',
            i === 0 && 'md:rounded-l-cc-row',
            i === steps.length - 1 && 'md:rounded-r-cc-row',
            i > 0 && 'md:border-l-0',
          )}
        >
          <p className="m-0 cc-text-label text-cc-ink-muted">{s.label}</p>
          <p className="m-0 mt-1 cc-text-figure text-cc-ink">{s.value}</p>
          <p className="m-0 cc-text-meta text-cc-ink-muted">{s.sub}</p>
          <span
            aria-hidden={true}
            className={cn('mt-3 block h-1 rounded-full', s.on ? s.bar : 'bg-cc-line')}
          />
        </li>
      ))}
    </ol>
  );
}

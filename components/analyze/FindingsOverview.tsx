'use client';

import React from 'react';
import clsx from 'clsx';
import { severityChartColor, stateChartColor } from '@/lib/chart-colors';
import { normaliseSeverity } from '@/lib/severity';
import type { DistributionEntry, ShownSeverity, SourceBin } from '@/lib/findings-view';

/**
 * Three small pictures of the findings, each with its figures in text
 * (DESIGN.md §1.8: every figure a chart draws is also text):
 *
 *   - **severity** — one stacked bar, Critical → Low, in the severity colours of
 *     `lib/severity.ts` (no green: a finding is never a proof);
 *   - **where in the program** — the source as a strip of equal stretches, each
 *     marked with its most severe finding; a stretch is a button that narrows
 *     the list below to its lines;
 *   - **by kind** — the kinds that occur, largest first, as plain bars.
 *
 * Minimal, token-only styling — the visual direction is still to be chosen.
 */
export default function FindingsOverview({
  severities,
  kinds,
  bins,
  totalLines,
  selected,
  onPickLines,
}: {
  severities: readonly DistributionEntry<ShownSeverity>[];
  kinds: readonly DistributionEntry[];
  bins: readonly SourceBin[];
  totalLines: number;
  selected: { from: number; to: number } | null;
  onPickLines: (lines: { from: number; to: number } | null) => void;
}) {
  const total = severities.reduce((n, s) => n + s.count, 0);
  const maxKind = Math.max(1, ...kinds.map((k) => k.count));
  const maxBin = Math.max(1, ...bins.map((b) => b.count));

  return (
    <div data-findings-overview="" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Severity */}
      <section aria-labelledby="ov-severity" className="min-w-0">
        <h3 id="ov-severity" className="m-0 cc-text-label text-cc-ink-muted">By severity</h3>
        <div
          role="img"
          aria-label={`Findings by severity: ${severities.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')}.`}
          className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-cc-surface-muted"
          data-severity-bar=""
        >
          {total > 0
            ? severities
                .filter((s) => s.count > 0)
                .map((s) => (
                  <span
                    key={s.key}
                    className={clsx('h-full', severityChartColor(s.key).bg)}
                    style={{ width: `${s.share * 100}%` }}
                  />
                ))
            : null}
        </div>
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 cc-text-meta text-cc-ink">
          {severities.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1">
              <span aria-hidden="true" className={clsx('h-2 w-2 rounded-full', severityChartColor(s.key).bg)} />
              {s.count} {s.label.toLowerCase()}
            </li>
          ))}
        </ul>
      </section>

      {/* Where in the program */}
      {bins.length > 0 ? (
        <section aria-labelledby="ov-where" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="ov-where" className="m-0 cc-text-label text-cc-ink-muted">Where in the program</h3>
            {selected ? (
              <button
                type="button"
                onClick={() => onPickLines(null)}
                className="cc-text-meta font-semibold text-cc-ink underline-offset-2 hover:underline"
              >
                Lines {selected.from}–{selected.to} · show all
              </button>
            ) : (
              <span className="cc-text-meta text-cc-ink-muted">line 1 to {totalLines.toLocaleString('en-US')}</span>
            )}
          </div>
          <div className="mt-2 flex h-10 items-end gap-px" data-source-strip="">
            {bins.map((b) => {
              const sev = b.worst ? normaliseSeverity(b.worst) : null;
              const isSel = selected !== null && selected.from === b.from && selected.to === b.to;
              const label =
                b.count === 0
                  ? `Lines ${b.from}–${b.to}: no findings`
                  : `Lines ${b.from}–${b.to}: ${b.count} finding${b.count === 1 ? '' : 's'}, most severe ${b.worst?.toLowerCase()}`;
              return (
                <button
                  key={b.from}
                  type="button"
                  disabled={b.count === 0}
                  aria-label={label}
                  aria-pressed={isSel}
                  title={label}
                  onClick={() => onPickLines(isSel ? null : { from: b.from, to: b.to })}
                  className={clsx(
                    'flex h-full min-w-0 flex-1 items-end disabled:cursor-default',
                    isSel && 'outline outline-2 outline-offset-1 outline-cc-ink',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'block w-full rounded-t-cc-row',
                      b.count === 0 ? 'h-1 bg-cc-line' : sev ? severityChartColor(sev).bg : stateChartColor('neutral').bg,
                    )}
                    style={b.count > 0 ? { height: `${30 + (70 * b.count) / maxBin}%` } : undefined}
                  />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* By kind */}
      <section aria-labelledby="ov-kind" className="min-w-0 lg:col-span-2">
        <h3 id="ov-kind" className="m-0 cc-text-label text-cc-ink-muted">By kind</h3>
        <ul className="m-0 mt-2 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 md:grid-cols-2">
          {kinds.map((k) => (
            <li key={k.key} className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2 cc-text-meta">
              <span className="truncate text-cc-ink" title={k.label}>{k.label}</span>
              <span aria-hidden="true" className="h-2 rounded-full bg-cc-surface-muted">
                <span
                  className={clsx('block h-2 rounded-full', stateChartColor('neutral').bg)}
                  style={{ width: `${(k.count / maxKind) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold text-cc-ink">{k.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

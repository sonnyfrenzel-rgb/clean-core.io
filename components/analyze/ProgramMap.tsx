'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { severityChartColor } from '@/lib/chart-colors';
import { normaliseSeverity } from '@/lib/severity';
import type { ProcessStepBand, ProgramMapRow, SourcePosition } from '@/lib/findings-view';

/**
 * "Where in the program" — the program map of proposal B, taken into A on the
 * owner's pick (01.10.2026): one row per kind of finding, every finding at its
 * source line, the dot's size its severity; behind them, as columns, the
 * process steps the program runs (the routines its entry block calls, read
 * off the same skeleton the Business view draws); under the axis, a triangle
 * where a construct the engine could not assess begins.
 *
 * A dot is a button: it narrows the list below to its line. There is no source
 * view on this page to jump into, so the list is where it goes — the same thing
 * the source strip did before. Every figure is also text (§1.8): each dot names
 * its line, kind and severity, and the rows carry their counts.
 */
const DOT: Record<string, string> = {
  Critical: 'h-4 w-4',
  High: 'h-4 w-4',
  Medium: 'h-3 w-3',
  Low: 'h-2 w-2',
  Info: 'h-2 w-2',
};

const pct = (at: number) => `${(at * 100).toFixed(3)}%`;

function Track({ steps, totalLines, children, className }: { steps: readonly ProcessStepBand[]; totalLines: number; children?: React.ReactNode; className?: string }) {
  const x = (line: number) => (totalLines <= 1 ? 0 : (line - 1) / (totalLines - 1));
  return (
    <div className={cn('relative min-w-0', className)}>
      {steps.map((s, i) => (
        <span
          key={s.n}
          aria-hidden={true}
          className={cn('absolute inset-y-0', i % 2 ? 'bg-cc-seq-1' : 'bg-cc-seq-1/60')}
          style={{ left: pct(x(s.from)), width: `max(3px, ${((x(s.to) - x(s.from)) * 100).toFixed(3)}%)` }}
        />
      ))}
      {children}
    </div>
  );
}

/** Dots that sit on (nearly) the same x are moved apart, alternately up and down. */
function spread(dots: readonly SourcePosition[]): Array<SourcePosition & { dy: number }> {
  const seen = new Map<number, number>();
  return dots.map((d) => {
    const key = Math.round(d.at * 120);
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const dy = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 8;
    return { ...d, dy };
  });
}

export default function ProgramMap({
  rows,
  steps,
  totalLines,
  notAssessed,
  selectedLine,
  onPick,
}: {
  rows: readonly ProgramMapRow[];
  steps: readonly ProcessStepBand[];
  totalLines: number;
  /** Where each kind of construct not assessed begins. */
  notAssessed: ReadonlyArray<{ label: string; firstLine: number }>;
  selectedLine: number | null;
  onPick: (line: number | null) => void;
}) {
  if (totalLines < 1 || rows.length === 0) return null;
  const x = (line: number) => (totalLines <= 1 ? 0 : (line - 1) / (totalLines - 1));
  // Round steps — 100s for a program of a few hundred lines — and the last line.
  const raw = totalLines / 7;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? 10 * mag;
  const ticks = [1];
  for (let t = step; t < totalLines - step / 2; t += step) ticks.push(t);
  if (totalLines > 1) ticks.push(totalLines);

  return (
    <div data-program-map="" data-source-strip="" className="min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-x-4">
        {/* Step numbers above the columns. */}
        <div className="hidden sm:block" />
        <Track steps={[]} totalLines={totalLines} className="hidden h-5 sm:block">
          {steps.map((s) => (
            <span
              key={s.n}
              title={`Step ${s.n}: ${s.label}, lines ${s.from}–${s.to}`}
              className="absolute bottom-0 font-cc-mono text-[11px] font-semibold text-cc-information"
              style={{ left: pct(x(s.from)) }}
            >
              {s.n}
            </span>
          ))}
        </Track>

        {rows.map((r) => (
          <React.Fragment key={r.kind}>
            <div className="min-w-0 pt-2 sm:py-2 sm:text-right" data-program-map-row={r.kind}>
              <p className="m-0 cc-text-identifier text-cc-ink">{r.label}</p>
              <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">
                {r.count} {r.count === 1 ? 'finding' : 'findings'}
              </p>
            </div>
            <Track steps={steps} totalLines={totalLines} className="min-h-12 rounded-cc-row sm:rounded-none">
              <span aria-hidden={true} className="absolute inset-x-0 top-1/2 h-px bg-cc-line" />
              {spread(r.dots).map((d) => {
                const sev = normaliseSeverity(d.severity);
                const serious = d.severity === 'Critical' || d.severity === 'High';
                const selected = selectedLine === d.line;
                const label = `Line ${d.line}: ${d.title}, ${d.severity.toLowerCase()}`;
                return (
                  <React.Fragment key={`${d.line}-${d.dy}`}>
                    {serious ? (
                      <span
                        aria-hidden={true}
                        className="absolute font-cc-mono text-[11px] font-bold text-cc-error"
                        style={{ left: pct(d.at), top: `calc(50% + ${d.dy}px - 26px)`, transform: 'translateX(-50%)' }}
                      >
                        L{d.line}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      data-program-map-dot={d.line}
                      aria-label={label}
                      aria-pressed={selected}
                      title={label}
                      onClick={() => onPick(selected ? null : d.line)}
                      className="absolute grid h-6 w-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-cc-focus"
                      style={{ left: pct(d.at), top: `calc(50% + ${d.dy}px)`, transform: 'translate(-50%, -50%)' }}
                    >
                      <span
                        aria-hidden={true}
                        data-chart-segment=""
                        className={cn(
                          'block rounded-full ring-2',
                          DOT[d.severity] ?? 'h-2 w-2',
                          sev ? severityChartColor(sev).bg : 'bg-cc-neutral',
                          d.severity === 'High' && 'opacity-70',
                          selected ? 'ring-cc-ink' : 'ring-cc-surface',
                        )}
                      />
                    </button>
                  </React.Fragment>
                );
              })}
            </Track>
          </React.Fragment>
        ))}

        {/* The axis: line numbers, and where the unassessed constructs begin. */}
        <div className="hidden sm:block sm:pt-1 sm:text-right">
          {notAssessed.length ? <span className="cc-text-meta font-medium text-cc-ink-muted">△ not assessed</span> : null}
        </div>
        <Track steps={[]} totalLines={totalLines} className="h-9">
          {notAssessed.map((n) => (
            <span
              key={n.label}
              title={`Not assessed: ${n.label}, from line ${n.firstLine}`}
              className="absolute top-0 cc-text-meta text-cc-ink-muted"
              style={{ left: pct(x(n.firstLine)), transform: 'translateX(-50%)' }}
            >
              △<span className="sr-only">{` not assessed: ${n.label}, from line ${n.firstLine}`}</span>
            </span>
          ))}
          {ticks.map((t, i) => (
            <span
              key={t}
              aria-hidden={true}
              className={cn('absolute bottom-0 font-cc-mono text-[11px] text-cc-ink-muted', i > 0 && i < ticks.length - 1 && 'hidden sm:inline')}
              style={{ left: pct(x(t)), transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {t}
            </span>
          ))}
        </Track>
      </div>
      {steps.length ? (
        <p className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted">
          Columns are the {steps.length} process steps the program runs:{' '}
          {steps.map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 ? ' · ' : null}
              <span className="whitespace-nowrap">
                {s.n} <span className="font-cc-mono">{s.label}</span>
              </span>
            </React.Fragment>
          ))}
        </p>
      ) : null}
    </div>
  );
}

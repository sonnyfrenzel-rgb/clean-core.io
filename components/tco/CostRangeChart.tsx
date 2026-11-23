import React from 'react';
import { cn } from '@/lib/utils';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';
import { formatDays, formatMoneyRangeOutward, formatNumber } from '@/lib/format';
import type { CostComparison, CostOption, EffortDays } from '@/lib/cost-assumptions';
import { OPTION_CONDITION, differenceToKeeping, differenceWords, isKeep, yearsWords } from '@/lib/economics-answer';
import FamilyChip from '@/components/family/FamilyChip';

/**
 * "Cost of each choice over 5 years, as a range" (ADR-128 (1), mock-up E4): one bar per option from its low to its
 * high total, Keep as the reference line through every row. A bar's width is the uncertainty of the one-off effort;
 * Keep has none, so it is a point. An option that holds only under a condition (Move to SAP standard, Retire) is drawn
 * dashed. Every figure the chart draws is also text beside it (§1.8), rounded outward to two significant figures.
 *
 * Before anything is priced the chart says so and shows what is already known, in days, proposed from the lines.
 */
const BAR = SEQUENTIAL_CHART_COLORS[2].bg;
const WASH = SEQUENTIAL_CHART_COLORS[0].bg;

/** A round step for the axis: 1, 2 or 5 times a power of ten. */
function niceStep(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

const sum = (d: EffortDays | null | undefined) =>
  d && Number.isFinite(d.devDays) && Number.isFinite(d.testDays) ? d.devDays + d.testDays : null;

export interface ProposedDays {
  optionId: string;
  label: string;
  once: { low: number; high: number } | null;
  perRelease: number | null;
  upkeep: number | null;
}

export default function CostRangeChart({
  comparison,
  options,
  currency,
  years,
  priced,
  proposed,
  lines,
}: {
  comparison: CostComparison;
  options: readonly CostOption[];
  currency: string;
  years: number | null;
  /** Every option carries an amount. */
  priced: boolean;
  /** What is known in days before anything is priced — one row per option. */
  proposed: readonly ProposedDays[];
  lines: number | null;
}) {
  if (!priced) {
    return (
      <div data-economics-chart="not-priced" className="rounded-cc-card border border-dashed border-cc-line px-4 py-3">
        <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink">
          <b className="font-semibold">No amounts yet, nothing has a default.</b>
          <span className="text-cc-ink-muted">
            What is already known, in days{lines !== null ? `, proposed from the ${formatNumber(lines) ?? lines} lines` : ''}:
          </span>
          <FamilyChip kind="engine" note="proposal" />
        </p>
        <ul className="m-0 mt-2 list-none divide-y divide-cc-line p-0">
          {proposed.map((p) => (
            <li key={p.optionId} data-economics-chart-days={p.optionId} className="grid grid-cols-1 gap-x-4 gap-y-1 py-2 cc-text-cell sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr]">
              <b className="font-semibold text-cc-ink">{p.label}</b>
              <span className="text-cc-ink-muted">
                {p.once === null
                  ? 'not proposed'
                  : p.once.low === 0 && p.once.high === 0
                    ? 'nothing once'
                    : `${formatDays(p.once.low)}–${formatDays(p.once.high)} days once`}
              </span>
              <span className="text-cc-ink-muted">
                {p.perRelease === null ? '' : p.perRelease ? `${formatDays(p.perRelease)} days per release` : 'nothing per release'}
              </span>
              <span className="text-cc-ink-muted">{p.upkeep ? `${formatDays(p.upkeep)} days a year upkeep` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const rows = options
    .map((o) => ({ o, c: comparison.costs.find((x) => x.optionId === o.id) }))
    .filter((r): r is { o: CostOption; c: NonNullable<typeof r.c> } => Boolean(r.c && r.c.total));
  const keep = rows.find((r) => isKeep(r.o))?.c.total ?? null;
  const max = Math.max(1, ...rows.map((r) => r.c.total!.high));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const x = (v: number) => `${((v / top) * 100).toFixed(2)}%`;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const tick = (v: number) => (v === 0 ? '0' : `${currency} ${v >= 1000 ? `${formatNumber(v / 1000, { maximumFractionDigits: 1 })}k` : formatNumber(v)}`);
  const summary = rows.map((r) => `${r.o.label}: ${formatMoneyRangeOutward(r.c.total, currency)}`).join('; ');

  return (
    <div data-economics-chart="priced">
      <div role="img" aria-label={`Cost of each choice over ${yearsWords(years)}: ${summary}.`} className="flex flex-col gap-3">
        {rows.map(({ o, c }) => {
          const t = c.total!;
          const point = t.low === t.high;
          const cond = OPTION_CONDITION[o.kind];
          const reference = isKeep(o);
          return (
            <div
              key={o.id}
              data-economics-chart-row={o.id}
              className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,12rem)] items-center gap-x-4 gap-y-1 max-[720px]:grid-cols-[minmax(0,1fr)_auto] max-[720px]:[&>[data-track]]:col-span-2 max-[720px]:[&>[data-track]]:row-start-2"
            >
              <div className="min-w-0">
                <b className="block cc-text-cell font-semibold text-cc-ink">{o.label}</b>
                <span className="block cc-text-meta text-cc-ink-muted">
                  {reference ? 'no one-off effort' : cond ? `Only ${cond}` : 'once and per release'}
                </span>
              </div>
              <div data-track="" aria-hidden={true} className="relative h-6 rounded-cc-row bg-cc-surface-muted">
                {keep ? <span className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-cc-ink" style={{ left: x(keep.low) }} /> : null}
                <span
                  className={cn(
                    'absolute top-1 bottom-1 rounded-full',
                    point ? 'w-3 -translate-x-1/2' : '',
                    cond ? `${WASH} border-2 border-dashed border-cc-ink-muted` : BAR,
                  )}
                  style={point ? { left: x(t.low) } : { left: x(t.low), width: `calc(${x(t.high)} - ${x(t.low)})`, minWidth: '0.75rem' }}
                />
              </div>
              <div className="min-w-0 text-right max-[720px]:text-left">
                <b className="block cc-text-cell font-semibold text-cc-ink tabular-nums" data-economics-chart-total={o.id}>
                  {formatMoneyRangeOutward(t, currency)}
                </b>
                <span className="block cc-text-meta text-cc-ink-muted">
                  {reference ? 'the reference' : keep ? differenceWords(differenceToKeeping(keep, t), currency) : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div aria-hidden={true} className="mt-2 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,12rem)] gap-x-4 max-[720px]:hidden">
        <span />
        <div className="relative h-5 cc-text-meta text-cc-ink-muted">
          {ticks.map((v) => (
            <span key={v} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: x(v) }}>
              {tick(v)}
            </span>
          ))}
        </div>
        <span />
      </div>
      <p className="m-0 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 cc-text-meta text-cc-ink-muted">
        <span className="inline-flex items-center gap-1">
          <i aria-hidden={true} className={`inline-block h-2.5 w-5 rounded-full ${BAR}`} />
          range from the low and high one-off effort
        </span>
        <span className="inline-flex items-center gap-1">
          <i aria-hidden={true} className={`inline-block size-2.5 rounded-full ${BAR}`} />a point: no one-off effort
        </span>
        <span className="inline-flex items-center gap-1">
          <i aria-hidden={true} className={`inline-block h-2.5 w-5 rounded-full border-2 border-dashed border-cc-ink-muted ${WASH}`} />
          holds only under its condition
        </span>
        <span className="inline-flex items-center gap-1">
          <i aria-hidden={true} className="inline-block h-3 w-0.5 bg-cc-ink" />
          cost of keeping
        </span>
        <FamilyChip kind="simulation" />
      </p>
    </div>
  );
}

/** What is known in days per option, from what the options hold or the proposals offer. */
export function proposedDaysOf(
  options: readonly CostOption[],
  proposalFor: (o: CostOption) => { oneOff: { low: EffortDays; high: EffortDays }; perRelease: EffortDays } | null,
  baseline: EffortDays | null,
): ProposedDays[] {
  return options.map((o) => {
    const p = o.oneOff || o.perRelease ? { oneOff: o.oneOff, perRelease: o.perRelease } : proposalFor(o);
    const low = sum(p?.oneOff?.low);
    const high = sum(p?.oneOff?.high);
    return {
      optionId: o.id,
      label: o.label,
      once: low !== null && high !== null ? { low, high } : null,
      perRelease: sum(p?.perRelease ?? null),
      upkeep: isKeep(o) ? sum(o.maintenanceBaselinePerYear ?? baseline) : null,
    };
  });
}

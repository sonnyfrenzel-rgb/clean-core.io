'use client';

import React from 'react';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcIconButton from '@/components/cc/IconButton';
import { scoreBandChartColor } from '@/lib/chart-colors';
import { SCORE_BANDS, SCORE_BANDS_SOURCE, SCORE_NATURE, scoreBand, type ScoreBand, type ScoreBreakdown } from '@/lib/clean-core-score';
import ObjectSection from './ObjectSection';

/**
 * The Clean Core Score as the central figure of Analyze (owner, 01.10.2026:
 * "der Clean Core Score muss zentral sein, und es muss klar sein, was ein guter
 * oder schlechter Score ist und wann").
 *
 * Four things, top to bottom: where this project sits on a 0–100 scale cut into
 * four bands; what each band means in plain words, this project's band marked;
 * what moved this score — every deduction of the score's own table, with the
 * kinds of finding that caused it; and when the figure matters.
 *
 * The bands are Clean-Core.io's official reading of a score, derived from the
 * deduction table (`lib/clean-core-score.ts`, where each sentence is
 * justified), and the section says so. The
 * score itself is the signed run's; the breakdown is recomputed from the
 * findings on this page with the same table and is shown only beside a score
 * it adds up to.
 *
 * The bands are coloured from one sequential scale (`scoreBandChartColor`,
 * DESIGN.md §1.8), every band at full strength; the band the score is in is
 * told by the marker, its words and its card, not by fading the others.
 */

/**
 * The scale itself — four bands and a marker. `compact` is the facet's micro
 * chart. The marker's white ring keeps it apart from the deepest band, which
 * is nearly as dark as the ink.
 */
export function ScoreScale({ score, compact = false }: { score: number; compact?: boolean }) {
  const at = Math.max(0, Math.min(100, score));
  const band = scoreBand(score);
  return (
    <div
      role="img"
      aria-label={`Clean Core Score ${score} of 100, in the band ${band.from}–${band.to}, ${band.label.toLowerCase()}.`}
      data-score-scale={compact ? 'compact' : 'full'}
      className="relative w-full"
    >
      <div className={cn('flex w-full gap-0.5 overflow-hidden rounded-cc-row', compact ? 'h-2' : 'h-3')}>
        {SCORE_BANDS.map((b) => {
          // Boundaries halfway between the integers, so the marker at `score`% lands in its band.
          const width = b.key === 'far' ? b.to + 0.5 : b.key === 'light' ? 100.5 - b.from : b.to - b.from + 1;
          return (
            <span
              key={b.key}
              data-chart-segment=""
              data-score-segment={b.key}
              className={cn('h-full', scoreBandChartColor(b.key).bg)}
              style={{ flex: `${width} 0 0` }}
            />
          );
        })}
      </div>
      <span
        aria-hidden={true}
        data-score-marker=""
        className={cn('absolute -translate-x-1/2 rounded-full bg-cc-ink ring-2 ring-cc-surface', compact ? '-top-1 h-4 w-1' : '-top-1 h-5 w-1')}
        style={{ left: `${at}%` }}
      />
    </div>
  );
}

function BandCard({ band, current }: { band: ScoreBand; current: boolean }) {
  return (
    <li
      data-score-band={band.key}
      data-score-band-current={current ? 'true' : 'false'}
      className={cn(
        'min-w-0 rounded-cc-row border px-3 py-2',
        current ? 'border-cc-ink bg-cc-surface-muted shadow-[inset_0_0_0_1px_var(--cc-ink)]' : 'border-cc-line',
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span aria-hidden={true} data-score-swatch={band.key} className={cn('h-2 w-3 shrink-0 rounded-cc-row', scoreBandChartColor(band.key).bg)} />
        <span className="font-cc-mono cc-text-meta text-cc-ink tabular-nums">
          {band.from}–{band.to}
        </span>
        {current ? <span className="cc-text-meta text-cc-ink">· this project</span> : null}
      </span>
      <span className="mt-1 block cc-text-identifier text-cc-ink">{band.label}</span>
      <span className="mt-1 block cc-text-cell text-cc-ink-muted">{band.meaning}</span>
      <span className="mt-1 block cc-text-meta font-medium text-cc-ink-muted">{band.because}</span>
    </li>
  );
}

export default function CleanCoreScoreSection({
  score,
  breakdown,
  onExplain,
}: {
  /** The signed score, or null when the run computed none. */
  score: number | null;
  /** The deductions, recomputed from the findings on this page; null without a source. */
  breakdown: ScoreBreakdown | null;
  onExplain: () => void;
}) {
  const band = score !== null ? scoreBand(score) : null;
  const addsUp = breakdown !== null && score !== null && breakdown.score === score;
  const maxPoints = Math.max(1, ...(breakdown?.lines.map((l) => l.points) ?? [1]), breakdown?.unassessedPoints ?? 0);

  return (
    <ObjectSection
      id="analyze-score"
      data-analyze-score={score ?? 'none'}
      title={
        <>
          Clean Core Score
          <CcIconButton label="What the Clean Core Score is" title="What the Clean Core Score is" onClick={onExplain}>
            <HelpCircle size={16} aria-hidden="true" />
          </CcIconButton>
        </>
      }
      right={<span className="cc-text-meta text-cc-ink-muted">A grade, not a compliance percentage · higher is better</span>}
    >
      {score === null || band === null ? (
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          This run computed no score, so none is shown — a missing figure is not filled in.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 items-end gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="m-0 cc-text-label text-cc-ink-muted">This project</p>
              <p className="m-0 mt-1 flex items-baseline gap-1">
                <span className="cc-text-figure text-cc-ink" data-analyze-score-value="">
                  {score}
                </span>
                <span className="cc-text-cell text-cc-ink-muted">of 100</span>
              </p>
              <p className="m-0 mt-1 cc-text-identifier text-cc-ink" data-analyze-score-band={band.key}>
                {band.from}–{band.to} · {band.label}
              </p>
            </div>

            <div className="min-w-0 pb-1">
              <ScoreScale score={score} />
              <div className="relative mt-1 h-5 font-cc-mono cc-text-meta font-medium text-cc-ink-muted tabular-nums">
                {[0, ...SCORE_BANDS.slice(1).map((b) => b.from), 100].map((t, i, all) => (
                  <span
                    key={t}
                    className={cn('absolute top-0', i > 0 && i < all.length - 1 && 'hidden sm:inline')}
                    style={{ left: `${t}%`, transform: i === 0 ? 'none' : i === all.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4" aria-label="What a score means, band by band">
            {SCORE_BANDS.map((b) => (
              <BandCard key={b.key} band={b} current={b.key === band.key} />
            ))}
          </ol>

          <div className="border-t border-cc-line pt-4" data-score-breakdown={addsUp ? 'shown' : breakdown ? 'differs' : 'none'}>
            <h3 className="m-0 cc-text-h3 text-cc-ink">What moves it</h3>
            {breakdown && addsUp ? (
              <>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                  The score starts at 100. Each kind of construct below takes points off — the first finding of a kind
                  costs most, each further one less, and every kind has a cap. Removing a kind gives its points back.
                </p>
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                  {breakdown.lines.map((l) => (
                    <DeductionRow key={l.kind} label={l.label} count={`${l.count}×`} points={l.points} max={maxPoints} />
                  ))}
                  {breakdown.unassessedPoints > 0 ? (
                    <DeductionRow
                      label="Kinds of construct the engine could not assess"
                      count={`${breakdown.unassessedKinds}×`}
                      points={breakdown.unassessedPoints}
                      max={maxPoints}
                      notDetermined
                    />
                  ) : null}
                </ul>
                <p className="m-0 mt-3 cc-text-meta text-cc-ink">
                  100 − {100 - score} = {score}
                  {breakdown.floored ? ' (the score never goes below 5)' : ''}
                </p>
              </>
            ) : breakdown ? (
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                The findings on this page add up to {breakdown.score}, the signed run recorded {score}. The run was made
                with a different engine or source, so its deductions are not listed here — run the analysis again to see
                them.
              </p>
            ) : (
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                The source is not on this page, so the deductions cannot be listed.
              </p>
            )}
          </div>

          <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">
            When it matters: before an upgrade or a move to the cloud — and after a change, when a new run of the same code
            shows whether it moved. {SCORE_BANDS_SOURCE}. {SCORE_NATURE}.{' '}
            <Link href="/clean-core-score" className="font-semibold text-cc-ink underline underline-offset-2">
              How the score is computed
            </Link>
          </p>
        </div>
      )}
    </ObjectSection>
  );
}

function DeductionRow({
  label,
  count,
  points,
  max,
  notDetermined = false,
}: {
  label: string;
  count: string;
  points: number;
  max: number;
  notDetermined?: boolean;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_3rem]">
      <span className="min-w-0 cc-text-cell text-cc-ink">
        {label} <span className="text-cc-ink-muted">{count}</span>
      </span>
      <span aria-hidden={true} className="order-3 col-span-2 h-2 rounded-cc-row bg-cc-surface-muted sm:order-none sm:col-span-1">
        <span
          data-chart-segment=""
          data-not-determined={notDetermined ? '' : undefined}
          className={cn('block h-2 rounded-cc-row', notDetermined ? 'border border-dashed border-cc-field-border bg-cc-surface-muted' : 'bg-cc-ink-muted')}
          style={{ width: `${(points / max) * 100}%` }}
        />
      </span>
      <span className="text-right font-cc-mono cc-text-meta text-cc-ink tabular-nums">−{points}</span>
    </li>
  );
}

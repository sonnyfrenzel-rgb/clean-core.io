'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcIconButton from '@/components/cc/IconButton';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { NOT_DETERMINED_CHART, scoreBandChartColor } from '@/lib/chart-colors';
import {
  SCORE_BANDS,
  SCORE_BANDS_SOURCE,
  SCORE_FLOOR,
  UNASSESSED_POINTS_PER_KIND,
  scoreBand,
  type ScoreBreakdown,
} from '@/lib/clean-core-score';
import { editionName, type Edition, type HeroDeduction, type OtherEditionFigure, type ScoreHeroModel } from '@/lib/score-hero';

/**
 * The Clean Core Score as the hero of Analyze (ADR-093, owner approval
 * 11.10.2026, mockup `docs/roadmap/analyze-score-hero-mockup.html`, pins
 * H1–H6). Earlier (01.10.2026) it was a section of its own under the answer,
 * with four band cards; the score stood three times on the page — a facet, the
 * section, an anchor chip. Now it stands once, at the top:
 *
 *   - `ScoreFigure` (H1–H4): the number, its band on the one scale with the
 *     band names under it, what the score is and is not, the edition rule with
 *     the other edition's figure, and where the figure comes from;
 *   - `ScoreDeductions` (H5, H6): every deduction of the score's own table in
 *     a reader's words, with the lines it comes from, summing exactly to the
 *     signed score — or, where it does not, the one sentence that says why.
 *
 * The bands are Clean-Core.io's official reading of a score
 * (`lib/clean-core-score.ts`), the scale coloured from one sequential scale
 * (`scoreBandChartColor`, DESIGN.md §1.8): never green, every band at full
 * strength, the score's band told by the marker and its words. The four band
 * sentences are in the dialog behind "?" — said once, not twice.
 */

/**
 * The scale itself — four bands and a marker. The marker's white ring keeps it
 * apart from the deepest band, which is nearly as dark as the ink.
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
        {SCORE_BANDS.map((b) => (
          <span
            key={b.key}
            data-chart-segment=""
            data-score-segment={b.key}
            className={cn('h-full', scoreBandChartColor(b.key).bg)}
            style={{ flex: `${bandWidth(b.key, b.from, b.to)} 0 0` }}
          />
        ))}
      </div>
      <span
        aria-hidden={true}
        data-score-marker=""
        className={cn('absolute -translate-x-1/2 rounded-full bg-cc-ink ring-2 ring-cc-surface', compact ? '-top-1 h-4 w-1' : '-top-1.5 h-6 w-1.5')}
        style={{ left: `${at}%` }}
      />
    </div>
  );
}

/** Boundaries halfway between the integers, so the marker at `score`% lands in its band. */
function bandWidth(key: string, from: number, to: number): number {
  return key === 'far' ? to + 0.5 : key === 'light' ? 100.5 - from : to - from + 1;
}

/** Where the figure comes from (H4): the run, the engine, the file — or the demo, never signed. */
export interface ScoreProvenance {
  /** The signed run; null for the demo and for a project analysed before runs existed. */
  run: { id: string; when: string | null; href?: string } | null;
  demo?: boolean;
  engine: string | null;
  rules: string | null;
  fileName: string | null;
  lines: number | null;
  catalog: string | null;
  /** The target profile the run signed — "target S4HANA-2023-FPS02 · covered". */
  target?: string | null;
}

/** The left half of the hero (H1–H4). Only for a computed score; the caller says "Not yet computed". */
export function ScoreFigure({
  score,
  edition,
  freeWrites,
  other,
  provenance,
}: {
  score: number;
  /** The project's target edition, as the run recorded it; null when none was recorded. */
  edition: Edition | null;
  /** Writes to the program's own Z/Y tables the run's rule let go free. */
  freeWrites: number;
  /** The other edition's figure for the same findings — null where the deductions do not add up. */
  other: OtherEditionFigure | null;
  provenance: ScoreProvenance;
}) {
  const band = scoreBand(score);
  const ticks = [0, ...SCORE_BANDS.slice(1).map((b) => b.from), 100];
  return (
    <div className="min-w-0">
      <p className="m-0 mt-2 flex items-baseline gap-2">
        <span className="cc-text-hero text-cc-ink" data-analyze-score-value="">
          {score}
        </span>
        <span className="cc-text-body font-semibold text-cc-ink-muted">of 100</span>
      </p>
      <p className="m-0 mt-2 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink" data-analyze-score-band={band.key}>
        <span aria-hidden={true} data-score-swatch={band.key} className={cn('h-3 w-3 shrink-0 rounded-[3px]', scoreBandChartColor(band.key).bg)} />
        {band.label}
        <span className="cc-text-cell text-cc-ink-muted">· band {band.from}–{band.to}</span>
      </p>

      <div className="mt-4">
        <ScoreScale score={score} />
        <div className="relative mt-1 h-4 font-cc-mono cc-text-meta font-medium text-cc-ink-muted tabular-nums" aria-hidden={true}>
          {ticks.map((t, i) => (
            <span
              key={t}
              className={cn('absolute top-0', i === ticks.length - 2 && 'hidden sm:inline')}
              style={{ left: `${t}%`, transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {t}
            </span>
          ))}
        </div>
        <ol className="m-0 mt-1 hidden list-none p-0 sm:flex" aria-label="The four bands, lowest first" data-score-band-names="">
          {SCORE_BANDS.map((b) => {
            // A narrow band has room for the first word of its name; the whole name is read out.
            const narrow = b.to - b.from < 15;
            return (
              <li
                key={b.key}
                data-score-band={b.key}
                data-score-band-current={b.key === band.key ? 'true' : 'false'}
                title={narrow ? b.label : undefined}
                className={cn('min-w-0 cc-text-meta leading-tight', b.key === band.key ? 'text-cc-ink' : 'text-cc-ink-muted')}
                style={{ flex: `${bandWidth(b.key, b.from, b.to)} 0 0` }}
              >
                <span aria-hidden={narrow ? true : undefined}>{narrow ? b.label.split(' ')[0] : b.label}</span>
                <span className="sr-only">
                  {narrow ? b.label : ''}, {b.from}–{b.to}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="m-0 mt-4 cc-text-meta font-medium text-cc-ink-muted" data-score-nature="">
        A grade for this one piece of code, higher is better —{' '}
        <b className="font-semibold text-cc-ink">not a compliance percentage and not an SAP measure</b>.{' '}
        <span className="hidden sm:inline">{SCORE_BANDS_SOURCE}. </span>
        <Link href="/clean-core-score" className="font-semibold text-cc-ink underline underline-offset-2">
          How the score is computed
        </Link>
      </p>

      <EditionRule score={score} edition={edition} freeWrites={freeWrites} other={other} engine={provenance.engine} />

      <div className="mt-4 grid gap-2 border-t border-cc-line pt-3" data-analysis-meta="">
        <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta font-medium text-cc-ink-muted">
          <CcProvenanceChip value="reconstructed" note="fixed rules" />
          no model involved
        </p>
        <p className="m-0 cc-text-meta font-medium text-cc-ink-muted break-words" data-score-run="">
          {provenance.run ? (
            <>
              In the <b className="font-semibold text-cc-ink">signed</b> run{' '}
              {provenance.run.href ? (
                <a href={provenance.run.href} className="font-cc-mono text-cc-ink underline underline-offset-2">
                  {provenance.run.id.slice(0, 8)}
                </a>
              ) : (
                <span className="font-cc-mono text-cc-ink">{provenance.run.id.slice(0, 8)}</span>
              )}
              {provenance.run.when ? ` · ${provenance.run.when}` : ''}
            </>
          ) : provenance.demo ? (
            <b className="font-semibold text-cc-ink">Demo — never signed</b>
          ) : (
            'No signed run'
          )}
          {provenance.engine ? (
            <>
              {' · engine '}
              <span className="font-cc-mono">{provenance.engine}</span>
            </>
          ) : null}
          {provenance.rules ? (
            <span className="hidden sm:inline">
              {' · rules '}
              <span className="font-cc-mono">{provenance.rules}</span>
            </span>
          ) : null}
        </p>
        {provenance.fileName || provenance.lines || provenance.catalog || provenance.target ? (
          <p className="m-0 hidden cc-text-meta font-medium text-cc-ink-muted break-words sm:block" data-score-source="">
            {[
              provenance.fileName,
              typeof provenance.lines === 'number' && provenance.lines > 0 ? `${provenance.lines.toLocaleString('en-US')} lines` : null,
              provenance.catalog ? `catalog ${provenance.catalog}` : null,
              provenance.target ?? null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * H3 — which edition's rule scored this, and the other edition's figure for
 * the same findings (owner decision Q1, 11.10.2026). The other figure is
 * computed, never signed, and says so.
 */
function EditionRule({
  score,
  edition,
  freeWrites,
  other,
  engine,
}: {
  score: number;
  edition: Edition | null;
  freeWrites: number;
  other: OtherEditionFigure | null;
  engine: string | null;
}) {
  const scoredFor = edition ?? 'private';
  const writes = freeWrites === 1 ? 'that write costs' : `those ${freeWrites} writes cost`;
  let sub: React.ReactNode = null;
  if (other && other.sameRule) {
    sub = (
      <>
        Under {editionName(other.edition)} rules the same findings give the same <b className="font-semibold text-cc-ink">{other.score}</b>
        : this run was scored{engine ? ` with engine ${engine}` : ''}, before 3.0.9, when writes to the program&rsquo;s own Z/Y
        tables cost points in both editions.
      </>
    );
  } else if (other && scoredFor === 'private') {
    sub = (
      <>
        Writes to the program&rsquo;s own Z/Y tables cost nothing there (on-stack developer extensibility). Under{' '}
        {editionName(other.edition)} rules the same findings give <b className="font-semibold text-cc-ink">{other.score}</b>
        {freeWrites > 0 && other.score !== score ? `: ${writes} ${score - other.score} points there` : ''}. Computed from the
        same findings; only {score} is signed.
      </>
    );
  } else if (other) {
    sub = (
      <>
        Writes to the program&rsquo;s own Z/Y tables cost points there. Under {editionName(other.edition)} rules the same
        findings give <b className="font-semibold text-cc-ink">{other.score}</b>
        {other.score !== score ? ': there writes to the program’s own Z/Y tables cost nothing' : ''}. Computed from the same
        findings; only {score} is signed.
      </>
    );
  }
  return (
    <div className="mt-3 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2 cc-text-cell text-cc-ink" data-score-edition={scoredFor}>
      {edition ? (
        <>
          <b className="font-bold">Scored for {editionName(edition)}</b> — the project&rsquo;s target.
        </>
      ) : (
        <>
          <b className="font-bold">Scored by the {editionName(scoredFor)} rule</b> — the run recorded no target edition.
        </>
      )}
      {sub ? (
        <p className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted" data-score-other-edition={other?.score ?? ''}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What one deduction counted, in a reader's words: "2 findings · EBAN · first 20, each further 3". */
function deductionDetail(d: HeroDeduction): string {
  const objects = d.objects.length
    ? ` · ${d.objects.slice(0, 4).join(', ')}${d.objects.length > 4 ? ` and ${d.objects.length - 4} more` : ''}`
    : '';
  const rule = d.capped
    ? `capped at ${d.cap}`
    : d.count > 1
      ? `first ${d.first}, each further ${d.additional}`
      : `${d.first} for the first`;
  // Engine 3.0.13 on (SD review CR-A6): charged all the same, but said.
  // Engine 3.0.18 on: a routine nothing calls is a reason too.
  const why = d.unreachable
    ? [
        ...(d.unreachable.gates.length ? [`behind constant ${d.unreachable.gates.map((g) => g.constant).join(', ')}`] : []),
        ...(d.unreachable.routines?.length ? [`in ${d.unreachable.routines.length === 1 ? 'a routine' : 'routines'} nothing calls: ${d.unreachable.routines.slice(0, 3).join(', ')}${d.unreachable.routines.length > 3 ? ` and ${d.unreachable.routines.length - 3} more` : ''}`] : []),
      ].join('; ')
    : '';
  const locked = d.unreachable
    ? ` · ${d.unreachable.lines.length === d.lines.length ? 'all' : plural(d.unreachable.lines.length, 'line', 'lines')} unreachable (${why})`
    : '';
  return `${plural(d.count, 'finding', 'findings')}${objects} · ${rule}${locked}`;
}

/** Line chips: the first few lines a row comes from, and how many more. */
function LineChips({ lines, onOpenLine, shown = 2 }: { lines: readonly number[]; onOpenLine?: (line: number) => void; shown?: number }) {
  if (lines.length === 0) return <span className="cc-text-meta text-cc-ink-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {lines.slice(0, shown).map((l) => (
        <CcAnchor
          key={l}
          tone="hot"
          label={`Source line ${l}${onOpenLine ? ', open the source' : ''}`}
          onOpen={onOpenLine ? () => onOpenLine(l) : undefined}
        >{`L${l}`}</CcAnchor>
      ))}
      {lines.length > shown ? <span className="cc-text-meta text-cc-ink-muted">+{lines.length - shown}</span> : null}
    </span>
  );
}

function WeightBar({ points, max, notDetermined = false }: { points: number; max: number; notDetermined?: boolean }) {
  return (
    <span aria-hidden={true} className="block h-2.5 w-full rounded-[2px] bg-cc-surface-muted">
      {points > 0 ? (
        <span
          data-chart-segment=""
          data-not-determined={notDetermined ? '' : undefined}
          className={cn('block h-2.5 rounded-[2px]', notDetermined ? NOT_DETERMINED_CHART.bg : 'bg-cc-chart-1')}
          style={{ width: `${Math.max(2, (points / max) * 100)}%`, ...(notDetermined ? NOT_DETERMINED_CHART.hatch : null) }}
        />
      ) : null}
    </span>
  );
}

/** The right half of the hero (H5, H6). */
export function ScoreDeductions({
  score,
  breakdown,
  model,
  edition,
  signedLabel,
  onOpenLine,
  questionsHref,
  rerunHref,
}: {
  score: number | null;
  breakdown: ScoreBreakdown | null;
  /** The table with its lines, built from `breakdown`; null without one. */
  model: ScoreHeroModel | null;
  edition: Edition | null;
  /** "Clean Core Score of the signed run", or the demo's words. */
  signedLabel: string;
  onOpenLine?: (line: number) => void;
  /** The project's open questions — where the places not assessed are settled. */
  questionsHref: string | null;
  /** Where a new run starts. */
  rerunHref: string | null;
}) {
  const [all, setAll] = useState(false);
  const addsUp = breakdown !== null && score !== null && model !== null && breakdown.score === score;
  const state = score === null ? 'none' : addsUp ? 'shown' : breakdown ? 'differs' : 'none';
  const otherEdition = edition === 'public' ? 'SAP Cloud ERP Private' : 'Public Edition';

  return (
    <div className="min-w-0" data-score-breakdown={state}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="m-0 cc-text-h2 text-cc-ink">What moves it</h3>
        {addsUp && model ? (
          <p className="m-0 ml-auto cc-text-meta font-medium text-cc-ink-muted" data-score-sum="">
            <span className="hidden sm:inline">
              100 − {model.deducted} for what the code does
              {model.notAssessed ? ` − ${model.notAssessed.points} for what could not be assessed` : ''}{' '}
              {/* Floored, the left side does not come to the score: it says what it comes to, then the floor. */}
              {model.floored ? `= ${signedFigure(100 - model.deducted - (model.notAssessed?.points ?? 0))}, raised to the floor of ${SCORE_FLOOR} ` : ''}
            </span>
            = <b className="font-bold text-cc-ink">{score}</b>
          </p>
        ) : null}
      </div>

      {score === null ? (
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
          This run computed no score, so none is shown — a missing figure is not filled in.
        </p>
      ) : !breakdown ? (
        <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">The source is not on this page, so the deductions cannot be listed.</p>
      ) : !addsUp || !model ? (
        <div className="mt-2 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2" data-score-mismatch="">
          <p className="m-0 cc-text-cell text-cc-ink">
            The findings on this page add up to {breakdown.score}, the signed run recorded {score}. The run was made with a
            different engine or source, so its deductions are not listed here — run the analysis again to see them.
          </p>
          {rerunHref ? (
            <p className="m-0 mt-1 cc-text-cell">
              <a href={rerunHref} className="font-semibold text-cc-ink underline underline-offset-2">
                Run the analysis again
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
            Every deduction of the score&rsquo;s table, the largest first.{onOpenLine ? ' A line chip opens the source at that line.' : ''}
          </p>
          <DeductionTable
            model={model}
            score={score}
            all={all}
            otherEdition={otherEdition}
            signedLabel={signedLabel}
            onOpenLine={onOpenLine}
          />
          <PhoneMore model={model} all={all} onToggle={() => setAll((v) => !v)} />
          <Largest model={model} questionsHref={questionsHref} />
        </>
      )}
    </div>
  );
}

/** On a phone: the two largest deductions and the places not assessed; the rest one tap away. */
const PHONE_ROWS = 2;

function DeductionTable({
  model,
  score,
  all,
  otherEdition,
  signedLabel,
  onOpenLine,
}: {
  model: ScoreHeroModel;
  score: number;
  all: boolean;
  otherEdition: string;
  signedLabel: string;
  onOpenLine?: (line: number) => void;
}) {
  const max = Math.max(1, ...model.deductions.map((d) => d.points), model.notAssessed?.points ?? 0);
  // Rows a phone shows only after "All N deductions"; a wider screen always shows them.
  const phoneHidden = all ? '' : 'max-sm:hidden';
  const ndLines = model.notAssessed ? model.notAssessed.gaps.map((g) => g.firstLine).filter((l) => l > 0) : [];
  // A list of rows on one grid, the columns of the mockup: what · where · weight · points.
  // The places column and the weight are a wide screen's; a phone puts the line chips under the words.
  return (
    <div className="mt-3" data-score-deductions={model.deductions.length}>
      <p className="sr-only">The deductions of the Clean Core Score: 100 minus every row below gives {score}.</p>
      <div aria-hidden={true} className={cn(ROW, 'border-b border-cc-line bg-cc-surface-muted py-1 cc-text-label text-cc-ink-muted')}>
        <span>What the code does</span>
        <span className="hidden sm:block">Where</span>
        <span className="hidden md:block">Weight</span>
        <span className="text-right">Points</span>
      </div>
      <ol className="m-0 list-none p-0">
        {model.deductions.map((d, i) => (
          <li key={d.kind} data-score-deduction={d.kind} className={cn(ROW, 'border-b border-cc-line py-2', i >= PHONE_ROWS && phoneHidden)}>
            <span className="min-w-0">
              <span className="block cc-text-identifier text-cc-ink">{d.label}</span>
              <span className="block cc-text-meta font-medium text-cc-ink-muted">{deductionDetail(d)}</span>
              <span className="mt-1 block sm:hidden">
                <LineChips lines={d.lines} onOpenLine={onOpenLine} />
              </span>
            </span>
            <span className="hidden sm:block">
              <LineChips lines={d.lines} onOpenLine={onOpenLine} />
            </span>
            <span className="hidden md:block">
              <WeightBar points={d.points} max={max} />
            </span>
            <Points value={-d.points} />
          </li>
        ))}
        {model.free ? (
          <li data-score-free-own-writes={model.free.count} className={cn(ROW, 'border-b border-cc-line py-2', phoneHidden)}>
            <span className="min-w-0">
              <span className="block cc-text-identifier text-cc-ink-muted">Writes to the program&rsquo;s own Z/Y tables</span>
              <span className="block cc-text-meta font-medium text-cc-ink-muted">
                {[plural(model.free.count, 'finding', 'findings'), model.free.objects.slice(0, 4).join(', ')].filter(Boolean).join(' · ')} ·
                free in SAP Cloud ERP Private{model.free.pointsWhereCharged > 0 ? `, −${model.free.pointsWhereCharged} in ${otherEdition}` : ''}
              </span>
              <span className="mt-1 block sm:hidden">
                <LineChips lines={model.free.lines} onOpenLine={onOpenLine} />
              </span>
            </span>
            <span className="hidden sm:block">
              <LineChips lines={model.free.lines} onOpenLine={onOpenLine} />
            </span>
            <span className="hidden md:block">
              <WeightBar points={0} max={max} />
            </span>
            <Points value={0} muted />
          </li>
        ) : null}
        {model.notAssessed ? (
          <li data-score-code-subtotal={model.codeScore} className={cn(ROW, 'border-b border-cc-line bg-cc-surface-muted py-2', phoneHidden)}>
            <span className="min-w-0 cc-text-identifier text-cc-ink sm:col-span-1 md:col-span-3">
              What the code does<span className="hidden sm:inline"> — 100 − {model.deducted}</span>
            </span>
            <span className="hidden sm:block md:hidden" />
            <Points value={model.codeScore} />
          </li>
        ) : null}
        {model.notAssessed ? (
          <li data-score-not-determined={model.notAssessed.kinds} className={cn(ROW, 'border-b border-cc-line py-2')}>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="cc-text-identifier text-cc-ink">Statements the engine could not assess</span>
                <CcProvenanceChip value="not-determined" />
              </span>
              <span className="block cc-text-meta font-medium text-cc-ink-muted">
                {plural(model.notAssessed.kinds, 'kind', 'kinds')}, {plural(model.notAssessed.places, 'place', 'places')}
                {model.notAssessed.gaps.length
                  ? `: ${model.notAssessed.gaps.map((g) => `${g.label.charAt(0).toLowerCase()}${g.label.slice(1)} (${g.count})`).join(', ')}`
                  : ''}{' '}
                · {UNASSESSED_POINTS_PER_KIND} points per kind. Not defects, and not cleared either.
              </span>
              <span className="mt-1 block sm:hidden">
                <LineChips lines={ndLines} onOpenLine={onOpenLine} shown={4} />
              </span>
            </span>
            <span className="hidden sm:block">
              <LineChips lines={ndLines} onOpenLine={onOpenLine} shown={4} />
            </span>
            <span className="hidden md:block">
              <WeightBar points={model.notAssessed.points} max={max} notDetermined />
            </span>
            <Points value={-model.notAssessed.points} />
          </li>
        ) : null}
        <li data-score-total={score} className={cn(ROW, 'border-t border-cc-ink py-2', phoneHidden)}>
          <span className="min-w-0 cc-text-identifier font-bold text-cc-ink sm:col-span-1 md:col-span-3">
            {signedLabel}
            {model.floored ? <span className="font-medium text-cc-ink-muted"> — the score never goes below {SCORE_FLOOR}</span> : null}
          </span>
          <span className="hidden sm:block md:hidden" />
          <Points value={score} />
        </li>
      </ol>
    </div>
  );
}

/** One grid for the header and every row: what · where (from S) · weight (from M) · points. */
const ROW =
  'grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 px-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_3.5rem] md:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_10rem_3.5rem]';

/** A figure with a typographic minus: "−20". */
const signedFigure = (value: number): string => (value < 0 ? `−${-value}` : String(value));

/** A row's points: "−23", "0", or a subtotal. Read out with its unit. */
function Points({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        'text-right font-cc-mono cc-text-identifier tabular-nums whitespace-nowrap',
        muted ? 'text-cc-ink-muted' : 'font-bold text-cc-ink',
      )}
    >
      {value < 0 ? `−${-value}` : value}
      <span className="sr-only"> points</span>
    </span>
  );
}

/** The phone's one step to the rest: "All 6 deductions · …". */
function PhoneMore({ model, all, onToggle }: { model: ScoreHeroModel; all: boolean; onToggle: () => void }) {
  const total = model.deductions.length + (model.free ? 1 : 0) + (model.notAssessed ? 1 : 0);
  const rest = [
    ...model.deductions.slice(PHONE_ROWS).map((d) => `${d.label} −${d.points}`),
    ...(model.free ? ["writes to the program's own Z/Y tables 0"] : []),
  ];
  if (rest.length === 0) return null;
  return (
    <p className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted sm:hidden" data-score-phone-more="">
      <button type="button" onClick={onToggle} aria-expanded={all} className="font-semibold text-cc-ink underline underline-offset-2">
        {all ? 'Fewer deductions' : `All ${total} deductions`}
      </button>
      {all ? null : ` · ${rest.join(', ')}`}
    </p>
  );
}

/**
 * H6 — the largest single deduction (owner decision Q2: kept), arithmetic read
 * off the table, and what settling the places not assessed can do.
 */
function Largest({ model, questionsHref }: { model: ScoreHeroModel; questionsHref: string | null }) {
  if (!model.largest) return null;
  const nd = model.notAssessed;
  const questions = questionsHref ? (
    <>
      {' '}(
      <a href={questionsHref} className="font-semibold text-cc-ink underline underline-offset-2">
        open questions
      </a>
      )
    </>
  ) : null;
  return (
    <p
      className="m-0 mt-3 rounded-r-cc-row border-l-[3px] border-cc-ink bg-cc-surface-muted px-3 py-2 cc-text-cell text-cc-ink"
      data-score-largest={model.largest.what === 'kind' ? model.largest.deduction.kind : 'not-assessed'}
    >
      {model.largest.what === 'kind' ? (
        <>
          <b className="font-bold">The largest single deduction:</b> {model.largest.deduction.label.toLowerCase()}
          {model.largest.deduction.objects.length > 0 && model.largest.deduction.objects.length <= 3
            ? ` (${model.largest.deduction.objects.join(', ')})`
            : ''}
          , {model.largest.deduction.points} points.
          {nd ? (
            <>
              {' '}Settling the {plural(nd.places, 'place', 'places')} that could not be assessed{questions} can move the score
              either way — the {nd.points} points come off, findings may come in.
            </>
          ) : null}
        </>
      ) : nd ? (
        <>
          <b className="font-bold">The largest single deduction:</b> the {plural(nd.places, 'place', 'places')} the engine could
          not assess, {nd.points} points. Settling them{questions} can move the score either way — the points come off,
          findings may come in.
        </>
      ) : null}
    </p>
  );
}

/** The "?" beside the hero's label: the dialog with every band's sentences. */
export function ScoreHelp({ onExplain }: { onExplain: () => void }) {
  return (
    <CcIconButton label="What the bands mean" title="What the bands mean" onClick={onExplain}>
      <HelpCircle size={16} aria-hidden="true" />
    </CcIconButton>
  );
}

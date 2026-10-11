'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { severityChartMark } from '@/lib/chart-colors';
import type { ScoreBreakdown } from '@/lib/clean-core-score';
import { scoreRuleFor } from '@/lib/score-rule';
import { editionName, otherEditionFigure, scoreHeroModel, type Edition, type HeroFinding, type HeroGap } from '@/lib/score-hero';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import { shortRoute } from './analysis-answer';
import { ScoreDeductions, ScoreFigure, ScoreHelp, type ScoreProvenance } from './CleanCoreScoreSection';

/**
 * The head of Analyze: the Clean Core Score as the hero (ADR-092, owner
 * approval 11.10.2026, mockup `docs/roadmap/analyze-score-hero-mockup.html`).
 *
 * It replaces what stood here — the answer sentence, three facet tiles, the
 * status line Evidence · Run · Target · Successors and the "Details" meta line
 * — and the separate score section below them. Top to bottom: the score with
 * its band, the edition rule and where it comes from (H1–H4) beside what moves
 * it (H5, H6); then one row of four facets (F1–F4) — findings by severity, the
 * clean core levels, the recommended route, what is not determined.
 *
 * The counts the answer sentence said are F1; "without a model" is H4; run,
 * engine and target are the score's provenance (H3, H4); "Successors n of m"
 * is a column of Findings by kind, per kind. Nothing here comes from a model,
 * and nothing is green: green means proven, and a score is a grade.
 */
export interface SeverityPart {
  key: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  count: number;
}

export interface LevelFacet {
  status: 'loading' | 'ready' | 'error';
  /** Findings per level; `Unknown` is a finding the lookup could not grade. */
  dist: Record<CloudReadinessGrade, number>;
  /** Findings that name no object, so there is nothing to look up. */
  noObject: number;
}

export default function AnalysisAnswer({
  score,
  breakdown,
  findings,
  notAssessed,
  edition,
  engineVersion,
  onExplainScore,
  provenance,
  severities,
  findingCount,
  levels,
  route,
  routeChosenByReader,
  decideHref,
  questionsHref,
  rerunHref,
  onOpenLine,
  signedLabel = 'Clean Core Score of the signed run',
  notice,
}: {
  /** The signed score, or null when the run computed none. */
  score: number | null;
  /** The deductions, recomputed from the findings on this page with the run's rule; null without a source. */
  breakdown: ScoreBreakdown | null;
  /** The engine's findings the breakdown was computed from — for the lines each deduction comes from. */
  findings: readonly HeroFinding[];
  /** The kinds of construct the engine did not assess, with their first line. */
  notAssessed: readonly HeroGap[];
  /** The project's target edition as the run recorded it. */
  edition: Edition | null;
  /** The engine the run was signed with — it decides the score rule. */
  engineVersion: string | null;
  onExplainScore: () => void;
  provenance: ScoreProvenance;
  severities: readonly SeverityPart[];
  /** Distinct findings — one per pattern and object. */
  findingCount: number;
  levels: LevelFacet;
  route: string | null | undefined;
  routeChosenByReader: boolean;
  decideHref: string | null;
  questionsHref: string | null;
  rerunHref: string | null;
  /** Opens the source at a line; without it the line chips are text. */
  onOpenLine?: (line: number) => void;
  signedLabel?: string;
  /** A notice about the run — the stale strip — at the top of the hero. */
  notice?: React.ReactNode;
}) {
  const rule = scoreRuleFor(edition ?? 'private', engineVersion);
  const model = useMemo(
    () => (breakdown ? scoreHeroModel(breakdown, findings, notAssessed, rule) : null),
    [breakdown, findings, notAssessed, rule],
  );
  const addsUp = breakdown !== null && score !== null && breakdown.score === score;
  const other = useMemo(
    () => (addsUp && breakdown ? otherEditionFigure(findings, breakdown.unassessedKinds, edition ?? 'private', engineVersion) : null),
    [addsUp, breakdown, findings, edition, engineVersion],
  );
  const places = findings.length;
  const ndPlaces = notAssessed.reduce((n, g) => n + (g.count > 0 ? g.count : 0), 0);

  return (
    <section
      data-analysis-answer=""
      data-analyze-score={score ?? 'none'}
      aria-labelledby="analysis-answer-title"
      className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
    >
      {notice ? <div className="px-4 pt-4 sm:px-6 [&_[data-stale-notice]]:mb-0">{notice}</div> : null}
      <div className="grid grid-cols-1 lg:grid-cols-[25rem_minmax(0,1fr)]">
        <div className="min-w-0 border-cc-line p-4 sm:px-6 sm:py-5 lg:border-r">
          <div className="flex items-center gap-2">
            <h2 id="analysis-answer-title" className="m-0 cc-text-label text-cc-ink-muted">
              Clean Core Score
            </h2>
            <span className="ml-auto">
              <ScoreHelp onExplain={onExplainScore} />
            </span>
          </div>
          {score !== null ? (
            <ScoreFigure
              score={score}
              edition={edition}
              freeWrites={addsUp && breakdown ? breakdown.freeOwnTableWrites : 0}
              other={other}
              provenance={provenance}
            />
          ) : (
            <div className="mt-2">
              <p className="m-0 cc-text-title text-cc-ink">Not yet computed</p>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">This run computed no score.</p>
            </div>
          )}
        </div>
        <div className="min-w-0 px-4 pb-4 sm:px-6 sm:pb-5 lg:pt-5">
          <ScoreDeductions
            score={score}
            breakdown={breakdown}
            model={model}
            edition={edition}
            signedLabel={signedLabel}
            onOpenLine={onOpenLine}
            questionsHref={questionsHref}
            rerunHref={rerunHref}
          />
        </div>
      </div>

      <dl className="m-0 grid grid-cols-2 border-t border-cc-line lg:grid-cols-4" data-analysis-facets="">
        <Facet label="Findings" pin="F1" index={0}>
          <dd className="m-0 mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="cc-text-figure text-cc-ink">{findingCount}</span>
            <span className="cc-text-meta font-medium text-cc-ink-muted">
              in {places} {places === 1 ? 'place' : 'places'}
            </span>
          </dd>
          <dd className="m-0 mt-2">
            <StackBar parts={severities} />
          </dd>
          <dd className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">
            <span className="hidden sm:inline">{severities.map((s) => `${s.key} ${s.count}`).join(' · ')}</span>
            <span className="sm:hidden">
              {severities
                .filter((s) => s.key === 'Critical' || s.key === 'High')
                .map((s) => `${s.key} ${s.count}`)
                .join(' · ')}
            </span>
          </dd>
        </Facet>

        <Facet label="Clean core levels" pin="F2" index={1}>
          <dd className="m-0 mt-1">
            <LevelChips levels={levels} />
          </dd>
          <dd className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">
            {levels.status === 'loading'
              ? 'Looking up the catalog …'
              : levels.status === 'error'
                ? 'The catalog lookup did not answer — no level is shown.'
                : `${graded(levels)} of ${graded(levels) + levels.dist.Unknown + levels.noObject} findings · from SAP's catalog${
                    edition ? `, read for ${editionName(edition)}` : ''
                  } · not signed`}
          </dd>
        </Facet>

        <Facet label="Recommended route" pin="F3" index={2}>
          <dd className="m-0 mt-1 cc-text-h2 text-cc-ink">{shortRoute(route) ?? 'Not determined'}</dd>
          <dd className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 cc-text-meta font-medium text-cc-ink-muted">
            {routeChosenByReader ? (
              <span>stored by an earlier build&rsquo;s switch; the rules recommended the other route</span>
            ) : route ? (
              <CcProvenanceChip value="reconstructed" note="fixed rules" />
            ) : null}
            {decideHref ? (
              <span>
                · decided in{' '}
                <a href={decideHref} className="font-semibold text-cc-ink underline underline-offset-2">
                  Management
                </a>
              </span>
            ) : null}
          </dd>
        </Facet>

        <Facet label="Not determined" pin="F4" index={3}>
          <dd className="m-0 mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="cc-text-figure text-cc-ink">{ndPlaces}</span>
            <span className="cc-text-meta font-medium text-cc-ink-muted">
              {ndPlaces === 1 ? 'place' : 'places'}
              {notAssessed.length ? `, ${notAssessed.length} ${notAssessed.length === 1 ? 'kind' : 'kinds'}` : ''}
            </span>
          </dd>
          <dd className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">
            {ndPlaces === 0 ? (
              'Every construct read was within the engine’s checks.'
            ) : questionsHref ? (
              <>
                <span className="hidden sm:inline">Open questions for the project: </span>
                <a href={questionsHref} className="font-semibold text-cc-ink underline underline-offset-2">
                  see the list
                </a>
                <span className="hidden sm:inline"> — includes, call targets, ATC results</span>
              </>
            ) : (
              'Not defects, and not cleared either.'
            )}
          </dd>
        </Facet>
      </dl>
    </section>
  );
}

const graded = (levels: LevelFacet) => levels.dist.A + levels.dist.B + levels.dist.C + levels.dist.D;

/** Four facets: two by two on a phone, one row from L — the rules between them follow the grid. */
function Facet({ label, pin, index, children }: { label: string; pin: string; index: number; children: React.ReactNode }) {
  return (
    <div
      data-analysis-facet={label}
      data-hero-pin={pin}
      className={cn(
        'min-w-0 border-cc-line px-4 py-3 sm:px-6',
        index < 2 && 'border-b lg:border-b-0',
        index % 2 === 0 && 'border-r',
        index === 1 && 'lg:border-r',
      )}
    >
      <dt className="cc-text-label text-cc-ink-muted">{label}</dt>
      {children}
    </div>
  );
}

/** Findings per severity as one stacked bar — the figures are in its name. */
function StackBar({ parts }: { parts: readonly SeverityPart[] }) {
  const total = parts.reduce((n, p) => n + p.count, 0);
  return (
    <div
      role="img"
      data-severity-bar=""
      aria-label={`By severity: ${parts.map((p) => `${p.count} ${p.key.toLowerCase()}`).join(', ')}.`}
      className="flex h-2 w-full gap-0.5 overflow-hidden rounded-cc-row bg-cc-surface-muted"
    >
      {total > 0
        ? parts
            .filter((p) => p.count > 0)
            .map((p) => (
              <span
                key={p.key}
                data-chart-segment=""
                className={cn('h-full', severityChartMark(p.key, 'bg'))}
                style={{ flex: `${p.count} 0 0` }}
              />
            ))
        : null}
    </div>
  );
}

/** Every level letter with its count, and the findings without a level: `A 0 · B 2 · C 19 · D 2 · Unknown 4`. */
function LevelChips({ levels }: { levels: LevelFacet }) {
  if (levels.status !== 'ready') {
    return <span className="cc-text-meta text-cc-ink-muted">—</span>;
  }
  const unknown = levels.dist.Unknown + levels.noObject;
  return (
    <span
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      data-level-bar=""
      aria-label={`Findings by clean core level — ${(['A', 'B', 'C', 'D'] as const).map((g) => `level ${g}: ${levels.dist[g]}`).join(', ')}, no level: ${unknown}.`}
      role="img"
    >
      {(['A', 'B', 'C', 'D'] as const).map((g) => (
        <span
          key={g}
          data-level-block={g}
          className={cn('inline-flex items-center gap-1 cc-text-meta', levels.dist[g] === 0 ? 'text-cc-ink-muted' : 'text-cc-ink', levels.dist[g] === 0 && 'max-sm:hidden')}
        >
          <CcCleanCoreLevel value={g} />
          {levels.dist[g]}
        </span>
      ))}
      <span
        data-not-determined=""
        className="inline-flex items-center rounded-[4px] border border-dashed border-cc-field-border px-2 cc-text-meta text-cc-ink-muted"
      >
        Unknown {unknown}
      </span>
    </span>
  );
}

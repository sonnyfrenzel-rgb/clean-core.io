'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcIconButton from '@/components/cc/IconButton';
import StageMetaDetails from '@/components/StageMetaDetails';
import { severityChartMark, levelChartColor, NOT_DETERMINED_CHART } from '@/lib/chart-colors';
import { scoreBand } from '@/lib/clean-core-score';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import type { AnalysisAnswerText, FindingCounts } from './analysis-answer';
import { ScoreScale } from './CleanCoreScoreSection';

/**
 * The head of the Analyze object page (proposal A, owner decision 01.10.2026):
 * the answer in one sentence (ADR-029, §2.11), then four facet tiles —
 * findings, the Clean Core Score, the clean core levels, what was not assessed
 * — each with its figure, its words and a micro chart, then the status line.
 *
 * The Clean Core Score is shown as what it is — a grade from 5 to 100, "a
 * grade, not a compliance percentage" (DESIGN.md §6.1, glossary B) — never as
 * a percentage or a ring that fills up to one; its tile carries the band the
 * score falls in, explained in full in the score section below. Nothing here
 * comes from a model.
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

export interface MetaFacts {
  fileName?: string | null;
  lines?: number | null;
  catalog?: string | null;
  engine?: string | null;
}

export interface StatusEntry {
  key: string;
  label: string;
  value: string;
  /** The dot's colour class. */
  dot: string;
}

export default function AnalysisAnswer({
  answer,
  counts,
  score,
  routeChosenByReader,
  onExplainScore,
  severities,
  levels,
  meta,
  status,
}: {
  answer: AnalysisAnswerText;
  counts: FindingCounts;
  /** The signed score, or null when the run computed none. */
  score: number | null;
  routeChosenByReader: boolean;
  onExplainScore: () => void;
  severities: readonly SeverityPart[];
  levels: LevelFacet;
  meta: MetaFacts;
  status: readonly StatusEntry[];
}) {
  const critical = counts.bySeverity.Critical;
  const high = counts.bySeverity.High;
  const serious = [critical ? `${critical} critical` : null, high ? `${high} high` : null].filter(Boolean);
  const metaParts = [
    meta.fileName ? <b key="f" className="font-semibold text-cc-ink">{meta.fileName}</b> : null,
    typeof meta.lines === 'number' && meta.lines > 0 ? `${meta.lines.toLocaleString('en-US')} lines` : null,
    meta.catalog ? `catalog ${meta.catalog}` : null,
    meta.engine ? `engine ${meta.engine}` : null,
  ].filter(Boolean);
  const band = score !== null ? scoreBand(score) : null;

  return (
    <section data-analysis-answer="" aria-labelledby="analysis-answer-title" className="min-w-0">
      {/* Behind "Details" until asked for (owner 02.10.2026, DESIGN.md §2.11). */}
      {metaParts.length ? (
        <StageMetaDetails>
          <p className="m-0 font-cc-mono cc-text-meta font-medium text-cc-ink-muted break-words" data-analysis-meta="">
            {metaParts.map((p, i) => (
              <React.Fragment key={i}>
                {i > 0 ? ' · ' : null}
                {p}
              </React.Fragment>
            ))}
          </p>
        </StageMetaDetails>
      ) : null}
      <h2 id="analysis-answer-title" className="m-0 mt-3 cc-text-h2 text-cc-ink text-balance">
        {answer.headline}
      </h2>
      <p className="m-0 mt-1 max-w-4xl cc-text-cell text-cc-ink-muted">{answer.detail}</p>

      {/* Three facets. The fourth, "Not assessed", said again what the side
          card "Not determined" lists, with a second count of a different thing
          (ADR-081): the side card is the one list on this stage, and the
          project's open questions are one line under it. */}
      <dl className="m-0 mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        <Facet label="Findings">
          <dd className="m-0 mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="cc-text-figure text-cc-ink">{counts.total}</span>
            <span className="cc-text-cell text-cc-ink-muted">{serious.length ? serious.join(' · ') : 'none critical or high'}</span>
          </dd>
          <dd className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
            {meta.lines ? `in all ${meta.lines.toLocaleString('en-US')} lines, by fixed rules` : 'by fixed rules'}
          </dd>
          <dd className="m-0 mt-3">
            <StackBar parts={severities} />
          </dd>
        </Facet>

        <Facet
          label="Clean Core Score"
          emphasis
          help={
            <CcIconButton label="What the Clean Core Score is" title="What the Clean Core Score is" onClick={onExplainScore}>
              <HelpCircle size={16} aria-hidden="true" />
            </CcIconButton>
          }
        >
          <dd className="m-0 mt-2 flex flex-wrap items-baseline gap-x-1">
            {score !== null ? (
              // One inline run, so the figure reads "28 of 100" as text too —
              // two flex items would put a line break between them.
              <span>
                <span className="cc-text-figure text-cc-ink">{score}</span>
                <span className="cc-text-cell text-cc-ink-muted"> of 100</span>
              </span>
            ) : (
              <span className="cc-text-h3 text-cc-ink">Not yet computed</span>
            )}
          </dd>
          <dd className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
            {score !== null ? 'A grade, not a compliance percentage' : 'This run computed no score'}
          </dd>
          {score !== null && band ? (
            <dd className="m-0 mt-3">
              <ScoreScale score={score} compact />
              <a
                href="#analyze-score"
                className="mt-2 inline-block cc-text-meta text-cc-ink underline underline-offset-2"
              >
                {band.from}–{band.to} · {band.label}
              </a>
            </dd>
          ) : null}
        </Facet>

        <Facet label="Level distribution">
          <dd className="m-0 mt-2">
            <LevelBar levels={levels} />
          </dd>
          <dd className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
            {levels.status === 'loading'
              ? 'Looking up the catalog …'
              : levels.status === 'error'
                ? 'The catalog lookup did not answer — no level is shown.'
                : `per finding, from the SAP catalog${levels.noObject ? ` · ${levels.noObject} name no object` : ''} · not signed`}
          </dd>
        </Facet>

      </dl>

      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 cc-text-meta" data-analysis-status="">
        {status.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span aria-hidden={true} className={cn('h-2 w-2 rounded-full', s.dot)} />
            <span className="cc-text-label text-cc-ink-muted">{s.label}</span>
            <span className="text-cc-ink">{s.value}</span>
          </li>
        ))}
        {routeChosenByReader ? (
          <li className="cc-text-meta text-cc-ink-muted">The route is your choice, not the rules’ recommendation.</li>
        ) : null}
      </ul>
    </section>
  );
}

function Facet({
  label,
  help,
  emphasis = false,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-analysis-facet={label}
      className={cn(
        'min-w-0 rounded-cc-card border bg-cc-surface px-3 py-3 sm:px-4',
        emphasis ? 'border-cc-ink shadow-[inset_0_0_0_1px_var(--cc-ink)]' : 'border-cc-line',
      )}
    >
      <dt className="flex min-h-6 items-center justify-between gap-1 cc-text-label text-cc-ink-muted">
        <span>{label}</span>
        {help}
      </dt>
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

/**
 * The text on a level's block. The blocks are filled with the level's chart
 * colour at full strength, so the letter is white on A, B and D (6.5–7.6 : 1)
 * and ink on C, whose warning mark holds white at only 3.2 : 1 but ink at
 * 5.4 : 1 (DESIGN.md §1.1, warning marks).
 */
const LEVEL_TEXT: Record<'B' | 'A' | 'C' | 'D', string> = {
  A: 'text-cc-on-dark',
  B: 'text-cc-on-dark',
  C: 'text-cc-ink',
  D: 'text-cc-on-dark',
};

/** Findings per clean core level as labelled blocks: `B 6 · C 19 · D 2 · ? 4`. */
function LevelBar({ levels }: { levels: LevelFacet }) {
  if (levels.status !== 'ready') {
    return <div data-chart-segment="" data-not-determined="" className={cn('h-7 w-full rounded-cc-row', NOT_DETERMINED_CHART.bg)} style={NOT_DETERMINED_CHART.hatch} />;
  }
  const grades = (['A', 'B', 'C', 'D'] as const).filter((g) => levels.dist[g] > 0);
  const unknown = levels.dist.Unknown + levels.noObject;
  const label = [...grades.map((g) => `level ${g}: ${levels.dist[g]}`), unknown ? `no level: ${unknown}` : null].filter(Boolean).join(', ');
  if (grades.length === 0 && unknown === 0) return <span className="cc-text-cell text-cc-ink-muted">No finding to grade</span>;
  return (
    <div role="img" aria-label={`Findings by clean core level — ${label}.`} className="flex h-7 w-full gap-px overflow-hidden rounded-cc-row" data-level-bar="">
      {grades.map((g) => (
        <span
          key={g}
          data-chart-segment=""
          data-level-block={g}
          className={cn('grid min-w-9 place-items-center rounded-cc-row cc-text-meta font-semibold', levelChartColor(g).bg, LEVEL_TEXT[g])}
          style={{ flex: `${levels.dist[g]} 0 0` }}
        >
          {g} {levels.dist[g]}
        </span>
      ))}
      {unknown ? (
        <span
          data-chart-segment=""
          data-not-determined=""
          className={cn('grid min-w-9 place-items-center rounded-cc-row cc-text-meta text-cc-ink-muted', NOT_DETERMINED_CHART.bg)}
          style={{ flex: `${unknown} 0 0` }}
        >
          ? {unknown}
        </span>
      ) : null}
    </div>
  );
}

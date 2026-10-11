/**
 * The figures of the Analyze hero (ADR-092, owner approval 11.10.2026, mockup
 * `docs/roadmap/analyze-score-hero-mockup.html`) — the deduction table in a
 * reader's words, the lines each deduction comes from, and the other edition's
 * figure.
 *
 * Nothing here is a rule of its own. Every number is read off
 * `scoreBreakdown()` (`lib/clean-core-score.ts`), the function the router
 * scores with, under the rule of the signed run (`lib/score-rule.ts`); this
 * module only adds *where*: which findings a deduction counted and on which
 * lines they stand. The screen shows the table only beside a score it adds up
 * to — that check is the caller's (`breakdown.score === signed`).
 *
 * Pure: no React, no catalog, no I/O.
 */

import {
  SCORE_DEDUCTIONS,
  SCORE_FLOOR,
  deductionFor,
  isFreeUnder,
  scoreBreakdown,
  type ScoreBreakdown,
  type ScoredFinding,
} from './clean-core-score';
import { scoreRuleFor, type ScoreRule } from './score-rule';

/** A finding as the hero needs it: what the score counts, and the line it stands on. */
export interface HeroFinding extends ScoredFinding {
  lineStart: number;
}

/** A kind of construct not assessed: its words, how often, and where it first stands. */
export interface HeroGap {
  label: string;
  count: number;
  firstLine: number;
}

/** One deduction of the score's table, with the findings it counted. */
export interface HeroDeduction {
  kind: string;
  label: string;
  /** Findings of this kind the score counted. */
  count: number;
  points: number;
  /** Objects those findings name, distinct, in the order first found. */
  objects: string[];
  /** Lines they stand on, distinct, ascending. */
  lines: number[];
  /** The table's three numbers for this kind. */
  first: number;
  additional: number;
  cap: number;
  /** The kind's cap held the deduction down. */
  capped: boolean;
}

/** Writes to the program's own Z/Y tables that cost nothing under the run's rule. */
export interface HeroFreeWrites {
  count: number;
  objects: string[];
  lines: number[];
  /** What the same writes cost where they are charged — the other edition's rule. */
  pointsWhereCharged: number;
}

export interface HeroNotAssessed {
  kinds: number;
  /** Statements of those kinds, summed over the kinds. */
  places: number;
  points: number;
  gaps: HeroGap[];
}

export interface ScoreHeroModel {
  /** Deductions for what the code does, the largest first — the breakdown's order. */
  deductions: HeroDeduction[];
  free: HeroFreeWrites | null;
  notAssessed: HeroNotAssessed | null;
  /** Points taken for what the code does — the sum of `deductions`. */
  deducted: number;
  /** 100 − `deducted`, never below the floor: the score before the coverage step. */
  codeScore: number;
  score: number;
  floored: boolean;
  /** The largest single deduction — a kind, or the constructs not assessed. */
  largest: { what: 'kind'; deduction: HeroDeduction } | { what: 'not-assessed'; points: number } | null;
}

const distinct = <T,>(xs: readonly T[]): T[] => xs.filter((x, i) => xs.indexOf(x) === i);

/** The findings a rule of the table counted — the same selection `countFor` makes. */
function countedBy(kind: string, findings: readonly HeroFinding[], rule: ScoreRule): HeroFinding[] {
  if (kind === 'enhancement') return findings.filter((f) => f.kind === 'enhancement' && f.objectType !== 'BAdI');
  return findings.filter((f) => f.kind === kind && !isFreeUnder(rule, f));
}

function where(findings: readonly HeroFinding[]): { objects: string[]; lines: number[] } {
  return {
    objects: distinct(findings.map((f) => f.objectName?.trim().toUpperCase() ?? '').filter(Boolean)),
    lines: distinct(findings.map((f) => f.lineStart).filter((l) => Number.isFinite(l) && l > 0)).sort((a, b) => a - b),
  };
}

/**
 * The hero's table, from the breakdown the page already computed with the
 * signed run's rule. `gaps` are the coverage report's gaps the breakdown
 * counted (`unassessedKinds` of them).
 */
export function scoreHeroModel(
  breakdown: ScoreBreakdown,
  findings: readonly HeroFinding[],
  gaps: readonly HeroGap[],
  rule: ScoreRule,
): ScoreHeroModel {
  const deductions: HeroDeduction[] = breakdown.lines.map((line) => {
    const table = SCORE_DEDUCTIONS.find((r) => r.kind === line.kind)!;
    const counted = countedBy(line.kind, findings, rule);
    const { objects, lines } = where(counted);
    return {
      kind: line.kind,
      label: line.label,
      count: line.count,
      points: line.points,
      objects,
      lines,
      first: table.first,
      additional: table.additional,
      cap: table.cap,
      capped: table.first + (line.count - 1) * table.additional > table.cap,
    };
  });

  let free: HeroFreeWrites | null = null;
  if (breakdown.freeOwnTableWrites > 0) {
    const freeFindings = findings.filter((f) => isFreeUnder(rule, f));
    const customRule = SCORE_DEDUCTIONS.find((r) => r.kind === 'custom-table-write')!;
    const charged = countedBy('custom-table-write', findings, rule).length;
    free = {
      count: freeFindings.length,
      ...where(freeFindings),
      pointsWhereCharged: deductionFor(customRule, charged + freeFindings.length) - deductionFor(customRule, charged),
    };
  }

  const notAssessed: HeroNotAssessed | null =
    breakdown.unassessedKinds > 0
      ? {
          kinds: breakdown.unassessedKinds,
          places: gaps.reduce((n, g) => n + (g.count > 0 ? g.count : 0), 0),
          points: breakdown.unassessedPoints,
          gaps: [...gaps],
        }
      : null;

  const deducted = deductions.reduce((n, d) => n + d.points, 0);
  const top = deductions[0] ?? null;
  const largest: ScoreHeroModel['largest'] =
    notAssessed && (!top || notAssessed.points > top.points)
      ? { what: 'not-assessed', points: notAssessed.points }
      : top
        ? { what: 'kind', deduction: top }
        : null;

  return {
    deductions,
    free,
    notAssessed,
    deducted,
    codeScore: Math.max(SCORE_FLOOR, 100 - deducted),
    score: breakdown.score,
    floored: breakdown.floored,
    largest,
  };
}

export type Edition = 'public' | 'private';

/** The other edition's figure for the same findings (owner decision Q1, 11.10.2026). */
export interface OtherEditionFigure {
  edition: Edition;
  score: number;
  /** The other edition is scored by the same rule for this run — an engine before 3.0.9. */
  sameRule: boolean;
}

/**
 * The score the same findings give under the other edition's rule, for the
 * engine the run was signed with. Computed, never signed: the screen says
 * which of the two figures is the signed one.
 */
export function otherEditionFigure(
  findings: readonly ScoredFinding[],
  unassessedKinds: number,
  edition: Edition,
  engineVersion: string | null | undefined,
): OtherEditionFigure {
  const other: Edition = edition === 'private' ? 'public' : 'private';
  const own = scoreRuleFor(edition, engineVersion);
  const theirs = scoreRuleFor(other, engineVersion);
  return { edition: other, score: scoreBreakdown(findings, unassessedKinds, theirs).score, sameRule: own === theirs };
}

/** "Private Edition", "Public Edition". */
export function editionName(edition: Edition): string {
  return edition === 'public' ? 'Public Edition' : 'Private Edition';
}

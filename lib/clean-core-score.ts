/**
 * The Clean Core Score — its rules in one place, and what a value means.
 *
 * The score is computed by the deterministic router (`lib/abap/extensibility-
 * router.ts`) from the evidence findings before any model runs, and signed into
 * the run. Its definition is a deduction table: start at 100, take points off
 * per *kind* of construct found (the first occurrence costs more, each further
 * one less, every kind capped), floor at 5, and take five more per kind of
 * construct the engine could not assess (at most 30). The table lives here so
 * that the router and the screen that explains the score read the same numbers
 * — a second copy on the screen would be a second score.
 *
 * **The bands are Clean-Core.io's official reading of a score** (owner
 * decision 01.10.2026) — the one definition of a good or a bad score, used on
 * Analyze, on the Clean Core Score page, in the exports and wherever else a
 * score is shown with a meaning. Nothing else in the product may name a band or
 * a threshold of its own (`tests/score-bands-guard.spec.ts`). They are not an
 * SAP measure — SAP publishes no Clean Core Score at all. They are read off the
 * deduction table itself, and every sentence they carry is something the table
 * guarantees for a score in that band:
 *
 *   - 91–100: each of the heavy kinds (modification, enhancement, direct write
 *     to an SAP standard table, write to a custom table, batch input, native
 *     SQL) costs at least 10 points on its first occurrence, so none of them
 *     can be in what was read.
 *   - 81–90: a modification of SAP code costs 30 and a direct write to an SAP
 *     standard table 20 on their own, so neither can be in what was read.
 *   - 60–80: 20 to 40 points were deducted — what one direct write to an SAP
 *     standard table (20) or one modification (30) costs on its own, or several
 *     lighter kinds together.
 *   - 5–59: more than 40 points were deducted, more than any single kind can
 *     cost (the largest cap is 40), so several kinds — or constructs the engine
 *     could not assess — pull it down. 5 is the floor.
 *
 * A higher score is better. It is a grade for one piece of code, not a
 * compliance percentage, and not an SAP figure.
 *
 * Pure: no React, no catalog, no I/O.
 */

/** The kinds of finding that cost points, with the table's three numbers. */
export interface ScoreDeductionRule {
  /** The evidence kind, or the special `enhancement-non-badi`. */
  kind: string;
  /** Points the first finding of this kind costs. */
  first: number;
  /** Points every further finding of this kind costs. */
  additional: number;
  /** The most this kind can cost in total. */
  cap: number;
  /** What it is, in a reader's words — the plural. */
  label: string;
}

/**
 * The deduction table, in the order the router applies it. `enhancement` counts
 * only enhancement implementations and points — a BAdI is the level-B case and
 * costs nothing (see the router).
 */
export const SCORE_DEDUCTIONS: readonly ScoreDeductionRule[] = Object.freeze([
  { kind: 'modification', first: 30, additional: 5, cap: 40, label: 'Modifications of SAP code' },
  { kind: 'enhancement', first: 12, additional: 3, cap: 20, label: 'Enhancement implementations' },
  { kind: 'standard-table-write', first: 20, additional: 3, cap: 25, label: 'Direct writes to SAP standard tables' },
  { kind: 'custom-table-write', first: 12, additional: 2, cap: 18, label: 'Writes to custom tables' },
  { kind: 'bdc', first: 10, additional: 3, cap: 15, label: 'Batch input to transactions' },
  { kind: 'native-sql', first: 10, additional: 3, cap: 15, label: 'Native SQL statements' },
  { kind: 'rfc-call', first: 8, additional: 2, cap: 12, label: 'Remote function calls' },
  { kind: 'update-task', first: 5, additional: 2, cap: 10, label: 'Update tasks' },
  { kind: 'gui-download', first: 5, additional: 2, cap: 10, label: 'File transfers through the SAP GUI' },
  { kind: 'dynpro', first: 5, additional: 1, cap: 8, label: 'Classic screens (Dynpro)' },
  { kind: 'standard-table-read', first: 2, additional: 1, cap: 5, label: 'Direct reads of SAP standard tables' },
]);

/** The lowest score the table gives, whatever was found. */
export const SCORE_FLOOR = 5;
/** Points per kind of construct the engine did not assess, and their cap. */
export const UNASSESSED_POINTS_PER_KIND = 5;
export const UNASSESSED_POINTS_CAP = 30;

/** What one kind costs for `count` findings of it. */
export function deductionFor(rule: ScoreDeductionRule, count: number): number {
  return count <= 0 ? 0 : Math.min(rule.cap, rule.first + (count - 1) * rule.additional);
}

/** The minimum a finding needs to be counted: its kind and, for an enhancement, its object type. */
export interface ScoredFinding {
  kind: string;
  objectType?: string;
}

/** How many findings of a rule's kind count against the score. */
export function countFor(rule: ScoreDeductionRule, findings: readonly ScoredFinding[]): number {
  if (rule.kind === 'enhancement') return findings.filter((f) => f.kind === 'enhancement' && f.objectType !== 'BAdI').length;
  return findings.filter((f) => f.kind === rule.kind).length;
}

export interface ScoreBreakdownLine {
  kind: string;
  label: string;
  count: number;
  points: number;
}

export interface ScoreBreakdown {
  /** One line per kind that cost points, the most expensive first. */
  lines: ScoreBreakdownLine[];
  /** Kinds of construct the engine did not assess, and the points they cost. */
  unassessedKinds: number;
  unassessedPoints: number;
  /** The floor of 5 lifted the result. */
  floored: boolean;
  /** The score this breakdown arrives at — the router's formula, step by step. */
  score: number;
}

/**
 * The score, as the router computes it, with every deduction named. The router
 * calls `scoreFromFindings` below, so this and the signed score cannot differ
 * for the same findings and coverage.
 */
export function scoreBreakdown(findings: readonly ScoredFinding[], unassessedKinds = 0): ScoreBreakdown {
  const lines: ScoreBreakdownLine[] = [];
  let deducted = 0;
  for (const rule of SCORE_DEDUCTIONS) {
    const count = countFor(rule, findings);
    const points = deductionFor(rule, count);
    deducted += points;
    if (points > 0) lines.push({ kind: rule.kind, label: rule.label, count, points });
  }
  const raw = 100 - deducted;
  const base = Math.max(SCORE_FLOOR, raw);
  const kinds = Math.max(0, unassessedKinds);
  const unassessedPoints = kinds > 0 ? Math.min(UNASSESSED_POINTS_CAP, kinds * UNASSESSED_POINTS_PER_KIND) : 0;
  const score = kinds > 0 ? Math.max(SCORE_FLOOR, base - unassessedPoints) : base;
  return {
    lines: lines.sort((a, b) => b.points - a.points),
    unassessedKinds: kinds,
    unassessedPoints,
    floored: raw < SCORE_FLOOR || (kinds > 0 && base - unassessedPoints < SCORE_FLOOR),
    score,
  };
}

/** The score before the coverage step — what the router calls `score`. */
export function scoreFromFindings(findings: readonly ScoredFinding[]): number {
  return scoreBreakdown(findings, 0).score;
}

/** The coverage step — what the router applies when the reading was incomplete. */
export function scoreWithUnassessed(score: number, unassessedKinds: number): number {
  return Math.max(SCORE_FLOOR, score - Math.min(UNASSESSED_POINTS_CAP, Math.max(0, unassessedKinds) * UNASSESSED_POINTS_PER_KIND));
}

/* ------------------------------------------------------------------ bands */

export type ScoreBandKey = 'far' | 'heavy' | 'some' | 'light';

export interface ScoreBand {
  key: ScoreBandKey;
  /** Inclusive. */
  from: number;
  to: number;
  /** A short name, in a reader's words. */
  label: string;
  /** What a score in this band means, in one sentence. */
  meaning: string;
  /** Why the sentence holds — read off the deduction table. */
  because: string;
}

/**
 * Clean-Core.io's bands, derived from the deductions — see the header. Lowest
 * first, so a scale draws them left to right.
 */
export const SCORE_BANDS: readonly ScoreBand[] = Object.freeze([
  {
    key: 'far',
    from: SCORE_FLOOR,
    to: 59,
    label: 'Far from clean core',
    meaning: 'Several kinds of construct, or parts the engine could not assess, stand in the way of the clean core rules.',
    because: 'More than 40 points were taken off — more than any single kind of construct can cost.',
  },
  {
    key: 'heavy',
    from: 60,
    to: 80,
    label: 'Significant rework',
    meaning: 'One construct of real weight, or several lighter ones together, has to be replaced or moved.',
    because: 'A direct write to an SAP standard table costs 20 points on its own, a modification of SAP code 30.',
  },
  {
    key: 'some',
    from: 81,
    to: 90,
    label: 'Some rework',
    meaning: 'No modification of SAP code and no direct write to an SAP standard table — other constructs need work.',
    because: 'Either of those two alone would have taken the score to 80 or below.',
  },
  {
    key: 'light',
    from: 91,
    to: 100,
    label: 'Close to clean core',
    meaning: 'Nothing heavy in what was read — at most lighter constructs such as reads of SAP tables, classic screens or remote calls.',
    because: 'Every heavy kind of construct costs at least 10 points on its first occurrence.',
  },
]);

export function scoreBand(score: number): ScoreBand {
  return SCORE_BANDS.find((b) => score >= b.from && score <= b.to) ?? (score > 100 ? SCORE_BANDS[3] : SCORE_BANDS[0]);
}

/* ------------------------------------------------------------ the words */

/** Where the bands come from, as every surface that shows them says it. */
export const SCORE_BANDS_SOURCE = "Clean-Core.io's bands, derived from the deductions";

/** What the score is and is not, in one line — the same everywhere. */
export const SCORE_NATURE = 'A grade, not a compliance percentage — and not an SAP measure';

/** "91–100" */
export function bandRange(band: ScoreBand): string {
  return `${band.from}–${band.to}`;
}

/** "28 of 100 · far from clean core (5–59)" — a score with its band, for a line of text. */
export function scoreWithBand(score: number): string {
  const band = scoreBand(score);
  return `${score} of 100 · ${band.label.toLowerCase()} (${bandRange(band)})`;
}

/** The four bands in one line, highest first — for an export, a prompt or llms.txt. */
export function scoreBandsLine(): string {
  return [...SCORE_BANDS]
    .reverse()
    .map((b) => `${bandRange(b)} ${b.label.toLowerCase()}`)
    .join(' · ');
}

/** The rule in prose, highest first, each band with its meaning — for a text that explains the score. */
export function scoreBandsProse(): string {
  return [...SCORE_BANDS]
    .reverse()
    .map((b) => `${bandRange(b)}, ${b.label.toLowerCase()}: ${b.meaning}`)
    .join(' ');
}

/** The deduction table in prose — for a text that explains how the score is computed. */
export function scoreDeductionsProse(): string {
  const kinds = SCORE_DEDUCTIONS.map((r) => `${r.label.toLowerCase()} ${r.first} (at most ${r.cap})`).join(', ');
  return (
    `The score starts at 100 and takes points off per kind of construct found — the first finding of a kind costs most, each further one less, every kind is capped: ${kinds}. ` +
    `It never goes below ${SCORE_FLOOR}, and each kind of construct the engine could not assess takes ${UNASSESSED_POINTS_PER_KIND} more (at most ${UNASSESSED_POINTS_CAP}).`
  );
}

/** The four bands as a Markdown list, highest first — for llms.txt and other plain-text explanations. */
export function scoreBandsBullets(): string {
  return [...SCORE_BANDS]
    .reverse()
    .map((b) => `- ${bandRange(b)}, ${b.label.toLowerCase()}: ${b.meaning}`)
    .join('\n');
}

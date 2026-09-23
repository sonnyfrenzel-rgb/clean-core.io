import type { ProvenanceValue } from './provenance';
import type { NotDetermined } from './workspace-model';
import type { Project } from './types';
import { inputLabel } from './input-manifest';
import {
  handoverBlockers,
  staleness,
  workflowSteps,
  type RailStep,
} from './workflow-steps';

/**
 * The Management view's answers — roadmap step 6.4.
 *
 * *„Management-Sicht auf dasselbe Projekt: was bestätigt ist, was fehlt, was
 * eine Entscheidung binden würde; Clean Core Score mit Regelversion und Verlauf
 * — ein Verlauf vergleicht nur Runs derselben Regelversion — kein Portfolio."*
 *
 * Three things decide the shape of this module and none of them is cosmetic.
 *
 * **1. This is one project, and it says so by construction.** Every function
 * here takes one `Project` and the runs of that one project. There is no list
 * of projects, no average across projects, no rank — *kein Portfolio* is not a
 * rule this module obeys, it is a shape it cannot leave.
 *
 * **2. „Bestätigt" is `proven`, not „done".** `lib/workflow-steps.ts` already
 * separates the two and explains why: `done` says a phase's own output is on
 * record, `proven` says something other than the account checked it — a
 * server-written signed run, an executed test receipt. A design the signed-in
 * account signed off is `done` and deliberately **not** `proven`, because
 * `lib/provenance.ts` calls that value *Confirmed* and spells out what it is
 * worth: *"a self-declaration, not a mandate"*. A management view that counted
 * "erledigt" as "bestätigt" would produce exactly the figure somebody quotes in
 * a board paper — so the two are counted separately here, they are never added
 * up, and the self-declared one carries the word "claim" in its own sentence.
 *
 * **3. Every figure carries its coverage, from the first line of code.** Step
 * 3.0.10 draws this view and requires *„jede Zahl nennt ihre Abdeckung"* and
 * *„nicht bestimmt als eigene, sichtbare Fläche"*. A figure that is computed
 * without its denominator cannot honestly be given one later: nobody will know
 * what was counted and what was skipped. So `Coverage` is not optional on
 * `ManagementFigure`, the sentence is built here rather than in JSX, and what
 * is excluded is **named** rather than folded into a remainder.
 *
 * **What this module is not.** It does not answer "what is the next open
 * point" — `lib/next-step.ts` does that, rule-based and with its reason, and
 * the card built on it is the page's one primary action. This view answers a
 * different question (*„What do I risk, what do I decide?"*,
 * `lib/workspace-model.ts`): what a decision would be bound to, and what stands
 * in its way. Where the two would overlap, this module states the *state* and
 * leaves the instruction to the other one.
 *
 * **Pure.** No React, no Firestore, no `fetch`, no model call: the component
 * hands in the run documents it read, so a spec can drive every state of this
 * view — a project with no runs, one run, five runs across two rule versions —
 * without a browser and without seeding any of them.
 */

/* ------------------------------------------------------------------ coverage */

/** One thing a figure did **not** count, named rather than folded away. */
export interface CoverageExclusion {
  count: number;
  /** Why it is not in the figure, in the reader's words. */
  why: string;
}

/**
 * What a figure counted, out of what, and what it left out.
 *
 * Required on every figure (see the module doc). `counted === null` means
 * nothing was counted at all, which is not zero: `of` still says what the
 * denominator would have been where that is known, and `sentence` says so in
 * words.
 */
export interface Coverage {
  counted: number | null;
  /** The closed set the figure was drawn from, or `null` when there is none. */
  of: number | null;
  /** What that set is — "phases in the workflow contract", "runs on this project". */
  basis: string;
  excluded: CoverageExclusion[];
  /** The line printed beside the figure, in a table or as an `aria-label`. */
  sentence: string;
}

export function coverage(
  counted: number | null,
  of: number | null,
  basis: string,
  excluded: CoverageExclusion[] = [],
): Coverage {
  const head =
    counted === null
      ? of === null
        ? `nothing counted — ${basis}`
        : `nothing counted of ${of} ${basis}`
      : of === null
        ? `${counted} ${basis}`
        : `${counted} of ${of} ${basis}`;
  const tail = excluded.filter((e) => e.count > 0).map((e) => `${e.count} ${e.why}`);
  return {
    counted,
    of,
    basis,
    excluded,
    sentence: [head, ...tail].join(' · '),
  };
}

/* ------------------------------------------------------------------- figures */

export interface ManagementFigure {
  key: string;
  label: string;
  /**
   * The figure, already formatted, or `null` when nothing measured it. Never a
   * percentage without its denominator, and never a `0` standing in for "we did
   * not look" (`lib/first-look.ts`, `lib/workspace-rows.ts`: *null is not zero*).
   */
  value: string | null;
  /** Set exactly when `value` is null. */
  absentReason?: string;
  /** One of the nine values of `DESIGN.md` §4 — read from `lib/provenance.ts`. */
  provenance: ProvenanceValue;
  coverage: Coverage;
}

export interface AnswerItem {
  key: string;
  /** The thing itself — a phase, an input, a blocker. */
  label: string;
  /** What is on record about it, in the product's own words. */
  detail: string;
  provenance: ProvenanceValue;
}

export type AnswerId = 'confirmed' | 'missing' | 'decision' | 'score';

export interface ManagementAnswer {
  id: AnswerId;
  /** The question this card answers, so the card can be read on its own. */
  question: string;
  /**
   * The answer, as a sentence — `DESIGN.md` ADR-029 and roadmap 3.0.10: *„jede
   * Karte beginnt mit ihrem Antwortsatz als Titel"*. Never a label like "Score".
   */
  headline: string;
  figures: ManagementFigure[];
  items: AnswerItem[];
}

/* --------------------------------------------------------------- run history */

/**
 * One run of this project, as much of it as a score history needs.
 *
 * A run document carries far more; this is the part that decides whether two
 * runs may be compared, plus the figure itself. Built by `runHistoryEntry`
 * from a raw document so that the parsing — which is where a missing field
 * turns into a false comparison — is pure and testable.
 */
export interface RunHistoryEntry {
  runId: string;
  /** ISO string as `/api/runs/create` writes it, or null when absent. */
  createdAt: string | null;
  cleanCoreScore: number | null;
  rulesetVersion: string | null;
  analyzerVersion: string | null;
  catalogVersion: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

/** A score is a number in 0–100 or it is nothing — CR-16, and never rounded here. */
const score = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;

export function runHistoryEntry(raw: unknown): RunHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const runId = str(r.runId);
  if (!runId) return null;
  return {
    runId,
    createdAt: str(r.createdAt),
    cleanCoreScore: score(r.cleanCoreScore),
    rulesetVersion: str(r.rulesetVersion),
    analyzerVersion: str(r.analyzerVersion),
    catalogVersion: str(r.sapApiCatalogVersion),
  };
}

/**
 * The rule version of one run — all three parts, or nothing.
 *
 * The A–D level rule versions itself by measurement (`fingerprintLevelRule`
 * hashes the decision table, so the version cannot stand still while the rule
 * moves). The **run** does not: `/api/runs/create` writes `rulesetVersion` as
 * the literal `'rules-v1.0'`, beside an analyzer version and a catalog version
 * that do move. So the honest identity of a run's rule version is all three
 * together, and a run missing any one of them has no version this module is
 * willing to compare — because "same version" would then rest on a string that
 * is correct on the day it was typed.
 *
 * The comparison is deliberately exact string equality on the whole label. Two
 * runs are the same scale or they are not; there is no "close enough" here.
 */
export function ruleVersionLabel(entry: RunHistoryEntry): string | null {
  if (!entry.rulesetVersion || !entry.analyzerVersion || !entry.catalogVersion) return null;
  return `${entry.rulesetVersion} · analyzer ${entry.analyzerVersion} · catalog ${entry.catalogVersion}`;
}

export interface TrendPoint {
  runId: string;
  createdAt: string | null;
  score: number;
}

/** A run measured on a different rule version — named, never plotted. */
export interface RuleVersionBreak {
  ruleVersion: string;
  runs: number;
}

export type TrendState =
  /** The runs of this project could not be read at all. */
  | 'unreadable'
  /** No signed run — there is no score and nothing to compare. */
  | 'no-run'
  /** There is a run, and it carries no score. */
  | 'no-score'
  /** The active run records no complete rule version, so nothing may be compared to it. */
  | 'no-rule-version'
  /** Exactly one run on this rule version. A line through one point is not a trend. */
  | 'single-run'
  /** Two or more runs on the same rule version, in time order. */
  | 'trend';

export interface ScoreTrend {
  state: TrendState;
  /** The active run's rule version, where it has a complete one. */
  ruleVersion: string | null;
  /** The score of the active run, or null with a reason in `sentence`. */
  score: number | null;
  /** Only runs of `ruleVersion`, oldest first. Empty unless `trend` or `single-run`. */
  points: TrendPoint[];
  /** Runs measured on another rule version. A scale change, not a development. */
  breaks: RuleVersionBreak[];
  /** Runs whose recorded rule version is incomplete, so nothing can place them. */
  withoutRuleVersion: number;
  /** Runs of this rule version that carry no score. */
  withoutScore: number;
  /** What the reader is told instead of, or beside, a line. */
  sentence: string;
  coverage: Coverage;
}

function byTime(a: TrendPoint, b: TrendPoint): number {
  if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  if (a.createdAt) return -1;
  if (b.createdAt) return 1;
  return a.runId.localeCompare(b.runId);
}

const runWord = (n: number) => `${n} ${n === 1 ? 'run' : 'runs'}`;

/**
 * The Clean Core Score over time — and the one rule that governs it.
 *
 * *„Ein Verlauf vergleicht nur Runs derselben Regelversion."* A line drawn
 * across a rule change is not a development, it is a change of scale wearing
 * the shape of one: the second score answers a different question from the
 * first, and the reader is invited to read the difference as progress. So runs
 * on another version are **counted and named** as a break, and they are not
 * points.
 *
 * And a single point is not a trend either. With one run of the current rule
 * version the state says so in words rather than drawing a line out of one
 * observation — which is the other way the same lie gets told.
 */
export function scoreTrend(
  project: Project | null,
  history: readonly RunHistoryEntry[] | null,
): ScoreTrend {
  const activeRunId = str(project?.activeRunId);
  const base = {
    ruleVersion: null,
    score: null,
    points: [] as TrendPoint[],
    breaks: [] as RuleVersionBreak[],
    withoutRuleVersion: 0,
    withoutScore: 0,
  };

  if (history === null) {
    return {
      ...base,
      state: 'unreadable',
      sentence:
        'The runs of this project could not be read, so no score history is shown. ' +
        'An empty chart would say there were none.',
      coverage: coverage(null, null, 'runs on this project — the list could not be read'),
    };
  }

  if (!activeRunId) {
    return {
      ...base,
      state: 'no-run',
      sentence:
        'No signed run, so there is no Clean Core Score and nothing to compare. ' +
        'Every figure in this view derives from a run.',
      coverage: coverage(null, history.length, 'runs on this project', [
        { count: history.length, why: 'not the active run' },
      ]),
    };
  }

  const active = history.find((e) => e.runId === activeRunId) ?? null;
  if (!active) {
    return {
      ...base,
      state: 'no-score',
      sentence:
        `The active run ${activeRunId} is not among the ${runWord(history.length)} that could be read, ` +
        'so its score cannot be placed against any other run.',
      coverage: coverage(0, history.length, 'runs on this project', [
        { count: history.length, why: 'not the active run' },
      ]),
    };
  }

  const ruleVersion = ruleVersionLabel(active);
  const others = history.filter((e) => e.runId !== active.runId);

  if (!ruleVersion) {
    return {
      ...base,
      state: 'no-rule-version',
      score: active.cleanCoreScore,
      withoutRuleVersion: history.filter((e) => ruleVersionLabel(e) === null).length,
      sentence:
        'The active run records no complete rule version — ruleset, analyzer and catalog — ' +
        'so no other run can be shown to have been measured on the same scale, and no history is drawn.',
      coverage: coverage(0, history.length, 'runs on this project', [
        { count: history.length, why: 'cannot be shown to share the active run’s rule version' },
      ]),
    };
  }

  const sameVersion = history.filter((e) => ruleVersionLabel(e) === ruleVersion);
  const points = sameVersion
    .filter((e): e is RunHistoryEntry & { cleanCoreScore: number } => e.cleanCoreScore !== null)
    .map((e) => ({ runId: e.runId, createdAt: e.createdAt, score: e.cleanCoreScore }))
    .sort(byTime);

  const withoutScore = sameVersion.length - points.length;
  const withoutRuleVersion = others.filter((e) => ruleVersionLabel(e) === null).length;

  const breakCounts = new Map<string, number>();
  for (const e of others) {
    const label = ruleVersionLabel(e);
    if (label === null || label === ruleVersion) continue;
    breakCounts.set(label, (breakCounts.get(label) ?? 0) + 1);
  }
  const breaks: RuleVersionBreak[] = [...breakCounts.entries()]
    .map(([version, runs]) => ({ ruleVersion: version, runs }))
    .sort((a, b) => a.ruleVersion.localeCompare(b.ruleVersion));

  const excluded: CoverageExclusion[] = [
    { count: breaks.reduce((n, b) => n + b.runs, 0), why: 'on another rule version' },
    { count: withoutRuleVersion, why: 'with no complete rule version' },
    { count: withoutScore, why: 'on this rule version with no score' },
  ];
  const cover = coverage(points.length, history.length, 'runs on this project', excluded);

  const breakSentence =
    breaks.length === 0
      ? ''
      : ` ${runWord(breaks.reduce((n, b) => n + b.runs, 0))} on ${
          breaks.length === 1 ? 'another rule version' : `${breaks.length} other rule versions`
        } (${breaks.map((b) => b.ruleVersion).join('; ')}) ${
          breaks.reduce((n, b) => n + b.runs, 0) === 1 ? 'is' : 'are'
        } not drawn: a different rule is a different scale, not a development.`;

  if (points.length === 0) {
    return {
      ...base,
      state: 'no-score',
      ruleVersion,
      breaks,
      withoutRuleVersion,
      withoutScore,
      sentence:
        `No run on rule version ${ruleVersion} carries a Clean Core Score, so there is nothing to show.` +
        breakSentence,
      coverage: cover,
    };
  }

  if (points.length === 1) {
    return {
      state: 'single-run',
      ruleVersion,
      score: active.cleanCoreScore,
      points,
      breaks,
      withoutRuleVersion,
      withoutScore,
      sentence:
        `One run on rule version ${ruleVersion}. There is no history: a history needs two runs ` +
        'measured by the same rule, and a line through one point would invent the second.' +
        breakSentence,
      coverage: cover,
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.score - first.score;
  const movement =
    delta === 0
      ? 'unchanged'
      : `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'point' : 'points'}`;

  return {
    state: 'trend',
    ruleVersion,
    score: active.cleanCoreScore,
    points,
    breaks,
    withoutRuleVersion,
    withoutScore,
    sentence:
      `${first.score} → ${last.score}, ${movement}, over ${runWord(points.length)} measured on rule ` +
      `version ${ruleVersion}.` +
      breakSentence,
    coverage: cover,
  };
}

/* --------------------------------------------------------------- the answers */

/** What the score is and, as pointedly, what it is not (roadmap 3.0.10). */
export const SCORE_MEANING =
  'Our own grade for this one piece of code, 0–100, higher is better — not a compliance percentage, ' +
  'and not an SAP figure.';

const PHASE_BASIS = 'phases in the workflow contract';

/**
 * Why an input of the signed run cannot be shown to be the one in front of the
 * reader (`lib/input-manifest.ts`). The three cases are kept apart on purpose:
 * only the first is a changed input, and the other two are the honest absence
 * of a comparison — which roadmap 0.6 treats the same way and for the same
 * reason, but which a reader deciding something has a right to tell apart.
 */
const UNVERIFIED_REASON: Record<'differs' | 'not-readable' | 'not-recorded', string> = {
  differs: 'it is there and it is a different one than the run recorded.',
  'not-readable': 'it could not be read here, so nothing could be compared.',
  'not-recorded': 'the run’s manifest has no entry for it, so there is nothing to compare against.',
};

function confirmedAnswer(steps: readonly RailStep[]): ManagementAnswer {
  const proven = steps.filter((s) => s.proven);
  const selfDeclared = steps.filter((s) => s.done && !s.proven);
  const stale = steps.filter((s) => s.state === 'stale');

  const figures: ManagementFigure[] = [
    {
      key: 'proven',
      label: 'checked by something other than the account',
      value: `${proven.length} of ${steps.length}`,
      provenance: 'proven',
      coverage: coverage(proven.length, steps.length, PHASE_BASIS, [
        { count: selfDeclared.length, why: 'on record on the account’s own word' },
        { count: stale.length, why: 'built for a previous source' },
      ]),
    },
    {
      key: 'self-declared',
      label: 'on record on the account’s own word',
      value: `${selfDeclared.length} of ${steps.length}`,
      provenance: 'confirmed',
      coverage: coverage(selfDeclared.length, steps.length, PHASE_BASIS, [
        { count: proven.length, why: 'checked by something other than the account' },
      ]),
    },
  ];

  const items: AnswerItem[] = [
    ...proven.map((s) => ({
      key: `proven-${s.key}`,
      label: s.label,
      detail: s.detail,
      provenance: 'proven' as ProvenanceValue,
    })),
    ...selfDeclared.map((s) => ({
      key: `claimed-${s.key}`,
      label: s.label,
      detail: `${s.detail} This is a claim by the signed-in account, not a proof.`,
      provenance: 'confirmed' as ProvenanceValue,
    })),
  ];

  const headline =
    proven.length === 0
      ? selfDeclared.length === 0
        ? 'Nothing on this project has been confirmed by anything.'
        : `Nothing has been checked; ${selfDeclared.length} of ${steps.length} phases stand on the account’s own word.`
      : `${proven.length} of ${steps.length} phases are backed by a record something checked` +
        (selfDeclared.length > 0
          ? `; ${selfDeclared.length} more stand on the account’s own word, which is a claim, not a proof.`
          : '.');

  return {
    id: 'confirmed',
    question: 'What is confirmed?',
    headline,
    figures,
    items,
  };
}

function missingAnswer(steps: readonly RailStep[], open: NotDetermined | null): ManagementAnswer {
  const openPhases = steps.filter((s) => !s.done);
  const items: AnswerItem[] = openPhases.map((s) => ({
    key: `open-${s.key}`,
    label: s.label,
    detail: s.detail,
    provenance: s.state === 'stale' ? ('stale' as ProvenanceValue) : ('not-determined' as ProvenanceValue),
  }));

  const figures: ManagementFigure[] = [
    {
      key: 'open-phases',
      label: 'phases with their own evidence still missing',
      value: `${openPhases.length} of ${steps.length}`,
      provenance: 'reconstructed',
      coverage: coverage(openPhases.length, steps.length, PHASE_BASIS),
    },
    {
      key: 'not-determined',
      label: 'constructs the engine stepped over',
      value: open === null || open.noSource ? null : String(open.count),
      ...(open === null
        ? { absentReason: 'the source was not assessed here' }
        : open.noSource
          ? { absentReason: 'no source has been staged, so nothing was assessed' }
          : {}),
      // Its own visible area in every diagram (roadmap 3.0.10), and never
      // folded into a remainder: this figure is the reason to trust the rest.
      provenance: 'not-determined',
      coverage:
        open === null || open.noSource
          ? coverage(null, null, 'constructs in the staged source')
          : coverage(open.count, null, 'constructs the detectors stepped over'),
    },
  ];

  const headline =
    openPhases.length === 0
      ? 'Every phase this product can finish has its own record.'
      : `${openPhases.length} of ${steps.length} phases have no evidence of their own yet.`;

  return { id: 'missing', question: 'What is missing?', headline, figures, items };
}

/**
 * What a decision would be bound to, and what stands in the way — roadmap
 * 3.0.10 (e): *„was die Entscheidung blockiert"* as a short, ordered list with
 * evidence per line, not a share of anything.
 *
 * The bindings are the records a decision taken today would attach itself to.
 * The blockers are the reasons doing so would bind something that is not what
 * it looks like: no run at all, a source that moved after the run, inputs that
 * cannot be shown to be the ones the run used, artefacts built for a previous
 * source, and phases standing on a self-declaration.
 */
function decisionAnswer(project: Project | null, steps: readonly RailStep[]): ManagementAnswer {
  const runId = str(project?.activeRunId);
  const fingerprint = project?.auditMetadata?.inputFingerprint ?? null;
  const s = staleness(project);
  const blockers = handoverBlockers(project);
  const selfDeclared = steps.filter((st) => st.done && !st.proven);

  const bindings: AnswerItem[] = [];
  if (runId) {
    bindings.push({
      key: 'run',
      label: 'The signed run',
      detail: `Run ${runId} — immutable, server-signed, and the origin of every figure in this view.`,
      provenance: 'proven',
    });
  }
  if (fingerprint?.sha256) {
    bindings.push({
      key: 'source',
      label: 'The analysed source',
      detail:
        `${fingerprint.fileName ?? 'the staged source'}, ${fingerprint.lineCount ?? 0} lines, ` +
        `SHA-256 ${fingerprint.sha256.slice(0, 12)}…`,
      provenance: 'proven',
    });
  }

  const blocking: AnswerItem[] = [];
  if (!runId) {
    blocking.push({
      key: 'no-run',
      label: 'No signed run',
      detail:
        'Nothing has been analysed under a signature, so a decision would bind a result that is not on record.',
      provenance: 'not-determined',
    });
  }
  if (s.sourceChanged) {
    blocking.push({
      key: 'source-changed',
      label: 'The source moved after the run',
      detail: 'The source on this project is not the one the signed run analysed.',
      provenance: 'stale',
    });
  }
  for (const input of s.unverifiedInputs) {
    blocking.push({
      key: `input-${input.id}`,
      label: 'An input cannot be shown to still match',
      detail: `${inputLabel(input.id)} — ${UNVERIFIED_REASON[input.reason]}`,
      provenance: 'stale',
    });
  }
  for (const blocker of blockers) {
    blocking.push({
      key: `handover-${blocker.slice(0, 24)}`,
      label: 'Built for a previous source',
      detail: blocker,
      provenance: 'stale',
    });
  }
  for (const st of selfDeclared) {
    blocking.push({
      key: `claim-${st.key}`,
      label: `${st.label} rests on a claim`,
      detail: `${st.detail} Nothing outside the account has checked it.`,
      provenance: 'confirmed',
    });
  }

  const figures: ManagementFigure[] = [
    {
      key: 'bound',
      label: 'records a decision would bind',
      value: bindings.length > 0 ? String(bindings.length) : null,
      ...(bindings.length === 0 ? { absentReason: 'no signed run, so there is nothing to bind' } : {}),
      provenance: bindings.length > 0 ? 'proven' : 'not-determined',
      coverage: coverage(
        bindings.length > 0 ? bindings.length : null,
        null,
        'server-written records on this project',
      ),
    },
    {
      key: 'blocking',
      label: 'things in the way of a decision',
      value: String(blocking.length),
      provenance: 'reconstructed',
      coverage: coverage(blocking.length, null, 'blockers, each with its own line and evidence'),
    },
  ];

  const headline =
    blocking.length === 0
      ? bindings.length === 0
        ? 'There is nothing here for a decision to bind yet.'
        : 'A decision would bind the signed run and the source it analysed, and nothing stands in the way.'
      : `${blocking.length} ${blocking.length === 1 ? 'thing stands' : 'things stand'} in the way of a decision.`;

  return {
    id: 'decision',
    question: 'What would a decision bind, and what blocks it?',
    headline,
    figures,
    items: [...bindings, ...blocking],
  };
}

function scoreAnswer(project: Project | null, trend: ScoreTrend): ManagementAnswer {
  const hasRun = str(project?.activeRunId) !== null;
  const value = trend.score;

  const figures: ManagementFigure[] = [
    {
      key: 'clean-core-score',
      label: 'Clean Core Score',
      value: value === null ? null : String(value),
      ...(value === null
        ? { absentReason: hasRun ? 'the signed run records no score' : 'no signed run' }
        : {}),
      provenance: value === null ? 'not-determined' : 'proven',
      coverage: coverage(
        value === null ? null : 1,
        1,
        'signed run this score was read from',
        trend.state === 'unreadable'
          ? [{ count: 1, why: 'run list that could not be read' }]
          : [],
      ),
    },
    {
      key: 'rule-version',
      label: 'rule version',
      value: trend.ruleVersion,
      ...(trend.ruleVersion === null
        ? { absentReason: 'the run records no complete ruleset, analyzer and catalog version' }
        : {}),
      provenance: trend.ruleVersion === null ? 'not-determined' : 'proven',
      coverage: coverage(
        trend.ruleVersion === null ? null : 3,
        3,
        'version fields the run records (ruleset, analyzer, catalog)',
      ),
    },
    {
      key: 'history',
      label: 'runs this history compares',
      value: trend.points.length >= 2 ? String(trend.points.length) : null,
      ...(trend.points.length >= 2 ? {} : { absentReason: trend.sentence }),
      provenance: trend.points.length >= 2 ? 'proven' : 'not-determined',
      coverage: trend.coverage,
    },
  ];

  const headline =
    value === null
      ? `No Clean Core Score: ${
          hasRun ? 'the signed run records none.' : 'nothing has been analysed under a signature yet.'
        }`
      : trend.state === 'trend'
        ? `Clean Core Score ${value} — ${trend.sentence}`
        : `Clean Core Score ${value} on rule version ${trend.ruleVersion ?? 'not determined'}, with no history yet.`;

  return {
    id: 'score',
    question: 'How clean is this core, measured by which rule, and how has it moved?',
    headline,
    figures,
    items: [
      { key: 'meaning', label: 'What this number is', detail: SCORE_MEANING, provenance: 'reconstructed' },
      { key: 'history', label: 'The history rule', detail: trend.sentence, provenance: 'reconstructed' },
    ],
  };
}

export interface ManagementView {
  /** The view's own question (`lib/workspace-model.ts`), repeated so this model is self-contained. */
  question: string;
  /** One sentence that answers it for this project — roadmap 3.0.10 (a). */
  headline: string;
  /** At most six cards (3.0.10 (a)); today four, each with one answer. */
  answers: ManagementAnswer[];
  /** The score history, exported whole so the diagram of 3.0.10 (c) reads the same object. */
  trend: ScoreTrend;
}

/**
 * The whole Management view of one project.
 *
 * `history` is the runs of **this** project, already read: `null` means they
 * could not be read, which is a different statement from an empty list and is
 * reported as one. `open` is `notDetermined(project)` from
 * `lib/workspace-model.ts`, passed in rather than imported so that this module
 * stays free of the evidence engine and a spec can drive it without one.
 */
export function managementAnswers(
  project: Project | null,
  history: readonly RunHistoryEntry[] | null,
  open: NotDetermined | null = null,
): ManagementView {
  const steps = workflowSteps(project);
  const trend = scoreTrend(project, history);
  const answers = [
    confirmedAnswer(steps),
    missingAnswer(steps, open),
    decisionAnswer(project, steps),
    scoreAnswer(project, trend),
  ];

  const proven = steps.filter((s) => s.proven).length;
  const blocking = answers.find((a) => a.id === 'decision')?.figures.find((f) => f.key === 'blocking');
  const blockers = blocking?.value ?? '0';

  const headline = !str(project?.legacyCode)
    ? 'Nothing has been staged for this project, so there is nothing to decide on and nothing to risk yet.'
    : !str(project?.activeRunId)
      ? 'No signed run: nothing in this project is backed by evidence, and a decision would bind nothing.'
      : `${proven} of ${steps.length} phases are backed by evidence, ${blockers} ${
          blockers === '1' ? 'thing stands' : 'things stand'
        } in the way of a decision, and the Clean Core Score is ${
          trend.score === null ? 'not determined' : trend.score
        }.`;

  return {
    question: 'What do I risk, what do I decide?',
    headline,
    answers,
    trend,
  };
}

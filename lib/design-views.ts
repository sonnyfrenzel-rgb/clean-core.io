/**
 * The Design tool's three views and five decision cases (ADR-130, `docs/roadmap/design-next-mockup.html`), as pure
 * readings the page draws. Nothing here is stored, nothing calls a model, and no view is written anywhere: the view
 * lives in the address only (ADR-105), the decision is read as the decision route answers it, and the business
 * answers as `lib/design-business-answers.ts` reads them.
 *
 *   - `designDecisionOf`  — the program decision Design works from (G2): the option, whether it is confirmed, the
 *                           cost basis sentence (ADR-092; never an amount) and the guard rail (G3).
 *   - `designTargetBoard` — the Business view's picture (G4): today's steps in Analyze's phases
 *                           (`lib/around-the-map.ts`, "How it runs"), each marked with what the business answers on
 *                           record do to it, in the to-be vocabulary of `lib/process-target.ts`.
 *   - `designObjects`     — the IT view's object table (G7): every object the findings name, its Level from the SAP
 *                           catalog and its released successor, never guessed.
 *   - `designSignOffChecklist` — the Management view's "before sign-off" (G8).
 *   - `designDependencies` — Retire (G10): what the analysis read beside what it could not read.
 *   - `designAnchors`     — the "On this page" items per view and option (G12, at most six).
 *
 * Pure: no React, no network, no clock.
 */
import { DECISION_OPTION_LABELS, optionOfArchitecture, type DecisionOption } from './decision-options';
import { decisionCostLine, outdatedReasonsOfAnswer, type OutdatedReason } from './decision-cost';
import { optionCodeOf } from './decision-manager';
import type { DecisionRead } from './management-overview';
import type { AroundRun } from './around-the-map';
import type { BusinessAnswersReading } from './design-business-answers';
import type { ItFindingRow } from './it-findings';
import { PAGE_ANCHOR_IDS, type PageAnchor } from './page-anchors';
import { TARGET_DISCLAIMER, VERDICT_LABELS } from './process-target';
import type { WorkspaceView } from './workspace-model';

export type DesignView = WorkspaceView;

/* ------------------------------------------------------------ the decision */

export type DesignCase = DecisionOption | 'none';

export interface DesignDecision {
  /** The case Design shows. `none` without a decision: Design designs a rebuild, as before, and says so. */
  case: DesignCase;
  /** The option's words, or null without one. */
  label: string | null;
  /** True when Management confirmed the decision record. */
  confirmed: boolean;
  /** Who confirmed it, and when (ISO) — a self-declaration of that account. */
  by: string | null;
  at: string | null;
  /** The Costs sentence of the confirmed record (ADR-092): the revision it was priced on. Never an amount. */
  costLine: string | null;
  /** Why the confirmed record is out of date (evidence moved, or another option is now the cheapest). */
  outdated: OutdatedReason[];
}

export const NO_DESIGN_DECISION: DesignDecision = Object.freeze({
  case: 'none',
  label: null,
  confirmed: false,
  by: null,
  at: null,
  costLine: null,
  outdated: [],
}) as DesignDecision;

/**
 * The decision Design works from. A confirmed record names its option in the `option` binding; where no confirmed
 * record names one, a direct choice of Management (Keep, Move to SAP standard, Retire — stored as the sign-off's
 * code) or a target confirmed here (a Rebuild route) still says which case applies.
 */
export function designDecisionOf(answer: DecisionRead | null | undefined): DesignDecision {
  if (!answer) return NO_DESIGN_DECISION;
  const stored = answer.stored && answer.stored.status === 'confirmed' ? answer.stored : null;
  const bound = stored?.bindings.find((b) => b.key === 'option')?.revision ?? null;
  const fromRecord = optionOfArchitecture(optionCodeOf(bound));
  const fromSignOff = optionOfArchitecture(answer.signOff?.code ?? null);
  const option = fromRecord ?? fromSignOff;
  if (!option) return NO_DESIGN_DECISION;
  return {
    case: option,
    label: DECISION_OPTION_LABELS[option],
    confirmed: Boolean(stored && fromRecord),
    by: stored?.confirmation?.account ?? answer.signOff?.by ?? null,
    at: stored?.confirmation?.at ?? answer.signOff?.at ?? null,
    costLine: stored && answer.cost ? decisionCostLine(answer.cost) : null,
    outdated: outdatedReasonsOfAnswer(answer),
  };
}

/**
 * The guard rail (G3): the design lies outside what Economics priced when the confirmed decision is out of date, or
 * the route departs from the contract the decision was priced on (a declared deviation). Design shows no amount.
 */
export function outsidePricedRange(decision: DesignDecision, routeDeviation: boolean): boolean {
  if (decision.case === 'none') return false;
  return decision.outdated.length > 0 || (decision.case === 'rebuild' && routeDeviation);
}

export const OUTSIDE_PRICED_HEADLINE = 'This design lies outside what Economics priced. Re-price it.';

/* --------------------------------------------------------- the target board */

/** A step's mark on the board. `stays` is drawn unmarked. */
export type StepMark = 'stays' | 'changes' | 'goes' | 'open';

export const STEP_MARK_LABELS: Readonly<Record<StepMark, string>> = Object.freeze({
  stays: VERDICT_LABELS.stays,
  changes: 'Changes',
  goes: VERDICT_LABELS.goes,
  open: VERDICT_LABELS.open,
});

export interface BoardStep {
  text: string;
  /** `L42` or `L60-75`, as Analyze says it. */
  anchor: string;
  mark: StepMark;
  /** What the answer says — the new value, who decides, why it goes; null when nothing was said. */
  note: string | null;
  /** The questions this step's mark comes from, in the engine's order (1-based numbers). */
  questions: number[];
}

export interface BoardPhase {
  title: string;
  steps: BoardStep[];
}

export interface TargetBoard {
  phases: BoardPhase[];
  counts: Record<StepMark, number>;
  /** Steps in all. */
  steps: number;
  /** Whether any answer is on record: without one the board is today's process, nothing marked. */
  marked: boolean;
  /** Answered questions whose rules stand on no step's lines. */
  unplaced: number;
  disclaimer: string;
}

/** The lines a business rule stands on, as the rule set carries them. */
export interface RuleLines {
  id: string;
  ranges: Array<{ lineStart: number; lineEnd: number }>;
}

/** `L42` → [42, 42]; `L60-75` → [60, 75]; anything else → null. */
export function rangeOfAnchor(anchor: string | null | undefined): [number, number] | null {
  const m = /^L(\d+)(?:\s*[-–]\s*L?(\d+))?$/.exec(String(anchor ?? '').trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return a <= b ? [a, b] : [b, a];
}

const overlaps = (r: [number, number], s: { lineStart: number; lineEnd: number }) => s.lineStart <= r[1] && s.lineEnd >= r[0];

type AnswerMark = { mark: StepMark; note: string | null; n: number };

/** How several answers on one step combine: a step goes only when everything said about it goes. */
function combine(marks: AnswerMark[]): StepMark {
  if (marks.length === 0) return 'stays';
  if (marks.every((m) => m.mark === 'goes')) return 'goes';
  if (marks.some((m) => m.mark === 'goes' || m.mark === 'changes')) return 'changes';
  if (marks.some((m) => m.mark === 'open')) return 'open';
  return 'stays';
}

/**
 * Today's process, step by step in Analyze's phases, each step marked with what the business answers do to it:
 * "No, it should be …" changes it, "We don't need it any more" takes it out of the target, "I don't know" leaves it
 * open — and while any answer is on record, a question still unanswered leaves its steps open ("waits for your
 * answer"). Without any answer the board is today's process, nothing marked. A step is matched to a question by the
 * lines its rules stand on — never by name.
 */
export function designTargetBoard(runs: readonly AroundRun[], rules: readonly RuleLines[], answers: BusinessAnswersReading): TargetBoard {
  const ready = answers.state === 'ready' ? answers : null;
  const marked = Boolean(ready && ready.questions.some((q) => q.answer !== null));
  const byRule = new Map(rules.map((r) => [r.id, r.ranges]));
  const placed = new Set<number>();
  const phases: BoardPhase[] = runs.map((run) => ({
    title: run.title,
    steps: run.steps.map((s) => {
      const range = rangeOfAnchor(s.step.anchor);
      const hits: AnswerMark[] = [];
      if (range && ready && marked) {
        ready.questions.forEach((q, i) => {
          const on = q.ruleIds.some((id) => (byRule.get(id) ?? []).some((r) => overlaps(range, r)));
          if (!on) return;
          placed.add(i);
          const mark: StepMark =
            q.answer === null || q.answer === 'unsure' ? 'open' : q.answer === 'change' ? 'changes' : q.answer === 'drop' ? 'goes' : 'stays';
          hits.push({ mark, note: q.answer === null ? 'Waits for your answer.' : q.note, n: i + 1 });
        });
      }
      const mark = combine(hits);
      const said = hits.filter((h) => h.mark === mark && h.note);
      return {
        text: s.step.text,
        anchor: s.step.anchor,
        mark,
        note: mark === 'stays' ? null : said.map((h) => h.note).join(' ') || null,
        questions: hits.filter((h) => h.mark !== 'stays').map((h) => h.n),
      };
    }),
  }));
  const counts: Record<StepMark, number> = { stays: 0, changes: 0, goes: 0, open: 0 };
  for (const p of phases) for (const s of p.steps) counts[s.mark] += 1;
  const answered = ready ? ready.questions.filter((q, i) => q.answer !== null && q.answer !== 'yes' && !placed.has(i)).length : 0;
  return {
    phases,
    counts,
    steps: phases.reduce((n, p) => n + p.steps.length, 0),
    marked,
    unplaced: marked ? answered : 0,
    disclaimer: TARGET_DISCLAIMER,
  };
}

/* --------------------------------------------------------------- objects */

export type ObjectLevel = 'A' | 'B' | 'C' | 'D' | 'none';

export interface DesignObject {
  name: string;
  /** "read", "write", "call" … the finding kinds in plain words, distinct. */
  uses: string[];
  /** Every line it is used on, ascending. */
  lines: number[];
  /** The worst Level the catalog gives its uses; `none` for an object the catalog does not grade (own objects). */
  level: ObjectLevel;
  successor: string | null;
  successorType: string | null;
  confidence: string | null;
}

export interface DesignObjects {
  rows: DesignObject[];
  byLevel: Record<ObjectLevel, number>;
  withSuccessor: number;
  withoutSuccessor: number;
}

const LEVEL_ORDER: readonly ObjectLevel[] = ['D', 'C', 'B', 'A', 'none'];
const rank = (l: ObjectLevel) => LEVEL_ORDER.indexOf(l);

/** One row per object the findings name, worst Level first. A finding about a statement (no object) is not an object. */
export function designObjects(findings: readonly ItFindingRow[]): DesignObjects {
  const by = new Map<string, DesignObject>();
  for (const f of findings) {
    if (!f.objectName) continue;
    const name = f.objectName.toUpperCase();
    const level: ObjectLevel = f.level === 'A' || f.level === 'B' || f.level === 'C' || f.level === 'D' ? f.level : 'none';
    const use = (f.kindLabel || f.kind).trim();
    const row = by.get(name) ?? { name, uses: [], lines: [], level, successor: null, successorType: null, confidence: null };
    if (use && !row.uses.includes(use)) row.uses.push(use);
    if (!row.lines.includes(f.lineStart)) row.lines.push(f.lineStart);
    if (rank(level) < rank(row.level)) row.level = level;
    if (!row.successor && f.successor) {
      row.successor = f.successor;
      row.successorType = f.successorType ?? null;
      row.confidence = f.successorConfidence ?? null;
    }
    by.set(name, row);
  }
  const rows = [...by.values()]
    .map((r) => ({ ...r, lines: [...r.lines].sort((a, b) => a - b) }))
    .sort((a, b) => rank(a.level) - rank(b.level) || a.lines[0] - b.lines[0]);
  const byLevel: Record<ObjectLevel, number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  for (const r of rows) byLevel[r.level] += 1;
  const sap = rows.filter((r) => r.level !== 'none');
  return {
    rows,
    byLevel,
    withSuccessor: sap.filter((r) => r.successor).length,
    withoutSuccessor: sap.filter((r) => !r.successor).length,
  };
}

/** "line 42" or "lines 42, 61, 106" — the family's one line-anchor notation. */
export function linesWords(lines: readonly number[]): string {
  if (lines.length === 0) return '';
  const shown = lines.slice(0, 4).join(', ');
  const more = lines.length > 4 ? ` and ${lines.length - 4} more` : '';
  return `${lines.length === 1 ? 'line' : 'lines'} ${shown}${more}`;
}

/* ------------------------------------------------------- before sign-off */

export type CheckMark = 'ok' | 'open' | 'na';

export interface CheckRow {
  key: string;
  mark: CheckMark;
  label: string;
  detail: string;
}

export interface SignOffInput {
  answers: BusinessAnswersReading;
  /** A design is on record, written for the code under review and the answers on record. */
  designWritten: boolean;
  /** A design is on record but out of date. */
  designStale: boolean;
  /** The target line: the edition, bound by the run or assumed. */
  targetLine: string;
  targetBound: boolean;
  outside: boolean;
  /** The target is confirmed for the code under review. */
  confirmed: boolean;
}

/** The Management view's checklist (G8): what stands between "decided" and "ready to sign off". */
export function designSignOffChecklist(input: SignOffInput): { rows: CheckRow[]; ready: boolean } {
  const a = input.answers.state === 'ready' ? input.answers : null;
  const answered = a ? a.total - a.open : 0;
  const rows: CheckRow[] = [
    {
      key: 'questions',
      mark: !a ? 'na' : a.open === 0 ? 'ok' : 'open',
      label: 'Business questions answered',
      detail: !a ? 'Reading the questions from the code.' : a.total === 0 ? 'The code asks the business nothing.' : `${answered} of ${a.total}`,
    },
    {
      key: 'design',
      mark: input.designWritten ? 'ok' : 'open',
      label: 'Design written',
      detail: input.designWritten ? 'AI-generated, from the answers on record' : input.designStale ? 'Out of date: write it again' : 'Not written yet',
    },
    {
      key: 'target',
      mark: input.targetBound ? 'ok' : 'na',
      label: 'Target edition bound by the run',
      detail: input.targetLine,
    },
  ];
  if (input.outside) {
    rows.push({ key: 'priced', mark: 'open', label: 'Priced in Economics', detail: 'No: the route or the costs changed after pricing' });
  }
  rows.push({
    key: 'confirmed',
    mark: input.confirmed ? 'ok' : 'open',
    label: 'Target confirmed',
    detail: input.confirmed ? 'Confirmed for the code under review' : 'Not yet: your step',
  });
  const ready = Boolean(a && a.open === 0) && input.designWritten && !input.outside;
  return { rows, ready };
}

/* ------------------------------------------------------------ Retire */

export interface DependencyRow {
  kind: 'Writes' | 'Calls' | 'Reads';
  what: string;
  lines: number[];
}

/** The kinds a finding names that change data elsewhere, or reach into other code. */
const WRITE = /write|update|insert|modify|delete|batch|bdc|commit/i;
const CALL = /call|rfc|bapi|function|submit|workflow|event|proxy/i;

/** What hangs on the program, as far as the analysis read it (G10). The rows the analysis could not read are fixed. */
export function designDependencies(findings: readonly ItFindingRow[]): { read: DependencyRow[]; notRead: Array<{ what: string; why: string }> } {
  const by = new Map<string, DependencyRow>();
  for (const f of findings) {
    if (!f.objectName) continue;
    const kindWords = `${f.kind} ${f.kindLabel ?? ''}`;
    const kind: DependencyRow['kind'] = WRITE.test(kindWords) ? 'Writes' : CALL.test(kindWords) ? 'Calls' : 'Reads';
    const key = `${kind}:${f.objectName.toUpperCase()}`;
    const row = by.get(key) ?? { kind, what: f.objectName.toUpperCase(), lines: [] };
    if (!row.lines.includes(f.lineStart)) row.lines.push(f.lineStart);
    by.set(key, row);
  }
  const order: DependencyRow['kind'][] = ['Writes', 'Calls', 'Reads'];
  const read = [...by.values()]
    .map((r) => ({ ...r, lines: [...r.lines].sort((a, b) => a - b) }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.lines[0] - b.lines[0]);
  return {
    read,
    notRead: [
      { what: 'Callers', why: 'Who calls or submits this program. Only this program was uploaded.' },
      { what: 'Background jobs', why: 'Whether it runs as a job, and how often.' },
      { what: 'Transaction', why: 'Whether a transaction code starts it, and who holds it.' },
    ],
  };
}

/* ----------------------------------------------------------- the anchors */

/** The ids of the page's sections, in page order (`lib/page-anchors.ts`, where the guard reads them). */
export const DESIGN_SECTION_IDS = PAGE_ANCHOR_IDS.design;

/**
 * The "On this page" items of one view and case (G12) — the sections the page draws, in its order, at most six.
 * `open` is the number of business questions still open; `objects` the rows of the object table.
 */
export function designAnchors(view: DesignView, c: DesignCase, n: { open: number | null; objects: number; steps: number }): PageAnchor[] {
  const S = DESIGN_SECTION_IDS;
  const a = (key: keyof typeof S, label: string, count?: number | null, open = false): PageAnchor => ({
    key,
    target: S[key],
    label,
    count: count === null || count === undefined || count === 0 ? null : String(count),
    ...(open && count ? { tone: 'open' as const } : {}),
  });
  if (view === 'business') {
    if (c === 'keep') return [a('answer', 'Nothing changes'), a('questions', 'Questions that stay', n.open)];
    if (c === 'retire') return [a('answer', 'What stops'), a('board', 'Steps', n.steps)];
    if (c === 'standard') return [a('answer', 'Living with the standard'), a('board', 'Steps', n.steps)];
    return [a('answer', 'The process after the change'), a('board', 'Before and after', n.steps), a('questions', n.open ? 'Questions' : 'Answers', n.open, true), a('next', 'Next')];
  }
  if (view === 'it') {
    if (c === 'retire') return [a('answer', 'Switch-off'), a('dependencies', 'Read'), a('notRead', 'Not read', 3)];
    if (c === 'keep') return [a('answer', 'What stays'), a('objects', 'Blockers', n.objects)];
    if (c === 'standard') return [a('answer', 'Fit to standard'), a('objects', 'Candidates', n.objects)];
    return [a('answer', 'Target'), a('canvas', 'Architecture'), a('contract', 'Contract'), a('objects', 'Objects', n.objects), a('requirements', 'Requirements')];
  }
  if (c === 'rebuild' || c === 'none') return [a('answer', 'Ready to sign off?'), a('checklist', 'Before sign-off'), a('options', 'Options')];
  return [a('answer', c === 'retire' ? 'Ready to switch off?' : c === 'keep' ? 'What keeping means' : 'Ready to confirm?'), a('options', 'Options')];
}

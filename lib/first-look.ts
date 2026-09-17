/**
 * The first look — `DESIGN.md` §5.1, §5.2, roadmap 2.7.
 *
 * After an import or an example the workspace builds itself in four stages:
 * *Code read · Process recognised · In business language · This is your
 * process*. This module is the whole of what those stages are allowed to say,
 * derived in pure functions so that the one rule of the roadmap row is
 * checkable in one place:
 *
 *   > **Jede Zahl aus dem Run.** Keine Animation, die eine Zahl zeigt, die nicht
 *   > aus der Analyse stammt; keine Etappe, die Fortschritt behauptet, den es
 *   > nicht gibt. Wenn eine Etappe nichts zu zeigen hat, sagt sie das.
 *
 * So every figure below has a named origin, and a stage with nothing to show is
 * a first-class state rather than a zero:
 *
 *   - `run`     — the signed run recorded it (`auditMetadata.inputFingerprint`,
 *                 `worklist`). The strongest thing a number here can be.
 *   - `engine`  — the deterministic engine read it out of the staged source, on
 *                 this machine, now. Same engine, no signature yet.
 *   - `absent`  — nobody measured it. Printed as a word, never as `0`
 *                 (`lib/workspace-rows.ts`: *null is not zero*).
 *
 * **Four stages, four separate pieces of work.** They are exported one by one
 * rather than as one call, because `DESIGN.md` §5.4 forbids an artificial
 * minimum duration and §5.1 asks for *"die echten Ereignisse der Engine in ihrer
 * Reihenfolge"*. A build-up on a timer would be the six seconds of the old
 * evidence scanner with four labels on it. The screen runs the four calls in
 * order and reveals each stage on the return of its own call; on a small source
 * all four land in one frame, and that is the correct outcome.
 *
 * **What is deliberately not recomputed here.** The finding count comes from the
 * run's worklist and never from `buildAbapEvidence` on the client. Two reasons,
 * and the second is the one that matters: the merged SAP catalog behind that
 * function is 4.3 MB of generated JSON, and pulling it into the workspace route
 * to print a number the run already carries would ship a catalog to a browser to
 * recompute an answer we were handed. A project with no run therefore has no
 * finding count, which is the honest answer and the one the list report already
 * gives.
 *
 * **No model call.** Stage 3 is the only one that depends on one, and it depends
 * on a *stored* naming (roadmap 2.4) that is passed in. Nothing in this file
 * calls Gemini, builds a prompt or waits for one.
 */

import { buildProcessFacts } from './abap/process-facts';
import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import { deriveBusinessRulesFrom, type BusinessRuleSet } from './abap/business-rule-set';
import { readTableDependencies } from './abap/table-dependencies';
import {
  applyNaming,
  namingContextFrom,
  type NamedProcess,
  type NamingContext,
  type ProcessNamingRecord,
} from './process-naming';
import type { ModelAbsence } from './model-stages';
import type { RulePropertyValue } from './rule-property';
import { notDetermined, type NotDetermined } from './workspace-model';
import type { Project } from './types';

/* ------------------------------------------------------- the second visit */

/**
 * *„Ein zweiter Besuch hat keinen Aufbau"* — `DESIGN.md` §5.2.
 *
 * In the browser and only in the browser, for the same reason the coach marks
 * are (ADR-036, `lib/coach-marks.ts`): what a person has already seen is not a
 * fact about the case, and it does not belong on the account. Keyed by project
 * because the build-up is about *this* code — a second project is a second first
 * look.
 *
 * Every access is wrapped. When storage cannot be read the answer is "not seen",
 * so the build-up runs again: a build-up shown twice is a few hundred
 * milliseconds, and one suppressed by a failed read is the whole point of the
 * step gone missing.
 */
export const FIRST_LOOK_SEEN_KEY = 'cc.workspace.firstLook.seen';

export function firstLookSeen(projectId: string): boolean {
  try {
    const raw = window.localStorage.getItem(FIRST_LOOK_SEEN_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(projectId);
  } catch {
    return false;
  }
}

export function markFirstLookSeen(projectId: string): void {
  try {
    const raw = window.localStorage.getItem(FIRST_LOOK_SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const seen = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    // Bounded: a browser that opens a hundred projects should not carry a
    // hundred ids for ever, and the oldest is the one least likely to be re-read.
    window.localStorage.setItem(
      FIRST_LOOK_SEEN_KEY,
      JSON.stringify([...new Set([...seen, projectId])].slice(-50)),
    );
  } catch {
    /* private window, blocked site data — the build-up runs once more */
  }
}

/* ------------------------------------------------------------------ anchors */

/** `L243`, or `L380-412` when the range spans more than one line. */
export function anchorLabel(lineStart: number, lineEnd?: number | null): string {
  return typeof lineEnd === 'number' && lineEnd > lineStart
    ? `L${lineStart}-${lineEnd}`
    : `L${lineStart}`;
}

/* ------------------------------------------------------------------- stages */

export const FIRST_LOOK_STAGE_IDS = [
  'code-read',
  'process-recognised',
  'business-language',
  'your-process',
] as const;

export type FirstLookStageId = (typeof FIRST_LOOK_STAGE_IDS)[number];

/** The four labels of `DESIGN.md` §5.2, in one place, in English (ADR-009). */
export const STAGE_LABELS: Record<FirstLookStageId, string> = {
  'code-read': 'Code read',
  'process-recognised': 'Process recognised',
  'business-language': 'In business language',
  'your-process': 'This is your process',
};

/** Where a number came from. Rendered as a word beside it — never implied. */
export type FigureOrigin = 'run' | 'engine' | 'absent';

export interface FirstLookFigure {
  key: string;
  /** "lines", "tables", "findings" — §5.2. */
  label: string;
  /**
   * The figure, already formatted, or `null` when nothing measured it. A caller
   * that prints `value ?? 0` has reintroduced the defect this field exists for.
   */
  value: string | null;
  origin: FigureOrigin;
  /** Why there is no figure. Set exactly when `origin` is `absent`. */
  absentReason?: string;
}

export type StageState =
  /** The stage measured something and says what. */
  | 'measured'
  /** The stage ran and there was nothing of its kind in this source. */
  | 'nothing-found'
  /** The stage did not happen at all, and the reason is given. */
  | 'did-not-run';

export interface FirstLookStage {
  id: FirstLookStageId;
  label: string;
  state: StageState;
  /** The one line this stage contributes. Never empty, never a percentage. */
  result: string;
  figures: FirstLookFigure[];
}

/* ------------------------------------------------- the fourth stage's content */

export interface RevealedRule {
  id: string;
  /** The condition as the source writes it. Code, not a business name. */
  label: string;
  property: RulePropertyValue;
  /** Every place the rule stands, not a range from the first to the last. */
  anchors: string[];
}

export interface DecisionLine {
  nodeId: string;
  /** The gateway's label — a token out of the source (skeleton rule 6). */
  label: string;
  anchor: string | null;
  /** The branch conditions leaving it, as written. */
  branches: string[];
}

export interface ProcessName {
  /** The program's own name, upper-cased, or null when the source names none. */
  name: string | null;
  /** Set exactly when `name` is null. */
  reason?: string;
}

export interface Traceability {
  anchored: number;
  nodes: number;
  /** "12 of 14 elements carry a line anchor" — the sentence, built once. */
  sentence: string;
}

export interface FirstLook {
  /** True when nothing has been staged. Every stage then says `did-not-run`. */
  noSource: boolean;
  stages: FirstLookStage[];
  processName: ProcessName;
  traceability: Traceability;
  decisions: DecisionLine[];
  /** The reveal line of §5.1 — the rules that stand in the program. */
  reveal: { count: number; rules: RevealedRule[] };
  notDetermined: NotDetermined;
}

/* ------------------------------------------------------------------ helpers */

/** Node kinds that are steps. A gateway, a start and an end are not steps. */
const NOT_A_STEP = new Set(['start', 'end', 'end-error', 'gateway', 'error-boundary']);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function gatewaysOf(skeleton: ProcessSkeleton): SkeletonNode[] {
  return skeleton.nodes.filter((n) => n.kind === 'gateway');
}

/* ------------------------------------------------- the four pieces of work */

export interface ProcessReading {
  context: NamingContext;
  skeleton: ProcessSkeleton;
  facts: ReturnType<typeof buildProcessFacts>;
}

/** Stage 1's own work: which tables this source depends on. */
export function readTables(source: string): Set<string> {
  return new Set(readTableDependencies(source).dependencies.map((d) => d.table));
}

/** Stage 2's own work: the skeleton, and the context a naming applies to. */
export function readProcess(source: string): ProcessReading {
  const facts = buildProcessFacts(source);
  const context = namingContextFrom(facts);
  return { facts, context, skeleton: context.skeleton };
}

/** Stage 4's own work: the business rules that stand in the program. */
export function readRules(source: string, process: ProcessReading): BusinessRuleSet {
  return deriveBusinessRulesFrom(source, process.facts, process.skeleton);
}

export interface SourceReading {
  skeleton: ProcessSkeleton;
  ruleSet: BusinessRuleSet;
  context: NamingContext;
  tables: ReadonlySet<string>;
}

/** All of it, for a caller that has no reason to stage the work. */
export function readSource(source: string): SourceReading {
  const process = readProcess(source);
  return {
    skeleton: process.skeleton,
    context: process.context,
    ruleSet: readRules(source, process),
    tables: readTables(source),
  };
}

/* ----------------------------------------------------------- stage builders */

/**
 * The line count, preferring the one the run signed.
 *
 * The same order `lib/workspace-rows.ts` uses, for the same reason: a recorded
 * count belongs to a signed run, a counted one belongs to text nobody has
 * analysed yet, and the reader is told which of the two they are looking at.
 */
function lineFigure(project: Project | null, source: string): FirstLookFigure {
  const recorded = project?.auditMetadata?.inputFingerprint?.lineCount;
  if (typeof recorded === 'number') {
    return { key: 'lines', label: 'lines', value: String(recorded), origin: 'run' };
  }
  if (!source.trim()) {
    return { key: 'lines', label: 'lines', value: null, origin: 'absent', absentReason: 'nothing staged' };
  }
  return { key: 'lines', label: 'lines', value: String(source.split(/\r?\n/).length), origin: 'engine' };
}

/**
 * The finding count — from the run, or not at all.
 *
 * `worklist` is written beside the signed run by `/api/runs/create`. Without a
 * run there is no count: `0` would report the result of an analysis that never
 * happened, which is the defect `lib/workspace-rows.ts` names in its header.
 */
function findingFigure(project: Project | null): FirstLookFigure {
  const hasRun = typeof project?.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  if (hasRun && Array.isArray(project?.worklist)) {
    return { key: 'findings', label: 'findings', value: String(project.worklist.length), origin: 'run' };
  }
  return { key: 'findings', label: 'findings', value: null, origin: 'absent', absentReason: 'not analysed' };
}

/**
 * Stage 1 — *Code read*.
 *
 * `DESIGN.md` §5.2 names four counters: lines, programs, tables, findings. Three
 * of them are here and "programs" is not, deliberately: one upload is one
 * program, so a counter that always reads `1` is decoration, and the program's
 * *name* is the more useful fact — it is stage 4's process name. Where a source
 * names includes it does not carry, that is a genuine second number and stage 2
 * reports it, because it comes out of the skeleton and not out of this stage.
 */
export function codeReadStage(project: Project | null, tables: ReadonlySet<string>): FirstLookStage {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const lines = lineFigure(project, source);
  const findings = findingFigure(project);
  return {
    id: 'code-read',
    label: STAGE_LABELS['code-read'],
    state: source.trim() ? 'measured' : 'did-not-run',
    result: !source.trim()
      ? 'No source has been staged, so nothing was read.'
      : findings.value === null
        ? `${lines.value} lines read. No run has analysed this source, so there is no finding count.`
        : `${lines.value} lines, ${plural(Number(findings.value), 'finding', 'findings')}.`,
    figures: source.trim()
      ? [lines, { key: 'tables', label: 'tables', value: String(tables.size), origin: 'engine' }, findings]
      : [],
  };
}

/** Stage 2 — *Process recognised*. Steps, decisions, start and end (roadmap 2.3). */
export function processStage(skeleton: ProcessSkeleton): FirstLookStage {
  const steps = skeleton.nodes.filter((n) => !NOT_A_STEP.has(n.kind)).length;
  const decisions = gatewaysOf(skeleton).length;
  const starts = skeleton.nodes.filter((n) => n.kind === 'start').length;
  const ends = skeleton.nodes.filter((n) => n.kind === 'end' || n.kind === 'end-error').length;
  const includesNotRead = skeleton.notes.filter((n) => n.reason === 'include-not-read').length;

  if (skeleton.nodes.length === 0) {
    return {
      id: 'process-recognised',
      label: STAGE_LABELS['process-recognised'],
      state: 'nothing-found',
      result:
        'No entry point and no statement with an effect — the engine drew no process from this source.',
      figures: [],
    };
  }

  return {
    id: 'process-recognised',
    label: STAGE_LABELS['process-recognised'],
    state: 'measured',
    result: `${plural(steps, 'step', 'steps')}, ${plural(decisions, 'decision', 'decisions')}, ${plural(starts, 'start', 'starts')}, ${plural(ends, 'end', 'ends')}.`,
    figures: [
      { key: 'steps', label: 'steps', value: String(steps), origin: 'engine' },
      { key: 'decisions', label: 'decisions', value: String(decisions), origin: 'engine' },
      { key: 'starts', label: 'starts', value: String(starts), origin: 'engine' },
      { key: 'ends', label: 'ends', value: String(ends), origin: 'engine' },
      {
        key: 'includes',
        label: 'includes named, not read',
        value: String(includesNotRead),
        origin: 'engine',
      },
    ],
  };
}

/**
 * Stage 3 — *In business language*.
 *
 * `DESIGN.md` §5.2: without a model call the stage falls away and the skeleton
 * keeps its technical names — *ein gültiges Ergebnis*. `applyNaming` already
 * writes that sentence, including the reason for the absence, so it is used
 * rather than restated: two surfaces with two explanations for the same absence
 * is how a reader learns to trust neither.
 */
export function businessLanguageStage(named: NamedProcess): FirstLookStage {
  if (named.state === 'named' && named.counts.named > 0) {
    return {
      id: 'business-language',
      label: STAGE_LABELS['business-language'],
      state: 'measured',
      result: `${named.counts.named} of ${named.counts.nodes} elements carry a business name; ${plural(named.counts.lanes, 'lane', 'lanes')} proposed.`,
      figures: [
        { key: 'named', label: 'named', value: String(named.counts.named), origin: 'engine' },
        { key: 'lanes', label: 'lanes', value: String(named.counts.lanes), origin: 'engine' },
      ],
    };
  }
  return {
    id: 'business-language',
    label: STAGE_LABELS['business-language'],
    state: 'did-not-run',
    result:
      named.notice ?? 'No business names were applied. The technical names of the source are kept.',
    figures: [],
  };
}

/** Stage 4 — *This is your process*. Traceability, rules and what is open. */
export function yourProcessStage(
  rules: readonly RevealedRule[],
  traceability: Traceability,
  open: NotDetermined,
): FirstLookStage {
  return {
    id: 'your-process',
    label: STAGE_LABELS['your-process'],
    state: 'measured',
    result:
      rules.length > 0
        ? `${plural(rules.length, 'business rule is', 'business rules are')} hard-coded in the program.`
        : 'No hard-coded business rule was found in this source. That is the boundary of what the rule reader looks for, not a statement about your process.',
    figures: [
      {
        key: 'traceability',
        label: 'anchored elements',
        value: `${traceability.anchored} of ${traceability.nodes}`,
        origin: 'engine',
      },
      { key: 'rules', label: 'rules', value: String(rules.length), origin: 'engine' },
      {
        key: 'not-determined',
        label: 'not determined',
        value: open.noSource ? null : String(open.count),
        origin: open.noSource ? 'absent' : 'engine',
        ...(open.noSource ? { absentReason: 'nothing staged' } : {}),
      },
    ],
  };
}

/* ------------------------------------------------------- derived, for stage 4 */

/** The source's own program name, from the rule set that already reads it. */
export function processNameOf(ruleSet: BusinessRuleSet): ProcessName {
  if (ruleSet.program) return { name: ruleSet.program };
  return {
    name: null,
    reason:
      'This source carries no REPORT, PROGRAM, FUNCTION-POOL or CLASS-POOL statement, so it names no program. The process is shown under the technical names of its own steps.',
  };
}

export function revealedRules(ruleSet: BusinessRuleSet): RevealedRule[] {
  return ruleSet.rules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    property: rule.property,
    anchors: [
      ...new Set(
        rule.sentences.flatMap((s) => s.anchors.map((a) => anchorLabel(a.lineStart, a.lineEnd))),
      ),
    ],
  }));
}

export function decisionLines(skeleton: ProcessSkeleton): DecisionLine[] {
  return gatewaysOf(skeleton).map((node) => ({
    nodeId: node.id,
    label: node.label,
    anchor: node.anchor ? anchorLabel(node.anchor.lineStart, node.anchor.lineEnd) : null,
    branches: skeleton.edges
      .filter((e) => e.from === node.id && e.condition.length > 0)
      .map((e) => e.condition),
  }));
}

export function traceabilityOf(named: NamedProcess): Traceability {
  return {
    anchored: named.counts.anchored,
    nodes: named.counts.nodes,
    sentence:
      named.counts.nodes === 0
        ? 'No elements — nothing has been read.'
        : `${named.counts.anchored} of ${named.counts.nodes} elements carry a line anchor.`,
  };
}

/* -------------------------------------------------------------- the builder */

/**
 * The complete model of one project's first look.
 *
 * `reading` is the four pieces of work, already done. `record` is the stored
 * naming of roadmap 2.4 (`fetchProcessNaming`), or null; `absence` says why
 * there is none where that is known (`lib/model-stages.ts`). Neither is
 * required: without them stage 3 says it did not run and gives the reason.
 */
export function buildFirstLook(
  project: Project | null,
  reading: SourceReading | null = null,
  record: ProcessNamingRecord | null = null,
  absence: ModelAbsence = null,
): FirstLook {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const open = notDetermined(project);

  if (!source.trim()) {
    const nothing = (id: FirstLookStageId): FirstLookStage => ({
      id,
      label: STAGE_LABELS[id],
      state: 'did-not-run',
      result: 'No source has been staged, so this stage did not run.',
      figures: [],
    });
    return {
      noSource: true,
      stages: [
        nothing('code-read'),
        nothing('process-recognised'),
        nothing('business-language'),
        nothing('your-process'),
      ],
      processName: { name: null, reason: 'No source has been staged, so nothing names a program.' },
      traceability: { anchored: 0, nodes: 0, sentence: 'No elements — nothing has been read.' },
      decisions: [],
      reveal: { count: 0, rules: [] },
      notDetermined: open,
    };
  }

  // One reading of the source for all four stages. Reading it twice is how two
  // line numbers for the same `IF` get onto one screen (`process-facts.ts`).
  const { skeleton, ruleSet, context, tables } = reading ?? readSource(source);
  const named = applyNaming(context, record, absence);

  const rules = revealedRules(ruleSet);
  const traceability = traceabilityOf(named);

  return {
    noSource: false,
    stages: [
      codeReadStage(project, tables),
      processStage(skeleton),
      businessLanguageStage(named),
      yourProcessStage(rules, traceability, open),
    ],
    processName: processNameOf(ruleSet),
    traceability,
    decisions: decisionLines(skeleton),
    reveal: { count: rules.length, rules },
    notDetermined: open,
  };
}

import { buildProcessFacts, type ProcessFacts } from './process-facts';
import { assessCoverage, type CoverageReport, type UnassessedConstruct } from './coverage';
import { RETIREMENT_WINDOW_DAYS, type UsageReport } from './usage-model';
import type { AbapStatement } from './statement-reader';

/**
 * Roadmap 7.5 — *Prüfaufträge statt Scheinwissen*: "zu kurzes Nutzungsfenster,
 * fehlendes Include, dynamischer Aufruf werden Aufgaben, keine Urteile."
 *
 * Three places where this product knows, on purpose, that it does not know
 * enough — and where the absence has a habit of turning into its most flattering
 * reading:
 *
 *   1. **A usage window that is too short.** Forty days with no execution is not
 *      disuse; it is forty days. `DESIGN.md` §5.6 puts the threshold at thirteen
 *      months precisely because "period-end and year-end programs run once a
 *      year", and `usage-join.ts` already refuses to bucket a zero as dormant
 *      below it. What was missing is the other half: the work that would settle
 *      it.
 *   2. **An include whose text was never read.** `INCLUDE z_mm_po_notify` names
 *      a file this run does not have. Zero findings in it is not a reading of
 *      it.
 *   3. **A call whose target is computed.** `CALL FUNCTION lv_fm_name` reaches
 *      something. A call graph that draws no edge has not established that
 *      nothing is reached.
 *
 * **A task is a question, not a verdict.** Nothing here carries a status, a
 * score or an outcome, and no sentence it writes may read as one. That is the
 * line the step stands on, and `tests/review-tasks-guard.spec.ts` sweeps every
 * sentence of every task derived from the eight programs this product ships.
 *
 * **The same shape as its two neighbours.** `CounterCheckScenario.blocked` and
 * `StandardCapability.notDetermined` are both `{ reason, detail }` — a machine
 * reason next to the sentence a reader gets. A third form for the same idea is
 * how a product ends up with three "not determined" columns that cannot be
 * compared, so this is the second copy of that shape, not a new one. Roadmap 7.8
 * consumes a task as exactly the *Not determined mit Grund* it asks for.
 *
 * Deterministic: no model, no network, no key. Everything is read out of the
 * statement list `process-facts.ts` produces, the coverage report the evidence
 * engine already carries, and — when one was imported — the usage report.
 */

/* ------------------------------------------------------------------ types */

/** The three absences of roadmap 7.5, in the row's own order. */
export type ReviewTaskKind = 'usage-window' | 'include-not-read' | 'dynamic-call';

/**
 * Why the thing is open, one step finer than the kind.
 *
 * The same field `CounterCheckScenario.blocked.reason` and
 * `StandardCapability.notDetermined.reason` carry: something a surface can group
 * and count on, so the sentence never has to be parsed.
 */
export type ReviewTaskReason =
  /** A monitoring window was declared, and it is shorter than thirteen months. */
  | 'window-shorter-than-13-months'
  /** No monitoring window was declared at all, so its length is not part of the import. */
  | 'window-not-declared'
  /** An `INCLUDE` names a source this run does not hold. */
  | 'include-text-not-in-source'
  /** The name of a called routine, module, report or transaction is computed at run time. */
  | 'call-target-computed'
  /** The name of a class or a method is computed at run time. */
  | 'class-or-method-computed';

/**
 * What a task points at.
 *
 * `line` for everything the source says, `name` for an include or the expression
 * that will hold a target, `import` for the usage export a window belongs to.
 * Every task carries at least one; a task nobody can follow to its evidence is
 * the thing this step exists to remove.
 */
export type ReviewTaskAnchorKind = 'line' | 'name' | 'import';

export interface ReviewTaskAnchor {
  kind: ReviewTaskAnchorKind;
  /** `L470`, `Z_MM_PO_NOTIFY`, `lv_fm_name`, `SCMON import, 2026-01-01 to 2026-02-09 (40 days)`. */
  label: string;
  /** Set on a `line` anchor, `null` otherwise. */
  lineStart: number | null;
  lineEnd: number | null;
}

export interface ReviewTask {
  /** `RT-001`, in source order, the usage window last. Stable per source and import. */
  id: string;
  kind: ReviewTaskKind;
  /**
   * Why this is open — the shape `CounterCheckScenario.blocked` and
   * `StandardCapability.notDetermined` have, for the same reason they have it.
   */
  notDetermined: { reason: ReviewTaskReason; detail: string };
  /** At least one, always. Source order. */
  anchors: ReviewTaskAnchor[];
  /**
   * What to do, in one imperative sentence somebody can carry out and somebody
   * else can check was carried out. Never "review", never "consider".
   */
  task: string;
  /**
   * The sentence this product does not write while the task is open — the one
   * that would be knowledge nobody established. It names the inference, it does
   * not make it.
   */
  withheld: string;
}

export interface ReviewTasks {
  tasks: ReviewTask[];
  counts: {
    total: number;
    byKind: Record<ReviewTaskKind, number>;
  };
  /** True when there is no source to read — a different thing from zero tasks. */
  noSource: boolean;
  /**
   * False when no usage import was passed. Then nothing is known about a window
   * either way, and no window task is raised about this reading — `DESIGN.md`
   * §5.6: without an import there is no route from usage to a retirement at all,
   * so there is no claim here to hold open.
   */
  usageConsulted: boolean;
}

export interface ReviewTaskOptions {
  /** The usage import, when one was made. */
  usage?: UsageReport | null;
}

/* ------------------------------------------------------------ entry points */

/** Review tasks for one ABAP source. No model, no network. */
export function deriveReviewTasks(source: string, options: ReviewTaskOptions = {}): ReviewTasks {
  const hasSource = typeof source === 'string' && source.trim().length > 0;
  if (!hasSource) {
    return assemble([], usageTask(options.usage ?? null), true, Boolean(options.usage));
  }
  return deriveReviewTasksFrom(buildProcessFacts(source), assessCoverage(source), options);
}

/**
 * The same tasks for a caller that already read the source.
 *
 * Both arguments are things the analysis path holds anyway: `ProcessFacts` is
 * what the process skeleton of roadmap 2.3 is built from, and `CoverageReport`
 * is `AbapEvidenceReport.coverage`. Reading the source a second time here is how
 * two line numbers for the same statement get into one screen, which is the
 * reason `process-facts.ts` exists at all.
 */
export function deriveReviewTasksFrom(
  facts: ProcessFacts,
  coverage: CoverageReport,
  options: ReviewTaskOptions = {},
): ReviewTasks {
  const fromSource = [...includeTasks(facts.statements), ...dynamicCallTasks(facts, coverage)].sort(
    (a, b) => a.line - b.line,
  );
  return assemble(
    fromSource.map((entry) => entry.draft),
    usageTask(options.usage ?? null),
    facts.statements.length === 0,
    Boolean(options.usage),
  );
}

/* ------------------------------------------------------- 1 — the includes */

/**
 * `INCLUDE zfoo.` names a source this run does not hold.
 *
 * `INCLUDE STRUCTURE` is excluded for the reason `process-skeleton.ts` excludes
 * it from the same list: it is a declaration of a flat structure inside a type,
 * not a second file.
 */
function includeTasks(statements: readonly AbapStatement[]): Draft[] {
  const out: Draft[] = [];
  for (const statement of statements) {
    if (statement.keyword !== 'INCLUDE') continue;
    if (/^INCLUDE\s+STRUCTURE\b/i.test(statement.text)) continue;

    const name = /^INCLUDE\s+([\w/]+)/i.exec(statement.text)?.[1]?.toUpperCase() ?? null;
    const named = name ? `the include ${name}` : 'an include';
    const anchors: ReviewTaskAnchor[] = [lineAnchor(statement.lineStart, statement.lineEnd)];
    if (name) anchors.push({ kind: 'name', label: name, lineStart: null, lineEnd: null });

    out.push({
      line: statement.lineStart,
      draft: {
        kind: 'include-not-read',
        notDetermined: {
          reason: 'include-text-not-in-source',
          detail:
            `Line ${statement.lineStart} names ${named}, and the text of that include is not part of the ` +
            'source this reading holds. Whatever it declares, calls or writes stands outside every figure here.',
        },
        anchors,
        task: name
          ? `Add the source of ${name} to this project and read it with the rest.`
          : 'Add the source of the include named on this line to this project and read it with the rest.',
        withheld: 'That what this reading found is everything the program does.',
      },
    });
  }
  return out;
}

/* -------------------------------------------------- 2 — the dynamic calls */

/** What a computed name stands in the way of naming. */
interface DynamicShape {
  reason: ReviewTaskReason;
  /** `function module`, `subroutine`, `class` — as the sentence needs it. */
  singular: string;
  plural: string;
}

const SHAPES: Record<string, DynamicShape> = {
  'function-module': { reason: 'call-target-computed', singular: 'function module', plural: 'function modules' },
  perform: { reason: 'call-target-computed', singular: 'subroutine', plural: 'subroutines' },
  transaction: { reason: 'call-target-computed', singular: 'transaction', plural: 'transactions' },
  submit: { reason: 'call-target-computed', singular: 'report', plural: 'reports' },
  method: { reason: 'class-or-method-computed', singular: 'method', plural: 'methods' },
  class: { reason: 'class-or-method-computed', singular: 'class', plural: 'classes' },
};

/**
 * Two readers, because neither of them sees all of it.
 *
 * `call-graph.ts` marks `PERFORM`, `CALL FUNCTION`, `CALL TRANSACTION` and
 * `SUBMIT` dynamic and knows which routine the call stands in. It deliberately
 * does not read `CALL METHOD` or `CREATE OBJECT` at all ("what is deliberately
 * not read", its own header), and those are the dynamic classes the roadmap row
 * names — they come out of `coverage.ts`, which records them as
 * `dynamic-invocation`. A statement both of them see is one task: the line is
 * the key, and the call graph's reading wins because it carries the caller.
 *
 * `ASSIGN (lv_name)` is left out. `coverage.ts` groups it under the same gap,
 * and it is the same kind of absence — but it is a field access, not a call, and
 * 7.5 names calls. It is still recorded as unassessed where it always was.
 */
function dynamicCallTasks(facts: ProcessFacts, coverage: CoverageReport): Draft[] {
  const seen = new Set<number>();
  const out: Draft[] = [];

  const push = (line: number, lineEnd: number, text: string, shape: DynamicShape, caller: string | null) => {
    if (seen.has(line)) return;
    seen.add(line);
    const target = computedName(text);
    const anchors: ReviewTaskAnchor[] = [lineAnchor(line, lineEnd)];
    if (target) anchors.push({ kind: 'name', label: target, lineStart: null, lineEnd: null });

    const from = target ? ` from ${target}` : '';
    const where = caller ? ` in ${caller}` : '';
    out.push({
      line,
      draft: {
        kind: 'dynamic-call',
        notDetermined: {
          reason: shape.reason,
          detail:
            `Line ${line}${where} takes the name of the ${shape.singular} it reaches${from}, a value the ` +
            'program works out while it runs. The source names no target for this call.',
        },
        anchors,
        task: target
          ? `Name the ${shape.plural} ${target} takes at run time, from the values written to it or from a trace of a real run.`
          : `Name the ${shape.plural} this call reaches at run time, from the values written to its name or from a trace of a real run.`,
        withheld: `That the ${shape.plural} this program reaches are the ones its source spells out.`,
      },
    });
  };

  for (const call of facts.calls.performs) {
    if (call.dynamic) push(call.lineStart, call.lineEnd, call.text, SHAPES.perform, call.caller);
  }
  for (const call of facts.calls.functionModules) {
    if (call.dynamic) push(call.lineStart, call.lineEnd, call.text, SHAPES['function-module'], call.caller);
  }
  for (const call of facts.calls.transactions) {
    if (call.dynamic) push(call.lineStart, call.lineEnd, call.text, SHAPES.transaction, call.caller);
  }
  for (const call of facts.calls.submits) {
    if (call.dynamic) push(call.lineStart, call.lineEnd, call.text, SHAPES.submit, call.caller);
  }
  for (const construct of coverage.unassessed) {
    if (construct.gap !== 'dynamic-invocation') continue;
    const shape = shapeOfStatement(construct);
    if (!shape) continue;
    push(construct.line, construct.line, construct.snippet, shape, null);
  }

  return out;
}

/** The shape of a statement `coverage.ts` recorded, read off its own text. */
function shapeOfStatement(construct: UnassessedConstruct): DynamicShape | null {
  const upper = construct.snippet.toUpperCase().trim();
  if (/^CALL\s+FUNCTION\b/.test(upper)) return SHAPES['function-module'];
  if (/^PERFORM\b/.test(upper)) return SHAPES.perform;
  if (/^CALL\s+TRANSACTION\b/.test(upper)) return SHAPES.transaction;
  if (/^SUBMIT\b/.test(upper)) return SHAPES.submit;
  if (/^CALL\s+METHOD\b/.test(upper)) return SHAPES.method;
  if (/^CREATE\s+OBJECT\b/.test(upper)) return SHAPES.class;
  // `ASSIGN (lv_name)` and anything else this gap collects: not a call.
  return null;
}

/**
 * The expression that will hold the target, exactly as the source writes it.
 *
 * `null` when none of the forms below fits, and then the task points at the line
 * alone. An expression guessed out of a statement this reader does not
 * understand would be an anchor to the wrong thing, which is worse than one
 * anchor fewer.
 */
function computedName(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  const patterns: RegExp[] = [
    // CALL METHOD (class)=>(meth) · CALL METHOD lo_x->(lv_m) · CREATE OBJECT (lv_cls)
    /^CALL\s+METHOD\s+[\w<>/~-]*(?:->|=>)\s*\(\s*([^)\s]+)\s*\)/i,
    /^CALL\s+METHOD\s*\(\s*([^)\s]+)\s*\)/i,
    /^CREATE\s+OBJECT\s*\(\s*([^)\s]+)\s*\)/i,
    // PERFORM (lv_form) · SUBMIT (lv_prog)
    /^PERFORM\s*\(\s*([^)\s]+)\s*\)/i,
    /^SUBMIT\s*\(\s*([^)\s]+)\s*\)/i,
    // PERFORM form IN PROGRAM (lv_prog)
    /^PERFORM\s+[\w/]+\s+IN\s+PROGRAM\s*\(\s*([^)\s]+)\s*\)/i,
    // CALL FUNCTION lv_name · CALL TRANSACTION lv_tcode · SUBMIT lv_prog — a
    // bare token, and only where it is not a literal: a quoted name is not
    // computed and never reaches here.
    /^CALL\s+FUNCTION\s+([\w/<>-]+)/i,
    /^CALL\s+TRANSACTION\s+([\w/<>-]+)/i,
    /^SUBMIT\s+([\w/<>-]+)/i,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(flat)?.[1];
    if (found && !/^['"`]/.test(found)) return found;
  }
  return null;
}

/* ------------------------------------------------- 3 — the usage window */

/**
 * A zero count is a measurement of disuse only across a window long enough to
 * contain every periodic run.
 *
 * The condition is `usage-join.ts`'s own, down to the constant: a task appears
 * exactly where that module refuses to call a measured zero dormant. Two
 * thresholds for one question is how a screen comes to show a retirement
 * candidate next to the sentence explaining why it cannot be one.
 */
function usageTask(usage: UsageReport | null): Draft | null {
  if (!usage) return null;
  const days = usage.window?.days ?? 0;
  if (days >= RETIREMENT_WINDOW_DAYS) return null;

  const declared = usage.window ?? null;
  const zeros = usage.records.filter((record) => record.callCount === 0).map((record) => record.objectName);
  const source = (usage.source ?? 'manual').toUpperCase();

  const anchors: ReviewTaskAnchor[] = [
    {
      kind: 'import',
      label: declared
        ? `${source} import, ${declared.from} to ${declared.to} (${declared.days} days)`
        : `${source} import of ${usage.importedAt.slice(0, 10)}, no window declared`,
      lineStart: null,
      lineEnd: null,
    },
    ...zeros.slice(0, OBJECT_ANCHOR_LIMIT).map(
      (objectName): ReviewTaskAnchor => ({ kind: 'name', label: objectName, lineStart: null, lineEnd: null }),
    ),
  ];

  const counted =
    zeros.length === 0
      ? ' No object in this import has a count of zero.'
      : ` ${zeros.length} ${zeros.length === 1 ? 'object' : 'objects'} in this import ${
          zeros.length === 1 ? 'has' : 'have'
        } a count of zero${
          zeros.length > OBJECT_ANCHOR_LIMIT ? `, of which the first ${OBJECT_ANCHOR_LIMIT} are named here` : ''
        }.`;

  return {
    line: Number.MAX_SAFE_INTEGER,
    draft: {
      kind: 'usage-window',
      notDetermined: {
        reason: declared ? 'window-shorter-than-13-months' : 'window-not-declared',
        detail: declared
          ? `The import declares a monitoring window of ${declared.days} days, ${declared.from} to ` +
            `${declared.to}. Thirteen months — ${RETIREMENT_WINDOW_DAYS} days — is the stretch that holds a ` +
            'month-end, a quarter-end and a year-end run, and this one is shorter, so a count of zero in it ' +
            `is a count for ${declared.days} days.${counted}`
          : 'The import declares no monitoring window, so how long the export measured is not part of it. ' +
            `Thirteen months — ${RETIREMENT_WINDOW_DAYS} days — is the stretch that holds a month-end, a ` +
            `quarter-end and a year-end run, and this import does not say whether it covers one.${counted}`,
      },
      anchors,
      task: declared
        ? `Import usage over at least ${RETIREMENT_WINDOW_DAYS} days ending after a year-end close, and read the objects with a count of zero again.`
        : `Declare the monitoring window with the import, covering at least ${RETIREMENT_WINDOW_DAYS} days and ending after a year-end close.`,
      withheld: 'That an object with no execution inside this window is one nobody calls any more.',
    },
  };
}

/** How many object names a window task points at before the count carries the rest. */
const OBJECT_ANCHOR_LIMIT = 10;

/* -------------------------------------------------------------- assembly */

/** A task before it has an id, with the line it sorts on. */
interface Draft {
  line: number;
  draft: Omit<ReviewTask, 'id'>;
}

function lineAnchor(lineStart: number, lineEnd: number): ReviewTaskAnchor {
  return {
    kind: 'line',
    label: lineStart === lineEnd ? `L${lineStart}` : `L${lineStart}–L${lineEnd}`,
    lineStart,
    lineEnd,
  };
}

function assemble(
  fromSource: Array<Omit<ReviewTask, 'id'>>,
  usage: Draft | null,
  noSource: boolean,
  usageConsulted: boolean,
): ReviewTasks {
  // The window task last on purpose: it belongs to the import, not to the
  // source, so an import arriving later must not renumber the source's tasks.
  const drafts = [...fromSource, ...(usage ? [usage.draft] : [])];
  const tasks: ReviewTask[] = drafts.map((draft, index) => ({
    id: `RT-${String(index + 1).padStart(3, '0')}`,
    ...draft,
  }));

  const byKind: Record<ReviewTaskKind, number> = {
    'usage-window': 0,
    'include-not-read': 0,
    'dynamic-call': 0,
  };
  for (const task of tasks) byKind[task.kind] += 1;

  return {
    tasks,
    counts: { total: tasks.length, byKind },
    noSource,
    usageConsulted,
  };
}

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  deriveReviewTasks,
  deriveReviewTasksFrom,
  type ReviewTask,
  type ReviewTaskKind,
  type ReviewTasks,
} from '../lib/abap/review-tasks';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { assessCoverage } from '../lib/abap/coverage';
import { RETIREMENT_WINDOW_DAYS } from '../lib/abap/usage-model';
import { parseUsage } from '../lib/abap/usage-parser';
import { joinUsageWithEvidence } from '../lib/abap/usage-join';
import {
  REVIEW_TASKS_LEAD,
  REVIEW_TASKS_METHOD,
  REVIEW_TASKS_NONE_TITLE,
  reviewTasksNoneLine,
  reviewTasksTitle,
} from '../components/ReviewTasks';

/**
 * Roadmap 7.5 — *Prüfaufträge statt Scheinwissen*, and V25-A05: "ein zu kurzes
 * Fenster erzeugt einen Prüfauftrag."
 *
 * Three absences the product knows about on purpose, and the same failure
 * waiting behind each of them: the absence gets filled with its most flattering
 * reading. Forty days without an execution becomes "nobody uses this". An
 * include nobody read becomes "nothing in there". A call whose target the
 * program works out at run time becomes "nothing is called". Each of those is a
 * sentence about somebody's production system that nobody established, and each
 * of them has been printed somewhere in this product's history.
 *
 * So the module turns them into work, and this file holds the line the step
 * stands on: **a task is a question, not a verdict.** No status field, no
 * outcome, no word that reads as one — swept over every sentence the module
 * produces from the eight programs this product ships and from the snippets
 * none of them contains.
 *
 * **Measured, not chosen.** What the two full-size examples actually contain, on
 * 2026-09-18:
 *
 *   - `Z_MM_PO_APPROVAL.abap` (669 lines) — **3 tasks**: the includes
 *     `Z_MM_PO_NOTIFY` (L470) and `Z_MM_PO_LOG` (L512), and the dynamic
 *     `CALL FUNCTION lv_fm_name` (L502).
 *   - `ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap` (1001 lines) — **0 tasks**.
 *     It names no include and computes no call target; its unread edges are a
 *     native-SQL block and three commit boundaries, which are other rows.
 *   - The six small examples — **0 tasks** each.
 *
 * **Not vacuous.** On 2026-09-18 each assurance below was broken on its own in
 * `lib/abap/review-tasks.ts` or `components/ReviewTasks.tsx`, this spec run, and
 * the change taken back. The number is how many tests of this file went red:
 *
 *   - the window threshold lowered from `RETIREMENT_WINDOW_DAYS` to 30 — 5;
 *   - the dedupe by line removed, so one statement raised two tasks — 5;
 *   - the line anchor dropped from a dynamic call — 2;
 *   - the include name dropped from the anchors — 2;
 *   - `CALL METHOD`/`CREATE OBJECT` no longer read out of the coverage report — 2;
 *   - the window task moved to the front of the list — 2;
 *   - a `fetch('/api/gemini')` added to the entry point — 2;
 *   - an undeclared window treated as long enough (`?? RETIREMENT_WINDOW_DAYS`) — 1;
 *   - `INCLUDE STRUCTURE` no longer excluded — 1;
 *   - `ASSIGN (lv_field)` admitted as a call — 1;
 *   - the withheld sentence rewritten to "These objects are unused." — 1;
 *   - the task sentence rewritten to "Review the usage window." — 1;
 *   - a `status: 'open'` field added to every task — 1;
 *   - the panel deriving its own tasks instead of taking them — 1;
 *   - the panel painting a task row in `border-red-300` — 1;
 *   - the empty-state title rewritten to "This code is clean" — 1.
 *
 * That last one was red only after the fix it caused: the panel had a shorter
 * verdict list of its own, and "This code is clean" walked straight through it
 * while the module below refused to say anything of the sort. One list now, and
 * `VERDICTS` is it.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Source with its comments taken out — the reason `tests/unearned-verdicts-guard.spec.ts` has one. */
const code = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const EXAMPLES = join(ROOT, 'public/starter-examples');
const example = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

const PO = 'Z_MM_PO_APPROVAL.abap';
const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const ALL_EXAMPLES = [
  PO,
  LEGACY,
  'Z_BUSINESS_PARTNER_SYNC.txt',
  'Z_EMPLOYEE_EXPENSE_VAL.txt',
  'Z_INVOICE_EXTRACTOR.txt',
  'Z_MATERIAL_STOCK_CALC.txt',
  'Z_ORDER_INTEGRITY_CHECK.txt',
  'Z_SALES_ORDER_CREATOR.txt',
];

/**
 * Every dynamic form the roadmap row names, plus the two that must *not* become
 * tasks: `INCLUDE STRUCTURE` is a flat structure inside a type, not a second
 * file, and `ASSIGN (lv_field)` is a field access, not a call.
 */
const DYNAMIC = `REPORT z_dyn.
DATA lv_form TYPE string.
DATA lv_cls TYPE string.
DATA lv_m TYPE string.
DATA lv_tcode TYPE string.
DATA lv_prog TYPE string.
DATA lo_service TYPE REF TO object.
INCLUDE z_dyn_top.
INCLUDE STRUCTURE bapiret2.
START-OF-SELECTION.
  PERFORM (lv_form) IN PROGRAM z_other.
  CALL METHOD lo_service->(lv_m).
  CREATE OBJECT (lv_cls).
  CALL TRANSACTION lv_tcode.
  SUBMIT (lv_prog) AND RETURN.
  ASSIGN (lv_field) TO <fs>.
FORM do_it.
ENDFORM.
`;

/** A source with nothing of the three in it — the negative half of every count. */
const PLAIN = `REPORT z_plain.
START-OF-SELECTION.
  WRITE / 'one'.
`;

/* ---------------------------------------------------------------- usage */

const csvFile = (body: string, name = 'usage.csv') => new File([body], name, { type: 'text/csv' });

/** One object measured at zero, one busy — the shape a retirement proposal comes out of. */
const USAGE_CSV = 'OBJECT_NAME,CALLS\nZPROG_ONE,0\nZPROG_TWO,4200\n';

/** `window.days` is what the parser puts on the report, so the dates decide it. */
const windowOf = (from: string, to: string) => ({ window: { from, to } });

/** Minimal evidence report: `joinUsageWithEvidence` only reads `findings[].objectName`. */
const evidence = (objectNames: string[]) =>
  ({
    findings: objectNames.map((objectName, i) => ({
      id: `f${i}`,
      objectName,
      severity: 'Medium',
      kind: 'direct-table-access',
    })),
  }) as never;
const ROUTE = {} as never;
const NO_PATH = () => false;

/* ------------------------------------------------------------- helpers */

/**
 * The words that would turn an absence into the reading of it nobody
 * established — the defect this whole step is about.
 *
 * One list, held against the module's sentences and against the panel's fixed
 * ones alike. The panel used to have a shorter list of its own, and a title
 * reading "This code is clean" over an empty task list went straight past it:
 * the module refuses to make that claim and the screen made it anyway.
 */
const VERDICTS: RegExp[] = [
  /\bunused\b/i,
  /\bnot used\b/i,
  /\bnever used\b/i,
  /\bno longer used\b/i,
  /\bobsolete\b/i,
  /\bdead code\b/i,
  /\bdormant\b/i,
  /\bretire\b/i,
  /\bretirement\b/i,
  /\bnot supported\b/i,
  /\bunsupported\b/i,
  /\bsafe\b/i,
  /\bpassed\b/i,
  /\bproven\b/i,
  /\bverified\b/i,
  /\bconfirmed\b/i,
  /\bcompliant\b/i,
  // "Clean-Core.io" and "Clean Core" are the product and the SAP paradigm, and
  // a hyphen is a word boundary — without the lookahead this pattern fires on
  // the company's own name in every lead sentence.
  /\bclean\b(?![-\s]core)/i,
  /\bsuccessful\b/i,
  /\bno findings\b/i,
  /\bno risk\b/i,
];

/** Every sentence a task puts in front of a reader. */
function sentencesOf(result: ReviewTasks): string[] {
  const out: string[] = [];
  for (const task of result.tasks) {
    out.push(task.notDetermined.detail, task.task, task.withheld, ...task.anchors.map((a) => a.label));
  }
  return out;
}

async function tasksWithUsage(csv: string, options?: Parameters<typeof parseUsage>[1]) {
  const report = await parseUsage(csvFile(csv), options);
  return { report, result: deriveReviewTasks(PLAIN, { usage: report }) };
}

const kinds = (result: ReviewTasks): ReviewTaskKind[] => result.tasks.map((t) => t.kind);
const of = (result: ReviewTasks, kind: ReviewTaskKind): ReviewTask[] =>
  result.tasks.filter((t) => t.kind === kind);

/* ================================================================== *
 * 1 — a task is a question, not a verdict
 * ================================================================== */

test.describe('a task is a question, not a verdict', () => {
  test('no task carries an outcome, and no sentence claims one', async () => {
    const results: ReviewTasks[] = [
      ...ALL_EXAMPLES.map((name) => deriveReviewTasks(example(name))),
      deriveReviewTasks(DYNAMIC),
      (await tasksWithUsage(USAGE_CSV, windowOf('2026-01-01', '2026-02-09'))).result,
      (await tasksWithUsage(USAGE_CSV)).result,
    ];

    // The shape first: a field a browser could write a green one into.
    for (const result of results) {
      for (const task of result.tasks) {
        const keys = Object.keys(task);
        for (const forbidden of ['status', 'verdict', 'result', 'passed', 'outcome', 'level', 'score', 'severity']) {
          expect(keys, `${task.id} carries "${forbidden}"`).not.toContain(forbidden);
        }
      }
    }

    // And the words — the same list the panel's fixed sentences are held to,
    // because a sentence a reader meets is a sentence somebody chose.
    const offenders: string[] = [];
    for (const result of results) {
      for (const sentence of sentencesOf(result)) {
        for (const pattern of VERDICTS) if (pattern.test(sentence)) offenders.push(`${pattern} ← ${sentence}`);
      }
    }
    expect(offenders, `a task read as a result:\n${offenders.join('\n')}`).toEqual([]);

    // The sweep has to have had something to sweep.
    const swept = results.flatMap(sentencesOf);
    expect(swept.length, 'the verdict sweep read no sentences').toBeGreaterThan(20);
  });

  test('every task carries an anchor, a step and the sentence it holds back', async () => {
    const results = [
      deriveReviewTasks(example(PO)),
      deriveReviewTasks(DYNAMIC),
      (await tasksWithUsage(USAGE_CSV, windowOf('2026-01-01', '2026-02-09'))).result,
    ];
    const seen: string[] = [];
    for (const result of results) {
      for (const task of result.tasks) {
        seen.push(task.id);
        expect(task.anchors.length, `${task.id} points at nothing`).toBeGreaterThan(0);
        for (const anchor of task.anchors) expect(anchor.label.trim().length).toBeGreaterThan(0);
        expect(task.notDetermined.detail.trim().length, `${task.id} has no reason`).toBeGreaterThan(20);
        expect(task.withheld.trim().length, `${task.id} withholds nothing`).toBeGreaterThan(10);
        expect(task.withheld.endsWith('.')).toBe(true);
      }
    }
    expect(seen.length).toBeGreaterThan(3);
  });

  test('the step is one imperative sentence somebody can be asked whether they did', async () => {
    const results = [
      deriveReviewTasks(example(PO)),
      deriveReviewTasks(DYNAMIC),
      (await tasksWithUsage(USAGE_CSV, windowOf('2026-01-01', '2026-02-09'))).result,
      (await tasksWithUsage(USAGE_CSV)).result,
    ];
    // "Review", "consider" and "check whether" are the three ways a task turns
    // back into a shrug. Every sentence here starts with something that has been
    // done or has not been done.
    const IMPERATIVES = new Set(['Add', 'Name', 'Import', 'Declare']);
    const steps: string[] = [];
    for (const result of results) {
      for (const task of result.tasks) {
        steps.push(task.task);
        const first = task.task.split(' ')[0];
        expect(IMPERATIVES, `${task.id} starts with "${first}"`).toContain(first);
        expect(task.task.endsWith('.'), `${task.id} is not one sentence`).toBe(true);
        expect(
          (task.task.match(/\./g) ?? []).length,
          `${task.id} is more than one sentence: ${task.task}`,
        ).toBe(1);
      }
    }
    expect(steps.length).toBeGreaterThan(3);
  });
});

/* ================================================================== *
 * 2 — V25-A05: a window too short is a task
 * ================================================================== */

test.describe('V25-A05 — a usage window too short produces a check task', () => {
  test('40 days with a measured zero is a task, not a reading of it', async () => {
    const { report, result } = await tasksWithUsage(USAGE_CSV, windowOf('2026-01-01', '2026-02-09'));
    expect(report.window?.days, 'the fixture is not the window it claims to be').toBe(40);

    const tasks = of(result, 'usage-window');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].notDetermined.reason).toBe('window-shorter-than-13-months');
    expect(tasks[0].notDetermined.detail).toContain('40 days');
    expect(tasks[0].notDetermined.detail).toContain('2026-01-01');
    // The object whose zero is at stake is named, not counted.
    expect(tasks[0].anchors.map((a) => a.label)).toContain('ZPROG_ONE');
    expect(result.usageConsulted).toBe(true);
  });

  test('thirteen months of the same import is no task at all', async () => {
    const { report, result } = await tasksWithUsage(USAGE_CSV, windowOf('2025-01-01', '2026-02-09'));
    expect(report.window?.days).toBeGreaterThanOrEqual(RETIREMENT_WINDOW_DAYS);
    expect(of(result, 'usage-window')).toHaveLength(0);
    expect(result.usageConsulted, 'a long window is still a window that was read').toBe(true);
  });

  test('the threshold is the one usage-join.ts refuses a zero on, to the day', async () => {
    // Two thresholds for one question is how a screen comes to show a
    // retirement candidate beside the sentence saying it cannot be one. So the
    // task appears exactly where the join stops calling a measured zero
    // dormant — checked on both sides of the boundary and well past it.
    const rows: string[] = [];
    for (const [from, to] of [
      ['2026-01-01', '2026-02-09'], // 40 days
      ['2025-01-13', '2026-02-09'], // 393 days — one short
      ['2025-01-12', '2026-02-09'], // 394 days — exactly the threshold
      ['2024-01-12', '2026-02-09'], // well past it
    ]) {
      const report = await parseUsage(csvFile(USAGE_CSV), windowOf(from, to));
      const joined = joinUsageWithEvidence(report, evidence(['ZPROG_ONE']), ROUTE, NO_PATH);
      const bucket = joined.find((r) => r.objectName === 'ZPROG_ONE')?.usage;
      const raised = of(deriveReviewTasks(PLAIN, { usage: report }), 'usage-window').length === 1;
      rows.push(`${report.window?.days} days: bucket=${bucket} task=${raised}`);
      expect(
        raised,
        `${report.window?.days} days: the join says "${bucket}" and the task list disagrees`,
      ).toBe(bucket === 'unobserved');
    }
    // Both answers have to occur, or the assertion above is satisfied by one of
    // them never happening.
    expect(rows.filter((r) => r.endsWith('task=true')).length, rows.join('\n')).toBeGreaterThan(0);
    expect(rows.filter((r) => r.endsWith('task=false')).length, rows.join('\n')).toBeGreaterThan(0);
  });

  test('an import with no declared window is its own reason, not the same one', async () => {
    const { report, result } = await tasksWithUsage(USAGE_CSV);
    expect(report.window, 'the fixture declared a window after all').toBeUndefined();
    const tasks = of(result, 'usage-window');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].notDetermined.reason).toBe('window-not-declared');
    expect(tasks[0].notDetermined.detail).toContain('no monitoring window');
    expect(tasks[0].task).toContain('Declare');
  });

  test('without a usage import there is no window task and the panel says which', () => {
    const result = deriveReviewTasks(PLAIN);
    expect(of(result, 'usage-window')).toHaveLength(0);
    // DESIGN.md §5.6: without an import there is no route from usage to a
    // retirement at all, so there is no claim here to hold open. Saying "window
    // too short" about an import nobody made would be a task for nothing.
    expect(result.usageConsulted).toBe(false);
  });

  test('a usage import alone raises the window task even with no source staged', async () => {
    const report = await parseUsage(csvFile(USAGE_CSV), windowOf('2026-01-01', '2026-02-09'));
    const result = deriveReviewTasks('', { usage: report });
    expect(result.noSource, 'an empty source is not the same as zero tasks').toBe(true);
    expect(kinds(result)).toEqual(['usage-window']);
  });
});

/* ================================================================== *
 * 3 — an include nobody read
 * ================================================================== */

test.describe('an include this run does not hold is a task with its name', () => {
  test('both includes of Z_MM_PO_APPROVAL come back, each with name and line', () => {
    const tasks = of(deriveReviewTasks(example(PO)), 'include-not-read');
    expect(tasks).toHaveLength(2);

    const named = tasks.map((task) => ({
      names: task.anchors.filter((a) => a.kind === 'name').map((a) => a.label),
      lines: task.anchors.filter((a) => a.kind === 'line').map((a) => a.lineStart),
    }));
    expect(named).toEqual([
      { names: ['Z_MM_PO_NOTIFY'], lines: [470] },
      { names: ['Z_MM_PO_LOG'], lines: [512] },
    ]);

    for (const task of tasks) {
      expect(task.notDetermined.reason).toBe('include-text-not-in-source');
      // The step names the file somebody has to produce. "Read the includes"
      // is not something anybody can be asked whether they did.
      const name = task.anchors.find((a) => a.kind === 'name')!.label;
      expect(task.task, 'the step does not name the include').toContain(name);
    }
  });

  test('INCLUDE STRUCTURE is not a second file and raises nothing', () => {
    const tasks = of(deriveReviewTasks(DYNAMIC), 'include-not-read');
    expect(tasks.map((t) => t.anchors.find((a) => a.kind === 'name')?.label)).toEqual(['Z_DYN_TOP']);
  });

  test('the withheld sentence is the inference, not the verdict', () => {
    const task = of(deriveReviewTasks(example(PO)), 'include-not-read')[0];
    // It names what would be believed, so a reader knows what is missing — and
    // it never says the program is fine, because nobody read the include.
    expect(task.withheld).toBe('That what this reading found is everything the program does.');
  });
});

/* ================================================================== *
 * 4 — a call whose target is worked out at run time
 * ================================================================== */

test.describe('a computed call target is a task with its line', () => {
  test('CALL FUNCTION lv_fm_name in Z_MM_PO_APPROVAL is one task on line 502', () => {
    const tasks = of(deriveReviewTasks(example(PO)), 'dynamic-call');
    expect(tasks).toHaveLength(1);
    const line = tasks[0].anchors.find((a) => a.kind === 'line');
    expect(line?.lineStart, 'the task points at no line').toBe(502);
    expect(tasks[0].anchors.map((a) => a.label)).toContain('lv_fm_name');
    expect(tasks[0].notDetermined.reason).toBe('call-target-computed');
    expect(tasks[0].notDetermined.detail).toContain('502');
  });

  test('every form the roadmap row names is read, and a field access is not', () => {
    const tasks = of(deriveReviewTasks(DYNAMIC), 'dynamic-call');
    // PERFORM (lv_form) · CALL METHOD ->(lv_m) · CREATE OBJECT (lv_cls) ·
    // CALL TRANSACTION lv_tcode · SUBMIT (lv_prog). Five, and every one of them
    // points at its line and at the expression that will hold the target.
    expect(tasks.map((t) => t.anchors.find((a) => a.kind === 'name')?.label)).toEqual([
      'lv_form',
      'lv_m',
      'lv_cls',
      'lv_tcode',
      'lv_prog',
    ]);
    for (const task of tasks) {
      expect(task.anchors.some((a) => a.kind === 'line' && a.lineStart !== null)).toBe(true);
    }
    // `ASSIGN (lv_field)` stays where it was — unassessed, not a call.
    const assignLine = DYNAMIC.split('\n').findIndex((l) => l.includes('ASSIGN (')) + 1;
    expect(
      tasks.some((t) => t.anchors.some((a) => a.lineStart === assignLine)),
      'a dynamic field access was admitted as a call',
    ).toBe(false);
    expect(
      assessCoverage(DYNAMIC).unassessed.some((u) => u.line === assignLine),
      'and it must still be recorded where it always was',
    ).toBe(true);
  });

  test('the class forms come out of the coverage report, which the call graph does not read', () => {
    // `call-graph.ts` says so in its own header: CALL METHOD and CREATE OBJECT
    // are deliberately not read there. If this module ever stopped consulting
    // the coverage report, the dynamic classes of the roadmap row would
    // silently disappear.
    const facts = buildProcessFacts(DYNAMIC);
    const withoutCoverage = deriveReviewTasksFrom(facts, { unassessed: [], complete: true, gaps: [] });
    const reasons = of(withoutCoverage, 'dynamic-call').map((t) => t.notDetermined.reason);
    expect(reasons).not.toContain('class-or-method-computed');
    expect(of(deriveReviewTasks(DYNAMIC), 'dynamic-call').map((t) => t.notDetermined.reason)).toContain(
      'class-or-method-computed',
    );
  });
});

/* ================================================================== *
 * 5 — measured, not chosen
 * ================================================================== */

test.describe('what the shipped programs actually contain', () => {
  test('the two full-size examples, counted', () => {
    expect(deriveReviewTasks(example(PO)).counts).toEqual({
      total: 3,
      byKind: { 'usage-window': 0, 'include-not-read': 2, 'dynamic-call': 1 },
    });
    expect(deriveReviewTasks(example(LEGACY)).counts.total).toBe(0);
  });

  test('the six small examples raise nothing, and that is not a clean bill', () => {
    for (const name of ALL_EXAMPLES.filter((n) => n !== PO && n !== LEGACY)) {
      const result = deriveReviewTasks(example(name));
      expect(result.counts.total, `${name} unexpectedly raised a task`).toBe(0);
      // Zero tasks with a source read is a different statement from no source.
      expect(result.noSource, `${name} came back as no source`).toBe(false);
    }
  });

  test('an empty source is not zero tasks', () => {
    const empty = deriveReviewTasks('   ');
    expect(empty.noSource).toBe(true);
    expect(empty.counts.total).toBe(0);
    expect(deriveReviewTasks(PLAIN).noSource).toBe(false);
  });

  test('ids are stable and the window task is last, so an import does not renumber the source', async () => {
    const withoutUsage = deriveReviewTasks(example(PO));
    const report = await parseUsage(csvFile(USAGE_CSV), windowOf('2026-01-01', '2026-02-09'));
    const withUsage = deriveReviewTasks(example(PO), { usage: report });

    expect(withUsage.tasks.slice(0, 3).map((t) => [t.id, t.kind])).toEqual(
      withoutUsage.tasks.map((t) => [t.id, t.kind]),
    );
    expect(withUsage.tasks[3].kind).toBe('usage-window');
    expect(withUsage.tasks[3].id).toBe('RT-004');
  });
});

/* ================================================================== *
 * 6 — nothing here asks a model
 * ================================================================== */

/** Every way this repository reaches a model, by name. */
const MODEL_PATHS = [
  '/api/gemini',
  'generateContent',
  'GoogleGenerativeAI',
  'GenerativeModel',
  'openrouter',
  'OPENROUTER',
  'callGemini',
  'geminiProxy',
];

test.describe('the tasks are computed, not generated', () => {
  for (const rel of ['lib/abap/review-tasks.ts', 'components/ReviewTasks.tsx']) {
    test(`${rel} names no model path and no fetch`, () => {
      const src = code(rel);
      for (const needle of MODEL_PATHS) {
        expect(src, `${rel} reaches a model through ${needle}`).not.toContain(needle);
      }
      expect(src, `${rel} calls fetch`).not.toMatch(/\bfetch\s*\(/);
    });
  }

  test('and it still answers with the network taken away', async () => {
    const report = await parseUsage(csvFile(USAGE_CSV), windowOf('2026-01-01', '2026-02-09'));
    const realFetch = globalThis.fetch;
    // Not a mock that records calls — one that makes a call impossible. A
    // recording mock proves nothing about a module that catches its own errors.
    globalThis.fetch = (() => {
      throw new Error('a review task tried to reach the network');
    }) as unknown as typeof fetch;
    try {
      const result = deriveReviewTasks(example(PO), { usage: report });
      expect(result.counts.total).toBe(4);
      expect(kinds(result)).toEqual([
        'include-not-read',
        'dynamic-call',
        'include-not-read',
        'usage-window',
      ]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('the same source always gives the same tasks', () => {
    expect(JSON.stringify(deriveReviewTasks(example(PO)))).toBe(
      JSON.stringify(deriveReviewTasks(example(PO))),
    );
  });
});

/* ================================================================== *
 * 7 — the panel shows the tasks, it does not make them
 * ================================================================== */

test.describe('the panel takes the tasks rather than deriving them', () => {
  const PANEL = 'components/ReviewTasks.tsx';

  test('it imports the module as types only', () => {
    const src = code(PANEL);
    // `[^;]*` rather than `[\s\S]*?`: it spans the newlines of a multi-line
    // import and stops at the first semicolon, so the import before this one
    // cannot be swept into the match and make a value import look like a type
    // one.
    const fromModule = src.match(/^import[^;]*from\s+'@\/lib\/abap\/review-tasks';/gm) ?? [];
    expect(fromModule.length, 'the panel does not read the module at all').toBe(1);
    expect(
      fromModule[0],
      'a value import would ship the whole ABAP reader to a browser — the morning ' +
        '`lib/abap/public-cloud-fit-resolver.ts` documents',
    ).toMatch(/^import type\s/);
    expect(src).not.toContain('deriveReviewTasks');
  });

  test('it writes no status of its own', () => {
    const src = code(PANEL);
    for (const forbidden of ['Passed', 'Failed', 'Resolved', 'Done', 'Open issue', 'Warning', 'Error']) {
      expect(src, `the panel paints a status: ${forbidden}`).not.toContain(`>${forbidden}<`);
    }
    // No colour that reads as a judgement. A task nobody has carried out is not
    // a failure.
    expect(src).not.toMatch(/\b(?:text|bg|border)-(?:red|green|amber|emerald|rose)-\d{2,3}\b/);
  });

  /**
   * The withheld sentence names the inference a reader must not draw - "is
   * one nobody calls any more" - and it is only honest because the panel says,
   * right before it, that this is what is *not* said. Drop the prefix and the
   * panel prints a verdict. The agent that built this called the prefix
   * mandatory in its report and pinned it nowhere; this is the pin.
   */
  test('the withheld sentence is always introduced as withheld, never printed bare', () => {
    const src = code(PANEL);
    expect(src, 'the "not said" prefix is gone from the panel').toMatch(
      /Not said while this is open: \{task\.withheld/,
    );
    // And nowhere else is `task.withheld` rendered without it.
    const renders = src.match(/\{task\.withheld/g)?.length ?? 0;
    const introduced = src.match(/Not said while this is open: \{task\.withheld/g)?.length ?? 0;
    expect(introduced, 'task.withheld is rendered somewhere without its prefix').toBe(renders > 0 ? 1 : 0);
    expect(renders).toBeGreaterThan(0);
  });

  test('its fixed sentences are free of the same verdicts', () => {
    const sentences = [
      REVIEW_TASKS_LEAD,
      REVIEW_TASKS_NONE_TITLE,
      REVIEW_TASKS_METHOD,
      reviewTasksTitle(0),
      reviewTasksTitle(1),
      reviewTasksTitle(3),
      reviewTasksNoneLine(false, false),
      reviewTasksNoneLine(false, true),
      reviewTasksNoneLine(true, true),
    ];
    for (const sentence of sentences) {
      expect(sentence.trim().length).toBeGreaterThan(0);
      for (const pattern of VERDICTS) {
        expect(sentence, `${pattern} ← ${sentence}`).not.toMatch(pattern);
      }
    }
    // The three empty states are three different sentences, for the reason
    // `components/workspace/NotDeterminedCard.tsx` keeps three apart.
    expect(new Set([
      reviewTasksNoneLine(false, false),
      reviewTasksNoneLine(false, true),
      reviewTasksNoneLine(true, true),
    ]).size).toBe(3);
  });
});

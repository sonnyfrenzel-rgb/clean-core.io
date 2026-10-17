import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { deriveEngineCases } from '../lib/testing-engine-cases';
import { candidateFiles, guardBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { withTrace } from '../lib/transformation/trace';
import { fileUrl, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.17 criterion (3): every defect a run shows becomes a fix with a test that fails without it.
 *
 * The defect (a real generation of the side-by-side starter example, Node/CAP, on the SAP BTP trial, 17.10.2026):
 * FORM RATE_DEVIATION begins with `CHECK cs_result-status IS INITIAL.` In ABAP a CHECK inside a routine leaves the
 * routine when its condition does not hold (outside a loop), skips to the next pass inside a loop, and only at event
 * level ends the event block. The engine carried it as `guard_G0311(...): Refusal | null` — "refuses the input" — with
 * a model-written predicate, and the model inverted it (`!== ''`): a delivery already NO_QUOTE ran on into the
 * currency check and came out REVIEW. Now the CHECK in a routine is a `stop_…` (the step returns, the run goes on),
 * in a loop a `skip_…`, at event level the refusal it was; and where the condition and the declared type decide it,
 * the engine writes the predicate itself, with no fill region.
 *
 * A synthetic snippet, not any acceptance program. Server-free.
 */

const SOURCE = [
  'REPORT z_cc_check_kinds.',
  '',
  'TYPES: BEGIN OF ty_item,',
  '         vbeln  TYPE c LENGTH 10,',
  '         status TYPE c LENGTH 10,',
  '         qty    TYPE i,',
  '       END OF ty_item.',
  '',
  'DATA: gt_items   TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,',
  '      gv_rated   TYPE i,',
  '      gv_counted TYPE i,',
  '      gv_done    TYPE c LENGTH 1.',
  '',
  "PARAMETERS p_mode TYPE c LENGTH 1 OBLIGATORY DEFAULT 'A'.",
  '',
  'START-OF-SELECTION.',
  "  CHECK p_mode = 'A'.",
  '  PERFORM read_items.',
  '  PERFORM rate_items.',
  '  PERFORM count_items.',
  "  gv_done = 'X'.",
  '',
  'FORM read_items.',
  '  SELECT vbeln status qty FROM zitem INTO TABLE gt_items.',
  'ENDFORM.',
  '',
  'FORM rate_items.',
  '  DATA ls_item TYPE ty_item.',
  '  LOOP AT gt_items INTO ls_item.',
  '    PERFORM rate_one CHANGING ls_item.',
  '    MODIFY gt_items FROM ls_item.',
  '  ENDLOOP.',
  'ENDFORM.',
  '',
  'FORM rate_one CHANGING cs_item TYPE ty_item.',
  '  CHECK cs_item-status IS INITIAL.',
  "  cs_item-status = 'RATED'.",
  '  gv_rated = gv_rated + 1.',
  'ENDFORM.',
  '',
  'FORM count_items.',
  '  DATA ls_item TYPE ty_item.',
  '  DATA lv_qty TYPE i.',
  '  LOOP AT gt_items INTO ls_item.',
  '    lv_qty = ls_item-qty.',
  '    CHECK lv_qty > 0.',
  '    gv_counted = gv_counted + 1.',
  '  ENDLOOP.',
  'ENDFORM.',
  '',
].join('\n');

const lineOf = (needle: string) => SOURCE.split('\n').findIndex((l) => l.includes(needle)) + 1;
const EVENT_CHECK = lineOf("CHECK p_mode = 'A'");
const ROUTINE_CHECK = lineOf('CHECK cs_item-status IS INITIAL');
const LOOP_CHECK = lineOf('CHECK lv_qty > 0');

const prep = (track: 'node' | 'rap' = 'node'): EngineLedPrepared => {
  const p = prepareEngineLed({ source: SOURCE, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
};

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

function guardAt(p: EngineLedPrepared, line: number) {
  const g = p.plan.guards.find((x) => x.line === line);
  if (!g) throw new Error(`no guard at L${line}`);
  return g;
}

test.describe('a CHECK leaves what it stands in, and the engine writes a condition it can decide (3.0.17 criterion 3)', () => {
  test('the kind follows the place: a routine is left, a loop pass skipped, the event block ends as a refusal', () => {
    const p = prep();
    const inRoutine = guardAt(p, ROUTINE_CHECK);
    const inLoop = guardAt(p, LOOP_CHECK);
    const atEvent = guardAt(p, EVENT_CHECK);
    expect([inRoutine.outcome, inRoutine.helper]).toEqual(['stops', `stop_G${String(ROUTINE_CHECK).padStart(4, '0')}`]);
    expect([inLoop.outcome, inLoop.helper]).toEqual(['skips', `skip_G${String(LOOP_CHECK).padStart(4, '0')}`]);
    expect(atEvent.outcome).toBe('refuses');
    expect(atEvent.helper).toMatch(/^guard_/);

    const guards = p.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
    // The wrapper of the routine's CHECK returns true where the step returns, and says so — never a Refusal.
    expect(guards).toContain(`/** Leaves the routine as the original's CHECK does at L${ROUTINE_CHECK}: true when cs_item-status IS INITIAL does not hold — the step returns and the run goes on, no refusal. */`);
    expect(guards).toMatch(new RegExp(`export function ${inRoutine.helper}\\([^)]*\\): boolean \\{\\n  return !when_`));
    expect(guards).toContain(`/** Skips the record as the original's CHECK does at L${LOOP_CHECK} inside a loop`);
    expect(guards).toContain(`/** Refuses the input as the original does at L${EVENT_CHECK}: its CHECK stands at event level`);
    expect(guards).not.toContain(`Refuses the input as the original does at L${ROUTINE_CHECK}`);

    // The engine cases read the CHECK the same way: the routine's is an early end, never a refusal.
    const cases = deriveEngineCases(SOURCE, deriveBusinessRules(SOURCE).rules).cases;
    const atLine = (line: number) => cases.filter((c) => c.engineCase.family === 'guard' && c.engineCase.trace.lines.some((l) => l.start === line));
    expect(atLine(ROUTINE_CHECK).length).toBeGreaterThan(0);
    for (const c of atLine(ROUTINE_CHECK)) {
      expect(c.name).not.toMatch(/refused|refusal/);
      for (const e of c.engineCase.examples) expect(e.call?.expect.kind).not.toBe('refused');
    }
    expect(atLine(EVENT_CHECK).some((c) => / is refused$/.test(c.name))).toBe(true);
    expect(atLine(ROUTINE_CHECK).some((c) => / is stopped$/.test(c.name))).toBe(true);
  });

  test('the predicate the engine can decide has no fill region and is not asked of the model', () => {
    const p = prep();
    const inRoutine = guardAt(p, ROUTINE_CHECK);
    const inLoop = guardAt(p, LOOP_CHECK);
    const atEvent = guardAt(p, EVENT_CHECK);
    const regions = new Set(p.scaffold.regions.map((r) => r.regionId));
    expect(regions.has(inRoutine.regionId!)).toBe(false);
    expect(regions.has(inLoop.regionId!)).toBe(false);
    // `p_mode = 'A'` reads the selection, not a value the check hands in: still the model's.
    expect(regions.has(atEvent.regionId!)).toBe(true);

    const guards = p.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
    expect(guards).toContain(`// Written by Clean-Core.io (engine), not a model: the original's condition at L${ROUTINE_CHECK}, cs_item-status IS INITIAL, on cs_item-status (declared TYPE c LENGTH 10).`);
    expect(guards).toContain("return isInitial(values.csItemStatus, 'text');");
    expect(guards).toContain('return values.lvQty > 0;');

    const asked = p.fillUnits.flatMap((u) => u.guards.filter((g) => g.regionId).map((g) => g.id));
    expect(asked).toEqual([atEvent.id]);
  });

  test('run: the routine is left and the run goes on, the loop pass is skipped, the event check refuses', () => {
    test.setTimeout(180_000);
    const p = prep();
    const atEvent = guardAt(p, EVENT_CHECK);
    const inLoop = guardAt(p, LOOP_CHECK);
    const rate = p.plan.units.find((u) => u.routine === 'RATE_ONE')!;
    const count = p.plan.units.find((u) => u.routine === 'COUNT_ITEMS')!;
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    // The routine's CHECK is called by the engine at the step's entry, before the fill marker.
    const step = p.scaffold.files.find((f) => f.path === rate.file)!.content;
    const call = `if (checked(st, () => ${guardAt(p, ROUTINE_CHECK).helper}(sel, st, null, { csItemStatus: args.csItem.value.status }))) return;`;
    expect(step).toContain(call);
    expect(step.indexOf(call)).toBeLessThan(step.indexOf(`@cc-fill BEGIN ${rate.id}`));

    const bodies = new Map<string, string>();
    bodies.set(atEvent.regionId!, "return sel.mode === 'A';");
    bodies.set(rate.id, "args.csItem.value.status = 'RATED';\nst.local.gvRated = st.local.gvRated + 1;");
    bodies.set(count.id, `for (const ls of st.local.gtItems) {\n  const lvQty = ls.qty;\n  if (${inLoop.helper}(sel, st, null, { lvQty })) continue;\n  st.local.gvCounted = st.local.gvCounted + 1;\n}`);
    bodies.set(
      orchestrator.id,
      `for (const item of st.local.gtItems) {\n  const box = { value: item };\n  const r = ${rate.fn}(sel, st, { csItem: box });\n  if (r) return r;\n}\nconst c = ${count.fn}(sel, st);\nif (c) return c;\nst.local.gvDone = 'X';`,
    );
    for (const [id, body] of bodies) expect(guardBodyOf(p)(id, body, []), id).toBeNull();
    const files = candidateFiles(p, bodies);
    expect(files.find((f) => f.path === count.file)!.content).toContain(`if (${inLoop.helper}(sel, st, null, { lvQty })) continue;`);
    expect(typeErrors(typeCheckCandidate(files))).toEqual([]);
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);

    const { files: traced } = withTrace(p.plan, p.scaffold, files, []);
    const dir = writePackage(traced, 'cc-check-kinds-');
    try {
      type Answer = { ok: boolean; refused: string | null; notFilled: unknown[]; rated: number; counted: number; done: string; statuses: string[] };
      const run = (request: unknown) =>
        runInPackage<Answer>(
          dir,
          [
            `const { validateRequest, splitRequest, seedOf } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/input-contract.ts'))});`,
            `const { runProcess } = await import(${JSON.stringify(fileUrl(dir, 'srv/process.ts'))});`,
            `const v = validateRequest(${JSON.stringify(request)});`,
            'if (!v.ok) throw new Error(JSON.stringify(v.errors));',
            'const { selection, records, inputs } = splitRequest(v.normalized);',
            'const o = runProcess(selection, records, seedOf(inputs));',
            'console.log(JSON.stringify({ ok: o.complete, refused: o.refusal ? JSON.stringify(o.refusal.issues ?? o.refusal) : null, notFilled: o.notFilled, rated: o.state.local.gvRated, counted: o.state.local.gvCounted, done: o.state.local.gvDone, statuses: o.state.local.gtItems.map((i) => i.status) }));',
          ].join('\n'),
        );
      const items = [
        { vbeln: '1', status: '', qty: 1 },
        { vbeln: '2', status: 'NO_QUOTE', qty: 0 },
        { vbeln: '3', status: '   ', qty: 2 },
      ];
      // (a) The item already NO_QUOTE leaves RATE_ONE untouched, and the run goes on — no refusal of the input.
      // (b) The item with no quantity is skipped by COUNT_ITEMS' CHECK; the loop goes on with the next.
      const a = run({ mode: 'A', items });
      expect(a).toEqual({ ok: true, refused: null, notFilled: [], rated: 2, counted: 2, done: 'X', statuses: ['RATED', 'NO_QUOTE', 'RATED'] });
      // (c) At event level the CHECK ends START-OF-SELECTION: refused, nothing after it ran.
      const c = run({ mode: 'B', items });
      expect(c.refused).toContain(atEvent.rule ?? `L${EVENT_CHECK}`);
      expect([c.rated, c.counted, c.done]).toEqual([0, 0, '']);

      // The engine-written predicates on initial and non-initial values, as ABAP reads them.
      const predicates = runInPackage<Record<string, boolean>>(
        dir,
        [
          `const g = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/guards.ts'))});`,
          `const r = (s) => g.when_G${String(ROUTINE_CHECK).padStart(4, '0')}({}, {}, null, { csItemStatus: s });`,
          `const q = (n) => g.when_G${String(LOOP_CHECK).padStart(4, '0')}({}, {}, null, { lvQty: n });`,
          "console.log(JSON.stringify({ empty: r(''), blanks: r('   '), filled: r('NO_QUOTE'), zero: q(0), one: q(1), minus: q(-1) }));",
        ].join('\n'),
      );
      expect(predicates).toEqual({ empty: true, blanks: true, filled: false, zero: false, one: true, minus: false });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('RAP: the body is told to leave the method, or the pass, where such a CHECK does not hold', () => {
    const p = prep('rap');
    const inRoutine = guardAt(p, ROUTINE_CHECK);
    expect(inRoutine.outcome).toBe('stops');
    const types = Object.values(p.scaffold.rap!.unitTypes).join('\n');
    expect(types).toMatch(new RegExp(`call it where the original's CHECK stands \\(L${ROUTINE_CHECK}\\): IF when_g${String(ROUTINE_CHECK).padStart(4, '0')}\\(.*\\) = abap_false\\. RETURN\\. ENDIF\\.`));
    expect(types).toMatch(new RegExp(`call it where the original's CHECK stands \\(L${LOOP_CHECK}\\): IF when_g${String(LOOP_CHECK).padStart(4, '0')}\\(.*\\) = abap_false\\. CONTINUE\\. ENDIF\\.`));
  });
});

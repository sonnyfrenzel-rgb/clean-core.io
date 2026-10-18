import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { candidateFiles, guardBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { displayOf, displaySitesOf, displaysIn } from '../lib/transformation/display-node';
import { readAbapShapes } from '../lib/transformation/abap-shapes';
import { withTrace } from '../lib/transformation/trace';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { fileUrl, planOf, ROOT, runInPackage, typecheck, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.18 item 14, first part: the original's ALV display becomes the run's rows on the CAP/Node route,
 * engine-written (scaffold version 18, `display-node.ts`). The 3.0.17 acceptance run of the 1,000-line example
 * answered `rows: []` with its orders processed: nothing put what the original displays into the run.
 * Server-free.
 */

const EXAMPLE = path.join(ROOT, 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const BP_SYNC = path.join(ROOT, 'tests', 'fixtures', 'retired-starter-examples', 'Z_BUSINESS_PARTNER_SYNC.txt');
const read = (file: string) => fs.readFileSync(file, 'utf8');

function prepared(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const unitOf = (p: EngineLedPrepared, routine: string) => {
  const u = p.plan.units.find((x) => x.routine?.toUpperCase() === routine);
  if (!u) throw new Error(`no unit for ${routine}`);
  return u;
};

function sitesOf(source: string) {
  const { facts, plan } = planOf(source);
  const shapes = readAbapShapes(facts.statements, facts.blocks, new Set());
  return displaySitesOf(plan, facts.statements, facts.blocks, shapes);
}

test('scaffold version 18', () => {
  expect(SCAFFOLD_VERSION).toBeGreaterThanOrEqual(18);
});

test.describe('the original\'s display is read', () => {
  test('REUSE_ALV_GRID_DISPLAY / REUSE_ALV_LIST_DISPLAY with TABLES t_outtab, and cl_salv_table=>factory with CHANGING t_table', () => {
    expect(displayOf({ keyword: 'CALL', text: "CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' EXPORTING is_layout = gv_layout TABLES t_outtab = gt_orders EXCEPTIONS OTHERS = 2" })).toEqual({ via: "CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'", table: 'GT_ORDERS' });
    expect(displayOf({ keyword: 'CALL', text: "CALL FUNCTION 'REUSE_ALV_LIST_DISPLAY' TABLES t_outtab = gt_out[]" })).toEqual({ via: "CALL FUNCTION 'REUSE_ALV_LIST_DISPLAY'", table: 'GT_OUT' });
    expect(displayOf({ keyword: '', text: 'cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv CHANGING t_table = gt_rows )' })).toEqual({ via: 'cl_salv_table=>factory', table: 'GT_ROWS' });
    expect(displayOf({ keyword: 'CALL', text: 'CALL METHOD cl_salv_table=>factory IMPORTING r_salv_table = lo_alv CHANGING t_table = gt_rows' })).toEqual({ via: 'cl_salv_table=>factory', table: 'GT_ROWS' });
    // Not a display: another function module, and an ALV call without its table.
    expect(displayOf({ keyword: 'CALL', text: "CALL FUNCTION 'BAPI_SALESORDER_CHANGE' TABLES return = gt_return" })).toBeNull();
    expect(displayOf({ keyword: 'CALL', text: "CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' EXPORTING i_structure_name = 'VBAK'" })).toBeNull();
  });

  test('placed only where the frame can tell whether the routine reaches it', () => {
    const head = [
      'REPORT zdisp.',
      'TYPES: BEGIN OF ty_row, id TYPE c LENGTH 10, END OF ty_row.',
      'DATA gt_rows TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.',
      'DATA lv_n TYPE i.',
      "PARAMETERS p_show AS CHECKBOX DEFAULT 'X'.",
      'START-OF-SELECTION.',
      '  PERFORM show.',
      '  PERFORM again.',
    ];
    // Two callers, so the routine is a step of its own and is not folded into the run order.
    const at = (body: string[]) => sitesOf([...head, 'FORM show.', ...body, 'ENDFORM.', 'FORM again.', '  PERFORM show.', 'ENDFORM.', ''].join('\n'));
    const call = ["  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'", '    TABLES', '      t_outtab = gt_rows.'];
    // At the routine's level, behind a check at its entry: placed — the frame leaves before the body when the check
    // does not hold, so it evaluates nothing more (a check in the body is evaluated: the run below).
    const behindCheck = at(['  CHECK p_show = abap_true.', ...call]);
    expect(behindCheck).toHaveLength(1);
    expect(behindCheck[0].notPlaced).toBeNull();
    expect(behindCheck[0].key).toBe('gtRows');
    expect(behindCheck[0].exits).toEqual([]);
    // An exit no check of the plan stands for.
    const bare = at(['  CHECK p_show = abap_true.', '  CASE lv_n.', '    WHEN 3.', '      RETURN.', '  ENDCASE.', ...call]);
    expect(bare[0].notPlaced).toContain('L13 RETURN can leave the routine before the display');
    // Inside a branch: whether it runs is the body's.
    const inBranch = at(['  IF p_show = abap_true.', ...call, '  ENDIF.']);
    expect(inBranch[0].notPlaced).toContain('inside IF');
    // Behind a check on a computed value.
    const derived = at(['  lv_n = lines( gt_rows ).', '  CHECK lv_n > 0.', ...call]);
    expect(derived[0].notPlaced).toContain('reads a value computed before it');
    // A table that is no global of the program.
    const local = at(['  DATA lt_x TYPE STANDARD TABLE OF ty_row.', "  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' TABLES t_outtab = lt_x."]);
    expect(local[0].notPlaced).toContain('LT_X is no global table');
    // In a TRY's protected part: placed.
    const salv = at(['  DATA lo_alv TYPE REF TO cl_salv_table.', '  TRY.', '      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv CHANGING t_table = gt_rows ).', '    CATCH cx_salv_msg.', '  ENDTRY.']);
    expect(salv[0].notPlaced).toBeNull();
    expect(salv[0].exits).toEqual([]);
  });
});

type Answer = { ok: boolean; errors: unknown[]; rows: Array<Record<string, unknown>> };

/** One simulation through the package's own entry, with `extra` merged into the contract's base request. */
function simulate(dir: string, extra: string): Answer {
  return runInPackage<Answer>(
    dir,
    [
      `const { CONTRACT } = await import(${JSON.stringify(fileUrl(dir, 'srv/engine-contract.ts'))});`,
      `const { simulateRequest } = await import(${JSON.stringify(fileUrl(dir, 'srv/simulate.ts'))});`,
      `const { createRunStore } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/run-store.ts'))});`,
      `const request = { ...CONTRACT.baseRequest, ${extra} };`,
      'const a = simulateRequest(request, createRunStore());',
      'console.log(JSON.stringify({ ok: a.ok, errors: a.errors, rows: a.run ? a.run.result.rows : [] }));',
    ].join('\n'),
  );
}

test.describe('the 1,000-line example: DISPLAY_ALV shows GT_ORDERS (L628) behind IF p_alv = abap_false … RETURN (L622)', () => {
  const source = read(EXAMPLE);

  test('the frame runs the body in a function of its own and places the rows after it; the check at entry leaves before', () => {
    const p = prepared(source);
    const u = unitOf(p, 'DISPLAY_ALV');
    const g = p.plan.guards.find((x) => x.unitId === u.id && x.line === 622)!;
    expect(g.placement).toBe('entry');
    const file = p.scaffold.files.find((f) => f.path === u.file)!.content;
    expect(file).toContain(`  if (checked(st, () => ${g.helper}(sel, st, null))) return;\n  const body = (): StepResult => {`);
    expect(file).toContain('  st.rows = st.local.gtOrders.map((r) => ({ ...r }));');
    expect(file.indexOf(`@cc-fill END ${u.id}`)).toBeLessThan(file.indexOf('st.rows = st.local.gtOrders'));
    expect(displaysIn(file)).toEqual([`L628 CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' … t_outtab = GT_ORDERS → the run's rows (displayAlv, ${u.id})`]);
    // TRACE.md says where the rows come from.
    const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain(`- The run's rows — what the original displays: L628 CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' … t_outtab = GT_ORDERS → the run's rows (displayAlv, ${u.id})`);
  });

  test('p_alv = X: the run answers the orders as its rows; p_alv blank: no rows, as the original shows none', () => {
    test.setTimeout(240_000);
    const p = prepared(source);
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const selectOrders = unitOf(p, 'SELECT_ORDERS');
    const display = unitOf(p, 'DISPLAY_ALV');
    const g = p.plan.guards.find((x) => x.unitId === display.id && x.line === 622)!;
    const bodies = new Map<string, string>([
      [orchestrator.id, [`let res = ${selectOrders.fn}(sel, st);`, 'if (res) return res;', `res = ${display.fn}(sel, st);`, 'if (res) return res;'].join('\n')],
      [selectOrders.id, 'return;'],
      // The model's port: nothing it can do on a server — the body ends with `return`, and the frame still places the rows.
      [display.id, 'return;'],
      [g.regionId!, 'return sel.alv === false;'],
    ]);
    for (const id of [orchestrator.id, selectOrders.id, display.id]) expect(guardBodyOf(p)(id, bodies.get(id)!, []), id).toBeNull();
    const dir = writePackage(candidateFiles(p, bodies), 'cc-3018-display-');
    try {
      const tc = typecheck(dir);
      expect(tc.ok, tc.output.slice(0, 2000)).toBe(true);
      const orders = "orders: [{ vbeln: '0000000001' }, { vbeln: '0000000002' }]";
      const shown = simulate(dir, `alv: true, ${orders}`);
      expect(shown.errors).toEqual([]);
      expect(shown.ok).toBe(true);
      // Before: rows: [] — the orders were processed and the run answered none of them.
      expect(shown.rows.map((r) => r.vbeln)).toEqual(['0000000001', '0000000002']);
      const hidden = simulate(dir, `alv: false, ${orders}`);
      expect(hidden.ok).toBe(true);
      expect(hidden.rows).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('a check in the body before the display (after a PERFORM): the frame evaluates it before the body, and a body that returns early still gets its rows', () => {
  test.setTimeout(240_000);
  const source = [
    'REPORT zdisp.',
    'TYPES: BEGIN OF ty_row, id TYPE c LENGTH 10, END OF ty_row.',
    'DATA gt_rows TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.',
    'DATA gs_row TYPE ty_row.',
    "PARAMETERS p_show AS CHECKBOX DEFAULT 'X'.",
    'START-OF-SELECTION.',
    '  PERFORM show.',
    '  PERFORM again.',
    'FORM show.',
    '  PERFORM prep.',
    '  CHECK p_show = abap_true.',
    "  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'",
    '    TABLES',
    '      t_outtab = gt_rows.',
    'ENDFORM.',
    'FORM again.',
    '  PERFORM show.',
    'ENDFORM.',
    'FORM prep.',
    '  CLEAR gt_rows.',
    "  gs_row-id = 'A1'.",
    '  APPEND gs_row TO gt_rows.',
    'ENDFORM.',
    '',
  ].join('\n');
  const p = prepared(source);
  const show = unitOf(p, 'SHOW');
  const g = p.plan.guards.find((x) => x.unitId === show.id && x.line === 11)!;
  expect(g.placement).toBe('body');
  const file = p.scaffold.files.find((f) => f.path === show.file)!.content;
  expect(file).toContain(`  const reaches = checked(st, () => ${g.helper}(sel, st, null)) === false;`);
  expect(file).toContain('  if (reaches) st.rows = st.local.gtRows.map((r) => ({ ...r }));');
  expect(file.indexOf('const reaches')).toBeLessThan(file.indexOf(`@cc-fill BEGIN ${show.id} `));
  const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
  const bodies = new Map<string, string>([
    [orchestrator.id, `return ${show.fn}(sel, st);`],
    // The faithful port: the rows, then the check — which returns, and returns again at the end.
    [show.id, ["st.local.gtRows = [{ id: 'A1' }];", `if (checked(st, () => ${g.helper}(sel, st, null))) return;`, 'return;'].join('\n')],
    [g.regionId!, 'return sel.show === true;'],
  ]);
  const dir = writePackage(candidateFiles(p, bodies), 'cc-3018-display-body-');
  try {
    const tc = typecheck(dir);
    expect(tc.ok, tc.output.slice(0, 2000)).toBe(true);
    expect(simulate(dir, 'show: true').rows).toEqual([{ id: 'A1' }]);
    expect(simulate(dir, 'show: false').rows).toEqual([]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Z_BUSINESS_PARTNER_SYNC (a retired example, kept as a fixture): a display with no check before it always gives the rows', () => {
  const p = prepared(read(BP_SYNC));
  const u = unitOf(p, 'DISPLAY_ALV');
  const file = p.scaffold.files.find((f) => f.path === u.file)!.content;
  expect(file).not.toContain('const reaches');
  expect(file).toMatch(/\n {2}st\.rows = st\.local\.gtBpData\.map\(\(r\) => \(\{ \.\.\.r \}\)\);\n/);
});

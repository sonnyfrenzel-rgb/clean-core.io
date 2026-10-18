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
const BP_SYNC = path.join(ROOT, 'public', 'starter-examples', 'Z_BUSINESS_PARTNER_SYNC.txt');
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
    // does not hold, so it evaluates nothing more (a check in the body is evaluated: the 1,000-line example below).
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

test.describe('the 1,000-line example: DISPLAY_ALV shows GT_ORDERS behind CHECK p_alv = abap_true (L613)', () => {
  const source = read(EXAMPLE);

  test('the frame of displayAlv runs the body in a function of its own and places the rows after it', () => {
    const p = prepared(source);
    const u = unitOf(p, 'DISPLAY_ALV');
    const file = p.scaffold.files.find((f) => f.path === u.file)!.content;
    expect(file).toContain('const reaches = checked(st, () => skip_G0613(sel, st, null)) === false;');
    expect(file).toContain('  const body = (): StepResult => {');
    expect(file).toContain('  if (reaches) st.rows = st.local.gtOrders.map((r) => ({ ...r }));');
    expect(file.indexOf('const reaches')).toBeLessThan(file.indexOf(`@cc-fill BEGIN ${u.id} `));
    expect(file.indexOf(`@cc-fill END ${u.id}`)).toBeLessThan(file.indexOf('if (reaches) st.rows'));
    expect(displaysIn(file)).toEqual(["L616 CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' … t_outtab = GT_ORDERS → the run's rows (displayAlv, U19), only when the routine reaches it (its check at L613)"]);
    // TRACE.md says where the rows come from.
    const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain("- The run's rows — what the original displays: L616 CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' … t_outtab = GT_ORDERS → the run's rows (displayAlv, U19)");
  });

  test('p_alv = X: the run answers the orders as its rows; p_alv blank: no rows, as the original shows none', () => {
    test.setTimeout(240_000);
    const p = prepared(source);
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const selectOrders = unitOf(p, 'SELECT_ORDERS');
    const display = unitOf(p, 'DISPLAY_ALV');
    const bodies = new Map<string, string>([
      [orchestrator.id, [`let res = ${selectOrders.fn}(sel, st);`, 'if (res) return res;', `res = ${display.fn}(sel, st);`, 'if (res) return res;'].join('\n')],
      [selectOrders.id, 'return;'],
      // The model's faithful port: the CHECK, then nothing it can do on a server — it ends with `return`.
      [display.id, 'if (checked(st, () => skip_G0613(sel, st, null))) return;\nreturn;'],
      ['U19.G0613', 'return sel.alv === true;'],
    ]);
    for (const id of [orchestrator.id, selectOrders.id, display.id]) expect(guardBodyOf(p)(id, bodies.get(id)!, []), id).toBeNull();
    const dir = writePackage(candidateFiles(p, bodies), 'cc-3018-display-');
    try {
      const tc = typecheck(dir);
      expect(tc.ok, tc.output.slice(0, 2000)).toBe(true);
      type Answer = { ok: boolean; errors: unknown[]; rows: Array<Record<string, unknown>> };
      const run = (alv: boolean) =>
        runInPackage<Answer>(
          dir,
          [
            `const { CONTRACT } = await import(${JSON.stringify(fileUrl(dir, 'srv/engine-contract.ts'))});`,
            `const { simulateRequest } = await import(${JSON.stringify(fileUrl(dir, 'srv/simulate.ts'))});`,
            `const { createRunStore } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/run-store.ts'))});`,
            `const request = { ...CONTRACT.baseRequest, alv: ${alv}, orders: [{ vbeln: '0000000001' }, { vbeln: '0000000002' }] };`,
            'const a = simulateRequest(request, createRunStore());',
            'console.log(JSON.stringify({ ok: a.ok, errors: a.errors, rows: a.run ? a.run.result.rows : [] }));',
          ].join('\n'),
        );
      const shown = run(true);
      expect(shown.errors).toEqual([]);
      expect(shown.ok).toBe(true);
      // Before: rows: [] — the orders were processed and the run answered none of them.
      expect(shown.rows.map((r) => r.vbeln)).toEqual(['0000000001', '0000000002']);
      const hidden = run(false);
      expect(hidden.ok).toBe(true);
      expect(hidden.rows).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('Z_BUSINESS_PARTNER_SYNC: a display with no check before it always gives the rows', () => {
  const p = prepared(read(BP_SYNC));
  const u = unitOf(p, 'DISPLAY_ALV');
  const file = p.scaffold.files.find((f) => f.path === u.file)!.content;
  expect(file).not.toContain('const reaches');
  expect(file).toMatch(/\n {2}st\.rows = st\.local\.gtBpData\.map\(\(r\) => \(\{ \.\.\.r \}\)\);\n/);
});

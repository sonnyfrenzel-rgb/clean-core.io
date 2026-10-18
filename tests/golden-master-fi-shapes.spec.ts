import { test, expect } from '@playwright/test';
import { goldenMasterForScaffold, originalDemoCases, readGoldenMaster } from '../lib/transformation/golden-master';
import { buildRapScaffold } from '../lib/transformation';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { planOf } from './helpers/transformation-scaffold';

/**
 * FI holdout review of 18.10.2026, A and B (roadmap 3.0.17), on a synthetic program of the same shape — the holdout
 * itself is not in the repository. A: the baseline filled a component with CONCATENATE … INTO ls-body (72 statements,
 * every body empty in the package); a case added rows through a demo routine that is no fixture routine (PERFORM
 * add_approval USING …, dropped); a case appended a global work area after setting two components, and the package's
 * row lacked the keys the original's row carries from the baseline. B: the clock and the poster the demo path assigns
 * (gv_now = p_at, gv_poster = sy-uname) did not reach the run, so every case stopped at the clock guard. Server-free.
 */

const SRC = [
  'REPORT zfx_fi_approvals.',
  'TYPES: BEGIN OF ty_appr,',
  '         bukrs  TYPE c LENGTH 4,',
  '         belnr  TYPE c LENGTH 10,',
  '         amount TYPE c LENGTH 12,',
  '         mode   TYPE c LENGTH 4,',
  '         body   TYPE c LENGTH 80,',
  '       END OF ty_appr.',
  'DATA: gt_appr TYPE STANDARD TABLE OF ty_appr WITH DEFAULT KEY,',
  '      gs_appr TYPE ty_appr,',
  '      gv_now TYPE c LENGTH 14,',
  '      gv_poster TYPE c LENGTH 12,',
  '      gv_case_text TYPE c LENGTH 80.',
  "PARAMETERS: p_demo AS CHECKBOX DEFAULT 'X',",
  '            p_case TYPE i DEFAULT 0,',
  "            p_at TYPE c LENGTH 14 DEFAULT '20261018120000'.",
  'START-OF-SELECTION.',
  "  IF p_demo = 'X'.",
  '    PERFORM build_demo.',
  '    PERFORM apply_case.',
  '  ENDIF.',
  '  IF gv_now IS INITIAL.',
  "    MESSAGE 'Invalid clock' TYPE 'E'.",
  '  ENDIF.',
  'FORM add_approval USING iv_bukrs TYPE c iv_belnr TYPE c iv_amount TYPE c.',
  '  DATA ls TYPE ty_appr.',
  '  ls-bukrs = iv_bukrs.',
  '  ls-belnr = iv_belnr.',
  '  ls-amount = iv_amount.',
  "  ls-mode = 'AUTO'.",
  "  CONCATENATE 'Approval' iv_belnr INTO ls-body SEPARATED BY space.",
  '  APPEND ls TO gt_appr.',
  'ENDFORM.',
  'FORM build_demo.',
  '  gv_now = p_at.',
  '  gv_poster = sy-uname.',
  '  CLEAR gs_appr.',
  "  gs_appr-bukrs = '1000'.",
  "  gs_appr-belnr = '0000000001'.",
  "  gs_appr-amount = '100.00'.",
  "  gs_appr-mode = 'AUTO'.",
  "  CONCATENATE 'Approval' gs_appr-belnr INTO gs_appr-body SEPARATED BY space.",
  '  APPEND gs_appr TO gt_appr.',
  '  CLEAR gs_appr.',
  "  gs_appr-bukrs = '1000'.",
  "  gs_appr-belnr = '0000000002'.",
  "  gs_appr-amount = '250.00'.",
  "  gs_appr-mode = 'MAN'.",
  "  CONCATENATE 'Approval' gs_appr-belnr INTO gs_appr-body SEPARATED BY space.",
  '  APPEND gs_appr TO gt_appr.',
  'ENDFORM.',
  'FORM apply_case.',
  '  CASE p_case.',
  '    WHEN 0.',
  "      gv_case_text = 'Baseline: two approvals'.",
  '    WHEN 1.',
  "      gv_case_text = 'A third approval through the demo routine'.",
  "      PERFORM add_approval USING '2000' '0000000003' '75.00'.",
  '    WHEN 2.',
  "      gv_case_text = 'A second line of the last document'.",
  "      gs_appr-amount = '5.00'.",
  "      gs_appr-mode = 'MAN'.",
  '      APPEND gs_appr TO gt_appr.',
  '    WHEN 3.',
  "      gv_case_text = 'A line of another company'.",
  '      gs_appr-bukrs = gv_bukrs_other.',
  "      gs_appr-amount = '1.00'.",
  '      APPEND gs_appr TO gt_appr.',
  '  ENDCASE.',
  'ENDFORM.',
].join('\n');

test('A: CONCATENATE into a component, a demo routine called inside a case, and a global work area keeps the keys the baseline left in it', () => {
  const gm = readGoldenMaster(SRC)!;
  expect(gm.baselineUnread).toEqual([]);
  expect(gm.baseline.GT_APPR.map((r) => r.body)).toEqual(['Approval 0000000001', 'Approval 0000000002']);
  const [c0, c1, c2, c3] = gm.cases;
  expect(c0.unread).toEqual([]);
  // PERFORM add_approval USING … — no fixture routine (it sets a literal and concatenates): followed, not dropped.
  expect(c1.unread).toEqual([]);
  expect(c1.tables.GT_APPR[2]).toEqual({ bukrs: '2000', belnr: '0000000003', amount: '75.00', mode: 'AUTO', body: 'Approval 0000000003' });
  // The row appended from gs_appr carries the company and document the baseline left in it.
  expect(c2.unread).toEqual([]);
  expect(c2.tables.GT_APPR[2]).toEqual({ bukrs: '1000', belnr: '0000000002', amount: '5.00', mode: 'MAN', body: 'Approval 0000000002' });
  // A key from a value the reader does not know is never emitted as a row without it: the case is not carried over.
  expect(c3.unread.map((u) => u.text)).toEqual(['gs_appr-bukrs = gv_bukrs_other']);
  const out = goldenMasterForScaffold(SRC, { logicClass: 'zcl_fx_logic', accessDouble: null, selection: [{ original: 'P_AT', component: 'p_at', range: false }], stateComponents: ['gt_appr', 'gv_now', 'gv_poster'], inputComponents: ['gt_appr', 'gv_now', 'gv_poster'] })!;
  expect(out.testClass.methods.map((m) => m.carried)).toEqual([true, true, true, false]);
  expect(out.testClass.methods[3].notCarried).toEqual([expect.stringMatching(/^assignment at L\d+$/)]);
  // The JSON form names a system field as such.
  expect(originalDemoCases(SRC)).not.toBeNull();
});

test('B: the scalar context the demo path assigns reaches the run through its input — the clock from the selection, the poster from the system', () => {
  const out = goldenMasterForScaffold(SRC, {
    logicClass: 'zcl_fx_logic',
    accessDouble: null,
    selection: [{ original: 'P_AT', component: 'p_at', range: false }],
    stateComponents: ['gt_appr', 'gv_now', 'gv_poster'],
    inputComponents: ['gt_appr', 'gv_now', 'gv_poster'],
  })!;
  const text = out.testClass.lines.join('\n');
  expect(text).toMatch(/METHOD context\.\s+rs_st-gv_now = CONV string\( is_sel-p_at \)\. " L\d+\s+rs_st-gv_poster = CONV string\( cl_abap_context_info=>get_user_technical_name\( \) \)\. " L\d+\s+ENDMETHOD\./);
  expect(text).toContain('DATA(ls_st) = is_ctx.');
  expect(text).toMatch(/METHOD case_01\.[\s\S]*?DATA\(ls_ctx\) = context\( ls_sel \)\.\s+DATA\(ls_out\) = run_case\( iv_case = 1 is_data = ls_data is_sel = ls_sel is_ctx = ls_ctx \)\./);
  // Without the run's input in the binding, an assignment of the baseline is not read — the binding of before.
  const before = goldenMasterForScaffold(SRC, { logicClass: 'zcl_fx_logic', accessDouble: null, selection: [], stateComponents: ['gt_appr'] })!;
  expect(before.testClass.lines.join('\n')).not.toContain('METHOD context.');

  // In the RAP package the clock and the poster are components of the run's input, and the include parses.
  const { facts, plan } = planOf(SRC);
  const scaffold = buildRapScaffold(plan, facts);
  const logic = scaffold.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!.content;
  const input = /TYPES BEGIN OF ty_run_input\.([\s\S]*?)TYPES END OF ty_run_input\./.exec(logic)![1];
  expect(input).toMatch(/TYPES gv_now /);
  expect(input).toMatch(/TYPES gv_poster /);
  const include = scaffold.files.find((f) => f.path.endsWith('.clas.testclasses.abap'))!.content;
  expect(include).toMatch(/rs_st-gv_now = CONV string\( is_sel-p_at \)\./);
  const lint = abaplintPackageCheck(scaffold.files);
  expect(lint.issues.filter((i) => i.path.endsWith('.testclasses.abap')), JSON.stringify(lint.issues)).toEqual([]);
});

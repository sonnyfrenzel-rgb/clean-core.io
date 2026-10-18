import { test, expect } from '@playwright/test';
import { abapInputContracts, abapTestEvidence, abapTestEvidenceSentences, inputContractPromptRule } from '../lib/testing-abap-unit';
import { judge, outcomeIn } from '../scripts/acceptance/child/engine-cases-core.mjs';
import { buildRapScaffold } from '../lib/transformation';
import { planOf } from './helpers/transformation-scaffold';
import fs from 'fs';
import path from 'path';

/**
 * QM review of 18.10.2026, QM-02 (roadmap 3.0.17): tests that do not reach what they claim. Thirteen model tests
 * called `run( is_selection = … )` without `is_input` — the logic class loads no data by itself, so they ran on empty
 * tables while expecting filled results — and two asserted only `IF sy-subrc = 0`, so a missing row passed. The
 * prompt now names the input contract, and the counting does not take such a method for a test; it names it in
 * STATUS. On Node, the run-identity engine case no longer passes on two runs that processed nothing. Server-free.
 */

const LOGIC = [
  'CLASS zcl_fx_logic DEFINITION PUBLIC FINAL CREATE PUBLIC.',
  '  PUBLIC SECTION.',
  '    TYPES BEGIN OF ty_run_selection.',
  '    TYPES p_demo TYPE c LENGTH 1.',
  '    TYPES END OF ty_run_selection.',
  '    TYPES BEGIN OF ty_run_input.',
  '    TYPES gt_lots TYPE string_table.',
  '    TYPES END OF ty_run_input.',
  '    TYPES BEGIN OF ty_run_result.',
  '    TYPES gt_lot_out TYPE string_table.',
  '    TYPES END OF ty_run_result.',
  '    METHODS run',
  '      IMPORTING',
  '        is_selection TYPE ty_run_selection',
  '        is_input TYPE ty_run_input OPTIONAL',
  '      RETURNING VALUE(rs_result) TYPE ty_run_result.',
  '    METHODS assess IMPORTING iv_x TYPE i RETURNING VALUE(rv) TYPE i.',
  'ENDCLASS.',
  'CLASS zcl_fx_logic IMPLEMENTATION.',
  '  METHOD run.',
  '  ENDMETHOD.',
  '  METHOD assess.',
  '    rv = iv_x.',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

const MODEL = [
  'CLASS ltcl_model DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
  '  PRIVATE SECTION.',
  '    DATA mo_cut TYPE REF TO zcl_fx_logic.',
  '    METHODS setup.',
  '    METHODS tc_12_no_input FOR TESTING.',
  '    METHODS tc_13_with_input FOR TESTING.',
  '    METHODS tc_14_empty_on_purpose FOR TESTING.',
  '    METHODS tc_45_guarded FOR TESTING.',
  '    METHODS tc_41_refused FOR TESTING.',
  '    METHODS tc_10_unit FOR TESTING.',
  'ENDCLASS.',
  'CLASS ltcl_model IMPLEMENTATION.',
  '  METHOD setup.',
  '    mo_cut = NEW zcl_fx_logic( ).',
  '  ENDMETHOD.',
  '  METHOD tc_12_no_input.',
  '    DATA ls_sel TYPE zcl_fx_logic=>ty_run_selection.',
  "    ls_sel-p_demo = 'X'.",
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel ).',
  '    cl_abap_unit_assert=>assert_equals( act = lines( ls_res-gt_lot_out ) exp = 2 ).',
  '  ENDMETHOD.',
  '  METHOD tc_13_with_input.',
  '    DATA ls_sel TYPE zcl_fx_logic=>ty_run_selection.',
  '    DATA ls_inp TYPE zcl_fx_logic=>ty_run_input.',
  "    APPEND `L001` TO ls_inp-gt_lots.",
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel is_input = ls_inp ).',
  '    cl_abap_unit_assert=>assert_equals( act = lines( ls_res-gt_lot_out ) exp = 1 ).',
  '  ENDMETHOD.',
  '  METHOD tc_14_empty_on_purpose.',
  '    DATA ls_sel TYPE zcl_fx_logic=>ty_run_selection.',
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel is_input = VALUE #( ) ).',
  '    cl_abap_unit_assert=>assert_initial( act = ls_res-gt_lot_out ).',
  '  ENDMETHOD.',
  '  METHOD tc_45_guarded.',
  '    DATA ls_sel TYPE zcl_fx_logic=>ty_run_selection.',
  '    DATA ls_inp TYPE zcl_fx_logic=>ty_run_input.',
  '    DATA(ls_res) = mo_cut->run( is_selection = ls_sel is_input = ls_inp ).',
  '    READ TABLE ls_res-gt_lot_out INTO DATA(lv_l) INDEX 1.',
  '    IF sy-subrc = 0.',
  "      cl_abap_unit_assert=>assert_equals( act = lv_l exp = `L008` ).",
  '    ENDIF.',
  '  ENDMETHOD.',
  '  METHOD tc_41_refused.',
  '    DATA ls_sel TYPE zcl_fx_logic=>ty_run_selection.',
  '    TRY.',
  '        mo_cut->run( is_selection = ls_sel ).',
  "        cl_abap_unit_assert=>fail( 'refused' ).",
  '      CATCH cx_static_check.',
  '    ENDTRY.',
  '  ENDMETHOD.',
  '  METHOD tc_10_unit.',
  '    cl_abap_unit_assert=>assert_equals( act = mo_cut->assess( iv_x = 1 ) exp = 1 ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

const files = [{ path: 'src/zcl_fx_logic.clas.abap', content: LOGIC }];

test('a model test that calls the run without its input, or asserts only when its row is found, is not counted as a test — and STATUS names it', () => {
  expect([...abapInputContracts(files)].map(([c, m]) => `${c}:${[...m].join(',')}`)).toEqual(['zcl_fx_logic:run']);
  const e = abapTestEvidence(files, MODEL)!;
  expect(e.counts).toMatchObject({ methods: 6, tests: 4, withoutInput: 1, guardedOnly: 1 });
  expect(e.counts.withoutInputNames).toEqual(['ltcl_model.tc_12_no_input']);
  expect(e.counts.guardedOnlyNames).toEqual(['ltcl_model.tc_45_guarded']);
  const sentences = abapTestEvidenceSentences(e);
  expect(sentences[0]).toBe(
    'ABAP Unit: 4 of 6 ABAP Unit test methods call the code under test; 1 calls the run without handing in its input (is_input) and 1 asserts only when the row it reads is found — not counted as tests.',
  );
  expect(sentences).toContain('Test does not hand in input — its expectation is not evidence: ltcl_model.tc_12_no_input call the run without is_input, so it runs on empty tables.');
  expect(sentences).toContain('Test asserts only when its row is found — a missing row passes, so it is not evidence: ltcl_model.tc_45_guarded.');
});

test('the testing prompt names the input contract of an engine-led RAP package; a package without one gets no such rule', () => {
  const rule = inputContractPromptRule(files)!;
  expect(rule).toContain('zcl_fx_logic->run( ) takes the data the run works on through `is_input`');
  expect(rule).toContain('`is_input = VALUE #( )`');
  expect(rule).toContain('never wrap the assertion in `IF sy-subrc = 0`');
  expect(inputContractPromptRule([{ path: 'src/zcl_x.clas.abap', content: LOGIC.replace(/is_input/g, 'iv_other') }])).toBeNull();
  // The scaffold's logic class is such a package.
  const { facts, plan } = planOf(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-master', 'three-cases.abap'), 'utf8'));
  const scaffold = buildRapScaffold(plan, facts);
  expect(inputContractPromptRule(scaffold.files)).toMatch(/^- THE INPUT CONTRACT \(CRITICAL\): zcl_\w+_logic->run\( \) takes/);
  // The hook puts it into the ABAP prompt.
  const hook = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'useTestGeneration.ts'), 'utf8');
  expect(hook).toContain('inputContractPromptRule(packageSources)');
  expect(hook).toMatch(/\$\{accessAsk\}\$\{inputAsk\}/);
});

test('Node: two run ids prove separation only for runs that processed input', () => {
  const call = { op: 'run-identity', set: [], expect: { kind: 'distinct-runs' } };
  const verdict = (out: Record<string, unknown>) => judge(call as never, outcomeIn(out) as never);
  const ids = { ids: ['RUN-1', 'RUN-2'], readBack: 'RUN-1' };
  expect(verdict({ ...ids, run: { ok: true, errors: [], records: 3 } }).status).toBe('pass');
  const refused = verdict({ ...ids, run: { ok: false, errors: [{ field: 'p_demo', rule: 'G-0272', message: 'x' }] } });
  expect(refused.status).toBe('fail');
  expect(refused.evidence).toContain('did not succeed');
  const empty = verdict({ ...ids, run: { ok: true, errors: [], records: 0 } });
  expect(empty.status).toBe('fail');
  expect(empty.evidence).toContain('0 records');
  expect(verdict(ids).status).toBe('fail');
});

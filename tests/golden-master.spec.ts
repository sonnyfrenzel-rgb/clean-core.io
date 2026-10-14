import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ORIGINAL_DEMO_FORMAT, goldenMasterForScaffold, goldenMasterSentence, originalDemoCases, readGoldenMaster } from '../lib/transformation/golden-master';
import { NOT_RUN_NO_CONTRACT, notRunWithoutContract } from '../lib/engine-call-contract';
import { deriveEngineCases, engineCasePromptSection } from '../lib/testing-engine-cases';
import { abapDeclarations, abapTestEvidence, abapTestEvidenceSentences, abapUnitCountsSentence, checkAbapTestClass, countAbapUnitTests, placeModelTestClasses } from '../lib/testing-abap-unit';
import { buildRapScaffold } from '../lib/transformation';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { planOf } from './helpers/transformation-scaffold';
import { testFactsOf } from '../lib/delivery-facts';

/**
 * Roadmap 3.0.13 item (6), the golden master (owner 14.10.2026): the
 * original's in-code demo cases are carried into the package as ABAP Unit test
 * data, a test method that skips or never calls the code under test is not
 * counted as a test, and the testing model's ABAP Unit class is checked against
 * the declarations of the class it tests. Server-free: hand-written fixtures,
 * no browser, no model.
 */

const FIXTURE = path.join(__dirname, 'fixtures', 'golden-master', 'three-cases.abap');
const three = () => fs.readFileSync(FIXTURE, 'utf8');

test('three demo cases of a small program: titles, baseline rows and each case’s input rows', () => {
  const gm = readGoldenMaster(three())!;
  expect(gm).not.toBeNull();
  expect(gm.baseRoutine.name).toBe('BUILD_DEMO');
  expect(gm.caseRoutine.name).toBe('APPLY_CASE');
  expect(gm.switchParameter).toBe('P_CASE');
  expect(gm.demoFlag).toBe('P_DEMO');
  expect(gm.fixtures.map((f) => `${f.name}>${f.table}`)).toEqual(['ADD_CLAIM>GT_CLAIMS', 'ADD_RATE>GT_RATES']);
  expect(gm.baseline.GT_CLAIMS).toEqual([
    { org: '1000', cid: '0000000001', qty: '2', price: '10.00' },
    { org: '1000', cid: '0000000002', qty: '0.300', price: '3.30' },
    { org: '2000', cid: '0000000003', qty: '1', price: '99.00' },
  ]);
  expect(gm.baseline.GT_RATES).toEqual([{ org: '1000', pct: '50' }]);

  expect(gm.cases.map((c) => [c.number, c.title, c.titleSource])).toEqual([
    [0, 'Baseline: two claims of one org at half rate', 'assignment'],
    [1, 'A rejected quantity of zero proposes no credit', 'assignment'],
    [2, 'A duplicate claim row with another price is held, not summed', 'assignment'],
  ]);
  const [c0, c1, c2] = gm.cases;
  expect(c0.changed).toEqual([]);
  expect(c0.tables).toEqual(gm.baseline);
  // LOOP … WHERE … MODIFY … INDEX: the one matching row changes, nothing else.
  expect(c1.changed).toEqual(['GT_CLAIMS']);
  expect(c1.tables.GT_CLAIMS[1]).toEqual({ org: '1000', cid: '0000000002', qty: '0', price: '3.30' });
  expect(c1.tables.GT_CLAIMS[0]).toEqual(gm.baseline.GT_CLAIMS[0]);
  // READ TABLE + component + APPEND, DELETE … WHERE, a fixture call, a parameter and a global set.
  expect(c2.tables.GT_CLAIMS).toHaveLength(4);
  expect(c2.tables.GT_CLAIMS[3]).toEqual({ org: '1000', cid: '0000000001', qty: '2', price: '12.00' });
  expect(c2.provenance.GT_CLAIMS).toEqual([0, 1, 2, null]);
  expect(c2.tables.GT_RATES).toEqual([{ org: '1000', pct: '25' }]);
  expect(c2.settings.map((s) => `${s.target}=${s.value}`)).toEqual(['P_ORG=2000', 'GV_SEALED=']);
  for (const c of gm.cases) expect(c.unread, `case ${c.number}`).toEqual([]);
});

test('titles from the WHEN comment, a switch held in a structure, a cleared table rebuilt, a structure field set through its parameter', () => {
  const src = [
    'PARAMETERS: p_case TYPE i DEFAULT 0, p_atom AS CHECKBOX DEFAULT \'X\'.',
    'DATA: gs_sel TYPE ty_sel, gt_res TYPE STANDARD TABLE OF ty_res WITH DEFAULT KEY.',
    'START-OF-SELECTION.',
    '  gs_sel-case_no = p_case.',
    '  gs_sel-atomic = p_atom.',
    '  PERFORM build_demo.',
    '  PERFORM apply_case.',
    'FORM add_res USING VALUE(iv_werks) TYPE c VALUE(iv_res) TYPE c VALUE(iv_cap) TYPE i.',
    '  DATA ls_row TYPE ty_res.',
    '  ls_row-werks = iv_werks.',
    '  ls_row-res = iv_res.',
    '  ls_row-cap = iv_cap.',
    '  APPEND ls_row TO gt_res.',
    'ENDFORM.',
    'FORM build_demo.',
    "  PERFORM add_res USING '1000' 'MECH' 2.",
    "  PERFORM add_res USING '1000' 'ELEC' 1.",
    'ENDFORM.',
    'FORM apply_case.',
    '  CASE gs_sel-case_no.',
    '    WHEN 0. " baseline',
    '      RETURN.',
    '    WHEN 1. " partial_orders',
    '      gs_sel-atomic = space.',
    '    WHEN 2. " one_mechanic',
    '      CLEAR gt_res.',
    "      PERFORM add_res USING '1000' 'MECH' 1.",
    '    WHEN 3. " extra_resource',
    "      PERFORM add_res USING '1000' 'CAL' 1.",
    '  ENDCASE.',
    'ENDFORM.',
  ].join('\n');
  const gm = readGoldenMaster(src)!;
  expect(gm.switchOperand).toBe('GS_SEL-CASE_NO');
  expect(gm.switchParameter).toBe('P_CASE');
  expect(gm.cases.map((c) => `${c.number}:${c.title}:${c.titleSource}`)).toEqual(['0:baseline:comment', '1:partial_orders:comment', '2:one_mechanic:comment', '3:extra_resource:comment']);
  expect(gm.cases[2].tables.GT_RES).toEqual([{ werks: '1000', res: 'MECH', cap: '1' }]);
  expect(gm.cases[3].tables.GT_RES).toHaveLength(3);
  expect(gm.aliases['GS_SEL-ATOMIC']).toBe('P_ATOM');
  const out = goldenMasterForScaffold(src, {
    logicClass: 'zcl_x_logic',
    accessDouble: null,
    selection: [{ original: 'P_ATOM', component: 'atom', range: false }],
    stateComponents: ['res'],
  })!;
  const text = out.testClass.lines.join('\n');
  // The structure field is set through the parameter it is filled from.
  expect(text).toMatch(/METHOD case_01\.[\s\S]*ls_sel-atom = ''\. " GS_SEL-ATOMIC = P_ATOM[\s\S]*ENDMETHOD/);
  expect(text).toContain('ls_st-res = CORRESPONDING #( is_data-res ).');
});

test('a baseline written row by row, field symbols, SORT, a date relative to a parameter, and the route-neutral JSON form', () => {
  const src = [
    "PARAMETERS: p_key TYPE sy-datum DEFAULT sy-datum, p_case TYPE i DEFAULT 0, p_plan AS CHECKBOX DEFAULT 'X'.",
    'DATA: gs_sup TYPE ty_sup, gt_sup TYPE STANDARD TABLE OF ty_sup WITH DEFAULT KEY, gv_case_text TYPE c LENGTH 60.',
    'START-OF-SELECTION.',
    '  PERFORM load_demo.',
    '  PERFORM apply_demo_case.',
    'FORM load_demo.',
    '  CLEAR gs_sup.',
    "  gs_sup-sid = 'S01'.",
    "  gs_sup-qty = '4'.",
    '  gs_sup-expiry = p_key + 10.',
    '  APPEND gs_sup TO gt_sup.',
    '  CLEAR gs_sup.',
    "  gs_sup-sid = 'S02'.",
    "  gs_sup-qty = '6'.",
    '  gs_sup-expiry = p_key.',
    '  APPEND gs_sup TO gt_sup.',
    'ENDFORM.',
    'FORM apply_demo_case.',
    '  FIELD-SYMBOLS <s> TYPE ty_sup.',
    '  CASE p_case.',
    '    WHEN 0.',
    "      gv_case_text = 'Baseline'.",
    '    WHEN 1.',
    "      gv_case_text = 'Planned supply disabled'.",
    '      CLEAR p_plan.',
    '    WHEN 2.',
    "      READ TABLE gt_sup ASSIGNING <s> WITH KEY sid = 'S02'.",
    '      <s>-expiry = p_key - 2.',
    "      <s>-qty = '0'.",
    '    WHEN 3.',
    '      SORT gt_sup BY sid DESCENDING.',
    '  ENDCASE.',
    'ENDFORM.',
  ].join('\n');
  const gm = readGoldenMaster(src)!;
  expect(gm.baseRoutine.name).toBe('LOAD_DEMO');
  expect(gm.cases.map((c) => [c.number, c.titleSource])).toEqual([
    [0, 'assignment'],
    [1, 'assignment'],
    [2, 'none'],
    [3, 'none'],
  ]);
  expect(gm.cases[2].title).toBe('Case 2');
  expect(gm.cases.every((c) => c.unread.length === 0)).toBe(true);
  expect(gm.cases[3].tables.GT_SUP.map((r) => r.sid)).toEqual(['S02', 'S01']);

  const json = JSON.parse(JSON.stringify(originalDemoCases(src)));
  expect(json.format).toBe(ORIGINAL_DEMO_FORMAT);
  expect(json.switch).toMatchObject({ operand: 'P_CASE', parameter: 'P_CASE', routine: 'APPLY_DEMO_CASE' });
  expect(json.parameters.P_KEY).toEqual({ default: '', written: 'sy-datum', type: 'SY-DATUM' });
  expect(json.baseline.rows.GT_SUP[0]).toEqual({ sid: 'S01', qty: '4', expiry: { param: 'P_KEY', op: '+', n: 10 } });
  expect(json.cases[2].rows.GT_SUP[1]).toEqual({ sid: 'S02', qty: '0', expiry: { param: 'P_KEY', op: '-', n: 2 } });
  expect(json.cases[1].settings).toEqual([{ target: 'P_PLAN', value: '', line: 25, parameter: 'P_PLAN' }]);

  // In ABAP: the date is computed on the selection the case runs with, and stays a date.
  const out = goldenMasterForScaffold(src, { logicClass: 'zcl_x_logic', accessDouble: null, selection: [{ original: 'P_KEY', component: 'key', range: false }, { original: 'P_PLAN', component: 'plan', range: false }], stateComponents: ['sup'] })!;
  const text = out.testClass.lines.join('\n');
  expect(text).toContain('expiry = CONV string( CONV d( is_sel-key + 10 ) )');
  expect(text).toContain("ls_data-sup[ 2 ]-expiry = CONV string( CONV d( ls_sel-key - 2 ) ).");
  expect(text).toContain('rs_sel-key = cl_abap_context_info=>get_system_date( ). " DEFAULT sy-datum');
  expect(text).toContain("ls_sel-plan = ''.");
});

test('the not-run reason of an engine case is said for the route: no Node.js call contract on the ABAP route', () => {
  expect(notRunWithoutContract('node', { path: 'srv/engine-contract.ts', missing: ['simulate'] })).toBe(`${NOT_RUN_NO_CONTRACT} (srv/engine-contract.ts lacks simulate)`);
  const abap = notRunWithoutContract('abap', { path: null, missing: [] });
  expect(abap).toContain('ABAP Unit test method in your system');
  expect(abap).not.toMatch(/call contract|Node/i);
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'testing', 'page.tsx'), 'utf8');
  expect(page).toContain("notRunWithoutContract(isAbapCloud ? 'abap' : 'node', callContract)");
  expect(engineCasePromptSection(deriveEngineCases(three(), []).cases, 'abap-unit')).not.toContain('srv/engine-contract');
});

test('a program without demo cases has no golden master; an integer CASE that touches no fixture table is not one', () => {
  expect(readGoldenMaster('REPORT z.\nSTART-OF-SELECTION.\n  WRITE / 1.\n')).toBeNull();
  const noFixture = three().replace(/PERFORM add_claim USING[^\n]*\n/g, '').replace(/PERFORM add_rate USING[^\n]*\n/g, '');
  expect(readGoldenMaster(noFixture)).toBeNull();
});

test('the test class: one method per case calling the run entry, the case’s rows applied to the baseline, nothing expected that the original does not say', () => {
  const out = goldenMasterForScaffold(three(), {
    logicClass: 'zcl_gm_credit_logic',
    accessDouble: 'ltd_access',
    selection: [
      { original: 'P_ORG', component: 'org', range: false },
      { original: 'P_CASE', component: 'case', range: false },
      { original: 'P_DEMO', component: 'demo', range: false },
    ],
    stateComponents: ['records', 'not_filled', 'claims', 'rates'],
    program: 'ZFX_GM_CREDIT',
  })!;
  const text = out.testClass.lines.join('\n');
  expect(out.testClass.methods.map((m) => m.name)).toEqual(['case_00', 'case_01', 'case_02']);
  expect(out.testClass.methods.every((m) => m.bound)).toBe(true);
  for (const m of out.testClass.methods) expect(m.name.length).toBeLessThanOrEqual(30);
  expect(text).toContain('CLASS ltc_golden_master DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.');
  expect(text).toContain('lo_cut->run_steps( EXPORTING is_sel = is_sel CHANGING cs_st = ls_st ).');
  expect(text).toContain('DATA(lo_cut) = NEW zcl_gm_credit_logic( io_access = NEW ltd_access( ) ).');
  expect(text).toContain('ls_st-claims = CORRESPONDING #( is_data-claims ).');
  expect(text).toContain("rs_sel-org = '1000'.");
  // The demo switch and the case number are not passed: the test passes the data itself.
  expect(text).not.toMatch(/rs_sel-(case|demo) =/);
  expect(text).toContain("ls_data-claims[ 2 ]-qty = '0'.");
  expect(text).toMatch(/APPEND VALUE #\(\s+org = '1000' cid = '0000000001' qty = '2' price = '12\.00'\s+\) TO ls_data-claims\./);
  expect(text).toContain("ls_sel-org = '2000'.");
  expect(text).toContain('Not passed: GV_SEALED');
  expect(text).toContain('from the original, confirm once in your system');
  // No assertion on an outcome: only that the case runs.
  expect(text).not.toMatch(/assert_equals/);
  expect(text).not.toMatch(/=>skip\(/);
  expect(goldenMasterSentence(out.testClass)).toBe(
    '3 demo cases of the original carried over as ABAP Unit test data (3 of 3 passed to the logic with all their rows) — expected values to be confirmed once in your system.',
  );
});

test('the RAP scaffold carries the golden master in the logic class’s test include, and abaplint parses it', () => {
  const { facts, plan } = planOf(three());
  const scaffold = buildRapScaffold(plan, facts);
  const include = scaffold.files.find((f) => f.path.endsWith('.clas.testclasses.abap'))!;
  expect(include.content).toContain('CLASS ltc_golden_master DEFINITION');
  expect((include.content.match(/METHODS case_\d+ FOR TESTING/g) ?? []).length).toBe(3);
  const lint = abaplintPackageCheck(scaffold.files);
  expect(lint.issues.filter((i) => i.path.endsWith('.testclasses.abap')), JSON.stringify(lint.issues)).toEqual([]);
  // Today's state has no component for the demo rows: the methods run the logic without the case data and are not counted as tests.
  const evidence = abapTestEvidence(scaffold.files, null)!;
  expect(evidence.goldenMaster).toEqual({ cases: 3, rowsPassed: false });
  expect(evidence.counts.withoutData).toBe(3);
  const sentences = abapTestEvidenceSentences(evidence);
  expect(sentences[1]).toContain('3 demo cases of the original carried over as ABAP Unit test data, expected values to be confirmed once in your system');
  expect(sentences[1]).toContain('not yet passed to the logic');
});

test('STATUS on the ABAP route says which test methods are tests and how many demo cases were carried over', () => {
  const { facts, plan } = planOf(three());
  const scaffold = buildRapScaffold(plan, facts);
  const project = {
    extensibilityRoute: 'ABAP Cloud (RAP)',
    generatedCode: JSON.stringify(scaffold.files.map((f) => ({ path: f.path, content: f.content }))),
    testCases: [{ id: 'TC_01', name: 'x' }],
  };
  const detail = testFactsOf(project as unknown as Parameters<typeof testFactsOf>[0], []).detail;
  const abap = detail.find((d) => d.startsWith('ABAP Unit: '))!;
  expect(abap).toMatch(/^ABAP Unit: 0 of \d+ ABAP Unit test methods call the code under test; .*3 call it without its case data — not counted as tests\.$/);
  expect(detail).toContainEqual(expect.stringContaining('3 demo cases of the original carried over as ABAP Unit test data, expected values to be confirmed once in your system'));
  // Not on the Node route.
  expect(testFactsOf({ ...project, extensibilityRoute: 'Side-by-Side (BTP)' } as unknown as Parameters<typeof testFactsOf>[0], []).detail.some((d) => d.startsWith('ABAP Unit'))).toBe(false);
});

test('a test method that only skips, or never calls the code under test, is not counted as a test', () => {
  const cut = [
    'CLASS zcl_calc DEFINITION PUBLIC FINAL CREATE PUBLIC.',
    '  PUBLIC SECTION.',
    '    METHODS run IMPORTING iv_qty TYPE i RETURNING VALUE(rv) TYPE i.',
    'ENDCLASS.',
    'CLASS zcl_calc IMPLEMENTATION.',
    '  METHOD run.',
    '    rv = iv_qty.',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
  const tests = [
    'CLASS ltc DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
    '  PRIVATE SECTION.',
    '    METHODS calls_it FOR TESTING.',
    '    METHODS via_helper FOR TESTING.',
    '    METHODS only_skips FOR TESTING.',
    '    METHODS local_math FOR TESTING.',
    '    METHODS helper RETURNING VALUE(rv) TYPE i.',
    'ENDCLASS.',
    'CLASS ltc IMPLEMENTATION.',
    '  METHOD calls_it.',
    '    DATA(lo_cut) = NEW zcl_calc( ).',
    '    cl_abap_unit_assert=>assert_equals( act = lo_cut->run( iv_qty = 2 ) exp = 2 ).',
    '  ENDMETHOD.',
    '  METHOD via_helper.',
    '    cl_abap_unit_assert=>assert_equals( act = helper( ) exp = 3 ).',
    '  ENDMETHOD.',
    '  METHOD only_skips.',
    "    cl_abap_unit_assert=>skip( msg = 'runs through the call contract' ).",
    '  ENDMETHOD.',
    '  METHOD local_math.',
    '    DATA lv_value TYPE p LENGTH 8 DECIMALS 2.',
    "    lv_value = '0.1' + '0.2'.",
    "    cl_abap_unit_assert=>assert_equals( act = lv_value exp = '0.3' ).",
    '  ENDMETHOD.',
    '  METHOD helper.',
    '    rv = NEW zcl_calc( )->run( iv_qty = 3 ).',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
  const counts = countAbapUnitTests([{ path: 'src/zcl_calc.clas.testclasses.abap', content: tests }], abapDeclarations([{ content: cut }]).keys());
  expect(counts).toMatchObject({ methods: 4, tests: 2, skipped: 1, noCall: 1 });
  expect(counts.skippedNames).toEqual(['ltc.only_skips']);
  expect(counts.noCallNames).toEqual(['ltc.local_math']);
  expect(abapUnitCountsSentence(counts)).toBe('2 of 4 ABAP Unit test methods call the code under test; 1 skips and 1 does not call it — not counted as tests.');
});

test('a testing-model class that calls an undeclared method is refused, with the method named; so is a long name and a global class', () => {
  const pkg = [
    {
      path: 'src/zcl_sd_logic.clas.abap',
      content: [
        'CLASS zcl_sd_logic DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION.',
        '    INTERFACES zif_sd_steps.',
        '    METHODS run_steps IMPORTING is_sel TYPE string CHANGING cs_st TYPE string.',
        '    METHODS constructor IMPORTING io_access TYPE REF TO object OPTIONAL.',
        'ENDCLASS.',
        'CLASS zcl_sd_logic IMPLEMENTATION.',
        '  METHOD run_steps.',
        '  ENDMETHOD.',
        '  METHOD constructor.',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
    },
    { path: 'src/zif_sd_steps.intf.abap', content: 'INTERFACE zif_sd_steps PUBLIC.\n  METHODS reset.\nENDINTERFACE.' },
  ];
  const good = [
    'CLASS ltcl_test DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
    '  PRIVATE SECTION.',
    '    DATA mo_cut TYPE REF TO zcl_sd_logic.',
    '    METHODS tc_01_runs FOR TESTING.',
    'ENDCLASS.',
    'CLASS ltcl_test IMPLEMENTATION.',
    '  METHOD tc_01_runs.',
    '    DATA lv_st TYPE string.',
    '    mo_cut = NEW zcl_sd_logic( io_access = NEW lcl_double( ) ).',
    "    mo_cut->run_steps( EXPORTING is_sel = 'x' CHANGING cs_st = lv_st ).",
    '    mo_cut->zif_sd_steps~reset( ).',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
  expect(checkAbapTestClass(good, pkg)).toEqual({ ok: true, problems: [] });

  const bad = good
    .replace('mo_cut->zif_sd_steps~reset( ).', 'mo_cut->calculate_credit_proposal( iv_claim = 1 ).\n    mo_cut->run_steps( EXPORTING is_selection = 1 CHANGING cs_st = lv_st ).')
    .replace('tc_01_runs FOR TESTING', 'tc_01_runs FOR TESTING.\n    METHODS tc_02_the_credit_is_capped_per_payer FOR TESTING')
    .replace('METHOD tc_01_runs.', 'METHOD tc_02_the_credit_is_capped_per_payer.\n  ENDMETHOD.\n  METHOD tc_01_runs.');
  const check = checkAbapTestClass(bad, pkg);
  expect(check.ok).toBe(false);
  expect(check.problems.find((p) => p.kind === 'undeclared-method')).toMatchObject({ name: 'calculate_credit_proposal', on: 'zcl_sd_logic' });
  expect(check.problems.find((p) => p.kind === 'undeclared-method')!.message).toContain('zcl_sd_logic declares no method calculate_credit_proposal');
  expect(check.problems.find((p) => p.kind === 'undeclared-parameter')).toMatchObject({ name: 'is_selection', on: 'zcl_sd_logic->run_steps' });
  expect(check.problems.find((p) => p.kind === 'name-too-long')).toMatchObject({ name: 'tc_02_the_credit_is_capped_per_payer' });

  const global = good.replace('CLASS ltcl_test DEFINITION FINAL FOR TESTING', 'CLASS zcl_demo_rap_test DEFINITION PUBLIC FINAL FOR TESTING').replace('CLASS ltcl_test IMPLEMENTATION', 'CLASS zcl_demo_rap_test IMPLEMENTATION');
  expect(checkAbapTestClass(global, pkg).problems.map((p) => p.kind)).toEqual(['global-test-class']);
  const reserved = good.replace(/ltcl_test/g, 'ltc_golden_master');
  expect(checkAbapTestClass(reserved, pkg).problems.map((p) => p.kind)).toEqual(['reserved-name']);
});

test('the model’s local test class goes into the test include of the class under test, not into a class its source does not define', () => {
  const files = [
    { path: 'src/zcl_sd_logic.clas.abap', content: 'CLASS zcl_sd_logic DEFINITION PUBLIC.\nENDCLASS.\n' },
    { path: 'src/zcl_sd_logic.clas.testclasses.abap', content: 'CLASS ltc_engine_cases DEFINITION FOR TESTING.\nENDCLASS.\n' },
  ];
  const placed = placeModelTestClasses(files, 'CLASS ltcl_test DEFINITION FOR TESTING.\nENDCLASS.\n')!;
  expect(placed.path).toBe('src/zcl_sd_logic.clas.testclasses.abap');
  expect(placed.content).toContain('CLASS ltc_engine_cases DEFINITION');
  expect(placed.content).toContain('CLASS ltcl_test DEFINITION');
  expect(placeModelTestClasses([files[0]], 'CLASS ltcl_test DEFINITION FOR TESTING.\nENDCLASS.\n')).toBeNull();
});

/*
 * The two acceptance programs of 3.0.13 (the owner's SD example and the PM
 * holdout) are not in the repository. Where they are on this machine — or
 * named by CC_GOLDEN_SD / CC_GOLDEN_PM — their cases are held here.
 */
const desktop = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'OneDrive', 'Desktop');
const SD = process.env.CC_GOLDEN_SD ?? path.join(desktop, 'SD_LE_Legacy_ABAP.txt');
const PM = process.env.CC_GOLDEN_PM ?? path.join(desktop, 'PM_Legacy_ABAP.txt');

test('ZSD_RETURN_CREDIT_RECON: 32 demo cases with their titles and input rows, every one read whole', () => {
  test.skip(!fs.existsSync(SD), `the SD acceptance program is not on this machine (${SD})`);
  const gm = readGoldenMaster(fs.readFileSync(SD, 'utf8'))!;
  expect(gm.cases.map((c) => c.number)).toEqual(Array.from({ length: 32 }, (_, i) => i));
  expect(gm.cases.every((c) => c.titleSource === 'assignment' && c.unread.length === 0)).toBe(true);
  expect(gm.cases[0].title).toBe('Baseline: scoped caps, retries, reversals, pending receipts and held groups');
  expect(gm.cases[31].title).toBe('Repair baseline data errors; pending inspection alone is not a run failure');
  expect(Object.fromEntries(Object.entries(gm.baseline).map(([t, r]) => [t, r.length]))).toEqual({ GT_CLAIMS: 13, GT_POLICY: 11, GT_UOM: 4, GT_RAW: 53 });
  expect(gm.cases[18].ranges.S_SHOW).toEqual([{ sign: 'I', option: 'EQ', low: '0000001002' }]);
  expect(gm.cases[5].tables.GT_RAW).toEqual([...gm.baseline.GT_RAW].reverse());
});

test('ZPM_SHUTDOWN_SLOT_PLAN (holdout): 28 demo cases with their titles and input rows, every one read whole', () => {
  test.skip(!fs.existsSync(PM), `the PM holdout program is not on this machine (${PM})`);
  const gm = readGoldenMaster(fs.readFileSync(PM, 'utf8'))!;
  expect(gm.cases.map((c) => c.number)).toEqual(Array.from({ length: 28 }, (_, i) => i));
  expect(gm.cases.every((c) => c.titleSource === 'comment' && c.unread.length === 0)).toBe(true);
  expect(gm.cases[1].title).toBe('partial_orders');
  expect(gm.baseRoutine.name).toBe('BUILD_DEMO');
});

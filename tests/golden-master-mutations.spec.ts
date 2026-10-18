import { test, expect } from '@playwright/test';
import { goldenMasterForScaffold, goldenMasterSentence, originalDemoCases, readGoldenMaster } from '../lib/transformation/golden-master';
import { abapTestEvidence, abapTestEvidenceSentences, goldenMasterInInclude } from '../lib/testing-abap-unit';
import { buildRapScaffold } from '../lib/transformation';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { nodeDemoFiles } from '../lib/transformation/node-demo';
import { planOf } from './helpers/transformation-scaffold';

/**
 * QM review of 18.10.2026, QM-01 and QM-04 (roadmap 3.0.17). QM-01: the golden master of the QM example carried 21 of
 * 32 demo cases with different data than the original's — the case routine changed existing rows (READ … IF sy-subrc
 * = 0 … MODIFY … INDEX sy-tabix), and the reader listed those statements as not read but still ran the case under the
 * original's title. Now the reader executes the usual mutations, and a case it cannot carry exactly is not run: it
 * skips naming the statement. QM-04: a function still a stub ended the whole RAP run with zcx_…_nofill, so the
 * result computed up to there was lost; now the run boundary catches it and names the unit. Server-free.
 */

const SRC = [
  'REPORT zfx_gm_mutations.',
  'TYPES: BEGIN OF ty_res,',
  '         rid    TYPE c LENGTH 4,',
  '         lot    TYPE c LENGTH 4,',
  '         sample TYPE c LENGTH 2,',
  '         val    TYPE c LENGTH 8,',
  '       END OF ty_res.',
  'DATA: gt_res TYPE STANDARD TABLE OF ty_res WITH DEFAULT KEY,',
  '      gv_case_text TYPE c LENGTH 80.',
  "PARAMETERS: p_demo AS CHECKBOX DEFAULT 'X',",
  '            p_case TYPE i DEFAULT 0.',
  'START-OF-SELECTION.',
  "  IF p_demo = 'X'.",
  '    PERFORM build_baseline.',
  '    PERFORM apply_case.',
  '  ENDIF.',
  'FORM add_res USING iv_rid TYPE c iv_lot TYPE c iv_sample TYPE c iv_val TYPE c.',
  '  DATA ls TYPE ty_res.',
  '  ls-rid = iv_rid.',
  '  ls-lot = iv_lot.',
  '  ls-sample = iv_sample.',
  '  ls-val = iv_val.',
  '  APPEND ls TO gt_res.',
  'ENDFORM.',
  'FORM build_baseline.',
  "  PERFORM add_res USING 'R001' 'L001' 'A1' '10'.",
  "  PERFORM add_res USING 'R002' 'L001' 'A2' '10'.",
  "  PERFORM add_res USING 'R003' 'L002' 'A1' '9'.",
  "  PERFORM add_res USING 'R004' 'L002' 'A2' '10'.",
  'ENDFORM.',
  'FORM apply_case.',
  '  DATA ls_res TYPE ty_res.',
  '  CASE p_case.',
  '    WHEN 0.',
  "      gv_case_text = 'Baseline: two lots of two samples'.",
  '    WHEN 1.',
  "      gv_case_text = 'Missing mandatory initial sample'.",
  "      DELETE gt_res WHERE rid = 'R002'.",
  '    WHEN 2.',
  "      gv_case_text = 'A value below the limit'.",
  "      READ TABLE gt_res ASSIGNING FIELD-SYMBOL(<r>) WITH KEY rid = 'R003'.",
  "      <r>-val = '9.7'.",
  '    WHEN 3.',
  "      gv_case_text = 'Retest reuses an original physical sample'.",
  "      ls_res-sample = 'A1'.",
  "      MODIFY gt_res FROM ls_res TRANSPORTING sample WHERE rid = 'R004'.",
  '    WHEN 4.',
  "      gv_case_text = 'Known exact zero is not missing'.",
  "      READ TABLE gt_res INTO ls_res WITH KEY rid = 'R001'.",
  '      IF sy-subrc = 0.',
  "        ls_res-val = '0'.",
  '        MODIFY gt_res FROM ls_res INDEX sy-tabix.',
  '      ENDIF.',
  '    WHEN 5.',
  "      gv_case_text = 'Two confirmation samples'.",
  "      PERFORM add_res USING 'R005' 'L003' 'B1' '10'.",
  "      APPEND VALUE #( rid = 'R006' lot = 'L003' sample = 'B2' val = '11' ) TO gt_res.",
  '    WHEN 6.',
  "      gv_case_text = 'One sample per lot'.",
  '      DELETE ADJACENT DUPLICATES FROM gt_res COMPARING lot.',
  '  ENDCASE.',
  'ENDFORM.',
].join('\n');
const LINE_OF_ADJACENT = SRC.split('\n').findIndex((l) => l.includes('DELETE ADJACENT')) + 1;

const binding = {
  logicClass: 'zcl_fx_logic',
  accessDouble: null,
  selection: [],
  stateComponents: ['gt_res'],
  notFilledComponent: 'not_filled',
};

const bodyOf = (text: string, method: string) => new RegExp(`METHOD ${method}\\.([\\s\\S]*?)ENDMETHOD\\.`).exec(text)![1];

test('a case carries its deletions, field changes on existing rows and new rows exactly as the original builds them', () => {
  const gm = readGoldenMaster(SRC)!;
  expect(gm.cases.map((c) => c.number)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  for (const c of gm.cases.slice(0, 6)) expect(c.unread, `case ${c.number}`).toEqual([]);
  const rows = (n: number) => gm.cases[n].tables.GT_RES.map((r) => `${r.rid}/${r.sample}/${r.val}`);
  expect(rows(0)).toEqual(['R001/A1/10', 'R002/A2/10', 'R003/A1/9', 'R004/A2/10']);
  // DELETE … WHERE: the row is gone.
  expect(rows(1)).toEqual(['R001/A1/10', 'R003/A1/9', 'R004/A2/10']);
  // READ TABLE … ASSIGNING FIELD-SYMBOL(<r>). <r>-val = …: the row itself changes.
  expect(rows(2)).toEqual(['R001/A1/10', 'R002/A2/10', 'R003/A1/9.7', 'R004/A2/10']);
  // MODIFY … TRANSPORTING sample WHERE …: only that component of the matching row.
  expect(rows(3)).toEqual(['R001/A1/10', 'R002/A2/10', 'R003/A1/9', 'R004/A1/10']);
  // READ … INTO; IF sy-subrc = 0; MODIFY … INDEX sy-tabix (the QM shape).
  expect(rows(4)).toEqual(['R001/A1/0', 'R002/A2/10', 'R003/A1/9', 'R004/A2/10']);
  // A fixture call and APPEND VALUE #( … ).
  expect(rows(5)).toEqual(['R001/A1/10', 'R002/A2/10', 'R003/A1/9', 'R004/A2/10', 'R005/B1/10', 'R006/B2/11']);
  expect(gm.cases[6].unread.map((u) => u.line)).toEqual([LINE_OF_ADJACENT]);

  const out = goldenMasterForScaffold(SRC, binding)!;
  const text = out.testClass.lines.join('\n');
  expect(bodyOf(text, 'case_01')).toContain('DELETE ls_data-res INDEX 2.');
  expect(bodyOf(text, 'case_02')).toContain("ls_data-res[ 3 ]-val = '9.7'.");
  expect(bodyOf(text, 'case_03')).toContain("ls_data-res[ 4 ]-sample = 'A1'.");
  expect(bodyOf(text, 'case_04')).toContain("ls_data-res[ 1 ]-val = '0'.");
  expect(bodyOf(text, 'case_05')).toMatch(/APPEND VALUE #\(\s+rid = 'R006' lot = 'L003' sample = 'B2' val = '11'\s+\) TO ls_data-res\./);
  for (const m of out.testClass.methods.slice(0, 6)) {
    expect(m.carried, m.name).toBe(true);
    expect(bodyOf(text, m.name)).toContain('run_case(');
  }
  // The route-neutral JSON carries the same rows.
  expect(originalDemoCases(SRC)!.cases[3].rows.GT_RES[3]).toEqual({ rid: 'R004', lot: 'L002', sample: 'A1', val: '10' });
});

test('a case whose data the engine cannot carry exactly is not run: it skips naming the statement, and every count says so', () => {
  const out = goldenMasterForScaffold(SRC, binding)!;
  const text = out.testClass.lines.join('\n');
  const m6 = out.testClass.methods.find((m) => m.case === 6)!;
  expect(m6.carried).toBe(false);
  expect(m6.notCarried).toEqual([`DELETE ADJACENT at L${LINE_OF_ADJACENT}`]);
  const body = bodyOf(text, 'case_06');
  expect(body).not.toContain('run_case(');
  expect(body).toContain(`L${LINE_OF_ADJACENT}: DELETE ADJACENT DUPLICATES FROM gt_res COMPARING lot`);
  expect(body).toContain(`cl_abap_unit_assert=>skip( msg = 'Case 6 not carried over: DELETE ADJACENT at L${LINE_OF_ADJACENT} - its data would not be the original''s, so it is not run' ).`);
  expect(goldenMasterSentence(out.testClass)).toContain('; 1 not carried over exactly (a statement of the original the engine could not read');
  expect(goldenMasterSentence(out.testClass)).toContain('7 case methods created; 6 of 7 with their data carried completely; 0 of 7 compare a result of the original; passed in SAP: not known here');

  // A setting with no field in the selection is a difference in data as well.
  const withSetting = SRC.replace("      gv_case_text = 'Two confirmation samples'.", "      gv_case_text = 'Two confirmation samples'.\n      p_demo = 'Y'.");
  const m5 = goldenMasterForScaffold(withSetting, binding)!.testClass.methods.find((m) => m.case === 5)!;
  expect(m5.carried).toBe(false);
  expect(m5.notCarried[0]).toMatch(/^P_DEMO set at L\d+ \(ty_selection has no field for it\)$/);

  // In the RAP package: the include reports it, and STATUS's sentence names it.
  const { facts, plan } = planOf(SRC);
  const scaffold = buildRapScaffold(plan, facts);
  const include = scaffold.files.find((f) => f.path.endsWith('.clas.testclasses.abap'))!;
  expect(goldenMasterInInclude(include.content)).toMatchObject({ cases: 7, notCarried: 1 });
  const sentences = abapTestEvidenceSentences(abapTestEvidence(scaffold.files, null)!);
  expect(sentences[1]).toContain('1 not carried over exactly');

  // On Node the case is not run, with the same words.
  const fixtures = nodeDemoFiles(plan, { structures: [], globals: [] } as never, originalDemoCases(SRC)).find((f) => f.path === 'srv/fixtures.ts')!;
  expect(fixtures.content).toContain("reason: 'not carried over: ' + kinds.join(', ')");
  expect(fixtures.content).toContain('function statementKind(text: string): string {');
});

test('QM-04: a function still a stub ends the RAP run where it is reached, but the result is returned with the unit named', () => {
  const { facts, plan } = planOf(SRC);
  const scaffold = buildRapScaffold(plan, facts);
  const logic = scaffold.files.find((f) => /zcl_\w+_logic\.clas\.abap$/.test(f.path))!.content;
  const cx = /CLASS (zcx_\w+_nofill) DEFINITION/.exec(scaffold.files.map((f) => f.content).join('\n'))![1];
  const run = bodyOf(logic, 'run');
  expect(run).toMatch(new RegExp(`TRY\\.\\s+[\\s\\S]*?run_steps\\( \\)\\.\\s+CATCH ${cx} INTO DATA\\(lx_nofill\\)\\.\\s+APPEND lx_nofill->unit TO rs_result-not_filled\\.`));
  // The copy of the result follows the TRY: what was computed up to the stub is returned.
  expect(run.indexOf('ENDTRY.')).toBeLessThan(run.indexOf('rs_result-gt_res = gt_res.'));
  expect(logic).toContain('TYPES not_filled TYPE string_table.');
  // A demo case that reaches a stub is red, not green on half a run.
  const include = scaffold.files.find((f) => f.path.endsWith('.clas.testclasses.abap'))!.content;
  expect(bodyOf(include, 'run_case')).toContain('IF ls_st-not_filled IS NOT INITIAL.');
  const lint = abaplintPackageCheck(scaffold.files);
  expect(lint.issues.filter((i) => /parser|syntax/i.test(i.rule ?? '')), JSON.stringify(lint.issues)).toEqual([]);
});


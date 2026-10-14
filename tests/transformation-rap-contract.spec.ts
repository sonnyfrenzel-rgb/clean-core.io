import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as abaplint from '@abaplint/core';
import { buildRapScaffold } from '../lib/transformation';
import { abaplintConfig } from '../lib/transformation/abaplint-config';
import { abapCheck } from '../lib/transformation/abap-check';
import { bodyGuards, spliceBodies } from '../lib/transformation/markers';
import { prepareEngineLed, guardContextOf } from '../lib/transformation/engine-led';
import { fillInstructionHeader } from '../lib/transformation/fill-prompt';
import type { ScaffoldFile } from '../lib/transformation/types';
import { SAP_STUBS } from './helpers/abaplint-sap-stubs';
import { FIXTURES, fixture, planOf, poDemo, ROOT } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.13 — "A real Transformation tool: generated ABAP that activates", items 2–5, scaffold version 6.
 *
 * Two external reviews of the SD example (14.10.2026) found the RAP package unable to activate: every method
 * `(is_sel, CHANGING cs_st)` while the bodies were the original's FORMs over its globals; record components typed
 * as text; guards generated and never called, the live-probe safety lock only a save validation with an empty
 * selection; a read-only simulation delivered as a managed business object over a union table. The fixture
 * `contract-shape.abap` carries each of those shapes (hand-written, not the SD program). Server-free.
 */

const contractShape = () => fs.readFileSync(path.join(FIXTURES, 'contract-shape.abap'), 'utf8');
const BENCH = (rel: string) => fs.readFileSync(path.join(ROOT, 'tests', 'prozess-benchmark', 'cases', rel), 'utf8');

function rap(source: string) {
  const { facts, plan } = planOf(source);
  return { facts, plan, scaffold: buildRapScaffold(plan, facts) };
}
const file = (files: readonly ScaffoldFile[], suffix: string) => files.find((f) => f.path.endsWith(suffix))?.content ?? '';

/** abaplint as shipped (`abaplint.json`), plus the semantic check over the package's own objects with SAP's released objects as stubs. */
function lint(files: readonly ScaffoldFile[]) {
  const config = abaplintConfig();
  const registry = new abaplint.Registry(new abaplint.Config(JSON.stringify({ ...config, rules: { ...config.rules, check_syntax: true } })));
  registry.addDependencies(Object.entries(SAP_STUBS).map(([name, content]) => new abaplint.MemoryFile(name, content)));
  for (const f of files) if (f.path.startsWith('src/')) registry.addFile(new abaplint.MemoryFile(f.path.slice(4), f.content));
  registry.parse();
  const issues = registry.findIssues().map((i) => ({ file: i.getFilename(), line: i.getStart().getRow(), rule: i.getKey(), message: i.getMessage() }));
  return {
    parser: issues.filter((i) => i.rule === 'parser_error' || i.rule === 'cds_parser_error'),
    syntax: issues.filter((i) => i.rule === 'check_syntax'),
    all: issues,
  };
}

test.describe('the typed contract of the logic class', () => {
  const { scaffold, plan } = rap(contractShape());
  const logic = file(scaffold.files, '_logic.clas.abap');

  test("every routine's method carries its FORM's own parameters, with their types", () => {
    expect(logic).toMatch(/METHODS check_stamp\n\s+IMPORTING\n\s+iv_stamp TYPE ty_stamp\n\s+CHANGING\n\s+cv_code TYPE ty_code\n\s+RAISING zcx_fx_contract_access\./);
    expect(logic).toMatch(/METHODS round_ratio\n\s+IMPORTING\n\s+iv_num TYPE ty_i\n\s+iv_den TYPE ty_i\n\s+CHANGING\n\s+cv_value TYPE ty_i/);
    // The 3.0.12 contract is gone: no routine's method takes the selection and a state (only the test entry run_with_state does).
    expect(logic).not.toMatch(/ty_selection\b|ty_state\b|ty_rec\b/);
    for (const u of plan.units) expect(scaffold.rap!.signatures[u.id] ?? '', u.id).not.toMatch(/is_sel|cs_st/);
    expect(scaffold.rap?.signatures.U02).toBe('METHODS check_stamp IMPORTING iv_stamp TYPE ty_stamp CHANGING cv_code TYPE ty_code RAISING zcx_fx_contract_access.');
  });

  test('the original\'s types stay as declared: packed with its places, i an integer, d a date, n digits', () => {
    expect(logic).toContain('    TYPES ty_i TYPE p LENGTH 16 DECIMALS 0.');
    expect(logic).toContain('    TYPES qty TYPE ty_raw.');
    expect(logic).toContain('    TYPES day TYPE d.');
    expect(logic).toContain('    TYPES priority TYPE i.');
    expect(logic).toContain('    TYPES item TYPE n LENGTH 6.');
    // Nothing numeric enters as text.
    expect(logic).not.toMatch(/TYPE string OPTIONAL/);
  });

  test('globals and selection inputs are attributes under their original names; the run takes and returns them', () => {
    for (const name of ['gt_claims', 'gt_rows', 'gv_status', 'p_demo', 'p_eff', 'p_doc', 's_show']) expect(logic).toMatch(new RegExp(`\\n    DATA ${name} `));
    expect(logic).toContain('    TYPES p_eff TYPE ty_stamp.');
    expect(logic).toContain('    TYPES s_show TYPE RANGE OF ty_cid.');
    expect(logic).toContain('    p_eff = is_selection-p_eff.');
    expect(logic).toContain('    rs_result-gt_rows = gt_rows.');
    // The demo data is not carried: what BUILD_DEMO fills is the run's input, put in place by load_input( ).
    expect(plan.notCarried.map((n) => n.routine)).toContain('BUILD_DEMO');
    expect(logic).toContain('    TYPES gt_claims TYPE tt_claim.');
    expect(logic).toContain('    gt_claims = ms_input-gt_claims.');
    expect(logic).toContain('    CONSTANTS gc_live_probe TYPE ty_flag VALUE space.');
  });

  test('the access interface types a call from its call site, and a fill request lists it with its exact signature', () => {
    const intf = file(scaffold.files, 'access.intf.abap');
    expect(intf).toMatch(/METHODS call_date_check_plausibility\n\s+IMPORTING\n\s+date TYPE d\n\s+RAISING zcx_fx_contract_access\./);
    const prep = prepareEngineLed({ source: contractShape(), track: 'rap', program: null, decisions: [], contextText: '' });
    if (!prep.ok) throw new Error(prep.reason);
    const stamp = prep.fillUnits.find((u) => u.unitId === 'U02')!;
    expect(stamp.function.signature).toBe(scaffold.rap!.signatures.U02);
    expect(stamp.types).toContain('mo_access->call_date_check_plausibility IMPORTING date TYPE d RAISING zcx_fx_contract_access.');
    expect(stamp.types).toContain('TYPES ty_stamp TYPE c LENGTH 14.');
    expect(stamp.types).toContain("IF when_g0074( iv_stamp = iv_stamp ) = abap_true.");
    // A predicate the engine wrote is not asked of the model.
    expect(stamp.guards.find((g) => g.id === 'G-0074')!.regionId).toBeNull();
  });
});

test.describe('every guard runs in the logic path', () => {
  const { scaffold, plan } = rap(contractShape());
  const logic = file(scaffold.files, '_logic.clas.abap');

  test('the constant safety gate and the internal invariant are engine-written at the entry, with the original\'s text', () => {
    expect(logic).toMatch(/METHOD probe_live_sources\.\n\s+" G-0141 L141: the original's check, at the entry\.\n\s+IF when_g0141\( \) = abap_true\.\n\s+RAISE EXCEPTION NEW zcx_fx_contract_refusal\( guard = 'G-0141' text = 'Live adapter deliberately disabled' \)\./);
    expect(logic).toContain('rv_holds = xsdbool( gc_live_probe <> \'X\' ).');
    expect(logic).toMatch(/METHOD round_ratio\.\n\s+" G-0090 L90: the original's check, at the entry\.\n\s+IF when_g0090\( iv_den = iv_den \) = abap_true\./);
  });

  test('a check on a computed value or inside a loop is called by the body where the original checks, never at the entry', () => {
    // G-0061 reads lv_code after PERFORM check_stamp; G-0065 reads each row of S_SHOW: the predicate takes the row.
    expect(scaffold.required.U01.map((r) => r.id)).toEqual(['G-0061', 'G-0065']);
    expect(logic).toContain('rv_holds = xsdbool( s_show_line-sign <> \'I\' OR s_show_line-option <> \'EQ\' ).');
    expect(scaffold.required.U04.map((r) => r.id)).toEqual(['G-0103', 'G-0107']);
    expect(logic).toMatch(/METHODS when_g0103\n\s+IMPORTING\n\s+ls_claim TYPE ty_claim/);
    // Every carried guard is either called by the engine or required of the body: none is generated and left uncalled.
    for (const g of plan.guards.filter((x) => x.carried)) {
      const by = scaffold.rap!.guards[g.id];
      expect(by, g.id).toBeTruthy();
      if (by.calledBy === 'body') expect(scaffold.required[g.unitId!]?.map((r) => r.id), g.id).toContain(g.id);
      else expect(logic, g.id).toContain(`guard = '${g.id}'`);
    }
  });

  test('no save validation, no determination, no empty selection — the selection checks run with the run', () => {
    expect(scaffold.files.some((f) => f.path.endsWith('.bdef.asbdef'))).toBe(false);
    for (const f of scaffold.files) expect(f.content, f.path).not.toContain('is_sel = VALUE #( )');
    expect(logic).toMatch(/METHOD check_selection\.\n\s+" AT SELECTION-SCREEN \(L45\)[^\n]*\n\s+validate_selection\( \)\./);
    expect(logic).toMatch(/METHOD run\.[\s\S]*check_selection\( \)\.\n\s+run_steps\( \)\./);
  });

  test('a selection-screen check of its own is engine-written in check_selection (CO shape)', () => {
    const co = file(rap(fixture('co-shape')).scaffold.files, '_logic.clas.abap');
    expect(co).toMatch(/METHOD check_selection\.[\s\S]*IF when_g0029\( \) = abap_true\.\n\s+RAISE EXCEPTION NEW zcx_fx_co_alloc_refusal\( guard = 'G-0029'/);
  });
});

test.describe('the architecture follows the program', () => {
  test('a program that writes no table: a custom entity with a query provider, no table, no business object', () => {
    const { scaffold } = rap(contractShape());
    const paths = scaffold.files.map((f) => f.path);
    expect(scaffold.rap?.architecture).toBe('custom-entity');
    expect(paths.some((p) => /\.tabl\.xml$|\.bdef\.asbdef$|\.dcls\.asdcls$/.test(p))).toBe(false);
    const entity = file(scaffold.files, '_ce.ddls.asddls');
    expect(entity).toContain("@ObjectModel.query.implementedBy: 'ABAP:ZCL_FX_CONTRACT_QUERY'");
    expect(entity).toContain('define root custom entity ZFX_CONTRACT_CE');
    expect(entity).toContain('    p_eff : abap.char( 14 ),');
    // The original's list (gt_rows), typed as declared: the packed milli stays packed.
    expect(entity).toContain('      milli : abap.dec( 31, 0 );');
    const query = file(scaffold.files, '_query.clas.abap');
    expect(query).toContain('INTERFACES if_rap_query_provider.');
    expect(query).toContain('lt_data = CORRESPONDING #( ls_result-gt_rows ).');
    expect(query).toContain('rv_granted = abap_false.');
    expect(file(scaffold.files, '.srvd.srvdsrv')).toContain('expose ZFX_CONTRACT_CE as Results;');
    expect(file(scaffold.files, '_ce.ddls.xml')).toContain('<SOURCE_TYPE>Q</SOURCE_TYPE>');
  });

  test('a program that writes: the business object, run by an action with the selection — typed fields, no reserved name', () => {
    const { scaffold } = rap(fixture('sd-shape'));
    expect(scaffold.rap?.architecture).toBe('managed-bo');
    const bdef = file(scaffold.files, '.bdef.asbdef');
    expect(bdef).toContain('static action run_process parameter ZFX_SD_ORDERS_P;');
    expect(bdef).not.toMatch(/^\s+(?:validation|determination) /m);
    // The table's fields keep the declared types; a name ABAP reserves for table fields is renamed.
    const table = file(scaffold.files, '.tabl.xml');
    expect(table).toContain('<FIELDNAME>KUNNR</FIELDNAME>');
    expect(table).toMatch(/<FIELDNAME>KUNNR<\/FIELDNAME>\s*<ROLLNAME>KUNNR<\/ROLLNAME>/);
    const contract = rap(contractShape().replace('REPORT zfx_contract_sim.', 'REPORT zfx_contract_upd.').replace("  gv_status = 'DONE'.", "  gv_status = 'DONE'.\n  MODIFY zfx_claims FROM TABLE gt_claims.")).scaffold;
    const fields = file(contract.files, '.tabl.xml');
    expect(fields).toMatch(/<FIELDNAME>DAY_VALUE<\/FIELDNAME>[\s\S]*?<DATATYPE>DATS<\/DATATYPE>/);
    expect(fields).toMatch(/<FIELDNAME>PRIORITY<\/FIELDNAME>[\s\S]*?<DATATYPE>INT4<\/DATATYPE>/);
    expect(fields).not.toContain('<FIELDNAME>DAY</FIELDNAME>');
    const pool = file(scaffold.files, 'locals_imp.abap');
    expect(pool).toContain('METHODS run_process FOR MODIFY IMPORTING keys FOR ACTION Rec~run_process.');
    expect(pool).not.toContain('VALUE #( )');
    expect(file(scaffold.files, '_p.ddls.asddls')).toContain('define abstract entity ZFX_SD_ORDERS_P');
  });
});

test.describe('abaplint with the shipped configuration: 0 parser and 0 syntax errors in the scaffold', () => {
  const sources: Record<string, () => string> = {
    contract: contractShape,
    CO: () => fixture('co-shape'),
    PP: () => fixture('pp-shape'),
    SD: () => fixture('sd-shape'),
    PO: poDemo,
    'FI (benchmark)': () => BENCH('BM-054/zfi_fxval.abap'),
    'PP (benchmark, job)': () => BENCH('BM-076/zpp_mass_release.abap'),
  };
  for (const [name, source] of Object.entries(sources)) {
    test(name, () => {
      const files = rap(source()).scaffold.files;
      const r = lint(files);
      expect(r.parser).toEqual([]);
      expect(r.syntax).toEqual([]);
      // The activation gate the generation records (abap-check.ts) agrees.
      const gate = abapCheck(files);
      expect(gate.ran && gate.activation).toMatchObject({ parserErrors: 0, syntaxErrors: 0, activatable: true });
    });
  }

  test('the check sees our objects: a body against the 3.0.12 contract fails it', () => {
    const { scaffold } = rap(contractShape());
    // Spliced unchecked, as a model answered on 13.10.2026: a global the class does not have, a WRITE, the old parameters.
    const bad = spliceBodies(scaffold, [{ regionId: 'U02', body: "WRITE: / 'x'.\ncv_code = is_sel-p_eff.\ngt_unknown = 1." }], () => null);
    expect(bad.ok).toBe(true);
    const r = lint(bad.files);
    expect(r.parser.length + r.syntax.length).toBeGreaterThan(0);
    // A faithful body against the contract passes.
    const good = spliceBodies(
      scaffold,
      [{ regionId: 'U02', body: "DATA lv_date TYPE d.\nCLEAR cv_code.\nIF when_g0074( iv_stamp = iv_stamp ) = abap_true.\n  cv_code = 'INVALID_TIMESTAMP'.\n  RETURN.\nENDIF.\nlv_date = iv_stamp(8).\nTRY.\n    mo_access->call_date_check_plausibility( date = lv_date ).\n  CATCH zcx_fx_contract_access.\n    cv_code = 'INVALID_TIMESTAMP'.\nENDTRY." }],
      () => null,
    );
    const g = lint(good.files);
    expect(g.parser).toEqual([]);
    expect(g.syntax).toEqual([]);
  });
});

test.describe('the body guards of a RAP fill (3.0.13 item 3)', () => {
  const prep = prepareEngineLed({ source: contractShape(), track: 'rap', program: null, decisions: [], contextText: '' });
  if (!prep.ok) throw new Error(prep.reason);
  const ctx = guardContextOf(prep, 'U02');
  const codes = (body: string) => bodyGuards(body, ctx).map((r) => r.code);
  const faithful = "DATA lv_date TYPE d.\nCLEAR cv_code.\nIF when_g0074( iv_stamp = iv_stamp ) = abap_true.\n  cv_code = 'INVALID_TIMESTAMP'.\n  RETURN.\nENDIF.\nlv_date = iv_stamp(8).\nmo_access->call_date_check_plausibility( date = lv_date ).";

  test('a faithful body passes', () => {
    expect(bodyGuards(faithful, ctx)).toEqual([]);
  });

  test('WRITE, MESSAGE, ULINE, DESCRIBE and header lines are refused', () => {
    for (const st of ["WRITE: / 'x'.", "MESSAGE 'x' TYPE 'E'.", 'ULINE.', 'DESCRIBE TABLE gt_rows LINES DATA(n).', 'DATA lt_x TYPE ty_claim OCCURS 0.']) {
      expect(codes(`${faithful}\n${st}`), st).toContain('cloud-statement');
    }
  });

  test('a SELECT on an SAP table is refused; access goes through mo_access', () => {
    expect(codes(`${faithful}\nSELECT SINGLE vbeln FROM vbak INTO @DATA(lv_vbeln) WHERE vbeln = @p_doc.`)).toContain('sap-select');
  });

  test('methods, access methods and globals the class does not declare are refused', () => {
    expect(codes(`${faithful}\nmo_access->select_vbak_header( ).`)).toContain('unknown-name');
    expect(codes(`${faithful}\nbuild_demo( ).`)).toContain('unknown-name');
    expect(codes(`${faithful}\ngt_unknown = 1.`)).toContain('unknown-name');
    expect(codes(`${faithful}\ncv_code = is_sel-p_eff.`)).toContain('unknown-name');
    // The class's own names pass: an attribute, a callee's formal parameter, a declared local.
    expect(codes(`${faithful}\nDATA(lv_x) = lines( gt_rows ).\nround_ratio( EXPORTING iv_num = 1 iv_den = 2 CHANGING cv_value = lv_x ).`)).toEqual([]);
  });

  test('the prompt forbids them and names the contract', () => {
    const header = fillInstructionHeader('rap');
    expect(header).toContain('ABAP Cloud has no WRITE, ULINE, SKIP, NEW-LINE, NEW-PAGE, FORMAT, MESSAGE, DESCRIBE, FORM, PERFORM');
    expect(header).toContain('There is no is_sel, cs_st, ty_selection or ty_state.');
    expect(header).toContain('mo_access-><method>');
    expect(header).not.toContain('dec.*');
  });
});

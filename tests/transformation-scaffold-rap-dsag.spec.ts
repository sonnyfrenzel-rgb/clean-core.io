import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { CODE_DRAFT_BUSINESS_RULES } from '../lib/code-draft-rules';
import { generatedCodeLints } from '../lib/generated-code-lints';
import { buildRapScaffold, planUnits, readEngineFacts } from '../lib/transformation';
import { abapDeliveryOf } from '../lib/transformation/abap-delivery';
import { accessPointsOf } from '../lib/transformation/access-layer';
import { abaplintCheckEntries, abaplintPackageCheck, CHECK_SYNTAX_NOT_RUN, withAbaplint } from '../lib/transformation/abaplint-check';
import { ABAPLINT_ALLOWED_OBJECT_TYPES, ABAPLINT_CONFIG, abaplintConfig, abaplintConfigJson } from '../lib/transformation/abaplint-config';
import { fillInstructionHeader } from '../lib/transformation/fill-prompt';
import { OPEN_MARKER } from '../lib/transformation/scaffold-rap';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { fixture, planOf, poDemo, ROOT } from './helpers/transformation-scaffold';

/**
 * The RAP scaffold against the DSAG ABAP guide (roadmap 3.0.12; owner decision
 * 13.10.2026): authorization checked and denied until a developer fills it
 * (C3), an Application Job where the original runs in the background (B3), an
 * access layer and code-draft rule 25 (B4), abaplint under ABAP Cloud syntax
 * recorded as passed / failed / not run (B5), ABAP Doc on every public method
 * (B9). Server-free.
 */

function rap(source: string) {
  const { facts, plan } = planOf(source);
  return { plan, facts, scaffold: buildRapScaffold(plan, facts) };
}

const file = (s: ReturnType<typeof rap>['scaffold'], suffix: string) => s.files.find((f) => f.path.endsWith(suffix))?.content ?? '';

/** A night-run report: a sy-batch check, no dialog, no list — the shape of a job. */
const NIGHTLY = `REPORT zfx_nightly_close.
PARAMETERS p_bukrs TYPE bukrs OBLIGATORY.
SELECT-OPTIONS s_date FOR sy-datum.
DATA lv_amount TYPE p LENGTH 8 DECIMALS 2.
START-OF-SELECTION.
  IF sy-batch = abap_false.
    MESSAGE 'Run this in the background' TYPE 'E'.
  ENDIF.
  PERFORM close_items.
FORM close_items.
  DATA lt_bsid TYPE STANDARD TABLE OF bsid.
  SELECT * FROM bsid INTO TABLE lt_bsid WHERE bukrs = p_bukrs.
  LOOP AT lt_bsid INTO DATA(ls).
    lv_amount = lv_amount + ls-dmbtr.
  ENDLOOP.
  UPDATE zfx_close SET amount = lv_amount WHERE bukrs = p_bukrs.
ENDFORM.
`;

/** The same report scheduling a follow-up job and printing a list: job and UI service both. */
const NIGHTLY_WITH_LIST = NIGHTLY.replace(
  '  PERFORM close_items.\n',
  "  PERFORM close_items.\n  SUBMIT zfx_follow_up VIA JOB 'FOLLOW' NUMBER lv_count AND RETURN.\n  WRITE: / lv_amount.\n",
);

test.describe('C3 — authorization is checked and denied until filled', () => {
  test('both views check authorization; nothing is #NOT_REQUIRED any more', () => {
    const { scaffold } = rap(fixture('co-shape'));
    for (const f of scaffold.files.filter((x) => x.path.endsWith('.ddls.asddls'))) {
      expect(f.content, f.path).toContain('@AccessControl.authorizationCheck: #CHECK');
      expect(f.content, f.path).not.toContain('#NOT_REQUIRED');
    }
  });

  test("the root's access control grants nothing until replaced and names the original's AUTHORITY-CHECK", () => {
    const { scaffold, facts } = rap(poDemo());
    const check = facts.graph.authorityChecks[0];
    expect(check.object).toBe('M_BANF_EKG');
    const dcl = file(scaffold, 'zmm_po_approv_r.dcls.asdcls');
    expect(dcl).toContain('define role ZMM_PO_APPROV_R {');
    expect(dcl).toContain('grant select on ZMM_PO_APPROV_R');
    // Fails closed: SAP's reference app grants `where true`; the stub grants nothing until replaced.
    expect(dcl).toContain('    where false;');
    expect(dcl).toContain(`// ${OPEN_MARKER} AUTH: fails closed`);
    expect(dcl).toContain(`//   L${check.lineStart} AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02' ID 'EKGRP' FIELD lv_ekgrp`);
    expect(dcl).toContain('FP-GUARD-05');
    expect(dcl).toContain('abaplint has no parser for access controls');
    const projection = file(scaffold, 'zmm_po_approv_c.dcls.asdcls');
    expect(projection).toContain('where inheriting conditions from entity ZMM_PO_APPROV_R default false;');
    // A program without an AUTHORITY-CHECK says so instead of naming none.
    expect(file(rap(fixture('co-shape')).scaffold, '_r.dcls.asdcls')).toContain('The original makes no AUTHORITY-CHECK');
  });

  test('the behavior handlers deny create, update and delete until a developer checks authorization', () => {
    const { scaffold } = rap(poDemo());
    expect(file(scaffold, '.bdef.asbdef')).toContain('authorization master ( instance, global )');
    const pool = file(scaffold, 'locals_imp.abap');
    expect(pool).toContain('METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION');
    const global = pool.slice(pool.indexOf('METHOD get_global_authorizations.'), pool.indexOf('METHOD get_instance_authorizations.'));
    for (const op of ['create', 'update', 'delete']) {
      expect(global).toContain(`result-%${op} = COND #( WHEN is_${op}_granted( ) = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).`);
      // The helper the sample keeps its AUTHORITY-CHECK in denies until a developer writes the check.
      const helper = pool.slice(pool.indexOf(`METHOD is_${op}_granted.`));
      expect(helper.slice(0, helper.indexOf('ENDMETHOD.'))).toContain('rv_granted = abap_false.');
      expect(helper).toContain(`" ${OPEN_MARKER} AUTH: ${op} is denied until you check authorization here`);
    }
    expect(global).toContain('%global = if_abap_behv=>mk-on ) TO reported-rec.');
    expect(pool).toContain('the original checks M_BANF_EKG (ACTVT, EKGRP)');
    const instance = pool.slice(pool.indexOf('METHOD get_instance_authorizations.'));
    expect(instance.slice(0, instance.indexOf('ENDMETHOD.'))).toContain('APPEND VALUE #( %tky = key-%tky %update = lv_update %delete = lv_delete ) TO result.');
    // Nothing in the pool simulates full authorization, as SAP's sample does for its demo.
    expect(pool).not.toContain('auth-allowed ).');
    // An empty authorization method granted everything; it is gone.
    expect(pool).not.toMatch(/METHOD get_instance_authorizations\.\s*ENDMETHOD\./);
  });

  test('FP-GUARD-05, which the scaffold cites, is the failure pattern of a write path without its authorization', () => {
    const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'failure-patterns', 'catalogue.json'), 'utf8'));
    const list = (Array.isArray(catalogue) ? catalogue : catalogue.patterns) as Array<{ id: string; description: string }>;
    expect(list.find((p) => p.id === 'FP-GUARD-05')?.description).toContain('authorisation the original enforced');
  });
});

test.describe('B4 — the access layer', () => {
  test('one method per SAP object the original reads, writes or calls; customer objects and UI modules get none', () => {
    const { points } = accessPointsOf(readEngineFacts(NIGHTLY));
    expect(points.map((p) => [p.method, p.kind, p.object, p.lines])).toEqual([['read_bsid', 'read', 'BSID', [12]]]);
    const po = accessPointsOf(readEngineFacts(poDemo())).points;
    expect(po.map((p) => p.method)).toEqual(expect.arrayContaining(['read_eban', 'write_eban', 'read_lfa1']));
    for (const p of po) {
      expect(p.object).not.toMatch(/^[ZY]/);
      expect(p.method.length).toBeLessThanOrEqual(30);
    }
  });

  test('interface, default implementation and exception; the logic takes the layer through its constructor', () => {
    const { scaffold, plan } = rap(poDemo());
    const intf = file(scaffold, 'zif_mm_po_approv_access.intf.abap');
    expect(intf).toContain('INTERFACE zif_mm_po_approv_access PUBLIC.');
    expect(intf).toMatch(/"! Reads EBAN where the original does, L\d+.*\n {2}METHODS read_eban IMPORTING is_sel TYPE zcl_mm_po_approv_logic=>ty_selection CHANGING ct_rows TYPE STANDARD TABLE RAISING zcx_mm_po_approv_access\./);
    const impl = file(scaffold, 'zcl_mm_po_approv_access.clas.abap');
    expect(impl).toContain('INTERFACES zif_mm_po_approv_access.');
    expect(impl).toContain(`" ${OPEN_MARKER} ACCESS: the original reads EBAN at L`);
    expect(impl).toContain("RAISE EXCEPTION NEW zcx_mm_po_approv_access( object = 'EBAN' ).");
    expect(file(scaffold, 'zcx_mm_po_approv_access.clas.abap')).toContain('INHERITING FROM cx_static_check');
    const logic = file(scaffold, '_logic.clas.abap');
    expect(logic).toContain('METHODS constructor IMPORTING io_access TYPE REF TO zif_mm_po_approv_access OPTIONAL.');
    expect(logic).toContain('mo_access = COND #( WHEN io_access IS BOUND THEN io_access ELSE NEW zcl_mm_po_approv_access( ) ).');
    // Fills may call the layer; ABAP Unit gets a double.
    for (const u of plan.units) expect(scaffold.available[u.id]).toContain('mo_access');
    expect(file(scaffold, '.testclasses.abap')).toContain('INTERFACES zif_mm_po_approv_access PARTIALLY IMPLEMENTED.');
    // A program that touches no SAP object gets no layer.
    const co = rap(fixture('co-shape')).scaffold;
    expect(co.files.some((f) => f.path.includes('_access'))).toBe(false);
    expect(file(co, '_logic.clas.abap')).not.toContain('mo_access');
  });

  test('rule 25 asks for it — in the code-draft rules, and in the RAP fill prompt only', () => {
    expect(CODE_DRAFT_BUSINESS_RULES).toContain('25. ACCESS LAYER: SAP data and functions, released APIs too, only through an interface of your own');
    expect(CODE_DRAFT_BUSINESS_RULES).toContain('a return code or sy-subrc becomes an exception, never an ignored value.');
    expect(fillInstructionHeader('rap')).toMatch(/^25\. ACCESS LAYER/m);
    expect(fillInstructionHeader('node')).not.toMatch(/^25\. /m);
  });
});

test.describe('B3 — an Application Job where the original runs in the background', () => {
  test('the unit plan decides, with the evidence and a reason', () => {
    const job = planUnits(NIGHTLY).abapDelivery;
    expect(job.kind).toBe('application-job');
    expect(job.background).toEqual([{ line: 6, what: 'sy-batch' }]);
    expect(job.reason).toContain('sy-batch (L6)');
    expect(job.reason).toContain('without a UI service');
    const both = planUnits(NIGHTLY_WITH_LIST).abapDelivery;
    expect(both.kind).toBe('ui-service-and-job');
    expect(both.background.map((e) => e.what)).toContain('SUBMIT ZFX_FOLLOW_UP VIA JOB');
    expect(both.output.map((e) => e.what)).toContain('WRITE');
    const ui = planOf(fixture('co-shape')).plan.abapDelivery;
    expect(ui.kind).toBe('ui-service');
    expect(ui.reason).toContain('No background use');
    // Read from facts only: the same function the planner calls.
    const facts = readEngineFacts(NIGHTLY);
    expect(abapDeliveryOf(facts)).toEqual(job);
  });

  test('job instead of the UI service: a class implementing both job interfaces, its setup, no service', () => {
    const { scaffold } = rap(NIGHTLY);
    const paths = scaffold.files.map((f) => f.path);
    expect(paths).toContain('src/zcl_fx_nightly_c_job.clas.abap');
    expect(paths).toContain('src/zcl_fx_nightly_c_job_setup.clas.abap');
    expect(paths.some((p) => p.includes('.srvd.') || p.includes('.srvb.'))).toBe(false);
    const job = file(scaffold, '_job.clas.abap');
    expect(job).toContain('INTERFACES if_apj_dt_exec_object.');
    expect(job).toContain('INTERFACES if_apj_rt_exec_object.');
    expect(job).toContain("( selname = 'P_BUKRS' kind = if_apj_dt_exec_object=>parameter");
    expect(job).toContain("( selname = 'S_DATE' kind = if_apj_dt_exec_object=>select_option");
    expect(job).toContain('mandatory_ind = abap_true');
    expect(job).toContain(`${OPEN_MARKER} JOB: check type and length of P_BUKRS, S_DATE`);
    expect(job).toContain('->run_steps( EXPORTING is_sel = ls_sel CHANGING cs_st = ls_st ).');
    expect(job).toContain('their method signatures are');
    const setup = file(scaffold, '_job_setup.clas.abap');
    expect(setup).toContain("CONSTANTS lc_catalog TYPE cl_apj_dt_create_content=>ty_catalog_name VALUE 'ZFX_NIGHTLY_C_JOB_CAT'.");
    expect(setup).toContain("CONSTANTS lc_template TYPE cl_apj_dt_create_content=>ty_template_name VALUE 'ZFX_NIGHTLY_C_JOB_TMPL'.");
    expect(setup).toContain("IF lo_dt->exists_job_cat_entry( lc_catalog ) <> 'Y'.");
    expect(setup).toContain('iv_catalog_entry_type = cl_apj_dt_create_content=>class_based');
    expect(setup).toContain('lx_content->get_longtext( )');
    const both = rap(NIGHTLY_WITH_LIST).scaffold.files.map((f) => f.path);
    expect(both).toContain('src/zcl_fx_nightly_c_job.clas.abap');
    expect(both).toContain('src/zfx_nightly_c_srvb.srvb.xml');
    expect(rap(fixture('co-shape')).scaffold.files.some((f) => f.path.includes('_job'))).toBe(false);
  });

  test("every SAP class and interface the scaffold names is released in SAP's Cloudification Repository", () => {
    const repo = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'abap', 'generated', 'cloudification-repo.latest.json'), 'utf8')) as { entries: Record<string, { state: string }> };
    const named = new Set<string>();
    for (const source of [NIGHTLY_WITH_LIST, poDemo(), fixture('co-shape')]) {
      for (const f of rap(source).scaffold.files) {
        if (!f.path.endsWith('.abap')) continue;
        const code = f.content.split('\n').filter((l) => !/^\s*(?:\*|")/.test(l)).join('\n');
        for (const m of code.matchAll(/\b((?:cl|cx|if)_[a-z0-9_]+)/gi)) named.add(m[1].toUpperCase());
      }
    }
    expect([...named]).toEqual(expect.arrayContaining(['IF_APJ_DT_EXEC_OBJECT', 'IF_APJ_RT_EXEC_OBJECT', 'CL_APJ_DT_CREATE_CONTENT', 'IF_OO_ADT_CLASSRUN', 'IF_ABAP_BEHV']));
    for (const name of named) expect(repo.entries[name]?.state, name).toBe('released');
  });
});

test.describe('B9 — ABAP Doc on every public method', () => {
  test('the scaffold writes it, anchored or saying it has no counterpart; the lint finds none', () => {
    for (const source of [poDemo(), fixture('co-shape'), fixture('sd-shape'), NIGHTLY_WITH_LIST]) {
      const { scaffold } = rap(source);
      expect(generatedCodeLints(scaffold.files).filter((f) => f.id === 'abap-doc-missing')).toEqual([]);
    }
    expect(file(rap(poDemo()).scaffold, '_nofill.clas.abap')).toMatch(/"! Raised where a body is still a stub[^\n]*No counterpart in the original\.\n {4}METHODS constructor/);
  });

  test('the lint: a public method without ABAP Doc, or with doc that anchors nowhere', () => {
    const cls = [
      'CLASS zcl_x DEFINITION PUBLIC FINAL CREATE PUBLIC.',
      '  PUBLIC SECTION.',
      '    METHODS bare.',
      '    "! Computes the total.',
      '    METHODS unanchored.',
      '    "! Keeps the original rounding, L42.',
      '    METHODS anchored.',
      '    "! Needed by the job; no counterpart in the original.',
      '    METHODS infrastructure.',
      '  PRIVATE SECTION.',
      '    METHODS hidden.',
      'ENDCLASS.',
      'CLASS zcl_x IMPLEMENTATION.',
      'ENDCLASS.',
    ].join('\n');
    const found = generatedCodeLints([{ path: 'src/zcl_x.clas.abap', content: cls }]).filter((f) => f.id === 'abap-doc-missing');
    expect(found.map((f) => [f.line, f.severity])).toEqual([
      [3, 'P2'],
      [5, 'P2'],
    ]);
    expect(found[0].message).toContain('The public method bare has no ABAP Doc');
    expect(found[1].message).toContain('names no line of the original');
    const intf = 'INTERFACE zif_x PUBLIC.\n  METHODS read.\nENDINTERFACE.\n';
    expect(generatedCodeLints([{ path: 'src/zif_x.intf.abap', content: intf }]).map((f) => f.id)).toEqual(['abap-doc-missing']);
    // A local test class is not a public API.
    expect(generatedCodeLints([{ path: 'src/zcl_x.clas.testclasses.abap', content: 'CLASS ltc DEFINITION FOR TESTING.\n  PUBLIC SECTION.\n    METHODS t FOR TESTING.\nENDCLASS.' }])).toEqual([]);
  });
});

test.describe('B5 — abaplint under ABAP Cloud syntax, recorded as passed, failed or not run', () => {
  test('the scaffold passes what abaplint reads, and says what it did not read', () => {
    const { scaffold } = rap(NIGHTLY_WITH_LIST);
    const r = abaplintPackageCheck(scaffold.files);
    expect(r.issues).toEqual([]);
    expect(r.state).toBe('passed');
    expect(r.syntax).toBe('Cloud');
    expect(r.abaplint).toMatch(/^\d+\.\d+\.\d+$/);
    // The table is read in abapGit's XML form since scaffold version 3.
    expect(r.checked).toBe(scaffold.files.filter((f) => /\.(?:clas|intf)(?:\.\w+)?\.abap$|\.ddls\.asddls$|\.tabl\.xml$/.test(f.path)).length);
    const unread = r.notRun.map((n) => n.path.split('.').slice(-2).join('.')).sort();
    expect(unread).toEqual(['bdef.asbdef', 'dcls.asdcls', 'dcls.asdcls', 'srvb.xml', 'srvd.srvdsrv']);
    expect(r.checksNotRun).toEqual([{ check: 'check_syntax', reason: CHECK_SYNTAX_NOT_RUN }]);
  });

  test('a statement ABAP Cloud does not have fails; an empty package is not run — never a pass', () => {
    const { scaffold } = rap(fixture('co-shape'));
    const broken = scaffold.files.map((f) => (f.path.endsWith('_logic.clas.abap') ? { ...f, content: f.content.replace('ENDMETHOD.', "WRITE 'x'.\n  ENDMETHOD.") } : f));
    const r = abaplintPackageCheck(broken);
    expect(r.state).toBe('failed');
    expect(r.issues.map((i) => [i.path, i.rule])).toContainEqual(['src/zcl_fx_co_alloc_logic.clas.abap', 'parser_error']);
    expect(r.failedFiles).toBe(1);

    const none = abaplintPackageCheck([{ path: 'srv/app.ts', content: 'export {}' }]);
    expect(none.state).toBe('not-run');
    expect(none.reason).toContain('no src/ folder');
    const unreadOnly = abaplintPackageCheck([{ path: 'src/zx.dcls.asdcls', content: 'define role ZX {}' }]);
    expect(unreadOnly.state).toBe('not-run');
    expect(unreadOnly.notRun).toEqual([{ path: 'src/zx.dcls.asdcls', reason: 'abaplint has no parser for access controls' }]);
  });

  test('the record the server writes: abaplint as a check, the semantic check as not run; the page cannot send its own', () => {
    const passed = abaplintPackageCheck(rap(fixture('co-shape')).scaffold.files);
    const entries = abaplintCheckEntries(passed);
    expect(entries.checks).toEqual([{ kind: 'abaplint', total: passed.checked, failed: 0 }]);
    expect(entries.notRun.map((n) => n.kind)).toEqual(['abaplint-syntax']);
    const forged = { checks: [{ kind: 'lint', total: 0, failed: 0 }, { kind: 'abaplint', total: 99, failed: 0 }], notRun: [] as Array<{ kind: string; reason: string }> };
    const merged = withAbaplint(forged, abaplintPackageCheck([]));
    expect(merged.checks).toEqual([{ kind: 'lint', total: 0, failed: 0 }]);
    expect(merged.notRun.map((n) => n.kind)).toEqual(['abaplint', 'abaplint-syntax']);
    const route = fs.readFileSync(path.join(ROOT, 'app', 'api', 'projects', '[projectId]', 'contract', 'route.ts'), 'utf8');
    expect(route).toContain("decision.isAbapCloud ? await import('@/lib/transformation/abaplint-check') : null");
    expect(route).toContain('lint.withAbaplint(record.engine, abaplint)');
    expect(route).toContain('...(abaplint ? { abaplint } : {}),');
  });

  test('the delivered abaplint.json is the one the server ran: ABAP Cloud, every object type the scaffold writes', () => {
    const json = JSON.parse(abaplintConfigJson());
    expect(json).toEqual(JSON.parse(JSON.stringify(ABAPLINT_CONFIG)));
    expect(json.syntax.version).toBe('Cloud');
    expect(json.rules.allowed_object_types).toEqual({ allowed: [...ABAPLINT_ALLOWED_OBJECT_TYPES] });
    expect(json.rules).not.toHaveProperty('forbidden_statements');
    // The hook the Clean ABAP rules come in through: merged in, never over the Cloud check.
    const merged = abaplintConfig({ keyword_case: true, cloud_types: false });
    expect(merged.rules.keyword_case).toBe(true);
    expect(merged.rules.cloud_types).toBe(true);
    for (const source of [NIGHTLY_WITH_LIST, poDemo()]) {
      for (const f of rap(source).scaffold.files.filter((x) => x.path.startsWith('src/'))) {
        const type = f.path.split('/').pop()!.split('.')[1].toUpperCase();
        expect(ABAPLINT_ALLOWED_OBJECT_TYPES, f.path).toContain(type);
      }
    }
    const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'delivery', 'page.tsx'), 'utf8');
    expect(page).toContain('bundle.file("abaplint.json", abaplintConfigJson());');
    expect(page).not.toContain('"version": "v750"');
  });
});

test('the scaffold version moved with the engine-written text', () => {
  // 3: the abapGit metadata of every object (tests/transformation-abapgit-package.spec.ts).
  // 4: the Node scaffold's probe entry points (tests/transformation-fill-probes.spec.ts); one number for both tracks.
  expect(SCAFFOLD_VERSION).toBe(4);
  expect(rap(fixture('co-shape')).scaffold.version).toBe(4);
});

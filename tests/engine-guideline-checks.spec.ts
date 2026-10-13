import { test, expect } from '@playwright/test';
import { buildAbapEvidence, type EvidenceFinding } from '../lib/abap/evidence-model';
import { readSecurityReviewTasks, type SecurityReviewKind } from '../lib/abap/security-review';
import { readSapCodeCopySignals } from '../lib/abap/sap-code-copy';
import { readLegacyTechnology } from '../lib/abap/legacy-technology';
import { recommendArchitecture, extractCodeInventory, extractDataCoupling } from '../lib/abap/code-assessment';
import { GUIDELINE_CHECKS_FROM, guidelineChecksApply } from '../lib/abap/guideline-checks-gate';
import { KIND_LABEL } from '../lib/findings-view';

/**
 * Roadmap 3.0.12 — the checks taken over from the review of the DSAG ABAP
 * guideline (owner decision 13.10.2026): security review tasks (B1), possible
 * copies of SAP code (B6), classic programming models (B8), and the classic
 * ALV / IDoc wording (C5). Each detector is asked three things: does it fire on
 * the construct, does it stay quiet on a comment, a literal or the safe form,
 * and does a run of an engine before 3.0.12 get exactly what it was signed with.
 */

const NEW = GUIDELINE_CHECKS_FROM;
const OLD = '3.0.11';
const NEW_KINDS = ['security-review', 'sap-code-copy', 'bopf', 'gateway-classic-service', 'ddic-cds-view'];

const kinds = (src: string): SecurityReviewKind[] => readSecurityReviewTasks(src).map((t) => t.kind);
const evidence = (src: string, version: string | null, file = 'zx.abap'): EvidenceFinding[] =>
  buildAbapEvidence(src, file, 'private', undefined, version).findings;

test.describe('the gate', () => {
  test('3.0.12 and later carry the checks; earlier, missing or unreadable versions do not', () => {
    expect(guidelineChecksApply('3.0.12')).toBe(true);
    expect(guidelineChecksApply('v3.1.0')).toBe(true);
    expect(guidelineChecksApply('v3.0.11')).toBe(false);
    expect(guidelineChecksApply(null)).toBe(false);
    expect(guidelineChecksApply('dev')).toBe(false);
  });

  test('every new kind has a label', () => {
    for (const kind of NEW_KINDS) expect(KIND_LABEL[kind as keyof typeof KIND_LABEL], kind).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ B1 */

test.describe('B1 security review tasks', () => {
  test('AUTHORITY-CHECK whose sy-subrc nobody reads; one that is read gives no task', () => {
    const unread = `REPORT zx.\nAUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD lv_bukrs ID 'ACTVT' FIELD '03'.\nWRITE 'done'.\n`;
    const [task] = readSecurityReviewTasks(unread);
    expect(task.kind).toBe('authority-result-not-evaluated');
    expect(task.lineStart).toBe(2);
    expect(task.subject).toBe('F_BKPF_BUK');
    expect(task.check).toMatch(/^Check /);
    expect(kinds(`REPORT zx.\nAUTHORITY-CHECK OBJECT 'F_BKPF_BUK'\n  ID 'BUKRS' FIELD lv_bukrs.\nIF sy-subrc <> 0.\n  RETURN.\nENDIF.\n`)).toEqual([]);
    // A comment between the check and the IF is not a statement.
    expect(kinds(`REPORT zx.\nAUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD lv_bukrs.\n* the result decides\nCHECK sy-subrc = 0.\n`)).toEqual([]);
  });

  test("DUMMY, blank (' ') and full ('*') values, each at the check's line", () => {
    const src = `REPORT zx.\nAUTHORITY-CHECK OBJECT 'Z_OBJ'\n  ID 'BUKRS' FIELD '*'\n  ID 'WERKS' FIELD ' '\n  ID 'ACTVT' DUMMY.\nIF sy-subrc <> 0. RETURN. ENDIF.\n`;
    const tasks = readSecurityReviewTasks(src);
    expect(tasks.map((t) => t.kind).sort()).toEqual(['authority-blank-value', 'authority-dummy-field', 'authority-full-value']);
    for (const t of tasks) expect(t.lineStart).toBe(2);
    expect(tasks.find((t) => t.kind === 'authority-dummy-field')?.severity).toBe('Low');
    // A real value is no task.
    expect(kinds(`REPORT zx.\nAUTHORITY-CHECK OBJECT 'Z_OBJ' ID 'BUKRS' FIELD lv_bukrs ID 'ACTVT' FIELD '02'.\nIF sy-subrc <> 0. RETURN. ENDIF.\n`)).toEqual([]);
  });

  test('SUBMIT … USER; a SUBMIT without USER gives no task', () => {
    const [task] = readSecurityReviewTasks(`REPORT zx.\nSUBMIT zother VIA JOB lv_job NUMBER lv_no USER p_user AND RETURN.\n`);
    expect(task.kind).toBe('submit-as-other-user');
    expect(task.subject).toBe('p_user');
    expect(kinds(`REPORT zx.\nSUBMIT zother VIA JOB lv_job NUMBER lv_no AND RETURN.\n`)).toEqual([]);
  });

  test('a dynamic WHERE built from a selection parameter; a fixed one and a literal one are not', () => {
    const src = [
      'REPORT zx.',
      'PARAMETERS p_cond TYPE string.',
      'DATA: lv_where TYPE string, lt_cond TYPE stringtab, lt_kna1 TYPE STANDARD TABLE OF kna1.',
      "CONCATENATE 'KUNNR = ' p_cond INTO lv_where.",
      'APPEND |NAME1 = { lv_where }| TO lt_cond.',
      'SELECT * FROM kna1 INTO TABLE lt_kna1 WHERE (lt_cond).',
    ].join('\n');
    const [task] = readSecurityReviewTasks(src);
    expect(task.kind).toBe('dynamic-sql-from-input');
    expect(task.lineStart).toBe(6);
    expect(task.subject).toBe('lt_cond');
    // The same clause filled from a constant, not from input.
    const fixed = src.replace("CONCATENATE 'KUNNR = ' p_cond INTO lv_where.", "lv_where = 'KUNNR = 1'.");
    expect(kinds(fixed)).toEqual([]);
    // A literal clause and a commented-out one.
    expect(kinds(`REPORT zx.\nPARAMETERS p_cond TYPE string.\nSELECT * FROM kna1 INTO TABLE @DATA(r) WHERE ('KUNNR = P_COND').\n* SELECT * FROM kna1 INTO TABLE @DATA(s) WHERE (p_cond).\n`)).toEqual([]);
  });

  test('a dynamic table name from a method parameter', () => {
    const src = [
      'CLASS lcl DEFINITION.',
      '  PUBLIC SECTION.',
      '    METHODS read IMPORTING iv_table TYPE tabname.',
      'ENDCLASS.',
      'CLASS lcl IMPLEMENTATION.',
      '  METHOD read.',
      '    SELECT * FROM (iv_table) INTO TABLE @DATA(rows).',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    expect(readSecurityReviewTasks(src).map((t) => [t.kind, t.lineStart])).toEqual([['dynamic-sql-from-input', 7]]);
  });

  test('CLIENT SPECIFIED and USING CLIENT; a word in a literal is not', () => {
    expect(kinds(`REPORT zx.\nSELECT * FROM kna1 CLIENT SPECIFIED INTO TABLE @DATA(r) WHERE mandt = '200'.\n`)).toEqual(['cross-client-access']);
    expect(kinds(`REPORT zx.\nSELECT * FROM kna1 USING CLIENT '200' INTO TABLE @DATA(r).\n`)).toEqual(['cross-client-access']);
    expect(kinds(`REPORT zx.\nDATA(t) = |CLIENT SPECIFIED|.\nWRITE 'SELECT * FROM kna1 CLIENT SPECIFIED'.\n`)).toEqual([]);
  });

  test('EXEC SQL and an ADBC line the caller names; a comment is not', () => {
    const exec = readSecurityReviewTasks(`REPORT zx.\nEXEC SQL.\n  SELECT kunnr INTO :lv FROM kna1\nENDEXEC.\n`);
    expect(exec.map((t) => [t.kind, t.lineStart])).toEqual([['native-sql-client-handling', 2]]);
    const adbc = readSecurityReviewTasks(`REPORT zx.\nlo_stmt->execute_query( lv_sql ).\n`, { adbcLines: [2] });
    expect(adbc.map((t) => t.kind)).toEqual(['native-sql-client-handling']);
    expect(kinds(`REPORT zx.\n" EXEC SQL.\n* EXEC SQL.\n`)).toEqual([]);
  });

  test('OPEN DATASET with a path from input; a fixed path is not', () => {
    const src = `REPORT zx.\nPARAMETERS p_file TYPE string.\nDATA lv_path TYPE string.\nlv_path = |/usr/sap/in/{ p_file }|.\nOPEN DATASET lv_path FOR INPUT IN TEXT MODE ENCODING DEFAULT.\n`;
    expect(readSecurityReviewTasks(src).map((t) => [t.kind, t.lineStart])).toEqual([['file-path-from-input', 5]]);
    expect(kinds(src.replace('{ p_file }', 'fixed.txt'))).toEqual([]);
    // A program that resolves its file names through the logical file name modules.
    const validated = src.replace(
      'OPEN DATASET',
      "CALL FUNCTION 'FILE_VALIDATE_NAME' EXPORTING logical_filename = 'Z_IN' CHANGING physical_filename = lv_path.\nOPEN DATASET",
    );
    expect(kinds(validated)).toEqual([]);
  });

  test('INSERT REPORT, GENERATE SUBROUTINE POOL, EDITOR-CALL FOR REPORT, COMMUNICATION', () => {
    const src = [
      'REPORT zx.',
      'INSERT REPORT lv_prog FROM lt_source.',
      'GENERATE SUBROUTINE POOL lt_source NAME lv_pool.',
      'EDITOR-CALL FOR REPORT lv_prog.',
      'COMMUNICATION INIT DESTINATION lv_dest ID lv_id.',
      'INSERT ls_row INTO TABLE lt_rows.',
      "WRITE 'INSERT REPORT x FROM y'.",
    ].join('\n');
    expect(readSecurityReviewTasks(src).map((t) => [t.kind, t.lineStart])).toEqual([
      ['generated-program', 2],
      ['generated-program', 3],
      ['editor-call-for-report', 4],
      ['communication-statement', 5],
    ]);
  });

  test('CALL TRANSACTION without WITH or WITHOUT AUTHORITY-CHECK; with either, no task', () => {
    const [task] = readSecurityReviewTasks(`REPORT zx.\nCALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.\n`);
    expect(task.kind).toBe('call-transaction-without-authority-addition');
    expect(task.subject).toBe('VA03');
    expect(kinds(`REPORT zx.\nCALL TRANSACTION 'VA03' WITH AUTHORITY-CHECK.\nCALL TRANSACTION 'VA02' WITHOUT AUTHORITY-CHECK USING lt_bdc.\n`)).toEqual([]);
  });

  test('every task reads as a task: no verdict words, a "Check" sentence', () => {
    const src = `REPORT zx.\nPARAMETERS p TYPE string.\nAUTHORITY-CHECK OBJECT 'Z' ID 'A' FIELD '*' ID 'B' DUMMY ID 'C' FIELD ' '.\nSELECT * FROM (p) INTO TABLE @DATA(r) CLIENT SPECIFIED.\nOPEN DATASET p FOR OUTPUT IN BINARY MODE.\nSUBMIT z USER p.\nCALL TRANSACTION 'X'.\nEXEC SQL.\nENDEXEC.\nINSERT REPORT p FROM t.\nEDITOR-CALL FOR REPORT p.\nCOMMUNICATION SEND ID i BUFFER b.\n`;
    const tasks = readSecurityReviewTasks(src);
    expect(new Set(tasks.map((t) => t.kind)).size).toBe(13);
    for (const t of tasks) {
      expect(t.check, t.kind).toMatch(/^Check /);
      expect(`${t.title} ${t.detail} ${t.check}`, t.kind).not.toMatch(/\b(vulnerab|insecure|violat|is unsafe|must be fixed)/i);
    }
  });
});

/* ------------------------------------------------------------------ B6 */

test.describe('B6 possible copies of SAP code', () => {
  test('a Z name over an SAP module pool, class or function module; a Z table name and a ZI_ view name are not', () => {
    expect(readSapCodeCopySignals('REPORT zsapmv45a.\n').map((s) => s.sapName)).toEqual(['SAPMV45A']);
    expect(readSapCodeCopySignals('CLASS zcl_salv_table DEFINITION PUBLIC.\nENDCLASS.\n').map((s) => s.sapName)).toEqual(['CL_SALV_TABLE']);
    expect(readSapCodeCopySignals('FUNCTION z_master_idoc_distribute.\nENDFUNCTION.\n').map((s) => s.sapName)).toEqual(['MASTER_IDOC_DISTRIBUTE']);
    expect(readSapCodeCopySignals('REPORT zmara_upload.\nTABLES zmara.\n', 'zmara_upload.abap')).toEqual([]);
    expect(readSapCodeCopySignals('REPORT zx.\n', 'zi_product.abap')).toEqual([]);
    expect(readSapCodeCopySignals('REPORT zfi_open_items.\n')).toEqual([]);
  });

  test('a header comment saying it is a copy; a copy of own code or an unrelated "copy of" is not', () => {
    const [signal] = readSapCodeCopySignals('*&----\n* Kopie von RFITEMGL, angepasst\n*&----\nREPORT zfi_items.\n');
    expect(signal.via).toBe('header-comment');
    expect(signal.sapName).toBe('RFITEMGL');
    expect(signal.lineStart).toBe(2);
    expect(readSapCodeCopySignals('" copied from SAP standard report\nREPORT zfi_items.\n').map((s) => s.via)).toEqual(['header-comment']);
    expect(readSapCodeCopySignals('* Copy of ZFI_ITEMS_OLD\nREPORT zfi_items.\n')).toEqual([]);
    expect(readSapCodeCopySignals('REPORT zfi_items.\n* make a copy of the table before sorting\n')).toEqual([]);
    // In a literal it is text, not a header.
    expect(readSapCodeCopySignals("REPORT zfi_items.\nWRITE 'Kopie von RFITEMGL'.\n")).toEqual([]);
  });

  test('in the evidence: a review task, low confidence, from 3.0.12 only', () => {
    const src = '* Kopie von SAPMV45A\nREPORT zsapmv45a.\n';
    const copies = evidence(src, NEW).filter((f) => f.kind === 'sap-code-copy');
    expect(copies).toHaveLength(1);
    expect(copies[0].confidence).toBe('Low');
    expect(copies[0].recommendation).toMatch(/^Check whether/);
    expect(evidence(src, OLD).filter((f) => f.kind === 'sap-code-copy')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ B8 */

test.describe('B8 classic programming models', () => {
  test('BOPF framework objects: one finding per source, graded on the first class or interface, every line kept', () => {
    const src = [
      'REPORT zx.',
      'DATA lo_sm TYPE REF TO /bobf/if_tra_service_manager.',
      "lo_sm = /bobf/cl_tra_serv_mgr_factory=>get_service_manager( 'ZBO' ).",
      'DATA lo_again TYPE REF TO /bobf/if_tra_service_manager.',
      "WRITE '/BOBF/CL_NOT_CODE'.",
      '* /BOBF/IF_FRW_DETERMINATION in a comment',
    ].join('\n');
    const uses = readLegacyTechnology(src);
    expect(uses.map((u) => [u.sapObject, u.lines, u.objects])).toEqual([
      ['/BOBF/IF_TRA_SERVICE_MANAGER', [2, 3, 4], ['/BOBF/IF_TRA_SERVICE_MANAGER', '/BOBF/CL_TRA_SERV_MGR_FACTORY']],
    ]);
    const findings = evidence(src, NEW).filter((f) => f.kind === 'bopf');
    expect(findings.map((f) => [f.objectName, f.lineStart])).toEqual([['/BOBF/IF_TRA_SERVICE_MANAGER', 2]]);
    expect(findings[0].technicalDetail).toContain('/BOBF/CL_TRA_SERV_MGR_FACTORY');
    expect(findings[0].recommendation).toContain('RAP');
    // SAP lists the framework as classic API: not called obsolete.
    expect(findings[0].cleanCoreImpact).toContain('level B');
    expect(findings[0].cleanCoreImpact).not.toMatch(/obsolete/i);
  });

  test('a SEGW provider class; the framework names inside it do not repeat the finding', () => {
    const src = [
      'CLASS zcl_orders_dpc_ext DEFINITION PUBLIC INHERITING FROM zcl_orders_dpc CREATE PUBLIC.',
      'ENDCLASS.',
      'CLASS zcl_orders_dpc_ext IMPLEMENTATION.',
      '  METHOD orderset_get_entityset.',
      '    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception.',
      '  ENDMETHOD.',
      'ENDCLASS.',
    ].join('\n');
    const uses = readLegacyTechnology(src);
    expect(uses.map((u) => [u.kind, u.customObject, u.lineStart])).toEqual([['gateway-classic-service', 'ZCL_ORDERS_DPC_EXT', 1]]);
    const [finding] = evidence(src, NEW).filter((f) => f.kind === 'gateway-classic-service');
    expect(finding.recommendation).toContain('OData V4 service binding');
    expect(readLegacyTechnology('CLASS zcl_orders DEFINITION PUBLIC INHERITING FROM zcl_base.\nENDCLASS.\n')).toEqual([]);
  });

  test('a DDIC-based CDS view; a view entity and a commented annotation are not', () => {
    const ddic = "@AbapCatalog.sqlViewName: 'ZVCUST'\n@AccessControl.authorizationCheck: #CHECK\ndefine view ZI_Customer as select from kna1 { kunnr }\n";
    const [use] = readLegacyTechnology(ddic);
    expect([use.kind, use.customObject, use.sqlViewName, use.lineStart]).toEqual(['ddic-cds-view', 'ZI_CUSTOMER', 'ZVCUST', 1]);
    const [finding] = evidence(ddic, NEW, 'zi_customer.ddls').filter((f) => f.kind === 'ddic-cds-view');
    expect(finding.recommendation).toContain('DEFINE VIEW ENTITY');
    expect(finding.cleanCoreImpact).toMatch(/obsolete/);
    expect(readLegacyTechnology("// @AbapCatalog.sqlViewName: 'ZV'\n/* @AbapCatalog.sqlViewName: 'ZW' */\ndefine view entity ZI_Customer as select from kna1 { kunnr }\n")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ C5 */

test.describe('C5 classic ALV and IDoc are worded as classic technology that may stay', () => {
  const ALV = "REPORT zx.\nDATA gt TYPE STANDARD TABLE OF kna1.\nCALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' TABLES t_outtab = gt.\n";

  test('ALV from 3.0.12: REUSE_ALV is not on SAP\'s classic-API list, so it stays a Medium finding pointing at CL_SALV_TABLE', () => {
    const [alv] = evidence(ALV, NEW).filter((f) => f.kind === 'classic-alv');
    expect(alv.title).toBe('Classic ALV list (SAP GUI)');
    expect(alv.severity).toBe('Medium');
    expect(alv.cleanCoreImpact).toContain('SAP Note 3578329');
    expect(alv.cleanCoreImpact).toContain('not REUSE_ALV_GRID_DISPLAY');
    expect(alv.recommendation).toContain('CL_SALV_TABLE');
    expect(alv.recommendation).toMatch(/Public Edition/);
    expect(alv.objectName).toBe('REUSE_ALV_GRID_DISPLAY');
    const [old] = evidence(ALV, OLD).filter((f) => f.kind === 'classic-alv');
    expect(old.title).toBe('Legacy ALV Grid Display');
  });

  test('Dynpro and SAP GUI navigation from 3.0.12: level B per SAP Note 3578329, may stay, replace for a browser or Public Edition', () => {
    const src = "REPORT zx.\nCALL SCREEN 100.\nCALL TRANSACTION 'VA03' WITH AUTHORITY-CHECK AND SKIP FIRST SCREEN.\n";
    const dynpro = evidence(src, NEW).filter((f) => f.kind === 'dynpro');
    expect(dynpro).toHaveLength(2);
    for (const f of dynpro) {
      expect(f.cleanCoreImpact, f.title).toContain('SAP Note 3578329');
      expect(f.recommendation, f.title).toMatch(/may stay/);
      expect(f.recommendation, f.title).toMatch(/Public Edition/);
    }
    expect(dynpro.find((f) => f.lineStart === 2)!.severity).toBe('Low');
    const old = evidence(src, OLD).filter((f) => f.kind === 'dynpro');
    expect(old.find((f) => f.lineStart === 2)!.title).toBe('Legacy Screen Painter (Dynpro) UI Pattern');
    expect(old.find((f) => f.lineStart === 2)!.severity).toBe('Medium');
  });

  test('a GUI file transfer through a listed classic API is level B; WS_DOWNLOAD is not on the list', () => {
    const listed = evidence("REPORT zx.\nCALL FUNCTION 'GUI_DOWNLOAD' EXPORTING filename = lv_f TABLES data_tab = lt.\n", NEW).find((f) => f.kind === 'gui-download')!;
    expect(listed.cleanCoreImpact).toContain('level B');
    const unlisted = evidence("REPORT zx.\nCALL FUNCTION 'WS_DOWNLOAD' EXPORTING filename = lv_f TABLES data_tab = lt.\n", NEW).find((f) => f.kind === 'gui-download')!;
    expect(unlisted.cleanCoreImpact).toContain('not level B');
  });

  test('IDoc from 3.0.12: level B, replacement for ABAP Cloud / Public Edition, the EDI exception', () => {
    const src = "REPORT zx.\nCALL FUNCTION 'MASTER_IDOC_DISTRIBUTE' EXPORTING master_idoc_control = ls_ctrl TABLES communication_idoc_control = lt_comm master_idoc_data = lt_data.\n";
    const r = recommendArchitecture(src, extractCodeInventory(src), extractDataCoupling(src), undefined, NEW);
    expect(r.architecture).toBe('integration');
    expect(r.justification).toContain('level B');
    expect(r.justification).toMatch(/Public Edition/);
    expect(r.justification).toMatch(/EDI/);
    expect(r.justification).not.toMatch(/legacy middleware/);
    const old = recommendArchitecture(src, extractCodeInventory(src), extractDataCoupling(src), undefined, OLD);
    expect(old.justification).toBe('RFC/IDoc integration patterns detected. SAP Integration Suite replaces legacy middleware with cloud integration flows.');
  });

  test('a custom and a standard table read speak of levels and wrappers from 3.0.12, never of tiers', () => {
    const src = 'REPORT zx.\nSELECT * FROM ztab INTO TABLE @DATA(a).\nSELECT * FROM bseg INTO TABLE @DATA(b).\n';
    const now = evidence(src, NEW).filter((f) => f.kind === 'table-access' || f.kind === 'standard-table-read');
    expect(now).toHaveLength(2);
    for (const f of now) expect(`${f.technicalDetail} ${f.cleanCoreImpact}`).not.toMatch(/\btier/i);
    expect(now.find((f) => f.kind === 'standard-table-read')!.cleanCoreImpact).toMatch(/influence request/);
    expect(now.find((f) => f.kind === 'standard-table-read')!.cleanCoreImpact).not.toMatch(/upgrade-safe/);
  });
});

/* --------------------------------------------------- an older signed run */

test('a run of an engine before 3.0.12 re-renders byte for byte as it was signed', () => {
  const src = [
    'REPORT zsapmv45a.',
    'PARAMETERS p_cond TYPE string.',
    "AUTHORITY-CHECK OBJECT 'Z' ID 'A' FIELD '*'.",
    'SELECT * FROM kna1 INTO TABLE @DATA(r) WHERE (p_cond).',
    'SELECT * FROM ztab INTO TABLE @DATA(c).',
    'SELECT * FROM bseg INTO TABLE @DATA(d).',
    "CALL TRANSACTION 'VA03'.",
    "CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' TABLES t_outtab = r.",
    'DATA lo TYPE REF TO /bobf/if_tra_service_manager.',
  ].join('\n');
  const old = evidence(src, OLD);
  expect(old.some((f) => NEW_KINDS.includes(f.kind))).toBe(false);
  expect(old.find((f) => f.kind === 'classic-alv')?.title).toBe('Legacy ALV Grid Display');
  expect(old.find((f) => f.kind === 'standard-table-read')?.cleanCoreImpact).toContain('Tier 2');
  // A missing version is read as an old run too.
  expect(JSON.stringify(evidence(src, null))).toBe(JSON.stringify(old));
  // The new engine adds findings in line order and counts the ids again; every
  // older finding is still there, in the same order, at the same line.
  const now = evidence(src, NEW);
  const kept = now.filter((f) => !NEW_KINDS.includes(f.kind));
  expect(kept.map((f) => [f.kind, f.lineStart])).toEqual(old.map((f) => [f.kind, f.lineStart]));
  expect(now.map((f) => f.lineStart)).toEqual([...now.map((f) => f.lineStart)].sort((a, b) => a - b));
  expect(now.map((f) => f.id)).toEqual(now.map((_, i) => `CC-${String(i + 1).padStart(3, '0')}`));
});

/* ------------------------------------------------- RFC: the addition only */

test.describe('an RFC is the DESTINATION addition, not a parameter called destination (BM-056)', () => {
  const rfc = (src: string, version: string) => evidence(src, version).filter((f) => f.kind === 'rfc-call').map((f) => f.objectName);
  const lines = (...l: string[]) => l.join('\n');

  test('a parameter named destination is no remote call from 3.0.12; an older run keeps its finding', () => {
    const src = lines(
      'REPORT zx.',
      "CALL FUNCTION 'RFC_CONNECTION_CLOSE'",
      '  EXPORTING',
      '    destination = lv_dest',
      '  EXCEPTIONS',
      '    destination_not_open = 1.',
    );
    expect(rfc(src, NEW)).toEqual([]);
    expect(rfc(src, OLD)).toEqual(['RFC_CONNECTION_CLOSE']);
  });

  test("DESTINATION to another system stays a remote call; 'NONE' and IN GROUP are local", () => {
    expect(rfc(lines('REPORT zx.', "CALL FUNCTION 'Z_REMOTE' DESTINATION lv_dest EXPORTING iv = 1."), NEW)).toEqual(['Z_REMOTE']);
    expect(rfc(lines('REPORT zx.', "CALL FUNCTION 'Z_REMOTE' STARTING NEW TASK 'T1' DESTINATION 'ERP_PRD' EXPORTING iv = 1."), NEW)).toEqual(['Z_REMOTE']);
    expect(rfc(lines('REPORT zx.', "CALL FUNCTION 'Z_LOCAL' DESTINATION 'NONE' EXPORTING iv = 1."), NEW)).toEqual([]);
    expect(rfc(lines('REPORT zx.', "CALL FUNCTION 'Z_PARALLEL' STARTING NEW TASK lv_task DESTINATION IN GROUP DEFAULT EXPORTING iv = 1."), NEW)).toEqual([]);
    expect(rfc(lines('REPORT zx.', "CALL FUNCTION 'Z_LOCAL' EXPORTING iv = 'DESTINATION x'."), NEW)).toEqual([]);
  });
});

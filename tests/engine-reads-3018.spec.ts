/**
 * Roadmap 3.0.18 item 4 — the engine says only what it read (QA delta of
 * 73b8cad63d3e, the findings on constant-gates, engine-rules, security-review,
 * legacy-technology, evidence-model, header-rules, abcd-classification and
 * original-contract).
 *
 * What moves a signed run is gated on `ENGINE_READS_FROM`: each such test asks
 * the engine of 3.0.18 and the one before it, and the one before it still
 * answers what it signed. `headerRuleRange`, `expectedAtcMessage` and the
 * original's contract take no engine version — they are display and generation
 * input, not signed evidence — and are tested on the current reading alone.
 *
 * Pure: no server.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readConstantGates, isUnreachableLine } from '../lib/abap/constant-gates';
import { readAbapProxies, readHookImplementations, readSystemTimeUses } from '../lib/abap/engine-rules';
import { readLegacyTechnology } from '../lib/abap/legacy-technology';
import { readSecurityReviewTasks } from '../lib/abap/security-review';
import { readStatements } from '../lib/abap/statement-reader';
import { headerRuleRange, readHeaderRules, type HeaderRuleCandidate } from '../lib/abap/header-rules';
import { expectedAtcMessage, gradeFromSapStates } from '../lib/abap/abcd-classification';
import { readOriginalContract } from '../lib/abap/original-contract';
import { ENGINE_READS_FROM, engineReadsApply } from '../lib/abap/engine-reads-gate';

const NEW = 'v3.0.18';
const OLD = 'v3.0.17';
const READS = { engineReads: true };

const findings = (code: string, engine: string, kind: string) =>
  buildAbapEvidence(code, 'ZTEST.abap', 'private', undefined, engine).findings.filter((f) => f.kind === kind);

test('the gate opens at 3.0.18 and not before', () => {
  expect(ENGINE_READS_FROM).toBe('3.0.18');
  expect(engineReadsApply(NEW)).toBe(true);
  expect(engineReadsApply(OLD)).toBe(false);
  expect(engineReadsApply(null)).toBe(false);
});

test.describe('constant gates', () => {
  // 7 IF p_mode, 8 the gate, 9 RETURN, 11 rest of the outer arm, 13 work after the outer IF.
  const NESTED = `REPORT zt.
CONSTANTS gc_gate TYPE c LENGTH 1 VALUE 'X'.
PARAMETERS p_mode TYPE c.
START-OF-SELECTION.
  PERFORM run.
FORM run.
  IF p_mode = 'X'.
    IF gc_gate = 'X'.
      RETURN.
    ENDIF.
    WRITE 'inner'.
  ENDIF.
  WRITE 'work'.
ENDFORM.`;

  test('a gate inside a conditional block locks away the rest of that arm, not the rest of the routine', () => {
    const now = readConstantGates(NESTED, READS);
    expect(now.gates).toHaveLength(1);
    expect(now.gates[0].enclosed).toBe(true);
    expect(isUnreachableLine(now, 11)).toBe(true);
    expect(isUnreachableLine(now, 13)).toBe(false);
    expect(now.alwaysStopping).toEqual([]);
    // Before 3.0.18 the whole rest of the routine was locked away.
    const before = readConstantGates(NESTED);
    expect(isUnreachableLine(before, 13)).toBe(true);
    expect(before.alwaysStopping).toEqual(['RUN']);
  });

  test('an unconditional gate still stops its routine', () => {
    const flat = NESTED.replace("  IF p_mode = 'X'.\n", '').replace("    WRITE 'inner'.\n  ENDIF.\n", "    WRITE 'inner'.\n");
    const now = readConstantGates(flat, READS);
    expect(now.gates[0].enclosed).toBeUndefined();
    expect(now.alwaysStopping).toEqual(['RUN']);
  });

  // 8 RAISE, 10 rest of the TRY body, 12 the handler, 14 after ENDTRY.
  const CAUGHT = `REPORT zt.
CONSTANTS gc_fail TYPE c LENGTH 1 VALUE 'X'.
START-OF-SELECTION.
  PERFORM run.
FORM run.
  TRY.
      IF gc_fail = 'X'.
        RAISE EXCEPTION TYPE zcx_stop.
      ENDIF.
      WRITE 'body'.
    CATCH zcx_stop.
      WRITE 'handled'.
  ENDTRY.
  WRITE 'after'.
ENDFORM.`;

  test('a RAISE EXCEPTION a CATCH of the same TRY may take up ends nothing', () => {
    const now = readConstantGates(CAUGHT, READS);
    expect(now.gates[0].stop).toBeNull();
    // It still leaves the TRY body: what follows it there is never reached (QA 92e791c30e02).
    expect(isUnreachableLine(now, 10)).toBe(true);
    expect(isUnreachableLine(now, 11)).toBe(false);
    expect(isUnreachableLine(now, 12)).toBe(false);
    expect(isUnreachableLine(now, 14)).toBe(false);
    expect(now.alwaysStopping).toEqual([]);
    const before = readConstantGates(CAUGHT);
    expect(before.gates[0].stop?.kind).toBe('raise');
    expect(isUnreachableLine(before, 14)).toBe(true);
  });

  const SHADOWED = `REPORT zt.
CONSTANTS gc_mode TYPE c LENGTH 1 VALUE space.
START-OF-SELECTION.
  PERFORM run USING 'X'.
FORM run USING gc_mode TYPE c.
  IF gc_mode <> 'X'.
    RETURN.
  ENDIF.
  WRITE 'work'.
ENDFORM.`;

  test('a RAISE RESUMABLE EXCEPTION may resume: nothing after it is marked unreachable (QA 4453a4e9519c)', () => {
    const resumable = CAUGHT.replace('RAISE EXCEPTION TYPE zcx_stop.', 'RAISE RESUMABLE EXCEPTION TYPE zcx_stop.');
    expect(resumable).toContain('RAISE RESUMABLE');
    expect(isUnreachableLine(readConstantGates(resumable, READS), 10)).toBe(false);
  });

  test('a FORM parameter of the constant\'s name shadows it, so no gate is read', () => {
    expect(readConstantGates(SHADOWED, READS).gates).toEqual([]);
    expect(readConstantGates(SHADOWED).gates).toHaveLength(1);
  });

  test('a method parameter of the constant\'s name shadows it too', () => {
    const method = `CLASS lcl DEFINITION.
  PUBLIC SECTION.
    CONSTANTS gc_mode TYPE c LENGTH 1 VALUE space.
    METHODS run IMPORTING gc_mode TYPE c.
ENDCLASS.
CLASS lcl IMPLEMENTATION.
  METHOD run.
    IF gc_mode <> 'X'.
      RETURN.
    ENDIF.
  ENDMETHOD.
ENDCLASS.`;
    expect(readConstantGates(method, READS).gates).toEqual([]);
  });

  test('a finding behind the nested gate is marked only where the arm is locked away (signed evidence)', () => {
    const code = NESTED.replace("  WRITE 'work'.", "  SELECT SINGLE * FROM bseg INTO @DATA(ls_bseg).");
    const at = (engine: string) => buildAbapEvidence(code, 'ZTEST.abap', 'private', undefined, engine).findings.filter((f) => f.lineStart === 13);
    const now = at(NEW);
    const before = at(OLD);
    expect(now.length).toBeGreaterThan(0);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((f) => f.unreachable)).toBe(true);
    expect(now.every((f) => !f.unreachable)).toBe(true);
  });
});

test.describe('the server\'s date and time', () => {
  const uses = (code: string, reads: boolean) => readSystemTimeUses(readStatements(code), undefined, reads ? READS : {});

  test('IS INITIAL and IS NOT INITIAL on sy-datum / sy-uzeit are comparisons', () => {
    const code = "REPORT z.\nIF sy-datum IS INITIAL.\n  CLEAR sy-subrc.\nENDIF.\nIF sy-uzeit IS NOT INITIAL.\n  CLEAR sy-subrc.\nENDIF.";
    expect(uses(code, true).map((u) => [u.line, u.use, u.field])).toEqual([[2, 'comparison', 'SY-DATUM'], [5, 'comparison', 'SY-UZEIT']]);
    expect(uses(code, false)).toEqual([]);
  });

  test('a decision on a plain copy of sy-datum is the server\'s date deciding', () => {
    const code = "REPORT z.\nDATA lv_date TYPE d.\nDATA lv_due TYPE d.\nlv_date = sy-datum.\nIF lv_date > lv_due.\n  CLEAR lv_due.\nENDIF.";
    expect(uses(code, true).map((u) => [u.line, u.use, u.field])).toEqual([[5, 'comparison', 'SY-DATUM']]);
    expect(uses(code, false)).toEqual([]);
    // Written again with something else, the copy no longer carries the server's date.
    const rewritten = code.replace('IF lv_date', "lv_date = '20260101'.\nIF lv_date");
    expect(uses(rewritten, true)).toEqual([]);
    // So is a copy filled again from the database or by a call (QA 38a0b0c63bac).
    expect(uses(code.replace('IF lv_date', 'SELECT SINGLE budat FROM bkpf INTO @lv_date.\nIF lv_date'), true)).toEqual([]);
    expect(uses(code.replace('IF lv_date', 'SELECT SINGLE budat, cpudt FROM bkpf INTO (@lv_due, @lv_date).\nIF lv_date'), true)).toEqual([]);
    expect(uses(code.replace('IF lv_date', "CALL FUNCTION 'Z_DATE' IMPORTING e_date = lv_date.\nIF lv_date"), true)).toEqual([]);
    // A statement that only reads the copy leaves it a copy.
    expect(uses(code.replace('IF lv_date', "CALL FUNCTION 'Z_DATE' EXPORTING i_date = lv_date.\nIF lv_date"), true).map((u) => u.use)).toEqual(['comparison']);
    // In the evidence of a 3.0.18 run, and not in one signed before.
    expect(findings(code, NEW, 'system-time')).toHaveLength(1);
    expect(findings(code, OLD, 'system-time')).toHaveLength(0);
  });
});

test.describe('hooks, delegated or not', () => {
  const hooks = (code: string, reads: boolean) => readHookImplementations(readStatements(code), '', reads ? READS : {});

  test('an assignment beside the class call is logic in the hook', () => {
    const code = "FORM userexit_save_document.\n  xvbak-zzflag = 'X'.\n  zcl_handler=>execute( ).\nENDFORM.";
    expect(hooks(code, true)[0].delegatedTo).toBeNull();
    expect(hooks(code, false)[0].delegatedTo).toBe('ZCL_HANDLER');
  });

  test('creating the object and calling it is still a delegation', () => {
    const code = "FORM userexit_save_document.\n  DATA lo TYPE REF TO zcl_handler.\n  lo = NEW zcl_handler( ).\n  lo->execute( ).\nENDFORM.";
    expect(hooks(code, true)[0].delegatedTo).toBe('ZCL_HANDLER');
    // Created only once (a lazy instantiation) is still only the hand-over.
    const lazy = "METHOD if_ex_me_process_po_cust~open.\n  IF mo_rules IS NOT BOUND.\n    mo_rules = NEW zcl_mm_po_rules( ).\n  ENDIF.\nENDMETHOD.";
    expect(hooks(lazy, true)[0].delegatedTo).toBe('ZCL_MM_PO_RULES');
  });
});

test.describe('ABAP proxies', () => {
  const FAULT_ELSEWHERE = `REPORT z.
DATA lo_report TYPE REF TO zcl_co_report.
DATA lo_proxy TYPE REF TO zco_orders.
START-OF-SELECTION.
  lo_report = NEW #( ).
  TRY.
      CREATE OBJECT lo_proxy.
      lo_proxy->send( ).
    CATCH cx_ai_system_fault.
  ENDTRY.`;

  test('a CO_ class is a proxy only where a TRY catching a proxy fault uses it', () => {
    const proxies = (reads: boolean) => readAbapProxies(readStatements(FAULT_ELSEWHERE), reads ? READS : {}).map((p) => p.name);
    expect(proxies(true)).toEqual(['ZCO_ORDERS']);
    expect(proxies(false)).toEqual(['ZCL_CO_REPORT', 'ZCO_ORDERS']);
  });

  test('a proxy class the source only defines is not said to be called', () => {
    const def = 'CLASS zco_orders DEFINITION PUBLIC INHERITING FROM cl_proxy_client CREATE PUBLIC.\nENDCLASS.';
    expect(readAbapProxies(readStatements(def), READS)[0].called).toBe(false);
    expect(findings(def, NEW, 'abap-proxy')[0].technicalDetail).toContain('shows no call of it');
    expect(findings(def, OLD, 'abap-proxy')[0].technicalDetail).toContain('the program calls a service');
  });
});

test('a file-picker dialog is a path selection, not a file read from the PC', () => {
  const code = "REPORT z.\nDATA lt_files TYPE filetable.\nDATA lv_rc TYPE i.\ncl_gui_frontend_services=>file_open_dialog( CHANGING file_table = lt_files rc = lv_rc ).";
  const [now] = findings(code, NEW, 'gui-download');
  expect(now.technicalDetail).toContain('selection dialog');
  expect(now.technicalDetail).not.toContain("Reads a file from the user's PC");
  expect(findings(code, OLD, 'gui-download')[0].technicalDetail).toContain("Reads a file from the user's PC");
});

test('a second CDS view with a BOPF annotation is a second BOPF object', () => {
  const cds = `@ObjectModel.transactionalProcessingEnabled: true
@ObjectModel.writeActivePersistence: 'ZTA'
define root view ZI_A as select from zta { key id }
@ObjectModel.transactionalProcessingEnabled: true
define root view ZI_B as select from ztb { key id }
`;
  const bopf = (reads: boolean) => readLegacyTechnology(cds, undefined, reads ? READS : {}).filter((u) => u.kind === 'bopf').map((u) => u.customObject);
  expect(bopf(true)).toEqual(['ZI_A', 'ZI_B']);
  expect(bopf(false)).toEqual(['ZI_A']);
});

test.describe('security review', () => {
  const tasks = (code: string, reads: boolean) =>
    readSecurityReviewTasks(code, { precisionFixes: true, ...(reads ? READS : {}) }).map((t) => t.kind);
  const VALIDATE = `REPORT z.
PARAMETERS p_file TYPE string.
START-OF-SELECTION.
  CALL FUNCTION 'FILE_VALIDATE_NAME'
    EXPORTING
      logical_filename = 'ZFILE'
    CHANGING
      physical_filename = p_file
    EXCEPTIONS
      validation_failed = 1
      OTHERS = 2.
  IF sy-subrc <> 0.
    MESSAGE 'Invalid path' TYPE 'I'.
  ENDIF.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.`;

  test('a validation whose failure only informs and goes on covers no path', () => {
    expect(tasks(VALIDATE, true)).toContain('file-path-from-input');
    expect(tasks(VALIDATE, false)).not.toContain('file-path-from-input');
  });

  test('a validation whose failure stops, or whose success arm holds the access, covers it', () => {
    expect(tasks(VALIDATE.replace("TYPE 'I'", "TYPE 'E'"), true)).not.toContain('file-path-from-input');
    expect(tasks(VALIDATE.replace("    MESSAGE 'Invalid path' TYPE 'I'.", '    RETURN.'), true)).not.toContain('file-path-from-input');
    expect(tasks(VALIDATE.replace("  IF sy-subrc <> 0.\n    MESSAGE 'Invalid path' TYPE 'I'.\n  ENDIF.", '  CHECK sy-subrc = 0.'), true)).not.toContain('file-path-from-input');
    const inside = VALIDATE
      .replace("  IF sy-subrc <> 0.\n    MESSAGE 'Invalid path' TYPE 'I'.\n  ENDIF.\n  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.",
        "  IF sy-subrc = 0.\n    OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.\n  ENDIF.");
    expect(tasks(inside, true)).not.toContain('file-path-from-input');
    // Through a copy of sy-subrc decided on right away.
    const copied = VALIDATE.replace("  IF sy-subrc <> 0.\n    MESSAGE 'Invalid path' TYPE 'I'.", "  DATA(lv_rc) = sy-subrc.\n  IF lv_rc <> 0.\n    RETURN.");
    expect(tasks(copied, true)).not.toContain('file-path-from-input');
    expect(tasks(copied.replace('    RETURN.', "    MESSAGE 'Invalid path' TYPE 'W'."), true)).toContain('file-path-from-input');
    // Without EXCEPTIONS a failure ends the program: covered, as before.
    const unhandled = VALIDATE.replace("    EXCEPTIONS\n      validation_failed = 1\n      OTHERS = 2.", '    .').replace('physical_filename = p_file\n    .', 'physical_filename = p_file.');
    expect(tasks(unhandled, true)).not.toContain('file-path-from-input');
  });

  test('a CHECK that only leaves a loop iteration does not cover an access after the loop (QA 804c2856d240)', () => {
    const looped = VALIDATE
      .replace("  CALL FUNCTION 'FILE_VALIDATE_NAME'", "  DO 1 TIMES.\n  CALL FUNCTION 'FILE_VALIDATE_NAME'")
      .replace("  IF sy-subrc <> 0.\n    MESSAGE 'Invalid path' TYPE 'I'.\n  ENDIF.", '  CHECK sy-subrc = 0.\n  ENDDO.');
    expect(tasks(looped, true)).toContain('file-path-from-input');
    // Inside the loop, after the CHECK, the access is still covered.
    const inLoop = looped.replace('  ENDDO.\n  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.', '  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.\n  ENDDO.');
    expect(tasks(inLoop, true)).not.toContain('file-path-from-input');
  });

  test('a SELECT loop nested in the CHECK loop closes itself, not the CHECK loop (QA f2b34a9673f5)', () => {
    const looped = VALIDATE
      .replace("  CALL FUNCTION 'FILE_VALIDATE_NAME'", "  DO 1 TIMES.\n  CALL FUNCTION 'FILE_VALIDATE_NAME'")
      .replace("  IF sy-subrc <> 0.\n    MESSAGE 'Invalid path' TYPE 'I'.\n  ENDIF.", '  CHECK sy-subrc = 0.\n  SELECT carrid FROM scarr INTO @DATA(lv_c).\n  ENDSELECT.\n  ENDDO.');
    expect(looped).toContain('ENDSELECT.');
    expect(tasks(looped, true)).toContain('file-path-from-input');
  });

  test('a COND covers the access only when the arm failure takes throws (QA fdaf20ecaa28)', () => {
    const cond = (expr: string) => VALIDATE.replace("  IF sy-subrc <> 0.\n    MESSAGE 'Invalid path' TYPE 'I'.\n  ENDIF.", `  DATA(lv_ok) = ${expr}.`);
    expect(tasks(cond("COND string( WHEN sy-subrc <> 0 THEN `warn` ELSE THROW zcx_bad( ) )"), true)).toContain('file-path-from-input');
    expect(tasks(cond("COND string( WHEN sy-subrc = 0 THEN THROW zcx_bad( ) ELSE `warn` )"), true)).toContain('file-path-from-input');
    expect(tasks(cond("COND string( WHEN sy-subrc <> 0 THEN THROW zcx_bad( ) ELSE `ok` )"), true)).not.toContain('file-path-from-input');
    expect(tasks(cond("COND string( WHEN sy-subrc = 0 THEN `ok` ELSE THROW zcx_bad( ) )"), true)).not.toContain('file-path-from-input');
    expect(tasks(cond("SWITCH string( sy-subrc WHEN 0 THEN `ok` ELSE THROW zcx_bad( ) )"), true)).not.toContain('file-path-from-input');
  });

  test('INSERT REPORT with a literal program name is a generated program', () => {
    const code = "REPORT z.\nDATA lt_src TYPE STANDARD TABLE OF string.\nINSERT REPORT 'ZGENERATED' FROM lt_src.";
    expect(tasks(code, true)).toContain('generated-program');
    expect(tasks(code, false)).not.toContain('generated-program');
    expect(tasks(code.replace("'ZGENERATED'", 'lv_name'), false)).toContain('generated-program');
  });

  const COMPONENT = `REPORT z.
PARAMETERS p_where TYPE string.
DATA: BEGIN OF ls_filter,
        where TYPE string,
        other TYPE string,
      END OF ls_filter.
DATA lt_rows TYPE STANDARD TABLE OF mara.
START-OF-SELECTION.
  ls_filter-where = p_where.
  ls_filter-where = 'MATNR IS NOT NULL'.
  SELECT * FROM mara INTO TABLE lt_rows WHERE (ls_filter-where).`;

  test('a clean write to the very component the clause reads clears it; one to another component does not', () => {
    expect(tasks(COMPONENT, true)).not.toContain('dynamic-sql-from-input');
    expect(tasks(COMPONENT, false)).toContain('dynamic-sql-from-input');
    const sibling = COMPONENT.replace("  ls_filter-where = 'MATNR IS NOT NULL'.", "  ls_filter-other = 'X'.");
    expect(tasks(sibling, true)).toContain('dynamic-sql-from-input');
  });
});

test.describe('the header rule range', () => {
  const rules = (...ids: string[]): HeaderRuleCandidate[] => ids.map((id, i) => ({ id, kind: 'rule', text: 'x', lineStart: i + 1, lineEnd: i + 1 }));

  test('sparse ids are listed, never a range that implies an absent one', () => {
    expect(headerRuleRange(rules('R01', 'R03', 'R04'))).toBe('R01, R03, R04');
    expect(headerRuleRange(rules('R04', 'R03', 'R02'))).toBe('R04, R03, R02');
    expect(headerRuleRange(rules('R01', 'R02', 'R03', 'R05'))).toBe('R01–R03, R05');
  });

  test('a consecutive run is still one range', () => {
    expect(headerRuleRange(rules(...Array.from({ length: 16 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`)))).toBe('R01–R16');
    expect(headerRuleRange(rules('R01', 'R02'))).toBe('R01, R02');
    expect(headerRuleRange(readHeaderRules('* R01 Round once.\n* R02 Unknown is not zero.\n* R03 Filter first.\nREPORT z.'))).toBe('R01–R03');
  });
});

test('released and noAPI at once: the ATC message is not determined, and the grade does not move', () => {
  const sap = (releaseState?: string, classificationState?: string) =>
    gradeFromSapStates({ releaseState, classificationState, hasSuccessor: false, isSapObject: true, isCustomerObject: false });
  const conflict = sap('released', 'noAPI');
  expect(conflict.cloudView).toBe('usable');
  expect(conflict.classicView).toBe('not-recommended');
  expect(expectedAtcMessage(conflict).text).toBe('ATC: not determined');
  expect(conflict.grade).toBe(sap('released').grade);
  // What the design note's table states stays: released alone, and released with classic API.
  expect(expectedAtcMessage(sap('released')).text).toBe('ATC expected: no finding (released API)');
  expect(expectedAtcMessage(sap('released', 'classicAPI')).text).toBe('ATC expected: no finding (released API)');
});

test.describe('the original\'s contract: formal parameters shadow a packed global', () => {
  test('a FORM parameter', () => {
    const src = 'REPORT z.\nDATA lv_amount TYPE p LENGTH 8 DECIMALS 2.\nFORM calc USING lv_amount TYPE i.\n  DATA lv_alias LIKE lv_amount.\nENDFORM.';
    expect(readOriginalContract(src).decimals.map((d) => d.name)).toEqual(['lv_amount']);
  });

  test('a method parameter, as its METHODS declaration names it', () => {
    const src = `REPORT z.
DATA lv_amount TYPE p LENGTH 8 DECIMALS 2.
CLASS lcl DEFINITION.
  PUBLIC SECTION.
    METHODS calc IMPORTING lv_amount TYPE i.
ENDCLASS.
CLASS lcl IMPLEMENTATION.
  METHOD calc.
    DATA lv_alias LIKE lv_amount.
  ENDMETHOD.
ENDCLASS.`;
    expect(readOriginalContract(src).decimals.map((d) => d.name)).toEqual(['lv_amount']);
  });

  test('outside the procedure the global still resolves', () => {
    const src = 'REPORT z.\nDATA lv_amount TYPE p LENGTH 8 DECIMALS 2.\nFORM calc USING lv_amount TYPE i.\nENDFORM.\nDATA lv_alias LIKE lv_amount.';
    expect(readOriginalContract(src).decimals.map((d) => d.name)).toEqual(['lv_amount', 'lv_alias']);
  });
});

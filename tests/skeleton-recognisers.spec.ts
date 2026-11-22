/**
 * Engine 4 phase 3, second half: one recogniser per concept, each with its probes (`docs/design/engine4.md`,
 * "Phase 3"). The recognisers of the skeleton gather in `lib/abap/skeleton/recognisers.ts`; this spec pins what each
 * of them answers on small statements written for it, so a later change to one concept shows up here, under that
 * concept's name, before it shows up as a moved digest of the frozen skeletons (`skeleton-frozen-digests.spec.ts`).
 *
 * The probes record the reading as it stands, including its limits (the gated reading of `MESSAGE` in any case,
 * engine 3.2.0, is probed on both sides of the gate). No probe is a benchmark case.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { readStatements, type AbapStatement } from '../lib/abap/statement-reader';
import {
  AMDP_METHOD,
  BUILDS_TABLE,
  BUILT_IN_FLAG_VALUES,
  COLLECT_TARGET,
  ENHANCEMENT_CALL,
  FLAG_ASSIGNMENT,
  MESSAGE_ROW,
  OUTPUT_CONTROL,
  USER_EXIT,
  adbcExecution,
  alvEventRows,
  amdpTables,
  closesDataset,
  datasetOf,
  formConvention,
  functionTaskKind,
  isEmbeddedSelect,
  isErrorMessage,
  isFileOutput,
  isInfoMessage,
  isListOutput,
  isRaiseEvent,
  raisesException,
  receivesResults,
  selectTables,
} from '../lib/abap/skeleton/recognisers';

/** The one statement a line of ABAP is. */
function one(line: string): AbapStatement {
  const statements = readStatements(line);
  expect(statements, line).toHaveLength(1);
  return statements[0];
}

test.describe('messages: which MESSAGE ends the process, which asks a person', () => {
  test('error, abort and exit messages end it; the type letter is read in either case', () => {
    for (const text of ["MESSAGE e001(zz).", "MESSAGE A002(zz) WITH lv_x.", "MESSAGE x003(zz).",
      "MESSAGE 'Stop' TYPE 'E'.", "MESSAGE lv_text TYPE 'a'."]) {
      expect(isErrorMessage(one(text).text), text).toBe(true);
    }
  });
  test('MESSAGE … INTO shows nothing and ends nothing, whatever its type', () => {
    expect(isErrorMessage(one('MESSAGE e001(zz) INTO lv_text.').text)).toBe(false);
    expect(isInfoMessage(one('MESSAGE i001(zz) INTO lv_text.').text)).toBe(false);
  });
  test('status, warning and success messages are neither an end nor a user task', () => {
    for (const text of ['MESSAGE s001(zz).', 'MESSAGE w001(zz).', "MESSAGE 'Done' TYPE 'S'."]) {
      expect(isErrorMessage(one(text).text), text).toBe(false);
      expect(isInfoMessage(one(text).text), text).toBe(false);
    }
  });
  test('an information message is the popup a person confirms', () => {
    expect(isInfoMessage(one('MESSAGE i012(zsd).').text)).toBe(true);
    expect(isInfoMessage(one("MESSAGE lv_text TYPE 'I'.").text)).toBe(true);
    expect(isErrorMessage(one('MESSAGE i012(zsd).').text)).toBe(false);
  });
  test('engine 3.2.0 reads the keywords in any case; an older engine does not (the gate)', () => {
    // `readStatements` keeps the case of the source; the keyword case is what the gate decides.
    const lower = "message 'Stop' type 'E'.";
    expect(isErrorMessage(one(lower).text, true)).toBe(true);
    expect(isErrorMessage(one(lower).text, false)).toBe(false);
    const info = "message 'Note' type 'I'.";
    expect(isInfoMessage(one(info).text, true)).toBe(true);
    expect(isInfoMessage(one(info).text, false)).toBe(false);
  });
});

test.describe('RAISE: an event runs handlers and goes on, an exception ends the flow', () => {
  test('RAISE EVENT is an event', () => {
    const s = one('RAISE EVENT order_saved EXPORTING iv_id = lv_id.');
    expect(isRaiseEvent(s.text)).toBe(true);
    expect(raisesException(s)).toBe(false);
  });
  test('RAISE EXCEPTION, RAISE RESUMABLE and a classic RAISE end it', () => {
    for (const text of ['RAISE EXCEPTION TYPE zcx_error.', 'RAISE RESUMABLE EXCEPTION TYPE zcx_warn.', 'RAISE not_found.']) {
      const s = one(text);
      expect(raisesException(s), text).toBe(true);
      expect(isRaiseEvent(s.text), text).toBe(false);
    }
  });
});

test.describe('reads: which tables a statement reads', () => {
  test('the FROM table first, then every JOIN, upper-cased, once each', () => {
    expect(selectTables('SELECT a~vbeln FROM vbak AS a INNER JOIN vbap AS b ON a~vbeln = b~vbeln INTO TABLE @lt.'))
      .toEqual(['VBAK', 'VBAP']);
  });
  test('a FROM inside a literal is not a table', () => {
    expect(selectTables("SELECT 'FROM KNA1' AS note FROM vbak INTO TABLE @lt.")).toEqual(['VBAK']);
  });
  test('FROM TABLE and FROM @itab are not database tables', () => {
    expect(selectTables('SELECT * FROM @lt_keys AS k INTO TABLE @DATA(lt).')).toEqual([]);
  });
  test('a common table expression and a cursor read although they do not begin with SELECT', () => {
    expect(isEmbeddedSelect('WITH +cte AS ( SELECT * FROM vbak ) SELECT * FROM +cte INTO TABLE @lt.')).toBe(true);
    expect(isEmbeddedSelect('OPEN CURSOR @lv_c FOR SELECT * FROM mara.')).toBe(true);
    expect(isEmbeddedSelect("WITH lv_x = 'SELECT'.")).toBe(false);
  });
  test('ADBC: the method that hands SQL text to the database, and its operand', () => {
    expect(adbcExecution('lv_rows = lo_stmt->execute_update( lv_sql ).')).toEqual({ method: 'EXECUTE_UPDATE', argument: 'lv_sql' });
    expect(adbcExecution("lo_x->execute( 'execute_query(' ).")).toBeNull();
  });
  test('AMDP: the method name and the dictionary objects of USING', () => {
    const opener = 'METHOD get_stock BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT USING mseg mard zcl_x=>helper.';
    expect(AMDP_METHOD.exec(opener)?.[1]).toBe('get_stock');
    expect(amdpTables(opener)).toEqual(['MSEG', 'MARD']);
    expect(amdpTables('METHOD m BY DATABASE FUNCTION FOR HDB LANGUAGE SQLSCRIPT.')).toEqual([]);
  });
  test('RECEIVE RESULTS FROM FUNCTION is the receiving half of an asynchronous RFC', () => {
    expect(receivesResults("RECEIVE RESULTS FROM FUNCTION 'Z_TASK' IMPORTING ev = lv.")).toBe(true);
    expect(receivesResults('RECEIVE lv_x.')).toBe(false);
  });
});

test.describe('outputs: the list and the file', () => {
  test('WRITE to the list is output, WRITE … TO is an assignment', () => {
    expect(isListOutput(one('WRITE: / lv_text.'))).toBe(true);
    expect(isListOutput(one('ULINE.'))).toBe(true);
    expect(isListOutput(one('WRITE lv_date TO lv_text.'))).toBe(false);
    expect(isListOutput(one('MOVE lv_a TO lv_b.'))).toBe(false);
  });
  test('OPEN DATASET and TRANSFER are file output; CLOSE DATASET belongs to the step before it', () => {
    expect(isFileOutput(one('OPEN DATASET lv_file FOR OUTPUT IN TEXT MODE ENCODING DEFAULT.'))).toBe(true);
    expect(isFileOutput(one('TRANSFER ls_line TO lv_file.'))).toBe(true);
    expect(isFileOutput(one('OPEN CURSOR @lv_c FOR SELECT * FROM mara.'))).toBe(false);
    expect(closesDataset(one('CLOSE DATASET lv_file.'))).toBe(true);
    expect(closesDataset(one('CLOSE CURSOR lv_c.'))).toBe(false);
  });
  test('the file a file statement works on', () => {
    expect(datasetOf(one('OPEN DATASET lv_file FOR OUTPUT IN TEXT MODE ENCODING DEFAULT.'))).toBe('LV_FILE');
    expect(datasetOf(one('TRANSFER ls_line TO gv_path.'))).toBe('GV_PATH');
    expect(datasetOf(one('CLOSE DATASET lv_file.'))).toBe('LV_FILE');
    expect(datasetOf(one('WRITE lv_x.'))).toBeNull();
  });
});

test.describe('function modules: the kind of task a CALL FUNCTION is', () => {
  test('send, user, file and service tasks by the module named', () => {
    expect(functionTaskKind('SO_NEW_DOCUMENT_SEND_API1')).toBe('send-task');
    expect(functionTaskKind('REUSE_ALV_GRID_DISPLAY')).toBe('user-task');
    expect(functionTaskKind('POPUP_TO_CONFIRM')).toBe('user-task');
    expect(functionTaskKind('F4IF_INT_TABLE_VALUE_REQUEST')).toBe('user-task');
    expect(functionTaskKind('GUI_DOWNLOAD')).toBe('output');
    expect(functionTaskKind('BAPI_SALESORDER_CREATEFROMDAT2')).toBe('service-task');
    expect(functionTaskKind(undefined)).toBe('service-task');
  });
  test('a namespace prefix does not hide the module', () => {
    expect(functionTaskKind('/ABC/POPUP_TO_CONFIRM')).toBe('user-task');
  });
  test('CALL BADI and CALL CUSTOMER-FUNCTION call an enhancement (engine 3.2.0)', () => {
    expect(ENHANCEMENT_CALL.test("CALL BADI lo_badi->check EXPORTING iv = lv.")).toBe(true);
    expect(ENHANCEMENT_CALL.test("CALL CUSTOMER-FUNCTION '001' EXPORTING iv = lv.")).toBe(true);
    expect(ENHANCEMENT_CALL.test("CALL FUNCTION 'Z_X'.")).toBe(false);
  });
});

test.describe('conventions: a FORM someone outside the source calls', () => {
  test('output control and user exits, by the opener alone', () => {
    expect(formConvention('FORM entry USING return_code us_screen.')).toBe(OUTPUT_CONTROL);
    expect(formConvention('FORM entry_neu USING ent_retco ENT_SCREEN.')).toBe(OUTPUT_CONTROL);
    expect(formConvention('FORM userexit_save_document_prepare.')).toBe(USER_EXIT);
    expect(formConvention('FORM entry USING return_code.')).toBeNull();
  });
});

test.describe('arm outcomes (engine 3.1.0): flags and collected rows', () => {
  test('a flag is one field set to one literal, number or name', () => {
    expect(FLAG_ASSIGNMENT.exec('gv_approved = abap_true.')?.slice(1, 3)).toEqual(['gv_approved', 'abap_true']);
    expect(FLAG_ASSIGNMENT.exec("ls_out-status = 'X'.")?.slice(1, 3)).toEqual(['ls_out-status', "'X'"]);
    expect(FLAG_ASSIGNMENT.exec('lv_level = zcl_c=>high.')?.[2]).toBe('zcl_c=>high');
    expect(FLAG_ASSIGNMENT.test('lv_sum = lv_a + lv_b.')).toBe(false);
    expect(FLAG_ASSIGNMENT.test('lv_x = lo->get( ).')).toBe(false);
    expect([...BUILT_IN_FLAG_VALUES].sort()).toEqual(['ABAP_FALSE', 'ABAP_TRUE', 'ABAP_UNDEFINED', 'SPACE']);
  });
  test('a row added to a table, and the table it goes into', () => {
    for (const [text, table] of [
      ['APPEND ls_line TO gt_report.', 'gt_report'],
      ['COLLECT ls_sum INTO gt_sums.', 'gt_sums'],
      ['INSERT ls_key INTO TABLE gt_keys.', 'gt_keys'],
    ] as const) {
      expect(BUILDS_TABLE.test(text), text).toBe(true);
      expect(COLLECT_TARGET.exec(text)?.[1], text).toBe(table);
    }
    expect(BUILDS_TABLE.test('MODIFY gt_report FROM ls_line.')).toBe(false);
  });
  test('a message row goes into a log, not into the result', () => {
    expect(MESSAGE_ROW.test("APPEND VALUE #( msgty = 'E' msgno = '001' ) TO gt_return.")).toBe(true);
    expect(MESSAGE_ROW.test("APPEND VALUE #( type = 'E' message = lv_text ) TO gt_return.")).toBe(true);
    expect(MESSAGE_ROW.test('APPEND VALUE #( vbeln = lv_vbeln ) TO gt_out.')).toBe(false);
  });
});

test.describe('ALV: the rows of the event table a REUSE_ALV call passes', () => {
  test('the table, its work areas and the rows typed as SLIS events', () => {
    const statements = readStatements([
      'DATA ls_event TYPE slis_alv_event.',
      'DATA lt_other TYPE STANDARD TABLE OF string.',
      "ls_event-name = 'TOP_OF_PAGE'.",
      'APPEND ls_event TO gt_events.',
      'READ TABLE gt_events INTO DATA(ls_read) INDEX 1.',
      'APPEND INITIAL LINE TO gt_events ASSIGNING FIELD-SYMBOL(<ls_new>).',
      'APPEND ls_x TO lt_other.',
    ].join('\n'));
    expect([...alvEventRows(statements, 'GT_EVENTS')].sort()).toEqual(['<LS_NEW>', 'GT_EVENTS', 'LS_EVENT', 'LS_READ']);
  });
});

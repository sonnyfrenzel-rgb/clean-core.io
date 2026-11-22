import { test, expect } from '@playwright/test';
import { lex } from '../lib/engine4/lexer';
import { statements, type Statement } from '../lib/engine4/statements';
import { allKinds, kindInfo, type StatementKind } from '../lib/engine4/statement-kinds';

/**
 * Engine 4.0, L1 (ADR-125): one test per statement kind, then period
 * boundaries, chains, macros, native SQL, ranges, and `Unknown` isolated to its
 * own statement. Server-free.
 *
 * `SAMPLES` is typed `Record<StatementKind, …>`: a new row in the kind table
 * does not compile until it has a sample here.
 */
const read = (src: string): Statement[] => statements(lex(src).tokens);

type Sample = string | readonly [source: string, index: number];

const SAMPLES: Record<StatementKind, Sample> = {
  Report: 'REPORT zfoo LINE-SIZE 120.',
  Program: 'PROGRAM zfoo.',
  FunctionPool: 'FUNCTION-POOL zfg MESSAGE-ID zz.',
  ClassPool: 'CLASS-POOL.',
  InterfacePool: 'INTERFACE-POOL.',
  TypePool: 'TYPE-POOL ztp.',
  TypePools: 'TYPE-POOLS slis.',
  IncludeType: 'INCLUDE TYPE ty_head.',
  Include: 'INCLUDE zfoo_top.',
  ClassDeferred: 'CLASS lcl_app DEFINITION DEFERRED.',
  ClassLoad: 'CLASS cl_gui_alv_grid DEFINITION LOAD.',
  ClassLocalFriends: 'CLASS zcl_order DEFINITION LOCAL FRIENDS ltc_order.',
  ClassDefinition: 'CLASS lcl_app DEFINITION FINAL CREATE PRIVATE.',
  ClassImplementation: 'CLASS lcl_app IMPLEMENTATION.',
  EndClass: 'ENDCLASS.',
  InterfaceDeferred: 'INTERFACE lif_x DEFERRED.',
  InterfaceLoad: 'INTERFACE zif_order LOAD.',
  Interface: 'INTERFACE lif_x.',
  EndInterface: 'ENDINTERFACE.',
  PublicSection: 'PUBLIC SECTION.',
  ProtectedSection: 'PROTECTED SECTION.',
  PrivateSection: 'PRIVATE SECTION.',
  Methods: 'METHODS run IMPORTING iv_id TYPE i.',
  ClassMethods: 'CLASS-METHODS create RETURNING VALUE(ro) TYPE REF TO lcl_app.',
  Events: 'EVENTS done.',
  ClassEvents: 'CLASS-EVENTS started.',
  Interfaces: 'INTERFACES zif_order.',
  Aliases: 'ALIASES run FOR zif_order~run.',
  ClassData: 'CLASS-DATA gv_count TYPE i.',
  MethodAmdp: 'METHOD get BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT.\n  et = SELECT * FROM vbak;\nENDMETHOD.',
  Method: 'METHOD zif_order~run.',
  EndMethod: 'ENDMETHOD.',
  Form: 'FORM read_orders USING pv_id TYPE i.',
  EndForm: 'ENDFORM.',
  Function: 'FUNCTION z_order_read.',
  EndFunction: 'ENDFUNCTION.',
  Module: 'MODULE status_0100 OUTPUT.',
  EndModule: 'ENDMODULE.',
  Define: 'DEFINE add_line.',
  EndOfDefinition: 'END-OF-DEFINITION.',
  EnhancementPoint: 'ENHANCEMENT-POINT ep_01 SPOTS es_order.',
  EnhancementSection: 'ENHANCEMENT-SECTION es_01 SPOTS es_order.',
  EndEnhancementSection: 'END-ENHANCEMENT-SECTION.',
  Enhancement: 'ENHANCEMENT 1 zenh_order.',
  EndEnhancement: 'ENDENHANCEMENT.',
  TestSeam: 'TEST-SEAM db_read.',
  EndTestSeam: 'END-TEST-SEAM.',
  TestInjection: 'TEST-INJECTION db_read.',
  EndTestInjection: 'END-TEST-INJECTION.',
  Initialization: 'INITIALIZATION.',
  StartOfSelection: 'START-OF-SELECTION.',
  EndOfSelection: 'END-OF-SELECTION.',
  LoadOfProgram: 'LOAD-OF-PROGRAM.',
  TopOfPage: 'TOP-OF-PAGE.',
  EndOfPage: 'END-OF-PAGE.',
  AtSelectionScreen: 'AT SELECTION-SCREEN OUTPUT.',
  AtLineSelection: 'AT LINE-SELECTION.',
  AtUserCommand: 'AT USER-COMMAND.',
  AtPf: 'AT PF13.',
  Data: 'DATA lv_count TYPE i VALUE 0.',
  Types: 'TYPES ty_ids TYPE STANDARD TABLE OF i WITH EMPTY KEY.',
  Constants: "CONSTANTS lc_mode TYPE c VALUE 'A'.",
  Statics: 'STATICS sv_calls TYPE i.',
  Parameters: 'PARAMETERS p_vkorg TYPE vkorg OBLIGATORY.',
  SelectOptions: 'SELECT-OPTIONS s_vbeln FOR vbak-vbeln.',
  SelectionScreen: 'SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME.',
  Tables: 'TABLES vbak.',
  Nodes: 'NODES pernr.',
  FieldSymbols: 'FIELD-SYMBOLS <ls_row> TYPE any.',
  Ranges: 'RANGES r_vbeln FOR vbak-vbeln.',
  FieldGroups: 'FIELD-GROUPS header.',
  Controls: 'CONTROLS tc_items TYPE TABLEVIEW USING SCREEN 0100.',
  Infotypes: 'INFOTYPES 0001.',
  Local: 'LOCAL lv_count.',
  If: 'IF lv_count = 0.',
  ElseIf: 'ELSEIF lv_count > 10.',
  Else: 'ELSE.',
  EndIf: 'ENDIF.',
  Case: 'CASE sy-ucomm.',
  When: "WHEN 'SAVE'.",
  EndCase: 'ENDCASE.',
  Loop: 'LOOP AT lt_items ASSIGNING FIELD-SYMBOL(<ls>).',
  EndLoop: 'ENDLOOP.',
  Do: 'DO 3 TIMES.',
  EndDo: 'ENDDO.',
  While: 'WHILE lv_count < 3.',
  EndWhile: 'ENDWHILE.',
  Try: 'TRY.',
  CatchSystemExceptions: 'CATCH SYSTEM-EXCEPTIONS arithmetic_errors = 4.',
  Catch: 'CATCH cx_sy_zerodivide INTO DATA(lx).',
  Cleanup: 'CLEANUP.',
  EndTry: 'ENDTRY.',
  EndCatch: 'ENDCATCH.',
  AtGroup: 'AT NEW vbeln.',
  AtFieldGroup: 'AT header.',
  EndAt: 'ENDAT.',
  OnChange: 'ON CHANGE OF ls_row-vbeln.',
  EndOn: 'ENDON.',
  Provide: 'PROVIDE FIELDS * FROM lt_p0001 INTO ls_p0001 VALID lv BOUNDS lv_b AND lv_e BETWEEN pn-begda AND pn-endda.',
  EndProvide: 'ENDPROVIDE.',
  SelectLoop: 'SELECT * FROM vbak INTO ls_vbak WHERE vkorg = p_vkorg.',
  Select: 'SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = lv_vbeln.',
  WithLoop: 'WITH +head AS ( SELECT vbeln FROM vbak ) SELECT * FROM +head INTO @DATA(ls_head).',
  With: 'WITH +head AS ( SELECT vbeln FROM vbak ) SELECT * FROM +head INTO TABLE @DATA(lt_head).',
  EndSelect: 'ENDSELECT.',
  Check: 'CHECK lv_count IS NOT INITIAL.',
  Exit: 'EXIT.',
  Continue: 'CONTINUE.',
  Return: 'RETURN.',
  Stop: 'STOP.',
  Reject: 'REJECT.',
  LeaveProgram: 'LEAVE PROGRAM.',
  LeaveToTransaction: "LEAVE TO TRANSACTION 'VA01' AND SKIP FIRST SCREEN.",
  LeaveToScreen: 'LEAVE TO SCREEN 0.',
  LeaveToListProcessing: 'LEAVE TO LIST-PROCESSING.',
  LeaveScreen: 'LEAVE SCREEN.',
  LeaveListProcessing: 'LEAVE LIST-PROCESSING.',
  Leave: 'LEAVE.',
  RaiseException: 'RAISE EXCEPTION TYPE zcx_order EXPORTING textid = zcx_order=>not_found.',
  RaiseEvent: 'RAISE EVENT done EXPORTING iv = 1.',
  RaiseEntityEvent: 'RAISE ENTITY EVENT zi_order~created FROM lt_events.',
  RaiseShortdump: 'RAISE SHORTDUMP TYPE cx_sy_illegal_handler.',
  Raise: 'RAISE not_found.',
  Resume: 'RESUME.',
  Retry: 'RETRY.',
  Assert: 'ASSERT lv_count > 0.',
  BreakPoint: 'BREAK-POINT.',
  LogPoint: 'LOG-POINT ID zorder.',
  Perform: 'PERFORM read_orders USING lv_id CHANGING lt_orders.',
  CallFunction: "CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2' EXPORTING order_header_in = ls_head.",
  CallMethod: 'CALL METHOD lo_app->run EXPORTING iv_id = 1.',
  CallTransaction: "CALL TRANSACTION 'VA02' USING lt_bdc MODE 'N'.",
  CallScreen: 'CALL SCREEN 0100 STARTING AT 10 5.',
  CallSelectionScreen: 'CALL SELECTION-SCREEN 1000.',
  CallBadi: 'CALL BADI lo_badi->check EXPORTING is_order = ls_order.',
  CallTransformation: 'CALL TRANSFORMATION id SOURCE data = ls_order RESULT XML lv_xml.',
  CallDialog: "CALL DIALOG 'Z_ORDER_DIALOG'.",
  CallCustomerFunction: "CALL CUSTOMER-FUNCTION '001' EXPORTING is_order = ls_order.",
  CallDatabaseProcedure: 'CALL DATABASE PROCEDURE zproc_orders EXPORTING iv = lv.',
  Call: "CALL 'SYSTEM' ID 'COMMAND' FIELD lv_cmd.",
  Submit: 'SUBMIT zorder_report WITH p_vkorg = lv_vkorg AND RETURN.',
  GetBadi: 'GET BADI lo_badi FILTERS land = lv_land.',
  SetHandler: 'SET HANDLER lo_app->on_click FOR lo_grid.',
  CreateObject: 'CREATE OBJECT lo_app EXPORTING iv_id = 1.',
  CreateData: 'CREATE DATA lr_row TYPE (lv_type).',
  Message: 'MESSAGE e001(zorder) WITH lv_vbeln.',
  AuthorityCheck: "AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'VKORG' FIELD lv_vkorg ID 'ACTVT' FIELD '02'.",
  Insert: 'INSERT zorder_log FROM ls_log.',
  InsertReport: 'INSERT REPORT lv_prog FROM lt_source.',
  Update: 'UPDATE zorder SET status = lv_status WHERE vbeln = lv_vbeln.',
  ModifyEntities: 'MODIFY ENTITIES OF zi_order ENTITY order UPDATE FIELDS ( status ) WITH lt_upd.',
  Modify: 'MODIFY zorder FROM ls_order.',
  DeleteDataset: 'DELETE DATASET lv_file.',
  Delete: 'DELETE lt_items WHERE posnr = 0.',
  ReadEntities: 'READ ENTITIES OF zi_order ENTITY order ALL FIELDS WITH lt_keys RESULT DATA(lt_res).',
  CommitEntities: 'COMMIT ENTITIES.',
  RollbackEntities: 'ROLLBACK ENTITIES.',
  GetPermissions: 'GET PERMISSIONS ONLY GLOBAL AUTHORIZATION ENTITY zi_order REQUEST ls_req RESULT ls_res.',
  SetLocks: 'SET LOCKS OF zi_order ENTITY order FROM lt_keys.',
  CommitWork: 'COMMIT WORK AND WAIT.',
  RollbackWork: 'ROLLBACK WORK.',
  OpenCursor: 'OPEN CURSOR WITH HOLD lv_cursor FOR SELECT * FROM vbak.',
  Fetch: 'FETCH NEXT CURSOR lv_cursor INTO TABLE lt_vbak PACKAGE SIZE 100.',
  CloseCursor: 'CLOSE CURSOR lv_cursor.',
  ExecSql: 'EXEC SQL.\n  COMMIT\nENDEXEC.',
  EndExec: ['EXEC SQL.\n  COMMIT\nENDEXEC.', 2],
  OpenDataset: 'OPEN DATASET lv_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.',
  CloseDataset: 'CLOSE DATASET lv_file.',
  ReadDataset: 'READ DATASET lv_file INTO lv_line.',
  Transfer: 'TRANSFER lv_line TO lv_file.',
  ReadTable: 'READ TABLE lt_items INTO ls_item WITH KEY posnr = 10 BINARY SEARCH.',
  ReadReport: 'READ REPORT lv_prog INTO lt_source.',
  ReadLine: 'READ LINE sy-index FIELD VALUE lv_mark.',
  Read: 'READ CURRENT LINE.',
  Append: 'APPEND ls_item TO lt_items.',
  Collect: 'COLLECT ls_sum INTO lt_sum.',
  Sort: 'SORT lt_items BY posnr DESCENDING.',
  Clear: 'CLEAR ls_item.',
  Refresh: 'REFRESH lt_items.',
  Free: 'FREE lt_items.',
  Describe: 'DESCRIBE TABLE lt_items LINES lv_lines.',
  MoveCorresponding: 'MOVE-CORRESPONDING ls_vbak TO ls_head.',
  Move: 'MOVE ls_vbak-vbeln TO lv_vbeln.',
  Assign: 'ASSIGN COMPONENT lv_name OF STRUCTURE ls_row TO <lv_field>.',
  Unassign: 'UNASSIGN <lv_field>.',
  Concatenate: 'CONCATENATE lv_a lv_b INTO lv_c SEPARATED BY space.',
  Split: "SPLIT lv_line AT ';' INTO TABLE lt_parts.",
  Condense: 'CONDENSE lv_text NO-GAPS.',
  Translate: 'TRANSLATE lv_text TO UPPER CASE.',
  Replace: "REPLACE ALL OCCURRENCES OF ',' IN lv_text WITH '.'.",
  Find: "FIND FIRST OCCURRENCE OF 'X' IN lv_text MATCH OFFSET lv_off.",
  Search: "SEARCH lv_text FOR 'X'.",
  Shift: "SHIFT lv_vbeln LEFT DELETING LEADING '0'.",
  Overlay: 'OVERLAY lv_a WITH lv_b.',
  Add: 'ADD 1 TO lv_count.',
  Subtract: 'SUBTRACT 1 FROM lv_count.',
  Multiply: 'MULTIPLY lv_amount BY 2.',
  Divide: 'DIVIDE lv_amount BY 2.',
  Compute: 'COMPUTE lv_total = lv_net + lv_tax.',
  GetReference: 'GET REFERENCE OF ls_row INTO lr_row.',
  GetTime: 'GET TIME STAMP FIELD lv_ts.',
  GetParameter: "GET PARAMETER ID 'AUN' FIELD lv_vbeln.",
  Get: 'GET CURSOR FIELD lv_field.',
  SetParameter: "SET PARAMETER ID 'AUN' FIELD lv_vbeln.",
  SetPfStatus: "SET PF-STATUS 'MAIN' EXCLUDING lt_fcodes.",
  SetTitlebar: "SET TITLEBAR 'T100' WITH lv_vbeln.",
  SetScreen: 'SET SCREEN 0.',
  SetUpdateTask: 'SET UPDATE TASK LOCAL.',
  Set: 'SET CURSOR FIELD lv_field.',
  Import: "IMPORT lt_items FROM MEMORY ID 'ZORDER'.",
  Export: "EXPORT lt_items TO MEMORY ID 'ZORDER'.",
  Wait: 'WAIT UP TO 2 SECONDS.',
  Receive: "RECEIVE RESULTS FROM FUNCTION 'Z_ORDER_ASYNC' IMPORTING ev_ok = lv_ok.",
  Convert: 'CONVERT DATE lv_date TIME lv_time INTO TIME STAMP lv_ts TIME ZONE lv_tz.',
  Pack: 'PACK lv_char TO lv_packed.',
  Unpack: 'UNPACK lv_packed TO lv_char.',
  Generate: 'GENERATE SUBROUTINE POOL lt_source NAME lv_prog.',
  SyntaxCheck: 'SYNTAX-CHECK FOR lt_source MESSAGE lv_msg LINE lv_line WORD lv_word.',
  EditorCall: 'EDITOR-CALL FOR lt_source.',
  Extract: 'EXTRACT header.',
  Sum: 'SUM.',
  Write: "WRITE: / 'Order', lv_vbeln.",
  Uline: 'ULINE.',
  Skip: 'SKIP 2.',
  NewLine: 'NEW-LINE.',
  NewPage: 'NEW-PAGE.',
  Format: 'FORMAT COLOR COL_HEADING.',
  Position: 'POSITION 10.',
  Reserve: 'RESERVE 5 LINES.',
  Hide: 'HIDE lv_vbeln.',
  Window: 'WINDOW STARTING AT 1 1 ENDING AT 40 10.',
  Scroll: 'SCROLL LIST TO FIRST PAGE.',
  SuppressDialog: 'SUPPRESS DIALOG.',
  Process: 'PROCESS BEFORE OUTPUT.',
  Chain: 'CHAIN.',
  EndChain: 'ENDCHAIN.',
  Field: 'FIELD lv_vbeln MODULE check_vbeln.',
  Assignment: 'ls_head-netwr = lo_calc->net( is_order = ls_order ) * 2.',
  MethodCall: 'lo_app->run( )->log( ).',
  MacroCall: ['DEFINE add_line.\n  APPEND &1 TO &2.\nEND-OF-DEFINITION.\nadd_line ls_item lt_items.', 3],
  NativeSql: ['EXEC SQL.\n  COMMIT\nENDEXEC.', 1],
  Unknown: 'FROBNICATE lv_count.',
};

test.describe('one test per statement kind', () => {
  test('the sample list covers every kind the table can produce', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...allKinds()].sort());
  });

  for (const [kind, sample] of Object.entries(SAMPLES) as Array<[StatementKind, Sample]>) {
    test(kind, () => {
      const [source, index] = typeof sample === 'string' ? [sample, 0] : sample;
      const list = read(source);
      expect(list[index]?.kind, `${source} → ${list.map((s) => s.kind).join(', ')}`).toBe(kind);
      // A keyword kind's keyword is the statement's first word (or its compound).
      const keyword = kindInfo(kind).keyword;
      if (keyword && kind !== 'BreakPoint' && kind !== 'Parameters') {
        expect(list[index].tokens.map((t) => t.text).join('').toUpperCase().startsWith(keyword.replace(/\s/g, ''))).toBe(true);
      }
    });
  }
});

test.describe('boundaries, chains and ranges', () => {
  test('two statements on one line are two statements; a statement over three lines is one', () => {
    const list = read(`IF a = 1. b = 2.\nIF c = 1\n  AND d = 2\n  AND e = 3.`);
    expect(list.map((s) => [s.kind, s.start.row, s.end.row])).toEqual([['If', 1, 1], ['Assignment', 1, 1], ['If', 2, 4]]);
    expect(list[2].end).toEqual({ row: 4, col: 12 });
    expect(list[2].terminator?.text).toBe('.');
  });

  test('a chain expands into one statement per part, head first, chain index kept', () => {
    const list = read(`DATA: a TYPE i,\n      b TYPE c.`);
    expect(list.map((s) => s.tokens.map((t) => t.text).join(' '))).toEqual(['DATA a TYPE i', 'DATA b TYPE c']);
    expect(list.map((s) => [s.chain?.index, s.chain?.count, s.headCount, s.start.row])).toEqual([[0, 2, 1, 1], [1, 2, 1, 2]]);
    expect(list.map((s) => s.terminator?.text)).toEqual([',', '.']);
  });

  test('the colon may stand after any part of a statement; commas in brackets do not split', () => {
    const list = read(`CALL METHOD lo->m EXPORTING: iv = x( a, b ), iv = y.`);
    expect(list.map((s) => s.tokens.map((t) => t.text).join(' '))).toEqual([
      'CALL METHOD lo -> m EXPORTING iv = x ( a , b )',
      'CALL METHOD lo -> m EXPORTING iv = y',
    ]);
  });

  test('a colon or comma inside a literal or a template is no chain', () => {
    const list = read(`lv = |a: b, c|. WRITE 'x: y, z'. IF lv = |Status: { a }|. ENDIF.`);
    expect(list.map((s) => [s.kind, s.chain])).toEqual([['Assignment', null], ['Write', null], ['If', null], ['EndIf', null]]);
  });

  test('pragmas sit beside the tokens; comments vanish', () => {
    const [s] = read(`DATA lv TYPE i ##NEEDED. " unused`);
    expect(s.tokens.map((t) => t.text)).toEqual(['DATA', 'lv', 'TYPE', 'i']);
    expect(s.pragmas.map((t) => t.text)).toEqual(['##NEEDED']);
  });

  test('a last statement without its period is kept and flagged', () => {
    const list = read(`WRITE a.\nWRITE b`);
    expect(list.map((s) => s.kind)).toEqual(['Write', 'Write']);
    expect(list[1].terminator).toBeNull();
    expect(list[1].diagnostics.map((d) => d.code)).toEqual(['missing-period']);
  });
});

test.describe('Unknown is isolated to its own statement', () => {
  test('an unknown statement between two known ones changes neither neighbour', () => {
    const plain = read(`IF a = 1.\nWRITE a.\nENDIF.`);
    const noisy = read(`IF a = 1.\nFROBNICATE a WITH: b, c.\nWRITE a.\nENDIF.`);
    expect(noisy.map((s) => s.kind)).toEqual(['If', 'Unknown', 'Unknown', 'Write', 'EndIf']);
    expect(noisy.filter((s) => s.kind !== 'Unknown').map((s) => s.tokens.map((t) => t.text).join(' '))).toEqual(
      plain.map((s) => s.tokens.map((t) => t.text).join(' ')),
    );
    expect(noisy[1].diagnostics.map((d) => d.code)).toEqual(['unknown-statement']);
  });
});

test.describe('macros and native SQL', () => {
  test('a macro body is in the macro context; a later use is a MacroCall', () => {
    const list = read(`DEFINE log.\n  WRITE &1.\n  IF &2 = 1. ENDIF.\nEND-OF-DEFINITION.\nlog 'x' 1.`);
    expect(list.map((s) => [s.kind, s.context])).toEqual([
      ['Define', 'abap'], ['Write', 'macro'], ['If', 'macro'], ['EndIf', 'macro'], ['EndOfDefinition', 'abap'], ['MacroCall', 'abap'],
    ]);
  });

  test('a macro defined in another include of the upload is passed in', () => {
    const tokens = lex(`bdc_field 'VBAK-VBELN' lv_vbeln.`).tokens;
    expect(statements(tokens)[0].kind).toBe('Unknown');
    expect(statements(tokens, { macros: ['bdc_field'] })[0].kind).toBe('MacroCall');
  });

  test('EXEC SQL … ENDEXEC: one NativeSql statement, its periods and colons are not ABAP', () => {
    const list = read(`EXEC SQL.\n  OPEN c FOR SELECT k.a, k.b FROM t k WHERE k.m = :sy-mandt\nENDEXEC.\nWRITE x.`);
    expect(list.map((s) => [s.kind, s.context, s.start.row, s.end.row])).toEqual([
      ['ExecSql', 'abap', 1, 1], ['NativeSql', 'native', 2, 2], ['EndExec', 'abap', 3, 3], ['Write', 'abap', 4, 4],
    ]);
  });

  test('an AMDP body is one NativeSql statement between its METHOD and ENDMETHOD', () => {
    const list = read(`METHOD get BY DATABASE FUNCTION FOR HDB LANGUAGE SQLSCRIPT OPTIONS READ-ONLY.\n  RETURN SELECT "A" FROM t;\n  -- done.\nENDMETHOD.`);
    expect(list.map((s) => [s.kind, s.context])).toEqual([['MethodAmdp', 'abap'], ['NativeSql', 'native'], ['EndMethod', 'abap']]);
    expect(list[1].tokens).toHaveLength(2);
  });
});

test.describe('shape before keyword', () => {
  test('inline declarations assign; method calls named like keywords are calls', () => {
    const list = read(`DATA(lv) = 1. FINAL(lt) = VALUE #( ). check( ls ). NEW lcl( )->run( ). <fs>-a = 1. lv+2(3) = 'x'. text-001 = 'a'.`);
    expect(list.map((s) => s.kind)).toEqual(['Assignment', 'Assignment', 'MethodCall', 'MethodCall', 'Assignment', 'Assignment', 'Assignment']);
  });

  test('a SELECT is a loop candidate unless SINGLE or INTO TABLE without PACKAGE SIZE', () => {
    const kinds = read(
      `SELECT * FROM t INTO ls. SELECT SINGLE * FROM t INTO ls. SELECT * FROM t INTO TABLE lt. SELECT * FROM t INTO TABLE lt PACKAGE SIZE 50. SELECT FROM t FIELDS a INTO TABLE @DATA(lt2).`,
    ).map((s) => s.kind);
    expect(kinds).toEqual(['SelectLoop', 'Select', 'Select', 'SelectLoop', 'Select']);
  });
});

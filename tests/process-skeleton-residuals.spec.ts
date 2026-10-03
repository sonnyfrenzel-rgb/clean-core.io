/**
 * Residual statements with a documented ABAP meaning that the skeleton did not
 * draw (process benchmark research of 03.10.2026, lever "residual bundle").
 * Every source here is written for this spec; none is a benchmark case.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';

const at = (source: string, line: number) =>
  buildProcessSkeleton(source).nodes.filter((n) => n.anchor?.lineStart === line).map((n) => [n.kind, n.label]);

test('RECEIVE RESULTS in the callback of an asynchronous RFC is the receiving service task', () => {
  const source = [
    'REPORT zasync_receive.', //                                                   1
    'START-OF-SELECTION.', //                                                      2
    "  CALL FUNCTION 'Z_STOCK_TASK' STARTING NEW TASK 'T1'", //                    3
    '    PERFORMING collect ON END OF TASK.', //                                   4
    '  WAIT UNTIL gv_done = abap_true.', //                                        5
    'FORM collect USING pv_task TYPE clike.', //                                   6
    "  RECEIVE RESULTS FROM FUNCTION 'Z_STOCK_TASK'", //                           7
    '    IMPORTING ev_stock = gv_stock.', //                                       8
    '  gv_done = abap_true.', //                                                   9
    'ENDFORM.', //                                                                 10
  ].join('\n');
  expect(at(source, 7)).toEqual([['service-task', 'Z_STOCK_TASK']]);
  const skeleton = buildProcessSkeleton(source);
  const receive = skeleton.nodes.find((n) => n.anchor?.lineStart === 7)!;
  expect(receive.detail?.receivesResults).toBe(true);
  // It stands in the flow of the callback, between its start and its end.
  expect(skeleton.edges.some((e) => e.to === receive.id)).toBe(true);
  expect(skeleton.edges.some((e) => e.from === receive.id)).toBe(true);
});

test('CLOSE DATASET is never a step of its own: it joins the file run of its own file right before it, else draws nothing', () => {
  const source = [
    'REPORT zfile_close.', //                                                      1
    'START-OF-SELECTION.', //                                                      2
    '  OPEN DATASET gv_path FOR OUTPUT IN TEXT MODE ENCODING DEFAULT.', //          3
    '  LOOP AT gt_lines INTO gv_line.', //                                         4
    '    TRANSFER gv_line TO gv_path.', //                                         5
    '  ENDLOOP.', //                                                               6
    '  CLOSE DATASET gv_path.', //                                                 7
    "  WRITE / 'written'.", //                                                     8
    "  TRANSFER 'END' TO gv_log.", //                                              9
    '  CLOSE DATASET gv_log.', //                                                  10
    '  CLEAR gv_line.', //                                                         11
    '  OPEN DATASET gv_in FOR INPUT IN TEXT MODE ENCODING DEFAULT.', //            12
    '  DO.', //                                                                    13
    '    READ DATASET gv_in INTO gv_line.', //                                     14
    '    IF sy-subrc <> 0.', //                                                    15
    '      EXIT.', //                                                              16
    '    ENDIF.', //                                                               17
    '  ENDDO.', //                                                                 18
    '  CLOSE DATASET gv_in.', //                                                   19
    "  TRANSFER 'X' TO gv_other.", //                                              20
    '  CLOSE DATASET gv_path.', //                                                 21
    "  WRITE / 'done'.", //                                                        22
  ].join('\n');
  const skeleton = buildProcessSkeleton(source);
  const steps = (line: number) => skeleton.nodes.filter((n) => n.anchor?.lineStart === line && n.kind !== 'end');
  // After the TRANSFER loop of an output file and after reading an input file
  // the step the CLOSE belongs to is drawn already: no "Close file" step.
  expect(steps(7)).toEqual([]);
  expect(steps(19)).toEqual([]);
  // Right behind a TRANSFER to the same file it is the same run, not a second step.
  expect(steps(10)).toEqual([]);
  const run = skeleton.nodes.find((n) => n.anchor?.lineStart === 9)!;
  expect([run.kind, run.anchor?.lineEnd, run.detail?.statements]).toEqual(['output', 10, 2]);
  // Behind a TRANSFER to another file it does not join that run either.
  expect(steps(21)).toEqual([]);
  const other = skeleton.nodes.find((n) => n.anchor?.lineStart === 20)!;
  expect([other.kind, other.anchor?.lineEnd, other.detail?.statements]).toEqual(['output', 20, 1]);
});

test('LEAVE TO SCREEN ends the dialog step: its own end, even as the last statement of a PAI module', () => {
  const source = [
    'PROGRAM zdialog_leave.', //                                                   1
    'MODULE user_command_0100 INPUT.', //                                          2
    '  CASE ok_code.', //                                                          3
    "    WHEN 'SAVE'.", //                                                         4
    '      UPDATE zorder SET done = abap_true WHERE id = gv_id.', //               5
    '      LEAVE TO SCREEN 0.', //                                                 6
    "    WHEN 'BACK'.", //                                                         7
    '      LEAVE TO SCREEN 0.', //                                                 8
    '  ENDCASE.', //                                                               9
    'ENDMODULE.', //                                                               10
    'MODULE exit_0100 INPUT.', //                                                  11
    '  gv_id = 0.', //                                                             12
    '  RETURN.', //                                                                13
    'ENDMODULE.', //                                                               14
  ].join('\n');
  const skeleton = buildProcessSkeleton(source);
  const ends = (from: number, to: number) => skeleton.nodes
    .filter((n) => n.kind === 'end' && (n.anchor?.lineStart ?? 0) >= from && (n.anchor?.lineStart ?? 0) <= to)
    .map((n) => [n.anchor?.lineStart, n.label]);
  expect(ends(2, 10)).toEqual([[10, 'user_command_0100 INPUT'], [6, 'LEAVE TO SCREEN'], [8, 'LEAVE TO SCREEN']]);
  // A RETURN with nothing drawn behind it is still the normal end (ADR-054).
  expect(ends(11, 14)).toEqual([[14, 'exit_0100 INPUT']]);
});

test('an early RETURN that skips setting a result parameter keeps its own end; one that skips nothing does not', () => {
  const source = [
    'REPORT zearly_result.', //                                                    1
    'START-OF-SELECTION.', //                                                      2
    '  PERFORM check_order CHANGING gv_ok.', //                                    3
    '  NEW lcl_price( )->net( ).', //                                              4
    'FORM check_order CHANGING cv_ok TYPE abap_bool.', //                          5
    '  SELECT SINGLE vbeln FROM vbak INTO gv_vbeln WHERE vbeln = gv_id.', //       6
    '  IF gv_vbeln IS INITIAL.', //                                                7
    '    RETURN.', //                                                              8
    '  ENDIF.', //                                                                 9
    '  cv_ok = abap_true.', //                                                     10
    'ENDFORM.', //                                                                 11
    'CLASS lcl_price DEFINITION.', //                                              12
    '  PUBLIC SECTION.', //                                                        13
    '    METHODS net RETURNING VALUE(rv_net) TYPE netwr.', //                      14
    'ENDCLASS.', //                                                                15
    'CLASS lcl_price IMPLEMENTATION.', //                                          16
    '  METHOD net.', //                                                            17
    '    SELECT SINGLE netwr FROM vbak INTO gv_net WHERE vbeln = gv_id.', //       18
    '    IF gv_net IS INITIAL.', //                                                19
    '      RETURN.', //                                                            20
    '    ENDIF.', //                                                               21
    '    rv_net = gv_net * 2.', //                                                 22
    '    IF gv_net > 100.', //                                                     23
    '      RETURN.', //                                                            24
    '    ENDIF.', //                                                               25
    '    gv_log = gv_net.', //                                                     26
    '  ENDMETHOD.', //                                                             27
    'ENDCLASS.', //                                                                28
  ].join('\n');
  const skeleton = buildProcessSkeleton(source);
  const early = skeleton.nodes.filter((n) => n.kind === 'end' && n.detail?.early === true)
    .map((n) => n.anchor?.lineStart);
  // Line 8 skips `cv_ok = abap_true` (CHANGING), line 20 skips `rv_net = …`
  // (RETURNING). Line 24 skips only a global: still the normal end (ADR-054).
  expect(early).toEqual([8, 20]);
});

test('an AMDP method body is database code: one native statement, one read step of its USING tables', () => {
  const source = [
    'REPORT zamdp_usage.', //                                                      1
    'CLASS lcl_db DEFINITION.', //                                                 2
    '  PUBLIC SECTION.', //                                                        3
    '    INTERFACES if_amdp_marker_hdb.', //                                       4
    '    CLASS-METHODS totals EXPORTING VALUE(et_sum) TYPE tt_sum.', //            5
    '    CLASS-METHODS rank IMPORTING VALUE(it_sum) TYPE tt_sum', //               6
    '                       EXPORTING VALUE(et_rank) TYPE tt_sum.', //             7
    'ENDCLASS.', //                                                                8
    'CLASS lcl_db IMPLEMENTATION.', //                                             9
    '  METHOD totals BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT', //          10
    '                OPTIONS READ-ONLY USING vbap.', //                            11
    '    et_sum = SELECT vbeln, SUM( netwr ) AS netwr FROM vbap', //               12
    '             WHERE "VBAP".mandt = SESSION_CONTEXT( \'CLIENT\' ) GROUP BY vbeln;', // 13
    '  ENDMETHOD.', //                                                             14
    '  METHOD rank BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT OPTIONS READ-ONLY.', // 15
    '    et_rank = SELECT * FROM :it_sum ORDER BY netwr DESC;', //                 16
    '  ENDMETHOD.', //                                                             17
    'ENDCLASS.', //                                                                18
    'START-OF-SELECTION.', //                                                      19
    '  lcl_db=>totals( IMPORTING et_sum = gt_sum ).', //                           20
    '  lcl_db=>rank( EXPORTING it_sum = gt_sum IMPORTING et_rank = gt_rank ).', // 21
  ].join('\n');
  const skeleton = buildProcessSkeleton(source);
  // The first ENDMETHOD closes the first method: the second is a method of its own.
  const bodies = skeleton.nodes.filter((n) => n.detail?.amdp === true)
    .map((n) => [n.kind, n.label, n.anchor?.lineStart, n.anchor?.lineEnd]);
  expect(bodies).toEqual([['read', 'VBAP', 12, 13], ['service-task', 'RANK', 16, 16]]);
  // Neither is a technical helper folded away; both calls are drawn as steps.
  expect(skeleton.notDrawn.technicalHelpers).toEqual([]);
  expect(skeleton.nodes.filter((n) => (n.anchor?.lineStart === 20 || n.anchor?.lineStart === 21) && n.kind !== 'end')
    .map((n) => [n.anchor?.lineStart, n.kind])).toEqual([[20, 'read'], [21, 'service-task']]);
});

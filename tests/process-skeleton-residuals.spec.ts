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

test('CLOSE DATASET completes the file: a file step, joined to a TRANSFER right before it', () => {
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
  ].join('\n');
  const skeleton = buildProcessSkeleton(source);
  const close = skeleton.nodes.find((n) => n.anchor?.lineStart === 7);
  expect([close?.kind, close?.detail?.target]).toEqual(['output', 'file']);
  // Right behind a TRANSFER it is the same run of file output, not a second step.
  expect(skeleton.nodes.filter((n) => n.anchor?.lineStart === 10 && n.kind !== 'end')).toEqual([]);
  const run = skeleton.nodes.find((n) => n.anchor?.lineStart === 9)!;
  expect([run.kind, run.anchor?.lineEnd, run.detail?.statements]).toEqual(['output', 10, 2]);
});

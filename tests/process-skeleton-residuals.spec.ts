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

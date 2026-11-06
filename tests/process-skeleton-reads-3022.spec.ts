/**
 * The process-quality readings of engine 3.0.22 (`ENGINE_READS_3022_FROM`), each behind the version gate: a run
 * of an older engine draws exactly the map it drew before. Every source here is written for this spec; none is a
 * benchmark case.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { buildProcessSkeleton, skeletonReadFor } from '../lib/abap/process-skeleton';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { ENGINE_READS_3022_FROM } from '../lib/abap/engine-reads-3022-gate';

const NEW = { engineVersion: ENGINE_READS_3022_FROM };
const OLD = { engineVersion: '3.0.21' };

const APPROVAL = [
  'REPORT zflag_outcome.', //                                                    1
  'DATA: gv_approved TYPE abap_bool,', //                                         2
  '      gv_text     TYPE string.', //                                            3
  'START-OF-SELECTION.', //                                                       4
  '  IF p_amount > 1000.', //                                                     5
  '    PERFORM ask_manager.', //                                                  6
  '  ELSE.', //                                                                   7
  '    gv_approved = abap_true.', //                                              8
  "    gv_text = 'Approved below the limit'.", //                                 9
  '  ENDIF.', //                                                                  10
  '  IF gv_approved = abap_true.', //                                             11
  '    PERFORM create_order.', //                                                 12
  '  ENDIF.', //                                                                  13
  'FORM ask_manager.', //                                                         14
  "  CALL FUNCTION 'Z_ASK_MANAGER'.", //                                          15
  'ENDFORM.', //                                                                  16
  'FORM create_order.', //                                                        17
  "  CALL FUNCTION 'BAPI_PO_CREATE1'.", //                                        18
  'ENDFORM.', //                                                                  19
].join('\n');

test('an arm that only sets a flag a later decision reads is a step of that decision', () => {
  const skeleton = buildProcessSkeleton(APPROVAL, NEW);
  const step = skeleton.nodes.find((n) => n.anchor?.lineStart === 8)!;
  expect(step.kind).toBe('task');
  expect(step.label).toBe('gv_approved = abap_true');
  expect(step.detail).toMatchObject({ flagStep: true, flag: 'GV_APPROVED', value: 'abap_true', readAtLines: ['11'] });
  // The program's own words of the same arm travel with it, for a view to say the outcome in.
  expect(step.detail?.programTexts).toEqual(['Approved below the limit']);
  // The ELSE leads into the step, and the step on to the decision that reads the flag.
  const gateway = skeleton.nodes.find((n) => n.kind === 'gateway' && n.anchor?.lineStart === 5)!;
  const later = skeleton.nodes.find((n) => n.kind === 'gateway' && n.anchor?.lineStart === 11)!;
  expect(skeleton.edges.some((e) => e.from === gateway.id && e.to === step.id && e.kind === 'default')).toBe(true);
  expect(skeleton.edges.some((e) => e.from === step.id && e.to === later.id)).toBe(true);
});

test('an older engine keeps the empty way past the decision', () => {
  const skeleton = buildProcessSkeleton(APPROVAL, OLD);
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 8)).toBe(false);
  const gateway = skeleton.nodes.find((n) => n.kind === 'gateway' && n.anchor?.lineStart === 5)!;
  const later = skeleton.nodes.find((n) => n.kind === 'gateway' && n.anchor?.lineStart === 11)!;
  expect(skeleton.edges.some((e) => e.from === gateway.id && e.to === later.id && e.kind === 'default')).toBe(true);
});

test('no flag step where nothing reads the field, where the value is computed or copied, or where the arm draws a step', () => {
  const source = [
    'REPORT zflag_not.', //                                                       1
    'START-OF-SELECTION.', //                                                     2
    '  IF p_a > 1.', //                                                           3
    "    gv_note = 'nobody reads this'.", //                                      4
    '  ENDIF.', //                                                                5
    '  IF p_b > 1.', //                                                           6
    '    gv_sum = gv_sum + 1.', //                                                7
    '  ENDIF.', //                                                                8
    '  IF p_c > 1.', //                                                           9
    '    gv_copy = p_amount.', //                                                 10
    '  ENDIF.', //                                                                11
    '  IF p_d > 1.', //                                                           12
    '    gv_flag = abap_true.', //                                                13
    "    CALL FUNCTION 'Z_STEP'.", //                                             14
    '  ENDIF.', //                                                                15
    '  IF gv_sum > 2 AND gv_copy > 0 AND gv_flag = abap_true.', //              16
    "    CALL FUNCTION 'Z_DONE'.", //                                             17
    '  ENDIF.', //                                                                18
  ].join('\n');
  const skeleton = buildProcessSkeleton(source, NEW);
  for (const line of [4, 7, 10, 13]) expect(skeleton.nodes.some((n) => n.anchor?.lineStart === line), `line ${line}`).toBe(false);
  expect(skeleton.nodes.filter((n) => n.detail?.flagStep === true)).toHaveLength(0);
});

test('a constant of the source is a flag value; a decision table stays one classification', () => {
  const source = [
    'REPORT zflag_const.', //                                                     1
    "CONSTANTS gc_rush TYPE c VALUE 'R'.", //                                     2
    'START-OF-SELECTION.', //                                                     3
    '  IF p_days < 2.', //                                                        4
    '    gv_mode = gc_rush.', //                                                  5
    '  ELSE.', //                                                                 6
    "    CALL FUNCTION 'Z_PLAN'.", //                                             7
    '  ENDIF.', //                                                                8
    '  CHECK gv_mode = gc_rush.', //                                              9
    "  CALL FUNCTION 'Z_EXPRESS'.", //                                            10
    '  CASE p_kind.', //                                                          11
    "    WHEN 'A'. gv_class = '1'.", //                                           12
    "    WHEN 'B'. gv_class = '2'.", //                                           13
    "    WHEN OTHERS. gv_class = '3'.", //                                        14
    '  ENDCASE.', //                                                              15
    "  IF gv_class = '1'.", //                                                    16
    "    CALL FUNCTION 'Z_FIRST'.", //                                            17
    '  ENDIF.', //                                                                18
  ].join('\n');
  const skeleton = buildProcessSkeleton(source, NEW);
  expect(skeleton.nodes.find((n) => n.anchor?.lineStart === 5)?.detail).toMatchObject({ flagStep: true, flag: 'GV_MODE', value: 'gc_rush' });
  for (const line of [12, 13, 14]) expect(skeleton.nodes.some((n) => n.kind === 'task' && n.anchor?.lineStart === line)).toBe(false);
  expect(skeleton.nodes.find((n) => n.kind === 'gateway' && n.anchor?.lineStart === 11)?.detail?.decisionTable).toBe('gv_class');
});

test('a skeleton read for this release is rebuilt for the engine of an older run, and reused for its own', () => {
  const facts = buildProcessFacts(APPROVAL);
  const current = buildProcessSkeleton(APPROVAL, NEW);
  expect(skeletonReadFor(current, facts, ENGINE_READS_3022_FROM)).toBe(current);
  const older = skeletonReadFor(current, facts, '3.0.21');
  expect(older).not.toBe(current);
  expect(JSON.stringify(older)).toBe(JSON.stringify(buildProcessSkeleton(APPROVAL, OLD)));
});

const RENTS = [
  'REPORT zbuild_table.', //                                                     1
  'START-OF-SELECTION.', //                                                      2
  "  SELECT * FROM zcontract INTO TABLE gt_contracts WHERE active = 'X'.", //    3
  '  PERFORM compute_rents.', //                                                 4
  "  PERFORM add_note USING 'I'.", //                                            5
  "  CALL FUNCTION 'Z_POST_RENTS' TABLES it_rents = gt_rents.", //               6
  'FORM compute_rents.', //                                                      7
  '  LOOP AT gt_contracts INTO gs_contract.', //                                 8
  '    IF gs_contract-index_rent = abap_false.', //                              9
  '      CONTINUE.', //                                                          10
  '    ENDIF.', //                                                               11
  '    gs_rent-new = gs_contract-rent * gv_factor.', //                          12
  '    APPEND gs_rent TO gt_rents.', //                                          13
  '  ENDLOOP.', //                                                               14
  'ENDFORM.', //                                                                 15
  'FORM add_note USING pv_level TYPE c.', //                                     16
  "  gs_note-text = 'run finished'.", //                                         17
  '  APPEND gs_note TO gt_notes.', //                                            18
  "  IF pv_level = 'W'.", //                                                    19
  '    ADD 1 TO gv_warnings.', //                                                20
  '  ENDIF.', //                                                                 21
  'ENDFORM.', //                                                                 22
].join('\n');

test('a routine that builds a table while it decides or iterates is a step, not a technical helper', () => {
  const skeleton = buildProcessSkeleton(RENTS, NEW);
  const call = skeleton.nodes.find((n) => n.anchor?.lineStart === 4)!;
  expect(call.kind).toBe('sub-process');
  expect(call.detail?.effects).toEqual(['compute']);
  // Its decisions are drawn on its own level.
  expect(skeleton.nodes.some((n) => n.kind === 'gateway' && n.anchor?.lineStart === 9)).toBe(true);
  expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).not.toContain('COMPUTE_RENTS');
  // A routine that appends its one row beside a branch (a log helper counting warnings) builds nothing by
  // deciding: still folded into its caller.
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 5)).toBe(false);
  expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).toContain('ADD_NOTE');
});

test('an older engine keeps such a routine folded into its caller', () => {
  const skeleton = buildProcessSkeleton(RENTS, OLD);
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 4)).toBe(false);
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 9)).toBe(false);
  expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).toContain('COMPUTE_RENTS');
});

const ORDERS = [
  'REPORT zloop_level.', //                                                      1
  'START-OF-SELECTION.', //                                                      2
  '  SELECT * FROM vbak INTO TABLE gt_orders UP TO 50 ROWS.', //                 3
  '  LOOP AT gt_orders INTO gs_order.', //                                       4
  "    IF gs_order-lifsk = 'Z1'.", //                                            5
  "      CALL FUNCTION 'Z_RELEASE_BLOCK' EXPORTING iv_vbeln = gs_order-vbeln.", // 6
  '    ENDIF.', //                                                               7
  '  ENDLOOP.', //                                                               8
  '  LOOP AT gt_orders INTO gs_order.', //                                       9
  '    gv_sum = gv_sum + gs_order-netwr.', //                                    10
  '  ENDLOOP.', //                                                               11
].join('\n');

test('a loop level begins at a start event of its own on the LOOP line', () => {
  const skeleton = buildProcessSkeleton(ORDERS, NEW);
  const loop = skeleton.nodes.find((n) => n.kind === 'loop' && n.anchor?.lineStart === 4)!;
  const region = skeleton.regions.find((r) => r.key === loop.expandsTo)!;
  const start = skeleton.nodes.find((n) => n.kind === 'start' && n.region === region.key)!;
  expect(start.anchor?.lineStart).toBe(4);
  expect(start.detail).toMatchObject({ subProcess: true, loopLevel: true });
  expect(region.entryNodeId).toBe(start.id);
  const first = skeleton.nodes.find((n) => n.kind === 'gateway' && n.anchor?.lineStart === 5)!;
  expect(skeleton.edges.some((e) => e.from === start.id && e.to === first.id)).toBe(true);
  // A body that draws nothing has no plane, so no start either; and no loop start counts as a process start.
  expect(skeleton.nodes.filter((n) => n.kind === 'start' && n.anchor?.lineStart === 9)).toHaveLength(0);
  expect(skeleton.nodes.filter((n) => n.kind === 'start' && n.detail?.subProcess !== true)).toHaveLength(1);
});

test('an older engine draws the loop level without a start', () => {
  const skeleton = buildProcessSkeleton(ORDERS, OLD);
  const loop = skeleton.nodes.find((n) => n.kind === 'loop' && n.anchor?.lineStart === 4)!;
  expect(skeleton.nodes.some((n) => n.kind === 'start' && n.region === loop.expandsTo)).toBe(false);
});

const CHECKS = [
  'REPORT zarm_helper.', //                                                      1
  'START-OF-SELECTION.', //                                                      2
  '  PERFORM check_customer.', //                                                3
  "  CALL FUNCTION 'Z_SHOW_ISSUES' TABLES it_issues = gt_issues.", //           4
  'FORM check_customer.', //                                                     5
  "  SELECT SINGLE * FROM t005 INTO gs_t005 WHERE land1 = p_land1.", //          6
  '  IF gs_t005-xegld = abap_true AND p_stceg IS INITIAL.', //                   7
  "    PERFORM add_issue USING 'E' 'VAT number missing in the EU'.", //         8
  '  ENDIF.', //                                                                 9
  '  IF strlen( p_pstlz ) <> gs_t005-lnplz.', //                                 10
  "    PERFORM add_issue USING 'E' 'Postal code has the wrong length'.", //     11
  '    RETURN.', //                                                              12
  '  ENDIF.', //                                                                 13
  '  IF p_kunnr IS INITIAL.', //                                                 14
  "    PERFORM add_issue USING 'W' 'No customer number yet'.", //               15
  "    CALL FUNCTION 'Z_NEXT_NUMBER' IMPORTING ev_kunnr = p_kunnr.", //          16
  '  ENDIF.', //                                                                 17
  "  CALL FUNCTION 'Z_SAVE_CUSTOMER' EXPORTING iv_kunnr = p_kunnr.", //          18
  'ENDFORM.', //                                                                 19
  'FORM add_issue USING pv_type TYPE c pv_text TYPE c.', //                      20
  '  gs_issue-type = pv_type.', //                                               21
  '  gs_issue-text = pv_text.', //                                               22
  '  APPEND gs_issue TO gt_issues.', //                                          23
  'ENDFORM.', //                                                                 24
].join('\n');

test('a call of a technical helper is the outcome of an arm that draws no step of its own', () => {
  const skeleton = buildProcessSkeleton(CHECKS, NEW);
  const step = skeleton.nodes.find((n) => n.anchor?.lineStart === 8)!;
  expect(step.kind).toBe('task');
  expect(step.label).toBe('ADD_ISSUE');
  expect(step.detail).toMatchObject({ helperCall: true, routine: 'ADD_ISSUE', programTexts: ['VAT number missing in the EU'] });
  expect(step.anchor?.secondary).toMatchObject({ lineStart: 20, lineEnd: 24, reason: 'routine-definition' });
  const gateway = skeleton.nodes.find((n) => n.kind === 'gateway' && n.anchor?.lineStart === 7)!;
  expect(skeleton.edges.some((e) => e.from === gateway.id && e.to === step.id && e.kind === 'conditional')).toBe(true);
  // Before an early end: the decision leads to the helper's step, and the step to the end.
  const before = skeleton.nodes.find((n) => n.anchor?.lineStart === 11)!;
  const end = skeleton.nodes.find((n) => n.kind === 'end' && n.anchor?.lineStart === 12)!;
  expect(before.detail?.helperCall).toBe(true);
  expect(skeleton.edges.some((e) => e.from === before.id && e.to === end.id)).toBe(true);
  // An arm with a step of its own says what it does through that step: no helper step beside it.
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 15)).toBe(false);
  expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).toContain('ADD_ISSUE');
});

test('an older engine leaves the helper folded, and both ways out of the decision run to the same step', () => {
  const skeleton = buildProcessSkeleton(CHECKS, OLD);
  for (const line of [8, 11]) expect(skeleton.nodes.some((n) => n.anchor?.lineStart === line)).toBe(false);
});

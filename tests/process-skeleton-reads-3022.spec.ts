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
  '  PERFORM add_note.', //                                                      5
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
  'FORM add_note.', //                                                           16
  "  gs_note-text = 'run finished'.", //                                         17
  '  APPEND gs_note TO gt_notes.', //                                            18
  'ENDFORM.', //                                                                 19
].join('\n');

test('a routine that builds a table while it decides or iterates is a step, not a technical helper', () => {
  const skeleton = buildProcessSkeleton(RENTS, NEW);
  const call = skeleton.nodes.find((n) => n.anchor?.lineStart === 4)!;
  expect(call.kind).toBe('sub-process');
  expect(call.detail?.effects).toEqual(['compute']);
  // Its decisions are drawn on its own level.
  expect(skeleton.nodes.some((n) => n.kind === 'gateway' && n.anchor?.lineStart === 9)).toBe(true);
  expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).not.toContain('COMPUTE_RENTS');
  // A routine that only appends one row decides nothing: still folded into its caller.
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 5)).toBe(false);
  expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).toContain('ADD_NOTE');
});

test('an older engine keeps such a routine folded into its caller', () => {
  const skeleton = buildProcessSkeleton(RENTS, OLD);
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 4)).toBe(false);
  expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 9)).toBe(false);
  expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).toContain('COMPUTE_RENTS');
});

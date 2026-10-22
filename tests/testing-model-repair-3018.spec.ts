import { test, expect } from '@playwright/test';
import {
  MAX_MODEL_REPAIR_METHODS,
  MODEL_RED_IN_SAP,
  mergeRepairedModelMethods,
  modelTestRepairRequest,
  splitSapUnitRun,
  type SapUnitMethod,
} from '../lib/testing-abap-unit';

/**
 * Roadmap 3.0.18 item 13: the model-written ABAP Unit class against a real ABAP Unit run. The PM trial of 18.10.2026
 * ran 4 red methods, all of the testing model's class `ltcl_test`, all with wrong preconditions — the engine's case of
 * the same check was green. Owner decision C(7): the model's class is a proposal, not evidence. So (1) a red method of
 * it reads "AI-generated, red in SAP: <message>" and is never counted as passed nor with the engine's classes, and
 * (2) the one bounded repair round takes exactly the red methods SAP named, with SAP's message, and changes nothing
 * else. Server-free.
 */

const SUITE = [
  'CLASS ltcl_test DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
  '  PRIVATE SECTION.',
  '    METHODS tc_01_slot_fits FOR TESTING.',
  '    METHODS tc_02_overlap FOR TESTING.',
  '    METHODS tc_03_no_crew FOR TESTING.',
  'ENDCLASS.',
  '',
  'CLASS ltcl_test IMPLEMENTATION.',
  '  METHOD tc_01_slot_fits.',
  '    cl_abap_unit_assert=>assert_equals( act = 1 exp = 1 ).',
  '  ENDMETHOD.',
  '  METHOD tc_02_overlap.',
  "    cl_abap_unit_assert=>assert_equals( act = 0 exp = 2 msg = 'overlap' ).",
  '  ENDMETHOD.',
  '  METHOD tc_03_no_crew.',
  "    cl_abap_unit_assert=>assert_equals( act = 0 exp = 1 msg = 'crew' ).",
  '  ENDMETHOD.',
  'ENDCLASS.',
  '',
].join('\n');

const RUN: SapUnitMethod[] = [
  { testClass: 'LTC_ENGINE_CASES', method: 'TC_ENG_G12', outcome: 'passed', message: null },
  { testClass: 'LTC_GOLDEN_MASTER', method: 'CASE_01', outcome: 'skipped', message: 'not compared' },
  { testClass: 'LTCL_TEST', method: 'TC_01_SLOT_FITS', outcome: 'passed', message: null },
  { testClass: 'LTCL_TEST', method: 'TC_02_OVERLAP', outcome: 'failed', message: 'Expected [2] Actual [0]' },
  { testClass: 'LTCL_TEST', method: 'TC_03_NO_CREW', outcome: 'failed', message: 'Expected [1] Actual [0]' },
  // A method SAP reports that the suite does not implement (another include): not the model's to repair here.
  { testClass: 'LTCL_OTHER', method: 'TC_09', outcome: 'failed', message: 'x' },
];

test('a red method of the model\'s class is a proposal, red in SAP — never passed, never with the engine\'s counts', () => {
  const s = splitSapUnitRun(RUN);
  expect(s.engine).toEqual({ passed: 1, failed: 0, skipped: 1 });
  expect(s.model).toEqual({ passed: 1, failed: 3, skipped: 0 });
  expect(s.red).toEqual([
    `${MODEL_RED_IN_SAP}: ltcl_test=>tc_02_overlap — Expected [2] Actual [0]`,
    `${MODEL_RED_IN_SAP}: ltcl_test=>tc_03_no_crew — Expected [1] Actual [0]`,
    `${MODEL_RED_IN_SAP}: ltcl_other=>tc_09 — x`,
  ]);
  // An engine method that fails is red in its own words: it is evidence.
  expect(splitSapUnitRun([{ testClass: 'ltc_engine_cases', method: 'tc_eng_1', outcome: 'failed', message: 'boom' }]).red).toEqual(['ltc_engine_cases=>tc_eng_1 — boom']);
});

test('the repair request names exactly the red methods of the model\'s class the suite implements, with SAP\'s message', () => {
  const r = modelTestRepairRequest(SUITE, RUN)!;
  expect(r.methods).toEqual([
    { testClass: 'ltcl_test', method: 'tc_02_overlap', message: 'Expected [2] Actual [0]' },
    { testClass: 'ltcl_test', method: 'tc_03_no_crew', message: 'Expected [1] Actual [0]' },
  ]);
  expect(r.prompt).toContain('- ltcl_test=>tc_02_overlap: Expected [2] Actual [0]');
  expect(r.prompt).toContain('Rewrite exactly these methods');
  expect(r.prompt).not.toContain('tc_01_slot_fits');
  expect(r.prompt).not.toContain('tc_eng');
  // Nothing red of the model's: no round.
  expect(modelTestRepairRequest(SUITE, RUN.filter((m) => m.outcome !== 'failed'))).toBeNull();
  expect(modelTestRepairRequest(SUITE, [{ testClass: 'ltc_golden_master', method: 'case_01', outcome: 'failed', message: 'x' }])).toBeNull();
  // Bounded: at most MAX_MODEL_REPAIR_METHODS methods in the one round.
  const many = Array.from({ length: 20 }, (_, i) => `    METHODS tc_${i} FOR TESTING.`);
  const bodies = Array.from({ length: 20 }, (_, i) => [`  METHOD tc_${i}.`, '  ENDMETHOD.']).flat();
  const big = ['CLASS ltcl_test DEFINITION FOR TESTING.', '  PRIVATE SECTION.', ...many, 'ENDCLASS.', 'CLASS ltcl_test IMPLEMENTATION.', ...bodies, 'ENDCLASS.'].join('\n');
  const reds = Array.from({ length: 20 }, (_, i): SapUnitMethod => ({ testClass: 'ltcl_test', method: `tc_${i}`, outcome: 'failed', message: 'm' }));
  expect(modelTestRepairRequest(big, reds)!.methods).toHaveLength(MAX_MODEL_REPAIR_METHODS);
});

test('the answer changes only the methods SAP named; anything else it holds is refused, a method it leaves out stays', () => {
  const r = modelTestRepairRequest(SUITE, RUN)!;
  const answer = [
    'METHOD tc_02_overlap.',
    '    DATA(lo_cut) = NEW zcl_pm_logic( io_access = NEW ltd_access( ) ).',
    "    cl_abap_unit_assert=>assert_equals( act = lo_cut->overlaps( ) exp = 2 msg = 'overlap' ).",
    '  ENDMETHOD.',
    'METHOD tc_01_slot_fits.',
    '    " the model also rewrote a green method',
    '  ENDMETHOD.',
  ].join('\n');
  const m = mergeRepairedModelMethods(SUITE, answer, r);
  expect(m.replaced).toEqual(['ltcl_test=>tc_02_overlap']);
  expect(m.refused).toEqual([
    { method: 'tc_01_slot_fits', reason: 'not one of the methods SAP named red: the suite keeps its version' },
    { method: 'tc_03_no_crew', reason: 'not answered: the method stays as it was, red in SAP' },
  ]);
  expect(m.code).toContain('lo_cut->overlaps( )');
  expect(m.code).toContain('  METHOD tc_02_overlap.');
  expect(m.code).not.toContain('the model also rewrote a green method');
  // Everything outside the replaced method is byte for byte what it was.
  const before = SUITE.split('  METHOD tc_02_overlap.');
  expect(m.code.startsWith(before[0])).toBe(true);
  expect(m.code.endsWith(SUITE.slice(SUITE.indexOf('  METHOD tc_03_no_crew.')))).toBe(true);
});

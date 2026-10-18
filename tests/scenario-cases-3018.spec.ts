import { test, expect } from '@playwright/test';
import { compareScenario, scenarioCases, type DemoCaseSummary } from '../scripts/acceptance/scenario-cases';

/**
 * The acceptance suite's scenario judging (`scripts/acceptance/scenario-cases.ts`), three carried QA findings of
 * 3.0.18. Pure: data in, verdicts out.
 */

type Ran = Extract<DemoCaseSummary, { state: 'ran' }>;
const ran = (over: Partial<Ran> = {}): Ran => ({ state: 'ran', complete: true, notFilled: [], refused: false, rows: [], result: {}, issues: [], local: {}, ...over });

test('a case-switch input of null, empty text or a boolean names no demo case (QA 958d07e8b2ff)', () => {
  const demo = { switch: { parameter: 'P_CASE' }, cases: [{ number: 0 }, { number: 1 }, { number: 7 }] };
  const scenario = (id: string, value: unknown) => ({ id, group: 'probe', expectedForm: 'machine' as const, input: { p_case: value } });
  const matched = scenarioCases([
    scenario('S-null', null),
    scenario('S-empty', ''),
    scenario('S-false', false),
    scenario('S-true', true),
    scenario('S-seven', 7),
    scenario('S-seven-text', '7'),
  ], demo);
  expect(Object.fromEntries(matched)).toEqual({ 'S-seven': 7, 'S-seven-text': 7 });
});

test('a reference scenario whose case switch is invalid does not fall back on its ID (QA 9b82fb010d1e)', () => {
  const demo = { switch: { parameter: 'P_CASE' }, cases: [{ number: 0 }, { number: 1 }, { number: 7 }] };
  const ref = (id: string, input?: Record<string, unknown>) => ({ id, group: 'reference', expectedForm: 'machine' as const, ...(input ? { input } : {}) });
  const matched = scenarioCases([
    ref('CASE-00', { p_case: null }),
    ref('CASE-01', { p_case: '' }),
    ref('CASE-07', { p_case: 7 }),
    // No switch in the input: the ID still names the case.
    ref('case_01', { amount: 1 }),
    ref('7'),
  ], demo);
  expect(Object.fromEntries(matched)).toEqual({ 'CASE-07': 7, case_01: 1, '7': 7 });
});

test('expected messages are counted: ["A", "A"] is not met by ["A", "B"] (QA d791179ee1b0)', () => {
  expect(compareScenario({ issues: ['A', 'A'] }, ran({ issues: ['A', 'B'] })).verdict).toBe('fail');
  expect(compareScenario({ issues: ['A', 'B'] }, ran({ issues: ['B', 'A'] })).verdict).toBe('pass');
  expect(compareScenario({ issues: ['A', 'A'] }, ran({ issues: ['A', 'A'] })).verdict).toBe('pass');
});

test('an empty list is compared, and so is a list of values (QA 1c24cdfb94f8)', () => {
  expect(compareScenario({ rows: [] }, ran({ rows: [] })).verdict).toBe('pass');
  expect(compareScenario({ rows: [] }, ran({ rows: [{ a: 1 }] })).verdict).toBe('fail');
  expect(compareScenario({ codes: [] }, ran({ result: { codes: [] } })).verdict).toBe('pass');
  expect(compareScenario({ codes: ['01', 2] }, ran({ result: { codes: ['01', 2] } })).verdict).toBe('pass');
  expect(compareScenario({ codes: ['01', 2] }, ran({ result: { codes: ['01', 3] } })).verdict).toBe('fail');
  // A list the output does not have is not found: not judged, never a pass.
  expect(compareScenario({ codes: [] }, ran()).verdict).toBe('not-judged');
});

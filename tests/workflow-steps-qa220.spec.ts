import { test, expect } from '@playwright/test';
import { testRunSubject, TEST_RUN_RECEIPT_VERSION } from '../lib/test-receipt';
import { testEvidence, workflowSteps } from '../lib/workflow-steps';
import type { Project } from '../lib/types';

/**
 * QA full review of v2.20.0, the phase contract in lib/workflow-steps.ts:
 *
 * - 4e49cde623e9: `generatedCode: '[]'` — a package with no files — marked
 *   Transformation generated.
 * - b6ba1d6a54a4: a `Failed` status the owner wrote showed a `Failures` badge
 *   and "n failed", as though a run had reported it.
 * - 61dbe9f45276: a signed run alone was described as a cost estimate.
 */

const byKey = (p: Project) => Object.fromEntries(workflowSteps(p).map((s) => [s.key, s]));

const PACKAGE = JSON.stringify([{ path: 'srv/service.ts', content: 'export const total = () => 1;' }]);

function project(extra: Partial<Project> = {}): Project {
  return {
    name: 'QA 220',
    legacyCode: 'REPORT zqa.',
    activeRunId: 'run-1',
    generatedCode: PACKAGE,
    testSuite: { code: 'test("a", () => {});' },
    ...extra,
  } as unknown as Project;
}

test('a package with no files is not generated code; one file, or a flat legacy source, is', () => {
  expect(byKey(project({ generatedCode: '[]' })).transformation.state).toBe('empty');
  expect(byKey(project({ generatedCode: ' [ ] ' })).transformation.state).toBe('empty');
  expect(byKey(project({ generatedCode: PACKAGE })).transformation.state).toBe('done');
  expect(byKey(project({ generatedCode: 'CLASS zcl_legacy DEFINITION. ENDCLASS.' })).transformation.state).toBe('done');
});

test('a failure only on the case list is self-reported; a failure a covering run reported is a failure', () => {
  const testCases = [
    { id: 'TC_01', status: 'Passed' },
    { id: 'TC_02', status: 'Failed' },
  ] as unknown as Project['testCases'];

  const selfReported = byKey(project({ testCases }));
  expect(testEvidence(project({ testCases })).attestedFailures).toBe(0);
  expect(selfReported.testing.badge).toBe('Self-reported');
  expect(selfReported.testing.detail).toContain('1 marked as failed with no test run on record');
  expect(selfReported.testing.detail).not.toMatch(/\b1 failed\b/);

  const base = project({ testCases });
  const subject = testRunSubject(base as Parameters<typeof testRunSubject>[0]);
  const receipt = {
    v: TEST_RUN_RECEIPT_VERSION,
    ...subject,
    environment: 'mock',
    scope: { selected: null, cases: 2 },
    stubs: [],
    executedAt: '2026-09-30T08:00:00.000Z',
    executedBy: 'uid-1',
    exitCode: 1,
    verdicts: [
      { id: 'TC_01', status: 'Passed' },
      { id: 'TC_02', status: 'Failed' },
    ],
  };
  const recorded = { ...base, testRunReceipt: receipt } as unknown as Project;
  expect(testEvidence(recorded).attestedFailures).toBe(1);
  expect(byKey(recorded).testing.badge).toBe('Failures');
  expect(byKey(recorded).testing.detail).toContain('1 failed');
});

test('a signed run is described as the baseline, not as an estimate', () => {
  const tco = byKey(project()).tco;
  expect(tco.detail).not.toMatch(/^A model estimate/);
  expect(tco.detail).toContain('The signed run is the baseline');
});

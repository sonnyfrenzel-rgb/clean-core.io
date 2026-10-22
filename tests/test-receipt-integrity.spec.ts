import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { applyRunnerVerdicts, resolveVerdicts, type TestRunResult } from '../lib/test-verdicts';
import {
  executedPasses,
  isTestRunReceipt,
  OWNER_EDITED_SUITE_NOTE,
  suiteOriginDigest,
  suiteOriginOf,
  testSuiteOriginRecord,
  TEST_RUN_RECEIPT_VERSION,
  TEST_SUITE_ORIGIN_FIELD,
  type TestRunReceipt,
} from '../lib/test-receipt';
import { sha256Hex } from '../lib/artefact-digest';

/**
 * CA-INT-01 — a test receipt counts what it shows, and says whether the suite
 * that ran is the one the server stored. The channel half (TAP the suite
 * cannot forge) is in `tests/test-sandbox-core.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function receipt(verdicts: TestRunReceipt['verdicts'], extra: Partial<TestRunReceipt> = {}): TestRunReceipt {
  return {
    v: TEST_RUN_RECEIPT_VERSION, runId: 'r', codeDigest: 'c', suiteDigest: 's', casesDigest: 'k', environment: 'mock',
    scope: { selected: null, cases: 2 }, stubs: [], executedAt: '2026-10-22T10:00:00.000Z', executedBy: 'u', exitCode: 1,
    verdicts, ...extra,
  };
}

test.describe('one rule for an id reported twice', () => {
  test('the worse report wins, in either order, for storing and for counting alike', () => {
    for (const verdicts of <TestRunReceipt['verdicts'][]>[
      [{ id: 'TC1', status: 'Failed' as const }, { id: 'TC1', status: 'Passed' as const }],
      [{ id: 'TC1', status: 'Passed' as const }, { id: 'TC1', status: 'Failed' as const }],
      [{ id: 'TC1', status: 'Passed' as const }, { id: 'TC1', status: 'Skipped' as const }],
      [{ id: 'TC1', status: 'Todo' as const }, { id: 'TC1', status: 'Passed' as const }],
    ]) {
      expect(executedPasses(receipt(verdicts), ['TC1']), JSON.stringify(verdicts)).toBe(0);
      const stored = applyRunnerVerdicts([{ id: 'TC1' }], verdicts.map((v) => ({ ...v, name: v.id })) as TestRunResult[], 1);
      expect(stored[0].status, JSON.stringify(verdicts)).not.toBe('Passed');
      expect(resolveVerdicts(verdicts).get('TC1')!.status).not.toBe('Passed');
    }
    expect(executedPasses(receipt([{ id: 'TC1', status: 'Passed' }, { id: 'TC1', status: 'Passed' }]), ['TC1'])).toBe(1);
  });
});

test.describe('where the suite came from', () => {
  const suite = { code: "test('TC1', () => {});" };

  test('a run of exactly the stored generated or verified suite names its origin', () => {
    const generation = testSuiteOriginRecord('generation', suite)!;
    expect(generation.suiteDigest).toBe(sha256Hex(suite.code));
    expect(suiteOriginOf(generation, suite.code)).toBe('generation');
    expect(suiteOriginOf(testSuiteOriginRecord('model', suite), suite.code)).toBe('model');
  });

  test('everything else is owner-edited', () => {
    expect(suiteOriginOf(undefined, suite.code)).toBe('owner-edited');
    expect(suiteOriginOf(testSuiteOriginRecord('unverified', suite), suite.code)).toBe('owner-edited');
    expect(suiteOriginOf(testSuiteOriginRecord('model', suite), `${suite.code}\n// changed`)).toBe('owner-edited');
    expect(suiteOriginOf({ kind: 'model', suiteDigest: 42 }, suite.code)).toBe('owner-edited');
    expect(suiteOriginOf(testSuiteOriginRecord('model', suite), '')).toBe('owner-edited');
  });

  test('the digest follows the source the runner executes: code, else spec', () => {
    expect(suiteOriginDigest({ code: '', spec: 'S' })).toBe(sha256Hex('S'));
    expect(suiteOriginDigest({ code: 'C', spec: 'S' })).toBe(sha256Hex('C'));
    expect(suiteOriginDigest({})).toBeNull();
  });

  test('a receipt may carry the origin; an unknown value is not a receipt', () => {
    expect(isTestRunReceipt(receipt([], { suiteOrigin: 'owner-edited' }))).toBe(true);
    expect(isTestRunReceipt(receipt([]))).toBe(true);
    expect(isTestRunReceipt({ ...receipt([]), suiteOrigin: 'engine' })).toBe(false);
  });

  test('the stores record the origin, the run reads it, and the views say so', () => {
    expect(read('lib/project-artefact-writes.ts')).toContain("[TEST_SUITE_ORIGIN_FIELD]: testSuiteOriginRecord(args.aiModel ? 'model' : 'unverified', testSuite)");
    expect(read('app/api/projects/[projectId]/contract/route.ts')).toContain("[TEST_SUITE_ORIGIN_FIELD]: testSuiteOriginRecord('generation', checked.testSuite)");
    expect(read('app/api/run-tests/route.ts')).toContain('suiteOrigin: suiteOriginOf(projectData[TEST_SUITE_ORIGIN_FIELD], testCode)');
    expect(read('lib/workflow-steps.ts')).toContain('tests.suiteEditedByOwner ? ` ${OWNER_EDITED_SUITE_NOTE}`');
    expect(read('app/(app)/project/[projectId]/testing/page.tsx')).toContain('{OWNER_EDITED_SUITE_NOTE}');
    expect(OWNER_EDITED_SUITE_NOTE).toMatch(/^Suite edited by the owner/);
    // Server-written only: the client allowlist of firestore.rules does not name it.
    expect(read('firestore.rules')).not.toContain(TEST_SUITE_ORIGIN_FIELD);
  });
});

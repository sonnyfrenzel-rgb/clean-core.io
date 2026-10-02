/**
 * Codex code-runner-02 — the Execution facet of the workspace status line.
 *
 * Every recorded run is a sandbox run against mocks (`TestRunReceipt.environment`
 * is `mock`), and the Testing and Handover views call it *Demonstrated · mock*.
 * The workspace called the same run *Proven*, because it only knew the
 * `Simulated` path to the mock chip. Pure: no browser, no emulator.
 */
import { test, expect } from '@playwright/test';
import { workspaceStatusLine } from '../lib/workspace-model';
import { workflowSteps } from '../lib/workflow-steps';
import type { Project } from '../lib/types';
import { receiptFor } from './helpers/test-receipt';

function project(over: Record<string, unknown> = {}): Project {
  const base: Record<string, unknown> = {
    id: 'p-exec',
    name: 'Execution chip',
    userId: 'u1',
    activeRunId: 'run-1',
    legacyCode: 'REPORT z.',
    generatedCode: 'export const sum = (a: number, b: number) => a + b;',
    testSuite: { code: "import { test } from 'node:test';\ntest('TC_01: adds', () => {});" },
    testCases: [
      { id: 'TC_01', title: 'adds', status: 'Passed' },
      { id: 'TC_02', title: 'adds again', status: 'Passed' },
    ],
    ...over,
  };
  base.testRunReceipt = receiptFor(base);
  return base as unknown as Project;
}

const execution = (p: Project) => workspaceStatusLine(p).find((s) => s.facet === 'execution')!;

test('a passing recorded run reads Demonstrated · mock, never Proven', () => {
  const p = project();
  const testing = workflowSteps(p).find((s) => s.key === 'testing')!;
  // Not vacuous: this is the run the phase contract counts as a recorded pass.
  expect(testing.state).toBe('done');
  expect(testing.proven).toBe(true);
  expect(execution(p).provenance).toBe('demonstrated-mock');
});

test('a recorded run with a failure still names the mock', () => {
  const p = project({
    testCases: [
      { id: 'TC_01', title: 'adds', status: 'Passed' },
      { id: 'TC_02', title: 'adds again', status: 'Failed' },
    ],
  });
  expect(execution(p)).toMatchObject({ status: 'failed', provenance: 'demonstrated-mock' });
});

test('without a receipt there is no execution chip at all', () => {
  const p = project();
  delete (p as unknown as Record<string, unknown>).testRunReceipt;
  expect(execution(p).provenance).toBeNull();
});

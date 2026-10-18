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

/*
 * Roadmap 3.0.9 (QA full review aad42f51c028). `testCases[].status` is in the
 * client allowlist of `firestore.rules`, and nothing writes `Simulated` any more
 * — only old data or a direct browser write carry it. It named a mock execution
 * (*mock only*, *Demonstrated · mock*, "N simulated") that no server ever saw.
 */
test.describe('a client-written `Simulated` names no execution', () => {
  const simulatedOnly = () => {
    const p = project({
      testCases: [
        { id: 'TC_01', title: 'adds', status: 'Simulated' },
        { id: 'TC_02', title: 'adds again', status: 'Simulated' },
      ],
    });
    delete (p as unknown as Record<string, unknown>).testRunReceipt;
    return p;
  };

  test('without a server record: no mock-only status, no mock chip, no simulation in the detail', () => {
    const p = simulatedOnly();
    const exec = execution(p);
    expect(exec.status).not.toBe('mock-only');
    expect(exec.status).toBe('partial');
    expect(exec.provenance).toBeNull();
    expect(exec.detail).not.toMatch(/simulat/i);

    const testing = workflowSteps(p).find((s) => s.key === 'testing')!;
    expect(testing).toMatchObject({ state: 'partial', badge: 'Test draft', proven: false });
    expect(testing.mock).toBeFalsy();
    expect(testing.detail).toContain('no test run on record');
    expect(testing.detail).not.toMatch(/simulat/i);
  });

  test('beside an executed verdict a stored `Simulated` counts as not run', () => {
    const p = project({
      testCases: [
        { id: 'TC_01', title: 'adds', status: 'Passed' },
        { id: 'TC_02', title: 'adds again', status: 'Simulated' },
      ],
    });
    delete (p as unknown as Record<string, unknown>).testRunReceipt;
    const testing = workflowSteps(p).find((s) => s.key === 'testing')!;
    expect(testing.detail).toContain('1 not run');
    expect(testing.detail).not.toMatch(/simulat/i);
    expect(execution(p).provenance).toBeNull();
  });

  test('with the server record: the recorded mock run carries the mock chip', () => {
    // Same stored strings, plus the receipt `/api/run-tests` writes with the
    // Admin SDK: the chip now rests on the server's record, not on the string.
    const p = simulatedOnly();
    (p as unknown as Record<string, unknown>).testRunReceipt = receiptFor(p as unknown as Record<string, unknown>, [
      { id: 'TC_01', status: 'Passed' },
      { id: 'TC_02', status: 'Passed' },
    ]);
    expect(execution(p).provenance).toBe('demonstrated-mock');
    expect(execution(p).status).not.toBe('mock-only');
  });
});

/*
 * Roadmap row "the failed execution status no longer read from a client-writable
 * field" (found 11.10.2026 while fixing aad42f51c028). A stored `Failed` is the
 * same client-writable string as `Simulated`: on its own it named a failed
 * execution no server saw. The status now reads the phase's `runFailed`.
 */
test.describe('a client-written `Failed` names no failed execution', () => {
  const marked = [
    { id: 'TC_01', title: 'adds', status: 'Passed' },
    { id: 'TC_02', title: 'adds again', status: 'Failed' },
  ];

  test('without a receipt the case list alone does not make Execution failed', () => {
    const p = project({ testCases: marked });
    delete (p as unknown as Record<string, unknown>).testRunReceipt;
    const testing = workflowSteps(p).find((s) => s.key === 'testing')!;
    // Not vacuous: the phase reads the label as the owner's, not as a run.
    expect(testing.badge).toBe('Self-reported');
    expect(testing.runFailed).toBeFalsy();
    expect(execution(p).status).not.toBe('failed');
  });

  test('a receipt that passed both cases outranks a stored `Failed`', () => {
    const p = project({ testCases: marked });
    (p as unknown as Record<string, unknown>).testRunReceipt = receiptFor(p as unknown as Record<string, unknown>, [
      { id: 'TC_01', status: 'Passed' },
      { id: 'TC_02', status: 'Passed' },
    ]);
    expect(execution(p).status).not.toBe('failed');
  });

  test('a failure the receipt reports still reads failed', () => {
    const p = project({ testCases: marked });
    expect(workflowSteps(p).find((s) => s.key === 'testing')!.runFailed).toBe(true);
    expect(execution(p).status).toBe('failed');
  });
});

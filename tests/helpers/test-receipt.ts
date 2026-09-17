import { TEST_RUN_RECEIPT_VERSION, testRunSubject, type TestRunReceipt } from '../../lib/test-receipt';

/**
 * The receipt `/api/run-tests` would have written for this project.
 *
 * Fixtures that mean "the suite ran and every case passed" need one since the QA
 * full review of a19945ef01dc: `testCases[].status` is client-writable, so it is
 * no longer read as an execution. This builds the server's side of that fact
 * from the fixture itself, which keeps the two in step — change the generated
 * code in a fixture and the receipt follows it instead of silently retiring.
 *
 * `verdicts` is deliberately per case and explicit: a helper that passed every
 * id whatever the fixture said would be the same shortcut one level up.
 */
export function receiptFor(
  project: {
    activeRunId?: unknown;
    generatedCode?: unknown;
    testSuite?: unknown;
    testCases?: unknown;
  },
  verdicts?: Array<{ id: string; status: TestRunReceipt['verdicts'][number]['status'] }>,
): TestRunReceipt {
  const subject = testRunSubject(project);
  const ids = (Array.isArray(project.testCases) ? project.testCases : []).map((t) =>
    String((t as { id?: unknown })?.id ?? ''),
  );
  return {
    v: TEST_RUN_RECEIPT_VERSION,
    ...subject,
    environment: 'mock',
    executedAt: '2026-09-17T10:00:00.000Z',
    executedBy: 'fixture-uid',
    exitCode: 0,
    verdicts: verdicts ?? ids.map((id) => ({ id, status: 'Passed' as const })),
  };
}

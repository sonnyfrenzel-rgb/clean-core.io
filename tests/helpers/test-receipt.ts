import { TEST_RUN_RECEIPT_VERSION, testRunSubject, type TestRunReceipt, type TestRunVerdict } from '../../lib/test-receipt';

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
 *
 * `scope` and `stubs` arrived with receipt version 2 (roadmap 7.3). The default
 * is the honest one for a fixture: the whole suite was asked for (`selected:
 * null`) and no package was replaced. A fixture that means something else passes
 * it in — it is not defaulted away anywhere a test reasons about it.
 */
const VERDICTS: ReadonlySet<string> = new Set<TestRunVerdict>(['Passed', 'Failed', 'Not run', 'Skipped', 'Todo', 'Error']);

/**
 * Without `verdicts`, a case the fixture gives a runner verdict (`Failed`,
 * `Skipped`, …) keeps it. It used to be `Passed` for every id whatever the
 * fixture said — the shortcut the paragraph above rules out — so a fixture with
 * a failed case produced an all-green receipt (QA full review of fc787674705f,
 * 7e83cba6af12). A case that states no runner verdict at all (no status, or
 * `Simulated`, which is the browser's word and not a runner's) is the "the suite
 * ran and every case passed" fixture this helper exists for, and stays `Passed`.
 */
function verdictsOf(testCases: unknown): TestRunReceipt['verdicts'] {
  return (Array.isArray(testCases) ? testCases : []).map((t) => {
    const { id, status } = (t ?? {}) as { id?: unknown; status?: unknown };
    const stated = typeof status === 'string' && VERDICTS.has(status) ? (status as TestRunVerdict) : 'Passed';
    return { id: String(id ?? ''), status: stated };
  });
}

export function receiptFor(
  project: {
    activeRunId?: unknown;
    generatedCode?: unknown;
    testSuite?: unknown;
    testCases?: unknown;
  },
  verdicts?: Array<{ id: string; status: TestRunReceipt['verdicts'][number]['status'] }>,
  over?: Partial<Pick<TestRunReceipt, 'scope' | 'stubs' | 'environment' | 'exitCode'>>,
): TestRunReceipt {
  const subject = testRunSubject(project);
  const ids = (Array.isArray(project.testCases) ? project.testCases : []).map((t) =>
    String((t as { id?: unknown })?.id ?? ''),
  );
  return {
    v: TEST_RUN_RECEIPT_VERSION,
    ...subject,
    environment: 'mock',
    scope: { selected: null, cases: ids.length },
    stubs: [],
    executedAt: '2026-09-17T10:00:00.000Z',
    executedBy: 'fixture-uid',
    exitCode: 0,
    verdicts: verdicts ?? verdictsOf(project.testCases),
    ...over,
  };
}

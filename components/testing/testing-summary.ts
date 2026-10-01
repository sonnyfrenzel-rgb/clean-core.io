import { coveringTestRunReceipt, isTestRunReceipt } from '@/lib/test-receipt';

/**
 * Where testing stands, read from what the project and this session hold.
 *
 * Pure and without React, so the sentence at the top of the Testing stage and
 * the "Last run" cards in both tabs say the same thing — and so a spec can run
 * it without a browser.
 *
 * Nothing here is inferred. A run counts as recorded only when the project
 * carries a receipt that still covers its code, suite and case list
 * (`coveringTestRunReceipt`); a receipt for earlier inputs is reported as
 * exactly that; a run in this session that came back without a receipt is
 * reported as not recorded. A verdict other than Passed or Failed is "without a
 * result" — never folded into either.
 */

export interface RunCounts {
  passed: number;
  failed: number;
  /** Not run, skipped, todo, simulated, error — anything that is not a verdict. */
  noResult: number;
  total: number;
}

export function countVerdicts(statuses: ReadonlyArray<string | undefined>): RunCounts {
  const passed = statuses.filter((s) => s === 'Passed').length;
  const failed = statuses.filter((s) => s === 'Failed').length;
  return { passed, failed, noResult: statuses.length - passed - failed, total: statuses.length };
}

export type LastRun =
  /** A server receipt that still covers what is on the project. */
  | { kind: 'recorded'; at: string; counts: RunCounts }
  /** Ran in this session, and no receipt covers it. */
  | { kind: 'session'; counts: RunCounts }
  /** A receipt is on the project, for code or a suite that has since changed. */
  | { kind: 'earlier'; at: string }
  | { kind: 'none' };

export function lastRun(
  project: Parameters<typeof coveringTestRunReceipt>[0],
  sessionResults: ReadonlyArray<{ status?: string }> | null,
): LastRun {
  const receipt = coveringTestRunReceipt(project);
  if (receipt) {
    return { kind: 'recorded', at: receipt.executedAt, counts: countVerdicts(receipt.verdicts.map((v) => v.status)) };
  }
  if (sessionResults && sessionResults.length > 0) {
    return { kind: 'session', counts: countVerdicts(sessionResults.map((r) => r.status)) };
  }
  const stored = project?.testRunReceipt;
  if (isTestRunReceipt(stored)) return { kind: 'earlier', at: stored.executedAt };
  return { kind: 'none' };
}

/** "12 passed · 2 failed · 1 without a result" — the zero buckets past the first two left out. */
export function countsLine(c: RunCounts): string {
  const parts = [`${c.passed} passed`, `${c.failed} failed`];
  if (c.noResult > 0) parts.push(`${c.noResult} without a result`);
  return parts.join(' · ');
}

export const scenarios = (n: number) => `${n} ${n === 1 ? 'scenario' : 'scenarios'}`;

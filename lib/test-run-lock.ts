import { randomBytes } from 'node:crypto';

/**
 * One test run per account at a time, and a daily budget of runner seconds
 * (SEC-04).
 *
 * The isolated runner serves one execution per instance on a few instances,
 * shared by every account. The per-minute rate limit of `/api/run-tests`
 * bounded how often an account could start a run, not how many it held at
 * once: parallel requests from one account could occupy every instance, and
 * nobody else could test. Now an account holds at most one run — across all
 * app instances, through one Firestore document per account written only by
 * the Admin SDK — and spends at most `RUNNER_SECONDS_PER_DAY` seconds of runner
 * time per UTC day.
 *
 * The lock expires on its own after `TEST_RUN_LOCK_TTL_MS`, longer than any
 * run can take (three passes of at most 15 s plus bundling and transport), so
 * an instance that dies mid-run does not lock its account out.
 *
 * `test_run_locks/{uid}` holds the current run's random id, when it started,
 * when the lock lapses, the UTC day and the seconds used that day — no content.
 * It is deleted with the account.
 */

export const TEST_RUN_LOCK_COLLECTION = 'test_run_locks';
export const TEST_RUN_LOCK_TTL_MS = 3 * 60 * 1000;
export const DEFAULT_RUNNER_SECONDS_PER_DAY = 1_800;
const MAX_CONFIGURABLE_SECONDS = 86_400;

export const TEST_RUN_BUSY_CODE = 'test-run-in-progress';
export const RUNNER_BUDGET_CODE = 'runner-seconds-exhausted';

export const TEST_RUN_BUSY_MESSAGE = 'A test run of this account is still in progress. Wait for it to finish, then run again.';
export function runnerBudgetMessage(seconds: number): string {
  return `This account has used its ${Math.round(seconds / 60)} minutes of test-runner time for today. It renews at midnight UTC.`;
}

/** The budget in force: `RUNNER_SECONDS_PER_DAY` when it is a sane whole number, else the default. */
export function runnerSecondsPerDay(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RUNNER_SECONDS_PER_DAY?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_RUNNER_SECONDS_PER_DAY;
  const n = Number(raw);
  return n >= 1 && n <= MAX_CONFIGURABLE_SECONDS ? n : DEFAULT_RUNNER_SECONDS_PER_DAY;
}

export interface TestRunLockState {
  runId?: unknown;
  startedAt?: unknown;
  lockedUntil?: unknown;
  day?: unknown;
  secondsUsed?: unknown;
}

/** Pure: may a new run start, given the stored state? */
export function lockDecision(
  stored: TestRunLockState | undefined,
  now: Date,
  budgetSeconds: number,
): { ok: true; secondsUsed: number } | { ok: false; code: typeof TEST_RUN_BUSY_CODE | typeof RUNNER_BUDGET_CODE } {
  const day = now.toISOString().slice(0, 10);
  const lockedUntil = typeof stored?.lockedUntil === 'number' ? stored.lockedUntil : 0;
  if (typeof stored?.runId === 'string' && stored.runId && lockedUntil > now.getTime()) {
    return { ok: false, code: TEST_RUN_BUSY_CODE };
  }
  const used = stored?.day === day && typeof stored.secondsUsed === 'number' && Number.isFinite(stored.secondsUsed) ? stored.secondsUsed : 0;
  if (used >= budgetSeconds) return { ok: false, code: RUNNER_BUDGET_CODE };
  return { ok: true, secondsUsed: used };
}

/** The minimal Firestore surface this needs, so a test can hand in a stand-in. */
export interface LockStore {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(fn: (tx: {
    get(ref: unknown): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    set(ref: unknown, data: Record<string, unknown>): unknown;
  }) => Promise<T>): Promise<T>;
}

export interface HeldTestRunLock {
  uid: string;
  runId: string;
  startedAt: number;
}

/** Take the account's run slot, or say why not. */
export async function acquireTestRunLock(
  db: LockStore,
  uid: string,
  opts: { now?: Date; budgetSeconds?: number } = {},
): Promise<{ ok: true; lock: HeldTestRunLock } | { ok: false; code: typeof TEST_RUN_BUSY_CODE | typeof RUNNER_BUDGET_CODE; budgetSeconds: number }> {
  const now = opts.now ?? new Date();
  const budgetSeconds = opts.budgetSeconds ?? runnerSecondsPerDay();
  const ref = db.collection(TEST_RUN_LOCK_COLLECTION).doc(uid);
  const runId = randomBytes(12).toString('hex');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const decision = lockDecision(snap.exists ? snap.data() : undefined, now, budgetSeconds);
    if (!decision.ok) return { ok: false as const, code: decision.code, budgetSeconds };
    tx.set(ref, {
      runId,
      startedAt: now.getTime(),
      lockedUntil: now.getTime() + TEST_RUN_LOCK_TTL_MS,
      day: now.toISOString().slice(0, 10),
      secondsUsed: decision.secondsUsed,
    });
    return { ok: true as const, lock: { uid, runId, startedAt: now.getTime() } };
  });
}

/**
 * Give the slot back and charge the seconds the run held it. Only the run
 * that holds the lock releases it; a lock that lapsed and was taken by a later
 * run is left alone (its seconds are still charged to the day).
 */
export async function releaseTestRunLock(db: LockStore, lock: HeldTestRunLock, now: Date = new Date()): Promise<void> {
  const ref = db.collection(TEST_RUN_LOCK_COLLECTION).doc(lock.uid);
  const seconds = Math.max(1, Math.ceil((now.getTime() - lock.startedAt) / 1000));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Gone: the account was erased while the run was out. Not recreated.
    if (!snap.exists) return;
    const d = snap.data() ?? {};
    const day = now.toISOString().slice(0, 10);
    const used = d.day === day && typeof d.secondsUsed === 'number' ? d.secondsUsed : 0;
    const holds = d.runId === lock.runId;
    tx.set(ref, {
      runId: holds ? null : d.runId ?? null,
      startedAt: holds ? null : d.startedAt ?? null,
      lockedUntil: holds ? 0 : d.lockedUntil ?? 0,
      day,
      secondsUsed: used + seconds,
    });
  });
}

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  acquireTestRunLock,
  DEFAULT_RUNNER_SECONDS_PER_DAY,
  lockDecision,
  releaseTestRunLock,
  runnerSecondsPerDay,
  RUNNER_BUDGET_CODE,
  TEST_RUN_BUSY_CODE,
  TEST_RUN_LOCK_TTL_MS,
  type LockStore,
} from '../lib/test-run-lock';

/**
 * SEC-04 — one test run per account at a time, across instances, and a daily
 * budget of runner seconds.
 */
const ROOT = path.resolve(__dirname, '..');

/** An in-memory stand-in with transactions applied in order, as Firestore serialises them per document. */
function memoryStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const store: LockStore = {
    collection: (name) => ({ doc: (id) => `${name}/${id}` }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({ exists: docs.has(ref as string), data: () => docs.get(ref as string) }),
      set: (ref, data) => { docs.set(ref as string, data); },
    }),
  };
  return { store, docs };
}

test('a second run of the same account is refused while the first holds the slot; another account is not', async () => {
  const { store } = memoryStore();
  const now = new Date('2026-10-22T10:00:00Z');
  const first = await acquireTestRunLock(store, 'u1', { now, budgetSeconds: 600 });
  expect(first.ok).toBe(true);
  const second = await acquireTestRunLock(store, 'u1', { now: new Date(now.getTime() + 5_000), budgetSeconds: 600 });
  expect(second).toMatchObject({ ok: false, code: TEST_RUN_BUSY_CODE });
  expect((await acquireTestRunLock(store, 'u2', { now, budgetSeconds: 600 })).ok).toBe(true);
  // Given back: the next run may start, and the seconds were charged.
  if (!first.ok) return;
  await releaseTestRunLock(store, first.lock, new Date(now.getTime() + 12_000));
  const third = await acquireTestRunLock(store, 'u1', { now: new Date(now.getTime() + 13_000), budgetSeconds: 600 });
  expect(third.ok).toBe(true);
});

test('a slot an instance never gave back lapses on its own', async () => {
  const { store } = memoryStore();
  const now = new Date('2026-10-22T10:00:00Z');
  expect((await acquireTestRunLock(store, 'u1', { now, budgetSeconds: 600 })).ok).toBe(true);
  const later = new Date(now.getTime() + TEST_RUN_LOCK_TTL_MS + 1);
  expect((await acquireTestRunLock(store, 'u1', { now: later, budgetSeconds: 600 })).ok).toBe(true);
});

test('the day\'s runner seconds, once spent, refuse the next run until the next UTC day', async () => {
  const { store, docs } = memoryStore();
  const now = new Date('2026-10-22T10:00:00Z');
  const run = await acquireTestRunLock(store, 'u1', { now, budgetSeconds: 30 });
  if (!run.ok) throw new Error('first run refused');
  await releaseTestRunLock(store, run.lock, new Date(now.getTime() + 31_000));
  expect(docs.get('test_run_locks/u1')!.secondsUsed).toBe(31);
  expect(await acquireTestRunLock(store, 'u1', { now: new Date(now.getTime() + 40_000), budgetSeconds: 30 })).toMatchObject({ ok: false, code: RUNNER_BUDGET_CODE });
  expect((await acquireTestRunLock(store, 'u1', { now: new Date('2026-10-23T00:00:05Z'), budgetSeconds: 30 })).ok).toBe(true);
});

test('a lapsed lock taken over by a later run is not released by the earlier one', async () => {
  const { store, docs } = memoryStore();
  const t0 = new Date('2026-10-22T10:00:00Z');
  const early = await acquireTestRunLock(store, 'u1', { now: t0, budgetSeconds: 6000 });
  const t1 = new Date(t0.getTime() + TEST_RUN_LOCK_TTL_MS + 1);
  const late = await acquireTestRunLock(store, 'u1', { now: t1, budgetSeconds: 6000 });
  if (!early.ok || !late.ok) throw new Error('setup');
  await releaseTestRunLock(store, early.lock, new Date(t1.getTime() + 1000));
  expect(docs.get('test_run_locks/u1')!.runId, 'the earlier run freed the later run\'s slot').toBe(late.lock.runId);
});

test('a release after the account was erased does not recreate its document', async () => {
  const { store, docs } = memoryStore();
  const run = await acquireTestRunLock(store, 'u1', { budgetSeconds: 600 });
  if (!run.ok) throw new Error('setup');
  docs.clear();
  await releaseTestRunLock(store, run.lock);
  expect(docs.size).toBe(0);
});

test('the budget comes from the environment when it is a sane whole number, else the default', () => {
  expect(runnerSecondsPerDay({})).toBe(DEFAULT_RUNNER_SECONDS_PER_DAY);
  expect(runnerSecondsPerDay({ RUNNER_SECONDS_PER_DAY: '600' })).toBe(600);
  for (const bad of ['0', 'x', '-5', '999999']) expect(runnerSecondsPerDay({ RUNNER_SECONDS_PER_DAY: bad }), bad).toBe(DEFAULT_RUNNER_SECONDS_PER_DAY);
  expect(lockDecision(undefined, new Date(), 10)).toEqual({ ok: true, secondsUsed: 0 });
});

test('every runner path of /api/run-tests takes the slot first and gives it back in finally; the erasure deletes it', () => {
  const route = fs.readFileSync(path.join(ROOT, 'app/api/run-tests/route.ts'), 'utf8');
  expect(route.match(/const slot = await takeRunSlot\(decodedToken\.uid\);/g) ?? []).toHaveLength(3);
  expect(route.match(/activeRuns\+\+;/g) ?? []).toHaveLength(3);
  // Given back wherever the instance counter is: in each finally, and on the capacity refusal.
  expect(route.match(/activeRuns--;\n\s+await giveBackRunSlot\(slot\.lock\);/g) ?? []).toHaveLength(3);
  expect(route.match(/await giveBackRunSlot\(slot\.lock\);\n\s+return NextResponse\.json\(\n\s+\{ output: '', error: 'The test runner is at capacity/g) ?? []).toHaveLength(3);
  const admin = fs.readFileSync(path.join(ROOT, 'lib/firebase-admin.ts'), 'utf8');
  expect(admin.match(/tryDelete\('test_run_locks'/g) ?? []).toHaveLength(2);
});

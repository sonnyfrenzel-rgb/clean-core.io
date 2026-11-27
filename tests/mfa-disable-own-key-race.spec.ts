import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  BYOK_MFA_ENROLMENT_REQUIRED,
  MFA_REMOVAL_MARKER,
  MFA_REMOVAL_MARKER_TTL_MS,
  OWN_KEY_BLOCKS_MFA_REMOVAL,
  MFA_REMOVAL_ALREADY_RUNNING,
  OWN_KEY_SAVE_DURING_MFA_REMOVAL,
  mfaRemovalBlockedByOwnKey,
  mfaRemovalInProgress,
  ownKeySaveRefusal,
} from '../lib/mfa-gate';
import { releaseFactorRemoval, reserveFactorRemoval, retireSecondFactor, type MfaRetireDeps } from '../lib/mfa-disable';

/**
 * Turning the factor off and storing an own model key at the same time.
 *
 * POST /api/mfa/disable checked for a stored key and then removed the factor; the key save checked the factor at its
 * start and stored the key after a provider test that takes seconds. A save that passed its check before the removal
 * and stored after the key check left a key on an account without a factor. The removal now reserves itself on the
 * profile in the same transaction that checks for a key, and the save re-decides inside its own transaction on that
 * profile, so one of the two is always refused.
 *
 * The profile is one in-memory document, and the transaction double runs its callbacks one at a time, which is what
 * Firestore's transactions on one document guarantee.
 */
const UID = 'uid-under-test';
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

function world(initial: Record<string, unknown>, factors = 1) {
  const state = { profile: { ...initial } as Record<string, unknown>, factors, writes: 0 };
  const DELETE = Symbol('delete');
  const apply = (data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v === DELETE) delete state.profile[k];
      else state.profile[k] = v;
    }
    state.writes += 1;
  };
  let queue: Promise<unknown> = Promise.resolve();
  const ref = { id: UID, set: async (data: Record<string, unknown>) => apply(data) };
  const db = {
    runTransaction: <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = queue.then(async () => {
        const buffered: Record<string, unknown>[] = [];
        const tx = {
          get: async () => ({ exists: true, data: () => ({ ...state.profile }) }),
          set: (_ref: unknown, data: Record<string, unknown>) => buffered.push(data),
        };
        const result = await fn(tx);
        for (const data of buffered) apply(data);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    collection: () => ({ doc: () => ({ ...ref, delete: async () => ({}) }) }),
  };
  const auth = {
    updateUser: async () => {
      state.factors = 0;
      return {};
    },
    getUser: async () => ({ multiFactor: { enrolledFactors: Array.from({ length: state.factors }, () => ({ factorId: 'totp' })) } }),
  };
  const deps = {
    adminAuth: (async () => auth) as unknown as MfaRetireDeps['adminAuth'],
    adminDb: (async () => ({ db, FieldValue: { delete: () => DELETE, serverTimestamp: () => '<now>' } })) as unknown as MfaRetireDeps['adminDb'],
  };
  /** The decision saveOwnModelKey takes inside its transaction, and the key write when it passes. */
  const saveKey = (nowMs: number) =>
    db.runTransaction(async (tx) => {
      const profile = (await (tx as { get: () => Promise<{ data: () => Record<string, unknown> }> }).get()).data();
      const refusal = ownKeySaveRefusal(profile, (await auth.getUser()).multiFactor.enrolledFactors.length > 0, nowMs);
      if (refusal) return refusal;
      (tx as { set: (r: unknown, d: Record<string, unknown>) => void }).set(ref, { byokConfigured: true });
      return null;
    });
  return { state, deps, saveKey };
}

const gate = (profile: Record<string, unknown> | undefined) => mfaRemovalBlockedByOwnKey(profile);

test('the own-key save decides on the profile and the factors it read in its transaction', () => {
  const now = 1_000_000_000;
  expect(ownKeySaveRefusal({ mfaEnabled: true }, true, now)).toBeNull();
  expect(ownKeySaveRefusal({ mfaEnabled: false }, true, now)).toBe(BYOK_MFA_ENROLMENT_REQUIRED);
  expect(ownKeySaveRefusal({ mfaEnabled: true }, false, now)).toBe(BYOK_MFA_ENROLMENT_REQUIRED);
  expect(ownKeySaveRefusal(undefined, true, now)).toBe(BYOK_MFA_ENROLMENT_REQUIRED);
  // A removal under way refuses the save, also under the emulator, where the factor cannot be checked.
  expect(ownKeySaveRefusal({ mfaEnabled: true, [MFA_REMOVAL_MARKER]: now - 1000 }, true, now)).toBe(OWN_KEY_SAVE_DURING_MFA_REMOVAL);
  expect(ownKeySaveRefusal({ [MFA_REMOVAL_MARKER]: now }, 'unchecked', now)).toBe(OWN_KEY_SAVE_DURING_MFA_REMOVAL);
  expect(ownKeySaveRefusal({}, 'unchecked', now)).toBeNull();
  // A reservation whose call never finished runs out; the factor check still stands after it.
  const stale = { mfaEnabled: true, [MFA_REMOVAL_MARKER]: now - MFA_REMOVAL_MARKER_TTL_MS };
  expect(ownKeySaveRefusal(stale, true, now)).toBeNull();
  expect(ownKeySaveRefusal(stale, false, now)).toBe(BYOK_MFA_ENROLMENT_REQUIRED);
  expect(ownKeySaveRefusal({ mfaEnabled: true, [MFA_REMOVAL_MARKER]: 'yesterday' }, true, now)).toBeNull();
});

test('a key saved between the key check and the factor removal is refused', async () => {
  const w = world({ mfaEnabled: true });
  const now = Date.now();
  // The removal reserves first; the save that was waiting on its provider test commits after.
  const reserved = await reserveFactorRemoval(UID, gate, w.deps, now, 'req-1');
  expect(reserved).toEqual({ refusal: null, token: 'req-1' });
  expect(w.state.profile[MFA_REMOVAL_MARKER]).toEqual({ at: now, token: 'req-1' });
  await expect(w.saveKey(now)).resolves.toBe(OWN_KEY_SAVE_DURING_MFA_REMOVAL);
  await expect(retireSecondFactor(UID, true, w.deps)).resolves.toEqual({ ok: true, removedFactor: true });
  expect(w.state.profile.byokConfigured, 'a key stands on an account without a factor').toBeUndefined();
  expect(w.state.profile.mfaEnabled).toBe(false);
  expect(w.state.profile, 'the reservation outlived the removal').not.toHaveProperty(MFA_REMOVAL_MARKER);
  // And after it: no flag, no factor, no key.
  await expect(w.saveKey(now)).resolves.toBe(BYOK_MFA_ENROLMENT_REQUIRED);
});

test('a key stored before the reservation refuses the removal, and the factor stays', async () => {
  const w = world({ mfaEnabled: true });
  const now = Date.now();
  await expect(w.saveKey(now)).resolves.toBeNull();
  expect((await reserveFactorRemoval(UID, gate, w.deps, now)).refusal).toBe(OWN_KEY_BLOCKS_MFA_REMOVAL);
  expect(w.state.profile).not.toHaveProperty(MFA_REMOVAL_MARKER);
  expect(w.state.factors).toBe(1);
});

test('both at once: whichever transaction runs first, no key stands without a factor', async () => {
  for (const saveFirst of [true, false]) {
    const w = world({ mfaEnabled: true });
    const now = Date.now();
    const save = saveFirst ? w.saveKey(now) : null;
    const reserved = reserveFactorRemoval(UID, gate, w.deps, now);
    const later = saveFirst ? null : w.saveKey(now);
    const [saveResult, reservedResult] = await Promise.all([save ?? later, reserved]);
    const reserveResult = reservedResult.refusal;
    if (reservedResult.token) await retireSecondFactor(UID, true, w.deps);
    expect(saveResult === null || reserveResult === null, 'both were refused').toBe(true);
    expect(saveResult === null && reserveResult === null, 'both went through').toBe(false);
    if (w.state.profile.byokConfigured === true) expect(w.state.factors).toBe(1);
  }
});

test('two removals at once: the second is refused, and a failing one lifts only its own reservation', async () => {
  const w = world({ mfaEnabled: true });
  const now = Date.now();
  const [first, second] = await Promise.all([
    reserveFactorRemoval(UID, gate, w.deps, now, 'req-1'),
    reserveFactorRemoval(UID, gate, w.deps, now, 'req-2'),
  ]);
  expect(first).toEqual({ refusal: null, token: 'req-1' });
  expect(second).toEqual({ refusal: MFA_REMOVAL_ALREADY_RUNNING, token: null });
  // A request that does not hold the reservation cannot lift it — the save stays refused while the first one runs.
  await releaseFactorRemoval(UID, 'req-2', w.deps);
  expect(w.state.profile[MFA_REMOVAL_MARKER]).toEqual({ at: now, token: 'req-1' });
  await expect(w.saveKey(now)).resolves.toBe(OWN_KEY_SAVE_DURING_MFA_REMOVAL);
  await retireSecondFactor(UID, true, w.deps);
  expect(w.state.profile.byokConfigured).toBeUndefined();
  expect(w.state.profile).not.toHaveProperty(MFA_REMOVAL_MARKER);
  // The holder lifts its own after a failed removal.
  const v = world({ mfaEnabled: true });
  await reserveFactorRemoval(UID, gate, v.deps, now, 'req-3');
  await releaseFactorRemoval(UID, 'req-3', v.deps);
  expect(v.state.profile).not.toHaveProperty(MFA_REMOVAL_MARKER);
  // A reservation in the first form of the field (a bare number) still counts, and runs out.
  expect(mfaRemovalInProgress({ [MFA_REMOVAL_MARKER]: now - 1000 }, now)).toBe(true);
  expect(mfaRemovalInProgress({ [MFA_REMOVAL_MARKER]: { at: now - MFA_REMOVAL_MARKER_TTL_MS, token: 'x' } }, now)).toBe(false);
});

test('the route reserves before it removes and lifts the reservation when the removal fails; the save re-decides in its transaction', () => {
  const route = read('app/api/mfa/disable/route.ts');
  const reserve = route.indexOf('await reserveFactorRemoval(uid,');
  expect(reserve).toBeGreaterThan(-1);
  expect(reserve).toBeLessThan(route.indexOf('await retireSecondFactor(uid'));
  expect(route.slice(reserve, reserve + 120)).toContain('mfaRemovalBlockedByOwnKey(profile)');
  expect(route, 'the key check is a plain read again, outside the reservation').not.toMatch(/\.doc\(uid\)\.get\(\)/);
  const failed = route.indexOf('if (!outcome.ok) {');
  expect(route.slice(failed, failed + 400)).toContain('await releaseFactorRemoval(uid, reservation)');

  const admin = read('lib/firebase-admin.ts');
  const save = admin.slice(admin.indexOf('export async function saveOwnModelKey'), admin.indexOf('export interface OwnModelKey'));
  const txStart = save.indexOf('await db.runTransaction(');
  const decide = save.indexOf('ownKeySaveRefusal(profile.data(), factorEnrolled, Date.now())');
  expect(txStart).toBeGreaterThan(-1);
  expect(decide, 'the save decides outside its transaction').toBeGreaterThan(save.indexOf('const profile = await tx.get(profileRef);'));
  expect(decide).toBeGreaterThan(txStart);
  expect(save.indexOf('.getUser(uid)'), 'Firebase Auth is not read inside the transaction').toBeGreaterThan(txStart);
  expect(decide).toBeLessThan(save.indexOf('tx.set(secretRef, {'));
  expect(save).toContain('if (mfaRefusal) throw new QuotaError(mfaRefusal.message, mfaRefusal.status);');
});

test('the reservation is a server-only field: the client update allowlist does not name it', () => {
  const rules = read('firestore.rules');
  expect(rules).not.toContain(MFA_REMOVAL_MARKER);
  expect(rules).toMatch(/removedKeys\(\)\.hasOnly\(\[\]\)/);
});

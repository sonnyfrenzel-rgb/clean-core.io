import { test, expect } from '@playwright/test';
import { retireSecondFactor, type MfaRetireDeps } from '../lib/mfa-disable';

/**
 * QA full review of v2.20.0 (41273d7b397f): the deletes of `mfa_secrets` and
 * `mfa_pending` ended in `.catch(() => {})`, so a refused delete still returned
 * `ok: true` and the route answered "disabled" with the stored MFA material in
 * place. The failure now reaches the caller, and a repeat of the same call —
 * which is what the route's 500 invites — deletes both.
 *
 * Doubles as in tests/mfa-disable-order.spec.ts: the real systems cannot be
 * made to refuse one delete on demand.
 */
const UID = 'uid-under-test';

function deps(failDelete: string | null, deleted: string[]): MfaRetireDeps {
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async () => {
          expect(id).toBe(UID);
          return {};
        },
        delete: async () => {
          expect(id).toBe(UID);
          if (name === failDelete) throw new Error('firestore/unavailable');
          deleted.push(name);
          return {};
        },
      }),
    }),
  };
  const FieldValue = { delete: () => '<delete>', serverTimestamp: () => '<now>' };
  return {
    adminAuth: (async () => ({ updateUser: async () => ({}) })) as unknown as MfaRetireDeps['adminAuth'],
    adminDb: (async () => ({ db, FieldValue })) as unknown as MfaRetireDeps['adminDb'],
  };
}

for (const collection of ['mfa_secrets', 'mfa_pending']) {
  test(`a refused delete of ${collection} is not reported as a completed disable`, async () => {
    const deleted: string[] = [];
    await expect(retireSecondFactor(UID, true, deps(collection, deleted))).rejects.toThrow('firestore/unavailable');
    expect(deleted).not.toContain(collection);

    // The retry the route's error invites: the factor is gone now, so the call
    // arrives without one and deletes what the first attempt could not.
    const retried: string[] = [];
    await expect(retireSecondFactor(UID, false, deps(null, retried))).resolves.toEqual({ ok: true, removedFactor: false });
    expect(retried.sort()).toEqual(['mfa_pending', 'mfa_secrets']);
  });
}

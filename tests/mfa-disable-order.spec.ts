/**
 * The order in /api/mfa/disable, run rather than read (roadmap 0.17, QA review
 * 6a1e32c0b973).
 *
 * `tests/mfa-coverage-guard.spec.ts` asserted the order as text: the string
 * `multiFactor: { enrolledFactors: null }` occurs before `mfaEnabled: false`.
 * That is satisfied by a file in which the factor removal fails and the flag is
 * cleared anyway — which is the one state the order exists to prevent: an
 * account whose profile says "no second factor" while Firebase Auth still holds
 * one. The grep cannot see it, because nothing about it is out of order.
 *
 * Proving it needed the Auth call to fail on demand. No real account can be
 * driven into that branch here: the Auth emulator cannot enrol a TOTP factor
 * (firebase-tools 15.30.1), so `hasFactor` is false for every account a spec
 * can create and the whole branch is skipped. `retireSecondFactor` therefore
 * takes its two accessors as a parameter with a production default; the route
 * passes nothing, and these tests pass doubles that record what was called and
 * fail where the test needs a failure.
 *
 * What each case proves, in the words of the invariant: every state a failure
 * can leave behind is over-strict (the gate refuses someone it could have let
 * in), never under-strict (the gate lets someone in it should have refused).
 */
import { test, expect } from '@playwright/test';
import { retireSecondFactor, FACTOR_REMOVAL_FAILED, type MfaRetireDeps } from '../lib/mfa-disable';

const UID = 'uid-under-test';

interface Recorder {
  calls: string[];
  userWrites: Record<string, unknown>[];
  deleted: string[];
  deps: MfaRetireDeps;
}

/**
 * Doubles for Admin Auth and Admin Firestore, recording the order of every call.
 *
 * `failOn` is what the real systems cannot be made to do from a spec: refuse.
 */
function recorder(failOn?: 'removeFactor' | 'clearFlag'): Recorder {
  const calls: string[] = [];
  const userWrites: Record<string, unknown>[] = [];
  const deleted: string[] = [];

  const auth = {
    updateUser: async (uid: string, update: { multiFactor: { enrolledFactors: null } }) => {
      expect(uid, 'the factor was removed from another account').toBe(UID);
      expect(update).toEqual({ multiFactor: { enrolledFactors: null } });
      calls.push('removeFactor');
      if (failOn === 'removeFactor') throw new Error('auth/internal-error');
      return {};
    },
  };

  const FieldValue = {
    delete: () => '<delete>',
    serverTimestamp: () => '<now>',
  };

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => {
          expect(id).toBe(UID);
          calls.push(`set:${name}`);
          if (failOn === 'clearFlag') throw new Error('firestore/unavailable');
          userWrites.push(data);
          return {};
        },
        delete: async () => {
          expect(id).toBe(UID);
          calls.push(`delete:${name}`);
          deleted.push(name);
          return {};
        },
      }),
    }),
  };

  return {
    calls,
    userWrites,
    deleted,
    deps: {
      adminAuth: async () => auth,
      adminDb: async () => ({ db, FieldValue }),
    },
  };
}

test.describe('retiring the second factor', () => {
  test('the factor is removed first and the flag cleared second', async () => {
    const r = recorder();
    const outcome = await retireSecondFactor(UID, true, r.deps);

    expect(outcome).toEqual({ ok: true, removedFactor: true });
    // The order itself, at runtime: not "the strings appear in this order in a
    // file" but "these calls happened in this order".
    expect(r.calls.slice(0, 2)).toEqual(['removeFactor', 'set:users']);
    expect(r.calls.filter((c) => c === 'removeFactor')).toHaveLength(1);
    expect(r.userWrites).toHaveLength(1);
    expect(r.userWrites[0]).toMatchObject({ mfaEnabled: false });
    expect(r.userWrites[0].mfaEnabled, 'the flag was set, not cleared').not.toBe(true);
    // The leftovers of the application-level TOTP go with it (roadmap 0.13).
    expect(Object.keys(r.userWrites[0]).sort()).toEqual(
      ['mfaBackupCodes', 'mfaEnabled', 'mfaFactor', 'mfaSecret', 'updatedAt'],
    );
    expect(r.deleted.sort()).toEqual(['mfa_pending', 'mfa_secrets']);
  });

  test('when the factor cannot be removed, nothing is written at all', async () => {
    const r = recorder('removeFactor');
    const outcome = await retireSecondFactor(UID, true, r.deps);

    // The under-strict state — flag cleared, factor still live — is the one a
    // stolen first-factor token would walk through. It must be unreachable.
    expect(outcome).toEqual({ ok: false, status: 503, error: FACTOR_REMOVAL_FAILED });
    expect(r.calls, 'the flag was touched after the factor removal failed').toEqual(['removeFactor']);
    expect(r.userWrites).toHaveLength(0);
    expect(r.deleted).toHaveLength(0);
  });

  test('when the flag cannot be cleared, the factor is already gone and the caller is told', async () => {
    const r = recorder('clearFlag');

    // Not absorbed: it reaches the route's own handler, which answers 500. The
    // state left behind — flag set, no factor — refuses its own owner, which is
    // the direction the order chooses on purpose.
    await expect(retireSecondFactor(UID, true, r.deps)).rejects.toThrow('firestore/unavailable');
    expect(r.calls).toEqual(['removeFactor', 'set:users']);
    expect(r.userWrites).toHaveLength(0);
  });

  test('and that state recovers itself: no factor left, so no step-up and the flag goes', async () => {
    // The second call after the failure above. Firebase Auth has no factor any
    // more, so the route arrives here with hasFactor false — the branch that
    // needs no step-up, which is what makes the over-strict state recoverable
    // rather than permanent.
    const r = recorder();
    const outcome = await retireSecondFactor(UID, false, r.deps);

    expect(outcome).toEqual({ ok: true, removedFactor: false });
    expect(r.calls, 'a factor that is not there was removed again').not.toContain('removeFactor');
    expect(r.calls[0]).toBe('set:users');
    expect(r.userWrites[0]).toMatchObject({ mfaEnabled: false });
  });
});

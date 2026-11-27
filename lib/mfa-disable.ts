import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { MFA_REMOVAL_MARKER, type GateRefusal } from '@/lib/mfa-gate';

/**
 * Retiring the second factor: two systems, no transaction, one fixed order.
 *
 * This is the half of POST /api/mfa/disable that touches Firebase Auth and
 * Firestore, lifted out of the route so that its failure paths can be run
 * (roadmap 0.17). The gate itself — recent sign-in and
 * the factor on the token — stays in the route, where the coverage guard and
 * the catalog completeness check read it.
 *
 * Why it was lifted: the order below was only ever asserted as text. A source
 * guard reads `indexOf(removal) < indexOf(flag)` and is satisfied by a file in
 * which the removal fails and the flag is cleared anyway — the exact state the
 * order exists to prevent. Proving it at runtime needs the Auth call to fail on
 * demand, and the Auth emulator cannot even enrol a TOTP factor
 * (firebase-tools 15.30.1), so no real account can be driven into that branch.
 * A parameter with a production default can.
 *
 * The seam is inert: the route passes nothing, `deps` resolves to the same two
 * accessors the route used to call directly, and nothing outside this module
 * and its spec can reach the parameter — it is not a request field, not a
 * header, not an environment variable.
 *
 * The order itself: every state a failure can leave behind must be over-strict,
 * never under-strict. The factor goes first; if that fails, nothing has changed
 * and the person retries. The flag goes second; if that fails, the account has
 * a flag and no factor: every gated route refuses its first-factor token, which
 * no second factor could improve — but the same call recovers it, because a
 * flag without a factor in Firebase Auth arrives here with `hasFactor` false
 * and is cleared after a fresh sign-in, without a code (the route checks the
 * sign-in time on both paths). The flag is only cleared while Firebase Auth
 * shows no factor at the moment of the write. No compensating write, because a
 * compensation that can itself fail is where a factor with the gate off would
 * come from.
 */
export interface MfaRetireDeps {
  /** The Admin Auth client. Injected only by the spec that proves the order. */
  adminAuth: typeof getAdminAuth;
  /** The Admin Firestore handle and its `FieldValue`. */
  adminDb: typeof getAdminDb;
}

/** What the route calls when it injects nothing, i.e. always. */
export const PRODUCTION_MFA_RETIRE_DEPS: MfaRetireDeps = {
  adminAuth: getAdminAuth,
  adminDb: getAdminDb,
};

export type MfaRetireOutcome =
  | { ok: true; removedFactor: boolean }
  | { ok: false; status: number; error: string };

export const FACTOR_REMOVAL_FAILED =
  'The authenticator could not be removed from your account. Nothing changed — try again in a moment.';

export const FACTOR_PRESENT =
  'An authenticator is set up on this account. Removing it needs a code from the authenticator app.';

/**
 * Removes the factor (when there is one) and then clears the profile flag.
 *
 * Returns rather than throws for the one failure it can absorb — the factor
 * removal, after which nothing has changed. A failure of the second write, or
 * of the deletes of the stored MFA material after it, is deliberately NOT
 * absorbed: it propagates to the route's own handler, because the state it
 * leaves is one this call itself recovers.
 */
export async function retireSecondFactor(
  uid: string,
  hasFactor: boolean,
  deps: MfaRetireDeps = PRODUCTION_MFA_RETIRE_DEPS,
): Promise<MfaRetireOutcome> {
  if (hasFactor) {
    try {
      const auth = await deps.adminAuth();
      await auth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
    } catch (removeErr) {
      // Nothing has changed: the factor is still there and the flag still requires it.
      console.error('[mfa/disable] factor removal failed:', removeErr);
      return { ok: false, status: 503, error: FACTOR_REMOVAL_FAILED };
    }
  }

  // From here on a failure leaves flag-without-factor, which this call clears
  // on the next attempt after a fresh sign-in (see above).
  //
  // The flag is cleared in a transaction that reads the profile first and
  // Firebase Auth second. `/api/mfa/enrolled` reads Firebase Auth and then
  // writes the profile, so the two cannot interleave into "factor enrolled,
  // flag cleared": either its profile write lands before this read (and the
  // factor is seen here), or it conflicts with this transaction and lands
  // after the clear.
  const { db, FieldValue } = await deps.adminDb();
  const userRef = db.collection('users').doc(uid);
  const cleared = await db.runTransaction(async (tx: Transaction) => {
    await tx.get(userRef);
    const record = await (await deps.adminAuth()).getUser(uid);
    if ((record.multiFactor?.enrolledFactors ?? []).length > 0) return false;
    tx.set(
      userRef,
      {
        mfaEnabled: false,
        mfaFactor: FieldValue.delete(),
        mfaSecret: FieldValue.delete(),
        mfaBackupCodes: FieldValue.delete(),
        [MFA_REMOVAL_MARKER]: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });
  if (!cleared) return { ok: false, status: 409, error: FACTOR_PRESENT };
  // Not absorbed either: a swallowed failure here
  // answered "disabled" with the stored MFA material still in place. It now
  // reaches the route's handler like the flag write above, and the same call
  // repeats both deletes — deleting a document that is already gone succeeds.
  await Promise.all([
    db.collection('mfa_secrets').doc(uid).delete(),
    db.collection('mfa_pending').doc(uid).delete(),
  ]);

  return { ok: true, removedFactor: hasFactor };
}

/**
 * Reserves the removal of the factor before Firebase Auth is touched: one transaction on the profile that asks
 * `blockedBy` (the route passes the stored-own-key gate) and, when nothing blocks, sets `MFA_REMOVAL_MARKER`.
 *
 * The own-key save reads the same profile in its own transaction and refuses while the marker stands
 * (`ownKeySaveRefusal` in lib/mfa-gate.ts). Without the reservation the key check and the factor removal were two
 * separate steps, and a key saved between them was left on an account without a factor. A missing profile is not
 * recreated; nothing can be saved to it either.
 */
export async function reserveFactorRemoval(
  uid: string,
  blockedBy: (profile: Record<string, unknown> | undefined) => GateRefusal | null,
  deps: MfaRetireDeps = PRODUCTION_MFA_RETIRE_DEPS,
  nowMs: number = Date.now(),
): Promise<GateRefusal | null> {
  const { db } = await deps.adminDb();
  const userRef: DocumentReference = db.collection('users').doc(uid);
  return db.runTransaction(async (tx: Transaction) => {
    const profile = await tx.get(userRef);
    const blocked = blockedBy(profile.data());
    if (blocked) return blocked;
    if (profile.exists) tx.set(userRef, { [MFA_REMOVAL_MARKER]: nowMs }, { merge: true });
    return null;
  });
}

/** Lifts the reservation after a removal that did not go through (the factor is still there, or back). */
export async function releaseFactorRemoval(uid: string, deps: MfaRetireDeps = PRODUCTION_MFA_RETIRE_DEPS): Promise<void> {
  const { db, FieldValue } = await deps.adminDb();
  await db.collection('users').doc(uid).set({ [MFA_REMOVAL_MARKER]: FieldValue.delete() }, { merge: true });
}

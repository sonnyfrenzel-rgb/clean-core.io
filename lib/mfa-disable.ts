import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

/**
 * Retiring the second factor: two systems, no transaction, one fixed order.
 *
 * This is the half of POST /api/mfa/disable that touches Firebase Auth and
 * Firestore, lifted out of the route so that its failure paths can be run
 * (roadmap 0.17, QA review 6a1e32c0b973). The gate itself — recent sign-in and
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
 * The order itself (QA reviews of d93cb53e2631 and 0c35311c7aff: c4f3cb01dc90,
 * b30f4ec006a5): every state a failure can leave behind must be over-strict,
 * never under-strict. The factor goes first; if that fails, nothing has changed
 * and the person retries. The flag goes second; if that fails, the account has
 * a flag and no factor: every gated route refuses its first-factor token, which
 * no second factor could improve — but the same call recovers it, because a
 * flag without a factor in Firebase Auth arrives here with `hasFactor` false
 * and is cleared without a step-up. No compensating write, because a
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

/**
 * Removes the factor (when there is one) and then clears the profile flag.
 *
 * Returns rather than throws for the one failure it can absorb — the factor
 * removal, after which nothing has changed. A failure of the second write is
 * deliberately NOT absorbed: it propagates to the route's own handler, because
 * the state it leaves is the over-strict one this call itself recovers.
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
  // on the next attempt without a step-up (see above).
  const { db, FieldValue } = await deps.adminDb();
  await db.collection('users').doc(uid).set(
    {
      mfaEnabled: false,
      mfaFactor: FieldValue.delete(),
      mfaSecret: FieldValue.delete(),
      mfaBackupCodes: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await Promise.all([
    db.collection('mfa_secrets').doc(uid).delete().catch(() => {}),
    db.collection('mfa_pending').doc(uid).delete().catch(() => {}),
  ]);

  return { ok: true, removedFactor: hasFactor };
}

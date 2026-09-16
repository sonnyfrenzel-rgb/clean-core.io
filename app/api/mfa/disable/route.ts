import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, getAdminAuth, assertMfaStepUp, assertRecentAuth, QuotaError } from '@/lib/firebase-admin';

/**
 * POST /api/mfa/disable — removes the second factor from the caller's account.
 *
 * Only a session that was just established with the factor may remove it:
 * recent sign-in and the factor on the token (assertMfaStepUp). The factor
 * itself lives in Firebase Auth and is unenrolled there through the Admin SDK;
 * the profile flag follows, and whatever the application-level TOTP of earlier
 * versions left behind is cleared with it (roadmap 0.13).
 *
 * Two systems, no transaction — so the order is chosen such that every state
 * a failure can leave behind is over-strict, never under-strict (QA reviews of
 * d93cb53e2631 and 0c35311c7aff: c4f3cb01dc90, b30f4ec006a5). The factor goes
 * first; if that fails, nothing has changed and the person retries. The flag
 * goes second; if that fails, the account has a flag and no factor: every
 * gated route refuses its first-factor token, which no second factor could
 * improve — but the same call recovers it, because a flag without a factor
 * in Firebase Auth is cleared here without a step-up. There is nothing left
 * that a stolen first-factor token could remove, only a flag refusing its own
 * owner; the Settings page offers exactly that call in that state. No
 * compensating write, because a compensation that can itself fail is where a
 * factor with the gate off would come from.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const uid = decodedToken.uid;

    const auth = await getAdminAuth();
    const record = await auth.getUser(uid);
    const hasFactor = (record.multiFactor?.enrolledFactors ?? []).length > 0;

    if (hasFactor) {
      try {
        assertRecentAuth(decodedToken, 300);
        await assertMfaStepUp(request, decodedToken);
      } catch (err: unknown) {
        const status = err instanceof QuotaError ? err.status : 403;
        const message = err instanceof Error ? err.message : 'Recent MFA step-up verification required.';
        return NextResponse.json({ error: message }, { status });
      }
      try {
        await auth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
      } catch (removeErr) {
        // Nothing has changed: the factor is still there and the flag still requires it.
        console.error('[mfa/disable] factor removal failed:', removeErr);
        return NextResponse.json(
          { error: 'The authenticator could not be removed from your account. Nothing changed — try again in a moment.' },
          { status: 503 },
        );
      }
    }

    // From here on a failure leaves flag-without-factor, which this route clears
    // on the next call without a step-up (see above).
    const { db, FieldValue } = await getAdminDb();
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

    return NextResponse.json({ success: true, removedFactor: hasFactor });
  } catch (error) {
    console.error('[mfa/disable] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

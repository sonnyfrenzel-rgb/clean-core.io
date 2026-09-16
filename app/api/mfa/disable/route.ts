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
 * Two systems, one order (QA review of d93cb53e2631, c4f3cb01dc90): the flag
 * is cleared first and the factor removed second. If the removal fails, the
 * account keeps a factor Firebase still asks for at sign-in and a flag that
 * no longer requires it — a state the person can retry from, because the
 * factor sign-in is still theirs. The other order left the account with the
 * flag and no factor: every gated route refusing a first-factor token that no
 * second factor could ever improve, and this very route unreachable. That
 * stranded state — flag without factor, also the legacy of the
 * application-level TOTP — is cleared here without a step-up: with nothing to
 * remove in Firebase Auth there is nothing a stolen first-factor token could
 * remove either, only a flag that was refusing its own owner.
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
    }

    const { db, FieldValue } = await getAdminDb();
    const users = db.collection('users').doc(uid);
    const cleared = {
      mfaEnabled: false,
      mfaFactor: FieldValue.delete(),
      mfaSecret: FieldValue.delete(),
      mfaBackupCodes: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await users.set(cleared, { merge: true });

    if (hasFactor) {
      try {
        await auth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
      } catch (removeErr) {
        // The factor stays and the flag goes back with it: a consistent state
        // the person can retry from, rather than a flag guarding nothing.
        console.error('[mfa/disable] factor removal failed — flag restored:', removeErr);
        await users.set({ mfaEnabled: true, mfaFactor: 'totp', updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch((restoreErr: unknown) => {
          console.error('[mfa/disable] and the flag could not be restored:', restoreErr);
        });
        return NextResponse.json(
          { error: 'The authenticator could not be removed from your account. Nothing changed — try again in a moment.' },
          { status: 503 },
        );
      }
    }

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

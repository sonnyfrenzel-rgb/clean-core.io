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
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const uid = decodedToken.uid;

    try {
      assertRecentAuth(decodedToken, 300);
      await assertMfaStepUp(request, decodedToken);
    } catch (err: unknown) {
      const status = err instanceof QuotaError ? err.status : 403;
      const message = err instanceof Error ? err.message : 'Recent MFA step-up verification required.';
      return NextResponse.json({ error: message }, { status });
    }

    const auth = await getAdminAuth();
    const record = await auth.getUser(uid);
    if ((record.multiFactor?.enrolledFactors ?? []).length > 0) {
      await auth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
    }

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[mfa/disable] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

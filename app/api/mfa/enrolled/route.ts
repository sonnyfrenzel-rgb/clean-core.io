import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, QuotaError, getAdminAuth, updateExistingProfile } from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/mfa/enrolled — the server takes note that a second factor exists.
 *
 * Roadmap 0.13 (Sonny, 16.09.2026, "Variante 2"): the second factor is
 * Firebase's own TOTP multi-factor. The browser enrols it with the Firebase
 * SDK, against Firebase Auth directly; nothing about the secret ever touches
 * this server. What this route does is read back from Firebase Auth that the
 * factor is really there and record `mfaEnabled` on the profile — the flag
 * every gated route consults, and the one field a client may not write itself
 * (firestore.rules keeps it out of the update allowlist).
 *
 * Not gated by the factor, on purpose: the session that enrols predates it.
 * Not gated by recency either: the route is idempotent, and the Settings page
 * calls it again whenever Firebase Auth shows a factor the profile does not
 * know about — the case where this write failed the first time and the
 * account was left with a factor Firebase asks for at sign-in and a flag the
 * server gates do not yet require (QA review of d93cb53e2631, 9cba6508b10b).
 * Firebase Auth is the authority on whether the factor exists; recording that
 * fact is safe from any valid session of the account.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const uid = decodedToken.uid;
    await assertRateLimit(`mfa-enrolled:${uid}:${getClientIp(request)}`, 10, 10 * 60 * 1000);

    const record = await (await getAdminAuth()).getUser(uid);
    const factors: Array<{ factorId: string; enrollmentTime?: string }> = record.multiFactor?.enrolledFactors ?? [];
    const totp = factors.find((f) => f.factorId === 'totp');
    if (!totp) {
      return NextResponse.json(
        { error: 'No authenticator is enrolled on this account. Complete the setup in your authenticator app first.' },
        { status: 409 },
      );
    }

    const { db, FieldValue } = await getAdminDb();
    // `update`, not a merge-set: an account erased while this request was in
    // flight must not get its profile back (QA full review of a12774cd2b7f).
    await updateExistingProfile(uid, {
      mfaEnabled: true,
      mfaFactor: 'totp',
      mfaEnrolledAt: FieldValue.serverTimestamp(),
      // Fields of the application-level TOTP that preceded Firebase's factor.
      mfaSecret: FieldValue.delete(),
      mfaBackupCodes: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { db });
    // The application-level secret store is retired with it.
    await Promise.all([
      db.collection('mfa_secrets').doc(uid).delete().catch(() => {}),
      db.collection('mfa_pending').doc(uid).delete().catch(() => {}),
    ]);

    return NextResponse.json({ success: true, factor: 'totp', enrolledAt: totp.enrollmentTime ?? null });
  } catch (error: unknown) {
    if (error instanceof QuotaError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[mfa/enrolled] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

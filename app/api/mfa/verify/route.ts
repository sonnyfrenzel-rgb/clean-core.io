import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { verifyMfa, encryptMfaSecret } from '@/lib/mfa';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }

    const uid = decodedToken.uid;
    try {
      await assertRateLimit(`mfa-verify:${uid}:${getClientIp(request)}`, 5, 10 * 60 * 1000);
    } catch (rateErr: any) {
      return NextResponse.json(
        { error: rateErr.message || 'Too many MFA attempts. Please wait and try again.' },
        { status: rateErr.status || 429 },
      );
    }

    const { db, FieldValue } = await getAdminDb();
    const mfaRef = db.collection('mfa_secrets').doc(uid);

    // 1-3. Read, verify, and — for a backup code — redeem, in one transaction.
    //
    // These were three separate steps: read the document, verify against it,
    // then write the remaining codes back. Two requests carrying the same backup
    // code both read the same array before either wrote, both verified, and both
    // wrote their own remainder — the second overwriting the first. One code,
    // two twelve-hour MFA sessions. "Single use" is the entire promise of a
    // backup code, so it is worth a transaction rather than a comment.
    //
    // A TOTP code takes the same path and writes nothing; the read stays inside
    // the transaction so the two cases cannot diverge.
    let result: Awaited<ReturnType<typeof verifyMfa>>;
    let notConfigured = false;

    try {
      result = await db.runTransaction(async (tx: any) => {
        const snap = await tx.get(mfaRef);
        if (!snap.exists) {
          notConfigured = true;
          return { success: false } as Awaited<ReturnType<typeof verifyMfa>>;
        }

        const { secretEnc, backupCodes = [] } = snap.data();
        const verified = await verifyMfa(secretEnc, backupCodes, code, uid);

        if (verified.success && verified.isBackupCode && verified.remainingBackupCodes !== undefined) {
          tx.update(mfaRef, {
            backupCodes: verified.remainingBackupCodes,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        return verified;
      });
    } catch (txErr) {
      // A contended transaction is retried by the SDK; reaching here means it
      // could not commit. Issuing a session on a code that may not have been
      // redeemed is the one outcome to avoid.
      console.error('[mfa/verify] redemption transaction failed:', txErr);
      return NextResponse.json({ error: 'Could not verify the code. Please try again.' }, { status: 503 });
    }

    if (notConfigured) {
      return NextResponse.json({ error: 'MFA is not configured for this account.' }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid 6-digit code or backup recovery code.' }, { status: 400 });
    }

    // 4. Generate and set the short-lived mfa_session cookie for API gating
    const sessionToken = encryptMfaSecret(JSON.stringify({
      uid,
      mfaVerifiedAt: Date.now(),
    }));

    const response = NextResponse.json({ success: true });
    response.cookies.set('mfa_session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60, // 12 hours in seconds
    });

    return response;
  } catch (error) {
    console.error('[mfa/verify] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

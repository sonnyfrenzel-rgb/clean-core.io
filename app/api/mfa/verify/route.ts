import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { verifyMfa, encryptMfaSecret } from '@/lib/mfa';

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
    const { db, FieldValue } = await getAdminDb();

    // 1. Fetch encrypted secret and hashed backup codes
    const mfaDoc = await db.collection('mfa_secrets').doc(uid).get();
    if (!mfaDoc.exists) {
      return NextResponse.json({ error: 'MFA is not configured for this account.' }, { status: 400 });
    }

    const { secretEnc, backupCodes = [] } = mfaDoc.data();

    // 2. Perform server-side MFA verification (TOTP or backup code)
    const result = await verifyMfa(secretEnc, backupCodes, code, uid);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid 6-digit code or backup recovery code.' }, { status: 400 });
    }

    // 3. If a backup code was used, remove it from the database
    if (result.isBackupCode && result.remainingBackupCodes !== undefined) {
      await db.collection('mfa_secrets').doc(uid).update({
        backupCodes: result.remainingBackupCodes,
        updatedAt: FieldValue.serverTimestamp(),
      });
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

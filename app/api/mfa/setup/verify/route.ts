import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { verifyTOTP, generateBackupCodes } from '@/lib/totp';
import { encryptMfaSecret, decryptMfaSecret, hashBackupCodeWithSaltAndPepper } from '@/lib/mfa';
import crypto from 'crypto';

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

    // 1. Load pending secret from server-side collection mfa_pending/{uid}
    const pendingDoc = await db.collection('mfa_pending').doc(uid).get();
    if (!pendingDoc.exists) {
      return NextResponse.json({ error: 'MFA setup has not been initiated. Please start setup again.' }, { status: 400 });
    }

    const pendingData = pendingDoc.data();
    if (Date.now() > pendingData.expiresAt) {
      await db.collection('mfa_pending').doc(uid).delete().catch(() => {});
      return NextResponse.json({ error: 'MFA setup session expired. Please start setup again.' }, { status: 400 });
    }

    const secretEnc = pendingData.secretEnc;
    const secret = decryptMfaSecret(secretEnc);

    // 2. Verify code against the secret
    const isValid = await verifyTOTP(secret, code);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    // 3. Generate and hash backup codes using salt & pepper
    const backupCodes = generateBackupCodes(); // Plain codes for the client to download once
    const hashedBackupCodes = backupCodes.map((bc) => {
      const salt = crypto.randomBytes(16).toString('base64');
      const hash = hashBackupCodeWithSaltAndPepper(bc, salt);
      return {
        salt,
        hash,
        createdAt: Date.now(),
        usedAt: null
      };
    });

    // 4. Save to server-only collection mfa_secrets/{uid}
    await db.collection('mfa_secrets').doc(uid).set({
      secretEnc,
      backupCodes: hashedBackupCodes,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 5. Enable MFA on the user profile and delete legacy plain text keys
    await db.collection('users').doc(uid).set(
      {
        mfaEnabled: true,
        mfaSecret: FieldValue.delete(),
        mfaBackupCodes: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 6. Delete the pending MFA setup document
    await db.collection('mfa_pending').doc(uid).delete().catch(() => {});

    // 7. Set the short-lived mfa_session cookie for API gating
    const sessionToken = encryptMfaSecret(JSON.stringify({
      uid,
      mfaVerifiedAt: Date.now(),
    }));

    const response = NextResponse.json({ success: true, backupCodes });
    response.cookies.set('mfa_session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60, // 12 hours in seconds
    });

    return response;
  } catch (error) {
    console.error('[mfa/setup/verify] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

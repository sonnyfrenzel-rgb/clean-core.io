import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { verifyTOTP, generateBackupCodes } from '@/lib/totp';
import { encryptMfaSecret, hashBackupCode } from '@/lib/mfa';

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { secret, code } = await request.json();
    if (!secret || !code) {
      return NextResponse.json({ error: 'Secret and code are required.' }, { status: 400 });
    }

    const uid = decodedToken.uid;

    // 1. Verify code against the secret
    const isValid = await verifyTOTP(secret, code);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    // 2. Encrypt secret and generate/hash backup codes
    const secretEnc = encryptMfaSecret(secret);
    const backupCodes = generateBackupCodes(); // Plain codes for the client to download once
    const hashedBackupCodes = backupCodes.map((bc) => hashBackupCode(bc, uid));

    // 3. Save to server-only collection mfa_secrets/{uid}
    const { db, FieldValue } = await getAdminDb();
    await db.collection('mfa_secrets').doc(uid).set({
      secretEnc,
      backupCodes: hashedBackupCodes,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 4. Enable MFA on the user profile and delete legacy plain text keys
    await db.collection('users').doc(uid).set(
      {
        mfaEnabled: true,
        mfaSecret: FieldValue.delete(),
        mfaBackupCodes: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, backupCodes });
  } catch (error) {
    console.error('[mfa/setup/verify] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

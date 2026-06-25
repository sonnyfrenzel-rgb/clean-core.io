import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { generateSecret, generateOtpauthUrl } from '@/lib/totp';
import { encryptMfaSecret } from '@/lib/mfa';

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const email = decodedToken.email || '';
    if (!email) {
      return NextResponse.json({ error: 'User email is required.' }, { status: 400 });
    }

    const uid = decodedToken.uid;

    // Generate a fresh random TOTP secret (Base32, 16 chars)
    const secret = generateSecret();
    const qrCodeUrl = generateOtpauthUrl(secret, email);

    // Save pending secret encrypted in Firestore mfa_pending/{uid}
    const { db, FieldValue } = await getAdminDb();
    const secretEnc = encryptMfaSecret(secret);
    await db.collection('mfa_pending').doc(uid).set({
      secretEnc,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes from now
    });

    return NextResponse.json({ secret, qrCodeUrl });
  } catch (error) {
    console.error('[mfa/setup/start] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

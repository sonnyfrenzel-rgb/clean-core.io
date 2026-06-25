import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';
import { generateSecret, generateOtpauthUrl } from '@/lib/totp';

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

    // Generate a fresh random TOTP secret (Base32, 16 chars)
    const secret = generateSecret();
    const qrCodeUrl = generateOtpauthUrl(secret, email);

    return NextResponse.json({ secret, qrCodeUrl });
  } catch (error) {
    console.error('[mfa/setup/start] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

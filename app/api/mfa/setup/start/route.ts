import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, assertMfaStepUp } from '@/lib/firebase-admin';
import { generateSecret, generateOtpauthUrl } from '@/lib/totp';
import { encryptMfaSecret } from '@/lib/mfa';


/**
 * Re-enrolment is not enrolment.
 *
 * Both setup routes only checked that the caller held a valid ID token. For a
 * first enrolment that is right and unavoidable — the factor cannot be required
 * before it exists. For an account that already has MFA it meant the second
 * factor could be replaced with nothing but a stolen bearer token: call start,
 * receive a fresh secret, compute its current code, call verify, and both the
 * stored secret and the `mfa_session` cookie belong to the caller.
 *
 * `tests/mfa-coverage-guard.spec.ts` listed these two routes as MUST_NOT_GATE
 * with exactly the right reasoning attached to the wrong scope, so the hole was
 * pinned in place by a test.
 *
 * The distinction is the enrolled state, not the route: no gate when there is no
 * factor yet, the full step-up when there is one.
 */
async function assertReEnrolmentAllowed(request: NextRequest, decodedToken: any) {
  const { db } = await getAdminDb();
  const snap = await db.collection('users').doc(decodedToken.uid).get();
  if (!snap.exists || snap.data()?.mfaEnabled !== true) return; // first enrolment
  await assertMfaStepUp(request, decodedToken);
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    try {
      await assertReEnrolmentAllowed(request, decodedToken);
    } catch (stepUpErr: any) {
      return NextResponse.json(
        { error: stepUpErr.message || 'Verify your current authenticator before replacing it.' },
        { status: stepUpErr.status || 403 },
      );
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

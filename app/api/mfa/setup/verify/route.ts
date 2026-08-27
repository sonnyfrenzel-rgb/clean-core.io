import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, assertMfaStepUp } from '@/lib/firebase-admin';
import { verifyTOTP, generateBackupCodes } from '@/lib/totp';
import { encryptMfaSecret, decryptMfaSecret, hashBackupCodeWithSaltAndPepper } from '@/lib/mfa';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import crypto from 'crypto';


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

    // Checked here too, not only in start: the two routes are independent HTTP
    // endpoints and a caller can reach this one directly with a pending secret.
    try {
      await assertReEnrolmentAllowed(request, decodedToken);
    } catch (stepUpErr: any) {
      return NextResponse.json(
        { error: stepUpErr.message || 'Verify your current authenticator before replacing it.' },
        { status: stepUpErr.status || 403 },
      );
    }

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }

    const uid = decodedToken.uid;
    try {
      await assertRateLimit(`mfa-setup-verify:${uid}:${getClientIp(request)}`, 5, 10 * 60 * 1000);
    } catch (rateErr: any) {
      return NextResponse.json(
        { error: rateErr.message || 'Too many MFA setup attempts. Please wait and try again.' },
        { status: rateErr.status || 429 },
      );
    }

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

import { NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  getAdminDb,
  assertMfaSatisfied,
  assertAccountActive,
  QuotaError,
} from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';

/**
 * GET /api/secrets/gemini/status
 *
 * Retrieves metadata about the user's custom Gemini API key configuration.
 */
export async function GET(req: Request) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // The two gates every one of its siblings carries and this one did not: a
    // valid ID token was the whole of it, so a token obtained before the second
    // factor answered here, and so did a suspended account — about the key the
    // server still holds and still spends on that account's behalf (security
    // audit of b88c77b). Enrolment is not demanded, only the factor when the
    // account has one: this is the read the settings screen makes *before*
    // anything is saved, and `byokRequiresEnrolment` belongs on the routes that
    // save, test and delete.
    await assertMfaSatisfied(req, decodedToken);
    await assertAccountActive(decodedToken.uid);

    const { db } = await getAdminDb();
    const snap = await db.collection('user_secrets').doc(decodedToken.uid).collection('providers').doc('gemini').get();
    if (!snap.exists) {
      return NextResponse.json({ byokConfigured: false, last4: '', rotatedAt: null });
    }

    const data = snap.data();
    return NextResponse.json({
      byokConfigured: true,
      last4: data?.last4 || '',
      rotatedAt: data?.rotatedAt ? data.rotatedAt.toDate().toISOString() : null,
    });
  } catch (err: unknown) {
    // A refusal says why — those messages are ours. Anything else is an Admin
    // SDK failure speaking about `user_secrets`, and the caller gets the fixed
    // sentence while the reason goes to the log (security audit of b88c77b).
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error('gemini key status read failed', {
      route: 'api/secrets/gemini/status',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Failed to fetch status.' }, { status: 500 });
  }
}

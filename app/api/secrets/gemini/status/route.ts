import { NextResponse } from 'next/server';
import { ownKeyCounts } from '@/lib/run-quota-rule';
import {
  verifyRequestAuth,
  getAdminDb,
  assertMfaSatisfied,
  assertAccountActive,
  QuotaError,
} from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';
import { ownKeyProviderOf } from '@/lib/model-providers';

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
    // server still holds and still spends on that account's behalf.
    // Enrolment is not demanded, only the factor when the
    // account has one: this is the read the settings screen makes *before*
    // anything is saved, and `byokRequiresEnrolment` belongs on the routes that
    // save, test and delete.
    await assertMfaSatisfied(req, decodedToken);
    await assertAccountActive(decodedToken.uid);

    const { db } = await getAdminDb();
    // 3.0.15: the provider the profile names; a profile from before names none (Gemini).
    const profile = (await db.collection('users').doc(decodedToken.uid).get()).data() ?? null;
    const named = ownKeyProviderOf(profile);
    const provider = named === null || named === 'unknown' ? 'gemini' : named;
    const snap = await db.collection('user_secrets').doc(decodedToken.uid).collection('providers').doc(provider).get();
    const testedRaw = (profile as { byokTestedAt?: { toDate?: () => Date } | string | null } | null)?.byokTestedAt;
    const profileTestedAt = !ownKeyCounts(profile as Parameters<typeof ownKeyCounts>[0]) ? null
      : typeof testedRaw === 'string' ? testedRaw : testedRaw && typeof testedRaw.toDate === 'function' ? testedRaw.toDate().toISOString() : null;
    if (!snap.exists) {
      return NextResponse.json({ byokConfigured: false, provider: null, last4: '', rotatedAt: null, testedAt: null });
    }

    const data = snap.data();
    return NextResponse.json({
      byokConfigured: true,
      provider,
      last4: data?.last4 || '',
      rotatedAt: data?.rotatedAt ? data.rotatedAt.toDate().toISOString() : null,
      // Roadmap 3.0.21: whether the saved key passed its test (`ownKeyCounts`, lib/run-quota-rule.ts).
      testedAt: profileTestedAt,
    });
  } catch (err: unknown) {
    // A refusal says why — those messages are ours. Anything else is an Admin
    // SDK failure speaking about `user_secrets`, and the caller gets the fixed
    // sentence while the reason goes to the log.
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

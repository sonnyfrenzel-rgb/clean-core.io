import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminAuth, assertMfaStepUp, assertRecentAuth, QuotaError } from '@/lib/firebase-admin';
import { retireSecondFactor } from '@/lib/mfa-disable';

/**
 * POST /api/mfa/disable — removes the second factor from the caller's account.
 *
 * Only a session that was just established with the factor may remove it:
 * recent sign-in and the factor on the token (assertMfaStepUp). The factor
 * itself lives in Firebase Auth and is unenrolled there through the Admin SDK;
 * the profile flag follows, and whatever the application-level TOTP of earlier
 * versions left behind is cleared with it (roadmap 0.13).
 *
 * Two systems, no transaction — so the order is chosen such that every state
 * a failure can leave behind is over-strict, never under-strict (QA reviews of
 * d93cb53e2631 and 0c35311c7aff: c4f3cb01dc90, b30f4ec006a5). That order, and
 * the two writes it orders, live in `lib/mfa-disable.ts`, where a spec can make
 * either of them fail and see what the other did — the reason they are not in
 * this file any more (roadmap 0.17, QA review 6a1e32c0b973). The gate stays
 * here: recent sign-in and the factor on the token, before anything is touched.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const uid = decodedToken.uid;

    const auth = await getAdminAuth();
    const record = await auth.getUser(uid);
    const hasFactor = (record.multiFactor?.enrolledFactors ?? []).length > 0;

    if (hasFactor) {
      try {
        assertRecentAuth(decodedToken, 300);
        await assertMfaStepUp(request, decodedToken);
      } catch (err: unknown) {
        const status = err instanceof QuotaError ? err.status : 403;
        const message = err instanceof Error ? err.message : 'Recent MFA step-up verification required.';
        return NextResponse.json({ error: message }, { status });
      }
    }

    // The factor first, the flag second — and what a failure of either leaves
    // behind. `lib/mfa-disable.ts` carries the order and the spec that runs it.
    const outcome = await retireSecondFactor(uid, hasFactor);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json({ success: true, removedFactor: outcome.removedFactor });
  } catch (error) {
    console.error('[mfa/disable] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

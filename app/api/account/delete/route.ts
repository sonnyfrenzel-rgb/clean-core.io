import { NextRequest, NextResponse } from 'next/server';
import { mfaRefusal, verifyRequestAuth, deleteUserDataAndAccount, assertMfaStepUp } from '@/lib/firebase-admin';
import { isRecentLogin } from '@/lib/recent-login';

/**
 * POST /api/account/delete — the erasure (GDPR Art. 17) from "Delete my
 * account" in Settings; deleting the account terminates the contract (Terms
 * 2.3, C7).
 *
 * The voluntary withdrawal / termination function (C13, Terms section 13) is
 * not this route: since A6 of 3.0.21 it has its own form and its own route,
 * `/api/account/withdraw`, which records the declaration, sends the receipt
 * and records that, and only then runs the same erasure.
 */

export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // 1. Enforce recent login (within 5 minutes / 300 seconds) for sensitive operation.
    // Allowed only when provably recent: a token without `auth_time` is refused.
    if (!isRecentLogin(decodedToken, 300)) {
      return NextResponse.json({
        error: 'Security restriction: Deleting your account requires a recent login. Please sign out, sign back in, and try deleting your account again.',
        code: 'requires-recent-login'
      }, { status: 400 });
    }

    // 2. Enforce recent MFA step-up verification if user has MFA enabled
    try {
      await assertMfaStepUp(req, decodedToken);
    } catch (mfaErr: unknown) {
      return NextResponse.json({
        error: mfaRefusal(mfaErr).message || 'Recent MFA step-up verification required.',
        code: 'requires-mfa-stepup'
      }, { status: 403 });
    }

    await deleteUserDataAndAccount(decodedToken.uid);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[account-delete] Error during user account erasure:', error);
    
    // Check if error is due to requires-recent-login from Firebase Auth
    if (error.code === 'auth/requires-recent-login' || error.message?.includes('requires-recent-login')) {
      return NextResponse.json({
        error: 'Security restriction: Deleting your account requires a recent login. Please sign out, sign back in, and try deleting your account again.',
        code: 'requires-recent-login'
      }, { status: 400 });
    }
    
    return NextResponse.json({ error: 'Internal Server Error during data erasure.' }, { status: 500 });
  }
}

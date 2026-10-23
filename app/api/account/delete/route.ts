import { NextRequest, NextResponse } from 'next/server';
import { mfaRefusal, verifyRequestAuth, deleteUserDataAndAccount, assertMfaStepUp, getAdminDb } from '@/lib/firebase-admin';
import { isRecentLogin } from '@/lib/recent-login';
import { acceptedTermsLanguageOf } from '@/lib/consent';
import { sendWithdrawalReceiptMail } from '@/lib/withdrawal-receipt-mail';

/**
 * POST /api/account/delete — the erasure (GDPR Art. 17), and since 3.0.21 also
 * the voluntary withdrawal / termination function (C13, Terms section 13;
 * owner decision 23.10.2026): "Withdraw from / end the contract" in Settings
 * and the signed-in footer leads to the same confirmation and this route.
 *
 * Once every check of the declaration has passed, the receipt goes by e-mail
 * to the token's verified address, in the language of the accepted Terms —
 * before the erasure, so that the erasure pseudonymises its delivery record
 * with the others. Best effort: a mail that does not go out never stops the
 * deletion, and nothing is resent.
 */
async function sendReceipt(uid: string, email: string | undefined, receivedAt: string): Promise<void> {
  let language = acceptedTermsLanguageOf(undefined);
  let firstName: string | null = null;
  try {
    const { db } = await getAdminDb();
    const profile = ((await db.collection('users').doc(uid).get()).data() ?? {}) as { termsLanguageAccepted?: unknown; firstName?: unknown };
    language = acceptedTermsLanguageOf(profile.termsLanguageAccepted);
    firstName = typeof profile.firstName === 'string' ? profile.firstName : null;
  } catch {
    /* the receipt goes out in English, unnamed */
  }
  await sendWithdrawalReceiptMail({ to: email, uid, language, firstName, receivedAt });
}

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

    // 3. The declaration is received: confirm it, then erase.
    await sendReceipt(decodedToken.uid, typeof decodedToken.email === 'string' ? decodedToken.email : undefined, new Date().toISOString());

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

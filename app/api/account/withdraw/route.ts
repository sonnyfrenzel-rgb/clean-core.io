import { NextRequest, NextResponse } from 'next/server';
import { mfaRefusal, verifyRequestAuth, deleteUserDataAndAccount, assertMfaStepUp, getAdminDb } from '@/lib/firebase-admin';
import { isRecentLogin } from '@/lib/recent-login';
import { acceptedTermsLanguageOf } from '@/lib/consent';
import { sendWithdrawalReceiptMail } from '@/lib/withdrawal-receipt-mail';
import { receiveWithdrawalDeclaration, type WithdrawalDeps } from '@/lib/withdrawal-declaration';
import { CONSENT_TEXTS } from '@/lib/legal/consent-texts';

/**
 * POST /api/account/withdraw — the voluntary withdrawal / termination function
 * (C13, Terms section 13; A6 of 3.0.21). Its own path beside the generic
 * erasure (`/api/account/delete`): the form "Withdraw from / end the contract"
 * in Settings posts here.
 *
 * The same sign-in checks as the erasure, because the path ends in it: a
 * recent sign-in and, with a second factor, a step-up. Then
 * `receiveWithdrawalDeclaration`: the declaration is recorded in the proof log,
 * the receipt goes by e-mail at once, its sending is recorded with the time,
 * and only then is the account deleted. A receipt that did not go out stops
 * before the deletion (503, `receipt-not-sent`).
 *
 * The address is the verified token's, never a value out of a request body;
 * the route reads no body.
 */

const RECENT_LOGIN_MESSAGE =
  'Security restriction: confirming the withdrawal requires a recent sign-in, because your account is deleted with it. Please sign out, sign back in, and confirm the withdrawal again.';

function routeDeps(): WithdrawalDeps {
  return {
    now: () => new Date(),
    readProfile: async (uid) => {
      try {
        const { db } = await getAdminDb();
        const profile = ((await db.collection('users').doc(uid).get()).data() ?? {}) as {
          termsLanguageAccepted?: unknown;
          firstName?: unknown;
          lastName?: unknown;
        };
        const name = [profile.firstName, profile.lastName].filter((p): p is string => typeof p === 'string').join(' ').trim();
        return { language: acceptedTermsLanguageOf(profile.termsLanguageAccepted), name };
      } catch {
        // The receipt goes out in English, unnamed.
        return { language: acceptedTermsLanguageOf(undefined), name: '' };
      }
    },
    record: async (row) => {
      const { db, FieldValue } = await getAdminDb();
      await db.collection('consent_events').doc().create({ ...row, createdAt: FieldValue.serverTimestamp() });
    },
    send: (input) => sendWithdrawalReceiptMail(input),
    erase: (uid, ending) => deleteUserDataAndAccount(uid, { ending }),
  };
}

export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Allowed only when provably recent: a token without `auth_time` is refused.
    if (!isRecentLogin(decodedToken, 300)) {
      return NextResponse.json({ error: RECENT_LOGIN_MESSAGE, code: 'requires-recent-login' }, { status: 400 });
    }

    try {
      await assertMfaStepUp(req, decodedToken);
    } catch (mfaErr: unknown) {
      return NextResponse.json(
        { error: mfaRefusal(mfaErr).message || 'Recent MFA step-up verification required.', code: 'requires-mfa-stepup' },
        { status: 403 },
      );
    }

    const result = await receiveWithdrawalDeclaration(
      { uid: decodedToken.uid, email: typeof decodedToken.email === 'string' ? decodedToken.email : null },
      routeDeps(),
    );
    if (!result.ok && result.code === 'no-address') {
      return NextResponse.json({ error: 'This account has no e-mail address to send the receipt to. Please write to info@clean-core.io.', code: 'no-address' }, { status: 400 });
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: CONSENT_TEXTS.withdrawal.receiptNotSent.en, code: 'receipt-not-sent', receivedAt: result.receivedAt },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, receivedAt: result.receivedAt, receiptSentAt: result.receiptSentAt });
  } catch (error: unknown) {
    console.error('[account-withdraw] Error during the withdrawal:', error instanceof Error ? error.name : typeof error);
    const e = error as { code?: unknown; message?: unknown } | null;
    if (e?.code === 'auth/requires-recent-login' || (typeof e?.message === 'string' && e.message.includes('requires-recent-login'))) {
      return NextResponse.json({ error: RECENT_LOGIN_MESSAGE, code: 'requires-recent-login' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error during the withdrawal.' }, { status: 500 });
  }
}

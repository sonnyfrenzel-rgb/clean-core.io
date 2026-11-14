import { NextRequest, NextResponse } from 'next/server';
import { mfaRefusal, verifyRequestAuth, assertMfaStepUp } from '@/lib/firebase-admin';
import { isRecentLogin } from '@/lib/recent-login';
import { receiveWithdrawalDeclaration } from '@/lib/withdrawal-declaration';
import { withdrawalDeps } from '@/lib/withdrawal-queue-store';
import { withdrawalReceiptPendingMessage } from '@/lib/messages/model-consent';

/**
 * POST /api/account/withdraw — the voluntary withdrawal / termination function
 * (C13, Terms section 13; A6 of 3.0.21). Its own path beside the generic
 * erasure (`/api/account/delete`): the form "Withdraw from / end the contract"
 * in Settings posts here.
 *
 * The same sign-in checks as the erasure, because the path ends in it: a
 * recent sign-in and, with a second factor, a step-up. Then
 * `receiveWithdrawalDeclaration`: the declaration is recorded in the proof log,
 * the account is blocked at once (the withdrawal is effective on submission),
 * the receipt goes by e-mail at once, its sending is recorded with the time,
 * and only then is the account deleted. A receipt that did not go out (B8,
 * legal review 06.11.2026) goes into the queue with automatic retries
 * (`lib/withdrawal-queue.ts`) and the deletion follows it: answered 202,
 * `receipt-queued`, with the sentence the person reads — never "try again".
 *
 * The address is the account's sign-in address from the verified ID token,
 * never a value out of a request body; the route reads no body. It is bound to
 * the account, not proven to be its holder's — a password sign-up does not confirm
 * addresses, and a withdrawal must not depend on a confirmation the account
 * was never asked for.
 */

const RECENT_LOGIN_MESSAGE =
  'Security restriction: confirming the withdrawal requires a recent sign-in, because your account is deleted with it. Please sign out, sign back in, and confirm the withdrawal again.';

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
      withdrawalDeps(),
    );
    if (!result.ok && result.code === 'no-address') {
      return NextResponse.json({ error: 'This account has no e-mail address to send the receipt to. Please write to info@clean-core.io.', code: 'no-address' }, { status: 400 });
    }
    if (!result.ok) {
      // Effective and blocked; the receipt is queued and the deletion follows it. Not an error for the person.
      return NextResponse.json(
        {
          success: true,
          effective: true,
          receiptPending: true,
          code: 'receipt-queued',
          receivedAt: result.receivedAt,
          message: withdrawalReceiptPendingMessage(result.receivedAt, 'en'),
          messageDe: withdrawalReceiptPendingMessage(result.receivedAt, 'de'),
        },
        { status: 202 },
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

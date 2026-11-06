import { CONSENT_TEXTS } from '@/lib/legal/consent-texts';
import { PROOF_LOG_RETENTION, type ContractEnding } from '@/lib/proof-log';
import type { MailOutcome } from '@/lib/transactional-mail';
import type { TermsLanguage } from '@/lib/terms-versions';

/**
 * The withdrawal path — C13, Terms section 13, A6 of 3.0.21 (§ 356a BGB as a
 * safeguard). Its own path, not the generic account deletion: the form in
 * Settings posts to `app/api/account/withdraw/route.ts`, which calls this once
 * the sign-in checks have passed. In this order:
 *
 * 1. the declaration is received — the server's clock is the time of receipt —
 *    and recorded in the proof log (`consent_events`, kind
 *    `withdrawal-declared`): the declaration word for word, the contract, the
 *    contract language and the time;
 * 2. the receipt goes by e-mail at once, to the token's verified address, in
 *    the contract language: the declaration, the name, the contract and the
 *    time of receipt (`lib/withdrawal-receipt-email.ts`);
 * 3. that the receipt was sent, and when, is recorded in the proof log as well
 *    (kind `withdrawal-receipt`, with the message id of the delivery record);
 * 4. only then is the account deleted, with the ending `withdrawal-function`
 *    on the record of the end of the contract.
 *
 * Both records are proof-log rows like the acceptances (`lib/consent.ts`):
 * keyed by `userId`, so the erasure keeps them with the keyed hash in place of
 * account and address and their own deletion date (`lib/proof-log-erasure.ts`).
 * No name is written into them — the proof log keeps none (privacy section 5).
 *
 * A receipt that does not go out stops the path before the deletion: the
 * declaration stays on record, the account stays, and the person is told and
 * can confirm again. Nothing is retried in the background.
 *
 * Pure apart from its `deps`, so a spec drives it without a database.
 */

export const WITHDRAWAL_DECLARED_KIND = 'withdrawal-declared';
export const WITHDRAWAL_RECEIPT_KIND = 'withdrawal-receipt';
export const WITHDRAWAL_SOURCE = 'api/account/withdraw';
export const WITHDRAWAL_ENDING: ContractEnding = 'withdrawal-function';

export interface WithdrawalProfile {
  language: TermsLanguage;
  /** First and last name as the account holds them, or '' for none. */
  name: string;
}

export interface WithdrawalDeps {
  now(): Date;
  readProfile(uid: string): Promise<WithdrawalProfile>;
  /** Appends one proof-log row (`consent_events`). */
  record(row: Record<string, unknown>): Promise<void>;
  send(input: { to: string; uid: string; language: TermsLanguage; name: string; receivedAt: string }): Promise<MailOutcome>;
  erase(uid: string, ending: ContractEnding): Promise<void>;
}

export type WithdrawalResult =
  | { ok: true; receivedAt: string; receiptSentAt: string }
  | { ok: false; code: 'no-address' }
  | { ok: false; code: 'receipt-not-sent'; receivedAt: string };

/** The proof-log row of the received declaration. */
export function declarationRecord(input: { uid: string; email: string; language: TermsLanguage; receivedAt: Date }): Record<string, unknown> {
  const t = CONSENT_TEXTS.withdrawal;
  return {
    uid: input.uid,
    userId: input.uid,
    email: input.email,
    kind: WITHDRAWAL_DECLARED_KIND,
    declaration: t.declaration[input.language],
    contract: t.contract[input.language],
    termsLanguage: input.language,
    receivedAt: input.receivedAt,
    source: WITHDRAWAL_SOURCE,
    retention: PROOF_LOG_RETENTION,
    expiresAt: null,
  };
}

/** The proof-log row of the receipt mail: sent or not, and when. */
export function receiptRecord(input: { uid: string; email: string; receivedAt: Date; at: Date; outcome: MailOutcome }): Record<string, unknown> {
  const sent = input.outcome.delivered;
  return {
    uid: input.uid,
    userId: input.uid,
    email: input.email,
    kind: WITHDRAWAL_RECEIPT_KIND,
    status: sent ? 'sent' : 'not-sent',
    receiptSentAt: sent ? input.at : null,
    attemptedAt: input.at,
    messageId: input.outcome.delivered ? input.outcome.messageId : null,
    mocked: input.outcome.delivered ? input.outcome.mocked : false,
    reason: input.outcome.delivered ? null : input.outcome.reason,
    declarationReceivedAt: input.receivedAt,
    source: WITHDRAWAL_SOURCE,
    retention: PROOF_LOG_RETENTION,
    expiresAt: null,
  };
}

export async function receiveWithdrawalDeclaration(
  input: { uid: string; email: string | null | undefined },
  deps: WithdrawalDeps,
): Promise<WithdrawalResult> {
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!email) return { ok: false, code: 'no-address' };

  // 1. Received: the server's clock, then the proof-log row.
  const receivedAt = deps.now();
  const profile = await deps.readProfile(input.uid);
  await deps.record(declarationRecord({ uid: input.uid, email, language: profile.language, receivedAt }));

  // 2. The receipt, at once.
  const outcome = await deps.send({ to: email, uid: input.uid, language: profile.language, name: profile.name, receivedAt: receivedAt.toISOString() });

  // 3. Sent (or not), and when.
  const at = deps.now();
  await deps.record(receiptRecord({ uid: input.uid, email, receivedAt, at, outcome }));
  if (!outcome.delivered) return { ok: false, code: 'receipt-not-sent', receivedAt: receivedAt.toISOString() };

  // 4. Then the deletion.
  await deps.erase(input.uid, WITHDRAWAL_ENDING);
  return { ok: true, receivedAt: receivedAt.toISOString(), receiptSentAt: at.toISOString() };
}

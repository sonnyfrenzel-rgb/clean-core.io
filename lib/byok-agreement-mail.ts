import { escapeHtml } from '@/lib/utils';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import { type ByokAddendumAcceptance, type ByokAgreementEnding } from '@/lib/byok-addendum';
import { BYOK_AGREEMENT_ENDED_SUBJECT, buildAgreementEndedMail } from '@/lib/byok-agreement-email';
import { sendContractConfirmationMail } from '@/lib/contract-confirmation-mail';
import { logger, providerErrorShape } from '@/lib/logger';

/**
 * Sends the confirmation of an acceptance or an ending of the Additional
 * Agreement on Own Model Keys (3.0.21, T03). Server-only. Best effort by
 * design: the proof log in Firestore is the record; the mail is the account's
 * copy of it. A failure is logged as a code and never fails the request, and
 * nothing is retried (legal review E25).
 *
 * `to` is the address of the verified token or the Auth record — never a value
 * out of a request body.
 */
/**
 * The acceptance is confirmed with the contract confirmation C5, in the
 * language version accepted, with its digest and the full wording (T03).
 */
export async function sendAgreementAcceptedMail(
  to: string | null | undefined,
  uid: string,
  acceptance: ByokAddendumAcceptance,
  firstName?: string | null,
): Promise<void> {
  await sendContractConfirmationMail({ to, uid, occasion: 'byok-addendum', language: acceptance.language, addendum: acceptance, firstName });
}

export async function sendAgreementEndedMail(to: string | null | undefined, uid: string, ending: ByokAgreementEnding): Promise<void> {
  if (!to) return;
  try {
    const html = wrapEmailDocument(buildAgreementEndedMail({ recipient: escapeHtml(to), ending, endedAt: new Date().toISOString() }));
    await sendTransactionalMail({ to, subject: BYOK_AGREEMENT_ENDED_SUBJECT, html, label: 'byok-agreement-ended', uid });
  } catch (err) {
    logger.warn('byok agreement mail not sent', { kind: 'ended', error: providerErrorShape(err) });
  }
}

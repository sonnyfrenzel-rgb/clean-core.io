import { escapeHtml } from '@/lib/utils';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail, type MailOutcome } from '@/lib/transactional-mail';
import type { TermsLanguage } from '@/lib/terms-versions';
import { buildWithdrawalReceiptMail, withdrawalReceiptSubject } from '@/lib/withdrawal-receipt-email';
import { logger, providerErrorShape } from '@/lib/logger';

/**
 * Sends the receipt of a declaration to withdraw from / end the contract (C13,
 * Terms section 13). `lib/withdrawal-declaration.ts` calls it as soon as the
 * declaration has been recorded and before the erasure starts: the erasure
 * then pseudonymises this mail's delivery record with the account's others
 * (`retainProofsOfErasedAccount`), so no record with the address in clear
 * outlives the account. Server-only.
 *
 * The outcome is returned, never swallowed: the caller records it in the proof
 * log and deletes the account only once the receipt has gone out. A throw of
 * the provider call becomes a `rejected` outcome, logged as a code.
 *
 * `to` is the address of the verified token, read before the deletion; never
 * a value out of a request body.
 */
export async function sendWithdrawalReceiptMail(input: {
  to: string;
  uid: string;
  language: TermsLanguage;
  name?: string | null;
  receivedAt: string;
}): Promise<MailOutcome> {
  try {
    const subject = withdrawalReceiptSubject(input.language);
    const html = wrapEmailDocument(
      buildWithdrawalReceiptMail({
        language: input.language,
        recipient: escapeHtml(input.to),
        name: escapeHtml((input.name ?? '').trim().slice(0, 120)),
        receivedAt: input.receivedAt,
      }),
      subject,
    );
    return await sendTransactionalMail({ to: input.to, subject, html, label: 'withdrawal-receipt', uid: input.uid });
  } catch (err) {
    logger.warn('withdrawal receipt not sent', { error: providerErrorShape(err) });
    return { delivered: false, reason: 'rejected', detail: 'The receipt could not be sent.' };
  }
}

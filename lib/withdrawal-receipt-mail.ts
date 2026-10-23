import { escapeHtml } from '@/lib/utils';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import type { TermsLanguage } from '@/lib/terms-versions';
import { buildWithdrawalReceiptMail, withdrawalReceiptSubject } from '@/lib/withdrawal-receipt-email';
import { logger, providerErrorShape } from '@/lib/logger';

/**
 * Sends the receipt of a declaration to withdraw from / end the contract (C13,
 * Terms section 13). `POST /api/account/delete` calls it once every check of
 * the declaration has passed and before the erasure starts: the erasure then
 * pseudonymises this mail's delivery record with the account's others
 * (`retainProofsOfErasedAccount`), so no record with the address in clear
 * outlives the account. Server-only and best effort, like the other
 * confirmations (E14/E25): a failure is logged as a code, never stops the
 * deletion, and nothing is retried or resent.
 *
 * `to` is the address of the verified token, read before the deletion; never
 * a value out of a request body.
 */
export async function sendWithdrawalReceiptMail(input: {
  to: string | null | undefined;
  uid: string;
  language: TermsLanguage;
  firstName?: string | null;
  receivedAt: string;
}): Promise<void> {
  if (!input.to) return;
  try {
    const subject = withdrawalReceiptSubject(input.language);
    const html = wrapEmailDocument(
      buildWithdrawalReceiptMail({
        language: input.language,
        recipient: escapeHtml(input.to),
        firstName: escapeHtml((input.firstName ?? '').trim().slice(0, 60)),
        receivedAt: input.receivedAt,
      }),
      subject,
    );
    await sendTransactionalMail({ to: input.to, subject, html, label: 'withdrawal-receipt', uid: input.uid });
  } catch (err) {
    logger.warn('withdrawal receipt not sent', { error: providerErrorShape(err) });
  }
}

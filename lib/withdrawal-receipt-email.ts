import { APP_BASE_URL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import { CONSENT_TEXTS } from '@/lib/legal/consent-texts';
import type { TermsLanguage } from '@/lib/terms-versions';

/**
 * The receipt of a declaration to withdraw from / end the contract — C13 of
 * the legal texts (owner decision 23.10.2026 after the lawyer's feedback,
 * § 356a BGB as a safeguard; Terms section 13).
 *
 * The account-deletion path is offered, voluntarily, as a withdrawal and
 * termination function as well: the entry "Withdraw from / end the contract"
 * in Settings and in the signed-in footer leads to the deletion confirmation,
 * and once the declaration has been received, this mail confirms that and
 * when, and says that the account is being deleted. One mail, no resend, no advertising; in
 * the language of the Terms the account accepted (the contract language,
 * Terms 1.4). The plain user-mail layout, one link: the Terms.
 *
 * `recipient` must be HTML-escaped by the caller.
 */

export function withdrawalReceiptSubject(language: TermsLanguage): string {
  return CONSENT_TEXTS.withdrawal.receiptSubject[language];
}

export interface WithdrawalReceiptInput {
  language: TermsLanguage;
  /** HTML-escaped address the mail goes to. */
  recipient: string;
  /** HTML-escaped first name, or '' for none. */
  firstName: string;
  /** ISO time the server received the declaration. */
  receivedAt: string;
}

export function buildWithdrawalReceiptMail(input: WithdrawalReceiptInput): string {
  const t = CONSENT_TEXTS.withdrawal;
  const l = input.language;
  const hello = l === 'de' ? (input.firstName ? `Hallo ${input.firstName},` : 'Hallo,') : input.firstName ? `Hello ${input.firstName},` : 'Hello,';
  return buildUserMail({
    greeting: hello,
    paragraphs: [
      t.receiptReceived[l],
      `<strong>${t.receiptAt[l]}:</strong> ${input.receivedAt} (UTC)`,
      t.receiptEffect[l],
    ],
    link: { lead: t.receiptLinkLead[l], url: `${APP_BASE_URL}${l === 'de' ? '/terms/de' : '/terms'}` },
    signature: 'Felix',
    footer: [t.receiptFooter[l].replace('{E-Mail}', input.recipient)],
  });
}

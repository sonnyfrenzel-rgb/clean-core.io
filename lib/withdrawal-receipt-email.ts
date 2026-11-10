import { APP_BASE_URL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import { CONSENT_TEXTS } from '@/lib/legal/consent-texts';
import type { TermsLanguage } from '@/lib/terms-versions';
import { quotedDeclaration } from '@/lib/contract-withdrawal';

/**
 * The receipt of a declaration to withdraw from / end the contract — C13 of
 * the legal texts (owner decision 23.10.2026, § 356a BGB as a safeguard;
 * Terms section 13; A6 of 3.0.21).
 *
 * "Withdraw from / end the contract" in Settings and in the signed-in footer
 * opens the withdrawal form, and once the declaration has been received this
 * mail confirms it: the declaration word for word, the name, the contract and
 * the time the server received it, and that the account is being deleted. It
 * goes out at once and before the deletion (`lib/withdrawal-declaration.ts`).
 * One mail, no advertising; in the language of the Terms the account accepted
 * (the contract language, Terms 1.4). The plain user-mail layout, one link:
 * the Terms.
 *
 * `recipient` and `name` must be HTML-escaped by the caller.
 */

export function withdrawalReceiptSubject(language: TermsLanguage): string {
  return CONSENT_TEXTS.withdrawal.receiptSubject[language];
}

export interface WithdrawalReceiptInput {
  language: TermsLanguage;
  /** HTML-escaped address the mail goes to. */
  recipient: string;
  /** HTML-escaped full name of the account, or '' for none. */
  name: string;
  /** ISO time the server received the declaration. */
  receivedAt: string;
}

export function buildWithdrawalReceiptMail(input: WithdrawalReceiptInput): string {
  const t = CONSENT_TEXTS.withdrawal;
  const l = input.language;
  const hello = l === 'de' ? (input.name ? `Hallo ${input.name},` : 'Hallo,') : input.name ? `Hello ${input.name},` : 'Hello,';
  return buildUserMail({
    greeting: hello,
    paragraphs: [
      t.receiptReceived[l],
      `<strong>${t.receiptDeclaration[l]}:</strong> ${quotedDeclaration(l)}`,
      [
        `<strong>${t.receiptName[l]}:</strong> ${input.name || '&ndash;'}`,
        `<strong>${t.receiptContract[l]}:</strong> ${t.contract[l]}`,
        `<strong>${t.receiptAt[l]}:</strong> ${input.receivedAt} (UTC)`,
      ].join('<br>'),
      t.receiptEffect[l],
    ],
    link: { lead: t.receiptLinkLead[l], url: `${APP_BASE_URL}${l === 'de' ? '/terms/de' : '/terms'}` },
    signature: 'Felix',
    footer: [t.receiptFooter[l].replace('{E-Mail}', input.recipient)],
  });
}

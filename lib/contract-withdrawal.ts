import { CONSENT_TEXTS } from '@/lib/legal/consent-texts';

/**
 * The voluntary withdrawal / termination function — C13 of the legal texts
 * (owner decision 23.10.2026, § 356a BGB as a safeguard; Terms section 13;
 * A6 of 3.0.21). One place for its anchor, its labels and its highlight, so
 * Settings and the signed-in footer cannot name or show it differently.
 *
 * Its own path, not the generic deletion: the link opens Settings at the
 * withdrawal entry with the withdrawal form open — name, account address and
 * contract shown, the button "Confirm withdrawal · Widerruf bestätigen" — and
 * `/api/account/withdraw` records the declaration, sends the receipt, records
 * that, and then deletes the account (`lib/withdrawal-declaration.ts`).
 */

export const END_CONTRACT_ID = 'end-contract';

export const END_CONTRACT_HREF = `/settings#${END_CONTRACT_ID}`;

/** The label, English (the interface language). */
export const END_CONTRACT_LABEL = CONSENT_TEXTS.withdrawal.label.en;

/** The German label, shown beside it for an account that contracted in German. */
export const END_CONTRACT_LABEL_DE = CONSENT_TEXTS.withdrawal.label.de;

/**
 * The binding button of the withdrawal form, English with the German beside it
 * as the label has them: "Confirm withdrawal · Widerruf bestätigen" — never
 * only "Delete account".
 */
export const END_CONTRACT_CONFIRM_LABEL = `${CONSENT_TEXTS.withdrawal.confirm.en} · ${CONSENT_TEXTS.withdrawal.confirm.de}`;

/** The declaration in the quotation marks of its language, as the form shows it and the receipt repeats it. */
export function quotedDeclaration(language: 'de' | 'en'): string {
  const d = CONSENT_TEXTS.withdrawal.declaration[language];
  return language === 'de' ? `„${d}“` : `"${d}"`;
}

/**
 * The footer link, highlighted against the muted legal links beside it: bold,
 * in full ink, underlined. Existing tokens only.
 */
export const END_CONTRACT_FOOTER_CLASS =
  'font-bold text-cc-ink underline underline-offset-4 hover:text-cc-brand-strong';

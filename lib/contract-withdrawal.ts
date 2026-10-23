import { CONSENT_TEXTS } from '@/lib/legal/consent-texts';

/**
 * The voluntary withdrawal / termination function — C13 of the legal texts
 * (owner decision 23.10.2026 after the lawyer's feedback, § 356a BGB as a
 * safeguard; Terms section 13). One place for its anchor and its label, so
 * Settings and the signed-in footer cannot name it differently.
 *
 * The entry is the account deletion, labelled additionally: the link opens
 * Settings at the Danger Zone with the deletion confirmation open, and the
 * route sends the receipt (`lib/withdrawal-receipt-mail.ts`).
 */

export const END_CONTRACT_ID = 'end-contract';

export const END_CONTRACT_HREF = `/settings#${END_CONTRACT_ID}`;

/** The label, English (the interface language). */
export const END_CONTRACT_LABEL = CONSENT_TEXTS.withdrawal.label.en;

/** The German label, shown beside it for an account that contracted in German. */
export const END_CONTRACT_LABEL_DE = CONSENT_TEXTS.withdrawal.label.de;

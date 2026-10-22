/**
 * The Additional Agreement on Own Model Keys (ZV-BYOK-1.0) — what the product
 * needs of it, in one place (roadmap 3.0.21, owner 22.10.2026: the own Claude
 * key is offered as a BYOK feature; legal review of 22.10.2026, E24–E27, T01,
 * T03).
 *
 * An own **Anthropic** key is stored only together with an acceptance of this
 * agreement; a Gemini key needs none (sections 5.2–5.4 of the Terms alone apply
 * to it). The agreement's full wording is a legal page
 * (`/terms/byok-addendum`, German `/terms/byok-addendum/de`); this module holds
 * the version, the acceptance sentence (E26) and the notices the key card shows
 * (E27). It does not paraphrase the agreement.
 *
 * **What an acceptance records** (`byok_agreement_events`, written by the
 * Admin SDK only — `lib/firebase-admin.ts`, `recordByokAgreementEvent`): the
 * version, the **language version of the text the account accepted** (not the
 * interface locale — the key card lets the reader accept the English or the
 * German wording), the digest of that wording where it is archived, the server
 * time and the account. An ending is recorded the same way, with how it ended.
 * Each acceptance belongs to one storing of a key: storing an Anthropic key
 * again accepts the version then in force again (T03).
 *
 * **Why the checkbox is one sentence.** The review struck the earlier
 * "I am aware that …" confirmation: a confirmation of facts in standard terms
 * does not hold against consumers (§ 309 no. 12 b BGB). The information stands
 * in the notices above the box; the box accepts the agreement, whose clause 9
 * carries the account's warranty that its Anthropic account is a business
 * account held with Anthropic Ireland, Limited. There is deliberately no second
 * "I confirm …" box.
 *
 * Pure: no imports, so the settings card, the save route and the specs share it.
 */

/** The version an acceptance names. A new wording is a new version. */
export const BYOK_ADDENDUM_VERSION = 'ZV-BYOK-1.0';

/** The language versions of the agreement a reader can accept. */
export const BYOK_ADDENDUM_LANGUAGES = ['en', 'de'] as const;
export type ByokAddendumLanguage = (typeof BYOK_ADDENDUM_LANGUAGES)[number];

export function isByokAddendumLanguage(value: unknown): value is ByokAddendumLanguage {
  return typeof value === 'string' && (BYOK_ADDENDUM_LANGUAGES as readonly string[]).includes(value);
}

/** Where each language version of the full wording is published. */
export const BYOK_ADDENDUM_PATH: Readonly<Record<ByokAddendumLanguage, string>> = {
  en: '/terms/byok-addendum',
  de: '/terms/byok-addendum/de',
};

/** The language names a reader chooses between, each in its own language. */
export const BYOK_ADDENDUM_LANGUAGE_LABEL: Readonly<Record<ByokAddendumLanguage, string>> = {
  en: 'English',
  de: 'Deutsch',
};

/**
 * The acceptance sentence beside the checkbox — legal review E26, word for
 * word, per language version. The address in brackets is the published page.
 */
export const BYOK_ADDENDUM_ACCEPT_TEXT: Readonly<Record<ByokAddendumLanguage, string>> = {
  en: `I accept the Additional Agreement on Own Model Keys (${BYOK_ADDENDUM_VERSION}, Anthropic; full wording: clean-core.io/terms/byok-addendum).`,
  de: `Ich nehme die Zusatzvereinbarung zu eigenen Modellschlüsseln (${BYOK_ADDENDUM_VERSION}, Anthropic; vollständiger Wortlaut: clean-core.io/terms/byok-addendum/de) an.`,
};

/**
 * SHA-256 of each archived language version's wording (LF-normalised), as
 * `lib/terms-versions.ts` pins the Terms. Empty until the wording is archived
 * with its page; an acceptance then records `null` — "the wording is not
 * pinned for this version" — and never a digest of something adjacent
 * (`lib/consent.ts` explains why).
 */
export const BYOK_ADDENDUM_DIGESTS: Readonly<Record<string, Partial<Record<ByokAddendumLanguage, string>>>> = {};

export function byokAddendumSha256(version: string, language: ByokAddendumLanguage): string | null {
  return BYOK_ADDENDUM_DIGESTS[version]?.[language] ?? null;
}

/** Which providers' keys need the agreement. */
export function addendumRequired(provider: string): boolean {
  return provider === 'anthropic';
}

/** The code a save carries when the acceptance is missing or names another version. */
export const ADDENDUM_REQUIRED_CODE = 'byok-addendum-required';

export interface ByokAddendumAcceptance {
  version: string;
  language: ByokAddendumLanguage;
}

/**
 * Reads the acceptance a save request carries:
 * `{ addendum: { version, language, accepted: true } }`. Only the version in
 * force and a published language version count; anything else is no
 * acceptance. The digest is never taken from the request — the server derives
 * it from the version and language it records.
 */
export function addendumAcceptanceOf(body: unknown): ByokAddendumAcceptance | null {
  const a = (body as { addendum?: unknown } | null)?.addendum as { version?: unknown; language?: unknown; accepted?: unknown } | undefined;
  if (!a || typeof a !== 'object') return null;
  if (a.accepted !== true || a.version !== BYOK_ADDENDUM_VERSION || !isByokAddendumLanguage(a.language)) return null;
  return { version: a.version, language: a.language };
}

/** How an agreement ended, as the proof log records it. */
export type ByokAgreementEnding =
  /** "Delete key and end agreement" in Settings. */
  | 'settings'
  /** A declaration in text form to the operator, who blocked and then deleted the key (clause 11). */
  | 'text-form'
  /** The Anthropic key was replaced by a Gemini key. */
  | 'replaced';

export type ByokAgreementEvent =
  | { kind: 'accepted'; version: string; language: ByokAddendumLanguage }
  | { kind: 'blocked' }
  | { kind: 'ended'; ending: ByokAgreementEnding };

/**
 * The notices of the key card — legal review E27 (C3 for Anthropic, C4 for
 * Gemini), English as the interface is. Shown above the key field, before
 * anything is stored.
 */
export const OWN_KEY_NOTICES = {
  anthropic: {
    field:
      'Charges of the model provider arise in your own contractual relationship with Anthropic; we neither bill nor reimburse them. We call Anthropic with the data region “us” (10 % surcharge on Anthropic’s standard price, which you bear). Requirement: a business account with Anthropic Ireland, Limited.',
    points: [
      {
        title: 'Your contract with Anthropic',
        text: 'Anthropic offers its API for business use only. Store only the key of a business account held with Anthropic Ireland, Limited.',
      },
      {
        title: 'Outside the EU',
        text: 'We call Anthropic with the data region “us”; your request is processed only in the United States, and data at rest is kept in the United States according to Anthropic. The transfer to the United States is made by Anthropic Ireland, Limited as your processor; Anthropic is not certified under the EU-U.S. Data Privacy Framework.',
      },
      {
        title: 'Ending',
        text: 'You end the agreement at any time with “Delete key and end agreement” in the settings (two-factor sign-in required) or with a message to info@clean-core.io; the platform key then applies again. Your account and projects remain.',
      },
    ],
  },
  gemini: {
    field: null,
    points: [
      {
        title: 'Tier',
        text: 'Use a key from a Google Cloud project with an active Cloud Billing account (paid tier); only there does Google not use your requests for training, and limited logging serves only abuse detection and legally required disclosures. For users in the EEA, Switzerland and the UK, Google applies these rules under its terms (as of 28 April 2026) to the unpaid quota as well; outside those regions, without a billing account, Google’s free-tier terms apply (use for training, human review).',
      },
    ],
  },
} as const;

/** The automatic-steps notice and switch label (E27, C3/C4 "Automatic steps"). */
export function autoStepsNotice(providerLabel: string): string {
  return `We start some steps ourselves when a project is opened. On your ${providerLabel} key they run only if you switch this on here.`;
}
export const AUTO_STEPS_SWITCH_LABEL = 'Automatic steps on my key';

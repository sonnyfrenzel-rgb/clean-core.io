import { legalBlocks, type LegalBlock } from './markup';
import type { LegalLang } from './open-values';
import { PRIVACY_DE } from './texts/privacy.de';
import { PRIVACY_EN } from './texts/privacy.en';
import { TERMS_DE } from './texts/terms.de';
import { TERMS_EN } from './texts/terms.en';
import { BYOK_ADDENDUM_DE } from './texts/byok-addendum.de';
import { BYOK_ADDENDUM_EN } from './texts/byok-addendum.en';

/**
 * The published legal documents of Fassung 1.1 — one entry per document and
 * language, with the route that publishes it. The trust page and the consent
 * texts are listed separately (`lib/legal/trust-texts.ts`,
 * `lib/legal/consent-texts.ts`) because they are not one flowing text.
 *
 * `tests/legal-texts-release-gate.spec.ts` walks this list.
 */

export type LegalDocumentId = 'privacy' | 'terms' | 'byok-addendum';

export interface PublishedLegalDocument {
  id: LegalDocumentId;
  lang: LegalLang;
  route: string;
  source: string;
}

export const LEGAL_DOCUMENTS: readonly PublishedLegalDocument[] = [
  { id: 'privacy', lang: 'en', route: '/datenschutz', source: PRIVACY_EN },
  { id: 'privacy', lang: 'de', route: '/datenschutz/de', source: PRIVACY_DE },
  { id: 'terms', lang: 'en', route: '/terms', source: TERMS_EN },
  { id: 'terms', lang: 'de', route: '/terms/de', source: TERMS_DE },
  { id: 'byok-addendum', lang: 'en', route: '/terms/byok-addendum', source: BYOK_ADDENDUM_EN },
  { id: 'byok-addendum', lang: 'de', route: '/terms/byok-addendum/de', source: BYOK_ADDENDUM_DE },
];

export function legalDocument(id: LegalDocumentId, lang: LegalLang): PublishedLegalDocument {
  const doc = LEGAL_DOCUMENTS.find((d) => d.id === id && d.lang === lang);
  if (!doc) throw new Error(`no legal document ${id}/${lang}`);
  return doc;
}

/** The rendered blocks of a document, open values filled in. */
export function legalDocumentBlocks(id: LegalDocumentId, lang: LegalLang): LegalBlock[] {
  return legalBlocks(legalDocument(id, lang).source, lang);
}

/** The identifier of the Additional Agreement in force. */
export const BYOK_ADDENDUM_ID = 'ZV-BYOK-1.0';

/** The label the Terms of Service v2.3.0 call themselves. */
export const TERMS_LABEL = 'v2.3.0';

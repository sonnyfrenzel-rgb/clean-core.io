import { BYOK_ADDENDUM_ID, TERMS_LABEL, legalDocument, legalDocumentBlocks } from './documents';
import { toArchiveMarkdown } from './markup';
import type { LegalLang } from './open-values';

/**
 * The wording a sign-up or amendment dialog offers, as the file the reader can
 * save or print (§ 312i Abs. 1 S. 1 Nr. 4 BGB; legal review of 06.11.2026).
 *
 * It is the archive form of the document (`toArchiveMarkdown`), the very bytes
 * `scripts/legal/archive-terms.ts` writes and hashes: the SHA-256 of the saved
 * file is the hash value the consent record and the confirmation mail name.
 * Loaded on demand by `components/legal/SaveWordingActions.tsx`, so the texts
 * are not part of a dialog's first load.
 */

export type OfferedDocument = 'terms' | 'byok-addendum';

export interface WordingFile {
  filename: string;
  text: string;
  /** What the document is called, for the hint ("Nutzungsbedingungen v2.3.0"). */
  title: string;
  /** Where it is published, for the fallback ("clean-core.io/terms/de"). */
  address: string;
}

const NAME: Record<OfferedDocument, Record<LegalLang, string>> = {
  terms: { de: 'Nutzungsbedingungen', en: 'Terms of Service' },
  'byok-addendum': { de: 'Zusatzvereinbarung zu eigenen Modellschlüsseln', en: 'Additional Agreement on Own Model Keys' },
};

const SLUG: Record<OfferedDocument, Record<LegalLang, string>> = {
  terms: { de: 'nutzungsbedingungen', en: 'terms-of-service' },
  'byok-addendum': { de: 'zusatzvereinbarung', en: 'additional-agreement' },
};

export function wordingFile(id: OfferedDocument, lang: LegalLang): WordingFile {
  const version = id === 'terms' ? TERMS_LABEL : BYOK_ADDENDUM_ID;
  return {
    filename: `clean-core-${SLUG[id][lang]}-${version}-${lang}.txt`,
    text: toArchiveMarkdown(legalDocumentBlocks(id, lang)),
    title: `${NAME[id][lang]} ${version}`,
    address: `clean-core.io${legalDocument(id, lang).route}`,
  };
}

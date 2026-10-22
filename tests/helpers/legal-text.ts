import { legalDocumentBlocks, type LegalDocumentId } from '../../lib/legal/documents';
import { blockText, legalBlocks, type LegalBlock } from '../../lib/legal/markup';
import type { LegalLang } from '../../lib/legal/open-values';
import { TRUST_EN, TRUST_INTRO_EN } from '../../lib/legal/texts/trust.en';

/**
 * The legal texts as a reader gets them, for source-level guards.
 *
 * Since Fassung 1.1 (3.0.21) the words of the privacy policy, the Terms and the
 * trust page are not in the page files any more but in `lib/legal/texts/*`,
 * rendered through `lib/legal/markup.ts` with the open values filled in. A
 * guard that used to read `app/datenschutz/page.tsx` reads this instead: the
 * same words the page shows, without markup.
 */

/** Plain text of a whole document, one block per line. */
export function legalPlainText(id: LegalDocumentId, lang: LegalLang): string {
  return legalDocumentBlocks(id, lang).map(blockText).join('\n');
}

/** The blocks of a document. */
export function legalDocBlocks(id: LegalDocumentId, lang: LegalLang): LegalBlock[] {
  return legalDocumentBlocks(id, lang);
}

/** Plain text of the trust page. */
export function trustPlainText(): string {
  return [...legalBlocks(TRUST_INTRO_EN, 'en'), ...legalBlocks(TRUST_EN, 'en')].map(blockText).join('\n');
}

/** The level-2 sections of a document: heading, anchor and the plain text of each body block. */
export function legalSections(id: LegalDocumentId, lang: LegalLang): { heading: string; id?: string; body: string[] }[] {
  const out: { heading: string; id?: string; body: string[] }[] = [];
  for (const b of legalDocumentBlocks(id, lang)) {
    if (b.kind === 'heading' && b.level === 2) out.push({ heading: b.text, id: b.id, body: [] });
    else if (out.length && !(b.kind === 'heading' && b.level === 1)) out[out.length - 1].body.push(blockText(b));
  }
  return out;
}

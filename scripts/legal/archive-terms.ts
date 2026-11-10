/**
 * Writes the archive files of the legal texts in force from their sources:
 *
 *   docs/terms/<TERMS_VERSION>.md        Terms of Service, English
 *   docs/terms/<TERMS_VERSION>.de.md     Nutzungsbedingungen, deutsch
 *   docs/byok-addendum/<id>.md           Additional Agreement, English
 *   docs/byok-addendum/<id>.de.md        Zusatzvereinbarung, deutsch
 *
 * and prints the SHA-256 of each, for `lib/terms-versions.ts` and
 * `lib/legal/byok-addendum-versions.ts`.
 *
 *   npx tsx scripts/legal/archive-terms.ts
 *
 * Run it only for a version that has not been published yet — after the owner
 * has answered an open value, for instance. A published version is never
 * rewritten (`tests/terms-version-archive.spec.ts`); a change after
 * publication is a new version. `tests/legal-archive-sync.spec.ts` fails while
 * an archive file and its source disagree, so a forgotten run cannot ship.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TERMS_VERSION } from '../../lib/constants';
import { legalDocumentBlocks, BYOK_ADDENDUM_ID } from '../../lib/legal/documents';
import { toArchiveMarkdown } from '../../lib/legal/markup';

const ROOT = path.resolve(__dirname, '..', '..');

const targets: Array<[string, string]> = [
  [`docs/terms/${TERMS_VERSION}.md`, toArchiveMarkdown(legalDocumentBlocks('terms', 'en'))],
  [`docs/terms/${TERMS_VERSION}.de.md`, toArchiveMarkdown(legalDocumentBlocks('terms', 'de'))],
  [`docs/byok-addendum/${BYOK_ADDENDUM_ID}.md`, toArchiveMarkdown(legalDocumentBlocks('byok-addendum', 'en'))],
  [`docs/byok-addendum/${BYOK_ADDENDUM_ID}.de.md`, toArchiveMarkdown(legalDocumentBlocks('byok-addendum', 'de'))],
];

for (const [rel, text] of targets) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  console.log(`${sha}  ${rel}`);
}

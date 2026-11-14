/**
 * Writes the archive files of the privacy policy from its source, one per version and language:
 *
 *   docs/privacy/<id>.md       Privacy Policy, English
 *   docs/privacy/<id>.de.md    Datenschutzerklärung, deutsch
 *
 * and prints the SHA-256 of each, for `lib/legal/privacy-versions.ts`.
 *
 *   npx tsx scripts/legal/archive-privacy.ts [<id> ...]
 *
 * Without ids it writes every version the source renders. Run it only for a version that has not been published
 * yet: a published version is never rewritten, and `tests/legal-names-wording.spec.ts` fails while an archived file,
 * its digest and the source disagree.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { legalBlocks, toArchiveMarkdown } from '../../lib/legal/markup';
import { PRIVACY_POLICY_VERSIONS } from '../../lib/legal/privacy-versions';
import { privacyDeFor } from '../../lib/legal/texts/privacy.de';
import { privacyEnFor } from '../../lib/legal/texts/privacy.en';

const ROOT = path.resolve(__dirname, '..', '..');
const wanted = process.argv.slice(2);

for (const v of PRIVACY_POLICY_VERSIONS) {
  if (wanted.length > 0 && !wanted.includes(v.id)) continue;
  for (const lang of ['en', 'de'] as const) {
    const source = lang === 'de' ? privacyDeFor(v.namesAutomatic) : privacyEnFor(v.namesAutomatic);
    const text = toArchiveMarkdown(legalBlocks(source, lang));
    const abs = path.join(ROOT, v.files[lang]);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    console.log(`${sha}  ${v.files[lang]}`);
  }
}

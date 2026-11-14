/**
 * Writes the archive files of the privacy policy from its source, one per version and language:
 *
 *   docs/privacy/<id>.md       Privacy Policy, English
 *   docs/privacy/<id>.de.md    Datenschutzerklärung, deutsch
 *
 * and prints the SHA-256 of each, for `lib/legal/privacy-versions.ts`.
 *
 *   npx tsx scripts/legal/archive-privacy.ts [<id> ...] [--force]
 *
 * Without ids it handles every version the source renders. A file that already exists is never overwritten: when
 * its content is the rendering it is left as it is, when it differs the script names it and stops with exit code 1
 * before writing anything. Only `--force` overwrites, only for the ids named with it, and only for a version not
 * published yet (`publishedPrivacyVersions`) — a published version is never rewritten, `--force` without ids is
 * refused, and `tests/legal-names-wording.spec.ts` fails while an archived file, its digest and the source disagree.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { legalBlocks, toArchiveMarkdown } from '../../lib/legal/markup';
import { PRIVACY_POLICY_VERSIONS, publishedPrivacyVersions, type PrivacyPolicyVersion } from '../../lib/legal/privacy-versions';
import { privacyDeFor } from '../../lib/legal/texts/privacy.de';
import { privacyEnFor } from '../../lib/legal/texts/privacy.en';

export interface ArchiveResult {
  /** Files written now (new, or overwritten with `force`). */
  written: string[];
  /** Files that already hold the rendering. */
  unchanged: string[];
  /**
   * Existing files whose content differs from the rendering and that `force` may not overwrite (not named, or
   * published); nothing is written while there is one.
   */
  refused: string[];
  digests: Array<{ file: string; sha256: string }>;
}

export function archivePrivacy(options: {
  root: string;
  wanted?: readonly string[];
  force?: boolean;
  versions?: readonly PrivacyPolicyVersion[];
  /** Ids of the versions already published; default: those of this build (`publishedPrivacyVersions`). */
  published?: readonly string[];
}): ArchiveResult {
  const { root, wanted = [], force = false, versions = PRIVACY_POLICY_VERSIONS } = options;
  const published = new Set(options.published ?? publishedPrivacyVersions().map((v) => v.id));
  // `force` reaches only a version named with it that is not published yet.
  const overwritable = (id: string) => force && wanted.includes(id) && !published.has(id);
  const planned: Array<{ id: string; file: string; abs: string; text: string; exists: boolean; same: boolean }> = [];
  for (const v of versions) {
    if (wanted.length > 0 && !wanted.includes(v.id)) continue;
    for (const lang of ['en', 'de'] as const) {
      const source = lang === 'de' ? privacyDeFor(v.namesAutomatic) : privacyEnFor(v.namesAutomatic);
      const text = toArchiveMarkdown(legalBlocks(source, lang));
      const abs = path.join(root, v.files[lang]);
      const exists = fs.existsSync(abs);
      planned.push({ id: v.id, file: v.files[lang], abs, text, exists, same: exists && fs.readFileSync(abs, 'utf8') === text });
    }
  }
  const result: ArchiveResult = { written: [], unchanged: [], refused: [], digests: [] };
  result.refused = planned.filter((p) => p.exists && !p.same && !overwritable(p.id)).map((p) => p.file);
  if (result.refused.length > 0) return result;
  for (const p of planned) {
    result.digests.push({ file: p.file, sha256: crypto.createHash('sha256').update(p.text, 'utf8').digest('hex') });
    if (p.same) {
      result.unchanged.push(p.file);
      continue;
    }
    fs.mkdirSync(path.dirname(p.abs), { recursive: true });
    fs.writeFileSync(p.abs, p.text, 'utf8');
    result.written.push(p.file);
  }
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const result = archivePrivacy({ root: path.resolve(__dirname, '..', '..'), wanted: args.filter((a) => a !== '--force'), force });
  if (result.refused.length > 0) {
    console.error(`Not written: these archived files differ from the source; only --force with the id of a version not yet published overwrites one:\n  ${result.refused.join('\n  ')}`);
    process.exit(1);
  }
  for (const d of result.digests) console.log(`${d.sha256}  ${d.file}${result.unchanged.includes(d.file) ? '  (unchanged)' : ''}`);
}

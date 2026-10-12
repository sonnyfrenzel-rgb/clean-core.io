/**
 * scripts/sync-sap-identifiers.ts
 *
 * Weekly sync of SAP identifier facts into lib/abap/generated/sap-identifiers.json
 * (owner, 12.10.2026; roadmap 3.0.12). Reads only sources whose terms allow
 * automated reading — today the SAP Cloudification Repository on GitHub
 * (Apache-2.0): the CDS views SAP has released for the public and the private
 * edition, and the BAPIs SAP classifies as classic APIs. SAP Help Portal, the
 * Business Accelerator Hub and the Fiori apps library are not fetched: SAP's
 * Terms of Use for SAP Websites §4 forbid automated extraction, so their facts
 * stay in the hand-checked list in lib/sap-identifiers.ts. Why, source by
 * source: lib/sap-identifier-sync.ts.
 *
 * Polite: one request at a time with a pause, retries with backoff on 429 and
 * 5xx, a user agent naming the project, a hard cap of requests and bytes, an
 * optional on-disk cache (SAP_ID_SYNC_CACHE=<dir>). A list that fails or comes
 * back shorter than its minimum keeps the previous list — the file is never
 * truncated by a partial fetch.
 *
 * The log carries counts and IDs only, never file content (Actions logs of
 * this repository are public).
 *
 * Usage:
 *   npx tsx scripts/sync-sap-identifiers.ts           # fetch, report, write when the facts changed
 *   npx tsx scripts/sync-sap-identifiers.ts --check   # fetch and report only; exit 1 when the facts changed
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  SAP_NAME_LIST_SPECS,
  buildIdentifierFile,
  classicBapiNames,
  comparable,
  politeFetcher,
  readIdentifierFile,
  releasedCdsNames,
  type ListResult,
} from '../lib/sap-identifier-sync';

const OUT_FILE = path.resolve(__dirname, '../lib/abap/generated/sap-identifiers.json');

function diskCache(dir: string | undefined) {
  if (!dir) return undefined;
  mkdirSync(dir, { recursive: true });
  const file = (url: string) => path.join(dir, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`);
  return {
    get: (url: string) => (existsSync(file(url)) ? readFileSync(file(url), 'utf8') : null),
    set: (url: string, body: string) => writeFileSync(file(url), body),
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const previous = existsSync(OUT_FILE) ? readIdentifierFile(JSON.parse(readFileSync(OUT_FILE, 'utf8'))) : readIdentifierFile(null);
  const fetcher = politeFetcher({ cache: diskCache(process.env.SAP_ID_SYNC_CACHE), maxRequests: SAP_NAME_LIST_SPECS.length * 4 });

  const results: ListResult[] = [];
  for (const spec of SAP_NAME_LIST_SPECS) {
    const fetchedAt = new Date().toISOString();
    try {
      const body = await fetcher.text(spec.url);
      const sha = createHash('sha256').update(body).digest('hex');
      const json = JSON.parse(body);
      const names = spec.key === 'bapi-classic' ? classicBapiNames(json) : releasedCdsNames(json);
      console.log(`[sync] ${spec.key}: ${names === null ? 'unexpected format' : `${names.length} names`} (minimum ${spec.minCount})`);
      results.push({ key: spec.key, names, fetchedAt, sourceSha256: sha });
    } catch (e) {
      console.log(`[sync] ${spec.key}: fetch failed (${(e as Error).message.replace(/https?:\/\/\S+/g, '<url>')})`);
      results.push({ key: spec.key, names: null, fetchedAt, sourceSha256: null });
    }
  }

  const { file, replaced, kept } = buildIdentifierFile(previous, results, new Date().toISOString());
  console.log(`[sync] replaced: ${replaced.join(', ') || 'none'}; kept previous: ${kept.join(', ') || 'none'}`);
  for (const l of file.lists) console.log(`[sync] ${l.key}: ${l.count} names, ${l.status}`);
  const s = file.summary;
  console.log(`[sync] by kind: ${JSON.stringify(s.byKind)}`);
  console.log(`[sync] added ${s.addedCount}${s.added.length ? ` (${s.added.join(', ')}${s.addedCount > s.added.length ? ', …' : ''})` : ''}`);
  console.log(`[sync] removed ${s.removedCount}${s.removed.length ? ` (${s.removed.join(', ')}${s.removedCount > s.removed.length ? ', …' : ''})` : ''}`);

  const changed = comparable(file) !== comparable(previous);
  if (check) {
    console.log(changed ? '[sync] the facts changed' : '[sync] no change');
    process.exit(changed ? 1 : 0);
  }
  if (!changed) {
    console.log('[sync] no change — file left as it is');
    return;
  }
  writeFileSync(OUT_FILE, `${JSON.stringify(file, null, 1)}\n`);
  console.log(`[sync] wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((e) => {
  console.error('[sync] failed:', (e as Error).message);
  process.exit(1);
});

/**
 * scripts/sync-sap-identifiers.ts
 *
 * Weekly sync of SAP identifier facts into lib/abap/generated/sap-identifiers.json
 * (owner, 12.10.2026; roadmap 3.0.12). Reads only sources whose terms allow
 * automated reading — today the SAP Cloudification Repository on GitHub
 * (Apache-2.0): the CDS views SAP has released for the public and the private
 * edition, and the BAPIs SAP classifies as classic APIs; and the pinned
 * documents of SAP's documentation sources on GitHub (github.com/SAP-docs,
 * CC BY 4.0), read through api.github.com at each repository's HEAD commit
 * after its REUSE.toml (or LICENSE) is checked: communication scenario IDs and
 * the titles the text pairs with them. SAP Help Portal, the
 * Business Accelerator Hub and the Fiori apps library are not fetched: SAP's
 * Terms of Use for SAP Websites §4 forbid automated extraction, so their facts
 * stay in the hand-checked list in lib/sap-identifiers.ts. Why, source by
 * source: lib/sap-identifier-sync.ts.
 *
 * Polite: one request at a time with a pause, retries with backoff on 429 and
 * 5xx, a user agent naming the project, a hard cap of requests and bytes, an
 * optional on-disk cache (SAP_ID_SYNC_CACHE=<dir>). A list that fails or comes
 * back shorter than its minimum keeps the previous list — the file is never
 * truncated by a partial fetch. The same holds per SAP-docs document: one that
 * cannot be read completely, or whose licence is not an open one, keeps its
 * previous entries. GITHUB_TOKEN, where set, is sent to api.github.com only;
 * the weekly workflow runs without one (a handful of requests).
 * Titles a SAP-docs document gives that differ from a curated title are listed
 * as conflicts in the file, never written over the curated one.
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
  SAP_DOCS_SOURCES,
  SAP_NAME_LIST_SPECS,
  buildIdentifierFile,
  classicBapiNames,
  comparable,
  entriesFromDocument,
  politeFetcher,
  readIdentifierFile,
  releasedCdsNames,
  type DocumentResult,
  type ListResult,
  type SapDocumentSpec,
  type SyncedSapIdentifier,
} from '../lib/sap-identifier-sync';
import { licenseFromText, reuseLicense } from '../lib/sap-docs-parse';
import { CURATED_SAP_IDENTIFIERS } from '../lib/sap-identifiers';
import { CURATED_SAP_IDS, namesAgree } from '../lib/sap-reference-check';

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

  const documents = await readSapDocs();

  // Curated titles by ID, for the conflict list: a page-held title is never overwritten.
  const curatedTitles = new Map<string, string>();
  for (const e of CURATED_SAP_IDENTIFIERS) if (e.title) curatedTitles.set(e.id.toUpperCase(), e.title);
  for (const e of CURATED_SAP_IDS) if (e.name) curatedTitles.set(e.id.toUpperCase(), e.name);

  const { file, replaced, kept } = buildIdentifierFile(previous, results, new Date().toISOString(), { documents, curatedTitles, agree: namesAgree });
  console.log(`[sync] replaced: ${replaced.join(', ') || 'none'}; kept previous: ${kept.join(', ') || 'none'}`);
  for (const l of file.lists) console.log(`[sync] ${l.key}: ${l.count} names, ${l.status}`);
  for (const d of file.documents) console.log(`[sync] ${d.key}: ${d.count} scenarios, ${d.status}${d.sourceRevision ? ` at ${d.sourceRevision.slice(0, 12)}` : ''}${d.license ? `, ${d.license}` : ''}`);
  for (const c of file.conflicts) console.log(`[sync] title conflict: ${c.id} (curated title kept)`);
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

/* ------------------------------------------------ SAP-docs on GitHub */

const GITHUB_API = 'https://api.github.com/repos/SAP-docs';

/**
 * Every pinned SAP-docs document, read at its repository's HEAD commit. Per
 * repository: the commit and the licence (REUSE.toml, else LICENSE); per
 * document: the Markdown at that commit. A document whose licence is not an
 * open one, or which cannot be read, comes back without entries and keeps its
 * previous ones in the file.
 */
async function readSapDocs(): Promise<Array<{ spec: SapDocumentSpec; result: DocumentResult; entries: SyncedSapIdentifier[] | null }>> {
  const token = process.env.GITHUB_TOKEN;
  const repos = [...new Set(SAP_DOCS_SOURCES.map((s) => s.repo))];
  const gh = politeFetcher({
    delayMs: 1000,
    // Commit and licence per repository, the document, and a retry or two each.
    maxRequests: (repos.length * 3 + SAP_DOCS_SOURCES.length) * 2,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  const revision = new Map<string, string | null>();
  const license = new Map<string, string | null>();
  for (const repo of repos) {
    try {
      const sha = (await gh.text(`${GITHUB_API}/${repo}/commits/HEAD`, 'application/vnd.github.sha')).trim();
      revision.set(repo, /^[0-9a-f]{40}$/.test(sha) ? sha : null);
    } catch (e) {
      console.log(`[sync] SAP-docs/${repo}: HEAD commit not read (${quiet(e)})`);
      revision.set(repo, null);
    }
    const sha = revision.get(repo);
    if (!sha) continue;
    let spdx: string | null = null;
    try {
      spdx = reuseLicense(await gh.text(`${GITHUB_API}/${repo}/contents/REUSE.toml?ref=${sha}`, 'application/vnd.github.raw'));
    } catch {
      spdx = null;
    }
    if (!spdx) {
      try {
        spdx = licenseFromText(await gh.text(`${GITHUB_API}/${repo}/contents/LICENSE?ref=${sha}`, 'application/vnd.github.raw'));
      } catch {
        spdx = null;
      }
    }
    license.set(repo, spdx);
    console.log(`[sync] SAP-docs/${repo}: ${sha.slice(0, 12)}, licence ${spdx ?? 'not stated'}`);
  }

  const out: Array<{ spec: SapDocumentSpec; result: DocumentResult; entries: SyncedSapIdentifier[] | null }> = [];
  for (const spec of SAP_DOCS_SOURCES) {
    const observedAt = new Date().toISOString();
    const sha = revision.get(spec.repo) ?? null;
    const spdx = license.get(spec.repo) ?? null;
    let markdown: string | null = null;
    if (sha && spdx) {
      try {
        markdown = await gh.text(`${GITHUB_API}/${spec.repo}/contents/${spec.path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, 'application/vnd.github.raw');
      } catch (e) {
        console.log(`[sync] ${spec.key}: not read (${quiet(e)})`);
      }
    }
    const result: DocumentResult = { key: spec.key, markdown, license: spdx, sourceRevision: sha, observedAt };
    const entries = entriesFromDocument(spec, result);
    console.log(
      `[sync] ${spec.key}: ${entries === null ? 'no reading' : `${entries.length} scenarios (minimum ${spec.minCount})`}` +
        (entries?.length ? ` — ${entries.map((e) => `${e.id}${e.title ? '' : '*'}`).join(', ')}` : ''),
    );
    out.push({ spec, result, entries });
  }
  console.log('[sync] (* = named without a title)');
  return out;
}

const quiet = (e: unknown) => (e as Error).message.replace(/https?:\/\/\S+/g, '<url>');

main().catch((e) => {
  console.error('[sync] failed:', (e as Error).message);
  process.exit(1);
});

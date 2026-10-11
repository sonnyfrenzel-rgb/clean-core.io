/**
 * scripts/sync-sap-architecture-center.ts
 *
 * Reads the metadata of every reference architecture in the SAP Architecture
 * Center repository (https://github.com/SAP/architecture-center, Apache-2.0) —
 * ID, slug, title, last update and whether SAP has archived it — and writes it
 * to lib/generated/sap-architecture-center.json, reporting what changed as a
 * diff (roadmap 3.0.9).
 *
 * Only metadata is synced. The mapping from our targets and building blocks to
 * a reference architecture (`lib/sap-reference-architectures.ts`) stays manual
 * and reviewed: this script never writes it, and no model chooses or writes an
 * RA ID. `tests/sap-reference-architectures.spec.ts` fails when an RA the
 * mapping names is missing here or no longer matches it, which is the signal
 * to review the mapping by hand.
 *
 * Usage:
 *   npx tsx scripts/sync-sap-architecture-center.ts          # fetch, report the diff, write
 *   npx tsx scripts/sync-sap-architecture-center.ts --check  # fetch and report only; exit 1 on a diff
 *
 * Branch: `dev` (the branch the roadmap row was checked against). A token in
 * GITHUB_TOKEN raises the API rate limit; it is optional — the script makes two
 * API calls and reads every readme from raw.githubusercontent.com.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const REPO = 'SAP/architecture-center';
const BRANCH = 'dev';
const OUT_FILE = path.resolve(__dirname, '../lib/generated/sap-architecture-center.json');

export interface SyncedReferenceArchitecture {
  id: string;
  slug: string;
  title: string;
  lastUpdate: string | null;
  archived: boolean;
}

export interface SyncedArchitectureCenter {
  source: string;
  branch: string;
  commit: string;
  syncedAt: string;
  architectures: SyncedReferenceArchitecture[];
}

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'clean-core-io-sync' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return (await res.json()) as T;
}

function unquote(value: string): string {
  const v = value.trim();
  return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v;
}

/** The YAML front matter of a readme, read line by line — only the fields this sync needs. */
export function parseFrontMatter(raw: string): { id: string | null; slug: string | null; title: string | null; lastUpdate: string | null; tags: string[] } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return { id: null, slug: null, title: null, lastUpdate: null, tags: [] };
  const end = lines.indexOf('---', 1);
  const fm = lines.slice(1, end < 0 ? lines.length : end);
  let id: string | null = null;
  let slug: string | null = null;
  let title: string | null = null;
  let lastUpdate: string | null = null;
  const tags: string[] = [];
  let block: string | null = null;
  for (const line of fm) {
    const top = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (top) {
      block = top[1];
      const value = top[2];
      if (block === 'id') id = unquote(value);
      if (block === 'slug') slug = unquote(value);
      if (block === 'title') title = unquote(value);
      continue;
    }
    if (block === 'tags') {
      const item = /^\s*-\s*(.+)$/.exec(line);
      if (item) tags.push(unquote(item[1]));
    }
    if (block === 'last_update') {
      const date = /^\s+date:\s*(.+)$/.exec(line);
      if (date) lastUpdate = unquote(date[1]);
    }
  }
  return { id, slug, title, lastUpdate, tags };
}

export function diffArchitectures(before: SyncedReferenceArchitecture[], after: SyncedReferenceArchitecture[]): string[] {
  const lines: string[] = [];
  const old = new Map(before.map((a) => [a.id, a]));
  const now = new Map(after.map((a) => [a.id, a]));
  for (const a of after) {
    const b = old.get(a.id);
    if (!b) {
      lines.push(`+ ${a.id} ${a.title} (${a.slug}, ${a.lastUpdate ?? 'no date'}${a.archived ? ', archived' : ''})`);
      continue;
    }
    for (const key of ['slug', 'title', 'lastUpdate', 'archived'] as const) {
      if (b[key] !== a[key]) lines.push(`~ ${a.id} ${key}: ${String(b[key])} → ${String(a[key])}`);
    }
  }
  for (const b of before) if (!now.has(b.id)) lines.push(`- ${b.id} ${b.title} (removed)`);
  return lines;
}

async function main() {
  const check = process.argv.includes('--check');
  const commits = await getJson<Array<{ sha: string }>>(`https://api.github.com/repos/${REPO}/commits?sha=${BRANCH}&per_page=1`);
  const commit = commits[0]?.sha;
  if (!commit) throw new Error('No commit found on the branch.');
  const listing = await getJson<Array<{ name: string; type: string }>>(
    `https://api.github.com/repos/${REPO}/contents/docs/ref-arch?ref=${commit}`,
  );
  // RA0000 is the repository's own demo page, not a reference architecture.
  const folders = listing
    .filter((e) => e.type === 'dir' && /^RA\d{4}$/.test(e.name) && e.name !== 'RA0000')
    .map((e) => e.name)
    .sort();

  const architectures: SyncedReferenceArchitecture[] = [];
  for (const id of folders) {
    const url = `https://raw.githubusercontent.com/${REPO}/${commit}/docs/ref-arch/${id}/readme.md`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    const fm = parseFrontMatter(await res.text());
    if (!fm.id || !fm.title) throw new Error(`${id}: front matter without id or title — the repository format may have changed.`);
    architectures.push({
      id,
      slug: fm.id,
      title: fm.title,
      lastUpdate: fm.lastUpdate,
      archived: fm.tags.includes('archive'),
    });
  }

  const before: SyncedArchitectureCenter | null = existsSync(OUT_FILE)
    ? (JSON.parse(readFileSync(OUT_FILE, 'utf8')) as SyncedArchitectureCenter)
    : null;
  const diff = diffArchitectures(before?.architectures ?? [], architectures);
  console.log(`[sync] ${REPO}@${BRANCH} ${commit.slice(0, 12)} — ${architectures.length} reference architectures`);
  if (diff.length === 0) console.log('[sync] no change in IDs, slugs, titles, dates or archive state.');
  else {
    console.log('[sync] changes — review lib/sap-reference-architectures.ts by hand for each:');
    for (const line of diff) console.log(`  ${line}`);
  }

  if (check) {
    process.exit(diff.length === 0 ? 0 : 1);
  }
  const out: SyncedArchitectureCenter = {
    source: `https://github.com/${REPO}`,
    branch: BRANCH,
    commit,
    syncedAt: new Date().toISOString().slice(0, 10),
    architectures,
  };
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[sync] wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * scripts/sync-sap-references.ts
 *
 * Weekly sync of four SAP repositories on GitHub that Clean-Core.io uses as
 * references (roadmap 3.0.12, owner decision 13.10.2026). One table of sources,
 * one generated file per source in lib/generated/sap-references/:
 *
 *   abap-cheat-sheets             SAP-samples/abap-cheat-sheets (Apache-2.0)
 *   abap-platform-refscen-flight  SAP-samples/abap-platform-refscen-flight (Apache-2.0),
 *                                 branch ABAP-platform-cloud — `main` holds only a README
 *   styleguides                   SAP/styleguides, Clean ABAP (CC-BY-3.0 per .reuse/dep5)
 *   abap-file-formats             SAP/abap-file-formats (MIT)
 *
 * Stored per source: the commit, the licence (GitHub's detection plus the
 * SPDX identifiers the repository's REUSE files declare at that commit), a
 * SHA-256 per file in scope, and for Markdown in scope a SHA-256 per section
 * with the anchor GitHub gives the heading. No prose and no code of the
 * sources — with one exception the licence allows and the product needs: the
 * JSON schemas of the ABAP file formats (MIT) for the object types our
 * scaffolds write are copied unchanged into lib/generated/aff-schemas/, with
 * the upstream LICENSE next to them.
 *
 * What the product takes from these sources is the hand-reviewed registry in
 * lib/sap-reference-citations.ts; this script never writes it.
 * tests/sap-references.spec.ts fails when a file or section a row adopts is
 * gone or its hash moved — the signal to review that row by hand.
 *
 * Usage:
 *   npx tsx scripts/sync-sap-references.ts          # fetch, report the diff, write on a change
 *   npx tsx scripts/sync-sap-references.ts --check  # fetch and report only; exit 1 on a diff
 *
 * "No change" means no file, hash, section, anchor or licence moved: a new
 * upstream commit that touches nothing in scope leaves the data untouched. A
 * token in GITHUB_TOKEN raises the API rate limit; it is optional — the script
 * makes four API calls per source and reads every file from
 * raw.githubusercontent.com.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { gfmHeaderSlug, parsePage, sectionHash } from './sync-dsag-guide';

export type { SapReferenceKey } from '../lib/sap-references';
import type { SapReferenceKey } from '../lib/sap-references';

/** The object types whose AFF schemas are copied: what lib/transformation/scaffold-rap.ts writes, plus the application job catalog entry and template. */
export const AFF_SCHEMA_TYPES = ['tabl', 'ddls', 'bdef', 'srvd', 'srvb', 'clas', 'dcls', 'sajc', 'sajt'] as const;

export interface SapReferenceSource {
  key: SapReferenceKey;
  repo: string;
  branch: string;
  /** The SPDX identifier the owner decision of 13.10.2026 was taken on. The spec fails when the synced licence differs. */
  expectedLicence: string;
  licenceUrl: string;
  /** Files whose SHA-256 is recorded. */
  files: (p: string) => boolean;
  /** Markdown files whose sections are hashed. */
  sections: (p: string) => boolean;
  /** Files copied unchanged into lib/generated/aff-schemas/ (MIT only). */
  copy?: (p: string) => boolean;
}

const BINARY = /\.(png|jpe?g|gif|svg|ico|pdf|docx?|vsdx|xlsx|zip)$/i;

export const SAP_REFERENCE_SOURCES: SapReferenceSource[] = [
  {
    key: 'abap-cheat-sheets',
    repo: 'SAP-samples/abap-cheat-sheets',
    branch: 'main',
    expectedLicence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    files: (p) => (/^\d\d_[^/]+\.md$/.test(p) || p.startsWith('src/')) && !BINARY.test(p),
    sections: (p) => /^\d\d_[^/]+\.md$/.test(p),
  },
  {
    key: 'abap-platform-refscen-flight',
    repo: 'SAP-samples/abap-platform-refscen-flight',
    branch: 'ABAP-platform-cloud',
    expectedLicence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    files: (p) => p.startsWith('src/') && !BINARY.test(p),
    sections: () => false,
  },
  {
    key: 'styleguides',
    repo: 'SAP/styleguides',
    branch: 'main',
    expectedLicence: 'CC-BY-3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    // The English Clean ABAP guide and its sub-sections; the translations follow it.
    files: (p) => /^clean-abap\/.+\.md$/.test(p) && !/^clean-abap\/CleanABAP_[a-z]{2}\.md$/.test(p),
    sections: (p) => /^clean-abap\/.+\.md$/.test(p) && !/^clean-abap\/CleanABAP_[a-z]{2}\.md$/.test(p),
  },
  {
    key: 'abap-file-formats',
    repo: 'SAP/abap-file-formats',
    branch: 'main',
    expectedLicence: 'MIT',
    licenceUrl: 'https://opensource.org/licenses/MIT',
    files: (p) => isAffSchema(p),
    sections: () => false,
    copy: (p) => isAffSchema(p),
  },
];

/** `file-formats/<type>/<name>-v<n>.json` of a type in AFF_SCHEMA_TYPES (TABL also carries `tabt-v1.json`). */
export function isAffSchema(p: string): boolean {
  const m = /^file-formats\/([a-z0-9]+)\/[a-z0-9]+-v\d+\.json$/.exec(p);
  return !!m && (AFF_SCHEMA_TYPES as readonly string[]).includes(m[1]);
}

export interface SapReferenceFile {
  path: string;
  /** SHA-256 (hex) of the file's bytes at the synced commit. */
  sha256: string;
  size: number;
}

export interface SapReferenceSection {
  file: string;
  heading: string;
  level: number;
  /** The anchor GitHub renders for the heading. */
  anchor: string;
  /** SHA-256 of the section's normalised text — heading and body down to the next heading of the same or a higher level. */
  hash: string;
}

export interface SapReferenceData {
  key: SapReferenceKey;
  source: string;
  branch: string;
  commit: string;
  syncedAt: string;
  licence: {
    /** The SPDX identifier the sync settled on: REUSE when it declares exactly one, else GitHub's detection. */
    spdx: string;
    /** GitHub's licence detection of the repository (default branch); `NOASSERTION` when it cannot tell. */
    github: string;
    /** SPDX identifiers the REUSE files (REUSE.toml or .reuse/dep5) declare at the synced commit. */
    reuse: string[];
    file: string;
    url: string;
  };
  files: SapReferenceFile[];
  sections: SapReferenceSection[];
  /** abap-file-formats only: the schema files copied to lib/generated/aff-schemas/, by their upstream path. */
  copied?: { path: string; to: string }[];
}

const ROOT = path.resolve(__dirname, '..');
export const SAP_REFERENCES_DIR = path.join(ROOT, 'lib/generated/sap-references');
export const AFF_SCHEMAS_DIR = path.join(ROOT, 'lib/generated/aff-schemas');

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

async function getRaw(repo: string, commit: string, file: string): Promise<Buffer> {
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${file.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt >= 3 || res.status === 404) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * The anchor GitHub renders for a Markdown heading (github-slugger on the
 * rendered text): links keep their text, inline HTML and emphasis markers go,
 * then the same rule as kramdown's GFM ids — lower case, everything that is not
 * a letter, mark, digit, connector, hyphen or space dropped, spaces to hyphens.
 */
export function githubHeadingSlug(raw: string): string {
  const rendered = raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/(^|[^\p{L}\p{N}])_+([^_]+?)_+(?=[^\p{L}\p{N}]|$)/gu, '$1$2')
    .replace(/`/g, '');
  return gfmHeaderSlug(rendered);
}

/** Every heading of one Markdown file with its GitHub anchor and section hash. Front matter is honoured, fenced code skipped. */
export function markdownSections(file: string, raw: string): SapReferenceSection[] {
  const parsed = parsePage(raw);
  const seen = new Map<string, number>();
  return parsed.headings.map((h, idx) => {
    const base = githubHeadingSlug(h.heading);
    const n = (seen.get(base) ?? -1) + 1;
    seen.set(base, n);
    const end = parsed.headings.slice(idx + 1).find((x) => x.level <= h.level)?.line ?? parsed.lines.length;
    return {
      file,
      heading: h.heading.trim(),
      level: h.level,
      anchor: n > 0 ? `${base}-${n}` : base,
      hash: sectionHash(parsed.lines.slice(h.line, end).join('\n')),
    };
  });
}

/** The table-of-contents links of a Markdown file that point into the file itself. */
export function tocAnchors(raw: string): string[] {
  return [...raw.matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => decodeURIComponent(m[1]));
}

/** SPDX identifiers declared by REUSE.toml (`SPDX-License-Identifier = "…"`) or .reuse/dep5 (`License: …`). */
export function reuseLicences(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/SPDX-License-Identifier\s*=\s*"([^"]+)"/g)) m[1].split(/\s+(?:AND|OR)\s+/).forEach((x) => ids.add(x.trim()));
  for (const m of text.matchAll(/^License:\s*(\S.*)$/gm)) m[1].split(/\s+(?:and|or|AND|OR)\s+/).forEach((x) => ids.add(x.trim()));
  return [...ids].sort();
}

const fileKey = (f: SapReferenceFile) => f.path;
const secKey = (s: SapReferenceSection) => `${s.file}#${s.anchor}`;

export function diffReference(before: SapReferenceData | null, after: SapReferenceData): string[] {
  const lines: string[] = [];
  const oldFiles = new Map((before?.files ?? []).map((f) => [fileKey(f), f]));
  const newFiles = new Map(after.files.map((f) => [fileKey(f), f]));
  for (const f of after.files) {
    const b = oldFiles.get(fileKey(f));
    if (!b) lines.push(`+ file ${f.path}`);
    else if (b.sha256 !== f.sha256) lines.push(`~ file ${f.path} changed`);
  }
  for (const f of before?.files ?? []) if (!newFiles.has(fileKey(f))) lines.push(`- file ${f.path} removed`);
  const oldSec = new Map((before?.sections ?? []).map((s) => [secKey(s), s]));
  const newSec = new Map(after.sections.map((s) => [secKey(s), s]));
  for (const s of after.sections) {
    const b = oldSec.get(secKey(s));
    if (!b) lines.push(`+ ${s.file} § ${s.heading} (#${s.anchor})`);
    else if (b.hash !== s.hash || b.heading !== s.heading || b.level !== s.level) lines.push(`~ ${s.file} § ${s.heading} (#${s.anchor}) text changed`);
  }
  for (const s of before?.sections ?? []) if (!newSec.has(secKey(s))) lines.push(`- ${s.file} § ${s.heading} (#${s.anchor}) removed`);
  if (before && JSON.stringify(before.licence) !== JSON.stringify(after.licence)) {
    lines.push(`~ licence: ${JSON.stringify(before.licence)} → ${JSON.stringify(after.licence)}`);
  }
  if (before && before.branch !== after.branch) lines.push(`~ branch: ${before.branch} → ${after.branch}`);
  return lines;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export const outFile = (key: SapReferenceKey) => path.join(SAP_REFERENCES_DIR, `${key}.json`);

async function syncSource(src: SapReferenceSource): Promise<{ data: SapReferenceData; copies: Map<string, Buffer>; licenceText: Buffer | null; toc: string[] }> {
  const commits = await getJson<Array<{ sha: string }>>(`https://api.github.com/repos/${src.repo}/commits?sha=${encodeURIComponent(src.branch)}&per_page=1`);
  const commit = commits[0]?.sha;
  if (!commit) throw new Error(`${src.repo}: no commit on ${src.branch}.`);
  const detected = await getJson<{ path: string; license: { spdx_id: string } }>(`https://api.github.com/repos/${src.repo}/license`);
  const tree = await getJson<{ truncated: boolean; tree: Array<{ path: string; type: string }> }>(`https://api.github.com/repos/${src.repo}/git/trees/${commit}?recursive=1`);
  if (tree.truncated) throw new Error(`${src.repo}: the tree came back truncated.`);
  const blobs = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path);

  const reuseFiles = blobs.filter((p) => p === 'REUSE.toml' || p === '.reuse/dep5');
  const reuse = reuseLicences((await Promise.all(reuseFiles.map((p) => getRaw(src.repo, commit, p)))).map((b) => b.toString('utf8')).join('\n'));
  const licenceFile = blobs.find((p) => p === 'LICENSE') ?? blobs.find((p) => /^LICENSES\/.+\.txt$/.test(p)) ?? detected.path;
  const licenceText = src.copy && blobs.includes(licenceFile) ? await getRaw(src.repo, commit, licenceFile) : null;

  const inScope = blobs.filter((p) => src.files(p) || src.sections(p)).sort();
  const files: SapReferenceFile[] = [];
  const sections: SapReferenceSection[] = [];
  const copies = new Map<string, Buffer>();
  const toc: string[] = [];
  const bodies = await pool(inScope, 16, (p) => getRaw(src.repo, commit, p));
  inScope.forEach((p, i) => {
    const body = bodies[i];
    if (src.files(p)) files.push({ path: p, sha256: sha256(body), size: body.length });
    if (src.sections(p)) {
      const text = body.toString('utf8');
      const secs = markdownSections(p, text);
      sections.push(...secs);
      const anchors = new Set(secs.map((s) => s.anchor));
      for (const a of tocAnchors(text)) if (!anchors.has(a)) toc.push(`${p}#${a}`);
    }
    if (src.copy?.(p)) copies.set(p, body);
  });

  const spdx = reuse.length === 1 ? reuse[0] : detected.license.spdx_id;
  const data: SapReferenceData = {
    key: src.key,
    source: `https://github.com/${src.repo}`,
    branch: src.branch,
    commit,
    syncedAt: new Date().toISOString().slice(0, 10),
    licence: { spdx, github: detected.license.spdx_id, reuse, file: licenceFile, url: src.licenceUrl },
    files,
    sections,
  };
  if (src.copy) data.copied = [...copies.keys()].map((p) => ({ path: p, to: `lib/generated/aff-schemas/${path.posix.basename(p)}` }));
  return { data, copies, licenceText, toc };
}

async function main() {
  const check = process.argv.includes('--check');
  let changed = 0;
  const { SAP_REFERENCE_CITATIONS } = await import('../lib/sap-reference-citations');
  for (const src of SAP_REFERENCE_SOURCES) {
    const { data, copies, licenceText, toc } = await syncSource(src);
    const file = outFile(src.key);
    const before: SapReferenceData | null = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as SapReferenceData) : null;
    const diff = diffReference(before, data);
    console.log(
      `[sync] ${src.repo}@${src.branch} ${data.commit.slice(0, 12)} — ${data.files.length} files, ${data.sections.length} sections, licence ${data.licence.spdx} (GitHub ${data.licence.github}, REUSE ${data.licence.reuse.join(', ') || 'none'})`,
    );
    if (data.licence.spdx !== src.expectedLicence) console.log(`[sync] WARNING ${src.repo}: licence ${data.licence.spdx}, expected ${src.expectedLicence} — review the attribution before anything else`);
    if (toc.length) console.log(`[sync] note ${src.repo}: ${toc.length} in-page link(s) point to no computed anchor, e.g. ${toc.slice(0, 3).join(', ')}`);

    // AFF: the copied schemas must match what is on disk, byte for byte.
    let copyDrift = false;
    if (src.copy) {
      const onDisk = existsSync(AFF_SCHEMAS_DIR) ? readdirSync(AFF_SCHEMAS_DIR).filter((f) => f.endsWith('.json')).sort() : [];
      const wanted = [...copies.keys()].map((p) => path.posix.basename(p)).sort();
      copyDrift = JSON.stringify(onDisk) !== JSON.stringify(wanted);
      for (const [p, body] of copies) {
        const target = path.join(AFF_SCHEMAS_DIR, path.posix.basename(p));
        if (!existsSync(target) || sha256(readFileSync(target)) !== sha256(body)) copyDrift = true;
      }
      const lic = path.join(AFF_SCHEMAS_DIR, 'LICENSE');
      if (licenceText && (!existsSync(lic) || sha256(readFileSync(lic)) !== sha256(licenceText))) copyDrift = true;
      if (copyDrift && diff.length === 0) diff.push('~ lib/generated/aff-schemas/ differs from the synced schemas');
    }

    if (diff.length === 0) {
      console.log(`[sync] ${src.key}: no change${before && before.commit !== data.commit ? ` (upstream moved ${before.commit.slice(0, 12)} → ${data.commit.slice(0, 12)})` : ''}.`);
      continue;
    }
    changed++;
    const cited = new Map<string, string[]>();
    for (const c of SAP_REFERENCE_CITATIONS.filter((x) => x.source === src.key)) {
      for (const r of [...c.refs, ...(c.watched ?? [])]) {
        const k = r.section ? `${r.path} § ${r.section}` : `file ${r.path}`;
        cited.set(k, [...(cited.get(k) ?? []), c.id]);
      }
    }
    console.log(`[sync] ${src.key} changes — a line marked "cited" touches lib/sap-reference-citations.ts; review that row by hand:`);
    for (const line of diff.slice(0, 400)) {
      const hit = [...cited.entries()].find(([k]) => line.includes(k));
      console.log(`  ${line}${hit ? `   ← cited by ${hit[1].join(', ')}` : ''}`);
    }
    if (diff.length > 400) console.log(`  … and ${diff.length - 400} more`);
    if (check) continue;

    mkdirSync(SAP_REFERENCES_DIR, { recursive: true });
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`[sync] wrote ${path.relative(process.cwd(), file)}`);
    if (src.copy) {
      rmSync(AFF_SCHEMAS_DIR, { recursive: true, force: true });
      mkdirSync(AFF_SCHEMAS_DIR, { recursive: true });
      for (const [p, body] of copies) writeFileSync(path.join(AFF_SCHEMAS_DIR, path.posix.basename(p)), body);
      if (licenceText) writeFileSync(path.join(AFF_SCHEMAS_DIR, 'LICENSE'), licenceText);
      console.log(`[sync] wrote ${copies.size} schema(s) and LICENSE to ${path.relative(process.cwd(), AFF_SCHEMAS_DIR)}`);
    }
  }
  if (check) process.exit(changed === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

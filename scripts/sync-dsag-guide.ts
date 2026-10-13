/**
 * scripts/sync-dsag-guide.ts
 *
 * Reads the structure of the DSAG ABAP guide ("DSAG ABAP-Leitfaden",
 * https://github.com/1DSAG/ABAP-Leitfaden, CC BY 4.0) and writes it to
 * lib/generated/dsag-abap-guide.json: the commit, the licence, every page of
 * docs/**\/*.md with its title and published URL, and every heading with the
 * anchor the published site gives it and a SHA-256 of the section's normalised
 * text (roadmap 3.0.12, owner decision 13.10.2026).
 *
 * Only metadata and hashes are stored — no prose of the guide. What the product
 * takes from the guide is the hand-reviewed registry in lib/dsag-citations.ts;
 * this script never writes it. tests/dsag-citations.spec.ts fails when a section
 * the registry cites as adopted is gone or its hash moved, which is the signal to
 * review the adopted rule by hand.
 *
 * Anchors: the site is built by actions/jekyll-build-pages (the github-pages gem),
 * so kramdown runs with `input: GFM` and `auto_ids: true`. The GFM parser's id is
 * the raw heading text, lower-cased, with every character that is not a Unicode
 * word character, `-`, space or tab removed, spaces and tabs turned into `-`, and
 * `-1`, `-2` … appended to repeats within one page (kramdown-parser-gfm,
 * `generate_gfm_header_id`). An explicit `{#id}` wins. `gfmHeaderId` mirrors that.
 *
 * Usage:
 *   npx tsx scripts/sync-dsag-guide.ts          # fetch, report the diff, write on a change
 *   npx tsx scripts/sync-dsag-guide.ts --check  # fetch and report only; exit 1 on a diff
 *
 * "No change" means no page, title, heading, anchor or hash moved: a new upstream
 * commit that changes none of them (a workflow file, an image, the Gemfile) leaves
 * the data file untouched. A token in GITHUB_TOKEN raises the API rate limit; it is
 * optional — the script makes three API calls and reads every page from
 * raw.githubusercontent.com.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const REPO = '1DSAG/ABAP-Leitfaden';
const BRANCH = 'main';
const SITE = 'https://1dsag.github.io/ABAP-Leitfaden';
const OUT_FILE = path.resolve(__dirname, '../lib/generated/dsag-abap-guide.json');

export interface DsagGuidePage {
  /** Path in the repository, e.g. `docs/clean-core/solution-approach.md`. */
  file: string;
  title: string;
  /** Published URL of the page (front matter `permalink`, else Jekyll's default). */
  url: string;
}

export interface DsagGuideSection {
  file: string;
  heading: string;
  level: number;
  anchor: string;
  /** SHA-256 (hex) of the section's normalised text — heading and body down to the next heading of the same or a higher level. */
  hash: string;
}

export interface DsagGuide {
  source: string;
  site: string;
  branch: string;
  commit: string;
  syncedAt: string;
  licence: { spdx: string; file: string; url: string; reuse: boolean };
  pages: DsagGuidePage[];
  sections: DsagGuideSection[];
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

/** Ruby's `\p{Word}` (Onigmo): letters, marks, decimal digits, connector punctuation. Built at runtime, the tsconfig targets ES2017. */
const NON_WORD = new RegExp('[^\\p{L}\\p{M}\\p{Nd}\\p{Pc}\\- \\t]', 'gu');

/** kramdown-parser-gfm `generate_gfm_header_id`, without the repeat counter. */
export function gfmHeaderSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(NON_WORD, '')
    .replace(/[ \t]/g, '-');
}

/** The text a section hash is taken over: NFC, LF, no trailing blanks, single blank lines, trimmed. */
export function normaliseSection(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const sectionHash = (text: string) => createHash('sha256').update(normaliseSection(text), 'utf8').digest('hex');

function unquote(value: string): string {
  const v = value.trim();
  return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v;
}

interface ParsedHeading { line: number; level: number; heading: string; anchor: string }

/**
 * Splits one Markdown page into front matter and headings. Fenced code blocks
 * (``` and ~~~) are skipped. ATX headings need a space after the hashes (GFM);
 * setext headings count only at the start of a paragraph.
 */
export function parsePage(raw: string): { frontMatter: Record<string, string> | null; lines: string[]; bodyStart: number; headings: ParsedHeading[] } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let frontMatter: Record<string, string> | null = null;
  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) {
      frontMatter = {};
      for (const l of lines.slice(1, end)) {
        const m = /^([A-Za-z_]+):\s*(.*)$/.exec(l);
        if (m) frontMatter[m[1]] = unquote(m[2]);
      }
      bodyStart = end + 1;
    }
  }
  const headings: ParsedHeading[] = [];
  const seen = new Map<string, number>();
  const idFor = (text: string, explicit: string | null) => {
    if (explicit) return explicit;
    const base = gfmHeaderSlug(text);
    const n = (seen.get(base) ?? -1) + 1;
    seen.set(base, n);
    return n > 0 ? `${base}-${n}` : base;
  };
  let fence: string | null = null;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0].repeat(f[1].length);
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && /^ {0,3}(`+|~+)\s*$/.test(line)) fence = null;
      continue;
    }
    if (fence) continue;
    const atx = /^(#{1,6})[ \t]+(.*)$/.exec(line);
    if (atx) {
      let text = atx[2].replace(/[ \t]+$/, '');
      text = text.replace(/[\t ]#+$/, '').replace(/[ \t]+$/, '');
      if (/^#+$/.test(text)) text = '';
      const idm = /[\t ]\{#([A-Za-z][\w:-]*)\}$/.exec(text);
      const explicit = idm ? idm[1] : null;
      if (idm) text = text.slice(0, -idm[0].length).replace(/[ \t]+$/, '');
      headings.push({ line: i, level: atx[1].length, heading: text, anchor: idFor(text, explicit) });
      continue;
    }
    const next = lines[i + 1];
    const prev = i > bodyStart ? lines[i - 1] : '';
    if (
      next !== undefined &&
      /^(=+|-+)[ \t]*$/.test(next) &&
      /^[^ \t]/.test(line) &&
      prev.trim() === '' &&
      !/^([-*+>|]|\d+\.|\{:)/.test(line)
    ) {
      const text = line.replace(/[ \t]+$/, '');
      headings.push({ line: i, level: next.startsWith('=') ? 1 : 2, heading: text, anchor: idFor(text, null) });
      i++;
    }
  }
  return { frontMatter, lines, bodyStart, headings };
}

/** Jekyll's URL for a page: `permalink` from the front matter, else the path under docs/ (`index.md` → the folder). */
export function pageUrl(file: string, frontMatter: Record<string, string>): string {
  if (frontMatter.permalink) return `${SITE}${frontMatter.permalink.startsWith('/') ? '' : '/'}${frontMatter.permalink}`;
  const rel = file.replace(/^docs\//, '');
  if (/(^|\/)index\.md$/.test(rel)) return `${SITE}/${rel.replace(/index\.md$/, '')}`;
  return `${SITE}/${rel.replace(/\.md$/, '.html')}`;
}

export function sectionsOf(file: string, raw: string): { page: DsagGuidePage | null; sections: DsagGuideSection[] } {
  const parsed = parsePage(raw);
  // Jekyll renders only files with front matter; without it the .md is copied
  // verbatim and no anchor exists, so it is not a page of the guide.
  if (!parsed.frontMatter) return { page: null, sections: [] };
  const firstH1 = parsed.headings.find((h) => h.level === 1)?.heading;
  const title = parsed.frontMatter.title || firstH1 || file;
  const page: DsagGuidePage = { file, title, url: pageUrl(file, parsed.frontMatter) };
  const sections = parsed.headings.map((h, idx) => {
    const end = parsed.headings.slice(idx + 1).find((n) => n.level <= h.level)?.line ?? parsed.lines.length;
    return { file, heading: h.heading, level: h.level, anchor: h.anchor, hash: sectionHash(parsed.lines.slice(h.line, end).join('\n')) };
  });
  return { page, sections };
}

const key = (s: { file: string; heading: string }) => `${s.file} § ${s.heading}`;

/** Keys repeat when one page has two headings of the same text; the anchor tells them apart. */
const fullKey = (s: DsagGuideSection) => `${s.file}#${s.anchor}`;

export function diffGuide(before: DsagGuide | null, after: DsagGuide): string[] {
  const lines: string[] = [];
  const oldPages = new Map((before?.pages ?? []).map((p) => [p.file, p]));
  const newPages = new Map(after.pages.map((p) => [p.file, p]));
  for (const p of after.pages) {
    const b = oldPages.get(p.file);
    if (!b) lines.push(`+ page ${p.file} "${p.title}"`);
    else {
      if (b.title !== p.title) lines.push(`~ page ${p.file} title: ${b.title} → ${p.title}`);
      if (b.url !== p.url) lines.push(`~ page ${p.file} url: ${b.url} → ${p.url}`);
    }
  }
  for (const p of before?.pages ?? []) if (!newPages.has(p.file)) lines.push(`- page ${p.file} (removed)`);
  const oldSec = new Map((before?.sections ?? []).map((s) => [fullKey(s), s]));
  const newSec = new Map(after.sections.map((s) => [fullKey(s), s]));
  for (const s of after.sections) {
    const b = oldSec.get(fullKey(s));
    if (!b) lines.push(`+ ${key(s)} (#${s.anchor})`);
    else if (b.hash !== s.hash || b.heading !== s.heading || b.level !== s.level) lines.push(`~ ${key(s)} (#${s.anchor}) text changed`);
  }
  for (const s of before?.sections ?? []) if (!newSec.has(fullKey(s))) lines.push(`- ${key(s)} (#${s.anchor}) removed`);
  if (before && JSON.stringify(before.licence) !== JSON.stringify(after.licence)) {
    lines.push(`~ licence: ${JSON.stringify(before.licence)} → ${JSON.stringify(after.licence)}`);
  }
  return lines;
}

async function main() {
  const check = process.argv.includes('--check');
  const commits = await getJson<Array<{ sha: string }>>(`https://api.github.com/repos/${REPO}/commits?sha=${BRANCH}&per_page=1`);
  const commit = commits[0]?.sha;
  if (!commit) throw new Error('No commit found on the branch.');
  const licence = await getJson<{ path: string; license: { spdx_id: string } }>(`https://api.github.com/repos/${REPO}/license?ref=${commit}`);
  const tree = await getJson<{ truncated: boolean; tree: Array<{ path: string; type: string }> }>(
    `https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`,
  );
  if (tree.truncated) throw new Error('The repository tree came back truncated.');
  const reuse = tree.tree.some((e) => e.path === 'REUSE.toml' || e.path === '.reuse/dep5');
  // Jekyll skips paths starting with `_` or `.`; only Markdown under docs/ is the guide.
  const files = tree.tree
    .filter((e) => e.type === 'blob' && /^docs\/.+\.md$/.test(e.path) && !/(^|\/)[_.]/.test(e.path.slice('docs/'.length)))
    .map((e) => e.path)
    .sort();

  const pages: DsagGuidePage[] = [];
  const sections: DsagGuideSection[] = [];
  for (const file of files) {
    const url = `https://raw.githubusercontent.com/${REPO}/${commit}/${file.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    const { page, sections: s } = sectionsOf(file, await res.text());
    if (!page) {
      console.log(`[sync] ${file}: no front matter — Jekyll does not render it, skipped`);
      continue;
    }
    pages.push(page);
    sections.push(...s);
  }

  const out: DsagGuide = {
    source: `https://github.com/${REPO}`,
    site: SITE,
    branch: BRANCH,
    commit,
    syncedAt: new Date().toISOString().slice(0, 10),
    licence: {
      spdx: licence.license.spdx_id,
      file: licence.path,
      url: licence.license.spdx_id === 'CC-BY-4.0' ? 'https://creativecommons.org/licenses/by/4.0/' : `https://spdx.org/licenses/${licence.license.spdx_id}.html`,
      reuse,
    },
    pages,
    sections,
  };

  const before: DsagGuide | null = existsSync(OUT_FILE) ? (JSON.parse(readFileSync(OUT_FILE, 'utf8')) as DsagGuide) : null;
  const diff = diffGuide(before, out);
  console.log(`[sync] ${REPO}@${BRANCH} ${commit.slice(0, 12)} — ${pages.length} pages, ${sections.length} sections, licence ${out.licence.spdx}`);
  if (diff.length === 0) {
    console.log(`[sync] no change in pages, headings, anchors, section hashes or licence${before && before.commit !== commit ? ` (upstream moved ${before.commit.slice(0, 12)} → ${commit.slice(0, 12)})` : ''}.`);
  } else {
    // The registry is imported lazily so the parser above stays usable on its own.
    const { DSAG_CITATIONS } = await import('../lib/dsag-citations');
    const cited = new Map<string, string[]>();
    for (const c of DSAG_CITATIONS) for (const s of [...c.sections, ...(c.watched ?? [])]) cited.set(`${s.file} § ${s.heading}`, [...(cited.get(`${s.file} § ${s.heading}`) ?? []), c.id]);
    console.log('[sync] changes — a line marked "cited" touches lib/dsag-citations.ts; review that rule by hand:');
    for (const line of diff) {
      const hit = [...cited.entries()].find(([k]) => line.includes(k));
      console.log(`  ${line}${hit ? `   ← cited by ${hit[1].join(', ')}` : ''}`);
    }
  }

  if (check) process.exit(diff.length === 0 ? 0 : 1);
  if (diff.length === 0) return;
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

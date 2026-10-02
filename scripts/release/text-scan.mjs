#!/usr/bin/env node
/**
 * Release readiness scan for roadmap 3.0.8 / 3.0.14 — measures, never edits.
 *
 *   node scripts/release/text-scan.mjs            # summary on stdout
 *   node scripts/release/text-scan.mjs --json     # full result as JSON
 *   node scripts/release/text-scan.mjs --write    # also writes docs/release/3.0-text-scan.md
 *
 * What it measures, over every git-tracked file outside the named exceptions
 * (docs/archiv/, docs/korpus/, app/datenschutz/de/):
 *
 *   1. German prose in Markdown/text files — the same measure as the 3.0.14
 *      guard in tests/public-texts-guard.spec.ts (a sentence with three or more
 *      distinct German function words, after code, link targets and quotes are
 *      removed). The guard only reads .md/.mdx/.txt; this scan reads code too.
 *   2. German prose in code: comments, test titles (first argument of
 *      test/describe/it/armed), other string literals, and JSX text.
 *   3. Text files (.md/.mdx/.txt, LICENSE, NOTICE) missing from the inventory
 *      docs/registers/public-texts.json — the rule of guard (c).
 *
 * No network, no model, no writes outside docs/release/ (and only with --write).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));

// Same word list as tests/public-texts-guard.spec.ts (GERMAN_WORDS) — keep them in step.
const GERMAN_WORDS = /(?<![\p{L}])(und|nicht|wird|werden|wurde|oder|dass|keine?n?|sind|auch|noch|wenn|eine[nmrs]?|für|über|bleibt|steht|kein|nach|beim|zum|zur|vom|sich|schon|nur|weil|jede[rsn]?|diese[rsnm]?|dem|des|ohne|gegen|seit|ein|im|auf|aus|bei|mit|von|der|das|hat|haben|kann|muss|soll|statt|heute|damit|dann|aber|doch|sondern)(?![\p{L}])/giu;

const EXCEPTIONS = [/^docs\/archiv\//, /^docs\/korpus\//, /^app\/datenschutz\/de\//];
const PROSE_EXT = /\.(md|mdx|txt)$/i;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const DATA_EXT = /\.(json|ya?ml)$/i;
const SKIP = [/^package-lock\.json$/, /\.min\.js$/];
// Named exceptions already recorded in the 3.0.14 guard (GERMAN_PENDING).
const PENDING = new Set([
  'tests/prozess-benchmark/judge/richter-brief.md',
  'tests/prozess-benchmark/judge/richter-brief-schluss.md',
]);

const germanCount = (s) => new Set((s.match(GERMAN_WORDS) || []).map((w) => w.toLowerCase())).size;

/** Port of germanSentences() from the guard. */
function germanSentences(text) {
  const paragraphs = [];
  let fence = false;
  let current = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    if (!line.trim()) { paragraphs.push(current.join(' ')); current = []; continue; }
    current.push(line);
  }
  paragraphs.push(current.join(' '));
  const found = [];
  for (const p of paragraphs) {
    const prose = p
      .replace(/`[^`]*`/g, ' ')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/"[^"]*"/g, ' ')
      .replace(/„[^“"]*[“"]/g, ' ')
      .replace(/‚[^‘']*[‘']/g, ' ');
    for (const sentence of prose.split(/(?<=[.!?;:|])\s+/)) {
      if (germanCount(sentence) >= 3) found.push(sentence.trim().slice(0, 140));
    }
  }
  return found;
}

/**
 * A small lexer for JS/TS: comments, string/template literals and the code in
 * between. Regex literals are not recognised; the error is a stray token, not a
 * missed comment, and the counts are a size estimate, not a verdict.
 */
function lex(src) {
  const out = { comments: [], strings: [], code: [] };
  let i = 0;
  let codeBuf = '';
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const start = line;
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      out.comments.push({ line: start, text: src.slice(i + 2, j) });
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const start = line;
      let j = src.indexOf('*/', i + 2);
      if (j < 0) j = n;
      const body = src.slice(i + 2, j);
      line += (body.match(/\n/g) || []).length;
      out.comments.push({ line: start, text: body.replace(/^\s*\*/gm, ' ') });
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const start = line;
      const before = codeBuf.slice(-60);
      let j = i + 1;
      let body = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') { body += src[j + 1] ?? ''; j += 2; continue; }
        if (src[j] === '\n') { if (c !== '`') break; line++; }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          let depth = 1; j += 2;
          while (j < n && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
          body += ' ';
          continue;
        }
        body += src[j];
        j++;
      }
      const isTitle = /(?:^|[^\w$.])(?:test|describe|it|armed)(?:\.(?:only|skip|fixme|fail|slow|serial|parallel|describe|step))*\s*\(\s*$/.test(before);
      out.strings.push({ line: start, text: body, title: isTitle });
      codeBuf += ' __S__ ';
      i = j + 1;
      continue;
    }
    if (c === '\n') { out.code.push({ line, text: codeBuf }); codeBuf = ''; line++; i++; continue; }
    codeBuf += c;
    i++;
  }
  if (codeBuf) out.code.push({ line, text: codeBuf });
  return out;
}

/** Joins consecutive line comments into one block so a sentence over three lines counts once. */
function commentBlocks(comments) {
  const blocks = [];
  for (const c of comments) {
    const last = blocks[blocks.length - 1];
    if (last && c.line === last.end + 1) { last.text += ' ' + c.text; last.end = c.line; }
    else blocks.push({ line: c.line, end: c.line + (c.text.match(/\n/g) || []).length, text: c.text });
  }
  return blocks;
}

function scanCode(rel, src) {
  const lx = lex(src);
  const hit = { comments: [], titles: [], strings: [], jsx: [] };
  for (const b of commentBlocks(lx.comments)) {
    // Same quote and code stripping as the prose measure: a quoted German decision is cited, not written.
    const text = b.text.replace(/\s+/g, ' ').replace(/`[^`]*`/g, ' ').replace(/"[^"]*"/g, ' ').replace(/„[^“"]*[“"]/g, ' ').replace(/‚[^‘']*[‘']/g, ' ');
    for (const s of text.split(/(?<=[.!?;:])\s+/)) {
      if (germanCount(s) >= 3) hit.comments.push({ line: b.line, text: s.trim().slice(0, 120) });
    }
  }
  for (const s of lx.strings) {
    if (germanCount(s.text) >= 3) (s.title ? hit.titles : hit.strings).push({ line: s.line, text: s.text.replace(/\s+/g, ' ').trim().slice(0, 120) });
  }
  if (/\.(tsx|jsx)$/i.test(rel)) {
    // JSX text: what is left of a line once strings and comments are out.
    for (const c of lx.code) {
      const t = c.text.replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ');
      if (germanCount(t) >= 4) hit.jsx.push({ line: c.line, text: t.replace(/\s+/g, ' ').trim().slice(0, 120) });
    }
  }
  return hit;
}

function scanData(src) {
  const hits = [];
  // JSON / YAML string values: the same three-word measure per value.
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    if (germanCount(m[1]) >= 3) hits.push({ line: src.slice(0, m.index).split('\n').length, text: m[1].slice(0, 120) });
  }
  if (/^\s*[\w-]+:/m.test(src) && !src.trimStart().startsWith('{')) {
    src.split(/\r?\n/).forEach((l, i) => {
      const comment = l.match(/#\s(.*)$/);
      if (comment && germanCount(comment[1]) >= 3) hits.push({ line: i + 1, text: comment[1].slice(0, 120) });
    });
  }
  return hits;
}

function main() {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((f) => !EXCEPTIONS.some((r) => r.test(f)) && !SKIP.some((r) => r.test(f)));

  const files = [];
  for (const rel of tracked) {
    const abs = path.join(ROOT, rel);
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (src.includes('\u0000')) continue;
    let rec = null;
    if (PROSE_EXT.test(rel)) {
      const s = germanSentences(src);
      if (s.length) rec = { file: rel, kind: 'prose', prose: s.length, comments: 0, titles: 0, strings: 0, jsx: 0, samples: s.slice(0, 2), pending: PENDING.has(rel) };
    } else if (CODE_EXT.test(rel)) {
      const h = scanCode(rel, src);
      const total = h.comments.length + h.titles.length + h.strings.length + h.jsx.length;
      if (total) rec = {
        file: rel, kind: rel.startsWith('tests/') ? 'test' : 'code', prose: 0,
        comments: h.comments.length, titles: h.titles.length, strings: h.strings.length, jsx: h.jsx.length,
        samples: [...h.titles, ...h.comments, ...h.strings, ...h.jsx].slice(0, 2).map((x) => `L${x.line}: ${x.text}`),
      };
    } else if (DATA_EXT.test(rel)) {
      const h = scanData(src);
      // The frozen benchmark and the reference corpus are German by origin (docs/korpus is the domain source).
      const fixture = /^tests\/(prozess-benchmark|korpus)\//.test(rel);
      if (h.length) rec = { file: rel, kind: fixture ? 'fixture' : 'data', prose: 0, comments: 0, titles: 0, strings: h.length, jsx: 0, samples: h.slice(0, 2).map((x) => `L${x.line}: ${x.text}`) };
    }
    if (rec) { rec.total = rec.prose + rec.comments + rec.titles + rec.strings + rec.jsx; files.push(rec); }
  }

  // Inventory gaps — rule (c) of the guard.
  const register = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/registers/public-texts.json'), 'utf8'));
  const listed = new Set(register.files.map((e) => e.path));
  const inScope = (f) => (/\.(md|mdx|txt)$/i.test(f) || /^(LICENSE|NOTICE)$/.test(f)) && !/^docs\/(archiv|korpus)\//.test(f);
  const allTracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean);
  const missing = allTracked.filter((f) => inScope(f) && !listed.has(f));
  const vanished = register.files.filter((e) => ['update', 'keep'].includes(e.decision) && !fs.existsSync(path.join(ROOT, e.path))).map((e) => e.path);

  files.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
  const sum = (k, pred = () => true) => files.filter(pred).reduce((n, f) => n + f[k], 0);
  const summary = {
    scannedFiles: tracked.length,
    filesWithGerman: files.length,
    filesWithGermanExclFixtures: files.filter((f) => f.kind !== 'fixture').length,
    proseSentences: sum('prose'),
    proseSentencesExclPending: sum('prose', (f) => !f.pending),
    proseFiles: files.filter((f) => f.kind === 'prose').length,
    codeComments: sum('comments'),
    testTitles: sum('titles'),
    stringLiterals: sum('strings', (f) => f.kind === 'code' || f.kind === 'test'),
    jsxText: sum('jsx'),
    dataStrings: sum('strings', (f) => f.kind === 'data'),
    fixtureStrings: sum('strings', (f) => f.kind === 'fixture'),
    fixtureFiles: files.filter((f) => f.kind === 'fixture').length,
    inventoryEntries: register.files.length,
    inventoryMissing: missing.length,
    inventoryVanished: vanished.length,
  };
  return { summary, files, missing, vanished, sha: execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() };
}

function fixtureDirs(r) {
  const by = {};
  for (const f of r.files.filter((x) => x.kind === 'fixture')) {
    const d = f.file.split('/').slice(0, 3).join('/');
    by[d] = by[d] || { files: 0, strings: 0 };
    by[d].files++; by[d].strings += f.strings;
  }
  const rows = Object.entries(by).sort((a, b) => b[1].strings - a[1].strings);
  if (!rows.length) return 'None.';
  const lines = rows.map(([d, v]) => `| \`${d}/\` | ${v.files} | ${v.strings} |`);
  return ['| Directory | Files | German string values |', '|---|---:|---:|', ...lines, ''].join('\n');
}

function toMarkdown(r) {
  const s = r.summary;
  const row = (f) => `| \`${f.file}\` | ${f.kind}${f.pending ? ' (pending)' : ''} | ${f.prose || ''} | ${f.comments || ''} | ${f.titles || ''} | ${f.strings || ''} | ${f.jsx || ''} | ${f.total} |`;
  const head = '| File | Kind | Prose sentences | Comment sentences | Test titles | String literals | JSX text | Total |\n|---|---|---:|---:|---:|---:|---:|---:|';
  const group = (title, pred) => {
    const list = r.files.filter(pred);
    if (!list.length) return `### ${title}\n\nNone.\n`;
    return `### ${title} (${list.length} files)\n\n${head}\n${list.map(row).join('\n')}\n`;
  };
  return `${s.filesWithGermanExclFixtures} files outside the frozen fixtures (${s.filesWithGerman} with them) of ${s.scannedFiles} scanned carry German text by the measure below. Generated by \`node scripts/release/text-scan.mjs --write\` at \`${r.sha}\`.

## Summary

| Measure | Count |
|---|---:|
| Files scanned (tracked, outside \`docs/archiv/\`, \`docs/korpus/\`, \`app/datenschutz/de/\`) | ${s.scannedFiles} |
| Files with any German hit (outside frozen fixtures) | ${s.filesWithGermanExclFixtures} |
| German prose sentences in .md/.mdx/.txt (what the 3.0.14 guard reads) | ${s.proseSentences} in ${s.proseFiles} files |
| … of which outside the guard's named pending exceptions | ${s.proseSentencesExclPending} |
| German comment sentences in code and tests | ${s.codeComments} |
| German test titles (first argument of \`test\`/\`describe\`/\`it\`) | ${s.testTitles} |
| German string literals in code (UI copy, messages, fixtures) | ${s.stringLiterals} |
| German JSX text lines | ${s.jsxText} |
| German string values in JSON/YAML (outside fixtures) | ${s.dataStrings} |
| German string values in frozen fixtures (\`tests/prozess-benchmark/\`, \`tests/korpus/\`) | ${s.fixtureStrings} in ${s.fixtureFiles} files — listed by directory only |
| Inventory entries in \`docs/registers/public-texts.json\` | ${s.inventoryEntries} |
| Text files missing from the inventory (guard (c)) | ${s.inventoryMissing} |
| Inventory entries kept/updated whose file is gone | ${s.inventoryVanished} |

**The measure.** A sentence counts as German when it holds three or more distinct German
function words (the \`GERMAN_WORDS\` list of \`tests/public-texts-guard.spec.ts\`), after
inline code, link targets and quoted strings are removed (prose files) — for code, per
comment sentence, per string literal, and per JSX text line (four words). It is a size
estimate for the 3.0.14 step, not a verdict: an ABAP sample, a German test fixture
(\`'Die Engine baut …'\` as input to the measure itself) or a mail subject the product
sends in German can be legitimate and needs a decision, not a translation.

**What the guard covers today.** The 3.0.14 test in \`tests/public-texts-guard.spec.ts\`
reads only .md/.mdx/.txt. Comments, test titles and strings in code are in the roadmap's
scope ("code comments and test descriptions that are public") but no guard reads them yet.

## Inventory gaps (guard (c))

${r.missing.length ? r.missing.map((f) => `- \`${f}\``).join('\n') : 'None — every tracked text file outside archive and corpus has an entry.'}
${r.vanished.length ? `\nKept or updated in the inventory but gone from the tree:\n\n${r.vanished.map((f) => `- \`${f}\``).join('\n')}\n` : ''}
## Findings per file

${group('Markdown and text files', (f) => f.kind === 'prose')}
${group('Tests (comments, titles, strings)', (f) => f.kind === 'test')}
${group('Product and script code', (f) => f.kind === 'code')}
${group('JSON and YAML', (f) => f.kind === 'data')}
### Frozen fixtures (by directory)

${fixtureDirs(r)}
`;
}

const result = main();
if (args.has('--json')) console.log(JSON.stringify(result, null, 2));
else {
  const s = result.summary;
  console.log(`text-scan @ ${result.sha}: ${s.filesWithGermanExclFixtures} files with German text outside fixtures (${s.filesWithGerman} with them) of ${s.scannedFiles}`);
  console.log(`  prose sentences (.md/.txt): ${s.proseSentences} in ${s.proseFiles} files (${s.proseSentencesExclPending} outside pending)`);
  console.log(`  code: ${s.codeComments} comment sentences, ${s.testTitles} test titles, ${s.stringLiterals} strings, ${s.jsxText} JSX lines; data: ${s.dataStrings}; fixtures: ${s.fixtureStrings} in ${s.fixtureFiles} files`);
  console.log(`  inventory: ${s.inventoryEntries} entries, ${s.inventoryMissing} missing, ${s.inventoryVanished} vanished`);
}
if (args.has('--write')) {
  // Everything below MARKER is hand-written (the armed-guard run) and survives a rewrite.
  const MARKER = '<!-- manual section: kept by text-scan.mjs --write -->';
  const out = path.join(ROOT, 'docs/release/3.0-text-scan.md');
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  const tail = prev.includes(MARKER) ? prev.slice(prev.indexOf(MARKER)) : `${MARKER}\n`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `# 3.0 text scan (roadmap 3.0.8 / 3.0.14)\n\n${toMarkdown(result)}\n${tail}`);
  console.log(`wrote ${path.relative(ROOT, out)}`);
}

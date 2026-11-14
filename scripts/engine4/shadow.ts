/**
 * Shadow comparison of engine 4.0's L0/L1 against the shipping statement reader.
 *
 *   npx tsx scripts/engine4/shadow.ts            # summary and categories
 *   npx tsx scripts/engine4/shadow.ts --samples  # plus up to five samples per category
 *
 * Reads the shipped starter examples (`public/starter-examples/`) and the
 * benchmark's learn halves only (`split.json` `learn` + `w3_learn`, the same
 * cases `BM_SPLIT=learn` reads); the holdout halves are never opened. Each file
 * is read by both engines on its own:
 *
 *   - old: `readStatements` (lib/abap/statement-reader.ts) and `readBlocks`
 *     (lib/abap/block-structure.ts), unchanged;
 *   - new: `lex` + `statements` (lib/engine4).
 *
 * Statements are aligned by start line and whitespace-free, upper-cased text
 * (pragmas removed from the old text, because the new layer keeps them beside
 * the tokens). Aligned pairs are compared on their end line, on what the
 * statement is (a keyword statement or an expression) and on whether it opens
 * a block. Every disagreement is put into a named category; `unexplained`
 * collects the rest. Nothing here is wired into the product.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { readStatements, type AbapStatement } from '../../lib/abap/statement-reader';
import { readBlocks } from '../../lib/abap/block-structure';
import { lex, uncoveredCharacters } from '../../lib/engine4/lexer';
import { macroNames, statements, type Statement } from '../../lib/engine4/statements';
import { KIND_TABLE, kindInfo, unitsOf } from '../../lib/engine4/statement-kinds';

const ROOT = join(__dirname, '..', '..');
const STARTERS = join(ROOT, 'public', 'starter-examples');
const BENCH = join(ROOT, 'tests', 'prozess-benchmark');

export interface CorpusFile {
  name: string;
  source: string;
  /** Files of one upload (one benchmark case) share their macro definitions. */
  group: string;
}

/** The starter examples and the benchmark learn halves — never the holdout. */
export function shadowCorpus(): CorpusFile[] {
  const out: CorpusFile[] = [];
  for (const name of readdirSync(STARTERS).sort()) {
    if (/\.(abap|txt)$/.test(name)) out.push({ name: `starter/${name}`, group: `starter/${name}`, source: readFileSync(join(STARTERS, name), 'utf8') });
  }
  const split = JSON.parse(readFileSync(join(BENCH, 'split.json'), 'utf8')) as { learn: string[]; w3_learn: string[] };
  for (const id of [...split.learn, ...split.w3_learn].sort()) {
    const dir = join(BENCH, 'cases', id);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith('.abap')) out.push({ name: `${id}/${name}`, group: id, source: readFileSync(join(dir, name), 'utf8') });
    }
  }
  return out;
}

/** Old block kinds — the only ones the opener comparison can speak about. */
const OLD_BLOCK_KINDS = new Set([
  'if', 'case', 'loop', 'do', 'while', 'try', 'select', 'at', 'provide', 'form', 'method', 'module', 'class', 'interface', 'define',
]);

/** Every word the new table starts a keyword statement with — the old reader's keywords are compared against it. */
const KNOWN_KEYWORDS = new Set(
  KIND_TABLE.flatMap((row) => (typeof row.pattern[0] === 'string' ? row.pattern[0].split('|') : [])),
);

const compact = (text: string) => text.replace(/##[A-Za-z0-9_]*(?:\[[^\]]*\])*/g, '').replace(/\s+/g, '').toUpperCase();

interface Side {
  key: string;
  lineStart: number;
  lineEnd: number;
  /** A known keyword, or `expr`. */
  cls: string;
  /** `open:<kind>`, `candidate:select` or `none`. */
  opener: string;
  text: string;
}

function oldSides(list: AbapStatement[]): Side[] {
  const blocks = readBlocks(list);
  const opened = new Map<number, string>();
  for (const b of blocks.blocks) opened.set(b.openIndex, `open:${b.kind}`);
  return list.map((s, i) => ({
    key: `${s.lineStart}|${compact(s.text)}`,
    lineStart: s.lineStart,
    lineEnd: s.lineEnd,
    cls: KNOWN_KEYWORDS.has(s.keyword) ? s.keyword : 'expr',
    opener: opened.get(i) ?? 'none',
    text: s.text,
  }));
}

function newSides(list: Statement[]): Side[] {
  return list.map((s) => {
    const info = kindInfo(s.kind);
    const text = s.tokens.map((t) => t.text).join(' ');
    let opener = 'none';
    if (info.opens && OLD_BLOCK_KINDS.has(info.opens) && s.context === 'abap') {
      opener = info.candidate ? `candidate:${info.opens}` : `open:${info.opens}`;
    }
    return {
      key: `${s.start.row}|${compact(s.tokens.map((t) => t.text).join(''))}`,
      lineStart: s.start.row,
      lineEnd: s.end.row,
      cls: info.keyword && s.context !== 'native' ? unitsOf(s.tokens)[0] : 'expr',
      opener,
      text: `[${s.kind}${s.context === 'abap' ? '' : `/${s.context}`}] ${text}`,
    };
  });
}

/** Longest common subsequence of the two key lists: index pairs. */
function align(a: Side[], b: Side[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] = a[i].key === b[j].key ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].key === b[j].key) { pairs.push([i, j]); i += 1; j += 1; }
    else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i += 1;
    else j += 1;
  }
  return pairs;
}

export interface Sample {
  file: string;
  line: number;
  old: string;
  new: string;
}

export interface ShadowReport {
  files: number;
  lines: number;
  oldStatements: number;
  newStatements: number;
  aligned: number;
  oldOnly: number;
  newOnly: number;
  endLineAgree: number;
  classAgree: number;
  openerAgree: number;
  newUnknown: number;
  uncoveredCharacters: number;
  lexErrors: number;
  /** Disagreement category → count. */
  categories: Record<string, number>;
  samples: Record<string, Sample[]>;
  /** First two words of each Unknown statement → where. */
  unknownSamples: Record<string, string[]>;
}

/** Name the reason two readings differ. Order matters: the first rule that fits wins. */
export function categorize(oldText: string, newText: string): string {
  const o = oldText.toUpperCase();
  const n = newText.toUpperCase();
  if (/\[NATIVESQL|EXEC SQL|ENDEXEC|\[METHODAMDP|BY DATABASE/.test(n) || /ENDEXEC|BY DATABASE/.test(o)) return 'native-sql-region';
  if (/^\[CLASSLOCALFRIENDS\]|^\[CLASSLOAD\]|^\[INTERFACELOAD\]|^\[CLASSDEFERRED\]|^\[INTERFACEDEFERRED\]/.test(n)) return 'class-interface-not-an-opener';
  if (/^\[ASSIGNMENT\] (DATA|FINAL|FIELD-SYMBOL) \(/.test(n)) return 'inline-declaration-is-an-assignment';
  if (/^\[(?:ASSIGNMENT|METHODCALL)\]/.test(n) && /^[A-Z][\w-]*\s*\(/.test(o)) return 'call-or-assignment-starting-with-a-keyword-name';
  if (/^\[ATFIELDGROUP\]/.test(n)) return 'at-field-group';
  if (/^\[MACROCALL\]/.test(n) || /\/MACRO\]/.test(n)) return 'macro';
  if (/^\[UNKNOWN\]/.test(n)) return 'unknown-statement';
  return 'unexplained';
}

function addSample(r: ShadowReport, category: string, sample: Sample): void {
  r.categories[category] = (r.categories[category] ?? 0) + 1;
  const list = (r.samples[category] ??= []);
  if (list.length < 5) list.push(sample);
}

function compareFile(r: ShadowReport, file: CorpusFile, macros: string[]): void {
  const lexed = lex(file.source);
  r.uncoveredCharacters += uncoveredCharacters(file.source, lexed.tokens).length;
  r.lexErrors += lexed.diagnostics.filter((d) => d.severity === 'error').length;
  const olds = oldSides(readStatements(file.source));
  const newList = statements(lexed.tokens, { macros });
  const news = newSides(newList);
  r.files += 1;
  r.lines += file.source.split('\n').length;
  r.oldStatements += olds.length;
  r.newStatements += news.length;
  r.newUnknown += newList.filter((s) => s.kind === 'Unknown' && s.context === 'abap').length;
  const pairs = align(olds, news);
  r.aligned += pairs.length;
  const usedOld = new Set(pairs.map(([i]) => i));
  const usedNew = new Set(pairs.map(([, j]) => j));
  for (let i = 0; i < olds.length; i++) {
    if (usedOld.has(i)) continue;
    r.oldOnly += 1;
    const line = olds[i].lineStart;
    const near = news.find((s) => s.lineStart <= line && line <= s.lineEnd);
    const category = `boundary:${categorize(olds[i].text, near?.text ?? '')}`;
    addSample(r, category, { file: file.name, line: olds[i].lineStart, old: olds[i].text, new: near?.text ?? '(none)' });
  }
  for (let j = 0; j < news.length; j++) {
    if (usedNew.has(j)) continue;
    r.newOnly += 1;
    const line = news[j].lineStart;
    const near = olds.find((s) => s.lineStart <= line && line <= s.lineEnd);
    addSample(r, `new-boundary:${categorize(near?.text ?? '', news[j].text)}`, { file: file.name, line, old: near?.text ?? '(none)', new: news[j].text });
  }
  for (const s of newList) {
    if (s.kind !== 'Unknown' || s.context !== 'abap') continue;
    const words = s.tokens.slice(0, 2).map((t) => t.text.toUpperCase()).join(' ');
    const list = (r.unknownSamples[words] ??= []);
    list.push(`${file.name}:${s.start.row}`);
  }
  for (const [i, j] of pairs) {
    const o = olds[i];
    const n = news[j];
    const sample = { file: file.name, line: o.lineStart, old: `${o.text}  {${o.cls}, ${o.opener}}`, new: `${n.text}  {${n.cls}, ${n.opener}}` };
    if (o.lineEnd === n.lineEnd) r.endLineAgree += 1;
    else addSample(r, `end-line:${categorize(o.text, n.text)}`, sample);
    if (o.cls === n.cls) r.classAgree += 1;
    else addSample(r, `class:${categorize(o.text, n.text)}`, sample);
    const openerSame = o.opener === n.opener || (n.opener === 'candidate:select' && (o.opener === 'open:select' || o.opener === 'none'));
    if (openerSame) r.openerAgree += 1;
    else addSample(r, `opener:${categorize(o.text, n.text)}`, sample);
  }
}

export function runShadow(corpus: CorpusFile[] = shadowCorpus()): ShadowReport {
  const r: ShadowReport = {
    files: 0, lines: 0, oldStatements: 0, newStatements: 0, aligned: 0, oldOnly: 0, newOnly: 0,
    endLineAgree: 0, classAgree: 0, openerAgree: 0, newUnknown: 0, uncoveredCharacters: 0, lexErrors: 0,
    categories: {}, samples: {}, unknownSamples: {},
  };
  const macrosByGroup = new Map<string, string[]>();
  for (const file of corpus) {
    const names = macroNames(statements(lex(file.source).tokens));
    macrosByGroup.set(file.group, [...(macrosByGroup.get(file.group) ?? []), ...names]);
  }
  for (const file of corpus) compareFile(r, file, macrosByGroup.get(file.group) ?? []);
  return r;
}

const pct = (a: number, b: number) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(2)} %`);

export function formatReport(r: ShadowReport, withSamples: boolean): string {
  const lines = [
    `files ${r.files}, lines ${r.lines}`,
    `statements: old ${r.oldStatements}, new ${r.newStatements}`,
    `boundaries: aligned ${r.aligned} (${pct(r.aligned, r.oldStatements)} of old), old only ${r.oldOnly}, new only ${r.newOnly}`,
    `aligned pairs: end line agrees ${r.endLineAgree} (${pct(r.endLineAgree, r.aligned)}), keyword/expression agrees ${r.classAgree} (${pct(r.classAgree, r.aligned)}), block opener agrees ${r.openerAgree} (${pct(r.openerAgree, r.aligned)})`,
    `new Unknown statements ${r.newUnknown}; uncovered characters ${r.uncoveredCharacters}; lexer errors ${r.lexErrors}`,
    'disagreement categories:',
    ...Object.entries(r.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
  ];
  if (withSamples) {
    lines.push('unknown statements by first words:');
    for (const [k, list] of Object.entries(r.unknownSamples).sort((a, b) => b[1].length - a[1].length)) lines.push(`  ${k}: ${list.length} (${list.slice(0, 3).join(', ')})`);
    for (const [k, list] of Object.entries(r.samples)) {
      lines.push(`--- ${k}`);
      for (const s of list) lines.push(`  ${s.file}:${s.line}\n    old: ${s.old}\n    new: ${s.new}`);
    }
  }
  return lines.join('\n');
}

if (require.main === module) {
  console.log(formatReport(runShadow(), process.argv.includes('--samples')));
}

/**
 * Engine 4.0, Phase 0 "parse once": the shipping engine's statement view, built
 * from L0/L1 tokens instead of a second character scan.
 *
 * Pure: imports only within `lib/engine4/`. Nothing in the product reads it
 * (ADR-125 (1) and (2)); `scripts/engine4/shadow-parsed.ts` proves, file by
 * file, that what it yields is identical to the shipping reader's output, so
 * that each reader of `lib/abap/` can later move onto it without a single
 * output moving. Wiring it in is an owner decision (`docs/design/engine4.md`,
 * "Phase 0").
 *
 * `CompatStatement` has the shape of `AbapStatement` in
 * `lib/abap/statement-reader.ts` field for field, so it is assignable to it by
 * structure; it is declared here because this tree may not import from there.
 *
 * Two places reproduce a reading of the shipping reader that L1 deliberately
 * does not share, because a neutral move must not change it:
 *
 *   - **Native SQL between `EXEC SQL` and `ENDEXEC`** is cut at every period and
 *     the last piece is joined with `ENDEXEC` (the shadow category
 *     `native-sql-region`, where L1 is right). An AMDP body stays one statement.
 *   - **The masks** follow the shipping literal rule (`'…'`, `` `…` ``, `|…|`
 *     with `{ … }` blanked), which here falls out of the token kinds.
 *
 * Fixing either is a new reading, gated and measured, not part of Phase 0.
 */
import type { Statement } from './statements';
import type { Token } from './tokens';

/** Structurally identical to `AbapStatement` (lib/abap/statement-reader.ts). */
export interface CompatStatement {
  text: string;
  keyword: string;
  lineStart: number;
  lineEnd: number;
  fromChain: boolean;
  chainHeadLine?: number;
  nativeSql: boolean;
  index: number;
}

/** The compat statements, their masks, and the L1 statement each was built from (-1 for an emulated native piece). */
export interface CompatBuild {
  list: CompatStatement[];
  /** `masked[i]` is the shipping `maskLiterals(list[i].text)`, derived from the tokens. */
  masked: string[];
  fromStatement: number[];
}

const SKIPPED = new Set(['comment', 'pseudoComment']);

function firstKeyword(text: string): string {
  const m = /^[A-Za-z][\w-]*/.exec(text);
  return m ? m[0].toUpperCase() : '';
}

/** One token's contribution to the masked text: literal contents blanked, delimiters kept. */
interface MaskState { depth: number }

function maskToken(t: Token, st: MaskState): string {
  const blank = ' '.repeat(t.text.length);
  switch (t.kind) {
    case 'textLiteral':
    case 'stringLiteral': {
      if (st.depth > 0) return blank;
      const q = t.text[0];
      // Every delimiter character inside is an escaped (doubled) one, which the
      // shipping scanner reads as close + open and so keeps.
      let out = '';
      for (const ch of t.text) out += ch === q ? ch : ' ';
      return out;
    }
    case 'template':
      if (st.depth > 0) return blank;
      return closesTemplate(t) ? `|${blank.slice(2)}|` : `|${blank.slice(1)}`;
    case 'templateBegin': {
      const out = st.depth > 0 ? blank : t.text[0] + blank.slice(1);
      st.depth += 1;
      return out;
    }
    case 'templateMiddle':
      return blank;
    case 'templateEnd': {
      st.depth = Math.max(0, st.depth - 1);
      if (st.depth > 0 || !closesTemplate(t)) return blank;
      return blank.slice(1) + '|';
    }
    default:
      return st.depth > 0 ? blank : t.text;
  }
}

/** False for a template piece the lexer closed at the line end without a bar. */
function closesTemplate(t: Token): boolean {
  return t.text.length >= 2 && t.text.endsWith('|') && !t.text.endsWith('\\|');
}

interface Piece { text: string; masked: string; first: number; last: number }

/** Text, mask and rows of the tokens `[from, to)`, comments left out, blanks folded to one. */
function piece(tokens: readonly Token[], from: number, to: number): Piece | null {
  let text = '';
  let masked = '';
  let first = -1;
  let last = -1;
  const st: MaskState = { depth: 0 };
  for (let k = from; k < to; k++) {
    const t = tokens[k];
    if (SKIPPED.has(t.kind)) continue;
    const sep = text && t.spaceBefore ? ' ' : '';
    text += sep + t.text;
    masked += sep + maskToken(t, st);
    if (first === -1) first = t.row;
    last = t.row;
  }
  return text ? { text, masked, first, last } : null;
}

/** Index of the token at an offset. */
function indexer(tokens: readonly Token[]): (t: Token) => number {
  const at = new Map<number, number>();
  tokens.forEach((t, i) => at.set(t.offset, i));
  return (t) => at.get(t.offset) as number;
}

/** Start of a range at `k`, widened backwards over pragmas and comments (pragmas are part of the shipping text). */
function widen(tokens: readonly Token[], k: number): number {
  let a = k;
  while (a > 0 && (tokens[a - 1].kind === 'pragma' || SKIPPED.has(tokens[a - 1].kind))) a -= 1;
  return a;
}

/** End (exclusive) of a statement's own range: its terminator, else just behind its last own token and trailing pragmas. */
function ownEnd(tokens: readonly Token[], s: Statement, idx: (t: Token) => number): number {
  if (s.terminator) return idx(s.terminator);
  let b = idx(s.tokens[s.tokens.length - 1]) + 1;
  while (b < tokens.length && tokens[b].kind === 'pragma') b += 1;
  return b;
}

function pushCompat(out: CompatBuild, text: string, masked: string, lineStart: number, lineEnd: number, nativeSql: boolean, from: number, chainHeadLine?: number): void {
  const index = out.list.length;
  out.list.push({ text, keyword: firstKeyword(text), lineStart, lineEnd, fromChain: chainHeadLine !== undefined, chainHeadLine, nativeSql, index });
  out.masked.push(masked);
  out.fromStatement.push(from);
}

/** The compat view of one ABAP (or macro-body) L1 statement. */
function fromL1(out: CompatBuild, tokens: readonly Token[], s: Statement, si: number, idx: (t: Token) => number, nativeSql: boolean): void {
  const own = s.tokens.slice(s.headCount);
  if (!own.length) return;
  const end = ownEnd(tokens, s, idx);
  if (!s.chain) {
    // An empty chain head (`: a, b.`) is no chain to L1, which drops the colon; the shipping text keeps it.
    let from = widen(tokens, idx(own[0]));
    if (from > 0 && tokens[from - 1].kind === 'colon') from = widen(tokens, from - 1);
    const p = piece(tokens, from, end);
    if (p) pushCompat(out, p.text, p.masked, p.first, p.last, nativeSql, si);
    return;
  }
  const head = piece(tokens, widen(tokens, idx(s.tokens[0])), idx(s.chain.colon));
  const body = piece(tokens, widen(tokens, idx(own[0])), end);
  if (!head || !body) return;
  pushCompat(out, `${head.text} ${body.text}`, `${head.masked} ${body.masked}`, body.first, body.last, nativeSql, si, head.first);
}

/**
 * The shipping literal rule, character by character, for the one place the
 * tokens cannot answer it: native SQL, which L0 keeps as raw lines.
 */
export function literalScanner(): { (ch: string): boolean; inText(): boolean } {
  const stack: Array<'quote' | 'tick' | 'template' | 'expr'> = [];
  let escaped = false;
  const scan = ((ch: string): boolean => {
    if (escaped) {
      if (!/\s/.test(ch)) escaped = false;
      return false;
    }
    const top = stack[stack.length - 1];
    if (top === 'quote') { if (ch === "'") stack.pop(); return false; }
    if (top === 'tick') { if (ch === '`') stack.pop(); return false; }
    if (top === 'template') {
      if (ch === '\\') escaped = true;
      else if (ch === '|') stack.pop();
      else if (ch === '{') stack.push('expr');
      return false;
    }
    if (ch === "'") { stack.push('quote'); return false; }
    if (ch === '`') { stack.push('tick'); return false; }
    if (ch === '|') { stack.push('template'); return false; }
    if (top === 'expr') { if (ch === '}') stack.pop(); return false; }
    return true;
  }) as { (ch: string): boolean; inText(): boolean };
  scan.inText = () => {
    const top = stack[stack.length - 1];
    return top === 'quote' || top === 'tick' || top === 'template';
  };
  return scan;
}

/** The shipping mask of a text: literal contents blanked, delimiters kept. */
export function maskText(text: string): string {
  const scan = literalScanner();
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const wasCode = scan(' ');
    scan(text[i]);
    out += wasCode || scan(' ') ? text[i] : ' ';
  }
  return out;
}

/** Whitespace outside literal text folded to one blank, as the shipping reader folds a statement. */
function fold(chars: string): string {
  const scan = literalScanner();
  let out = '';
  let gap = false;
  for (const ch of chars) {
    scan(ch);
    if (/\s/.test(ch) && !scan.inText()) { gap = true; continue; }
    if (gap && out) out += ' ';
    gap = false;
    out += ch;
  }
  return out;
}

interface Pending { chars: string[]; rows: number[] }

function flush(out: CompatBuild, p: Pending, to: number): void {
  let a = 0;
  let b = to;
  while (a < b && /\s/.test(p.chars[a])) a += 1;
  while (b > a && /\s/.test(p.chars[b - 1])) b -= 1;
  if (a < b) {
    const text = fold(p.chars.slice(a, b).join(''));
    if (text) pushCompat(out, text, maskText(text), p.rows[a], p.rows[b - 1], true, -1);
  }
  p.chars.splice(0, to + 1);
  p.rows.splice(0, to + 1);
}

/** Line text without an inline `"` comment (a `"` outside a literal). */
function stripComment(raw: string): string {
  const scan = literalScanner();
  for (let c = 0; c < raw.length; c++) if (scan(raw[c]) && raw[c] === '"') return raw.slice(0, c);
  return raw;
}

/**
 * The shipping reader's cut of an `EXEC SQL` region: from just behind the
 * `EXEC SQL.` period to the `ENDEXEC` statement's period, read line by line as
 * ABAP — comment lines dropped, `"` comments stripped, a cut at every period
 * outside a literal and not between two digits. Every piece is `nativeSql`.
 */
function execRegion(out: CompatBuild, source: string, from: number, to: number, firstRow: number): void {
  const p: Pending = { chars: [], rows: [] };
  const lines = source.slice(from, to).split(/\r?\n/);
  lines.forEach((raw, n) => {
    const row = firstRow + n;
    const open = p.chars.length > 0;
    if (n > 0 && (raw.startsWith('*') || (!open && /^\s+\*/.test(raw)))) return;
    const trimmed = stripComment(raw).trim();
    if (!trimmed) return;
    const start = p.chars.length;
    if (start) { p.chars.push(' '); p.rows.push(row); }
    for (const ch of trimmed) { p.chars.push(ch); p.rows.push(row); }
    let k = start;
    let scan = literalScanner();
    while (k < p.chars.length) {
      const ch = p.chars[k];
      if (!scan(ch) || ch !== '.') { k += 1; continue; }
      if (/\d/.test(p.chars[k - 1] ?? '') && /\d/.test(p.chars[k + 1] ?? '')) { k += 1; continue; }
      flush(out, p, k);
      k = 0;
      scan = literalScanner();
    }
  });
  if (p.chars.length) flush(out, p, p.chars.length);
}

/** The shipping reader's AMDP body: the lines trimmed and joined, `*` lines and blank lines dropped, one statement. */
function amdpBody(out: CompatBuild, lines: readonly string[], s: Statement): void {
  const p: Pending = { chars: [], rows: [] };
  for (let row = s.tokens[0].row; row <= s.tokens[s.tokens.length - 1].row; row++) {
    const raw = lines[row - 1] ?? '';
    const body = raw.trim();
    if (!body || raw.startsWith('*')) continue;
    if (p.chars.length) { p.chars.push(' '); p.rows.push(row); }
    for (const ch of body) { p.chars.push(ch); p.rows.push(row); }
  }
  if (p.chars.length) flush(out, p, p.chars.length);
}

/** Every compat statement of a parsed source, in source order. */
export function buildCompat(source: string, tokens: readonly Token[], list: readonly Statement[]): CompatBuild {
  const out: CompatBuild = { list: [], masked: [], fromStatement: [] };
  const idx = indexer(tokens);
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.kind === 'ExecSql' && s.terminator) {
      fromL1(out, tokens, s, i, idx, false);
      // The region runs to the ENDEXEC statement; without one, to the end of the source.
      let j = i + 1;
      while (j < list.length && list[j].kind !== 'EndExec') j += 1;
      const end = j < list.length ? list[j] : null;
      const toEnd = end ? (end.terminator ? end.terminator.offset + 1 : idxEnd(end)) : source.length;
      execRegion(out, source, s.terminator.offset + 1, toEnd, s.terminator.row);
      i = j;
      continue;
    }
    if (s.context === 'native') { amdpBody(out, lines, s); continue; }
    fromL1(out, tokens, s, i, idx, false);
  }
  return out;
}

function idxEnd(s: Statement): number {
  const last = s.tokens[s.tokens.length - 1];
  return last.offset + last.text.length;
}

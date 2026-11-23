/**
 * Engine 4.0, layer L0: characters → tokens.
 *
 * Pure: imports only `./tokens`. One left-to-right pass over the source; every
 * character ends up in exactly one token or is whitespace (`uncoveredCharacters`
 * proves it on any input). The lexer never throws and never stops early: what it
 * cannot read becomes an `unknown` token or a literal closed at the end of its
 * line, each with a diagnostic, and lexing goes on with the next character.
 *
 * What the lexer decides, and what it leaves to the statement layer:
 *   - It decides what is text and what is code — literals, string templates with
 *     their embedded expressions (which may break across lines; the template
 *     *text* may not), comments, pseudo-comments and pragmas. This is the one
 *     place that answers the question, so no reader above has to mask literals
 *     again.
 *   - It does not decide which word is a keyword. ABAP reserves none; position
 *     in the statement decides, and that is L1's job.
 *   - It switches to native mode in exactly two places, because there the text is
 *     not ABAP and ABAP's rules for `"`, `:` and `.` do not hold: after
 *     `EXEC SQL.` up to `ENDEXEC`, and in an AMDP method body
 *     (`METHOD … BY DATABASE PROCEDURE|FUNCTION|GRAPH WORKSPACE …`) up to the line
 *     that starts with `ENDMETHOD`. Each native line is one `nativeSql` token.
 *
 * One rule depends on more than the character itself and is taken from the
 * shipping engine because the shipped examples need it: an *indented* `*` is a
 * comment only where no statement is open; inside an open statement it is a
 * multiplication. A `*` in column 1 is always a comment.
 */
import type { Diagnostic, DiagnosticCode, Token, TokenKind } from './tokens';

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

interface State {
  src: string;
  pos: number;
  row: number;
  /** Offset of the first character of the current line. */
  lineStart: number;
  tokens: Token[];
  diagnostics: Diagnostic[];
  /** Embedded template expressions `{ … }` currently open. */
  exprDepth: number;
  /** Whitespace or a line break since the last token. */
  space: boolean;
  /** A code token stands since the last period (at template depth 0). */
  statementOpen: boolean;
  /** Upper-cased words of the open statement, for the native-mode triggers. */
  words: string[];
}

/** Multi-character operators first: the longest match wins. */
const OPERATORS = [
  '&&=', '->', '=>', '?=', '+=', '-=', '*=', '/=', '<>', '<=', '>=', '=<', '><', '**', '&&',
  '(', ')', '[', ']', '=', '<', '>', '+', '-', '*', '/', '&', '@', '#', '?', '~', '!', '{',
];

const WORD = /[A-Za-z_%$][A-Za-z0-9_%$]*/y;
const NAMESPACED = /\/[A-Za-z0-9_]+\/[A-Za-z0-9_%$]+/y;
const FIELD_SYMBOL = /<[A-Za-z_][A-Za-z0-9_/]*>/y;
const DIGIT_WORD = /\d+[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /\d+(?:\.\d+)?/y;
const PRAGMA = /##[A-Za-z0-9_]*(?:\[[^\]\r\n]*\])*/y;
const MACRO_PLACEHOLDER = /&\d+/y;
const ESCAPED_NAME = /![A-Za-z_%$][A-Za-z0-9_%$]*/y;

const EXEC_SQL = /^EXEC SQL(?: PERFORMING \S+)?$/;
const AMDP = /^METHOD (?:\S+ )+?BY DATABASE (?:PROCEDURE|FUNCTION|GRAPH)\b/;

function isBlank(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f' || ch === '\v' || ch === ' ';
}

/**
 * True when `i` is the end of a line: a line feed, a `\r\n`, or the end of the source. A lone `\r` is not one, on
 * purpose: the shipping readers split on `\n` only, and parse once must read a CR-only source as they do, or a run
 * signed before 3.4.0 would not rebuild as it signed. From 3.4.0 `lib/abap/input-hygiene.ts` turns a lone `\r` into
 * `\n` before any reader, the lexer included, sees the source.
 */
function atLineEnd(s: State, i: number): boolean {
  const ch = s.src[i];
  if (ch === undefined || ch === '\n') return true;
  return ch === '\r' && (s.src[i + 1] === '\n' || i + 1 === s.src.length);
}

function lineEndFrom(s: State, i: number): number {
  let j = i;
  while (!atLineEnd(s, j)) j += 1;
  return j;
}

function diagnose(s: State, code: DiagnosticCode, message: string, offset: number, severity: Diagnostic['severity']): void {
  s.diagnostics.push({ code, message, row: s.row, col: offset - s.lineStart + 1, severity });
}

function push(s: State, kind: TokenKind, from: number, to: number): Token {
  const token: Token = {
    kind,
    text: s.src.slice(from, to),
    row: s.row,
    col: from - s.lineStart + 1,
    offset: from,
    spaceBefore: s.space || s.tokens.length === 0,
  };
  s.tokens.push(token);
  s.space = false;
  s.pos = to;
  const code = kind !== 'comment' && kind !== 'pseudoComment' && kind !== 'pragma';
  if (code && s.exprDepth === 0) {
    s.statementOpen = true;
    if (kind === 'word' && s.words.length < 16) s.words.push(token.text.toUpperCase());
  }
  return token;
}

function matchAt(re: RegExp, s: State): string | null {
  re.lastIndex = s.pos;
  const m = re.exec(s.src);
  return m ? m[0] : null;
}

function lexComment(s: State): void {
  const end = lineEndFrom(s, s.pos);
  const kind = /^"#EC\b/i.test(s.src.slice(s.pos, s.pos + 4)) ? 'pseudoComment' : 'comment';
  push(s, kind, s.pos, end);
}

/** `'…'` or `` `…` ``; the delimiter doubled is the escaped delimiter. Closes at the line end if open. */
function lexQuoted(s: State, quote: string): void {
  const from = s.pos;
  let i = from + 1;
  while (!atLineEnd(s, i)) {
    if (s.src[i] === quote) {
      if (s.src[i + 1] === quote) { i += 2; continue; }
      push(s, quote === "'" ? 'textLiteral' : 'stringLiteral', from, i + 1);
      return;
    }
    i += 1;
  }
  diagnose(s, 'unterminated-literal', `Literal opened with ${quote} is not closed on its line; it is closed at the line end.`, from, 'error');
  push(s, quote === "'" ? 'textLiteral' : 'stringLiteral', from, i);
}

/**
 * Template text from `|` or `}` up to the next `{`, `|` or line end. `\` escapes
 * the next character. The text of a template cannot span lines; an embedded
 * expression can, and the lexer stays in it across line breaks (`exprDepth`).
 */
function lexTemplateText(s: State, opener: '|' | '}'): void {
  const from = s.pos;
  let i = from + 1;
  while (!atLineEnd(s, i)) {
    const ch = s.src[i];
    if (ch === '\\') {
      i += atLineEnd(s, i + 1) ? 1 : 2;
      continue;
    }
    if (ch === '{') {
      push(s, opener === '|' ? 'templateBegin' : 'templateMiddle', from, i + 1);
      s.exprDepth += 1;
      return;
    }
    if (ch === '|') {
      push(s, opener === '|' ? 'template' : 'templateEnd', from, i + 1);
      return;
    }
    i += 1;
  }
  diagnose(s, 'unterminated-template', 'String template text is not closed on its line; it is closed at the line end.', from, 'error');
  push(s, opener === '|' ? 'template' : 'templateEnd', from, i);
}

function emitNative(s: State, from: number, to: number): void {
  let a = from;
  let b = to;
  while (a < b && isBlank(s.src[a])) a += 1;
  while (b > a && isBlank(s.src[b - 1])) b -= 1;
  if (a < b) {
    s.space = true;
    push(s, 'nativeSql', a, b);
  }
  s.pos = to;
}

function newLine(s: State): void {
  // `pos` stands on the line end: skip `\r\n` or `\n`.
  if (s.src[s.pos] === '\r') s.pos += 1;
  if (s.src[s.pos] === '\n') s.pos += 1;
  s.row += 1;
  s.lineStart = s.pos;
  s.space = true;
}

/**
 * Native mode: each line one `nativeSql` token, `*` in column 1 still a comment.
 * EXEC SQL ends before the word `ENDEXEC` (an ABAP `"` comment on the line is
 * honoured); an AMDP body ends before a line starting with `ENDMETHOD`.
 */
function lexNative(s: State, mode: 'exec' | 'amdp'): void {
  const startRow = s.row;
  const startCol = s.pos - s.lineStart;
  while (s.pos < s.src.length) {
    const eol = lineEndFrom(s, s.pos);
    const line = s.src.slice(s.pos, eol);
    const atStart = s.pos === s.lineStart;
    if (atStart && line.startsWith('*')) {
      push(s, 'comment', s.pos, eol);
    } else if (mode === 'amdp') {
      if (atStart && /^\s*ENDMETHOD\b/i.test(line)) return;
      emitNative(s, s.pos, eol);
    } else {
      const end = /\bENDEXEC\b/i.exec(line);
      const quote = line.indexOf('"');
      if (quote !== -1 && (!end || quote < end.index)) {
        emitNative(s, s.pos, s.pos + quote);
        lexComment(s);
      } else {
        emitNative(s, s.pos, s.pos + (end ? end.index : line.length));
        if (end) return;
      }
    }
    s.pos = eol;
    if (s.pos < s.src.length) newLine(s);
  }
  s.diagnostics.push({
    code: 'unterminated-native-sql',
    message: mode === 'exec' ? 'EXEC SQL has no ENDEXEC.' : 'AMDP method body has no ENDMETHOD.',
    row: startRow,
    col: startCol + 1,
    severity: 'error',
  });
}

function lexPeriod(s: State): void {
  push(s, 'period', s.pos, s.pos + 1);
  if (s.exprDepth > 0) return;
  const head = s.words.join(' ');
  s.words = [];
  s.statementOpen = false;
  if (EXEC_SQL.test(head)) lexNative(s, 'exec');
  else if (AMDP.test(head)) lexNative(s, 'amdp');
}

/** Only blanks stand between the start of the line and `pos`. */
function onlyBlanksBefore(s: State): boolean {
  for (let i = s.lineStart; i < s.pos; i++) if (!isBlank(s.src[i])) return false;
  return true;
}

/** Names, numbers and the other word-like forms. True when one was read. */
function lexWordLike(s: State): boolean {
  const ch = s.src[s.pos];
  if (ch === '/') {
    const ns = matchAt(NAMESPACED, s);
    if (ns) { push(s, 'word', s.pos, s.pos + ns.length); return true; }
    return false;
  }
  if (ch === '&') {
    const ph = matchAt(MACRO_PLACEHOLDER, s);
    if (ph) { push(s, 'word', s.pos, s.pos + ph.length); return true; }
    return false;
  }
  if (ch === '!') {
    const esc = matchAt(ESCAPED_NAME, s);
    if (esc) { push(s, 'word', s.pos, s.pos + esc.length); return true; }
    return false;
  }
  if (ch >= '0' && ch <= '9') {
    const dw = matchAt(DIGIT_WORD, s);
    if (dw) { push(s, 'word', s.pos, s.pos + dw.length); return true; }
    const num = matchAt(NUMBER, s);
    // ABAP has no unquoted decimal literal ('12.50' is). Read as one number, as the shipping engine does, and say so.
    if (num && num.includes('.')) diagnose(s, 'unquoted-decimal', `${num} is not an ABAP literal; a decimal is written in quotes.`, s.pos, 'warning');
    push(s, 'number', s.pos, s.pos + (num ?? ch).length);
    return true;
  }
  const word = matchAt(WORD, s);
  if (word) { push(s, 'word', s.pos, s.pos + word.length); return true; }
  return false;
}

/** One token (or one comment) starting at `pos`, which stands on a non-blank character. */
function lexOne(s: State): void {
  const ch = s.src[s.pos];
  const col0 = s.pos - s.lineStart;
  if (ch === '*' && col0 === 0) { lexComment(s); return; }
  if (ch === '*' && !s.statementOpen && s.exprDepth === 0 && onlyBlanksBefore(s)) {
    diagnose(s, 'indented-asterisk-comment', 'An indented * outside an open statement is read as a comment line.', s.pos, 'info');
    lexComment(s);
    return;
  }
  if (ch === '"') { lexComment(s); return; }
  if (ch === "'" || ch === '`') { lexQuoted(s, ch); return; }
  if (ch === '|') { lexTemplateText(s, '|'); return; }
  if (ch === '}') {
    if (s.exprDepth > 0) { s.exprDepth -= 1; lexTemplateText(s, '}'); return; }
    diagnose(s, 'unexpected-brace', '} outside a string template.', s.pos, 'error');
    push(s, 'unknown', s.pos, s.pos + 1);
    return;
  }
  if (ch === '.') {
    lexPeriod(s);
    return;
  }
  if (ch === ',') { push(s, 'comma', s.pos, s.pos + 1); return; }
  if (ch === ':') { push(s, 'colon', s.pos, s.pos + 1); return; }
  if (ch === '#' && s.src[s.pos + 1] === '#') {
    const pragma = matchAt(PRAGMA, s) ?? '##';
    push(s, 'pragma', s.pos, s.pos + pragma.length);
    return;
  }
  if (ch === '<') {
    const fs = matchAt(FIELD_SYMBOL, s);
    if (fs) { push(s, 'fieldSymbol', s.pos, s.pos + fs.length); return; }
  }
  if (lexWordLike(s)) return;
  const op = OPERATORS.find((o) => s.src.startsWith(o, s.pos));
  if (op) { push(s, 'punct', s.pos, s.pos + op.length); return; }
  diagnose(s, 'unknown-character', `No rule for the character ${JSON.stringify(ch)}.`, s.pos, 'warning');
  push(s, 'unknown', s.pos, s.pos + 1);
}

/** Lex ABAP source. Never throws; every character is in a token or is whitespace. */
export function lex(source: string): LexResult {
  const s: State = {
    src: source,
    pos: 0,
    row: 1,
    lineStart: 0,
    tokens: [],
    diagnostics: [],
    exprDepth: 0,
    space: true,
    statementOpen: false,
    words: [],
  };
  while (s.pos < s.src.length) {
    const ch = s.src[s.pos];
    if (ch === '\n' || (ch === '\r' && s.src[s.pos + 1] === '\n')) { newLine(s); continue; }
    if (isBlank(ch)) { s.pos += 1; s.space = true; continue; }
    lexOne(s);
  }
  if (s.exprDepth > 0) {
    diagnose(s, 'unterminated-template-expression', `${s.exprDepth} embedded template expression(s) still open at the end of the source.`, s.pos, 'error');
  }
  return { tokens: s.tokens, diagnostics: s.diagnostics };
}

/**
 * Offsets of the non-blank characters no token covers. Empty for every input —
 * the lexer's contract, checked by its specs and by the shadow comparison.
 */
export function uncoveredCharacters(source: string, tokens: Token[]): number[] {
  const covered = new Uint8Array(source.length);
  for (const t of tokens) covered.fill(1, t.offset, t.offset + t.text.length);
  const out: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (!covered[i] && ch !== '\n' && !isBlank(ch)) out.push(i);
  }
  return out;
}

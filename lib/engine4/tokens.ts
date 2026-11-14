/**
 * Engine 4.0, layer L0: the vocabulary the lexer hands upward.
 *
 * Pure: no imports. This module tree (`lib/engine4/`) imports nothing from
 * `lib/abap/`, and nothing there imports it (ADR-125); it is wired into no run,
 * route or page until engine 4.0.0 is switched on behind its gate.
 *
 * Every token stands on one line. A construct that spans lines — a string
 * template whose embedded expression breaks across lines, a native SQL body —
 * is several tokens, so a row and a column always say where a token is.
 */

/** 1-based row and column of a character. */
export interface Position {
  row: number;
  col: number;
}

export type TokenKind =
  /**
   * A name or a keyword. ABAP reserves no word — `DATA data TYPE i.` is valid —
   * so the lexer cannot tell the two apart; the statement layer does, by
   * position. Includes namespaced names (`/BIC/ZTAB`), escaped names (`!iv_x`),
   * macro placeholders (`&1`) and names starting with `%` (`%tky`).
   */
  | 'word'
  /** Digits, and — tolerantly — digits with a decimal point (`12.50`). */
  | 'number'
  /** `'…'` with `''` as the escaped quote. */
  | 'textLiteral'
  /** `` `…` `` with ` `` ` as the escaped backtick. */
  | 'stringLiteral'
  /** `|text|` — a string template without embedded expressions. */
  | 'template'
  /** `|text{` — a template's text up to its first embedded expression. */
  | 'templateBegin'
  /** `}text{` — text between two embedded expressions. */
  | 'templateMiddle'
  /** `}text|` — text after the last embedded expression, closing the template. */
  | 'templateEnd'
  /** `<fs>` — a field symbol, written without blanks. */
  | 'fieldSymbol'
  /** `##NAME` or `##NAME[param]` — a pragma. */
  | 'pragma'
  /** `*` in column 1 (a whole line) or `"` to the end of the line. */
  | 'comment'
  /** `"#EC …` — a pseudo-comment for the extended program check. */
  | 'pseudoComment'
  /** `.` — the end of a statement. */
  | 'period'
  /** `:` — the chain colon. */
  | 'colon'
  /** `,` — the separator of chained parts. */
  | 'comma'
  /** Every other operator or bracket: `(`, `)`, `[`, `]`, `->`, `=>`, `~`, `-`, `=`, `?=`, `+=`, `&&`, … */
  | 'punct'
  /** One line of native code (EXEC SQL … ENDEXEC, or an AMDP method body), not ABAP. */
  | 'nativeSql'
  /** A character the lexer has no rule for. Always paired with a diagnostic. */
  | 'unknown';

export interface Token {
  kind: TokenKind;
  /** Exactly the characters of the source, case kept. */
  text: string;
  /** 1-based row. */
  row: number;
  /** 1-based column of the first character. */
  col: number;
  /** 0-based offset of the first character in the source. */
  offset: number;
  /**
   * True when whitespace or a line break stands directly before the token. ABAP
   * reads blanks as syntax: `ls-f` is component access and `a - b` a minus,
   * `lo->m(` is a call and `m (` is not.
   */
  spaceBefore: boolean;
}

export type DiagnosticCode =
  | 'unterminated-literal'
  | 'unterminated-template'
  | 'unterminated-template-expression'
  | 'unexpected-brace'
  | 'unknown-character'
  | 'unquoted-decimal'
  | 'indented-asterisk-comment'
  | 'unterminated-native-sql'
  | 'missing-period'
  | 'extra-chain-colon'
  | 'empty-chain-head'
  | 'unknown-statement'
  | 'unclosed-block'
  | 'unexpected-closer'
  | 'unexpected-middle'
  | 'block-outside-container';

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  row: number;
  col: number;
  severity: 'error' | 'warning' | 'info';
}

/** The column just behind a token (exclusive). Tokens never span lines. */
export function tokenEndCol(token: Token): number {
  return token.col + token.text.length;
}

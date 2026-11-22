/**
 * Engine 4.0, layer L1: tokens → statements.
 *
 * Pure: imports only within `lib/engine4/`. A statement ends at a period; a
 * chain (`DATA: a TYPE i, b TYPE c.`) becomes one statement per part, each
 * carrying the head's tokens in front of its own and its place in the chain.
 * Comments are not part of any statement; pragmas are kept beside the tokens.
 * Every statement is classified by the table in `statement-kinds.ts`, and a
 * statement the table does not know is `Unknown` alone — its neighbours are cut
 * and classified exactly as they would be without it.
 *
 * Three contexts: `abap`; `macro` for the body between `DEFINE` and
 * `END-OF-DEFINITION` (read as statements, but it is a text the macro pastes
 * elsewhere, not code that runs where it stands); `native` for the lines the
 * lexer read in native mode (EXEC SQL … ENDEXEC, an AMDP body), which form one
 * `NativeSql` statement per region.
 */
import type { Diagnostic, Position, Token } from './tokens';
import { tokenEndCol } from './tokens';
import { kindInfo, matchRow, unitsOf, type StatementKind } from './statement-kinds';

export type StatementContext = 'abap' | 'macro' | 'native';

export interface ChainInfo {
  /** 0-based position of this part in its chain. */
  index: number;
  /** Number of parts of the chain. */
  count: number;
  /** The chain colon. */
  colon: Token;
}

export interface Statement {
  /** Position in the statement list — the order the program is written in. */
  index: number;
  kind: StatementKind;
  /** Code tokens: the chain head's (if chained), then the part's own. No comments, no pragmas, no terminator. */
  tokens: Token[];
  /** How many of `tokens` are borrowed from the chain head. 0 when not chained. */
  headCount: number;
  /** First character of the statement's own tokens (the part, for a chained one). */
  start: Position;
  /** Just behind the last own token (column exclusive). */
  end: Position;
  /** The `.` or `,` that ends it; null at the end of the source or for native code. */
  terminator: Token | null;
  chain: ChainInfo | null;
  /** Pragmas of the source statement (shared by all parts of a chain). */
  pragmas: Token[];
  context: StatementContext;
  diagnostics: Diagnostic[];
}

const ASSIGN_OPS = new Set(['=', '?=', '+=', '-=', '*=', '/=', '&&=']);
const ACCESS = new Set(['->', '=>', '~', '-']);

/** Index of the bracket that closes the one at `from`, or -1. */
function closingBracket(tokens: readonly Token[], from: number): number {
  const open = tokens[from].text;
  const close = open === '(' ? ')' : ']';
  let depth = 0;
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'punct') continue;
    if (t.text === open) depth += 1;
    else if (t.text === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * `Assignment` for `target = …` (any assignment operator), `MethodCall` for a
 * statement that is one functional call chain (`lo->m( ).`, `m( )->n( ).`,
 * `NEW lcl( )->run( ).`), else null. Read before the keyword table: in
 * `DATA(x) = 1.` the first word is DATA, but the statement assigns.
 */
export function expressionShape(tokens: readonly Token[]): 'Assignment' | 'MethodCall' | null {
  const n = tokens.length;
  let i = 0;
  const lead = tokens[0]?.text.toUpperCase();
  if ((lead === 'NEW' || lead === 'CAST') && n > 2 && tokens[2].text === '(' && !tokens[2].spaceBefore) i = 1;
  if (!tokens[i] || !(tokens[i].kind === 'word' || tokens[i].kind === 'fieldSymbol' || tokens[i].text === '#')) return null;
  i += 1;
  let called = false;
  while (i < n) {
    const t = tokens[i];
    if (t.spaceBefore || t.kind !== 'punct') break;
    if (ACCESS.has(t.text)) {
      const next = tokens[i + 1];
      // `text-001` names a text symbol: a component written with digits.
      const component = next && (next.kind === 'word' || next.kind === 'fieldSymbol' || next.text === '*' || (t.text === '-' && next.kind === 'number'));
      if (!next || next.spaceBefore || !component) break;
      i += 2;
      called = false;
      continue;
    }
    if (t.text === '+') {
      // Offset access `lv+6(2)`: the `+` is written without blanks on either side.
      const next = tokens[i + 1];
      if (!next || next.spaceBefore || !(next.kind === 'number' || next.kind === 'word')) break;
      i += 2;
      continue;
    }
    if (t.text === '(' || t.text === '[') {
      const j = closingBracket(tokens, i);
      if (j === -1) return null;
      called = t.text === '(';
      i = j + 1;
      continue;
    }
    break;
  }
  if (i < n && tokens[i].kind === 'punct' && ASSIGN_OPS.has(tokens[i].text)) return 'Assignment';
  if (i === n && called) return 'MethodCall';
  return null;
}

/** Classify one statement's code tokens. */
export function classify(tokens: readonly Token[], macros: ReadonlySet<string>): StatementKind {
  if (tokens.length === 0) return 'Unknown';
  const shape = expressionShape(tokens);
  if (shape) return shape;
  const units = unitsOf(tokens);
  const row = matchRow(units);
  if (row) return row.kind as StatementKind;
  if (tokens[0].kind === 'word' && macros.has(units[0])) return 'MacroCall';
  return 'Unknown';
}

interface Builder {
  out: Statement[];
  macros: Set<string>;
  inMacro: boolean;
  /** Column of the `DEFINE` whose body is open. */
  macroCol: number;
}

/**
 * Kinds that never stand in a macro body (ADR-134 Q5): routine, class,
 * interface and event boundaries. A body that meets one has lost its
 * END-OF-DEFINITION, and the statement is read as code again.
 */
const MACRO_BOUNDARY = new Set<StatementKind>([
  'Form', 'EndForm', 'Method', 'MethodAmdp', 'EndMethod', 'Function', 'EndFunction', 'Module', 'EndModule',
  'ClassDefinition', 'ClassImplementation', 'EndClass', 'Interface', 'EndInterface',
]);

function endsMacroBody(b: Builder, kind: StatementKind, first: Token, lineStart: boolean): boolean {
  if (MACRO_BOUNDARY.has(kind) || kindInfo(kind).event) return true;
  return lineStart && first.col <= b.macroCol;
}

function positionOf(token: Token): Position {
  return { row: token.row, col: token.col };
}

function endOf(token: Token): Position {
  return { row: token.row, col: tokenEndCol(token) };
}

function emit(
  b: Builder,
  head: Token[],
  own: Token[],
  terminator: Token | null,
  chain: Omit<ChainInfo, 'count'> | null,
  pragmas: Token[],
  diagnostics: Diagnostic[],
  lineStart = false,
): void {
  if (own.length === 0) return;
  const tokens = [...head, ...own];
  const kind = classify(tokens, b.macros);
  if (b.inMacro && kind !== 'EndOfDefinition' && kind !== 'Define' && (chain === null || chain.index === 0) && endsMacroBody(b, kind, tokens[0], lineStart)) {
    b.inMacro = false;
  }
  // A macro cannot define a macro: a DEFINE inside a body means the body before it lost its END-OF-DEFINITION.
  const context: StatementContext = b.inMacro && kind !== 'EndOfDefinition' && kind !== 'Define' ? 'macro' : 'abap';
  const diags = [...diagnostics];
  if (kind === 'Unknown' && context === 'abap') {
    diags.push({
      code: 'unknown-statement',
      message: `No statement kind for "${tokens.slice(0, 3).map((t) => t.text).join(' ')}".`,
      row: own[0].row,
      col: own[0].col,
      severity: 'warning',
    });
  }
  b.out.push({
    index: b.out.length,
    kind,
    tokens,
    headCount: head.length,
    start: positionOf(own[0]),
    end: endOf(own[own.length - 1]),
    terminator,
    chain: chain ? { ...chain, count: 0 } : null,
    pragmas,
    context,
    diagnostics: diags,
  });
  if (kind === 'Define' && context === 'abap') {
    const units = unitsOf(tokens);
    if (units[1]) b.macros.add(units[1]);
    b.inMacro = true;
    b.macroCol = tokens[0].col;
  } else if (kind === 'EndOfDefinition') {
    b.inMacro = false;
  }
}

/** Depth change of a token for chain splitting: brackets and template expressions. */
function depthDelta(t: Token): number {
  if (t.kind === 'templateBegin') return 1;
  if (t.kind === 'templateEnd') return -1;
  if (t.kind !== 'punct') return 0;
  if (t.text === '(' || t.text === '[') return 1;
  if (t.text === ')' || t.text === ']') return -1;
  return 0;
}

/** One source statement (code tokens up to its period), expanded when it is a chain. */
function emitSource(b: Builder, code: Token[], pragmas: Token[], period: Token | null, lineStart = false): void {
  const diagnostics: Diagnostic[] = [];
  if (!period && code.length) {
    const last = code[code.length - 1];
    diagnostics.push({ code: 'missing-period', message: 'The last statement has no period.', row: last.row, col: last.col, severity: 'warning' });
  }
  let depth = 0;
  let colonAt = -1;
  for (let i = 0; i < code.length; i++) {
    depth = Math.max(0, depth + depthDelta(code[i]));
    if (code[i].kind === 'colon' && depth === 0) { colonAt = i; break; }
  }
  if (colonAt === 0) {
    diagnostics.push({ code: 'empty-chain-head', message: 'A chain colon with nothing before it.', row: code[0].row, col: code[0].col, severity: 'warning' });
    emit(b, [], code.slice(1), period, null, pragmas, diagnostics);
    return;
  }
  if (colonAt === -1) {
    emit(b, [], code, period, null, pragmas, diagnostics, lineStart);
    return;
  }
  const colon = code[colonAt];
  const head = code.slice(0, colonAt);
  const first = b.out.length;
  let part: Token[] = [];
  let index = 0;
  depth = 0;
  for (let i = colonAt + 1; i < code.length; i++) {
    const t = code[i];
    depth = Math.max(0, depth + depthDelta(t));
    if (depth === 0 && t.kind === 'colon') {
      diagnostics.push({ code: 'extra-chain-colon', message: 'A second chain colon is ignored.', row: t.row, col: t.col, severity: 'info' });
      continue;
    }
    if (depth === 0 && t.kind === 'comma') {
      if (part.length) emit(b, head, part, t, { index: index++, colon }, pragmas, diagnostics.splice(0), lineStart);
      part = [];
      continue;
    }
    part.push(t);
  }
  emit(b, head, part, period, { index: index++, colon }, pragmas, diagnostics.splice(0), lineStart);
  for (let s = first; s < b.out.length; s++) {
    const c = b.out[s].chain;
    if (c) c.count = index;
  }
}

function emitNative(b: Builder, native: Token[]): void {
  b.out.push({
    index: b.out.length,
    kind: 'NativeSql',
    tokens: native,
    headCount: 0,
    start: positionOf(native[0]),
    end: endOf(native[native.length - 1]),
    terminator: null,
    chain: null,
    pragmas: [],
    context: 'native',
    diagnostics: [],
  });
}

export interface StatementsOptions {
  /**
   * Macro names defined outside this token stream — in another include of the
   * same upload. Without them a call of such a macro is `Unknown`.
   */
  macros?: Iterable<string>;
}

/** Upper-cased names of the macros a statement list defines. */
export function macroNames(list: readonly Statement[]): string[] {
  return list.filter((s) => s.kind === 'Define' && s.context === 'abap').map((s) => unitsOf(s.tokens)[1]).filter((n): n is string => !!n);
}

/** Every statement of a token stream, in source order. */
export function statements(tokens: readonly Token[], options: StatementsOptions = {}): Statement[] {
  const b: Builder = { out: [], macros: new Set([...(options.macros ?? [])].map((m) => m.toUpperCase())), inMacro: false, macroCol: 0 };
  let code: Token[] = [];
  let pragmas: Token[] = [];
  /** Row of the last code token, pragma or period read; a statement whose first token is on a new row starts a line. */
  let lastRow = 0;
  let lineStart = false;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'comment' || t.kind === 'pseudoComment') { i += 1; continue; }
    if (t.kind === 'pragma') { pragmas.push(t); i += 1; continue; }
    if (t.kind === 'nativeSql') {
      if (code.length) emitSource(b, code, pragmas, null);
      code = [];
      pragmas = [];
      const native: Token[] = [];
      while (i < tokens.length && (tokens[i].kind === 'nativeSql' || tokens[i].kind === 'comment')) {
        if (tokens[i].kind === 'nativeSql') native.push(tokens[i]);
        i += 1;
      }
      emitNative(b, native);
      continue;
    }
    if (t.kind === 'period') {
      if (code.length) emitSource(b, code, pragmas, t, lineStart);
      code = [];
      pragmas = [];
      lastRow = t.row;
      i += 1;
      continue;
    }
    if (code.length === 0) lineStart = t.row !== lastRow;
    code.push(t);
    lastRow = t.row;
    i += 1;
  }
  if (code.length) emitSource(b, code, pragmas, null, lineStart);
  return b.out;
}

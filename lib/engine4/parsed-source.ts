/**
 * Engine 4.0, Phase 0 "parse once" (engine review §4.3 and §11 step 2;
 * ADR-125 (4)): one parsed source that every reader can share instead of
 * splitting, masking and nesting the text again.
 *
 * Pure: imports only within `lib/engine4/`. Inert until the owner decides the
 * wiring (`docs/design/engine4.md`, "Phase 0"): ADR-125 (1) keeps `lib/abap/`
 * from importing this tree before the switch.
 *
 * What it holds, each computed once:
 *
 *   - the source, its lines, the L0 tokens (comments, pragmas and literal texts
 *     included, so no reader that looks at them loses anything), the L1
 *     statements, the L2 block tree, and every diagnostic;
 *   - `compat`: the shipping engine's `AbapStatement[]` view, built from the
 *     tokens (`compat.ts`), with `maskedText(i)` — the shipping
 *     `maskLiterals(compat[i].text)` — derived from the token kinds;
 *   - `maskNonCode()` / `maskComments()`: the whole-source masks, derived from
 *     the tokens;
 *   - the container index: routines, classes, function modules and event blocks
 *     from the block tree, in the shipping order, and `containerAt(line)` as a
 *     lookup instead of a scan over every container.
 */
import { blocks, type Block, type BlockTree } from './blocks';
import { buildCompat, maskText, type CompatStatement } from './compat';
import { lex } from './lexer';
import { statements, type Statement, type StatementsOptions } from './statements';
import type { Diagnostic, Token } from './tokens';

export type { CompatStatement } from './compat';

/** Structurally identical to `Container` (lib/abap/block-structure.ts). */
export interface CompatContainer {
  kind: 'form' | 'method' | 'module' | 'class' | 'function' | 'event';
  name: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParsedSource {
  source: string;
  lines: string[];
  tokens: Token[];
  statements: Statement[];
  tree: BlockTree;
  diagnostics: Diagnostic[];
  /** The shipping statement view (`AbapStatement[]` by structure). */
  compat: CompatStatement[];
  /** `compatToStatement[i]` is the L1 statement compat statement `i` was built from; -1 for a native SQL piece. */
  compatToStatement: Int32Array;
  /** The shipping `maskLiterals(compat[i].text)`. */
  maskedText(i: number): string;
  /** The shipping `maskNonCode(source)`: comments and literal contents blanked, offsets kept. */
  maskNonCode(): string;
  /** The shipping `maskComments(source)`: comments blanked, literals kept. */
  maskComments(): string;
  /** Containers in the shipping order: event blocks, then FORM/METHOD/MODULE/CLASS by opener, then function modules. */
  containers: CompatContainer[];
  /** The innermost container of a line, as the shipping `containerAt` answers it. */
  containerAt(line: number): CompatContainer | null;
  /**
   * True when L2 had to recover (an unclosed block or a closer with nothing to
   * close). There its container ranges are the right ones and differ from the
   * shipping `readBlocks` on purpose (148 of 962 damages), so a neutral wiring
   * keeps the shipping container reader for such a source until a gated reading
   * switches it.
   */
  recovered: boolean;
}

const ROUTINE_KINDS = new Set(['form', 'method', 'module', 'class']);

function containersOf(tree: BlockTree): CompatContainer[] {
  const of = (b: Block): CompatContainer => ({ kind: b.kind as CompatContainer['kind'], name: b.name ?? '', lineStart: b.start.row, lineEnd: b.end.row });
  const byOpener = (a: Block, b: Block) => (a.opener ?? 0) - (b.opener ?? 0);
  const blocksOf = (test: (b: Block) => boolean) => tree.blocks.filter(test).sort(byOpener).map(of);
  return [
    ...blocksOf((b) => b.kind === 'event'),
    ...blocksOf((b) => ROUTINE_KINDS.has(b.kind)),
    ...blocksOf((b) => b.kind === 'function'),
  ];
}

/**
 * `at[line]` for every line: a routine wins over an event block, and among
 * equals the one that starts later; on the same start line the earlier in the
 * list. Painted once, so a lookup is constant time.
 */
function containerIndex(containers: CompatContainer[], lineCount: number): Array<CompatContainer | null> {
  const at: Array<CompatContainer | null> = new Array(lineCount + 2).fill(null);
  const order = containers.map((c, i) => ({ c, i }));
  const paint = (event: boolean) => {
    const group = order.filter(({ c }) => (c.kind === 'event') === event);
    group.sort((a, b) => a.c.lineStart - b.c.lineStart || b.i - a.i);
    for (const { c } of group) {
      for (let line = Math.max(0, c.lineStart); line <= Math.min(lineCount + 1, c.lineEnd); line++) at[line] = c;
    }
  };
  paint(true);
  paint(false);
  return at;
}

function wholeMask(source: string, tokens: readonly Token[], literals: boolean): string {
  const out = source.split('');
  const put = (t: Token, text: string) => { for (let k = 0; k < text.length; k++) out[t.offset + k] = text[k]; };
  let depth = 0;
  for (const t of tokens) {
    switch (t.kind) {
      case 'comment':
      case 'pseudoComment':
        put(t, maskComment(t, literals, source));
        break;
      case 'nativeSql':
        // Native code is one raw line per token; the shipping mask reads it as ABAP, line by line.
        put(t, maskNative(t.text, literals));
        break;
      case 'textLiteral':
      case 'stringLiteral':
      case 'template':
      case 'templateBegin':
      case 'templateMiddle':
      case 'templateEnd':
        if (!literals) break;
        put(t, maskLiteralToken(t, depth));
        if (t.kind === 'templateBegin') depth += 1;
        if (t.kind === 'templateEnd') depth = Math.max(0, depth - 1);
        break;
      default:
        if (literals && depth > 0) put(t, ' '.repeat(t.text.length));
    }
  }
  return out.join('');
}

/**
 * A comment blanked, line breaks kept. The shipping mask finds an inline `"`
 * comment after masking the line's literals and blanks the rest of that masked
 * line, so an apostrophe in the comment ("it's") blanks a trailing `\r` too.
 */
function maskComment(t: Token, literals: boolean, source: string): string {
  if (!literals || !t.text.startsWith('"')) return ' '.repeat(t.text.length);
  // The line break behind the comment belongs to the masked line; the scanner blanks it while a literal is open.
  const cr = source[t.offset + t.text.length] === '\r' ? '\r' : '';
  return maskText(t.text + cr).replace(/[^\r\n]/g, ' ');
}

/**
 * A native line as the shipping mask reads it: as ABAP, so the first `"`
 * outside a literal starts a comment (in an AMDP body it quotes an identifier;
 * an EXEC SQL line already has its `"` comment as a comment token).
 */
function maskNative(text: string, literals: boolean): string {
  const masked = maskText(text);
  const base = literals ? masked : text;
  const quote = masked.indexOf('"');
  return quote === -1 ? base : base.slice(0, quote) + ' '.repeat(text.length - quote);
}

/** A literal token masked at template depth `depth` (before the token). */
function maskLiteralToken(t: Token, depth: number): string {
  const blank = ' '.repeat(t.text.length);
  if (depth > (t.kind === 'templateEnd' ? 1 : 0)) return blank;
  if (t.kind === 'textLiteral' || t.kind === 'stringLiteral') {
    const q = t.text[0];
    return [...t.text].map((ch) => (ch === q ? ch : ' ')).join('');
  }
  const closes = t.text.length >= 2 && t.text.endsWith('|') && !t.text.endsWith('\\|');
  if (t.kind === 'template') return closes ? `|${blank.slice(2)}|` : `|${blank.slice(1)}`;
  if (t.kind === 'templateBegin') return `|${blank.slice(1)}`;
  if (t.kind === 'templateEnd') return closes ? `${blank.slice(1)}|` : blank;
  return blank;
}

/** Lex, cut, nest and index a source once. */
export function parseSource(source: string, options: StatementsOptions = {}): ParsedSource {
  const lexed = lex(source);
  const list = statements(lexed.tokens, options);
  const tree = blocks(list);
  const compat = buildCompat(source, lexed.tokens, list);
  const lines = source.split(/\r?\n/);
  const containers = containersOf(tree);
  let index: Array<CompatContainer | null> | null = null;
  let nonCode: string | null = null;
  let comments: string | null = null;
  return {
    source,
    lines,
    tokens: lexed.tokens,
    statements: list,
    tree,
    diagnostics: [...lexed.diagnostics, ...list.flatMap((s) => s.diagnostics), ...tree.diagnostics],
    compat: compat.list,
    compatToStatement: Int32Array.from(compat.fromStatement),
    maskedText: (i) => compat.masked[i],
    maskNonCode: () => (nonCode ??= wholeMask(source, lexed.tokens, true)),
    maskComments: () => (comments ??= wholeMask(source, lexed.tokens, false)),
    containers,
    recovered: tree.diagnostics.some((d) => d.code === 'unclosed-block' || d.code === 'unexpected-closer'),
    containerAt: (line) => {
      index ??= containerIndex(containers, lines.length);
      return line >= 0 && line < index.length ? index[line] : null;
    },
  };
}

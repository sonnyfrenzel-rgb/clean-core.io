/**
 * Engine 4.0 — the public surface of the new engine's module tree (ADR-125).
 *
 * Pure: imports only within `lib/engine4/`. Nothing in the product reads this
 * yet: no run, signature, audit pack, page or route, until engine 4.0.0 is
 * switched on behind its gate. Layers built so far: L0 (`lex`), L1
 * (`statements`), L2 (`blocks`) and the upload layout of L3 (`layout`). See `docs/design/engine4.md`.
 */
export type { Diagnostic, DiagnosticCode, Position, Token, TokenKind } from './tokens';
export { tokenEndCol } from './tokens';
export { lex, uncoveredCharacters, type LexResult } from './lexer';
export {
  KIND_TABLE,
  SHAPE_KINDS,
  allKinds,
  kindInfo,
  matchRow,
  unitsOf,
  type BlockKind,
  type KindInfo,
  type KindRow,
  type StatementKind,
} from './statement-kinds';
export {
  classify,
  expressionShape,
  macroNames,
  statements,
  type ChainInfo,
  type Statement,
  type StatementContext,
  type StatementsOptions,
} from './statements';
export {
  blocks,
  enclosingBlocks,
  type Block,
  type BlockNode,
  type BlockTree,
  type BlockType,
  type Branch,
  type Termination,
} from './blocks';
export {
  layout,
  macrosFor,
  partNameOfFile,
  splitJoined,
  type Attachment,
  type Definition,
  type IncludeRef,
  type IncludeState,
  type LayoutCode,
  type LayoutDiagnostic,
  type ObjectType,
  type PartRole,
  type UploadFile,
  type UploadLayout,
  type UploadObject,
  type UploadPart,
} from './layout';

import { blocks, type BlockTree } from './blocks';
import { layout, macrosFor, type UploadFile, type UploadLayout } from './layout';
import { lex } from './lexer';
import { statements, type Statement, type StatementsOptions } from './statements';
import type { Diagnostic } from './tokens';

/**
 * Lex, cut and nest in one call: the statements of a source, their block tree
 * and every diagnostic of the three layers.
 */
export function readSource(source: string, options: StatementsOptions = {}): { statements: Statement[]; tree: BlockTree; diagnostics: Diagnostic[] } {
  const lexed = lex(source);
  const list = statements(lexed.tokens, options);
  const tree = blocks(list);
  return { statements: list, tree, diagnostics: [...lexed.diagnostics, ...list.flatMap((s) => s.diagnostics), ...tree.diagnostics] };
}

export { parseSource, type CompatContainer, type CompatStatement, type ParsedSource } from './parsed-source';
/**
 * Read a whole upload: its layout (L3), then every part through L1 and L2 with
 * the macros the layout says it sees — its object's own `DEFINE`s in any of
 * its files, and the system macros. Parts come in the layout's reading order.
 */
export function readUpload(files: readonly UploadFile[]): {
  layout: UploadLayout;
  parts: Array<{ object: string; part: string; file: string; statements: Statement[]; tree: BlockTree; diagnostics: Diagnostic[] }>;
} {
  const l = layout(files);
  const byName = new Map(l.parts.map((p) => [p.name, p]));
  const parts = l.order.map(({ object, part }) => {
    const p = byName.get(part)!;
    const list = statements(p.tokens, { macros: macrosFor(l, part) });
    const tree = blocks(list);
    return { object, part, file: p.file, statements: list, tree, diagnostics: [...p.lexDiagnostics, ...list.flatMap((s) => s.diagnostics), ...tree.diagnostics] };
  });
  return { layout: l, parts };
}

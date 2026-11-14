/**
 * Engine 4.0 — the public surface of the new engine's module tree (ADR-125).
 *
 * Pure: imports only within `lib/engine4/`. Nothing in the product reads this
 * yet: no run, signature, audit pack, page or route, until engine 4.0.0 is
 * switched on behind its gate. Layers built so far: L0 (`lex`) and L1
 * (`statements`). See `docs/design/engine4.md`.
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

import { lex } from './lexer';
import { statements, type Statement } from './statements';
import type { Diagnostic } from './tokens';

/** Lex and cut in one call: the statements of a source and every diagnostic of both layers. */
export function readSource(source: string): { statements: Statement[]; diagnostics: Diagnostic[] } {
  const lexed = lex(source);
  const list = statements(lexed.tokens);
  return { statements: list, diagnostics: [...lexed.diagnostics, ...list.flatMap((s) => s.diagnostics)] };
}

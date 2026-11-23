import type { AbapStatement } from '../statement-reader';
import type { Block } from '../block-structure';
import type { NodeAnchor } from '../process-skeleton';

/**
 * Small readers over one statement or block that every skeleton pass shares (engine 4 phase 3). Moved out of
 * `process-skeleton.ts` unchanged, so the passes in `lib/abap/skeleton/` and the builder read anchors, ranges and
 * snippets one way.
 */

/** A statement's text cut for a note or a shape: at most 160 characters. */
export function snippet(text: string): string {
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/**
 * The statements inside a block, first and last, both inclusive.
 *
 * A block nothing closed has its last statement *as* its `closeIndex` rather
 * than one past it, and reading it with the terminated formula silently drops
 * the last statement of the routine — which for an unterminated `FORM` is the
 * one statement that made it a step at all.
 */
export function bodyRange(block: Block): [number, number] {
  return [block.openIndex + 1, block.terminated ? block.closeIndex - 1 : block.closeIndex];
}

/** 0-based index of the first token equal to `word`, or 0 when there is none. */
export function tokenIndexOf(statement: AbapStatement, word: RegExp): number {
  const tokens = statement.text.split(' ');
  const at = tokens.findIndex((t) => word.test(t));
  return at < 0 ? 0 : at;
}

export function anchorOf(statement: AbapStatement, tokenOffset = 0): NodeAnchor {
  return {
    statementIndex: statement.index,
    tokenOffset,
    lineStart: statement.lineStart,
    lineEnd: statement.lineEnd,
  };
}

/** `REPORT zlegacy_order_fulfillment_audit …` — a token out of the source, upper-cased. */
export function programName(statements: readonly AbapStatement[]): { name: string; anchor: NodeAnchor } | null {
  for (const statement of statements) {
    if (statement.keyword !== 'REPORT' && statement.keyword !== 'PROGRAM') continue;
    const name = /^(?:REPORT|PROGRAM)\s+([\w/]+)/i.exec(statement.text)?.[1];
    if (name) return { name: name.toUpperCase(), anchor: anchorOf(statement, 1) };
  }
  return null;
}

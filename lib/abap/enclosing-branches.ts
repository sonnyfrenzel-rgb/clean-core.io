import type { AbapStatement } from './statement-reader';
import type { BlockStructure } from './block-structure';

/**
 * The branches a statement stands in — roadmap 3.0.18 item 13 (QM-06, FI-F11).
 *
 * The QM and FI reviews of 18.10.2026 found short rules that had lost the
 * condition they live under: "If critical or no retest → FAIL" stated without
 * the enclosing "first test failed" branch, "if p_final → ELIGIBLE" without the
 * reviewer-quorum check around it. Read alone, each says something the code
 * does not: the inner test decides nothing unless the outer one held.
 *
 * This reads the outer conditions off the nesting the skeleton is built from
 * (`block-structure.ts`, `enclosing[i]`): for every `IF` and `CASE` around the
 * statement, inside the routine it stands in, the branch it sits in — the `IF`,
 * an `ELSEIF` with the conditions before it that did not hold, an `ELSE`, a
 * `WHEN` with its values or `WHEN OTHERS`. Loops, `TRY` and macros are not
 * conditions and are passed over. A routine boundary ends the walk: a FORM is
 * entered from wherever it is called, so a branch around the `PERFORM` is the
 * caller's, not the rule's.
 *
 * Pure and deterministic; the wording is the caller's (each reader says
 * conditions in its own words). Verbatim condition texts only.
 */

export type EnclosingBranchKind = 'if' | 'elseif' | 'else' | 'when' | 'when-others';

export interface EnclosingBranch {
  kind: EnclosingBranchKind;
  /** The condition as written (`lv_first = 'F'`); the values for `when` (`'A' OR 'B'`); null for `else` and `when-others`. */
  condition: string | null;
  /** The conditions (or `WHEN` values) of the branches before this one in the same `IF`/`CASE`, as written, in order. */
  earlier: string[];
  /** The `CASE` operand for `when` and `when-others`; null otherwise. */
  selector: string | null;
  /** The line the branch's head stands on (`IF`, `ELSEIF`, `ELSE`, `WHEN`). */
  line: number;
  /** The line of the `IF` or `CASE` the branch belongs to. */
  chainLine: number;
}

const ROUTINE_KINDS = new Set(['form', 'method', 'module', 'class', 'interface', 'define']);

const afterHead = (text: string, keyword: RegExp): string => text.replace(keyword, '').replace(/\.\s*$/, '').trim();

/**
 * The branches around statement `index`, outermost first. A statement that
 * is itself the head of a branch (`ELSEIF`, `ELSE`, `WHEN`) does not count its
 * own `IF`/`CASE` as a parent; an `IF` never does (`enclosing` leaves out the
 * block a statement opens).
 */
export function enclosingBranches(
  statements: readonly AbapStatement[],
  structure: Pick<BlockStructure, 'enclosing'>,
  index: number,
): EnclosingBranch[] {
  const around = structure.enclosing[index] ?? [];
  const own = statements[index]?.keyword.toUpperCase();
  const blocks = own === 'ELSEIF' || own === 'ELSE' || own === 'WHEN' ? around.slice(0, -1) : around;
  let start = 0;
  blocks.forEach((b, i) => {
    if (ROUTINE_KINDS.has(b.kind)) start = i + 1;
  });
  const out: EnclosingBranch[] = [];
  for (const block of blocks.slice(start)) {
    if (block.kind !== 'if' && block.kind !== 'case') continue;
    const head = statements[block.openIndex];
    // The branch heads directly in this block, before the statement.
    const heads: AbapStatement[] = [];
    for (let j = block.openIndex + 1; j < index; j += 1) {
      const keyword = statements[j].keyword.toUpperCase();
      const direct = structure.enclosing[j]?.[structure.enclosing[j].length - 1] === block;
      if (!direct) continue;
      if (block.kind === 'if' && (keyword === 'ELSEIF' || keyword === 'ELSE')) heads.push(statements[j]);
      if (block.kind === 'case' && keyword === 'WHEN') heads.push(statements[j]);
    }
    if (block.kind === 'if') {
      const chain = [head, ...heads];
      const current = chain[chain.length - 1];
      const keyword = current.keyword.toUpperCase();
      const earlier = chain.slice(0, -1).map((s) => afterHead(s.text, /^(?:IF|ELSEIF)\s+/i));
      out.push({
        kind: keyword === 'ELSE' ? 'else' : keyword === 'ELSEIF' ? 'elseif' : 'if',
        condition: keyword === 'ELSE' ? null : afterHead(current.text, /^(?:IF|ELSEIF)\s+/i),
        earlier,
        selector: null,
        line: current.lineStart,
        chainLine: head.lineStart,
      });
    } else {
      // Before the first WHEN nothing of the CASE runs; a statement there has no branch.
      if (heads.length === 0) continue;
      const current = heads[heads.length - 1];
      const values = afterHead(current.text, /^WHEN\s+/i);
      const others = /^OTHERS$/i.test(values);
      out.push({
        kind: others ? 'when-others' : 'when',
        condition: others ? null : values,
        earlier: heads.slice(0, -1).map((s) => afterHead(s.text, /^WHEN\s+/i)),
        selector: afterHead(head.text, /^CASE\s+/i) || null,
        line: current.lineStart,
        chainLine: head.lineStart,
      });
    }
  }
  return out;
}

const NEGATED_OPERATOR: Record<string, string> = {
  '=': '<>', '<>': '=', '<': '>=', '>=': '<', '>': '<=', '<=': '>',
  EQ: 'NE', NE: 'EQ', LT: 'GE', GE: 'LT', GT: 'LE', LE: 'GT',
};

/**
 * The opposite of one simple condition, as ABAP — `a = 'F'` → `a <> 'F'`,
 * `x IS INITIAL` → `x IS NOT INITIAL`. Null for anything combined (AND, OR,
 * NOT, brackets, BETWEEN): its opposite is not one condition, and the caller
 * says "does not hold" instead of guessing.
 */
export function negateCondition(condition: string): string | null {
  const text = condition.trim();
  if (/[()]/.test(text) || /\s(?:AND|OR|EQUIV|BETWEEN)\s/i.test(text) || /^NOT\s/i.test(text)) return null;
  const is = /^(\S+)\s+IS\s+(NOT\s+)?(INITIAL|BOUND|ASSIGNED|SUPPLIED|REQUESTED)$/i.exec(text);
  if (is) return `${is[1]} IS ${is[2] ? '' : 'NOT '}${is[3]}`;
  const inSel = /^(\S+)\s+(NOT\s+)?IN\s+(\S+)$/i.exec(text);
  if (inSel) return `${inSel[1]} ${inSel[2] ? '' : 'NOT '}IN ${inSel[3]}`;
  const compare = /^(\S+)\s*(<=|>=|<>|<|>|=|\bEQ\b|\bNE\b|\bLT\b|\bGT\b|\bLE\b|\bGE\b)\s*(\S+)$/i.exec(text);
  if (compare) {
    const op = NEGATED_OPERATOR[compare[2].toUpperCase()];
    return op ? `${compare[1]} ${op} ${compare[3]}` : null;
  }
  return null;
}

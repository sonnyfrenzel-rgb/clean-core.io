/**
 * Raw or derived: where a check of the original belongs in the target
 * (rule 15 as fixed by QA finding 4e9d1315469d, owner/coordinator 12.10.2026).
 *
 *   - A **raw** check reads only the request: selection inputs, constants,
 *     literals and the fields of an input record. It runs on the whole input
 *     before any business calculation — at the step's entry (written by the
 *     engine before the fill marker) or in the selection checks.
 *   - A **derived** check reads a value the program computes before it: a
 *     variable written earlier in the same routine (`lv_sum = lv_sum + …`
 *     before `IF lv_sum > 100`), a global written by another routine (state of
 *     an earlier step), or a system field (`sy-subrc` reports the statement
 *     before). It keeps the original's order and scope: the engine writes the
 *     guard function, and the model's body must call it at the original's
 *     position, handing in the computed values. A body that does not call it,
 *     or re-implements its condition inline, is refused (`bodyGuards`).
 *
 * Read from the statement reader's lines (`lib/abap/original-contract.ts`
 * reads the same statements). Pure: no network, no model.
 */

import { containerAt, type Container } from '../abap/block-structure';
import type { AbapStatement } from '../abap/statement-reader';
import { camelName } from './naming';

const NOT_OPERANDS = new Set(
  'AND OR NOT IS INITIAL BOUND ASSIGNED SUPPLIED REQUESTED IN BETWEEN EQ NE GT GE LT LE CO CN CA NA CS NS CP NP LINES STRLEN ABS ABAP_TRUE ABAP_FALSE SPACE TRUE FALSE XSDBOOL BOOLC'.split(' '),
);

const WRITERS = /^(?:ADD|SUBTRACT|MULTIPLY|DIVIDE|COMPUTE|MOVE|MOVE-CORRESPONDING)\b/i;

export interface GuardOperand {
  /** As the condition writes it, lower case: `lv_sum`, `sy-subrc`. */
  name: string;
  /** The property of the guard's `values` argument: `lvSum`, `sySubrc`. */
  key: string;
}

export interface GuardBasis {
  basis: 'raw' | 'derived';
  /** The operands the body hands in (derived only). */
  operands: GuardOperand[];
  /** The literals the condition compares against (`'100'` → `100`). */
  literals: string[];
  /** The comparison operator of a simple condition, normalised (`>`, `>=`, `<`, `<=`, `=`, `<>`); null otherwise. */
  op: string | null;
  /** Why derived: "lv_sum written at L60 in VALIDATE_POLICY", "sy-subrc is a system field". */
  reason: string | null;
}

const OPS: Record<string, string> = { '>': '>', GT: '>', '>=': '>=', GE: '>=', '<': '<', LT: '<', '<=': '<=', LE: '<=', '=': '=', EQ: '=', '<>': '<>', NE: '<>' };

/** The data objects a condition reads (structure components by their full name). */
export function operandsOf(condition: string): string[] {
  const out: string[] = [];
  for (const m of condition.matchAll(/'(?:[^']|'')*'|`[^`]*`|(<?[A-Za-z_/][\w/~]*>?(?:-[\w/~]+)*)(\s*\()?/g)) {
    if (!m[1] || m[2]) continue; // a literal, or a built-in function's name
    const t = m[1];
    if (/^\d/.test(t) || NOT_OPERANDS.has(t.toUpperCase())) continue;
    if (!out.includes(t.toLowerCase())) out.push(t.toLowerCase());
  }
  return out;
}

const baseOf = (operand: string) => operand.split('-')[0];

/** Every write of a data object: `x = …`, `x-comp = …`, `ADD … TO x`, `COMPUTE x = …`, `MOVE … TO x`. */
function writesOf(statements: readonly AbapStatement[]): Array<{ base: string; line: number }> {
  const out: Array<{ base: string; line: number }> = [];
  for (const st of statements) {
    if (st.nativeSql) continue;
    const text = st.text.replace(/\.$/, '');
    const assign = /^(<?[A-Za-z_/][\w/~]*>?)(?:-[\w/~]+)*\s*(?:[-+*/]|&&)?=(?!=)\s*/.exec(text);
    if (assign && !/^(?:IF|ELSEIF|WHEN|CHECK|WHILE|WHERE|AND|OR|DATA|TYPES|CONSTANTS|PARAMETERS|SELECT-OPTIONS|FIELD-SYMBOLS|METHODS|CLASS-DATA|STATICS)$/i.test(st.keyword)) {
      out.push({ base: assign[1].toLowerCase(), line: st.lineStart });
      continue;
    }
    if (WRITERS.test(text)) {
      const target = /\b(?:TO|FROM|BY)\s+(<?[A-Za-z_/][\w/~]*>?)/i.exec(text) ?? /^COMPUTE\s+(<?[A-Za-z_/][\w/~]*>?)/i.exec(text);
      const subject = /^(?:MULTIPLY|DIVIDE)\s+(<?[A-Za-z_/][\w/~]*>?)/i.exec(text);
      const t = subject ?? target;
      if (t) out.push({ base: t[1].toLowerCase(), line: st.lineStart });
    }
  }
  return out;
}

export interface GuardBasisReader {
  basisOf(line: number, condition: string): GuardBasis;
}

/**
 * A reader over one source: `inputs` are the selection inputs and `constants`
 * the declared constants (lower case) — both raw by definition.
 */
export function guardBasisReader(statements: readonly AbapStatement[], containers: readonly Container[], inputs: readonly string[], constants: readonly string[]): GuardBasisReader {
  const writes = writesOf(statements);
  const raw = new Set([...inputs, ...constants].map((n) => n.toLowerCase()));
  return {
    basisOf(line, condition) {
      const operands = operandsOf(condition);
      const here = containerAt(containers as Container[], line);
      const derived: GuardOperand[] = [];
      let reason: string | null = null;
      for (const operand of operands) {
        const base = baseOf(operand);
        if (raw.has(base)) continue;
        if (base === 'sy') {
          derived.push({ name: operand, key: camelName(operand) });
          reason ??= `${operand} is a system field — it reports the statement before`;
          continue;
        }
        const write = writes.find((w) => {
          if (w.base !== base) return false;
          const there = containerAt(containers as Container[], w.line);
          const same = there && here && there.lineStart === here.lineStart && there.name === here.name;
          return same ? w.line < line : true;
        });
        if (write) {
          derived.push({ name: operand, key: camelName(operand) });
          const there = containerAt(containers as Container[], write.line);
          reason ??= `${base} is written at L${write.line}${there ? ` in ${there.name}` : ''}`;
        }
      }
      const literals = [...condition.matchAll(/'((?:[^']|'')*)'|(?<![\w.-])(-?\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]));
      const cmp = /^\s*[<\w/~>-]+\s*(>=|<=|<>|=|>|<|\bGE\b|\bLE\b|\bNE\b|\bEQ\b|\bGT\b|\bLT\b)\s*('(?:[^']|'')*'|[\w/~.-]+)\s*$/i.exec(condition);
      return {
        basis: derived.length > 0 ? 'derived' : 'raw',
        operands: derived,
        literals,
        op: cmp ? OPS[cmp[1].toUpperCase()] ?? null : null,
        reason,
      };
    },
  };
}

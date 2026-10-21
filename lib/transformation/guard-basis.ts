/**
 * Raw or derived: where a check of the original belongs in the target
 * (rule 15 as fixed by owner/coordinator 12.10.2026).
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

/**
 * Whether a work area holds one of the program's input records — a row of a
 * structure the input contract maps to `record` (`recordInputOf`). `table` is
 * the internal table a LOOP or READ TABLE reads, null for a SELECT.
 */
export type InputRecordTest = (workArea: string, table: string | null) => boolean;

const NAME = String.raw`@?(?:(?:DATA|FIELD-SYMBOL)\(\s*)?(<?[A-Za-z_/][\w/~]*>?)`;

/**
 * The work areas a statement fills from a table or a database read (defect E, 13.10.2026):
 * `LOOP AT itab INTO wa` / `ASSIGNING <fs>` (no target: the header line `itab`),
 * `READ TABLE itab INTO wa` / `ASSIGNING <fs>`, `SELECT … INTO wa` / `INTO TABLE itab` /
 * `INTO (@a, @b)`. Lower case; the table read, or null for a SELECT.
 */
function workAreasOf(text: string): { targets: string[]; table: string | null } | null {
  const loop = /^LOOP\s+AT\s+(?!SCREEN\b)(?:GROUP\s+)?([\w/~<>-]+?)(?:\[\])?(?:\s|$)/i.exec(text);
  const read = /^READ\s+TABLE\s+([\w/~<>-]+?)(?:\[\])?(?:\s|$)/i.exec(text);
  if (loop || read) {
    const table = (loop ?? read)![1].toLowerCase();
    if (/\bREFERENCE\s+INTO\b/i.test(text) || /\bTRANSPORTING\s+NO\s+FIELDS\b/i.test(text)) return null;
    const into = new RegExp(String.raw`\b(?:INTO|ASSIGNING)\s+(?:CASTING\s+)?${NAME}`, 'i').exec(text);
    if (into) return { targets: [into[1].toLowerCase()], table };
    // Without a target, a LOOP fills the table's header line.
    return loop ? { targets: [table], table } : null;
  }
  if (/^SELECT\b/i.test(text)) {
    const list = /\b(?:INTO|APPENDING)\s*\(([^)]*)\)/i.exec(text);
    if (list) {
      const targets = list[1].split(',').map((t) => /<?[A-Za-z_/][\w/~]*>?/.exec(t.replace(/^\s*@?(?:DATA\()?/i, ''))?.[0].toLowerCase()).filter((t): t is string => !!t);
      return { targets, table: null };
    }
    const into = new RegExp(String.raw`\b(?:INTO|APPENDING)\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?(?:TABLE\s+)?${NAME}`, 'i').exec(text);
    if (into) return { targets: [into[1].toLowerCase()], table: null };
  }
  return null;
}

/**
 * Every write of a data object: `x = …`, `x-comp = …`, `ADD … TO x`, `COMPUTE x = …`, `MOVE … TO x`,
 * and a work area filled by LOOP, READ TABLE or SELECT — unless the work area holds an input record
 * (`isInputRecord`): a row of the program's input is raw input, the predicate reads it from `record`;
 * a row of an internal table the program builds itself is a computed value, handed in through `values`.
 */
function writesOf(statements: readonly AbapStatement[], isInputRecord: InputRecordTest): Array<{ base: string; line: number; from?: string }> {
  const out: Array<{ base: string; line: number; from?: string }> = [];
  // The table a work area was last filled from: an inline `FIELD-SYMBOL(<fs>)` has no declaration of its own,
  // and a `SELECT … INTO @<fs>-comp` inside the loop fills a row of that table.
  const tableOfArea = new Map<string, string>();
  for (const st of statements) {
    if (st.nativeSql) continue;
    const text = st.text.replace(/\.$/, '');
    const filled = st.keyword === 'LOOP' || st.keyword === 'READ' || st.keyword === 'SELECT' ? workAreasOf(text) : null;
    if (filled) {
      for (const target of filled.targets) {
        const table = filled.table ?? tableOfArea.get(target) ?? null;
        if (filled.table) tableOfArea.set(target, filled.table);
        if (!isInputRecord(target, table)) out.push({ base: target, line: st.lineStart, from: table ?? undefined });
      }
      continue;
    }
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
 * the declared constants (lower case) — both raw by definition. `isInputRecord`
 * says which work areas hold input records; without it, every work area a LOOP,
 * READ TABLE or SELECT fills is a computed value.
 */
export function guardBasisReader(
  statements: readonly AbapStatement[],
  containers: readonly Container[],
  inputs: readonly string[],
  constants: readonly string[],
  isInputRecord: InputRecordTest = () => false,
): GuardBasisReader {
  const writes = writesOf(statements, isInputRecord);
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
          reason ??= `${base} is ${write.from ? `a row of the internal table ${write.from}, filled` : 'written'} at L${write.line}${there ? ` in ${there.name}` : ''}`;
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

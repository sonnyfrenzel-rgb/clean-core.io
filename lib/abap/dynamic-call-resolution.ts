import { maskLiterals } from './statement-reader';

/**
 * ER-01/ER-02 — from engine 3.2.1 (`ENGINE_READS_321_FROM`): the function module a dynamic
 * `CALL FUNCTION name` calls, where the source closes the name.
 *
 * A dynamic call whose name the program fixes is not dynamic in any sense that matters to the reader:
 *
 *     CONSTANTS c_alv TYPE rs38l_fnam VALUE 'REUSE_ALV_GRID_DISPLAY'.
 *     CALL FUNCTION c_alv.
 *
 * calls REUSE_ALV_GRID_DISPLAY and nothing else. The engines before read the module on the `CONSTANTS` line and
 * listed the call itself as a target "computed at runtime" — a finding and a gap that contradict each other — and
 * the catalog, which answers a literal call, never saw the name.
 *
 * Read as closed, and only then (one value on every path that reaches the call):
 *
 *   1. **a literal or a constant assigned on the straight line right before the call** — `lv_fm = 'X'.`,
 *      `lv_fm = c_fm.`, `DATA(lv_fm) = 'X'.`, `MOVE 'X' TO lv_fm.`, with only assignments, declarations, `CLEAR`
 *      and `MOVE` in between that do not name the variable. Nothing can lead around such a run of statements, so
 *      the value at the call is the one assigned.
 *   2. **a constant** declared once in the source with a literal `VALUE`.
 *   3. **a `DATA … VALUE '…'`** declared once, and named by no other statement than the calls themselves: no
 *      assignment, no `CLEAR`, no parameter it is passed to, no field symbol or reference it is assigned to. A
 *      `DATA` declaration is not executed where it stands, so case 1 never reads one.
 *
 * Everything else stays dynamic: a second declaration of the name (a local of the same name in another routine), a
 * parameter, a branch or a loop between assignment and call, a value read from anywhere, a structure component
 * (`ls-fm`), a call with `DESTINATION` (the RFC reading is its own). A value that is no function-module name
 * stays dynamic too.
 *
 * Pure: the literal masking only.
 */
export function resolveDynamicCalls(statements: ReadonlyArray<{ text: string }>): Map<number, string> {
  const texts = statements.map((s) => s.text.trim());
  const masked = texts.map((t) => maskLiterals(t));
  const declared = new Map<string, string | null>();
  const valueOfName = (name: string): string | null => {
    if (!declared.has(name)) declared.set(name, declaredValue(texts, masked, name));
    return declared.get(name)!;
  };
  const out = new Map<number, string>();
  const call = new RegExp(`^CALL\\s+FUNCTION\\s+(${NAME})(?![\\w/-])`, 'i');
  masked.forEach((m, i) => {
    const c = call.exec(m);
    if (!c || /\bDESTINATION\b/i.test(m)) return;
    const name = c[1].toUpperCase();
    // The name stands at the callee only — not also among the parameters.
    if (mentions(m.slice(c[0].length), name)) return;
    const value = assignedRightBefore(texts, masked, i, name, valueOfName) ?? valueOfName(name);
    if (value) out.set(i, value);
  });
  return out;
}

const NAME = String.raw`[A-Za-z_][\w/]*`;

/** A statement that cannot lead around the next one: an assignment, a declaration, `CLEAR` or `MOVE`. */
const STRAIGHT_LINE = new RegExp(
  `^(?:(?:DATA|CONSTANTS|TYPES|STATICS|FIELD-SYMBOLS)\\b|CLEAR\\s|MOVE\\s|(?:(?:DATA|FINAL)\\(\\s*)?${NAME}\\s*\\)?\\s*=(?![=>]))`,
  'i',
);

/** Keywords of statements that declare a name — a second one makes the name ambiguous. */
const DECLARING = /^(?:CLASS-DATA|STATICS|PARAMETERS|PARAMETER|SELECT-OPTIONS|RANGES|FIELD-SYMBOLS|TYPES|TABLES|NODES|FORM|METHODS|CLASS-METHODS|EVENTS|CLASS-EVENTS|FUNCTION|ALIASES)\b/i;

function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/** Does the (masked) text name `name` anywhere — as a word, with or without a selector before or after it? */
function mentions(masked: string, name: string): boolean {
  return new RegExp(`(?<![\\w/])${escape(name)}(?![\\w/])`, 'i').test(masked);
}

/** The value a literal (or a constant the source closes) stands for, as a function-module name — or null. */
function literalValue(text: string): string | null {
  const t = text.trim();
  const quoted = /^'((?:[^']|'')*)'$/.exec(t);
  const tick = quoted ? null : /^`((?:[^`]|``)*)`$/.exec(t);
  const raw = quoted ? quoted[1].replace(/''/g, "'") : tick ? tick[1].replace(/``/g, '`') : null;
  if (raw === null) return null;
  const value = raw.trim().toUpperCase();
  return /^[A-Z0-9_/]+$/.test(value) ? value : null;
}

/** Case 1: the value assigned to `name` on the straight line right before statement `at`, or null. */
function assignedRightBefore(
  texts: readonly string[],
  masked: readonly string[],
  at: number,
  name: string,
  valueOfName: (name: string) => string | null,
): string | null {
  const n = escape(name);
  const assign = new RegExp(`^(?:(?:DATA|FINAL)\\(\\s*)?${n}\\s*\\)?\\s*=(?![=>])\\s*(.+)$`, 'i');
  const move = new RegExp(`^MOVE\\s+(.+?)\\s+TO\\s+${n}\\s*$`, 'i');
  for (let j = at - 1; j >= 0; j--) {
    const m = masked[j];
    if (!m) continue;
    if (mentions(m, name)) {
      // `maskLiterals` keeps offsets, so the operand is read from the text at the same place.
      const a = assign.exec(m);
      const mv = a ? null : move.exec(m);
      if (!a && !mv) return null;
      const start = a ? m.length - a[1].length : mv!.index + /^MOVE\s+/i.exec(m)![0].length;
      const operand = texts[j].slice(start, start + (a ? a[1] : mv![1]).length).trim();
      const literal = literalValue(operand);
      if (literal) return literal;
      // A constant on the right: its own value, when the source closes it.
      if (new RegExp(`^${NAME}$`).test(operand) && operand.toUpperCase() !== name) {
        const constant = valueOfName(operand.toUpperCase());
        return constant && isConstant(masked, operand.toUpperCase()) ? constant : null;
      }
      return null;
    }
    if (!STRAIGHT_LINE.test(m)) return null;
  }
  return null;
}

/** Is `name` declared by a `CONSTANTS` statement (and, by `declaredValue`, only there)? */
function isConstant(masked: readonly string[], name: string): boolean {
  return masked.some((m) => /^CONSTANTS\b/i.test(m) && declarationParts(m).some((p) => p.name === name));
}

/** The parts of a chained `DATA` / `CONSTANTS` statement, with each declared name and where the part stands. */
function declarationParts(masked: string): Array<{ name: string; from: number; to: number }> {
  const head = /^(?:DATA|CONSTANTS)\s*:?\s*/i.exec(masked);
  if (!head) return [];
  const parts: Array<{ name: string; from: number; to: number }> = [];
  let depth = 0;
  let from = head[0].length;
  for (let i = from; i <= masked.length; i++) {
    const ch = masked[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (i === masked.length || (ch === ',' && depth === 0)) {
      const part = masked.slice(from, i);
      const name = /^\s*([A-Za-z_][\w/]*)/.exec(part)?.[1]?.toUpperCase();
      if (name) parts.push({ name, from, to: i });
      from = i + 1;
    }
  }
  return parts;
}

/**
 * Cases 2 and 3: the value `name` holds wherever it is read, from its one declaration — or null.
 */
function declaredValue(texts: readonly string[], masked: readonly string[], name: string): string | null {
  let declarations = 0;
  let value: string | null = null;
  let constant = false;
  let otherUse = false;
  const callee = new RegExp(`^CALL\\s+FUNCTION\\s+${escape(name)}(?![\\w/-])`, 'i');
  masked.forEach((m, i) => {
    if (!mentions(m, name)) return;
    // An inline declaration anywhere — `DATA(name)`, `FINAL(name)`, `INTO @DATA(name)`.
    if (new RegExp(`\\b(?:DATA|FINAL)\\(\\s*${escape(name)}\\s*\\)`, 'i').test(m)) {
      declarations += 2;
      return;
    }
    const keyword = /^(DATA|CONSTANTS)\b/i.exec(m)?.[1]?.toUpperCase();
    if (keyword) {
      const parts = declarationParts(m).filter((p) => p.name === name);
      if (parts.length > 0) {
        declarations += parts.length;
        // A structure built with BEGIN OF … END OF names components, not this name.
        if (/\bBEGIN\s+OF\b/i.test(m)) {
          declarations += 2;
          return;
        }
        const part = parts[0];
        const at = /\bVALUE\s+(?=['`])/i.exec(m.slice(part.from, part.to));
        if (at) {
          const start = part.from + at.index + at[0].length;
          const literal = /^('(?:[^']|'')*'|`(?:[^`]|``)*`)/.exec(texts[i].slice(start, part.to));
          value = literal ? literalValue(literal[1]) : null;
        }
        constant = keyword === 'CONSTANTS';
        // The name also elsewhere in the statement (`DATA: a LIKE name`) is a read; fine for either.
        return;
      }
    }
    if (DECLARING.test(m)) {
      declarations += 2;
      return;
    }
    // A read of a constant is harmless; any other mention of a variable may write it.
    if (callee.exec(m) && !mentions(m.replace(callee, ''), name)) return;
    otherUse = true;
  });
  if (declarations !== 1 || !value) return null;
  if (!constant && otherUse) return null;
  return value;
}

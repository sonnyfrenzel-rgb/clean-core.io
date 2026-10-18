import { readStatements, type AbapStatement, type SourceRange } from './statement-reader';
import { containerAt, readBlocks, type Container } from './block-structure';
import { readControlFlowFrom } from './control-flow';
import { formalParameterNames } from './call-graph';

/**
 * Code a constant locks away (roadmap 3.0.13, SD review, 14.10.2026, CR-A1/D01).
 *
 * A program can carry a live path behind a switch that is off:
 *
 *     CONSTANTS gc_live TYPE c LENGTH 1 VALUE space.
 *     …
 *     IF gc_live <> 'X'.
 *       MESSAGE 'Live path disabled' TYPE 'E'.
 *     ENDIF.
 *     SELECT … FROM vbak …
 *
 * The constant never equals `'X'`, so the `IF` always holds, the error message
 * always ends the run, and every read after `ENDIF` is code no run reaches. A
 * documentation that leads with those reads describes the one path that cannot
 * run.
 *
 * This reads such gates, and nothing more clever: a condition that compares
 * one constant this source declares once — by `=`, `<>` (or `EQ`/`NE`),
 * `IS INITIAL` or `IS NOT INITIAL` — with a literal, `space`, `abap_true`,
 * `abap_false` or another such constant. Its outcome is then fixed at compile
 * time:
 *
 *   - **always true, and the `IF` arm ends the routine** — an error, abort or
 *     exit message (`TYPE 'E'|'A'|'X'`, not `INTO`), `LEAVE PROGRAM`,
 *     `LEAVE TO TRANSACTION`, `RETURN`, `STOP`, `RAISE`, or `EXIT` outside a
 *     loop, standing directly in the arm: every statement after it in the arm,
 *     every statement after `ENDIF` up to the end of the routine, and every
 *     other arm, is unreachable;
 *   - **always true**, the arm going on: the other arms are unreachable;
 *   - **always false**: the `IF` arm is unreachable.
 *
 * A constant declared twice, or a name also declared as a variable or
 * parameter, is not read: which declaration wins is scope, and scope is not
 * read here. A condition joined by `AND`/`OR`, a `CASE`, or a gate at program
 * level outside any routine or event block is not read either.
 *
 * From engine 3.0.18 (`ENGINE_READS_FROM`, `engineReads`), the stop is read
 * only as far as the source shows it (QA delta of 73b8cad63d3e):
 *
 *   - a gate inside another block — an `IF` arm, a loop, a `TRY`, a `WHEN` —
 *     is reached only on some paths: it locks away the rest of that arm of the
 *     block, never the rest of the routine, and the routine is not one that
 *     always stops (`enclosed`);
 *   - `RAISE EXCEPTION` inside a `TRY` may be caught there, and execution goes
 *     on in the `CATCH`: it is no stop (a classic `RAISE` and `RAISE SHORTDUMP`
 *     are not caught by a `CATCH`, and still are);
 *   - a parameter of a `FORM`, `METHODS` or `CLASS-METHODS` declaration is a
 *     declaration of its name: a constant of that name is not read.
 *
 * Pure: the statement reader and the block structure, no I/O.
 */

export type GateStop = 'error-message' | 'leave-program' | 'return' | 'exit' | 'stop' | 'raise';

export interface ConstantGate extends SourceRange {
  /** The constant as written, upper-cased. */
  constant: string;
  /** Its value as written in the declaration (`space`, `'X'`, `abap_false` …). */
  value: string;
  /** Line of the declaration. */
  declaredAt: number;
  /** The condition as written. */
  condition: string;
  /** What the condition always gives. */
  always: boolean;
  /** Set when the gate always holds and its arm ends the routine: the statement that ends it. */
  stop: { kind: GateStop; line: number; text: string } | null;
  /** The routine or event block the gate stands in (upper-cased name), with its kind. */
  routine: string | null;
  routineKind: Container['kind'] | null;
  /**
   * From 3.0.18: the gate stands inside another block of the routine, so not
   * every run of the routine reaches it — its stop ends the runs that do.
   */
  enclosed?: true;
}

export interface ConstantGateOptions {
  /** From engine 3.0.18 (`ENGINE_READS_FROM`): read the stop and the scope as the module comment says. */
  engineReads?: boolean;
}

export interface UnreachableRegion extends SourceRange {
  /** Why no run reaches these lines. */
  reason: 'after-gate' | 'gate-arm';
  /** Index into `gates`. */
  gate: number;
}

export interface ConstantGateReport {
  gates: ConstantGate[];
  /** Line ranges no run reaches, in source order, not overlapping. */
  unreachable: UnreachableRegion[];
  /** Routines (upper-cased FORM / method names) that always stop at a gate: a call of one never returns. */
  alwaysStopping: string[];
}

const EMPTY: ConstantGateReport = Object.freeze({ gates: [], unreachable: [], alwaysStopping: [] }) as ConstantGateReport;

/** A comparable value: char values compare with trailing blanks ignored, as ABAP compares `c` fields. */
type Value = { kind: 'char'; v: string } | { kind: 'number'; v: number };

const LITERAL = /^(?:'((?:[^']|'')*)'|`((?:[^`]|``)*)`|(-?\d+)|(space|abap_true|abap_false))$/i;

function literalValue(token: string): Value | null {
  const m = LITERAL.exec(token.trim());
  if (!m) return null;
  if (m[1] !== undefined) return { kind: 'char', v: m[1].replace(/''/g, "'").replace(/\s+$/, '') };
  if (m[2] !== undefined) return { kind: 'char', v: m[2].replace(/``/g, '`').replace(/\s+$/, '') };
  if (m[3] !== undefined) return { kind: 'number', v: Number(m[3]) };
  const word = m[4].toLowerCase();
  return { kind: 'char', v: word === 'abap_true' ? 'X' : '' };
}

const isInitial = (v: Value) => (v.kind === 'char' ? v.v === '' : v.v === 0);

function equal(a: Value, b: Value): boolean | null {
  if (a.kind === b.kind) return a.v === b.v;
  // A number against a char literal is a conversion this reader does not do.
  return null;
}

const DECLARATION = /^CONSTANTS\s+([\w/]+)\s+(?:TYPE|LIKE)\s+[\s\S]*?\bVALUE\s+('(?:[^']|'')*'|`(?:[^`]|``)*`|-?\d+|space|abap_true|abap_false|IS\s+INITIAL)\s*$/i;
const NAME_DECLARED = /^(?:DATA|CONSTANTS|PARAMETERS|PARAMETER|SELECT-OPTIONS|STATICS|CLASS-DATA|FIELD-SYMBOLS|TABLES|RANGES)\s+([<>\w/]+)/i;

/**
 * Constants the source declares exactly once and no other declaration shadows, with their values.
 * With `parameters` (from 3.0.18) a formal parameter of a FORM or a method declaration shadows too.
 */
function readConstants(statements: readonly AbapStatement[], parameters: boolean): Map<string, { value: Value; written: string; line: number }> {
  const declared = new Map<string, number>();
  const constants = new Map<string, { value: Value; written: string; line: number }>();
  for (const s of statements) {
    if (parameters) for (const p of formalParameterNames(s)) declared.set(p, (declared.get(p) ?? 0) + 1);
    const name = NAME_DECLARED.exec(s.text)?.[1]?.toUpperCase();
    if (!name || /\bBEGIN\s+OF\b/i.test(s.text)) continue;
    declared.set(name, (declared.get(name) ?? 0) + 1);
    const m = DECLARATION.exec(s.text);
    if (!m) continue;
    const written = m[2];
    const value = /^IS\s+INITIAL$/i.test(written) ? null : literalValue(written);
    if (/^IS\s+INITIAL$/i.test(written)) constants.set(name, { value: { kind: 'char', v: '' }, written, line: s.lineStart });
    else if (value) constants.set(name, { value, written, line: s.lineStart });
  }
  for (const name of [...constants.keys()]) if ((declared.get(name) ?? 0) !== 1) constants.delete(name);
  return constants;
}

/** The fixed outcome of a condition that compares one constant, or null when it is not one. */
function evaluate(
  condition: string,
  constants: Map<string, { value: Value; written: string; line: number }>,
): { always: boolean; constant: string } | null {
  const c = condition.trim().replace(/\s+/g, ' ');
  if (/\b(?:AND|OR)\b/i.test(c.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`/g, "''"))) return null;
  const operandOf = (token: string): { value: Value; constant?: string } | null => {
    const known = constants.get(token.toUpperCase());
    if (known) return { value: known.value, constant: token.toUpperCase() };
    const literal = literalValue(token);
    return literal ? { value: literal } : null;
  };
  const initial = /^(NOT\s+)?([\w/]+)\s+IS\s+(NOT\s+)?INITIAL$/i.exec(c);
  if (initial) {
    const name = initial[2].toUpperCase();
    const known = constants.get(name);
    if (!known) return null;
    const negated = !!initial[1] !== !!initial[3];
    return { always: negated ? !isInitial(known.value) : isInitial(known.value), constant: name };
  }
  const compare = /^(NOT\s+)?('(?:[^']|'')*'|`(?:[^`]|``)*`|[\w/]+)\s*(=|<>|EQ|NE)\s*('(?:[^']|'')*'|`(?:[^`]|``)*`|[\w/]+)$/i.exec(c);
  if (!compare) return null;
  const left = operandOf(compare[2]);
  const right = operandOf(compare[4]);
  if (!left || !right) return null;
  const constant = left.constant ?? right.constant;
  if (!constant) return null;
  const same = equal(left.value, right.value);
  if (same === null) return null;
  const op = compare[3].toUpperCase();
  const holds = op === '=' || op === 'EQ' ? same : !same;
  return { always: compare[1] ? !holds : holds, constant };
}

/** Does this statement end the routine it stands in? */
function stopOf(s: AbapStatement, insideLoop: boolean): GateStop | null {
  const t = s.text;
  if (s.keyword === 'MESSAGE') {
    if (/\bINTO\b/i.test(t.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`/g, "''"))) return null;
    if (/\bTYPE\s+'[EAX]'/i.test(t) || /^MESSAGE\s+[EAX]\d{3}\b/i.test(t) || /^MESSAGE\s+ID\s+\S+\s+TYPE\s+'[EAX]'/i.test(t)) return 'error-message';
    return null;
  }
  if (/^LEAVE\s+(?:PROGRAM|TO\s+TRANSACTION)\b/i.test(t)) return 'leave-program';
  if (s.keyword === 'RETURN') return 'return';
  if (s.keyword === 'STOP') return 'stop';
  if (s.keyword === 'RAISE' && !/^RAISE\s+EVENT\b/i.test(t)) return 'raise';
  if (s.keyword === 'EXIT' && !insideLoop) return 'exit';
  return null;
}

const LOOP_KINDS = new Set(['loop', 'do', 'while', 'select', 'provide']);
/** Blocks inside a routine that not every run enters, or enters more than once (3.0.18). */
const FLOW_KINDS = new Set(['if', 'case', 'loop', 'do', 'while', 'try', 'select', 'at', 'provide']);
/** The statements that open the next arm of a block (3.0.18). */
const ARM_HEADERS = new Set(['ELSE', 'ELSEIF', 'WHEN', 'CATCH', 'CLEANUP']);

/** Read the constant gates of one source. Empty when it has none — the common case. */
export function readConstantGates(source: string, options: ConstantGateOptions = {}): ConstantGateReport {
  const reads = options.engineReads === true;
  let statements: AbapStatement[];
  try {
    statements = readStatements(source);
  } catch {
    return EMPTY;
  }
  const constants = readConstants(statements, reads);
  if (constants.size === 0) return EMPTY;
  const structure = readBlocks(statements);
  const { branches } = readControlFlowFrom(statements, structure);
  const gates: ConstantGate[] = [];
  const regions: UnreachableRegion[] = [];
  const stopping = new Set<string>();

  for (const branch of branches) {
    if (branch.kind !== 'if' || !branch.terminated) continue;
    const head = branch.arms[0];
    const outcome = evaluate(head.condition, constants);
    if (!outcome) continue;
    const container = containerAt(structure.containers, head.lineStart);
    if (!container) continue;
    const depth = structure.enclosing[branch.openIndex].length;
    const insideLoop = structure.enclosing[branch.openIndex].some((b) => LOOP_KINDS.has(b.kind));
    const nextHeader = branch.arms[1]?.headerIndex ?? branch.closeIndex;
    // From 3.0.18: the blocks of the routine around the gate. The innermost
    // bounds what a stop locks away; a TRY among them may catch a raise.
    const around = reads ? structure.enclosing[branch.openIndex].filter((b) => FLOW_KINDS.has(b.kind)) : [];
    const inTry = around.some((b) => b.kind === 'try');
    let stop: ConstantGate['stop'] = null;
    let stopEnd = 0;
    if (outcome.always) {
      for (let i = head.headerIndex + 1; i < nextHeader; i++) {
        if (structure.enclosing[i].length !== depth + 1) continue;
        const kind = stopOf(statements[i], insideLoop);
        // A class-based exception raised inside a TRY may be caught there: no stop.
        if (kind === 'raise' && inTry && /^RAISE\s+(?:RESUMABLE\s+)?EXCEPTION\b/i.test(statements[i].text)) break;
        if (kind) {
          stop = { kind, line: statements[i].lineStart, text: statements[i].text };
          stopEnd = statements[i].lineEnd;
          break;
        }
      }
    }
    const declared = constants.get(outcome.constant)!;
    const gateIndex = gates.length;
    gates.push({
      constant: outcome.constant,
      value: declared.written,
      declaredAt: declared.line,
      condition: head.condition,
      always: outcome.always,
      stop,
      routine: container.name,
      routineKind: container.kind,
      lineStart: head.header.lineStart,
      lineEnd: head.header.lineEnd,
      ...(around.length ? { enclosed: true as const } : {}),
    });
    const closeLine = statements[branch.closeIndex].lineEnd;
    if (outcome.always) {
      // Every other arm is never taken.
      if (branch.arms.length > 1) {
        const from = branch.arms[1].lineStart;
        const to = statements[branch.closeIndex].lineStart - 1;
        if (to >= from) regions.push({ reason: 'gate-arm', gate: gateIndex, lineStart: from, lineEnd: to });
      }
      if (stop) {
        // The rest of the arm after the statement that ends the run (QA 9992f1339e12)…
        const armEnd = statements[nextHeader].lineStart - 1;
        if (armEnd > stopEnd) regions.push({ reason: 'after-gate', gate: gateIndex, lineStart: stopEnd + 1, lineEnd: armEnd });
        if (around.length) {
          // …and, for a gate inside another block (3.0.18), the rest of the
          // arm it stands in: the runs that skip the block go on after it.
          const inner = around[around.length - 1];
          let blockArmEnd = statements[inner.closeIndex].lineStart - 1;
          for (let i = branch.closeIndex + 1; i < inner.closeIndex; i++) {
            if (structure.enclosing[i].length === depth && ARM_HEADERS.has(statements[i].keyword)) {
              blockArmEnd = statements[i].lineStart - 1;
              break;
            }
          }
          if (blockArmEnd > closeLine) regions.push({ reason: 'after-gate', gate: gateIndex, lineStart: closeLine + 1, lineEnd: blockArmEnd });
        } else {
          // …and the rest of the routine, up to the statement that closes it.
          const end = container.kind === 'event' ? container.lineEnd : container.lineEnd - 1;
          if (end > closeLine) regions.push({ reason: 'after-gate', gate: gateIndex, lineStart: closeLine + 1, lineEnd: end });
          if (container.kind !== 'event') stopping.add(container.name);
        }
      }
    } else {
      const from = head.header.lineEnd + 1;
      const to = statements[nextHeader].lineStart - 1;
      if (to >= from) regions.push({ reason: 'gate-arm', gate: gateIndex, lineStart: from, lineEnd: to });
    }
  }
  if (gates.length === 0) return EMPTY;
  regions.sort((a, b) => a.lineStart - b.lineStart || b.lineEnd - a.lineEnd);
  const merged: UnreachableRegion[] = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r.lineStart <= last.lineEnd) {
      if (r.lineEnd > last.lineEnd) last.lineEnd = r.lineEnd;
      continue;
    }
    merged.push({ ...r });
  }
  return { gates, unreachable: merged, alwaysStopping: [...stopping].sort() };
}

/** Is this line in code no run reaches? */
export function isUnreachableLine(report: ConstantGateReport, line: number): boolean {
  return report.unreachable.some((r) => line >= r.lineStart && line <= r.lineEnd);
}

/** The gate that locks this line away, or null. */
export function gateOfLine(report: ConstantGateReport, line: number): ConstantGate | null {
  const region = report.unreachable.find((r) => line >= r.lineStart && line <= r.lineEnd);
  return region ? report.gates[region.gate] ?? null : null;
}

/**
 * The gate in one sentence, for a reader: "the constant GC_LIVE is space, so
 * the condition at L12 always holds and the error message at L13 ends the run".
 */
export function gateSentence(gate: ConstantGate): string {
  const value = /^space$/i.test(gate.value) ? 'space (blank)' : gate.value;
  const head = `the constant ${gate.constant} is declared as ${value} (L${gate.declaredAt}), so \`${gate.condition}\` at L${gate.lineStart} is always ${gate.always ? 'true' : 'false'}`;
  if (!gate.stop) return head;
  const what = gate.stop.kind === 'error-message' ? 'the error message' : `\`${gate.stop.text}\``;
  return `${head} and ${what} at L${gate.stop.line} always ends ${gate.routine ? `${gate.routine.toLowerCase()}` : 'the routine'} there`;
}

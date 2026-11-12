import { readStatements, type AbapStatement } from './statement-reader';

/**
 * A status workflow read out of the code — roadmap 3.1.0, AB-15a (owner decision 06.11.2026: "we are far too weak
 * on object orientation").
 *
 * Many object-oriented programs are a **state machine**: a status field (`ms_req-status`, `mv_state`) moves from one
 * value to the next — draft, submitted, approved, rejected — and each move sits in a routine of its own (`submit`,
 * `approve`) behind the checks that guard it: the status it must come from, a completeness rule, an authority check.
 * The process map draws those routines under their method names; a process owner reads the moves. This module reads
 * the moves so the business reading can say them (`lib/abap/plain-language.ts`), each with its lines.
 *
 * **A wrong state machine is worse than none** (plan AB-15a, risk). So only what the code writes counts:
 *
 *   - a **status field** is a field whose own name says status or state (`status`, `stat`, `state`, `zustand`,
 *     `stufe`, `phase`, `stage` — the last segment, after `-` or `->`), or a setter whose name says so
 *     (`set_status( … )`, `transition( … )`) — never a field guessed from its values;
 *   - a **transition** is an assignment of a constant or a literal to it (`ms_req-status = gc_approved`), or a call
 *     of such a setter with one constant or literal;
 *   - the field counts only with **at least two transitions to two different values**, and only when a condition
 *     somewhere **reads** it (`IF ms_req-status <> gc_draft`, `CHECK get_status( ) = …`, `CASE mv_status`) — a field
 *     that is only written is a log column, not a workflow;
 *   - where several fields qualify, the one with the most transitions is the workflow; a tie keeps none.
 *
 * Per transition: the routine it stands in (the same key as the skeleton's region, `LCL_FLOW=>SUBMIT` or the FORM's
 * name), its line, the value it sets, the values it can come **from** (an enclosing `IF/WHEN` that asks for a value,
 * an earlier guard that stops on any other value, a `CHECK`), the lines of the other checks before it in the routine
 * and the authority checks (`AUTHORITY-CHECK OBJECT …`) before it. A from-value the code does not state is not
 * invented: the list is empty then.
 *
 * Pure and deterministic. No model, no import beyond the statement reader.
 */

export interface StateTransition {
  /** The routine the transition stands in: `CLASS=>METHOD` for a method, the FORM's name; upper case. Null at program level. */
  routine: string | null;
  /** The line of the assignment or the setter call. */
  line: number;
  /** The value set, as the code writes it after resolving a constant (`SUBMITTED`, `A`). */
  to: string;
  /** The constant it was written with (`gc_submitted`), lower case — null for a literal. */
  toConstant: string | null;
  /** The values the code demands before it, in source order; empty when it demands none. */
  from: string[];
  /** Lines of the other checks before the transition in its routine (not the status checks). */
  checks: number[];
  /** Lines of the status checks that give `from`. */
  statusChecks: number[];
  /**
   * Authority checks before the transition in its routine — an `AUTHORITY-CHECK OBJECT` (`object` is the object), or
   * the call of a role check of the program's own (`assert_permission( … iv_perm = 'GRANT' )`, `check_authority( … )`):
   * `object` is then the role it passes as a literal, otherwise the method's name.
   */
  roles: Array<{ object: string; line: number }>;
  /**
   * The command arm the transition stands in, when it stands in one: the `WHEN` of a `CASE` over an operand that is
   * not the status (`CASE is_order-verb`, `CASE sy-ucomm`), or an `IF`/`ELSEIF` that asks that operand for values.
   */
  command?: { operand: string; values: string[]; arm: number };
}

/**
 * One arm of a decision over a command (`WHEN 'APPROVE'.`): the values it answers, its lines and the moves it makes.
 * `line` is the arm's own opener (`WHEN`, `IF`, `ELSEIF`), `decision` the statement that opens the decision (`CASE`,
 * `IF`); `lineStart`–`lineEnd` the arm from its opener to the last statement before the next arm or the close.
 */
export interface CommandArm {
  values: string[];
  /** The constants the values were written with, lower case; null for a literal. */
  constants: Array<string | null>;
  line: number;
  decision: number;
  lineStart: number;
  lineEnd: number;
  transitions: StateTransition[];
}

/**
 * A status workflow that one routine runs as a decision over a command (roadmap 3.1.0, AB-15a round 2): the method
 * whose body is a `CASE` (or an `IF` chain) over a command or action parameter whose arms move the status. Only arms
 * that move the status are listed; at least two different commands must.
 */
export interface CommandWorkflow {
  /** `CLASS=>METHOD` or the FORM's name, upper case. */
  routine: string;
  /** The operand the arms decide on (`is_order-verb`), lower case. */
  operand: string;
  arms: CommandArm[];
  /**
   * The other arms of the same decision over the same operand that move nothing (`IF verb = 'GRANT'. <checks>.
   * ENDIF.`) — the checks a command must pass before the common part; their `transitions` are empty. An arm inside a
   * listed arm is not listed again.
   */
  checks: CommandArm[];
}

/**
 * The program's own run is a demo or scenario driver of the workflow: a routine with no decision of its own that calls
 * the same method (one that reaches the workflow routine) at least twice and sets the command operand's field to at
 * least two of the workflow's command values as literals — test data, not a process.
 */
export interface ScenarioDriver {
  /** The routine key (`CLASS=>METHOD`, a FORM, `@<line>` for an event block). */
  routine: string;
  lineStart: number;
  lineEnd: number;
  /** The method it calls repeatedly, its own name upper case, and the lines of those calls. */
  calls: { method: string; lines: number[] };
}

export interface StateMachine {
  /** The field's word as the code writes it (`status`, `state`), lower case. */
  field: string;
  /** Every value the field takes, in the order the code first sets it; then the values it is only asked for. */
  states: Array<{ value: string; constant: string | null; line: number }>;
  transitions: StateTransition[];
  /** Lines of the conditions that read the field. */
  reads: number[];
  /** The routine that runs the workflow as a decision over a command, when one does (`CommandWorkflow`). */
  workflow: CommandWorkflow | null;
  /** The program's run when it is a demo driver of that workflow (`ScenarioDriver`); null otherwise. */
  driver: ScenarioDriver | null;
}

/** The last segment of a field name that says status. `ms_req-status`, `mv_status`, `ls_head-zz_state`, `gv_stufe`. */
const STATUS_WORD = /(?:^|_)(status|stat|state|zustand|stufe|phase|stage)$/i;
/** A setter that says it sets the status: `set_status`, `change_state`, `transition`, `set_stufe`. */
const STATUS_SETTER = /^(?:set|change|update|move|switch)_?(status|stat|state|zustand|stufe|phase|stage)$|^(transition|transition_to)$/i;
/** A getter that says it reads the status: `get_status( )`, `status( )`, `lo->get_state( )`. */
const STATUS_GETTER = /(?:^|->|=>)(?:get_?)?(status|stat|state|zustand|stufe|phase|stage)\(\s*\)/i;

const WORD_OF: Record<string, string> = { stat: 'status', transition: 'status', transition_to: 'status' };
const wordOf = (w: string) => WORD_OF[w.toLowerCase()] ?? w.toLowerCase();

/** A value written in the code: a literal, a number, or a constant name (`gc_x`, `gc_status-approved`, `zif=>c`). */
const VALUE = String.raw`'(?:[^']|'')*'|\`[^\`]*\`|-?\d+|[\w/]+(?:(?:-|=>)[\w/]+)*`;
const OPERAND = String.raw`(?:me->)?[\w/]+(?:(?:->|-|=>)[\w/]+)*(?:\(\s*\))?`;

interface Constants {
  value(name: string): string | null;
}

function readConstants(statements: readonly AbapStatement[]): Constants {
  const values = new Map<string, string>();
  let group: string[] = [];
  for (const s of statements) {
    if (!/^CONSTANTS\b/i.test(s.text)) continue;
    const body = s.text.replace(/^CONSTANTS\s*:?\s*/i, '');
    const begin = /^BEGIN\s+OF\s+([\w/]+)/i.exec(body);
    if (begin) { group.push(begin[1].toLowerCase()); continue; }
    if (/^END\s+OF\b/i.test(body)) { group.pop(); continue; }
    const m = /^([\w/]+)\b[\s\S]*?\bVALUE\s+('(?:[^']|'')*'|`[^`]*`|-?\d+)/i.exec(body);
    if (!m) continue;
    const name = [...group, m[1].toLowerCase()].join('-');
    values.set(name, unquote(m[2]));
  }
  return {
    value(name: string) {
      const key = name.toLowerCase();
      if (values.has(key)) return values.get(key) ?? null;
      // An interface or class constant `zif_x=>c_approved` is read where this source defines it.
      const tail = key.split('=>').pop() ?? key;
      return values.get(tail) ?? null;
    },
  };
}

function unquote(v: string): string {
  const t = v.trim();
  if (/^'.*'$/.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  if (/^`.*`$/.test(t)) return t.slice(1, -1);
  return t;
}

/** The value a token stands for: a literal or a number as written, a constant resolved — or null. */
function valueOf(token: string, constants: Constants): { value: string; constant: string | null } | null {
  const t = token.trim();
  if (/^['`]/.test(t)) return { value: unquote(t), constant: null };
  if (/^-?\d+$/.test(t)) return { value: t, constant: null };
  const resolved = constants.value(t);
  return resolved === null ? null : { value: resolved, constant: t.toLowerCase() };
}

/** The status word an operand reads or writes, or null: `ms_req-status` → status, `get_status( )` → status. */
function statusWordOf(operand: string): string | null {
  const o = operand.trim();
  const getter = STATUS_GETTER.exec(o);
  if (getter) return wordOf(getter[1]);
  if (/\(/.test(o)) return null;
  const last = o.split(/->|-|=>/).pop() ?? '';
  const m = STATUS_WORD.exec(last);
  return m ? wordOf(m[1]) : null;
}

interface Comparison { word: string; op: '=' | '<>' | 'IN'; values: string[]; constants: Array<string | null> }

/** The comparisons of a status in a condition: `status <> gc_draft AND status <> gc_new`, `get_status( ) = 'A'`. */
function comparisons(condition: string, constants: Constants): Comparison[] {
  const out: Comparison[] = [];
  const re = new RegExp(String.raw`(${OPERAND})\s*(=|<>|\bEQ\b|\bNE\b|\bNOT\s+IN\b|\bIN\b)\s*(\(\s*(?:${VALUE})(?:\s*,\s*(?:${VALUE}))*\s*\)|${VALUE})`, 'gi');
  for (const m of condition.matchAll(re)) {
    const word = statusWordOf(m[1]);
    if (!word) continue;
    const opRaw = m[2].toUpperCase().replace(/\s+/g, ' ');
    if (opRaw === 'NOT IN') continue;
    const op: Comparison['op'] = opRaw === '=' || opRaw === 'EQ' ? '=' : opRaw === 'IN' ? 'IN' : '<>';
    const tokens = op === 'IN' ? m[3].replace(/^\(|\)$/g, '').split(',') : [m[3]];
    const read = tokens.map((t) => valueOf(t, constants)).filter((v): v is { value: string; constant: string | null } => v != null);
    if (read.length) out.push({ word, op, values: read.map((v) => v.value), constants: read.map((v) => v.constant) });
  }
  return out;
}

interface Assignment { word: string; value: string; constant: string | null }

function assignmentOf(statement: AbapStatement, constants: Constants): Assignment | null {
  const text = statement.text.trim().replace(/\.$/, '');
  const assign = new RegExp(String.raw`^(${OPERAND})\s*=\s*(${VALUE})$`, 'i').exec(text);
  if (assign && !/\(/.test(assign[1])) {
    const word = statusWordOf(assign[1]);
    const value = word ? valueOf(assign[2], constants) : null;
    if (word && value) return { word, ...value };
    return null;
  }
  // A setter: `set_status( gc_approved )`, `me->set_status( iv_status = gc_x )`, `io_ctx->transition( 'RELEASED' )`.
  const call = new RegExp(String.raw`^(?:CALL\s+METHOD\s+)?(?:[\w/]+(?:->|=>))*([\w/]+)\(\s*(?:[\w/]+\s*=\s*)?(${VALUE})\s*\)$`, 'i').exec(text);
  if (call) {
    const setter = STATUS_SETTER.exec(call[1]);
    if (!setter) return null;
    const value = valueOf(call[2], constants);
    if (value) return { word: wordOf(setter[1] ?? setter[2]), ...value };
  }
  return null;
}

/** The condition of a statement that has one: IF/ELSEIF/CHECK/ASSERT/WHILE. */
function conditionOf(statement: AbapStatement): string | null {
  const m = /^(?:IF|ELSEIF|CHECK|ASSERT|WHILE)\s+([\s\S]+?)\.?$/i.exec(statement.text.trim());
  return m ? m[1] : null;
}

/** The status values the open decisions ask for: `IF status = X` (or `IN`), the `WHEN X` of a `CASE status`. */
function enclosingStates(frames: readonly Frame[], statements: readonly AbapStatement[], constants: Constants): Array<{ word: string; values: string[]; line: number }> {
  const out: Array<{ word: string; values: string[]; line: number }> = [];
  for (const f of frames) {
    if (f.kind === 'if' && f.condition) {
      for (const c of comparisons(f.condition, constants)) {
        if (c.op === '=' || c.op === 'IN') out.push({ word: c.word, values: c.values, line: statements[f.start].lineStart });
      }
    }
    const word = f.kind === 'case' && f.subject ? statusWordOf(f.subject) : null;
    if (word && f.when) {
      const values = f.when.map((w) => valueOf(w, constants)?.value).filter((v): v is string => v != null);
      if (values.length) out.push({ word, values, line: statements[f.start].lineStart });
    }
  }
  return out;
}

/** The routine a statement calls as a statement of its own: `PERFORM x`, `x( )`, `me->x( )`, `CALL METHOD x`. Upper case. */
function calledRoutine(text: string): string | null {
  const perform = /^PERFORM\s+([\w/]+)/i.exec(text);
  if (perform) return perform[1].toUpperCase();
  const call = /^(?:CALL\s+METHOD\s+)?(?:(?:me|[\w/]+)(?:->|=>))?([\w/~]+)\s*\(/i.exec(text) ?? /^CALL\s+METHOD\s+(?:(?:me|[\w/]+)(?:->|=>))?([\w/~]+)\b/i.exec(text);
  if (!call) return null;
  return (call[1].split('~').pop() ?? call[1]).toUpperCase();
}

/** Is a decision (`IF`, `CASE`) open — then a check closed inside it guards only that arm, not the routine. */
function decisionOpen(frames: readonly Frame[]): boolean {
  return frames.some((f) => f.kind === 'if' || f.kind === 'case');
}

/** Does the body between `from` and `to` (statement indices) stop: an error message, RETURN, RAISE, EXIT, LEAVE? */
function stops(statements: readonly AbapStatement[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const t = statements[i].text;
    if (/^(?:(?:RETURN|EXIT|LEAVE)\b|RAISE\b(?!\s+EVENT))/i.test(t)) return true;
    if (/^MESSAGE\b/i.test(t) && /\bTYPE\s+'?[EAX]'?\b|^MESSAGE\s+[EAX]\d/i.test(t)) return true;
  }
  return false;
}

interface Guard { line: number; condition: string; stopped: boolean; status: boolean; check?: boolean }
interface Role { object: string; line: number }

interface Frame {
  kind: 'if' | 'case' | 'loop' | 'try';
  start: number;
  condition: string | null;
  subject: string | null;
  when: string[] | null;
  /**
   * The guards and role checks closed inside the frame's current arm: they guard what follows in that arm only, and
   * are forgotten when the next arm opens (`WHEN`, `ELSEIF`, `ELSE`) or the decision closes.
   */
  armGuards: Guard[];
  armRoles: Role[];
  /** The command arm open in this frame (an index into the arms read), or -1. */
  arm: number;
  /** The statement that opened the decision (`CASE`, `IF`) — `start` moves on with each arm. */
  opened: number;
}

/** A role check of the program's own, by its method's name: `assert_permission`, `check_authority`, `verify_access`. */
const ROLE_CHECK = /^(?:require|check|assert|ensure|verify|has)_?(?:role|roles|authority|authorization|authorisation|auth|permission|permissions|grant|access)$|^authority_check$/i;

/** The operand and the values of a condition that asks one operand for values: `x = 'A'`, `x = 'A' OR x = 'B'`. */
function commandCondition(condition: string, constants: Constants): { operand: string; values: string[]; constants: Array<string | null> } | null {
  const parts = condition.trim().split(/\s+OR\s+/i);
  let operand: string | null = null;
  const values: string[] = [];
  const named: Array<string | null> = [];
  for (const part of parts) {
    const m = new RegExp(String.raw`^(${OPERAND})\s*(?:=|\bEQ\b)\s*(${VALUE})$`, 'i').exec(part.trim());
    if (!m || /\(/.test(m[1])) return null;
    const o = m[1].toLowerCase().replace(/^me->/, '');
    if (operand && o !== operand) return null;
    operand = o;
    const v = valueOf(m[2], constants);
    if (!v) return null;
    values.push(v.value);
    named.push(v.constant);
  }
  return operand && isCommandOperand(operand) ? { operand, values, constants: named } : null;
}

/** An operand a command can be: a field, not the status, not a truth value or a system counter. */
function isCommandOperand(operand: string): boolean {
  const o = operand.trim().toLowerCase().replace(/^me->/, '');
  if (!/^[\w/]+(?:(?:->|-|=>)[\w/]+)*$/.test(o)) return false;
  if (/^(?:abap_true|abap_false|space|sy-subrc|sy-tabix|sy-index|sy-dbcnt)$/.test(o)) return false;
  return statusWordOf(o) === null;
}

const EVENT_BLOCK = /^(?:START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|LOAD-OF-PROGRAM|AT\s+SELECTION-SCREEN|AT\s+LINE-SELECTION|AT\s+USER-COMMAND|TOP-OF-PAGE|END-OF-PAGE|GET\s+\w+)\b/i;

/** The routine key of the skeleton's regions: `CLASS=>METHOD` or the FORM's name, upper case. */
function routineKeys(statements: readonly AbapStatement[]): Array<string | null> {
  const keys: Array<string | null> = new Array(statements.length).fill(null);
  let cls: string | null = null;
  let routine: string | null = null;
  statements.forEach((s, i) => {
    const t = s.text;
    const impl = /^CLASS\s+([\w/]+)\s+IMPLEMENTATION\b/i.exec(t);
    if (impl) cls = impl[1].toUpperCase();
    else if (/^ENDCLASS\b/i.test(t)) cls = null;
    const method = /^METHOD\s+([\w/~]+)/i.exec(t);
    const other = /^(?:FORM|FUNCTION|MODULE)\s+([\w/]+)/i.exec(t);
    if (method) routine = cls ? `${cls}=>${method[1].toUpperCase()}` : method[1].toUpperCase();
    else if (other) routine = other[1].toUpperCase();
    // An event block begins a context of its own: a guard of one block never guards a move in the next.
    else if (EVENT_BLOCK.test(t)) routine = `@${s.lineStart}`;
    keys[i] = routine;
    if (/^(?:ENDMETHOD|ENDFORM|ENDFUNCTION|ENDMODULE)\b/i.test(t)) routine = null;
  });
  return keys;
}

/**
 * Reads the status workflow of a source, or null when the code shows none (see the module comment for what counts).
 * Never throws: a source it cannot read has no state machine.
 */
export function readStateMachine(source: string, statementsIn?: readonly AbapStatement[]): StateMachine | null {
  try {
    const statements = (statementsIn ?? readStatements(String(source ?? ''))).filter((s) => !s.nativeSql);
    const constants = readConstants(statements);
    const routines = routineKeys(statements);

    // The open blocks at every statement, per routine, and the checks met so far in it.
    const found: Array<{ word: string; transition: StateTransition }> = [];
    const reads = new Map<string, number[]>();
    let frames: Frame[] = [];
    let currentRoutine: string | null = null;
    /** Closed guards of the current routine: a condition whose block stopped. */
    let guards: Guard[] = [];
    let roles: Role[] = [];
    /** The command arms read so far (`CommandArm`, without their transitions), each with its routine and operand. */
    const arms: ArmRead[] = [];
    const frame = (kind: Frame['kind'], start: number, condition: string | null, subject: string | null): Frame =>
      ({ kind, start, condition, subject, when: null, armGuards: [], armRoles: [], arm: -1, opened: start });
    /** The innermost decision: where a guard or a role check closed inside it belongs. */
    const innermostDecision = () => [...frames].reverse().find((f) => f.kind === 'if' || f.kind === 'case');
    const closeArm = (f: Frame | undefined, i: number) => {
      if (!f || f.arm < 0) return;
      const a = arms[f.arm];
      if (a.open) { a.lineEnd = statements[Math.max(0, i - 1)].lineEnd; a.open = false; }
      f.arm = -1;
    };
    const openArm = (f: Frame, i: number, operand: string, values: string[], named: Array<string | null>) => {
      arms.push({
        routine: currentRoutine, operand, values, constants: named, line: statements[i].lineStart, decision: statements[f.opened].lineStart,
        lineStart: statements[i].lineStart, lineEnd: statements[i].lineEnd, open: true,
      });
      f.arm = arms.length - 1;
    };
    const ifArm = (f: Frame, i: number, condition: string) => {
      const c = commandCondition(condition, constants);
      if (c) openArm(f, i, c.operand, c.values, c.constants);
    };

    /** Per called routine (its own name, upper case): how often it is called, and the status values its callers ask for. */
    const callFrom = new Map<string, { sites: number; asked?: number; values: Map<string, string[]>; lines: number[] }>();
    /** The constant a value was written with, wherever the code names one. */
    const named = new Map<string, string>();
    const noteRead = (line: number, condition: string) => {
      for (const c of comparisons(condition, constants)) {
        reads.set(c.word, [...(reads.get(c.word) ?? []), line]);
        c.values.forEach((v, k) => { const n = c.constants[k]; if (n && !named.has(v)) named.set(v, n); });
      }
    };

    for (let i = 0; i < statements.length; i++) {
      const s = statements[i];
      const t = s.text.trim();
      const kw = (/^[\w-]+/.exec(t)?.[0] ?? '').toUpperCase();
      if (routines[i] !== currentRoutine || /^(?:METHOD|FORM)$/.test(kw)) {
        currentRoutine = routines[i];
        frames = [];
        guards = [];
        roles = [];
      }
      if (kw === 'AUTHORITY-CHECK') {
        const object = /\bOBJECT\s+('(?:[^']|'')*'|[\w/]+)/i.exec(t)?.[1];
        // A check inside a decision guards that arm only.
        if (object) (innermostDecision()?.armRoles ?? roles).push({ object: unquote(object).toUpperCase(), line: s.lineStart });
        continue;
      }
      if (kw === 'IF') {
        const condition = conditionOf(s) ?? '';
        noteRead(s.lineStart, condition);
        const f = frame('if', i, condition, null);
        frames.push(f);
        ifArm(f, i, condition);
        continue;
      }
      if (kw === 'ELSEIF') {
        const top = frames[frames.length - 1];
        const condition = conditionOf(s) ?? '';
        noteRead(s.lineStart, condition);
        if (top?.kind === 'if') {
          closeArm(top, i);
          top.condition = condition; top.start = i; top.armGuards = []; top.armRoles = [];
          ifArm(top, i, condition);
        }
        continue;
      }
      if (kw === 'ELSE') {
        const top = frames[frames.length - 1];
        if (top?.kind === 'if') { closeArm(top, i); top.condition = null; top.start = i; top.armGuards = []; top.armRoles = []; }
        continue;
      }
      if (kw === 'ENDIF') {
        const top = frames.pop();
        closeArm(top, i);
        if (top?.kind === 'if' && top.condition !== null) {
          const opener = statements[top.start];
          const status = comparisons(top.condition, constants).length > 0;
          // A decision over the command is no check of a move: it chooses the arm (`IF verb = 'GRANT'. … RETURN.`).
          const guard: Guard = { line: opener.lineStart, condition: top.condition, stopped: stops(statements, top.start + 1, i) && !commandCondition(top.condition, constants), status };
          // A check closed inside a decision guards only what follows it in that arm, not the routine.
          if (!decisionOpen(frames)) guards.push(guard);
          else innermostDecision()?.armGuards.push(guard);
        }
        continue;
      }
      if (kw === 'CASE') {
        const subject = t.replace(/^CASE\s+/i, '').replace(/\.$/, '');
        if (statusWordOf(subject)) reads.set(statusWordOf(subject)!, [...(reads.get(statusWordOf(subject)!) ?? []), s.lineStart]);
        frames.push(frame('case', i, null, subject));
        continue;
      }
      if (kw === 'WHEN') {
        const top = frames[frames.length - 1];
        if (top?.kind === 'case') {
          closeArm(top, i);
          top.armGuards = []; top.armRoles = [];
          const values = t.replace(/^WHEN\s+/i, '').replace(/\.$/, '');
          top.when = /^OTHERS$/i.test(values) ? null : values.split(/\s+OR\s+/i);
          if (top.subject && statusWordOf(top.subject)) {
            for (const w of top.when ?? []) {
              const v = valueOf(w, constants);
              if (v?.constant && !named.has(v.value)) named.set(v.value, v.constant);
            }
          }
          top.start = i;
          // A `WHEN` of a decision over a command: an arm, when every value is one the code writes down.
          if (top.subject && top.when && isCommandOperand(top.subject)) {
            const read = top.when.map((w) => valueOf(w, constants));
            if (read.every((v) => v != null)) {
              openArm(top, i, top.subject.toLowerCase().replace(/^me->/, ''), read.map((v) => v!.value), read.map((v) => v!.constant));
            }
          }
        }
        continue;
      }
      if (kw === 'ENDCASE') { closeArm(frames.pop(), i); continue; }
      // Loops and TRY only nest; a SELECT is not tracked (whether it has an ENDSELECT is not worth guessing here).
      if (/^(?:LOOP|DO|WHILE|TRY)$/.test(kw)) {
        if (kw === 'WHILE') noteRead(s.lineStart, conditionOf(s) ?? '');
        frames.push(frame(kw === 'TRY' ? 'try' : 'loop', i, null, null));
        continue;
      }
      if (/^(?:ENDLOOP|ENDDO|ENDWHILE|ENDTRY)$/.test(kw)) {
        const at = frames.map((f) => f.kind).lastIndexOf(kw === 'ENDTRY' ? 'try' : 'loop');
        if (at >= 0) frames.splice(at, 1);
        continue;
      }
      if (kw === 'CHECK' || kw === 'ASSERT') {
        const condition = conditionOf(s) ?? '';
        noteRead(s.lineStart, condition);
        const guard: Guard = { line: s.lineStart, condition, stopped: true, status: comparisons(condition, constants).length > 0, check: true };
        if (!decisionOpen(frames)) guards.push(guard);
        else innermostDecision()?.armGuards.push(guard);
        continue;
      }

      const assignment = assignmentOf(s, constants);
      // A call of a routine inside a decision on the status: the routine runs only from those values
      // (`WHEN gc_status-new. check_request( ).`). Read for every call; used where the routine states no value itself.
      const called = calledRoutine(t);
      // A role check of the program's own: `assert_permission( … iv_perm = 'GRANT' )` — the role it names, else its name.
      if (called && !assignment && ROLE_CHECK.test(called)) {
        const role = /\b\w*(?:role|perm|auth|right)\w*\s*=\s*('(?:[^']|'')*'|`[^`]*`)/i.exec(t)?.[1];
        (innermostDecision()?.armRoles ?? roles).push({ object: role ? unquote(role).toUpperCase() : called, line: s.lineStart });
      }
      if (called && !assignment) {
        const asked = enclosingStates(frames, statements, constants);
        const known = callFrom.get(called) ?? { sites: 0, values: new Map<string, string[]>(), lines: [] as number[] };
        known.sites += 1;
        for (const a of asked) {
          known.values.set(a.word, [...new Set([...(known.values.get(a.word) ?? []), ...a.values])]);
          if (!known.lines.includes(a.line)) known.lines.push(a.line);
        }
        known.asked = (known.asked ?? 0) + (asked.length ? 1 : 0);
        callFrom.set(called, known);
      }
      if (!assignment) continue;
      /** The innermost command arm the move stands in. */
      const armFrame = [...frames].reverse().find((x) => x.arm >= 0);
      const command = armFrame ? { operand: arms[armFrame.arm].operand, values: arms[armFrame.arm].values, arm: armFrame.arm } : null;
      const from: string[] = [];
      const statusChecks: number[] = [];
      const add = (values: string[], line: number) => {
        for (const v of values) if (!from.includes(v)) from.push(v);
        if (!statusChecks.includes(line)) statusChecks.push(line);
      };
      // An enclosing decision that asks for a value: `IF status = X`, `WHEN X` of `CASE status`.
      for (const a of enclosingStates(frames, statements, constants)) if (a.word === assignment.word) add(a.values, a.line);
      // An earlier guard that stops on any other value: `IF status <> X. MESSAGE … TYPE 'E'. ENDIF.`, `CHECK status = X` —
      // of the routine, or closed before it inside the arm it stands in.
      const inScope = [...guards, ...frames.flatMap((f) => f.armGuards)];
      for (const g of inScope) {
        if (!g.status || !g.stopped) continue;
        const isCheck = g.check === true;
        for (const c of comparisons(g.condition, constants)) {
          if (c.word !== assignment.word) continue;
          if (isCheck ? c.op === '=' || c.op === 'IN' : c.op === '<>') add(c.values, g.line);
        }
      }
      found.push({ word: assignment.word, transition: {
        routine: currentRoutine && !currentRoutine.startsWith('@') ? currentRoutine : null,
        line: s.lineStart,
        to: assignment.value,
        toConstant: assignment.constant,
        from,
        checks: inScope.filter((g) => !g.status && g.stopped).map((g) => g.line),
        statusChecks,
        roles: [...roles, ...frames.flatMap((f) => f.armRoles)],
        ...(command ? { command } : {}),
      } });
    }

    // The field: at least two transitions to two values, read in a condition, and at least one move the code makes
    // only from a stated value — a field that is set from a result (a traffic light, a log severity, a dunning level)
    // is a classification, not a workflow. The most transitions wins, a tie none.
    // A move whose routine states no from-value takes its callers' — only where every call of it asks for one.
    for (const f of found) {
      const t = f.transition;
      if (t.from.length || !t.routine) continue;
      const own = t.routine.split(/=>|~/).pop() ?? t.routine;
      const callers = callFrom.get(own);
      const values = callers?.values.get(f.word);
      if (!callers || !values?.length || callers.asked !== callers.sites) continue;
      t.from = values.filter((v) => v !== t.to);
      t.statusChecks = [...callers.lines];
    }
    const byWord = new Map<string, StateTransition[]>();
    for (const f of found) byWord.set(f.word, [...(byWord.get(f.word) ?? []), f.transition]);
    const qualified = [...byWord.entries()].filter(([word, list]) =>
      new Set(list.map((t) => t.to)).size >= 2 && (reads.get(word)?.length ?? 0) > 0
      && list.some((t) => t.from.length > 0 && !(t.from.length === 1 && t.from[0] === t.to)));
    if (!qualified.length) return null;
    qualified.sort((a, b) => b[1].length - a[1].length);
    if (qualified.length > 1 && qualified[0][1].length === qualified[1][1].length) return null;
    const [field, list] = qualified[0];
    const states: StateMachine['states'] = [];
    for (const t of list) if (!states.some((s) => s.value === t.to)) states.push({ value: t.to, constant: t.toConstant, line: t.line });
    // A value the code only demands (the draft a request starts in) is a state too.
    for (const t of list) {
      for (const v of t.from) {
        if (!states.some((s) => s.value === v)) states.push({ value: v, constant: named.get(v) ?? null, line: t.statusChecks[0] ?? t.line });
      }
    }
    const workflow = commandWorkflowOf(list, arms);
    return {
      field,
      states,
      transitions: list,
      reads: [...new Set(reads.get(field) ?? [])].sort((a, b) => a - b),
      workflow,
      driver: workflow ? scenarioDriverOf(statements, routines, workflow) : null,
    };
  } catch {
    return null;
  }
}

/** A command arm as the walk reads it: with its routine and operand, and whether it is still open. */
type ArmRead = Omit<CommandArm, 'transitions'> & { routine: string | null; operand: string; open: boolean };

/**
 * The routine that runs the workflow as a decision over a command (`CommandWorkflow`), or null: the moves that stand in
 * a command arm, grouped by routine and operand; a group counts with moves in at least two arms of two different
 * commands. The most moves wins, a tie none. An arm that holds another arm of the group is not listed — its inner arms are.
 */
function commandWorkflowOf(transitions: readonly StateTransition[], arms: readonly ArmRead[]): CommandWorkflow | null {
  const groups = new Map<string, StateTransition[]>();
  for (const t of transitions) {
    // The arm knows its routine — an event block's too (`@<line>`), where a move has none.
    const routine = t.command ? arms[t.command.arm]?.routine : null;
    if (!t.command || !routine) continue;
    const key = `${routine} ${t.command.operand}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const candidates = [...groups.entries()].filter(([, list]) => {
    const byArm = new Set(list.map((t) => t.command!.arm));
    const commands = new Set(list.flatMap((t) => t.command!.values));
    return byArm.size >= 2 && commands.size >= 2;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b[1].length - a[1].length);
  if (candidates.length > 1 && candidates[0][1].length === candidates[1][1].length) return null;
  const [key, list] = candidates[0];
  const [routine, operand] = key.split(' ');
  const used = [...new Set(list.map((t) => t.command!.arm))].sort((a, b) => a - b);
  const read = used.map((i) => ({ ...arms[i], transitions: list.filter((t) => t.command!.arm === i) }));
  const listed = read.filter((a) => !read.some((b) => b !== a && b.lineStart > a.lineStart && b.lineEnd <= a.lineEnd));
  if (listed.length < 2) return null;
  const plain = (a: Omit<CommandArm, 'transitions'>, transitions: StateTransition[]): CommandArm => ({
    values: a.values, constants: a.constants, line: a.line, decision: a.decision, lineStart: a.lineStart, lineEnd: a.lineEnd, transitions,
  });
  const within = (a: { lineStart: number; lineEnd: number }, b: { lineStart: number; lineEnd: number }) => a.lineStart >= b.lineStart && a.lineEnd <= b.lineEnd;
  const checks = arms.filter((a, i) => a.routine === routine && a.operand === operand && !used.includes(i)
    && !listed.some((l) => within(a, l) || within(l, a)));
  return {
    routine,
    operand,
    arms: listed.map((a) => plain(a, a.transitions)),
    checks: checks.map((a) => plain(a, [])),
  };
}

/** Every routine a statement calls, by its own name, upper case — as a statement or inside an expression. */
function callsIn(text: string): string[] {
  const out: string[] = [];
  const perform = /^PERFORM\s+([\w/]+)/i.exec(text);
  if (perform) out.push(perform[1].toUpperCase());
  for (const m of text.matchAll(/(?:^|[\s=(])(?:CALL\s+METHOD\s+)?(?:(?:[\w/]+|me)(?:->|=>))?([\w/~]+)\(/gi)) {
    out.push((m[1].split('~').pop() ?? m[1]).toUpperCase());
  }
  return out;
}

/** A statement that decides or repeats: a driver of test scenarios has none. */
const DECIDES = /^(?:IF|ELSEIF|CASE|WHEN|LOOP|DO|WHILE|SELECT|CHECK|PROVIDE)\b/i;

/**
 * The program's run as a demo driver of the workflow (`ScenarioDriver`), or null. A routine counts when it decides
 * nothing (no IF, CASE, loop or SELECT; a TRY is set-up), calls one method at least twice that is the workflow
 * routine or reaches it (through at most three calls), and writes the command operand's own field with at least two
 * of the workflow's command values as literals (`action = 'SUBMIT'`). Everything else the routine does — the set-up,
 * a simulated change, the output — is then the scenario around the workflow, not a step of it. Exactly one such
 * routine, or none.
 */
function scenarioDriverOf(statements: readonly AbapStatement[], routines: ReadonlyArray<string | null>, workflow: CommandWorkflow): ScenarioDriver | null {
  const body = new Map<string, number[]>();
  routines.forEach((r, i) => { if (r) body.set(r, [...(body.get(r) ?? []), i]); });
  const own = (key: string) => (key.split('=>').pop() ?? key).split('~').pop() ?? key;
  const calls = new Map<string, Set<string>>();
  for (const [key, idx] of body) {
    const set = calls.get(own(key)) ?? new Set<string>();
    for (const i of idx) for (const c of callsIn(statements[i].text.trim())) set.add(c);
    calls.set(own(key), set);
  }
  const target = own(workflow.routine);
  const reaches = (method: string): boolean => {
    let frontier = [method];
    const seen = new Set<string>(frontier);
    for (let depth = 0; depth <= 3 && frontier.length; depth++) {
      if (frontier.includes(target)) return true;
      const next: string[] = [];
      for (const m of frontier) for (const c of calls.get(m) ?? []) if (!seen.has(c)) { seen.add(c); next.push(c); }
      frontier = next;
    }
    return false;
  };
  const field = (workflow.operand.split(/->|-|=>/).pop() ?? workflow.operand).replace(/[^\w/]/g, '');
  const values = new Set(workflow.arms.flatMap((a) => a.values.map((v) => v.toUpperCase())));
  const literal = new RegExp(String.raw`(?:^|[\s(-])${field}\s*=\s*'((?:[^']|'')*)'`, 'gi');
  const found: ScenarioDriver[] = [];
  for (const [key, idx] of body) {
    if (own(key) === target) continue;
    // The routine's own statements, without its opening `METHOD`/`FORM`/event keyword.
    const inner = idx.filter((i) => !/^(?:METHOD|FORM|ENDMETHOD|ENDFORM)\b/i.test(statements[i].text.trim()) && !EVENT_BLOCK.test(statements[i].text.trim()));
    const texts = inner.map((i) => statements[i].text.trim());
    if (texts.some((t) => DECIDES.test(t))) continue;
    const counted = new Map<string, number[]>();
    for (const i of inner) {
      for (const c of callsIn(statements[i].text.trim())) counted.set(c, [...(counted.get(c) ?? []), statements[i].lineStart]);
    }
    const repeated = [...counted.entries()].filter(([m, lines]) => lines.length >= 2 && reaches(m));
    if (repeated.length !== 1) continue;
    const set = new Set<string>();
    for (const t of texts) for (const m of t.matchAll(literal)) if (values.has(m[1].toUpperCase())) set.add(m[1].toUpperCase());
    if (set.size < 2) continue;
    const first = statements[idx[0]];
    const last = statements[idx[idx.length - 1]];
    found.push({ routine: key, lineStart: first.lineStart, lineEnd: last.lineEnd, calls: { method: repeated[0][0], lines: repeated[0][1] } });
  }
  return found.length === 1 ? found[0] : null;
}

/** The transitions that stand in one routine (`CLASS=>METHOD` or a FORM), in source order. */
export function transitionsIn(machine: StateMachine | null, routine: string): StateTransition[] {
  if (!machine) return [];
  const key = routine.toUpperCase();
  return machine.transitions.filter((t) => t.routine === key);
}

/**
 * A state's value in words: `SUBMITTED` → "Submitted", `IN_REVIEW` → "In review"; a short code (`A`, `02`) by the
 * constant's name when it has one (`gc_status_approved` → "Approved"), otherwise the code itself in quotes.
 */
export function stateWords(value: string, constant: string | null): string {
  const v = value.trim();
  if (/^[A-Za-z][A-Za-z_ ]{2,}$/.test(v)) return sentence(v.replace(/_/g, ' '));
  if (constant) {
    const stem = (constant.split(/=>|-/).pop() ?? constant)
      .replace(/^(?:g|l|m|s)?c_/i, '')
      .replace(/^(?:co|c)_/i, '')
      .replace(/^(?:status|stat|state|zustand|stufe|phase|stage)_/i, '');
    if (/^[a-z][a-z_]{2,}$/i.test(stem)) return sentence(stem.replace(/_/g, ' '));
  }
  return `'${v}'`;
}

function sentence(text: string): string {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

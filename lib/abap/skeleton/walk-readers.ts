import { afterKeyword, maskLiterals, type AbapStatement } from '../statement-reader';
import type { Block, BlockStructure } from '../block-structure';
import type { ControlFlowReport } from '../control-flow';
import type { SkeletonRegion } from '../process-skeleton';
import { anchorOf, bodyRange } from './anchors';
import type { MethodCall } from './dispatch';
import { DECLARATIVE } from './keywords';
import { isErrorMessage, raisesException } from './recognisers';
import { leavesDialogStep } from './statement-readers';
import type { SkeletonReadings } from './graph';

/**
 * The walk's read-only questions about the source — engine 4 phase 3 (`docs/design/engine4.md`, "Phase 3"). Moved
 * out of `SkeletonBuilder` unchanged: whether a range can be left early, a leading run-switch `CHECK`, parallel
 * `STARTING NEW TASK` groups, what a flag step's later decision reads, whether a loop body stays in its loop, which
 * `sy-subrc` check follows a call, the label of an error end and the token of a call. Each answers from the
 * statements, blocks and branches alone and draws nothing (`readGuard` writes the guard it reads onto its region).
 * Two caches (constants, decisions reading a field) are why it is a class.
 */
export interface WalkReadersInput {
  statements: AbapStatement[];
  structure: BlockStructure;
  control: ControlFlowReport;
  blockAt: ReadonlyMap<number, Block>;
  formBlocks: ReadonlyMap<string, Block>;
  selectionNames: ReadonlySet<string>;
}

/** Statements that never set `sy-subrc`, so a check after them still checks the one before. */
const SUBRC_NEUTRAL = /^(?:(?:DATA|TYPES|CONSTANTS|STATICS|FIELD-SYMBOLS)\s+[\w/<]|(?:CLEAR|FREE)\s)/i;

/** Constants a run switch may be compared against without ceasing to be one. */
const SWITCH_CONSTANTS = new Set([
  'ABAP_TRUE', 'ABAP_FALSE', 'ABAP_ON', 'ABAP_OFF', 'ABAP_UNDEFINED',
  'SPACE', 'IS', 'NOT', 'INITIAL', 'AND', 'OR', 'EQ', 'NE', 'X',
]);

/**
 * The flow blocks `walkLoop` opens, and therefore the ones an `EXIT`, a
 * `CONTINUE` or a `CHECK` inside them acts on (`ctx.loops`). Roadmap 2.17 (b)
 * asks which loop a statement leaves, and this is the list that answers it.
 */
const LOOP_BLOCKS = new Set(['loop', 'do', 'while', 'select']);

/** A fork of parallel tasks the walk found in one range — roadmap 2.17 (a). */
export interface ParallelGroup {
  /** Statement indices of the `STARTING NEW TASK` calls, in source order. */
  members: number[];
  /** Statement index of the `WAIT UNTIL` that joins them, or `null` for a fork without one. */
  joinIndex: number | null;
  /** Where the walk of the range carries on. */
  resumeIndex: number;
}

export class WalkReaders {
  /** Engine 3.1.0: the decisions reading each field, by upper-cased field — `decisionsReading`. */
  private flagReaderCache = new Map<string, Array<{ index: number; line: number }>>();
  private constantsCache: Set<string> | null = null;

  constructor(private input: WalkReadersInput, private readings: SkeletonReadings) {}

  /** Does any statement between `from` and `to` leave the routine early? Conservative: anywhere counts. */
  canLeaveEarly(from: number, to: number): boolean {
    for (let i = from; i <= to; i++) {
      const statement = this.input.statements[i];
      if (['CHECK', 'RETURN', 'EXIT', 'STOP', 'LEAVE'].includes(statement.keyword)) return true;
      if (isErrorMessage(statement.text, this.readings.reads320) || raisesException(statement)) return true;
    }
    return false;
  }

  /**
   * A leading `CHECK` on nothing but selection-screen switches.
   *
   * `DESIGN.md` §5.8 draws it as a **conditional flow** into the routine rather
   * than as a gateway: `CHECK p_mail = abap_true.` is the switch "Mail" of the
   * run, not a decision the process takes. Returns the index the walk starts at.
   */
  readGuard(from: number, to: number, region: SkeletonRegion): number {
    for (let i = from; i <= to; i++) {
      const statement = this.input.statements[i];
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (statement.keyword !== 'CHECK') return from;
      const condition = afterKeyword(statement);
      if (!this.isRunSwitch(condition)) return from;
      region.guard = { condition, anchor: anchorOf(statement) };
      return i + 1;
    }
    return from;
  }

  /** True when every name in the condition is a selection-screen name. */
  private isRunSwitch(condition: string): boolean {
    const names = condition.match(/[A-Za-z_/][\w/]*/g) ?? [];
    if (!names.length) return false;
    let seenSwitch = false;
    for (const raw of names) {
      const name = raw.toUpperCase();
      if (this.input.selectionNames.has(name)) { seenSwitch = true; continue; }
      if (SWITCH_CONSTANTS.has(name)) continue;
      return false;
    }
    return seenSwitch;
  }

  /**
   * `CALL FUNCTION … STARTING NEW TASK` — the one statement ABAP proves
   * parallelism with.
   */
  isAsyncCall(statement: AbapStatement): boolean {
    return /^CALL\s+FUNCTION\b/i.test(statement.text)
      && /\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text);
  }

  /**
   * `PERFORMING <form> ON END OF TASK` whose routine receives the result.
   *
   * The second of the two proofs 2.17 (a) accepts. The callback alone is not
   * one: a routine named on the statement says the runtime will call *something*
   * back, and only a `RECEIVE RESULTS` inside it says the result is taken.
   */
  hasResultCallback(statement: AbapStatement): boolean {
    const name = /\bPERFORMING\s+'?([\w/]+)'?\s+ON\s+END\s+OF\s+TASK\b/i.exec(statement.text)?.[1];
    const block = name ? this.input.formBlocks.get(name.toUpperCase()) : undefined;
    if (!block) return false;
    const [from, to] = bodyRange(block);
    for (let i = from; i <= to; i++) {
      if (/^RECEIVE\s+RESULTS\b/i.test(this.input.statements[i].text)) return true;
    }
    return false;
  }

  /**
   * A fork of parallel tasks starting at `index` — roadmap 2.17 (a), or `null`.
   *
   * `DESIGN.md` §5.8 draws a parallel gateway *"only where the code proves
   * parallelism"*, and 2.17 says what that proof is: **two or more**
   * `STARTING NEW TASK` calls, and either a `WAIT UNTIL` that holds the caller
   * for them or a `RECEIVE RESULTS` in the routine one of them names
   * `ON END OF TASK`. A single `STARTING NEW TASK` stays a service task — one
   * task beside the caller is not a fork of the process.
   *
   * **The join is a separate question and needs the `WAIT UNTIL`.** Without one
   * the caller does not wait, so there is nothing to join at, and the reference
   * holding writes that shape: of 172 diagrams with parallelism, 91 carry only
   * one of the two halves. A join this reader added would be a statement about
   * the program that the program does not make.
   *
   * **The calls have to stand together.** Only declarative statements may come
   * between them, and between the last of them and the `WAIT UNTIL`. A step with
   * an effect in between means the caller does something on its own line that
   * this reader would have to put on one branch or another — and picking one
   * would be a sentence the source does not write. Then there is no fork and the
   * calls stay what they were: service tasks in a row, each anchored, nothing
   * lost. Corpus case CC-055 is the standing reminder of what the alternative
   * costs.
   */
  parallelGroupAt(index: number, to: number): ParallelGroup | null {
    if (!this.isAsyncCall(this.input.statements[index])) return null;
    const members: number[] = [];
    let i = index;
    for (; i <= to; i++) {
      if (this.input.blockAt.has(i)) break;
      const statement = this.input.statements[i];
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (!this.isAsyncCall(statement)) break;
      members.push(i);
    }
    if (members.length < 2) return null;

    let joinIndex: number | null = null;
    for (let j = members[members.length - 1] + 1; j <= to; j++) {
      if (this.input.blockAt.has(j)) break;
      const statement = this.input.statements[j];
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (/^WAIT\b/i.test(statement.text)
        && (/\bUNTIL\b/i.test(statement.text) || /\bFOR\s+ASYNCHRONOUS\s+TASKS\b/i.test(statement.text))
        && (!this.readings.reads350 || this.waitJoins(statement, members))) {
        joinIndex = j;
      }
      break;
    }
    if (joinIndex === null && !members.some((m) => this.hasResultCallback(this.input.statements[m]))) return null;

    return {
      members,
      joinIndex,
      resumeIndex: (joinIndex ?? members[members.length - 1]) + 1,
    };
  }

  /**
   * Engine 3.5.0 (`ENGINE_READS_350_FROM`): is this `WAIT` the join of **every** task of the group?
   *
   * A `WAIT UNTIL cond` holds the caller until `cond` is true, and only the callbacks the tasks name `ON END OF TASK`
   * can make it true while the caller waits. It waits for a task only when that task's callback writes a field the
   * condition reads: `WAIT UNTIL gv_done = abap_true` behind two tasks of which one callback sets `gv_done` waits
   * for that one task, not for both. So the `WAIT` is the join when each task names a `FORM` of this source
   * `PERFORMING … ON END OF TASK` and each such form writes (assigns, adds to, appends to, or receives into) a field
   * the condition names. A task without a callback this reader can open (none, or a method named `CALLING`) is not
   * proven to be waited for, and then there is no join. Before 3.5.0 every `WAIT UNTIL` was the join of every task.
   */
  private waitJoins(wait: AbapStatement, members: readonly number[]): boolean {
    const until = /\bUNTIL\b([\s\S]*)$/i.exec(maskLiterals(wait.text))?.[1] ?? '';
    const read = new Set((until.match(/[A-Za-z_/][\w/]*(?:-[\w/]+)*/g) ?? []).map((n) => n.toUpperCase().replace(/-.*$/, '')));
    if (!read.size) return false;
    return members.every((m) => {
      const name = /\bPERFORMING\s+'?([\w/]+)'?\s+ON\s+END\s+OF\s+TASK\b/i.exec(this.input.statements[m].text)?.[1];
      const block = name ? this.input.formBlocks.get(name.toUpperCase()) : undefined;
      if (!block) return false;
      const [from, to] = bodyRange(block);
      for (let i = from; i <= to; i++) {
        for (const written of fieldsWrittenBy(this.input.statements[i])) if (read.has(written)) return true;
      }
      return false;
    });
  }

  /**
   * Does this routine take `name` as a parameter — in its `FORM` line (`USING`, `CHANGING`, `TABLES`) or in the
   * `METHODS` line that declares it? A parameter is the routine's own variable, like one it declares.
   */
  takesAsParameter(routine: Block, name: string): boolean {
    const key = name.toUpperCase().replace(/-.*$/, '');
    const word = new RegExp(`(?:^|[\\s:,(])${key.replace(/[/]/g, '\\/')}(?=[\\s).,]|$)`, 'i');
    // A parameter list without its types, so a type that happens to share the name is not read as a parameter.
    const parameters = (text: string) => text.replace(/\b(?:TYPE|LIKE)\s+(?:REF\s+TO\s+|(?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+)?[\w/-]+/gi, ' ');
    const opener = this.input.statements[routine.openIndex];
    const header = opener ? /^(FORM|METHOD)\s+([\w/~]+)\s*([\s\S]*)$/i.exec(opener.text.trim()) : null;
    if (!header) return false;
    if (header[1].toUpperCase() === 'FORM') return word.test(parameters(header[3]));
    const method = (header[2].split('~').pop() ?? header[2]).toUpperCase();
    return this.input.statements.some((statement) => {
      if (statement.keyword !== 'METHODS' && statement.keyword !== 'CLASS-METHODS') return false;
      const declared = /^(?:CLASS-)?METHODS\s+([\w/]+)\s*([\s\S]*)$/i.exec(statement.text.trim());
      return !!declared && declared[1].toUpperCase() === method && word.test(parameters(declared[2]));
    });
  }

  /** Does this routine declare `name` itself (`DATA name`, `DATA: …, name`, `DATA(name)`, `FIELD-SYMBOLS`)? */
  declaresLocally(routine: Block, name: string): boolean {
    const key = name.toUpperCase().replace(/-.*$/, '');
    const word = new RegExp(`(?:^|[\\s:,(])${key.replace(/[/]/g, '\\/')}(?=[\\s).,]|$)`, 'i');
    for (let i = routine.openIndex + 1; i < routine.closeIndex; i++) {
      const statement = this.input.statements[i];
      if (!statement) continue;
      if ((statement.keyword === 'DATA' || statement.keyword === 'STATICS' || statement.keyword === 'FIELD-SYMBOLS') && word.test(statement.text.split(/\s+TYPE\s|\s+LIKE\s/i)[0])) return true;
      if (new RegExp(`\\b(?:DATA|FIELD-SYMBOL)\\(\\s*${key.replace(/[/]/g, '\\/')}\\s*\\)`, 'i').test(statement.text)) return true;
    }
    return false;
  }

  /** Names this source declares with `CONSTANTS`, upper-cased — read once. */
  constantNames(): Set<string> {
    if (this.constantsCache) return this.constantsCache;
    const out = new Set<string>();
    for (const statement of this.input.statements) {
      if (statement.keyword !== 'CONSTANTS') continue;
      const name = /^CONSTANTS\s*:?\s*(?:BEGIN\s+OF\s+)?([\w/]+)/i.exec(statement.text)?.[1];
      if (name) out.add(name.toUpperCase());
    }
    this.constantsCache = out;
    return out;
  }

  /**
   * The lines of the decisions outside `own` whose condition, selector or `CHECK` reads `field` — the same
   * variable, not only the same name: a decision in another routine counts only when neither routine declares
   * the field for itself or takes it as a parameter (`DATA lv_ok …` in two methods are two variables).
   */
  decisionsReading(field: string, own: Block): number[] {
    const key = field.toUpperCase();
    const cached = this.flagReaderCache.get(key);
    const all = cached ?? this.computeDecisionsReading(key);
    if (!cached) this.flagReaderCache.set(key, all);
    const ownRoutine = this.routineAround(own.openIndex);
    return all
      .filter((r) => r.index < own.openIndex || r.index > own.closeIndex)
      .filter((r) => {
        const readerRoutine = this.routineAround(r.index);
        if (readerRoutine === ownRoutine) return true;
        const own = (routine: Block | null) => !!routine && (this.declaresLocally(routine, key) || this.takesAsParameter(routine, key));
        return !own(ownRoutine) && !own(readerRoutine);
      })
      .map((r) => r.line);
  }

  /** The innermost `FORM` or `METHOD` around statement `index`, or null outside any routine. */
  private routineAround(index: number): Block | null {
    const around = this.input.structure.enclosing[index] ?? [];
    for (let i = around.length - 1; i >= 0; i--) {
      if (around[i].kind === 'form' || around[i].kind === 'method') return around[i];
    }
    return null;
  }

  private computeDecisionsReading(key: string): Array<{ index: number; line: number }> {
    const escaped = key.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const reads = new RegExp(`(?<![\\w/<>-])${escaped}(?![\\w/-])`, 'i');
    const out: Array<{ index: number; line: number }> = [];
    for (const branch of this.input.control.branches) {
      const words = [branch.selector ?? '', ...branch.arms.map((arm) => arm.condition)];
      if (words.some((w) => reads.test(maskLiterals(w)))) {
        out.push({ index: branch.openIndex, line: this.input.statements[branch.openIndex]?.lineStart ?? 0 });
      }
    }
    for (const statement of this.input.statements) {
      if ((statement.keyword === 'CHECK' || statement.keyword === 'WHILE') && reads.test(maskLiterals(statement.text))) {
        out.push({ index: statement.index, line: statement.lineStart });
      }
    }
    return out;
  }

  /**
   * The block kinds that make a `ctx.loops` entry — the ones `walkLoop` opens.
   * `EXIT`, `CONTINUE` and `CHECK` act on the innermost of them, which is what
   * `bodyStaysInLoop` has to know.
   */
  private innermostLoopBlock(index: number): Block | null {
    const enclosing = this.input.structure.enclosing[index] ?? [];
    for (let i = enclosing.length - 1; i >= 0; i--) {
      if (LOOP_BLOCKS.has(enclosing[i].kind)) return enclosing[i];
    }
    return null;
  }

  /**
   * Does the body of this `LOOP AT` stay inside the block — roadmap 2.17 (b)?
   *
   * This is the whole criterion of 2.17 (b), and it is asked of the
   * **statements**, not of the graph: a multi-instance activity contains its
   * body, and a sequence flow cannot leave a sub-process boundary, so the
   * marker is only honest where no statement of the body transfers control out
   * of the loop. `lib/bpmn/model.ts` decision 2 used to refuse the marker for
   * every loop on exactly that argument; 2.17 keeps the argument and narrows it
   * to the loops it is actually about.
   *
   * Three groups leave, and nothing else does:
   *
   * - `RETURN`, `STOP`, `RAISE`, an error `MESSAGE`, `LEAVE PROGRAM`,
   *   `LEAVE TO TRANSACTION` and a `SUBMIT` that does not come back: each of
   *   them leaves the routine or the program from wherever it stands;
   * - `EXIT` and `CHECK` and `CONTINUE` **of this loop** — `walkStatement` and
   *   `walkCheck` send all three at the innermost enclosing loop, so the ones
   *   that belong to a loop nested inside this one leave that one, not this;
   * - nothing else. A gateway, a `PERFORM`, a call, a read, a write and a
   *   nested loop all come back to the next statement of the body.
   */
  bodyStaysInLoop(block: Block): boolean {
    for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
      const statement = this.input.statements[i];
      if (DECLARATIVE.has(statement.keyword) || statement.nativeSql) continue;
      const text = statement.text;
      if (statement.keyword === 'RETURN' || statement.keyword === 'STOP'
        || raisesException(statement) || isErrorMessage(text, this.readings.reads320)
        || /^LEAVE\s+PROGRAM\b/i.test(text) || /^LEAVE\s+TO\s+TRANSACTION\b/i.test(text)
        || leavesDialogStep(text)) {
        return false;
      }
      if (statement.keyword === 'SUBMIT'
        && !/\bAND\s+RETURN\b/i.test(text) && !/\bVIA\s+JOB\b/i.test(text)) {
        return false;
      }
      if ((statement.keyword === 'EXIT' || statement.keyword === 'CONTINUE' || statement.keyword === 'CHECK')
        && this.innermostLoopBlock(i) === block) {
        return false;
      }
    }
    return true;
  }

  errorLabel(statement: AbapStatement): string {
    const id = /^MESSAGE\s+([\w-]+)/i.exec(statement.text)?.[1];
    if (id) return id.toUpperCase();
    const raised = /^RAISE\s+(?:EXCEPTION\s+TYPE\s+)?([\w/]+)/i.exec(statement.text)?.[1];
    return (raised ?? statement.keyword).toUpperCase();
  }

  /** The token a method call's node points at — the one that names the method. */
  callToken(statement: AbapStatement, call: MethodCall): number {
    if (/^CALL\s+METHOD\b/i.test(statement.text) && call.standalone) return 2;
    const name = call.constructor ? 'NEW' : call.name.replace(/[^\w/~]/g, '');
    const tokens = statement.text.split(' ');
    const at = tokens.findIndex((t) => new RegExp(`(?:^|->|=>)${name.replace(/[/~]/g, '\\$&')}\\(`, 'i').test(t)
      || (call.constructor && /^(?:NEW|OBJECT)$/i.test(t)));
    return at < 0 ? 0 : at;
  }

  /**
   * Does the statement right after this one read `sy-subrc`? §5.8 asks for it.
   *
   * Within the window of two, a statement in between is looked past only when
   * it cannot set `sy-subrc` — a declaration or a CLEAR. Any other statement
   * overwrites it: `CALL FUNCTION 'F1' … EXCEPTIONS …. CALL FUNCTION 'F2'. IF
   * sy-subrc …` checks F2, and hung a boundary on F1.
   */
  handlesSubrcAfter(index: number): boolean {
    for (let i = index + 1; i <= index + 2 && i < this.input.statements.length; i++) {
      const next = this.input.statements[i];
      if (['IF', 'CASE', 'CHECK'].includes(next.keyword) && /\bsy-subrc\b/i.test(next.text)) return true;
      if (!SUBRC_NEUTRAL.test(next.text)) return false;
    }
    return false;
  }

  exceptionNames(text: string): string[] {
    const tail = /\bEXCEPTIONS\b([\s\S]*)$/i.exec(text)?.[1] ?? '';
    return [...tail.matchAll(/([\w_]+)\s*=\s*\d+/g)].map((m) => m[1].toUpperCase());
  }
}

/**
 * The fields a statement writes, upper-cased and without components: the left side of an assignment
 * (`gv_done = abap_true`, `gv_count += 1`), `ADD`/`SUBTRACT … TO|FROM f`, `APPEND|INSERT … TO|INTO [TABLE] f`, and
 * the actual parameters a `RECEIVE RESULTS` receives into (`IMPORTING p = f`). Engine 3.5.0 (`waitJoins`).
 */
function fieldsWrittenBy(statement: AbapStatement | undefined): string[] {
  if (!statement) return [];
  const text = maskLiterals(statement.text).trim();
  const base = (name: string) => name.toUpperCase().replace(/-.*$/, '');
  const assigned = /^([A-Za-z_/][\w/]*(?:-[\w/]+)*)\s*(?:\+|-|\*|\/|&&)?=(?!=)/.exec(text);
  if (assigned) return [base(assigned[1])];
  const added = /^(?:ADD|SUBTRACT)\b[\s\S]*?\b(?:TO|FROM)\s+([A-Za-z_/][\w/]*(?:-[\w/]+)*)/i.exec(text);
  if (added) return [base(added[1])];
  const appended = /^(?:APPEND|INSERT)\b[\s\S]*?\b(?:TO|INTO)\s+(?:TABLE\s+)?([A-Za-z_/][\w/]*)/i.exec(text);
  if (appended) return [base(appended[1])];
  if (/^RECEIVE\s+RESULTS\b/i.test(text)) {
    return [...text.matchAll(/[\w/]+\s*=\s*([A-Za-z_/][\w/]*(?:-[\w/]+)*)/g)].map((m) => base(m[1]));
  }
  return [];
}

import { maskLiterals, type AbapStatement, type SourceRange } from './statement-reader';
import { type Block } from './block-structure';
import { type ProcessFacts } from './process-facts';

/**
 * Wirkungsstatus im Grundmodell — roadmap 2.12 (CR-06, decision §9 no. 15).
 *
 * Until 2.12 the canonical model knew `CALL FUNCTION … IN UPDATE TASK` only as
 * a service task with `inUpdateTask: true`, and `COMMIT WORK`/`ROLLBACK WORK`
 * only as a note (`commit-boundary`). The counter-review showed at CC-026 what
 * that does to a reader: a registration drawn as a task reads as a task that
 * has been *done*. It has not. Three states, each on the line that proves it:
 *
 * - `registered` — `CALL FUNCTION … IN UPDATE TASK`. The module is recorded for
 *   the update; nothing is executed and nothing is written at the call site.
 * - `dispatched` — `COMMIT WORK` (or `BAPI_TRANSACTION_COMMIT`, which issues
 *   it). The update is **triggered**. Executed or persisted is a stronger
 *   claim, and the source carries it only as far as `AND WAIT` and an
 *   evaluated `sy-subrc` carry it.
 * - `discarded` — `ROLLBACK WORK` (or `BAPI_TRANSACTION_ROLLBACK`). The
 *   registration is deleted; the module does not run on that path.
 *
 * And two ways a path can end without either — kept apart on purpose, because
 * CC-027 (REV2-11) is exactly the case where they were confused:
 *
 * - `orphaned` — the whole program is in the source, the path reaches its end
 *   and nothing on the way can issue a COMMIT WORK. The module is not executed.
 *   This is **not** `discarded`: the end of a program is no ROLLBACK WORK.
 * - `not-determined` — anything else: a caller outside the source, a path that
 *   leaves early, an opaque call that could commit. Said, not guessed.
 *
 * **Context only where the code proves it.** V1/V2 is an attribute of the
 * function module and never stands in the call, so `updateKind` is always
 * `not-determined`. Local update is claimed only when a `SET UPDATE TASK LOCAL`
 * precedes the registration in the same processing block with no LUW end in
 * between; its absence in the source proves nothing about a caller, so the
 * value is then `not-determined`, not "not local". `AND WAIT` is read off the
 * commit statement itself.
 *
 * This file draws nothing and names nothing — every token it keeps is one the
 * source writes. `process-skeleton.ts` attaches it to the model
 * (`ProcessSkeleton.luw`); the views condense it, they do not remove it.
 */

export type LuwEventKind = 'commit' | 'rollback';

/** What an LUW statement does to a registration that reaches it. */
export type RegistrationOutcome = 'dispatched' | 'discarded';

export interface LuwEvent extends SourceRange {
  kind: LuwEventKind;
  statementIndex: number;
  /** The statement as the source writes it, first tokens only: `COMMIT WORK AND WAIT`, `CALL FUNCTION BAPI_TRANSACTION_COMMIT`. */
  token: string;
  /**
   * `COMMIT WORK AND WAIT`, or `BAPI_TRANSACTION_COMMIT` with `wait = 'X'`.
   * `null` for a rollback, where there is nothing to wait for.
   */
  andWait: boolean | null;
  /**
   * Does a statement right after it read `sy-subrc`? Read, not judged: without
   * `AND WAIT` the value after COMMIT WORK is always 0 (S09), which is what
   * `subrcCarriesUpdateResult` says.
   */
  subrcRead: boolean;
  /** True only for a commit with `AND WAIT`. */
  subrcCarriesUpdateResult: boolean;
  /** Statement indices of the registrations this event dispatches or discards on some path. */
  registrations: number[];
}

export interface OutcomeAtEvent {
  state: RegistrationOutcome;
  /** The LUW event's statement index and range. */
  eventIndex: number;
  lineStart: number;
  lineEnd: number;
  /**
   * True when the event sits inside a branch, a loop or a handler that the
   * registration itself is not inside — reached on some paths, not on all.
   */
  conditional: boolean;
}

export interface UnresolvedEnd extends SourceRange {
  state: 'orphaned' | 'not-determined';
  /** Why, in one sentence, with the line numbers the reason rests on. */
  reason: string;
}

export interface UpdateRegistration extends SourceRange {
  statementIndex: number;
  /** The module as the source writes it, upper-cased, or null when it is computed. */
  module: string | null;
  state: 'registered';
  /** Every LUW event a path from the registration reaches first. */
  outcomes: OutcomeAtEvent[];
  /**
   * What happens on the paths that reach no LUW event. `null` exactly when every
   * path from the registration reaches a COMMIT or ROLLBACK in the source.
   */
  unresolved: UnresolvedEnd | null;
  /** `SET UPDATE TASK LOCAL`, proven or not determined — never "not local" by absence. */
  updateMode: {
    value: 'local' | 'not-determined';
    setAt: SourceRange | null;
    reason: string;
  };
  /** V1/V2 is an attribute of the module, not of the call. */
  updateKind: { value: 'not-determined'; reason: string };
}

export interface LuwModel {
  registrations: UpdateRegistration[];
  events: LuwEvent[];
}

/* ------------------------------------------------------------------ */

const UPDATE_TASK = /\bIN\s+UPDATE\s+TASK\b/i;
const SET_LOCAL = /^SET\s+UPDATE\s+TASK\s+LOCAL\b/i;
const FLOW = new Set(['if', 'case', 'loop', 'do', 'while', 'select', 'try', 'at', 'provide']);
const NOT_FLOW = new Set(['form', 'method', 'module', 'class', 'interface', 'define']);
/** Where the statement after a body belongs to someone else. */
const ARM_OR_CLOSER = new Set([
  'ELSE', 'ELSEIF', 'WHEN', 'ENDIF', 'ENDCASE', 'ENDLOOP', 'ENDDO', 'ENDWHILE',
  'ENDTRY', 'CATCH', 'CLEANUP', 'ENDSELECT', 'ENDAT', 'ENDPROVIDE',
]);
/** The end of a processing block: a closer, the next definition, or the next event. */
const CONTAINER_END = /^(ENDFORM|ENDMETHOD|ENDMODULE|ENDFUNCTION|FORM|METHOD|MODULE|FUNCTION|CLASS|INTERFACE|ENDCLASS|START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|LOAD-OF-PROGRAM|TOP-OF-PAGE|END-OF-PAGE|GET)\b|^AT\s+(SELECTION-SCREEN|LINE-SELECTION|USER-COMMAND|PF\d)/i;

function luwKind(statement: AbapStatement): LuwEventKind | null {
  const text = statement.text;
  if (/^COMMIT\s+WORK\b/i.test(text)) return 'commit';
  if (/^ROLLBACK\s+WORK\b/i.test(text)) return 'rollback';
  // The two BAPIs issue COMMIT WORK / ROLLBACK WORK themselves — unless they
  // are themselves registered for the update, which would be a different thing.
  if (/^CALL\s+FUNCTION\s+'BAPI_TRANSACTION_COMMIT'/i.test(text) && !UPDATE_TASK.test(text)) return 'commit';
  if (/^CALL\s+FUNCTION\s+'BAPI_TRANSACTION_ROLLBACK'/i.test(text) && !UPDATE_TASK.test(text)) return 'rollback';
  return null;
}

function isRegistration(statement: AbapStatement): boolean {
  return /^CALL\s+FUNCTION\b/i.test(statement.text) && UPDATE_TASK.test(maskLiterals(statement.text));
}

function andWaitOf(statement: AbapStatement, kind: LuwEventKind): boolean | null {
  if (kind === 'rollback') return null;
  if (/^COMMIT\s+WORK\s+AND\s+WAIT\b/i.test(statement.text)) return true;
  if (/^CALL\s+FUNCTION\b/i.test(statement.text)) {
    return /\bWAIT\s*=\s*('X'|abap_true)/i.test(statement.text);
  }
  return false;
}

function tokenOf(statement: AbapStatement, kind: LuwEventKind): string {
  const bapi = /^CALL\s+FUNCTION\s+'(BAPI_TRANSACTION_\w+)'/i.exec(statement.text);
  if (bapi) return `CALL FUNCTION ${bapi[1].toUpperCase()}`;
  const words = kind === 'commit' && /^COMMIT\s+WORK\s+AND\s+WAIT\b/i.test(statement.text)
    ? 'COMMIT WORK AND WAIT'
    : kind === 'commit' ? 'COMMIT WORK' : 'ROLLBACK WORK';
  return words;
}

/** Leaves the processing block, or the program, on this path. */
function leaves(statement: AbapStatement, inLoop: boolean): boolean {
  const k = statement.keyword;
  const text = statement.text;
  if (k === 'RETURN' || k === 'STOP') return true;
  if ((k === 'EXIT' || k === 'CHECK' || k === 'CONTINUE') && !inLoop) return true;
  if (k === 'LEAVE') return !/^LEAVE\s+(TO\s+)?LIST-PROCESSING\b/i.test(text);
  if (k === 'RAISE') return !/^RAISE\s+EVENT\b/i.test(text);
  if (k === 'SUBMIT') return !/\bAND\s+RETURN\b/i.test(text) && !/\bVIA\s+JOB\b/i.test(text);
  if (k === 'MESSAGE') {
    return /^MESSAGE\s+[eaxEAX]\d/.test(text) || /^MESSAGE\b[\s\S]*\bTYPE\s+'[EAXeax]'/.test(text);
  }
  return false;
}

/** Could this statement run code the source does not contain — code that could commit? */
function isOpaqueCall(statement: AbapStatement, localForms: Set<string>): boolean {
  const k = statement.keyword;
  const masked = maskLiterals(statement.text);
  // A screen's PAI modules, a method, a transaction: any of them could commit.
  if (k === 'CALL') return !isRegistration(statement);
  if (k === 'SUBMIT' || (k === 'INCLUDE' && !/^INCLUDE\s+(STRUCTURE|TYPE)\b/i.test(masked))) return true;
  if (k === 'CREATE' || /\bNEW\s+[\w/]+\s*\(/i.test(masked)) return true;
  if (k === 'PERFORM') {
    const target = /^PERFORM\s+([\w/]+)/i.exec(masked)?.[1]?.toUpperCase();
    if (!target || /\bIN\s+PROGRAM\b/i.test(masked) || /^PERFORM\s+\(/i.test(masked)) return true;
    return !localForms.has(target);
  }
  return /[\w)]\s*(->|=>)\s*[\w/]+\s*\(/.test(masked);
}

interface ScanResult {
  outcomes: OutcomeAtEvent[];
  /** Every path through the range reaches an LUW event. */
  covered: boolean;
  /** Some path leaves the processing block before reaching one. */
  left: number | null;
  /** How the range ended when it was not covered. */
  end: 'arm' | 'container' | 'eof' | 'covered' | 'left';
  /** The index the scan stopped at. */
  at: number;
}

class LuwReader {
  private blockAt = new Map<number, Block>();
  private forms = new Map<string, Block>();
  private localForms = new Set<string>();

  constructor(private facts: ProcessFacts) {
    for (const block of facts.structure.blocks) {
      this.blockAt.set(block.openIndex, block);
      if (block.kind === 'form') {
        const name = /^FORM\s+([\w/]+)/i.exec(facts.statements[block.openIndex].text)?.[1]?.toUpperCase();
        if (name) {
          this.forms.set(name, block);
          this.localForms.add(name);
        }
      }
    }
  }

  read(): LuwModel {
    const { statements } = this.facts;
    const events: LuwEvent[] = [];
    for (const statement of statements) {
      if (statement.nativeSql) continue;
      const kind = luwKind(statement);
      if (!kind) continue;
      const andWait = andWaitOf(statement, kind);
      events.push({
        kind,
        statementIndex: statement.index,
        lineStart: statement.lineStart,
        lineEnd: statement.lineEnd,
        token: tokenOf(statement, kind),
        andWait,
        subrcRead: this.subrcReadAfter(statement.index),
        subrcCarriesUpdateResult: kind === 'commit' && andWait === true,
        registrations: [],
      });
    }

    const registrations: UpdateRegistration[] = [];
    for (const statement of statements) {
      if (statement.nativeSql || !isRegistration(statement)) continue;
      const result = this.fromRegistration(statement.index, new Set());
      const outcomes = dedupe(result.outcomes);
      for (const outcome of outcomes) {
        const event = events.find((e) => e.statementIndex === outcome.eventIndex);
        if (event && !event.registrations.includes(statement.index)) event.registrations.push(statement.index);
      }
      registrations.push({
        statementIndex: statement.index,
        lineStart: statement.lineStart,
        lineEnd: statement.lineEnd,
        module: /^CALL\s+FUNCTION\s+'([\w/]+)'/i.exec(statement.text)?.[1]?.toUpperCase() ?? null,
        state: 'registered',
        outcomes,
        unresolved: result.covered ? null : this.unresolvedEnd(statement, result, outcomes),
        updateMode: this.updateMode(statement),
        updateKind: {
          value: 'not-determined',
          reason: 'V1 or V2 is an attribute of the update function module; the call does not state it.',
        },
      });
    }
    return { registrations, events };
  }

  /* ---------------- paths ---------------- */

  /**
   * From the registration outwards: its own arm, then the rest of every block
   * around it, then — when it sits in a FORM of this source — every call site.
   */
  private fromRegistration(index: number, visitedForms: Set<string>): ScanResult {
    const { statements, structure } = this.facts;
    const outcomes: OutcomeAtEvent[] = [];
    let left: number | null = null;
    let i = index + 1;
    const around = (structure.enclosing[index] ?? []).filter((b) => FLOW.has(b.kind));
    // Leaving a block the registration is inside: what follows runs on every
    // path that got there, so it is no longer conditional **relative to it**.
    for (;;) {
      const scan = this.scan(i, statements.length - 1, false, visitedForms, 0);
      outcomes.push(...scan.outcomes);
      if (scan.left != null && left == null) left = scan.left;
      if (scan.covered && left == null) return { outcomes, covered: true, left: null, end: 'covered', at: scan.at };
      if (scan.covered || scan.end === 'left') return { outcomes, covered: false, left: left ?? scan.at, end: 'left', at: scan.at };
      if (scan.end === 'arm') {
        const enclosing = [...around].reverse().find((b) => b.closeIndex >= scan.at && b.openIndex < index);
        if (!enclosing) return { outcomes, covered: false, left, end: 'container', at: scan.at };
        // A loop runs its body again: a registration inside it may meet an
        // event written *above* it in the next round. Read the body once more.
        if (['loop', 'do', 'while', 'select'].includes(enclosing.kind)) {
          const again = this.scan(enclosing.openIndex + 1, index - 1, true, visitedForms, 0);
          outcomes.push(...again.outcomes.map((o) => ({ ...o, conditional: true })));
        }
        around.splice(around.indexOf(enclosing), 1);
        i = enclosing.closeIndex + 1;
        continue;
      }
      if (scan.end === 'container') {
        // The end of a FORM: the path goes on at every PERFORM of it.
        const form = this.formAround(index);
        if (!form || visitedForms.has(form)) return { outcomes, covered: false, left, end: 'container', at: scan.at };
        const sites = statements.filter((s) => s.keyword === 'PERFORM'
          && /^PERFORM\s+([\w/]+)/i.exec(maskLiterals(s.text))?.[1]?.toUpperCase() === form
          && !/\bIN\s+PROGRAM\b/i.test(s.text));
        if (sites.length === 0) return { outcomes, covered: false, left, end: 'container', at: scan.at };
        const next = new Set(visitedForms).add(form);
        const results = sites.map((site) => this.fromRegistration(site.index, next));
        for (const r of results) outcomes.push(...r.outcomes);
        const allCovered = results.every((r) => r.covered);
        const firstLeft = results.find((r) => r.left != null)?.left ?? null;
        return {
          outcomes,
          covered: allCovered && left == null,
          left: left ?? firstLeft,
          end: allCovered ? 'covered' : results.find((r) => !r.covered)!.end,
          at: results.find((r) => !r.covered)?.at ?? scan.at,
        };
      }
      return { outcomes, covered: false, left, end: scan.end, at: scan.at };
    }
  }

  /**
   * One level of statements from `from` to `to`. Nested flow blocks are read
   * arm by arm; a branch covers when it has an ELSE/WHEN OTHERS and every arm
   * covers. A loop never covers — its body may run no time at all.
   */
  private scan(from: number, to: number, inLoop: boolean, visitedForms: Set<string>, depth: number): ScanResult {
    const { statements, control } = this.facts;
    const outcomes: OutcomeAtEvent[] = [];
    let left: number | null = null;
    let i = from;
    while (i <= to && i < statements.length) {
      const statement = statements[i];
      const block = this.blockAt.get(i);
      if (block && NOT_FLOW.has(block.kind)) {
        if (block.kind === 'form' || block.kind === 'method' || block.kind === 'module' || block.kind === 'class') {
          return { outcomes, covered: false, left, end: 'container', at: i };
        }
        i = block.closeIndex + 1;
        continue;
      }
      if (block && FLOW.has(block.kind)) {
        const branch = control.branches.find((b) => b.openIndex === i);
        if (branch && (block.kind === 'if' || block.kind === 'case')) {
          const arms = branch.arms.map((arm, k) => {
            const end = (branch.arms[k + 1]?.headerIndex ?? branch.closeIndex) - 1;
            return this.scan(arm.headerIndex + 1, end, inLoop, visitedForms, depth);
          });
          for (const arm of arms) {
            outcomes.push(...arm.outcomes.map((o) => ({ ...o, conditional: true })));
            if (arm.left != null && left == null) left = arm.left;
            if (arm.end === 'left' && left == null) left = arm.at;
          }
          const hasDefault = branch.arms.some((a) => a.kind === 'else' || a.kind === 'when-others');
          if (hasDefault && arms.every((a) => a.covered) && left == null) {
            return { outcomes, covered: true, left: null, end: 'covered', at: branch.closeIndex };
          }
        } else {
          // Loop, TRY, SELECT … ENDSELECT, AT: the body and every handler are
          // read, and what they hold is reached on some paths only.
          const loop = ['loop', 'do', 'while', 'select', 'provide', 'at'].includes(block.kind);
          let j = block.openIndex + 1;
          while (j < block.closeIndex) {
            const part = this.scan(j, block.closeIndex - 1, inLoop || loop, visitedForms, depth);
            outcomes.push(...part.outcomes.map((o) => ({ ...o, conditional: true })));
            if (part.end === 'left' && left == null && !loop) left = part.at;
            // A CATCH or CLEANUP of this TRY starts the next part.
            j = part.end === 'arm' ? part.at + 1 : block.closeIndex;
            if (part.end !== 'arm') break;
          }
        }
        i = block.closeIndex + 1;
        continue;
      }
      if (ARM_OR_CLOSER.has(statement.keyword)) return { outcomes, covered: false, left, end: 'arm', at: i };
      if (CONTAINER_END.test(statement.text)) return { outcomes, covered: false, left, end: 'container', at: i };

      const kind = luwKind(statement);
      if (kind) {
        outcomes.push({
          state: kind === 'commit' ? 'dispatched' : 'discarded',
          eventIndex: i,
          lineStart: statement.lineStart,
          lineEnd: statement.lineEnd,
          conditional: left != null,
        });
        return { outcomes, covered: left == null, left, end: left == null ? 'covered' : 'left', at: i };
      }
      if (leaves(statement, inLoop)) {
        if (statement.keyword === 'CHECK' && !inLoop) {
          // Some paths leave here, the others go on.
          if (left == null) left = i;
          i += 1;
          continue;
        }
        if (inLoop && ['EXIT', 'CONTINUE', 'CHECK'].includes(statement.keyword)) {
          return { outcomes, covered: false, left, end: 'arm', at: i };
        }
        return { outcomes, covered: false, left: left ?? i, end: 'left', at: i };
      }
      if (statement.keyword === 'PERFORM' && depth < 8) {
        const target = /^PERFORM\s+([\w/]+)/i.exec(maskLiterals(statement.text))?.[1]?.toUpperCase();
        const form = target && !/\bIN\s+PROGRAM\b/i.test(statement.text) ? this.forms.get(target) : undefined;
        if (form && target && !visitedForms.has(target)) {
          const inner = this.scan(form.openIndex + 1, form.closeIndex - 1, false,
            new Set(visitedForms).add(target), depth + 1);
          outcomes.push(...inner.outcomes.map((o) => ({ ...o, conditional: o.conditional || left != null })));
          if (inner.covered && left == null) return { outcomes, covered: true, left: null, end: 'covered', at: i };
          // A RETURN inside the routine ends the routine, not the path.
        }
      }
      i += 1;
    }
    return { outcomes, covered: false, left, end: i >= statements.length ? 'eof' : 'arm', at: Math.min(i, statements.length - 1) };
  }

  private formAround(index: number): string | null {
    const around = this.facts.structure.enclosing[index] ?? [];
    const form = [...around].reverse().find((b) => b.kind === 'form');
    if (!form) return null;
    return /^FORM\s+([\w/]+)/i.exec(this.facts.statements[form.openIndex].text)?.[1]?.toUpperCase() ?? null;
  }

  /* ---------------- the end of a path ---------------- */

  private unresolvedEnd(registration: AbapStatement, result: ScanResult, outcomes: OutcomeAtEvent[]): UnresolvedEnd {
    const { statements } = this.facts;
    const last = statements[Math.min(result.at, statements.length - 1)];
    const range = { lineStart: last.lineStart, lineEnd: last.lineEnd };
    const notDetermined = (reason: string): UnresolvedEnd => ({ state: 'not-determined', ...range, reason });

    if (result.left != null) {
      const leaving = statements[result.left];
      return notDetermined(`A path leaves at line ${leaving.lineStart} (${leaving.keyword}) before any COMMIT WORK or ROLLBACK WORK; where it goes on is not in this reading.`);
    }
    const first = statements.find((s) => s.keyword !== '');
    if (!first || !/^(REPORT|PROGRAM)\b/i.test(first.text)) {
      return notDetermined('The source is not a whole program: whoever calls it may commit or roll back, and that code is not here.');
    }
    if (result.end === 'container' && this.formAround(registration.index)) {
      return notDetermined('The routine is not called from this source, so the path after it is not here.');
    }
    const hit = new Set(outcomes.map((o) => o.eventIndex));
    const elsewhere = statements.find((s) => !s.nativeSql && luwKind(s) && !hit.has(s.index));
    if (elsewhere) {
      return notDetermined(`${tokenOf(elsewhere, luwKind(elsewhere)!)} at line ${elsewhere.lineStart} is not on a path read from the registration; whether it runs after it is not determined.`);
    }
    const opaque = statements.find((s) => s.index !== registration.index && !s.nativeSql && isOpaqueCall(s, this.localForms));
    if (opaque) {
      return notDetermined(`Line ${opaque.lineStart} calls code that is not in the source; it could commit, and that is not determined.`);
    }
    return {
      state: 'orphaned',
      ...range,
      reason: `The whole program is in the source and no statement on the path issues COMMIT WORK: the registered module is not executed. The end of the program is not a ROLLBACK WORK.`,
    };
  }

  /* ---------------- context ---------------- */

  private updateMode(registration: AbapStatement): UpdateRegistration['updateMode'] {
    const { statements, structure } = this.facts;
    const sets = statements.filter((s) => SET_LOCAL.test(s.text));
    if (sets.length === 0) {
      return {
        value: 'not-determined',
        setAt: null,
        reason: 'No SET UPDATE TASK LOCAL in the source. That proves nothing about a caller, so the mode is not determined, not "not local".',
      };
    }
    const container = (index: number) => {
      const around = structure.enclosing[index] ?? [];
      return [...around].reverse().find((b) => NOT_FLOW.has(b.kind))?.openIndex ?? -1;
    };
    // A SET inside an IF, a CASE arm, a loop or a TRY of the same routine runs on
    // some paths only; the routine being the same does not make it precede the
    // registration on every path. Only a SET standing directly in the routine —
    // no flow block between it and the routine — is proven to have run.
    const unconditional = (index: number) => {
      const around = structure.enclosing[index] ?? [];
      return (around[around.length - 1]?.openIndex ?? -1) === container(index);
    };
    const before = sets
      .filter((s) => s.index < registration.index && container(s.index) === container(registration.index))
      .filter((s) => unconditional(s.index))
      .filter((s) => !statements.some((x) => x.index > s.index && x.index < registration.index && luwKind(x)))
      .pop();
    if (before) {
      return {
        value: 'local',
        setAt: { lineStart: before.lineStart, lineEnd: before.lineEnd },
        reason: `SET UPDATE TASK LOCAL at line ${before.lineStart} precedes the registration in the same block with no COMMIT or ROLLBACK in between.`,
      };
    }
    return {
      value: 'not-determined',
      setAt: null,
      reason: `SET UPDATE TASK LOCAL stands at line ${sets.map((s) => s.lineStart).join(', ')}, but it is not proven to precede this registration in the same SAP LUW.`,
    };
  }

  private subrcReadAfter(index: number): boolean {
    const { statements } = this.facts;
    for (let i = index + 1; i <= index + 2 && i < statements.length; i++) {
      if (/\bsy-subrc\b/i.test(statements[i].text)) return true;
    }
    return false;
  }
}

function dedupe(outcomes: OutcomeAtEvent[]): OutcomeAtEvent[] {
  const byEvent = new Map<number, OutcomeAtEvent>();
  for (const outcome of outcomes) {
    const seen = byEvent.get(outcome.eventIndex);
    // Reached unconditionally on one route beats conditionally on another.
    if (!seen || (seen.conditional && !outcome.conditional)) byEvent.set(outcome.eventIndex, outcome);
  }
  return [...byEvent.values()].sort((a, b) => a.eventIndex - b.eventIndex);
}

export function readLuwStates(facts: ProcessFacts): LuwModel {
  return new LuwReader(facts).read();
}

import { maskLiterals, type AbapStatement } from '../statement-reader';
import type { Block, BlockStructure } from '../block-structure';
import type { ControlFlowReport } from '../control-flow';
import { databaseWriteIn, writesDatabaseOnly, type SqlWrite } from '../open-sql-discrimination';
import type { FormEffect } from '../process-skeleton';
import { bodyRange } from './anchors';
import type { SkeletonReadings } from './graph';
import {
  AMDP_METHOD,
  ENHANCEMENT_CALL,
  BUILDS_TABLE,
  DECIDING_BLOCKS,
  adbcExecution,
  amdpTables,
  functionTaskKind,
  isEmbeddedSelect,
  isErrorMessage,
  isFileOutput,
  isInfoMessage,
  isListOutput,
  isRaiseEvent,
  raisesException,
  receivesResults,
  selectTables,
} from './recognisers';

/**
 * Pass "effects" — engine 4 phase 3, after the declarations and the method call sites
 * (`docs/design/engine4.md`, "Phase 3").
 *
 * Which routines are steps: each form and method gets the effects of its own statements (`directEffects`), the
 * effects travel along `PERFORM`, resolved method calls and bound event handlers until nothing changes, and a
 * routine left without any is a technical helper, folded into its caller. Draws nothing. Readings: `reads310` (a
 * routine that builds a table while it decides is a calculation), `reads320` (enhancement calls; messages of any
 * case).
 *
 * **The helper seam (engine review, B2).** "No effect of its own" is decided here and nowhere else:
 * `directEffects` is the one list of statements that make a routine a step. A routine whose only effect this list
 * does not know is folded as a technical helper, and whatever it does is then not drawn. A gated reading that widens
 * the list (a later engine version) changes this function and nothing downstream; this pass is byte-neutral and
 * changes no reading.
 *
 * The method calls and the bound event handlers still come from the builder's dispatch (`callsIn`,
 * `handlersRaisedBy`); they are inputs here until the dispatch is a pass of its own.
 */
export interface EffectsInput {
  statements: AbapStatement[];
  structure: BlockStructure;
  control: ControlFlowReport;
  /** Forms under their name, methods under `CLASS=>METHOD`. */
  routineBlocks: ReadonlyMap<string, Block>;
  formBlocks: ReadonlyMap<string, Block>;
  macros: ReadonlyMap<string, { block: Block }>;
  /** The data objects this source declares (`localDataObjectsOf`). */
  localData: ReadonlySet<string>;
  /** The method calls a statement writes, resolved by the builder's dispatch. */
  callsIn: (statement: AbapStatement) => ReadonlyArray<{ key: string | null; standalone: boolean }>;
  /** The bound handlers a `RAISE EVENT` runs. */
  handlersRaisedBy: (statement: AbapStatement) => string[];
}

export interface RoutineEffects {
  effects: Map<string, Set<FormEffect>>;
  /** The routines each routine calls (forms it performs, methods it calls, handlers it raises). */
  performedFrom: Map<string, string[]>;
  /** Routines without an effect of their own — technical helpers. */
  helpers: Set<string>;
}

/** Roadmap 3.0.7: is this write target a data object of the program rather than a database table? */
export function isInternalTable(localData: ReadonlySet<string>, name: string): boolean {
  return localData.has(name.toUpperCase().replace(/\[\]$/, ''));
}

/** A write to a data object of the program — never an UPDATE, which only names a database table. */
export function isInternalWrite(localData: ReadonlySet<string>, write: SqlWrite): boolean {
  return !writesDatabaseOnly(write) && isInternalTable(localData, write.table);
}


/**
 * A routine is a step only when it writes, reads, calls another system,
 * involves a person, ends the process with an error, checks an authorization,
 * or classifies from literals (`DESIGN.md` §5.8). Everything else is a
 * technical helper and is folded into its caller.
 *
 * The effect travels along `PERFORM`: `process_actions` does nothing itself
 * and performs three routines that all do something, so it is a step. Without
 * the closure the phase of the process with the most effect in it would be the
 * one that disappears.
 *
 * Since 27.09.2026 (D2) the same holds for a method this source implements:
 * §5.8 names "a `FORM`/method with an effect of its own" in one breath, so a
 * method is a routine here, and the effect travels along a method call that
 * resolves to one exactly as it travels along a `PERFORM`.
 */
export function readEffects(input: EffectsInput, readings: SkeletonReadings): RoutineEffects {
  const out: RoutineEffects = { effects: new Map(), performedFrom: new Map(), helpers: new Set() };
  for (const [name, block] of input.routineBlocks) {
    out.effects.set(name, directEffects(input, readings, block));
    out.performedFrom.set(name, []);
  }
  for (const [name, block] of input.routineBlocks) {
    const performed: string[] = [];
    const [from, to] = bodyRange(block);
    for (let i = from; i <= to; i++) {
      const statement = input.statements[i];
      for (const call of input.callsIn(statement)) {
        if (call.key) performed.push(call.key);
      }
      if (isRaiseEvent(statement.text)) performed.push(...input.handlersRaisedBy(statement));
      if (statement.keyword !== 'PERFORM') continue;
      const m = /^PERFORM\s+([\w/]+)/i.exec(statement.text);
      if (m && input.formBlocks.has(m[1].toUpperCase())) performed.push(m[1].toUpperCase());
    }
    out.performedFrom.set(name, performed);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, performed] of out.performedFrom) {
      const own = out.effects.get(name) as Set<FormEffect>;
      for (const target of performed) {
        for (const effect of out.effects.get(target) ?? []) {
          if (own.has(effect)) continue;
          own.add(effect);
          changed = true;
        }
      }
    }
  }
  for (const [name, set] of out.effects) if (set.size === 0) out.helpers.add(name);
  return out;
}

function directEffects(input: EffectsInput, readings: SkeletonReadings, block: Block, expanding: Set<string> = new Set()): Set<FormEffect> {
  const out = new Set<FormEffect>();
  // ADR-066. An AMDP method (`METHOD m BY DATABASE PROCEDURE|FUNCTION …`)
  // runs its body on the database: it reads the database objects its USING
  // clause names (or, without one, at least its own parameters there). Its
  // SQLScript is not read (`statement-reader.ts` keeps it as native code),
  // so it is not a technical helper with nothing in it but a read step.
  if (block.kind === 'method' && AMDP_METHOD.test(input.statements[block.openIndex].text)) {
    out.add(amdpTables(input.statements[block.openIndex].text).length ? 'read' : 'call');
  }
  const [from, to] = bodyRange(block);
  for (let i = from; i <= to; i++) {
    const statement = input.statements[i];
    if (statement.nativeSql) continue;
    // Rule 2: the effect of a macro belongs to the routine that uses it, so
    // the body is read here as if it stood at the call site.
    const macro = input.macros.get(statement.keyword);
    if (macro) {
      // A macro that names itself, or a ring of two, is not ABAP the compiler
      // would take — but this reader is not the compiler, and without a floor
      // the recursion ran until the stack gave out, which made one crafted
      // DEFINE the end of the whole analysis.
      // A macro already being expanded is read once.
      if (!expanding.has(statement.keyword)) {
        expanding.add(statement.keyword);
        for (const effect of directEffects(input, readings, macro.block, expanding)) out.add(effect);
        expanding.delete(statement.keyword);
      }
      continue;
    }
    const text = statement.text;
    if ((statement.keyword === 'SELECT' || isEmbeddedSelect(text)) && selectTables(text).length) out.add('read');
    // An internal table changed keeps the routine a step, as a database write
    // does — changing the kind alone folded whole calculation routines of the
    // shipped examples into their callers (roadmap 3.0.7) — but as `compute`.
    const written = databaseWriteIn(text);
    if (written) out.add(isInternalWrite(input.localData, written) ? 'compute' : 'write');
    if (adbcExecution(text)) out.add('call');
    if (/^CALL\s+FUNCTION\b/i.test(text)) {
      const kind = functionTaskKind(/^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text)?.[1]?.toUpperCase());
      if (kind === 'user-task') out.add('human');
      else if (kind === 'output') out.add('file');
      else out.add('call');
    }
    if (/^CALL\s+TRANSACTION\b/i.test(text) || statement.keyword === 'SUBMIT') out.add('call');
    // Engine 3.2.0: a BAdI call or a customer-function call reaches an enhancement outside this source.
    if (readings.reads320 && ENHANCEMENT_CALL.test(text)) out.add('call');
    if (receivesResults(text)) out.add('call');
    if (/^CALL\s+SCREEN\b/i.test(text)) out.add('human');
    if (isListOutput(statement) || isFileOutput(statement)) out.add('file');
    if (isErrorMessage(text, readings.reads320) || raisesException(statement)) out.add('error');
    // The handlers of an event are called, whoever they turn out to be. Where
    // the source binds them, their own effect travels instead (`readEffects`).
    if (isRaiseEvent(text) && !input.handlersRaisedBy(statement).length) out.add('call');
    if (isInfoMessage(text, readings.reads320)) out.add('human');
    if (/^LEAVE\s+PROGRAM\b/i.test(text)) out.add('error');
    if (statement.keyword === 'AUTHORITY-CHECK') out.add('authority');
    const perform = /^PERFORM\s+([\w/]+)/i.exec(text);
    if (perform && !input.formBlocks.has(perform[1].toUpperCase())) out.add('call');
    if (input.callsIn(statement).some((call) => call.standalone && !call.key)) out.add('call');
  }
  if (out.size === 0 && classifiesFromLiterals(input, block)) out.add('business-rule');
  if (out.size === 0 && readings.reads310 && buildsWhileDeciding(input, block)) out.add('compute');
  return out;
}

/**
 * Engine 3.1.0 — a routine that builds a table while it decides or iterates is a calculation.
 *
 * Since 3.0.7 a routine that changes an internal table (`MODIFY gt_out …`, `DELETE lt_rows WHERE …`) is a step
 * of the process (`compute`), but the commonest way to build one — `APPEND … TO`, `COLLECT … INTO`,
 * `INSERT … INTO TABLE` — counted for nothing, so a routine that walks the contracts, decides which ones
 * qualify and appends the new rents was folded into its caller as a technical helper, with every decision in
 * it. §5.8 folds a routine *without an effect of its own*; building the result set by decisions is one.
 * Kept narrow on purpose: a routine that only appends one row (`add_message`, `add_issue`) decides nothing
 * and stays a helper — the rule needs the append to stand **inside** a branch or a loop of the routine's own.
 * A log helper that appends its line and then counts warnings by level (`add_log`) appends beside its branch,
 * not in it, and stays a helper too.
 */
function buildsWhileDeciding(input: EffectsInput, block: Block): boolean {
  const [from, to] = bodyRange(block);
  for (let i = from; i <= to; i++) {
    const statement = input.statements[i];
    if (statement.nativeSql || !BUILDS_TABLE.test(maskLiterals(statement.text))) continue;
    // The row is added under a decision or per iteration of this routine: an append beside a branch (a log
    // helper that appends its line and then counts warnings) builds nothing by deciding.
    const around = input.structure.enclosing[i] ?? [];
    if (around.some((outer) => outer.openIndex > block.openIndex && DECIDING_BLOCKS.has(outer.kind))) return true;
  }
  return false;
}

/**
 * Does this routine classify or score from literals — §5.8's Business-Rule-Task?
 *
 * The discriminator is a **structure component**. `derive_customer_risk` tests
 * `cs_customer-sperr = 'X'` and `decide_actions` writes
 * `<fs_order>-action = 'SET_DELIVERY_BLOCK'`: a field of a business object
 * against a literal. `add_log` tests its own flat parameter `iv_level` against
 * `'WARN'` and counts up a global, and §5.8 names it as a technical helper —
 * so a flat name against a literal is deliberately not enough.
 */
function classifiesFromLiterals(input: EffectsInput, block: Block): boolean {
  const component = /[\w<>]+-[\w]+/;
  const literal = /'[^']*'/;
  for (const branch of input.control.branches) {
    if (branch.openIndex <= block.openIndex || branch.closeIndex >= block.closeIndex) continue;
    for (const arm of branch.arms) {
      if (component.test(arm.condition) && literal.test(arm.condition)) return true;
    }
    for (let i = branch.openIndex + 1; i < branch.closeIndex; i++) {
      if (/^[\w<>/]+-[\w-]+\s*=\s*'/.test(input.statements[i].text)) return true;
    }
  }
  return false;
}

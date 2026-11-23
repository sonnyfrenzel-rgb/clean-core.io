import { maskLiterals, type AbapStatement } from '../../statement-reader';
import { namesThisProgram } from '../../callback-registrations';
import { programName } from '../anchors';
import { RUNTIME_ORDER, type EntryPoint } from '../entries';
import { alvEventRows } from '../recognisers';
import { assignmentTarget } from '../statement-readers';
import type { WalkCallback } from './state';
import type { Walker } from './walker';

/**
 * What the walk learns about who calls back — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3").
 *
 * Routines the runtime calls although no statement of this source calls them: a FORM named `ON END OF TASK`, the
 * ALV callbacks, a handler `SET HANDLER` binds to an event of a class outside the source. Each becomes an entry of
 * its own (`callbackEntry`) once the walk has passed the statement that names it, and `handlersRaisedBy` answers
 * which registered handlers a `RAISE EVENT` runs at the point the walk stands. Moved out of `SkeletonBuilder`
 * unchanged (`skeleton/entries.ts` holds the entries that do not depend on the walk).
 */

/**
 * The registered handlers a `RAISE EVENT` runs: those declared for this event
 * of the raising class, of a class it inherits from, or of the interface the
 * statement names (`RAISE EVENT lif_x~ev`). In the order `SET HANDLER`
 * registered them — the order the runtime calls them in.
 */
export function handlersRaisedBy(w: Walker, statement: AbapStatement, inWalk = false): string[] {
  if (!w.input.boundHandlers.length) return [];
  if (inWalk) {
    // At the walk's `RAISE`: only a registration the walk has already passed.
    return handlersRaisedBy(w, statement).filter((key) => w.state.registeredInWalk.has(key));
  }
  return w.input.dispatch.handlersRaisedBy(statement);
}

/**
 * `CALL FUNCTION … STARTING NEW TASK … PERFORMING form ON END OF TASK` (or
 * `CALLING meth ON END OF TASK`) — the routine the **runtime** calls when the
 * asynchronous task ends.
 *
 * No `PERFORM` names it, so the call graph of 2.2 counts it as unreachable,
 * and until 27.09.2026 this file listed the one routine that takes the task's
 * results — `RECEIVE RESULTS`, the checks on them, the log — under "not
 * reached", although the statement right here names it as the thing that
 * runs. It is the same kind of evidence as a `MODULE … INPUT` (D1): a caller
 * outside the source's own flow, written down in the source. So it becomes an
 * entry of its own, and only once the walk has passed the call that names it:
 * a callback of a call nothing reaches is not reached either.
 *
 * It is not drawn at the call site as a sub-process on purpose. It does not
 * run there — the caller goes on at once, and the callback runs whenever the
 * task comes back — so a box in the caller's sequence would put it in an
 * order the program does not have.
 */
export function recordCallback(w: Walker, statement: AbapStatement): void {
  recordAlvCallbacks(w, statement);
  if (!/\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text)) return;
  const code = maskLiterals(statement.text);
  const form = /\bPERFORMING\s+([\w/]+)\s+ON\s+END\s+OF\s+TASK\b/i.exec(code);
  if (form) {
    const key = form[1].toUpperCase();
    if (w.input.formBlocks.has(key)) pushCallback(w, key, form[1], statement);
    return;
  }
  const method = /\bCALLING\s+(?:([\w/]+|<[\w/]+>)(->|=>))?([\w/~]+)\s+ON\s+END\s+OF\s+TASK\b/i.exec(code);
  if (!method) return;
  const { key, ambiguous } = w.input.dispatch.resolveMethod(method[1] ?? null, (method[2] as '->' | '=>' | undefined) ?? null,
    method[3].toUpperCase(), statement.index);
  if (key && !ambiguous && w.input.routineBlocks.has(key)) pushCallback(w, key, method[3], statement);
}

/**
 * SAP convention (ALV list/grid, type pool SLIS): the `REUSE_ALV_*` function
 * modules call back FORMs of the program named in `I_CALLBACK_PROGRAM`, and
 * the caller names each FORM as a **literal** — in a parameter
 * `I_CALLBACK_<event>` (`I_CALLBACK_USER_COMMAND`, `I_CALLBACK_PF_STATUS_SET`,
 * `I_CALLBACK_TOP_OF_PAGE`, `I_CALLBACK_HTML_TOP_OF_PAGE`, …) or in the
 * `FORM` column of the event table it passes as `IT_EVENTS` (`slis_alv_event`:
 * `NAME` is the event, `FORM` the routine, e.g. `TOP_OF_PAGE`).
 *
 * The ALV runtime performs those FORMs when the person presses a function
 * key or the list is drawn — no `PERFORM` of this source names them, so they
 * were listed as "not reached" although the call says in so many words that
 * they run. They become callbacks exactly like a FORM named `ON END OF TASK`:
 * an entry of their own once the walk has passed the call, with the
 * parameter as their trigger. Only where `I_CALLBACK_PROGRAM` is written
 * (without it the ALV calls back nothing) and does not name another program
 * by literal — the FORMs are looked up in that program.
 */
export function recordAlvCallbacks(w: Walker, statement: AbapStatement): void {
  const text = statement.text;
  if (!/^CALL\s+FUNCTION\s+'REUSE_ALV_[\w]*'/i.test(text)) return;
  const program = /\bI_CALLBACK_PROGRAM\s*=\s*('[^']*'|[\w/-]+)/i.exec(text);
  if (!program) return;
  if (!namesThisProgram(program[1], w.input.statements, programName(w.input.statements)?.name ?? null, statement)) return;
  for (const m of text.matchAll(/\b(I_CALLBACK_(?!PROGRAM\b)[\w]+)\s*=\s*'([\w/]+)'/gi)) {
    const key = m[2].toUpperCase();
    if (w.input.formBlocks.has(key)) pushCallback(w, key, m[2], statement, `ALV ${m[1].toUpperCase()}`);
  }
  const events = /\bIT_EVENTS\s*=\s*(<?[\w/]+>?)/i.exec(text);
  if (!events) return;
  // The event table is filled elsewhere in the source: `ls_event-form =
  // 'TOP_OF_PAGE'.` or `VALUE #( ( name = … form = 'TOP_OF_PAGE' ) )`. A
  // literal in a `FORM` component that names a FORM of this source is that
  // registration — but only in a statement that fills **this** table: one
  // that assigns the table itself, or a row of it (a `FORM = '…'` of any
  // other structure registers nothing).
  const rows = alvEventRows(w.input.statements, events[1].toUpperCase());
  for (const other of w.input.statements) {
    const target = /^(<?[\w/]+>?)(?:-[\w/-]+)?\s*\??=(?!=)/.exec(other.text)?.[1]?.toUpperCase()
      ?? assignmentTarget(other.text) ?? /^MODIFY\s+(?:TABLE\s+)?([\w/]+)/i.exec(other.text)?.[1]?.toUpperCase();
    if (!target || !rows.has(target)) continue;
    // Engine 3.5.0: a row filled only after the call registers nothing for it.
    if (w.readings.reads350 && filledAfterCall(w, other.index, statement.index)) continue;
    for (const m of other.text.matchAll(/(?:-|\s|\()FORM\s*=\s*'([\w/]+)'/gi)) {
      const key = m[1].toUpperCase();
      if (w.input.formBlocks.has(key)) pushCallback(w, key, m[1], statement, 'ALV IT_EVENTS');
    }
  }
}

/** The innermost `FORM`, `METHOD` or `MODULE` around statement `index`, or null at the level of an event block. */
function routineAt(w: Walker, index: number): { openIndex: number; kind: string } | null {
  const around = w.input.structure.enclosing[index] ?? [];
  for (let i = around.length - 1; i >= 0; i--) {
    const block = around[i];
    if (block.kind === 'form' || block.kind === 'method' || block.kind === 'module') return block;
  }
  return null;
}

/**
 * Engine 3.5.0 (`ENGINE_READS_350_FROM`): does the statement at `fill` provably run only **after** the ALV call at
 * `call`? The event table is often filled in a `FORM` written below the call and performed before it, so source
 * order alone says nothing. The fill is lifted to the routine the call stands in: a statement there is where it is;
 * a statement in a `FORM` stands at every `PERFORM` of that form, followed up through the forms that perform it. Only
 * when every position it lifts to lies in the call's routine and behind the call is the row filled after the call. A
 * fill that cannot be lifted (a method, a form no `PERFORM` names, a chain deeper than eight) keeps counting, as it
 * did before 3.5.0.
 */
function filledAfterCall(w: Walker, fill: number, call: number): boolean {
  // Outside a routine the scope is the event block: ABAP runs event blocks by event, not in source order.
  const scopeOf = (index: number, routine: { openIndex: number } | null): string => {
    if (routine) return `routine:${routine.openIndex}`;
    const line = w.input.statements[index]?.lineStart ?? -1;
    const event = w.input.structure.containers.find((c) => c.kind === 'event' && c.lineStart <= line && line <= c.lineEnd);
    return event ? `event:${event.lineStart}` : 'program';
  };
  const scope = scopeOf(call, routineAt(w, call));
  const lift = (index: number, depth: number): number[] | null => {
    const routine = routineAt(w, index);
    if (scopeOf(index, routine) === scope) return [index];
    if (!routine || routine.kind !== 'form' || depth > 8) return null;
    const name = /^FORM\s+([\w/]+)/i.exec(w.input.statements[routine.openIndex]?.text ?? '')?.[1]?.toUpperCase();
    if (!name) return null;
    const sites = w.input.statements.filter((s) => s.keyword === 'PERFORM'
      && /^PERFORM\s+([\w/]+)/i.exec(maskLiterals(s.text))?.[1]?.toUpperCase() === name);
    if (!sites.length) return null;
    const out: number[] = [];
    for (const site of sites) {
      const at = lift(site.index, depth + 1);
      if (!at) return null;
      out.push(...at);
    }
    return out;
  };
  const at = lift(fill, 0);
  return at !== null && at.length > 0 && at.every((i) => i > call);
}

export function pushCallback(w: Walker, key: string, label: string, site: AbapStatement, trigger = 'ON END OF TASK'): void {
  if (w.state.callbacks.some((c) => c.key === key)) return;
  w.state.callbacks.push({ key, label, site, trigger });
  // Engine 3.2.0: the callback runs in the session that registered it, with what is registered here.
  if (w.readings.reads320) w.state.registrationsAtCall.set(site.index, new Set(w.state.registeredInWalk));
}

/**
 * The entry a recorded callback opens — or `null` where the routine is
 * already drawn: a callback the source also performs is a sub-process of that
 * caller, and drawing it a second time as a beginning would be D3 again.
 */
export function callbackEntry(w: Walker, callback: WalkCallback): EntryPoint | null {
  const block = w.input.routineBlocks.get(callback.key);
  if (!block || w.state.reachedRoutines.has(callback.key) || w.state.entryOfBlock.has(block.openIndex)) return null;
  w.state.entryOfBlock.add(block.openIndex);
  return {
    statement: w.input.statements[block.openIndex],
    lastIndex: block.closeIndex - 1,
    endStatement: w.input.statements[Math.min(block.closeIndex, w.input.statements.length - 1)],
    label: callback.label,
    rank: RUNTIME_ORDER.length,
    implicit: false,
    origin: 'callback',
    // Determined, unlike the other entries that are not event blocks: the
    // statement that names it says what calls it.
    trigger: callback.trigger,
    site: callback.site.index,
  };
}

/**
 * `SET HANDLER lo->on_click FOR go_grid` where `on_click` is declared `FOR
 * EVENT double_click OF cl_gui_alv_grid` and that class is **not** in this
 * source: the method is called by code outside the source, when that class
 * raises the event — no `RAISE EVENT` here will ever run it
 * (`handlersRaisedBy`). It is the same kind of evidence as `ON END OF TASK`
 * (`recordCallback`): the source registers a routine for the runtime to call
 * back, in so many words. So it becomes an entry of its own, once the walk
 * has passed the registration, with the event as its trigger — which the
 * declaration names, so it is determined. A handler of a class this source
 * holds is left to its `RAISE EVENT` — which runs it only once the walk has
 * passed this registration (`registeredInWalk`).
 * A handler the source may deregister anywhere is bound nowhere
 * (`readEventHandlers`), so it opens neither.
 */
export function recordHandlerRegistration(w: Walker, statement: AbapStatement): void {
  if (!w.input.boundHandlers.length) return;
  const handlers = w.input.dispatch.handlersSetBy(statement);
  if (!handlers || handlers.deregisters) return;
  for (const { key, name } of handlers) {
    if (!w.input.boundHandlers.includes(key)) continue;
    if (!w.state.registrationFrozen) w.state.registeredInWalk.add(key);
    const declared = w.input.handlerEvent.get(key);
    if (!declared || w.input.classNames.has(declared.of)) continue;
    pushCallback(w, key, name, statement, `EVENT ${declared.event} OF ${declared.of}`);
  }
}

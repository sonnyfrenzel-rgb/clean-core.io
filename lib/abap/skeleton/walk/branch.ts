import { afterKeyword, maskLiterals, type AbapStatement } from '../../statement-reader';
import type { Block } from '../../block-structure';
import type { Branch } from '../../control-flow';
import { readDecisionTable } from '../../decision-table';
import type { SkeletonNode } from '../../process-skeleton';
import { anchorOf, snippet, tokenIndexOf } from '../anchors';
import type { Exit } from '../graph';
import { BUILDS_TABLE, BUILT_IN_FLAG_VALUES, COLLECT_TARGET, FLAG_ASSIGNMENT, MESSAGE_ROW } from '../recognisers';
import { walkMethodCalls } from './calls';
import type { WalkContext, Walker } from './walker';

/**
 * The decisions of the walk — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3"): `IF` and `CASE`
 * (`walkBranch`, each arm walked through `w.range`), the outcome of an arm that draws no step (engine 3.1.0,
 * `armOutcome`: a helper call, a collected row, a flag a later decision reads), and the group change `AT … ENDAT`
 * (`walkGroupChange`). Moved out of `SkeletonBuilder` unchanged.
 */

/**
 * Roadmap 3.0.7 (MM case review) — a `CASE` on the function
 * code a person pressed. Its arms are **alternatives the user chooses
 * from**, each as often and in whatever order they like, not steps that
 * follow one another: the review found a list callback's "display order",
 * "set to done" and "change delivery date" numbered 5, 6, 7 on the main
 * path. The gateway says so in `detail.userAction`, so a view can list the
 * arms side by side instead of counting them.
 *
 * Read off the source only: the selector is `sy-ucomm`, or the first `USING`
 * parameter of a FORM the ALV calls back as `I_CALLBACK_USER_COMMAND` — the
 * type pool SLIS hands the function code in that position (`r_ucomm LIKE
 * sy-ucomm`). A CASE in a routine *performed from* the callback is not
 * claimed; its selector could be anything by then.
 */
function decidesUserCommand(w: Walker, branch: Branch, ctx: WalkContext): boolean {
  if (branch.kind !== 'case' || !branch.selector) return false;
  const selector = branch.selector.trim().toUpperCase();
  if (selector === 'SY-UCOMM') return true;
  const callback = w.state.callbacks.find((c) => c.trigger === 'ALV I_CALLBACK_USER_COMMAND'
    && ctx.region.kind === 'entry' && ctx.container?.toUpperCase() === c.label.toUpperCase());
  if (!callback) return false;
  const block = w.input.routineBlocks.get(callback.key);
  const opener = block ? w.input.statements[block.openIndex]?.text ?? '' : '';
  const first = /^FORM\s+[\w/]+\s+USING\s+(?:VALUE\s*\(\s*)?([\w/]+)/i.exec(opener)?.[1];
  return !!first && first.toUpperCase() === selector;
}

export function walkBranch(w: Walker, block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
  const branch = w.input.branchAt.get(block.openIndex);
  const opener = w.input.statements[block.openIndex];
  if (!branch) {
    // 2.1 refused to read this construct (a chained IF, a macro body). The
    // skeleton refuses the gateway too and walks the body as a sequence, so
    // nothing inside it is lost. Its arms cannot be told apart, so nothing
    // registered inside it counts, not even later in the same body:
    // registrations are kept frozen while it is walked.
    const registered = w.state.registeredInWalk;
    w.state.registrationFrozen += 1;
    const walked = w.range(block.openIndex + 1, block.closeIndex - 1, ctx, incoming);
    w.state.registrationFrozen -= 1;
    w.state.registeredInWalk = registered;
    return walked;
  }

  const label = branch.kind === 'case' ? (branch.selector ?? 'CASE') : snippet(opener.text);
  // D2: `IF lo->m( ) = …` runs the method before it decides.
  const before = walkMethodCalls(w, opener, ctx, incoming);
  // Roadmap 3.0.7 (e): arms that do nothing but set one field are a
  // classification — `detail.decisionTable` names the field, so a view can
  // draw the gateway as one business-rule task with its table
  // (`decision-table.ts`; the rows are in the rule set). The node keeps its
  // kind and its arms: the process benchmark's blind expected answers model
  // all 7 such tables of its learning half (6 cases) as a gateway.
  const table = readDecisionTable(branch, w.input.statements);
  const gateway = w.graph.addNode('gateway', label, anchorOf(opener), ctx.region, ctx.container, {
    detail: {
      branchId: branch.id, branchKind: branch.kind, arms: branch.arms.length,
      ...(decidesUserCommand(w, branch, ctx) ? { userAction: true } : {}),
      ...(table ? { decisionTable: table.field } : {}),
    },
  });
  w.graph.connect(before, gateway.id);

  const exits: Exit[] = [];
  let hasDefault = false;
  // The arms exclude each other. Each starts from what was registered
  // before the branch; what one arm registers holds for the rest of that arm
  // only (`walkRange` restores the state before the block once all arms are
  // walked).
  const registered = new Set(w.state.registeredInWalk);
  for (let a = 0; a < branch.arms.length; a++) {
    w.state.registeredInWalk = new Set(registered);
    const arm = branch.arms[a];
    const next = branch.arms[a + 1];
    const bodyFrom = arm.headerIndex + 1;
    const bodyTo = (next ? next.headerIndex : block.closeIndex) - 1;
    const isDefault = arm.kind === 'else' || arm.kind === 'when-others';
    if (isDefault) hasDefault = true;
    const armEntry: Exit = {
      from: gateway.id,
      condition: arm.condition,
      kind: isDefault ? 'default' : 'conditional',
    };
    const before = w.graph.nodes.length;
    const edgesBefore = w.graph.edges.length;
    let armExits = w.range(bodyFrom, bodyTo, ctx, [armEntry]);
    if (w.readings.reads310 && !table) armExits = armOutcome(w, armEntry, armExits, before, edgesBefore, bodyFrom, bodyTo, block, ctx);
    exits.push(...armExits);
  }
  // No ELSE and no WHEN OTHERS: the gateway itself is the way past it.
  if (!hasDefault) exits.push({ from: gateway.id, condition: '', kind: 'default' });
  return exits;
}

/**
 * Engine 3.1.0 — what an arm that drew no step does is the outcome of its decision.
 *
 * Two shapes, and nothing else is touched:
 *
 * - **The arm drew nothing.** Its way out is still the way in. A call of a technical helper in it
 *   (`helperStep`: `PERFORM add_issue USING … 'Postal code has the wrong length'`) is what the arm does —
 *   without it both ways out of "Postal code length wrong?" ran to the same next step and the decision looked
 *   as if it decided nothing. Failing that, a flag a later decision reads (`flagStep`).
 * - **The arm drew only its own end** (`PERFORM add_message USING 'E' …. RETURN.`): the helper call goes
 *   between the decision and that end, so the stop says what it recorded on the way out.
 *
 * A `CONTINUE`, `EXIT` or `CHECK` in the arm changes its way out, and such an arm is left as it is.
 */
function armOutcome(
  w: Walker,
  entry: Exit,
  exits: Exit[],
  nodesBefore: number,
  edgesBefore: number,
  from: number,
  to: number,
  block: Block,
  ctx: WalkContext,
): Exit[] {
  const drawn = w.graph.nodes.slice(nodesBefore);
  if (drawn.length === 0) {
    const untouched = w.graph.edges.length === edgesBefore && exits.length === 1 && exits[0].from === entry.from
      && exits[0].kind === entry.kind && exits[0].condition === entry.condition;
    if (!untouched) return exits;
    const step = helperStep(w, from, to, block, ctx) ?? collectStep(w, from, to, block, ctx)
      ?? flagStep(w, from, to, block, ctx);
    if (!step) return exits;
    w.graph.connect(exits, step.id);
    return [{ from: step.id, condition: '', kind: 'sequence' }];
  }
  if (drawn.length !== 1 || (drawn[0].kind !== 'end' && drawn[0].kind !== 'end-error')) return exits;
  const into = w.graph.edges.slice(edgesBefore).filter((e) => e.to === drawn[0].id);
  if (into.length !== 1 || into[0].from !== entry.from || w.graph.edges.length !== edgesBefore + 1) return exits;
  const step = helperStep(w, from, to, block, ctx);
  if (!step) return exits;
  // The step was appended after the end; it goes before it, so the file lists the arm in reading order.
  w.graph.nodes.pop();
  w.graph.nodes.splice(nodesBefore, 0, step);
  into[0].to = step.id;
  w.graph.edges.push({ from: step.id, to: drawn[0].id, kind: 'sequence', condition: '' });
  return exits;
}

/**
 * Engine 3.1.0 (`armOutcome`): the first call, standing directly in this arm, of a routine folded as a
 * technical helper — drawn as one task, named after the routine as the call writes it (rule 6), with the
 * routine's range as the secondary anchor and the program's own sentences the call passes in `detail`.
 */
function helperStep(w: Walker, from: number, to: number, block: Block, ctx: WalkContext): SkeletonNode | null {
  for (let i = from; i <= to; i++) {
    const statement = w.input.statements[i];
    if (!statement || statement.nativeSql) continue;
    const around = w.input.structure.enclosing[i] ?? [];
    if (around[around.length - 1] !== block) continue;
    let key: string | null = null;
    let label = '';
    let token = 1;
    if (statement.keyword === 'PERFORM') {
      const call = w.input.calls.performs.find((p) => p.lineStart === statement.lineStart && p.text === statement.text);
      if (call?.target && !call.program && w.input.helpers.has(call.target)) { key = call.target; label = call.target; }
    } else {
      const call = w.input.dispatch.methodCallsIn(statement).find((c) => c.standalone && c.key && w.input.helpers.has(c.key));
      if (call?.key) { key = call.key; label = call.label; token = w.input.readers.callToken(statement, call); }
    }
    if (!key) continue;
    const routine = w.input.routineBlocks.get(key);
    const texts = [...statement.text.matchAll(/'((?:[^']|'')*)'|`((?:[^`]|``)*)`/g)]
      .map((m) => (m[1] ?? m[2] ?? '').replace(/''/g, "'").trim())
      .filter((text) => /[A-Za-z]{2}/.test(text) && text.includes(' '));
    return w.graph.addNode('task', label, {
      ...anchorOf(statement, token),
      ...(routine ? { secondary: { lineStart: routine.lineStart, lineEnd: routine.lineEnd, reason: 'routine-definition' as const } } : {}),
    }, ctx.region, ctx.container, {
      detail: { helperCall: true, routine: key, ...(texts.length ? { programTexts: texts } : {}) },
    });
  }
  return null;
}

/**
 * Engine 3.1.0 (`armOutcome`): the first row added, directly in this arm, to an internal table —
 * `IF deviation > tolerance. … APPEND gs_line TO gt_report. ENDIF.` The decision is "does this row belong in the
 * result?", and the append is its yes. Drawn as the plain step a change to an internal table already is since
 * 3.0.7 (`MODIFY gt_out …`): a task named after the table, `detail.operation`, `internalTable` and `collects`.
 *
 * Only a table that outlives the routine: a global one, or a parameter the routine hands back. A table the
 * routine declares for itself (`DATA lt_keys …`) is scaffolding for the routine's next step, which says what
 * it does with it.
 */
function collectStep(w: Walker, from: number, to: number, block: Block, ctx: WalkContext): SkeletonNode | null {
  for (let i = from; i <= to; i++) {
    const statement = w.input.statements[i];
    if (!statement || statement.nativeSql) continue;
    const around = w.input.structure.enclosing[i] ?? [];
    if (around[around.length - 1] !== block) continue;
    const bare = maskLiterals(statement.text);
    if (!BUILDS_TABLE.test(bare)) continue;
    const table = COLLECT_TARGET.exec(bare)?.[1];
    if (!table || table.startsWith('<')) continue;
    // A message row (`msgty`, `msgno`, `type` with `message`) goes into a log, not into the result.
    if (MESSAGE_ROW.test(bare)) continue;
    const routine = [...around].reverse().find((b) => b.kind === 'form' || b.kind === 'method');
    if (routine && w.input.readers.declaresLocally(routine, table)) continue;
    return w.graph.addNode('task', table.toUpperCase(),
      anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${table}(?:\\[\\])?\\.?$`, 'i'))),
      ctx.region, ctx.container, {
        detail: { operation: statement.keyword, internalTable: true, collects: true },
      });
  }
  return null;
}

/**
 * Engine 3.1.0 — an arm that only sets a flag is the outcome of its decision.
 *
 * `ELSE. gv_approved = abap_true. ENDIF. … IF gv_approved = abap_true. PERFORM create_order.` The arm draws
 * nothing — an assignment is no element of §5.8 — so the map showed the third way out of the decision as an
 * empty flow, and a reader could not see that this way *approves*. What the arm does is decide the later
 * question in advance. So where an arm draws nothing at all and one of its statements sets a field to a
 * value (a literal, a constant, `abap_true`) that the condition of **another** decision of this source reads,
 * that assignment is a step of its own: a task on the assignment's line, labelled with the statement as
 * written (rule 6), the field and its value in `detail`, and the program's own words assigned in the same
 * arm (`gv_message = '…'`) beside them, so a view can say the outcome in the program's text.
 *
 * Not for a field no decision reads (a message text alone stays an assignment), not for an arm that draws
 * anything (its steps already say what it does), and not for a decision table — arms that each set the same
 * field are drawn as one classification (`readDecisionTable`).
 */
function flagStep(w: Walker, from: number, to: number, block: Block, ctx: WalkContext): SkeletonNode | null {
  const flags: Array<{ field: string; value: string; statement: AbapStatement }> = [];
  const texts: string[] = [];
  for (let i = from; i <= to; i++) {
    const statement = w.input.statements[i];
    if (!statement || statement.nativeSql) continue;
    const m = FLAG_ASSIGNMENT.exec(statement.text.trim());
    if (!m) continue;
    const [, field, value] = m;
    // A copy of another variable (`lv_eur = iv_amount`) carries a value along; it does not settle a question.
    if (/^[\w/]+$/.test(value) && !/^-?\d+$/.test(value) && !BUILT_IN_FLAG_VALUES.has(value.toUpperCase())
      && !w.input.readers.constantNames().has(value.toUpperCase())) continue;
    if (value.startsWith("'") || value.startsWith('`')) {
      const text = value.slice(1, -1).replace(/''/g, "'").trim();
      if (/[A-Za-z]{2}/.test(text) && text.includes(' ')) texts.push(text);
    }
    if (w.input.readers.decisionsReading(field, block).length) flags.push({ field, value, statement });
  }
  if (!flags.length) return null;
  const first = flags[0];
  const readAt = w.input.readers.decisionsReading(first.field, block);
  return w.graph.addNode('task', snippet(first.statement.text), anchorOf(first.statement), ctx.region, ctx.container, {
    detail: {
      flagStep: true,
      flag: first.field.toUpperCase(),
      value: first.value,
      ...(flags.length > 1 ? { flags: flags.map((f) => f.field.toUpperCase()) } : {}),
      readAtLines: readAt.map((line) => String(line)),
      ...(texts.length ? { programTexts: texts } : {}),
    },
  });
}

/**
 * `AT NEW kunnr … ENDAT` — a group change inside a `LOOP`.
 *
 * 2.1 leaves it to the skeleton deliberately (`control-flow.ts`): it is not a
 * branch, it is a condition on the iteration. It is an exclusive gateway whose
 * condition is the words the source uses, and whose other way round is the
 * iteration that is not the first of its group — not a loop, which is what
 * reading `AT` as an opener without looking at it makes of it.
 */
export function walkGroupChange(w: Walker, block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
  const opener = w.input.statements[block.openIndex];
  const condition = afterKeyword(opener);
  const gateway = w.graph.addNode('gateway', snippet(opener.text), anchorOf(opener),
    ctx.region, ctx.container, { detail: { source: 'AT', condition } });
  w.graph.connect(incoming, gateway.id);
  const body = w.range(block.openIndex + 1, block.closeIndex - 1, ctx,
    [{ from: gateway.id, condition, kind: 'conditional' }]);
  return [...body, { from: gateway.id, condition: '', kind: 'default' }];
}

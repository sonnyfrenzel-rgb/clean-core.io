import { maskLiterals, type AbapStatement } from '../../statement-reader';
import { databaseWriteIn } from '../../open-sql-discrimination';
import type { FormEffect, NodeAnchor, SkeletonNode, SkeletonNodeKind } from '../../process-skeleton';
import { anchorOf, tokenIndexOf } from '../anchors';
import type { MethodCall } from '../dispatch';
import { isInternalWrite } from '../effects';
import type { Exit } from '../graph';
import { functionTaskKind, isErrorMessage, isFileOutput, isInfoMessage, isListOutput, selectTables } from '../recognisers';
import { recordCallback } from './callbacks';
import { markReached, readLaneEvidence } from './records';
import type { WalkContext, Walker } from './walker';

/**
 * The call walkers — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3").
 *
 * `PERFORM`, method calls (D2) and their alternatives (AB-15b), `CALL FUNCTION`, `CALL BADI` and
 * `CALL CUSTOMER-FUNCTION`, macro calls. Rule 3 holds for all of them: a call this source can follow opens the
 * routine's region (`w.routineRegion`, the recursion back into the walk), one it cannot is opaque, and the caller
 * goes on after it. Moved out of `SkeletonBuilder` unchanged.
 */

/**
 * Engine 3.2.0 (AB-15b): the most implementations a call draws as alternatives where it stands
 * (`drawsAlternatives`). A call that can reach more is the opaque call naming its candidates. A design bound, not a
 * measured one: no call of the benchmark's learning halves reaches more than three.
 */
const MAX_ALTERNATIVES = 4;

/**
 * Rule 3. A `PERFORM` this source can follow opens a sub-process; one it
 * cannot is a `call-opaque` node — and the caller carries on after it, because
 * the routine returns.
 */
export function walkPerform(w: Walker, statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
  const call = w.input.calls.performs.find(
    (p) => p.lineStart === statement.lineStart && p.text === statement.text,
  );
  const target = call?.target;
  const local = target && !call?.program && w.input.formBlocks.has(target);

  if (!local) {
    const node = w.graph.addNode('call-opaque',
      target ?? call?.text ?? 'PERFORM', anchorOf(statement, 1), ctx.region, ctx.container, {
        detail: {
          dynamic: call?.dynamic ?? false,
          ...(call?.program ? { program: call.program } : {}),
          // The source of the routine is not here. The flow still returns.
          returns: true,
        },
      });
    w.graph.connect(incoming, node.id);
    return { exits: [{ from: node.id, condition: '', kind: 'sequence' }] };
  }

  return { exits: callRoutine(w, target, target, anchorOf(statement, 1), ctx, incoming) };
}

/**
 * A call into a routine of this source — a `PERFORM` on a local form, or
 * since D2 a call on a method this source implements. One behaviour for both,
 * because §5.8 names them in one breath ("a `FORM`/method with an effect of its
 * own"): a routine without an effect of its own is folded into its caller
 * (technical helper), one with an effect opens a sub-process, a small one is
 * collapsed afterwards (`collapseSmallRegions`), and recursion stops at the
 * region already being built.
 */
export function callRoutine(
  w: Walker,
  key: string,
  label: string,
  at: NodeAnchor,
  ctx: WalkContext,
  incoming: Exit[],
  extra: Record<string, string | number | boolean | string[]> = {},
): Exit[] {
  markReached(w, key);
  if (w.input.helpers.has(key)) {
    // §5.8: a routine without an effect of its own is part of its caller.
    return incoming;
  }

  const region = w.routineRegion(key);
  const block = w.input.routineBlocks.get(key);
  const effects = w.input.effects.get(key) ?? new Set<FormEffect>();
  const onlyRule = effects.size === 1 && effects.has('business-rule');
  // Rule 2: the anchor of the call is the call, not the routine. The routine's
  // own range travels alongside it as the secondary one, so a reader can jump
  // to the definition without the node pretending to live there.
  const anchor: NodeAnchor = {
    ...at,
    ...(block
      ? { secondary: { lineStart: block.lineStart, lineEnd: block.lineEnd, reason: 'routine-definition' as const } }
      : {}),
  };
  const node = w.graph.addNode(onlyRule ? 'business-rule-task' : 'sub-process', label,
    anchor, ctx.region, ctx.container, {
      ...(region ? { expandsTo: region.key } : {}),
      detail: { effects: [...effects], ...extra },
    });
  w.graph.connect(incoming, node.id);
  return [{ from: node.id, condition: '', kind: 'sequence' }];
}

/**
 * D2 — the method calls of one statement.
 *
 * §5.8 draws "a `FORM`/method with an effect of its own" as a collapsed
 * sub-process, and until 27.09.2026 `CALL METHOD`, `x->m( … ).` and their
 * relatives fell into the branch for moves and calculations: no node at all.
 * Three cases, and where the line between them runs:
 *
 * - **The statement is the call** (`CALL METHOD …`, `lo->m( … ).`): a method
 *   this source implements opens a sub-process exactly like a `PERFORM` on a
 *   local form; one it does not implement — or cannot pick, because two
 *   classes implement the name and the call does not say which — is a
 *   `call-opaque` node that returns, exactly like a `PERFORM` into another
 *   program. A statement that consists of a call exists only for what the
 *   call does, so it is drawn even when the reader cannot see inside.
 * - **The call is an operand** (`lv = lo->m( )`, `IF lo->m( ) = …`): drawn only
 *   when the method is implemented here **and has an effect of its own**,
 *   as a sub-process before the statement, because it runs before the value
 *   is used. An operand the reader cannot see into is overwhelmingly a getter
 *   or a conversion — drawing every one of them would bury the process in
 *   boxes that say nothing, and the statement around it is still what it was.
 * - **A constructor** (`NEW cls( )`, `CREATE OBJECT`) is an operand of that
 *   kind: nothing unless this source implements `constructor` with an effect
 *   of its own — then that effect happens here, and hiding it would lose a
 *   read or a write the program does.
 *
 * A method body reached this way is not also an entry (`methodEntries`).
 */
export function walkMethodCalls(w: Walker, statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): Exit[] {
  let live = incoming;
  for (const call of w.input.dispatch.methodCallsIn(statement)) {
    const at = anchorOf(statement, w.input.readers.callToken(statement, call));
    if (call.key && w.input.routineBlocks.has(call.key)) {
      if (!call.standalone && w.input.helpers.has(call.key)) {
        markReached(w, call.key);
        continue;
      }
      const impl = w.input.methodImpls.find((m) => m.key === call.key);
      live = callRoutine(w, call.key, impl?.name ?? call.name, at, ctx, live, {
        method: true,
        ...(impl ? { class: impl.cls } : {}),
        ...(call.constructor ? { constructor: true } : {}),
      });
      continue;
    }
    if (!call.standalone) continue;
    if (drawsAlternatives(w, call)) {
      live = walkAlternatives(w, call, at, ctx, live);
      continue;
    }
    if (call.dynamic) {
      w.graph.note('dynamic-call', statement,
        'The name of the method is computed at run time. The call is drawn, its target is not claimed.');
    }
    // Engine 3.2.0: the candidates of this call run inside it, with what is registered here.
    if (w.readings.reads320 && call.ambiguous) w.state.registrationsAtCall.set(statement.index, new Set(w.state.registeredInWalk));
    const node = w.graph.addNode('call-opaque', call.label, at, ctx.region, ctx.container, {
      detail: {
        method: true,
        dynamic: call.dynamic,
        ...(call.ambiguous ? { ambiguous: true } : {}),
        // Engine 3.2.0: which implementations the call can reach — each is drawn as a beginning of its own.
        ...(w.readings.reads320 && call.candidates.length ? { candidates: call.candidates } : {}),
        // The source of the method is not here, or not one of several. The
        // flow still returns.
        returns: true,
      },
    });
    w.graph.connect(live, node.id);
    live = [{ from: node.id, condition: '', kind: 'sequence' }];
  }
  return live;
}

/**
 * Engine 3.2.0 (AB-15b): does the walk draw this call's implementations as alternatives where the call stands? A
 * call that can reach two to `MAX_ALTERNATIVES` implementations the program defines does. One that can reach more
 * stays the opaque call that names its candidates — a candidate set that wide would flood the map at the call;
 * each candidate is a beginning of its own either way (`candidateEntries`).
 */
export function drawsAlternatives(w: Walker, call: MethodCall): boolean {
  return w.readings.reads320 && call.ambiguous && call.typed && !call.dynamic && call.candidates.length >= 2
    && call.candidates.length <= MAX_ALTERNATIVES && call.candidates.every((key) => w.input.routineBlocks.has(key));
}

/**
 * Engine 3.2.0 (AB-15b): a call with several implementations the program defines, drawn as its alternatives.
 * Which one runs is decided at run time by the class of the object, and the source does not say (D2: never a
 * guess) — so the call is an exclusive gateway named as the call, with one arm per implementation, conditioned on
 * its class. Each arm is a call activity into that implementation, which stays drawn where it was before: as a
 * beginning of its own (`candidateEntries`, trigger `candidate of …`) or as the sub-process of a call that reaches
 * it for certain. The arms meet after the call. Before AB-15b the call was one opaque node and the reader had to
 * find its implementations among the beginnings.
 */
export function walkAlternatives(w: Walker, call: MethodCall, at: NodeAnchor, ctx: WalkContext, incoming: Exit[]): Exit[] {
  // The candidates run inside this call, with what is registered here (as for the opaque call).
  w.state.registrationsAtCall.set(at.statementIndex, new Set(w.state.registeredInWalk));
  const gateway = w.graph.addNode('gateway', call.label, at, ctx.region, ctx.container, {
    detail: { method: true, alternatives: call.candidates.length, ambiguous: true, candidates: call.candidates },
  });
  w.graph.connect(incoming, gateway.id);
  const exits: Exit[] = [];
  for (const key of call.candidates) {
    const impl = w.input.methodImpls.find((m) => m.key === key);
    const block = w.input.routineBlocks.get(key);
    const anchor: NodeAnchor = {
      ...at,
      ...(block ? { secondary: { lineStart: block.lineStart, lineEnd: block.lineEnd, reason: 'routine-definition' as const } } : {}),
    };
    const node = w.graph.addNode('call-activity', key, anchor, ctx.region, ctx.container, {
      detail: { method: true, alternativeOf: call.label, implementation: key, ...(impl ? { class: impl.cls } : {}) },
    });
    w.graph.connect([{ from: gateway.id, condition: impl?.cls ?? key, kind: 'conditional' }], node.id);
    exits.push({ from: node.id, condition: '', kind: 'sequence' });
  }
  return exits;
}

/**
 * `CALL FUNCTION` — a service, send, user or file task by the module it names,
 * plus §5.8's error boundary when the call declares `EXCEPTIONS` and the code
 * right after it branches on `sy-subrc`.
 *
 * Rule 7 in one statement: those are two nodes on the same lines, told apart
 * by their slot and by the token the anchor points at.
 */
export function walkFunction(w: Walker, statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
  const call = w.input.calls.functionModules.find(
    (f) => f.lineStart === statement.lineStart && f.text === statement.text,
  );
  const kind = functionTaskKind(call?.name);
  const label = call?.name
    ?? /^CALL\s+FUNCTION\s+([\w/-]+)/i.exec(statement.text)?.[1]?.toUpperCase()
    ?? 'CALL FUNCTION';
  const node = w.graph.addNode(kind, label, anchorOf(statement, 2), ctx.region, ctx.container, {
    detail: {
      bapi: call?.bapi ?? false,
      dynamic: call?.dynamic ?? false,
      ...(call?.destination ? { destination: call.destination } : {}),
      inUpdateTask: call?.inUpdateTask ?? false,
      startingNewTask: call?.startingNewTask ?? false,
      // Rule 3: a synchronous RFC comes back. Only an asynchronous one does not
      // hold the caller, and it still returns to the next statement.
      returns: true,
    },
  });
  w.graph.connect(incoming, node.id);
  readLaneEvidence(w, statement, kind, label, call?.destination);
  recordCallback(w, statement);
  const exits: Exit[] = [{ from: node.id, condition: '', kind: 'sequence' }];

  if (/\bEXCEPTIONS\b/i.test(statement.text) && w.input.readers.handlesSubrcAfter(statement.index)) {
    const boundary = w.graph.addNode('error-boundary', label,
      anchorOf(statement, tokenIndexOf(statement, /^EXCEPTIONS$/i)), ctx.region, ctx.container, {
        detail: { attachedTo: node.id, exceptions: w.input.readers.exceptionNames(statement.text) },
      });
    w.graph.edges.push({ from: node.id, to: boundary.id, kind: 'boundary', condition: '' });
    exits.push({ from: boundary.id, condition: '', kind: 'sequence' });
  }
  return { exits };
}

/**
 * Engine 3.2.0 — `CALL BADI lo_badi->method …` and `CALL CUSTOMER-FUNCTION '001' …`: a call into an enhancement
 * outside this source. `CALL BADI` runs every active implementation of the BAdI method — which ones is configured
 * in the system, not written here; `CALL CUSTOMER-FUNCTION 'nnn'` runs the customer exit `EXIT_<program>_nnn` when
 * an enhancement project activates it. Both return. Drawn as a service task, exactly as a `CALL FUNCTION` whose
 * module is not in this source is (the statement reveals the kind — a service another unit performs — and the
 * implementation is elsewhere; `detail.enhancement` says which kind of enhancement). Before 3.2.0 neither drew
 * anything, and a check or a posting the program delegates to its enhancement was missing from the map.
 * `EXCEPTIONS` with a `sy-subrc` check right after it hangs the error boundary on the call, as on a function call.
 */
export function walkEnhancementCall(w: Walker, statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
  const badi = /^CALL\s+BADI\s+([\w/]+|<[\w/]+>)->([\w/~]+)/i.exec(maskLiterals(statement.text));
  const exit = /^CALL\s+CUSTOMER-FUNCTION\s+'(\d+)'/i.exec(statement.text);
  const label = badi ? `${badi[1]}->${badi[2]}`.toUpperCase() : exit ? `CUSTOMER-FUNCTION ${exit[1]}` : statement.keyword;
  const node = w.graph.addNode('service-task', label, anchorOf(statement, 2), ctx.region, ctx.container, {
    detail: { enhancement: badi ? 'badi' : 'customer-function', ...(badi ? { method: true } : {}), returns: true },
  });
  w.graph.connect(incoming, node.id);
  const exits: Exit[] = [{ from: node.id, condition: '', kind: 'sequence' }];
  if (/\bEXCEPTIONS\b/i.test(statement.text) && w.input.readers.handlesSubrcAfter(statement.index)) {
    const boundary = w.graph.addNode('error-boundary', label,
      anchorOf(statement, tokenIndexOf(statement, /^EXCEPTIONS$/i)), ctx.region, ctx.container, {
        detail: { attachedTo: node.id, exceptions: w.input.readers.exceptionNames(statement.text) },
      });
    w.graph.edges.push({ from: node.id, to: boundary.id, kind: 'boundary', condition: '' });
    exits.push({ from: boundary.id, condition: '', kind: 'sequence' });
  }
  return { exits };
}

/**
 * Rule 2. A macro takes effect where it is used, not where it is written.
 *
 * The body is expanded by the compiler, so every node it produces is anchored
 * at the **call site**; the line range inside the `DEFINE` travels as a
 * secondary anchor. Only the leaf effects of the body are read — a branch
 * inside a macro is what 2.1 already refuses to draw, and drawing a gateway
 * whose condition contains `&1` would be inventing the argument.
 */
export function walkMacroCall(w: Walker, statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
  const macro = w.input.macros.get(statement.keyword);
  if (!macro) return { exits: incoming };
  w.graph.note('macro-call', statement,
    `The body of macro ${statement.keyword} is expanded here by the compiler. Its effects are anchored at this call site; the definition is a secondary range.`);

  let live = incoming;
  for (let i = macro.block.openIndex + 1; i < macro.block.closeIndex; i++) {
    const body = w.input.statements[i];
    const node = macroEffectNode(w, body, statement, ctx);
    if (!node) continue;
    w.graph.connect(live, node.id);
    live = [{ from: node.id, condition: '', kind: 'sequence' }];
  }
  return { exits: live };
}

export function macroEffectNode(
  w: Walker,
  body: AbapStatement,
  site: AbapStatement,
  ctx: WalkContext,
): SkeletonNode | null {
  const at = (kind: SkeletonNodeKind, label: string, detail?: SkeletonNode['detail']) =>
    w.graph.addNode(kind, label, {
      ...anchorOf(site),
      secondary: { lineStart: body.lineStart, lineEnd: body.lineEnd, reason: 'macro-definition' },
    }, ctx.region, ctx.container, { detail: { ...(detail ?? {}), fromMacro: site.keyword } });

  const write = databaseWriteIn(body.text);
  if (write && isInternalWrite(w.input.localData, write)) {
    return at('task', write.table.toUpperCase(), { operation: write.keyword, internalTable: true });
  }
  if (write) return at('write', write.table.toUpperCase(), { operation: write.keyword });
  if (body.keyword === 'SELECT') {
    const tables = selectTables(body.text);
    if (tables.length) return at('read', tables[0], { tables });
  }
  const fm = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(body.text);
  if (fm) {
    const name = fm[1].toUpperCase();
    return at(functionTaskKind(name), name);
  }
  if (isErrorMessage(body.text, w.readings.reads320)) return at('end-error', w.input.readers.errorLabel(body));
  if (isInfoMessage(body.text, w.readings.reads320)) return at('user-task', w.input.readers.errorLabel(body), { message: 'I' });
  if (isListOutput(body) || isFileOutput(body)) {
    return at('output', body.keyword, { statements: 1, target: isFileOutput(body) ? 'file' : 'list' });
  }
  return null;
}

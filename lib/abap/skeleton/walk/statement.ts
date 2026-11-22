import { afterKeyword, type AbapStatement } from '../../statement-reader';
import { databaseWriteIn } from '../../open-sql-discrimination';
import type { SkeletonEdgeKind, SkeletonEdgeReason, SkeletonNode } from '../../process-skeleton';
import { anchorOf, snippet, tokenIndexOf } from '../anchors';
import { isInternalWrite } from '../effects';
import type { Exit } from '../graph';
import { DECLARATIVE } from '../keywords';
import {
  AMDP_METHOD,
  ENHANCEMENT_CALL,
  adbcExecution,
  amdpTables,
  closesDataset,
  datasetOf,
  isEmbeddedSelect,
  isErrorMessage,
  isFileOutput,
  isInfoMessage,
  isListOutput,
  isRaiseEvent,
  raisesException,
  receivesResults,
  selectTables,
} from '../recognisers';
import { leavesDialogStep } from '../statement-readers';
import { callRoutine, walkEnhancementCall, walkFunction, walkMacroCall, walkMethodCalls, walkPerform } from './calls';
import { handlersRaisedBy, recordHandlerRegistration } from './callbacks';
import { recordEvidence } from './records';
import type { WalkContext, Walker } from './walker';

/**
 * One statement of the walk — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3").
 *
 * `walkStatement` decides what one statement that opens no block draws: rule 5 (`CHECK`, `CONTINUE`, `EXIT` and
 * their three targets), rule 3 (what comes back and what does not), reads, writes, outputs, user tasks, and hands
 * calls to `walk/calls.ts`. The early ends of ADR-054 (`leaveEarly`) are recorded here for `settleEarlyEnds`. Moved
 * out of `SkeletonBuilder` unchanged; the order of the tests is the order they had there, and it decides.
 */

function batchInputDetail(w: Walker, index: number): Record<string, string[]> {
  const call = w.input.batchInput.get(index);
  if (!call) return {};
  return {
    ...(call.screens.length ? { batchInputScreens: call.screens.map((s) => `${s.program} ${s.screen}`) } : {}),
    ...(call.fields.length ? { batchInputFields: [...new Set(call.fields.map((f) => f.raw))] } : {}),
  };
}

export function walkStatement(
  w: Walker,
  statement: AbapStatement,
  ctx: WalkContext,
  incoming: Exit[],
  outputRun: SkeletonNode | null,
): { exits: Exit[]; outputRun: SkeletonNode | null } {
  const text = statement.text;
  const keep = (node: SkeletonNode): { exits: Exit[]; outputRun: null } => {
    w.graph.connect(incoming, node.id);
    return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: null };
  };

  if (statement.nativeSql) {
    // ADR-066. The body of an AMDP method (`METHOD m BY DATABASE PROCEDURE
    // … USING mseg.`) is one native statement that runs on the database —
    // one read step, of the database objects its USING clause names. What
    // the SQLScript does in detail is not read and not claimed.
    const opener = w.input.statements[statement.index - 1];
    const amdp = opener && AMDP_METHOD.exec(opener.text);
    if (!amdp) return { exits: incoming, outputRun: null };
    const tables = amdpTables(opener.text);
    // Without USING it touches no dictionary object, only what it is handed:
    // work done by the database, not a read of it.
    return keep(tables.length
      ? w.graph.addNode('read', tables[0], anchorOf(statement), ctx.region, ctx.container,
        { detail: { tables, amdp: true } })
      : w.graph.addNode('service-task', amdp[1].toUpperCase(), anchorOf(statement), ctx.region, ctx.container,
        { detail: { amdp: true, returns: true } }));
  }
  if (DECLARATIVE.has(statement.keyword)) {
    // `DATA(x) = lo->m( ).` declares and assigns in one: the assignment runs,
    // and with it the call on its right (D2).
    if (/^(?:DATA|FINAL)\(/i.test(text)) {
      return { exits: walkMethodCalls(w, statement, ctx, incoming), outputRun: null };
    }
    return { exits: incoming, outputRun: null };
  }

  // D2: `check( ).` or `exit( ).` inside a class is a call on a method of
  // that name, and must not be read as the keyword it spells.
  if (/^[\w/~]+\(/.test(text) && !/^(?:DATA|FINAL)\(/i.test(text)) {
    return { exits: walkMethodCalls(w, statement, ctx, incoming), outputRun: null };
  }

  /* Rule 5 — one keyword, three targets. */
  if (statement.keyword === 'CHECK') return { ...walkCheck(w, statement, ctx, incoming), outputRun: null };
  if (statement.keyword === 'CONTINUE' && ctx.loops.length) {
    leaveTo(w, incoming, ctx.loops[ctx.loops.length - 1], 'loop-back', 'continue-loop');
    return { exits: [], outputRun: null };
  }
  if (statement.keyword === 'EXIT' && ctx.loops.length) {
    ctx.loopBreaks[ctx.loopBreaks.length - 1].push(...incoming.map((e) => ({ ...e, reason: 'exit-loop' as const })));
    return { exits: [], outputRun: null };
  }
  if (statement.keyword === 'RETURN' || statement.keyword === 'EXIT' || statement.keyword === 'STOP') {
    const reason: SkeletonEdgeReason = statement.keyword === 'STOP' ? 'stop' : 'return';
    // ADR-054: each flow keeps the kind it arrived with — a `RETURN` straight
    // in an `IF` arm is that arm, conditional, with the condition on it.
    leaveEarly(w, statement, incoming, ctx, null, reason);
    return { exits: [], outputRun: null };
  }
  const leaving = leavesDialogStep(text);
  if (leaving) {
    // The dialog step ends here, from inside a loop or not — like `RETURN`.
    leaveEarly(w, statement, incoming, ctx, null, 'leave-screen', leaving);
    return { exits: [], outputRun: null };
  }

  /* Rule 3 — what comes back, and what does not. */
  if (statement.keyword === 'SUBMIT') {
    const returns = /\bAND\s+RETURN\b/i.test(text) || /\bVIA\s+JOB\b/i.test(text);
    const program = /^SUBMIT\s+(?:\(\s*([\w/]+)\s*\)|'([^']*)'|([\w/]+))/i.exec(text);
    const node = w.graph.addNode('call-activity',
      (program?.[2] ?? program?.[3] ?? program?.[1] ?? 'SUBMIT').toUpperCase(),
      anchorOf(statement, 1), ctx.region, ctx.container, {
        detail: { returns, viaJob: /\bVIA\s+JOB\b/i.test(text), dynamic: Boolean(program?.[1]) },
      });
    // 2.16: `VIA JOB` hands the run to a batch work process — a system, not a
    // person. The token is the two words the source writes.
    if (/\bVIA\s+JOB\b/i.test(text)) {
      recordEvidence(w, 'system', 'VIA JOB',
        anchorOf(statement, tokenIndexOf(statement, /^VIA$/i)), statement);
    }
    w.graph.connect(incoming, node.id);
    if (returns) return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: null };
    w.graph.edges.push({ from: node.id, to: ctx.region.endNodeId, kind: 'sequence', condition: '', reason: 'no-return' });
    return { exits: [], outputRun: null };
  }
  if (/^LEAVE\s+TO\s+TRANSACTION\b/i.test(text)) {
    const code = /TRANSACTION\s+'([^']*)'/i.exec(text)?.[1]?.toUpperCase();
    const node = w.graph.addNode('call-activity', code ?? 'LEAVE TO TRANSACTION',
      anchorOf(statement), ctx.region, ctx.container, { detail: { returns: false } });
    w.graph.connect(incoming, node.id);
    w.graph.edges.push({ from: node.id, to: ctx.region.endNodeId, kind: 'sequence', condition: '', reason: 'no-return' });
    return { exits: [], outputRun: null };
  }
  if (/^LEAVE\s+PROGRAM\b/i.test(text) || isErrorMessage(text, w.readings.reads320) || raisesException(statement)) {
    const node = w.graph.addNode('end-error', w.input.readers.errorLabel(statement), anchorOf(statement),
      ctx.region, ctx.container);
    w.graph.connect(incoming, node.id);
    return { exits: [], outputRun: null };
  }
  if (isRaiseEvent(text)) {
    // Rule 3: the handlers `SET HANDLER` registered are called and return.
    // Who they are is decided at run time, so the call stays opaque; the
    // label is the event's name, a token of the statement (rule 6).
    const event = /^RAISE\s+EVENT\s+([\w/~]+)/i.exec(text)?.[1]?.toUpperCase() ?? 'RAISE EVENT';
    // Unless the source binds them (`readEventHandlers`): then the event
    // runs those methods here, one after the other, and each is drawn as a
    // call on it would be — sub-process, one step, or folded as a helper.
    const handlers = handlersRaisedBy(w, statement, true);
    if (handlers.length) {
      let live = incoming;
      for (const key of handlers) {
        const impl = w.input.methodImpls.find((m) => m.key === key);
        live = callRoutine(w, key, impl?.name ?? key, anchorOf(statement, 2), ctx, live, {
          method: true, event,
          ...(impl ? { class: impl.cls } : {}),
        });
      }
      return { exits: live, outputRun: null };
    }
    return keep(w.graph.addNode('call-opaque', event, anchorOf(statement, 2), ctx.region, ctx.container, {
      detail: { event: true, dynamic: true, returns: true },
    }));
  }

  if (isInfoMessage(text, w.readings.reads320)) {
    // D4: the popup is a person acting in the program — a user task, and
    // lane evidence of the same kind as `CALL SCREEN` (2.16 lists the popup
    // among the human evidence). Both tokens stand in the statement.
    const label = w.input.readers.errorLabel(statement);
    // `MESSAGE i012(zsd)` names itself; `MESSAGE lv_text TYPE 'I'` names
    // only its type, and that is what the token then says.
    const id = (w.readings.reads320 ? /^MESSAGE\s+i\d/i : /^MESSAGE\s+[iI]\d/).test(text) ? label : "TYPE 'I'";
    recordEvidence(w, 'human', `MESSAGE ${id}`, anchorOf(statement), statement);
    return keep(w.graph.addNode('user-task', label, anchorOf(statement), ctx.region, ctx.container, {
      detail: { message: 'I' },
    }));
  }

  if (statement.keyword === 'PERFORM') return { ...walkPerform(w, statement, ctx, incoming), outputRun: null };

  if (/^CALL\s+FUNCTION\b/i.test(text)) return { ...walkFunction(w, statement, ctx, incoming), outputRun: null };

  if (w.readings.reads320 && ENHANCEMENT_CALL.test(text)) return { ...walkEnhancementCall(w, statement, ctx, incoming), outputRun: null };

  if (/^CALL\s+TRANSACTION\b/i.test(text)) {
    // The line alone does not name the statement: `CALL TRANSACTION 'VA01'.
    // CALL TRANSACTION 'ME21N'.` on one line labelled both VA01.
    // The call site carries its text.
    const call = w.input.calls.transactions.find(
      (t) => t.lineStart === statement.lineStart && t.text === statement.text,
    );
    const node = w.graph.addNode('transaction', call?.code ?? call?.codeExpression ?? 'CALL TRANSACTION',
      anchorOf(statement, 2), ctx.region, ctx.container, {
        detail: {
          batchInput: call?.batchInput ?? false,
          dynamic: call?.dynamic ?? true,
          // Roadmap 3.0.7: what the batch input fills, as the source writes
          // it — the screens (`SAPMM06E 1117`) and the screen fields
          // (`EKET-EEIND(01)`). Tokens only: which of them is a database
          // table is the catalogue's question (`evidence-model.ts`).
          ...batchInputDetail(w, statement.index),
          // Rule 3: batch input returns, and the caller goes on.
          returns: true,
        },
      });
    return keep(node);
  }
  if (/^CALL\s+SCREEN\b/i.test(text)) {
    w.state.screenCalled = true;
    // Engine 3.2.0: the screen's modules run in this session, with what is registered here.
    if (w.readings.reads320) {
      w.state.screenCallSites.push(statement.index);
      w.state.registrationsAtCall.set(statement.index, new Set(w.state.registeredInWalk));
    }
    const screen = /^CALL\s+SCREEN\s+([\w/]+)/i.exec(text)?.[1] ?? 'CALL SCREEN';
    // 2.16: a dynpro is a person. The token is written the way the source
    // writes it, `SCREEN 9000`, and both words are in the statement.
    recordEvidence(w, 'human', `SCREEN ${screen.toUpperCase()}`, anchorOf(statement, 1), statement);
    return keep(w.graph.addNode('user-task', screen, anchorOf(statement, 2), ctx.region, ctx.container));
  }

  if (statement.keyword === 'SELECT' || isEmbeddedSelect(text)) {
    const tables = selectTables(text);
    if (tables.length) {
      return keep(w.graph.addNode('read', tables[0],
        anchorOf(statement, tokenIndexOf(statement, /^FROM$/i) + 1), ctx.region, ctx.container, {
          detail: { tables, single: /^SELECT\s+SINGLE\b/i.test(text) },
        }));
    }
    return { exits: incoming, outputRun: null };
  }
  const write = databaseWriteIn(text);
  if (write && isInternalWrite(w.input.localData, write)) {
    // Roadmap 3.0.7: a change to an internal table is a plain step of the
    // program — no SAP data store, no effect. `MODIFY gt_fieldcat FROM
    // gs_fieldcat` drawn as a write read as if the field catalogue were a
    // table of the system.
    return keep(w.graph.addNode('task', write.table.toUpperCase(),
      anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${write.table}$`, 'i'))),
      ctx.region, ctx.container, { detail: { operation: write.keyword, internalTable: true } }));
  }
  if (write) {
    return keep(w.graph.addNode('write', write.table.toUpperCase(),
      anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${write.table}$`, 'i'))),
      ctx.region, ctx.container, { detail: { operation: write.keyword } }));
  }

  const adbc = adbcExecution(text);
  if (adbc) {
    return keep(w.graph.addNode('call-opaque', adbc.method,
      anchorOf(statement, tokenIndexOf(statement, /EXECUTE_(?:UPDATE|QUERY|DDL)/i)),
      ctx.region, ctx.container, {
        detail: {
          nativeSql: true,
          // The SQL text is not in this statement, so neither is the table.
          ...(adbc.argument ? { statement: adbc.argument } : {}),
          returns: true,
        },
      }));
  }

  if (receivesResults(text)) {
    // ABAP keyword documentation, `RECEIVE RESULTS FROM FUNCTION`: the
    // receiving half of an asynchronous RFC. In the callback routine that
    // `STARTING NEW TASK … ON END OF TASK` names, it takes over what the
    // remote function module returned — a step with the other task, drawn
    // as the service task the starting call is, under the module's name.
    const name = /^RECEIVE\s+RESULTS\s+FROM\s+FUNCTION\s+'([^']+)'/i.exec(text)?.[1]?.toUpperCase();
    return keep(w.graph.addNode('service-task', name ?? 'RECEIVE RESULTS', anchorOf(statement, name ? 4 : 0),
      ctx.region, ctx.container, { detail: { receivesResults: true, returns: true } }));
  }

  if (closesDataset(statement)) {
    // ADR-066, note of 03.10.2026: `CLOSE DATASET` belongs to the file step
    // before it of the same file. Right behind that step's run it joins the
    // run's range; anywhere else (after a `TRANSFER` loop, after reading a
    // file) the step it belongs to is already drawn, and it draws nothing.
    const dataset = datasetOf(statement);
    if (outputRun?.detail?.target === 'file' && outputRun.anchor && dataset
      && w.state.fileRunDatasets.get(outputRun.id)?.has(dataset)) {
      outputRun.anchor.lineEnd = statement.lineEnd;
      (outputRun.detail as { statements: number }).statements += 1;
      return { exits: incoming, outputRun };
    }
    return { exits: incoming, outputRun: null };
  }

  if (isListOutput(statement) || isFileOutput(statement)) {
    const target = isFileOutput(statement) ? 'file' : 'list';
    const dataset = target === 'file' ? datasetOf(statement) : null;
    if (outputRun && outputRun.detail?.target === target && outputRun.anchor) {
      // A run of `WRITE` is one result list, not eight data objects. The run
      // keeps the anchor of its first statement (rule 2) and grows its range.
      outputRun.anchor.lineEnd = statement.lineEnd;
      const detail = outputRun.detail as { statements: number };
      detail.statements += 1;
      if (dataset) w.state.fileRunDatasets.get(outputRun.id)?.add(dataset);
      return { exits: incoming, outputRun };
    }
    const node = w.graph.addNode('output', statement.keyword, anchorOf(statement), ctx.region,
      ctx.container, { detail: { statements: 1, target } });
    if (target === 'file') w.state.fileRunDatasets.set(node.id, new Set(dataset ? [dataset] : []));
    w.graph.connect(incoming, node.id);
    return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: node };
  }

  if (w.input.macros.has(statement.keyword)) {
    return { ...walkMacroCall(w, statement, ctx, incoming), outputRun: null };
  }

  // Everything else is a move, a calculation or a commit boundary, and §5.8
  // gives none of them a BPMN element. `AUTHORITY-CHECK` is the deliberate
  // one: since 2.16 it is read here as **lane evidence** — it opens a lane for
  // the actor outside the program whose authorisation is checked — and it
  // still draws no step, because the checker executes no statement of this
  // program. Nothing about the graph changes here, which is what keeps the
  // fold of 2.15 and the CC-055 argument intact.
  if (statement.keyword === 'AUTHORITY-CHECK') {
    const object = /\bOBJECT\s+(?:'([^']*)'|`([^`]*)`|([\w/]+))/i.exec(text);
    const token = (object?.[1] ?? object?.[2] ?? object?.[3] ?? '').toUpperCase();
    if (token) {
      recordEvidence(w, 'authority', token,
        anchorOf(statement, tokenIndexOf(statement, /^OBJECT$/i) + 1), statement);
    }
  }
  if (statement.keyword === 'SET') recordHandlerRegistration(w, statement);
  // D2: a method call — the whole statement, or an operand of it.
  return { exits: walkMethodCalls(w, statement, ctx, incoming), outputRun: null };
}

function leaveTo(
  w: Walker,
  incoming: Exit[],
  to: string,
  kind: SkeletonEdgeKind,
  reason: SkeletonEdgeReason,
): void {
  for (const exit of incoming) {
    w.graph.edges.push({ from: exit.from, to, kind, condition: exit.condition, reason });
  }
}

/**
 * ADR-054 — an end event of its own for every early exit.
 *
 * `RETURN`, `EXIT` outside a loop and `STOP` used to lead to the one normal
 * end at the block's closing word, so a map showed a routine with five ways
 * out as a routine with one. Now each of them ends on its own statement, as
 * SAP Signavio models it and as the process benchmark expects it
 * (`tests/prozess-benchmark/`). A `CHECK` that leaves the block is not one of
 * them: `DESIGN.md` §5.8 draws it as a conditional flow rather than as an
 * element of its own, and it keeps leading to the normal end (`walkCheck`).
 * `LEAVE SCREEN`, `LEAVE TO SCREEN` and `LEAVE LIST-PROCESSING` leave the
 * block the same way a `RETURN` does and end the same way (`leavesDialogStep`).
 *
 * Rule 6 holds: the label is the keyword the source writes, the routine it
 * leaves travels in `detail.routine`, and the **condition** travels verbatim
 * on the flow into the event — the event itself says no phrase. `detail.early`
 * is what lets a view call it an early end rather than the normal one.
 *
 * Two things keep it from becoming clutter. Nothing reaching the statement
 * means nothing is drawn: a second `RETURN` straight behind a first one in the
 * same branch has no way in, and no second event. And an exit with nothing
 * drawn between it and the block's end is no early exit at all — that is
 * decided once the walk is complete, in `settleEarlyEnds`.
 */
function leaveEarly(
  w: Walker,
  statement: AbapStatement,
  incoming: Exit[],
  ctx: WalkContext,
  kind: SkeletonEdgeKind | null,
  reason: SkeletonEdgeReason,
  /** The words that leave, where one keyword is not enough (`LEAVE TO SCREEN`). */
  words?: string,
): void {
  if (!incoming.length) return;
  const keyword = words ?? statement.keyword.toUpperCase();
  const node = w.graph.addNode('end', keyword, anchorOf(statement), ctx.region, ctx.container, {
    detail: { early: true, exit: keyword, routine: ctx.container ?? ctx.region.label },
  });
  for (const exit of incoming) {
    w.graph.edges.push({ from: exit.from, to: node.id, kind: kind ?? exit.kind, condition: exit.condition, reason });
  }
  w.state.earlyEnds.push({ node, statementIndex: statement.index, region: ctx.region });
}

/**
 * Rule 5. `CHECK` is not one edge with three meanings.
 *
 * Inside a `LOOP` the false path ends the iteration; inside a `FORM` it leaves
 * the routine; in an event block it leaves the block. The three are three
 * different edges with three different reasons, and a reader who clicks the
 * gateway has to be told which one this is.
 */
export function walkCheck(w: Walker, statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
  const condition = afterKeyword(statement);
  // D2: `CHECK lo->m( ) = …` runs the method before it decides.
  const before = walkMethodCalls(w, statement, ctx, incoming);
  const gateway = w.graph.addNode('gateway', snippet(statement.text), anchorOf(statement, 1),
    ctx.region, ctx.container, { detail: { source: 'CHECK', condition } });
  w.graph.connect(before, gateway.id);

  const falsePath: Exit[] = [{ from: gateway.id, condition: `NOT ( ${condition} )`, kind: 'conditional' }];
  if (ctx.loops.length) {
    leaveTo(w, falsePath, ctx.loops[ctx.loops.length - 1], 'loop-back', 'check-leaves-loop');
  } else if (ctx.region.kind === 'sub-process') {
    // ADR-054 leaves `CHECK` out on purpose: §5.8 draws it as a conditional
    // flow, not as an element, so its false path still leads to the normal end.
    leaveTo(w, falsePath, ctx.region.endNodeId, 'conditional', 'check-leaves-form');
  } else {
    leaveTo(w, falsePath, ctx.region.endNodeId, 'conditional', 'check-leaves-event');
  }
  return { exits: [{ from: gateway.id, condition, kind: 'conditional' }] };
}

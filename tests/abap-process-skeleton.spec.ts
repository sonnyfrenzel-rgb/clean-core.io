import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildProcessSkeleton,
  MAX_LANES,
  type ProcessSkeleton,
  type SkeletonNode,
} from '../lib/abap/process-skeleton';

/**
 * The process skeleton — roadmap 2.3.
 *
 * Every number here is measured against a program this product actually ships,
 * not against a snippet written to suit the reader. They are pinned: a starter
 * example that changes changes them, and that is a decision somebody takes on
 * purpose rather than a number that drifts.
 *
 * The file is organised by the seven rules the skeleton has to carry. Each rule
 * has at least one assertion that fails the moment the rule is taken out of
 * `lib/abap/process-skeleton.ts` — which was measured by taking each of them out
 * in turn and watching this spec go red.
 */
const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const read = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');
const skeletonOf = (name: string) => buildProcessSkeleton(read(name));

const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

function countKinds(skeleton: ProcessSkeleton): Record<string, number> {
  const out: Record<string, number> = {};
  for (const node of skeleton.nodes) out[node.kind] = (out[node.kind] ?? 0) + 1;
  return out;
}

function nodeAt(skeleton: ProcessSkeleton, line: number, kind: string): SkeletonNode | undefined {
  return skeleton.nodes.find((n) => n.anchor?.lineStart === line && n.kind === kind);
}

/* ================================================================== *
 * The eight programs this product ships
 * ================================================================== */

/**
 * nodes · edges · regions · entry points · unreached routines and their lines ·
 * technical helpers folded into their callers · groups of identical routines.
 */
const SHIPPED: Array<[string, number, number, number, number, number, number, number, number]> = [
  // file, nodes, edges, regions, entries, unreached, unreachedLines, helpers, cloneGroups
  //
  // Roadmap 2.15 moved four of these counts, deliberately. A technical gateway
  // that follows a call, a read or a write is no longer drawn as a decision: it
  // becomes the boundary event on that step, and where `walkFunction` had
  // already hung one, the gateway and its two flows into it go altogether. So a
  // program loses one node and two edges per double drawing (5 of them over the
  // eight examples) and keeps its count otherwise — LEGACY 106→105 / 129→127,
  // BP_SYNC 17→16 / 17→15, PO 113→110 / 122→116. Nothing was dropped from the
  // map: every arm of every folded gateway is still a flow, see the 2.15 block
  // at the end of this file.
  [LEGACY, 105, 127, 23, 4, 19, 323, 6, 1],
  ['Z_BUSINESS_PARTNER_SYNC.txt', 16, 15, 4, 2, 0, 0, 1, 0],
  ['Z_EMPLOYEE_EXPENSE_VAL.txt', 12, 13, 2, 1, 0, 0, 1, 0],
  ['Z_INVOICE_EXTRACTOR.txt', 16, 14, 3, 1, 0, 0, 0, 0],
  ['Z_MATERIAL_STOCK_CALC.txt', 16, 17, 4, 1, 0, 0, 0, 0],
  [PO, 110, 116, 23, 1, 13, 147, 0, 0],
  ['Z_ORDER_INTEGRITY_CHECK.txt', 0, 0, 0, 0, 1, 15, 0, 0],
  ['Z_SALES_ORDER_CREATOR.txt', 12, 12, 2, 1, 0, 0, 1, 0],
];

test.describe('the eight programs this product ships', () => {
  for (const [file, nodes, edges, regions, entries, unreached, unreachedLines, helpers, clones] of SHIPPED) {
    test(`${file} — ${nodes} nodes, ${edges} edges, ${regions} regions, ${entries} entry points`, () => {
      const skeleton = skeletonOf(file);
      expect(skeleton.nodes).toHaveLength(nodes);
      expect(skeleton.edges).toHaveLength(edges);
      expect(skeleton.regions).toHaveLength(regions);
      expect(skeleton.entries).toHaveLength(entries);
      expect(skeleton.notDrawn.unreached).toHaveLength(unreached);
      expect(skeleton.notDrawn.unreachedLines).toBe(unreachedLines);
      expect(skeleton.notDrawn.technicalHelpers).toHaveLength(helpers);
      expect(skeleton.notDrawn.clones).toHaveLength(clones);

      // Every edge joins two nodes that exist. A skeleton with an edge into
      // nowhere renders as a diagram with a line that starts at nothing.
      const known = new Set(skeleton.nodes.map((n) => n.id));
      for (const edge of skeleton.edges) {
        expect(known.has(edge.from), `edge from unknown node ${edge.from}`).toBe(true);
        expect(known.has(edge.to), `edge to unknown node ${edge.to}`).toBe(true);
      }

      // A node nothing points at is the first node of its region and nothing
      // else — an entry's start event, or the first step of a sub-process.
      const regionEntries = new Set(skeleton.regions.map((r) => r.entryNodeId));
      for (const node of skeleton.nodes) {
        if (skeleton.edges.some((e) => e.to === node.id)) continue;
        expect(regionEntries.has(node.id), `${node.kind} ${node.label} has no incoming flow`).toBe(true);
      }
    });
  }

  test(`${LEGACY} — the palette, element for element`, () => {
    // `DESIGN.md` §5.8 measures its palette against this program. These are the
    // elements it produces without a model being asked anything.
    expect(countKinds(skeletonOf(LEGACY))).toEqual({
      start: 4,
      end: 23,
      'end-error': 4,
      // 2.15: 28 → 23. Five gateways here decided on a return code behind a
      // call, a read or a write; four of them became the boundary event on that
      // step (2 → 6), the fifth joined one that was already drawn.
      gateway: 23,
      loop: 11,
      'sub-process': 7,
      'business-rule-task': 3,
      'service-task': 5,
      'send-task': 2,
      'user-task': 2,
      'error-boundary': 6,
      transaction: 2,
      read: 8,
      write: 4,
      output: 1,
    });
  });

  test(`${PO} — the palette, element for element`, () => {
    expect(countKinds(skeletonOf(PO))).toEqual({
      start: 1,
      end: 23,
      'end-error': 3,
      // 2.15, and this is the program the step was written for: 13 of its 31
      // gateways were `IF sy-subrc …` directly behind a `SELECT`, a
      // `CALL FUNCTION` or a `CALL TRANSACTION`. Ten became the boundary event
      // on their step (3 → 13), three joined one that `walkFunction` had
      // already hung there.
      gateway: 18,
      'sub-process': 9,
      'service-task': 5,
      'send-task': 3,
      'error-boundary': 13,
      transaction: 2,
      read: 15,
      write: 15,
      output: 3,
    });
  });

  test('what §5.8 says instead of drawing it', () => {
    const skeleton = skeletonOf(LEGACY);

    // "14 forms identical except the rule number" (DESIGN.md §5.8).
    expect(skeleton.notDrawn.clones).toHaveLength(1);
    expect(skeleton.notDrawn.clones[0].names).toHaveLength(14);
    expect(skeleton.notDrawn.clones[0].names[0]).toBe('LEGACY_BUSINESS_RULE_001');
    expect(skeleton.notDrawn.clones[0].names[13]).toBe('LEGACY_BUSINESS_RULE_014');
    expect(skeleton.notDrawn.clones[0].lineStart).toBe(687);
    expect(skeleton.notDrawn.clones[0].lineEnd).toBe(993);

    // "Not reached from any entry point: 17 forms and 2 screen modules."
    const unreached = skeleton.notDrawn.unreached;
    expect(unreached.filter((r) => r.kind === 'form')).toHaveLength(17);
    expect(unreached.filter((r) => r.kind === 'module')).toHaveLength(2);
    expect(unreached[0]).toEqual({
      name: 'LEGACY_NATIVE_SQL_EXAMPLE', kind: 'form', lineStart: 653, lineEnd: 661,
    });

    // "4 technical helpers folded in" — the four §5.8 names, and two more the
    // same rule catches: a routine that only fills a field catalogue, and one
    // that only commits and logs.
    const helpers = skeleton.notDrawn.technicalHelpers.map((h) => h.name);
    expect(helpers).toEqual([
      'BDC_DYNPRO', 'BDC_FIELD', 'BUILD_FIELDCATALOG', 'APPEND_FIELDCAT', 'ADD_LOG', 'FINALIZE_RUN',
    ]);
    // `add_log` is performed twelve times and draws nothing. Twelve boxes called
    // "add_log" is what a process map looks like when nobody folds them in.
    expect(skeleton.notDrawn.technicalHelpers.find((h) => h.name === 'ADD_LOG')?.callSites).toBe(12);
    expect(skeleton.nodes.some((n) => n.label === 'ADD_LOG')).toBe(false);
  });

  test('a routine small enough to be one step is one step, and §5.8 says which', () => {
    const skeleton = skeletonOf(LEGACY);
    const callSite = (name: string) =>
      skeleton.nodes.find((n) => n.label === name && n.expandsTo === `form:${name}`);

    // DESIGN.md §5.8, right-hand column: the example's own elements.
    expect(callSite('SEND_SUMMARY_MAIL')?.kind, 'Zusammenfassung mailen (L573)').toBe('send-task');
    expect(callSite('DISPLAY_ALV')?.kind, 'Ergebnisliste ansehen, ALV (L616)').toBe('user-task');
    expect(callSite('UPDATE_LEGACY_LOG_TASK')?.kind, 'Audit-Protokoll im Update-Task (L509)').toBe('service-task');
    expect(callSite('CHANGE_SALES_ORDER_BDC')?.kind, 'Kundenauftrag ändern per Batch-Input (L467)').toBe('transaction');
    expect(callSite('DERIVE_CUSTOMER_RISK')?.kind, 'Kundenrisiko ableiten (L303–317)').toBe('business-rule-task');
    expect(callSite('CALCULATE_RISK_SCORES')?.kind, 'Auftragsrisiko punkten (L335–396)').toBe('business-rule-task');

    // A routine that classifies stays a decision table however long it is;
    // sixty lines do not turn it into a phase of the process.
    expect(callSite('CALCULATE_RISK_SCORES')?.collapsed).toBe(false);
    expect(callSite('SEND_SUMMARY_MAIL')?.collapsed).toBe(true);

    // And a phase stays a phase: the eight-element routine is not squeezed into
    // one box because one of its steps happens to be the loudest.
    expect(callSite('PROCESS_ACTIONS')?.kind).toBe('sub-process');
    expect(callSite('PROCESS_ACTIONS')?.collapsed).toBe(false);
  });

  test('a group change is a decision on the iteration, not a loop of its own', () => {
    // `control-flow.ts` leaves `AT NEW` to the skeleton on purpose: it is not a
    // branch. Read as an opener without looking at it, it becomes a second loop
    // inside the loop — two multi-instance markers where the code has one.
    const source = [
      'REPORT z_group.',
      'START-OF-SELECTION.',
      '  PERFORM run.',
      'FORM run.',
      '  LOOP AT gt_items INTO gs_item.',
      '    AT NEW kunnr.',
      "      UPDATE zsum SET flag = 'X'.",
      '    ENDAT.',
      "    UPDATE zdetail SET flag = 'X'.",
      '  ENDLOOP.',
      'ENDFORM.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.nodes.filter((n) => n.kind === 'loop')).toHaveLength(1);
    const group = skeleton.nodes.find((n) => n.detail?.source === 'AT');
    expect(group?.kind).toBe('gateway');
    expect(group?.detail?.condition, 'the words the source uses').toBe('NEW kunnr');
    expect(group?.anchor?.lineStart).toBe(6);

    // Both ways out of it reach the statement after ENDAT.
    const after = skeleton.nodes.find((n) => n.label === 'ZDETAIL');
    expect(skeleton.edges.filter((e) => e.to === after?.id).map((e) => e.kind).sort())
      .toEqual(['default', 'sequence']);
  });
});

/* ================================================================== *
 * Rule 1 — every node carries a range, or says it has none
 * ================================================================== */

test.describe('rule 1 — a node without an anchor does not look like one with', () => {
  test('every node of every shipped program carries a line range', () => {
    for (const [file] of SHIPPED) {
      const skeleton = skeletonOf(file);
      expect(skeleton.unanchoredNodes, `${file} has a node with no anchor`).toBe(0);
      expect(skeleton.anchoredNodes).toBe(skeleton.nodes.length);
      for (const node of skeleton.nodes) {
        expect(node.anchor, `${file}: ${node.kind} ${node.label} has no anchor`).toBeTruthy();
        expect(node.anchor?.lineStart).toBeGreaterThan(0);
        expect(node.anchor?.lineEnd).toBeGreaterThanOrEqual(node.anchor?.lineStart ?? 0);
      }
    }
  });

  test('a routine nothing closes ends in a node that says it has no anchor', () => {
    const source = [
      'REPORT z_open.',
      'START-OF-SELECTION.',
      '  PERFORM broken.',
      'FORM broken.',
      "  UPDATE zsomething SET flag = 'X'.",
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.unanchoredNodes, 'the end of an unterminated FORM is a guess').toBe(1);
    expect(skeleton.anchoredNodes).toBe(skeleton.nodes.length - 1);

    const blind = skeleton.nodes.filter((n) => n.anchor === null);
    expect(blind).toHaveLength(1);
    expect(blind[0].kind).toBe('end');
    expect(blind[0].label).toBe('BROKEN');
    expect(blind[0].unanchoredReason).toContain('ENDFORM');
    // Its id cannot be mistaken for an anchored one either.
    expect(blind[0].id.startsWith('nd-x-')).toBe(true);

    // And the write inside it is still anchored: one unreadable end does not
    // cost the reader the statement that made the routine a step.
    expect(nodeAt(skeleton, 5, 'write')?.label).toBe('ZSOMETHING');
  });
});

/* ================================================================== *
 * Rule 2 — the anchor is a statement, plus a token offset
 * ================================================================== */

test.describe('rule 2 — the anchor is a statement, not a line', () => {
  test('a chain is one node per part, each on its own line', () => {
    const source = [
      'REPORT z_chain.',
      'START-OF-SELECTION.',
      '  PERFORM: read_it,',
      '           write_it.',
      'FORM read_it.',
      '  SELECT SINGLE * FROM vbak INTO @DATA(ls_a) WHERE vbeln = @sy-uname.',
      'ENDFORM.',
      'FORM write_it.',
      "  UPDATE vbak SET lifsk = 'X'.",
      'ENDFORM.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    const callSites = skeleton.nodes.filter((n) => n.expandsTo);
    expect(callSites.map((n) => n.label)).toEqual(['READ_IT', 'WRITE_IT']);
    expect(callSites.map((n) => n.anchor?.lineStart), 'one anchor per part, not one for the chain').toEqual([3, 4]);
    expect(new Set(callSites.map((n) => n.anchor?.statementIndex)).size).toBe(2);
  });

  test('two nodes inside one statement point at different tokens', () => {
    // ZLEGACY…:401-411 — `CALL FUNCTION 'Z_CREDIT_EXPOSURE_READ' … EXCEPTIONS …`
    // is a service task and the error boundary that hangs on it (DESIGN.md §5.8).
    const skeleton = skeletonOf(LEGACY);
    const here = skeleton.nodes.filter((n) => n.anchor?.lineStart === 401);
    expect(here.map((n) => n.kind)).toEqual(['service-task', 'error-boundary']);
    expect(here[0].anchor?.statementIndex).toBe(here[1].anchor?.statementIndex);
    expect(here[0].anchor?.tokenOffset, 'the module name').toBe(2);
    expect(here[1].anchor?.tokenOffset, 'the EXCEPTIONS clause').toBe(16);
    expect(here[0].anchor?.lineEnd, 'the call runs to the end of its EXCEPTIONS list').toBe(411);
  });

  test('a macro takes effect at the call site, and the definition is secondary', () => {
    const source = [
      'REPORT z_macro.',
      'DEFINE log_it.',
      "  UPDATE zlog SET note = &1.",
      'END-OF-DEFINITION.',
      'START-OF-SELECTION.',
      '  PERFORM work.',
      'FORM work.',
      "  log_it 'started'.",
      'ENDFORM.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    const write = skeleton.nodes.find((n) => n.kind === 'write');
    expect(write?.label).toBe('ZLOG');
    expect(write?.anchor?.lineStart, 'the effect is where the macro is used').toBe(8);
    expect(write?.anchor?.secondary, 'the body is a secondary range, never the anchor').toEqual({
      lineStart: 3, lineEnd: 3, reason: 'macro-definition',
    });
    expect(skeleton.notes.map((n) => n.reason)).toContain('macro-call');
  });

  test('a PERFORM is anchored at the call, with the routine as the second range', () => {
    const skeleton = skeletonOf(LEGACY);
    const node = skeleton.nodes.find((n) => n.expandsTo === 'form:PROCESS_ACTIONS');
    expect(node?.anchor?.lineStart, 'the call in START-OF-SELECTION').toBe(171);
    expect(node?.anchor?.secondary).toEqual({
      lineStart: 435, lineEnd: 451, reason: 'routine-definition',
    });
  });
});

/* ================================================================== *
 * Rule 3 — opaque calls stay opaque, and the caller goes on
 * ================================================================== */

test.describe('rule 3 — what comes back, and what does not', () => {
  const source = [
    'REPORT z_calls.',
    'START-OF-SELECTION.',
    '  PERFORM remote IN PROGRAM zother.',
    '  PERFORM local.',
    '  SUBMIT zreport AND RETURN.',
    '  SUBMIT zfinal.',
    '  PERFORM never_reached_after.',
    'FORM local.',
    "  CALL TRANSACTION 'VA02'.",
    "  CALL FUNCTION 'Z_READ' DESTINATION 'PRD'.",
    "  UPDATE vbak SET lifsk = 'X'.",
    'ENDFORM.',
    'FORM never_reached_after.',
    "  UPDATE vbap SET matnr = 'X'.",
    'ENDFORM.',
  ].join('\n');

  test('a PERFORM into a program this source does not have is an opaque call', () => {
    const skeleton = buildProcessSkeleton(source);
    const opaque = skeleton.nodes.filter((n) => n.kind === 'call-opaque');
    expect(opaque).toHaveLength(1);
    expect(opaque[0].label).toBe('REMOTE');
    expect(opaque[0].detail?.program).toBe('ZOTHER');
    expect(opaque[0].expandsTo, 'there is no region to open — the source is not here').toBeUndefined();

    // And the caller carries on: the routine returns.
    expect(skeleton.edges.some((e) => e.from === opaque[0].id), 'the flow stops at the opaque call').toBe(true);
  });

  test('CALL TRANSACTION, a synchronous RFC and SUBMIT … AND RETURN all come back', () => {
    const skeleton = buildProcessSkeleton(source);
    const after = (kind: string) => {
      const node = skeleton.nodes.find((n) => n.kind === kind);
      return skeleton.edges.filter((e) => e.from === node?.id && e.reason !== 'no-return');
    };
    expect(after('transaction').length, 'CALL TRANSACTION returns').toBeGreaterThan(0);
    expect(after('service-task').length, 'a synchronous RFC returns').toBeGreaterThan(0);

    const submits = skeleton.nodes.filter((n) => n.kind === 'call-activity');
    expect(submits.map((n) => n.label)).toEqual(['ZREPORT', 'ZFINAL']);
    expect(submits[0].detail?.returns, 'AND RETURN comes back').toBe(true);
    expect(skeleton.edges.find((e) => e.from === submits[0].id)?.reason).toBeUndefined();
  });

  test('SUBMIT without AND RETURN does not come back, and the flow says so', () => {
    const skeleton = buildProcessSkeleton(source);
    const submits = skeleton.nodes.filter((n) => n.kind === 'call-activity');
    expect(submits[1].label).toBe('ZFINAL');
    expect(submits[1].detail?.returns).toBe(false);

    const out = skeleton.edges.filter((e) => e.from === submits[1].id);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('no-return');
    const entry = skeleton.regions.find((r) => r.kind === 'entry');
    expect(out[0].to, 'it goes to the end of the entry and nowhere else').toBe(entry?.endNodeId);
  });

  test('what stands after a call that never returns is said, not drawn into the flow', () => {
    const skeleton = buildProcessSkeleton(source);
    const stranded = skeleton.notes.filter((n) => n.reason === 'unreachable-after-abort');
    expect(stranded).toHaveLength(1);
    expect(stranded[0].lineStart, 'PERFORM never_reached_after, after SUBMIT zfinal').toBe(7);
    expect(stranded[0].detail).toContain('does not come back');

    // The routine behind it is still read and still anchored: the write inside
    // it keeps its line, it simply hangs off nothing.
    const write = skeleton.nodes.find((n) => n.label === 'VBAP');
    expect(write?.anchor?.lineStart).toBe(14);
  });

  test('LEAVE TO TRANSACTION does not come back either', () => {
    const skeleton = buildProcessSkeleton([
      'REPORT z_leave.',
      'START-OF-SELECTION.',
      "  LEAVE TO TRANSACTION 'SE38'.",
    ].join('\n'));
    const node = skeleton.nodes.find((n) => n.kind === 'call-activity');
    expect(node?.label).toBe('SE38');
    expect(skeleton.edges.filter((e) => e.from === node?.id).map((e) => e.reason)).toEqual(['no-return']);
  });
});

/* ================================================================== *
 * Rule 4 — the event blocks are the starts, in runtime order
 * ================================================================== */

test.describe('rule 4 — the starts, and the order they run in', () => {
  test('the shipped report starts four times, and they are the event blocks', () => {
    const skeleton = skeletonOf(LEGACY);
    const starts = skeleton.nodes.filter((n) => n.kind === 'start');
    expect(starts.map((n) => [n.label, n.anchor?.lineStart])).toEqual([
      ['INITIALIZATION', 151],
      ['AT SELECTION-SCREEN', 158],
      ['START-OF-SELECTION', 161],
      ['END-OF-SELECTION', 176],
    ]);
    expect(skeleton.entries).toEqual([
      'entry:INITIALIZATION@151',
      'entry:AT SELECTION-SCREEN@158',
      'entry:START-OF-SELECTION@161',
      'entry:END-OF-SELECTION@176',
    ]);
  });

  test('the order is the one they run in, not the one they are written in', () => {
    // A developer may write END-OF-SELECTION above START-OF-SELECTION, and some
    // do. ABAP still runs INITIALIZATION first and END-OF-SELECTION last, and a
    // process map that follows the file tells the reader the wrong story.
    const source = [
      'REPORT z_order.',
      'END-OF-SELECTION.',
      "  WRITE / 'done'.",
      'START-OF-SELECTION.',
      '  SELECT SINGLE * FROM vbak INTO @DATA(ls_a).',
      'AT SELECTION-SCREEN.',
      "  CHECK sy-uname <> 'X'.",
      'INITIALIZATION.',
      '  CLEAR sy-subrc.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.entries.map((k) => k.split(':')[1].split('@')[0])).toEqual([
      'INITIALIZATION', 'AT SELECTION-SCREEN', 'START-OF-SELECTION', 'END-OF-SELECTION',
    ]);
    // The source order is the reverse of it, which is the point.
    expect(skeleton.nodes.filter((n) => n.kind === 'start').map((n) => n.anchor?.lineStart))
      .toEqual([2, 4, 6, 8]);
  });

  test('a report without START-OF-SELECTION still has a skeleton', () => {
    const source = [
      'REPORT z_implicit.',
      'PARAMETERS p_run AS CHECKBOX.',
      'SELECT SINGLE * FROM vbak INTO @DATA(ls_order).',
      "UPDATE vbak SET lifsk = 'X' WHERE vbeln = @ls_order-vbeln.",
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    const start = skeleton.nodes.find((n) => n.kind === 'start');
    expect(start?.label).toBe('START-OF-SELECTION');
    expect(start?.detail?.implicit, 'ABAP runs these statements as the implicit event').toBe(true);
    expect(start?.anchor?.lineStart, 'anchored at the first statement that runs').toBe(3);
    expect(skeleton.nodes.map((n) => n.kind)).toEqual(['start', 'end', 'read', 'write']);
  });

  test('a GET event is a start, and GET TIME is not', () => {
    const source = [
      'REPORT z_ldb.',
      'NODES: vbak.',
      'GET TIME.',
      'GET vbak.',
      "  WRITE / vbak-vbeln.",
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    const starts = skeleton.nodes
      .filter((n) => n.kind === 'start')
      .sort((a, b) => (a.anchor?.lineStart ?? 0) - (b.anchor?.lineStart ?? 0));
    expect(starts.map((n) => [n.label, n.anchor?.lineStart])).toEqual([
      // `GET TIME.` at program level runs in the implicit START-OF-SELECTION;
      // `GET vbak.` is the event block of a logical database.
      ['START-OF-SELECTION', 3],
      ['GET vbak', 4],
    ]);
    expect(skeleton.entries.map((k) => k.split('@')[0])).toEqual([
      'entry:START-OF-SELECTION', 'entry:GET vbak',
    ]);
  });

  test('a source with no entry point says so instead of inventing one', () => {
    // Z_ORDER_INTEGRITY_CHECK.txt is exactly this: classes, types and one FORM
    // nothing performs. Nothing in it says where a process would begin.
    const skeleton = skeletonOf('Z_ORDER_INTEGRITY_CHECK.txt');
    expect(skeleton.nodes).toEqual([]);
    expect(skeleton.notes.map((n) => n.reason)).toEqual(['no-entry-point']);
    expect(skeleton.notDrawn.unreached.map((r) => r.name)).toEqual(['PERFORM_SALES_AUDIT']);
  });
});

/* ================================================================== *
 * Rule 5 — CHECK has three targets
 * ================================================================== */

test.describe('rule 5 — CHECK leaves three different things', () => {
  test('in an event block it leaves the block; in a FORM it leaves the routine', () => {
    const skeleton = skeletonOf(PO);
    const reasons = skeleton.edges.filter((e) => e.reason?.startsWith('check-'));

    const event = reasons.filter((e) => e.reason === 'check-leaves-event');
    expect(event, 'the three CHECKs in START-OF-SELECTION').toHaveLength(3);
    const entry = skeleton.regions.find((r) => r.kind === 'entry');
    expect(new Set(event.map((e) => e.to))).toEqual(new Set([entry?.endNodeId]));
    expect(event[0].condition).toBe('NOT ( gv_rejected = abap_false )');

    const form = reasons.filter((e) => e.reason === 'check-leaves-form');
    expect(form, 'CHECK_PRICE:405 and NOTIFY_REQUESTER:501').toHaveLength(2);
    expect(form.map((e) => e.condition)).toEqual([
      'NOT ( gv_ref_price > 0 )',
      'NOT ( sy-subrc = 0 )',
    ]);
    for (const edge of form) {
      const target = skeleton.nodes.find((n) => n.id === edge.to);
      expect(target?.kind, 'it leaves the routine, not the program').toBe('end');
      expect(skeleton.regions.find((r) => r.key === target?.region)?.kind).toBe('sub-process');
    }
  });

  test('inside a LOOP it ends the iteration and goes nowhere else', () => {
    const source = [
      'REPORT z_check_loop.',
      'START-OF-SELECTION.',
      '  PERFORM run.',
      'FORM run.',
      '  LOOP AT gt_orders INTO gs_order.',
      '    CHECK gs_order-netwr > 0.',
      "    UPDATE vbak SET lifsk = 'X'.",
      '  ENDLOOP.',
      'ENDFORM.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    const loop = skeleton.nodes.find((n) => n.kind === 'loop');
    const gateway = skeleton.nodes.find((n) => n.detail?.source === 'CHECK');
    expect(loop?.label).toBe('gt_orders');

    const out = skeleton.edges.filter((e) => e.from === gateway?.id);
    expect(out).toHaveLength(2);
    const back = out.find((e) => e.reason === 'check-leaves-loop');
    expect(back?.to, 'the next iteration, which is the LOOP itself').toBe(loop?.id);
    expect(back?.kind).toBe('loop-back');
    expect(back?.condition).toBe('NOT ( gs_order-netwr > 0 )');

    // And not one of the other two targets: the routine keeps running.
    expect(skeleton.edges.some((e) => e.reason === 'check-leaves-form')).toBe(false);
    expect(skeleton.edges.some((e) => e.reason === 'check-leaves-event')).toBe(false);
  });

  test('a CHECK on a run switch is a condition on the flow, not a gateway', () => {
    // DESIGN.md §5.8, "Bedingter Fluss": `CHECK p_mail = abap_true.` is the
    // switch "Mail" of this run, not a decision the business process takes.
    const skeleton = skeletonOf(LEGACY);
    const guarded = skeleton.regions.filter((r) => r.guard);
    expect(guarded.map((r) => [r.label, r.guard?.condition])).toEqual([
      ['REMOTE_CREDIT_CHECK', 'p_rfc = abap_true'],
      ['DOWNLOAD_RESULT_FILE', 'p_down = abap_true'],
      ['SEND_SUMMARY_MAIL', 'p_mail = abap_true'],
      ['DISPLAY_ALV', 'p_alv = abap_true'],
    ]);

    // None of the four is a gateway, and each condition sits on the edge in.
    for (const region of guarded) {
      const call = skeleton.nodes.find((n) => n.expandsTo === region.key);
      expect(call?.detail?.guard).toBe(region.guard?.condition);
      const incoming = skeleton.edges.filter((e) => e.to === call?.id);
      expect(incoming.every((e) => e.kind === 'conditional')).toBe(true);
      expect(incoming.every((e) => e.condition === region.guard?.condition)).toBe(true);
      expect(
        skeleton.nodes.some(
          (n) => n.kind === 'gateway' && n.anchor?.lineStart === region.guard?.anchor.lineStart,
        ),
        `${region.label} drew a gateway for a run switch`,
      ).toBe(false);
    }
  });
});

/* ================================================================== *
 * Rule 6 — nothing is invented
 * ================================================================== */

test.describe('rule 6 — every label is a word out of the source', () => {
  test('no node of any shipped program is named something the code does not say', () => {
    for (const [file] of SHIPPED) {
      const flat = read(file).replace(/\s+/g, ' ').toUpperCase();
      for (const node of skeletonOf(file).nodes) {
        // ABAP's own implicit START-OF-SELECTION is the one name the source does
        // not have to contain, and the node says of itself that it is implicit.
        if (node.detail?.implicit) continue;
        expect(
          flat.includes(node.label.slice(0, 40).toUpperCase()),
          `${file}: ${node.kind} "${node.label}" is not in the source`,
        ).toBe(true);
      }
    }
  });

  test('a status field does not become an approval step', () => {
    // The temptation this rule exists for: `gv_approved`, `release_indicator`,
    // a field called `status`. A person appears in a process map only where the
    // code brings one in — a screen, a popup, a list in dialog.
    const source = [
      'REPORT z_status.',
      'START-OF-SELECTION.',
      '  PERFORM decide.',
      'FORM decide.',
      '  IF gv_release_status = 2.',
      '    gv_approved = abap_true.',
      "    gv_approver = 'MANAGER'.",
      '  ENDIF.',
      "  UPDATE eban SET frgkz = 'X'.",
      'ENDFORM.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.nodes.some((n) => n.kind === 'user-task'), 'nobody is in this code').toBe(false);
    expect(skeleton.nodes.map((n) => n.kind).sort()).toEqual(
      ['end', 'end', 'gateway', 'start', 'write', 'write'].sort(),
    );
    // The gateway keeps the condition as it stands. It does not become
    // "Manager approves" because a variable is called `gv_approver`.
    expect(skeleton.nodes.find((n) => n.kind === 'gateway')?.label).toBe('IF gv_release_status = 2');
  });
});

/* ================================================================== *
 * Rule 7 — two nodes never collide
 * ================================================================== */

test.describe('rule 7 — kind and line are not an identity', () => {
  test('no two nodes of any shipped program share an id', () => {
    for (const [file] of SHIPPED) {
      const skeleton = skeletonOf(file);
      expect(new Set(skeleton.nodes.map((n) => n.id)).size, `${file} has two nodes with one id`)
        .toBe(skeleton.nodes.length);
    }
  });

  test('three statements on one line are three statements, and at most one node each', () => {
    const source = [
      'REPORT z_oneline.',
      'START-OF-SELECTION.',
      '  PERFORM one.',
      'FORM one.',
      "  SELECT SINGLE * FROM vbak INTO @DATA(ls_a). IF sy-subrc = 0. UPDATE vbak SET lifsk = 'X'. ENDIF.",
      'ENDFORM.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    const onLine5 = skeleton.nodes.filter((n) => n.anchor?.lineStart === 5);
    // The middle one was a `gateway` until roadmap 2.15: `IF sy-subrc = 0`
    // behind a `SELECT SINGLE` is that read reporting whether it found a row,
    // so it is now the boundary event on the read. What this test is about is
    // untouched — three statements, three statement indices, three ids.
    expect(onLine5.map((n) => n.kind)).toEqual(['read', 'error-boundary', 'write']);
    // Kind and line would give three different keys here by accident. The thing
    // that actually keeps them apart is the statement index.
    expect(new Set(onLine5.map((n) => n.anchor?.statementIndex)).size).toBe(3);
    expect(new Set(onLine5.map((n) => n.id)).size).toBe(3);
  });

  test('two nodes of the same kind on the same line are two nodes', () => {
    // The case the rule exists for. `COND #( … )` writes two arms on one line;
    // a chain writes two statements on one. Here both routines write, so both
    // call sites collapse to the same kind — and kind plus line, which is what
    // an id scheme reaches for first, is the same string for both of them.
    const source = [
      'REPORT z_collide.',
      'START-OF-SELECTION.',
      '  PERFORM: mark_a, mark_b.',
      'FORM mark_a.',
      "  UPDATE vbak SET lifsk = 'A'.",
      'ENDFORM.',
      'FORM mark_b.',
      "  UPDATE vbap SET matnr = 'B'.",
      'ENDFORM.',
    ].join('\n');

    const skeleton = buildProcessSkeleton(source);
    const onLine3 = skeleton.nodes.filter((n) => n.anchor?.lineStart === 3);
    // Three nodes on one line: both call sites and the end of the event block,
    // which is anchored at the last statement the block contains.
    expect(onLine3.map((n) => n.label)).toEqual(['START-OF-SELECTION', 'MARK_A', 'MARK_B']);
    const calls = onLine3.filter((n) => n.expandsTo);
    expect(calls.map((n) => n.kind), 'the same kind, on the same line').toEqual(['write', 'write']);
    expect(new Set(onLine3.map((n) => n.id)).size, 'one id for two steps').toBe(3);
    expect(new Set(calls.map((n) => n.anchor?.statementIndex)).size).toBe(2);
    // And the flow through them is two steps long, not one.
    expect(skeleton.edges.filter((e) => e.to === calls[1].id).map((e) => e.from))
      .toEqual([calls[0].id]);
  });

  test('two nodes on the same statement differ by their slot', () => {
    const skeleton = skeletonOf(LEGACY);
    const sameStatement = new Map<number, string[]>();
    for (const node of skeleton.nodes) {
      if (!node.anchor) continue;
      const list = sameStatement.get(node.anchor.statementIndex) ?? [];
      list.push(node.id);
      sameStatement.set(node.anchor.statementIndex, list);
    }
    const shared = [...sameStatement.values()].filter((ids) => ids.length > 1);
    expect(shared.length, 'the shipped program does put two nodes on one statement').toBeGreaterThan(0);
    for (const ids of shared) {
      const slots = ids.map((id) => id.split('-')[2]);
      expect(new Set(slots).size, 'two nodes on one statement with one slot').toBe(ids.length);
      // The statement alone is not the identity either — without the slot these
      // ids would be the same string.
      expect(new Set(ids.map((id) => id.split('-').slice(0, 2).join('-'))).size).toBe(1);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

test('a ring of macros does not take the reader down with it', () => {
  // Security audit of b88c77b, SEC-2026-227: the effect reader followed a macro
  // into itself with no floor; two DEFINEs naming each other were a stack
  // overflow, and one crafted upload the end of the analysis.
  const source = [
    'REPORT z_macro_ring.',
    'DEFINE loop_a.',
    '  loop_b.',
    'END-OF-DEFINITION.',
    'DEFINE loop_b.',
    '  loop_a.',
    "  SELECT SINGLE * FROM mara INTO @DATA(ls_mara) WHERE matnr = '1'.",
    'END-OF-DEFINITION.',
    'FORM read_it.',
    '  loop_a.',
    'ENDFORM.',
    'START-OF-SELECTION.',
    '  PERFORM read_it.',
  ].join('\n');
  const skeleton = buildProcessSkeleton(source);
  expect(skeleton).toBeTruthy();
});

/* -------------------------- b88c77b4b5d1 / CR-07 — the steps that were missing
 *
 * Three readings of a statement that the walker did not have: a source list
 * taken out of a literal, an ABAP SQL read that does not begin with SELECT, and
 * a functional method call that executes SQL. Each of them left the displayed
 * process without a step the program takes.
 */

test.describe('the steps the walker used to miss (b88c77b4b5d1, CR-07)', () => {
  const kindsOf = (source: string, kind: string) =>
    buildProcessSkeleton(source).nodes.filter((n) => n.kind === kind).map((n) => n.label);

  test('a FROM inside a literal draws no read (b785524eb15e)', () => {
    const code = [
      'REPORT zp.',
      'START-OF-SELECTION.',
      "  SELECT 'FROM KNA1' AS note FROM vbak INTO TABLE @DATA(rows).",
    ].join('\n');
    expect(kindsOf(code, 'read'), 'the table the statement reads, and only it').toEqual(['VBAK']);
  });

  test('a CTE and a cursor draw their read (854c7e288bb7)', () => {
    const cte = [
      'REPORT zp.',
      'START-OF-SELECTION.',
      '  WITH +m AS ( SELECT matnr FROM mara )',
      '    SELECT * FROM +m INTO TABLE @DATA(rows).',
    ].join('\n');
    expect(kindsOf(cte, 'read')).toEqual(['MARA']);
    const cursor = [
      'REPORT zp.',
      'DATA lc TYPE cursor.',
      'START-OF-SELECTION.',
      '  OPEN CURSOR lc FOR SELECT * FROM mara.',
    ].join('\n');
    expect(kindsOf(cursor, 'read')).toEqual(['MARA']);
  });

  test('the ADBC call is a step, and the CATCH hangs on it (CR-07)', () => {
    // CC-034. `lv_rows = lo_stmt->execute_update( lv_sql ).` is a functional
    // method call in an assignment: no keyword announces it, so the whole
    // effect of the program was absent from the flow — and because the
    // protected part of the TRY drew no node at all, the handler hung on
    // nothing and was reported as unreachable after an abort that the source
    // nowhere shows.
    const source = readFileSync(join(process.cwd(), 'tests/korpus/cases/CC-034/source.abap'), 'utf8');
    const skeleton = buildProcessSkeleton(source);
    const call = skeleton.nodes.find((n) => n.kind === 'call-opaque');
    expect(call, 'the statement that executes the SQL is a step').toBeTruthy();
    expect(call!.label).toBe('EXECUTE_UPDATE');
    expect(call!.anchor?.lineStart, 'anchored on the call, not on the assignment target').toBe(15);
    expect(call!.detail, 'it says the SQL is not in this statement').toMatchObject({
      nativeSql: true,
      statement: 'lv_sql',
    });

    const boundary = skeleton.nodes.find((n) => n.kind === 'error-boundary');
    expect(boundary!.detail?.attachedTo, 'the handler sits on the call').toBe(call!.id);
    expect(skeleton.edges.some((e) => e.from === call!.id && e.to === boundary!.id && e.kind === 'boundary'))
      .toBe(true);
    expect(skeleton.notes.map((n) => n.reason), 'nothing here is unreachable')
      .not.toContain('unreachable-after-abort');
  });

  test('a handler on a protected part that draws no step is still a path', () => {
    // The other half of the same rule: where there is nothing to attach to, the
    // CATCH stays connected to what entered the TRY rather than being called
    // unreachable.
    const code = [
      'REPORT zcatch.',
      'DATA lv_rows TYPE i.',
      'START-OF-SELECTION.',
      '  TRY.',
      '      lv_rows = lv_rows + 1.',
      '    CATCH cx_sy_arithmetic_error.',
      "      WRITE / 'ERROR'.",
      '  ENDTRY.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(code);
    const boundary = skeleton.nodes.find((n) => n.kind === 'error-boundary');
    expect(boundary, 'the handler is drawn').toBeTruthy();
    expect(skeleton.edges.some((e) => e.to === boundary!.id), 'and something leads to it').toBe(true);
    expect(skeleton.notes.map((n) => n.reason)).not.toContain('unreachable-after-abort');
  });
});

/* ================================================================== *
 * Roadmap 2.15 — a return code is the effect of a step, not a decision
 * ================================================================== */

/**
 * The three things 2.15 says it is finished when, each measured here rather
 * than argued: no activity is drawn with a boundary event **and** a `sy-subrc`
 * gateway behind it, the share of purely technical XOR has come down, and every
 * arm of every folded gateway is still a flow carrying the words the source
 * wrote on it.
 *
 * The condition rule itself is not tested here — it lives in
 * `lib/abap/element-comparability.ts` and `tests/element-comparability.spec.ts`
 * pins it. What is tested here is what the skeleton **does** with it.
 */
test.describe('roadmap 2.15 — a return code is the effect of a step', () => {
  /** Every technical marker of 2.15, so this file does not depend on the other spec. */
  const TECHNICAL = /\bSY-SUBRC\b|\bSY-TABIX\b|\bIS\s+(?:NOT\s+)?ASSIGNED\b|\bIS\s+(?:NOT\s+)?BOUND\b|\bLINES\s*\(/i;

  test('no activity carries a boundary event and a return-code gateway behind it (5 → 0)', () => {
    // The double drawing, and the number 2.15 names: 5 of 5 activities with a
    // boundary event were followed by a gateway that read the same `sy-subrc`.
    // `walkFunction` hung the boundary, `walkBranch` drew the `IF` anyway, and
    // the map said the same thing twice with two different symbols.
    const offenders: string[] = [];
    let boundaries = 0;
    for (const [file] of SHIPPED) {
      const skeleton = skeletonOf(file);
      const byId = new Map(skeleton.nodes.map((n) => [n.id, n]));
      for (const node of skeleton.nodes) {
        if (node.kind !== 'error-boundary') continue;
        boundaries += 1;
        for (const edge of skeleton.edges.filter((e) => e.from === node.id)) {
          const next = byId.get(edge.to);
          if (!next || next.kind !== 'gateway') continue;
          const conditions = skeleton.edges
            .filter((e) => e.from === next.id)
            .map((e) => e.condition)
            .filter((c) => c.trim());
          if (conditions.length && conditions.every((c) => TECHNICAL.test(c))) {
            offenders.push(`${file} ${next.id} ${next.label}`);
          }
        }
      }
    }
    console.log(`2.15: ${boundaries} boundary events over the eight examples, ${offenders.length} with a sy-subrc gateway behind them`);
    expect(offenders, offenders.join(' · ')).toHaveLength(0);
  });

  test('the share of purely technical gateways falls from 27 of 68 to 7 of 48', () => {
    // 2.15 asks for ≤ 10 % and calls the figure a setting, not a measured
    // optimum. It is **not reached**: 7 of 48 is 14,6 %, and the seven are
    // counted out one by one below rather than rounded away. Each of them fails
    // the rule as 2.15 writes it, and five of them for one and the same reason
    // — the statement that set `sy-subrc` draws no step of its own
    // (`AUTHORITY-CHECK`, `READ TABLE`), so there is nothing to hang the error
    // on and nothing that proves the branch is about the step in front of it.
    const remaining: string[] = [];
    let gateways = 0;
    for (const [file] of SHIPPED) {
      const skeleton = skeletonOf(file);
      for (const node of skeleton.nodes) {
        if (node.kind !== 'gateway') continue;
        gateways += 1;
        const conditions = skeleton.edges
          .filter((e) => e.from === node.id)
          .map((e) => e.condition)
          .filter((c) => c.trim());
        if (conditions.length && conditions.every((c) => TECHNICAL.test(c))) {
          remaining.push(`${file}:${node.anchor?.lineStart} ${node.label}`);
        }
      }
    }
    console.log(`2.15: ${remaining.length} of ${gateways} gateways are still purely technical — ${remaining.join(' · ')}`);
    expect(gateways).toBe(48);
    expect(remaining).toHaveLength(7);
    // Three `AUTHORITY-CHECK` and one `READ TABLE`: statements that set
    // `sy-subrc` and draw no node (the first is lane evidence, 2.16; the second
    // is not a database read). One `OPEN DATASET`, drawn as an `output` node,
    // which the predecessor half of the rule refuses on purpose since the QA
    // review of `9e408888bfec`. One condition that is half a business
    // comparison, which the fold will not move onto a boundary event. And one
    // `READ TABLE gt_return` between `BAPI_PO_CREATE1` and its `IF` — the
    // return code there is the table read's, not the call's.
    expect(remaining.filter((r) => r.includes('ZLEGACY'))).toHaveLength(3);
    expect(remaining.filter((r) => r.includes('Z_MM'))).toHaveLength(3);
    expect(remaining.filter((r) => r.includes('Z_INVOICE'))).toHaveLength(1);
  });

  test('every arm of every folded gateway is still a flow, with its words on it', () => {
    // The third acceptance of 2.15, and the one that makes the step safe: the
    // branch is not deleted, it starts one node further up. For a boundary event
    // the fold made, the error condition stands verbatim on the flow leaving it
    // — rule 6 is untouched — and the other arm leaves the step itself.
    let folded = 0;
    for (const [file] of SHIPPED) {
      const skeleton = skeletonOf(file);
      const byId = new Map(skeleton.nodes.map((n) => [n.id, n]));
      for (const node of skeleton.nodes) {
        if (node.kind !== 'error-boundary' || node.detail?.foldedGateway !== true) continue;
        folded += 1;
        // It hangs on a step, and something still leaves both of them: the error
        // arm from the boundary event, the other arm from the step.
        const step = byId.get(String(node.detail?.attachedTo ?? ''));
        expect(step, `${file} ${node.id} hangs on nothing`).toBeTruthy();
        expect(skeleton.edges.some((e) => e.from === step!.id && e.to === node.id && e.kind === 'boundary')).toBe(true);
        const fromBoundary = skeleton.edges.filter((e) => e.from === node.id);
        const fromStep = skeleton.edges.filter((e) => e.from === step!.id && e.kind !== 'boundary');
        expect(fromBoundary.length, `${file} ${node.id} leads nowhere`).toBeGreaterThan(0);
        expect(fromStep.length, `${file} ${step!.id} leads nowhere`).toBeGreaterThan(0);
        // And the words are still there. `IF sy-subrc <> 0.` writes them on the
        // error arm, `IF sy-subrc = 0. … ELSE.` on the other one — one of the
        // two carries the text of the source, verbatim, and which one is not
        // this engine's choice (rule 6).
        const written = [...fromBoundary, ...fromStep].map((e) => e.condition);
        expect(written.filter((c) => TECHNICAL.test(c)), `${file} ${node.id} lost its condition`)
          .not.toHaveLength(0);
        const condition = String(node.detail?.condition ?? '');
        if (condition) expect(fromBoundary.map((e) => e.condition)).toContain(condition);
      }
    }
    // 15 of the 20 folds keep the node (the gateway becomes the boundary); the
    // other 5 joined a boundary event `walkFunction` had already drawn and are
    // counted by the first test of this block.
    expect(folded).toBe(15);
  });

  test('one call, one boundary event, no gateway — and both arms still there', () => {
    const source = [
      'REPORT z_subrc.',
      'START-OF-SELECTION.',
      "  CALL FUNCTION 'Z_READ_ORDER'",
      "    EXPORTING vbeln = '1'",
      '    EXCEPTIONS not_found = 1 OTHERS = 2.',
      '  IF sy-subrc <> 0.',
      "    MESSAGE 'not found' TYPE 'E'.",
      '  ELSE.',
      '    UPDATE vbak SET lifsk = space.',
      '  ENDIF.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.nodes.filter((n) => n.kind === 'gateway'), 'the IF is not a decision').toHaveLength(0);
    const boundaries = skeleton.nodes.filter((n) => n.kind === 'error-boundary');
    expect(boundaries, 'and it is drawn once, not twice').toHaveLength(1);

    const call = skeleton.nodes.find((n) => n.kind === 'service-task')!;
    expect(skeleton.edges.filter((e) => e.from === call.id && e.kind === 'boundary'))
      .toHaveLength(1);
    // The error arm leaves the boundary event and says why, in the words of the
    // source; the normal arm leaves the call.
    const fromBoundary = skeleton.edges.filter((e) => e.from === boundaries[0].id);
    expect(fromBoundary.map((e) => e.condition)).toContain('sy-subrc <> 0');
    expect(fromBoundary.map((e) => skeleton.nodes.find((n) => n.id === e.to)?.kind)).toContain('end-error');
    const fromCall = skeleton.edges.filter((e) => e.from === call.id && e.kind !== 'boundary');
    expect(fromCall).toHaveLength(1);
    expect(skeleton.nodes.find((n) => n.id === fromCall[0].to)?.kind).toBe('write');
  });

  test('a decision on a business field behind the same call stays a decision', () => {
    // The other half of the rule, and the one that keeps it honest: the step is
    // about return codes, not about every `IF` that follows a call.
    const source = [
      'REPORT z_business.',
      'START-OF-SELECTION.',
      '  SELECT SINGLE * FROM vbak INTO @DATA(ls_vbak) WHERE vbeln = @gv_vbeln.',
      '  IF ls_vbak-netwr > 10000.',
      "    UPDATE vbak SET lifsk = 'X'.",
      '  ENDIF.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(source);
    const gateways = skeleton.nodes.filter((n) => n.kind === 'gateway');
    expect(gateways).toHaveLength(1);
    expect(gateways[0].label).toContain('netwr');
    expect(skeleton.nodes.filter((n) => n.kind === 'error-boundary')).toHaveLength(0);
  });

  test('a return-code gateway with no step in front of it stays a gateway', () => {
    // `AUTHORITY-CHECK` draws no node — it is lane evidence (2.16) — so the
    // `IF sy-subrc <> 0.` behind it has nothing to hang on. A fold here would
    // put the authorisation error on whatever step happened to stand above it,
    // and "we do not know" never becomes a drawing. This is four of the six
    // gateways the step leaves behind, and it is deliberate.
    const source = [
      'REPORT z_auth.',
      'START-OF-SELECTION.',
      "  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'ACTVT' FIELD '03'.",
      '  IF sy-subrc <> 0.',
      "    MESSAGE 'no authorisation' TYPE 'E'.",
      '  ENDIF.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.nodes.filter((n) => n.kind === 'gateway')).toHaveLength(1);
    expect(skeleton.nodes.filter((n) => n.kind === 'error-boundary')).toHaveLength(0);
  });

  test('the fold reads the graph the walk left, never its own result', () => {
    // `check_authority` of Z_MM_PO_APPROVAL, in miniature: a `SELECT` with its
    // own `IF sy-subrc`, and an `AUTHORITY-CHECK` with a second one behind it.
    // Folding the first moves the `SELECT`s other arm onto the `SELECT` — and if
    // the pass then read its own result, the authorisation error would hang on
    // that read. It does not: the second `IF` keeps its gateway.
    const source = [
      'REPORT z_two.',
      'START-OF-SELECTION.',
      '  SELECT SINGLE ekgrp FROM eban INTO @DATA(lv_ekgrp) WHERE banfn = @gv_banfn.',
      '  IF sy-subrc <> 0.',
      "    MESSAGE 'requisition not found' TYPE 'E'.",
      '  ENDIF.',
      "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02'.",
      '  IF sy-subrc <> 0.',
      "    MESSAGE 'no authorisation' TYPE 'E'.",
      '  ENDIF.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.nodes.filter((n) => n.kind === 'error-boundary'), 'the read reports itself').toHaveLength(1);
    expect(skeleton.nodes.filter((n) => n.kind === 'gateway'), 'the authorisation check does not').toHaveLength(1);
  });
});

/* ================================================================== *
 * Roadmap 2.16 — lanes: who acts
 * ================================================================== */

/**
 * A lane is the one element of this product that could say something about
 * **people**, and §8 of the roadmap forbids role lists and role mandates. So
 * every assertion here is about the same two things: a lane exists only where
 * the code proves an actor, and its name is a token the source itself contains.
 *
 * The reference holding of 1.246 SAP diagrams has 3.711 lanes, median 2 per
 * diagram, 71 % of them with at least two. Our maps had **none** until this
 * step. What follows is measured against the eight programs this product ships,
 * not against a snippet written to suit the rule.
 */
test.describe('roadmap 2.16 — lanes', () => {
  /** Every lane, over the eight shipped programs, with the source it came from. */
  const lanesOfShipped = () => SHIPPED.map(([file]) => ({
    file,
    source: read(file),
    lanes: skeletonOf(file).lanes,
  }));

  test('ZLEGACY carries exactly two lanes, both anchored: the run and the checker', () => {
    // The number 2.16 names. Four kinds of evidence are in this program —
    // AUTHORITY-CHECK (L197/L205), IN UPDATE TASK (L509), an ALV display (L616)
    // and a DESTINATION (L401) — and they make two lanes: the destination is a
    // collapsed pool and not a lane, the two authority checks name one and the
    // same object, and the program's own steps are one run however many things
    // that run does.
    const skeleton = skeletonOf(LEGACY);
    expect(skeleton.lanes).toHaveLength(2);
    const [run, checker] = skeleton.lanes;
    expect(run.kind).toBe('system');
    expect(run.name).toBe('UPDATE TASK');
    expect(run.anchor.lineStart).toBe(509);
    expect(run.nodeIds).toHaveLength(skeleton.nodes.length);
    expect(checker.kind).toBe('authority');
    expect(checker.name).toBe('V_VBAK_VKO');
    expect(checker.anchor.lineStart).toBe(197);
    // Two checks on one object are one actor.
    expect(checker.evidence.map((e) => e.anchor.lineStart)).toEqual([197, 205]);
    // §5.8: "Prüfer (außerhalb des Programms)". The checker runs no statement
    // of this program, so the lane holds no flow node — and claiming otherwise
    // would be a sentence the source does not contain.
    expect(checker.nodeIds).toEqual([]);
    for (const lane of skeleton.lanes) {
      expect(lane.anchor, `${lane.name} has a line anchor`).toBeTruthy();
      expect(lane.status).toBe('reconstructed');
    }
  });

  test('a program with no evidence has exactly one lane, named after itself', () => {
    // Four of the eight shipped programs prove nothing about who acts. Each of
    // them gets one lane, and its name is the program's own name out of the
    // `REPORT` statement — a token of the source, never a job title.
    const bare = lanesOfShipped().filter(({ lanes }) => lanes.every((l) => l.kind === 'program'));
    const withNodes = bare.filter(({ lanes }) => lanes.length > 0);
    expect(withNodes.length, 'four programs prove nothing about who acts').toBe(4);
    for (const { file, lanes } of withNodes) {
      expect(lanes, `${file} has exactly one lane`).toHaveLength(1);
      expect(lanes[0].evidence, `${file} has no evidence`).toEqual([]);
      expect(lanes[0].name.length, `${file}'s lane is named`).toBeGreaterThan(0);
    }
    // A source that draws no node at all is no process, and a process with no
    // steps has no actor either.
    const empty = skeletonOf('Z_ORDER_INTEGRITY_CHECK.txt');
    expect(empty.nodes).toHaveLength(0);
    expect(empty.lanes).toEqual([]);
  });

  test('no lane exists without a line anchor, and never more lanes than distinct evidence', () => {
    for (const [file] of SHIPPED) {
      const skeleton = skeletonOf(file);
      for (const lane of skeleton.lanes) {
        expect(lane.anchor, `${file} ${lane.name} is anchored`).toBeTruthy();
        expect(lane.anchor.lineStart, `${file} ${lane.name} has a real line`).toBeGreaterThan(0);
      }
      // "Lane-Zahl = Zahl verschiedener Beweise, nie mehr". Exactly: one lane
      // for the run, which exists wherever there is a process at all, and
      // beyond it one lane per **distinct** `AUTHORITY-CHECK` object and
      // nothing else. Human and system evidence names the run rather than
      // multiplying it, which is why the 1.000-line example has two lanes and
      // not four.
      const objects = new Set(
        skeleton.laneEvidence.filter((e) => e.kind === 'authority').map((e) => e.token),
      );
      const expected = skeleton.nodes.length ? Math.min(1 + objects.size, MAX_LANES) : 0;
      expect(skeleton.lanes.length, `${file}: ${objects.size} distinct authority objects`).toBe(expected);
      for (const lane of skeleton.lanes.slice(1)) {
        expect(lane.evidence.length, `${file} ${lane.name} rests on evidence`).toBeGreaterThan(0);
      }
    }
  });

  test('no lane name contains a token the source does not contain', () => {
    // The whole of §8 in one assertion. A lane is where a role list would creep
    // in, and `tests/process-naming.spec.ts` ("CFO is rejected") holds for a
    // deterministic lane too — so the test is not "is this word on a blacklist"
    // but "is this word in the file".
    for (const { file, source, lanes } of lanesOfShipped()) {
      const haystack = source.toUpperCase();
      for (const lane of lanes) {
        for (const token of lane.name.split(/\s+/).filter(Boolean)) {
          expect(
            haystack.includes(token.toUpperCase()),
            `${file}: "${token}" of lane "${lane.name}" is in the source`,
          ).toBe(true);
        }
      }
    }
  });

  test('evidence in code no entry point reaches opens no lane', () => {
    // `legacy_call_screen_example` holds the one `CALL SCREEN` of the
    // 1.000-line example, and no `PERFORM` names it: the skeleton lists the
    // routine under "not reached". 2.16 says such a piece of evidence does not
    // count, and the walk is what makes that true — the statement is never
    // passed, so it never reaches the evidence list at all.
    const skeleton = skeletonOf(LEGACY);
    expect(skeleton.notDrawn.unreached.map((r) => r.name)).toContain('LEGACY_CALL_SCREEN_EXAMPLE');
    expect(skeleton.laneEvidence.map((e) => e.anchor.lineStart)).not.toContain(670);
    expect(skeleton.lanes.map((l) => l.name)).not.toContain('SCREEN 9000');

    // And the counter-proof, so the assertion above is not green for the wrong
    // reason: the same statement in code an entry point does reach opens a lane.
    const reached = buildProcessSkeleton([
      'REPORT zreach.',
      'START-OF-SELECTION.',
      '  PERFORM show.',
      'FORM show.',
      '  CALL SCREEN 9000.',
      'ENDFORM.',
    ].join('\n'));
    expect(reached.lanes.map((l) => l.name)).toContain('SCREEN 9000');
    expect(reached.lanes[0].kind).toBe('human');
  });

  test('a DESTINATION is evidence and stays a pool, never a lane', () => {
    // §5.8 draws another system as a collapsed pool with a message flow, and
    // `lib/bpmn/model.ts` has done that since 2.6. 2.16 records the evidence so
    // the reason is visible, and opens no lane for it.
    const skeleton = skeletonOf(LEGACY);
    const foreign = skeleton.laneEvidence.filter((e) => e.kind === 'foreign-system');
    expect(foreign).toHaveLength(1);
    expect(foreign[0].anchor.lineStart).toBe(401);
    expect(skeleton.lanes.map((l) => l.name)).not.toContain(foreign[0].token);
  });

  test('one lane per distinct authority object, not one per check', () => {
    const source = [
      'REPORT zauth.',
      'START-OF-SELECTION.',
      "  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'ACTVT' FIELD '03'.",
      "  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'ACTVT' FIELD '02'.",
      "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02'.",
      '  WRITE / 1.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(source);
    const authority = skeleton.lanes.filter((l) => l.kind === 'authority');
    expect(authority.map((l) => l.name)).toEqual(['V_VBAK_VKO', 'M_BANF_EKG']);
    expect(authority[0].evidence).toHaveLength(2);
    expect(skeleton.laneEvidence.filter((e) => e.kind === 'authority')).toHaveLength(3);
  });

  test('the upper bound holds, and what it leaves out stays visible', () => {
    // "mit Obergrenze" (2.16). A source with more distinct authority objects
    // than `MAX_LANES` gets `MAX_LANES` lanes and not one more — and the
    // evidence it did not draw a lane for is still in `laneEvidence`, so
    // "not drawn" is visible rather than silent.
    const checks = Array.from({ length: MAX_LANES + 8 }, (_, i) =>
      `  AUTHORITY-CHECK OBJECT 'Z_OBJ_${i}' ID 'ACTVT' FIELD '02'.`);
    const skeleton = buildProcessSkeleton([
      'REPORT zmany.',
      'START-OF-SELECTION.',
      ...checks,
      '  WRITE / 1.',
    ].join('\n'));
    expect(skeleton.lanes).toHaveLength(MAX_LANES);
    expect(skeleton.laneEvidence.filter((e) => e.kind === 'authority')).toHaveLength(MAX_LANES + 8);
  });

  test('the lane changes nothing about the graph — 2.15 and the CC-055 argument hold', () => {
    // The warning this step was given: in `Z_MM_PO_APPROVAL/check_authority`
    // the only graph predecessor of the second `IF sy-subrc <> 0.` is the
    // `SELECT … FROM eban` of the *first* check. `AUTHORITY-CHECK` is lane
    // evidence now, with a name and an anchor — and it still draws no node, so
    // nothing can fold onto that read and claim the authorisation failed there.
    const skeleton = skeletonOf(PO);
    const authorityBranch = skeleton.nodes.find((n) => n.anchor?.lineStart === 111);
    expect(authorityBranch?.kind, 'the branch behind AUTHORITY-CHECK is still a gateway').toBe('gateway');
    const eban = skeleton.nodes.find((n) => n.kind === 'read' && n.label === 'EBAN');
    const hangingOnEban = skeleton.nodes.filter(
      (n) => n.kind === 'error-boundary' && n.detail?.attachedTo === eban?.id,
    );
    expect(
      hangingOnEban.map((n) => n.anchor?.lineStart),
      'nothing folded the authority check onto the read',
    ).not.toContain(111);
    // And no node was added anywhere: the counts are the ones 2.15 left behind.
    expect(skeleton.nodes).toHaveLength(110);
    expect(skeletonOf(LEGACY).nodes).toHaveLength(105);
  });
});

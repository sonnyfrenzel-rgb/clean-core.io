import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  classifyCondition,
  classifyElement,
  classifyElements,
  compareElement,
  hasOnlyTechnicalConditions,
  isTechnicalGateway,
  technicalMarkersIn,
  type ComparabilityClass,
  type ComparableElementKind,
} from '../lib/abap/element-comparability';
import {
  buildProcessSkeleton,
  type SkeletonNodeKind,
} from '../lib/abap/process-skeleton';

/**
 * Comparability per element — roadmap 7.8, §16 V6.
 *
 * The acceptance of 7.8 is measured over the eight programs this product ships,
 * not over snippets written to suit the reader:
 *
 *   - no end event, gateway, boundary event and no data store carries a
 *     standard candidate or "not covered";
 *   - every `call-opaque` stands as unknown;
 *   - the class function is pure (no import from `lib/bpmn`).
 *
 * The snippets below exist only for the questions the shipped programs do not
 * ask on their own: an opaque call (they have none — every `PERFORM` of theirs
 * has its routine in the same source) and a dynamic call target. Everything
 * else is counted on the eight programs, and the counts are pinned.
 */

const EXAMPLES = join(process.cwd(), 'public', 'starter-examples');

function exampleFiles(): string[] {
  return readdirSync(EXAMPLES)
    .filter((name) => /\.(abap|txt)$/i.test(name))
    .sort();
}

function skeletonOf(file: string) {
  return buildProcessSkeleton(readFileSync(join(EXAMPLES, file), 'utf8'));
}

/**
 * Every `SkeletonNodeKind` of 2.3, and the kind the comparability table decides
 * it by — a compile-time exhaustiveness check: 2.3 growing a kind breaks the
 * build here instead of landing silently as "not classified" in the product.
 *
 * All but one row is the identity. `parallel-gateway` (roadmap 2.17 (a)) is the
 * exception: `lib/abap/element-comparability.ts` does not name it yet, and 2.17
 * must not write in that file — the class table is 7.8's and 2.15 reads its
 * condition rule, so a kind added there is a decision taken in its own step.
 * Until then a parallel gateway is classified as the gateway it is, and the
 * translation stands here where a reader can see it rather than in a cast.
 */
const COMPARABLE_KIND: Record<SkeletonNodeKind, ComparableElementKind> = {
  start: 'start',
  end: 'end',
  'end-error': 'end-error',
  gateway: 'gateway',
  'parallel-gateway': 'gateway',
  loop: 'loop',
  'sub-process': 'sub-process',
  'call-activity': 'call-activity',
  transaction: 'transaction',
  'call-opaque': 'call-opaque',
  task: 'task',
  'service-task': 'service-task',
  'send-task': 'send-task',
  'user-task': 'user-task',
  'business-rule-task': 'business-rule-task',
  read: 'read',
  write: 'write',
  output: 'output',
  'error-boundary': 'error-boundary',
};

/** A skeleton node in the shape the class table reads, kind translated once. */
function comparable(node: { id: string; kind: SkeletonNodeKind; label?: string; detail?: Record<string, unknown> }) {
  return { id: node.id, kind: COMPARABLE_KIND[node.kind], label: node.label, detail: node.detail };
}

/** Every element of the eight examples, with its verdict. */
function allVerdicts() {
  const rows: Array<{
    file: string;
    id: string;
    kind: SkeletonNodeKind;
    label: string;
    comparability: ComparabilityClass;
    mayCarryStandardCandidate: boolean;
    reason: string;
  }> = [];
  for (const file of exampleFiles()) {
    const skeleton = skeletonOf(file);
    const verdicts = classifyElements(skeleton.nodes.map(comparable), skeleton.edges);
    for (const node of skeleton.nodes) {
      const verdict = verdicts.get(node.id)!;
      rows.push({ file, id: node.id, kind: node.kind, label: node.label, ...verdict });
    }
  }
  return rows;
}

test.describe('7.8 / §16 V6 — comparability per element', () => {
  test('the eight shipped examples are classified, and the counts are pinned', () => {
    const rows = allVerdicts();
    expect(exampleFiles()).toHaveLength(8);
    expect(rows.length).toBeGreaterThan(200);

    const byClass: Record<string, number> = {};
    const byKind: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      byClass[row.comparability] = (byClass[row.comparability] ?? 0) + 1;
      byKind[row.kind] = byKind[row.kind] ?? {};
      byKind[row.kind][row.comparability] = (byKind[row.kind][row.comparability] ?? 0) + 1;
    }
    // Printed so the numbers of the report are reproducible, not remembered.
    console.log('comparability over the eight examples:', JSON.stringify(byClass));
    console.log('per kind:', JSON.stringify(byKind));

    // Pinned, measured on 22.09.2026 over the eight shipped programs (292
    // elements). They are here so a change to the table or to 2.3 has to state
    // itself instead of moving a quarter of the map quietly.
    //
    // 287 since roadmap 2.15 built the rule this file wrote into the engine: 21
    // gateways that only read a return code behind a call, a read or a write are
    // now the boundary event on that step, and 5 of them joined a boundary event
    // that was already drawn — which is the only reason the total moved at all.
    // Nothing changed class: `technical` 110 → 105 is those 5 elements and no
    // reclassification, gateway → boundary is technical either way.
    //
    // 302 since roadmap 2.17 (b), and the two movements in it are separable.
    // **+15 `structural`**: fifteen `LOOP AT` bodies became regions of their own
    // and a region ends at an end event — `end` 61 → 76 and nothing else.
    // **3 elements from `technical` to `business-comparable`**: three call sites
    // that used to collapse into the one read or the one write their routine
    // does are built around a `LOOP AT`, and a routine that repeats a step per
    // row is a phase rather than one step, so they stand as `sub-process`
    // (`read` 30 → 27, `write` 23 → 20, `sub-process` 22 → 25). Not one element
    // was reclassified by the table; the skeleton drew different elements.
    expect(byClass).toEqual({
      structural: 106,
      technical: 102,
      'business-comparable': 70,
      unknown: 24,
    });
    // 48 gateways: 7 still technical by condition (14,6 %, from 27 of 68 before
    // 2.15), 18 on a business field, 23 unreadable. The business and the
    // unreadable counts are **unmoved**, which is the check that 2.15 took only
    // the return codes. The seven that stayed: four whose `sy-subrc` comes from
    // a statement that draws no step (`AUTHORITY-CHECK` ×3, `READ TABLE`), one
    // behind an `OPEN DATASET` (an `output` node, which the predecessor half
    // refuses on purpose), one condition that is half business
    // (`sy-subrc = 0 AND ls_eine-peinh > 0`), and one where a `READ TABLE`
    // stands between the call and the `IF` (`BAPI_PO_CREATE1`), so the return
    // code is the table read's and not the call's.
    expect(byKind['gateway']).toEqual({ technical: 7, 'business-comparable': 18, unknown: 23 });
    // The shapes the reference holding almost never draws — 76 end events (61
    // before 2.17 (b) gave fifteen loop bodies a plane, and a plane an end), 10
    // error ends, 19 data objects, 21 boundary events (6 before 2.15) — and not
    // one of them is business-comparable.
    expect(byKind['end']).toEqual({ structural: 76 });
    expect(byKind['end-error']).toEqual({ technical: 10 });
    expect(byKind['output']).toEqual({ structural: 19 });
    expect(byKind['error-boundary']).toEqual({ technical: 21 });

    // Every class is actually reached — a table that only ever says one thing
    // would pass every assertion below without deciding anything.
    expect(byClass['business-comparable']).toBeGreaterThan(0);
    expect(byClass['technical']).toBeGreaterThan(0);
    expect(byClass['structural']).toBeGreaterThan(0);
    expect(Object.keys(byClass).sort()).toEqual(
      ['business-comparable', 'structural', 'technical', 'unknown'].filter((c) => byClass[c]),
    );
  });

  test('no end event, gateway, boundary event or data store carries a standard candidate', () => {
    const rows = allVerdicts();
    const guarded: SkeletonNodeKind[] = ['end', 'end-error', 'gateway', 'error-boundary', 'read', 'write', 'output'];
    const offenders = rows.filter(
      (row) => guarded.includes(row.kind) && row.mayCarryStandardCandidate,
    );
    expect(offenders.map((o) => `${o.file}:${o.id}:${o.kind}`)).toEqual([]);

    // The stronger half of the acceptance: not one of them can reach
    // `not-covered` either, whatever a standard comparison claims.
    for (const row of rows.filter((r) => guarded.includes(r.kind))) {
      const result = compareElement(
        { comparability: row.comparability, mayCarryStandardCandidate: row.mayCarryStandardCandidate, reason: row.reason },
        { matched: false, conclusive: true },
      );
      expect(result.outcome).toBe('unknown');
      expect(['not-comparable', 'unknown']).toContain(result.display);
    }

    // And they are actually present — otherwise this test proves nothing.
    const counts = guarded.map((kind) => [kind, rows.filter((r) => r.kind === kind).length] as const);
    console.log('guarded kinds over the eight examples:', JSON.stringify(counts));
    expect(rows.filter((r) => r.kind === 'end' || r.kind === 'end-error').length).toBeGreaterThan(20);
    expect(rows.filter((r) => r.kind === 'gateway').length).toBeGreaterThan(20);
    expect(rows.filter((r) => r.kind === 'error-boundary').length).toBeGreaterThan(0);
  });

  test('every call-opaque stands as unknown', () => {
    const rows = allVerdicts();
    const opaque = rows.filter((r) => r.kind === 'call-opaque');
    // Measured, and worth saying out loud: the eight shipped examples contain
    // **no** opaque call at all — every `PERFORM` of theirs has its routine in
    // the same source. The acceptance "every call-opaque stands as unknown" is
    // therefore vacuous on them, so the rule is proven on a program that has one.
    console.log('call-opaque nodes over the eight examples:', opaque.length);
    expect(opaque).toEqual([]);

    const withOpaqueCall = [
      'REPORT z_opaque.',
      'START-OF-SELECTION.',
      '  PERFORM post_document IN PROGRAM zother_program.',
      '  WRITE / \'done\'.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(withOpaqueCall);
    const verdicts = classifyElements(skeleton.nodes.map(comparable), skeleton.edges);
    const calls = skeleton.nodes.filter((n) => n.kind === 'call-opaque');
    expect(calls.length).toBeGreaterThan(0);
    for (const node of calls) {
      expect(verdicts.get(node.id)!.comparability).toBe('unknown');
      expect(verdicts.get(node.id)!.mayCarryStandardCandidate).toBe(false);
    }
    const result = compareElement(
      { comparability: 'unknown', mayCarryStandardCandidate: false, reason: 'x' },
      { matched: false, conclusive: true },
    );
    expect(result.outcome).toBe('unknown');
    expect(result.display).toBe('unknown');
  });

  test('the 1.000-line example: end events are a quarter of the flow nodes and none is comparable', () => {
    const skeleton = skeletonOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const ends = skeleton.nodes.filter((n) => n.kind === 'end' || n.kind === 'end-error');
    const errorEnds = skeleton.nodes.filter((n) => n.kind === 'end-error');
    console.log(`ZLEGACY: ${ends.length} end events (${errorEnds.length} with an error definition) of ${skeleton.nodes.length} nodes`);
    // 27 until roadmap 2.17 (b): nine of this program's eleven `LOOP AT` bodies
    // are levels of their own now, and a level ends at an end event anchored at
    // its `ENDLOOP`.
    expect(ends.length).toBe(36);
    expect(errorEnds.length).toBe(4);
    // 105 since 2.15: one of this program's five technical gateways sat behind a
    // `CALL FUNCTION … EXCEPTIONS` that already carried a boundary event, and
    // the two of them are now one element. 114 since 2.17 (b) — nine loop-body
    // regions, each with an end event of its own.
    expect(skeleton.nodes.length).toBe(114);
    const verdicts = classifyElements(skeleton.nodes.map(comparable), skeleton.edges);
    for (const node of ends) {
      expect(verdicts.get(node.id)!.mayCarryStandardCandidate).toBe(false);
    }
  });

  test('the class function is pure — no import at all, and none from lib/bpmn', () => {
    const source = readFileSync(join(process.cwd(), 'lib', 'abap', 'element-comparability.ts'), 'utf8');
    // Not one import statement, so in particular none from `lib/bpmn`. The
    // words "lib/bpmn" do appear — in the head, saying why they must not.
    const imports = source.match(/^\s*import\s[^\n]*/gm) ?? [];
    expect(imports).toEqual([]);
    expect(source.match(/^\s*(?:const|let|var)\s[^\n]*\brequire\s*\(/gm) ?? []).toEqual([]);
    expect(source.match(/^\s*export\s+\*\s+from/gm) ?? []).toEqual([]);
  });

  test('every SkeletonNodeKind of 2.3 is named in the table', () => {
    // The table is `COMPARABLE_KIND` at the head of this file; this is what it
    // buys — every kind the skeleton can write reaches a row of the class table.
    const kinds = COMPARABLE_KIND;
    for (const kind of Object.values(kinds)) {
      const verdict = classifyElement({ id: 'x', kind }, { conditions: ['ls_a-b = 1'] });
      expect(verdict.reason).not.toContain('is not classified');
    }
  });
});

test.describe('the condition rule — written here so 2.15 can use it', () => {
  test('the five technical markers of 2.15, and nothing beyond them', () => {
    expect(classifyCondition('sy-subrc <> 0')).toBe('technical');
    expect(classifyCondition('SY-TABIX GT 1')).toBe('technical');
    expect(classifyCondition('<fs> IS ASSIGNED')).toBe('technical');
    expect(classifyCondition('lo_ref IS NOT BOUND')).toBe('technical');
    expect(classifyCondition('lines( lt_items ) = 0')).toBe('technical');
    // Named as deliberately absent in the module head.
    expect(classifyCondition('sy-index = 1')).toBe('unknown');
    expect(technicalMarkersIn('sy-subrc = 0 AND lines( lt_x ) > 1')).toEqual(['sy-subrc', 'lines( )']);
  });

  test('a comparison on a structure component is business — a bare local flag is unknown', () => {
    expect(classifyCondition('ls_order-netwr > 1000')).toBe('business');
    expect(classifyCondition('<fs_item>-werks = lv_plant')).toBe('business');
    expect(classifyCondition("lo_order->status = 'C'")).toBe('business');
    expect(classifyCondition('lv_done = abap_true')).toBe('unknown');
    expect(classifyCondition('')).toBe('none');
    // Mixed: the technical part is what the branch turns on.
    expect(classifyCondition('sy-subrc = 0 AND ls_order-netwr > 10')).toBe('technical');
  });

  test('a technical gateway needs both halves of the 2.15 rule', () => {
    expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0', ''], predecessorKinds: ['read'] })).toBe(true);
    expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'], predecessorKinds: ['gateway'] })).toBe(false);
    expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'], predecessorKinds: ['read', 'write'] })).toBe(false);
    expect(isTechnicalGateway({ conditions: ['ls_a-b = 1'], predecessorKinds: ['read'] })).toBe(false);
    expect(isTechnicalGateway({ conditions: [''], predecessorKinds: ['read'] })).toBe(false);
  });

  test('missing predecessor evidence never produces the positive class', () => {
    // The QA review of `9e408888bfec` (fingerprint `f51d99129444`): the helper
    // answered `true` when the predecessors were absent or empty, so a caller
    // without the graph got a `true` that read like the whole 2.15 rule. A
    // missing proof is `unknown`, and a guard has to treat unknown as "no".
    expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'] })).toBe(false);
    expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'], predecessorKinds: [] })).toBe(false);
    expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'], predecessorKinds: undefined })).toBe(false);
    // The condition half is still answerable without the graph — it just has to
    // be asked by name, and it never claims the predecessor half was checked.
    expect(hasOnlyTechnicalConditions(['sy-subrc <> 0'])).toBe(true);
    expect(hasOnlyTechnicalConditions(['sy-subrc <> 0', ''])).toBe(true);
    expect(hasOnlyTechnicalConditions(['ls_order-netwr > 1000'])).toBe(false);
    expect(hasOnlyTechnicalConditions([''])).toBe(false);
    expect(hasOnlyTechnicalConditions([])).toBe(false);
  });

  test('the predecessor half accepts only the call, read and write kinds its head names', () => {
    // Same finding, the other half: `task` and `output` stood in the effect set
    // although the documented rule says "a call, read or write node". `task` is
    // a step with no type of its own and `output` is a data object; neither sets
    // a return code a following branch could be about.
    const technical: ComparableElementKind[] = [
      'read', 'write', 'service-task', 'send-task', 'call-activity',
      'transaction', 'call-opaque', 'sub-process',
    ];
    for (const kind of technical) {
      expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'], predecessorKinds: [kind] })).toBe(true);
    }
    const notEvidence: ComparableElementKind[] = [
      'task', 'output', 'user-task', 'business-rule-task', 'gateway', 'loop',
      'start', 'end', 'end-error', 'error-boundary', 'data-object', 'data-store',
      'lane', 'pool', 'annotation',
    ];
    for (const kind of notEvidence) {
      expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'], predecessorKinds: [kind] })).toBe(false);
    }
  });

  test('the predecessor half over the eight shipped examples is counted, not assumed', () => {
    // Pinned like every other number of 7.8. Before the fix of `f51d99129444`
    // the full rule counted 19: one gateway passed with no known predecessor at
    // all, one sat behind an `output` node. Both then read as not proven
    // technical, and the condition half stood at 27 of 68.
    //
    // Since roadmap 2.15 the engine **acts** on this rule, so the numbers here
    // are what is left after it: 48 gateways, 7 technical by condition, 3 that
    // still pass the whole rule. The three are not a leak — they are the three
    // the fold refuses for a reason of its own: `sy-subrc = 0 AND
    // ls_eine-peinh > 0` is half a business condition; the second
    // `IF sy-subrc <> 0` of `check_authority` reads an `AUTHORITY-CHECK` that
    // draws no node, so its only predecessor in the graph is the `SELECT` above
    // it; and behind `BAPI_PO_CREATE1` a `READ TABLE gt_return` stands between
    // the call and the `IF`, so the return code is the table read's. All three
    // keep their gateway rather than hang an error on the wrong step.
    let gateways = 0;
    let byCondition = 0;
    let fullRule = 0;
    for (const file of exampleFiles()) {
      const skeleton = skeletonOf(file);
      const kindById = new Map<string, ComparableElementKind>();
      for (const node of skeleton.nodes) kindById.set(node.id, COMPARABLE_KIND[node.kind]);
      const outgoing = new Map<string, string[]>();
      const incoming = new Map<string, ComparableElementKind[]>();
      for (const edge of skeleton.edges) {
        const conditions = outgoing.get(edge.from) ?? [];
        conditions.push(edge.condition ?? '');
        outgoing.set(edge.from, conditions);
        const kind = kindById.get(edge.from);
        if (kind) {
          const sources = incoming.get(edge.to) ?? [];
          sources.push(kind);
          incoming.set(edge.to, sources);
        }
      }
      for (const node of skeleton.nodes) {
        if (node.kind !== 'gateway') continue;
        gateways += 1;
        const conditions = outgoing.get(node.id) ?? [];
        const predecessorKinds = incoming.get(node.id) ?? [];
        if (hasOnlyTechnicalConditions(conditions)) byCondition += 1;
        if (isTechnicalGateway({ conditions, predecessorKinds })) fullRule += 1;
      }
    }
    console.log(`gateways: ${gateways}, technical by condition: ${byCondition}, full 2.15 rule: ${fullRule}`);
    expect(gateways).toBe(48);
    expect(byCondition).toBe(7);
    expect(fullRule).toBe(3);
  });

  test('a gateway on a business field is comparable, but never carries a candidate', () => {
    const verdict = classifyElement({ id: 'g', kind: 'gateway' }, {
      conditions: ['ls_order-netwr > 1000', ''],
      predecessorKinds: ['task'],
    });
    expect(verdict.comparability).toBe('business-comparable');
    expect(verdict.mayCarryStandardCandidate).toBe(false);
  });

  test('a CASE on a structure component decides on a business field', () => {
    // The arms of a `CASE` carry only literals; the field is on the gateway.
    const verdict = classifyElement(
      { id: 'g', kind: 'gateway', label: 'gs_stock-mtart', detail: { branchKind: 'case' } },
      { conditions: ["'ROH'", "'HALB'", "'FERT'"], selector: 'gs_stock-mtart' },
    );
    expect(verdict.comparability).toBe('business-comparable');
    expect(verdict.mayCarryStandardCandidate).toBe(false);
  });

  test('a gateway on a return code is technical whatever stands in front of it', () => {
    // The class follows the condition; the predecessor half of 2.15 only
    // decides whether the export may re-shape the gateway.
    const verdict = classifyElement({ id: 'g', kind: 'gateway' }, {
      conditions: ['sy-subrc <> 0', ''],
      predecessorKinds: ['gateway', 'task'],
    });
    expect(verdict.comparability).toBe('technical');
    expect(isTechnicalGateway({ conditions: ['sy-subrc <> 0'], predecessorKinds: ['gateway', 'task'] })).toBe(false);
  });

  test('a dynamic target is unknown', () => {
    const verdict = classifyElement({ id: 'c', kind: 'call-activity', detail: { dynamic: true } });
    expect(verdict.comparability).toBe('unknown');
    expect(verdict.mayCarryStandardCandidate).toBe(false);
  });
});

test.describe('three outcomes, never two', () => {
  const business = classifyElement({ id: 't', kind: 'task' });

  test('technical and structural never say "no standard candidate"', () => {
    for (const kind of ['read', 'write', 'end', 'end-error', 'output', 'error-boundary'] as ComparableElementKind[]) {
      const result = compareElement(classifyElement({ id: 'x', kind }), { matched: false, conclusive: true });
      expect(result.display).toBe('not-comparable');
      expect(result.outcome).toBe('unknown');
    }
  });

  test('absence in the diagram is not a negative proof of function', () => {
    expect(compareElement(business, { matched: false, conclusive: false }).outcome).toBe('unknown');
    expect(compareElement(business, { matched: false, conclusive: true }).outcome).toBe('not-covered');
    expect(compareElement(business, { matched: true, conclusive: false, candidate: 'J45' }).outcome).toBe('covered');
    expect(compareElement(business, null).display).toBe('not-determined');
  });

  test('the outcome is always one of exactly three', () => {
    const outcomes = new Set<string>();
    for (const match of [null, { matched: true, conclusive: true }, { matched: false, conclusive: true }, { matched: false, conclusive: false }]) {
      outcomes.add(compareElement(business, match).outcome);
    }
    expect([...outcomes].sort()).toEqual(['covered', 'not-covered', 'unknown']);
  });
});


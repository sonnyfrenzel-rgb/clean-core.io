import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  classifyCondition,
  classifyElement,
  classifyElements,
  compareElement,
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
    const verdicts = classifyElements(skeleton.nodes, skeleton.edges);
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
    expect(byClass).toEqual({
      structural: 91,
      technical: 110,
      'business-comparable': 67,
      unknown: 24,
    });
    // 68 gateways: 27 technical by condition (39,7 %, the same order as the
    // 42,6 % 2.15 measured), 18 on a business field, 23 unreadable.
    expect(byKind['gateway']).toEqual({ technical: 27, 'business-comparable': 18, unknown: 23 });
    // The shapes the reference holding almost never draws — 61 end events, 10
    // error ends, 19 data objects, 6 boundary events — and not one of them is
    // business-comparable.
    expect(byKind['end']).toEqual({ structural: 61 });
    expect(byKind['end-error']).toEqual({ technical: 10 });
    expect(byKind['output']).toEqual({ structural: 19 });
    expect(byKind['error-boundary']).toEqual({ technical: 6 });

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
    const verdicts = classifyElements(skeleton.nodes, skeleton.edges);
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
    expect(ends.length).toBe(27);
    expect(errorEnds.length).toBe(4);
    expect(skeleton.nodes.length).toBe(106);
    const verdicts = classifyElements(skeleton.nodes, skeleton.edges);
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
    // A compile-time exhaustiveness check: 2.3 growing a kind breaks the build
    // here instead of landing silently as "not classified" in the product.
    const kinds: Record<SkeletonNodeKind, ComparableElementKind> = {
      start: 'start',
      end: 'end',
      'end-error': 'end-error',
      gateway: 'gateway',
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


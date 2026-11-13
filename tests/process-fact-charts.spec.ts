import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { readStatements } from '../lib/abap/statement-reader';
import { readBlocks } from '../lib/abap/block-structure';
import { readCallGraphFrom } from '../lib/abap/call-graph';
import { reachableWrites } from '../lib/abap/reachable-writes';
import { extractDataCoupling } from '../lib/abap/code-assessment';
import { caseEndsOf, dataUseOf, elementsAtLines, routineCallsOf } from '../lib/process-fact-charts';
import { spotlightPlane, spotlightSet } from '../lib/process-map-spotlight';

/**
 * AB-7 of `docs/design/analyze-business-first-plan.md` §4.2 — the two charts under the map, server-free, on every
 * starter example.
 *
 *   - *How a case can end* (P9) counts the map's own end events: every end on the top level, and every stop on the
 *     way on any level (an error end — `errorEventDefinition` — or an early end — `cc:trace/@early`). The count here
 *     is read from the BPMN file with nothing but a tag scan, so it does not lean on the chart's own reading.
 *   - *What it changes, what it only reads*: the changes are `reachableWrites`, the reads the data coupling.
 *   - Every row names map elements that exist, so a click lights something the reader can find.
 *   - Neither chart is part of a signed run or the audit pack.
 */

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public/starter-examples');
const EXAMPLES = fs.readdirSync(DIR).filter((f) => /\.(abap|txt)$/i.test(f)).sort();

function mapOf(file: string): { source: string; model: ProcessMapModel } {
  const source = fs.readFileSync(path.join(DIR, file), 'utf8');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  return { source, model: buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file }) };
}

/** The ends of a case, read off the file alone: top-level end events, and error or early end events on any level. */
function endsInFile(xml: string): { top: string[]; stops: string[] } {
  const top: string[] = [];
  const stops: string[] = [];
  const depthAt = (index: number) => {
    const before = xml.slice(0, index);
    return (before.match(/<bpmn:subProcess\b(?![^>]*\/>)/g) ?? []).length - (before.match(/<\/bpmn:subProcess>/g) ?? []).length;
  };
  for (const m of xml.matchAll(/<bpmn:endEvent\b([^>]*?)(\/>|>([\s\S]*?)<\/bpmn:endEvent>)/g)) {
    const id = /\sid="([^"]+)"/.exec(m[1])?.[1] ?? '';
    const body = m[3] ?? '';
    const stop = /<bpmn:errorEventDefinition\b/.test(body) || /<cc:trace\b[^>]*\searly="true"/.test(body);
    if (stop) stops.push(id);
    else if (depthAt(m.index ?? 0) === 0) top.push(id);
  }
  return { top, stops };
}

/** Regression figures for the shipped examples (13.11.2026): the map's ends, split into normal and stopped. */
const EXPECTED_ENDS: Record<string, [total: number, normal: number]> = {
  'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap': [9, 3],
  'Z_INVOICE_EXTRACTOR.txt': [2, 1],
  'Z_MATERIAL_STOCK_CALC.txt': [1, 1],
  'Z_MM_PO_APPROVAL.abap': [9, 1],
  'Z_SALES_ORDER_CREATOR.txt': [1, 1],
  'Z_SD_DELIVERY_PRIORITY.abap': [1, 1],
  'Z_SD_FREIGHT_RATE_CHECK.abap': [5, 1],
};

test('every shipped starter example has its expected figures here', () => {
  expect(EXAMPLES).toEqual(Object.keys(EXPECTED_ENDS).sort());
});

for (const file of EXAMPLES) {
  test(`${file}: "How a case can end" counts exactly the map's end events of a case`, () => {
    const { model } = mapOf(file);
    const chart = caseEndsOf(model);
    expect(chart, 'every example has at least one end').not.toBeNull();
    const ends = chart!;
    const inFile = endsInFile(model.xml);

    // The sums match the map.
    expect(ends.total).toBe(inFile.top.length + inFile.stops.length);
    expect(ends.rows.reduce((sum, r) => sum + r.count, 0)).toBe(ends.total);
    expect(ends.normal + ends.stopped).toBe(ends.total);
    expect(ends.stopped).toBe(inFile.stops.length);
    expect([ends.total, ends.normal]).toEqual(EXPECTED_ENDS[file]);

    // Every end once, by the map's own ids, and nothing else.
    const counted = ends.rows.flatMap((r) => r.elementIds);
    expect(new Set(counted).size).toBe(counted.length);
    expect([...counted].sort()).toEqual([...inFile.top, ...inFile.stops].sort());
    for (const row of ends.rows) {
      expect(row.count).toBe(row.elementIds.length);
      for (const id of row.elementIds) expect(model.elements.find((e) => e.id === id)?.tag, id).toBe('endEvent');
    }

    // The sentence says the same numbers, and the lines are the ends' anchors.
    expect(ends.sentence).toContain(String(ends.total));
    if (ends.stopped > 0 && ends.normal > 0) expect(ends.sentence).toContain(`${ends.stopped} stopped on the way`);
    const anchors = counted.map((id) => model.elements.find((e) => e.id === id)?.anchor?.lineStart).filter((n): n is number => !!n);
    expect(ends.lines).toEqual([...new Set(anchors)].sort((a, b) => a - b));
  });

  test(`${file}: changes come from reachableWrites, reads from the data coupling, and every row finds the map`, () => {
    const { source, model } = mapOf(file);
    const chart = dataUseOf(source, model, null);
    const statements = readStatements(source);
    const writes = reachableWrites({ source, statements, graph: readCallGraphFrom(statements, readBlocks(statements)) });
    const coupling = extractDataCoupling(source, null);
    if (!chart) {
      expect(writes).toEqual([]);
      expect(coupling.filter((c) => c.accessType === 'Read' || c.accessType === 'Read/Write')).toEqual([]);
      return;
    }

    // Changes: one row per object a reached write changes, with every reached write's line.
    expect(chart.changes.map((r) => r.key.replace(/^change:/, '')).sort()).toEqual([...new Set(writes.map((w) => `${w.kind}:${w.object}`))].sort());
    expect(chart.changes.flatMap((r) => r.lines).sort((a, b) => a - b)).toEqual([...new Set(writes.map((w) => w.lineStart))].sort((a, b) => a - b));

    // Reads: tables the data coupling reads, never one a reached write changes, never a possible target only.
    const changedTables = new Set(writes.filter((w) => w.kind === 'table-write').map((w) => w.object));
    const expectedReads = coupling
      .filter((c) => (c.accessType === 'Read' || c.accessType === 'Read/Write') && !c.possibleTargetOf?.length && !changedTables.has(c.tableName.toUpperCase()))
      .map((c) => c.tableName)
      .sort();
    expect(chart.reads.map((r) => r.key.replace(/^read:/, '')).sort()).toEqual(expectedReads);

    // Every id a row lights is on the map.
    const ids = new Set(model.elements.map((e) => e.id));
    for (const row of [...chart.changes, ...chart.reads]) for (const id of row.elementIds) expect(ids.has(id), `${row.key}: ${id}`).toBe(true);
    // Every change a run reaches is drawn somewhere a reader can find it.
    for (const row of chart.changes) expect(row.elementIds.length, `${row.key} lights nothing`).toBeGreaterThan(0);
  });
}

test('Z_MM_PO_APPROVAL: a stop inside a step lights that step on the levels above, and the map moves to its level', () => {
  const { model } = mapOf('Z_MM_PO_APPROVAL.abap');
  const ends = caseEndsOf(model)!;
  const check = ends.rows.find((r) => r.key.startsWith('stop:') && /Check requisition/.test(r.label));
  expect(check, ends.rows.map((r) => r.label).join(' | ')).toBeTruthy();
  expect(check!.count).toBe(3);
  const plane = spotlightPlane(model, check!.elementIds);
  expect(typeof plane).toBe('string');
  const lit = spotlightSet(model, check!.elementIds);
  // The collapsed step "Check requisition" on the top level is lit too.
  expect(lit.has(plane as string)).toBe(true);
  expect(model.elements.find((e) => e.id === plane)?.plane).toBeNull();
  // Elements on two levels: no single level to move to.
  const normal = ends.rows.find((r) => r.key === 'end')!;
  expect(spotlightPlane(model, [...normal.elementIds, ...check!.elementIds])).toBeUndefined();
});

test('Z_MM_PO_APPROVAL: a write in a routine called from a folded step finds that step', () => {
  const { source, model } = mapOf('Z_MM_PO_APPROVAL.abap');
  const statements = readStatements(source);
  // `UPDATE eban` stands in FORM hold_for_buyer, which CHECK_PRICE calls; CHECK_PRICE is drawn as one step.
  const line = source.split(/\r?\n/).findIndex((l) => /^\s*UPDATE eban\b/i.test(l)) + 1;
  expect(line).toBeGreaterThan(0);
  expect(elementsAtLines(model, [line])).toEqual([]);
  const lit = elementsAtLines(model, [line], routineCallsOf(statements));
  expect(lit.length).toBe(1);
  expect(model.elements.find((e) => e.id === lit[0])?.technicalName).toBe('CHECK_PRICE');
});

test('the charts are presentation: no signed run, audit pack or export reads them', () => {
  const signedSide = [
    'app/api/runs/create/route.ts',
    'lib/audit-pack.ts',
    'lib/audit-pack-verify.ts',
    'lib/bpmn/export.ts',
    'lib/process-map.ts',
  ];
  for (const rel of signedSide) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(text, rel).not.toMatch(/process-fact-charts|process-map-spotlight/);
  }
  const lib = fs.readFileSync(path.join(ROOT, 'lib/process-fact-charts.ts'), 'utf8');
  expect(lib).not.toMatch(/from 'react'|firebase|fetch\(/);
});

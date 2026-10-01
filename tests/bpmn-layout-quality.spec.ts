import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel, type ExportModel } from '../lib/bpmn/model';
import { plainLabels } from '../lib/abap/plain-language';
import { businessExcerpt } from '../lib/bpmn/excerpt';
import { layoutModel, planeDrawing, type Direction } from '../lib/bpmn/layout';
import { measureDrawing, segmentHitsBox, ZERO_METRICS } from '../lib/bpmn/layout-quality';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { textWidth, wrapText } from '../lib/bpmn/text-metrics';

/**
 * The BPMN layout is readable — counted, not eyeballed.
 *
 * On every shipped example and on every level of it (the top plane and each
 * sub-process plane), the drawing has **no** shape on a shape, no label on a
 * shape, a label or a line, no line through a shape, no two flows sharing a
 * stretch of line, no text wider or taller than its box, and no flow label
 * nearer another flow than its own. Zero, not a ceiling: a ratchet would let the
 * next diagram be a little worse than this one.
 *
 * The count is `lib/bpmn/layout-quality.ts`; the owner's complaints of
 * 01.10.2026 (a condition printed across arrows, a branch running down into an
 * unrelated task, a "yes" sitting on the wrong flow) are each one of its rules.
 */

const EXAMPLES = path.join(__dirname, '..', 'public', 'starter-examples');
const files = fs.readdirSync(EXAMPLES).filter((f) => /\.(abap|txt)$/.test(f)).sort();

function modelOf(file: string, names: 'plain' | 'technical' = 'technical'): ExportModel {
  const source = fs.readFileSync(path.join(EXAMPLES, file), 'utf8').replace(/\r\n/g, '\n');
  const skeleton = buildProcessSkeleton(source);
  return buildExportModel(skeleton, names === 'plain' ? { labels: plainLabels(skeleton, source) } : {});
}

for (const names of ['plain', 'technical'] as const) for (const direction of ['LR', 'TB'] as Direction[]) {
  for (const file of files) {
    test(`${file} (${direction}, ${names} names): every level is free of overlaps, crossings through shapes and misplaced labels`, () => {
      const model = modelOf(file, names);
      const layout = layoutModel(model, { direction });
      const failures: string[] = [];
      for (const container of model.containers) {
        const plane = layout.planes.get(container.id);
        expect(plane, container.id).toBeTruthy();
        const report = measureDrawing(planeDrawing(container, plane!, container === model.root ? model.pools : []));
        for (const key of ZERO_METRICS) {
          if (report[key] !== 0) failures.push(`${container.id} ${key}=${report[key]}: ${report.details.slice(0, 4).join(' | ')}`);
        }
        // Every flow is drawn: a flow the router gave up on would be missing, not crooked.
        for (const f of container.flows) {
          if (!plane!.shapes.has(f.sourceId) || !plane!.shapes.has(f.targetId)) continue;
          if (!plane!.edges.has(f.id)) failures.push(`${container.id}: flow ${f.id} not drawn`);
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
}

for (const file of files) {
  test(`${file} (reading surface: plain names, wrapped rows): every level is clean`, () => {
    const model = modelOf(file, 'plain');
    const layout = layoutModel(model, { wrap: 7 });
    const failures: string[] = [];
    for (const container of model.containers) {
      const plane = layout.planes.get(container.id)!;
      const report = measureDrawing(planeDrawing(container, plane, container === model.root ? model.pools : []));
      for (const key of ZERO_METRICS) if (report[key] !== 0) failures.push(`${container.id} ${key}=${report[key]}`);
      for (const f of container.flows) if (!plane.edges.has(f.id)) failures.push(`${container.id}: flow ${f.id} not drawn`);
      // A wrapped level is never wider than seven columns of the widest step.
      const xs = [...plane.shapes.values()].map((b) => b.x + b.width);
      expect(Math.max(...xs) - Math.min(...[...plane.shapes.values()].map((b) => b.x))).toBeLessThan(7 * 260 + 200);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
}

test('the business reading draws the report events as one flow, and the technical one keeps their bands', () => {
  const plain = modelOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'plain');
  const technical = modelOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'technical');
  expect(technical.root.bands.length).toBeGreaterThan(1);
  expect(plain.root.bands.length).toBe(1);
  // One start, one normal end on the top plane; every step of the technical top plane is still there.
  expect(plain.root.nodes.filter((n) => n.tag === 'startEvent')).toHaveLength(1);
  const steps = (m: ExportModel) => m.root.nodes.filter((n) => !n.tag.endsWith('Event')).map((n) => n.id).sort();
  expect(steps(plain)).toEqual(steps(technical));
  // Every flow joins two elements that exist.
  const ids = new Set(plain.root.nodes.map((n) => n.id));
  for (const f of plain.root.flows) {
    expect(ids.has(f.sourceId), f.id).toBe(true);
    expect(ids.has(f.targetId), f.id).toBe(true);
  }
});

for (const file of files) {
  test(`${file}: the business excerpt (top to bottom) is clean, and every element in it is anchored`, () => {
    const model = businessExcerpt(modelOf(file, 'plain'), { steps: 5 });
    const layout = layoutModel(model, { direction: 'TB' });
    const plane = layout.planes.get(model.root.id)!;
    const report = measureDrawing(planeDrawing(model.root, plane));
    const bad = ZERO_METRICS.filter((k) => report[k] !== 0).map((k) => `${k}=${report[k]}: ${report.details.slice(0, 3).join(' | ')}`);
    expect(bad, bad.join(' / ')).toEqual([]);
    for (const n of model.root.nodes) expect(n.anchorLabel ?? n.source.anchor, `${n.name} has no anchor`).toBeTruthy();
  });
}

test('the layout is deterministic: same model, same coordinates', () => {
  const a = layoutModel(modelOf('Z_MM_PO_APPROVAL.abap'));
  const b = layoutModel(modelOf('Z_MM_PO_APPROVAL.abap'));
  const flat = (l: ReturnType<typeof layoutModel>) => JSON.stringify([...l.planes].map(([id, p]) => [
    id, [...p.shapes], [...p.edges], [...p.labels], [...p.inside],
  ]));
  expect(flat(a)).toEqual(flat(b));
});

test('every line is orthogonal and docks on its own shapes', () => {
  const model = modelOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
  const layout = layoutModel(model);
  for (const container of model.containers) {
    const plane = layout.planes.get(container.id)!;
    for (const f of container.flows) {
      const points = plane.edges.get(f.id);
      if (!points) continue;
      for (let i = 1; i < points.length; i += 1) {
        const horizontal = points[i].y === points[i - 1].y;
        const vertical = points[i].x === points[i - 1].x;
        expect(horizontal || vertical, `${f.id} leg ${i}`).toBe(true);
      }
      const s = plane.shapes.get(f.sourceId)!;
      const t = plane.shapes.get(f.targetId)!;
      const near = (p: { x: number; y: number }, b: typeof s) =>
        p.x >= b.x - 1 && p.x <= b.x + b.width + 1 && p.y >= b.y - 1 && p.y <= b.y + b.height + 1;
      expect(near(points[0], s), `${f.id} starts on its source`).toBe(true);
      expect(near(points[points.length - 1], t), `${f.id} ends on its target`).toBe(true);
    }
  }
});

test('the owner\'s CHECK_REQUISITION case: no branch runs down into the column of an unrelated task', () => {
  const model = modelOf('Z_MM_PO_APPROVAL.abap');
  const layout = layoutModel(model);
  const container = model.containers.find((c) => c.nodes.some((n) => n.name.startsWith('IF gs_eban-frgkz')))!;
  const plane = layout.planes.get(container.id)!;
  for (const f of container.flows) {
    const points = plane.edges.get(f.id)!;
    for (const n of container.nodes) {
      if (n.id === f.sourceId || n.id === f.targetId || n.attachedTo === f.sourceId) continue;
      const box = plane.shapes.get(n.id)!;
      for (let i = 1; i < points.length; i += 1) {
        expect(segmentHitsBox(points[i - 1], points[i], box, 0), `${f.id} touches ${n.name}`).toBe(false);
      }
    }
  }
});

test('the export writes a BPMNLabel for every labelled element, at the layout\'s place', () => {
  const source = fs.readFileSync(path.join(EXAMPLES, 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
  const { xml } = buildBpmnExportFromSource(source, { processName: 'Z_MM_PO_APPROVAL', sourceFileName: 'Z_MM_PO_APPROVAL.abap' });
  const labels = xml.match(/<bpmndi:BPMNLabel>/g) ?? [];
  expect(labels.length).toBeGreaterThan(40);
  // A label sits inside its shape's or edge's DI element, after the geometry.
  expect(xml).toMatch(/<\/dc:Bounds>?\s*<bpmndi:BPMNLabel>|<dc:Bounds[^>]*\/>\s*<bpmndi:BPMNLabel>/);
  expect(xml).toMatch(/<di:waypoint[^>]*\/>\s*<bpmndi:BPMNLabel>/);
});

test('the text measure wraps like bpmn-js and never hands back a line wider than asked', () => {
  for (const text of ['ENRICH_MATERIALS_AND_STOCK', 'Limit missing or above 999999?', 'Stop: no sales organization (E001)']) {
    for (const width of [60, 90, 120]) {
      for (const line of wrapText(text, width, 12)) expect(textWidth(line, 12)).toBeLessThanOrEqual(width);
    }
  }
});

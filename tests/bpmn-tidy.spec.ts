import { test, expect } from '@playwright/test';
import { measureDrawing, type DrawnShape } from '../lib/bpmn/layout-quality';
import { tidyCanPlace, tidyPlane, type TidyInput } from '../lib/bpmn/tidy';

/**
 * "Tidy layout" in the editor — the export's layout engine over a diagram
 * somebody drew. Pure: a graph in, coordinates out, measured with the same
 * yardstick the export is held to (`layout-quality.ts`).
 */

const INPUT: TidyInput = {
  planeId: 'Process_1',
  nodes: [
    { id: 'start', type: 'bpmn:StartEvent', name: 'Order received', anchor: null },
    { id: 'check', type: 'bpmn:UserTask', name: 'Check the order with the customer', anchor: { lineStart: 12, lineEnd: 18 } },
    { id: 'gw', type: 'bpmn:ExclusiveGateway', name: 'Order complete?', anchor: { lineStart: 20, lineEnd: 20 } },
    { id: 'fix', type: 'bpmn:ManualTask', name: 'Ask for the missing data', anchor: null },
    { id: 'book', type: 'bpmn:ServiceTask', name: 'Book the order', anchor: { lineStart: 30, lineEnd: 44 } },
    { id: 'timeout', type: 'bpmn:BoundaryEvent', name: 'No answer in 2 days', anchor: null, attachedTo: 'fix' },
    { id: 'end', type: 'bpmn:EndEvent', name: 'Order booked', anchor: null },
    { id: 'cancel', type: 'bpmn:EndEvent', name: 'Order cancelled', anchor: null },
  ],
  flows: [
    { id: 'f1', sourceId: 'start', targetId: 'check', label: '' },
    { id: 'f2', sourceId: 'check', targetId: 'gw', label: '' },
    { id: 'f3', sourceId: 'gw', targetId: 'book', label: 'Yes' },
    { id: 'f4', sourceId: 'gw', targetId: 'fix', label: 'No' },
    { id: 'f5', sourceId: 'fix', targetId: 'check', label: '' },
    { id: 'f6', sourceId: 'book', targetId: 'end', label: '' },
    { id: 'f7', sourceId: 'timeout', targetId: 'cancel', label: '' },
  ],
  notes: [{ id: 'note', text: 'Drawn by hand in the editor.' }],
};

test.describe('tidy layout of an edited diagram', () => {
  test('every element gets a place, nothing overlaps and no line runs through a shape', () => {
    const result = tidyPlane(INPUT);
    for (const node of INPUT.nodes) expect(result.shapes.has(node.id), node.id).toBe(true);
    for (const flow of INPUT.flows) expect(result.edges.get(flow.id)?.length ?? 0, flow.id).toBeGreaterThanOrEqual(2);

    const kind = (type: string): DrawnShape['kind'] => (type.endsWith('Event') ? 'event' : type.endsWith('Gateway') ? 'gateway' : 'task');
    const shapes: DrawnShape[] = INPUT.nodes.map((n) => ({
      id: n.id,
      kind: kind(n.type),
      box: result.shapes.get(n.id)!,
      ...(n.attachedTo ? { attachedTo: n.attachedTo } : {}),
    }));
    const report = measureDrawing({
      shapes,
      labels: [],
      edges: INPUT.flows.map((f) => ({ id: f.id, kind: 'sequence' as const, points: result.edges.get(f.id)!, sourceId: f.sourceId, targetId: f.targetId })),
    });
    const hostCrossings = report.details.filter((d) => d === 'edge/shape f7 through fix').length;
    expect(report.shapeShape, report.details.join('\n')).toBe(0);
    expect(report.edgeThroughShape - hostCrossings, report.details.join('\n')).toBe(0);

    // Left to right along the main path.
    const x = (id: string) => result.shapes.get(id)!.x;
    expect(x('start')).toBeLessThan(x('check'));
    expect(x('check')).toBeLessThan(x('gw'));
    expect(x('gw')).toBeLessThan(x('book'));
    // The boundary event sits on its host's outline.
    const host = result.shapes.get('fix')!;
    const boundary = result.shapes.get('timeout')!;
    expect(boundary.x + boundary.width / 2).toBeGreaterThanOrEqual(host.x);
    expect(boundary.x + boundary.width / 2).toBeLessThanOrEqual(host.x + host.width);
  });

  test('stable: the same diagram is laid out the same way twice', () => {
    const a = tidyPlane(INPUT);
    const b = tidyPlane(INPUT);
    expect(JSON.stringify([...a.shapes])).toBe(JSON.stringify([...b.shapes]));
    expect(JSON.stringify([...a.edges])).toBe(JSON.stringify([...b.edges]));
  });

  test('tidy names what it can place, and leaves anything else to the reader', () => {
    expect(tidyCanPlace('bpmn:UserTask')).toBe(true);
    expect(tidyCanPlace('bpmn:EventBasedGateway')).toBe(true);
    expect(tidyCanPlace('bpmn:Lane')).toBe(false);
    expect(tidyCanPlace('bpmn:Participant')).toBe(false);
  });
});

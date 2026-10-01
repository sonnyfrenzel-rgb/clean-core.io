/**
 * The process that grows beside the code in the first look — mockup `s0`,
 * moments 1–3 — drawn as the top-down business excerpt of
 * `lib/bpmn/excerpt.ts`: the first steps of the main line and the decisions in
 * them that exit, every element anchored, laid out by `lib/bpmn/layout.ts`.
 *
 * Pure: skeleton in, positioned drawing out. One layout for both names — the
 * plain names size the boxes, and moments 1–2 write the technical name of the
 * source in the same box, so the picture does not jump when the names change
 * once in moment 3.
 *
 * Nothing is added: every node is a node of the export model with its anchor,
 * and the only lines are the model's flows.
 */
import type { ProcessSkeleton } from './abap/process-skeleton';
import { plainLabels } from './abap/plain-language';
import { buildExportModel, type BpmnTag } from './bpmn/model';
import { businessExcerpt } from './bpmn/excerpt';
import { layoutModel, nodeAnchor, type Bounds, type PlacedLabel, type Point } from './bpmn/layout';

export interface ExcerptNode {
  id: string;
  tag: BpmnTag;
  /** Plain name (moment 3 and after). */
  name: string;
  /** The source's token (moments 1–2). */
  technicalName: string;
  /** The first line the node stands on — the line that is lit when it grows. */
  line: number | null;
  anchor: string | null;
  error: boolean;
  box: Bounds;
  /** External label of an event or a gateway, where the layout put it. */
  label: PlacedLabel | null;
  /** Wrapped name inside an activity. */
  inside: string[] | null;
}

export interface ExcerptFlow {
  id: string;
  from: string;
  to: string;
  points: Point[];
  label: PlacedLabel | null;
}

export interface ExcerptDrawing {
  frame: Bounds;
  /** In the order the excerpt walks them — the order they grow in. */
  nodes: ExcerptNode[];
  flows: ExcerptFlow[];
}

const EMPTY: ExcerptDrawing = { frame: { x: 0, y: 0, width: 0, height: 0 }, nodes: [], flows: [] };

function firstLine(anchor: string | null, fallback: number | null): number | null {
  const m = anchor ? /L(\d+)/.exec(anchor) : null;
  return m ? Number(m[1]) : fallback;
}

export function firstLookExcerpt(skeleton: ProcessSkeleton | null, source: string, steps = 5): ExcerptDrawing {
  if (!skeleton || skeleton.nodes.length === 0) return EMPTY;
  try {
    const model = buildExportModel(skeleton, { labels: plainLabels(skeleton, source) });
    const excerpt = businessExcerpt(model, { steps });
    const plane = layoutModel(excerpt, { direction: 'TB' }).planes.get(excerpt.root.id);
    if (!plane) return EMPTY;
    const nodes: ExcerptNode[] = excerpt.root.nodes.flatMap((n) => {
      const box = plane.shapes.get(n.id);
      if (!box) return [];
      const anchor = nodeAnchor(n);
      return [{
        id: n.id,
        tag: n.tag,
        name: n.name,
        technicalName: n.technicalName,
        line: firstLine(anchor, n.source.anchor?.lineStart ?? null),
        anchor,
        error: n.error,
        box,
        label: plane.labels.get(n.id) ?? null,
        inside: plane.inside.get(n.id)?.lines ?? null,
      }];
    });
    const flows: ExcerptFlow[] = excerpt.root.flows.flatMap((f) => {
      const points = plane.edges.get(f.id);
      return points ? [{ id: f.id, from: f.sourceId, to: f.targetId, points, label: plane.labels.get(f.id) ?? null }] : [];
    });
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const b of [...nodes.map((n) => n.box), ...[...plane.labels.values()].map((l) => l.box)]) {
      grow(b.x, b.y);
      grow(b.x + b.width, b.y + b.height);
    }
    for (const f of flows) for (const p of f.points) grow(p.x, p.y);
    if (!Number.isFinite(minX)) return EMPTY;
    return { frame: { x: minX - 12, y: minY - 12, width: maxX - minX + 24, height: maxY - minY + 24 }, nodes, flows };
  } catch {
    // A source the layout cannot draw is not a reason to lose the first look:
    // the build-up then shows the lit lines and the counters without a drawing.
    return EMPTY;
  }
}

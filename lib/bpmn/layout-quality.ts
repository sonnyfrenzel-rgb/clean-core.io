import type { Bounds, Point } from './layout';
import { lineHeight, textWidth, wrapText } from './text-metrics';

/**
 * How readable a drawn process is, counted — the yardstick of the BPMN layout.
 *
 * A diagram that a reader cannot follow is not a smaller problem than a wrong
 * one: a condition printed across an arrow, an arrow that runs through a task
 * it does not touch, a "yes" that sits on the wrong line — each makes the
 * picture say something the code does not. So every one of those is counted
 * here, on the final coordinates, and `tests/bpmn-layout-quality.spec.ts`
 * holds the product at **zero** on every fixture and every level.
 *
 * The input is a neutral `Drawing` — boxes, label boxes with their lines,
 * polylines — so the same count runs over the workspace map (bpmn-js), the
 * landing page SVG and, for comparison, any other diagram laid out by
 * `layout.ts`.
 *
 * Pure, no DOM.
 */

export type ShapeKind = 'task' | 'event' | 'gateway' | 'store' | 'pool' | 'note';

export interface DrawnShape {
  id: string;
  kind: ShapeKind;
  box: Bounds;
  /** Text drawn inside the shape (tasks), already wrapped. */
  inside?: { lines: string[]; fontSize: number; bold?: boolean; padding: number; reserve: number };
  /** A boundary event sits on this host on purpose. */
  attachedTo?: string;
}

export interface DrawnLabel {
  id: string;
  /** The element the label names (a node or a flow id). */
  owner: string;
  box: Bounds;
  lines: string[];
  fontSize: number;
}

export interface DrawnEdge {
  id: string;
  kind: 'sequence' | 'association' | 'message';
  points: Point[];
  sourceId: string;
  targetId: string;
}

export interface Drawing {
  shapes: DrawnShape[];
  labels: DrawnLabel[];
  edges: DrawnEdge[];
}

export interface QualityReport {
  shapeShape: number;
  labelShape: number;
  labelLabel: number;
  labelEdge: number;
  edgeThroughShape: number;
  textOverflow: number;
  collinearOverlap: number;
  wrongLabel: number;
  edgeCrossings: number;
  associationCrossings: number;
  /** Width / height of the drawing's bounding box. */
  aspect: number;
  width: number;
  height: number;
  /** One line per finding, for a failing test to print. */
  details: string[];
}

/** The counts that must be zero. */
export const ZERO_METRICS = [
  'shapeShape', 'labelShape', 'labelLabel', 'labelEdge', 'edgeThroughShape', 'textOverflow', 'collinearOverlap', 'wrongLabel',
] as const satisfies ReadonlyArray<keyof QualityReport>;

function overlaps(a: Bounds, b: Bounds, inset = 0): boolean {
  return a.x + inset < b.x + b.width - inset && b.x + inset < a.x + a.width - inset
    && a.y + inset < b.y + b.height - inset && b.y + inset < a.y + a.height - inset;
}

function segments(points: Point[]): Array<[Point, Point]> {
  const out: Array<[Point, Point]> = [];
  for (let i = 1; i < points.length; i += 1) out.push([points[i - 1], points[i]]);
  return out;
}

/** Does the segment pass through the box's interior (shrunk by `inset`)? Liang–Barsky clip. */
export function segmentHitsBox(p: Point, q: Point, box: Bounds, inset = 1): boolean {
  const x0 = box.x + inset;
  const y0 = box.y + inset;
  const x1 = box.x + box.width - inset;
  const y1 = box.y + box.height - inset;
  if (x1 <= x0 || y1 <= y0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (pp: number, qq: number): boolean => {
    if (pp === 0) return qq > 0;
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, p.x - x0) || !clip(dx, x1 - p.x) || !clip(-dy, p.y - y0) || !clip(dy, y1 - p.y)) return false;
  return t1 - t0 > 1e-6;
}

function distanceToSegment(pt: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len)) : 0;
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}

function distanceBoxToPolyline(box: Bounds, points: Point[]): number {
  let best = Infinity;
  const corners: Point[] = [
    { x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height }, { x: box.x + box.width, y: box.y + box.height },
    { x: box.x + box.width / 2, y: box.y }, { x: box.x + box.width / 2, y: box.y + box.height },
    { x: box.x, y: box.y + box.height / 2 }, { x: box.x + box.width, y: box.y + box.height / 2 },
  ];
  for (const [a, b] of segments(points)) {
    if (segmentHitsBox(a, b, box, 0)) return 0;
    for (const c of corners) best = Math.min(best, distanceToSegment(c, a, b));
  }
  return best;
}

function crosses(a: [Point, Point], b: [Point, Point]): boolean {
  // Proper crossing of two axis-parallel (or general) segments, endpoints excluded.
  const d = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b[0], b[1], a[0]);
  const d2 = d(b[0], b[1], a[1]);
  const d3 = d(a[0], a[1], b[0]);
  const d4 = d(a[0], a[1], b[1]);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Length two segments share when they lie on one line (within `tol` px). */
function sharedLength(a: [Point, Point], b: [Point, Point], tol = 3): number {
  const ah = Math.abs(a[0].y - a[1].y) < 0.5;
  const bh = Math.abs(b[0].y - b[1].y) < 0.5;
  const av = Math.abs(a[0].x - a[1].x) < 0.5;
  const bv = Math.abs(b[0].x - b[1].x) < 0.5;
  if (ah && bh && Math.abs(a[0].y - b[0].y) < tol) {
    const lo = Math.max(Math.min(a[0].x, a[1].x), Math.min(b[0].x, b[1].x));
    const hi = Math.min(Math.max(a[0].x, a[1].x), Math.max(b[0].x, b[1].x));
    return hi - lo;
  }
  if (av && bv && Math.abs(a[0].x - b[0].x) < tol) {
    const lo = Math.max(Math.min(a[0].y, a[1].y), Math.min(b[0].y, b[1].y));
    const hi = Math.min(Math.max(a[0].y, a[1].y), Math.max(b[0].y, b[1].y));
    return hi - lo;
  }
  return 0;
}

export function measureDrawing(drawing: Drawing): QualityReport {
  const details: string[] = [];
  const r: QualityReport = {
    shapeShape: 0, labelShape: 0, labelLabel: 0, labelEdge: 0, edgeThroughShape: 0, textOverflow: 0,
    collinearOverlap: 0, wrongLabel: 0, edgeCrossings: 0, associationCrossings: 0, aspect: 0, width: 0, height: 0, details,
  };
  const { shapes, labels, edges } = drawing;
  const flowShapes = shapes.filter((s) => s.kind !== 'pool');

  for (let i = 0; i < flowShapes.length; i += 1) {
    for (let j = i + 1; j < flowShapes.length; j += 1) {
      const a = flowShapes[i];
      const b = flowShapes[j];
      if (a.attachedTo === b.id || b.attachedTo === a.id) continue;
      if (a.attachedTo && a.attachedTo === b.attachedTo) {
        if (overlaps(a.box, b.box)) {
          r.shapeShape += 1;
          details.push(`shape/shape ${a.id} × ${b.id}`);
        }
        continue;
      }
      if (overlaps(a.box, b.box)) {
        r.shapeShape += 1;
        details.push(`shape/shape ${a.id} × ${b.id}`);
      }
    }
  }

  for (const l of labels) {
    for (const s of shapes) {
      if (s.kind === 'pool') continue;
      if (overlaps(l.box, s.box)) {
        r.labelShape += 1;
        details.push(`label/shape ${l.owner} "${l.lines.join(' ')}" × ${s.id}`);
      }
    }
  }
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      if (overlaps(labels[i].box, labels[j].box)) {
        r.labelLabel += 1;
        details.push(`label/label ${labels[i].owner} × ${labels[j].owner}`);
      }
    }
  }
  for (const l of labels) {
    for (const e of edges) {
      if (segments(e.points).some(([a, b]) => segmentHitsBox(a, b, l.box, 0.5))) {
        r.labelEdge += 1;
        details.push(`label/edge ${l.owner} "${l.lines.join(' ')}" × ${e.id}`);
      }
    }
    // A label must fit its own lines.
    if (l.lines.some((line) => textWidth(line, l.fontSize) > l.box.width + 1) || l.lines.length * lineHeight(l.fontSize) > l.box.height + 1) {
      r.textOverflow += 1;
      details.push(`overflow label ${l.owner}`);
    }
  }

  for (const e of edges) {
    for (const s of shapes) {
      if (s.kind === 'pool') continue;
      // The leg that docks on a round or pointed outline may cut the corner of
      // its own end's box; every other leg may not.
      const legs = segments(e.points).filter((_, i, all) => !(
        (i === 0 && s.id === e.sourceId) || (i === all.length - 1 && s.id === e.targetId)));
      if (legs.some(([a, b]) => segmentHitsBox(a, b, s.box, 2))) {
        r.edgeThroughShape += 1;
        details.push(`edge/shape ${e.id} through ${s.id}`);
      }
    }
  }

  // The name and the anchor inside an activity, centred as both renderers
  // centre them: a boundary event on the host's foot must not sit on them.
  for (const s of shapes) {
    if (!s.inside) continue;
    const lh = lineHeight(s.inside.fontSize);
    const blockH = s.inside.lines.length * lh + s.inside.reserve;
    const blockW = Math.max(...s.inside.lines.map((l) => textWidth(l, s.inside!.fontSize, s.inside!.bold)), 1);
    const block: Bounds = {
      x: s.box.x + s.box.width / 2 - blockW / 2,
      y: s.box.y + s.box.height / 2 - blockH / 2,
      width: blockW,
      height: blockH + (s.inside.reserve ? 0 : 0),
    };
    for (const b of shapes) {
      if (b.attachedTo !== s.id) continue;
      if (overlaps(block, b.box)) {
        r.textOverflow += 1;
        details.push(`boundary ${b.id} on the text of ${s.id}`);
      }
    }
  }
  for (const s of shapes) {
    if (!s.inside) continue;
    const { lines, fontSize, bold, padding, reserve } = s.inside;
    const lh = lineHeight(fontSize);
    const wide = lines.some((line) => textWidth(line, fontSize, bold) > s.box.width - 2 * padding + 0.5);
    const tall = lines.length * lh + reserve > s.box.height - 2 * padding + 0.5;
    if (wide || tall) {
      r.textOverflow += 1;
      details.push(`overflow ${s.id} "${lines.join(' / ')}"`);
    }
  }

  const seq = edges.filter((e) => e.kind === 'sequence');
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i];
      const b = edges[j];
      let shared = 0;
      let crossing = 0;
      for (const sa of segments(a.points)) {
        for (const sb of segments(b.points)) {
          shared += Math.max(0, sharedLength(sa, sb));
          if (crosses(sa, sb)) crossing += 1;
        }
      }
      if (shared > 2) {
        r.collinearOverlap += 1;
        details.push(`collinear ${a.id} = ${b.id} (${Math.round(shared)} px)`);
      }
      if (a.kind === 'sequence' && b.kind === 'sequence') r.edgeCrossings += crossing;
      else if (a.kind !== b.kind) r.associationCrossings += crossing;
    }
  }

  for (const l of labels) {
    const own = seq.find((e) => e.id === l.owner);
    if (!own) continue;
    const mine = distanceBoxToPolyline(l.box, own.points);
    const nearestOther = Math.min(Infinity, ...seq.filter((e) => e !== own).map((e) => distanceBoxToPolyline(l.box, e.points)));
    if (mine > 24 || nearestOther <= mine) {
      r.wrongLabel += 1;
      details.push(`label of ${own.id} "${l.lines.join(' ')}" is ${Math.round(mine)} px from its flow, ${Math.round(nearestOther)} px from another`);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (b: Bounds) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  };
  shapes.forEach((s) => grow(s.box));
  labels.forEach((l) => grow(l.box));
  edges.forEach((e) => e.points.forEach((p) => grow({ x: p.x, y: p.y, width: 0, height: 0 })));
  if (minX !== Infinity) {
    r.width = Math.round(maxX - minX);
    r.height = Math.round(maxY - minY);
    r.aspect = r.height ? Math.round((r.width / r.height) * 100) / 100 : 0;
  }
  return r;
}

/** Sum of reports, for a table over many planes. */
export function addReports(a: QualityReport, b: QualityReport): QualityReport {
  const out = { ...a, details: [...a.details, ...b.details] };
  for (const key of [...ZERO_METRICS, 'edgeCrossings', 'associationCrossings'] as const) out[key] = a[key] + b[key];
  return out;
}

export function emptyReport(): QualityReport {
  return {
    shapeShape: 0, labelShape: 0, labelLabel: 0, labelEdge: 0, edgeThroughShape: 0, textOverflow: 0,
    collinearOverlap: 0, wrongLabel: 0, edgeCrossings: 0, associationCrossings: 0, aspect: 0, width: 0, height: 0, details: [],
  };
}

/* ------------------------------------------------------------------ *
 * How bpmn-js places a label when the file gives it no bounds — used
 * to measure a layout written before labels had DI of their own.
 * ------------------------------------------------------------------ */

export function bpmnJsDefaultShapeLabel(shape: Bounds, text: string, fontSize = 11): { box: Bounds; lines: string[] } {
  const lines = wrapText(text, 90, fontSize);
  const width = Math.max(...lines.map((l) => textWidth(l, fontSize)), 1);
  const height = lines.length * lineHeight(fontSize);
  return { box: { x: shape.x + shape.width / 2 - width / 2, y: shape.y + shape.height, width, height }, lines };
}

export function bpmnJsDefaultFlowLabel(points: Point[], text: string, fontSize = 11): { box: Bounds; lines: string[] } {
  const mid = points.length / 2 - 1;
  const first = points[Math.floor(mid)];
  const second = points[Math.ceil(mid + 0.01)];
  let x = first.x + (second.x - first.x) / 2;
  let y = first.y + (second.y - first.y) / 2;
  const angle = Math.atan((second.y - first.y) / (second.x - first.x));
  if (Math.abs(angle) < Math.PI / 2) y -= 15;
  else x += 15;
  const lines = wrapText(text, 90, fontSize);
  const width = Math.max(...lines.map((l) => textWidth(l, fontSize)), 1);
  const height = lines.length * lineHeight(fontSize);
  return { box: { x: x - width / 2, y: y - 10, width, height }, lines };
}

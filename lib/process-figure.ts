import { anchorText, LABEL_FONT, ANCHOR_FONT, TASK_PADDING } from '@/lib/bpmn/layout';
import { lineHeight, textWidth, wrapText } from '@/lib/bpmn/text-metrics';
import { parseBpmn, type ProcessMapModel } from '@/lib/process-map';

/**
 * Figure 1 of the process description (ADR-127 (2), (3)): Analyze's map, read-only — the same top level, the same
 * shapes where the layout put them, the same names and the same line anchors — drawn without bpmn-js, so the page,
 * the Confluence page, the print and the Word file carry one picture (owner acceptance of
 * `docs/roadmap/documentation-v2-mockup.html`, 15.11.2026; `processOverviewSvg`, a one-column redraw of the main
 * path, retired with it).
 *
 * Read from the map's own file: the diagram interchange of its top plane (`bpmndi:BPMNShape` bounds,
 * `bpmndi:BPMNEdge` waypoints, `bpmndi:BPMNLabel` boxes) for where things stand, and the flow nodes' `name` for what
 * they say — the names bpmn-js draws in Analyze. Pools, lanes, data stores and annotations are not drawn: a figure in
 * a document shows the flow; the map in Analyze shows the rest.
 *
 * `figureParts` lays the figure out for an A4 page (ADR-127 (3), "fit to A4 in parts"; owner 26.11.2026: "im Bildumbruch
 * nicht lesbar"). The layout wraps a long process into rows, so a figure is read row by row: a wide figure goes on a
 * landscape page rather than shrinking below a readable size, and a tall one is cut between rows — never through a
 * shape, a name or a flow's label — into parts read top to bottom, each with a caption that says where it continues.
 * Only a figure too wide even for landscape is also cut between columns.
 *
 * Pure: no DOM, no I/O. Every text that reaches an SVG string goes through `escapeXml`.
 */

export type FigureShapeKind = 'task' | 'gateway' | 'start' | 'end' | 'early-end' | 'event';

export interface FigureShape {
  id: string;
  kind: FigureShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The name as the map draws it. */
  name: string;
  /** The name broken into the lines the box holds. */
  lines: string[];
  /** Where the name stands: inside the shape (a task) or in its own box under or above it. */
  labelBox: { x: number; y: number; width: number; height: number } | null;
  /** `L42`, `L46–48`; null for an element without an anchor. */
  anchor: string | null;
  /** The step number shown on the figure — the step's place in chapter 1; null for anything that is not a step. */
  step: number | null;
}

export interface FigureEdge {
  id: string;
  points: Array<{ x: number; y: number }>;
  /** Where the layout put the flow's label, when it did. */
  labelBox: { x: number; y: number; width: number; height: number } | null;
  /** "Yes", "No", a value — what the flow says on the map; empty for none. */
  label: string;
}

export interface ProcessFigure {
  /** The process as the map names it — the figure's title. */
  title: string;
  shapes: FigureShape[];
  edges: FigureEdge[];
  /** The bounding box of everything drawn, with a margin. */
  box: { x: number; y: number; width: number; height: number };
}

/** One part of a figure cut for a page: the slice of the drawing it shows. */
export interface FigurePart {
  index: number;
  count: number;
  x: number;
  width: number;
  /** The top of the slice; the figure's own top when the figure is not cut between rows. */
  y: number;
  height: number;
}

/** The text area a figure is printed into, in CSS px at 96 dpi. */
export interface FigurePage {
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
}

const MARGIN = 16;
/** The text width of an A4 page with 2 cm margins, in CSS px (170 mm at 96 dpi). */
export const A4_TEXT_WIDTH_PX = 642;
/** The text area of an A4 page upright with 2 cm margins (170 × 257 mm). */
export const A4_PORTRAIT: FigurePage = { orientation: 'portrait', width: 642, height: 971 };
/**
 * The text area of an A4 page on its side with 1.27 cm margins (271.6 × 184.6 mm) — the page a wide figure is printed
 * on in Word and in print, so its names stay readable.
 */
export const A4_LANDSCAPE: FigurePage = { orientation: 'landscape', width: 1026, height: 697 };
/**
 * The smallest scale a figure is printed at: the map's 12 px names at about 6 pt, its 11 px line anchors a little
 * under. Below it a figure is cut rather than shrunk.
 */
export const FIGURE_MIN_SCALE = 0.65;
/** Room on a page for the caption under a part and the paragraph spacing around it. */
export const FIGURE_CAPTION_ROOM = 56;

const ACTIVITY = new Set(['task', 'serviceTask', 'sendTask', 'receiveTask', 'userTask', 'manualTask', 'businessRuleTask', 'scriptTask', 'callActivity', 'subProcess']);
const GATEWAY = new Set(['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway']);

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The body of the plane a reader sees first: the one written as the top plane, else the first one. */
function topPlane(xml: string): string {
  const planes = [...xml.matchAll(/<bpmndi:BPMNPlane\b([^>]*)>([\s\S]*?)<\/bpmndi:BPMNPlane>/g)];
  if (planes.length === 0) return '';
  const top = planes.find((p) => attrsOf(p[1]).id === 'plane') ?? planes[0];
  return top[2];
}

interface DiShape {
  bounds: { x: number; y: number; width: number; height: number };
  label: { x: number; y: number; width: number; height: number } | null;
}

function boundsOf(body: string): { x: number; y: number; width: number; height: number } | null {
  const m = /<dc:Bounds\b([^>]*)\/?>/.exec(body);
  if (!m) return null;
  const a = attrsOf(m[1]);
  return { x: num(a.x), y: num(a.y), width: num(a.width), height: num(a.height) };
}

interface DiEdge {
  points: Array<{ x: number; y: number }>;
  label: { x: number; y: number; width: number; height: number } | null;
}

function diOf(plane: string): { shapes: Map<string, DiShape>; edges: Map<string, DiEdge> } {
  const shapes = new Map<string, DiShape>();
  for (const m of plane.matchAll(/<bpmndi:BPMNShape\b([^>]*?)(\/>|>([\s\S]*?)<\/bpmndi:BPMNShape>)/g)) {
    const id = attrsOf(m[1]).bpmnElement;
    const body = m[3] ?? '';
    const labelAt = body.indexOf('<bpmndi:BPMNLabel');
    const own = labelAt >= 0 ? body.slice(0, labelAt) : body;
    const bounds = boundsOf(own);
    if (!id || !bounds) continue;
    shapes.set(id, { bounds, label: labelAt >= 0 ? boundsOf(body.slice(labelAt)) : null });
  }
  const edges = new Map<string, DiEdge>();
  for (const m of plane.matchAll(/<bpmndi:BPMNEdge\b([^>]*)>([\s\S]*?)<\/bpmndi:BPMNEdge>/g)) {
    const id = attrsOf(m[1]).bpmnElement;
    const points = [...m[2].matchAll(/<di:waypoint\b([^>]*)\/?>/g)].map((w) => {
      const a = attrsOf(w[1]);
      return { x: num(a.x), y: num(a.y) };
    });
    const labelAt = m[2].indexOf('<bpmndi:BPMNLabel');
    if (id && points.length >= 2) edges.set(id, { points, label: labelAt >= 0 ? boundsOf(m[2].slice(labelAt)) : null });
  }
  return { shapes, edges };
}

const kindOf = (tag: string, early: boolean): FigureShapeKind | null => {
  if (ACTIVITY.has(tag)) return 'task';
  if (GATEWAY.has(tag)) return 'gateway';
  if (tag === 'startEvent') return 'start';
  if (tag === 'endEvent') return early ? 'early-end' : 'end';
  if (tag === 'intermediateCatchEvent' || tag === 'intermediateThrowEvent') return 'event';
  return null;
};

/**
 * The figure of a map's top level. `steps` numbers the shapes the description lists as steps (element id → number);
 * the numbers on the figure are the numbers of chapter 1. Null when the map's file carries no diagram to draw.
 */
export function processFigure(
  model: Pick<ProcessMapModel, 'xml' | 'elements' | 'processName'>,
  steps: ReadonlyMap<string, number> = new Map(),
): ProcessFigure | null {
  const plane = topPlane(model.xml);
  if (!plane) return null;
  const di = diOf(plane);
  const parsed = parseBpmn(model.xml);
  const names = new Map(parsed.elements.map((e) => [e.id, e.name]));
  const shapes: FigureShape[] = [];
  for (const element of model.elements) {
    if (element.plane !== null) continue;
    const kind = kindOf(element.tag, element.early);
    const at = di.shapes.get(element.id);
    if (!kind || !at) continue;
    const name = (names.get(element.id) ?? element.label ?? '').trim();
    const inside = kind === 'task';
    const box = inside ? null : at.label ?? { x: at.bounds.x - 30, y: at.bounds.y + at.bounds.height + 4, width: at.bounds.width + 60, height: 30 };
    const wrapWidth = inside ? Math.max(20, at.bounds.width - 2 * TASK_PADDING) : Math.max(40, box?.width ?? 90);
    shapes.push({
      id: element.id,
      kind,
      ...at.bounds,
      name,
      lines: name ? wrapText(name, wrapWidth, LABEL_FONT) : [],
      labelBox: box,
      anchor: anchorText(element.anchor),
      step: steps.get(element.id) ?? null,
    });
  }
  const drawn = new Set(shapes.map((s) => s.id));
  const edges: FigureEdge[] = parsed.flows
    .filter((f) => drawn.has(f.sourceRef) && drawn.has(f.targetRef) && di.edges.has(f.id))
    .map((f) => ({ id: f.id, points: di.edges.get(f.id)!.points, labelBox: di.edges.get(f.id)!.label, label: f.label.trim() }));
  if (shapes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, w = 0, h = 0) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  for (const s of shapes) {
    const [l, t, r, b] = shapeExtent(s);
    grow(l, t, r - l, b - t);
  }
  for (const e of edges) {
    for (const p of e.points) grow(p.x, p.y);
    const lb = edgeLabelExtent(e);
    if (lb) grow(lb.x, lb.y, lb.width, lb.height);
  }
  return {
    title: model.processName,
    shapes,
    edges,
    box: { x: minX - MARGIN, y: minY - MARGIN, width: maxX - minX + 2 * MARGIN, height: maxY - minY + 2 * MARGIN },
  };
}

/** Where a shape draws: its outline, its name and its line anchor — [left, top, right, bottom]. */
function shapeExtent(s: FigureShape): [number, number, number, number] {
  if (!s.labelBox) return [s.x, s.y, s.x + s.width, s.y + s.height];
  const anchorLine = s.anchor ? lineHeight(ANCHOR_FONT) + 2 : 0;
  const nameHeight = Math.max(s.labelBox.height, Math.max(1, s.lines.length) * lineHeight(LABEL_FONT));
  const wide = Math.max(s.labelBox.width, ...s.lines.map((l) => textWidth(l, LABEL_FONT)));
  const cx = s.labelBox.x + s.labelBox.width / 2;
  return [
    Math.min(s.x, cx - wide / 2),
    Math.min(s.y, s.labelBox.y),
    Math.max(s.x + s.width, cx + wide / 2),
    Math.max(s.y + s.height, s.labelBox.y + nameHeight + anchorLine),
  ];
}

/** The box a flow's label is drawn in, or null for a flow without one. */
export function edgeLabelExtent(edge: Pick<FigureEdge, 'points' | 'labelBox' | 'label'>): { x: number; y: number; width: number; height: number } | null {
  if (!edge.label) return null;
  const at = edgeLabelAt(edge);
  return { x: at.x - 2, y: at.y - ANCHOR_FONT, width: textWidth(edge.label, ANCHOR_FONT) + 4, height: ANCHOR_FONT + 4 };
}

/** The page a figure is printed on: upright when it reads there at `FIGURE_MIN_SCALE` or larger, else on its side. */
export function figurePage(figure: ProcessFigure): FigurePage {
  return figure.box.width * FIGURE_MIN_SCALE <= A4_PORTRAIT.width ? A4_PORTRAIT : A4_LANDSCAPE;
}

/** The one scale every part of a figure is printed at — the same size of names in every part, never above 1. */
export function figureScale(figure: ProcessFigure, page: FigurePage = figurePage(figure)): number {
  return Math.max(FIGURE_MIN_SCALE, Math.min(1, page.width / figure.box.width));
}

/** Cuts across the x axis at the gaps between columns of shapes, parts of about equal width. */
function columnCuts(figure: ProcessFigure, maxWidth: number): number[] {
  const { x: x0, width } = figure.box;
  const spans = [
    ...figure.shapes.map((s) => shapeExtent(s)).map(([l, , r]) => [l - 4, r + 4] as const),
    ...figure.edges.map(edgeLabelExtent).filter((b): b is NonNullable<typeof b> => b !== null).map((b) => [b.x - 2, b.x + b.width + 2] as const),
  ];
  const blocked = (x: number) => spans.some(([l, r]) => x > l && x < r);
  const end = x0 + width;
  const cuts: number[] = [];
  let start = x0;
  while (end - start > maxWidth) {
    const left = Math.ceil((end - start) / maxWidth);
    const aim = Math.min(start + maxWidth, start + (end - start) / left);
    let cut = aim;
    for (let d = 0; d <= maxWidth / 2; d += 4) {
      if (aim + d <= start + maxWidth && !blocked(aim + d)) { cut = aim + d; break; }
      if (aim - d > start + maxWidth / 4 && !blocked(aim - d)) { cut = aim - d; break; }
    }
    // No gap in reach: the cut stands at the aim; a shape is split across two parts rather than lost.
    cuts.push(cut);
    start = cut;
  }
  return cuts;
}

/**
 * Cuts across the y axis between rows of shapes: each part takes as many whole rows as fit its page, the cut as low
 * as it can stand — never through a shape, its name, its anchor or a flow's label, and off a flow running along it.
 */
function rowCuts(figure: ProcessFigure, maxHeight: number): number[] {
  const { y: y0, height } = figure.box;
  const spans = [
    ...figure.shapes.map((s) => shapeExtent(s)).map(([, t, , b]) => [t - 4, b + 4] as const),
    ...figure.edges.map(edgeLabelExtent).filter((b): b is NonNullable<typeof b> => b !== null).map((b) => [b.y - 2, b.y + b.height + 2] as const),
  ];
  // A flow running along a cut would be split lengthwise: keep the cut a few px off it.
  const runs = figure.edges.flatMap((e) => e.points.slice(1).filter((p, i) => Math.abs(p.y - e.points[i].y) < 1).map((p) => [p.y - 6, p.y + 6] as const));
  const blocked = (y: number) => spans.some(([t, b]) => y > t && y < b);
  const onRun = (y: number) => runs.some(([t, b]) => y > t && y < b);
  const end = y0 + height;
  const cuts: number[] = [];
  let start = y0;
  while (end - start > maxHeight) {
    let cut = start + maxHeight;
    let found = false;
    for (const avoidRuns of [true, false]) {
      for (let y = start + maxHeight; y > start + maxHeight / 4; y -= 2) {
        if (!blocked(y) && !(avoidRuns && onRun(y))) { cut = y; found = true; break; }
      }
      if (found) break;
    }
    // No gap in reach (one shape or name taller than a whole part): the cut stands at the page's height, so that one
    // item is split across two parts rather than lost — the one case a cut goes through a shape (QA dcd327b64308).
    cuts.push(cut);
    start = cut;
  }
  return cuts;
}

/**
 * The figure laid out for its page (`figurePage`): one part when it fits at `figureScale`, else parts read top to
 * bottom (and, only for a figure too wide even on its side, left to right within a band of rows).
 */
export function figureParts(figure: ProcessFigure, page: FigurePage = figurePage(figure)): FigurePart[] {
  const scale = figureScale(figure, page);
  const { x: x0, y: y0, width, height } = figure.box;
  const xs = [x0, ...columnCuts(figure, page.width / scale), x0 + width];
  const ys = [y0, ...rowCuts(figure, (page.height - FIGURE_CAPTION_ROOM) / scale), y0 + height];
  const slices: Array<Omit<FigurePart, 'index' | 'count'>> = [];
  for (let r = 0; r < ys.length - 1; r += 1) {
    for (let c = 0; c < xs.length - 1; c += 1) slices.push({ x: xs[c], width: xs[c + 1] - xs[c], y: ys[r], height: ys[r + 1] - ys[r] });
  }
  return slices.map((p, i) => ({ ...p, index: i + 1, count: slices.length }));
}

/** The figure's caption: "Figure 1 · Order approval · 29 elements" — with the part when it is cut. */
export function figureCaption(figure: ProcessFigure, part?: Pick<FigurePart, 'index' | 'count'>): string {
  const n = figure.shapes.length;
  const base = `Figure 1 · ${figure.title || 'Process map'} · ${n} ${n === 1 ? 'element' : 'elements'} on the top level`;
  if (!part || part.count <= 1) return base;
  const where = [
    part.index > 1 ? `continued from part ${part.index - 1}` : '',
    part.index < part.count ? `continues in part ${part.index + 1}` : '',
  ].filter(Boolean).join(', ');
  return `${base} · part ${part.index} of ${part.count} (${where})`;
}

/* ------------------------------------------------------------------ the SVG text */

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const INK = '#0f172a';
const MUTED = '#475569';
const LINE = '#94a3b8';
const FILL = '#ffffff';
const STEP_FILL = '#e2e8f0';

/** The drawing of one shape: its outline, its number, its name and its anchor. */
export function shapeGeometry(s: FigureShape): {
  outline: { kind: 'rect' | 'diamond' | 'circle'; x: number; y: number; width: number; height: number; strong: boolean };
  name: Array<{ x: number; y: number; text: string }>;
  anchor: { x: number; y: number; text: string } | null;
  number: { cx: number; cy: number; text: string } | null;
} {
  const lh = lineHeight(LABEL_FONT);
  const cx = s.x + s.width / 2;
  const outline = {
    kind: s.kind === 'task' ? 'rect' as const : s.kind === 'gateway' ? 'diamond' as const : 'circle' as const,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    strong: s.kind === 'end' || s.kind === 'early-end',
  };
  let name: Array<{ x: number; y: number; text: string }>;
  let anchor: { x: number; y: number; text: string } | null = null;
  if (s.kind === 'task') {
    const anchorRoom = s.anchor ? lineHeight(ANCHOR_FONT) : 0;
    const top = s.y + (s.height - anchorRoom - s.lines.length * lh) / 2 + LABEL_FONT;
    name = s.lines.map((text, i) => ({ x: cx, y: top + i * lh, text }));
    if (s.anchor) anchor = { x: cx, y: s.y + s.height - 6, text: s.anchor };
  } else {
    const box = s.labelBox!;
    const bx = box.x + box.width / 2;
    name = s.lines.map((text, i) => ({ x: bx, y: box.y + LABEL_FONT + i * lh, text }));
    if (s.anchor) anchor = { x: bx, y: box.y + LABEL_FONT + Math.max(1, s.lines.length) * lh + 2, text: s.anchor };
  }
  const number = s.step !== null && s.kind === 'task' ? { cx: s.x + 12, cy: s.y + 12, text: String(s.step) } : null;
  return { outline, name, anchor, number };
}

/** The arrow head at the end of an edge, as a closed path. */
export function arrowHead(points: ReadonlyArray<{ x: number; y: number }>): string {
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const at = (a: number) => `${(last.x - 9 * Math.cos(angle + a)).toFixed(1)} ${(last.y - 9 * Math.sin(angle + a)).toFixed(1)}`;
  return `M${last.x} ${last.y} L${at(0.4)} L${at(-0.4)} Z`;
}

/** Where an edge's label stands: in the box the layout gave it, else just after the flow leaves its source. */
export function edgeLabelAt(edge: Pick<FigureEdge, 'points' | 'labelBox'>): { x: number; y: number } {
  if (edge.labelBox) return { x: edge.labelBox.x, y: edge.labelBox.y + ANCHOR_FONT };
  const [p, q] = edge.points;
  const horizontal = Math.abs(p.y - q.y) < 2;
  return horizontal ? { x: p.x + 8, y: p.y - 6 } : { x: p.x + 6, y: q.y > p.y ? p.y + 16 : p.y - 8 };
}

/**
 * The figure, or one part of it, as a standalone SVG — for the Confluence page, the Word file and the print. Every
 * text is escaped; the markup is our own. `width` is the width the SVG asks to be drawn at, in px.
 */
export function processFigureSvg(figure: ProcessFigure, part?: FigurePart, width?: number): string {
  const x = part ? part.x : figure.box.x;
  const w = part ? part.width : figure.box.width;
  const y = part ? part.y : figure.box.y;
  const h = part ? part.height : figure.box.height;
  const drawWidth = Math.round(width ?? w * figureScale(figure));
  const drawHeight = Math.round((h * drawWidth) / w);
  const font = `font-family="Inter, Arial, sans-serif"`;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(figureCaption(figure, part))}" width="${drawWidth}" height="${drawHeight}" viewBox="${x} ${y} ${w} ${h}" ${font}>`);
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`);
  for (const e of figure.edges) {
    out.push(`<path d="M${e.points.map((p) => `${p.x} ${p.y}`).join(' L')}" fill="none" stroke="${MUTED}" stroke-width="1.5"/>`);
    out.push(`<path d="${arrowHead(e.points)}" fill="${MUTED}"/>`);
  }
  for (const s of figure.shapes) {
    const g = shapeGeometry(s);
    const o = g.outline;
    const stroke = `stroke="${o.strong ? INK : LINE}" stroke-width="${o.strong ? 3 : 1.5}"`;
    if (o.kind === 'rect') out.push(`<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="10" fill="${FILL}" ${stroke}/>`);
    else if (o.kind === 'diamond') {
      const cx = o.x + o.width / 2;
      const cy = o.y + o.height / 2;
      out.push(`<path d="M${cx} ${o.y} L${o.x + o.width} ${cy} L${cx} ${o.y + o.height} L${o.x} ${cy} Z" fill="${FILL}" ${stroke}/>`);
    } else out.push(`<circle cx="${o.x + o.width / 2}" cy="${o.y + o.height / 2}" r="${Math.min(o.width, o.height) / 2}" fill="${FILL}" ${stroke}/>`);
    if (g.number) {
      out.push(`<circle cx="${g.number.cx}" cy="${g.number.cy}" r="9" fill="${STEP_FILL}"/>`);
      out.push(`<text x="${g.number.cx}" y="${g.number.cy + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="${INK}">${escapeXml(g.number.text)}</text>`);
    }
    for (const t of g.name) out.push(`<text x="${t.x}" y="${t.y}" font-size="${LABEL_FONT}" text-anchor="middle" fill="${INK}">${escapeXml(t.text)}</text>`);
    if (g.anchor) out.push(`<text x="${g.anchor.x}" y="${g.anchor.y}" font-size="${ANCHOR_FONT}" text-anchor="middle" fill="${MUTED}" font-family="Consolas, monospace">${escapeXml(g.anchor.text)}</text>`);
  }
  // A flow's label last, on white: a label the layout set against a line or a shape still reads.
  for (const e of figure.edges) {
    const box = edgeLabelExtent(e);
    if (!box) continue;
    const at = edgeLabelAt(e);
    out.push(`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#ffffff"/>`);
    out.push(`<text x="${at.x}" y="${at.y}" font-size="${ANCHOR_FONT}" fill="${MUTED}">${escapeXml(e.label)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

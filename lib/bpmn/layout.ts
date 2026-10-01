import type { BpmnTag, ExportContainer, ExportFlow, ExportModel, ExportNode } from './model';
import { measureDrawing, ZERO_METRICS, type Drawing, type DrawnShape, type QualityReport, type ShapeKind } from './layout-quality';
import { Router, type PortChoice, type Side } from './router';
import { blockWidth, lineHeight, textWidth, wrapText } from './text-metrics';

/**
 * Automatic layout of the BPMN export — roadmap 2.6, the half that decides
 * *where*; rebuilt for readability on 01.10.2026.
 *
 * **Why an own layout and not a library.** `bpmn-auto-layout` leaves text
 * annotations, associations and message flows without a place, and those carry
 * what this export must show; `elkjs` is well over a megabyte, asynchronous and
 * knows nothing of BPMN labels. The hard part of a layered layout — breaking
 * cycles — the skeleton has already done: every loop-back is marked.
 *
 * What the layout guarantees, and `tests/bpmn-layout-quality.spec.ts` checks on
 * every fixture and level (`layout-quality.ts`): no shape on a shape, no label on
 * a shape, a label or a line, no line through a shape, no two flows sharing a
 * stretch of line, no text wider or taller than its box, and every flow label
 * nearer its own flow than any other. It gets there by construction and, where
 * construction is not enough, by **measuring its own result** and opening the
 * gaps next to whatever still collides, until nothing does.
 *
 * The drawing rules:
 *
 * - **Left to right by rank** (`direction: 'LR'`, the export and the workspace)
 *   or **top to bottom** (`'TB'`, an excerpt on a narrow page). A node's rank is
 *   the longest forward path from the start of its band.
 * - **The main path stays on one line.** At a split the branch that reaches the
 *   end of the region, and of those the longest, continues the line; every other
 *   branch takes the first free row beside it.
 * - **Labels have a place of their own**: a gateway's question above-left of the
 *   diamond (BPMN convention), an event's name under the circle, a branch label
 *   on the first leg of its flow next to the gateway, a table under its store,
 *   each with the line anchor under the name. The text is wrapped here, with the
 *   rule bpmn-js wraps by (`text-metrics.ts`), so the box holds what is drawn.
 * - **Flows are routed orthogonally around shapes and labels** (`router.ts`),
 *   each port side handing out separate docking points, so two flows never meet
 *   on one line.
 * - **Stable**: the same model gives the same coordinates. Every order is the
 *   model's order; no step is a heuristic that can flip on a small change
 *   (`DESIGN.md` §5.9, rule 10 — users learn where a step is).
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Direction = 'LR' | 'TB';

/** An external label: the name lines, and the anchor line under them. */
export interface PlacedLabel {
  /** Name and anchor together — what nothing else may touch. */
  box: Bounds;
  /** The name lines only — what a BPMN file's `BPMNLabel` bounds describe. */
  nameBox: Bounds;
  lines: string[];
  fontSize: number;
  /** `L12` / `L12–15`, drawn under the name in the mono face; null without one. */
  anchor: string | null;
}

/** Text drawn inside an activity. */
export interface InsideText {
  lines: string[];
  fontSize: number;
  anchor: string | null;
  /** One fact about a phase, read from its plane ("2 decisions · 1 error end"); null when none. */
  fact: string | null;
}

export interface PlaneLayout {
  shapes: Map<string, Bounds>;
  edges: Map<string, Point[]>;
  /** External labels by element id (events, gateways, data store references, labelled flows). */
  labels: Map<string, PlacedLabel>;
  /** Wrapped names inside activities, by element id. */
  inside: Map<string, InsideText>;
}

export interface DiagramLayout {
  /** Container id → its plane. The root container's plane also holds pools and message flows. */
  planes: Map<string, PlaneLayout>;
  /** Present when the model has foreign systems, and so a collaboration. */
  participant?: Bounds;
  direction: Direction;
}

export interface LayoutOptions {
  direction?: Direction;
  /**
   * Most columns in one row of a band. A longer band continues on a row block
   * below, the line running round to its start like a line of text — a wide
   * level reads without scrolling sideways (owner, 01.10.2026). Off by default.
   */
  wrap?: number;
}

/* ------------------------------------------------------------------ *
 * Sizes and type
 * ------------------------------------------------------------------ */

/** Labels and activity names, 12 px: the meta step of the type scale. */
export const LABEL_FONT = 12;
/** The line anchor under a name, mono. */
export const ANCHOR_FONT = 11;
/** Inner padding of an activity, as bpmn-js lays out an embedded label. */
export const TASK_PADDING = 8;

const EVENT = 36;
const GATEWAY_LR = 50;
const GATEWAY_TB = 40;
const STORE = 50;
const TASK_H = 80;
const TASK_WIDTHS = [100, 120, 140, 160, 180, 200];
const TASK_TB_MIN = 170;
const MAX_TASK_LINES = 3;
/** Extra height of an activity that carries a boundary event. */
export const BOUNDARY_ROOM = 26;
const NOTE_W = 560;
const POOL_H = 60;
const POOL_GAP = 40;

const ORIGIN_X = 180;
const ORIGIN_Y = 80;
const BAND_GAP = 60;
const COL_GAP = 56;
const ROW_GAP = 44;
/** Clearance between a routed line and a shape. */
const CLEAR = 8;
const GROW = 18;
const MAX_ROUNDS = 14;

const EVENT_LABEL_W = 120;
const GATEWAY_LABEL_W = 140;
const FLOW_LABEL_W = 120;
const STORE_LABEL_W = 110;

export function anchorText(a: { lineStart: number; lineEnd: number } | null | undefined): string | null {
  if (!a) return null;
  return a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`;
}

/** The anchor a node shows: its own label when it stands for several places, else its line range. */
export function nodeAnchor(n: ExportNode): string | null {
  return n.anchorLabel ?? anchorText(n.source.anchor);
}

export function anchorWidth(text: string): number {
  // The mono face: every glyph 0.62 em, with the same margin as the sans.
  return Math.ceil(text.length * 0.62 * ANCHOR_FONT * 1.06);
}

const isEvent = (tag: BpmnTag) => tag.endsWith('Event');
const isGateway = (tag: BpmnTag) => tag.endsWith('Gateway');
const kindOf = (tag: BpmnTag): ShapeKind => (isEvent(tag) ? 'event' : isGateway(tag) ? 'gateway' : 'task');

/** The wrapped name of an activity and the box it needs. */
export function taskText(name: string, anchor: string | null, direction: Direction, fact?: string): { lines: string[]; width: number; height: number } {
  const lh = lineHeight(LABEL_FONT);
  const reserve = (anchor ? lineHeight(ANCHOR_FONT) : 0) + (fact ? lineHeight(ANCHOR_FONT) : 0);
  const factFits = (width: number) => !fact || textWidth(fact, ANCHOR_FONT) <= width - 2 * TASK_PADDING;
  if (direction === 'TB') {
    for (const width of [TASK_TB_MIN, 200, 230, 260]) {
      const lines = wrapText(name, width - 2 * TASK_PADDING - 8, LABEL_FONT, true);
      if ((lines.length <= 2 && factFits(width)) || width === 260) {
        const w = Math.max(width, (anchor ? anchorWidth(anchor) : 0) + 2 * TASK_PADDING + 8);
        return { lines, width: w, height: 2 * TASK_PADDING + lines.length * lh + reserve };
      }
    }
  }
  for (const width of TASK_WIDTHS) {
    const lines = wrapText(name, width - 2 * TASK_PADDING, LABEL_FONT, true);
    const fits = lines.length <= MAX_TASK_LINES && factFits(width);
    if (fits || width === TASK_WIDTHS[TASK_WIDTHS.length - 1]) {
      // bpmn-js centres the name in the whole box and the anchor hangs under it:
      // the box is that much taller than the block.
      const height = Math.max(TASK_H, 2 * TASK_PADDING + lines.length * lh + 2 * reserve);
      return { lines, width, height };
    }
  }
  return { lines: [name], width: 100, height: TASK_H };
}

function labelBlock(text: string, anchor: string | null, maxWidth: number): { lines: string[]; width: number; height: number; nameW: number; nameH: number } {
  const lines = text ? wrapText(text, maxWidth, LABEL_FONT) : [];
  const nameW = blockWidth(lines, LABEL_FONT);
  const nameH = lines.length * lineHeight(LABEL_FONT);
  const aw = anchor ? anchorWidth(anchor) : 0;
  return {
    lines,
    nameW,
    nameH,
    width: Math.max(nameW, aw),
    height: nameH + (anchor ? lineHeight(ANCHOR_FONT) : 0),
  };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export function layoutModel(model: ExportModel, options: LayoutOptions = {}): DiagramLayout {
  const direction = options.direction ?? 'LR';
  const planes = new Map<string, PlaneLayout>();
  for (const container of model.containers) planes.set(container.id, layoutContainer(container, direction, options.wrap));

  if (!model.pools.length) return { planes, direction };

  const root = planes.get(model.root.id) as PlaneLayout;
  const box = boundingBox(root);
  const participant: Bounds = {
    x: box.x - 50,
    y: box.y - 30,
    width: box.width + 80,
    height: box.height + 60,
  };
  model.pools.forEach((pool, i) => {
    root.shapes.set(pool.id, {
      x: participant.x,
      y: participant.y + participant.height + POOL_GAP + i * (POOL_H + POOL_GAP),
      width: participant.width,
      height: POOL_H,
    });
  });
  routeMessages(model, root);
  return { planes, participant, direction };
}

/** Every drawn thing of a plane: shapes, labels, line points. */
export function boundingBox(plane: PlaneLayout): Bounds {
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
  for (const b of plane.shapes.values()) grow(b);
  for (const l of plane.labels.values()) grow(l.box);
  for (const points of plane.edges.values()) for (const p of points) grow({ x: p.x, y: p.y, width: 0, height: 0 });
  if (minX === Infinity) return { x: ORIGIN_X, y: ORIGIN_Y, width: 400, height: 200 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function noteHeight(text: string, width: number): number {
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, wrapText(line, width - 16, LABEL_FONT).length), 0);
  return 20 + lines * lineHeight(LABEL_FONT);
}

/* ------------------------------------------------------------------ *
 * The grid: rank and row of every element, per band
 * ------------------------------------------------------------------ */

interface Item {
  id: string;
  kind: ShapeKind;
  tag?: BpmnTag;
  band: number;
  col: number;
  row: number;
  width: number;
  height: number;
}

interface BandGrid {
  items: Item[];
  cols: number;
  rows: number;
  /** Flows of this band and which run backwards. */
  back: Set<string>;
}

function gridOfBand(container: ExportContainer, bandIndex: number, sizeOf: (n: ExportNode) => [number, number]): BandGrid {
  const band = container.bands[bandIndex];
  const byId = new Map(container.nodes.map((n) => [n.id, n]));
  const inBand = band.nodeIds.map((id) => byId.get(id) as ExportNode);
  const placed = inBand.filter((n) => !(n.tag === 'boundaryEvent' && n.attachedTo));
  const placedIds = new Set(placed.map((n) => n.id));
  const rep = (id: string): string => byId.get(id)?.attachedTo ?? id;
  const flows = container.flows.filter((f) => placedIds.has(rep(f.sourceId)) && placedIds.has(f.targetId));

  // ---- which flows run backwards ----
  const back = new Set<string>(flows.filter((f) => f.back || rep(f.sourceId) === f.targetId).map((f) => f.id));
  const outOf = new Map<string, ExportFlow[]>();
  for (const f of flows) outOf.set(rep(f.sourceId), [...(outOf.get(rep(f.sourceId)) ?? []), f]);
  {
    const state = new Map<string, 1 | 2>();
    const starts = [band.entryId, ...placed.map((n) => n.id)].filter((id): id is string => !!id && placedIds.has(id));
    for (const start of starts) {
      if (state.has(start)) continue;
      const stack: Array<{ id: string; i: number }> = [{ id: start, i: 0 }];
      state.set(start, 1);
      while (stack.length) {
        const frame = stack[stack.length - 1];
        const out = (outOf.get(frame.id) ?? []).filter((f) => !back.has(f.id));
        if (frame.i >= out.length) {
          state.set(frame.id, 2);
          stack.pop();
          continue;
        }
        const f = out[frame.i++];
        const seen = state.get(f.targetId);
        if (seen === 1) back.add(f.id);
        else if (seen === undefined) {
          state.set(f.targetId, 1);
          stack.push({ id: f.targetId, i: 0 });
        }
      }
    }
  }
  const forward = flows.filter((f) => !back.has(f.id));
  const fwdOut = new Map<string, string[]>();
  const fwdIn = new Map<string, string[]>();
  for (const f of forward) {
    const s = rep(f.sourceId);
    fwdOut.set(s, [...(fwdOut.get(s) ?? []), f.targetId]);
    fwdIn.set(f.targetId, [...(fwdIn.get(f.targetId) ?? []), s]);
  }

  // ---- rank: longest forward path ----
  const rank = new Map<string, number>();
  const indegree = new Map(placed.map((n) => [n.id, (fwdIn.get(n.id) ?? []).length]));
  const queue = placed.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    topo.push(id);
    for (const next of fwdOut.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  for (const n of placed) if (!rank.has(n.id)) rank.set(n.id, 0);
  if (band.endId && placedIds.has(band.endId)) {
    const others = placed.filter((n) => n.id !== band.endId).map((n) => rank.get(n.id) ?? 0);
    rank.set(band.endId, Math.max(rank.get(band.endId) ?? 0, others.length ? Math.max(...others) + 1 : 0));
  }

  // ---- which branch is the main path ----
  const length = new Map<string, number>();
  for (const id of [...topo].reverse()) {
    const outs = fwdOut.get(id) ?? [];
    length.set(id, outs.length ? 1 + Math.max(...outs.map((o) => length.get(o) ?? 0)) : 0);
  }
  const reachesEnd = new Set<string>();
  if (band.endId) {
    const walk = [band.endId];
    while (walk.length) {
      const id = walk.pop() as string;
      if (reachesEnd.has(id)) continue;
      reachesEnd.add(id);
      walk.push(...(fwdIn.get(id) ?? []));
    }
  }

  // ---- rows ----
  const row = new Map<string, number>();
  const cells = new Map<number, Set<number>>();
  const free = (r: number, c: number) => !cells.get(c)?.has(r);
  const takeCell = (r: number, c: number) => cells.set(c, new Set([...(cells.get(c) ?? []), r]));
  const take = (id: string, preferred: number): number => {
    const c = rank.get(id) ?? 0;
    let r = preferred;
    while (!free(r, c)) r += 1;
    row.set(id, r);
    takeCell(r, c);
    return r;
  };
  const branchRow = (fromRank: number, toRank: number, min: number): number => {
    for (let r = min; ; r++) {
      let clear = true;
      // The source's own column below it too: the branch leaves downwards there.
      for (let c = fromRank; c <= toRank && clear; c++) clear = free(r, c);
      if (clear) return r;
    }
  };
  const visit = (start: string) => {
    const stack: Array<{ id: string; from: string | null; main: boolean }> = [{ id: start, from: null, main: true }];
    while (stack.length) {
      const { id, from, main } = stack.pop() as { id: string; from: string | null; main: boolean };
      if (from !== null) {
        if (row.has(id)) continue;
        const r = row.get(from) ?? 0;
        if (main) take(id, r);
        else {
          const fromRank = rank.get(from) ?? 0;
          const toRank = rank.get(id) ?? 0;
          const at = take(id, branchRow(fromRank, toRank, r + 1));
          // The way there is spoken for: down the source's column, along the
          // branch's row. A step placed later would sit on the line.
          for (let k = r + 1; k <= at; k++) takeCell(k, fromRank);
          for (let c = fromRank; c < toRank; c++) takeCell(at, c);
        }
      }
      const written = [...new Set(fwdOut.get(id) ?? [])].filter((c) => !row.has(c));
      const children = [...written].sort((a, b) =>
        Number(reachesEnd.has(b)) - Number(reachesEnd.has(a))
        || (length.get(b) ?? 0) - (length.get(a) ?? 0)
        || written.indexOf(a) - written.indexOf(b));
      for (let i = children.length - 1; i >= 0; i--) stack.push({ id: children[i], from: id, main: i === 0 });
    }
  };
  const maxRow = () => Math.max(-1, ...row.values());
  if (band.entryId && placedIds.has(band.entryId)) {
    take(band.entryId, 0);
    visit(band.entryId);
  }
  for (const n of placed) {
    if (row.has(n.id)) continue;
    take(n.id, (fwdIn.get(n.id) ?? []).length ? 0 : maxRow() + 1);
    visit(n.id);
  }

  const items: Item[] = placed.map((n) => {
    const [width, height] = sizeOf(n);
    return { id: n.id, kind: kindOf(n.tag), tag: n.tag, band: bandIndex, col: rank.get(n.id) ?? 0, row: row.get(n.id) ?? 0, width, height };
  });

  // ---- data stores: in a free cell under their first reader ----
  const refs = container.storeRefs.filter((r) => r.band === bandIndex);
  const users = (refId: string) => container.dataAssociations
    .filter((a) => a.storeRefId === refId)
    .map((a) => items.find((i) => i.id === a.nodeId))
    .filter((i): i is Item => !!i)
    .sort((a, b) => a.col - b.col || a.row - b.row);
  const storeItems: Item[] = [];
  for (const ref of refs) {
    const first = users(ref.id)[0];
    const c = first ? first.col : 0;
    let r = first ? first.row + 1 : maxRow() + 1;
    while (!free(r, c)) r += 1;
    takeCell(r, c);
    storeItems.push({ id: ref.id, kind: 'store', band: bandIndex, col: c, row: r, width: STORE, height: STORE });
  }
  const all = [...items, ...storeItems];
  const cols = Math.max(0, ...all.map((i) => i.col)) + 1;
  const rows = Math.max(0, ...all.map((i) => i.row)) + 1;
  return { items: all, cols, rows, back };
}

/** A band longer than `wrap` columns, continued on row blocks below. */
function wrapGrid(grid: BandGrid, wrap?: number): BandGrid {
  if (!wrap || grid.cols <= wrap) return grid;
  const segments = Math.ceil(grid.cols / wrap);
  const offset: number[] = [];
  let next = 0;
  for (let k = 0; k < segments; k += 1) {
    offset.push(next);
    const rows = grid.items.filter((it) => Math.floor(it.col / wrap) === k).map((it) => it.row);
    // One empty row between two blocks: the way round runs there.
    next += (rows.length ? Math.max(...rows) + 1 : 1) + 1;
  }
  const items = grid.items.map((it) => ({ ...it, col: it.col % wrap, row: it.row + offset[Math.floor(it.col / wrap)] }));
  return { ...grid, items, cols: wrap, rows: Math.max(...items.map((it) => it.row)) + 1 };
}

/* ------------------------------------------------------------------ *
 * One plane
 * ------------------------------------------------------------------ */

interface Gaps {
  /** Per band: gap after each column (main axis) and after each row (cross axis), and before row 0. */
  col: number[][];
  row: number[][];
  lead: number[];
}

function layoutContainer(container: ExportContainer, direction: Direction, wrap?: number): PlaneLayout {
  const byId = new Map(container.nodes.map((n) => [n.id, n]));
  const anchorOf = (n: ExportNode) => nodeAnchor(n);
  const taskSize = new Map<string, { lines: string[]; width: number; height: number }>();
  // An activity with an error boundary on its foot grows by the circle's upper
  // half, so its name and anchor stay clear of the event.
  const hosts = new Set(container.nodes.filter((n) => n.tag === 'boundaryEvent' && n.attachedTo).map((n) => n.attachedTo as string));
  const sizeOf = (n: ExportNode): [number, number] => {
    if (isEvent(n.tag)) return [EVENT, EVENT];
    if (isGateway(n.tag)) return direction === 'TB' ? [GATEWAY_TB, GATEWAY_TB] : [GATEWAY_LR, GATEWAY_LR];
    const t = taskText(n.name, anchorOf(n), direction, n.fact);
    if (hosts.has(n.id)) t.height += BOUNDARY_ROOM;
    taskSize.set(n.id, t);
    return [t.width, t.height];
  };
  const grids = container.bands.map((_, i) => wrapGrid(gridOfBand(container, i, sizeOf), wrap));

  const gaps: Gaps = {
    col: grids.map((g) => new Array(g.cols).fill(COL_GAP)),
    row: grids.map((g) => new Array(g.rows).fill(ROW_GAP)),
    lead: grids.map(() => 0),
  };
  // Room for what is known before anything is placed: branch labels next to
  // their gateway, a gateway's question over it, an event's name under it.
  const itemOf = new Map<string, Item>();
  grids.forEach((g) => g.items.forEach((it) => itemOf.set(it.id, it)));
  const owner = (id: string) => itemOf.get(byId.get(id)?.attachedTo ?? id);
  for (const f of container.flows) {
    const text = flowText(f);
    const s = owner(f.sourceId);
    if (!text || !s) continue;
    const block = labelBlock(text, null, FLOW_LABEL_W);
    const along = direction === 'LR' ? block.width : block.height;
    gaps.col[s.band][s.col] = Math.max(gaps.col[s.band][s.col], along + 36);
    const across = direction === 'LR' ? block.height : block.width;
    gaps.row[s.band][s.row] = Math.max(gaps.row[s.band][s.row], across + 30);
  }
  for (const it of grids.flatMap((g) => g.items)) {
    const node = byId.get(it.id);
    const name = node ? node.name : storeName(container, it.id);
    const block = labelBlock(name, node ? anchorOf(node) : null, it.kind === 'gateway' ? GATEWAY_LABEL_W : EVENT_LABEL_W);
    if (it.kind === 'gateway' && direction === 'LR') {
      const above = block.height + 8 - (it.height / 2 - 4);
      if (it.row === 0) gaps.lead[it.band] = Math.max(gaps.lead[it.band], above);
      else gaps.row[it.band][it.row - 1] = Math.max(gaps.row[it.band][it.row - 1], above + 24);
    } else if ((it.kind === 'event' || it.kind === 'store') && direction === 'LR') {
      gaps.row[it.band][it.row] = Math.max(gaps.row[it.band][it.row], block.height + 30);
    } else if (direction === 'TB' && it.kind !== 'task') {
      // Beside the shape: the gap before its column (cross axis) holds it.
      const side = block.width + 20 - (it.width / 2);
      if (it.row === 0) gaps.lead[it.band] = Math.max(gaps.lead[it.band], side);
      else gaps.row[it.band][it.row - 1] = Math.max(gaps.row[it.band][it.row - 1], side + 20);
      if (it.kind === 'event') gaps.col[it.band][it.col] = Math.max(gaps.col[it.band][it.col], block.height + 20);
    }
  }

  for (const n of container.nodes) {
    if (n.tag !== 'boundaryEvent' || !n.attachedTo) continue;
    const host = itemOf.get(n.attachedTo);
    if (!host) continue;
    const block = labelBlock(n.name, anchorOf(n), EVENT_LABEL_W);
    gaps.row[host.band][host.row] = Math.max(gaps.row[host.band][host.row], block.height + 40);
  }

  let best: PlaneLayout | null = null;
  let bestScore = Infinity;
  let bestRound = 0;
  for (let round = 0; round < MAX_ROUNDS && round - bestRound <= 4; round += 1) {
    const attempt = attemptPlane(container, direction, grids, gaps, taskSize);
    const report = measureDrawing(planeDrawing(container, attempt.plane));
    const score = ZERO_METRICS.reduce((n, k) => n + (report[k] as number), 0) + attempt.unrouted.length * 5;
    if (score < bestScore) {
      best = attempt.plane;
      bestScore = score;
      bestRound = round;
    }
    if (score === 0) break;
    // Open the gaps next to everything that still collides, and try again.
    const blame = new Set<string>([...attempt.unrouted, ...blameOf(report)]);
    let grown = false;
    for (const id of blame) {
      const flow = container.flows.find((f) => f.id === id);
      const ids = flow ? [flow.sourceId, flow.targetId] : [id.replace(/_label$/, '')];
      for (const raw of ids) {
        const it = owner(raw) ?? itemOf.get(raw);
        if (!it) continue;
        const b = it.band;
        gaps.col[b][it.col] += GROW;
        if (it.col > 0) gaps.col[b][it.col - 1] += GROW;
        gaps.row[b][it.row] += GROW;
        if (it.row > 0) gaps.row[b][it.row - 1] += GROW;
        else gaps.lead[b] += GROW;
        grown = true;
      }
    }
    if (!grown) {
      // Nothing to blame by name: give every gap a little more.
      gaps.col.forEach((c) => c.forEach((_, i) => { c[i] += GROW; }));
      gaps.row.forEach((r) => r.forEach((_, i) => { r[i] += GROW; }));
    }
  }
  return best as PlaneLayout;
}

/** Element ids a report holds responsible. */
function blameOf(report: QualityReport): string[] {
  const out: string[] = [];
  for (const line of report.details) {
    for (const m of line.matchAll(/(?:^|[\s(])([A-Za-z_][\w.-]*)/g)) out.push(m[1]);
  }
  return out;
}

function storeName(container: ExportContainer, refId: string): string {
  const ref = container.storeRefs.find((r) => r.id === refId);
  return ref ? (ref.name ?? ref.table) : '';
}

/** Longest condition written out on a flow; the rest is in the tooltip and the detail panel. */
export const FLOW_LABEL_MAX = 28;

/** A condition cut to fit on a flow, at a word where it can be. */
export function shortCondition(condition: string): string {
  const c = condition.trim();
  if (c.length <= FLOW_LABEL_MAX) return c;
  const cut = c.slice(0, FLOW_LABEL_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 12 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** What a flow says on the canvas: its label, or its (shortened) condition when it has no label. */
export function flowText(f: ExportFlow): string {
  return f.label ?? shortCondition(f.condition);
}

interface Attempt {
  plane: PlaneLayout;
  unrouted: string[];
}

function attemptPlane(
  container: ExportContainer,
  direction: Direction,
  grids: BandGrid[],
  gaps: Gaps,
  taskSize: Map<string, { lines: string[]; width: number; height: number }>,
): Attempt {
  const plane: PlaneLayout = { shapes: new Map(), edges: new Map(), labels: new Map(), inside: new Map() };
  const byId = new Map(container.nodes.map((n) => [n.id, n]));
  const LR = direction === 'LR';

  // ---- notes that explain the whole plane, on top ----
  let top = ORIGIN_Y;
  for (const note of container.annotations) {
    if (note.nodeId) continue;
    const height = noteHeight(note.text, NOTE_W);
    plane.shapes.set(note.id, { x: ORIGIN_X, y: top, width: NOTE_W, height });
    top += height + 50;
  }

  // ---- coordinates, band by band (main axis = x in LR, y in TB) ----
  let crossStart = LR ? top : ORIGIN_X;
  const mainOrigin = LR ? ORIGIN_X : top;
  const cellOf = new Map<string, Item>();
  grids.forEach((grid, b) => {
    const colExtent = new Array<number>(grid.cols).fill(EVENT);
    const rowExtent = new Array<number>(grid.rows).fill(EVENT);
    for (const it of grid.items) {
      colExtent[it.col] = Math.max(colExtent[it.col], LR ? it.width : it.height);
      rowExtent[it.row] = Math.max(rowExtent[it.row], LR ? it.height : it.width);
    }
    const colStart: number[] = [];
    let m = mainOrigin;
    for (let c = 0; c < grid.cols; c += 1) {
      colStart.push(m);
      m += colExtent[c] + gaps.col[b][c];
    }
    const rowStart: number[] = [];
    let k = crossStart + gaps.lead[b];
    for (let r = 0; r < grid.rows; r += 1) {
      rowStart.push(k);
      k += rowExtent[r] + gaps.row[b][r];
    }
    for (const it of grid.items) {
      const mainC = colStart[it.col] + colExtent[it.col] / 2;
      const crossC = rowStart[it.row] + rowExtent[it.row] / 2;
      const cx = LR ? mainC : crossC;
      const cy = LR ? crossC : mainC;
      plane.shapes.set(it.id, { x: Math.round(cx - it.width / 2), y: Math.round(cy - it.height / 2), width: it.width, height: it.height });
      cellOf.set(it.id, it);
    }
    crossStart = k + BAND_GAP;
  });

  // ---- boundary events on their host ----
  const onHost = new Map<string, number>();
  for (const n of container.nodes) {
    if (!(n.tag === 'boundaryEvent' && n.attachedTo)) continue;
    const host = plane.shapes.get(n.attachedTo);
    if (!host) continue;
    const k = onHost.get(n.attachedTo) ?? 0;
    onHost.set(n.attachedTo, k + 1);
    plane.shapes.set(n.id, { x: host.x + host.width - 48 - k * 40, y: host.y + host.height - 18, width: EVENT, height: EVENT });
  }

  // ---- text inside activities ----
  for (const n of container.nodes) {
    const t = taskSize.get(n.id);
    if (t && plane.shapes.has(n.id)) plane.inside.set(n.id, { lines: t.lines, fontSize: LABEL_FONT, anchor: nodeAnchor(n), fact: n.fact ?? null });
  }

  // ---- notes on one element: below the band, under their element ----
  const notes = container.annotations.filter((a) => a.nodeId && a.associationId);
  if (notes.length) {
    const bottom = Math.max(...[...plane.shapes.values()].map((b) => b.y + b.height)) + 60;
    let x = -Infinity;
    for (const note of notes) {
      const at = plane.shapes.get(note.nodeId as string);
      if (!at) continue;
      const bx = Math.max(at.x, x + 30);
      const b: Bounds = { x: bx, y: bottom, width: 200, height: noteHeight(note.text, 200) };
      plane.shapes.set(note.id, b);
      x = bx + 200;
    }
  }

  // ---- node labels, before the lines: the lines go around them ----
  const placedLabels: Bounds[] = [];
  const shapesList = () => [...plane.shapes.values()];
  const collides = (b: Bounds, pad = 3) => shapesList().some((s) => hit(b, s, pad)) || placedLabels.some((l) => hit(b, l, pad));
  const labelFor = (id: string, text: string, anchor: string | null, maxW: number, candidates: (w: number, h: number) => Point[]) => {
    const block = labelBlock(text, anchor, maxW);
    if (!block.lines.length && !anchor) return;
    const tries = candidates(block.width, block.height);
    let chosen = tries[0];
    for (const p of tries) {
      if (!collides({ x: p.x, y: p.y, width: block.width, height: block.height })) {
        chosen = p;
        break;
      }
    }
    const box = { x: Math.round(chosen.x), y: Math.round(chosen.y), width: block.width, height: block.height };
    plane.labels.set(id, {
      box,
      nameBox: { x: Math.round(box.x + (block.width - block.nameW) / 2), y: box.y, width: block.nameW, height: block.nameH },
      lines: block.lines,
      fontSize: LABEL_FONT,
      anchor,
    });
    placedLabels.push(box);
  };
  for (const n of container.nodes) {
    const s = plane.shapes.get(n.id);
    if (!s) continue;
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    if (n.tag === 'boundaryEvent' && n.attachedTo) {
      // Beside the line that leaves it downwards, below the host's edge.
      labelFor(n.id, n.name, nodeAnchor(n), EVENT_LABEL_W, (w, h) => LR
        ? [
          { x: s.x + s.width + 4, y: s.y + s.height - 2 },
          { x: s.x - 4 - w, y: s.y + s.height - 2 },
          { x: s.x + s.width + 4, y: s.y + s.height + 16 },
          { x: s.x - 4 - w, y: s.y + s.height + 16 },
          { x: cx - w / 2, y: s.y + s.height + 30 },
        ]
        : [
          { x: s.x + s.width + 4, y: s.y + s.height - 2 },
          { x: s.x + s.width + 4, y: s.y - 2 - h },
          { x: s.x + s.width + 20, y: cy - h / 2 },
        ]);
      continue;
    }
    if (isGateway(n.tag)) {
      labelFor(n.id, n.name, nodeAnchor(n), GATEWAY_LABEL_W, (w, h) => LR
        ? [
          { x: cx - 8 - w, y: s.y + 2 - h },
          { x: cx - w / 2, y: s.y - 6 - h },
          { x: cx + 8, y: s.y + 2 - h },
          { x: cx - 8 - w, y: s.y + s.height - 2 },
          { x: cx + 8, y: s.y + s.height - 2 },
          { x: cx - w / 2, y: s.y + s.height + 6 },
        ]
        : [
          { x: s.x - 8 - w, y: cy - h / 2 },
          { x: s.x - 8 - w, y: s.y - 2 - h },
          { x: s.x + s.width + 8, y: s.y - 2 - h },
          { x: s.x + s.width + 8, y: cy - h / 2 },
        ]);
    } else if (isEvent(n.tag)) {
      labelFor(n.id, n.name, nodeAnchor(n), EVENT_LABEL_W, (w, h) => LR
        ? [
          { x: cx - w / 2, y: s.y + s.height + 5 },
          { x: cx - w / 2, y: s.y - 5 - h },
          { x: s.x + s.width + 6, y: s.y + s.height + 2 },
          { x: s.x - 6 - w, y: s.y + s.height + 2 },
        ]
        : [
          { x: s.x - 8 - w, y: cy - h / 2 },
          { x: cx - w / 2, y: s.y + s.height + 5 },
          { x: s.x + s.width + 8, y: cy - h / 2 },
          { x: cx - w / 2, y: s.y - 5 - h },
        ]);
    }
  }
  for (const ref of container.storeRefs) {
    const s = plane.shapes.get(ref.id);
    if (!s) continue;
    const cx = s.x + s.width / 2;
    labelFor(ref.id, ref.name ?? ref.table, null, STORE_LABEL_W, (w) => [
      { x: cx - w / 2, y: s.y + s.height + 4 },
      { x: s.x + s.width + 6, y: s.y + s.height / 2 - 8 },
      { x: s.x - 6 - w, y: s.y + s.height / 2 - 8 },
    ]);
  }

  // ---- the router: its lines are the gaps, the shape lines and the ports ----
  const obstacles: Bounds[] = [];
  for (const [id, b] of plane.shapes) {
    void id;
    obstacles.push(inflate(b, CLEAR));
  }
  for (const l of placedLabels) obstacles.push(inflate(l, 3));
  const xs: number[] = [];
  const ys: number[] = [];
  const all = [...obstacles];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of all) {
    xs.push(b.x, b.x + b.width);
    ys.push(b.y, b.y + b.height);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  for (const b of plane.shapes.values()) {
    xs.push(b.x + b.width / 2);
    ys.push(b.y + b.height / 2);
  }
  // Tracks every 10 px through all free space, and a margin all round.
  for (let x = Math.floor((minX - 60) / 10) * 10; x <= maxX + 60; x += 10) xs.push(x);
  for (let y = Math.floor((minY - 60) / 10) * 10; y <= maxY + 60; y += 10) ys.push(y);

  const ports = new PortBook(plane, byId, direction);
  for (const p of ports.allLines()) {
    xs.push(p.x);
    ys.push(p.y);
  }
  const router = new Router(xs, ys, obstacles);

  // ---- a branch label, on the first leg of its flow, placed as soon as the
  // flow is drawn — and from then on an obstacle every later line goes around ----
  const edgeList = () => [...plane.edges.entries()];
  const placeFlowLabel = (f: ExportFlow) => {
    const text = flowText(f);
    const points = plane.edges.get(f.id);
    if (!text || !points) return;
    const block = labelBlock(text, null, FLOW_LABEL_W);
    const w = block.width;
    const h = block.height;
    const tries: Point[] = [];
    // Near the source first — where a reader looks for which way a branch
    // goes — then further along, leg by leg.
    for (let leg = 1; leg < points.length; leg += 1) {
      const a = points[leg - 1];
      const b = points[leg];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const size = a.y === b.y ? w : h;
      const steps = [24, 36];
      for (let d = 44; d + size <= len && steps.length < 14; d += 20) steps.push(d);
      for (const d of steps) {
        if (d < 0 || d + (a.y === b.y ? w : h) > len + 4) continue;
        if (a.y === b.y) {
          const x0 = b.x > a.x ? a.x + d : a.x - d - w;
          tries.push({ x: x0, y: a.y - 4 - h }, { x: x0, y: a.y + 4 });
        } else {
          const y0 = b.y > a.y ? a.y + d : a.y - d - h;
          tries.push({ x: a.x + 6, y: y0 }, { x: a.x - 6 - w, y: y0 });
        }
      }
    }
    let chosen: Point | null = null;
    for (const p of tries) {
      const box = { x: p.x, y: p.y, width: w, height: h };
      if (collides(box, 2)) continue;
      // Clear of the docking zone round both ends: a label there would close
      // the ports the next lines of the same shapes need.
      const ends = [f.sourceId, f.targetId].map((id) => plane.shapes.get(id)).filter((b): b is Bounds => !!b);
      if (ends.some((b) => hit(box, inflate(b, 21)))) continue;
      if (edgeList().some(([, pts]) => polylineHits(pts, inflate(box, 1)))) continue;
      const mine = distBoxPolyline(box, points);
      const other = Math.min(Infinity, ...edgeList().filter(([id]) => id !== f.id && container.flows.some((g) => g.id === id)).map(([, pts]) => distBoxPolyline(box, pts)));
      if (other <= mine + 3) continue;
      chosen = p;
      break;
    }
    const p = chosen ?? tries[0] ?? { x: points[0].x + 6, y: points[0].y - 4 - h };
    const box = { x: Math.round(p.x), y: Math.round(p.y), width: w, height: h };
    plane.labels.set(f.id, { box, nameBox: { ...box }, lines: block.lines, fontSize: LABEL_FONT, anchor: null });
    placedLabels.push(box);
    router.block(inflate(box, 10));
  };


  const unrouted: string[] = [];
  const cellOfNode = (id: string) => cellOf.get(byId.get(id)?.attachedTo ?? id);
  const back = new Set(grids.flatMap((g) => [...g.back]));
  const order = [...container.flows].map((f, i) => ({ f, i })).sort((a, b) => {
    const span = (f: ExportFlow) => {
      const s = cellOfNode(f.sourceId);
      const t = cellOfNode(f.targetId);
      if (!s || !t) return 999;
      return (back.has(f.id) ? 500 : 0) + Math.abs(t.col - s.col) + Math.abs(t.row - s.row) * 2;
    };
    return span(a.f) - span(b.f) || a.i - b.i;
  });
  for (const { f } of order) {
    const s = cellOfNode(f.sourceId);
    const t = cellOfNode(f.targetId);
    if (!s || !t || !plane.shapes.has(f.sourceId) || !plane.shapes.has(f.targetId)) continue;
    const isBack = back.has(f.id) || t.col < s.col || (t.col === s.col && f.sourceId === f.targetId);
    const req = ports.request(f, s, t, isBack);
    const points = router.route(req.request);
    if (!points) {
      unrouted.push(f.id);
      continue;
    }
    ports.commit(req, points);
    router.occupy(points);
    plane.edges.set(f.id, points);
    placeFlowLabel(f);
  }

  // ---- data associations and notes' associations: dotted, after the flows ----
  for (const a of container.dataAssociations) {
    const node = plane.shapes.get(a.nodeId);
    const store = plane.shapes.get(a.storeRefId);
    if (!node || !store) continue;
    const req = ports.association(a.id, a.nodeId, a.storeRefId);
    const points = router.route(req.request);
    if (!points) {
      unrouted.push(a.id);
      continue;
    }
    ports.commit(req, points);
    router.occupy(points);
    plane.edges.set(a.id, a.direction === 'input' ? [...points].reverse() : points);
  }
  for (const note of container.annotations) {
    if (!note.nodeId || !note.associationId) continue;
    if (!plane.shapes.has(note.nodeId) || !plane.shapes.has(note.id)) continue;
    const req = ports.association(note.associationId, note.nodeId, note.id);
    const points = router.route(req.request);
    if (!points) continue;
    ports.commit(req, points);
    router.occupy(points);
    plane.edges.set(note.associationId, points);
  }

  return { plane, unrouted };
}

/* ------------------------------------------------------------------ *
 * Ports: where a line leaves and enters, one docking point per line
 * ------------------------------------------------------------------ */

interface PendingRequest {
  request: { id: string; from: PortChoice[]; to: PortChoice[]; crossingCost?: number };
  sources: Array<{ shape: string; side: Side; slot: number }>;
  targets: Array<{ shape: string; side: Side; slot: number }>;
}

const SLOT_STEP = 10;

class PortBook {
  private used = new Map<string, number[]>();

  constructor(private plane: PlaneLayout, private byId: Map<string, ExportNode>, private direction: Direction) {}

  private kind(id: string): ShapeKind {
    const n = this.byId.get(id);
    if (!n) return this.plane.shapes.get(id) && id.includes('-note') ? 'note' : 'store';
    return kindOf(n.tag);
  }

  /** The point on a shape's outline at `side`, moved `offset` along it. */
  point(id: string, side: Side, offset: number): Point {
    const b = this.plane.shapes.get(id) as Bounds;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const k = this.kind(id);
    const along = side === 'left' || side === 'right' ? cy + offset : cx + offset;
    const sign = side === 'left' || side === 'top' ? -1 : 1;
    if (k === 'gateway') {
      const half = (side === 'left' || side === 'right' ? b.width : b.height) / 2;
      const cross = (side === 'left' || side === 'right' ? b.height : b.width) / 2;
      const d = half * (1 - Math.abs(offset) / cross);
      return side === 'left' || side === 'right'
        ? { x: Math.round(cx + sign * d), y: Math.round(along) }
        : { x: Math.round(along), y: Math.round(cy + sign * d) };
    }
    if (k === 'event') {
      const r = b.width / 2;
      const d = Math.sqrt(Math.max(0, r * r - offset * offset));
      return side === 'left' || side === 'right'
        ? { x: Math.round(cx + sign * d), y: Math.round(along) }
        : { x: Math.round(along), y: Math.round(cy + sign * d) };
    }
    return side === 'left' ? { x: b.x, y: Math.round(along) }
      : side === 'right' ? { x: b.x + b.width, y: Math.round(along) }
        : side === 'top' ? { x: Math.round(along), y: b.y }
          : { x: Math.round(along), y: b.y + b.height };
  }

  /** The end of the stub: clear of the shape's box and its clearance, whatever the outline. */
  stub(id: string, side: Side, p: Point): Point {
    const b = this.plane.shapes.get(id) as Bounds;
    const out = CLEAR + 6;
    return side === 'left' ? { x: b.x - out, y: p.y }
      : side === 'right' ? { x: b.x + b.width + out, y: p.y }
        : side === 'top' ? { x: p.x, y: b.y - out }
          : { x: p.x, y: b.y + b.height + out };
  }

  private maxOffset(id: string, side: Side): number {
    const b = this.plane.shapes.get(id) as Bounds;
    const k = this.kind(id);
    const extent = side === 'left' || side === 'right' ? b.height : b.width;
    if (k === 'gateway') return Math.floor(extent / 2 - 10);
    if (k === 'event') return 12;
    return Math.floor(extent / 2 - 10);
  }

  /** Free slots of a side, nearest the centre first, leaning to `towards`. */
  private slots(id: string, side: Side, towards: number): number[] {
    const used = this.used.get(`${id}|${side}`) ?? [];
    const max = this.maxOffset(id, side);
    const out: number[] = [];
    const sign = towards >= 0 ? 1 : -1;
    for (let k = 0; k * SLOT_STEP <= max; k += 1) {
      for (const s of k === 0 ? [0] : [sign * k * SLOT_STEP, -sign * k * SLOT_STEP]) {
        if (used.every((u) => Math.abs(u - s) >= SLOT_STEP)) out.push(s);
      }
    }
    return out;
  }

  /** Every line a port could ever put a stub on — the router's grid needs them up front. */
  allLines(): Point[] {
    const out: Point[] = [];
    for (const [id] of this.plane.shapes) {
      for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) {
        const max = this.maxOffset(id, side);
        for (let k = 0; k * SLOT_STEP <= max; k += 1) {
          for (const o of k ? [k * SLOT_STEP, -k * SLOT_STEP] : [0]) {
            const p = this.point(id, side, o);
            out.push(p, this.stub(id, side, p));
          }
        }
      }
    }
    return out;
  }

  private choices(id: string, sides: Array<[Side, number]>, towards: Point, pick: Array<{ shape: string; side: Side; slot: number }>): PortChoice[] {
    const b = this.plane.shapes.get(id) as Bounds;
    const out: PortChoice[] = [];
    for (const [side, cost] of sides) {
      const lean = side === 'left' || side === 'right' ? towards.y - (b.y + b.height / 2) : towards.x - (b.x + b.width / 2);
      // Two docking points per side to choose from: the router picks the cheaper.
      for (const [n, slot] of this.slots(id, side, lean).slice(0, 2).entries()) {
        const point = this.point(id, side, slot);
        out.push({ side, point, stub: this.stub(id, side, point), cost: cost + n * 4 + Math.abs(slot) * 0.3 });
        pick.push({ shape: id, side, slot });
      }
    }
    return out;
  }

  private rot(side: Side): Side {
    if (this.direction === 'LR') return side;
    return ({ right: 'bottom', left: 'top', bottom: 'right', top: 'left' } as const)[side];
  }

  request(f: ExportFlow, s: Item, t: Item, isBack: boolean): PendingRequest {
    const sources: PendingRequest['sources'] = [];
    const targets: PendingRequest['targets'] = [];
    const sid = f.sourceId;
    const tid = f.targetId;
    const sb = this.plane.shapes.get(sid) as Bounds;
    const tb = this.plane.shapes.get(tid) as Bounds;
    const sc = { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 };
    const tc = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
    const r = (side: Side) => this.rot(side);
    const fromBoundary = this.byId.get(sid)?.tag === 'boundaryEvent' && !!this.byId.get(sid)?.attachedTo;
    let fromSides: Array<[Side, number]>;
    let toSides: Array<[Side, number]>;
    if (fromBoundary) {
      fromSides = [[r('bottom'), 0]];
      toSides = [[r('left'), 0], [r('bottom'), 10], [r('top'), 30]];
    } else if (isBack) {
      fromSides = [[r('top'), 0], [r('bottom'), 10], [r('right'), 40]];
      toSides = [[r('top'), 0], [r('bottom'), 10], [r('left'), 40]];
    } else {
      const below = t.row > s.row;
      const above = t.row < s.row;
      const gateway = this.kind(sid) === 'gateway';
      fromSides = below
        ? [[r('bottom'), gateway ? 0 : 20], [r('right'), gateway ? 30 : 0]]
        : above
          ? [[r('top'), gateway ? 0 : 20], [r('right'), gateway ? 30 : 0]]
          : [[r('right'), 0], [r('bottom'), 40], [r('top'), 40]];
      toSides = [[r('left'), 0], [r('bottom'), above ? 10 : 30], [r('top'), below ? 10 : 30]];
    }
    void s;
    return {
      request: { id: f.id, from: this.choices(sid, fromSides, tc, sources), to: this.choices(tid, toSides, sc, targets) },
      sources,
      targets,
    };
  }

  association(id: string, nodeId: string, otherId: string): PendingRequest {
    const sources: PendingRequest['sources'] = [];
    const targets: PendingRequest['targets'] = [];
    const nb = this.plane.shapes.get(nodeId) as Bounds;
    const ob = this.plane.shapes.get(otherId) as Bounds;
    const nc = { x: nb.x + nb.width / 2, y: nb.y + nb.height / 2 };
    const oc = { x: ob.x + ob.width / 2, y: ob.y + ob.height / 2 };
    const all: Side[] = ['bottom', 'top', 'right', 'left'];
    const facing = (from: Point, to: Point): Side => (Math.abs(to.y - from.y) >= Math.abs(to.x - from.x)
      ? (to.y > from.y ? 'bottom' : 'top')
      : (to.x > from.x ? 'right' : 'left'));
    const nf = facing(nc, oc);
    const of = facing(oc, nc);
    return {
      request: {
        id,
        from: this.choices(nodeId, all.map((s) => [s, s === nf ? 0 : 30] as [Side, number]), oc, sources),
        to: this.choices(otherId, all.map((s) => [s, s === of ? 0 : 30] as [Side, number]), nc, targets),
        crossingCost: 120,
      },
      sources,
      targets,
    };
  }

  /** Book the docking points the chosen route uses. */
  commit(req: PendingRequest, points: Point[]) {
    const first = points[0];
    const last = points[points.length - 1];
    const book = (list: PendingRequest['sources'], p: Point) => {
      for (const c of list) {
        const q = this.point(c.shape, c.side, c.slot);
        if (q.x === p.x && q.y === p.y) {
          const key = `${c.shape}|${c.side}`;
          this.used.set(key, [...(this.used.get(key) ?? []), c.slot]);
          return;
        }
      }
    };
    book(req.sources, first);
    book(req.targets, last);
  }
}

/* ------------------------------------------------------------------ *
 * Message flows to collapsed pools
 * ------------------------------------------------------------------ */

function routeMessages(model: ExportModel, root: PlaneLayout) {
  const fromSame = new Map<string, number>();
  const blocks = [...root.shapes.entries()].filter(([id]) => !model.pools.some((p) => p.id === id)).map(([, b]) => b);
  const labelBoxes = [...root.labels.values()].map((l) => l.box);
  for (const message of model.messages) {
    const source = root.shapes.get(message.sourceId);
    const pool = root.shapes.get(message.poolId);
    if (!source || !pool) continue;
    const j = fromSame.get(message.sourceId) ?? 0;
    fromSame.set(message.sourceId, j + 1);
    // Straight down from the bottom of the element, beside any line already there.
    let x = Math.round(source.x + source.width / 2 + 20 + j * 12);
    const clear = (cx: number) => ![...blocks, ...labelBoxes].some((b) => b !== source && cx > b.x - 4 && cx < b.x + b.width + 4 && b.y > source.y && b.y < pool.y)
      && ![...root.edges.values()].some((pts) => pts.some((p, i) => i > 0 && p.x === pts[i - 1].x && Math.abs(p.x - cx) < 6));
    for (let tries = 0; tries < 12 && !clear(x); tries += 1) x += 10;
    x = Math.min(x, source.x + source.width - 6);
    root.edges.set(message.id, [
      { x, y: source.y + source.height },
      { x, y: pool.y },
    ]);
  }
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

function inflate(b: Bounds, d: number): Bounds {
  return { x: b.x - d, y: b.y - d, width: b.width + 2 * d, height: b.height + 2 * d };
}

function hit(a: Bounds, b: Bounds, pad = 0): boolean {
  return a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;
}

function polylineHits(points: Point[], box: Bounds): boolean {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (x1 >= box.x && x0 <= box.x + box.width && y1 >= box.y && y0 <= box.y + box.height) return true;
  }
  return false;
}

function distBoxPolyline(box: Bounds, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const dx = Math.max(0, box.x - x1, x0 - (box.x + box.width));
    const dy = Math.max(0, box.y - y1, y0 - (box.y + box.height));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The plane as a neutral drawing — what the quality count reads
 * ------------------------------------------------------------------ */

export function planeDrawing(container: ExportContainer, plane: PlaneLayout, pools: Array<{ id: string }> = []): Drawing {
  const drawing: Drawing = { shapes: [], labels: [], edges: [] };
  for (const n of container.nodes) {
    const box = plane.shapes.get(n.id);
    if (!box) continue;
    const kind = kindOf(n.tag);
    const shape: DrawnShape = { id: n.id, kind, box, attachedTo: n.tag === 'boundaryEvent' ? n.attachedTo : undefined };
    const inside = plane.inside.get(n.id);
    if (inside) {
      shape.inside = {
        lines: inside.lines,
        fontSize: inside.fontSize,
        bold: true,
        padding: TASK_PADDING,
        reserve: (inside.anchor ? lineHeight(ANCHOR_FONT) : 0) + (inside.fact ? lineHeight(ANCHOR_FONT) : 0),
      };
    }
    drawing.shapes.push(shape);
  }
  for (const r of container.storeRefs) {
    const box = plane.shapes.get(r.id);
    if (box) drawing.shapes.push({ id: r.id, kind: 'store', box });
  }
  for (const a of container.annotations) {
    const box = plane.shapes.get(a.id);
    if (box) drawing.shapes.push({ id: a.id, kind: 'note', box });
  }
  for (const p of pools) {
    const box = plane.shapes.get(p.id);
    if (box) drawing.shapes.push({ id: p.id, kind: 'pool', box });
  }
  for (const [id, l] of plane.labels) {
    drawing.labels.push({ id: `${id}_label`, owner: id, box: l.box, lines: [...l.lines, ...(l.anchor ? [] : [])], fontSize: l.fontSize });
  }
  for (const f of container.flows) {
    const points = plane.edges.get(f.id);
    if (points) drawing.edges.push({ id: f.id, kind: 'sequence', points, sourceId: f.sourceId, targetId: f.targetId });
  }
  for (const a of container.dataAssociations) {
    const points = plane.edges.get(a.id);
    if (points) drawing.edges.push({ id: a.id, kind: 'association', points, sourceId: a.nodeId, targetId: a.storeRefId });
  }
  for (const a of container.annotations) {
    if (!a.associationId) continue;
    const points = plane.edges.get(a.associationId);
    if (points) drawing.edges.push({ id: a.associationId, kind: 'association', points, sourceId: a.nodeId ?? '', targetId: a.id });
  }
  return drawing;
}

/** Text width of a label line — re-exported for renderers that draw labels themselves. */
export { textWidth };

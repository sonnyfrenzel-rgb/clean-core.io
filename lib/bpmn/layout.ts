import type { BpmnTag, ExportContainer, ExportModel, ExportNode } from './model';

/**
 * Automatic layout of the BPMN export — roadmap 2.6, the half that decides
 * *where*.
 *
 * **Why an own layered layout and not a library.** Two were considered:
 *
 * - `bpmn-auto-layout` (bpmn.io) lays out one process and, by its own README,
 *   leaves text annotations, associations and message flows without a place.
 *   Exactly those carry what this export must show: the "Not anchored" note on
 *   an element, the data stores a task reads, the message flow to another
 *   system. It is also asynchronous and re-parses the XML it is given, which
 *   would put a second BPMN parser into the browser bundle for a download button.
 * - `elkjs` is a general graph layouter of well over a megabyte, asynchronous,
 *   and knows nothing of BPMN shapes, boundary events or planes.
 *
 * And the hard part of a general layered layout — breaking cycles — the
 * skeleton has already done: every loop-back is marked as one. What is left is a
 * rank per node, a row per node and orthogonal routes, and that fits here in a
 * few hundred lines that are synchronous, pure, and **stable**: the same
 * skeleton gives the same coordinates, because every order below is the
 * skeleton's order and no step is a heuristic that can flip on a small change
 * (`DESIGN.md` §5.9, rule 10 — users learn where a step is).
 *
 * The drawing rules:
 *
 * - **Left to right by rank.** A node's column is the longest forward path from
 *   the start of its band; the end of a region is always the last column.
 * - **One band per entry** on the top plane, stacked in runtime order
 *   (`skeleton.entries`); a sub-process draws on its **own plane**, which is how
 *   bpmn-js and other modellers drill into a collapsed sub-process.
 * - **The main path stays on one row.** At a split, the branch that reaches the
 *   end of the region, and of those the longest, continues the row; every other
 *   branch takes the first row below whose cells are free up to its first node.
 * - **Loop-backs run over the top** of the rows they span, forward skips that
 *   would cross a node run underneath, merges enter a node from below.
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

export interface PlaneLayout {
  shapes: Map<string, Bounds>;
  edges: Map<string, Point[]>;
}

export interface DiagramLayout {
  /** Container id → its plane. The root container's plane also holds pools and message flows. */
  planes: Map<string, PlaneLayout>;
  /** Present when the model has foreign systems, and so a collaboration. */
  participant?: Bounds;
}

const SIZE: Record<BpmnTag, [number, number]> = {
  startEvent: [36, 36],
  endEvent: [36, 36],
  intermediateCatchEvent: [36, 36],
  boundaryEvent: [36, 36],
  exclusiveGateway: [50, 50],
  // Roadmap 2.17 (a). A gateway is a gateway on the canvas, whatever it decides.
  parallelGateway: [50, 50],
  task: [100, 80],
  serviceTask: [100, 80],
  sendTask: [100, 80],
  userTask: [100, 80],
  businessRuleTask: [100, 80],
  callActivity: [100, 80],
  subProcess: [100, 80],
};

const ORIGIN_X = 180;
const ORIGIN_Y = 80;
/** Wide enough for a condition written on the flow between two columns. */
const COL_GAP = 90;
/** Tall enough for a gateway's statement under it and a detour below that. */
const ROW_H = 160;
/** Where a node's centre sits inside its row. */
const ROW_CENTRE = 50;
const BAND_GAP = 80;
const STORE_ROW_H = 90;
const STORE = 50;
const NOTE_W = 560;
const POOL_H = 60;
const POOL_GAP = 40;

export function layoutModel(model: ExportModel): DiagramLayout {
  const planes = new Map<string, PlaneLayout>();
  for (const container of model.containers) planes.set(container.id, layoutContainer(container));

  if (!model.pools.length) return { planes };

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
  const fromSame = new Map<string, number>();
  for (const message of model.messages) {
    const source = root.shapes.get(message.sourceId);
    const pool = root.shapes.get(message.poolId);
    if (!source || !pool) continue;
    const j = fromSame.get(message.sourceId) ?? 0;
    fromSame.set(message.sourceId, j + 1);
    const x = Math.round(source.x + source.width / 2 + j * 12);
    root.edges.set(message.id, [
      { x, y: source.y + source.height },
      { x, y: pool.y },
    ]);
  }
  return { planes, participant };
}

function boundingBox(plane: PlaneLayout): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of plane.shapes.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  for (const points of plane.edges.values()) {
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX === Infinity) return { x: ORIGIN_X, y: ORIGIN_Y, width: 400, height: 200 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function noteHeight(text: string): number {
  // About 85 characters to a line at the annotation's width; 16 px a line.
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 85)), 0);
  return 20 + lines * 16;
}

function layoutContainer(container: ExportContainer): PlaneLayout {
  const plane: PlaneLayout = { shapes: new Map(), edges: new Map() };
  let top = ORIGIN_Y;

  for (const note of container.annotations) {
    if (note.nodeId) continue;
    const height = noteHeight(note.text);
    plane.shapes.set(note.id, { x: ORIGIN_X, y: top, width: NOTE_W, height });
    top += height + 50;
  }

  container.bands.forEach((_, index) => {
    top = layoutBand(container, index, top, plane) + BAND_GAP;
  });

  for (const note of container.annotations) {
    if (!note.nodeId || !note.associationId) continue;
    const at = plane.shapes.get(note.nodeId);
    if (!at) continue;
    const bounds: Bounds = { x: at.x + at.width + 20, y: at.y - 64, width: 200, height: noteHeight(note.text) };
    plane.shapes.set(note.id, bounds);
    plane.edges.set(note.associationId, [
      { x: at.x + at.width, y: at.y },
      { x: bounds.x, y: bounds.y + bounds.height / 2 },
    ]);
  }
  return plane;
}

/** Lays out one band and returns its bottom edge. */
function layoutBand(container: ExportContainer, bandIndex: number, top: number, plane: PlaneLayout): number {
  const band = container.bands[bandIndex];
  const byId = new Map(container.nodes.map((n) => [n.id, n]));
  const inBand = band.nodeIds.map((id) => byId.get(id) as ExportNode);
  /** Boundary events sit on their host and are not placed on their own. */
  const placed = inBand.filter((n) => !(n.tag === 'boundaryEvent' && n.attachedTo));
  const placedIds = new Set(placed.map((n) => n.id));
  const rep = (id: string): string => byId.get(id)?.attachedTo ?? id;
  const flows = container.flows.filter((f) => placedIds.has(rep(f.sourceId)) && placedIds.has(f.targetId));

  // ---- which flows run backwards ----
  const back = new Set<string>(flows.filter((f) => f.back || rep(f.sourceId) === f.targetId).map((f) => f.id));
  const outOf = new Map<string, typeof flows>();
  for (const f of flows) outOf.set(rep(f.sourceId), [...(outOf.get(rep(f.sourceId)) ?? []), f]);
  {
    // Anything the skeleton did not mark and still closes a cycle is found here,
    // depth first in skeleton order, so the answer does not depend on luck.
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
  const take = (id: string, preferred: number): number => {
    const c = rank.get(id) ?? 0;
    let r = preferred;
    while (!free(r, c)) r += 1;
    row.set(id, r);
    cells.set(c, new Set([...(cells.get(c) ?? []), r]));
    return r;
  };
  const branchRow = (fromRank: number, toRank: number, min: number): number => {
    for (let r = min; ; r++) {
      let clear = true;
      for (let c = fromRank + 1; c <= toRank && clear; c++) clear = free(r, c);
      if (clear) return r;
    }
  };
  /**
   * Depth first, main branch first: a side branch is given its row only when it
   * is taken off the stack, after the whole main path behind it has been placed —
   * so it looks for a free row among cells that are really taken.
   */
  const visit = (start: string) => {
    const stack: Array<{ id: string; from: string | null; main: boolean }> = [{ id: start, from: null, main: true }];
    while (stack.length) {
      const { id, from, main } = stack.pop() as { id: string; from: string | null; main: boolean };
      if (from !== null) {
        if (row.has(id)) continue;
        const r = row.get(from) ?? 0;
        if (main) take(id, r);
        else take(id, branchRow(rank.get(from) ?? 0, rank.get(id) ?? 0, r + 1));
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

  // ---- coordinates ----
  const columns = Math.max(0, ...placed.map((n) => rank.get(n.id) ?? 0)) + 1;
  const colWidth = new Array<number>(columns).fill(36);
  for (const n of placed) {
    const c = rank.get(n.id) ?? 0;
    colWidth[c] = Math.max(colWidth[c], SIZE[n.tag][0]);
  }
  const colX: number[] = [];
  let x = ORIGIN_X;
  for (let c = 0; c < columns; c++) {
    colX.push(x);
    x += colWidth[c] + COL_GAP;
  }
  const rowTop = (r: number) => top + r * ROW_H;
  for (const n of placed) {
    const c = rank.get(n.id) ?? 0;
    const [w, h] = SIZE[n.tag];
    const cx = colX[c] + colWidth[c] / 2;
    const cy = rowTop(row.get(n.id) ?? 0) + ROW_CENTRE;
    plane.shapes.set(n.id, { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h });
  }
  const onHost = new Map<string, number>();
  for (const n of inBand) {
    if (!(n.tag === 'boundaryEvent' && n.attachedTo)) continue;
    const host = plane.shapes.get(n.attachedTo);
    if (!host) continue;
    const k = onHost.get(n.attachedTo) ?? 0;
    onHost.set(n.attachedTo, k + 1);
    plane.shapes.set(n.id, { x: host.x + host.width - 48 - k * 40, y: host.y + host.height - 18, width: 36, height: 36 });
  }

  // ---- routes ----
  const box = (id: string) => plane.shapes.get(id) as Bounds;
  const cx = (b: Bounds) => Math.round(b.x + b.width / 2);
  const cy = (b: Bounds) => Math.round(b.y + b.height / 2);
  const seenPair = new Map<string, number>();
  for (const f of flows) {
    const s = box(f.sourceId);
    const t = box(f.targetId);
    if (!s || !t) continue;
    const pair = `${f.sourceId}>${f.targetId}`;
    const k = seenPair.get(pair) ?? 0;
    seenPair.set(pair, k + 1);
    const host = rep(f.sourceId);
    const rs = row.get(host) ?? 0;
    const rt = row.get(f.targetId) ?? 0;
    const fromBoundary = host !== f.sourceId;

    if (back.has(f.id)) {
      if (f.sourceId === f.targetId) {
        const up = s.y - 22 - k * 8;
        const right = s.x + s.width + 22 + k * 8;
        plane.edges.set(f.id, [
          { x: s.x + s.width, y: cy(s) }, { x: right, y: cy(s) }, { x: right, y: up },
          { x: cx(s), y: up }, { x: cx(s), y: s.y },
        ]);
        continue;
      }
      const channel = rowTop(Math.min(rs, rt)) + 4 - k * 8;
      plane.edges.set(f.id, [
        { x: cx(s), y: fromBoundary ? s.y + s.height : s.y },
        ...(fromBoundary ? [{ x: cx(s), y: s.y + s.height + 12 }, { x: cx(s) + 30, y: s.y + s.height + 12 }, { x: cx(s) + 30, y: channel }] : [{ x: cx(s), y: channel }]),
        { x: cx(t), y: channel },
        { x: cx(t), y: t.y },
      ]);
      continue;
    }

    const below = rowTop(rs) + ROW_H - 14 - k * 8;
    if (fromBoundary) {
      // Its own lane under the row, above the one detours use, so the handler's
      // path and a skipped branch do not read as one line.
      const lane = below - 22;
      plane.edges.set(f.id, rt > rs
        ? [{ x: cx(s), y: s.y + s.height }, { x: cx(s), y: cy(t) }, { x: t.x, y: cy(t) }]
        : [{ x: cx(s), y: s.y + s.height }, { x: cx(s), y: lane }, { x: cx(t), y: lane }, { x: cx(t), y: t.y + t.height }]);
      continue;
    }
    if (rs === rt) {
      const from = rank.get(host) ?? 0;
      const to = rank.get(f.targetId) ?? 0;
      let clear = k === 0 && to > from;
      for (let c = from + 1; c < to && clear; c++) clear = free(rs, c);
      plane.edges.set(f.id, clear
        ? [{ x: s.x + s.width, y: cy(s) }, { x: t.x, y: cy(t) }]
        : [{ x: cx(s), y: s.y + s.height }, { x: cx(s), y: below }, { x: cx(t), y: below }, { x: cx(t), y: t.y + t.height }]);
      continue;
    }
    if (rt > rs) {
      plane.edges.set(f.id, [
        { x: cx(s) + k * 8, y: s.y + s.height }, { x: cx(s) + k * 8, y: cy(t) }, { x: t.x, y: cy(t) },
      ]);
      continue;
    }
    plane.edges.set(f.id, [
      { x: s.x + s.width, y: cy(s) - k * 8 }, { x: cx(t), y: cy(s) - k * 8 }, { x: cx(t), y: t.y + t.height },
    ]);
  }

  // ---- data stores, in a row of their own under the band ----
  const rows = maxRow() + 1;
  const storeTop = rowTop(rows) + 10;
  const refs = container.storeRefs.filter((r) => r.band === bandIndex);
  const firstUser = (refId: string): number => {
    const xs = container.dataAssociations.filter((a) => a.storeRefId === refId).map((a) => box(a.nodeId)).filter(Boolean).map(cx);
    return xs.length ? Math.min(...xs) : ORIGIN_X + STORE / 2;
  };
  const taken: number[] = [];
  // Left to right by the first task that uses a store, so a store sits under
  // its first reader and the next one moves aside rather than the other way round.
  const byPosition = refs.map((ref) => ({ ref, at: firstUser(ref.id) })).sort((a, b) => a.at - b.at);
  for (const { ref, at } of byPosition) {
    let sx = at - STORE / 2;
    while (taken.some((t) => Math.abs(t - sx) < STORE + 30)) sx += STORE + 30;
    taken.push(sx);
    plane.shapes.set(ref.id, { x: sx, y: storeTop, width: STORE, height: STORE });
  }
  for (const a of container.dataAssociations) {
    const ref = refs.find((r) => r.id === a.storeRefId);
    if (!ref) continue;
    const node = box(a.nodeId);
    const store = box(ref.id);
    if (!node || !store) continue;
    const atNode = { x: cx(node), y: node.y + node.height };
    const atStore = { x: cx(store), y: store.y };
    plane.edges.set(a.id, a.direction === 'input' ? [atStore, atNode] : [atNode, atStore]);
  }

  return rowTop(rows) + (refs.length ? STORE_ROW_H : 0);
}

import type { Bounds, Point } from './layout';

/**
 * Orthogonal routing for the BPMN layout — every flow as a line of horizontal
 * and vertical legs that runs **around** shapes and labels, never through them,
 * and never along another flow.
 *
 * A sparse grid: the candidate lines are the gaps between columns and rows of
 * the layout, the centres and port lines of the shapes, cut into short tracks.
 * Each flow is an A* search over that grid with a cost for length, a larger one
 * for each bend and for crossing a flow already drawn, and two hard rules: a leg
 * may not enter an obstacle, and it may not run on a stretch of line another
 * flow already uses — so two flows can cross, but they can never be read as one.
 *
 * Deterministic: the grid is sorted, ties break by insertion order, and the
 * flows are routed in the order the caller gives.
 */

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface PortChoice {
  side: Side;
  /** The point on the shape's outline. */
  point: Point;
  /** Extra cost of leaving or entering on this side. */
  cost: number;
  /** Where the straight stub out of the outline ends; default 14 px out. */
  stub?: Point;
}

export interface RouteRequest {
  id: string;
  from: PortChoice[];
  to: PortChoice[];
  /** Sequence flows avoid crossings harder than associations do. */
  crossingCost?: number;
}

const STUB = 14;
const BEND = 26;
const DIR: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

export function outward(side: Side, p: Point, d = STUB): Point {
  return { x: p.x + DIR[side].x * d, y: p.y + DIR[side].y * d };
}

/** A binary heap keyed by number — the A* open list. */
class Heap {
  private items: Array<[number, number]> = [];
  push(key: number, value: number) {
    const a = this.items;
    a.push([key, value]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] < a[i][0] || (a[p][0] === a[i][0] && a[p][1] <= a[i][1])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0][1];
    const last = a.pop() as [number, number];
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        const less = (x: number, y: number) => a[x][0] < a[y][0] || (a[x][0] === a[y][0] && a[x][1] < a[y][1]);
        if (l < a.length && less(l, m)) m = l;
        if (r < a.length && less(r, m)) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

function uniqSorted(values: number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].map((x) => Math.round(x)).sort((a, b) => a - b)) {
    if (!out.length || out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

export class Router {
  private xs: number[];
  private ys: number[];
  private xi = new Map<number, number>();
  private yi = new Map<number, number>();
  /** Blocked unit legs: horizontal leg (i→i+1 at row j) and vertical leg (j→j+1 at column i). */
  private hBlocked: Uint8Array;
  private vBlocked: Uint8Array;
  /** Occupied unit legs, by any routed flow. */
  private hUsed: Uint8Array;
  private vUsed: Uint8Array;
  /** Grid points some routed flow passes or bends at. */
  private pointUsed: Uint8Array;
  /** Grid points inside an obstacle. */
  private pointBlocked: Uint8Array;
  /** Search buffers, reused from one flow to the next; `touched` says what to reset. */
  private g: Float64Array | null = null;
  private prev: Int32Array | null = null;
  private closed: Uint8Array | null = null;
  private touched: number[] = [];

  constructor(xLines: number[], yLines: number[], private obstacles: Bounds[]) {
    this.xs = uniqSorted(xLines);
    this.ys = uniqSorted(yLines);
    this.xs.forEach((x, i) => this.xi.set(x, i));
    this.ys.forEach((y, j) => this.yi.set(y, j));
    const nx = this.xs.length;
    const ny = this.ys.length;
    this.hBlocked = new Uint8Array(nx * ny);
    this.vBlocked = new Uint8Array(nx * ny);
    this.hUsed = new Uint8Array(nx * ny);
    this.vUsed = new Uint8Array(nx * ny);
    this.pointUsed = new Uint8Array(nx * ny);
    this.pointBlocked = new Uint8Array(nx * ny);
    for (const o of obstacles) this.block(o);
  }

  /** Mark everything inside `o` (open interior) as not passable. */
  block(o: Bounds) {
    const nx = this.xs.length;
    const { xs, ys } = this;
    const x0 = o.x;
    const x1 = o.x + o.width;
    const y0 = o.y;
    const y1 = o.y + o.height;
    for (let j = 0; j < ys.length; j += 1) {
      const y = ys[j];
      if (y <= y0 || y >= y1) continue;
      for (let i = 0; i + 1 < xs.length; i += 1) {
        if (xs[i + 1] > x0 && xs[i] < x1) this.hBlocked[j * nx + i] = 1;
      }
      for (let i = 0; i < xs.length; i += 1) if (xs[i] > x0 && xs[i] < x1) this.pointBlocked[j * nx + i] = 1;
    }
    for (let i = 0; i < xs.length; i += 1) {
      const x = xs[i];
      if (x <= x0 || x >= x1) continue;
      for (let j = 0; j + 1 < ys.length; j += 1) {
        if (ys[j + 1] > y0 && ys[j] < y1) this.vBlocked[j * nx + i] = 1;
      }
    }
  }

  private idx(i: number, j: number) {
    return j * this.xs.length + i;
  }

  /**
   * Mark a finished route's legs as used — and the lines right beside them:
   * two flows 1 px apart are one flow to a reader.
   */
  occupy(points: Point[], near = 7) {
    for (let k = 1; k < points.length; k += 1) {
      const a = points[k - 1];
      const b = points[k];
      if (a.y === b.y) {
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        for (let j = 0; j < this.ys.length; j += 1) {
          if (Math.abs(this.ys[j] - a.y) >= near) continue;
          for (let i = 0; i + 1 < this.xs.length; i += 1) {
            if (this.xs[i + 1] > lo && this.xs[i] < hi) this.hUsed[this.idx(i, j)] = 1;
          }
          if (this.ys[j] !== a.y) continue;
          for (let i = 0; i < this.xs.length; i += 1) if (this.xs[i] >= lo && this.xs[i] <= hi) this.pointUsed[this.idx(i, j)] = 1;
        }
      } else if (a.x === b.x) {
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        for (let i = 0; i < this.xs.length; i += 1) {
          if (Math.abs(this.xs[i] - a.x) >= near) continue;
          for (let j = 0; j + 1 < this.ys.length; j += 1) {
            if (this.ys[j + 1] > lo && this.ys[j] < hi) this.vUsed[this.idx(i, j)] = 1;
          }
          if (this.xs[i] !== a.x) continue;
          for (let j = 0; j < this.ys.length; j += 1) if (this.ys[j] >= lo && this.ys[j] <= hi) this.pointUsed[this.idx(i, j)] = 1;
        }
      }
    }
  }

  /**
   * Route one flow. Returns the polyline from a port of `from` to a port of
   * `to`, or null when the grid holds no way at all.
   */
  route(req: RouteRequest): Point[] | null {
    const nx = this.xs.length;
    const ny = this.ys.length;
    const crossing = req.crossingCost ?? 60;
    // State: point index * 4 + direction (0 right, 1 left, 2 down, 3 up).
    const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const sideDir: Record<Side, number> = { right: 0, left: 1, bottom: 2, top: 3 };
    const N = nx * ny * 4;
    if (!this.g || this.g.length !== N) {
      this.g = new Float64Array(N).fill(Infinity);
      this.prev = new Int32Array(N).fill(-1);
      this.closed = new Uint8Array(N);
    }
    for (const t of this.touched) {
      this.g[t] = Infinity;
      (this.prev as Int32Array)[t] = -1;
      (this.closed as Uint8Array)[t] = 0;
    }
    this.touched = [];
    const g = this.g;
    const prev = this.prev as Int32Array;
    const closed = this.closed as Uint8Array;
    const touched = this.touched;
    const heap = new Heap();
    const starts: Array<{ state: number; port: PortChoice; stub: Point }> = [];
    for (const port of req.from) {
      const stub = port.stub ?? outward(port.side, port.point);
      const i = this.xi.get(Math.round(stub.x));
      const j = this.yi.get(Math.round(stub.y));
      if (i === undefined || j === undefined || this.pointBlocked[this.idx(i, j)]) continue;
      const state = this.idx(i, j) * 4 + sideDir[port.side];
      const cost = port.cost + (this.pointUsed[this.idx(i, j)] ? crossing : 0);
      if (cost < g[state]) {
        g[state] = cost;
        touched.push(state);
        starts.push({ state, port, stub });
        heap.push(cost, state);
      }
    }
    // Goals: arrive at the stub point of a target port, heading inward.
    const goals = new Map<number, PortChoice>();
    const goalCost = new Map<number, number>();
    const inward: Record<Side, number> = { left: 0, right: 1, top: 2, bottom: 3 };
    const goalPoints: Point[] = [];
    for (const port of req.to) {
      const stub = port.stub ?? outward(port.side, port.point);
      const i = this.xi.get(Math.round(stub.x));
      const j = this.yi.get(Math.round(stub.y));
      if (i === undefined || j === undefined) continue;
      goals.set(this.idx(i, j), port);
      goalCost.set(this.idx(i, j), port.cost);
      goalPoints.push(stub);
      void inward;
    }
    if (!starts.length || !goals.size) {
      return null;
    }

    let found = -1;
    let foundCost = Infinity;
    // Admissible: the distance to the nearest goal, so the first goal found
    // is not mistaken for the cheapest when another side would be.
    const heuristic = (x: number, y: number) => {
      let best = Infinity;
      for (const q of goalPoints) best = Math.min(best, Math.abs(x - q.x) + Math.abs(y - q.y));
      return best;
    };
    while (heap.size) {
      const state = heap.pop() as number;
      if (closed[state]) continue;
      closed[state] = 1;
      touched.push(state);
      const cost = g[state];
      const p0 = state >> 2;
      const i0 = p0 % nx;
      if (cost + heuristic(this.xs[i0], this.ys[(p0 - i0) / nx]) >= foundCost) break;
      const p = state >> 2;
      const d = state & 3;
      const i = p % nx;
      const j = (p - i) / nx;
      const goal = goals.get(p);
      if (goal) {
        // The last leg must point into the target: the stub runs inward.
        const want = { left: 0, right: 1, top: 2, bottom: 3 }[goal.side];
        const extra = (d === want ? 0 : BEND) + (goalCost.get(p) ?? 0);
        // Arriving from the far side would run back over the stub — not allowed.
        const opposite = { 0: 1, 1: 0, 2: 3, 3: 2 }[want as 0 | 1 | 2 | 3];
        if (d !== opposite && cost + extra < foundCost) {
          foundCost = cost + extra;
          found = state;
        }
      }
      for (let nd = 0; nd < 4; nd += 1) {
        // No U-turns.
        if ((d === 0 && nd === 1) || (d === 1 && nd === 0) || (d === 2 && nd === 3) || (d === 3 && nd === 2)) continue;
        const [dx, dy] = dirs[nd];
        const ni = i + dx;
        const nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        // Leg blocked or used?
        if (dy === 0) {
          const leg = this.idx(Math.min(i, ni), j);
          if (this.hBlocked[leg] || this.hUsed[leg]) continue;
        } else {
          const leg = this.idx(i, Math.min(j, nj));
          if (this.vBlocked[leg] || this.vUsed[leg]) continue;
        }
        const np = this.idx(ni, nj);
        if (this.pointBlocked[np] && !goals.has(np)) continue;
        const len = Math.abs(this.xs[ni] - this.xs[i]) + Math.abs(this.ys[nj] - this.ys[j]);
        let step = len + (nd !== d ? BEND : 0);
        if (this.pointUsed[np]) step += crossing;
        const ns = np * 4 + nd;
        const ng = cost + step;
        if (ng < g[ns]) {
          g[ns] = ng;
          touched.push(ns);
          prev[ns] = state;
          heap.push(ng + heuristic(this.xs[ni], this.ys[nj]), ns);
        }
      }
    }
    if (found < 0) {
      return null;
    }

    const chain: number[] = [];
    for (let s = found; s >= 0; s = prev[s]) chain.unshift(s);
    const start = starts.find((s) => s.state === chain[0]) as (typeof starts)[number];
    const goalPort = goals.get(found >> 2) as PortChoice;
    const pts: Point[] = [start.port.point];
    for (const s of chain) {
      const p = s >> 2;
      const i = p % nx;
      const j = (p - i) / nx;
      pts.push({ x: this.xs[i], y: this.ys[j] });
    }
    pts.push(goalPort.point);
    return simplify(pts);
  }
}

/** Drop repeated and collinear points. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const q = { x: Math.round(p.x), y: Math.round(p.y) };
    const last = out[out.length - 1];
    if (last && last.x === q.x && last.y === q.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((a.x === b.x && b.x === q.x) || (a.y === b.y && b.y === q.y)) {
        out[out.length - 1] = q;
        continue;
      }
    }
    out.push(q);
  }
  return out;
}

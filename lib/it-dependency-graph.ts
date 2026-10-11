import type { CloudReadinessGrade } from './abap/abcd-classification';
import type { ItObjectRow, ItObjects } from './it-objects';

/**
 * The dependency graph of the IT view (roadmap "after 3.0.7", item 3) — the
 * program, its own objects and what they call, read or write, drawn beside the
 * one table of ADR-086.
 *
 * **No second source.** Everything here is read off `ItObjects`, the rows the
 * *Objects & dependencies* table shows: a node is an object of those rows, an
 * edge is one row (object and use) seen from one own object, and its lines are
 * that row's lines. Which own object an edge starts at is the table's *Used by*
 * — the innermost listed own object whose range holds the line, computed with
 * the same rule (`itObjects`'s holder) from the same ranges the table prints.
 * A line no listed own object holds belongs to the program itself, as the
 * table's "outside the listed own objects" says. No model, no catalog, nothing
 * stored: the levels are the rows' levels.
 *
 * **The table is the answer, the graph the overview.** A program of 600 lines
 * uses 27 objects from 20 routines; drawn whole, that is a hairball nobody
 * reads. So the graph is capped (`DEP_GRAPH_CAPS`), worst level first in the
 * product's own order (D, C, B, A, Unknown, none — `it-findings-build.ts`),
 * then in the table's order, and says how much it left out: "and N more — see
 * the table". Drawn, the objects stand beside the own objects that use them
 * rather than in the table's order: an overview whose lines all cross is no
 * overview. Every node and edge carries the key of the table row it stands
 * for, so a click goes to that row.
 *
 * Pure and deterministic, layout included — the coordinates are computed here
 * rather than measured in a browser, so a spec can hold them.
 */

export type DepGraphUse = 'call' | 'read' | 'write' | 'use';

export interface DepGraphSource {
  /** Stable — `program` or `own:NAME`. */
  key: string;
  /** The own object's name; `null` for a program the inventory does not name. */
  name: string | null;
  /** `program` heads the column; `own` is a listed own object with a line range. */
  role: 'program' | 'own';
  /** Inventory type (`Form Routine`, `Report`), `null` for an unnamed program. */
  kind: string | null;
  range: { start: number; end: number | null } | null;
  /** The table row this node stands for; `null` when the table has none (an unnamed program). */
  rowKey: string | null;
}

export interface DepGraphObject {
  /** Stable — `obj:NAME`. */
  key: string;
  name: string;
  /** The use kind of its first row (`bapi`, `table` …). */
  kind: string;
  owner: ItObjectRow['owner'];
  /**
   * The worst level over the object's rows in the product's order (D, C, B, A,
   * Unknown), `null` when no row was asked. A table read at C and written at D
   * is a D node; each edge keeps its own row's level.
   */
  level: CloudReadinessGrade | null;
  /** The object's rows in the table's order — the first is where a click goes. */
  rowKeys: string[];
  remote: boolean;
}

export interface DepGraphEdge {
  /** Stable — `source→rowKey`. */
  key: string;
  from: string;
  to: string;
  use: DepGraphUse;
  batchInput: ItObjectRow['batchInput'];
  /** The row's lines that this source holds, ascending; empty when the row records none. */
  lines: number[];
  level: CloudReadinessGrade | null;
  /** The table row this edge is a part of. */
  rowKey: string;
}

export interface DepGraph {
  sources: DepGraphSource[];
  objects: DepGraphObject[];
  edges: DepGraphEdge[];
  /**
   * What the whole table holds, and what the graph left out of it. `rows` are
   * the table's rows of uses — the count the IT view's "Uses" figure gives; a
   * row is left out when any of its edges is.
   */
  total: { objects: number; sources: number; edges: number; rows: number };
  hidden: { objects: number; sources: number; edges: number; rows: number };
  /** Nothing to draw: no row of the table is a use. */
  empty: boolean;
}

/**
 * The most the overview draws. Twelve objects and sixteen edges keep the
 * picture about as tall as the table's first five rows plus its toolbar; past
 * that a reader stops following lines and reads the table anyway.
 */
export const DEP_GRAPH_CAPS = { objects: 12, sources: 12, edges: 16 } as const;
export type DepGraphCaps = { objects: number; sources: number; edges: number };

/** The product's order of levels, worst first (`lib/it-findings-build.ts` `LEVEL_RANK`), none last. */
const LEVEL_RANK: Record<CloudReadinessGrade, number> = { D: 0, C: 1, B: 2, A: 3, Unknown: 4 };
export const levelRank = (g: CloudReadinessGrade | null): number => (g === null ? 5 : LEVEL_RANK[g]);

export const PROGRAM_KEY = 'program';
const ownKey = (name: string) => `own:${name.toUpperCase()}`;
const objKey = (name: string) => `obj:${name.toUpperCase()}`;

/** The graph of one `ItObjects`, capped. */
export function dependencyGraph(objects: ItObjects, caps: DepGraphCaps = DEP_GRAPH_CAPS): DepGraph {
  const ownRows = objects.rows.filter((r) => r.side === 'own-object');
  const deps = objects.rows.filter((r) => r.side === 'dependency');

  // The program: the inventory's report where it names one, else unnamed.
  const report = ownRows.find((r) => r.kind === 'Report');
  const program: DepGraphSource = {
    key: PROGRAM_KEY,
    name: report ? report.object : null,
    role: 'program',
    kind: report ? report.kind : null,
    range: null,
    rowKey: report ? report.key : null,
  };

  // The ranges the table prints, and its holder rule: the innermost one.
  const ranged = ownRows
    .filter((r) => r.range !== null)
    .map((r) => ({ row: r, start: r.range!.start, end: r.range!.end ?? r.range!.start }));
  const holderOf = (line: number) => {
    let best: (typeof ranged)[number] | null = null;
    for (const r of ranged) {
      if (line < r.start || line > r.end) continue;
      if (!best || r.end - r.start < best.end - best.start) best = r;
    }
    return best;
  };

  // Every edge the table implies: one per row and holder.
  type Candidate = DepGraphEdge & { order: number };
  const candidates: Candidate[] = [];
  const sourceOf = new Map<string, DepGraphSource>([[PROGRAM_KEY, program]]);
  deps.forEach((row, order) => {
    const byHolder = new Map<string, number[]>();
    for (const line of row.lines) {
      const h = holderOf(line);
      const key = h ? ownKey(h.row.object) : PROGRAM_KEY;
      if (h && !sourceOf.has(key)) {
        sourceOf.set(key, { key, name: h.row.object, role: 'own', kind: h.row.kind, range: h.row.range, rowKey: h.row.key });
      }
      byHolder.set(key, [...(byHolder.get(key) ?? []), line]);
    }
    // A use whose lines are not recorded is the program's — the place is not known.
    if (row.lines.length === 0) byHolder.set(PROGRAM_KEY, []);
    for (const [from, lines] of byHolder) {
      candidates.push({
        key: `${from}→${row.key}`,
        from,
        to: objKey(row.object),
        use: row.use === 'defined' ? 'use' : row.use,
        batchInput: row.batchInput,
        lines: [...lines].sort((a, b) => a - b),
        level: row.level,
        rowKey: row.key,
        order,
      });
    }
  });

  const objectOf = new Map<string, DepGraphObject>();
  for (const row of deps) {
    const key = objKey(row.object);
    const held = objectOf.get(key);
    if (!held) {
      objectOf.set(key, {
        key,
        name: row.object,
        kind: row.kind,
        owner: row.owner,
        level: row.level,
        rowKeys: [row.key],
        remote: row.remote,
      });
    } else {
      held.rowKeys.push(row.key);
      held.remote = held.remote || row.remote;
      if (levelRank(row.level) < levelRank(held.level)) held.level = row.level;
    }
  }

  // Worst level first, then the table's order, then the line.
  const ranked = [...candidates].sort(
    (a, b) => levelRank(a.level) - levelRank(b.level) || a.order - b.order || (a.lines[0] ?? 0) - (b.lines[0] ?? 0),
  );
  const keptObjects = new Set<string>();
  const keptSources = new Set<string>();
  const kept: Candidate[] = [];
  for (const edge of ranked) {
    if (kept.length >= caps.edges) break;
    const newObject = !keptObjects.has(edge.to);
    const newSource = edge.from !== PROGRAM_KEY && !keptSources.has(edge.from);
    if (newObject && keptObjects.size >= caps.objects) continue;
    if (newSource && keptSources.size >= caps.sources) continue;
    keptObjects.add(edge.to);
    if (edge.from !== PROGRAM_KEY) keptSources.add(edge.from);
    kept.push(edge);
  }

  const ownSources = [...sourceOf.values()].filter((s) => s.role === 'own');
  const sources: DepGraphSource[] = [
    program,
    ...ownSources
      .filter((s) => keptSources.has(s.key))
      .sort((a, b) => (a.range?.start ?? 0) - (b.range?.start ?? 0) || (a.name ?? '').localeCompare(b.name ?? '')),
  ];
  // Objects beside the own objects that use them — each at the mean place of
  // its sources, the table's order between equals — so that a routine and what
  // it reads stand level with each other and the lines cross as little as they
  // can. The sources keep the order of their lines.
  const sourceIndex = new Map(sources.map((s, i) => [s.key, i]));
  const tableIndex = new Map([...objectOf.keys()].map((k, i) => [k, i]));
  const meanSource = (key: string) => {
    const at = kept.filter((e) => e.to === key).map((e) => sourceIndex.get(e.from)!);
    return at.reduce((a, b) => a + b, 0) / Math.max(1, at.length);
  };
  const objectsOut = [...objectOf.values()]
    .filter((o) => keptObjects.has(o.key))
    .map((o) => ({ o, at: meanSource(o.key) }))
    .sort((a, b) => a.at - b.at || tableIndex.get(a.o.key)! - tableIndex.get(b.o.key)!)
    .map(({ o }) => o);
  const objectIndex = new Map(objectsOut.map((o, i) => [o.key, i]));
  // Edges by their source, then by their object: the labels stand in the order the lines run.
  const edges: DepGraphEdge[] = kept
    .sort((a, b) => sourceIndex.get(a.from)! - sourceIndex.get(b.from)! || objectIndex.get(a.to)! - objectIndex.get(b.to)!)
    .map((e) => ({
      key: e.key,
      from: e.from,
      to: e.to,
      use: e.use,
      batchInput: e.batchInput,
      lines: e.lines,
      level: e.level,
      rowKey: e.rowKey,
    }));

  // A row (object and use) counts as drawn when every edge it splits into is.
  const keptEdgeKeys = new Set(edges.map((e) => e.key));
  const rowsDrawn = deps.filter((row) =>
    candidates.filter((c) => c.rowKey === row.key).every((c) => keptEdgeKeys.has(c.key)),
  ).length;
  const total = { objects: objectOf.size, sources: ownSources.length, edges: candidates.length, rows: deps.length };
  return {
    sources,
    objects: objectsOut,
    edges,
    total,
    hidden: {
      objects: total.objects - objectsOut.length,
      sources: total.sources - (sources.length - 1),
      edges: total.edges - edges.length,
      rows: total.rows - rowsDrawn,
    },
    empty: deps.length === 0,
  };
}

/* ------------------------------------------------------------------ layout */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DepGraphLayout {
  width: number;
  height: number;
  sources: Map<string, Box>;
  objects: Map<string, Box>;
  /** The label of each edge, standing in the middle column; the edge runs through it. */
  labels: Map<string, Box>;
  /** Two cubic curves per edge: source → label, label → object. */
  paths: Map<string, [string, string]>;
  /** The guide from the program down to its last own object, `null` with none. */
  guide: string | null;
}

/**
 * Three columns — the program and its own objects, the edge labels, the
 * objects used — at a fixed width: on a phone the picture scrolls inside its
 * own track instead of shrinking its text below 11 px.
 */
export const DEP_GRAPH_GEOMETRY = {
  width: 720,
  source: { x: 0, indent: 16, w: 208, h: 44 },
  label: { x: 264, w: 184, h: 28 },
  object: { x: 504, w: 216, h: 48 },
  gap: 8,
  maxGap: 24,
  pad: 4,
} as const;

/** `n` boxes of height `h` spread over `height`, centred, at most `maxGap` apart. */
function column(n: number, h: number, height: number, gap: number, maxGap: number, pad: number): number[] {
  if (n === 0) return [];
  const free = n > 1 ? Math.min(maxGap, Math.max(gap, (height - 2 * pad - n * h) / (n - 1))) : 0;
  const block = n * h + (n - 1) * free;
  const top = pad + Math.max(0, (height - 2 * pad - block) / 2);
  return Array.from({ length: n }, (_, i) => Math.round(top + i * (h + free)));
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = Math.round((x1 + x2) / 2);
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

export function layoutDependencyGraph(graph: DepGraph): DepGraphLayout {
  const g = DEP_GRAPH_GEOMETRY;
  const natural = (n: number, h: number) => (n === 0 ? 0 : n * h + (n - 1) * g.gap);
  const height =
    2 * g.pad +
    Math.max(natural(graph.sources.length, g.source.h), natural(graph.edges.length, g.label.h), natural(graph.objects.length, g.object.h));

  const sources = new Map<string, Box>();
  column(graph.sources.length, g.source.h, height, g.gap, g.maxGap, g.pad).forEach((y, i) => {
    const s = graph.sources[i];
    const indent = s.role === 'program' ? 0 : g.source.indent;
    sources.set(s.key, { x: g.source.x + indent, y, w: g.source.w - indent, h: g.source.h });
  });
  const objects = new Map<string, Box>();
  column(graph.objects.length, g.object.h, height, g.gap, g.maxGap, g.pad).forEach((y, i) => {
    objects.set(graph.objects[i].key, { x: g.object.x, y, w: g.object.w, h: g.object.h });
  });
  const labels = new Map<string, Box>();
  const paths = new Map<string, [string, string]>();
  column(graph.edges.length, g.label.h, height, g.gap, g.maxGap, g.pad).forEach((y, i) => {
    const e = graph.edges[i];
    const box = { x: g.label.x, y, w: g.label.w, h: g.label.h };
    labels.set(e.key, box);
    const s = sources.get(e.from)!;
    const o = objects.get(e.to)!;
    const cy = y + g.label.h / 2;
    paths.set(e.key, [
      curve(s.x + s.w, s.y + s.h / 2, box.x, cy),
      curve(box.x + box.w, cy, o.x, o.y + o.h / 2),
    ]);
  });

  const own = graph.sources.filter((s) => s.role === 'own');
  const program = sources.get(PROGRAM_KEY);
  const last = own.length > 0 ? sources.get(own[own.length - 1].key) : undefined;
  const gx = g.source.x + g.source.indent / 2;
  // A vertical from the program down to its last own object, and a tick into each.
  const guide =
    program && last
      ? [
          `M ${gx} ${program.y + program.h} L ${gx} ${last.y + last.h / 2}`,
          ...own.map((s) => {
            const b = sources.get(s.key)!;
            return `M ${gx} ${b.y + b.h / 2} L ${b.x} ${b.y + b.h / 2}`;
          }),
        ].join(' ')
      : null;

  return { width: g.width, height, sources, objects, labels, paths, guide };
}

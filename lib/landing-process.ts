import fs from 'fs';
import path from 'path';
import { buildProcessSkeleton, type ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { buildExportModel, isEarlyEnd, isMultiInstanceLoop, type BpmnTag, type ExportContainer, type ExportModel } from '@/lib/bpmn/model';
import { layoutModel, type Bounds, type DiagramLayout, type Direction, type PlacedLabel, type Point } from '@/lib/bpmn/layout';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { notDetermined } from '@/lib/workspace-model';
import { tokenizeAbapLine, type CodeToken } from '@/lib/process-map';

/**
 * The process pictures of the public landing page — roadmap 3.0.6.
 *
 * The landing mockup draws BPMN; the page may only show BPMN the product really
 * produces. So nothing here is drawn for the page: every plane comes out of the
 * same three calls the BPMN 2.0 export makes (`buildProcessSkeleton` →
 * `buildExportModel` → `layoutModel`, `lib/bpmn/export.ts`) over an example
 * file that ships with the product, and the coordinates are the ones written
 * into the file's `BPMNDiagram` — the diagram a modeller opens and the one the
 * workspace draws with bpmn-js. What this module adds is only the reduction to
 * plain data a server component can turn into SVG: no parser, no layouter and
 * no bpmn-js in the landing page's browser bundle.
 *
 * Every line anchor on the page is a node's `anchor` out of the skeleton; every
 * count (rules, not determined, unreached forms, helpers) is read from the
 * engine at render time. Nothing is typed.
 *
 * Server only: reads the example files.
 */

export interface LandingNode {
  id: string;
  tag: BpmnTag;
  /** The token out of the source — the technical name; a landing page calls no model. */
  name: string;
  error: boolean;
  early: boolean;
  multiInstance: boolean;
  attachedTo: string | null;
  anchor: { lineStart: number; lineEnd: number } | null;
  box: Bounds;
  /** The container id of the plane a collapsed sub-process opens. */
  opens: string | null;
  /** Name and anchor beside an event or a gateway, where the layout put them. */
  label: PlacedLabel | null;
  /** The wrapped name inside an activity. */
  inside: string[] | null;
}

export interface LandingFlow {
  id: string;
  points: Point[];
  /** The condition as the code writes it; empty for an unconditional flow. */
  condition: string;
  /** What the flow says on the map, wrapped and placed by the layout; null when nothing. */
  label: PlacedLabel | null;
  back: boolean;
}

export interface LandingStore {
  id: string;
  table: string;
  box: Bounds;
  label: PlacedLabel | null;
}

export interface LandingPlane {
  /** The container id — `process` for the top plane. */
  id: string;
  /** The routine or program the plane belongs to. */
  label: string;
  /** Where the plane is called from, for a sub-process. */
  anchor: { lineStart: number; lineEnd: number } | null;
  /** The drawing's own frame, in the export's coordinates. */
  frame: Bounds;
  nodes: LandingNode[];
  flows: LandingFlow[];
  stores: LandingStore[];
  /** Dotted lines between a step and a table it reads or writes. */
  associations: Point[][];
  /** Foreign systems on the top plane, as collapsed pools. */
  pools: Array<{ id: string; name: string; box: Bounds }>;
  messages: Array<{ id: string; points: Point[]; anchor: { lineStart: number; lineEnd: number } | null }>;
  /** Parent plane id, for the path shown above an opened plane. */
  parent: string | null;
}

export interface LandingProcess {
  fileName: string;
  program: string;
  lines: number;
  planes: LandingPlane[];
  /** Flow nodes of every plane, and how many carry a line anchor. */
  flowNodes: number;
  anchored: number;
  notDrawn: {
    unreached: number;
    forms: number;
    modules: number;
    unreachedLines: number;
    firstLine: number | null;
    lastLine: number | null;
    helpers: string[];
    clones: number;
  };
}

const EXAMPLES = path.join(process.cwd(), 'public', 'starter-examples');

function readExample(fileName: string): string {
  // LF whatever the checkout did: anchors count lines, and a CRLF working copy
  // must give the same numbers as the deployed image.
  return fs.readFileSync(path.join(EXAMPLES, fileName), 'utf8').replace(/\r\n/g, '\n');
}

function anchorOf(a: { lineStart: number; lineEnd: number } | null | undefined) {
  return a ? { lineStart: a.lineStart, lineEnd: a.lineEnd } : null;
}

function planeOf(
  container: ExportContainer,
  model: ExportModel,
  layout: DiagramLayout,
  label: string,
  anchor: LandingPlane['anchor'],
  parent: string | null,
): LandingPlane {
  const plane = layout.planes.get(container.id);
  if (!plane) throw new Error(`landing-process: no layout for ${container.id}`);
  const nodes: LandingNode[] = container.nodes.flatMap((n) => {
    const box = plane.shapes.get(n.id);
    if (!box) return [];
    return [{
      id: n.id,
      tag: n.tag,
      name: n.name,
      error: n.error,
      early: isEarlyEnd(n.source),
      multiInstance: isMultiInstanceLoop(n.source),
      attachedTo: n.attachedTo ?? null,
      anchor: anchorOf(n.source.anchor),
      box,
      opens: n.inner?.id ?? null,
      label: plane.labels.get(n.id) ?? null,
      inside: plane.inside.get(n.id)?.lines ?? null,
    }];
  });
  const flows: LandingFlow[] = container.flows.flatMap((f) => {
    const points = plane.edges.get(f.id);
    if (!points) return [];
    return [{ id: f.id, points, condition: f.condition, label: plane.labels.get(f.id) ?? null, back: f.back }];
  });
  const stores: LandingStore[] = container.storeRefs.flatMap((r) => {
    const box = plane.shapes.get(r.id);
    return box ? [{ id: r.id, table: r.name ?? r.table, box, label: plane.labels.get(r.id) ?? null }] : [];
  });
  const associations = container.dataAssociations.flatMap((a) => {
    const points = plane.edges.get(a.id);
    return points ? [points] : [];
  });

  const isRoot = container === model.root;
  const pools = isRoot
    ? model.pools.flatMap((p) => {
      const box = plane.shapes.get(p.id);
      return box ? [{ id: p.id, name: p.destination, box }] : [];
    })
    : [];
  const messages = isRoot
    ? model.messages.flatMap((m) => {
      const points = plane.edges.get(m.id);
      return points ? [{ id: m.id, points, anchor: anchorOf(m.call.anchor) }] : [];
    })
    : [];

  // The frame: every drawn thing, with room for the labels under events and gateways.
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
  const labelBoxes = [...plane.labels.values()].map((l) => l.box);
  for (const b of [...nodes.map((n) => n.box), ...stores.map((s) => s.box), ...pools.map((p) => p.box), ...labelBoxes]) {
    grow(b.x, b.y);
    grow(b.x + b.width, b.y + b.height);
  }
  for (const f of [...flows.map((f) => f.points), ...associations, ...messages.map((m) => m.points)]) for (const p of f) grow(p.x, p.y);
  // Everything drawn, labels included, and a margin that only frames it.
  const frame: Bounds = { x: minX - 24, y: minY - 24, width: maxX - minX + 48, height: maxY - minY + 48 };

  return { id: container.id, label, anchor, frame, nodes, flows, stores, associations, pools, messages, parent };
}

function buildProcess(fileName: string, program: string, direction: Direction = 'LR'): { process: LandingProcess; skeleton: ProcessSkeleton; source: string } {
  const source = readExample(fileName);
  const skeleton = buildProcessSkeleton(source);
  const model = buildExportModel(skeleton);
  const layout = layoutModel(model, { direction });

  const planes: LandingPlane[] = [planeOf(model.root, model, layout, program, null, null)];
  const walk = (container: ExportContainer) => {
    for (const node of container.nodes) {
      if (!node.inner) continue;
      planes.push(planeOf(node.inner, model, layout, node.name, anchorOf(node.source.anchor), container.id));
      walk(node.inner);
    }
  };
  walk(model.root);

  const all = model.containers.flatMap((c) => c.nodes);
  const unreached = skeleton.notDrawn.unreached;
  return {
    source,
    skeleton,
    process: {
      fileName,
      program,
      lines: source.replace(/\n$/, '').split('\n').length,
      planes,
      flowNodes: all.length,
      anchored: all.filter((n) => n.source.anchor).length,
      notDrawn: {
        unreached: unreached.length,
        forms: unreached.filter((u) => u.kind === 'form').length,
        modules: unreached.filter((u) => u.kind === 'module').length,
        unreachedLines: skeleton.notDrawn.unreachedLines,
        firstLine: unreached.length ? Math.min(...unreached.map((u) => u.lineStart)) : null,
        lastLine: unreached.length ? Math.max(...unreached.map((u) => u.lineEnd)) : null,
        helpers: skeleton.notDrawn.technicalHelpers.map((h) => h.name),
        clones: skeleton.notDrawn.clones.length,
      },
    },
  };
}

/* ------------------------------------------------------------ the hero */

export interface LandingCodeLine {
  number: number;
  tokens: CodeToken[];
}

export interface LandingHero {
  process: LandingProcess;
  /** The plane the hero draws: the routine that holds the plant rule. */
  plane: LandingPlane;
  /** The routine's own lines, for the source column. */
  code: LandingCodeLine[];
  rules: { total: number; shown: Array<{ id: string; label: string; line: number }> };
  notDetermined: { total: number; groups: Array<{ label: string; anchors: string[] }> };
  includesNotRead: Array<{ line: number; detail: string }>;
}

/** The routine the hero opens — the one whose rule the mockup names (plant 1000). */
const HERO_ROUTINE = 'CHECK_REQUISITION';

export function landingHero(fileName: string, program: string): LandingHero {
  const { process: proc, source, skeleton } = buildProcess(fileName, program);
  const plane = proc.planes.find((p) => p.label === HERO_ROUTINE) ?? proc.planes[0];

  const anchored = plane.nodes.flatMap((n) => (n.anchor ? [n.anchor.lineStart, n.anchor.lineEnd] : []));
  const first = Math.min(...anchored);
  const last = Math.max(...anchored);
  const lines = source.split('\n');
  const code: LandingCodeLine[] = [];
  for (let n = first; n <= last; n += 1) code.push({ number: n, tokens: tokenizeAbapLine(lines[n - 1] ?? '') });

  const ruleSet = deriveBusinessRules(source);
  const onPlane = new Set(plane.nodes.map((n) => n.id));
  // The rules a reader can find on the map: the one on the drawn plane first,
  // then the others that sit on a decision, in the engine's own order.
  const withLine = ruleSet.rules.flatMap((r) => {
    const el = r.processElements[0];
    return el ? [{ id: r.id, label: r.label, line: el.lineStart, here: onPlane.has(el.nodeId) }] : [];
  });
  const shown = [...withLine.filter((r) => r.here), ...withLine.filter((r) => !r.here)].slice(0, 3).map(({ id, label, line }) => ({ id, label, line }));

  const nd = notDetermined({ legacyCode: source } as Parameters<typeof notDetermined>[0]);
  const groups = new Map<string, string[]>();
  for (const item of nd.items) groups.set(item.label, [...(groups.get(item.label) ?? []), item.anchor]);

  return {
    process: proc,
    plane,
    code,
    rules: { total: ruleSet.rules.length, shown },
    notDetermined: { total: nd.count, groups: [...groups].map(([label, anchors]) => ({ label, anchors })) },
    includesNotRead: skeleton.notes.filter((n) => n.reason === 'include-not-read').map((n) => ({ line: n.lineStart, detail: n.detail })),
  };
}

/** The whole map of an example, every plane — for the process section. */
export function landingProcess(fileName: string, program: string): LandingProcess {
  return buildProcess(fileName, program).process;
}

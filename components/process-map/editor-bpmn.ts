/**
 * The parts of the BPMN editor that talk to bpmn-js but draw nothing: reading
 * one level of the draft for the layout engine, applying a tidy layout as one
 * undoable step, counting overlaps, and the SVG/PNG export.
 *
 * Kept out of `BpmnEditor.tsx` so the component stays about what the reader
 * sees, and so the typed slice of bpmn-js the editor relies on is written down
 * once.
 */

import { measureDrawing, type DrawnEdge, type DrawnShape, type ShapeKind } from '@/lib/bpmn/layout-quality';
import { tidyCanPlace, tidyPlane, type TidyResult } from '@/lib/bpmn/tidy';
import type { ReconstructionTrace } from '@/lib/process-map';

/* ------------------------------------------------------------------ *
 * The slice of bpmn-js the editor uses.
 * ------------------------------------------------------------------ */

export interface Point {
  x: number;
  y: number;
}

export interface BusinessObject {
  $type?: string;
  id?: string;
  name?: string;
  text?: string;
  isExpanded?: boolean;
  loopCharacteristics?: unknown;
  eventDefinitions?: Array<{ $type: string }>;
  conditionExpression?: { body?: string } | null;
  documentation?: Array<{ text?: string }>;
  attachedToRef?: { id?: string };
  di?: { isExpanded?: boolean };
  [key: string]: unknown;
}

export interface Shape {
  id: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parent?: Shape | null;
  children?: Shape[];
  label?: Shape | null;
  labelTarget?: Shape | null;
  host?: Shape | null;
  waypoints?: Point[];
  source?: Shape | null;
  target?: Shape | null;
  hidden?: boolean;
  businessObject?: BusinessObject;
}

export interface CanvasService {
  zoom(level?: string | number, center?: Point | 'auto'): number;
  getRootElement(): Shape | null;
  setRootElement(element: Shape): void;
  findRoot(id: string): Shape | undefined;
  viewbox(): { x: number; y: number; width: number; height: number; scale: number; inner: { x: number; y: number; width: number; height: number }; outer: { width: number; height: number } };
  viewbox(box: { x: number; y: number; width: number; height: number }): void;
  addMarker(element: Shape | string, marker: string): void;
  removeMarker(element: Shape | string, marker: string): void;
  resized(): void;
  scrollToElement(element: Shape): void;
  focus?(): void;
}

export interface ModelingService {
  createShape(shape: Shape, position: Point, parent: Shape): Shape;
  connect(source: Shape, target: Shape): unknown;
  removeElements(elements: Shape[]): void;
  updateProperties(element: Shape, properties: Record<string, unknown>): void;
  updateLabel(element: Shape, text: string): void;
  addLane(shape: Shape, location: string): Shape;
  moveShape(shape: Shape, delta: Point): void;
  resizeShape(shape: Shape, bounds: { x: number; y: number; width: number; height: number }): void;
  updateWaypoints(connection: Shape, points: Point[]): void;
  layoutConnection(connection: Shape): void;
}

export interface ElementFactoryService {
  createShape(attrs: Record<string, unknown>): Shape;
  createParticipantShape(attrs?: Record<string, unknown>): Shape;
}

export interface AutoPlaceService {
  append(source: Shape, shape: Shape): Shape;
}

export interface SelectionService {
  select(element: Shape | null): void;
  get(): Shape[];
}

export interface ElementRegistryService {
  get(id: string): Shape | undefined;
  getAll(): Shape[];
}

export interface RulesService {
  allowed(action: string, context: Record<string, unknown>): unknown;
}

export interface CommandStackService {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  execute(command: string, context: Record<string, unknown>): void;
  registerHandler(command: string, handler: unknown): void;
}

export interface EventBusService {
  on(event: string | string[], callback: (event?: unknown) => void): void;
  off(event: string | string[], callback: (event?: unknown) => void): void;
}

export interface BpmnReplaceService {
  replaceElement(element: Shape, target: { type: string; eventDefinitionType?: string; isExpanded?: boolean }): Shape;
}

export interface CreateService {
  start(event: Event, shape: Shape): void;
}

export interface ModdleService {
  create(type: string, attrs?: Record<string, unknown>): unknown;
}

export interface ModelerLike {
  importXML(xml: string): Promise<{ warnings: unknown[] }>;
  saveXML(options?: { format?: boolean }): Promise<{ xml?: string }>;
  saveSVG(): Promise<{ svg: string }>;
  getDefinitions(): unknown;
  get<T>(service: string): T;
  destroy(): void;
}

/* ------------------------------------------------------------------ *
 * The element list beside the canvas.
 * ------------------------------------------------------------------ */

/**
 * The one row of the element list that Tab reaches (a roving tab stop).
 *
 * The selected element when the list has a row for it, the first row
 * otherwise. The canvas can select what the list does not carry — a pool, a
 * lane, a connection — and a stop tied only to the selection then left every
 * row at -1, so Tab skipped the list (Codex code-ui-04, WCAG 2.1.1).
 */
export function elementListTabStop(rowIds: readonly string[], current: string | null): string | null {
  if (current !== null && rowIds.includes(current)) return current;
  return rowIds[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * One level of the draft.
 * ------------------------------------------------------------------ */

const isConnection = (shape: Shape) => Array.isArray(shape.waypoints);

/** The element whose children are the level on show: the root, or the pool that holds the process. */
export function levelContainer(modeler: ModelerLike): { container: Shape | null; root: Shape | null; pools: Shape[] } {
  const root = modeler.get<CanvasService>('canvas').getRootElement();
  if (!root) return { container: null, root: null, pools: [] };
  if (root.type !== 'bpmn:Collaboration') return { container: root, root, pools: [] };
  const participants = (root.children ?? []).filter((c) => c.type === 'bpmn:Participant');
  const main = participants.find((p) => (p.children ?? []).some((c) => tidyCanPlace(c.type ?? ''))) ?? null;
  return { container: main, root, pools: participants.filter((p) => p !== main) };
}

export type TidyRefusal = 'nothing' | 'lanes' | 'expanded' | 'failed';

/**
 * Lay the level on show out again with the product's layout engine, as one
 * command — a single Undo puts every element back.
 */
export function tidyLevel(
  modeler: ModelerLike,
  traces: ReadonlyMap<string, ReconstructionTrace | null>,
): { ok: true } | { ok: false; reason: TidyRefusal } {
  const { container, root, pools } = levelContainer(modeler);
  if (!container) return { ok: false, reason: 'nothing' };
  const kids = (container.children ?? []).filter((c) => c.type !== 'label');
  if (kids.some((c) => c.type === 'bpmn:Lane')) return { ok: false, reason: 'lanes' };
  if (kids.some((c) => c.type === 'bpmn:SubProcess' && (c.children ?? []).some((k) => !isConnection(k) && k.type !== 'label'))) {
    return { ok: false, reason: 'expanded' };
  }
  const nodes = kids.filter((c) => !isConnection(c) && tidyCanPlace(c.type ?? ''));
  if (nodes.length === 0) return { ok: false, reason: 'nothing' };

  const ids = new Set(nodes.map((n) => n.id));
  const anchorOf = (id: string) => {
    const t = traces.get(id);
    return t && t.lineStart !== null && t.lineEnd !== null ? { lineStart: t.lineStart, lineEnd: t.lineEnd } : null;
  };
  const dataShapes = kids.filter((c) => c.type === 'bpmn:DataStoreReference' || c.type === 'bpmn:DataObjectReference');
  const dataIds = new Set(dataShapes.map((d) => d.id));
  const noteShapes = kids.filter((c) => c.type === 'bpmn:TextAnnotation');
  const connections = kids.filter(isConnection);

  const result: TidyResult = tidyPlane({
    planeId: container.id,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'bpmn:Task',
      name: n.businessObject?.name ?? '',
      anchor: anchorOf(n.id),
      ...(n.host ? { attachedTo: n.host.id } : {}),
      marker: (n.type === 'bpmn:SubProcess' && !(n.businessObject?.di?.isExpanded)) || !!n.businessObject?.loopCharacteristics,
    })),
    flows: connections
      .filter((c) => c.type === 'bpmn:SequenceFlow' && c.source && c.target && ids.has(c.source.id) && ids.has(c.target.id))
      .map((c) => ({ id: c.id, sourceId: c.source!.id, targetId: c.target!.id, label: c.businessObject?.name ?? '' })),
    data: dataShapes.map((d) => ({ id: d.id, name: d.businessObject?.name ?? '' })),
    associations: connections
      .filter((c) => (c.type === 'bpmn:DataInputAssociation' || c.type === 'bpmn:DataOutputAssociation') && c.source && c.target)
      .map((c) => {
        const input = c.type === 'bpmn:DataInputAssociation';
        const data = input ? c.source! : c.target!;
        const node = input ? c.target! : c.source!;
        return { id: c.id, nodeId: node.id, dataId: data.id, direction: input ? 'input' as const : 'output' as const };
      })
      .filter((a) => ids.has(a.nodeId) && dataIds.has(a.dataId)),
    notes: noteShapes.map((n) => {
      const association = connections.find((c) => c.type === 'bpmn:Association' && (c.source === n || c.target === n));
      const other = association ? (association.source === n ? association.target : association.source) : null;
      return {
        id: n.id,
        text: n.businessObject?.text ?? '',
        ...(association && other && ids.has(other.id) ? { nodeId: other.id, associationId: association.id } : {}),
      };
    }),
  });

  const modeling = modeler.get<ModelingService>('modeling');
  const commandStack = modeler.get<CommandStackService>('commandStack');

  const apply = () => {
    const moveTo = (shape: Shape, x: number, y: number) => {
      const dx = Math.round(x - (shape.x ?? 0));
      const dy = Math.round(y - (shape.y ?? 0));
      if (dx || dy) modeling.moveShape(shape, { x: dx, y: dy });
    };
    const place = (shape: Shape) => {
      const box = result.shapes.get(shape.id);
      if (!box) return;
      const resizable = /Task$|CallActivity$|SubProcess$|TextAnnotation$/.test(shape.type ?? '');
      if (resizable && (box.width !== shape.width || box.height !== shape.height)) {
        modeling.resizeShape(shape, { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) });
      } else {
        moveTo(shape, box.x, box.y);
      }
    };
    // Hosts before what sits on them: a boundary event follows its host and is placed after it.
    for (const shape of [...nodes, ...dataShapes, ...noteShapes].filter((s) => !s.host)) place(shape);
    for (const shape of nodes.filter((s) => s.host)) place(shape);
    for (const connection of connections) {
      const points = result.edges.get(connection.id);
      if (points && points.length >= 2) modeling.updateWaypoints(connection, points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
    }
    for (const element of [...nodes, ...dataShapes, ...connections]) {
      const label = element.label;
      const box = result.labels.get(element.id);
      if (label && box) moveTo(label, box.x, box.y);
    }
    if (root && root.type === 'bpmn:Collaboration' && container.type === 'bpmn:Participant') {
      const all = [...result.shapes.values(), ...result.labels.values()];
      for (const points of result.edges.values()) for (const p of points) all.push({ x: p.x, y: p.y, width: 0, height: 0 });
      const minX = Math.min(...all.map((b) => b.x));
      const minY = Math.min(...all.map((b) => b.y));
      const maxX = Math.max(...all.map((b) => b.x + b.width));
      const maxY = Math.max(...all.map((b) => b.y + b.height));
      const box = { x: Math.round(minX - 60), y: Math.round(minY - 30), width: Math.round(maxX - minX + 90), height: Math.round(maxY - minY + 60) };
      modeling.resizeShape(container, box);
      let y = box.y + box.height + 40;
      for (const pool of pools) {
        modeling.resizeShape(pool, { x: box.x, y, width: box.width, height: pool.height ?? 60 });
        y += (pool.height ?? 60) + 40;
      }
      for (const connection of (root.children ?? []).filter((c) => c.type === 'bpmn:MessageFlow')) {
        modeling.layoutConnection(connection);
      }
    }
  };

  ensureTidyCommand(commandStack);
  try {
    commandStack.execute(TIDY_COMMAND, { apply });
  } catch {
    return { ok: false, reason: 'failed' };
  }
  return { ok: true };
}

const TIDY_COMMAND = 'cc.tidyLayout';
const registered = new WeakSet<object>();

/** One command whose `preExecute` runs every move: the command stack makes them one undo step. */
function ensureTidyCommand(commandStack: CommandStackService): void {
  if (registered.has(commandStack)) return;
  function TidyHandler(this: unknown) { /* no state */ }
  TidyHandler.prototype.preExecute = (context: { apply: () => void }) => context.apply();
  TidyHandler.prototype.execute = () => [];
  TidyHandler.prototype.revert = () => [];
  commandStack.registerHandler(TIDY_COMMAND, TidyHandler);
  registered.add(commandStack);
}

/* ------------------------------------------------------------------ *
 * Overlaps on the level on show.
 * ------------------------------------------------------------------ */

function kindOf(type: string): ShapeKind {
  if (type.endsWith('Event')) return 'event';
  if (type.endsWith('Gateway')) return 'gateway';
  if (type === 'bpmn:DataStoreReference' || type === 'bpmn:DataObjectReference') return 'store';
  if (type === 'bpmn:TextAnnotation') return 'note';
  if (type === 'bpmn:Participant' || type === 'bpmn:Lane') return 'pool';
  return 'task';
}

/** Shapes on shapes and lines through shapes, counted with the yardstick of the export (`layout-quality.ts`). */
export function overlapsOnLevel(modeler: ModelerLike): number {
  const { container } = levelContainer(modeler);
  if (!container) return 0;
  const kids = (container.children ?? []).filter((c) => c.type !== 'label' && !c.hidden);
  const shapes: DrawnShape[] = kids
    .filter((c) => !isConnection(c))
    .map((c) => ({
      id: c.id,
      kind: kindOf(c.type ?? ''),
      box: { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 },
      ...(c.host ? { attachedTo: c.host.id } : {}),
    }));
  const edges: DrawnEdge[] = kids
    .filter((c) => isConnection(c) && c.type === 'bpmn:SequenceFlow' && c.source && c.target)
    .map((c) => ({
      id: c.id,
      kind: 'sequence',
      points: c.waypoints ?? [],
      // A flow leaving a boundary event leaves the host's outline too.
      sourceId: c.source!.id,
      targetId: c.target!.id,
    }));
  const hostOf = new Map(shapes.filter((s) => s.attachedTo).map((s) => [s.id, s.attachedTo as string]));
  const report = measureDrawing({ shapes, labels: [], edges });
  const hostCrossings = report.details.filter((line) => {
    const m = /^edge\/shape (\S+) through (\S+)$/.exec(line);
    if (!m) return false;
    const edge = edges.find((e) => e.id === m[1]);
    return !!edge && hostOf.get(edge.sourceId) === m[2];
  }).length;
  return report.shapeShape + report.edgeThroughShape - hostCrossings;
}

/* ------------------------------------------------------------------ *
 * Pictures of the draft.
 * ------------------------------------------------------------------ */

/** The SVG bpmn-js draws, rasterised at twice its size on the page's surface colour. */
export async function svgToPng(svg: string, background: string): Promise<Blob> {
  const width = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1] ?? 1200);
  const height = Number(/<svg[^>]*\sheight="([\d.]+)"/.exec(svg)?.[1] ?? 800);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no png'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

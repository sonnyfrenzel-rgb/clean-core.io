import type { SkeletonEdge, SkeletonNode } from '../abap/process-skeleton';
import { layoutModel, type Bounds, type Direction, type Point } from './layout';
import type { BpmnTag, ExportContainer, ExportFlow, ExportModel, ExportNode } from './model';

/**
 * "Tidy layout" for a diagram somebody edited — the product's own layout
 * engine (`layout.ts`) run over one plane of the editor's draft.
 *
 * The engine was written for the export, whose input is the skeleton read out
 * of ABAP. An edited diagram has no skeleton, so this module builds the small
 * part of the export model the engine reads — nodes with a name and a line
 * anchor, flows with a label, data references with their associations, notes
 * with theirs — and hands back where everything goes. Nothing is invented: an
 * element without a line anchor is laid out without one, and the engine's
 * guarantees (no shape on a shape, no line through a shape, labels on their
 * own flow) hold for the edited diagram as they hold for the export.
 *
 * Pure: plain data in, coordinates out. The editor applies them as one undoable
 * step, and only when the reader asks — manual positions are never moved
 * behind anybody's back (`DESIGN.md` §5.9 rule 10: users learn where a step is).
 */

export interface TidyNode {
  id: string;
  /** The BPMN type, `bpmn:UserTask`. */
  type: string;
  name: string;
  anchor: { lineStart: number; lineEnd: number } | null;
  /** The activity a boundary event sits on. */
  attachedTo?: string;
  /** A collapsed sub-process or a multi-instance activity carries a marker under its name. */
  marker?: boolean;
}

export interface TidyFlow {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
}

export interface TidyData {
  /** A data store or data object reference. */
  id: string;
  name: string;
}

export interface TidyAssociation {
  id: string;
  nodeId: string;
  dataId: string;
  direction: 'input' | 'output';
}

export interface TidyNote {
  id: string;
  text: string;
  /** The element the note explains, and the association that ties them. */
  nodeId?: string;
  associationId?: string;
}

export interface TidyInput {
  planeId: string;
  nodes: TidyNode[];
  flows: TidyFlow[];
  data?: TidyData[];
  associations?: TidyAssociation[];
  notes?: TidyNote[];
  direction?: Direction;
  wrap?: number;
}

export interface TidyResult {
  shapes: Map<string, Bounds>;
  edges: Map<string, Point[]>;
  /** External label boxes (events, gateways, data, labelled flows) — the name lines only. */
  labels: Map<string, Bounds>;
}

const TAGS: Record<string, BpmnTag> = {
  'bpmn:StartEvent': 'startEvent',
  'bpmn:EndEvent': 'endEvent',
  'bpmn:IntermediateThrowEvent': 'intermediateThrowEvent',
  'bpmn:IntermediateCatchEvent': 'intermediateCatchEvent',
  'bpmn:BoundaryEvent': 'boundaryEvent',
  'bpmn:ExclusiveGateway': 'exclusiveGateway',
  'bpmn:InclusiveGateway': 'exclusiveGateway',
  'bpmn:ComplexGateway': 'exclusiveGateway',
  'bpmn:EventBasedGateway': 'exclusiveGateway',
  'bpmn:ParallelGateway': 'parallelGateway',
  'bpmn:Task': 'task',
  'bpmn:UserTask': 'userTask',
  'bpmn:ServiceTask': 'serviceTask',
  'bpmn:SendTask': 'sendTask',
  'bpmn:ReceiveTask': 'task',
  'bpmn:ManualTask': 'task',
  'bpmn:ScriptTask': 'task',
  'bpmn:BusinessRuleTask': 'businessRuleTask',
  'bpmn:CallActivity': 'callActivity',
  'bpmn:SubProcess': 'subProcess',
};

/** The BPMN types tidy can place. Anything else on a plane makes tidy decline it rather than guess. */
export function tidyCanPlace(type: string): boolean {
  return type in TAGS;
}

export function tidyPlane(input: TidyInput): TidyResult {
  const nodes = input.nodes.filter((n) => TAGS[n.type]);
  const ids = new Set(nodes.map((n) => n.id));
  const flows = input.flows.filter((f) => ids.has(f.sourceId) && ids.has(f.targetId));

  const exportNodes: ExportNode[] = nodes.map((n) => {
    const tag = n.type === 'bpmn:SubProcess' ? 'task' : TAGS[n.type];
    return {
      id: n.id,
      tag: n.marker && n.type === 'bpmn:SubProcess' ? 'subProcess' : tag,
      name: n.name,
      technicalName: n.name,
      // The engine reads a node's line anchor and its multi-instance flag off
      // the skeleton node; nothing else of it.
      source: { anchor: n.anchor, detail: n.marker && n.type !== 'bpmn:SubProcess' ? { multiInstance: true } : {} } as unknown as SkeletonNode,
      error: false,
      ...(n.attachedTo && ids.has(n.attachedTo) ? { attachedTo: n.attachedTo } : {}),
      incoming: flows.filter((f) => f.targetId === n.id).map((f) => f.id),
      outgoing: flows.filter((f) => f.sourceId === n.id).map((f) => f.id),
      reads: [],
      writes: [],
      band: 0,
    };
  });

  const starts = nodes.filter((n) => n.type === 'bpmn:StartEvent');
  const ends = nodes.filter((n) => n.type === 'bpmn:EndEvent');
  const exportFlows: ExportFlow[] = flows.map((f) => ({
    id: f.id,
    sourceId: f.sourceId,
    targetId: f.targetId,
    condition: '',
    label: f.label,
    edge: {} as SkeletonEdge,
    back: false,
  }));

  const data = (input.data ?? []);
  const dataIds = new Set(data.map((d) => d.id));
  const associations = (input.associations ?? []).filter((a) => ids.has(a.nodeId) && dataIds.has(a.dataId));
  const notes = (input.notes ?? []).map((n) => ({
    id: n.id,
    text: n.text,
    ...(n.nodeId && n.associationId && ids.has(n.nodeId) ? { nodeId: n.nodeId, associationId: n.associationId } : {}),
  }));

  const container: ExportContainer = {
    id: input.planeId,
    tag: 'process',
    bands: [{
      key: 'tidy',
      anchorId: input.planeId,
      nodeIds: exportNodes.map((n) => n.id),
      entryId: starts.length === 1 ? starts[0].id : null,
      endId: ends.length === 1 ? ends[0].id : null,
    }],
    nodes: exportNodes,
    flows: exportFlows,
    storeRefs: data.map((d) => ({ id: d.id, storeId: d.id, table: d.name, band: 0, name: d.name })),
    dataAssociations: associations.map((a) => ({ id: a.id, direction: a.direction, nodeId: a.nodeId, storeRefId: a.dataId })),
    annotations: notes,
  };
  const model: ExportModel = {
    root: container,
    lanes: [],
    containers: [container],
    stores: [],
    pools: [],
    messages: [],
    droppedEdges: 0,
  };

  const layout = layoutModel(model, { direction: input.direction ?? 'LR', wrap: input.wrap });
  const plane = layout.planes.get(input.planeId);
  const labels = new Map<string, Bounds>();
  if (plane) for (const [id, label] of plane.labels) labels.set(id, label.nameBox);
  return {
    shapes: plane?.shapes ?? new Map(),
    edges: plane?.edges ?? new Map(),
    labels,
  };
}

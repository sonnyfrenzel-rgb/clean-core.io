import { buildProcessSkeleton, type ProcessSkeleton, type SkeletonNode } from '../abap/process-skeleton';
import type { ProvenanceValue } from '../provenance';
import { APP_VERSION } from '../version';
import { layoutModel, type Bounds, type PlaneLayout, type Point } from './layout';
import {
  buildExportModel,
  type ExportContainer,
  type ExportModel,
  type ExportNode,
} from './model';
import { el, serialize, textEl, type XmlElement } from './xml';

/**
 * BPMN 2.0 XML out of the process skeleton — roadmap 2.6.
 *
 * Deterministic and without a model: the same source gives byte-identical XML.
 * What is in the file and what is not:
 *
 * - **Every flow node carries a trace** in the Clean-Core.io namespace under
 *   `extensionElements`: the skeleton node, the file, the line range, and the
 *   status. The status is `reconstructed` and nothing else — *confirmed* is an
 *   account's word (roadmap 3.5) and *proven* is evidence, and this file is
 *   neither. An element without a line range carries a visible text annotation
 *   saying so, because extension elements are invisible in every modeller.
 * - **The process says what it is**, in its documentation and in a note on the
 *   diagram: reconstructed from code, not confirmed, not evidence of how the
 *   process runs — and what the skeleton read but did not draw.
 * - **No claim about a target tool.** The file is BPMN 2.0 XML. Whether SAP
 *   Signavio keeps foreign extension elements is roadmap 4.3, with a real
 *   workspace.
 */

export const CC_NAMESPACE = 'https://clean-core.io/schema/bpmn/reconstruction/1';

const STATUS: ProvenanceValue = 'reconstructed';

export interface BpmnExportOptions {
  /** The name of the process — a project name, typed by a person, escaped like everything else. */
  processName: string;
  /** The file the signed run analysed (`inputFingerprint.fileName`). */
  sourceFileName: string;
  /** Recorded as `exporterVersion`. Defaults to this release. */
  exporterVersion?: string;
}

export interface BpmnExportStats {
  /** Flow nodes of every kind, on every plane (events, gateways, activities). */
  flowNodes: number;
  sequenceFlows: number;
  /** `subProcess` elements — each one a plane of its own. */
  subProcesses: number;
  /** BPMN diagrams: the top plane plus one per sub-process. */
  planes: number;
  dataStores: number;
  pools: number;
  messageFlows: number;
  /** Sequence flows that go around a folded run switch (`model.ts` decision 7). */
  guardBypasses: number;
  /** Flow nodes with a line range, and flow nodes visibly without one. */
  anchored: number;
  unanchored: number;
}

/** The tables one element reads and writes, upper-cased, in the order the model holds them. */
export interface ElementData {
  reads: string[];
  writes: string[];
}

export interface BpmnExport {
  xml: string;
  /** Element id in the XML → the skeleton node it was drawn from. For 2.5's click-to-code. */
  elementNode: Record<string, string>;
  /**
   * Element id in the XML → the tables it reads and writes.
   *
   * The same source the `dataStore`s and their associations in the file come
   * from — `ExportNode.reads`/`writes`, which `model.ts` follows down a chain of
   * collapsed call sites to the statement. It is here because the association
   * itself does not survive a reader: in BPMN a `dataInputAssociation` points at
   * a `dataStoreReference` by id, through a `<bpmn:sourceRef>` that holds text,
   * so a screen that wants "what does this step touch" would have to parse the
   * XML a second time to find out. An entry exists only for an element that
   * touches at least one table.
   */
  dataByElement: Record<string, ElementData>;
  stats: BpmnExportStats;
}

/** The export API. `skeleton` is `buildProcessSkeleton(source)` of the source the signed run analysed. */
export function buildBpmnExport(skeleton: ProcessSkeleton, options: BpmnExportOptions): BpmnExport {
  const model = buildExportModel(skeleton);
  const nodes = model.containers.flatMap((c) => c.nodes);
  const anchored = nodes.filter((n) => n.source.anchor).length;
  model.root.annotations.unshift({
    id: 'note-reconstruction',
    text: reconstructionNote(options, anchored, nodes.length),
  });
  const layout = layoutModel(model);

  const elementNode: Record<string, string> = {};
  const dataByElement: Record<string, ElementData> = {};
  for (const node of nodes) {
    elementNode[node.id] = node.source.id;
    if (node.reads.length || node.writes.length) {
      dataByElement[node.id] = { reads: [...node.reads], writes: [...node.writes] };
    }
  }

  const collaboration = model.pools.length
    ? el('bpmn:collaboration', [['id', 'collaboration']], [
      el('bpmn:participant', [['id', 'participant-program'], ['name', options.processName], ['processRef', 'process']]),
      ...model.pools.map((pool) => el('bpmn:participant', [['id', pool.id], ['name', pool.destination]], [
        el('bpmn:extensionElements', [], [trace({ kind: 'foreign-system' })]),
      ])),
      ...model.messages.map((message) => el('bpmn:messageFlow', [
        ['id', message.id], ['sourceRef', message.sourceId], ['targetRef', message.poolId],
      ], [
        el('bpmn:extensionElements', [], [nodeTrace(message.call, options.sourceFileName, { calls: message.calls })]),
      ])),
    ])
    : null;

  const process = el('bpmn:process', [
    ['id', 'process'], ['name', options.processName], ['isExecutable', 'false'],
  ], [
    textEl('bpmn:documentation', processDocumentation(skeleton, model, options, anchored, nodes.length)),
    el('bpmn:extensionElements', [], [el('cc:reconstruction', [
      ['status', STATUS],
      ['file', options.sourceFileName],
      ['engine', options.exporterVersion ?? APP_VERSION],
      ['anchored', anchored],
      ['unanchored', nodes.length - anchored],
      ['unreachedRoutines', skeleton.notDrawn.unreached.length],
      ['unreachedLines', skeleton.notDrawn.unreachedLines],
      ['technicalHelpers', skeleton.notDrawn.technicalHelpers.length],
      ['cloneGroups', skeleton.notDrawn.clones.length],
      ['notes', skeleton.notes.length],
    ])]),
    ...containerContent(model.root, options),
  ]);

  const definitions = el('bpmn:definitions', [
    ['xmlns:bpmn', 'http://www.omg.org/spec/BPMN/20100524/MODEL'],
    ['xmlns:bpmndi', 'http://www.omg.org/spec/BPMN/20100524/DI'],
    ['xmlns:dc', 'http://www.omg.org/spec/DD/20100524/DC'],
    ['xmlns:di', 'http://www.omg.org/spec/DD/20100524/DI'],
    ['xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance'],
    ['xmlns:cc', CC_NAMESPACE],
    ['id', 'definitions'],
    ['targetNamespace', 'https://clean-core.io/bpmn'],
    ['exporter', 'Clean-Core.io'],
    ['exporterVersion', options.exporterVersion ?? APP_VERSION],
  ], [
    ...model.stores.map((store) => el('bpmn:dataStore', [['id', store.id], ['name', store.table]], [
      el('bpmn:extensionElements', [], [trace({ table: store.table, namespace: tableNamespace(store.table) })]),
    ])),
    ...(collaboration ? [collaboration] : []),
    process,
    ...diagrams(model, layout.planes, layout.participant),
  ]);

  return {
    xml: serialize(definitions),
    elementNode,
    dataByElement,
    stats: {
      flowNodes: nodes.length,
      sequenceFlows: model.containers.reduce((n, c) => n + c.flows.length, 0),
      subProcesses: nodes.filter((n) => n.tag === 'subProcess').length,
      planes: 1 + nodes.filter((n) => n.tag === 'subProcess').length,
      dataStores: model.stores.length,
      pools: model.pools.length,
      messageFlows: model.messages.length,
      guardBypasses: model.containers.reduce((n, c) => n + c.flows.filter((f) => f.bypassOf).length, 0),
      anchored,
      unanchored: nodes.length - anchored,
    },
  };
}

/** The same, for a caller that holds the source rather than the skeleton. */
export function buildBpmnExportFromSource(source: string, options: BpmnExportOptions): BpmnExport {
  return buildBpmnExport(buildProcessSkeleton(source), options);
}

/** A file name for the download: the name, reduced to characters every file system keeps. */
export function bpmnFileName(name: string): string {
  const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${base || 'process'}.bpmn`;
}

/* ------------------------------------------------------------------ */

/**
 * `DESIGN.md` §5.8 wants SAP and customer tables told apart. The name is all
 * this export knows: `Z*`/`Y*` is the customer namespace, `/…/` is a registered
 * namespace that can be SAP's or a partner's, everything else is SAP's.
 */
function tableNamespace(table: string): 'customer' | 'registered' | 'sap' {
  if (/^[ZY]/i.test(table)) return 'customer';
  if (table.startsWith('/')) return 'registered';
  return 'sap';
}

function reconstructionNote(options: BpmnExportOptions, anchored: number, total: number): string {
  return [
    `Reconstructed from the ABAP source ${options.sourceFileName} without a language model.`,
    'Not confirmed by anyone, and not evidence of how the process runs in production.',
    `${anchored} of ${total} elements carry a line anchor.`,
  ].join('\n');
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function processDocumentation(
  skeleton: ProcessSkeleton,
  model: ExportModel,
  options: BpmnExportOptions,
  anchored: number,
  total: number,
): string {
  const lines = [
    `Reconstructed from the ABAP source ${options.sourceFileName} by Clean-Core.io ${options.exporterVersion ?? APP_VERSION}, without a language model.`,
    'Status: reconstructed. Derived from the code; not confirmed by anyone, and not evidence of how the process runs in production.',
    `${anchored} of ${total} elements carry a line anchor in the source.`,
  ];
  const notDrawn: string[] = [];
  if (skeleton.notDrawn.unreached.length) {
    notDrawn.push(`${plural(skeleton.notDrawn.unreached.length, 'routine or screen module', 'routines and screen modules')} not reached from any entry point (${plural(skeleton.notDrawn.unreachedLines, 'line', 'lines')})`);
  }
  if (skeleton.notDrawn.technicalHelpers.length) {
    notDrawn.push(`${plural(skeleton.notDrawn.technicalHelpers.length, 'technical helper', 'technical helpers')} folded into their callers`);
  }
  if (skeleton.notDrawn.clones.length) {
    notDrawn.push(`${plural(skeleton.notDrawn.clones.length, 'group', 'groups')} of identically built routines`);
  }
  if (skeleton.notes.length) {
    notDrawn.push(`${plural(skeleton.notes.length, 'passage', 'passages')} the reader did not interpret (includes, native SQL, dynamic calls, commit boundaries)`);
  }
  const limited = model.containers.flatMap((c) => c.nodes).filter((n) => n.fallback === 'expansion-limit').length;
  if (limited) notDrawn.push(`${plural(limited, 'routine', 'routines')} not expanded because the diagram reached its size limit`);
  if (notDrawn.length) lines.push(`Not drawn: ${notDrawn.join('; ')}.`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */

function trace(attrs: Record<string, string | number | boolean | undefined>): XmlElement {
  return el('cc:trace', [['status', STATUS], ...Object.entries(attrs)]);
}

/** A valid XML attribute name for a detail key the skeleton wrote — they are identifiers, but not by contract. */
const ATTRIBUTE_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const RESERVED = new Set(['status', 'node', 'kind', 'file', 'lineStart', 'lineEnd', 'statementIndex', 'tokenOffset', 'container']);

function nodeTrace(node: SkeletonNode, file: string, extra: Record<string, string | number> = {}): XmlElement {
  const attrs: Array<[string, string | number | boolean | undefined]> = [
    ['node', node.id],
    ['kind', node.kind],
    ['file', file],
  ];
  if (node.anchor) {
    attrs.push(
      ['lineStart', node.anchor.lineStart],
      ['lineEnd', node.anchor.lineEnd],
      ['statementIndex', node.anchor.statementIndex],
      ['tokenOffset', node.anchor.tokenOffset],
    );
    if (node.anchor.secondary) {
      attrs.push(
        ['secondaryLineStart', node.anchor.secondary.lineStart],
        ['secondaryLineEnd', node.anchor.secondary.lineEnd],
        ['secondaryReason', node.anchor.secondary.reason],
      );
    }
  } else {
    attrs.push(['anchored', 'false'], ['unanchoredReason', node.unanchoredReason ?? '']);
  }
  attrs.push(['container', node.container ?? undefined]);
  if (node.expandsTo) attrs.push(['expandsTo', node.expandsTo]);
  if (node.collapsed !== undefined) attrs.push(['collapsed', node.collapsed]);
  for (const [key, value] of Object.entries(node.detail ?? {})) {
    if (!ATTRIBUTE_NAME.test(key) || RESERVED.has(key)) continue;
    attrs.push([key, Array.isArray(value) ? value.join(' ') : value]);
  }
  for (const [key, value] of Object.entries(extra)) attrs.push([key, value]);
  return el('cc:trace', [['status', STATUS], ...attrs]);
}

function containerContent(container: ExportContainer, options: BpmnExportOptions): XmlElement[] {
  const out: XmlElement[] = [];
  for (const node of container.nodes) out.push(flowNode(node, container, options));
  for (const flow of container.flows) {
    const conditional = flow.condition !== '';
    out.push(el('bpmn:sequenceFlow', [
      ['id', flow.id],
      ['name', conditional ? flow.condition : undefined],
      ['sourceRef', flow.sourceId],
      ['targetRef', flow.targetId],
    ], [
      el('bpmn:extensionElements', [], [trace({
        kind: flow.edge.kind,
        reason: flow.bypassOf ? 'guard-bypass' : flow.edge.reason,
        bypasses: flow.bypassOf,
      })]),
      ...(conditional
        ? [textEl('bpmn:conditionExpression', flow.condition, [['xsi:type', 'bpmn:tFormalExpression']])]
        : []),
    ]));
  }
  for (const ref of container.storeRefs) {
    out.push(el('bpmn:dataStoreReference', [['id', ref.id], ['name', ref.table], ['dataStoreRef', ref.storeId]]));
  }
  for (const note of container.annotations) {
    out.push(el('bpmn:textAnnotation', [['id', note.id]], [textEl('bpmn:text', note.text)]));
    if (note.nodeId && note.associationId) {
      out.push(el('bpmn:association', [['id', note.associationId], ['sourceRef', note.nodeId], ['targetRef', note.id]]));
    }
  }
  return out;
}

function flowNode(node: ExportNode, container: ExportContainer, options: BpmnExportOptions): XmlElement {
  const attrs: Array<[string, string | undefined]> = [['id', node.id], ['name', node.name]];
  if (node.tag === 'exclusiveGateway') attrs.push(['default', node.defaultFlow]);
  if (node.tag === 'boundaryEvent') attrs.push(['attachedToRef', node.attachedTo]);

  const children: XmlElement[] = [
    el('bpmn:extensionElements', [], [nodeTrace(node.source, options.sourceFileName, node.fallback ? { fallback: node.fallback } : {})]),
    ...node.incoming.map((id) => textEl('bpmn:incoming', id)),
    ...node.outgoing.map((id) => textEl('bpmn:outgoing', id)),
  ];

  const inputs = container.dataAssociations.filter((a) => a.nodeId === node.id && a.direction === 'input');
  const outputs = container.dataAssociations.filter((a) => a.nodeId === node.id && a.direction === 'output');
  if (inputs.length) {
    // A data input association needs a target inside the activity; this is the
    // placeholder property bpmn-js itself writes.
    children.push(el('bpmn:property', [['id', `${node.id}-input`], ['name', '__targetRef_placeholder']]));
    for (const a of inputs) {
      children.push(el('bpmn:dataInputAssociation', [['id', a.id]], [
        textEl('bpmn:sourceRef', a.storeRefId),
        textEl('bpmn:targetRef', `${node.id}-input`),
      ]));
    }
  }
  for (const a of outputs) {
    children.push(el('bpmn:dataOutputAssociation', [['id', a.id]], [textEl('bpmn:targetRef', a.storeRefId)]));
  }
  if (node.error) children.push(el('bpmn:errorEventDefinition', [['id', `${node.id}-error`]]));
  if (node.inner) children.push(...containerContent(node.inner, options));

  return el(`bpmn:${node.tag}`, attrs, children);
}

/* ------------------------------------------------------------------ */

function bounds(b: Bounds): XmlElement {
  return el('dc:Bounds', [['x', b.x], ['y', b.y], ['width', b.width], ['height', b.height]]);
}

function waypoints(points: Point[]): XmlElement[] {
  return points.map((p) => el('di:waypoint', [['x', Math.round(p.x)], ['y', Math.round(p.y)]]));
}

function planeElements(container: ExportContainer, plane: PlaneLayout): XmlElement[] {
  const out: XmlElement[] = [];
  const shape = (id: string, extra: Array<[string, string | boolean]> = []) => {
    const b = plane.shapes.get(id);
    if (b) out.push(el('bpmndi:BPMNShape', [['id', `${id}_di`], ['bpmnElement', id], ...extra], [bounds(b)]));
  };
  const edge = (id: string) => {
    const points = plane.edges.get(id);
    if (points) out.push(el('bpmndi:BPMNEdge', [['id', `${id}_di`], ['bpmnElement', id]], waypoints(points)));
  };
  // Hosts before the boundary events on them, so a reader draws the host first.
  for (const node of container.nodes) {
    if (node.tag === 'boundaryEvent') continue;
    const extra: Array<[string, string | boolean]> = [];
    if (node.tag === 'subProcess') extra.push(['isExpanded', false]);
    if (node.tag === 'exclusiveGateway') extra.push(['isMarkerVisible', true]);
    shape(node.id, extra);
  }
  for (const node of container.nodes) if (node.tag === 'boundaryEvent') shape(node.id);
  for (const ref of container.storeRefs) shape(ref.id);
  for (const note of container.annotations) shape(note.id);
  for (const flow of container.flows) edge(flow.id);
  for (const a of container.dataAssociations) edge(a.id);
  for (const note of container.annotations) if (note.associationId) edge(note.associationId);
  return out;
}

function diagrams(model: ExportModel, planes: Map<string, PlaneLayout>, participant?: Bounds): XmlElement[] {
  const out: XmlElement[] = [];
  for (const container of model.containers) {
    const plane = planes.get(container.id) as PlaneLayout;
    const isRoot = container === model.root;
    const content: XmlElement[] = [];
    if (isRoot && participant) {
      content.push(el('bpmndi:BPMNShape', [
        ['id', 'participant-program_di'], ['bpmnElement', 'participant-program'], ['isHorizontal', true],
      ], [bounds(participant)]));
    }
    content.push(...planeElements(container, plane));
    if (isRoot) {
      for (const pool of model.pools) {
        const b = plane.shapes.get(pool.id);
        if (b) {
          content.push(el('bpmndi:BPMNShape', [['id', `${pool.id}_di`], ['bpmnElement', pool.id], ['isHorizontal', true]], [bounds(b)]));
        }
      }
      for (const message of model.messages) {
        const points = plane.edges.get(message.id);
        if (points) content.push(el('bpmndi:BPMNEdge', [['id', `${message.id}_di`], ['bpmnElement', message.id]], waypoints(points)));
      }
    }
    const planeElement = isRoot ? (model.pools.length ? 'collaboration' : 'process') : container.id;
    const name = isRoot ? 'diagram' : `${container.id}_diagram`;
    out.push(el('bpmndi:BPMNDiagram', [['id', name]], [
      el('bpmndi:BPMNPlane', [['id', isRoot ? 'plane' : `${container.id}_plane`], ['bpmnElement', planeElement]], content),
    ]));
  }
  return out;
}

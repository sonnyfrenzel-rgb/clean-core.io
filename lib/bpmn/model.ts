import type {
  ProcessSkeleton,
  SkeletonEdge,
  SkeletonNode,
  SkeletonRegion,
} from '../abap/process-skeleton';
import { ncName } from './xml';

/**
 * Skeleton → BPMN elements — roadmap 2.6, the half that decides *what* is drawn.
 * `layout.ts` decides where, `export.ts` writes it down.
 *
 * The skeleton (`lib/abap/process-skeleton.ts`, roadmap 2.3) is the only input.
 * No model, no project text, no name somebody typed goes into an element: every
 * name here is a token the skeleton read out of the source.
 *
 * Decisions, each where it is implemented:
 *
 * 1. **A routine with more than three elements is a real `subProcess`** with its
 *    content inside, drawn collapsed on its own plane. A small routine the
 *    skeleton already reduced to one step (`collapsed`, kind of its dominant
 *    step) stays that one step; a business-rule routine stays a
 *    `businessRuleTask` — its decision table is roadmap 2.8, not a diagram.
 * 2. **A loop is an exclusive gateway with its body as a cycle**, not a
 *    multi-instance marker. A marker belongs on an activity that *contains* the
 *    body, and the body of an ABAP loop can leave it — `EXIT`, `RETURN`, an error
 *    message — which a sequence flow cannot do across a sub-process boundary. The
 *    kind of loop (`multi-instance` over a table, or `standard`) travels in the
 *    trace, and the gateway is named `LOOP AT <table>`.
 * 3. **An error boundary needs an activity to sit on.** A `TRY` whose protected
 *    part draws nothing, or starts with a decision, has none; its handler is then
 *    an error catch event that is not attached, and says so in its trace.
 * 4. **Reads and writes are tasks with a data store.** A data store is not a
 *    flow node in BPMN, so `SELECT VBAK` is a task and `VBAK` the store it reads.
 * 5. **Another system is a collapsed pool** (`CALL FUNCTION … DESTINATION`), and
 *    the message flow starts at the element visible on the top plane — the call
 *    itself, or the collapsed sub-process that contains it. The call's own anchor
 *    is on the message flow.
 * 6. **A routine performed from several places is expanded at each of them.**
 *    The first instance keeps the skeleton's ids; every later one is prefixed
 *    with the id of its call site, so ids stay unique and stay readable. A
 *    routine that performs itself is a call activity at the point of recursion,
 *    and the expansion stops at `MAX_NODES` so a crafted source cannot make the
 *    browser build an exponential file.
 */

export type BpmnTag =
  | 'startEvent'
  | 'endEvent'
  | 'exclusiveGateway'
  | 'task'
  | 'serviceTask'
  | 'sendTask'
  | 'userTask'
  | 'businessRuleTask'
  | 'callActivity'
  | 'subProcess'
  | 'boundaryEvent'
  | 'intermediateCatchEvent';

export const ACTIVITY_TAGS: ReadonlySet<BpmnTag> = new Set<BpmnTag>([
  'task', 'serviceTask', 'sendTask', 'userTask', 'businessRuleTask', 'callActivity', 'subProcess',
]);

/** Above this many flow nodes, no further routine is expanded (decision 6). */
export const MAX_NODES = 5000;

export type ExportFallback = 'recursion' | 'expansion-limit' | 'unattached-handler';

export interface ExportNode {
  id: string;
  tag: BpmnTag;
  name: string;
  source: SkeletonNode;
  /** Carries an `errorEventDefinition`. */
  error: boolean;
  /** Export id of the activity an error boundary sits on. */
  attachedTo?: string;
  /** The content of a `subProcess`. */
  inner?: ExportContainer;
  /** Why this element is not what the skeleton kind would make it. */
  fallback?: ExportFallback;
  incoming: string[];
  outgoing: string[];
  defaultFlow?: string;
  reads: string[];
  writes: string[];
  /** Index of the band (entry) this node is drawn in, inside its container. */
  band: number;
}

export interface ExportFlow {
  id: string;
  sourceId: string;
  targetId: string;
  condition: string;
  edge: SkeletonEdge;
  /** A loop-back: drawn over the top, ignored when ranking. */
  back: boolean;
}

export interface ExportBand {
  /** Region key of the skeleton. */
  key: string;
  /** The id data stores of this band are named after. */
  anchorId: string;
  nodeIds: string[];
  /** The node the band starts at, when it has one. */
  entryId: string | null;
  /** The node every path of the region ends at. */
  endId: string | null;
}

export interface ExportStoreRef {
  id: string;
  storeId: string;
  table: string;
  band: number;
}

export interface ExportDataAssociation {
  id: string;
  direction: 'input' | 'output';
  nodeId: string;
  storeRefId: string;
}

export interface ExportAnnotation {
  id: string;
  text: string;
  /** The element it explains, and the association that ties them. */
  nodeId?: string;
  associationId?: string;
}

export interface ExportContainer {
  id: string;
  tag: 'process' | 'subProcess';
  bands: ExportBand[];
  nodes: ExportNode[];
  flows: ExportFlow[];
  storeRefs: ExportStoreRef[];
  dataAssociations: ExportDataAssociation[];
  annotations: ExportAnnotation[];
}

export interface ExportStore {
  id: string;
  table: string;
}

export interface ExportPool {
  id: string;
  destination: string;
}

export interface ExportMessage {
  id: string;
  /** The element on the top plane the flow starts at. */
  sourceId: string;
  poolId: string;
  /** The call that proves the message, and how many calls share this flow. */
  call: SkeletonNode;
  calls: number;
}

export interface ExportModel {
  root: ExportContainer;
  /** Every container, root first, then depth first — the order of the planes. */
  containers: ExportContainer[];
  stores: ExportStore[];
  pools: ExportPool[];
  messages: ExportMessage[];
  /** Skeleton edges that did not join two exported nodes. Zero by the skeleton's own invariant. */
  droppedEdges: number;
}

function tagOf(kind: SkeletonNode['kind']): BpmnTag {
  switch (kind) {
    case 'start': return 'startEvent';
    case 'end':
    case 'end-error': return 'endEvent';
    case 'gateway':
    case 'loop': return 'exclusiveGateway';
    case 'sub-process': return 'subProcess';
    case 'call-activity':
    case 'transaction':
    case 'call-opaque': return 'callActivity';
    case 'service-task': return 'serviceTask';
    case 'send-task': return 'sendTask';
    case 'user-task': return 'userTask';
    case 'business-rule-task': return 'businessRuleTask';
    case 'error-boundary': return 'boundaryEvent';
    default: return 'task';
  }
}

/** The visible name. Only source tokens, joined to a statement where one token alone says too little. */
function nameOf(node: SkeletonNode): string {
  if (node.kind === 'loop' && node.detail?.loopKind === 'multi-instance' && node.detail?.over) {
    return `LOOP AT ${node.label}`;
  }
  if (!node.expandsTo && node.kind === 'read') return `SELECT ${node.label}`;
  if (!node.expandsTo && node.kind === 'write' && typeof node.detail?.operation === 'string') {
    return `${node.detail.operation} ${node.label}`;
  }
  return node.label;
}


/** A registry that turns names into unique NCNames, first come first served. */
class IdRegistry {
  private byKey = new Map<string, string>();
  private used = new Set<string>();
  constructor(private prefix: string) {}
  get(key: string): string {
    const known = this.byKey.get(key);
    if (known) return known;
    const base = `${this.prefix}${ncName(key).replace(/^_/, '')}`;
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base}-${n}`;
    this.used.add(id);
    this.byKey.set(key, id);
    return id;
  }
}

export function buildExportModel(skeleton: ProcessSkeleton): ExportModel {
  return new ModelBuilder(skeleton).build();
}

class ModelBuilder {
  private nodesByRegion = new Map<string, SkeletonNode[]>();
  private edgesByRegion = new Map<string, SkeletonEdge[]>();
  private regionByKey = new Map<string, SkeletonRegion>();
  private regionOfNode = new Map<string, string>();
  private instantiated = new Set<string>();
  private nodeCount = 0;
  private droppedEdges = 0;
  private containers: ExportContainer[] = [];
  /** Container id → the node that owns it in its parent, and that parent. */
  private owner = new Map<string, { node: ExportNode; parent: ExportContainer }>();
  private storeIds = new IdRegistry('ds-');
  private poolIds = new IdRegistry('pool-');

  constructor(private skeleton: ProcessSkeleton) {}

  build(): ExportModel {
    for (const region of this.skeleton.regions) this.regionByKey.set(region.key, region);
    for (const node of this.skeleton.nodes) {
      this.nodesByRegion.set(node.region, [...(this.nodesByRegion.get(node.region) ?? []), node]);
      this.regionOfNode.set(node.id, node.region);
    }
    for (const edge of this.skeleton.edges) {
      const region = this.regionOfNode.get(edge.from);
      if (!region || this.regionOfNode.get(edge.to) !== region) {
        this.droppedEdges += 1;
        continue;
      }
      this.edgesByRegion.set(region, [...(this.edgesByRegion.get(region) ?? []), edge]);
    }

    const root = this.container('process', 'process');
    for (const key of this.skeleton.entries) {
      const region = this.regionByKey.get(key);
      if (!region) continue;
      this.instantiated.add(key);
      this.instantiate(region, root, '', [key]);
    }

    const stores = this.attachDataStores();
    const { pools, messages } = this.readForeignSystems(root);
    this.annotateUnanchored();

    return {
      root,
      containers: this.containers,
      stores,
      pools,
      messages,
      droppedEdges: this.droppedEdges,
    };
  }

  /**
   * The tables a node reads and writes.
   *
   * A collapsed call site names the step it stands for in `collapsedFrom` — and
   * that step can itself be a collapsed call site: `CHECK_VENDOR` is a write
   * because it performs `REJECT`, which is a write because it performs
   * `LOG_APPROVAL`, which inserts into `ZMM_PO_APPR`. The chain is followed to
   * the statement; a routine name is never drawn as a table. Where the chain
   * does not end at one, there is no store rather than a guessed one.
   */
  private tablesOf(node: SkeletonNode): { reads: string[]; writes: string[] } {
    if (node.kind !== 'read' && node.kind !== 'write') return { reads: [], writes: [] };
    let step: SkeletonNode | undefined = node;
    const seen = new Set<string>();
    while (step?.expandsTo) {
      const from: unknown = step.detail?.collapsedFrom;
      if (typeof from !== 'string' || seen.has(step.id)) return { reads: [], writes: [] };
      seen.add(step.id);
      const kind: SkeletonNode['kind'] = step.kind;
      step = (this.nodesByRegion.get(step.expandsTo) ?? []).find((n) => n.kind === kind && n.label === from);
    }
    if (!step) return { reads: [], writes: [] };
    const tables = step.kind === 'read' && Array.isArray(step.detail?.tables)
      ? (step.detail?.tables as string[])
      : [step.label];
    const upper = [...new Set(tables.map((t) => t.toUpperCase()))];
    return node.kind === 'read' ? { reads: upper, writes: [] } : { reads: [], writes: upper };
  }

  private container(id: string, tag: ExportContainer['tag']): ExportContainer {
    const c: ExportContainer = {
      id, tag, bands: [], nodes: [], flows: [], storeRefs: [], dataAssociations: [], annotations: [],
    };
    this.containers.push(c);
    return c;
  }

  private instantiate(region: SkeletonRegion, into: ExportContainer, prefix: string, stack: string[]): void {
    const bandIndex = into.bands.length;
    const local = new Map<string, ExportNode>();
    const band: ExportBand = {
      key: region.key,
      anchorId: into.tag === 'subProcess' ? into.id : `${prefix}${region.entryNodeId ?? region.endNodeId}`,
      nodeIds: [],
      entryId: region.entryNodeId ? `${prefix}${region.entryNodeId}` : null,
      endId: region.endNodeId ? `${prefix}${region.endNodeId}` : null,
    };
    into.bands.push(band);

    for (const source of this.nodesByRegion.get(region.key) ?? []) {
      const id = `${prefix}${source.id}`;
      const { reads, writes } = this.tablesOf(source);
      const node: ExportNode = {
        id,
        tag: tagOf(source.kind),
        name: nameOf(source),
        source,
        error: source.kind === 'end-error' || source.kind === 'error-boundary',
        incoming: [],
        outgoing: [],
        reads,
        writes,
        band: bandIndex,
      };
      into.nodes.push(node);
      band.nodeIds.push(id);
      local.set(source.id, node);
      this.nodeCount += 1;

      if (source.kind !== 'sub-process' || !source.expandsTo) continue;
      const sub = this.regionByKey.get(source.expandsTo);
      if (!sub) {
        node.tag = 'callActivity';
        continue;
      }
      if (stack.includes(sub.key)) {
        node.tag = 'callActivity';
        node.fallback = 'recursion';
        continue;
      }
      if (this.nodeCount >= MAX_NODES) {
        node.tag = 'callActivity';
        node.fallback = 'expansion-limit';
        continue;
      }
      // Decision 6: the first instance of a routine keeps the skeleton's ids.
      const childPrefix = this.instantiated.has(sub.key) ? `${id}__` : '';
      this.instantiated.add(sub.key);
      const inner = this.container(id, 'subProcess');
      node.inner = inner;
      this.owner.set(inner.id, { node, parent: into });
      this.instantiate(sub, inner, childPrefix, [...stack, sub.key]);
    }

    const pairs = new Map<string, number>();
    for (const edge of this.edgesByRegion.get(region.key) ?? []) {
      const from = local.get(edge.from);
      const to = local.get(edge.to);
      if (!from || !to) {
        this.droppedEdges += 1;
        continue;
      }
      if (edge.kind === 'boundary') {
        if (to.tag === 'boundaryEvent' && ACTIVITY_TAGS.has(from.tag)) to.attachedTo = from.id;
        continue;
      }
      const pair = `${edge.from}-${edge.to}`;
      const n = (pairs.get(pair) ?? 0) + 1;
      pairs.set(pair, n);
      const flow: ExportFlow = {
        id: `${prefix}fl-${pair}${n > 1 ? `-${n}` : ''}`,
        sourceId: from.id,
        targetId: to.id,
        condition: edge.condition,
        edge,
        back: edge.kind === 'loop-back',
      };
      into.flows.push(flow);
      from.outgoing.push(flow.id);
      to.incoming.push(flow.id);
    }

    for (const node of local.values()) {
      // Decision 3.
      if (node.tag === 'boundaryEvent' && !node.attachedTo) {
        node.tag = 'intermediateCatchEvent';
        node.fallback = 'unattached-handler';
      }
      if (node.tag === 'exclusiveGateway') node.defaultFlow = this.defaultFlowOf(node, into);
    }
  }

  /**
   * The skeleton marks the `ELSE`, the `WHEN OTHERS` and the way past an `IF`
   * without either as `default`. A loop-back keeps the condition of the arm it
   * came from but not that mark, so an arm without a condition next to arms with
   * one is the default too.
   */
  private defaultFlowOf(node: ExportNode, container: ExportContainer): string | undefined {
    const out = container.flows.filter((f) => f.sourceId === node.id);
    const marked = out.find((f) => f.edge.kind === 'default' && !f.condition);
    if (marked) return marked.id;
    const bare = out.filter((f) => !f.condition);
    if (bare.length === 1 && out.length > 1) return bare[0].id;
    return undefined;
  }

  /** Decision 4: one data store per table, one reference to it per band. */
  private attachDataStores(): ExportStore[] {
    const stores = new Map<string, ExportStore>();
    for (const container of this.containers) {
      const refs = new Map<string, ExportStoreRef>();
      const refFor = (table: string, band: number): ExportStoreRef => {
        const storeId = this.storeIds.get(table);
        if (!stores.has(storeId)) stores.set(storeId, { id: storeId, table });
        const key = `${band}|${storeId}`;
        const known = refs.get(key);
        if (known) return known;
        const ref: ExportStoreRef = {
          id: `${container.bands[band].anchorId}-${storeId}`,
          storeId,
          table,
          band,
        };
        refs.set(key, ref);
        container.storeRefs.push(ref);
        return ref;
      };
      for (const node of container.nodes) {
        for (const table of node.reads) {
          const ref = refFor(table, node.band);
          container.dataAssociations.push({
            id: `${node.id}-reads-${ref.storeId}`, direction: 'input', nodeId: node.id, storeRefId: ref.id,
          });
        }
        for (const table of node.writes) {
          const ref = refFor(table, node.band);
          container.dataAssociations.push({
            id: `${node.id}-writes-${ref.storeId}`, direction: 'output', nodeId: node.id, storeRefId: ref.id,
          });
        }
      }
    }
    return [...stores.values()];
  }

  /** Decision 5. */
  private readForeignSystems(root: ExportContainer): { pools: ExportPool[]; messages: ExportMessage[] } {
    const pools = new Map<string, ExportPool>();
    const messages = new Map<string, ExportMessage>();
    for (const container of this.containers) {
      for (const node of container.nodes) {
        const destination = node.source.detail?.destination;
        if (typeof destination !== 'string' || !destination.trim()) continue;
        // `DESTINATION 'NONE'` is this system.
        if (destination.trim().toUpperCase() === 'NONE') continue;
        let visible = node;
        let at = container;
        while (at !== root) {
          const owner = this.owner.get(at.id);
          if (!owner) break;
          visible = owner.node;
          at = owner.parent;
        }
        const poolId = this.poolIds.get(destination.toUpperCase());
        if (!pools.has(poolId)) pools.set(poolId, { id: poolId, destination });
        const id = `msg-${visible.id}-${poolId}`;
        const known = messages.get(id);
        if (known) {
          known.calls += 1;
          continue;
        }
        messages.set(id, { id, sourceId: visible.id, poolId, call: node.source, calls: 1 });
      }
    }
    return { pools: [...pools.values()], messages: [...messages.values()] };
  }

  /** Rule 1 of the skeleton, made visible in any BPMN tool: the element says it has no anchor. */
  private annotateUnanchored(): void {
    for (const container of this.containers) {
      for (const node of container.nodes) {
        if (node.source.anchor) continue;
        container.annotations.push({
          id: `${node.id}-note`,
          text: `Not anchored: ${node.source.unanchoredReason ?? 'the source gives this element no line range.'}`,
          nodeId: node.id,
          associationId: `${node.id}-note-link`,
        });
      }
    }
  }
}

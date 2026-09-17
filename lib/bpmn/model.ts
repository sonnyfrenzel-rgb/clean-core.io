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
 * 7. **A guard gets a way past it.** A routine that opens with
 *    `CHECK p_rfc = abap_true.` is drawn by `DESIGN.md` §5.8 as a conditional
 *    flow *into* the routine rather than as a gateway, and the skeleton folds
 *    the `CHECK` onto that flow for it. Without a second flow beside it, the
 *    only way on from the caller is a condition — and a reader that follows the
 *    file has to conclude the program ends at the switch. It does not: the
 *    `CHECK` leaves the routine and the caller carries on. So every folded
 *    guard gets a **bypass flow** around the step it guards, carrying the
 *    negated condition. See `bypassGuard`.
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
  /**
   * Decision 7: the id of the guarded element this flow goes around. Set only
   * on a bypass flow, and written into its trace so a reader of the file can
   * tell a way past a switch from a branch of the process.
   */
  bypassOf?: string;
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

/**
 * The run switch the skeleton folded onto the way into this element, when there
 * is one — `applyGuards` writes it on the call site as well as on the flow.
 */
function guardOf(node: ExportNode): string | null {
  const guard = node.source.detail?.guard;
  return typeof guard === 'string' && guard ? guard : null;
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
    // After the defaults, so a bypass can never be read as a gateway's default
    // arm — it carries a condition of its own and is not one.
    for (const node of local.values()) this.bypassGuard(node, into);
  }

  /**
   * Decision 7 — the way past a folded guard.
   *
   * `applyGuards` in the skeleton takes a routine that opens with
   * `CHECK p_rfc = abap_true.`, drops the gateway, and writes the condition onto
   * the flow *into* the call site (`DESIGN.md` §5.8: the run switch is a
   * condition on the flow, not a decision of the process). What it cannot write
   * is the other half of that `CHECK`: with the switch off the routine returns
   * at its first line and **the caller goes on**. The file then has one way
   * forward and a condition on it, and anything that walks it — this product's
   * own run variants, or any modeller somebody opens the `.bpmn` in — concludes
   * that the program stops at the switch. On the 1.000-line example that reads
   * as *"31 of 65 steps are not reached"* with `p_rfc` off; 59 of them run.
   *
   * So each flow that carries a folded guard gets a second one beside it, from
   * the same source to where the guarded step leads, carrying `NOT ( … )` — the
   * same negation the skeleton writes for a `CHECK` it did **not** fold. No
   * gateway is added and no condition is invented: both flows say a thing the
   * source writes, and the pair is exactly BPMN's conditional flow with its
   * alternative.
   *
   * **Why here and not in `lib/abap/process-skeleton.ts`.** The bypass is not a
   * transfer of control any statement writes — it is what the *absence* of an
   * effect looks like once §5.8 has folded a routine's first line onto its call.
   * The skeleton's edges are read elsewhere as the decisions of the program:
   * `first-look.ts` counts the arms of every gateway, `ask-this-case.ts` answers
   * a question from them, and `process-naming.ts` hands every condition on a
   * node to the naming model. A synthetic arm there would add a decision the
   * code does not take, and a phrase for the model to name that no line of ABAP
   * stands behind. The reader that has the problem, on the other hand, reads the
   * **file**: `process-map.ts` parses the exported BPMN and `process-navigation.ts`
   * walks what it parsed — so the file is where the truth has to be, and where a
   * foreign tool will find it too.
   *
   * **Two guarded steps in a row**, which the 1.000-line example has —
   * `DOWNLOAD_RESULT_FILE` on `p_down`, then `SEND_SUMMARY_MAIL` on `p_mail`.
   * A bypass that lands on a guarded step cannot carry `NOT ( … )` of the step
   * it skipped *and* the switch of the step it arrives at; two conditions joined
   * by an `AND` this engine wrote would be a phrase no line of the source
   * writes. So the invariant `applyGuards` establishes is kept instead: **every
   * way into a guarded step carries that step's switch**, a bypass included.
   * The bypass of the *second* step then finds the new flow among its own ways
   * in and starts there too, and the pair comes out exact for all four positions
   * of the two switches. Guarded steps are walked in source order, which is what
   * makes that one pass enough.
   */
  private bypassGuard(node: ExportNode, container: ExportContainer): void {
    const guard = guardOf(node);
    if (!guard) return;
    // Only where the guard was really folded onto the way in. A call site the
    // skeleton reached through a condition of its own keeps that condition
    // (`applyGuards` never overwrites one), and nothing was lost there.
    const ins = container.flows.filter((f) => f.targetId === node.id && f.condition === guard && !f.back);
    // A loop-back counts as a way on: the last step of a loop body is guarded
    // often enough, and without this the file says the body dead-ends there.
    const outs = container.flows.filter((f) => f.sourceId === node.id);
    if (!ins.length || !outs.length) return;

    const byId = new Map(container.nodes.map((n) => [n.id, n]));
    for (const into of ins) {
      for (const out of outs) {
        if (into.sourceId === out.targetId) continue;
        if (container.flows.some((f) => f.sourceId === into.sourceId && f.targetId === out.targetId)) continue;
        const from = byId.get(into.sourceId);
        const to = byId.get(out.targetId);
        if (!from || !to) continue;
        // The condition the step it arrives at demands: its own switch when it
        // is guarded too, and otherwise the negation of the switch just skipped.
        const condition = guardOf(to) ?? `NOT ( ${guard} )`;
        const flow: ExportFlow = {
          id: `bp-${into.sourceId}-${out.targetId}`,
          sourceId: into.sourceId,
          targetId: out.targetId,
          condition,
          edge: {
            from: into.sourceId,
            to: out.targetId,
            kind: out.back ? 'loop-back' : 'conditional',
            condition,
          },
          back: out.back,
          bypassOf: node.id,
        };
        container.flows.push(flow);
        from.outgoing.push(flow.id);
        to.incoming.push(flow.id);
      }
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

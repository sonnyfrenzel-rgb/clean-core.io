import type {
  ProcessSkeleton,
  SkeletonEdge,
  SkeletonLane,
  SkeletonNode,
  SkeletonRegion,
} from '../abap/process-skeleton';
import { ncName } from './xml';
import type { PlainLabels } from '../abap/plain-language';
import { TABLE_TERMS_EN } from '../abap/plain-glossary';

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
 * 2. **A `LOOP AT` is a multi-instance sub-process; every other loop is an
 *    exclusive gateway with its body as a cycle** — roadmap 2.17 (b).
 *
 *    The argument this decision used to make against the marker still holds,
 *    and it is now the exception rather than the rule: a marker belongs on an
 *    activity that *contains* the body, and the body of an ABAP loop **can**
 *    leave it — `EXIT`, `RETURN`, an error message — which a sequence flow
 *    cannot do across a sub-process boundary. So the marker is drawn exactly
 *    where that cannot happen. `lib/abap/process-skeleton.ts` decides it, on
 *    the statements and not on the graph (`bodyStaysInLoop`): a `LOOP AT` over
 *    a table whose body stays inside the block becomes a `loop` node with
 *    `detail.multiInstance` and a region of its own, and it is drawn here as a
 *    collapsed `subProcess` with `multiInstanceLoopCharacteristics
 *    isSequential="true"` (`DESIGN.md` §5.8, *Mehrfach-Instanz, sequenziell*).
 *    A `DO`, a `WHILE`, a `SELECT … ENDSELECT` and a `LOOP AT` that the body
 *    leaves stay a cycle. Either way the kind of loop travels in the trace and
 *    the element is named `LOOP AT <table>`.
 *
 *    What decided it was our own rule colliding with our own drawing: the hint
 *    `gateway-without-condition` of `lib/process-hints.ts` fired six times on
 *    the 1.000-line example and all six were `LOOP AT` gateways — the product
 *    warning about a decision it had drawn where the code takes none.
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
  | 'intermediateCatchEvent'
  /** Roadmap 2.17 (a). Carries no condition, ever — it is a fork or a join. */
  | 'parallelGateway'
  /**
   * A milestone between two report events in the business reading of the top
   * plane (`chainEntries`): where one event block ends and the next begins, when
   * more than one way leads out of the one and into the other.
   */
  | 'intermediateThrowEvent';

export const ACTIVITY_TAGS: ReadonlySet<BpmnTag> = new Set<BpmnTag>([
  'task', 'serviceTask', 'sendTask', 'userTask', 'businessRuleTask', 'callActivity', 'subProcess',
]);

/** Above this many flow nodes, no further routine is expanded (decision 6). */
export const MAX_NODES = 5000;

export type ExportFallback = 'recursion' | 'expansion-limit' | 'unattached-handler';

export interface ExportNode {
  id: string;
  tag: BpmnTag;
  /** What the element is called on the map: the plain label, or the technical name without one. */
  name: string;
  /** The token the skeleton read out of the source — always kept, for the Technical names view and the trace. */
  technicalName: string;
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
  /**
   * The anchor shown when the element stands for more than one place in the
   * code — `L79, L232`, or a routine's range `L60–75` (`lib/bpmn/excerpt.ts`).
   * Undefined: the source node's own line range.
   */
  anchorLabel?: string;
  /**
   * One fact about a collapsed phase, counted on its plane — "2 decisions ·
   * 1 error end", "reads EBAN". Set in the plain reading only; it is drawn under
   * the phase's name so the overview says what each phase does without opening it.
   */
  fact?: string;
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
  /**
   * What the flow says on the canvas when that is not its condition — a
   * branch label (`Yes`, `No`, a `WHEN` value). Undefined: the condition is
   * the label, as the file has always written it.
   */
  label?: string;
  /** Set on a flow `chainEntries` drew between two report events: runtime order, not a statement. */
  runtimeOrder?: boolean;
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
  /** A readable name for the table; undefined: the table name is the name. */
  name?: string;
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

/**
 * A lane of the top-level process — roadmap 2.16.
 *
 * The skeleton decided how many there are and what they are called; this is the
 * same lane with export ids on it. `flowNodeRefs` names only elements of the
 * **root** container, because that is where the `laneSet` sits: what a collapsed
 * `subProcess` contains is on its own plane, and it is in the lane by virtue of
 * the sub-process element being in it.
 */
export interface ExportLane {
  id: string;
  name: string;
  kind: SkeletonLane['kind'];
  source: SkeletonLane;
  flowNodeRefs: string[];
}

export interface ExportModel {
  root: ExportContainer;
  /** Roadmap 2.16. Empty only for a source with no process at all. */
  lanes: ExportLane[];
  /** Every container, root first, then depth first — the order of the planes. */
  containers: ExportContainer[];
  stores: ExportStore[];
  pools: ExportPool[];
  messages: ExportMessage[];
  /** Skeleton edges that did not join two exported nodes. Zero by the skeleton's own invariant. */
  droppedEdges: number;
}

/**
 * Is this the multi-instance activity of 2.17 (b) rather than a cycle?
 *
 * The skeleton decided it and said so on the node; nothing is re-derived here.
 */
export function isMultiInstanceLoop(node: SkeletonNode): boolean {
  return node.kind === 'loop' && node.detail?.multiInstance === true;
}

/**
 * ADR-054 — an end event of an early exit (`RETURN`, `EXIT`, `STOP`)
 * rather than the normal end at the closing word. The skeleton decided it.
 */
export function isEarlyEnd(node: SkeletonNode): boolean {
  return node.kind === 'end' && node.detail?.early === true;
}

function tagOf(node: SkeletonNode): BpmnTag {
  // A multi-instance `LOOP AT` whose body draws no element is the other half of
  // §5.8's row — *an activity* with the marker, and no plane behind it.
  if (isMultiInstanceLoop(node)) return node.expandsTo ? 'subProcess' : 'task';
  switch (node.kind) {
    case 'start': return 'startEvent';
    case 'end':
    case 'end-error': return 'endEvent';
    case 'parallel-gateway': return 'parallelGateway';
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
  // ADR-054: an early end is named by the routine it leaves and the keyword it
  // leaves by — two tokens of the source, so the normal end (`CHECK_ORDER`) and
  // the early one (`CHECK_ORDER (RETURN)`) are told apart without a phrase.
  if (isEarlyEnd(node) && typeof node.detail?.routine === 'string' && node.detail.routine) {
    return `${node.detail.routine} (${node.label})`;
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

export interface ExportModelOptions {
  /**
   * Plain-language labels (`lib/abap/plain-language.ts`). With them every
   * element is named for a business reader and every branch says where it
   * goes (Yes / No / a value); without them the names are the source's tokens.
   * Either way the technical name, the condition and the anchor stay.
   */
  labels?: PlainLabels;
  /**
   * Draw the report events of the top plane as **one** flow in their fixed
   * runtime order (INITIALIZATION, AT SELECTION-SCREEN, START-OF-SELECTION,
   * END-OF-SELECTION) instead of one band each — the business reading
   * (owner, 01.10.2026). A block that draws nothing is folded away. Applies only
   * when every entry is a report event; a dialog program keeps its bands.
   * Default: on exactly when `labels` are given.
   */
  chainEntries?: boolean;
}

export function buildExportModel(skeleton: ProcessSkeleton, options: ExportModelOptions = {}): ExportModel {
  return new ModelBuilder(skeleton, options.labels ?? null, options.chainEntries ?? !!options.labels).build();
}

/** A table with its business name when the glossary knows it: "Purchase requisition (EBAN)". */
export function storeDisplayName(table: string): string {
  const term = TABLE_TERMS_EN[table.toLowerCase()];
  return term ? `${term.singular} (${table})` : table;
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

  constructor(private skeleton: ProcessSkeleton, private labels: PlainLabels | null, private chain = false) {}

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
    if (this.chain) this.chainEntries(root);
    if (this.labels) for (const c of this.containers) for (const n of c.nodes) if (n.inner) n.fact = factOf(n.inner);

    const stores = this.attachDataStores();
    const { pools, messages } = this.readForeignSystems(root);
    this.annotateUnanchored();

    return {
      root,
      lanes: this.readLanes(root),
      containers: this.containers,
      stores,
      pools,
      messages,
      droppedEdges: this.droppedEdges,
    };
  }

  /**
   * The lanes of the top plane — roadmap 2.16.
   *
   * Nothing is decided here: `lib/abap/process-skeleton.ts` decided how many
   * lanes there are, what each is called and which skeleton nodes it holds. This
   * translates skeleton ids into export ids, and it does so by asking the root
   * container which nodes it actually has — so a `flowNodeRef` can only ever
   * name an element that is in the file. A skeleton node that was expanded into
   * a collapsed sub-process is *not* on the top plane and is therefore not
   * referenced; its sub-process element is.
   */
  private readLanes(root: ExportContainer): ExportLane[] {
    const laneOfSkeletonNode = new Map<string, string>();
    for (const lane of this.skeleton.lanes) {
      for (const nodeId of lane.nodeIds) laneOfSkeletonNode.set(nodeId, lane.id);
    }
    const refs = new Map<string, string[]>();
    for (const node of root.nodes) {
      const laneId = laneOfSkeletonNode.get(node.source.id);
      if (!laneId) continue;
      refs.set(laneId, [...(refs.get(laneId) ?? []), node.id]);
    }
    return this.skeleton.lanes.map((lane) => ({
      id: lane.id,
      name: lane.name,
      kind: lane.kind,
      source: lane,
      flowNodeRefs: refs.get(lane.id) ?? [],
    }));
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
      const technicalName = nameOf(source);
      const plain = this.labels ? this.labels.nodes.get(source.id) : undefined;
      const node: ExportNode = {
        id,
        tag: tagOf(source),
        name: plain !== undefined && (plain || tagOf(source) === 'parallelGateway') ? plain : technicalName,
        technicalName,
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

      // Roadmap 2.17 (b): a multi-instance `LOOP AT` opens a plane exactly the
      // way a routine does — the body is a region, and the marker rides on the
      // element that contains it.
      if ((source.kind !== 'sub-process' && !isMultiInstanceLoop(source)) || !source.expandsTo) continue;
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
        label: this.labels ? this.labels.flow(edge) : undefined,
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
        if (this.labels) flow.label = this.labels.flow(flow.edge);
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

  /**
   * The report events of the top plane as one flow — `ExportModelOptions.chainEntries`.
   *
   * ABAP runs the events of an executable report in a fixed order, so drawing
   * them one after the other says nothing the language does not. What it adds
   * is a sequence flow from one block into the next; it carries
   * `reason="runtime-order"` in its trace, so a reader of the file can tell it
   * from a flow a statement writes. Where exactly one way leads out of a block
   * and exactly one unconditional way into the next, the two events between
   * them go and the flow joins the steps directly; otherwise the end of the
   * first and the start of the second become one milestone event. Every step
   * keeps its anchor; only the event keywords' own lines leave the picture, and
   * they stay in the Technical names view.
   */
  private chainEntries(root: ExportContainer): void {
    if (root.bands.length < 2) return;
    const byId = new Map(root.nodes.map((n) => [n.id, n]));
    const isReportEvent = (band: ExportBand) => {
      const start = band.entryId ? byId.get(band.entryId) : undefined;
      return !!start && start.source.detail?.origin === 'event' && typeof start.source.detail?.runtimeRank === 'number';
    };
    if (!root.bands.every(isReportEvent)) return;

    const drop = (id: string) => {
      root.nodes = root.nodes.filter((n) => n.id !== id);
      byId.delete(id);
    };
    const dropFlow = (id: string) => {
      root.flows = root.flows.filter((f) => f.id !== id);
      for (const n of root.nodes) {
        n.incoming = n.incoming.filter((x) => x !== id);
        n.outgoing = n.outgoing.filter((x) => x !== id);
      }
    };
    // Blocks that draw nothing: start → end, and nothing else.
    let bands = root.bands.filter((band) => {
      const own = band.nodeIds.filter((id) => byId.has(id));
      if (own.length > 2 || root.bands.length < 2) return true;
      for (const f of root.flows.filter((f) => own.includes(f.sourceId))) dropFlow(f.id);
      own.forEach(drop);
      return false;
    });
    if (!bands.length) bands = root.bands.slice(0, 1);

    const merged: ExportBand = {
      key: bands.map((b) => b.key).join('+'),
      anchorId: bands[0].anchorId,
      nodeIds: [],
      entryId: bands[0].entryId,
      endId: bands[bands.length - 1].endId,
    };
    bands.forEach((band, i) => {
      merged.nodeIds.push(...band.nodeIds.filter((id) => byId.has(id)));
      const next = bands[i + 1];
      if (!next || !band.endId || !next.entryId) return;
      const end = byId.get(band.endId);
      const start = byId.get(next.entryId);
      if (!end || !start) return;
      const into = root.flows.filter((f) => f.targetId === end.id);
      const outOf = root.flows.filter((f) => f.sourceId === start.id);
      if (into.length === 1 && outOf.length === 1 && !outOf[0].condition) {
        // Join directly: the flow into the end now leads to the first step of the next block.
        const flow = into[0];
        const target = byId.get(outOf[0].targetId) as ExportNode;
        end.incoming = end.incoming.filter((x) => x !== flow.id);
        flow.targetId = target.id;
        flow.edge = { ...flow.edge, to: target.source.id, reason: flow.edge.reason ?? undefined };
        target.incoming.push(flow.id);
        dropFlow(outOf[0].id);
        drop(end.id);
        drop(start.id);
        flow.runtimeOrder = true;
      } else {
        // One milestone where the two blocks meet.
        start.tag = 'intermediateThrowEvent';
        for (const flow of into) {
          flow.targetId = start.id;
          start.incoming.push(flow.id);
        }
        drop(end.id);
      }
    });
    merged.nodeIds = merged.nodeIds.filter((id) => byId.has(id));
    for (const n of root.nodes) n.band = 0;
    root.bands = [merged];
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
          name: this.labels ? storeDisplayName(table) : undefined,
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

/** "2 decision points · 1 error end": the two first things a phase's plane holds, counted. */
export function factOf(inner: ExportContainer): string | undefined {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const nodes = inner.nodes;
  const decisions = nodes.filter((n) => n.tag === 'exclusiveGateway' && n.source.kind === 'gateway').length;
  const errors = nodes.filter((n) => n.tag === 'endEvent' && n.error).length;
  const reads = [...new Set(nodes.flatMap((n) => n.reads))];
  const writes = [...new Set(nodes.flatMap((n) => n.writes))];
  const calls = nodes.filter((n) => n.tag === 'serviceTask' || n.tag === 'sendTask' || n.tag === 'callActivity').length;
  const parts = [
    decisions ? count(decisions, 'decision point', 'decision points') : '',
    errors ? count(errors, 'error end', 'error ends') : '',
    reads.length === 1 ? `reads ${reads[0]}` : reads.length ? count(reads.length, 'table read', 'table reads') : '',
    writes.length === 1 ? `writes ${writes[0]}` : writes.length ? count(writes.length, 'table written', 'tables written') : '',
    calls ? count(calls, 'call', 'calls') : '',
  ].filter(Boolean);
  return parts.length ? parts.slice(0, 2).join(' · ') : undefined;
}

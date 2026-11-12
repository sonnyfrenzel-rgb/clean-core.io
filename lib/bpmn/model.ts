import type {
  ProcessSkeleton,
  SkeletonEdge,
  SkeletonLane,
  SkeletonNode,
  SkeletonRegion,
} from '../abap/process-skeleton';
import { ncName } from './xml';
import type { PlainLabels, WorkflowLabels } from '../abap/plain-language';
import { TABLE_TERMS_EN } from '../abap/plain-glossary';
import { quotedComment } from '../abap/author-comments';
import { isConstructorName, isTechnicalMethodName } from '../abap/technical-methods';

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

export type ExportFallback = 'recursion' | 'expansion-limit' | 'unattached-handler' | 'drawn-once';

export interface ExportNode {
  id: string;
  tag: BpmnTag;
  /** What the element is called on the map: the plain label, or the technical name without one. */
  name: string;
  /** The token the skeleton read out of the source — always kept, for the Technical names view and the trace. */
  technicalName: string;
  /**
   * The SAP technique behind a plain name, in the statement's words (`CALL SCREEN 9000 (dynpro)`).
   * Only with plain labels; the element's documentation says it under the name (owner, 11.10.2026).
   */
  technique?: string;
  /**
   * 3.1.0: what the reader should know beside the name, in the engine's words (`PlainLabels.detail`) — an unknown
   * check says that the code does not state what it means (owner decision 06.11.2026). In the documentation only.
   */
  detail?: string;
  /** 3.1.0 (H4): the author's comment at the element, quoted with its tag and line (`quotedComment`). Documentation only. */
  comment?: string;
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
   * The steps folded into this one at the business level (3.1.0, `ExportModelOptions.foldTechnique`): a lock, its
   * release, a list's set-up, or a step of the same name right after it — each with its own name, its code and its
   * lines. The element's anchor (`anchorLabel`) carries every one of their lines; the documentation names them.
   */
  folded?: Array<{ name: string; technicalName: string; anchor: string | null }>;
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
  /**
   * Set on a flow `chainEntries` drew between two report events: runtime order,
   * not a statement. The skeleton's own reason stays on `edge` (`runtime-order`,
   * or `stop` for `STOP` going on with `END-OF-SELECTION`).
   */
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

/**
 * Roadmap 3.0.7 — a skeleton flow of the run order rather than of a statement:
 * the end of a reporting event block into the next block
 * (`reason: 'runtime-order'`), or `STOP` into `END-OF-SELECTION`
 * (`reason: 'stop'`, when it crosses into that block).
 */
function isRunOrderEdge(edge: SkeletonEdge): boolean {
  return edge.reason === 'runtime-order' || edge.reason === 'stop';
}

/**
 * The report event blocks the skeleton chains into one run (`chainReportEvents`
 * in `lib/abap/process-skeleton.ts`): `LOAD-OF-PROGRAM` up to
 * `END-OF-SELECTION`. List events, callbacks, dialog modules and every other
 * entry are raised by something else and keep a band of their own.
 */
const RUN_ORDER_LAST_RANK = 7;
function isRunEvent(start: SkeletonNode | undefined): boolean {
  if (!start || start.kind !== 'start') return false;
  const origin = start.detail?.origin;
  const rank = start.detail?.runtimeRank;
  return (origin === 'event' || origin === 'implicit') && typeof rank === 'number' && rank <= RUN_ORDER_LAST_RANK;
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
   * (owner, 01.10.2026). A block that draws nothing is folded away. Since
   * roadmap 3.0.7 the flows are the skeleton's run order (`reason:
   * 'runtime-order'` / `'stop'`): only an early end ends the run, and the blocks
   * of the run are joined even when the program also has callbacks, list
   * events or dialog modules — those keep a band of their own each.
   * Default: on exactly when `labels` are given.
   */
  chainEntries?: boolean;
  /**
   * The business level (roadmap 3.0.21, from engine 3.0.21 — `ENGINE_READS_3021_FROM`; owner report of 22.10.2026:
   * a 937-line class-based program became 1,680 shapes and 670 gateways). Two things change, and nothing else:
   *
   *   - **a routine is drawn once** (decision 6 amended): its first call site opens its plane, every later one is a
   *     call activity to it (`fallback: 'drawn-once'`) instead of a copy of the whole plane;
   *   - **a run of guard checks is one step** (`collapseGuardChains`): two or more decisions in a row, each with one
   *     arm that leaves the routine early (an early or error end, perhaps after a step such as a log line or a
   *     message) and one that goes on to the next, become a business-rule task "N checks" with every guard's line,
   *     a decision "all checks passed?" and one early end — the granularity of the step list.
   *
   * Default: off — the reading of every engine before 3.0.21.
   */
  businessLevel?: boolean;
  /**
   * Technique one level down (concept "Business-Lesbarkeit", from engine 3.1.0 — `ENGINE_READS_310_FROM`). With
   * plain labels, two things on a straight run of plain steps (one way in, one way out, no condition between them):
   *
   *   - **a technical step is folded into the step beside it** — a lock (`ENQUEUE_*`), its release (`DEQUEUE_*`),
   *     the application log (`BAL_*`), the set-up of a list's columns: the business step it serves stays, the
   *     technical one is named in its documentation and keeps its lines on its anchor;
   *   - **a step of the same name right after another is one step** — five "Show the result list" in a row are one,
   *     with every line.
   *
   * Nothing is dropped: every folded element's lines stay on the element that carries it (`ExportNode.folded`,
   * `anchorLabel`), and the technical file and the IT view draw every statement. Default: off.
   */
  foldTechnique?: boolean;
  /**
   * Object-oriented programs read as business processes (roadmap 3.1.0, AB-15a, from engine 3.1.0 —
   * `ENGINE_READS_310_FROM`; owner decision 06.11.2026). With plain labels and `foldTechnique`, two things more:
   *
   *   - **a technical method is technique** (`lib/abap/technical-methods.ts`): the call of a constructor, a getter or
   *     setter, a `show`/`display`/`output` method that the skeleton drew as one step is folded into the step beside
   *     it like a lock — every line kept on the element that carries it;
   *   - **the top level is not one method**: where an entry of the top plane does nothing but call one method (and,
   *     at most, technical methods beside it) — `NEW lcl_app( )->run( )` — that method's plane is the top level,
   *     so the process is on the first level and not under "Run". The method's lines stay on the element that now
   *     opens its content (`folded`), the technical file keeps the method as it is.
   *
   * Default: off.
   */
  readsObjects?: boolean;
}

export function buildExportModel(skeleton: ProcessSkeleton, options: ExportModelOptions = {}): ExportModel {
  const technique = !!options.labels && (options.foldTechnique ?? false);
  return new ModelBuilder(skeleton, options.labels ?? null, options.chainEntries ?? !!options.labels, options.businessLevel ?? false,
    technique, technique && (options.readsObjects ?? false)).build();
}

/**
 * AB-15a: a call of a technical method (`lib/abap/technical-methods.ts`) that the skeleton drew as one step — never a
 * phase (a plane is a part of the process), never a write, never a read other than a constructor's (they change or
 * fetch the business's data), never a person's step.
 */
function isTechnicalMethodStep(n: ExportNode): boolean {
  if (n.source.detail?.method !== true || n.inner || n.tag === 'subProcess') return false;
  if (/^(?:write|user-task|sub-process)$/.test(n.source.kind)) return false;
  // A constructor that reads its settings is still the set-up of the run; any other method that reads is a step.
  if (n.source.kind === 'read' && !isConstructorName(n.source.label)) return false;
  return isTechnicalMethodName(n.source.label);
}

/** The SAP technique a business step does not need to see (`ExportModelOptions.foldTechnique`), by the code's name. */
const TECHNIQUE_CALL = /^(?:ENQUEUE_|DEQUEUE_|BAL_|REUSE_ALV_FIELDCATALOG|LVC_FIELDCATALOG)/i;
/** 3.1.0: a helper routine that writes the program's log, by its name (`ADD_LOG`, `LOG_MESSAGE`, `PROTOKOLL_SCHREIBEN`). */
const LOG_HELPER = /(?:^|[_:])(?:log|logs|protokoll|applog|msg_add|add_msg)(?:[_:]|$)/i;

/** At least this many guard checks in a row are drawn as one step at the business level. */
export const GUARD_CHAIN_MIN = 2;

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
  /** Skeleton edges of the run order between two report event blocks (roadmap 3.0.7) — drawn by `chainEntries`. */
  private runOrder: SkeletonEdge[] = [];

  constructor(
    private skeleton: ProcessSkeleton,
    private labels: PlainLabels | null,
    private chain = false,
    private businessLevel = false,
    private technique = false,
    private objects = false,
  ) {}

  build(): ExportModel {
    for (const region of this.skeleton.regions) this.regionByKey.set(region.key, region);
    for (const node of this.skeleton.nodes) {
      this.nodesByRegion.set(node.region, [...(this.nodesByRegion.get(node.region) ?? []), node]);
      this.regionOfNode.set(node.id, node.region);
    }
    for (const edge of this.skeleton.edges) {
      const region = this.regionOfNode.get(edge.from);
      if (!region || this.regionOfNode.get(edge.to) !== region) {
        // Roadmap 3.0.7: the skeleton's run order — the end of one reporting
        // event block into the start of the next, and `STOP` into
        // `END-OF-SELECTION` — crosses regions by definition. The business
        // reading draws it (`chainEntries`); the banded technical reading has
        // no place for a flow between two bands and leaves it out.
        if (this.chain && region && this.regionOfNode.has(edge.to) && isRunOrderEdge(edge)) {
          this.runOrder.push(edge);
          continue;
        }
        this.droppedEdges += 1;
        continue;
      }
      this.edgesByRegion.set(region, [...(this.edgesByRegion.get(region) ?? []), edge]);
    }

    const root = this.container('process', 'process');
    // Engine 3.1.0: the business reading leaves out an entry that draws nothing between start and end
    // (`SkeletonRegion.drawsNothing`) — unless that would leave no process at all. The technical reading draws it.
    const hideEmpty = this.businessLevel && !!this.labels
      && this.skeleton.entries.some((key) => this.regionByKey.get(key) && !this.regionByKey.get(key)?.drawsNothing);
    for (const key of this.skeleton.entries) {
      const region = this.regionByKey.get(key);
      if (!region) continue;
      if (hideEmpty && region.drawsNothing) continue;
      this.instantiated.add(key);
      this.instantiate(region, root, '', [key]);
    }
    if (this.chain) this.chainEntries(root);
    if (this.objects && this.labels?.workflow) this.readWorkflow(root, this.labels.workflow);
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
      // 3.1.0 (H9): an authorization lane by what it protects (`PlainLabels.lane`); the skeleton's token otherwise.
      name: this.labels?.lane?.(lane) || lane.name,
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
        ...(this.labels ? { technique: this.labels.technique(source.id) } : {}),
        ...(this.labels?.detail?.(source.id) ? { detail: this.labels.detail(source.id) } : {}),
        ...(this.labels?.comment?.(source.id) ? { comment: quotedComment(this.labels.comment(source.id)!) } : {}),
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
      // Decision 6, amended at the business level (3.0.21): a routine already drawn is a call to it, not a copy.
      if (this.businessLevel && this.instantiated.has(sub.key) && /^(?:form|method):/.test(sub.key)) {
        node.tag = 'callActivity';
        node.fallback = 'drawn-once';
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

    if (this.businessLevel) this.collapseGuardChains(into, band, local);
    if (this.objects && into.tag === 'process') this.liftLoneMethod(into, band);
    if (this.technique) this.foldTechniqueSteps(into, band, local);

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
   * The business level (3.0.21): a run of guard checks becomes one step — see `ExportModelOptions.businessLevel`.
   *
   * A guard is a decision of the skeleton (`gateway`, not a loop) with exactly two ways out, one of which runs
   * through plain steps only (no decision, no plane, nothing else leading in) to an early or error end; the other
   * leads on. Guards follow one another when the way on of one is the only way into the next. Such a run of
   * `GUARD_CHAIN_MIN` or more is replaced by a business-rule task (the first guard's node, every guard's line in its
   * trace), a decision on whether every check passed, and the first of the early ends; the steps on the leaving
   * arms (a log line, a message) are not drawn, their tables go to the task. Nothing is invented: the conditions on
   * the two new ways out are the guards' own, joined.
   */
  private collapseGuardChains(into: ExportContainer, band: ExportBand, local: Map<string, ExportNode>): void {
    const byId = new Map(into.nodes.map((n) => [n.id, n]));
    const flowById = new Map(into.flows.map((f) => [f.id, f]));
    const outOf = (n: ExportNode) => n.outgoing.map((id) => flowById.get(id)!).filter(Boolean);
    const isEnd = (n: ExportNode) => (isEarlyEnd(n.source) || n.source.kind === 'end-error') && n.outgoing.length === 0;
    const plainStep = (n: ExportNode) => ACTIVITY_TAGS.has(n.tag) && !n.inner && n.tag !== 'subProcess' && !n.attachedTo;
    /** The leaving arm of a guard: the nodes it runs through and its end, or null. */
    const leaving = (f: ExportFlow): { path: ExportNode[]; end: ExportNode } | null => {
      const path: ExportNode[] = [];
      let at = byId.get(f.targetId);
      for (let i = 0; at && i < 4; i++) {
        if (at.incoming.length !== 1) return null;
        if (isEnd(at)) return { path, end: at };
        if (!plainStep(at) || at.outgoing.length !== 1) return null;
        path.push(at);
        at = byId.get(flowById.get(at.outgoing[0])?.targetId ?? '');
      }
      return null;
    };
    const guardOfNode = (g: ExportNode): { leave: ExportFlow; on: ExportFlow; path: ExportNode[]; end: ExportNode } | null => {
      if (g.tag !== 'exclusiveGateway' || g.source.kind !== 'gateway' || g.attachedTo) return null;
      const outs = outOf(g);
      if (outs.length !== 2 || outs.some((f) => f.back)) return null;
      for (const [a, b] of [[outs[0], outs[1]], [outs[1], outs[0]]]) {
        const arm = leaving(a);
        if (arm && !leaving(b)) return { leave: a, on: b, ...arm };
      }
      return null;
    };
    const done = new Set<string>();
    for (const first of [...into.nodes]) {
      if (done.has(first.id) || !byId.has(first.id)) continue;
      const head = guardOfNode(first);
      if (!head) continue;
      // Not the middle of a run: the way in is not the way on of another guard.
      const ins = first.incoming.map((id) => flowById.get(id)!).filter(Boolean);
      if (ins.some((f) => { const g = byId.get(f.sourceId); const gg = g && guardOfNode(g); return !!gg && gg.on.id === f.id; })) continue;
      const chain = [{ node: first, ...head }];
      for (;;) {
        const last = chain[chain.length - 1];
        const next = byId.get(last.on.targetId);
        if (!next || next.incoming.length !== 1 || chain.some((c) => c.node.id === next.id)) break;
        const g = guardOfNode(next);
        if (!g) break;
        chain.push({ node: next, ...g });
      }
      for (const c of chain) done.add(c.node.id);
      if (chain.length < GUARD_CHAIN_MIN) continue;

      const removed = new Set<string>();
      for (const c of chain) {
        removed.add(c.node.id);
        for (const p of c.path) removed.add(p.id);
        if (c !== chain[0]) removed.add(c.end.id);
      }
      const keptEnd = chain[0].end;
      const tail = chain[chain.length - 1];
      const lines = chain.map((c) => c.node.source.anchor?.lineStart).filter((l): l is number => typeof l === 'number');
      const leaveConditions = chain.map((c) => c.leave.condition).filter(Boolean);
      const anchorOf = (n: ExportNode) => n.source.anchor;
      const from = anchorOf(first);
      const to = anchorOf(tail.node);
      const span = from && to ? { ...from, lineEnd: Math.max(from.lineEnd, to.lineEnd, ...chain.flatMap((c) => c.path.map((p) => p.source.anchor?.lineEnd ?? 0))) } : from;
      const detail = { ...(first.source.detail ?? {}), collapsedGuards: chain.length, guardLines: lines.map(String) };
      const technical = `${chain.length} checks (${lines.map((l) => `L${l}`).join(', ')})`;
      const task: ExportNode = {
        id: `${first.id}__checks`,
        tag: 'businessRuleTask',
        name: this.labels ? `${chain.length} checks` : technical,
        technicalName: technical,
        source: { ...first.source, kind: 'business-rule-task', label: technical, anchor: span ?? null, detail },
        error: false,
        incoming: [],
        outgoing: [],
        reads: [...new Set(chain.flatMap((c) => c.path.flatMap((p) => p.reads)))],
        writes: [...new Set(chain.flatMap((c) => c.path.flatMap((p) => p.writes)))],
        band: first.band,
        anchorLabel: lines.map((l) => `L${l}`).join(', '),
      };
      const join: ExportNode = {
        id: `${first.id}__passed`,
        tag: 'exclusiveGateway',
        name: this.labels ? 'All checks passed?' : `${chain.length} checks passed`,
        technicalName: `${chain.length} checks passed`,
        source: { ...tail.node.source, label: `${chain.length} checks passed`, detail: { ...(tail.node.source.detail ?? {}), collapsedGuards: chain.length } },
        error: false,
        incoming: [],
        outgoing: [],
        reads: [],
        writes: [],
        band: first.band,
        anchorLabel: lines.map((l) => `L${l}`).join(', '),
      };
      // The flows: every way into the first guard now goes into the task; the task into the decision; the decision
      // on (the last guard's way on) and out (to the kept early end), with the guards' own conditions.
      const keepFlows = into.flows.filter((f) => !removed.has(f.sourceId) && (!removed.has(f.targetId) || f.targetId === first.id) && f.targetId !== keptEnd.id);
      for (const f of keepFlows) if (f.targetId === first.id) f.targetId = task.id;
      const mk = (id: string, src: ExportNode, dst: ExportNode, condition: string, kind: SkeletonEdge['kind']): ExportFlow => {
        const edge: SkeletonEdge = { from: src.source.id, to: dst.source.id, kind, condition };
        return { id, sourceId: src.id, targetId: dst.id, condition, edge, back: false, label: this.labels ? this.labels.flow(edge) : undefined };
      };
      const onTarget = byId.get(tail.on.targetId)!;
      const shown = leaveConditions.slice(0, 3).join(' OR ') + (leaveConditions.length > 3 ? ` OR … (${leaveConditions.length - 3} more)` : '');
      const flows = [
        mk(`${first.id}__fl-checks`, task, join, '', 'sequence'),
        mk(`${first.id}__fl-passed`, join, onTarget, tail.on.condition, tail.on.edge.kind === 'default' ? 'default' : 'conditional'),
        mk(`${first.id}__fl-failed`, join, keptEnd, shown, 'conditional'),
      ];
      // The kept early end keeps only the new way in.
      into.flows = [...keepFlows.filter((f) => f.targetId !== onTarget.id || !removed.has(f.sourceId)), ...flows];
      into.nodes = into.nodes.filter((n) => !removed.has(n.id));
      const at = into.nodes.indexOf(keptEnd);
      into.nodes.splice(at < 0 ? into.nodes.length : at, 0, task, join);
      for (const id of removed) local.delete(byId.get(id)?.source.id ?? '');
      local.set(task.source.id + '#checks', task);
      local.set(join.source.id + '#passed', join);
      band.nodeIds = into.nodes.filter((n) => n.band === first.band).map((n) => n.id).filter((id) => band.nodeIds.includes(id) || id === task.id || id === join.id);
      if (band.entryId === first.id) band.entryId = task.id;
      byId.clear();
      for (const n of into.nodes) byId.set(n.id, n);
      flowById.clear();
      for (const f of into.flows) flowById.set(f.id, f);
      for (const n of into.nodes) {
        n.incoming = into.flows.filter((f) => f.targetId === n.id).map((f) => f.id);
        n.outgoing = into.flows.filter((f) => f.sourceId === n.id).map((f) => f.id);
      }
    }
  }

  /**
   * AB-15a — the top level is not one method (`ExportModelOptions.readsObjects`). An entry band of the top plane
   * that runs start → one method's plane → end, with at most technical method steps beside it, takes that plane's
   * content in its place: the flow into the method goes to the first element of its plane, every way to the plane's
   * normal end goes on where the method went on. Its error and early ends stay ends. Repeated while it applies —
   * `main` calling `run` is lifted twice. Nothing else moves: a method with a guard on its way in, an error boundary
   * on it, or a plane that does not open with one flow from its start stays where it is.
   */
  private liftLoneMethod(into: ExportContainer, band: ExportBand, workflow?: ExportContainer): void {
    for (let guard = 0; guard < 8; guard++) {
      const mine = into.nodes.filter((n) => band.nodeIds.includes(n.id));
      const activities = mine.filter((n) => ACTIVITY_TAGS.has(n.tag));
      // Round 2: the routine that runs the status workflow is lifted too when it is a FORM (`readWorkflow`).
      const planes = activities.filter((n) => n.tag === 'subProcess' && n.inner && (/^method:/i.test(n.source.expandsTo ?? '') || (!!workflow && n.inner === workflow)));
      if (planes.length !== 1) return;
      const wrapper = planes[0];
      const inner = wrapper.inner!;
      if (activities.some((n) => n !== wrapper && !isTechnicalMethodStep(n))) return;
      if (mine.some((n) => n.tag === 'exclusiveGateway' || n.tag === 'parallelGateway' || n.attachedTo === wrapper.id)) return;
      if (guardOf(wrapper) || isMultiInstanceLoop(wrapper.source)) return;
      const ins = into.flows.filter((f) => f.targetId === wrapper.id);
      const outs = into.flows.filter((f) => f.sourceId === wrapper.id);
      if (ins.length !== 1 || outs.length !== 1 || ins[0].condition || outs[0].condition) return;
      const innerBand = inner.bands[0];
      const start = inner.nodes.find((n) => n.id === innerBand?.entryId && n.tag === 'startEvent');
      const end = inner.nodes.find((n) => n.id === innerBand?.endId && n.tag === 'endEvent');
      if (!start || !end || inner.bands.length !== 1) return;
      const first = inner.flows.filter((f) => f.sourceId === start.id);
      const last = inner.flows.filter((f) => f.targetId === end.id);
      if (first.length !== 1 || first[0].condition || !last.length) return;
      const head = inner.nodes.find((n) => n.id === first[0].targetId);
      if (!head || head === end) return;

      // The flows: into the wrapper -> into the head of its plane; into the plane's end -> where the wrapper went on.
      ins[0].targetId = head.id;
      for (const f of last) f.targetId = outs[0].targetId;
      const bandIndex = into.bands.indexOf(band);
      const moved = inner.nodes.filter((n) => n !== start && n !== end);
      for (const n of moved) n.band = bandIndex;
      // The method's own lines stay readable on the element that now opens its content.
      const a = wrapper.source.anchor;
      const own = a ? (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`) : null;
      if (ACTIVITY_TAGS.has(head.tag)) {
        head.folded = [...(head.folded ?? []), { name: wrapper.name, technicalName: wrapper.technicalName, anchor: own }, ...(wrapper.folded ?? [])];
      }
      into.flows = [...into.flows.filter((f) => f !== outs[0]), ...inner.flows.filter((f) => f !== first[0])];
      const at = into.nodes.indexOf(wrapper);
      into.nodes.splice(at, 1, ...moved);
      band.nodeIds = band.nodeIds.flatMap((id) => (id === wrapper.id ? moved.map((n) => n.id) : [id]));
      into.storeRefs.push(...inner.storeRefs);
      into.dataAssociations.push(...inner.dataAssociations);
      into.annotations.push(...inner.annotations);
      this.containers = this.containers.filter((c) => c !== inner);
      this.owner.delete(inner.id);
      for (const [id, o] of this.owner) if (o.parent === inner) this.owner.set(id, { node: o.node, parent: into });
      for (const n of into.nodes) {
        n.incoming = into.flows.filter((f) => f.targetId === n.id).map((f) => f.id);
        n.outgoing = into.flows.filter((f) => f.sourceId === n.id).map((f) => f.id);
      }
    }
  }

  /**
   * AB-15a, round 2 — a status workflow run as a decision over a command (`PlainLabels.workflow`,
   * `ExportModelOptions.readsObjects`). Two things, each only where the drawing allows it without a guess:
   *
   *   - **each arm that moves the status is one step, named as the move** ("Approve (Submitted → Approved)"): the
   *     arm's elements — its checks, its role check, its stops — go one level down into a sub-process of that name,
   *     with the arm's lines; an arm that draws one plain step is that step, renamed. An arm is wrapped only where its
   *     elements have one way in (the decision's arm) and one way on;
   *   - **a demo driver is not the process** (`WorkflowLabels.driver`): where a band of the top plane shows the
   *     driver's lines and nothing else, the workflow routine's plane takes their place between the band's start and
   *     end, and the driver's steps fold onto the start with their names and lines (`folded`) — the scenario that
   *     exercised the workflow, not a step of it.
   */
  private readWorkflow(root: ExportContainer, flow: WorkflowLabels): void {
    let workflow: ExportContainer | null = null;
    flow.steps.forEach((step, k) => {
      const placed = this.armGateway(step.line, step.decision);
      if (!placed || (workflow && placed.container !== workflow)) return;
      if (this.wrapArm(placed.container, placed.gateway, step, k)) workflow = placed.container;
    });
    if (workflow) this.foldEmptyDecisions(workflow);
    if (workflow && flow.driver) this.replaceDriver(root, workflow, flow.driver);
    // A workflow routine the program's entry only calls is the first level, as a lone method is (part 1).
    if (workflow) for (const band of [...root.bands]) this.liftLoneMethod(root, band, workflow);
    this.reindexContainers(root);
  }

  /**
   * See `readWorkflow`: on the workflow's plane, a decision whose every arm draws nothing and goes on to the same step
   * (`CASE verb. WHEN 'GRANT'. lv_desk = 'OFFICER'. … ENDCASE.` before a role check) decides nothing a reader
   * can see: it is folded into that step, its line kept there.
   */
  private foldEmptyDecisions(into: ExportContainer): void {
    for (const g of [...into.nodes]) {
      if (g.tag !== 'exclusiveGateway' || g.source.kind !== 'gateway') continue;
      const outs = into.flows.filter((f) => f.sourceId === g.id);
      const ins = into.flows.filter((f) => f.targetId === g.id);
      const targets = new Set(outs.map((f) => f.targetId));
      if (outs.length < 2 || targets.size !== 1 || ins.length !== 1 || outs.some((f) => f.back) || ins[0].back) continue;
      const next = into.nodes.find((n) => n.id === outs[0].targetId);
      if (!next || next === g) continue;
      const a = g.source.anchor;
      next.folded = [...(next.folded ?? []), { name: g.name, technicalName: g.technicalName, anchor: a ? (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`) : null }];
      ins[0].targetId = next.id;
      into.flows = into.flows.filter((f) => f.sourceId !== g.id);
      into.nodes = into.nodes.filter((n) => n !== g);
      for (const b of into.bands) b.nodeIds = b.nodeIds.filter((id) => id !== g.id);
      for (const n of into.nodes) {
        n.incoming = into.flows.filter((f) => f.targetId === n.id).map((f) => f.id);
        n.outgoing = into.flows.filter((f) => f.sourceId === n.id).map((f) => f.id);
      }
    }
  }

  /** The decision an arm belongs to: the gateway drawn at the arm's own line (an `ELSEIF`), else at its decision's. */
  private armGateway(line: number, decision: number): { container: ExportContainer; gateway: ExportNode } | null {
    for (const at of [line, decision]) {
      for (const container of this.containers) {
        const gateway = container.nodes.find((n) => n.tag === 'exclusiveGateway' && n.source.kind === 'gateway' && n.source.anchor?.lineStart === at);
        if (gateway) return { container, gateway };
      }
    }
    return null;
  }

  /** See `readWorkflow`: one arm of the command decision as one step. False where the drawing does not allow it. */
  private wrapArm(into: ExportContainer, gateway: ExportNode, step: WorkflowLabels['steps'][number], k: number): boolean {
    // A command that is a code (`WHEN 'A'.`) names no step: its arm stays as drawn, each move said where it is made.
    if (!step.said) return false;
    const byId = new Map(into.nodes.map((n) => [n.id, n]));
    const inArm = (n: ExportNode | undefined): n is ExportNode => {
      const a = n?.source.anchor;
      return !!n && n !== gateway && !!a && a.lineStart >= step.lineStart && a.lineStart <= step.lineEnd;
    };
    const entries = into.flows.filter((f) => f.sourceId === gateway.id && !f.back && inArm(byId.get(f.targetId)));
    if (!entries.length) return this.drawEmptyArm(into, gateway, step, k);
    if (entries.length !== 1) return false;
    const entry = entries[0];
    const members = new Set<string>();
    const queue = [entry.targetId];
    while (queue.length) {
      const id = queue.shift()!;
      if (members.has(id) || !inArm(byId.get(id))) continue;
      members.add(id);
      for (const f of into.flows) if (f.sourceId === id) queue.push(f.targetId);
      for (const b of into.nodes) if (b.attachedTo === id) queue.push(b.id);
    }
    const flowsIn = into.flows.filter((f) => members.has(f.targetId) && !members.has(f.sourceId));
    if (flowsIn.length !== 1 || flowsIn[0] !== entry) return false;
    const exits = into.flows.filter((f) => members.has(f.sourceId) && !members.has(f.targetId));
    const onTo = [...new Set(exits.map((f) => f.targetId))];
    if (onTo.length !== 1) return false;
    const moved = into.nodes.filter((n) => members.has(n.id));
    // An arm that moves nothing is wrapped only when it holds checks and stops alone — never a step that does something.
    if (!step.moves.length && moved.some((n) => ACTIVITY_TAGS.has(n.tag) && n.tag !== 'businessRuleTask')) return false;
    // One plain step in the arm: that step is the move — renamed, its code and lines kept.
    if (moved.length === 1 && ACTIVITY_TAGS.has(moved[0].tag) && !moved[0].inner) {
      moved[0].name = step.name;
      return true;
    }
    const band = into.bands[gateway.band] ?? into.bands[0];
    const id = `${gateway.id}__arm-${k + 1}`;
    const anchor = gateway.source.anchor ? { ...gateway.source.anchor, lineStart: step.lineStart, lineEnd: step.lineEnd } : null;
    const source: SkeletonNode = {
      ...gateway.source,
      id: `${gateway.source.id}#arm-${k + 1}`,
      kind: 'sub-process',
      label: step.technicalName,
      anchor,
      detail: { workflowStep: true, moves: step.moves.map((l) => `L${l}`) },
    };
    delete source.expandsTo;
    delete source.collapsed;
    const inner = this.container(id, 'subProcess');
    const event = (suffix: string, tag: 'startEvent' | 'endEvent', name: string, line: number): ExportNode => ({
      id: `${id}__${suffix}`,
      tag,
      name,
      technicalName: name,
      source: {
        ...source,
        id: `${source.id}#${suffix}`,
        kind: tag === 'startEvent' ? 'start' : 'end',
        label: name,
        anchor: anchor ? { ...anchor, lineStart: line, lineEnd: line } : null,
        detail: { subProcess: true },
      },
      error: false, incoming: [], outgoing: [], reads: [], writes: [], band: 0,
    });
    const start = event('start', 'startEvent', 'Start', step.lineStart);
    const end = event('end', 'endEvent', 'Done', step.lineEnd);
    const arm: ExportNode = {
      id,
      tag: 'subProcess',
      name: step.name,
      technicalName: step.technicalName,
      source,
      error: false,
      incoming: [],
      outgoing: [],
      reads: [...new Set(moved.flatMap((n) => n.reads))],
      writes: [...new Set(moved.flatMap((n) => n.writes))],
      band: gateway.band,
      anchorLabel: step.lineStart === step.lineEnd ? `L${step.lineStart}` : `L${step.lineStart}–${step.lineEnd}`,
      inner,
    };
    const mk = (fid: string, sourceId: string, targetId: string, like?: ExportFlow): ExportFlow => ({
      id: fid,
      sourceId,
      targetId,
      condition: like?.condition ?? '',
      edge: like ? { ...like.edge } : { from: sourceId, to: targetId, kind: 'sequence', condition: '' },
      back: false,
      ...(like?.label !== undefined ? { label: like.label } : {}),
    });
    // Inside: start → the arm's first element; every way on → the arm's end.
    for (const n of moved) n.band = 0;
    inner.nodes = [start, ...moved, end];
    inner.flows = [
      mk(`${id}__fl-start`, start.id, entry.targetId),
      ...into.flows.filter((f) => members.has(f.sourceId) && members.has(f.targetId)),
      ...exits.map((f, i) => mk(`${id}__fl-end-${i + 1}`, f.sourceId, end.id, f)),
    ];
    inner.bands = [{ key: `${band?.key ?? id}#arm-${k + 1}`, anchorId: id, nodeIds: inner.nodes.map((n) => n.id), entryId: start.id, endId: end.id }];
    // Outside: the decision's arm into the step, the step on to where the arm went on.
    entry.targetId = id;
    into.flows = [
      ...into.flows.filter((f) => !members.has(f.sourceId) && !members.has(f.targetId)),
      mk(`${id}__fl-on`, id, onTo[0]),
    ];
    const at = into.nodes.findIndex((n) => members.has(n.id));
    into.nodes = into.nodes.filter((n) => !members.has(n.id));
    into.nodes.splice(Math.min(at, into.nodes.length), 0, arm);
    for (const b of into.bands) {
      const first = b.nodeIds.findIndex((nid) => members.has(nid));
      if (first < 0) continue;
      b.nodeIds = b.nodeIds.filter((nid) => !members.has(nid));
      b.nodeIds.splice(first, 0, arm.id);
      if (b.endId && members.has(b.endId)) b.endId = arm.id;
    }
    for (const c of [into, inner]) {
      for (const n of c.nodes) {
        n.incoming = c.flows.filter((f) => f.targetId === n.id).map((f) => f.id);
        n.outgoing = c.flows.filter((f) => f.sourceId === n.id).map((f) => f.id);
      }
    }
    return true;
  }

  /**
   * See `readWorkflow`: an arm that moves the status but draws nothing (`WHEN 'CREATE'. ms_x-status = gc_new.`) — its
   * way out of the decision carries the arm's value — gets the move as a step of its own on that way, with the move's
   * lines. Only an arm with moves, and only where exactly one way out names its value.
   */
  private drawEmptyArm(into: ExportContainer, gateway: ExportNode, step: WorkflowLabels['steps'][number], k: number): boolean {
    if (!step.moves.length) return false;
    const names = (condition: string) => {
      const c = condition.trim();
      if (!c || /^NOT\b/i.test(c)) return false;
      return step.when.some((w) => (w.startsWith("'") ? c.toUpperCase().includes(w.toUpperCase()) : new RegExp(`(?:^|[^\\w/-])${w.replace(/[^\w/-]/g, '')}(?:$|[^\\w/-])`, 'i').test(c)));
    };
    const ways = into.flows.filter((f) => f.sourceId === gateway.id && !f.back && names(f.condition));
    if (ways.length !== 1) return false;
    const way = ways[0];
    const first = Math.min(...step.moves);
    const last = Math.max(...step.moves);
    const anchor = gateway.source.anchor ? { ...gateway.source.anchor, lineStart: first, lineEnd: last } : null;
    const id = `${gateway.id}__arm-${k + 1}`;
    const source: SkeletonNode = { ...gateway.source, id: `${gateway.source.id}#arm-${k + 1}`, kind: 'task', label: step.technicalName, anchor, detail: { workflowStep: true, moves: step.moves.map((l) => `L${l}`) } };
    delete source.expandsTo;
    delete source.collapsed;
    const task: ExportNode = {
      id, tag: 'task', name: step.name, technicalName: step.technicalName, source, error: false, incoming: [], outgoing: [], reads: [], writes: [],
      band: gateway.band, anchorLabel: step.moves.map((l) => `L${l}`).join(', '),
    };
    const on: ExportFlow = { id: `${id}__fl-on`, sourceId: id, targetId: way.targetId, condition: '', edge: { from: source.id, to: way.edge.to, kind: 'sequence', condition: '' }, back: false };
    way.targetId = id;
    into.flows.push(on);
    into.nodes.splice(into.nodes.indexOf(gateway) + 1, 0, task);
    const band = into.bands[gateway.band] ?? into.bands[0];
    if (band) band.nodeIds.splice(Math.max(0, band.nodeIds.indexOf(gateway.id) + 1), 0, id);
    for (const n of into.nodes) {
      n.incoming = into.flows.filter((f) => f.targetId === n.id).map((f) => f.id);
      n.outgoing = into.flows.filter((f) => f.sourceId === n.id).map((f) => f.id);
    }
    return true;
  }

  /**
   * See `readWorkflow`: the driver's band of the top plane gives way to the workflow routine's plane. Only where every
   * element of that band between its start and end stands in the driver's lines, the workflow's plane sits under one
   * of them, and the plane opens with one flow from its start.
   */
  private replaceDriver(root: ExportContainer, workflow: ExportContainer, driver: NonNullable<WorkflowLabels['driver']>): void {
    if (workflow === root || workflow.bands.length !== 1) return;
    // The top-level element the workflow's plane sits under.
    let top: ExportNode | null = null;
    let c: ExportContainer | undefined = workflow;
    for (let guard = 0; c && guard < 50; guard++) {
      const o = this.owner.get(c.id);
      if (!o) break;
      if (o.parent === root) { top = o.node; break; }
      c = o.parent;
    }
    if (!top) return;
    const band = root.bands[top.band];
    if (!band?.entryId || !band.endId) return;
    const start = root.nodes.find((n) => n.id === band.entryId && n.tag === 'startEvent');
    const end = root.nodes.find((n) => n.id === band.endId && n.tag === 'endEvent');
    if (!start || !end) return;
    const driven = root.nodes.filter((n) => band.nodeIds.includes(n.id) && n !== start && n !== end);
    const steps = driven.filter((n) => ACTIVITY_TAGS.has(n.tag));
    const inDriver = (n: ExportNode) => {
      const a = n.source.anchor;
      return !!a && a.lineStart >= driver.lineStart && a.lineEnd <= driver.lineEnd;
    };
    if (!steps.length || !driven.every(inDriver)) return;
    const wBand = workflow.bands[0];
    const wStart = workflow.nodes.find((n) => n.id === wBand.entryId && n.tag === 'startEvent');
    const wEnd = workflow.nodes.find((n) => n.id === wBand.endId && n.tag === 'endEvent');
    if (!wStart || !wEnd) return;
    const opening = workflow.flows.filter((f) => f.sourceId === wStart.id);
    if (opening.length !== 1 || opening[0].condition) return;

    // The driver's steps, with their names and lines, on the start: the scenario around the workflow.
    const anchorOf = (n: ExportNode) => {
      if (n.anchorLabel) return n.anchorLabel;
      const a = n.source.anchor;
      return a ? (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`) : null;
    };
    start.folded = [...(start.folded ?? []), ...steps.map((n) => ({ name: n.name, technicalName: n.technique || n.technicalName, anchor: anchorOf(n) }))];
    const calls = driver.calls.lines.map((l) => `L${l}`).join(', ');
    start.detail = [start.detail, `The program runs this workflow from a demo driver (L${driver.lineStart}–${driver.lineEnd}) that sends it test commands (${calls}); the driver's set-up, test helpers and output are listed here and are not steps of the process.`].filter(Boolean).join(' ');

    const gone = new Set(driven.map((n) => n.id));
    const moved = workflow.nodes.filter((n) => n !== wStart && n !== wEnd);
    const bandIndex = root.bands.indexOf(band);
    for (const n of moved) n.band = bandIndex;
    for (const f of workflow.flows) {
      if (f.sourceId === wStart.id) f.sourceId = start.id;
      if (f.targetId === wEnd.id) f.targetId = end.id;
    }
    root.flows = [
      ...root.flows.filter((f) => !gone.has(f.sourceId) && !gone.has(f.targetId) && !(f.sourceId === start.id && f.targetId === end.id)),
      ...workflow.flows,
    ];
    root.nodes = root.nodes.filter((n) => !gone.has(n.id));
    root.nodes.splice(root.nodes.indexOf(start) + 1, 0, ...moved);
    band.nodeIds = [start.id, ...moved.map((n) => n.id), ...band.nodeIds.filter((id) => id !== start.id && !gone.has(id))];
    root.storeRefs.push(...workflow.storeRefs);
    root.dataAssociations.push(...workflow.dataAssociations);
    root.annotations.push(...workflow.annotations);
    for (const n of root.nodes) {
      n.incoming = root.flows.filter((f) => f.targetId === n.id).map((f) => f.id);
      n.outgoing = root.flows.filter((f) => f.sourceId === n.id).map((f) => f.id);
    }
  }

  /** The planes again from the top, after elements moved between them: root first, then depth first; owners anew. */
  private reindexContainers(root: ExportContainer): void {
    const order: ExportContainer[] = [];
    this.owner.clear();
    const walk = (c: ExportContainer) => {
      order.push(c);
      for (const n of c.nodes) {
        if (!n.inner) continue;
        this.owner.set(n.inner.id, { node: n, parent: c });
        walk(n.inner);
      }
    };
    walk(root);
    this.containers = order;
  }

  /** See `ExportModelOptions.foldTechnique`. */
  private foldTechniqueSteps(into: ExportContainer, band: ExportBand, local: Map<string, ExportNode>): void {
    // 3.1.0: the call of a technical helper the engine draws as an arm's outcome (`detail.helperCall`) is technique too
    // when it writes a log (`PERFORM add_log`) — folded where it stands in a straight run; an arm's only step stays.
    const isTechnique = (n: ExportNode) => TECHNIQUE_CALL.test(n.technicalName.replace(/^\/\w+\//, ''))
      || (n.source.detail?.helperCall === true && LOG_HELPER.test(String(n.source.detail?.routine ?? n.technicalName)))
      // AB-15a: the call of a technical method (constructor, getter, setter, show) drawn as one step.
      || (this.objects && isTechnicalMethodStep(n));
    const plain = (n: ExportNode) => ACTIVITY_TAGS.has(n.tag) && !n.inner && n.tag !== 'subProcess' && !n.attachedTo
      && !guardOf(n) && !into.nodes.some((b) => b.attachedTo === n.id);
    // The same words as `anchorText` in layout.ts, which imports this file.
    const anchorOf = (n: ExportNode) => {
      if (n.anchorLabel) return n.anchorLabel;
      const a = n.source.anchor;
      return a ? (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`) : null;
    };
    for (let guard = 0; guard < 500; guard++) {
      const flowById = new Map(into.flows.map((f) => [f.id, f]));
      const byId = new Map(into.nodes.map((n) => [n.id, n]));
      let pair: { keep: ExportNode; drop: ExportNode; via: ExportFlow } | null = null;
      for (const a of into.nodes) {
        if (!plain(a) || a.outgoing.length !== 1) continue;
        const via = flowById.get(a.outgoing[0]);
        if (!via || via.back || via.condition || via.bypassOf || via.runtimeOrder) continue;
        const b = byId.get(via.targetId);
        if (!b || b === a || !plain(b) || b.incoming.length !== 1 || b.id === band.entryId) continue;
        if (a.name === b.name) pair = { keep: a, drop: b, via };
        else if (isTechnique(a) && !isTechnique(b)) pair = { keep: b, drop: a, via };
        else if (isTechnique(b) && !isTechnique(a)) pair = { keep: a, drop: b, via };
        if (pair) break;
      }
      if (!pair) return;
      const { keep, drop, via } = pair;
      const ordered = byId.get(via.sourceId) === keep ? [keep, drop] : [drop, keep];
      keep.anchorLabel = ordered.map(anchorOf).filter(Boolean).join(', ') || undefined;
      keep.folded = [...(keep.folded ?? []), ...(drop.folded ?? []), { name: drop.name, technicalName: drop.technique || drop.technicalName, anchor: anchorOf(drop) }];
      keep.reads = [...new Set([...keep.reads, ...drop.reads])];
      keep.writes = [...new Set([...keep.writes, ...drop.writes])];
      into.flows = into.flows.filter((f) => f.id !== via.id);
      for (const f of into.flows) {
        if (f.sourceId === drop.id) f.sourceId = keep.id;
        if (f.targetId === drop.id) f.targetId = keep.id;
      }
      into.nodes = into.nodes.filter((n) => n !== drop);
      band.nodeIds = band.nodeIds.filter((id) => id !== drop.id);
      if (band.entryId === drop.id) band.entryId = keep.id;
      if (band.endId === drop.id) band.endId = keep.id;
      local.delete(drop.source.id);
      for (const n of into.nodes) {
        n.incoming = into.flows.filter((f) => f.targetId === n.id).map((f) => f.id);
        n.outgoing = into.flows.filter((f) => f.sourceId === n.id).map((f) => f.id);
      }
    }
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
   *
   * **Which flows (roadmap 3.0.7, MM case review).** The skeleton
   * decides the run order (`chainReportEvents`), and this draws exactly its
   * flows (`this.runOrder`) — no flow of its own. So only an early end ends the
   * run: a block's normal end hands over to the next block; `RETURN`/`EXIT` in
   * `AT SELECTION-SCREEN` leave the block and the run goes on; `STOP` goes on
   * with `END-OF-SELECTION` (`reason: 'stop'`); `EXIT` in
   * `START-OF-SELECTION`, an error message, a `SUBMIT` that does not return end
   * it and get no flow. An early end that goes on is no end any more: it
   * becomes a throw event on its own line with a flow on, so its anchor stays.
   *
   * **Which blocks.** The reporting events of the run, `LOAD-OF-PROGRAM` up to
   * `END-OF-SELECTION`, merged into the first band. Until 3.0.7 one callback,
   * list event or dialog module among the entries switched the chaining off
   * altogether, and the event blocks of a report with an ALV callback stood
   * unconnected side by side; those entries now keep a band of their own each,
   * after the run — something else raises them, not the end of a block.
   */
  private chainEntries(root: ExportContainer): void {
    const byId = new Map(root.nodes.map((n) => [n.id, n]));
    const runBands = root.bands.filter((band) => isRunEvent(band.entryId ? byId.get(band.entryId)?.source : undefined));
    if (runBands.length < 2) {
      this.droppedEdges += this.runOrder.length;
      return;
    }

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

    // The skeleton's run order, between nodes of the top plane.
    let links = this.runOrder
      .filter((edge) => byId.has(edge.from) && byId.has(edge.to))
      .map((edge) => ({ from: edge.from, to: edge.to, edge }));
    this.droppedEdges += this.runOrder.length - links.length;

    // Blocks that draw nothing: start → end, and nothing else. What led into
    // one leads on to where it led; a block that leads nowhere ends the run.
    const empty = runBands.filter((band) => band.nodeIds.filter((id) => byId.has(id)).length <= 2);
    if (empty.length === runBands.length) empty.shift();
    for (const band of empty) {
      const own = new Set(band.nodeIds);
      const ins = links.filter((l) => !own.has(l.from) && own.has(l.to));
      const outs = links.filter((l) => own.has(l.from) && !own.has(l.to));
      links = links.filter((l) => !own.has(l.from) && !own.has(l.to));
      for (const i of ins) for (const o of outs) links.push({ from: i.from, to: o.to, edge: i.edge });
      for (const f of root.flows.filter((f) => own.has(f.sourceId) || own.has(f.targetId))) dropFlow(f.id);
      band.nodeIds.filter((id) => byId.has(id)).forEach(drop);
    }
    const seenLinks = new Set<string>();
    links = links.filter((l) => {
      const key = `${l.from}>${l.to}`;
      if (seenLinks.has(key)) return false;
      seenLinks.add(key);
      return true;
    });
    const kept = runBands.filter((band) => !empty.includes(band));

    const addFlow = (from: ExportNode, to: ExportNode, edge: SkeletonEdge) => {
      const flowEdge: SkeletonEdge = { ...edge, from: from.source.id, to: to.source.id };
      const flow: ExportFlow = {
        id: `fl-${from.id}-${to.id}`,
        sourceId: from.id,
        targetId: to.id,
        condition: '',
        edge: flowEdge,
        back: false,
        label: this.labels ? this.labels.flow(flowEdge) : undefined,
        runtimeOrder: true,
      };
      root.flows.push(flow);
      from.outgoing.push(flow.id);
      to.incoming.push(flow.id);
    };

    for (const band of kept) {
      const start = band.entryId ? byId.get(band.entryId) : undefined;
      if (!start) continue;
      const ins = links.filter((l) => l.to === start.id);
      if (!ins.length) continue;
      const outOf = root.flows.filter((f) => f.sourceId === start.id);
      const only = ins.length === 1 ? byId.get(ins[0].from) : undefined;
      const intoOnly = only ? root.flows.filter((f) => f.targetId === only.id) : [];
      if (only && only.tag === 'endEvent' && !isEarlyEnd(only.source)
        && intoOnly.length === 1 && outOf.length === 1 && !outOf[0].condition) {
        // Join directly: the flow into the end now leads to the first step of the next block.
        const flow = intoOnly[0];
        const target = byId.get(outOf[0].targetId) as ExportNode;
        only.incoming = only.incoming.filter((x) => x !== flow.id);
        flow.targetId = target.id;
        flow.edge = { ...flow.edge, to: target.source.id, reason: flow.edge.reason ?? undefined };
        target.incoming.push(flow.id);
        dropFlow(outOf[0].id);
        drop(only.id);
        drop(start.id);
        flow.runtimeOrder = true;
        continue;
      }
      // One milestone where the blocks meet.
      start.tag = 'intermediateThrowEvent';
      for (const link of ins) {
        const from = byId.get(link.from);
        if (!from) continue;
        if (isEarlyEnd(from.source)) {
          // `STOP`, or `RETURN` in `AT SELECTION-SCREEN`: the block is left
          // and the run goes on — an event on its own line, not an end.
          from.tag = 'intermediateThrowEvent';
          if (this.labels) from.name = 'Skips the rest of this block';
          addFlow(from, start, link.edge);
          continue;
        }
        for (const flow of root.flows.filter((f) => f.targetId === from.id)) {
          flow.targetId = start.id;
          start.incoming.push(flow.id);
        }
        drop(from.id);
      }
    }

    const live = (band: ExportBand) => band.nodeIds.filter((id) => byId.has(id));
    const last = kept[kept.length - 1];
    const merged: ExportBand = {
      key: kept.map((b) => b.key).join('+'),
      anchorId: kept[0].anchorId,
      nodeIds: kept.flatMap(live),
      entryId: kept[0].entryId && byId.has(kept[0].entryId) ? kept[0].entryId : null,
      endId: last.endId && byId.has(last.endId) ? last.endId : null,
    };
    // The run first, then every entry something else raises, in its own band.
    const others = root.bands.filter((band) => !runBands.includes(band));
    root.bands = [merged, ...others];
    const bandOf = new Map<string, number>();
    root.bands.forEach((band, i) => band.nodeIds.forEach((id) => bandOf.set(id, i)));
    const merging = new Set(merged.nodeIds);
    root.nodes = [...root.nodes.filter((n) => merging.has(n.id)), ...root.nodes.filter((n) => !merging.has(n.id))];
    for (const n of root.nodes) n.band = bandOf.get(n.id) ?? 0;
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

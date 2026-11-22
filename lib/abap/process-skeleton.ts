import { afterKeyword, maskLiterals, withParsedSource, type AbapStatement, type SourceRange } from './statement-reader';
import { type Block, type BlockStructure } from './block-structure';
import { type Branch, type ControlFlowReport } from './control-flow';
import { type CallGraphReport } from './call-graph';
import { readDecisionTable } from './decision-table';
import { buildProcessFacts, type ProcessFacts } from './process-facts';
import { type LuwEvent, type UpdateRegistration } from './luw-states';
import { type BatchInputCall } from './batch-input';
import { engineReads310Apply } from './engine-reads-310-gate';
import { engineReads320Apply } from './engine-reads-320-gate';
import { APP_VERSION } from '../version';
import { SkeletonGraph, type Exit, type SkeletonReadings } from './skeleton/graph';
import { anchorOf, bodyRange, snippet, tokenIndexOf } from './skeleton/anchors';
import { buildLanes } from './skeleton/lanes';
import { FLOW_BLOCKS } from './skeleton/keywords';
import { noteWhatIsNotRead } from './skeleton/source-notes';
import { readDeclarations, type MethodImpl } from './skeleton/declarations';
import { readEffects } from './skeleton/effects';
import { MethodDispatch } from './skeleton/dispatch';
import { CANDIDATE_TRIGGER, EntryReader, type EntryPoint } from './skeleton/entries';
import { WalkReaders } from './skeleton/walk-readers';
import {
  BUILDS_TABLE,
  BUILT_IN_FLAG_VALUES,
  COLLECT_TARGET,
  FLAG_ASSIGNMENT,
  MESSAGE_ROW,
  selectTables,
} from './skeleton/recognisers';
import { settleEarlyEnds } from './skeleton/early-ends';
import { newWalkState, type WalkState } from './skeleton/walk/state';
import type { WalkContext, Walker } from './skeleton/walk/walker';
import { walkStatement } from './skeleton/walk/statement';
import { walkParallel } from './skeleton/walk/parallel';
import { walkMethodCalls } from './skeleton/walk/calls';
import { callbackEntry } from './skeleton/walk/callbacks';
import { classOf } from './skeleton/statement-readers';
import { chainReportEvents } from './skeleton/report-chain';
import { addSubProcessStarts, markEmptyEntries } from './skeleton/starts';
import { noteUnreachableSteps } from './skeleton/unreachable-notes';
import { attachLuwStates } from './skeleton/luw';
import { notDrawn } from './skeleton/not-drawn';
import { foldTechnicalGateways } from './skeleton/technical-gateways';
import { applyGuards } from './skeleton/guards';
import { collapseSmallRegions } from './skeleton/collapse';

/**
 * The process skeleton — roadmap 2.3.
 *
 * Steps, decisions, starts and ends, read out of the branches of 2.1 and the
 * calls of 2.2. The module is a pure function of the parsed statements and
 * makes no model call; its output is the process map in the technical names the
 * code itself uses. The palette is the
 * one in `DESIGN.md` §5.8 and nothing beyond it — a kind that no row of that
 * table names is a kind this file does not emit.
 *
 * Seven rules carry it. They came out of the reference corpus and each of them
 * costs work, so each is named where it is implemented:
 *
 * 1. **Every node carries a line range, or says it has none.** `anchor` is
 *    `null` exactly when the source does not support one, and `unanchoredReason`
 *    then says why in words. `anchoredNodes`/`unanchoredNodes` is the quote the
 *    acceptance of Phase 2 asks for (V25-A01).
 * 2. **The anchor is a statement, plus a token offset where one node of several
 *    sits inside one statement.** Chains are already separate statements, so
 *    `PERFORM: a, b, c.` is three nodes and not one. A macro is the exception the
 *    other way round: its effect belongs to the **call site**, and the body it
 *    came from is a `secondary` anchor, never the anchor itself.
 * 3. **An opaque call stays opaque, and the caller goes on.** A `PERFORM` into a
 *    program this source does not contain is a `call-opaque` node — and the flow
 *    continues after it, because `CALL TRANSACTION`, a synchronous RFC and
 *    `SUBMIT … AND RETURN` all come back. Only `SUBMIT` without `AND RETURN` and
 *    `LEAVE TO TRANSACTION` do not, and those two end the flow.
 * 4. **The classic event blocks are the starts**, in the order they run and not
 *    in the order they are written. A report without `START-OF-SELECTION` still
 *    has a skeleton: its program-level statements are the implicit one.
 * 5. **`CHECK` has three different targets.** In an event block it leaves the
 *    block, in a `LOOP` it ends the iteration, in a `FORM` it leaves the routine
 *    — three edges with three reasons, not one edge with three meanings.
 * 6. **Nothing is invented.** Every label is a token out of the source: a
 *    routine name, a function module, a table, a transaction code, an event
 *    keyword. No people, no approval step read off a status field, no activity
 *    that is not written down.
 * 7. **Two nodes never collide.** Identity is the **statement index plus a
 *    slot**, never the pair of kind and line: `IF sy-subrc = 0. x = 1. ENDIF.`
 *    is three statements on one line, and a `CALL FUNCTION … EXCEPTIONS` is two
 *    nodes — the service task and its error boundary — inside one statement.
 *    Kind and line cannot tell either pair apart; `<statementIndex>-<slot>` can.
 *
 * This file draws nothing. 2.3 is the reconstruction; the BPMN view is 2.5 and
 * the export 2.6. It imports neither of them, nor any code that creates or signs
 * a run.
 */

/**
 * The palette of `DESIGN.md` §5.8, restricted to what this reader can prove from
 * the code alone. Inclusive, complex and event-based gateways, compensation,
 * escalation and choreography are deliberately absent from that table too.
 *
 * Parallel gateways, timer and message intermediate events, pools and data
 * stores are in the table but not among these kinds: a pool needs the message
 * flows of 2.5. This file emits only what a statement proves.
 *
 * **Lanes are here, and they are not a node kind.** Since 2.16 a lane is
 * reconstructed from four kinds of evidence in the code and carried beside the
 * graph in `ProcessSkeleton.lanes` — a lane is not a step, it says who performs
 * the steps. See `buildLanes`.
 */
export type SkeletonNodeKind =
  /**
   * Start event — a classic event block, or the implicit `START-OF-SELECTION`;
   * since ADR-054 also the beginning of a routine that is drawn as a plane of
   * its own (`detail.subProcess`), anchored at its `FORM`/`METHOD` line and
   * living only inside that plane. See `addSubProcessStarts`.
   */
  | 'start'
  /**
   * End event — the normal end of an entry or of a sub-process, anchored at its
   * closing word; since ADR-054 also an **early** end (`detail.early`): a
   * `RETURN`, an `EXIT` outside a loop or a `STOP` that leaves the block while
   * something drawn would still have followed. See `leaveEarly`.
   */
  | 'end'
  /** Error end event — `MESSAGE … TYPE 'E'/'A'/'X'`, `RAISE` of an exception (not `RAISE EVENT`), `LEAVE PROGRAM`. */
  | 'end-error'
  /** Exclusive gateway — `IF`, `CASE`, and a `CHECK` that is not a run switch. */
  | 'gateway'
  /**
   * Parallel gateway — roadmap 2.17 (a). Two or more `STARTING NEW TASK` calls
   * that the source proves are waited for or answered: a fork before them, and
   * a join at the `WAIT UNTIL` when the source writes one. `detail.direction`
   * says which of the two this node is. Never a decision: it carries no
   * condition, and `lib/first-look.ts` and `lib/ask-this-case.ts` count
   * decisions by the kind `gateway`, which is why this is a kind of its own and
   * not a `gateway` with a flag on it.
   */
  | 'parallel-gateway'
  /**
   * Loop drawn as a cycle — `DO`, `WHILE`, `SELECT … ENDSELECT`, and a `LOOP AT`
   * whose body leaves the block (`EXIT`, `RETURN`, an error end). A `LOOP AT`
   * whose body stays inside it is drawn as a multi-instance activity instead:
   * same kind, `detail.multiInstance` set, and `expandsTo` the region that holds
   * the body — roadmap 2.17 (b), see `walkLoop`.
   */
  | 'loop'
  /** Collapsed sub-process — a `FORM` with an effect of its own. */
  | 'sub-process'
  /** Call activity — `SUBMIT`, a `PERFORM` into another program. */
  | 'call-activity'
  /** Call activity whose called element is a transaction — `CALL TRANSACTION`. */
  | 'transaction'
  /** A call whose source this reader does not have, and will not guess at. */
  | 'call-opaque'
  /** A step with an effect and no type of its own. */
  | 'task'
  /** Service task — `CALL FUNCTION`, local or remote. */
  | 'service-task'
  /** Send task — mail, IDoc outbound, workflow event. */
  | 'send-task'
  /** User task — a human acts: `CALL SCREEN`, a popup, an ALV list. */
  | 'user-task'
  /** Business rule task — a routine that classifies or scores from literals. */
  | 'business-rule-task'
  /** Data store, read — Open SQL `SELECT`. */
  | 'read'
  /** Data store, written — Open SQL `INSERT`/`UPDATE`/`MODIFY`/`DELETE`. */
  | 'write'
  /** Data object — a file, or the result list. */
  | 'output'
  /** Error boundary event — a handled exception on the activity it hangs on. */
  | 'error-boundary';

export interface NodeAnchor extends SourceRange {
  /** The statement this node was read from. Half of the node's identity. */
  statementIndex: number;
  /**
   * 0-based index of the token inside that statement where the evidence begins.
   * 0 for a node that is the whole statement; the `EXCEPTIONS` token for an
   * error boundary; the table name for a read or a write.
   */
  tokenOffset: number;
  /**
   * Where the text that produced this node is written, when that is not where it
   * takes effect. Set for a macro — the effect is at the call site (rule 2) and
   * the `DEFINE` body is this — and for a `PERFORM`, whose anchor is the call and
   * whose routine is this.
   */
  secondary?: SourceRange & { reason: 'macro-definition' | 'routine-definition' };
}

export interface SkeletonNode {
  /**
   * `nd-<statementIndex>-<slot>`, or `nd-x-<n>` for a node with no anchor.
   *
   * Rule 7: the identity is the statement and the slot inside it. Kind and line
   * are not an identity — `COND #( … )` puts two arms on one line, a chain puts
   * several statements on one, and `CALL FUNCTION … EXCEPTIONS` puts two nodes
   * inside one statement.
   */
  id: string;
  kind: SkeletonNodeKind;
  /** A token out of the source. Never a phrase this engine made up (rule 6). */
  label: string;
  /** `null` exactly when the source supports no range (rule 1). */
  anchor: NodeAnchor | null;
  /** Why there is no anchor. Set exactly when `anchor` is null. */
  unanchoredReason?: string;
  /** The region this node belongs to — an entry, or a sub-process. */
  region: string;
  /** Upper-cased routine or event block the statement sits in. */
  container: string | null;
  /** The region a call-site node opens, when it opens one. */
  expandsTo?: string;
  /**
   * True for a sub-process small enough to be one step: `DESIGN.md` §5.8 draws a
   * `FORM` as a collapsed sub-process only above three elements. Below that the
   * call site takes the kind of the one thing the routine does, and the region
   * stays readable underneath it.
   */
  collapsed?: boolean;
  /** Everything else this node proves, all of it read off the statement. */
  detail?: Record<string, string | number | boolean | string[]>;
}

export type SkeletonEdgeKind =
  | 'sequence'
  | 'conditional'
  | 'default'
  | 'loop-back'
  | 'boundary';

/**
 * Why a flow leaves where it leaves. The three `check-*` reasons are rule 5: the
 * same keyword with three different targets is three different edges.
 */
export type SkeletonEdgeReason =
  | 'check-leaves-event'
  | 'check-leaves-loop'
  | 'check-leaves-form'
  | 'exit-loop'
  | 'continue-loop'
  | 'return'
  | 'stop'
  /** `LEAVE SCREEN`, `LEAVE TO SCREEN n`, `LEAVE LIST-PROCESSING` — see `leavesDialogStep`. */
  | 'leave-screen'
  | 'no-return'
  | 'abort'
  /**
   * Roadmap 3.0.7 — the flow from the end of one reporting event block into the
   * start of the next one ABAP raises in the same run (`chainReportEvents`).
   * The language's runtime order, not a statement of the source.
   */
  | 'runtime-order';

export interface SkeletonEdge {
  from: string;
  to: string;
  kind: SkeletonEdgeKind;
  /** The condition as the source writes it. Empty for an unconditional flow. */
  condition: string;
  reason?: SkeletonEdgeReason;
}

export type RegionKind = 'entry' | 'sub-process';

export interface SkeletonRegion {
  /** `entry:START-OF-SELECTION@161` or `form:DECIDE_ACTIONS`. */
  key: string;
  kind: RegionKind;
  /** The event keyword or the routine name, as the source writes it. */
  label: string;
  anchor: NodeAnchor | null;
  /** Runtime rank for an entry — the order ABAP runs the event blocks in. */
  runtimeRank?: number;
  /** The node every path in this region ends at. */
  endNodeId: string;
  /** The first node of the region, when it has one. */
  entryNodeId: string | null;
  /**
   * A leading `CHECK` on selection-screen switches only. `DESIGN.md` §5.8 draws
   * it as a **conditional flow** into the region, not as a gateway of its own.
   */
  guard?: { condition: string; anchor: NodeAnchor };
  /** Effects that make this routine a step rather than a technical helper. */
  effects?: FormEffect[];
  /**
   * The body of a `LOOP AT` drawn as a multi-instance activity — roadmap 2.17
   * (b). It is a region like a routine's, so everything downstream draws it as
   * a collapsed sub-process without knowing what opened it; the flag is what
   * keeps `collapseSmallRegions` from dissolving the marker back into one step.
   */
  multiInstance?: boolean;
  /**
   * Engine 3.1.0 (`markEmptyEntries`): an entry that draws nothing between its start and its end — an empty BAdI
   * method, a screen module that only sets its status. The business reading leaves it out (`lib/bpmn/model.ts`);
   * the technical reading and every anchor keep it. Never set on a reporting event block, which hands over to
   * the next one.
   */
  drawsNothing?: boolean;
}

export type FormEffect =
  | 'write'
  /**
   * Roadmap 3.0.7: the routine changes an internal table of this program
   * (`MODIFY gt_out FROM ls_out`, `DELETE lt_rows WHERE …`). It keeps the
   * routine a step exactly as the old `write` did — a calculation routine is a
   * step of the process — but it is no database effect and no SAP data store.
   */
  | 'compute'
  | 'read'
  | 'call'
  | 'human'
  | 'file'
  | 'error'
  | 'authority'
  | 'business-rule';

/* ------------------------------------------------------------------ *
 * Lanes — roadmap 2.16
 * ------------------------------------------------------------------ */

/**
 * The four kinds of evidence 2.16 accepts for *who acts*, and nothing else.
 *
 * - `authority` — `AUTHORITY-CHECK OBJECT x`. The one place ABAP names an actor
 *   **outside** the program: the person whose authorisation is being checked.
 *   One lane per **distinct** object.
 * - `human` — `CALL SCREEN`, a dynpro, a popup, an ALV display. A person acts
 *   inside the program, so the run is a dialogue run.
 * - `system` — `IN UPDATE TASK`, `IN BACKGROUND TASK`, `VIA JOB`. The run is
 *   handed to a work process nobody sits in front of.
 * - `foreign-system` — `DESTINATION`. Recorded, and deliberately **not** a lane:
 *   another system is a collapsed pool (`DESIGN.md` §5.8), which `lib/bpmn/model.ts`
 *   already draws.
 */
export type LaneEvidenceKind = 'authority' | 'human' | 'system' | 'foreign-system';

/** One statement that says who acts, with the token it says it in. */
export interface LaneEvidence {
  kind: LaneEvidenceKind;
  /** The token as the source writes it, upper-cased. Never a phrase (rule 6). */
  token: string;
  anchor: NodeAnchor;
  /** The keyword this was read from — `AUTHORITY-CHECK`, `CALL FUNCTION`, … */
  statement: string;
}

/**
 * What a lane can be. `program` is the lane of the run itself, the one every
 * flow node sits in; the other three are named by the evidence that produced
 * them.
 */
export type SkeletonLaneKind = 'program' | 'authority' | 'human' | 'system';

export interface SkeletonLane {
  /** `lane-1`, `lane-2`, … in the order the lanes are emitted. */
  id: string;
  kind: SkeletonLaneKind;
  /**
   * The evidence token for an `authority` lane (`V_VBAK_VKO`), the program
   * name for a `program` lane, and since 3.0.7 the role for the run lane —
   * `User` (`human`) or `System` (`system`), the token that proved it staying
   * in `evidence`. Never a job title and never a word from a list: §8 of the
   * roadmap forbids role mandates, and `tests/process-naming.spec.ts` ("CFO is
   * rejected") holds for a deterministic lane too. Empty exactly when the source
   * offers no token at all, and `unnamedReason` then says so.
   */
  name: string;
  unnamedReason?: string;
  /** Always set. A lane without a line anchor is not emitted (2.16). */
  anchor: NodeAnchor;
  /** Every statement behind this lane, in source order. Empty for a bare `program` lane. */
  evidence: LaneEvidence[];
  /**
   * The skeleton nodes this lane holds. Empty for an `authority` lane on
   * purpose: `DESIGN.md` §5.8 calls that actor *"reviewer (outside the
   * program)"* — the checker does not execute a statement of this program, and
   * saying they do would be a sentence the source does not contain.
   */
  nodeIds: string[];
  /** 2.16: reconstructed from the code, never *AI-generated*, never confirmed. */
  status: 'reconstructed';
}

/** Above this many lanes no further evidence opens one (2.16, "with an upper limit"). */
export { MAX_LANES } from './skeleton/lanes';

export interface FoldedForm {
  name: string;
  lineStart: number;
  lineEnd: number;
  /** How many `PERFORM`s named it. */
  callSites: number;
}

export interface CloneGroup {
  /** The routines built the same way, in source order. */
  names: string[];
  lineStart: number;
  lineEnd: number;
  /** What the group has in common, in one line of technical description. */
  shape: string;
}

export interface UnreachedRegion {
  name: string;
  kind: 'form' | 'module';
  lineStart: number;
  lineEnd: number;
}

export type SkeletonNoteReason =
  | 'include-not-read'
  | 'native-sql'
  | 'macro-call'
  | 'dynamic-call'
  | 'chained-branch'
  | 'unterminated-container'
  | 'unreachable-after-abort'
  | 'commit-boundary'
  | 'no-entry-point'
  | 'entry-not-applicable'
  | 'entry-trigger-not-determined'
  | 'fork-without-join'
  | 'expansion-depth-reached';

export interface SkeletonNote extends SourceRange {
  reason: SkeletonNoteReason;
  detail: string;
  snippet: string;
}

export interface ProcessSkeleton {
  nodes: SkeletonNode[];
  edges: SkeletonEdge[];
  regions: SkeletonRegion[];
  /**
   * Who acts — roadmap 2.16. Exactly one lane when the source proves nothing,
   * never more lanes than there are **distinct** pieces of evidence, and every
   * one of them with a line anchor.
   */
  lanes: SkeletonLane[];
  /**
   * Every piece of lane evidence the walk saw, in source order — including the
   * `DESTINATION` evidence that stays a pool and anything past `MAX_LANES`. It
   * is here so that "this lane was not drawn" is visible rather than silent.
   */
  laneEvidence: LaneEvidence[];
  /** Entry region keys in **runtime** order, which is not source order (rule 4). */
  entries: string[];
  /** What §5.8 says instead of drawing it. */
  notDrawn: {
    unreached: UnreachedRegion[];
    unreachedLines: number;
    technicalHelpers: FoldedForm[];
    clones: CloneGroup[];
  };
  /** Nodes with a line range, and nodes visibly without one (rule 1). */
  anchoredNodes: number;
  unanchoredNodes: number;
  /** What the reader saw and would not guess at. */
  notes: SkeletonNote[];
  /**
   * Wirkungsstatus — roadmap 2.12 (CR-06). `IN UPDATE TASK` is a registration,
   * `COMMIT WORK` dispatches it, `ROLLBACK WORK` discards it, and a whole
   * program that ends without either leaves it orphaned. States of the model,
   * each with its line; the views condense them and never drop them. See
   * `luw-states.ts`.
   */
  luw: SkeletonLuw;
}

/** A registration, and the node it was drawn as — `null` when no entry reaches it. */
export type SkeletonUpdateRegistration = UpdateRegistration & { nodeId: string | null };

export interface SkeletonLuw {
  registrations: SkeletonUpdateRegistration[];
  events: LuwEvent[];
}

/* ------------------------------------------------------------------ *
 * Keyword tables. Every one of them decides a kind out of §5.8, and
 * every one is a list of words the source may contain — never a guess
 * about what the program means.
 * ------------------------------------------------------------------ */

/**
 * How many `PERFORM`s deep the walk opens a routine before it says so instead.
 *
 * The walk follows a chain of calls by recursing once per link, so the chain's
 * depth is the call stack's depth — and a source that is one long chain ended
 * the whole analysis in a `RangeError` (see `routineRegion`). Two hundred is far
 * past any chain a program written by a person has, and far short of the depth
 * at which this walk runs out of stack (measured: between 800 and 1200 links).
 */
const MAX_PERFORM_EXPANSION = 200;

/* ------------------------------------------------------------------ *
 * The build.
 * ------------------------------------------------------------------ */

/**
 * What a build reads for. `engineVersion` is the engine of the run the map is drawn for
 * (`engineVersionOfProject`); absent, this release. From `ENGINE_READS_310_FROM` the walk draws what
 * the older engines left out (`reads310`); a run of an older engine keeps exactly the map it had.
 */
export interface SkeletonBuildOptions {
  engineVersion?: string | null;
}

export function buildProcessSkeleton(source: string, options: SkeletonBuildOptions = {}): ProcessSkeleton {
  return buildProcessSkeletonFrom(buildProcessFacts(source), options);
}

/**
 * The same build, for a caller that already holds the facts of 2.1 and 2.2.
 *
 * The seam matters: branches, calls and blocks have to come from **one** reading
 * of the source, or the gateway and the task drawn from the same `IF` carry two
 * different line numbers (`process-facts.ts`).
 */
export function buildProcessSkeletonFrom(facts: ProcessFacts, options: SkeletonBuildOptions = {}): ProcessSkeleton {
  const reads = readsOf(options.engineVersion);
  // Engine 4 phase 3: the skeleton build is a parse-once scope of its own (`withParsedSource`), so every
  // `maskLiterals` of the same text inside it — the LUW pass reads one per PERFORM per registration — is computed
  // once. A pure function memoised: neutral by construction, and proven by the frozen skeleton digests.
  const skeleton = withParsedSource(() => new SkeletonBuilder(
    facts.statements,
    facts.structure,
    facts.control,
    facts.calls,
    reads.reads310,
    reads.reads320,
  ).build());
  readFor.set(skeleton, reads);
  return skeleton;
}

/** Which gated readings a build for `engineVersion` carries; absent, this release's. */
function readsOf(engineVersion: string | null | undefined): SkeletonReadings {
  const version = engineVersion === undefined ? APP_VERSION : engineVersion;
  return { reads310: engineReads310Apply(version), reads320: engineReads320Apply(version) };
}

function sameReadings(a: SkeletonReadings, b: SkeletonReadings): boolean {
  return a.reads310 === b.reads310 && a.reads320 === b.reads320;
}

/** The readings each skeleton built here was drawn with — kept beside it, so the skeleton's own shape is unchanged. */
const readFor = new WeakMap<ProcessSkeleton, SkeletonReadings>();

/**
 * `skeleton` when it is the map the engine `engineVersion` draws for these facts, otherwise that map, built.
 *
 * For a caller that holds a skeleton read for this release (`readProcess`, a naming context) and has to answer for
 * the engine of a signed run: the rules, the story and the map of a run of an older engine are read off the map that
 * engine drew, never off a newer one. A skeleton not built here is taken as it is.
 */
export function skeletonReadFor(
  skeleton: ProcessSkeleton,
  facts: ProcessFacts | (() => ProcessFacts),
  engineVersion: string | null | undefined,
): ProcessSkeleton {
  const drawn = readFor.get(skeleton);
  if (drawn === undefined || sameReadings(drawn, readsOf(engineVersion))) return skeleton;
  return buildProcessSkeletonFrom(typeof facts === 'function' ? facts() : facts, { engineVersion });
}

class SkeletonBuilder {
  /** The graph every pass reads and writes — engine 4 phase 3 (`skeleton/graph.ts`). */
  private graph = new SkeletonGraph();
  /** The walk's mutable state (`skeleton/walk/state.ts`). */
  private walk: WalkState = newWalkState();
  /** The walk as one typed object, handed to every walker module (`skeleton/walk/walker.ts`). */
  private w!: Walker;
  private blockAt = new Map<number, Block>();
  private branchAt = new Map<number, Branch>();
  private formBlocks = new Map<string, Block>();
  private effects = new Map<string, Set<FormEffect>>();
  private helpers = new Set<string>();
  private macros = new Map<string, { block: Block }>();
  private selectionNames = new Set<string>();
  private performedFrom = new Map<string, string[]>();
  /** `FUNCTION name.` … `ENDFUNCTION.` — roadmap 2.14. Not a block: ABAP closes it, `block-structure.ts` does not open it. */
  private functionBlocks: Array<{ name: string; openIndex: number; closeIndex: number }> = [];
  /** `ENHANCEMENT n name.` … `ENDENHANCEMENT.` at program level — ADR-066. */
  private enhancementBlocks: Array<{ name: string; openIndex: number; closeIndex: number }> = [];
  /**
   * Methods a class **definition** in this source declares callable from outside,
   * keyed `CLASS=>METHOD` (an interface prefix as `CLASS=>ZIF~`; an interface's
   * own methods as `ZIF~METHOD`, which no implementation is looked up by — it
   * writes `zif~method` in a class). Keyed by name alone, a public
   * `execute` of one class made a private `execute` of another an entry.
   */
  private externallyCallableMethods = new Map<string, string>();
  /**
   * Every routine a call in this source can open as a sub-process (D2): the
   * forms under their name, as before, and the methods this source implements
   * under `CLASS=>METHOD` — a key no form name can collide with, since `=>` is
   * not a character of a name. `effects`, `helpers`, `performedFrom` and the
   * region builder are keyed the same way, so a method is a routine exactly as
   * a form is and nothing downstream needs to know which of the two it holds.
   */
  private routineBlocks = new Map<string, Block>();
  /**
   * Roadmap 3.0.7 — the data objects this source declares (`localDataObjectsOf`,
   * the set the call graph reads since 3.0.5). A write statement whose target is
   * one of them changes an internal table: a plain step, never a `write`.
   */
  private localData: Set<string> = new Set();
  /** Roadmap 3.0.7 — the batch-input calls, read field by field, by statement index. */
  private batchInput = new Map<number, BatchInputCall>();
  /** `METHOD name.` inside `CLASS x IMPLEMENTATION`, one row per implementation. */
  private methodImpls: MethodImpl[] = [];
  /** Classes and interfaces this source defines or implements, upper-cased. */
  private classNames = new Set<string>();
  /** Classes whose `CLASS x DEFINITION` (not `DEFERRED`, not `LOAD`) stands in this source, upper-cased. */
  private definedClasses = new Set<string>();
  /** Where a process may begin (`skeleton/entries.ts`). */
  private entryReader!: EntryReader;
  /**
   * `METHODS m REDEFINITION` in a class whose superclass is not in this source,
   * keyed `CLASS=>METHOD`: the superclass, and whether the class is global.
   */
  private redefinedFromOutside = new Map<string, { superclass: string; global: boolean }>();
  /** `CLASS x DEFINITION INHERITING FROM y`: the superclass each local class names. */
  private superOf = new Map<string, string>();
  /** Method dispatch: which implementation a call reaches, the calls of a statement, the bound handlers (`skeleton/dispatch.ts`). */
  private dispatch!: MethodDispatch;
  /** The statements, over the whole source, whose calls resolve to each method — for entries and helpers. */
  private methodCallSites = new Map<string, number[]>();
  /**
   * Engine 3.2.0: the ambiguous calls each implementation is a candidate of — the statement, the call as the source
   * writes it, its line and how many implementations the call can reach. Empty for an older engine
   * (`readMethodCallSites`), so nothing below changes its map.
   */
  private candidateSites = new Map<string, Array<{ index: number; label: string; line: number; of: number }>>();
  /** `METHODS m FOR EVENT ev OF cls` — the event each implemented handler method declares, upper-cased. */
  private handlerEvent = new Map<string, { event: string; of: string }>();
  /** Handler methods a `SET HANDLER` of this source registers, in the order it first names them. */
  private boundHandlers: string[] = [];
  /** Handlers some `SET HANDLER … ACTIVATION` of this source may switch off — never a binding. */
  private deregisteredHandlers = new Set<string>();
  /** The event blocks of the report (one program run), for `registeredBefore`. */
  private runEntries: EntryPoint[] = [];
  /** The walk's read-only questions about the source (`skeleton/walk-readers.ts`). */
  private readers!: WalkReaders;

  constructor(
    private statements: AbapStatement[],
    private structure: BlockStructure,
    private control: ControlFlowReport,
    private calls: CallGraphReport,
    /**
     * Engine 3.1.0 (`ENGINE_READS_310_FROM`): the readings of the process-quality step — an arm that only sets
     * a flag a later decision reads is a step (`flagStep`), a routine that builds a table while it decides or
     * iterates is a calculation and not a helper (`buildsWhileDeciding`), and a loop level begins at a start
     * event of its own (`addSubProcessStarts`). False for a run of an older engine, whose map stays as it was.
     */
    private reads310 = false,
    /**
     * Engine 3.2.0 (`ENGINE_READS_320_FROM`): a call the source cannot resolve statically names its candidate
     * implementations, and each candidate no other call reaches is an entry of its own (`methodEntries`,
     * `candidateSites`); `me->m( )` and a bare `m( )` dispatch at run time when a subclass redefines `m`
     * (`resolveMethod`, `dynamicDispatch`). False for a run of an older engine, whose map stays as it was.
     */
    private reads320 = false,
  ) {}

  build(): ProcessSkeleton {
    const d = readDeclarations({ statements: this.statements, structure: this.structure, control: this.control });
    this.localData = d.localData;
    this.batchInput = d.batchInput;
    this.blockAt = d.blockAt;
    this.branchAt = d.branchAt;
    this.macros = d.macros;
    this.formBlocks = d.formBlocks;
    this.routineBlocks = d.routineBlocks;
    this.methodImpls = d.methodImpls;
    this.classNames = d.classNames;
    this.definedClasses = d.definedClasses;
    this.superOf = d.superOf;
    this.functionBlocks = d.functionBlocks;
    this.enhancementBlocks = d.enhancementBlocks;
    this.externallyCallableMethods = d.externallyCallableMethods;
    this.redefinedFromOutside = d.redefinedFromOutside;
    this.selectionNames = d.selectionNames;
    this.dispatch = new MethodDispatch({
      statements: this.statements,
      structure: this.structure,
      methodImpls: this.methodImpls,
      superOf: this.superOf,
      routineBlocks: this.routineBlocks,
    }, { reads310: this.reads310, reads320: this.reads320 });
    this.dispatch.readCallSites();
    this.dispatch.readEventHandlers();
    this.methodCallSites = this.dispatch.methodCallSites;
    this.candidateSites = this.dispatch.candidateSites;
    this.handlerEvent = this.dispatch.handlerEvent;
    this.boundHandlers = this.dispatch.boundHandlers;
    this.deregisteredHandlers = this.dispatch.deregisteredHandlers;
    const routineEffects = readEffects({
      statements: this.statements,
      structure: this.structure,
      control: this.control,
      routineBlocks: this.routineBlocks,
      formBlocks: this.formBlocks,
      macros: this.macros,
      localData: this.localData,
      callsIn: (statement) => this.dispatch.methodCallsIn(statement),
      handlersRaisedBy: (statement) => (this.boundHandlers.length ? this.dispatch.handlersRaisedBy(statement) : []),
    }, { reads310: this.reads310, reads320: this.reads320 });
    this.effects = routineEffects.effects;
    this.performedFrom = routineEffects.performedFrom;
    this.helpers = routineEffects.helpers;
    noteWhatIsNotRead(this.graph, {
      statements: this.statements, structure: this.structure, control: this.control, calls: this.calls,
    });

    this.readers = new WalkReaders({
      statements: this.statements,
      structure: this.structure,
      control: this.control,
      blockAt: this.blockAt,
      formBlocks: this.formBlocks,
      selectionNames: this.selectionNames,
    }, { reads310: this.reads310, reads320: this.reads320 });
    this.entryReader = new EntryReader({
      statements: this.statements,
      structure: this.structure,
      calls: this.calls,
      declarations: d,
      dispatch: { methodCallSites: this.methodCallSites, candidateSites: this.candidateSites },
      graph: this.graph,
      entryOfBlock: this.walk.entryOfBlock,
    });
    const entries = this.entryReader.readEntryPoints();
    this.runEntries = entries.filter((e) => e.origin === 'event' || e.origin === 'implicit');
    this.w = {
      graph: this.graph,
      input: {
        statements: this.statements,
        structure: this.structure,
        calls: this.calls,
        blockAt: this.blockAt,
        branchAt: this.branchAt,
        formBlocks: this.formBlocks,
        routineBlocks: this.routineBlocks,
        macros: this.macros,
        localData: this.localData,
        batchInput: this.batchInput,
        methodImpls: this.methodImpls,
        classNames: this.classNames,
        effects: this.effects,
        helpers: this.helpers,
        performedFrom: this.performedFrom,
        dispatch: this.dispatch,
        boundHandlers: this.boundHandlers,
        handlerEvent: this.handlerEvent,
        candidateSites: this.candidateSites,
        readers: this.readers,
        entryReader: this.entryReader,
        runEntries: this.runEntries,
      },
      state: this.walk,
      readings: { reads310: this.reads310, reads320: this.reads320 },
      range: (from, to, ctx, incoming) => this.walkRange(from, to, ctx, incoming),
      routineRegion: (name) => this.routineRegion(name),
    };
    for (const entry of entries) this.buildEntryRegion(entry);
    for (const entry of this.entryReader.deferredModuleEntries(this.walk.screenCalled)) this.buildEntryRegion(entry);
    // A callback's own walk can start another task, so this runs until the
    // walks name nothing new.
    for (let next = 0; next < this.walk.callbacks.length; next++) {
      const entry = callbackEntry(this.w, this.walk.callbacks[next]);
      if (entry) this.buildEntryRegion(entry);
    }
    // ADR-054, once every region is walked: an early end is only early where
    // something drawn would still have followed it.
    settleEarlyEnds(this.graph, {
      statements: this.statements,
      structure: this.structure,
      blockAt: this.blockAt,
      earlyEnds: this.walk.earlyEnds,
      regionLast: this.walk.regionLast,
      runEntryRanks: this.runEntries.map((e) => e.rank),
    });
    collapseSmallRegions(this.graph, { reads310: this.reads310 });
    applyGuards(this.graph);
    // Roadmap 2.15: after the guards, so a folded run switch is already on its
    // flow when the conditions of a gateway are read — and before the notes,
    // which are counted over the graph this pass leaves behind.
    foldTechnicalGateways(this.graph);
    // ADR-054, after the fold, so what the fold decides is exactly what it
    // decided before a plane had a start event of its own.
    addSubProcessStarts(this.graph, { reads310: this.reads310 });
    // Roadmap 3.0.7, once every node and end is settled: a reporting event
    // block that ends normally hands over to the next one.
    chainReportEvents(this.graph);
    if (this.reads310) markEmptyEntries(this.graph);
    noteUnreachableSteps(this.graph, { statements: this.statements, cutOffBoundaries: this.walk.cutOffBoundaries });
    // Roadmap 2.16, last: a lane holds node ids, and `foldTechnicalGateways`
    // is the pass that can still drop one.
    const lanes = buildLanes(this.graph, { statements: this.statements, evidence: this.walk.evidence });
    // Roadmap 2.12, after every pass that can still drop a node.
    const luw = attachLuwStates(this.graph, {
      statements: this.statements, structure: this.structure, control: this.control, calls: this.calls,
    });

    return {
      nodes: this.graph.nodes,
      edges: this.graph.edges,
      regions: this.graph.regions,
      lanes,
      laneEvidence: this.walk.evidence,
      entries: this.graph.regions
        .filter((r) => r.kind === 'entry')
        .sort((a, b) => (a.runtimeRank ?? 0) - (b.runtimeRank ?? 0)
          || (a.anchor?.lineStart ?? 0) - (b.anchor?.lineStart ?? 0))
        .map((r) => r.key),
      notDrawn: notDrawn({
        statements: this.statements,
        structure: this.structure,
        calls: this.calls,
        formBlocks: this.formBlocks,
        entryOfBlock: this.walk.entryOfBlock,
        reachedRoutines: this.walk.reachedRoutines,
        helpers: this.helpers,
        methodImpls: this.methodImpls,
        methodCallSites: this.methodCallSites,
      }),
      anchoredNodes: this.graph.nodes.length - this.graph.unanchoredCount,
      unanchoredNodes: this.graph.unanchoredCount,
      notes: this.graph.notes,
      luw,
    };
  }

  /* ---------------- what the walk asks of the declarations and the dispatch ---------------- */

  /* ---------------- the regions ---------------- */

  private buildEntryRegion(entry: EntryPoint): void {
    const key = `entry:${entry.label}@${entry.statement.lineStart}`;
    if (this.graph.regions.some((r) => r.key === key)) return;
    const region: SkeletonRegion = {
      key,
      kind: 'entry',
      label: entry.label,
      anchor: anchorOf(entry.statement),
      runtimeRank: entry.rank,
      endNodeId: '',
      entryNodeId: null,
    };
    this.graph.regions.push(region);

    const container = entry.implicit ? null : entry.label;
    const start = this.graph.addNode('start', entry.label, anchorOf(entry.statement), region, container, {
      detail: {
        implicit: entry.implicit,
        runtimeRank: entry.rank,
        // Roadmap 2.14: which of the six the reader is looking at, and what the
        // source said to justify it. `trigger: null` is the honest half — the
        // source proves the routine is callable and not what calls it.
        origin: entry.origin,
        ...(entry.trigger ? { trigger: entry.trigger } : { triggerNotDetermined: true }),
      },
    });
    // The normal end of a named region is its closing word, not the last
    // statement before it (2.14): `ENDMETHOD` is where the method ends, and
    // corpus cases CC-040 and CC-057 anchor their end node exactly there.
    const end = this.graph.addNode('end', entry.label, anchorOf(entry.endStatement), region, container);
    region.endNodeId = end.id;

    const from = entry.implicit ? entry.statement.index : entry.statement.index + 1;
    this.walk.regionLast.set(region.key, entry.lastIndex);
    // What `SET HANDLER` registered holds only within one run. Every entry
    // that is called on its own — a function module, a method called from
    // outside, a screen module, a bare FORM, a callback, an event handler —
    // starts with nothing registered. The event blocks of a report are one
    // run: a block starts with what the blocks that run **before** it (runtime
    // order, rule 4 — not the order they are written in) register
    // unconditionally (`registeredBefore`).
    this.walk.registeredInWalk = entry.origin === 'event' || entry.origin === 'implicit'
      ? this.registeredBefore(entry)
      : this.registeredAtEntry(entry);
    const exits = this.walkRange(from, entry.lastIndex, {
      region, container, loops: [], loopBreaks: [],
    }, [{ from: start.id, condition: '', kind: 'sequence' }]);
    region.entryNodeId = start.id;
    this.graph.connect(exits, end.id);
  }

  /**
   * The region a routine opens — a `FORM`, or since D2 a method this source
   * implements — built once however often it is called.
   */
  /**
   * The handlers the event blocks that run before this one register for
   * certain: a `SET HANDLER` standing at the top level of such a block — in
   * no branch, loop or TRY, and not in a routine it calls — in a block that
   * cannot be left before its end. Anything less certain is left out, and the
   * `RAISE` it would have opened stays opaque.
   */
  private registeredBefore(entry: EntryPoint): Set<string> {
    const out = new Set<string>();
    if (!this.boundHandlers.length) return out;
    for (const earlier of this.runEntries) {
      if (earlier === entry || earlier.rank >= entry.rank) continue;
      const from = earlier.implicit ? earlier.statement.index : earlier.statement.index + 1;
      if (this.readers.canLeaveEarly(from, earlier.lastIndex)) continue;
      // The implicit START-OF-SELECTION is scattered between blocks: only its own statements.
      const own = earlier.implicit ? new Set(this.entryReader.programLevelStatements().map((s) => s.index)) : null;
      for (let i = from; i <= earlier.lastIndex; i++) {
        if ((this.structure.enclosing[i] ?? []).length || (own && !own.has(i))) continue;
        const handlers = this.dispatch.handlersSetBy(this.statements[i]);
        if (!handlers || handlers.deregisters) continue;
        for (const { key } of handlers) if (this.boundHandlers.includes(key)) out.add(key);
      }
    }
    return out;
  }

  /**
   * Engine 3.2.0 — what an entry that runs **inside** this program's run starts with: the handlers registered when
   * the walk passed the statement that hands over to it (`registrationsAtCall`), of every such statement walked
   * before this entry is built. Three such entries: a candidate implementation runs inside the ambiguous call that
   * reaches it (`candidateEntries`); a screen module runs inside the `CALL SCREEN` of the report that showed the
   * screen (`deferredModuleEntries`); a callback runs in the session that registered it (`callbackEntry`). An ABAP
   * event handler registered with `SET HANDLER` stays registered for the whole internal session, so a `RAISE EVENT`
   * in any of them runs it. Every other entry called on its own starts with nothing registered — and so does every
   * entry of an older engine, whose map stays as it was.
   */
  private registeredAtEntry(entry: EntryPoint): Set<string> {
    const out = new Set<string>();
    if (!this.reads320) return out;
    const sites: number[] = [];
    if (entry.trigger?.startsWith(CANDIDATE_TRIGGER)) {
      const key = `${classOf(this.statements, this.structure, entry.statement.index) ?? ''}=>${entry.label.toUpperCase()}`;
      sites.push(...(this.candidateSites.get(key) ?? []).map((site) => site.index));
    } else if (entry.origin === 'module') {
      sites.push(...this.walk.screenCallSites);
    } else if (entry.origin === 'callback' && entry.site !== undefined) {
      sites.push(entry.site);
    }
    for (const site of sites) for (const handler of this.walk.registrationsAtCall.get(site) ?? []) out.add(handler);
    return out;
  }

  private routineRegion(name: string): SkeletonRegion | null {
    const known = this.walk.regionOfRoutine.get(name);
    if (known) return known;
    const block = this.routineBlocks.get(name);
    if (!block) return null;
    const method = this.methodImpls.find((impl) => impl.key === name);

    // A chain of PERFORMs is followed by recursion — this method, the walk over
    // the routine it opens, and the PERFORM in that routine call one another —
    // so the depth of the chain is the depth of the call stack. A source with a
    // 6000-link chain fits in 410 kB, well under the 1 MB a `legacyCode` field
    // may hold, and the stack gave out before the walk did: `RangeError:
    // Maximum call stack size exceeded` out of `buildProcessSkeleton`, and with
    // it every reading derived from it. The floor
    // answers the way the macro floor above does: read what can be read, and
    // say what was left unread rather than fail. Real chains are two digits at
    // most; this one is the last link that still gets opened.
    if (this.walk.expanding.length >= MAX_PERFORM_EXPANSION) {
      this.graph.note('expansion-depth-reached', this.statements[block.openIndex],
        `${name} is performed ${MAX_PERFORM_EXPANSION} calls deep, in a chain that starts at `
        + `${this.walk.expanding[0]}. The call is drawn; what this routine does is not read, `
        + 'so no step inside it is in this skeleton.');
      return null;
    }

    const opener = this.statements[block.openIndex];
    const region: SkeletonRegion = {
      key: method ? `method:${name}` : `form:${name}`,
      kind: 'sub-process',
      label: method ? method.name : name,
      anchor: anchorOf(opener),
      endNodeId: '',
      entryNodeId: null,
      effects: [...(this.effects.get(name) ?? [])],
    };
    this.graph.regions.push(region);
    this.walk.regionOfRoutine.set(name, region);

    const closer = this.statements[block.closeIndex];
    const end = block.terminated
      ? this.graph.addNode('end', name, anchorOf(closer), region, name)
      // Rule 1: nothing closed this routine, so where it ends is a guess. A node
      // that says so must not look like a node that carries a range.
      : this.graph.addNode('end', name, null, region, name, {
        unanchoredReason: method
          ? `METHOD ${method.name} is not closed by ENDMETHOD in this source, so it has no end to anchor to.`
          : `FORM ${name} is not closed by ENDFORM in this source, so it has no end to anchor to.`,
      });
    region.endNodeId = end.id;

    const [from, to] = bodyRange(block);
    const guarded = this.readers.readGuard(from, to, region);
    const before = this.graph.nodes.length;
    this.walk.regionLast.set(region.key, to);
    this.walk.expanding.push(name);
    const registered = new Set(this.walk.registeredInWalk);
    const exits = this.walkRange(guarded, to, {
      region, container: name, loops: [], loopBreaks: [],
    }, []);
    this.walk.expanding.pop();
    // A routine that can leave before its end (`CHECK`, `RETURN`, `EXIT`,
    // `STOP`, `LEAVE`, an error end) may return without its `SET HANDLER`
    // having run — its registrations do not reach the caller. Its region is
    // also built once and reused, so what it registers is kept only where no
    // way out precedes it anywhere.
    if (this.readers.canLeaveEarly(from, to)) this.walk.registeredInWalk = registered;
    // The walk gives a sub-process no start event — the call site is where it
    // begins, and `addSubProcessStarts` adds one only once it is known that the
    // routine is drawn as a plane of its own (ADR-054) — so its first node is
    // the one nothing inside the region points at.
    // It is looked up by region and not by position: a `PERFORM` inside this
    // routine builds the region it opens *before* it adds its own call site, so
    // the node at `before` can belong to a routine one level down.
    region.entryNodeId = this.graph.nodes.slice(before).find((n) => n.region === region.key)?.id ?? null;
    this.graph.connect(exits, end.id);
    return region;
  }

  /* ---------------- the walk ---------------- */

  private walkRange(from: number, to: number, ctx: WalkContext, incoming: Exit[]): Exit[] {
    let live = incoming;
    /** The output node a run of list statements is being folded into. */
    let outputRun: SkeletonNode | null = null;
    let i = from;

    while (i <= to) {
      const statement = this.statements[i];
      const block = this.blockAt.get(i);

      if (block) {
        outputRun = null;
        if (FLOW_BLOCKS.has(block.kind) && block.closeIndex <= to) {
          // A `SET HANDLER` inside a branch, a loop body or a TRY/CATCH may
          // not run at all, so it registers only for what follows it inside
          // that block. Past the block the registrations are what they were
          // before it.
          const registered = new Set(this.walk.registeredInWalk);
          if (block.kind === 'if' || block.kind === 'case') live = this.walkBranch(block, ctx, live);
          else if (block.kind === 'try') live = this.walkTry(block, ctx, live);
          else if (block.kind === 'at') live = this.walkGroupChange(block, ctx, live);
          else live = this.walkLoop(block, ctx, live);
          this.walk.registeredInWalk = registered;
          i = block.closeIndex + 1;
          continue;
        }
        // A container, a macro body, or a construct that runs past this range:
        // not a flow of this region, so it is stepped over rather than opened.
        i = Math.max(i + 1, Math.min(block.closeIndex + 1, to + 1));
        continue;
      }

      // Roadmap 2.17 (a), before the single statement: two or more
      // `STARTING NEW TASK` calls the source proves are waited for are one
      // fork, not a chain of service tasks.
      const parallel = this.readers.parallelGroupAt(i, to);
      if (parallel) {
        outputRun = null;
        live = walkParallel(this.w, parallel, ctx, live);
        i = parallel.resumeIndex;
        continue;
      }

      const produced = walkStatement(this.w, statement, ctx, live, outputRun);
      outputRun = produced.outputRun;
      live = produced.exits;
      i += 1;
    }
    return live;
  }

  /**
   * Roadmap 3.0.7 (MM case review) — a `CASE` on the function
   * code a person pressed. Its arms are **alternatives the user chooses
   * from**, each as often and in whatever order they like, not steps that
   * follow one another: the review found a list callback's "display order",
   * "set to done" and "change delivery date" numbered 5, 6, 7 on the main
   * path. The gateway says so in `detail.userAction`, so a view can list the
   * arms side by side instead of counting them.
   *
   * Read off the source only: the selector is `sy-ucomm`, or the first `USING`
   * parameter of a FORM the ALV calls back as `I_CALLBACK_USER_COMMAND` — the
   * type pool SLIS hands the function code in that position (`r_ucomm LIKE
   * sy-ucomm`). A CASE in a routine *performed from* the callback is not
   * claimed; its selector could be anything by then.
   */
  private decidesUserCommand(branch: Branch, ctx: WalkContext): boolean {
    if (branch.kind !== 'case' || !branch.selector) return false;
    const selector = branch.selector.trim().toUpperCase();
    if (selector === 'SY-UCOMM') return true;
    const callback = this.walk.callbacks.find((c) => c.trigger === 'ALV I_CALLBACK_USER_COMMAND'
      && ctx.region.kind === 'entry' && ctx.container?.toUpperCase() === c.label.toUpperCase());
    if (!callback) return false;
    const block = this.routineBlocks.get(callback.key);
    const opener = block ? this.statements[block.openIndex]?.text ?? '' : '';
    const first = /^FORM\s+[\w/]+\s+USING\s+(?:VALUE\s*\(\s*)?([\w/]+)/i.exec(opener)?.[1];
    return !!first && first.toUpperCase() === selector;
  }

  private walkBranch(block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
    const branch = this.branchAt.get(block.openIndex);
    const opener = this.statements[block.openIndex];
    if (!branch) {
      // 2.1 refused to read this construct (a chained IF, a macro body). The
      // skeleton refuses the gateway too and walks the body as a sequence, so
      // nothing inside it is lost. Its arms cannot be told apart, so nothing
      // registered inside it counts, not even later in the same body:
      // registrations are kept frozen while it is walked.
      const registered = this.walk.registeredInWalk;
      this.walk.registrationFrozen += 1;
      const walked = this.walkRange(block.openIndex + 1, block.closeIndex - 1, ctx, incoming);
      this.walk.registrationFrozen -= 1;
      this.walk.registeredInWalk = registered;
      return walked;
    }

    const label = branch.kind === 'case' ? (branch.selector ?? 'CASE') : snippet(opener.text);
    // D2: `IF lo->m( ) = …` runs the method before it decides.
    const before = walkMethodCalls(this.w, opener, ctx, incoming);
    // Roadmap 3.0.7 (e): arms that do nothing but set one field are a
    // classification — `detail.decisionTable` names the field, so a view can
    // draw the gateway as one business-rule task with its table
    // (`decision-table.ts`; the rows are in the rule set). The node keeps its
    // kind and its arms: the process benchmark's blind expected answers model
    // all 7 such tables of its learning half (6 cases) as a gateway.
    const table = readDecisionTable(branch, this.statements);
    const gateway = this.graph.addNode('gateway', label, anchorOf(opener), ctx.region, ctx.container, {
      detail: {
        branchId: branch.id, branchKind: branch.kind, arms: branch.arms.length,
        ...(this.decidesUserCommand(branch, ctx) ? { userAction: true } : {}),
        ...(table ? { decisionTable: table.field } : {}),
      },
    });
    this.graph.connect(before, gateway.id);

    const exits: Exit[] = [];
    let hasDefault = false;
    // The arms exclude each other. Each starts from what was registered
    // before the branch; what one arm registers holds for the rest of that arm
    // only (`walkRange` restores the state before the block once all arms are
    // walked).
    const registered = new Set(this.walk.registeredInWalk);
    for (let a = 0; a < branch.arms.length; a++) {
      this.walk.registeredInWalk = new Set(registered);
      const arm = branch.arms[a];
      const next = branch.arms[a + 1];
      const bodyFrom = arm.headerIndex + 1;
      const bodyTo = (next ? next.headerIndex : block.closeIndex) - 1;
      const isDefault = arm.kind === 'else' || arm.kind === 'when-others';
      if (isDefault) hasDefault = true;
      const armEntry: Exit = {
        from: gateway.id,
        condition: arm.condition,
        kind: isDefault ? 'default' : 'conditional',
      };
      const before = this.graph.nodes.length;
      const edgesBefore = this.graph.edges.length;
      let armExits = this.walkRange(bodyFrom, bodyTo, ctx, [armEntry]);
      if (this.reads310 && !table) armExits = this.armOutcome(armEntry, armExits, before, edgesBefore, bodyFrom, bodyTo, block, ctx);
      exits.push(...armExits);
    }
    // No ELSE and no WHEN OTHERS: the gateway itself is the way past it.
    if (!hasDefault) exits.push({ from: gateway.id, condition: '', kind: 'default' });
    return exits;
  }

  /**
   * Engine 3.1.0 — what an arm that drew no step does is the outcome of its decision.
   *
   * Two shapes, and nothing else is touched:
   *
   * - **The arm drew nothing.** Its way out is still the way in. A call of a technical helper in it
   *   (`helperStep`: `PERFORM add_issue USING … 'Postal code has the wrong length'`) is what the arm does —
   *   without it both ways out of "Postal code length wrong?" ran to the same next step and the decision looked
   *   as if it decided nothing. Failing that, a flag a later decision reads (`flagStep`).
   * - **The arm drew only its own end** (`PERFORM add_message USING 'E' …. RETURN.`): the helper call goes
   *   between the decision and that end, so the stop says what it recorded on the way out.
   *
   * A `CONTINUE`, `EXIT` or `CHECK` in the arm changes its way out, and such an arm is left as it is.
   */
  private armOutcome(
    entry: Exit,
    exits: Exit[],
    nodesBefore: number,
    edgesBefore: number,
    from: number,
    to: number,
    block: Block,
    ctx: WalkContext,
  ): Exit[] {
    const drawn = this.graph.nodes.slice(nodesBefore);
    if (drawn.length === 0) {
      const untouched = this.graph.edges.length === edgesBefore && exits.length === 1 && exits[0].from === entry.from
        && exits[0].kind === entry.kind && exits[0].condition === entry.condition;
      if (!untouched) return exits;
      const step = this.helperStep(from, to, block, ctx) ?? this.collectStep(from, to, block, ctx)
        ?? this.flagStep(from, to, block, ctx);
      if (!step) return exits;
      this.graph.connect(exits, step.id);
      return [{ from: step.id, condition: '', kind: 'sequence' }];
    }
    if (drawn.length !== 1 || (drawn[0].kind !== 'end' && drawn[0].kind !== 'end-error')) return exits;
    const into = this.graph.edges.slice(edgesBefore).filter((e) => e.to === drawn[0].id);
    if (into.length !== 1 || into[0].from !== entry.from || this.graph.edges.length !== edgesBefore + 1) return exits;
    const step = this.helperStep(from, to, block, ctx);
    if (!step) return exits;
    // The step was appended after the end; it goes before it, so the file lists the arm in reading order.
    this.graph.nodes.pop();
    this.graph.nodes.splice(nodesBefore, 0, step);
    into[0].to = step.id;
    this.graph.edges.push({ from: step.id, to: drawn[0].id, kind: 'sequence', condition: '' });
    return exits;
  }

  /**
   * Engine 3.1.0 (`armOutcome`): the first call, standing directly in this arm, of a routine folded as a
   * technical helper — drawn as one task, named after the routine as the call writes it (rule 6), with the
   * routine's range as the secondary anchor and the program's own sentences the call passes in `detail`.
   */
  private helperStep(from: number, to: number, block: Block, ctx: WalkContext): SkeletonNode | null {
    for (let i = from; i <= to; i++) {
      const statement = this.statements[i];
      if (!statement || statement.nativeSql) continue;
      const around = this.structure.enclosing[i] ?? [];
      if (around[around.length - 1] !== block) continue;
      let key: string | null = null;
      let label = '';
      let token = 1;
      if (statement.keyword === 'PERFORM') {
        const call = this.calls.performs.find((p) => p.lineStart === statement.lineStart && p.text === statement.text);
        if (call?.target && !call.program && this.helpers.has(call.target)) { key = call.target; label = call.target; }
      } else {
        const call = this.dispatch.methodCallsIn(statement).find((c) => c.standalone && c.key && this.helpers.has(c.key));
        if (call?.key) { key = call.key; label = call.label; token = this.readers.callToken(statement, call); }
      }
      if (!key) continue;
      const routine = this.routineBlocks.get(key);
      const texts = [...statement.text.matchAll(/'((?:[^']|'')*)'|`((?:[^`]|``)*)`/g)]
        .map((m) => (m[1] ?? m[2] ?? '').replace(/''/g, "'").trim())
        .filter((text) => /[A-Za-z]{2}/.test(text) && text.includes(' '));
      return this.graph.addNode('task', label, {
        ...anchorOf(statement, token),
        ...(routine ? { secondary: { lineStart: routine.lineStart, lineEnd: routine.lineEnd, reason: 'routine-definition' as const } } : {}),
      }, ctx.region, ctx.container, {
        detail: { helperCall: true, routine: key, ...(texts.length ? { programTexts: texts } : {}) },
      });
    }
    return null;
  }

  /**
   * Engine 3.1.0 (`armOutcome`): the first row added, directly in this arm, to an internal table —
   * `IF deviation > tolerance. … APPEND gs_line TO gt_report. ENDIF.` The decision is "does this row belong in the
   * result?", and the append is its yes. Drawn as the plain step a change to an internal table already is since
   * 3.0.7 (`MODIFY gt_out …`): a task named after the table, `detail.operation`, `internalTable` and `collects`.
   *
   * Only a table that outlives the routine: a global one, or a parameter the routine hands back. A table the
   * routine declares for itself (`DATA lt_keys …`) is scaffolding for the routine's next step, which says what
   * it does with it.
   */
  private collectStep(from: number, to: number, block: Block, ctx: WalkContext): SkeletonNode | null {
    for (let i = from; i <= to; i++) {
      const statement = this.statements[i];
      if (!statement || statement.nativeSql) continue;
      const around = this.structure.enclosing[i] ?? [];
      if (around[around.length - 1] !== block) continue;
      const bare = maskLiterals(statement.text);
      if (!BUILDS_TABLE.test(bare)) continue;
      const table = COLLECT_TARGET.exec(bare)?.[1];
      if (!table || table.startsWith('<')) continue;
      // A message row (`msgty`, `msgno`, `type` with `message`) goes into a log, not into the result.
      if (MESSAGE_ROW.test(bare)) continue;
      const routine = [...around].reverse().find((b) => b.kind === 'form' || b.kind === 'method');
      if (routine && this.readers.declaresLocally(routine, table)) continue;
      return this.graph.addNode('task', table.toUpperCase(),
        anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${table}(?:\\[\\])?\\.?$`, 'i'))),
        ctx.region, ctx.container, {
          detail: { operation: statement.keyword, internalTable: true, collects: true },
        });
    }
    return null;
  }

  /**
   * Engine 3.1.0 — an arm that only sets a flag is the outcome of its decision.
   *
   * `ELSE. gv_approved = abap_true. ENDIF. … IF gv_approved = abap_true. PERFORM create_order.` The arm draws
   * nothing — an assignment is no element of §5.8 — so the map showed the third way out of the decision as an
   * empty flow, and a reader could not see that this way *approves*. What the arm does is decide the later
   * question in advance. So where an arm draws nothing at all and one of its statements sets a field to a
   * value (a literal, a constant, `abap_true`) that the condition of **another** decision of this source reads,
   * that assignment is a step of its own: a task on the assignment's line, labelled with the statement as
   * written (rule 6), the field and its value in `detail`, and the program's own words assigned in the same
   * arm (`gv_message = '…'`) beside them, so a view can say the outcome in the program's text.
   *
   * Not for a field no decision reads (a message text alone stays an assignment), not for an arm that draws
   * anything (its steps already say what it does), and not for a decision table — arms that each set the same
   * field are drawn as one classification (`readDecisionTable`).
   */
  private flagStep(from: number, to: number, block: Block, ctx: WalkContext): SkeletonNode | null {
    const flags: Array<{ field: string; value: string; statement: AbapStatement }> = [];
    const texts: string[] = [];
    for (let i = from; i <= to; i++) {
      const statement = this.statements[i];
      if (!statement || statement.nativeSql) continue;
      const m = FLAG_ASSIGNMENT.exec(statement.text.trim());
      if (!m) continue;
      const [, field, value] = m;
      // A copy of another variable (`lv_eur = iv_amount`) carries a value along; it does not settle a question.
      if (/^[\w/]+$/.test(value) && !/^-?\d+$/.test(value) && !BUILT_IN_FLAG_VALUES.has(value.toUpperCase())
        && !this.readers.constantNames().has(value.toUpperCase())) continue;
      if (value.startsWith("'") || value.startsWith('`')) {
        const text = value.slice(1, -1).replace(/''/g, "'").trim();
        if (/[A-Za-z]{2}/.test(text) && text.includes(' ')) texts.push(text);
      }
      if (this.readers.decisionsReading(field, block).length) flags.push({ field, value, statement });
    }
    if (!flags.length) return null;
    const first = flags[0];
    const readAt = this.readers.decisionsReading(first.field, block);
    return this.graph.addNode('task', snippet(first.statement.text), anchorOf(first.statement), ctx.region, ctx.container, {
      detail: {
        flagStep: true,
        flag: first.field.toUpperCase(),
        value: first.value,
        ...(flags.length > 1 ? { flags: flags.map((f) => f.field.toUpperCase()) } : {}),
        readAtLines: readAt.map((line) => String(line)),
        ...(texts.length ? { programTexts: texts } : {}),
      },
    });
  }

  /**
   * `AT NEW kunnr … ENDAT` — a group change inside a `LOOP`.
   *
   * 2.1 leaves it to the skeleton deliberately (`control-flow.ts`): it is not a
   * branch, it is a condition on the iteration. It is an exclusive gateway whose
   * condition is the words the source uses, and whose other way round is the
   * iteration that is not the first of its group — not a loop, which is what
   * reading `AT` as an opener without looking at it makes of it.
   */
  private walkGroupChange(block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
    const opener = this.statements[block.openIndex];
    const condition = afterKeyword(opener);
    const gateway = this.graph.addNode('gateway', snippet(opener.text), anchorOf(opener),
      ctx.region, ctx.container, { detail: { source: 'AT', condition } });
    this.graph.connect(incoming, gateway.id);
    const body = this.walkRange(block.openIndex + 1, block.closeIndex - 1, ctx,
      [{ from: gateway.id, condition, kind: 'conditional' }]);
    return [...body, { from: gateway.id, condition: '', kind: 'default' }];
  }

  /**
   * `LOOP AT <table> … ENDLOOP` whose body stays inside it — roadmap 2.17 (b).
   *
   * `DESIGN.md` §5.8 draws this as *Mehrfach-Instanz, sequenziell*: one activity
   * that contains the body and repeats it per row, not a gateway with a cycle
   * hanging off it. The body becomes a **region** of its own, exactly the way a
   * `FORM` does, so every reader downstream — the export model, the layout, the
   * navigation of 2.9 — draws it as a collapsed sub-process without needing to
   * know that a loop rather than a routine opened it. What makes it a
   * *multi-instance* sub-process rather than a plain one is `detail`, which
   * `lib/bpmn/export.ts` turns into `multiInstanceLoopCharacteristics`.
   *
   * The anchor is the `LOOP AT` statement and the label is the table token, as
   * before; the region's end node is anchored at the `ENDLOOP`. No node here
   * says anything the source does not write (rule 6).
   */
  private walkMultiInstanceLoop(
    block: Block,
    ctx: WalkContext,
    incoming: Exit[],
    table: string,
  ): Exit[] {
    const opener = this.statements[block.openIndex];
    const region: SkeletonRegion = {
      key: `loop:${table.toUpperCase()}@${opener.lineStart}`,
      kind: 'sub-process',
      label: table,
      anchor: anchorOf(opener),
      endNodeId: '',
      entryNodeId: null,
      multiInstance: true,
    };
    this.graph.regions.push(region);

    const node = this.graph.addNode('loop', table, anchorOf(opener), ctx.region, ctx.container, {
      expandsTo: region.key,
      detail: {
        loopKind: 'multi-instance',
        over: table.toUpperCase(),
        multiInstance: true,
        isSequential: true,
      },
    });
    this.graph.connect(incoming, node.id);

    // The body is walked before the region gets an end node, because whether it
    // needs one is what the walk answers. Nothing in the body can read
    // `region.endNodeId` on the way: every statement that would — `CHECK`,
    // `RETURN`, `STOP`, a `SUBMIT` that does not come back — is a statement
    // `bodyStaysInLoop` has already refused.
    const before = this.graph.nodes.length;
    const exits = this.walkRange(block.openIndex + 1, block.closeIndex - 1, {
      region, container: ctx.container, loops: [], loopBreaks: [],
    }, []);
    const body = this.graph.nodes.slice(before).filter((n) => n.region === region.key);

    // **A body that draws nothing gets no plane.** `LOOP AT gt_orders … lv_sum
    // = lv_sum + ls-netwr … ENDLOOP` is a calculation, and §5.8 gives a
    // calculation no element — so the region would hold one end event and
    // nothing to reach it. §5.8 offers the other half of the same row for
    // exactly this: *an activity* with the marker on it, no sub-process. The
    // loop keeps its anchor, its table and its marker and stops expanding.
    if (!body.length) {
      this.graph.regions = this.graph.regions.filter((r) => r !== region);
      delete node.expandsTo;
      return [{ from: node.id, condition: '', kind: 'sequence' }];
    }

    const closer = this.statements[block.closeIndex];
    const end = block.terminated
      ? this.graph.addNode('end', table, anchorOf(closer), region, ctx.container)
      : this.graph.addNode('end', table, null, region, ctx.container, {
        unanchoredReason: `LOOP AT ${table} is not closed by ENDLOOP in this source, so its body has no end to anchor to.`,
      });
    region.endNodeId = end.id;
    region.entryNodeId = body[0].id;
    this.graph.connect(exits, end.id);

    return [{ from: node.id, condition: '', kind: 'sequence' }];
  }

  private walkLoop(block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
    const opener = this.statements[block.openIndex];
    const table = /^LOOP\s+AT\s+([\w/<>]+)/i.exec(opener.text)?.[1];
    const isSelect = block.kind === 'select';
    // Roadmap 2.17 (b): the default of `DESIGN.md` §5.8 for a `LOOP AT` over a
    // table, and the exception `lib/bpmn/model.ts` argued for stays where its
    // argument holds — a body that leaves the block.
    if (block.kind === 'loop' && table && this.readers.bodyStaysInLoop(block)) {
      return this.walkMultiInstanceLoop(block, ctx, incoming, table);
    }
    const tables = isSelect ? selectTables(opener.text) : [];
    const node = isSelect && tables.length
      ? this.graph.addNode('read', tables[0], anchorOf(opener, tokenIndexOf(opener, /^FROM$/i) + 1),
        ctx.region, ctx.container, {
          detail: { tables, iterates: true, loopKind: 'multi-instance' },
        })
      : this.graph.addNode('loop', table ?? opener.keyword, anchorOf(opener), ctx.region, ctx.container, {
        detail: {
          loopKind: block.kind === 'loop' ? 'multi-instance' : 'standard',
          ...(table ? { over: table.toUpperCase() } : {}),
        },
      });
    this.graph.connect(incoming, node.id);

    const breaks: Exit[] = [];
    const bodyExits = this.walkRange(block.openIndex + 1, block.closeIndex - 1, {
      ...ctx,
      loops: [...ctx.loops, node.id],
      loopBreaks: [...ctx.loopBreaks, breaks],
    }, [{ from: node.id, condition: '', kind: 'sequence' }]);
    for (const exit of bodyExits) {
      this.graph.edges.push({ from: exit.from, to: node.id, kind: 'loop-back', condition: exit.condition });
    }
    return [{ from: node.id, condition: '', kind: 'sequence' }, ...breaks];
  }

  /**
   * `TRY … CATCH … ENDTRY` — §5.8's error boundary event.
   *
   * The protected part is the flow; every `CATCH` is a boundary event on the
   * first node of that part, and its handler joins the flow after the construct.
   */
  private walkTry(block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
    const handlers: number[] = [];
    for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
      const enclosing = this.structure.enclosing[i];
      if (enclosing[enclosing.length - 1] !== block) continue;
      if (this.statements[i].keyword === 'CATCH' || this.statements[i].keyword === 'CLEANUP') {
        handlers.push(i);
      }
    }
    const protectedTo = (handlers[0] ?? block.closeIndex) - 1;
    const beforeProtected = this.graph.nodes.length;
    // A handler runs when the protected part broke off somewhere, so it — and
    // each handler after it — starts from what was registered before the TRY.
    const registered = new Set(this.walk.registeredInWalk);
    // Nothing enters the TRY although its region already drew steps: what stood
    // before it does not come back. At the start of a region an empty `incoming`
    // only means the walk began here, and the region's entry reaches it. A
    // routine's end event is added before its body is walked and is no step.
    const cutOff = incoming.length === 0
      && this.graph.nodes.slice(0, beforeProtected)
        .some((n) => n.region === ctx.region.key && n.id !== ctx.region.endNodeId);
    const exits = this.walkRange(block.openIndex + 1, protectedTo, ctx, incoming);
    const attachedTo = this.graph.nodes.slice(beforeProtected).find((n) => n.region === ctx.region.key) ?? null;

    const out = [...exits];
    for (let h = 0; h < handlers.length; h++) {
      const header = this.statements[handlers[h]];
      const boundary = this.graph.addNode('error-boundary', afterKeyword(header) || header.keyword,
        anchorOf(header), ctx.region, ctx.container, {
          detail: { attachedTo: attachedTo?.id ?? '', source: header.keyword },
        });
      if (attachedTo) {
        this.graph.edges.push({ from: attachedTo.id, to: boundary.id, kind: 'boundary', condition: '' });
      } else {
        // A protected part that drew no node still runs, so its handler is still
        // a path the program can take. Leaving the boundary unconnected made
        // `noteUnreachableSteps` say the opposite — that nothing leads to the
        // CATCH because what stands before it does not come back — with no
        // control flow anywhere in the source to show it (CR-07). The handler
        // hangs on what entered the TRY.
        for (const entry of incoming) {
          this.graph.edges.push({ from: entry.from, to: boundary.id, kind: 'boundary', condition: '' });
        }
        if (cutOff) this.walk.cutOffBoundaries.add(boundary.id);
      }
      const to = (handlers[h + 1] ?? block.closeIndex) - 1;
      this.walk.registeredInWalk = new Set(registered);
      const handled = this.walkRange(handlers[h] + 1, to, ctx,
        [{ from: boundary.id, condition: '', kind: 'sequence' }]);
      if (header.keyword !== 'CLEANUP') {
        out.push(...handled);
        continue;
      }
      // A CLEANUP runs while an exception this TRY does not catch passes on to
      // an outer handler. When it is done the exception goes on propagating:
      // the statement after ENDTRY is never next. Its
      // end is an error end on the CLEANUP itself, not the normal flow.
      if (handled.length) {
        const passOn = this.graph.addNode('end-error', 'CLEANUP', anchorOf(header), ctx.region, ctx.container, {
          detail: { propagates: true },
        });
        this.graph.connect(handled, passOn.id);
      }
    }
    return out;
  }

}


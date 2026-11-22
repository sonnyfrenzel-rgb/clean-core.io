import { withParsedSource, type AbapStatement, type SourceRange } from './statement-reader';
import { sourceForEngine } from './input-hygiene';
import { type Block, type BlockStructure } from './block-structure';
import { type Branch, type ControlFlowReport } from './control-flow';
import { type CallGraphReport } from './call-graph';
import { buildProcessFacts, type ProcessFacts } from './process-facts';
import { type LuwEvent, type UpdateRegistration } from './luw-states';
import { type BatchInputCall } from './batch-input';
import { engineReads310Apply } from './engine-reads-310-gate';
import { engineReads320Apply } from './engine-reads-320-gate';
import { APP_VERSION } from '../version';
import { SkeletonGraph, type SkeletonReadings } from './skeleton/graph';
import { buildLanes } from './skeleton/lanes';
import { noteWhatIsNotRead } from './skeleton/source-notes';
import { readDeclarations, type MethodImpl } from './skeleton/declarations';
import { readEffects } from './skeleton/effects';
import { MethodDispatch } from './skeleton/dispatch';
import { EntryReader, type EntryPoint } from './skeleton/entries';
import { WalkReaders } from './skeleton/walk-readers';
import { settleEarlyEnds } from './skeleton/early-ends';
import { newWalkState, type WalkState } from './skeleton/walk/state';
import { createWalker, walkEntries } from './skeleton/walk/walk';
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
  // From 3.4.0 (`input-hygiene.ts`): a byte order mark is dropped and a lone CR ends a line.
  const read = sourceForEngine(source, options.engineVersion === undefined ? APP_VERSION : options.engineVersion);
  return buildProcessSkeletonFrom(buildProcessFacts(read), options);
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
    // Pass 5, the walk (`skeleton/walk/`).
    const walker = createWalker(this.graph, {
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
    }, this.walk, { reads310: this.reads310, reads320: this.reads320 });
    walkEntries(walker, entries);
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
}


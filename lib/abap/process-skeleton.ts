import { afterKeyword, maskLiterals, withParsedSource, type AbapStatement, type SourceRange } from './statement-reader';
import { type Block, type BlockStructure } from './block-structure';
import { type Branch, type ControlFlowReport } from './control-flow';
import { type CallGraphReport } from './call-graph';
import { databaseWriteIn } from './open-sql-discrimination';
import { namesThisProgram } from './callback-registrations';
import { readDecisionTable } from './decision-table';
import { buildProcessFacts, type ProcessFacts } from './process-facts';
import { type LuwEvent, type UpdateRegistration } from './luw-states';
import { type BatchInputCall } from './batch-input';
import { engineReads310Apply } from './engine-reads-310-gate';
import { engineReads320Apply } from './engine-reads-320-gate';
import { APP_VERSION } from '../version';
import { SkeletonGraph, type Exit, type SkeletonReadings } from './skeleton/graph';
import { anchorOf, bodyRange, programName, snippet, tokenIndexOf } from './skeleton/anchors';
import { buildLanes } from './skeleton/lanes';
import { FLOW_BLOCKS } from './skeleton/keywords';
import { noteWhatIsNotRead } from './skeleton/source-notes';
import { readDeclarations, type MethodImpl } from './skeleton/declarations';
import { isInternalWrite, readEffects } from './skeleton/effects';
import { MethodDispatch, type MethodCall } from './skeleton/dispatch';
import { DECLARATIVE } from './skeleton/keywords';
import { CANDIDATE_TRIGGER, EntryReader, RUNTIME_ORDER, type EntryPoint } from './skeleton/entries';
import {
  AMDP_METHOD,
  BUILDS_TABLE,
  BUILT_IN_FLAG_VALUES,
  COLLECT_TARGET,
  ENHANCEMENT_CALL,
  FLAG_ASSIGNMENT,
  MESSAGE_ROW,
  adbcExecution,
  alvEventRows,
  amdpTables,
  closesDataset,
  datasetOf,
  functionTaskKind,
  isEmbeddedSelect,
  isErrorMessage,
  isFileOutput,
  isInfoMessage,
  isListOutput,
  isRaiseEvent,
  raisesException,
  receivesResults,
  selectTables,
} from './skeleton/recognisers';
import {

} from './skeleton/recognisers';
import {

} from './skeleton/recognisers';
import { settleEarlyEnds, type EarlyEnd } from './skeleton/early-ends';
import { assignmentTarget, classOf, leavesDialogStep } from './skeleton/statement-readers';
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
 * Engine 3.2.0 (AB-15b): the most implementations a call draws as alternatives where it stands
 * (`drawsAlternatives`). A call that can reach more is the opaque call naming its candidates. A design bound, not a
 * measured one: no call of the benchmark's learning halves reaches more than three.
 */
const MAX_ALTERNATIVES = 4;



/** Statements that never set `sy-subrc`, so a check after them still checks the one before. */
const SUBRC_NEUTRAL = /^(?:(?:DATA|TYPES|CONSTANTS|STATICS|FIELD-SYMBOLS)\s+[\w/<]|(?:CLEAR|FREE)\s)/i;


/** Constants a run switch may be compared against without ceasing to be one. */
const SWITCH_CONSTANTS = new Set([
  'ABAP_TRUE', 'ABAP_FALSE', 'ABAP_ON', 'ABAP_OFF', 'ABAP_UNDEFINED',
  'SPACE', 'IS', 'NOT', 'INITIAL', 'AND', 'OR', 'EQ', 'NE', 'X',
]);

/**
 * The flow blocks `walkLoop` opens, and therefore the ones an `EXIT`, a
 * `CONTINUE` or a `CHECK` inside them acts on (`ctx.loops`). Roadmap 2.17 (b)
 * asks which loop a statement leaves, and this is the list that answers it.
 */
const LOOP_BLOCKS = new Set(['loop', 'do', 'while', 'select']);

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

/** A fork of parallel tasks the walk found in one range — roadmap 2.17 (a). */
interface ParallelGroup {
  /** Statement indices of the `STARTING NEW TASK` calls, in source order. */
  members: number[];
  /** Statement index of the `WAIT UNTIL` that joins them, or `null` for a fork without one. */
  joinIndex: number | null;
  /** Where the walk of the range carries on. */
  resumeIndex: number;
}

interface WalkContext {
  region: SkeletonRegion;
  container: string | null;
  /** Ids of the enclosing loop nodes of this region, innermost last. */
  loops: string[];
  /** Exits that leave each enclosing loop early, innermost last. */
  loopBreaks: Exit[][];
}

class SkeletonBuilder {
  /** The graph every pass reads and writes — engine 4 phase 3 (`skeleton/graph.ts`). */
  private graph = new SkeletonGraph();
  private blockAt = new Map<number, Block>();
  private branchAt = new Map<number, Branch>();
  private formBlocks = new Map<string, Block>();
  /** ADR-066 (03.10.2026): the files a run of file statements works on, by node id — `CLOSE DATASET` joins only a run of its own file. */
  private fileRunDatasets = new Map<string, Set<string>>();
  private effects = new Map<string, Set<FormEffect>>();
  private helpers = new Set<string>();
  /** The chain of routines being expanded right now — the floor of `routineRegion`. */
  private expanding: string[] = [];
  private macros = new Map<string, { block: Block }>();
  /**
   * Lane evidence — roadmap 2.16. Collected **inside the walk** on purpose:
   * that is what makes "a piece of evidence in code no entry point reaches does
   * not count" true rather than asserted. `legacy_call_screen_example` of the
   * 1.000-line example is never walked, so its `CALL SCREEN 9000` (L670) never
   * gets here, and no lane is opened for a screen nobody can reach.
   */
  private evidence: LaneEvidence[] = [];
  private evidenceSeen = new Set<string>();
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
  /** Region keys of the entries built, so `unreached()` does not also list them as not reached. */
  private entryOfBlock = new Set<number>();
  /**
   * Routines a walked call names, and everything they perform in turn — the
   * reachability the **drawing** has, as opposed to the one 2.2's call graph
   * computes from event blocks. They differ exactly where an entry is a routine
   * itself: a form performed by a user-exit form is drawn inside it, and must
   * then not also be listed as code no entry reaches.
   */
  private reachedRoutines = new Set<string>();
  /** Did the walk pass a `CALL SCREEN`? */
  private screenCalled = false;
  /**
   * Routines a walked `CALL FUNCTION … STARTING NEW TASK` names with
   * `PERFORMING form ON END OF TASK` or `CALLING meth ON END OF TASK`, in the
   * order the walk met them — see `callbackEntries`.
   */
  private callbacks: Array<{ key: string; label: string; site: AbapStatement; trigger: string }> = [];
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
  private regionOfRoutine = new Map<string, SkeletonRegion>();
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
  /**
   * Engine 3.2.0: the handlers registered when the walk passed each ambiguous call, by statement index. A candidate
   * implementation runs inside that call, so what `SET HANDLER` registered before it is registered in the candidate
   * too (`buildEntryRegion`) — the handlers a `RAISE EVENT` in the candidate runs are the ones the caller bound.
   */
  private registrationsAtCall = new Map<number, Set<string>>();
  /** Engine 3.2.0: the `CALL SCREEN` statements the walk passed — the screen modules run inside them. */
  private screenCallSites: number[] = [];
  /** `METHODS m FOR EVENT ev OF cls` — the event each implemented handler method declares, upper-cased. */
  private handlerEvent = new Map<string, { event: string; of: string }>();
  /** Handler methods a `SET HANDLER` of this source registers, in the order it first names them. */
  private boundHandlers: string[] = [];
  /** Handlers some `SET HANDLER … ACTIVATION` of this source may switch off — never a binding. */
  private deregisteredHandlers = new Set<string>();
  /** Bound handlers whose `SET HANDLER` the walk has passed, so a later `RAISE EVENT` may run them. */
  private registeredInWalk = new Set<string>();
  /**
   * Boundary events of a TRY that nothing enters: no node to attach to, and the
   * flow before the TRY already cut off (`LEAVE PROGRAM`, `SUBMIT` …) in a
   * region that has steps before it.
   */
  private cutOffBoundaries = new Set<string>();
  /** > 0 while a branch whose arms the reader cannot separate is walked — no registration counts there. */
  private registrationFrozen = 0;
  /** The event blocks of the report (one program run), for `registeredBefore`. */
  private runEntries: EntryPoint[] = [];
  /**
   * ADR-054. Every early end the walk drew, with the statement it stands on —
   * `settleEarlyEnds` decides afterwards which of them really skip something.
   */
  private earlyEnds: EarlyEnd[] = [];
  /** ADR-054. The last statement index each region's walk covers — where its normal end takes over. */
  private regionLast = new Map<string, number>();
  /** Engine 3.1.0: the decisions reading each field, by upper-cased field — `decisionsReading`. */
  private flagReaderCache = new Map<string, Array<{ index: number; line: number }>>();
  private constantsCache: Set<string> | null = null;

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
      handlersRaisedBy: (statement) => this.handlersRaisedBy(statement),
    }, { reads310: this.reads310, reads320: this.reads320 });
    this.effects = routineEffects.effects;
    this.performedFrom = routineEffects.performedFrom;
    this.helpers = routineEffects.helpers;
    noteWhatIsNotRead(this.graph, {
      statements: this.statements, structure: this.structure, control: this.control, calls: this.calls,
    });

    this.entryReader = new EntryReader({
      statements: this.statements,
      structure: this.structure,
      calls: this.calls,
      declarations: d,
      dispatch: { methodCallSites: this.methodCallSites, candidateSites: this.candidateSites },
      graph: this.graph,
      entryOfBlock: this.entryOfBlock,
    });
    const entries = this.entryReader.readEntryPoints();
    this.runEntries = entries.filter((e) => e.origin === 'event' || e.origin === 'implicit');
    for (const entry of entries) this.buildEntryRegion(entry);
    for (const entry of this.entryReader.deferredModuleEntries(this.screenCalled)) this.buildEntryRegion(entry);
    // A callback's own walk can start another task, so this runs until the
    // walks name nothing new.
    for (let next = 0; next < this.callbacks.length; next++) {
      const entry = this.callbackEntry(this.callbacks[next]);
      if (entry) this.buildEntryRegion(entry);
    }
    // ADR-054, once every region is walked: an early end is only early where
    // something drawn would still have followed it.
    settleEarlyEnds(this.graph, {
      statements: this.statements,
      structure: this.structure,
      blockAt: this.blockAt,
      earlyEnds: this.earlyEnds,
      regionLast: this.regionLast,
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
    noteUnreachableSteps(this.graph, { statements: this.statements, cutOffBoundaries: this.cutOffBoundaries });
    // Roadmap 2.16, last: a lane holds node ids, and `foldTechnicalGateways`
    // is the pass that can still drop one.
    const lanes = buildLanes(this.graph, { statements: this.statements, evidence: this.evidence });
    // Roadmap 2.12, after every pass that can still drop a node.
    const luw = attachLuwStates(this.graph, {
      statements: this.statements, structure: this.structure, control: this.control, calls: this.calls,
    });

    return {
      nodes: this.graph.nodes,
      edges: this.graph.edges,
      regions: this.graph.regions,
      lanes,
      laneEvidence: this.evidence,
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
        entryOfBlock: this.entryOfBlock,
        reachedRoutines: this.reachedRoutines,
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

  /* ---------------- what the source declares ---------------- */

  private batchInputDetail(index: number): Record<string, string[]> {
    const call = this.batchInput.get(index);
    if (!call) return {};
    return {
      ...(call.screens.length ? { batchInputScreens: call.screens.map((s) => `${s.program} ${s.screen}`) } : {}),
      ...(call.fields.length ? { batchInputFields: [...new Set(call.fields.map((f) => f.raw))] } : {}),
    };
  }

  /* ---------------- D2: method calls ---------------- */

  /**
   * The registered handlers a `RAISE EVENT` runs: those declared for this event
   * of the raising class, of a class it inherits from, or of the interface the
   * statement names (`RAISE EVENT lif_x~ev`). In the order `SET HANDLER`
   * registered them — the order the runtime calls them in.
   */
  private handlersRaisedBy(statement: AbapStatement, inWalk = false): string[] {
    if (!this.boundHandlers.length) return [];
    if (inWalk) {
      // At the walk's `RAISE`: only a registration the walk has already passed.
      return this.handlersRaisedBy(statement).filter((key) => this.registeredInWalk.has(key));
    }
    return this.dispatch.handlersRaisedBy(statement);
  }

  /* ---------------- rule 4: the entry points ---------------- */

  /**
   * `CALL FUNCTION … STARTING NEW TASK … PERFORMING form ON END OF TASK` (or
   * `CALLING meth ON END OF TASK`) — the routine the **runtime** calls when the
   * asynchronous task ends.
   *
   * No `PERFORM` names it, so the call graph of 2.2 counts it as unreachable,
   * and until 27.09.2026 this file listed the one routine that takes the task's
   * results — `RECEIVE RESULTS`, the checks on them, the log — under "not
   * reached", although the statement right here names it as the thing that
   * runs. It is the same kind of evidence as a `MODULE … INPUT` (D1): a caller
   * outside the source's own flow, written down in the source. So it becomes an
   * entry of its own, and only once the walk has passed the call that names it:
   * a callback of a call nothing reaches is not reached either.
   *
   * It is not drawn at the call site as a sub-process on purpose. It does not
   * run there — the caller goes on at once, and the callback runs whenever the
   * task comes back — so a box in the caller's sequence would put it in an
   * order the program does not have.
   */
  private recordCallback(statement: AbapStatement): void {
    this.recordAlvCallbacks(statement);
    if (!/\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text)) return;
    const code = maskLiterals(statement.text);
    const form = /\bPERFORMING\s+([\w/]+)\s+ON\s+END\s+OF\s+TASK\b/i.exec(code);
    if (form) {
      const key = form[1].toUpperCase();
      if (this.formBlocks.has(key)) this.pushCallback(key, form[1], statement);
      return;
    }
    const method = /\bCALLING\s+(?:([\w/]+|<[\w/]+>)(->|=>))?([\w/~]+)\s+ON\s+END\s+OF\s+TASK\b/i.exec(code);
    if (!method) return;
    const { key, ambiguous } = this.dispatch.resolveMethod(method[1] ?? null, (method[2] as '->' | '=>' | undefined) ?? null,
      method[3].toUpperCase(), statement.index);
    if (key && !ambiguous && this.routineBlocks.has(key)) this.pushCallback(key, method[3], statement);
  }

  /**
   * SAP convention (ALV list/grid, type pool SLIS): the `REUSE_ALV_*` function
   * modules call back FORMs of the program named in `I_CALLBACK_PROGRAM`, and
   * the caller names each FORM as a **literal** — in a parameter
   * `I_CALLBACK_<event>` (`I_CALLBACK_USER_COMMAND`, `I_CALLBACK_PF_STATUS_SET`,
   * `I_CALLBACK_TOP_OF_PAGE`, `I_CALLBACK_HTML_TOP_OF_PAGE`, …) or in the
   * `FORM` column of the event table it passes as `IT_EVENTS` (`slis_alv_event`:
   * `NAME` is the event, `FORM` the routine, e.g. `TOP_OF_PAGE`).
   *
   * The ALV runtime performs those FORMs when the person presses a function
   * key or the list is drawn — no `PERFORM` of this source names them, so they
   * were listed as "not reached" although the call says in so many words that
   * they run. They become callbacks exactly like a FORM named `ON END OF TASK`:
   * an entry of their own once the walk has passed the call, with the
   * parameter as their trigger. Only where `I_CALLBACK_PROGRAM` is written
   * (without it the ALV calls back nothing) and does not name another program
   * by literal — the FORMs are looked up in that program.
   */
  private recordAlvCallbacks(statement: AbapStatement): void {
    const text = statement.text;
    if (!/^CALL\s+FUNCTION\s+'REUSE_ALV_[\w]*'/i.test(text)) return;
    const program = /\bI_CALLBACK_PROGRAM\s*=\s*('[^']*'|[\w/-]+)/i.exec(text);
    if (!program) return;
    if (!namesThisProgram(program[1], this.statements, programName(this.statements)?.name ?? null, statement)) return;
    for (const m of text.matchAll(/\b(I_CALLBACK_(?!PROGRAM\b)[\w]+)\s*=\s*'([\w/]+)'/gi)) {
      const key = m[2].toUpperCase();
      if (this.formBlocks.has(key)) this.pushCallback(key, m[2], statement, `ALV ${m[1].toUpperCase()}`);
    }
    const events = /\bIT_EVENTS\s*=\s*(<?[\w/]+>?)/i.exec(text);
    if (!events) return;
    // The event table is filled elsewhere in the source: `ls_event-form =
    // 'TOP_OF_PAGE'.` or `VALUE #( ( name = … form = 'TOP_OF_PAGE' ) )`. A
    // literal in a `FORM` component that names a FORM of this source is that
    // registration — but only in a statement that fills **this** table: one
    // that assigns the table itself, or a row of it (a `FORM = '…'` of any
    // other structure registers nothing).
    const rows = alvEventRows(this.statements, events[1].toUpperCase());
    for (const other of this.statements) {
      const target = /^(<?[\w/]+>?)(?:-[\w/-]+)?\s*\??=(?!=)/.exec(other.text)?.[1]?.toUpperCase()
        ?? assignmentTarget(other.text) ?? /^MODIFY\s+(?:TABLE\s+)?([\w/]+)/i.exec(other.text)?.[1]?.toUpperCase();
      if (!target || !rows.has(target)) continue;
      for (const m of other.text.matchAll(/(?:-|\s|\()FORM\s*=\s*'([\w/]+)'/gi)) {
        const key = m[1].toUpperCase();
        if (this.formBlocks.has(key)) this.pushCallback(key, m[1], statement, 'ALV IT_EVENTS');
      }
    }
  }

  private pushCallback(key: string, label: string, site: AbapStatement, trigger = 'ON END OF TASK'): void {
    if (this.callbacks.some((c) => c.key === key)) return;
    this.callbacks.push({ key, label, site, trigger });
    // Engine 3.2.0: the callback runs in the session that registered it, with what is registered here.
    if (this.reads320) this.registrationsAtCall.set(site.index, new Set(this.registeredInWalk));
  }

  /**
   * The entry a recorded callback opens — or `null` where the routine is
   * already drawn: a callback the source also performs is a sub-process of that
   * caller, and drawing it a second time as a beginning would be D3 again.
   */
  private callbackEntry(callback: { key: string; label: string; site: AbapStatement; trigger: string }): EntryPoint | null {
    const block = this.routineBlocks.get(callback.key);
    if (!block || this.reachedRoutines.has(callback.key) || this.entryOfBlock.has(block.openIndex)) return null;
    this.entryOfBlock.add(block.openIndex);
    return {
      statement: this.statements[block.openIndex],
      lastIndex: block.closeIndex - 1,
      endStatement: this.statements[Math.min(block.closeIndex, this.statements.length - 1)],
      label: callback.label,
      rank: RUNTIME_ORDER.length,
      implicit: false,
      origin: 'callback',
      // Determined, unlike the other entries that are not event blocks: the
      // statement that names it says what calls it.
      trigger: callback.trigger,
      site: callback.site.index,
    };
  }

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
    this.regionLast.set(region.key, entry.lastIndex);
    // What `SET HANDLER` registered holds only within one run. Every entry
    // that is called on its own — a function module, a method called from
    // outside, a screen module, a bare FORM, a callback, an event handler —
    // starts with nothing registered. The event blocks of a report are one
    // run: a block starts with what the blocks that run **before** it (runtime
    // order, rule 4 — not the order they are written in) register
    // unconditionally (`registeredBefore`).
    this.registeredInWalk = entry.origin === 'event' || entry.origin === 'implicit'
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
      if (this.canLeaveEarly(from, earlier.lastIndex)) continue;
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
      sites.push(...this.screenCallSites);
    } else if (entry.origin === 'callback' && entry.site !== undefined) {
      sites.push(entry.site);
    }
    for (const site of sites) for (const handler of this.registrationsAtCall.get(site) ?? []) out.add(handler);
    return out;
  }

  /** Does any statement between `from` and `to` leave the routine early? Conservative: anywhere counts. */
  private canLeaveEarly(from: number, to: number): boolean {
    for (let i = from; i <= to; i++) {
      const statement = this.statements[i];
      if (['CHECK', 'RETURN', 'EXIT', 'STOP', 'LEAVE'].includes(statement.keyword)) return true;
      if (isErrorMessage(statement.text, this.reads320) || raisesException(statement)) return true;
    }
    return false;
  }

  private routineRegion(name: string): SkeletonRegion | null {
    const known = this.regionOfRoutine.get(name);
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
    if (this.expanding.length >= MAX_PERFORM_EXPANSION) {
      this.graph.note('expansion-depth-reached', this.statements[block.openIndex],
        `${name} is performed ${MAX_PERFORM_EXPANSION} calls deep, in a chain that starts at `
        + `${this.expanding[0]}. The call is drawn; what this routine does is not read, `
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
    this.regionOfRoutine.set(name, region);

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
    const guarded = this.readGuard(from, to, region);
    const before = this.graph.nodes.length;
    this.regionLast.set(region.key, to);
    this.expanding.push(name);
    const registered = new Set(this.registeredInWalk);
    const exits = this.walkRange(guarded, to, {
      region, container: name, loops: [], loopBreaks: [],
    }, []);
    this.expanding.pop();
    // A routine that can leave before its end (`CHECK`, `RETURN`, `EXIT`,
    // `STOP`, `LEAVE`, an error end) may return without its `SET HANDLER`
    // having run — its registrations do not reach the caller. Its region is
    // also built once and reused, so what it registers is kept only where no
    // way out precedes it anywhere.
    if (this.canLeaveEarly(from, to)) this.registeredInWalk = registered;
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

  /**
   * A leading `CHECK` on nothing but selection-screen switches.
   *
   * `DESIGN.md` §5.8 draws it as a **conditional flow** into the routine rather
   * than as a gateway: `CHECK p_mail = abap_true.` is the switch "Mail" of the
   * run, not a decision the process takes. Returns the index the walk starts at.
   */
  private readGuard(from: number, to: number, region: SkeletonRegion): number {
    for (let i = from; i <= to; i++) {
      const statement = this.statements[i];
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (statement.keyword !== 'CHECK') return from;
      const condition = afterKeyword(statement);
      if (!this.isRunSwitch(condition)) return from;
      region.guard = { condition, anchor: anchorOf(statement) };
      return i + 1;
    }
    return from;
  }

  /** True when every name in the condition is a selection-screen name. */
  private isRunSwitch(condition: string): boolean {
    const names = condition.match(/[A-Za-z_/][\w/]*/g) ?? [];
    if (!names.length) return false;
    let seenSwitch = false;
    for (const raw of names) {
      const name = raw.toUpperCase();
      if (this.selectionNames.has(name)) { seenSwitch = true; continue; }
      if (SWITCH_CONSTANTS.has(name)) continue;
      return false;
    }
    return seenSwitch;
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
          const registered = new Set(this.registeredInWalk);
          if (block.kind === 'if' || block.kind === 'case') live = this.walkBranch(block, ctx, live);
          else if (block.kind === 'try') live = this.walkTry(block, ctx, live);
          else if (block.kind === 'at') live = this.walkGroupChange(block, ctx, live);
          else live = this.walkLoop(block, ctx, live);
          this.registeredInWalk = registered;
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
      const parallel = this.parallelGroupAt(i, to);
      if (parallel) {
        outputRun = null;
        live = this.walkParallel(parallel, ctx, live);
        i = parallel.resumeIndex;
        continue;
      }

      const produced = this.walkStatement(statement, ctx, live, outputRun);
      outputRun = produced.outputRun;
      live = produced.exits;
      i += 1;
    }
    return live;
  }

  /* ---------------- roadmap 2.17 (a) — parallelism ---------------- */

  /**
   * `CALL FUNCTION … STARTING NEW TASK` — the one statement ABAP proves
   * parallelism with.
   */
  private isAsyncCall(statement: AbapStatement): boolean {
    return /^CALL\s+FUNCTION\b/i.test(statement.text)
      && /\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text);
  }

  /**
   * `PERFORMING <form> ON END OF TASK` whose routine receives the result.
   *
   * The second of the two proofs 2.17 (a) accepts. The callback alone is not
   * one: a routine named on the statement says the runtime will call *something*
   * back, and only a `RECEIVE RESULTS` inside it says the result is taken.
   */
  private hasResultCallback(statement: AbapStatement): boolean {
    const name = /\bPERFORMING\s+'?([\w/]+)'?\s+ON\s+END\s+OF\s+TASK\b/i.exec(statement.text)?.[1];
    const block = name ? this.formBlocks.get(name.toUpperCase()) : undefined;
    if (!block) return false;
    const [from, to] = bodyRange(block);
    for (let i = from; i <= to; i++) {
      if (/^RECEIVE\s+RESULTS\b/i.test(this.statements[i].text)) return true;
    }
    return false;
  }

  /**
   * A fork of parallel tasks starting at `index` — roadmap 2.17 (a), or `null`.
   *
   * `DESIGN.md` §5.8 draws a parallel gateway *"only where the code proves
   * parallelism"*, and 2.17 says what that proof is: **two or more**
   * `STARTING NEW TASK` calls, and either a `WAIT UNTIL` that holds the caller
   * for them or a `RECEIVE RESULTS` in the routine one of them names
   * `ON END OF TASK`. A single `STARTING NEW TASK` stays a service task — one
   * task beside the caller is not a fork of the process.
   *
   * **The join is a separate question and needs the `WAIT UNTIL`.** Without one
   * the caller does not wait, so there is nothing to join at, and the reference
   * holding writes that shape: of 172 diagrams with parallelism, 91 carry only
   * one of the two halves. A join this reader added would be a statement about
   * the program that the program does not make.
   *
   * **The calls have to stand together.** Only declarative statements may come
   * between them, and between the last of them and the `WAIT UNTIL`. A step with
   * an effect in between means the caller does something on its own line that
   * this reader would have to put on one branch or another — and picking one
   * would be a sentence the source does not write. Then there is no fork and the
   * calls stay what they were: service tasks in a row, each anchored, nothing
   * lost. Corpus case CC-055 is the standing reminder of what the alternative
   * costs.
   */
  private parallelGroupAt(index: number, to: number): ParallelGroup | null {
    if (!this.isAsyncCall(this.statements[index])) return null;
    const members: number[] = [];
    let i = index;
    for (; i <= to; i++) {
      if (this.blockAt.has(i)) break;
      const statement = this.statements[i];
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (!this.isAsyncCall(statement)) break;
      members.push(i);
    }
    if (members.length < 2) return null;

    let joinIndex: number | null = null;
    for (let j = members[members.length - 1] + 1; j <= to; j++) {
      if (this.blockAt.has(j)) break;
      const statement = this.statements[j];
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (/^WAIT\b/i.test(statement.text)
        && (/\bUNTIL\b/i.test(statement.text) || /\bFOR\s+ASYNCHRONOUS\s+TASKS\b/i.test(statement.text))) {
        joinIndex = j;
      }
      break;
    }
    if (joinIndex === null && !members.some((m) => this.hasResultCallback(this.statements[m]))) return null;

    return {
      members,
      joinIndex,
      resumeIndex: (joinIndex ?? members[members.length - 1]) + 1,
    };
  }

  /**
   * The fork, its branches and — where the source waits — the join.
   *
   * Rule 6 holds for both gateways. The fork is named `STARTING NEW TASK`,
   * three words that stand in the source, and is anchored at the `STARTING`
   * token of the first call, which is the evidence it is drawn from; the join
   * carries the `WAIT` statement as the source writes it, anchored at it. A
   * parallel gateway carries no condition, here or in the file — it is not a
   * decision, which is why the kind is `parallel-gateway` and not `gateway`.
   */
  private walkParallel(group: ParallelGroup, ctx: WalkContext, incoming: Exit[]): Exit[] {
    const first = this.statements[group.members[0]];
    const fork = this.graph.addNode('parallel-gateway', 'STARTING NEW TASK',
      anchorOf(first, tokenIndexOf(first, /^STARTING$/i)), ctx.region, ctx.container, {
        detail: { direction: 'diverging', branches: group.members.length },
      });
    this.graph.connect(incoming, fork.id);

    const branchExits: Exit[] = [];
    for (const member of group.members) {
      branchExits.push(...this.walkStatement(this.statements[member], ctx,
        [{ from: fork.id, condition: '', kind: 'sequence' }], null).exits);
    }
    if (group.joinIndex === null) {
      // **The caller's continuation is not the exit of the tasks.** Handing the
      // branch exits back would let the walker hang the next statement of the
      // caller on them, and the diagram would then say the caller ran on *after
      // the tasks came back*. The source says the opposite — that is why there
      // is no `WAIT` in it. So the caller is one more branch of the same fork:
      // it runs concurrently with the tasks, and the asynchronous branches end
      // where the source stops speaking about them.
      this.graph.note('fork-without-join', first,
        `${group.members.length} tasks are started asynchronously and nothing in this source waits for them. `
        + 'The caller carries on at once, so no step after the fork depends on a result: the branches are drawn '
        + 'without a join, and where each task ends is outside this program.');
      return [{ from: fork.id, condition: '', kind: 'sequence' }];
    }

    const wait = this.statements[group.joinIndex];
    const join = this.graph.addNode('parallel-gateway', snippet(wait.text), anchorOf(wait),
      ctx.region, ctx.container, { detail: { direction: 'converging', branches: group.members.length } });
    this.graph.connect(branchExits, join.id);
    return [{ from: join.id, condition: '', kind: 'sequence' }];
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
    const callback = this.callbacks.find((c) => c.trigger === 'ALV I_CALLBACK_USER_COMMAND'
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
      const registered = this.registeredInWalk;
      this.registrationFrozen += 1;
      const walked = this.walkRange(block.openIndex + 1, block.closeIndex - 1, ctx, incoming);
      this.registrationFrozen -= 1;
      this.registeredInWalk = registered;
      return walked;
    }

    const label = branch.kind === 'case' ? (branch.selector ?? 'CASE') : snippet(opener.text);
    // D2: `IF lo->m( ) = …` runs the method before it decides.
    const before = this.walkMethodCalls(opener, ctx, incoming);
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
    const registered = new Set(this.registeredInWalk);
    for (let a = 0; a < branch.arms.length; a++) {
      this.registeredInWalk = new Set(registered);
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
        if (call?.key) { key = call.key; label = call.label; token = this.callToken(statement, call); }
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
      if (routine && this.declaresLocally(routine, table)) continue;
      return this.graph.addNode('task', table.toUpperCase(),
        anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${table}(?:\\[\\])?\\.?$`, 'i'))),
        ctx.region, ctx.container, {
          detail: { operation: statement.keyword, internalTable: true, collects: true },
        });
    }
    return null;
  }

  /**
   * Does this routine take `name` as a parameter — in its `FORM` line (`USING`, `CHANGING`, `TABLES`) or in the
   * `METHODS` line that declares it? A parameter is the routine's own variable, like one it declares.
   */
  private takesAsParameter(routine: Block, name: string): boolean {
    const key = name.toUpperCase().replace(/-.*$/, '');
    const word = new RegExp(`(?:^|[\\s:,(])${key.replace(/[/]/g, '\\/')}(?=[\\s).,]|$)`, 'i');
    // A parameter list without its types, so a type that happens to share the name is not read as a parameter.
    const parameters = (text: string) => text.replace(/\b(?:TYPE|LIKE)\s+(?:REF\s+TO\s+|(?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+)?[\w/-]+/gi, ' ');
    const opener = this.statements[routine.openIndex];
    const header = opener ? /^(FORM|METHOD)\s+([\w/~]+)\s*([\s\S]*)$/i.exec(opener.text.trim()) : null;
    if (!header) return false;
    if (header[1].toUpperCase() === 'FORM') return word.test(parameters(header[3]));
    const method = (header[2].split('~').pop() ?? header[2]).toUpperCase();
    return this.statements.some((statement) => {
      if (statement.keyword !== 'METHODS' && statement.keyword !== 'CLASS-METHODS') return false;
      const declared = /^(?:CLASS-)?METHODS\s+([\w/]+)\s*([\s\S]*)$/i.exec(statement.text.trim());
      return !!declared && declared[1].toUpperCase() === method && word.test(parameters(declared[2]));
    });
  }

  /** Does this routine declare `name` itself (`DATA name`, `DATA: …, name`, `DATA(name)`, `FIELD-SYMBOLS`)? */
  private declaresLocally(routine: Block, name: string): boolean {
    const key = name.toUpperCase().replace(/-.*$/, '');
    const word = new RegExp(`(?:^|[\\s:,(])${key.replace(/[/]/g, '\\/')}(?=[\\s).,]|$)`, 'i');
    for (let i = routine.openIndex + 1; i < routine.closeIndex; i++) {
      const statement = this.statements[i];
      if (!statement) continue;
      if ((statement.keyword === 'DATA' || statement.keyword === 'STATICS' || statement.keyword === 'FIELD-SYMBOLS') && word.test(statement.text.split(/\s+TYPE\s|\s+LIKE\s/i)[0])) return true;
      if (new RegExp(`\\b(?:DATA|FIELD-SYMBOL)\\(\\s*${key.replace(/[/]/g, '\\/')}\\s*\\)`, 'i').test(statement.text)) return true;
    }
    return false;
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
        && !this.constantNames().has(value.toUpperCase())) continue;
      if (value.startsWith("'") || value.startsWith('`')) {
        const text = value.slice(1, -1).replace(/''/g, "'").trim();
        if (/[A-Za-z]{2}/.test(text) && text.includes(' ')) texts.push(text);
      }
      if (this.decisionsReading(field, block).length) flags.push({ field, value, statement });
    }
    if (!flags.length) return null;
    const first = flags[0];
    const readAt = this.decisionsReading(first.field, block);
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

  /** Names this source declares with `CONSTANTS`, upper-cased — read once. */
  private constantNames(): Set<string> {
    if (this.constantsCache) return this.constantsCache;
    const out = new Set<string>();
    for (const statement of this.statements) {
      if (statement.keyword !== 'CONSTANTS') continue;
      const name = /^CONSTANTS\s*:?\s*(?:BEGIN\s+OF\s+)?([\w/]+)/i.exec(statement.text)?.[1];
      if (name) out.add(name.toUpperCase());
    }
    this.constantsCache = out;
    return out;
  }

  /**
   * The lines of the decisions outside `own` whose condition, selector or `CHECK` reads `field` — the same
   * variable, not only the same name: a decision in another routine counts only when neither routine declares
   * the field for itself or takes it as a parameter (`DATA lv_ok …` in two methods are two variables).
   */
  private decisionsReading(field: string, own: Block): number[] {
    const key = field.toUpperCase();
    const cached = this.flagReaderCache.get(key);
    const all = cached ?? this.computeDecisionsReading(key);
    if (!cached) this.flagReaderCache.set(key, all);
    const ownRoutine = this.routineAround(own.openIndex);
    return all
      .filter((r) => r.index < own.openIndex || r.index > own.closeIndex)
      .filter((r) => {
        const readerRoutine = this.routineAround(r.index);
        if (readerRoutine === ownRoutine) return true;
        const own = (routine: Block | null) => !!routine && (this.declaresLocally(routine, key) || this.takesAsParameter(routine, key));
        return !own(ownRoutine) && !own(readerRoutine);
      })
      .map((r) => r.line);
  }

  /** The innermost `FORM` or `METHOD` around statement `index`, or null outside any routine. */
  private routineAround(index: number): Block | null {
    const around = this.structure.enclosing[index] ?? [];
    for (let i = around.length - 1; i >= 0; i--) {
      if (around[i].kind === 'form' || around[i].kind === 'method') return around[i];
    }
    return null;
  }

  private computeDecisionsReading(key: string): Array<{ index: number; line: number }> {
    const escaped = key.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const reads = new RegExp(`(?<![\\w/<>-])${escaped}(?![\\w/-])`, 'i');
    const out: Array<{ index: number; line: number }> = [];
    for (const branch of this.control.branches) {
      const words = [branch.selector ?? '', ...branch.arms.map((arm) => arm.condition)];
      if (words.some((w) => reads.test(maskLiterals(w)))) {
        out.push({ index: branch.openIndex, line: this.statements[branch.openIndex]?.lineStart ?? 0 });
      }
    }
    for (const statement of this.statements) {
      if ((statement.keyword === 'CHECK' || statement.keyword === 'WHILE') && reads.test(maskLiterals(statement.text))) {
        out.push({ index: statement.index, line: statement.lineStart });
      }
    }
    return out;
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
   * The block kinds that make a `ctx.loops` entry — the ones `walkLoop` opens.
   * `EXIT`, `CONTINUE` and `CHECK` act on the innermost of them, which is what
   * `bodyStaysInLoop` has to know.
   */
  private innermostLoopBlock(index: number): Block | null {
    const enclosing = this.structure.enclosing[index] ?? [];
    for (let i = enclosing.length - 1; i >= 0; i--) {
      if (LOOP_BLOCKS.has(enclosing[i].kind)) return enclosing[i];
    }
    return null;
  }

  /**
   * Does the body of this `LOOP AT` stay inside the block — roadmap 2.17 (b)?
   *
   * This is the whole criterion of 2.17 (b), and it is asked of the
   * **statements**, not of the graph: a multi-instance activity contains its
   * body, and a sequence flow cannot leave a sub-process boundary, so the
   * marker is only honest where no statement of the body transfers control out
   * of the loop. `lib/bpmn/model.ts` decision 2 used to refuse the marker for
   * every loop on exactly that argument; 2.17 keeps the argument and narrows it
   * to the loops it is actually about.
   *
   * Three groups leave, and nothing else does:
   *
   * - `RETURN`, `STOP`, `RAISE`, an error `MESSAGE`, `LEAVE PROGRAM`,
   *   `LEAVE TO TRANSACTION` and a `SUBMIT` that does not come back: each of
   *   them leaves the routine or the program from wherever it stands;
   * - `EXIT` and `CHECK` and `CONTINUE` **of this loop** — `walkStatement` and
   *   `walkCheck` send all three at the innermost enclosing loop, so the ones
   *   that belong to a loop nested inside this one leave that one, not this;
   * - nothing else. A gateway, a `PERFORM`, a call, a read, a write and a
   *   nested loop all come back to the next statement of the body.
   */
  private bodyStaysInLoop(block: Block): boolean {
    for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
      const statement = this.statements[i];
      if (DECLARATIVE.has(statement.keyword) || statement.nativeSql) continue;
      const text = statement.text;
      if (statement.keyword === 'RETURN' || statement.keyword === 'STOP'
        || raisesException(statement) || isErrorMessage(text, this.reads320)
        || /^LEAVE\s+PROGRAM\b/i.test(text) || /^LEAVE\s+TO\s+TRANSACTION\b/i.test(text)
        || leavesDialogStep(text)) {
        return false;
      }
      if (statement.keyword === 'SUBMIT'
        && !/\bAND\s+RETURN\b/i.test(text) && !/\bVIA\s+JOB\b/i.test(text)) {
        return false;
      }
      if ((statement.keyword === 'EXIT' || statement.keyword === 'CONTINUE' || statement.keyword === 'CHECK')
        && this.innermostLoopBlock(i) === block) {
        return false;
      }
    }
    return true;
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
    if (block.kind === 'loop' && table && this.bodyStaysInLoop(block)) {
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
    const registered = new Set(this.registeredInWalk);
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
        if (cutOff) this.cutOffBoundaries.add(boundary.id);
      }
      const to = (handlers[h + 1] ?? block.closeIndex) - 1;
      this.registeredInWalk = new Set(registered);
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

  /* ---------------- one statement ---------------- */

  private walkStatement(
    statement: AbapStatement,
    ctx: WalkContext,
    incoming: Exit[],
    outputRun: SkeletonNode | null,
  ): { exits: Exit[]; outputRun: SkeletonNode | null } {
    const text = statement.text;
    const keep = (node: SkeletonNode): { exits: Exit[]; outputRun: null } => {
      this.graph.connect(incoming, node.id);
      return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: null };
    };

    if (statement.nativeSql) {
      // ADR-066. The body of an AMDP method (`METHOD m BY DATABASE PROCEDURE
      // … USING mseg.`) is one native statement that runs on the database —
      // one read step, of the database objects its USING clause names. What
      // the SQLScript does in detail is not read and not claimed.
      const opener = this.statements[statement.index - 1];
      const amdp = opener && AMDP_METHOD.exec(opener.text);
      if (!amdp) return { exits: incoming, outputRun: null };
      const tables = amdpTables(opener.text);
      // Without USING it touches no dictionary object, only what it is handed:
      // work done by the database, not a read of it.
      return keep(tables.length
        ? this.graph.addNode('read', tables[0], anchorOf(statement), ctx.region, ctx.container,
          { detail: { tables, amdp: true } })
        : this.graph.addNode('service-task', amdp[1].toUpperCase(), anchorOf(statement), ctx.region, ctx.container,
          { detail: { amdp: true, returns: true } }));
    }
    if (DECLARATIVE.has(statement.keyword)) {
      // `DATA(x) = lo->m( ).` declares and assigns in one: the assignment runs,
      // and with it the call on its right (D2).
      if (/^(?:DATA|FINAL)\(/i.test(text)) {
        return { exits: this.walkMethodCalls(statement, ctx, incoming), outputRun: null };
      }
      return { exits: incoming, outputRun: null };
    }

    // D2: `check( ).` or `exit( ).` inside a class is a call on a method of
    // that name, and must not be read as the keyword it spells.
    if (/^[\w/~]+\(/.test(text) && !/^(?:DATA|FINAL)\(/i.test(text)) {
      return { exits: this.walkMethodCalls(statement, ctx, incoming), outputRun: null };
    }

    /* Rule 5 — one keyword, three targets. */
    if (statement.keyword === 'CHECK') return { ...this.walkCheck(statement, ctx, incoming), outputRun: null };
    if (statement.keyword === 'CONTINUE' && ctx.loops.length) {
      this.leaveTo(incoming, ctx.loops[ctx.loops.length - 1], 'loop-back', 'continue-loop');
      return { exits: [], outputRun: null };
    }
    if (statement.keyword === 'EXIT' && ctx.loops.length) {
      ctx.loopBreaks[ctx.loopBreaks.length - 1].push(...incoming.map((e) => ({ ...e, reason: 'exit-loop' as const })));
      return { exits: [], outputRun: null };
    }
    if (statement.keyword === 'RETURN' || statement.keyword === 'EXIT' || statement.keyword === 'STOP') {
      const reason: SkeletonEdgeReason = statement.keyword === 'STOP' ? 'stop' : 'return';
      // ADR-054: each flow keeps the kind it arrived with — a `RETURN` straight
      // in an `IF` arm is that arm, conditional, with the condition on it.
      this.leaveEarly(statement, incoming, ctx, null, reason);
      return { exits: [], outputRun: null };
    }
    const leaving = leavesDialogStep(text);
    if (leaving) {
      // The dialog step ends here, from inside a loop or not — like `RETURN`.
      this.leaveEarly(statement, incoming, ctx, null, 'leave-screen', leaving);
      return { exits: [], outputRun: null };
    }

    /* Rule 3 — what comes back, and what does not. */
    if (statement.keyword === 'SUBMIT') {
      const returns = /\bAND\s+RETURN\b/i.test(text) || /\bVIA\s+JOB\b/i.test(text);
      const program = /^SUBMIT\s+(?:\(\s*([\w/]+)\s*\)|'([^']*)'|([\w/]+))/i.exec(text);
      const node = this.graph.addNode('call-activity',
        (program?.[2] ?? program?.[3] ?? program?.[1] ?? 'SUBMIT').toUpperCase(),
        anchorOf(statement, 1), ctx.region, ctx.container, {
          detail: { returns, viaJob: /\bVIA\s+JOB\b/i.test(text), dynamic: Boolean(program?.[1]) },
        });
      // 2.16: `VIA JOB` hands the run to a batch work process — a system, not a
      // person. The token is the two words the source writes.
      if (/\bVIA\s+JOB\b/i.test(text)) {
        this.recordEvidence('system', 'VIA JOB',
          anchorOf(statement, tokenIndexOf(statement, /^VIA$/i)), statement);
      }
      this.graph.connect(incoming, node.id);
      if (returns) return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: null };
      this.graph.edges.push({ from: node.id, to: ctx.region.endNodeId, kind: 'sequence', condition: '', reason: 'no-return' });
      return { exits: [], outputRun: null };
    }
    if (/^LEAVE\s+TO\s+TRANSACTION\b/i.test(text)) {
      const code = /TRANSACTION\s+'([^']*)'/i.exec(text)?.[1]?.toUpperCase();
      const node = this.graph.addNode('call-activity', code ?? 'LEAVE TO TRANSACTION',
        anchorOf(statement), ctx.region, ctx.container, { detail: { returns: false } });
      this.graph.connect(incoming, node.id);
      this.graph.edges.push({ from: node.id, to: ctx.region.endNodeId, kind: 'sequence', condition: '', reason: 'no-return' });
      return { exits: [], outputRun: null };
    }
    if (/^LEAVE\s+PROGRAM\b/i.test(text) || isErrorMessage(text, this.reads320) || raisesException(statement)) {
      const node = this.graph.addNode('end-error', this.errorLabel(statement), anchorOf(statement),
        ctx.region, ctx.container);
      this.graph.connect(incoming, node.id);
      return { exits: [], outputRun: null };
    }
    if (isRaiseEvent(text)) {
      // Rule 3: the handlers `SET HANDLER` registered are called and return.
      // Who they are is decided at run time, so the call stays opaque; the
      // label is the event's name, a token of the statement (rule 6).
      const event = /^RAISE\s+EVENT\s+([\w/~]+)/i.exec(text)?.[1]?.toUpperCase() ?? 'RAISE EVENT';
      // Unless the source binds them (`readEventHandlers`): then the event
      // runs those methods here, one after the other, and each is drawn as a
      // call on it would be — sub-process, one step, or folded as a helper.
      const handlers = this.handlersRaisedBy(statement, true);
      if (handlers.length) {
        let live = incoming;
        for (const key of handlers) {
          const impl = this.methodImpls.find((m) => m.key === key);
          live = this.callRoutine(key, impl?.name ?? key, anchorOf(statement, 2), ctx, live, {
            method: true, event,
            ...(impl ? { class: impl.cls } : {}),
          });
        }
        return { exits: live, outputRun: null };
      }
      return keep(this.graph.addNode('call-opaque', event, anchorOf(statement, 2), ctx.region, ctx.container, {
        detail: { event: true, dynamic: true, returns: true },
      }));
    }

    if (isInfoMessage(text, this.reads320)) {
      // D4: the popup is a person acting in the program — a user task, and
      // lane evidence of the same kind as `CALL SCREEN` (2.16 lists the popup
      // among the human evidence). Both tokens stand in the statement.
      const label = this.errorLabel(statement);
      // `MESSAGE i012(zsd)` names itself; `MESSAGE lv_text TYPE 'I'` names
      // only its type, and that is what the token then says.
      const id = (this.reads320 ? /^MESSAGE\s+i\d/i : /^MESSAGE\s+[iI]\d/).test(text) ? label : "TYPE 'I'";
      this.recordEvidence('human', `MESSAGE ${id}`, anchorOf(statement), statement);
      return keep(this.graph.addNode('user-task', label, anchorOf(statement), ctx.region, ctx.container, {
        detail: { message: 'I' },
      }));
    }

    if (statement.keyword === 'PERFORM') return { ...this.walkPerform(statement, ctx, incoming), outputRun: null };

    if (/^CALL\s+FUNCTION\b/i.test(text)) return { ...this.walkFunction(statement, ctx, incoming), outputRun: null };

    if (this.reads320 && ENHANCEMENT_CALL.test(text)) return { ...this.walkEnhancementCall(statement, ctx, incoming), outputRun: null };

    if (/^CALL\s+TRANSACTION\b/i.test(text)) {
      // The line alone does not name the statement: `CALL TRANSACTION 'VA01'.
      // CALL TRANSACTION 'ME21N'.` on one line labelled both VA01.
      // The call site carries its text.
      const call = this.calls.transactions.find(
        (t) => t.lineStart === statement.lineStart && t.text === statement.text,
      );
      const node = this.graph.addNode('transaction', call?.code ?? call?.codeExpression ?? 'CALL TRANSACTION',
        anchorOf(statement, 2), ctx.region, ctx.container, {
          detail: {
            batchInput: call?.batchInput ?? false,
            dynamic: call?.dynamic ?? true,
            // Roadmap 3.0.7: what the batch input fills, as the source writes
            // it — the screens (`SAPMM06E 1117`) and the screen fields
            // (`EKET-EEIND(01)`). Tokens only: which of them is a database
            // table is the catalogue's question (`evidence-model.ts`).
            ...this.batchInputDetail(statement.index),
            // Rule 3: batch input returns, and the caller goes on.
            returns: true,
          },
        });
      return keep(node);
    }
    if (/^CALL\s+SCREEN\b/i.test(text)) {
      this.screenCalled = true;
      // Engine 3.2.0: the screen's modules run in this session, with what is registered here.
      if (this.reads320) {
        this.screenCallSites.push(statement.index);
        this.registrationsAtCall.set(statement.index, new Set(this.registeredInWalk));
      }
      const screen = /^CALL\s+SCREEN\s+([\w/]+)/i.exec(text)?.[1] ?? 'CALL SCREEN';
      // 2.16: a dynpro is a person. The token is written the way the source
      // writes it, `SCREEN 9000`, and both words are in the statement.
      this.recordEvidence('human', `SCREEN ${screen.toUpperCase()}`, anchorOf(statement, 1), statement);
      return keep(this.graph.addNode('user-task', screen, anchorOf(statement, 2), ctx.region, ctx.container));
    }

    if (statement.keyword === 'SELECT' || isEmbeddedSelect(text)) {
      const tables = selectTables(text);
      if (tables.length) {
        return keep(this.graph.addNode('read', tables[0],
          anchorOf(statement, tokenIndexOf(statement, /^FROM$/i) + 1), ctx.region, ctx.container, {
            detail: { tables, single: /^SELECT\s+SINGLE\b/i.test(text) },
          }));
      }
      return { exits: incoming, outputRun: null };
    }
    const write = databaseWriteIn(text);
    if (write && isInternalWrite(this.localData, write)) {
      // Roadmap 3.0.7: a change to an internal table is a plain step of the
      // program — no SAP data store, no effect. `MODIFY gt_fieldcat FROM
      // gs_fieldcat` drawn as a write read as if the field catalogue were a
      // table of the system.
      return keep(this.graph.addNode('task', write.table.toUpperCase(),
        anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${write.table}$`, 'i'))),
        ctx.region, ctx.container, { detail: { operation: write.keyword, internalTable: true } }));
    }
    if (write) {
      return keep(this.graph.addNode('write', write.table.toUpperCase(),
        anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${write.table}$`, 'i'))),
        ctx.region, ctx.container, { detail: { operation: write.keyword } }));
    }

    const adbc = adbcExecution(text);
    if (adbc) {
      return keep(this.graph.addNode('call-opaque', adbc.method,
        anchorOf(statement, tokenIndexOf(statement, /EXECUTE_(?:UPDATE|QUERY|DDL)/i)),
        ctx.region, ctx.container, {
          detail: {
            nativeSql: true,
            // The SQL text is not in this statement, so neither is the table.
            ...(adbc.argument ? { statement: adbc.argument } : {}),
            returns: true,
          },
        }));
    }

    if (receivesResults(text)) {
      // ABAP keyword documentation, `RECEIVE RESULTS FROM FUNCTION`: the
      // receiving half of an asynchronous RFC. In the callback routine that
      // `STARTING NEW TASK … ON END OF TASK` names, it takes over what the
      // remote function module returned — a step with the other task, drawn
      // as the service task the starting call is, under the module's name.
      const name = /^RECEIVE\s+RESULTS\s+FROM\s+FUNCTION\s+'([^']+)'/i.exec(text)?.[1]?.toUpperCase();
      return keep(this.graph.addNode('service-task', name ?? 'RECEIVE RESULTS', anchorOf(statement, name ? 4 : 0),
        ctx.region, ctx.container, { detail: { receivesResults: true, returns: true } }));
    }

    if (closesDataset(statement)) {
      // ADR-066, note of 03.10.2026: `CLOSE DATASET` belongs to the file step
      // before it of the same file. Right behind that step's run it joins the
      // run's range; anywhere else (after a `TRANSFER` loop, after reading a
      // file) the step it belongs to is already drawn, and it draws nothing.
      const dataset = datasetOf(statement);
      if (outputRun?.detail?.target === 'file' && outputRun.anchor && dataset
        && this.fileRunDatasets.get(outputRun.id)?.has(dataset)) {
        outputRun.anchor.lineEnd = statement.lineEnd;
        (outputRun.detail as { statements: number }).statements += 1;
        return { exits: incoming, outputRun };
      }
      return { exits: incoming, outputRun: null };
    }

    if (isListOutput(statement) || isFileOutput(statement)) {
      const target = isFileOutput(statement) ? 'file' : 'list';
      const dataset = target === 'file' ? datasetOf(statement) : null;
      if (outputRun && outputRun.detail?.target === target && outputRun.anchor) {
        // A run of `WRITE` is one result list, not eight data objects. The run
        // keeps the anchor of its first statement (rule 2) and grows its range.
        outputRun.anchor.lineEnd = statement.lineEnd;
        const detail = outputRun.detail as { statements: number };
        detail.statements += 1;
        if (dataset) this.fileRunDatasets.get(outputRun.id)?.add(dataset);
        return { exits: incoming, outputRun };
      }
      const node = this.graph.addNode('output', statement.keyword, anchorOf(statement), ctx.region,
        ctx.container, { detail: { statements: 1, target } });
      if (target === 'file') this.fileRunDatasets.set(node.id, new Set(dataset ? [dataset] : []));
      this.graph.connect(incoming, node.id);
      return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: node };
    }

    if (this.macros.has(statement.keyword)) {
      return { ...this.walkMacroCall(statement, ctx, incoming), outputRun: null };
    }

    // Everything else is a move, a calculation or a commit boundary, and §5.8
    // gives none of them a BPMN element. `AUTHORITY-CHECK` is the deliberate
    // one: since 2.16 it is read here as **lane evidence** — it opens a lane for
    // the actor outside the program whose authorisation is checked — and it
    // still draws no step, because the checker executes no statement of this
    // program. Nothing about the graph changes here, which is what keeps the
    // fold of 2.15 and the CC-055 argument intact.
    if (statement.keyword === 'AUTHORITY-CHECK') {
      const object = /\bOBJECT\s+(?:'([^']*)'|`([^`]*)`|([\w/]+))/i.exec(text);
      const token = (object?.[1] ?? object?.[2] ?? object?.[3] ?? '').toUpperCase();
      if (token) {
        this.recordEvidence('authority', token,
          anchorOf(statement, tokenIndexOf(statement, /^OBJECT$/i) + 1), statement);
      }
    }
    if (statement.keyword === 'SET') this.recordHandlerRegistration(statement);
    // D2: a method call — the whole statement, or an operand of it.
    return { exits: this.walkMethodCalls(statement, ctx, incoming), outputRun: null };
  }

  /**
   * `SET HANDLER lo->on_click FOR go_grid` where `on_click` is declared `FOR
   * EVENT double_click OF cl_gui_alv_grid` and that class is **not** in this
   * source: the method is called by code outside the source, when that class
   * raises the event — no `RAISE EVENT` here will ever run it
   * (`handlersRaisedBy`). It is the same kind of evidence as `ON END OF TASK`
   * (`recordCallback`): the source registers a routine for the runtime to call
   * back, in so many words. So it becomes an entry of its own, once the walk
   * has passed the registration, with the event as its trigger — which the
   * declaration names, so it is determined. A handler of a class this source
   * holds is left to its `RAISE EVENT` — which runs it only once the walk has
   * passed this registration (`registeredInWalk`).
   * A handler the source may deregister anywhere is bound nowhere
   * (`readEventHandlers`), so it opens neither.
   */
  private recordHandlerRegistration(statement: AbapStatement): void {
    if (!this.boundHandlers.length) return;
    const handlers = this.dispatch.handlersSetBy(statement);
    if (!handlers || handlers.deregisters) return;
    for (const { key, name } of handlers) {
      if (!this.boundHandlers.includes(key)) continue;
      if (!this.registrationFrozen) this.registeredInWalk.add(key);
      const declared = this.handlerEvent.get(key);
      if (!declared || this.classNames.has(declared.of)) continue;
      this.pushCallback(key, name, statement, `EVENT ${declared.event} OF ${declared.of}`);
    }
  }

  private errorLabel(statement: AbapStatement): string {
    const id = /^MESSAGE\s+([\w-]+)/i.exec(statement.text)?.[1];
    if (id) return id.toUpperCase();
    const raised = /^RAISE\s+(?:EXCEPTION\s+TYPE\s+)?([\w/]+)/i.exec(statement.text)?.[1];
    return (raised ?? statement.keyword).toUpperCase();
  }

  private leaveTo(
    incoming: Exit[],
    to: string,
    kind: SkeletonEdgeKind,
    reason: SkeletonEdgeReason,
  ): void {
    for (const exit of incoming) {
      this.graph.edges.push({ from: exit.from, to, kind, condition: exit.condition, reason });
    }
  }

  /**
   * ADR-054 — an end event of its own for every early exit.
   *
   * `RETURN`, `EXIT` outside a loop and `STOP` used to lead to the one normal
   * end at the block's closing word, so a map showed a routine with five ways
   * out as a routine with one. Now each of them ends on its own statement, as
   * SAP Signavio models it and as the process benchmark expects it
   * (`tests/prozess-benchmark/`). A `CHECK` that leaves the block is not one of
   * them: `DESIGN.md` §5.8 draws it as a conditional flow rather than as an
   * element of its own, and it keeps leading to the normal end (`walkCheck`).
   * `LEAVE SCREEN`, `LEAVE TO SCREEN` and `LEAVE LIST-PROCESSING` leave the
   * block the same way a `RETURN` does and end the same way (`leavesDialogStep`).
   *
   * Rule 6 holds: the label is the keyword the source writes, the routine it
   * leaves travels in `detail.routine`, and the **condition** travels verbatim
   * on the flow into the event — the event itself says no phrase. `detail.early`
   * is what lets a view call it an early end rather than the normal one.
   *
   * Two things keep it from becoming clutter. Nothing reaching the statement
   * means nothing is drawn: a second `RETURN` straight behind a first one in the
   * same branch has no way in, and no second event. And an exit with nothing
   * drawn between it and the block's end is no early exit at all — that is
   * decided once the walk is complete, in `settleEarlyEnds`.
   */
  private leaveEarly(
    statement: AbapStatement,
    incoming: Exit[],
    ctx: WalkContext,
    kind: SkeletonEdgeKind | null,
    reason: SkeletonEdgeReason,
    /** The words that leave, where one keyword is not enough (`LEAVE TO SCREEN`). */
    words?: string,
  ): void {
    if (!incoming.length) return;
    const keyword = words ?? statement.keyword.toUpperCase();
    const node = this.graph.addNode('end', keyword, anchorOf(statement), ctx.region, ctx.container, {
      detail: { early: true, exit: keyword, routine: ctx.container ?? ctx.region.label },
    });
    for (const exit of incoming) {
      this.graph.edges.push({ from: exit.from, to: node.id, kind: kind ?? exit.kind, condition: exit.condition, reason });
    }
    this.earlyEnds.push({ node, statementIndex: statement.index, region: ctx.region });
  }

  /**
   * Rule 5. `CHECK` is not one edge with three meanings.
   *
   * Inside a `LOOP` the false path ends the iteration; inside a `FORM` it leaves
   * the routine; in an event block it leaves the block. The three are three
   * different edges with three different reasons, and a reader who clicks the
   * gateway has to be told which one this is.
   */
  private walkCheck(statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
    const condition = afterKeyword(statement);
    // D2: `CHECK lo->m( ) = …` runs the method before it decides.
    const before = this.walkMethodCalls(statement, ctx, incoming);
    const gateway = this.graph.addNode('gateway', snippet(statement.text), anchorOf(statement, 1),
      ctx.region, ctx.container, { detail: { source: 'CHECK', condition } });
    this.graph.connect(before, gateway.id);

    const falsePath: Exit[] = [{ from: gateway.id, condition: `NOT ( ${condition} )`, kind: 'conditional' }];
    if (ctx.loops.length) {
      this.leaveTo(falsePath, ctx.loops[ctx.loops.length - 1], 'loop-back', 'check-leaves-loop');
    } else if (ctx.region.kind === 'sub-process') {
      // ADR-054 leaves `CHECK` out on purpose: §5.8 draws it as a conditional
      // flow, not as an element, so its false path still leads to the normal end.
      this.leaveTo(falsePath, ctx.region.endNodeId, 'conditional', 'check-leaves-form');
    } else {
      this.leaveTo(falsePath, ctx.region.endNodeId, 'conditional', 'check-leaves-event');
    }
    return { exits: [{ from: gateway.id, condition, kind: 'conditional' }] };
  }

  /**
   * Rule 3. A `PERFORM` this source can follow opens a sub-process; one it
   * cannot is a `call-opaque` node — and the caller carries on after it, because
   * the routine returns.
   */
  private walkPerform(statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
    const call = this.calls.performs.find(
      (p) => p.lineStart === statement.lineStart && p.text === statement.text,
    );
    const target = call?.target;
    const local = target && !call?.program && this.formBlocks.has(target);

    if (!local) {
      const node = this.graph.addNode('call-opaque',
        target ?? call?.text ?? 'PERFORM', anchorOf(statement, 1), ctx.region, ctx.container, {
          detail: {
            dynamic: call?.dynamic ?? false,
            ...(call?.program ? { program: call.program } : {}),
            // The source of the routine is not here. The flow still returns.
            returns: true,
          },
        });
      this.graph.connect(incoming, node.id);
      return { exits: [{ from: node.id, condition: '', kind: 'sequence' }] };
    }

    return { exits: this.callRoutine(target, target, anchorOf(statement, 1), ctx, incoming) };
  }

  /**
   * A call into a routine of this source — a `PERFORM` on a local form, or
   * since D2 a call on a method this source implements. One behaviour for both,
   * because §5.8 names them in one breath ("a `FORM`/method with an effect of its
   * own"): a routine without an effect of its own is folded into its caller
   * (technical helper), one with an effect opens a sub-process, a small one is
   * collapsed afterwards (`collapseSmallRegions`), and recursion stops at the
   * region already being built.
   */
  private callRoutine(
    key: string,
    label: string,
    at: NodeAnchor,
    ctx: WalkContext,
    incoming: Exit[],
    extra: Record<string, string | number | boolean | string[]> = {},
  ): Exit[] {
    this.markReached(key);
    if (this.helpers.has(key)) {
      // §5.8: a routine without an effect of its own is part of its caller.
      return incoming;
    }

    const region = this.routineRegion(key);
    const block = this.routineBlocks.get(key);
    const effects = this.effects.get(key) ?? new Set<FormEffect>();
    const onlyRule = effects.size === 1 && effects.has('business-rule');
    // Rule 2: the anchor of the call is the call, not the routine. The routine's
    // own range travels alongside it as the secondary one, so a reader can jump
    // to the definition without the node pretending to live there.
    const anchor: NodeAnchor = {
      ...at,
      ...(block
        ? { secondary: { lineStart: block.lineStart, lineEnd: block.lineEnd, reason: 'routine-definition' as const } }
        : {}),
    };
    const node = this.graph.addNode(onlyRule ? 'business-rule-task' : 'sub-process', label,
      anchor, ctx.region, ctx.container, {
        ...(region ? { expandsTo: region.key } : {}),
        detail: { effects: [...effects], ...extra },
      });
    this.graph.connect(incoming, node.id);
    return [{ from: node.id, condition: '', kind: 'sequence' }];
  }

  /**
   * D2 — the method calls of one statement.
   *
   * §5.8 draws "a `FORM`/method with an effect of its own" as a collapsed
   * sub-process, and until 27.09.2026 `CALL METHOD`, `x->m( … ).` and their
   * relatives fell into the branch for moves and calculations: no node at all.
   * Three cases, and where the line between them runs:
   *
   * - **The statement is the call** (`CALL METHOD …`, `lo->m( … ).`): a method
   *   this source implements opens a sub-process exactly like a `PERFORM` on a
   *   local form; one it does not implement — or cannot pick, because two
   *   classes implement the name and the call does not say which — is a
   *   `call-opaque` node that returns, exactly like a `PERFORM` into another
   *   program. A statement that consists of a call exists only for what the
   *   call does, so it is drawn even when the reader cannot see inside.
   * - **The call is an operand** (`lv = lo->m( )`, `IF lo->m( ) = …`): drawn only
   *   when the method is implemented here **and has an effect of its own**,
   *   as a sub-process before the statement, because it runs before the value
   *   is used. An operand the reader cannot see into is overwhelmingly a getter
   *   or a conversion — drawing every one of them would bury the process in
   *   boxes that say nothing, and the statement around it is still what it was.
   * - **A constructor** (`NEW cls( )`, `CREATE OBJECT`) is an operand of that
   *   kind: nothing unless this source implements `constructor` with an effect
   *   of its own — then that effect happens here, and hiding it would lose a
   *   read or a write the program does.
   *
   * A method body reached this way is not also an entry (`methodEntries`).
   */
  private walkMethodCalls(statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): Exit[] {
    let live = incoming;
    for (const call of this.dispatch.methodCallsIn(statement)) {
      const at = anchorOf(statement, this.callToken(statement, call));
      if (call.key && this.routineBlocks.has(call.key)) {
        if (!call.standalone && this.helpers.has(call.key)) {
          this.markReached(call.key);
          continue;
        }
        const impl = this.methodImpls.find((m) => m.key === call.key);
        live = this.callRoutine(call.key, impl?.name ?? call.name, at, ctx, live, {
          method: true,
          ...(impl ? { class: impl.cls } : {}),
          ...(call.constructor ? { constructor: true } : {}),
        });
        continue;
      }
      if (!call.standalone) continue;
      if (this.drawsAlternatives(call)) {
        live = this.walkAlternatives(call, at, ctx, live);
        continue;
      }
      if (call.dynamic) {
        this.graph.note('dynamic-call', statement,
          'The name of the method is computed at run time. The call is drawn, its target is not claimed.');
      }
      // Engine 3.2.0: the candidates of this call run inside it, with what is registered here.
      if (this.reads320 && call.ambiguous) this.registrationsAtCall.set(statement.index, new Set(this.registeredInWalk));
      const node = this.graph.addNode('call-opaque', call.label, at, ctx.region, ctx.container, {
        detail: {
          method: true,
          dynamic: call.dynamic,
          ...(call.ambiguous ? { ambiguous: true } : {}),
          // Engine 3.2.0: which implementations the call can reach — each is drawn as a beginning of its own.
          ...(this.reads320 && call.candidates.length ? { candidates: call.candidates } : {}),
          // The source of the method is not here, or not one of several. The
          // flow still returns.
          returns: true,
        },
      });
      this.graph.connect(live, node.id);
      live = [{ from: node.id, condition: '', kind: 'sequence' }];
    }
    return live;
  }

  /**
   * Engine 3.2.0 (AB-15b): does the walk draw this call's implementations as alternatives where the call stands? A
   * call that can reach two to `MAX_ALTERNATIVES` implementations the program defines does. One that can reach more
   * stays the opaque call that names its candidates — a candidate set that wide would flood the map at the call;
   * each candidate is a beginning of its own either way (`candidateEntries`).
   */
  private drawsAlternatives(call: MethodCall): boolean {
    return this.reads320 && call.ambiguous && call.typed && !call.dynamic && call.candidates.length >= 2
      && call.candidates.length <= MAX_ALTERNATIVES && call.candidates.every((key) => this.routineBlocks.has(key));
  }

  /**
   * Engine 3.2.0 (AB-15b): a call with several implementations the program defines, drawn as its alternatives.
   * Which one runs is decided at run time by the class of the object, and the source does not say (D2: never a
   * guess) — so the call is an exclusive gateway named as the call, with one arm per implementation, conditioned on
   * its class. Each arm is a call activity into that implementation, which stays drawn where it was before: as a
   * beginning of its own (`candidateEntries`, trigger `candidate of …`) or as the sub-process of a call that reaches
   * it for certain. The arms meet after the call. Before AB-15b the call was one opaque node and the reader had to
   * find its implementations among the beginnings.
   */
  private walkAlternatives(call: MethodCall, at: NodeAnchor, ctx: WalkContext, incoming: Exit[]): Exit[] {
    // The candidates run inside this call, with what is registered here (as for the opaque call).
    this.registrationsAtCall.set(at.statementIndex, new Set(this.registeredInWalk));
    const gateway = this.graph.addNode('gateway', call.label, at, ctx.region, ctx.container, {
      detail: { method: true, alternatives: call.candidates.length, ambiguous: true, candidates: call.candidates },
    });
    this.graph.connect(incoming, gateway.id);
    const exits: Exit[] = [];
    for (const key of call.candidates) {
      const impl = this.methodImpls.find((m) => m.key === key);
      const block = this.routineBlocks.get(key);
      const anchor: NodeAnchor = {
        ...at,
        ...(block ? { secondary: { lineStart: block.lineStart, lineEnd: block.lineEnd, reason: 'routine-definition' as const } } : {}),
      };
      const node = this.graph.addNode('call-activity', key, anchor, ctx.region, ctx.container, {
        detail: { method: true, alternativeOf: call.label, implementation: key, ...(impl ? { class: impl.cls } : {}) },
      });
      this.graph.connect([{ from: gateway.id, condition: impl?.cls ?? key, kind: 'conditional' }], node.id);
      exits.push({ from: node.id, condition: '', kind: 'sequence' });
    }
    return exits;
  }

  /** The token a method call's node points at — the one that names the method. */
  private callToken(statement: AbapStatement, call: MethodCall): number {
    if (/^CALL\s+METHOD\b/i.test(statement.text) && call.standalone) return 2;
    const name = call.constructor ? 'NEW' : call.name.replace(/[^\w/~]/g, '');
    const tokens = statement.text.split(' ');
    const at = tokens.findIndex((t) => new RegExp(`(?:^|->|=>)${name.replace(/[/~]/g, '\\$&')}\\(`, 'i').test(t)
      || (call.constructor && /^(?:NEW|OBJECT)$/i.test(t)));
    return at < 0 ? 0 : at;
  }

  /**
   * `CALL FUNCTION` — a service, send, user or file task by the module it names,
   * plus §5.8's error boundary when the call declares `EXCEPTIONS` and the code
   * right after it branches on `sy-subrc`.
   *
   * Rule 7 in one statement: those are two nodes on the same lines, told apart
   * by their slot and by the token the anchor points at.
   */
  private walkFunction(statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
    const call = this.calls.functionModules.find(
      (f) => f.lineStart === statement.lineStart && f.text === statement.text,
    );
    const kind = functionTaskKind(call?.name);
    const label = call?.name
      ?? /^CALL\s+FUNCTION\s+([\w/-]+)/i.exec(statement.text)?.[1]?.toUpperCase()
      ?? 'CALL FUNCTION';
    const node = this.graph.addNode(kind, label, anchorOf(statement, 2), ctx.region, ctx.container, {
      detail: {
        bapi: call?.bapi ?? false,
        dynamic: call?.dynamic ?? false,
        ...(call?.destination ? { destination: call.destination } : {}),
        inUpdateTask: call?.inUpdateTask ?? false,
        startingNewTask: call?.startingNewTask ?? false,
        // Rule 3: a synchronous RFC comes back. Only an asynchronous one does not
        // hold the caller, and it still returns to the next statement.
        returns: true,
      },
    });
    this.graph.connect(incoming, node.id);
    this.readLaneEvidence(statement, kind, label, call?.destination);
    this.recordCallback(statement);
    const exits: Exit[] = [{ from: node.id, condition: '', kind: 'sequence' }];

    if (/\bEXCEPTIONS\b/i.test(statement.text) && this.handlesSubrcAfter(statement.index)) {
      const boundary = this.graph.addNode('error-boundary', label,
        anchorOf(statement, tokenIndexOf(statement, /^EXCEPTIONS$/i)), ctx.region, ctx.container, {
          detail: { attachedTo: node.id, exceptions: this.exceptionNames(statement.text) },
        });
      this.graph.edges.push({ from: node.id, to: boundary.id, kind: 'boundary', condition: '' });
      exits.push({ from: boundary.id, condition: '', kind: 'sequence' });
    }
    return { exits };
  }

  /**
   * Engine 3.2.0 — `CALL BADI lo_badi->method …` and `CALL CUSTOMER-FUNCTION '001' …`: a call into an enhancement
   * outside this source. `CALL BADI` runs every active implementation of the BAdI method — which ones is configured
   * in the system, not written here; `CALL CUSTOMER-FUNCTION 'nnn'` runs the customer exit `EXIT_<program>_nnn` when
   * an enhancement project activates it. Both return. Drawn as a service task, exactly as a `CALL FUNCTION` whose
   * module is not in this source is (the statement reveals the kind — a service another unit performs — and the
   * implementation is elsewhere; `detail.enhancement` says which kind of enhancement). Before 3.2.0 neither drew
   * anything, and a check or a posting the program delegates to its enhancement was missing from the map.
   * `EXCEPTIONS` with a `sy-subrc` check right after it hangs the error boundary on the call, as on a function call.
   */
  private walkEnhancementCall(statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
    const badi = /^CALL\s+BADI\s+([\w/]+|<[\w/]+>)->([\w/~]+)/i.exec(maskLiterals(statement.text));
    const exit = /^CALL\s+CUSTOMER-FUNCTION\s+'(\d+)'/i.exec(statement.text);
    const label = badi ? `${badi[1]}->${badi[2]}`.toUpperCase() : exit ? `CUSTOMER-FUNCTION ${exit[1]}` : statement.keyword;
    const node = this.graph.addNode('service-task', label, anchorOf(statement, 2), ctx.region, ctx.container, {
      detail: { enhancement: badi ? 'badi' : 'customer-function', ...(badi ? { method: true } : {}), returns: true },
    });
    this.graph.connect(incoming, node.id);
    const exits: Exit[] = [{ from: node.id, condition: '', kind: 'sequence' }];
    if (/\bEXCEPTIONS\b/i.test(statement.text) && this.handlesSubrcAfter(statement.index)) {
      const boundary = this.graph.addNode('error-boundary', label,
        anchorOf(statement, tokenIndexOf(statement, /^EXCEPTIONS$/i)), ctx.region, ctx.container, {
          detail: { attachedTo: node.id, exceptions: this.exceptionNames(statement.text) },
        });
      this.graph.edges.push({ from: node.id, to: boundary.id, kind: 'boundary', condition: '' });
      exits.push({ from: boundary.id, condition: '', kind: 'sequence' });
    }
    return { exits };
  }

  /**
   * Does the statement right after this one read `sy-subrc`? §5.8 asks for it.
   *
   * Within the window of two, a statement in between is looked past only when
   * it cannot set `sy-subrc` — a declaration or a CLEAR. Any other statement
   * overwrites it: `CALL FUNCTION 'F1' … EXCEPTIONS …. CALL FUNCTION 'F2'. IF
   * sy-subrc …` checks F2, and hung a boundary on F1.
   */
  private handlesSubrcAfter(index: number): boolean {
    for (let i = index + 1; i <= index + 2 && i < this.statements.length; i++) {
      const next = this.statements[i];
      if (['IF', 'CASE', 'CHECK'].includes(next.keyword) && /\bsy-subrc\b/i.test(next.text)) return true;
      if (!SUBRC_NEUTRAL.test(next.text)) return false;
    }
    return false;
  }

  private exceptionNames(text: string): string[] {
    const tail = /\bEXCEPTIONS\b([\s\S]*)$/i.exec(text)?.[1] ?? '';
    return [...tail.matchAll(/([\w_]+)\s*=\s*\d+/g)].map((m) => m[1].toUpperCase());
  }

  /**
   * Rule 2. A macro takes effect where it is used, not where it is written.
   *
   * The body is expanded by the compiler, so every node it produces is anchored
   * at the **call site**; the line range inside the `DEFINE` travels as a
   * secondary anchor. Only the leaf effects of the body are read — a branch
   * inside a macro is what 2.1 already refuses to draw, and drawing a gateway
   * whose condition contains `&1` would be inventing the argument.
   */
  private walkMacroCall(statement: AbapStatement, ctx: WalkContext, incoming: Exit[]): { exits: Exit[] } {
    const macro = this.macros.get(statement.keyword);
    if (!macro) return { exits: incoming };
    this.graph.note('macro-call', statement,
      `The body of macro ${statement.keyword} is expanded here by the compiler. Its effects are anchored at this call site; the definition is a secondary range.`);

    let live = incoming;
    for (let i = macro.block.openIndex + 1; i < macro.block.closeIndex; i++) {
      const body = this.statements[i];
      const node = this.macroEffectNode(body, statement, ctx);
      if (!node) continue;
      this.graph.connect(live, node.id);
      live = [{ from: node.id, condition: '', kind: 'sequence' }];
    }
    return { exits: live };
  }

  private macroEffectNode(
    body: AbapStatement,
    site: AbapStatement,
    ctx: WalkContext,
  ): SkeletonNode | null {
    const at = (kind: SkeletonNodeKind, label: string, detail?: SkeletonNode['detail']) =>
      this.graph.addNode(kind, label, {
        ...anchorOf(site),
        secondary: { lineStart: body.lineStart, lineEnd: body.lineEnd, reason: 'macro-definition' },
      }, ctx.region, ctx.container, { detail: { ...(detail ?? {}), fromMacro: site.keyword } });

    const write = databaseWriteIn(body.text);
    if (write && isInternalWrite(this.localData, write)) {
      return at('task', write.table.toUpperCase(), { operation: write.keyword, internalTable: true });
    }
    if (write) return at('write', write.table.toUpperCase(), { operation: write.keyword });
    if (body.keyword === 'SELECT') {
      const tables = selectTables(body.text);
      if (tables.length) return at('read', tables[0], { tables });
    }
    const fm = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(body.text);
    if (fm) {
      const name = fm[1].toUpperCase();
      return at(functionTaskKind(name), name);
    }
    if (isErrorMessage(body.text, this.reads320)) return at('end-error', this.errorLabel(body));
    if (isInfoMessage(body.text, this.reads320)) return at('user-task', this.errorLabel(body), { message: 'I' });
    if (isListOutput(body) || isFileOutput(body)) {
      return at('output', body.keyword, { statements: 1, target: isFileOutput(body) ? 'file' : 'list' });
    }
    return null;
  }

  /* ---------------- after the walk ---------------- */

  /* ---------------- roadmap 2.16 — who acts ---------------- */

  /**
   * One piece of lane evidence, recorded where the walk reads it.
   *
   * Deduplicated by statement, kind and token: a routine performed from three
   * places is walked three times, and one `AUTHORITY-CHECK` written once is one
   * piece of evidence however often the flow passes it.
   */
  private recordEvidence(
    kind: LaneEvidenceKind,
    token: string,
    anchor: NodeAnchor,
    statement: AbapStatement,
  ): void {
    const key = `${anchor.statementIndex}|${kind}|${token}`;
    if (this.evidenceSeen.has(key)) return;
    this.evidenceSeen.add(key);
    this.evidence.push({ kind, token, anchor, statement: statement.keyword });
  }

  /**
   * What a `CALL FUNCTION` says about who acts — 2.16, three of the four kinds.
   *
   * The *kind* of the node is the evidence for a person: `functionTaskKind`
   * already decided `user-task` from the §5.8 list of function modules a person
   * looks at or answers (ALV, `POPUP_*`, `F4IF_*`), and reading that decision
   * here rather than matching the names a second time keeps one rule in one
   * place. `IN UPDATE TASK`, `IN BACKGROUND TASK` and `DESTINATION` are read off
   * the statement, in the words the source writes them in.
   */
  private readLaneEvidence(
    statement: AbapStatement,
    kind: SkeletonNodeKind,
    label: string,
    destination: string | undefined,
  ): void {
    const text = statement.text;
    if (kind === 'user-task') {
      this.recordEvidence('human', label, anchorOf(statement, 2), statement);
    }
    if (/\bIN\s+UPDATE\s+TASK\b/i.test(text)) {
      this.recordEvidence('system', 'UPDATE TASK',
        anchorOf(statement, tokenIndexOf(statement, /^UPDATE$/i)), statement);
    }
    if (/\bIN\s+BACKGROUND\s+TASK\b/i.test(text)) {
      this.recordEvidence('system', 'BACKGROUND TASK',
        anchorOf(statement, tokenIndexOf(statement, /^BACKGROUND$/i)), statement);
    }
    if (destination) {
      // Recorded, never a lane: another system is a collapsed pool (§5.8), and
      // `lib/bpmn/model.ts` has drawn it as one since 2.6.
      this.recordEvidence('foreign-system', destination.toUpperCase(),
        anchorOf(statement, tokenIndexOf(statement, /^DESTINATION$/i) + 1), statement);
    }
  }

  /* ---------------- roadmap 2.15 ---------------- */

  /** A routine the walk calls runs, and so does everything it calls in turn. */
  private markReached(name: string): void {
    const queue = [name];
    while (queue.length) {
      const next = queue.pop() as string;
      if (this.reachedRoutines.has(next)) continue;
      this.reachedRoutines.add(next);
      queue.push(...(this.performedFrom.get(next) ?? []));
    }
  }

}


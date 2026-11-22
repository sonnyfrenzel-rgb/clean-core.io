import { afterKeyword, maskLiterals, withParsedSource, type AbapStatement, type SourceRange } from './statement-reader';
import { type Block, type BlockStructure } from './block-structure';
import { type Branch, type ControlFlowReport } from './control-flow';
import { type CallGraphReport } from './call-graph';
import { databaseWriteIn, writesDatabaseOnly, type SqlWrite } from './open-sql-discrimination';
import { namesThisProgram } from './callback-registrations';
import { readDecisionTable } from './decision-table';
import { readReferenceTypes, resolveMethodTarget } from './method-resolution';
import { candidatesForCall, readClassHierarchy, type ClassHierarchy } from './class-hierarchy';
import { buildProcessFacts, type ProcessFacts } from './process-facts';
import { type LuwEvent, type UpdateRegistration } from './luw-states';
import { localDataObjectsOf } from './table-dependencies';
import { readBatchInputFrom, type BatchInputCall } from './batch-input';
import { engineReads310Apply } from './engine-reads-310-gate';
import { engineReads320Apply } from './engine-reads-320-gate';
import { APP_VERSION } from '../version';
import { SkeletonGraph, type Exit, type SkeletonReadings } from './skeleton/graph';
import { anchorOf, bodyRange, programName, snippet, tokenIndexOf } from './skeleton/anchors';
import { buildLanes } from './skeleton/lanes';
import { RANK_END_OF_SELECTION, RANK_GET, RANK_START_OF_SELECTION } from './skeleton/keywords';
import { chainReportEvents } from './skeleton/report-chain';
import { addSubProcessStarts, markEmptyEntries } from './skeleton/starts';
import { noteUnreachableSteps } from './skeleton/unreachable-notes';
import { attachLuwStates } from './skeleton/luw';
import { notDrawn } from './skeleton/not-drawn';
import { foldTechnicalGateways } from './skeleton/technical-gateways';
import { applyGuards } from './skeleton/guards';

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
 * Engine 3.2.0: the trigger of an entry that one of the source's own calls can reach without saying so for certain
 * (`candidateTrigger`): `candidate of MO_STATE->HANDLE@104 (1 of 3)` — the call as the source writes it, its line,
 * and how many implementations it can reach.
 */
const CANDIDATE_TRIGGER = 'candidate of ';

/**
 * Engine 3.2.0 (AB-15b): the most implementations a call draws as alternatives where it stands
 * (`drawsAlternatives`). A call that can reach more is the opaque call naming its candidates. A design bound, not a
 * measured one: no call of the benchmark's learning halves reaches more than three.
 */
const MAX_ALTERNATIVES = 4;

/** Engine 3.2.0: the two statements that call an enhancement outside this source (`walkEnhancementCall`). */
const ENHANCEMENT_CALL = /^CALL\s+(?:BADI|CUSTOMER-FUNCTION)\b/i;

/** The classic event blocks, in the order ABAP runs them (rule 4). */
const RUNTIME_ORDER: Array<{ test: RegExp; rank: number }> = [
  { test: /^LOAD-OF-PROGRAM$/i, rank: 0 },
  { test: /^INITIALIZATION$/i, rank: 1 },
  { test: /^AT\s+SELECTION-SCREEN\s+OUTPUT\b/i, rank: 2 },
  { test: /^AT\s+SELECTION-SCREEN\s+ON\b/i, rank: 3 },
  { test: /^AT\s+SELECTION-SCREEN\b/i, rank: 4 },
  { test: /^START-OF-SELECTION$/i, rank: 5 },
  { test: /^GET\b/i, rank: 6 },
  { test: /^END-OF-SELECTION$/i, rank: 7 },
  { test: /^TOP-OF-PAGE\b/i, rank: 8 },
  { test: /^END-OF-PAGE$/i, rank: 9 },
  { test: /^AT\s+LINE-SELECTION$/i, rank: 10 },
  { test: /^AT\s+USER-COMMAND$/i, rank: 11 },
  { test: /^AT\s+PF\d/i, rank: 12 },
];


/**
 * `GET` is the one event keyword that is also an ordinary statement.
 * `GET TIME.` reads exactly like `GET <node>.`, so the second word decides.
 */
const GET_NOT_AN_EVENT = new Set([
  'TIME', 'PARAMETER', 'BADI', 'REFERENCE', 'BIT', 'RUN', 'LOCALE',
  'PF-STATUS', 'PROPERTY', 'CURSOR', 'DATASET', 'PERMISSIONS',
]);

const EVENT_WORDS = new Set([
  'INITIALIZATION', 'START-OF-SELECTION', 'END-OF-SELECTION', 'LOAD-OF-PROGRAM',
  'TOP-OF-PAGE', 'END-OF-PAGE',
]);

const AT_EVENT = /^AT\s+(?:SELECTION-SCREEN\b|LINE-SELECTION\b|USER-COMMAND\b|PF\d)/i;

/** Statements that never set `sy-subrc`, so a check after them still checks the one before. */
const SUBRC_NEUTRAL = /^(?:(?:DATA|TYPES|CONSTANTS|STATICS|FIELD-SYMBOLS)\s+[\w/<]|(?:CLEAR|FREE)\s)/i;

/** Statements that declare rather than do. None of them is a step. */
const DECLARATIVE = new Set([
  'REPORT', 'PROGRAM', 'FUNCTION-POOL', 'TABLES', 'TYPES', 'DATA', 'CONSTANTS',
  'FIELD-SYMBOLS', 'PARAMETERS', 'SELECT-OPTIONS', 'SELECTION-SCREEN', 'RANGES',
  'STATICS', 'CLASS-DATA', 'TYPE-POOLS', 'INFOTYPES', 'NODES', 'INCLUDE',
  'DEFINE', 'END-OF-DEFINITION', 'ENDFORM', 'ENDMODULE', 'ENDMETHOD',
  'ENDCLASS', 'ENDINTERFACE', 'CONTROLS', 'TYPE-POOL',
]);

/**
 * Everything `DECLARATIVE` holds, plus the words that open and close a named
 * region and the words a class or interface body declares with. A source in
 * which every statement is one of these **runs nothing** — roadmap 2.14 calls
 * that "not applicable" and says so, rather than returning zero steps in
 * silence. `METHOD`/`ENDMETHOD` belong here: an interface names methods and
 * implements none.
 */
const DECLARES = new Set([
  ...DECLARATIVE,
  'CLASS', 'INTERFACE', 'METHOD', 'FUNCTION', 'ENDFUNCTION', 'FORM', 'MODULE',
  'PUBLIC', 'PROTECTED', 'PRIVATE', 'METHODS', 'CLASS-METHODS', 'INTERFACES',
  'ALIASES', 'EVENTS', 'CLASS-EVENTS', 'ENUM', 'ENDENUM', 'MESH',
]);

/**
 * A RAP behaviour handler method — roadmap 2.14. The `FOR …` clause is the
 * source saying, in words that stand in it, that the runtime calls this method;
 * corpus case CC-059 declares `set_status FOR DETERMINE ON MODIFY` in a
 * `PRIVATE SECTION` and its expected process begins there all the same.
 */
const RAP_HANDLER =
  /\bFOR\s+(DETERMINE|VALIDATE|MODIFY|READ|LOCK|ACTION|FEATURES|BEHAVIOR|PRECHECK|NUMBERING|GLOBAL\s+AUTHORIZATION|INSTANCE\s+AUTHORIZATION|GLOBAL\s+FEATURES|INSTANCE\s+FEATURES)\b/i;

/** Function modules that send something out of the system — §5.8 Send-Task. */
const SEND_FUNCTIONS = new Set([
  'SO_NEW_DOCUMENT_SEND_API1', 'SO_NEW_DOCUMENT_ATT_SEND_API1',
  'SO_DOCUMENT_SEND_API1', 'MASTER_IDOC_DISTRIBUTE', 'EDI_DOCUMENT_CLOSE_PROCESS',
  'SAP_WAPI_CREATE_EVENT', 'SWE_EVENT_CREATE', 'SWE_EVENT_CREATE_FOR_UPD_TASK',
]);

/** Function modules a person looks at or answers — §5.8 User-Task. */
const USER_FUNCTION = /^(?:REUSE_ALV_(?:GRID|LIST|HIERSEQ|BLOCK)_[A-Z_]*DISPLAY|POPUP_[A-Z_0-9]+|F4IF_[A-Z_0-9]+)$/;

/** Function modules that move a file — §5.8 Datenobjekt. */
const FILE_FUNCTIONS = new Set(['GUI_DOWNLOAD', 'GUI_UPLOAD', 'WS_DOWNLOAD', 'WS_UPLOAD']);

/** List output. `WRITE x TO y` is an assignment and is not in this set. */
const LIST_OUTPUT = new Set(['WRITE', 'ULINE', 'SKIP', 'NEW-LINE', 'NEW-PAGE', 'FORMAT']);

/** Constants a run switch may be compared against without ceasing to be one. */
const SWITCH_CONSTANTS = new Set([
  'ABAP_TRUE', 'ABAP_FALSE', 'ABAP_ON', 'ABAP_OFF', 'ABAP_UNDEFINED',
  'SPACE', 'IS', 'NOT', 'INITIAL', 'AND', 'OR', 'EQ', 'NE', 'X',
]);

/** Blocks the walker descends into. Containers and macro bodies are not among them. */
const FLOW_BLOCKS = new Set(['if', 'case', 'loop', 'do', 'while', 'select', 'try', 'at', 'provide']);

/**
 * ADR-054. The statements that hand control to the next arm of the construct
 * around them: falling through one of them means leaving that construct.
 */
const ARM_HEADERS = new Set(['ELSE', 'ELSEIF', 'WHEN', 'CATCH', 'CLEANUP']);

/** ADR-054. Falling through one of these runs the loop again — something still follows. */
const LOOP_CLOSERS = new Set(['ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDSELECT', 'ENDPROVIDE']);

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

/**
 * When a routine collapses to one step, this is which of its steps it becomes.
 *
 * Only activities and data are in the list. A gateway, a loop, an end event and
 * a boundary event are not steps, so a routine whose whole content is a decision
 * stays a sub-process with that decision inside it rather than turning into a
 * diamond with a routine's name on it.
 */
const DOMINANT_ORDER: SkeletonNodeKind[] = [
  'transaction', 'call-activity', 'call-opaque', 'send-task', 'user-task',
  'service-task', 'write', 'output', 'read', 'business-rule-task', 'task',
  'sub-process',
];

/* ------------------------------------------------------------------ *
 * Small readers over one statement.
 * ------------------------------------------------------------------ */

/**
 * Engine 3.1.0 (`flagStep`): `field = value` where the value is one literal, a number or one name — `abap_true`,
 * `space`, a constant. A computed value (`a + b`, a call, a constructor) is a calculation, not a flag.
 */
const FLAG_ASSIGNMENT = /^((?:<[\w/]+>|[\w/]+)(?:-[\w/]+)*)\s*=\s*('(?:[^']|'')*'|`(?:[^`]|``)*`|-?\d+|[\w/]+=>[\w/]+|[\w/]+)\s*\.?$/;
/** The built-in constants a flag is set to. Any other bare name must be a `CONSTANTS` of this source. */
const BUILT_IN_FLAG_VALUES = new Set(['ABAP_TRUE', 'ABAP_FALSE', 'ABAP_UNDEFINED', 'SPACE']);
/** Engine 3.1.0 (`buildsWhileDeciding`): the blocks that decide or iterate around an append. */
const DECIDING_BLOCKS = new Set(['if', 'case', 'loop', 'do', 'while', 'select']);
/** Engine 3.1.0 (`buildsWhileDeciding`): the statements that add rows to an internal table. */
const BUILDS_TABLE = /^(?:APPEND\b[\s\S]*\bTO\b|COLLECT\b[\s\S]*\bINTO\b|INSERT\b[\s\S]*\bINTO\s+TABLE\b)/i;
/** Engine 3.1.0 (`collectStep`): a row built with the fields of a message (BAPIRET2, BAL, SYMSG). */
const MESSAGE_ROW = /\b(?:MSGTY|MSGNO|MSGID|MSGV1)\s*=|\bTYPE\s*=[\s\S]*\bMESSAGE\s*=|\bMESSAGE\s*=[\s\S]*\bTYPE\s*=/i;
/** Engine 3.1.0 (`collectStep`): the table such a statement adds its row to. */
const COLLECT_TARGET = /\b(?:TO|INTO\s+TABLE|INTO)\s+((?:<[\w/]+>|[\w/]+)(?:-[\w/]+)*)(?:\[\])?\s*(?:\.|$|\s(?:SORTED|REFERENCE|ASSIGNING)\b)/i;

/**
 * `MESSAGE … INTO field` fills the message fields and the target and shows
 * nothing: no dialog, no status line, no termination, whatever its type. It is
 * never an output and never an end — the program carries on to the next
 * statement, usually to write the text into a log.
 */
function isMessageInto(text: string): boolean {
  return /^MESSAGE\b/i.test(text) && /\bINTO\b/i.test(maskLiterals(text));
}

/**
 * `MESSAGE e001 …`, `MESSAGE '…' TYPE 'E'` — the types that end the process.
 *
 * `anyCase` (engine 3.2.0): the keywords `MESSAGE` and `TYPE` are read in any case, as ABAP reads them. Before,
 * only the type letter was; `message e001(zz).` in a program the pretty printer wrote in lower case lost its error
 * end, and with it the effect that made its routine a step. An older engine keeps that reading.
 */
function isErrorMessage(text: string, anyCase = false): boolean {
  if (isMessageInto(text)) return false;
  if (anyCase) return /^MESSAGE\s+[eax]\d/i.test(text) || /^MESSAGE\b[\s\S]*\bTYPE\s+'[eax]'/i.test(text);
  if (/^MESSAGE\s+[eaxEAX]\d/.test(text)) return true;
  return /^MESSAGE\b[\s\S]*\bTYPE\s+'[EAXeax]'/.test(text);
}

/**
 * `MESSAGE i001 …`, `MESSAGE '…' TYPE 'I'` — an information message, which
 * ABAP shows as a **dialog box the user has to confirm** before the program
 * goes on, in every context. §5.8 lists the popup under user task: *"a
 * person acts in the program: `CALL SCREEN`, popup, …"* (D4).
 *
 * `S` and `W` stay without a node, on purpose. `S` goes to the status line and
 * nobody acts on it — §5.8 has no element for a text nobody answers. `W`
 * depends on where it is sent (a warning on a screen waits for Enter, in
 * `START-OF-SELECTION` it ends the program like an `E`), and the reader does
 * not decide which of two opposite elements a statement is from context it is
 * not sure of. `DISPLAY LIKE` changes the icon, not the type.
 */
function isInfoMessage(text: string, anyCase = false): boolean {
  if (isMessageInto(text)) return false;
  if (anyCase) return /^MESSAGE\s+i\d/i.test(text) || /^MESSAGE\b[\s\S]*\bTYPE\s+'i'/i.test(text);
  if (/^MESSAGE\s+[iI]\d/.test(text)) return true;
  return /^MESSAGE\b[\s\S]*\bTYPE\s+'[Ii]'/.test(text);
}

/**
 * `RAISE EVENT name …` — an ABAP Objects event, **not** an exception.
 *
 * It shares its first word with `RAISE EXCEPTION` and `RAISE cx_…`, and that
 * is all it shares: the runtime calls every handler registered for the event
 * with `SET HANDLER`, synchronously, and then the statement after it runs. It
 * ends nothing. Read as a `RAISE`, it drew an error end in the middle of a
 * method and cut off every step behind it (`luw-states.ts` already told the
 * two apart; this file did not).
 * Which handlers run is decided at run time by `SET HANDLER`, so the call is
 * drawn opaque (rule 3) — the flow goes on after it.
 */
function isRaiseEvent(text: string): boolean {
  return /^RAISE\s+EVENT\b/i.test(text);
}

/**
 * `LEAVE SCREEN`, `LEAVE TO SCREEN n` and `LEAVE LIST-PROCESSING` — the words
 * of the statement that leaves, or `null`.
 *
 * All three end the processing of the current dialog step on the spot: the
 * runtime goes on with the next screen (or back to the caller for screen 0),
 * resp. with the screen list processing was started from — never with the
 * statement after it. Until 27.09.2026 they fell through to the branch for
 * moves and calculations, and the walk carried on as if the module went on:
 * `WHEN 'BACK'. LEAVE TO SCREEN 0.` led straight into the save of the next arm.
 * They leave the block from wherever they stand, exactly as a `RETURN` does, so
 * they end the same way (ADR-054, `leaveEarly`).
 *
 * `LEAVE TO LIST-PROCESSING` is the opposite and is not here: it only switches
 * the output of the current step to a list, and the statement after it runs.
 */
function leavesDialogStep(text: string): string | null {
  const m = /^LEAVE\s+(TO\s+SCREEN|SCREEN|LIST-PROCESSING)\b/i.exec(text);
  return m ? `LEAVE ${m[1].replace(/\s+/g, ' ').toUpperCase()}` : null;
}

/** ADR-066 — the trigger of a FORM called by output control. */
const OUTPUT_CONTROL = 'output control';

/**
 * ADR-066 — the SAP convention a `FORM` opener follows, as its trigger, or
 * `null`.
 *
 * Output control (NAST): the output processing program (RSNAST00) performs the
 * routine an output type names in table TNAPR (fields PGNAM / ROUTN) with two
 * `USING` parameters, the return code and the screen flag, i.e.
 * `FORM entry USING return_code us_screen.` The routine name is free; the
 * two-parameter interface is the convention, in the two spellings SAP's own
 * print programs use (`return_code us_screen`, e.g. RVADOR01;
 * `ent_retco ent_screen`, e.g. RVADIN01).
 */
const OUTPUT_CONTROL_FORM =
  /^FORM\s+[\w/]+\s+USING\s+(?:RETURN_CODE|ENT_RETCO)(?:\s+(?:TYPE|LIKE)\s+[\w/-]+)?\s+(?:US_SCREEN|ENT_SCREEN)(?:\s+(?:TYPE|LIKE)\s+[\w/-]+)?\s*\.?$/i;

/**
 * Form-based user exits (SD, LE, MM): SAP's standard programs perform FORM
 * routines named `USEREXIT_…` that the customer fills in the user-exit
 * includes the standard program ships for it — `USEREXIT_SAVE_DOCUMENT_PREPARE`
 * in MV45AFZZ (SAPMV45A, sales order), `USEREXIT_…` in MV50AFZ1 (deliveries),
 * RV60AFZZ (billing) and the like. The prefix is the convention: the standard
 * program, not this source, calls them.
 */
const USER_EXIT = 'user exit';
const USER_EXIT_FORM = /^FORM\s+USEREXIT_\w+/i;

function formConvention(opener: string): string | null {
  if (OUTPUT_CONTROL_FORM.test(opener.trim())) return OUTPUT_CONTROL;
  if (USER_EXIT_FORM.test(opener)) return USER_EXIT;
  return null;
}

/** `RAISE EXCEPTION …`, `RAISE cx_…`, `RAISE RESUMABLE …` — the `RAISE` that ends the flow. */
function raisesException(statement: AbapStatement): boolean {
  return statement.keyword === 'RAISE' && !isRaiseEvent(statement.text);
}

/**
 * The Open SQL tables a `SELECT` reads, first one first.
 *
 * Read from the code, not from the statement as written: `SELECT 'FROM KNA1' AS
 * note FROM vbak INTO TABLE @lt.` took its first match from inside the literal,
 * so the reconstructed process showed a read of KNA1 — a table the program does
 * not touch — and none of VBAK.
 */
function selectTables(text: string): string[] {
  const code = maskLiterals(text);
  const out: string[] = [];
  const from = /\bFROM\s+(?!TABLE\b|@)([\w/]+)/i.exec(code);
  if (from) out.push(from[1].toUpperCase());
  const join = /\bJOIN\s+([\w/]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = join.exec(code))) out.push(m[1].toUpperCase());
  return [...new Set(out)];
}

/**
 * `lv_rows = lo_stmt->execute_update( lv_sql )` — the step that hands SQL text
 * to the database (R13b a).
 *
 * It is a functional method call inside an assignment, so no keyword and no
 * `CALL METHOD` announces it, and the reconstructed process simply did not
 * contain it: CC-034's whole effect — the write to KNA1 — was missing from the
 * flow, and the `TRY` around it had no node for its `CATCH` to hang on
 * (CR-07). What the statement proves is that SQL
 * this reader cannot see is executed here; it becomes an opaque call carrying
 * the method and the operand, not a write to a table nobody named.
 */
function adbcExecution(text: string): { method: string; argument: string } | null {
  const code = maskLiterals(text);
  const call = /->\s*(EXECUTE_(?:UPDATE|QUERY|DDL))\s*\(/i.exec(code);
  if (!call) return null;
  const from = call.index + call[0].length;
  const close = code.indexOf(')', from);
  return {
    method: call[1].toUpperCase(),
    argument: close === -1 ? '' : text.slice(from, close).trim(),
  };
}

/**
 * Does this statement read through ABAP SQL although it does not begin with
 * SELECT? A common table expression begins with `WITH`, a cursor with `OPEN
 * CURSOR … FOR SELECT`, and both used to produce no read node at all — the
 * displayed process simply did not show the data access.
 */
function isEmbeddedSelect(text: string): boolean {
  const code = maskLiterals(text);
  return /^(?:WITH\b|OPEN\s+CURSOR\b)/i.test(code.trim()) && /\bSELECT\b/i.test(code);
}

/** True for `WRITE …` that puts something on the list rather than into a field. */
function isListOutput(statement: AbapStatement): boolean {
  if (!LIST_OUTPUT.has(statement.keyword)) return false;
  if (statement.keyword !== 'WRITE') return true;
  return !/\bTO\b/i.test(statement.text);
}

/** ADR-066 — `METHOD name BY DATABASE PROCEDURE|FUNCTION …`, an AMDP method; group 1 is the name. */
const AMDP_METHOD = /^METHOD\s+([\w/~]+)\s+BY\s+DATABASE\s+(?:PROCEDURE|FUNCTION)\b/i;

/**
 * ADR-066 — the database objects an AMDP method's `USING` clause names,
 * upper-cased. The ABAP keyword documentation requires every dictionary
 * object the procedure accesses to be listed there; other AMDP methods named
 * as `class=>method` are not tables and are left out.
 */
function amdpTables(opener: string): string[] {
  const using = /\bUSING\s+([\s\S]+)$/i.exec(opener.replace(/\.\s*$/, ''))?.[1] ?? '';
  return using.split(/[\s,]+/).filter((t) => /^[\w/]+$/.test(t)).map((t) => t.toUpperCase());
}

/** The words that open or close a parameter section of a `FORM` or `METHODS` signature. */
const SIGNATURE_WORDS = /\b(?:IMPORTING|EXPORTING|CHANGING|RETURNING|RAISING|EXCEPTIONS|USING|TABLES|REDEFINITION|ABSTRACT|FINAL)\b/gi;

/**
 * ADR-066 — the parameter names, upper-cased, in the signature sections whose
 * opening word `sections` matches (`CHANGING` of a FORM; `EXPORTING`,
 * `CHANGING`, `RETURNING` of a method). A typed section is read by its
 * `TYPE`/`LIKE`/`STRUCTURE` words; an untyped one (`CHANGING cv_ok cv_msg`)
 * is all names.
 */
function resultParameters(signature: string, sections: RegExp): string[] {
  const text = signature.replace(/\.\s*$/, '');
  const marks = [...text.matchAll(SIGNATURE_WORDS)];
  const out: string[] = [];
  marks.forEach((mark, k) => {
    if (!sections.test(mark[0])) return;
    const from = (mark.index ?? 0) + mark[0].length;
    const body = text.slice(from, k + 1 < marks.length ? marks[k + 1].index : text.length);
    if (/\b(?:TYPE|LIKE|STRUCTURE)\b/i.test(body)) {
      for (const p of body.matchAll(/(?:^|\s)(?:(?:VALUE|REFERENCE)\(\s*([\w/]+)\s*\)|([\w/]+))\s+(?:TYPE|LIKE|STRUCTURE)\b/gi)) {
        out.push((p[1] ?? p[2]).toUpperCase());
      }
      return;
    }
    for (const token of body.trim().split(/\s+/)) {
      const name = /^(?:(?:VALUE|REFERENCE)\(\s*)?([\w/]+)\)?$/i.exec(token)?.[1];
      if (name) out.push(name.toUpperCase());
    }
  });
  return out;
}

/**
 * ADR-066 — the data object a statement assigns as a whole or in a component,
 * upper-cased, or `null`: `x = …`, `x-comp = …`, `APPEND … TO x`, `INSERT …
 * INTO [TABLE] x`, `COLLECT … INTO x`, `MOVE … TO x`, `CLEAR x`.
 */
function assignmentTarget(text: string): string | null {
  const direct = /^([\w/]+)(?:-[\w/-]+)?\s*\??=(?!=)/.exec(text);
  if (direct) return direct[1].toUpperCase();
  const into = /^(?:APPEND|INSERT|COLLECT)\b[\s\S]*?\b(?:TO|INTO(?:\s+TABLE)?)\s+([\w/]+)/i.exec(text);
  if (into) return into[1].toUpperCase();
  const move = /^MOVE(?:-CORRESPONDING)?\b[\s\S]*\bTO\s+([\w/]+)/i.exec(text);
  if (move) return move[1].toUpperCase();
  const clear = /^(?:CLEAR|FREE|REFRESH)\s+([\w/]+)/i.exec(text);
  return clear ? clear[1].toUpperCase() : null;
}

/**
 * ADR-066 — the event table an ALV call passes as `IT_EVENTS` and the data
 * objects that carry its rows, upper-cased: the table itself, every work area
 * or field symbol that is appended to it, inserted into it, modified into it,
 * or read from it (`APPEND`/`INSERT … INTO`/`MODIFY … FROM`/`READ TABLE …
 * INTO|ASSIGNING`/`LOOP AT … INTO|ASSIGNING`), and every data object typed as
 * a row of the type pool SLIS event table (`slis_alv_event`, `LINE OF
 * slis_t_event`) or `LIKE LINE OF` the table.
 */
function alvEventRows(statements: readonly AbapStatement[], table: string): Set<string> {
  const rows = new Set<string>([table]);
  // A work area or field symbol, declared inline or not (`INTO DATA(ls_event)`).
  const name = String.raw`(?:(?:DATA|FIELD-SYMBOL)\(\s*)?(<?[\w/]+>?)`;
  // Table names are `[\w/]` with an optional `<…>`: nothing to escape.
  const tab = String.raw`${table}(?![\w/>])`;
  const patterns = [
    new RegExp(String.raw`^(?:APPEND|INSERT)\s+INITIAL\s+LINE\s+(?:TO|INTO(?:\s+TABLE)?)\s+${tab}[\s\S]*?\bASSIGNING\s+${name}`, 'i'),
    new RegExp(String.raw`^(?:APPEND|INSERT)\s+${name}\s+(?:TO|INTO(?:\s+TABLE)?)\s+${tab}`, 'i'),
    new RegExp(String.raw`^MODIFY\s+(?:TABLE\s+)?${tab}[\s\S]*?\bFROM\s+${name}`, 'i'),
    new RegExp(String.raw`^(?:READ\s+TABLE|LOOP\s+AT)\s+${tab}[\s\S]*?\b(?:INTO|ASSIGNING)\s+${name}`, 'i'),
  ];
  const typed = new RegExp(
    String.raw`(<?[\w/]+>?)\s+(?:TYPE|LIKE)\s+(?:SLIS_ALV_EVENT\b|LINE\s+OF\s+(?:SLIS_T_EVENT\b|${tab}))`, 'gi');
  for (const statement of statements) {
    for (const pattern of patterns) {
      const m = pattern.exec(statement.text);
      if (m) rows.add(m[1].toUpperCase());
    }
    if (/^(?:DATA|STATICS|CLASS-DATA|FIELD-SYMBOLS)\b/i.test(statement.text)) {
      for (const m of statement.text.matchAll(typed)) rows.add(m[1].toUpperCase());
    }
  }
  return rows;
}

/** `RECEIVE RESULTS FROM FUNCTION …` — the results of an asynchronous RFC (see `walkStatement`). */
function receivesResults(text: string): boolean {
  return /^RECEIVE\s+RESULTS\s+FROM\s+FUNCTION\b/i.test(text);
}

function isFileOutput(statement: AbapStatement): boolean {
  if (statement.keyword === 'TRANSFER') return true;
  return statement.keyword === 'OPEN' && /^OPEN\s+DATASET\b/i.test(statement.text);
}

/**
 * ADR-066, note of 03.10.2026 — `CLOSE DATASET dset`. The ABAP keyword
 * documentation: it closes the file on the application server; for a file
 * opened for output the buffered content is written now. It ends the work on
 * a file that `OPEN DATASET`/`TRANSFER`/`READ DATASET` did — whether the file
 * was written or read — and is part of that step, never a step of its own.
 */
function closesDataset(statement: AbapStatement): boolean {
  return statement.keyword === 'CLOSE' && /^CLOSE\s+DATASET\b/i.test(statement.text);
}

/**
 * The file a file statement works on, upper-cased: the `dset` operand of
 * `OPEN DATASET dset`, `CLOSE DATASET dset` and `TRANSFER dobj TO dset`.
 */
function datasetOf(statement: AbapStatement): string | null {
  const operand = /^(?:OPEN|CLOSE)\s+DATASET\s+([^\s.]+(?:\.[^\s.]+)*)/i.exec(statement.text)
    ?? /^TRANSFER\b[\s\S]*?\bTO\s+([^\s.]+(?:\.[^\s.]+)*)/i.exec(statement.text);
  return operand ? operand[1].toUpperCase() : null;
}

/** The kind of task a `CALL FUNCTION` is, by the module it names (§5.8). */
function functionTaskKind(name: string | undefined): SkeletonNodeKind {
  if (!name) return 'service-task';
  const bare = name.replace(/^\/[^/]+\//, '');
  if (SEND_FUNCTIONS.has(bare)) return 'send-task';
  if (USER_FUNCTION.test(bare)) return 'user-task';
  if (FILE_FUNCTIONS.has(bare)) return 'output';
  return 'service-task';
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

/** One `METHOD name.` inside a `CLASS x IMPLEMENTATION` of this source (D2). */
interface MethodImpl {
  /** `CLASS=>METHOD`, upper-cased — the routine key. */
  key: string;
  cls: string;
  /** As the implementation writes it, upper-cased: `RUN`, `ZIF_X~RUN`. */
  name: string;
  /** The part after `~`, or the name itself. */
  short: string;
  block: Block;
}

/**
 * One method call the source writes (D2) — `CALL METHOD x->m`, `x->m( … )`,
 * `cls=>m( … )`, `me->m( … )`, `m( … )`, and a constructor behind `NEW` or
 * `CREATE OBJECT`.
 */
interface MethodCall {
  /** Upper-cased method name as the call writes it (`ZIF_X~M` stays whole). */
  name: string;
  /** The routine key this call resolves to, or `null` when it does not. */
  key: string | null;
  /** More than one implementation fits and the call does not say which. */
  ambiguous: boolean;
  /** The implementations an ambiguous call can reach, `CLASS=>METHOD` — empty otherwise (`method-resolution.ts`). */
  candidates: string[];
  /**
   * The class came from the call or from the static type the source writes — not from the method name alone. Only a
   * typed call draws its candidates as alternatives (`drawsAlternatives`): an untyped `lo->run( )` may reach a class
   * outside this source, and the method that runs is then none of the ones that share its name here.
   */
  typed: boolean;
  /** The method name is computed at run time: `CALL METHOD (lv_name)`. */
  dynamic: boolean;
  /** The call is the whole statement, not an operand inside one. */
  standalone: boolean;
  constructor: boolean;
  /** A token out of the source: `LO_ALV->DISPLAY`, `LCL_APP=>RUN`, `RUN`. */
  label: string;
  /** Position in the masked statement text — the order calls are evaluated in. */
  at: number;
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

/**
 * Where a process may begin — roadmap 2.14. `event` and `implicit` are the two
 * a report writes; the other four are the ways a source that is not a report
 * says "this is callable from outside", and every one of them is a word that
 * stands in the source rather than a reading of what the program means.
 */
type EntryOrigin = 'event' | 'implicit' | 'function' | 'method' | 'module' | 'form' | 'callback' | 'enhancement';

interface EntryPoint {
  statement: AbapStatement;
  lastIndex: number;
  /** The statement the normal end is anchored at — the closer, where there is one. */
  endStatement: AbapStatement;
  label: string;
  rank: number;
  implicit: boolean;
  origin: EntryOrigin;
  /** What the source says calls this, when it says anything at all. */
  trigger: string | null;
  /** Engine 3.2.0: the statement that registered a callback — where its handlers were registered too (`registeredAtEntry`). */
  site?: number;
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
  /** A report that writes `START-OF-SELECTION`: its screen modules wait for a `CALL SCREEN` (D1). */
  private modulesWaitForScreen = false;
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
  /** Does this source write an event block — is it a report? Set by `readEntryPoints`. */
  private writesEventBlock = false;
  /**
   * `METHODS m REDEFINITION` in a class whose superclass is not in this source,
   * keyed `CLASS=>METHOD`: the superclass, and whether the class is global.
   */
  private redefinedFromOutside = new Map<string, { superclass: string; global: boolean }>();
  /** `CLASS x DEFINITION INHERITING FROM y`: the superclass each local class names. */
  private superOf = new Map<string, string>();
  /** `lo_x TYPE REF TO lcl_y` and its relatives: the class a reference variable holds. */
  private refTypes = new Map<string, Set<string>>();
  /** Engine 3.2.0 (AB-15b): the program's own classes, interfaces and their relations (`class-hierarchy.ts`), read once. */
  private hierarchy: ClassHierarchy | null = null;
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
  private methodCallCache = new Map<number, MethodCall[]>();
  /**
   * ADR-054. Every early end the walk drew, with the statement it stands on —
   * `settleEarlyEnds` decides afterwards which of them really skip something.
   */
  private earlyEnds: Array<{ node: SkeletonNode; statementIndex: number; region: SkeletonRegion }> = [];
  /** ADR-066. `resultWrites` per routine opener. */
  private resultWriteCache = new Map<number, Set<number>>();
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
    this.localData = localDataObjectsOf(this.statements);
    for (const call of readBatchInputFrom(this.statements)) this.batchInput.set(call.statementIndex, call);
    for (const block of this.structure.blocks) this.blockAt.set(block.openIndex, block);
    for (const branch of this.control.branches) this.branchAt.set(branch.openIndex, branch);
    for (const block of this.structure.blocks) {
      if (block.kind === 'define') {
        const name = /^DEFINE\s+([\w/]+)/i.exec(this.statements[block.openIndex].text);
        if (name) this.macros.set(name[1].toUpperCase(), { block });
      }
      if (block.kind !== 'form') continue;
      const m = /^FORM\s+([\w/]+)/i.exec(this.statements[block.openIndex].text);
      if (m) this.formBlocks.set(m[1].toUpperCase(), block);
    }
    for (const [name, block] of this.formBlocks) this.routineBlocks.set(name, block);
    this.readMethodImplementations();
    this.readFunctionBlocks();
    this.readEnhancementBlocks();
    this.readMethodVisibility();
    this.readSelectionScreen();
    this.readMethodCallSites();
    this.readEventHandlers();
    this.readEffects();
    this.noteWhatIsNotRead();

    const entries = this.readEntryPoints();
    this.runEntries = entries.filter((e) => e.origin === 'event' || e.origin === 'implicit');
    for (const entry of entries) this.buildEntryRegion(entry);
    for (const entry of this.deferredModuleEntries()) this.buildEntryRegion(entry);
    // A callback's own walk can start another task, so this runs until the
    // walks name nothing new.
    for (let next = 0; next < this.callbacks.length; next++) {
      const entry = this.callbackEntry(this.callbacks[next]);
      if (entry) this.buildEntryRegion(entry);
    }
    // ADR-054, once every region is walked: an early end is only early where
    // something drawn would still have followed it.
    this.settleEarlyEnds();
    this.collapseSmallRegions();
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

  private readSelectionScreen(): void {
    for (const statement of this.statements) {
      if (statement.keyword !== 'PARAMETERS' && statement.keyword !== 'SELECT-OPTIONS') continue;
      const m = /^(?:PARAMETERS|SELECT-OPTIONS)\s+([\w/]+)/i.exec(statement.text);
      if (m) this.selectionNames.add(m[1].toUpperCase());
    }
  }

  private noteWhatIsNotRead(): void {
    for (const statement of this.statements) {
      if (statement.keyword === 'INCLUDE' && !/^INCLUDE\s+STRUCTURE\b/i.test(statement.text)) {
        this.graph.note('include-not-read', statement,
          'The text of an INCLUDE is not part of this source, so whatever it contributes to the process is not in this skeleton.');
      }
      if (statement.nativeSql) {
        this.graph.note('native-sql', statement,
          'Native SQL is passed through to the database unread. What it touches is not drawn.');
      }
      if (statement.keyword === 'COMMIT' || statement.keyword === 'ROLLBACK') {
        this.graph.note('commit-boundary', statement,
          'A commit boundary is IT knowledge and belongs in the Technical overlay, not in the flow. What it does to an update registration — dispatched or discarded — is recorded as a state of the process model.');
      }
    }
    for (const branch of this.control.notHandled) {
      if (branch.reason !== 'chained-branch') continue;
      this.graph.notes.push({ ...branch, reason: 'chained-branch' });
    }
    for (const open of this.structure.unterminated) {
      const statement = this.statements.find((s) => s.lineStart === open.lineStart);
      if (!statement) continue;
      this.graph.note('unterminated-container', statement,
        `No closing statement ends this ${open.kind}. Everything read inside it runs to the end of the file and is a guess, not an anchor.`);
    }
    for (const perform of this.calls.performs) {
      if (!perform.dynamic) continue;
      const statement = this.statements.find(
        (s) => s.lineStart === perform.lineStart && s.text === perform.text,
      );
      if (statement) {
        this.graph.note('dynamic-call', statement,
          'The name of the routine is computed at run time. The call is drawn, its target is not claimed.');
      }
    }
  }

  /* ---------------- which routines are steps ---------------- */

  /**
   * A routine is a step only when it writes, reads, calls another system,
   * involves a person, ends the process with an error, checks an authorization,
   * or classifies from literals (`DESIGN.md` §5.8). Everything else is a
   * technical helper and is folded into its caller.
   *
   * The effect travels along `PERFORM`: `process_actions` does nothing itself
   * and performs three routines that all do something, so it is a step. Without
   * the closure the phase of the process with the most effect in it would be the
   * one that disappears.
   *
   * Since 27.09.2026 (D2) the same holds for a method this source implements:
   * §5.8 names "a `FORM`/method with an effect of its own" in one breath, so a
   * method is a routine here, and the effect travels along a method call that
   * resolves to one exactly as it travels along a `PERFORM`.
   */
  private readEffects(): void {
    for (const [name, block] of this.routineBlocks) {
      this.effects.set(name, this.directEffects(block));
      this.performedFrom.set(name, []);
    }
    for (const [name, block] of this.routineBlocks) {
      const performed: string[] = [];
      const [from, to] = bodyRange(block);
      for (let i = from; i <= to; i++) {
        const statement = this.statements[i];
        for (const call of this.methodCallsIn(statement)) {
          if (call.key) performed.push(call.key);
        }
        if (isRaiseEvent(statement.text)) performed.push(...this.handlersRaisedBy(statement));
        if (statement.keyword !== 'PERFORM') continue;
        const m = /^PERFORM\s+([\w/]+)/i.exec(statement.text);
        if (m && this.formBlocks.has(m[1].toUpperCase())) performed.push(m[1].toUpperCase());
      }
      this.performedFrom.set(name, performed);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, performed] of this.performedFrom) {
        const own = this.effects.get(name) as Set<FormEffect>;
        for (const target of performed) {
          for (const effect of this.effects.get(target) ?? []) {
            if (own.has(effect)) continue;
            own.add(effect);
            changed = true;
          }
        }
      }
    }
    for (const [name, set] of this.effects) if (set.size === 0) this.helpers.add(name);
  }

  private batchInputDetail(index: number): Record<string, string[]> {
    const call = this.batchInput.get(index);
    if (!call) return {};
    return {
      ...(call.screens.length ? { batchInputScreens: call.screens.map((s) => `${s.program} ${s.screen}`) } : {}),
      ...(call.fields.length ? { batchInputFields: [...new Set(call.fields.map((f) => f.raw))] } : {}),
    };
  }

  /** Roadmap 3.0.7: is this write target a data object of the program rather than a database table? */
  private isInternalTable(name: string): boolean {
    return this.localData.has(name.toUpperCase().replace(/\[\]$/, ''));
  }

  /** A write to a data object of the program — never an UPDATE, which only names a database table. */
  private isInternalWrite(write: SqlWrite): boolean {
    return !writesDatabaseOnly(write) && this.isInternalTable(write.table);
  }

  private directEffects(block: Block, expanding: Set<string> = new Set()): Set<FormEffect> {
    const out = new Set<FormEffect>();
    // ADR-066. An AMDP method (`METHOD m BY DATABASE PROCEDURE|FUNCTION …`)
    // runs its body on the database: it reads the database objects its USING
    // clause names (or, without one, at least its own parameters there). Its
    // SQLScript is not read (`statement-reader.ts` keeps it as native code),
    // so it is not a technical helper with nothing in it but a read step.
    if (block.kind === 'method' && AMDP_METHOD.test(this.statements[block.openIndex].text)) {
      out.add(amdpTables(this.statements[block.openIndex].text).length ? 'read' : 'call');
    }
    const [from, to] = bodyRange(block);
    for (let i = from; i <= to; i++) {
      const statement = this.statements[i];
      if (statement.nativeSql) continue;
      // Rule 2: the effect of a macro belongs to the routine that uses it, so
      // the body is read here as if it stood at the call site.
      const macro = this.macros.get(statement.keyword);
      if (macro) {
        // A macro that names itself, or a ring of two, is not ABAP the compiler
        // would take — but this reader is not the compiler, and without a floor
        // the recursion ran until the stack gave out, which made one crafted
        // DEFINE the end of the whole analysis.
        // A macro already being expanded is read once.
        if (!expanding.has(statement.keyword)) {
          expanding.add(statement.keyword);
          for (const effect of this.directEffects(macro.block, expanding)) out.add(effect);
          expanding.delete(statement.keyword);
        }
        continue;
      }
      const text = statement.text;
      if ((statement.keyword === 'SELECT' || isEmbeddedSelect(text)) && selectTables(text).length) out.add('read');
      // An internal table changed keeps the routine a step, as a database write
      // does — changing the kind alone folded whole calculation routines of the
      // shipped examples into their callers (roadmap 3.0.7) — but as `compute`.
      const written = databaseWriteIn(text);
      if (written) out.add(this.isInternalWrite(written) ? 'compute' : 'write');
      if (adbcExecution(text)) out.add('call');
      if (/^CALL\s+FUNCTION\b/i.test(text)) {
        const kind = functionTaskKind(/^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text)?.[1]?.toUpperCase());
        if (kind === 'user-task') out.add('human');
        else if (kind === 'output') out.add('file');
        else out.add('call');
      }
      if (/^CALL\s+TRANSACTION\b/i.test(text) || statement.keyword === 'SUBMIT') out.add('call');
      // Engine 3.2.0: a BAdI call or a customer-function call reaches an enhancement outside this source.
      if (this.reads320 && ENHANCEMENT_CALL.test(text)) out.add('call');
      if (receivesResults(text)) out.add('call');
      if (/^CALL\s+SCREEN\b/i.test(text)) out.add('human');
      if (isListOutput(statement) || isFileOutput(statement)) out.add('file');
      if (isErrorMessage(text, this.reads320) || raisesException(statement)) out.add('error');
      // The handlers of an event are called, whoever they turn out to be. Where
      // the source binds them, their own effect travels instead (`readEffects`).
      if (isRaiseEvent(text) && !this.handlersRaisedBy(statement).length) out.add('call');
      if (isInfoMessage(text, this.reads320)) out.add('human');
      if (/^LEAVE\s+PROGRAM\b/i.test(text)) out.add('error');
      if (statement.keyword === 'AUTHORITY-CHECK') out.add('authority');
      const perform = /^PERFORM\s+([\w/]+)/i.exec(text);
      if (perform && !this.formBlocks.has(perform[1].toUpperCase())) out.add('call');
      if (this.methodCallsIn(statement).some((call) => call.standalone && !call.key)) out.add('call');
    }
    if (out.size === 0 && this.classifiesFromLiterals(block)) out.add('business-rule');
    if (out.size === 0 && this.reads310 && this.buildsWhileDeciding(block)) out.add('compute');
    return out;
  }

  /**
   * Engine 3.1.0 — a routine that builds a table while it decides or iterates is a calculation.
   *
   * Since 3.0.7 a routine that changes an internal table (`MODIFY gt_out …`, `DELETE lt_rows WHERE …`) is a step
   * of the process (`compute`), but the commonest way to build one — `APPEND … TO`, `COLLECT … INTO`,
   * `INSERT … INTO TABLE` — counted for nothing, so a routine that walks the contracts, decides which ones
   * qualify and appends the new rents was folded into its caller as a technical helper, with every decision in
   * it. §5.8 folds a routine *without an effect of its own*; building the result set by decisions is one.
   * Kept narrow on purpose: a routine that only appends one row (`add_message`, `add_issue`) decides nothing
   * and stays a helper — the rule needs the append to stand **inside** a branch or a loop of the routine's own.
   * A log helper that appends its line and then counts warnings by level (`add_log`) appends beside its branch,
   * not in it, and stays a helper too.
   */
  private buildsWhileDeciding(block: Block): boolean {
    const [from, to] = bodyRange(block);
    for (let i = from; i <= to; i++) {
      const statement = this.statements[i];
      if (statement.nativeSql || !BUILDS_TABLE.test(maskLiterals(statement.text))) continue;
      // The row is added under a decision or per iteration of this routine: an append beside a branch (a log
      // helper that appends its line and then counts warnings) builds nothing by deciding.
      const around = this.structure.enclosing[i] ?? [];
      if (around.some((outer) => outer.openIndex > block.openIndex && DECIDING_BLOCKS.has(outer.kind))) return true;
    }
    return false;
  }

  /**
   * Does this routine classify or score from literals — §5.8's Business-Rule-Task?
   *
   * The discriminator is a **structure component**. `derive_customer_risk` tests
   * `cs_customer-sperr = 'X'` and `decide_actions` writes
   * `<fs_order>-action = 'SET_DELIVERY_BLOCK'`: a field of a business object
   * against a literal. `add_log` tests its own flat parameter `iv_level` against
   * `'WARN'` and counts up a global, and §5.8 names it as a technical helper —
   * so a flat name against a literal is deliberately not enough.
   */
  private classifiesFromLiterals(block: Block): boolean {
    const component = /[\w<>]+-[\w]+/;
    const literal = /'[^']*'/;
    for (const branch of this.control.branches) {
      if (branch.openIndex <= block.openIndex || branch.closeIndex >= block.closeIndex) continue;
      for (const arm of branch.arms) {
        if (component.test(arm.condition) && literal.test(arm.condition)) return true;
      }
      for (let i = branch.openIndex + 1; i < branch.closeIndex; i++) {
        if (/^[\w<>/]+-[\w-]+\s*=\s*'/.test(this.statements[i].text)) return true;
      }
    }
    return false;
  }

  /* ---------------- D2: method calls ---------------- */

  /**
   * The methods this source implements, and the classes it names — read once,
   * before the effects, because a method is a routine there (D2).
   */
  private readMethodImplementations(): void {
    for (const block of this.structure.blocks) {
      const opener = this.statements[block.openIndex];
      if (block.kind === 'class' || block.kind === 'interface') {
        const name = /^(?:CLASS|INTERFACE)\s+([\w/]+)/i.exec(opener.text);
        if (name) this.classNames.add(name[1].toUpperCase());
        if (name && /^CLASS\s+[\w/]+\s+DEFINITION\b/i.test(opener.text)
          && !/\bDEFINITION\s+(?:DEFERRED|LOAD)\b/i.test(opener.text)) {
          this.definedClasses.add(name[1].toUpperCase());
        }
        const parent = /\bINHERITING\s+FROM\s+([\w/]+)/i.exec(opener.text);
        if (name && parent) this.superOf.set(name[1].toUpperCase(), parent[1].toUpperCase());
        continue;
      }
      if (block.kind !== 'method') continue;
      // A `METHOD` with no class around it at all is an excerpt — one method of
      // a class the upload does not hold (a Web Dynpro controller, a gateway
      // method pasted on its own). It is still a routine: a call on its name
      // reaches it, and the class it belongs to is simply not written, so its
      // key carries an empty class.
      const bare = !(this.structure.enclosing[block.openIndex] ?? []).some((b) => b.kind === 'class');
      const cls = bare ? '' : this.classOf(block.openIndex);
      const name = /^METHOD\s+([\w/~]+)/i.exec(opener.text)?.[1]?.toUpperCase();
      if (cls === null || !name) continue;
      const key = `${cls}=>${name}`;
      if (this.routineBlocks.has(key)) continue;
      const tilde = name.lastIndexOf('~');
      this.methodImpls.push({ key, cls, name, short: tilde < 0 ? name : name.slice(tilde + 1), block });
      this.routineBlocks.set(key, block);
    }
  }

  /** The class whose `IMPLEMENTATION` encloses this statement, upper-cased, or `null`. */
  private classOf(index: number): string | null {
    const enclosing = this.structure.enclosing[index] ?? [];
    for (let i = enclosing.length - 1; i >= 0; i--) {
      if (enclosing[i].kind !== 'class') continue;
      const m = /^CLASS\s+([\w/]+)\s+IMPLEMENTATION\b/i.exec(this.statements[enclosing[i].openIndex].text);
      return m ? m[1].toUpperCase() : null;
    }
    return null;
  }

  /**
   * Which class a reference variable holds, as far as the source says it in so
   * many words: `TYPE REF TO`, `DATA(x) = NEW cls( )`, `x = NEW cls( )`,
   * `CREATE OBJECT x TYPE cls`, `CAST cls( … )`. A name declared with two
   * different types (two scopes) is not resolved — see `resolveMethod`.
   * And then counts, over the whole source, how often each method is called.
   */
  private readMethodCallSites(): void {
    this.refTypes = readReferenceTypes(this.statements);
    for (const statement of this.statements) {
      for (const call of this.methodCallsIn(statement)) {
        if (call.key) this.methodCallSites.set(call.key, [...(this.methodCallSites.get(call.key) ?? []), statement.index]);
        // Only a call whose class the source names (`typed`): one matched by the method name alone may reach a class
        // outside this source, so the implementations here that share the name are no candidates of it.
        if (!this.reads320 || !call.ambiguous || !call.typed) continue;
        for (const candidate of call.candidates) {
          this.candidateSites.set(candidate, [
            ...(this.candidateSites.get(candidate) ?? []),
            { index: statement.index, label: call.label, line: statement.lineStart, of: call.candidates.length },
          ]);
        }
      }
    }
  }

  /**
   * The implementation a call reaches, or why there is none.
   *
   * **The class comes from the call, never from a guess.** `cls=>m` names it;
   * `me->m` and a bare `m` mean the class the call is written in; `lo->m` means
   * the class `lo` is declared with, when the source declares it with exactly
   * one. Where the call says no class, the name decides only when exactly one
   * implementation in this source carries it — two local classes that both
   * implement `run` and a call `lo->run( )` on a reference this source does not
   * type is `ambiguous`, and an ambiguous call is drawn opaque rather than
   * pointed at one of the two (brief of 27.09.2026, D2).
   *
   * The rule itself lives in `method-resolution.ts`, shared with the business
   * statements; the skeleton lets the name decide alone.
   */
  private resolveMethod(
    qualifier: string | null,
    op: '->' | '=>' | null,
    name: string,
    index: number,
  ): { key: string | null; ambiguous: boolean; candidates: string[]; typed: boolean } {
    const model = { impls: this.methodImpls, superOf: this.superOf, refTypes: this.refTypes };
    const ownClass = this.classOf(index);
    const { key, ambiguous, candidates, byClass } = resolveMethodTarget(
      model,
      qualifier,
      op,
      name,
      ownClass,
      // Engine 3.2.0: `me->m( )` dispatches at run time when a subclass redefines `m`.
      { byNameAlone: true, dynamicDispatch: this.reads320 },
    );
    if (key || !this.reads320) return { key, ambiguous, candidates, typed: byClass };
    // Engine 3.2.0 (AB-15b): a call the declarations at hand leave open is resolved to the implementations the
    // program itself defines behind the reference's static type (`class-hierarchy.ts`) — one is the target, several
    // stay candidates. Where the source does not write the type, the answer above stands.
    this.hierarchy ??= readClassHierarchy(this.statements);
    const typed = candidatesForCall(this.hierarchy, model,
      { statementIndex: index, qualifier, op, name: name.toUpperCase(), ownClass }, this.statements, this.structure);
    if (typed.candidates.length === 1) return { key: typed.candidates[0], ambiguous: false, candidates: [], typed: true };
    if (typed.candidates.length > 1) {
      // In source order, as `method-resolution.ts` lists them — the order the beginnings are drawn in.
      const order = (k: string) => this.methodImpls.findIndex((impl) => impl.key === k);
      return { key: null, ambiguous: true, candidates: [...typed.candidates].sort((a, b) => order(a) - order(b)), typed: true };
    }
    return { key, ambiguous, candidates, typed: byClass };
  }

  /**
   * Event handlers — which implemented method a `RAISE EVENT` of this source
   * runs, as far as the source writes it down.
   *
   * ABAP binds a handler to an event in two places, and both must stand here:
   * the definition declares it (`METHODS on_done FOR EVENT done OF lcl_run`),
   * and a `SET HANDLER lo->on_done FOR …` registers it. The declaration alone
   * is not a binding — a handler nobody registers never runs — and the
   * registration alone does not say which event it answers. With both, the
   * `RAISE EVENT done` calls that method, synchronously, and the statement after
   * it runs next: a method call in all but spelling, and §5.8 draws "a
   * `FORM`/method with an effect of its own" as a sub-process.
   *
   * The handler named in `SET HANDLER` is resolved by the one rule every
   * method call uses (`method-resolution.ts`, via `resolveMethod`) — no second
   * resolution. A name that does not resolve, or resolves to two classes, binds
   * nothing, and the `RAISE EVENT` stays what it was: an opaque call (rule 3).
   * `ACTIVATION ' '` / `abap_false` deregisters and is not read as a binding.
   */
  private readEventHandlers(): void {
    for (const block of this.structure.blocks) {
      if (block.kind !== 'class') continue;
      const cls = /^CLASS\s+([\w/]+)\s+DEFINITION\b/i.exec(this.statements[block.openIndex].text)?.[1]?.toUpperCase();
      if (!cls) continue;
      for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
        const m = /^(?:CLASS-)?METHODS\s+([\w/~]+)\s+FOR\s+EVENT\s+([\w/~]+)\s+OF\s+([\w/]+)/i
          .exec(this.statements[i].text);
        if (!m) continue;
        const key = `${cls}=>${m[1].toUpperCase()}`;
        if (this.routineBlocks.has(key)) this.handlerEvent.set(key, { event: m[2].toUpperCase(), of: m[3].toUpperCase() });
      }
    }
    if (!this.handlerEvent.size) return;
    // A handler the source may deregister anywhere is not a binding at all —
    // which of the two is in force at a given `RAISE` is a question of run
    // time, and the conservative answer is the opaque call. The order of
    // registration and `RAISE` is the walk's to decide (`registeredInWalk`).
    const registered: string[] = [];
    for (const statement of this.statements) {
      const handlers = this.handlersSetBy(statement);
      if (!handlers) continue;
      for (const { key } of handlers) {
        if (handlers.deregisters) this.deregisteredHandlers.add(key);
        else if (!registered.includes(key)) registered.push(key);
      }
    }
    this.boundHandlers = registered.filter((key) => !this.deregisteredHandlers.has(key));
    for (const statement of this.statements) {
      if (!isRaiseEvent(statement.text)) continue;
      for (const key of this.handlersRaisedBy(statement)) {
        this.methodCallSites.set(key, [...(this.methodCallSites.get(key) ?? []), statement.index]);
      }
    }
  }

  /**
   * The implemented handlers one `SET HANDLER` names, resolved through
   * `resolveMethod`, and whether the statement (possibly) deregisters them —
   * `null` for any other statement. `ACTIVATION` with anything but `'X'` or
   * `abap_true` (`' '`, `space`, `abap_false`, a variable) is read as a
   * possible deregistration: a value the reader cannot pin to "on" is not "on".
   */
  private handlersSetBy(statement: AbapStatement): (Array<{ key: string; name: string }> & { deregisters: boolean }) | null {
    if (statement.keyword !== 'SET' || statement.nativeSql) return null;
    const set = /^SET\s+HANDLER\s+([\s\S]+?)\s+FOR\s+/i.exec(maskLiterals(statement.text));
    if (!set) return null;
    const activation = /\bACTIVATION\s+(\S+)/i.exec(statement.text)?.[1];
    const out = Object.assign([] as Array<{ key: string; name: string }>, {
      deregisters: activation !== undefined && !/^(?:'X'|abap_true)$/i.test(activation),
    });
    // Engine 3.1.0 (AB-15a): a handler of an object created right there — `SET HANDLER NEW lcl_mailer( )->on_x` —
    // is that class's method, as if it were written `lcl_mailer=>on_x`; before, the split words matched nothing.
    const list = this.reads310 ? set[1].replace(/\bNEW\s+([\w/]+)\(\s*[^()]*\)\s*->\s*([\w/~]+)/gi, '$1=>$2') : set[1];
    for (const handler of list.split(/\s+/)) {
      const parts = /^(?:([\w/]+|<[\w/]+>)(->|=>))?([\w/~]+)$/.exec(handler);
      if (!parts) continue;
      const { key, ambiguous } = this.resolveMethod(parts[1] ?? null,
        (parts[2] as '->' | '=>' | undefined) ?? null, parts[3].toUpperCase(), statement.index);
      if (key && !ambiguous && this.handlerEvent.has(key)) out.push({ key, name: parts[3] });
    }
    return out;
  }

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
    const written = /^RAISE\s+EVENT\s+([\w/~]+)/i.exec(statement.text)?.[1]?.toUpperCase();
    const raiser = this.classOf(statement.index);
    if (!written || !raiser) return [];
    const tilde = written.lastIndexOf('~');
    const event = tilde < 0 ? written : written.slice(tilde + 1);
    const owners = new Set<string>();
    if (tilde >= 0) owners.add(written.slice(0, tilde));
    for (let at: string | undefined = raiser; at && !owners.has(at); at = this.superOf.get(at)) owners.add(at);
    return this.boundHandlers.filter((key) => {
      const declared = this.handlerEvent.get(key);
      return declared !== undefined && declared.event === event && owners.has(declared.of);
    });
  }

  /**
   * Every method call in one statement, in the order they are written (D2).
   *
   * Read off the code with its literals masked, and only in the shapes ABAP
   * gives a method call: a name directly followed by `(` — ABAP allows no blank
   * there — after `->` or `=>`, or a bare name inside a class implementation
   * (outside one, `name(` is an offset or a built-in function, never a
   * method). A name behind a constructor operator (`NEW`, `CAST`, `VALUE`, …)
   * is a type, not a call; `NEW cls( )` and `CREATE OBJECT` are read as the
   * constructor they run.
   */
  private methodCallsIn(statement: AbapStatement): MethodCall[] {
    const cached = this.methodCallCache.get(statement.index);
    if (cached) return cached;
    const out: MethodCall[] = [];
    this.methodCallCache.set(statement.index, out);
    if (statement.nativeSql || !this.worthReadingForCalls(statement)) return out;

    const code = maskLiterals(statement.text).replace(/\.\s*$/, '');
    const index = statement.index;
    const standaloneAt = this.standaloneCallAt(statement, code);

    // `CALL METHOD target …` and its short form `CALL METHOD target( … )`.
    const explicit = /^CALL\s+METHOD\s+/i.exec(code);
    let explicitEnd = -1;
    if (explicit) {
      const rest = code.slice(explicit[0].length);
      const target = /^[^\s(]*/.exec(rest)?.[0] ?? '';
      explicitEnd = explicit[0].length + target.length;
      // `CALL METHOD (lv_name)` and `CALL METHOD lo->(lv_name)`.
      const dynamic = /^(?:\S*?(?:->|=>))?\(/.test(rest);
      const segments = target.split(/(->|=>)/);
      const name = (segments[segments.length - 1] ?? '').toUpperCase();
      const op = segments.length >= 3 ? segments[segments.length - 2] as '->' | '=>' : null;
      const qualifier = segments.length >= 3 ? segments[segments.length - 3] || ')' : null;
      const resolved = dynamic || !/^[\w/~]+$/.test(name)
        ? { key: null, ambiguous: false, candidates: [], typed: false }
        : this.resolveMethod(qualifier, op, name, index);
      out.push({
        name, ...resolved, dynamic, standalone: true, constructor: false,
        label: (target || 'CALL METHOD').toUpperCase(), at: 0,
      });
    }

    const call = /(?:([\w/]+|<[\w/]+>|\))(->|=>))?([\w/~]+)\(/g;
    let m: RegExpExecArray | null;
    while ((m = call.exec(code))) {
      const at = m.index;
      if (at < explicitEnd) continue;
      const before = code.slice(0, at);
      // A type behind a constructor operator, and a name glued to what stands
      // before it (`ls_x-f(`, `lv+0(`) — neither is a call.
      if (/\b(?:NEW|CAST|CONV|VALUE|REF|EXACT|CORRESPONDING|COND|SWITCH|REDUCE|FILTER)\s+$/i.test(before)) continue;
      let op = (m[2] as '->' | '=>' | undefined) ?? null;
      let qualifier = m[1] ?? null;
      const trailing = /(->|=>)$/.exec(before);
      if (!op && trailing) {
        // `lt_x[ 1 ]->run(`: an object the reader cannot name — still a call on one.
        op = trailing[1] as '->' | '=>';
        qualifier = ')';
      } else if (!trailing && /[\w/\-+~<>@]$/.test(before)) continue;
      if (op === null && !this.classOf(index)) continue;
      const name = m[3].toUpperCase();
      const resolved = this.resolveMethod(qualifier, op, name, index);
      out.push({
        name, ...resolved, dynamic: false, standalone: at === standaloneAt, constructor: false,
        label: qualifier && qualifier !== ')' ? `${qualifier}${op}${m[3]}`.toUpperCase() : name,
        at,
      });
    }

    // A constructor runs where the object is created. It is a call only when
    // this source implements it — otherwise there is nothing to open.
    const created = /\bNEW\s+([\w/#]+)\(/gi;
    while ((m = created.exec(code))) {
      let cls = m[1].toUpperCase();
      if (cls === '#') {
        const target = /^(?:ME->)?([\w/]+)\s*=/i.exec(code)?.[1]?.toUpperCase();
        const types = target ? this.refTypes.get(target) : undefined;
        if (types?.size !== 1) continue;
        cls = [...types][0];
      }
      this.pushConstructor(out, cls, m.index);
    }
    const createObject = /^CREATE\s+OBJECT\s+((?:ME->)?[\w/]+)(?:\s+TYPE\s+([\w/]+))?/i.exec(code);
    if (createObject) {
      const variable = createObject[1].toUpperCase().replace(/^ME->/, '');
      const types = this.refTypes.get(variable);
      const cls = createObject[2]?.toUpperCase() ?? (types?.size === 1 ? [...types][0] : null);
      if (cls) this.pushConstructor(out, cls, 0);
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  private pushConstructor(out: MethodCall[], cls: string, at: number): void {
    const key = `${cls}=>CONSTRUCTOR`;
    if (!this.routineBlocks.has(key)) return;
    out.push({
      name: 'CONSTRUCTOR', key, ambiguous: false, candidates: [], typed: true, dynamic: false, standalone: false,
      constructor: true, label: `${cls}=>CONSTRUCTOR`, at,
    });
  }

  /** Statements whose keyword already decides what they are never hold a call worth drawing. */
  private worthReadingForCalls(statement: AbapStatement): boolean {
    // `check( ).`, `set( … ).`: a name glued to its bracket is a call, not the
    // keyword it happens to spell — ABAP writes no keyword that way.
    if (/^[\w/~]+\(/.test(statement.text)) return true;
    if (/^(?:DATA|FINAL)\(/i.test(statement.text)) return true;
    if (DECLARES.has(statement.keyword)) return false;
    return !['PERFORM', 'MESSAGE', 'RAISE', 'SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE',
      'WRITE', 'SUBMIT', 'SET', 'ENDIF', 'ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDCASE', 'ENDTRY',
      'ELSE', 'CATCH', 'CLEANUP', 'ENDSELECT', 'ENDAT'].includes(statement.keyword)
      && !/^CALL\s+(?:FUNCTION|TRANSACTION|SCREEN|SELECTION-SCREEN|BADI|DIALOG)\b/i.test(statement.text);
  }

  /**
   * Where the statement **is** a call — `x->m( … ).`, `cls=>m( … ).`,
   * `m( … ).`, or a chain of them — the position of the call whose result the
   * statement discards: the last one of the chain. `-1` for any other statement.
   * An assignment is not one: with the brackets taken out, a top-level `=`
   * remains (`lv(10) = x.`, `ls-f = lo->m( ).`).
   */
  private standaloneCallAt(statement: AbapStatement, code: string): number {
    if (/^CALL\s+METHOD\b/i.test(code)) return -1;
    if (!/^(?:(?:[\w/]+|<[\w/]+>|\))(?:->|=>))*[\w/~]+\(/.test(code)) return -1;
    let depth = 0;
    let last = -1;
    let flat = '';
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === '(') {
        if (depth === 0) {
          const head = /(?:([\w/]+|<[\w/]+>|\))(->|=>))?([\w/~]+)$/.exec(code.slice(0, i));
          if (head) last = i - head[0].length;
        }
        depth += 1;
        continue;
      }
      if (ch === ')') { depth = Math.max(0, depth - 1); if (depth === 0) flat += '()'; continue; }
      if (depth === 0) flat += ch;
    }
    if (/=/.test(flat.replace(/->|=>/g, ''))) return -1;
    if (!this.classOf(statement.index) && !/->|=>/.test(flat)) return -1;
    return last;
  }

  /* ---------------- rule 4: the entry points ---------------- */

  private isEventStatement(statement: AbapStatement): boolean {
    if (EVENT_WORDS.has(statement.keyword)) return true;
    if (statement.keyword === 'AT') return AT_EVENT.test(statement.text);
    if (statement.keyword !== 'GET') return false;
    const second = /^GET\s+([\w/-]+)/i.exec(statement.text);
    return second !== null && !GET_NOT_AN_EVENT.has(second[1].toUpperCase());
  }

  private runtimeRank(text: string): number {
    for (const row of RUNTIME_ORDER) if (row.test.test(text)) return row.rank;
    return RUNTIME_ORDER.length;
  }

  /**
   * Rule 4, and roadmap 2.14: **where does this process begin?**
   *
   * A report answers it itself — an event block, or the statements it writes at
   * program level, which ABAP runs as the implicit `START-OF-SELECTION`. Most
   * custom ABAP is not a report, and until 2.14 those sources got nothing at
   * all: on 18.09.2026, 9 of the corpus sources ended with `no-entry-point` and
   * **zero** nodes — a class method, a module pool, a BAdI implementation and a
   * bare `FORM` among them. Zero nodes is not a careful answer, it is no
   * answer, and it reads to the user as "there is no process here".
   *
   * The four additions are all the same kind of evidence: a declaration in this
   * source that says the routine is callable from **outside** it.
   *
   * - `FUNCTION name.` — a function module. Its name is the name of the start
   *   event; it is emphatically **not** `START-OF-SELECTION`, which is what the
   *   implicit fallback used to make of it (§16 V5).
   * - `METHOD name.` whose class definition declares it in the `PUBLIC SECTION`,
   *   or through `INTERFACES`, or as a RAP handler (`FOR DETERMINE`, `FOR
   *   MODIFY`, …) — the framework calls those whatever section they sit in.
   * - `MODULE name INPUT.` / `OUTPUT.` — a dynpro event. Both, and in source
   *   order: the screen runtime calls PBO and PAI, and calling one of them the
   *   beginning and the other not would be a rank this source does not write.
   * - a `FORM` no `PERFORM` in this source reaches — the user exit case. Only
   *   when nothing above answered, because a form a report performs is a step
   *   of that report and not a second beginning.
   *
   * **What the source does not say is not filled in.** That a method is
   * callable is written down; *what* calls it — an RFC, an IDoc, a BAdI, a
   * person at a screen — is not, and is left as a note rather than guessed.
   * Across the reference holding, 14 % of processes start on a message, which
   * is a fact about the holding and no evidence at all about one source.
   *
   * **And no rank is invented.** Within a kind, every member is an entry: two
   * public methods are two beginnings, not one beginning and one orphan. Only
   * between kinds does one answer beat another, and only where the source
   * itself is unambiguous — a program that writes `START-OF-SELECTION` has said
   * where it begins.
   *
   * **But an event block answers only for what the report runtime calls.** A
   * `MODULE … INPUT/OUTPUT` is called by the screen runtime and by nothing
   * else, a `FUNCTION` by a caller outside the source, a public method of a
   * global class (or a RAP handler) likewise — whether or not the same source
   * also writes `LOAD-OF-PROGRAM`. Until 27.09.2026 the first event block ended
   * the search here, and a module pool with `LOAD-OF-PROGRAM` lost every one of
   * its modules to "not reached" (D1). So these three are entries **beside**
   * the event blocks. Only the bare `FORM` stays a last resort: a report that
   * performs it has said it is a step.
   *
   * One precedence is kept, the one §5.8's own note on 2.14 writes: *"a
   * program that writes `START-OF-SELECTION` has said where it begins"*.
   * An executable report shows its screens only through a `CALL SCREEN` of its
   * own, so there its modules run exactly when such a statement runs — and
   * which screen's flow logic calls which module is not in this source. The
   * modules of a report that writes `START-OF-SELECTION` are therefore entries
   * only once the walk has passed a `CALL SCREEN` (`deferredModuleEntries`);
   * a screen the report never calls leaves them where 2.14 put them, under
   * "not reached". A module pool or function group has no such statement to
   * wait for: a dialog transaction starts its screens from outside.
   */
  private readEntryPoints(): EntryPoint[] {
    const primary = this.primaryEntryPoints();
    // Engine 3.2.0: the candidate implementations of the source's own ambiguous calls — beside whatever the
    // source names as its beginnings, never in their place. An ambiguous call reaches its candidates from inside
    // the source, so a candidate is no evidence of a caller outside it and pre-empts no last resort (a bare FORM).
    const candidates = this.noteTriggers(this.candidateEntries());
    if (!primary.length && !candidates.length) this.noteNoEntryPoint();
    return [...primary, ...candidates];
  }

  /** The beginnings the source names, by the precedence above — empty when it names none. */
  private primaryEntryPoints(): EntryPoint[] {
    const events = this.eventEntries();
    this.writesEventBlock = events.length > 0;
    if (events.length) {
      // Unchanged from rule 4, and deliberately: a program that writes an event
      // block but no `START-OF-SELECTION` still runs its program-level
      // statements as the implicit one. `GET TIME.` beside `GET vbak.` is the
      // case, and it is two entries, not one.
      if (!events.some((e) => /^START-OF-SELECTION$/i.test(e.label))) {
        const free = this.programLevelStatements();
        if (free.length) {
          events.push({
            statement: free[0],
            lastIndex: free[free.length - 1].index,
            endStatement: free[free.length - 1],
            label: 'START-OF-SELECTION',
            rank: 5,
            implicit: true,
            origin: 'implicit',
            trigger: null,
          });
        }
      }
      this.modulesWaitForScreen = events.some((e) => !e.implicit && /^START-OF-SELECTION$/i.test(e.label));
      const outside = [
        ...this.functionEntries(),
        ...this.methodEntries(),
        ...(this.modulesWaitForScreen ? [] : this.moduleEntries()),
        ...this.conventionFormEntries(),
        ...this.enhancementEntries(),
      ].sort((a, b) => a.statement.index - b.statement.index);
      return [...events, ...this.noteTriggers(outside)];
    }

    // One class, not three: a function module, a public method and a dialog
    // module are each "called from outside this source", and where a source
    // carries more than one of them they are equals.
    const calledFromOutside = [
      ...this.functionEntries(),
      ...this.methodEntries(),
      ...this.moduleEntries(),
      ...this.conventionFormEntries(),
      ...this.enhancementEntries(),
    ].sort((a, b) => a.statement.index - b.statement.index);
    if (calledFromOutside.length) return this.noteTriggers(calledFromOutside);

    const free = this.programLevelStatements();
    if (free.length) {
      return [{
        statement: free[0],
        lastIndex: free[free.length - 1].index,
        endStatement: free[free.length - 1],
        label: 'START-OF-SELECTION',
        rank: 5,
        implicit: true,
        origin: 'implicit',
        trigger: null,
      }];
    }

    // The last resort, and the method has the same one as the form: a method of
    // a class whose definition this source does not hold, which no call of the
    // source reaches. Its visibility is written only in the missing definition
    // — so it is not read as "public" — but whoever calls it is outside this
    // source either way, which is exactly the evidence "a `FORM` that no
    // `PERFORM` reaches" is (§5.8). Only here, where nothing above answered:
    // a report or a function group has said where it begins.
    const forms = [...this.formEntries(), ...this.methodEntries(true)]
      .sort((a, b) => a.statement.index - b.statement.index);
    if (forms.length) return this.noteTriggers(forms);
    return [];
  }

  /**
   * The screen modules of a report that writes `START-OF-SELECTION`, once the
   * walk has shown that the report calls a screen at all — see the precedence
   * in `readEntryPoints`. Empty otherwise.
   */
  private deferredModuleEntries(): EntryPoint[] {
    if (!this.modulesWaitForScreen || !this.screenCalled) return [];
    return this.noteTriggers(this.moduleEntries());
  }

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
    const { key, ambiguous } = this.resolveMethod(method[1] ?? null, (method[2] as '->' | '=>' | undefined) ?? null,
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

  /** The classic event blocks, unchanged since rule 4 — a report says it itself. */
  private eventEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    const isBoundary = (i: number) => {
      const block = this.blockAt.get(i);
      // `FUNCTION` is not in the block table (`readFunctionBlocks`), so it is
      // named here: an event block ends where a function module begins.
      return this.isEventStatement(this.statements[i])
        || this.statements[i].keyword === 'FUNCTION'
        || this.statements[i].keyword === 'ENHANCEMENT'
        || (block !== undefined
          && (block.kind === 'form' || block.kind === 'module' || block.kind === 'class'
            || block.kind === 'interface' || block.kind === 'define'));
    };

    for (let i = 0; i < this.statements.length; i++) {
      if (!this.isEventStatement(this.statements[i])) continue;
      let last = this.statements.length - 1;
      for (let j = i + 1; j < this.statements.length; j++) {
        if (isBoundary(j)) { last = j - 1; break; }
      }
      const lastIndex = Math.max(i, last);
      out.push({
        statement: this.statements[i],
        lastIndex,
        endStatement: this.statements[lastIndex],
        label: this.statements[i].text,
        rank: this.runtimeRank(this.statements[i].text),
        implicit: false,
        origin: 'event',
        trigger: null,
      });
    }
    return out;
  }

  /**
   * `FUNCTION name.` … `ENDFUNCTION.` — read here rather than in
   * `block-structure.ts` because ABAP's own block table is shared with the
   * branch reader, the call graph and the comparability rules, and a new kind
   * in it changes what every one of them sees. What this needs is the range.
   */
  private readFunctionBlocks(): void {
    const open: number[] = [];
    for (let i = 0; i < this.statements.length; i++) {
      const statement = this.statements[i];
      if (statement.nativeSql) continue;
      if (statement.keyword === 'FUNCTION') { open.push(i); continue; }
      if (statement.keyword !== 'ENDFUNCTION') continue;
      const openIndex = open.pop();
      if (openIndex === undefined) continue;
      const name = /^FUNCTION\s+([\w/]+)/i.exec(this.statements[openIndex].text);
      if (name) this.functionBlocks.push({ name: name[1], openIndex, closeIndex: i });
    }
    // An opener nothing closed: the range runs to the end of the file, the same
    // floor `block-structure.ts` uses, and `noteWhatIsNotRead` has already said
    // that an unterminated container is a guess rather than an anchor.
    for (const openIndex of open) {
      const name = /^FUNCTION\s+([\w/]+)/i.exec(this.statements[openIndex].text);
      if (name) this.functionBlocks.push({ name: name[1], openIndex, closeIndex: this.statements.length });
    }
    this.functionBlocks.sort((a, b) => a.openIndex - b.openIndex);
  }

  private functionEntries(): EntryPoint[] {
    return this.functionBlocks.map((fn) => {
      const opener = this.statements[fn.openIndex];
      const closer = this.statements[Math.min(fn.closeIndex, this.statements.length - 1)];
      this.entryOfBlock.add(fn.openIndex);
      return {
        statement: opener,
        lastIndex: fn.closeIndex - 1,
        endStatement: closer,
        label: fn.name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'function' as const,
        trigger: null,
      };
    });
  }

  /**
   * What a class **definition** in this source declares callable from outside
   * it: the `PUBLIC SECTION`, the interfaces it implements, and the RAP handler
   * methods the framework calls whatever section they stand in.
   *
   * A private method is not here, and a class implementation whose definition
   * is in another file declares nothing here — both stay silent rather than
   * being assumed public.
   */
  private readMethodVisibility(): void {
    for (const block of this.structure.blocks) {
      if (block.kind !== 'class' && block.kind !== 'interface') continue;
      const opener = this.statements[block.openIndex];
      const owner = /^(?:CLASS|INTERFACE)\s+([\w/]+)/i.exec(opener.text)?.[1]?.toUpperCase() ?? '';
      // A class's methods are its own; an interface's are reached as `zif~name`.
      const keyOf = (method: string) => (block.kind === 'interface' ? `${owner}~${method}` : `${owner}=>${method}`);
      this.readRedefinitions(block);
      // **Local is not public.** `PUBLIC SECTION` in a `CLASS lcl_x DEFINITION`
      // means public *within this program*; only `DEFINITION PUBLIC` — a global
      // class — is callable from outside the source. Without that distinction
      // the six local helper classes of `Z_ORDER_INTEGRITY_CHECK` each became a
      // beginning of the process, which is six sentences the source does not
      // write. A RAP handler is read below whatever its class is, because there
      // the `FOR …` clause is the evidence rather than the visibility.
      if (block.kind === 'class'
        && !/^CLASS\s+[\w/]+\s+DEFINITION\b[^.]*\bPUBLIC\b/i.test(opener.text)) {
        this.readRapHandlers(block);
        continue;
      }
      // An interface declares nothing but public methods; a class starts private.
      let visible = block.kind === 'interface';
      for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
        const statement = this.statements[i];
        if (statement.keyword === 'PUBLIC') {
          visible = /^PUBLIC\s+SECTION\b/i.test(statement.text);
          continue;
        }
        if (statement.keyword === 'PROTECTED' || statement.keyword === 'PRIVATE') {
          visible = false;
          continue;
        }
        if (statement.keyword === 'INTERFACES') {
          // Every method of the interface is reachable as `zif~name`, and the
          // prefix is what the implementation writes, so the prefix is recorded.
          const name = /^INTERFACES\s+([\w/]+)/i.exec(statement.text);
          if (visible && name) this.externallyCallableMethods.set(`${owner}=>${name[1].toUpperCase()}~`, 'interface');
          continue;
        }
        if (statement.keyword !== 'METHODS' && statement.keyword !== 'CLASS-METHODS') continue;
        const name = /^(?:CLASS-)?METHODS\s+([\w/~]+)/i.exec(statement.text);
        if (!name) continue;
        const handler = RAP_HANDLER.exec(statement.text);
        if (handler) {
          this.externallyCallableMethods.set(keyOf(name[1].toUpperCase()), `RAP ${handler[1].toUpperCase()}`);
          continue;
        }
        if (visible) this.externallyCallableMethods.set(keyOf(name[1].toUpperCase()), 'public');
      }
    }
  }

  /**
   * The one thing a **local** class can still say: that its method is a RAP
   * handler. `lhc_order` of corpus case CC-059 declares `set_status FOR
   * DETERMINE ON MODIFY` in its `PRIVATE SECTION`, and the runtime calls it
   * regardless — the `FOR` clause stands in the source and the section does
   * not contradict it.
   */
  private readRapHandlers(block: Block): void {
    if (!/\bDEFINITION\b/i.test(this.statements[block.openIndex].text)) return;
    const owner = /^CLASS\s+([\w/]+)/i.exec(this.statements[block.openIndex].text)?.[1]?.toUpperCase() ?? '';
    for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
      const statement = this.statements[i];
      if (statement.keyword !== 'METHODS' && statement.keyword !== 'CLASS-METHODS') continue;
      const name = /^(?:CLASS-)?METHODS\s+([\w/~]+)/i.exec(statement.text);
      const handler = RAP_HANDLER.exec(statement.text);
      if (name && handler) {
        this.externallyCallableMethods.set(`${owner}=>${name[1].toUpperCase()}`, `RAP ${handler[1].toUpperCase()}`);
      }
    }
  }

  /**
   * `METHODS name REDEFINITION` in a class that inherits from a class this
   * source does not hold — a gateway `*_DPC_EXT` redefining `…_GET_ENTITYSET`,
   * a RAP saver redefining `save_modified`, a subclass of a framework class.
   *
   * A redefinition replaces a method the **superclass** declares, and the one
   * that calls it is the superclass's code — the dispatcher, the framework —
   * which is not in this source. That is written down twice here: the word
   * `REDEFINITION` and the `INHERITING FROM` a class the source does not
   * define. Its section is the superclass's decision (a protected redefinition
   * is the usual shape), so the visibility rule of 2.14 does not reach it —
   * the same reason a RAP handler is read whatever its section.
   *
   * A superclass this source **does** hold is not outside: there the call is
   * in the source, or it is polymorphism the reader does not resolve.
   */
  private readRedefinitions(block: Block): void {
    const opener = this.statements[block.openIndex].text;
    const cls = /^CLASS\s+([\w/]+)\s+DEFINITION\b/i.exec(opener)?.[1]?.toUpperCase();
    const superclass = cls ? this.superOf.get(cls) : undefined;
    if (!cls || !superclass || this.classNames.has(superclass)) return;
    const global = /^CLASS\s+[\w/]+\s+DEFINITION\b[^.]*\bPUBLIC\b/i.test(opener);
    for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
      const m = /^(?:CLASS-)?METHODS\s+([\w/~]+)\s+(?:FINAL\s+)?REDEFINITION\b/i.exec(this.statements[i].text);
      if (m) this.redefinedFromOutside.set(`${cls}=>${m[1].toUpperCase()}`, { superclass, global });
    }
  }

  /**
   * The trigger of a redefinition `readRedefinitions` recorded — except for a
   * local class in a source that writes an event block. A report holds local
   * classes only, and a local subclass there runs when the report hands an
   * instance of it over; whether it does is not the redefinition's to say.
   */
  private redefinitionTrigger(key: string): string | null {
    const found = this.redefinedFromOutside.get(key);
    if (!found || (!found.global && this.writesEventBlock)) return null;
    return `REDEFINITION OF ${found.superclass}`;
  }

  /**
   * Engine 3.2.0 — a method that a call of this source can reach but cannot be shown to reach: one of the
   * implementations behind `lo_if->m( )` on an interface reference, behind `lo->m( )` on a superclass reference
   * whose subclasses redefine `m`, or behind `me->m( )` in a class whose subclasses redefine it. The call is drawn
   * opaque where it stands (D2 — the reader does not say which one runs); the implementation is drawn here, as a
   * beginning of its own, with the call as its trigger. Before 3.2.0 such an implementation was neither drawn nor
   * listed as not reached — a strategy, a state or a template-method pattern lost every one of its concrete steps.
   *
   * The trigger names the first call site outside the method's own body; a call from inside it (recursion) is
   * not what reaches it.
   */
  private candidateTrigger(key: string, block: Block): string | null {
    const site = (this.candidateSites.get(key) ?? []).find((s) => s.index < block.openIndex || s.index > block.closeIndex);
    return site ? `${CANDIDATE_TRIGGER}${site.label}@${site.line} (1 of ${site.of})` : null;
  }

  /**
   * Engine 3.2.0 — the candidate implementations (`candidateTrigger`) that nothing else made a beginning or a
   * step: not an entry already, and not named by a call that reaches it for certain (D2 draws that call as the
   * sub-process, and a call from inside the method's own body is recursion, not a caller). In source order.
   */
  private candidateEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    for (const block of this.structure.blocks) {
      if (block.kind !== 'method' || this.entryOfBlock.has(block.openIndex)) continue;
      const opener = this.statements[block.openIndex];
      const name = /^METHOD\s+([\w/~]+)/i.exec(opener.text);
      if (!name) continue;
      const key = `${this.classOf(block.openIndex) ?? ''}=>${name[1].toUpperCase()}`;
      const trigger = this.candidateTrigger(key, block);
      if (!trigger) continue;
      const sites = this.methodCallSites.get(key) ?? [];
      if (sites.some((site) => site < block.openIndex || site > block.closeIndex)) continue;
      this.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.statements[Math.min(block.closeIndex, this.statements.length - 1)],
        label: name[1],
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'method',
        trigger,
      });
    }
    return out;
  }

  /** Is this implemented method one the source declares callable from outside? */
  private methodTrigger(cls: string | null, name: string): string | null {
    const upper = name.toUpperCase();
    const direct = this.externallyCallableMethods.get(`${cls ?? ''}=>${upper}`);
    if (direct) return direct;
    const tilde = upper.indexOf('~');
    if (tilde < 0) return null;
    // `zif~name`: an interface this class declares in its public section.
    return this.externallyCallableMethods.get(`${cls ?? ''}=>${upper.slice(0, tilde + 1)}`) ?? null;
  }

  /**
   * §5.8's "BAdI-Methode": `METHOD zif_x~name.` in a source that does not hold
   * the definition of its class — the BAdI implementation, the method of a
   * global class pasted as an excerpt.
   *
   * `readMethodVisibility` reads visibility off the class **definition**, and a
   * class whose definition is in another file declares nothing here. That
   * silence stays for a plain method: whether `METHOD save.` is public or a
   * private helper is written only in the definition. The tilde is different.
   * It is written in the implementation itself, and it says the method is a
   * component of an interface — and an interface component is public wherever
   * it is implemented; it is called through the interface, from outside. The
   * 2.14 note on "declares nothing" is about a source that runs nothing (an
   * interface on its own, `entry-not-applicable`); a method with statements in
   * it runs code, and until 27.09.2026 such an upload ended with
   * `no-entry-point` and zero nodes.
   *
   * Two limits keep it to that evidence. Only where the definition is **not**
   * here — where it is, `readMethodVisibility` has already decided, and a local
   * class stays local (2.14: "public does not mean callable from outside"). And
   * never in a source that writes an event block: a report holds only local
   * classes, so an implementation without its definition there is a partial
   * upload of a local class, not a BAdI. What calls it stays not determined
   * (`noteTriggers`).
   */
  private implementedInterfaceMethod(name: string, openIndex: number): string | null {
    if (this.writesEventBlock || !name.includes('~')) return null;
    const cls = this.classOf(openIndex);
    if (cls && this.definedClasses.has(cls)) return null;
    return 'interface';
  }

  private methodEntries(orphans = false): EntryPoint[] {
    const out: EntryPoint[] = [];
    for (const block of this.structure.blocks) {
      if (block.kind !== 'method') continue;
      const opener = this.statements[block.openIndex];
      const name = /^METHOD\s+([\w/~]+)/i.exec(opener.text);
      if (!name) continue;
      const cls = this.classOf(block.openIndex);
      const key = `${cls ?? ''}=>${name[1].toUpperCase()}`;
      const trigger = this.methodTrigger(cls, name[1]) ?? this.implementedInterfaceMethod(name[1], block.openIndex)
        ?? this.redefinitionTrigger(key);
      if (orphans) {
        // The last resort: no trigger, no definition, nothing else answered.
        if (trigger || this.entryOfBlock.has(block.openIndex) || (cls && this.definedClasses.has(cls))) continue;
      } else if (!trigger) continue;
      // D2, and D3's rule for forms: a method this source calls is drawn where
      // it is called, as a sub-process — not a second time as a beginning. A
      // call from inside its own body (recursion) does not count.
      const sites = this.methodCallSites.get(key) ?? [];
      if (sites.some((site) => site < block.openIndex || site > block.closeIndex)) continue;
      this.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.statements[Math.min(block.closeIndex, this.statements.length - 1)],
        label: name[1],
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'method',
        trigger: orphans ? null : trigger,
      });
    }
    return out;
  }

  /**
   * A dialog module. Until 2.14 these were counted with the unreached code, on
   * the grounds that the dynpro is not in this source — which is true of the
   * screen and not of the module: `MODULE … INPUT` is written down, and it is
   * written down as an event the screen runtime raises. Corpus case CC-013 is
   * the measurement: its expected process begins at the PBO module and runs
   * into the PAI module, and the engine drew neither.
   */
  private moduleEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    for (const block of this.structure.blocks) {
      if (block.kind !== 'module') continue;
      const opener = this.statements[block.openIndex];
      const m = /^MODULE\s+([\w/]+)\s+(INPUT|OUTPUT)\b/i.exec(opener.text);
      if (!m) continue;
      this.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.statements[Math.min(block.closeIndex, this.statements.length - 1)],
        label: `${m[1]} ${m[2].toUpperCase()}`,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'module',
        trigger: m[2].toUpperCase() === 'INPUT' ? 'dynpro PAI' : 'dynpro PBO',
      });
    }
    return out;
  }

  /**
   * ADR-066 — a `FORM` that SAP calls by a documented convention, which no
   * `PERFORM` of this source names. It is called from outside exactly as a
   * `MODULE … INPUT` is, so it is an entry **beside** the event blocks and the
   * other outside entries, not a last resort. The convention is the trigger;
   * which output type or which standard transaction runs it is configuration
   * outside the source, and `noteTriggers` says so.
   */
  /**
   * ADR-066 — `ENHANCEMENT n name.` … `ENDENHANCEMENT.` standing at program
   * level. The ABAP keyword documentation: the block is the source code plug-in
   * of an enhancement implementation, and the program it enhances runs it at
   * its enhancement option (an implicit one at the start or end of a routine,
   * or an `ENHANCEMENT-POINT`/`-SECTION`). That program is not this source, so
   * it is an entry of its own; which enhancement option is noted, not guessed.
   * One inside a FORM or method is part of that routine's flow and is not here.
   */
  private readEnhancementBlocks(): void {
    const open: number[] = [];
    for (let i = 0; i < this.statements.length; i++) {
      const statement = this.statements[i];
      if (statement.nativeSql) continue;
      if (statement.keyword === 'ENHANCEMENT') {
        if (!(this.structure.enclosing[i] ?? []).length) open.push(i);
        continue;
      }
      if (statement.keyword !== 'ENDENHANCEMENT' || !open.length) continue;
      const openIndex = open.pop() as number;
      const name = /^ENHANCEMENT\s+\d+\s+([\w/]+)/i.exec(this.statements[openIndex].text)?.[1];
      this.enhancementBlocks.push({ name: name ?? 'ENHANCEMENT', openIndex, closeIndex: i });
    }
    this.enhancementBlocks.sort((a, b) => a.openIndex - b.openIndex);
  }

  private enhancementEntries(): EntryPoint[] {
    return this.enhancementBlocks.map((enh) => {
      this.entryOfBlock.add(enh.openIndex);
      return {
        statement: this.statements[enh.openIndex],
        lastIndex: enh.closeIndex - 1,
        endStatement: this.statements[enh.closeIndex],
        label: enh.name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'enhancement' as const,
        trigger: 'enhancement',
      };
    });
  }

  private conventionFormEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    const neverPerformed = new Set(this.calls.neverPerformed);
    for (const [name, block] of this.formBlocks) {
      if (!neverPerformed.has(name) || this.entryOfBlock.has(block.openIndex)) continue;
      const opener = this.statements[block.openIndex];
      const trigger = formConvention(opener.text);
      if (!trigger) continue;
      const written = /^FORM\s+([\w/]+)/i.exec(opener.text);
      this.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.statements[Math.min(block.closeIndex, this.statements.length - 1)],
        label: written ? written[1] : name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'form',
        trigger,
      });
    }
    return out;
  }

  /**
   * The bare `FORM` — a user exit, an enhancement include. Last, and only when
   * nothing else in this source answered: a form a report performs is a step of
   * that report, and drawing it as a second beginning would double it.
   *
   * **Only a form no `PERFORM` of this source names** (`neverPerformed`), which
   * is the sentence `DESIGN.md` §5.8 writes: *"a `FORM` that no `PERFORM`
   * reaches"*. This used to read `unreachable` — and when nothing else in the
   * source is an entry, reachability has no root, so *every* form is
   * unreachable, the performed ones included. `PERFORM b` inside the entry `a`
   * then drew `b` twice: once as the sub-process `a` opens and once as a second
   * beginning of the process. A form that is performed is a step of whoever
   * performs it. The one shape without such a root — routines that only perform
   * one another in a ring — falls back to the old reading, because otherwise
   * nothing of it would be drawn at all.
   */
  private formEntries(): EntryPoint[] {
    const out: EntryPoint[] = [];
    const roots = this.calls.neverPerformed.filter((name) => this.formBlocks.has(name));
    const beginnings = new Set(roots.length ? roots : this.calls.unreachable);
    for (const [name, block] of this.formBlocks) {
      if (!beginnings.has(name)) continue;
      const opener = this.statements[block.openIndex];
      const written = /^FORM\s+([\w/]+)/i.exec(opener.text);
      this.entryOfBlock.add(block.openIndex);
      out.push({
        statement: opener,
        lastIndex: block.closeIndex - 1,
        endStatement: this.statements[Math.min(block.closeIndex, this.statements.length - 1)],
        label: written ? written[1] : name,
        rank: RUNTIME_ORDER.length,
        implicit: false,
        origin: 'form',
        trigger: null,
      });
    }
    return out.sort((a, b) => a.statement.index - b.statement.index);
  }

  /**
   * *Not determined*, with the reason — §5.8's rule for what the code does not
   * say. The source proves the routine is callable; it does not say what calls
   * it, and a message start (RFC, IDoc, BAdI) is exactly the thing that is not
   * written down. This note is why the start event may be drawn at all.
   */
  private noteTriggers(entries: EntryPoint[]): EntryPoint[] {
    for (const entry of entries) {
      const what = entry.origin === 'function' ? 'function module'
        : entry.origin === 'method' ? 'method'
          : entry.origin === 'module' ? 'screen module'
            : entry.origin === 'enhancement' ? 'enhancement implementation' : 'subroutine';
      const proof = entry.origin === 'enhancement'
        ? 'it is an ENHANCEMENT … ENDENHANCEMENT block, which the enhanced program runs at its enhancement option'
        : entry.trigger === 'public' ? 'its class declares it in the PUBLIC SECTION'
        : entry.trigger === 'interface' ? 'its class implements the interface that declares it'
          : entry.trigger === 'dynpro PAI' ? 'the screen runtime raises PAI on it'
            : entry.trigger === 'dynpro PBO' ? 'the screen runtime raises PBO on it'
              : entry.trigger === USER_EXIT
                ? 'its name USEREXIT_… is the user-exit convention of the SAP standard program that performs it'
              : entry.trigger === OUTPUT_CONTROL
                ? 'its interface (return code, screen flag) is the one output control calls a processing routine '
                  + 'with (table TNAPR)'
              : entry.trigger?.startsWith('REDEFINITION OF ')
                ? `it redefines a method of ${entry.trigger.slice(16)}, which is not in this source and is what calls it`
              : entry.trigger?.startsWith(CANDIDATE_TRIGGER)
                ? `the call ${entry.trigger.slice(CANDIDATE_TRIGGER.length).replace(/ \(1 of (\d+)\)$/, ' can reach it as one of $1 implementations')}, `
                  + 'and which of them runs is decided at run time by the object the call is made on, which this reader does not guess'
              : entry.trigger ? `it is declared as a ${entry.trigger} handler`
                : entry.origin === 'function' ? 'it is a function module, callable by name'
                  : entry.origin === 'method'
                    ? 'no call in this source reaches it and the definition of its class is not in this source, '
                      + 'so its caller is outside this source'
                  : 'no PERFORM in this source reaches it, so its caller is outside this source';
      this.graph.note('entry-trigger-not-determined', entry.statement,
        `The process is drawn as beginning at the ${what} ${entry.label} because ${proof}. `
        + 'What triggers it — a remote call, an IDoc, a BAdI, a batch job or a person — is not in this '
        + 'source and is not determined.');
    }
    return entries;
  }

  /**
   * No entry, and why — roadmap 2.14. "Not applicable, with an explanation" is
   * a result the step names on purpose: an interface, a type pool or a bare
   * declaration has no process in it, and zero steps without a word is the one
   * answer that reads as a failure of the engine rather than a property of the
   * upload.
   */
  private noteNoEntryPoint(): void {
    const lineEnd = Math.max(1, this.statements[this.statements.length - 1]?.lineEnd ?? 1);
    const interfaces = this.structure.blocks.filter((b) => b.kind === 'interface');
    // An `INCLUDE` is not a declaration: the program runs, its text is in
    // another file. A main program that is nothing but include lines is the
    // multi-file case, not the "not applicable" one, and the answer is the
    // list of files to add — see the tail of this method.
    const includesText = this.statements.some((st) =>
      st.keyword === 'INCLUDE' && !/^INCLUDE\s+STRUCTURE\b/i.test(st.text));
    const executable = includesText
      || this.statements.some((st) => !DECLARES.has(st.keyword) && !st.nativeSql);
    if (interfaces.length && !executable) {
      const opener = this.statements[interfaces[0].openIndex];
      this.graph.notes.push({
        reason: 'entry-not-applicable',
        detail:
          'This source declares an interface and implements nothing: it names methods and their parameters, '
          + 'and not one statement that runs. A process view is not applicable here — that is a property of '
          + 'the upload, not an empty result. Upload the class that implements this interface, and its '
          + 'includes, to see the process.',
        snippet: snippet(opener.text),
        lineStart: interfaces[0].lineStart,
        lineEnd: interfaces[0].lineEnd,
      });
      return;
    }
    if (!executable) {
      this.graph.notes.push({
        reason: 'entry-not-applicable',
        detail:
          'This source declares and does not run: every statement in it is a declaration. A process view is '
          + 'not applicable here — that is a property of the upload, not an empty result.',
        snippet: '',
        lineStart: 1,
        lineEnd,
      });
      return;
    }
    // The multi-file case, named rather than implied: a main program that is
    // nothing but `INCLUDE` lines has its entry point in a file this upload
    // does not hold, and the useful answer is which files to add.
    const includes: string[] = [];
    for (const statement of this.statements) {
      if (statement.keyword !== 'INCLUDE' || /^INCLUDE\s+STRUCTURE\b/i.test(statement.text)) continue;
      const name = /^INCLUDE\s+([\w/]+)/i.exec(statement.text);
      if (name && !includes.includes(name[1])) includes.push(name[1]);
    }
    this.graph.notes.push({
      reason: 'no-entry-point',
      detail:
        'This source names no event block, no function module, no externally callable method, no screen '
        + 'module and no unperformed subroutine, and it writes no statement at program level — so nothing '
        + 'here says where the process begins. Every routine it defines is listed as not reached.'
        + (includes.length
          ? ` The beginning is in one of the ${includes.length} includes this source names and this upload `
            + `does not hold: ${includes.join(', ')}. Upload them and the process can be read.`
          : ' If this is one file of several, the entry point is in another one: upload the rest as well.'),
      snippet: '',
      lineStart: 1,
      lineEnd,
    });
  }

  /**
   * Executable statements outside every block, every event block and every
   * function module. The last of those is 2.14: the body of a `FUNCTION` stands
   * at program level as far as the block table is concerned, and reading it as
   * the implicit `START-OF-SELECTION` put a report's start event on a function
   * group (§16 V5).
   */
  private programLevelStatements(): AbapStatement[] {
    const inEvent = new Set<number>();
    for (let i = 0; i < this.statements.length; i++) {
      if (!this.isEventStatement(this.statements[i])) continue;
      for (let j = i; j < this.statements.length; j++) {
        const block = this.blockAt.get(j);
        const boundary = j > i && (this.isEventStatement(this.statements[j])
          || this.statements[j].keyword === 'FUNCTION'
          || this.statements[j].keyword === 'ENHANCEMENT'
          || (block !== undefined && (block.kind === 'form' || block.kind === 'module'
            || block.kind === 'class' || block.kind === 'interface' || block.kind === 'define')));
        if (boundary) break;
        inEvent.add(j);
      }
    }
    for (const fn of [...this.functionBlocks, ...this.enhancementBlocks]) {
      for (let i = fn.openIndex; i <= Math.min(fn.closeIndex, this.statements.length - 1); i++) inEvent.add(i);
    }
    const out: AbapStatement[] = [];
    for (let i = 0; i < this.statements.length; i++) {
      const statement = this.statements[i];
      if (inEvent.has(i)) continue;
      if (this.structure.enclosing[i].length) continue;
      if (this.blockAt.has(i)) continue;
      if (DECLARATIVE.has(statement.keyword)) continue;
      if (statement.nativeSql) continue;
      out.push(statement);
    }
    return out;
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
      const own = earlier.implicit ? new Set(this.programLevelStatements().map((s) => s.index)) : null;
      for (let i = from; i <= earlier.lastIndex; i++) {
        if ((this.structure.enclosing[i] ?? []).length || (own && !own.has(i))) continue;
        const handlers = this.handlersSetBy(this.statements[i]);
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
      const key = `${this.classOf(entry.statement.index) ?? ''}=>${entry.label.toUpperCase()}`;
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
        const call = this.methodCallsIn(statement).find((c) => c.standalone && c.key && this.helpers.has(c.key));
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
    if (write && this.isInternalWrite(write)) {
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
    const handlers = this.handlersSetBy(statement);
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
   * ADR-054, "no tangle". An early end whose statement stands directly before
   * the block's end — nothing drawn in between — is the normal end, and its
   * flows go back to it. Decided on the complete walk, because whether anything
   * is drawn after a statement is only known once the statements after it have
   * been walked.
   */
  private settleEarlyEnds(): void {
    if (!this.earlyEnds.length) return;
    const drawn = new Map<string, Set<number>>();
    for (const node of this.graph.nodes) {
      if (!node.anchor || node.detail?.early === true) continue;
      const own = drawn.get(node.region);
      if (own) own.add(node.anchor.statementIndex);
      else drawn.set(node.region, new Set([node.anchor.statementIndex]));
    }
    const dropped = new Set<string>();
    for (const { node, statementIndex, region } of this.earlyEnds) {
      const last = this.regionLast.get(region.key);
      if (last === undefined || !region.endNodeId) continue;
      // ADR-066. `LEAVE SCREEN`, `LEAVE TO SCREEN n` and `LEAVE LIST-PROCESSING`
      // are never the routine's normal end, wherever they stand: the ABAP
      // keyword documentation has them end the current dialog step on the spot
      // — the rest of the screen's flow logic (the PAI/PBO modules after this
      // one) does not run, and the runtime goes on with screen n (or back to
      // the caller for 0). `ENDMODULE` hands back to that flow logic. So the
      // end stays its own even with nothing drawn behind it in the module.
      if (leavesDialogStep(this.statements[statementIndex].text)) continue;
      // ADR-066. An exit that skips an assignment to a result parameter of its
      // routine (`CHANGING` of a FORM; `EXPORTING`, `CHANGING`, `RETURNING` of
      // a method) is not the normal end either: the caller gets another result
      // back — `cv_ok` stays initial — whether or not a step is drawn between.
      // Roadmap 3.0.7. `EXIT`, `RETURN` and `STOP` in `START-OF-SELECTION` or
      // `GET` skip the reporting events still to come, so they are never the
      // block's normal end while one follows — see `chainReportEvents`.
      if (this.skipsLaterReportEvents(region, this.statements[statementIndex].keyword)) continue;
      const own = drawn.get(region.key) ?? new Set<number>();
      const results = this.resultWrites(statementIndex);
      const counted = results.size ? new Set([...own, ...results]) : own;
      if (this.skipsSomething(statementIndex, last, counted)) continue;
      for (const edge of this.graph.edges) if (edge.to === node.id) edge.to = region.endNodeId;
      dropped.add(node.id);
    }
    if (dropped.size) this.graph.nodes = this.graph.nodes.filter((n) => !dropped.has(n.id));
  }

  /**
   * Roadmap 3.0.7 — whether an early exit with this keyword, in this region,
   * ends the reporting run rather than the block: `EXIT` and `RETURN` (and
   * `STOP`, which goes on with `END-OF-SELECTION` only) in `START-OF-SELECTION`
   * or `GET`, while a later reporting event block exists that it skips. The
   * ABAP keyword documentation on `EXIT`/`STOP` in processing blocks: after
   * those two events are left with `EXIT`, no further reporting event is
   * raised and the list is displayed; `STOP` raises `END-OF-SELECTION`.
   */
  private skipsLaterReportEvents(region: SkeletonRegion, keyword: string): boolean {
    if (region.kind !== 'entry' || !['EXIT', 'RETURN', 'STOP'].includes(keyword.toUpperCase())) return false;
    const rank = region.runtimeRank;
    if (rank !== RANK_START_OF_SELECTION && rank !== RANK_GET) return false;
    return this.runEntries.some((e) => e.rank > rank && e.rank <= RANK_END_OF_SELECTION);
  }

  /**
   * ADR-066 — the statements of the FORM or method around `index` that assign
   * one of its result parameters, by statement index. Empty outside a routine,
   * or where the signature names no result parameter this reader can find.
   */
  private resultWrites(index: number): Set<number> {
    const enclosing = this.structure.enclosing[index] ?? [];
    const routine = [...enclosing].reverse().find((b) => b.kind === 'form' || b.kind === 'method');
    if (!routine) return new Set();
    const cached = this.resultWriteCache.get(routine.openIndex);
    if (cached) return cached;
    const opener = this.statements[routine.openIndex].text;
    const params = new Set(routine.kind === 'form'
      ? resultParameters(opener, /\bCHANGING\b/i)
      : this.methodResultParameters(routine.openIndex));
    const out = new Set<number>();
    if (params.size) {
      for (let i = routine.openIndex + 1; i < routine.closeIndex; i++) {
        const target = assignmentTarget(this.statements[i].text);
        if (target && params.has(target)) out.add(i);
      }
    }
    this.resultWriteCache.set(routine.openIndex, out);
    return out;
  }

  /**
   * The `EXPORTING`, `CHANGING` and `RETURNING` parameters the declaration of
   * the method at `openIndex` names — read off `METHODS name …` in its class's
   * `DEFINITION`, or for `zif~name` in the interface. A declaration this
   * source does not hold yields none.
   */
  private methodResultParameters(openIndex: number): string[] {
    const written = /^METHOD\s+([\w/~]+)/i.exec(this.statements[openIndex].text)?.[1]?.toUpperCase();
    if (!written) return [];
    const tilde = written.indexOf('~');
    const owner = tilde < 0 ? this.classOf(openIndex) : written.slice(0, tilde);
    const name = tilde < 0 ? written : written.slice(tilde + 1);
    if (!owner) return [];
    for (const block of this.structure.blocks) {
      if (block.kind !== 'class' && block.kind !== 'interface') continue;
      const head = this.statements[block.openIndex].text;
      const declares = block.kind === 'interface'
        ? new RegExp(`^INTERFACE\\s+${owner.replace(/\//g, '\\/')}\\b(?!\\s+(?:DEFERRED|LOAD)\\b)`, 'i').test(head)
        : new RegExp(`^CLASS\\s+${owner.replace(/\//g, '\\/')}\\s+DEFINITION\\b(?!\\s+(?:DEFERRED|LOAD)\\b)`, 'i').test(head);
      if (!declares) continue;
      for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
        const text = this.statements[i].text;
        const m = /^(?:CLASS-)?METHODS\s+([\w/~]+)/i.exec(text);
        if (m && m[1].toUpperCase() === name) return resultParameters(text, /\b(?:EXPORTING|CHANGING|RETURNING)\b/i);
      }
    }
    return [];
  }

  /**
   * Does leaving at `index` skip anything this region draws? The way the
   * program would have gone without the exit is followed statement by
   * statement: an arm header leaves its construct, a loop's closing word runs
   * the loop again (so the exit skips the rest of it), a flow block counts with
   * everything inside it, and a container is stepped over as `walkRange` steps
   * over it.
   */
  private skipsSomething(index: number, last: number, drawn: ReadonlySet<number>): boolean {
    let j = index + 1;
    while (j <= last) {
      const block = this.blockAt.get(j);
      if (block) {
        if (FLOW_BLOCKS.has(block.kind)) {
          for (let k = j; k <= Math.min(block.closeIndex, last); k++) if (drawn.has(k)) return true;
        }
        j = Math.max(j + 1, block.closeIndex + 1);
        continue;
      }
      const keyword = this.statements[j].keyword.toUpperCase();
      if (ARM_HEADERS.has(keyword)) {
        const enclosing = this.structure.enclosing[j] ?? [];
        const owner = enclosing[enclosing.length - 1];
        if (owner && owner.closeIndex > j) {
          j = owner.closeIndex;
          continue;
        }
      }
      if (LOOP_CLOSERS.has(keyword)) return true;
      if (drawn.has(j)) return true;
      j += 1;
    }
    return false;
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
    for (const call of this.methodCallsIn(statement)) {
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
    if (write && this.isInternalWrite(write)) {
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

  /**
   * §5.8: a `FORM` is a collapsed sub-process above three elements. Below that
   * the call site becomes the one thing the routine does — which is why
   * `send_summary_mail` is a send task and `display_alv` a user task rather than
   * two boxes each. A routine that classifies stays a business rule task at any
   * size: `calculate_risk_scores` is 60 lines and still one decision table.
   */
  private collapseSmallRegions(): void {
    // A routine that collapses changes the kind of the call site inside the
    // routine above it, so one pass settles the innermost level only: `reject`
    // performs `log_approval`, and until `log_approval` is a write, `reject`
    // sees a sub-process and stays one. Repeat until nothing moves — bounded by
    // the number of regions, which is what a chain of them can be at most.
    // Both lists below used to be read with a `filter` over every node of the
    // source, once per region and once per pass — the work grew with the square
    // of the source, and on a 1.1 MB program it was the larger half of the time
    // `deriveBusinessRules` took. Neither `region`
    // nor `expandsTo` is written in this method; only `kind`, `collapsed` and
    // `detail` are. So the two groupings are read once, in node order, and a
    // pass then costs what its own nodes cost.
    const inRegion = new Map<string, SkeletonNode[]>();
    const callersOf = new Map<string, SkeletonNode[]>();
    for (const node of this.graph.nodes) {
      const own = inRegion.get(node.region);
      if (own) own.push(node);
      else inRegion.set(node.region, [node]);
      if (node.expandsTo === undefined) continue;
      const callers = callersOf.get(node.expandsTo);
      if (callers) callers.push(node);
      else callersOf.set(node.expandsTo, [node]);
    }

    for (let pass = 0; pass <= this.graph.regions.length; pass++) {
      let changed = false;
      for (const region of this.graph.regions) {
        if (region.kind !== 'sub-process') continue;
        // Roadmap 2.17 (b): the body of a `LOOP AT` is a region, but it is not a
        // routine small enough to be one step. Collapsing it would put the
        // dominant kind of the body on the loop element and take the
        // multi-instance marker off the only element that can carry it — the one
        // that contains the body. §5.8 collapses a `FORM`, never a loop.
        if (region.multiInstance) continue;
        // ADR-054: an early end is an end event, not an element of the routine —
        // it takes the place the flow to the normal end had, and counting it
        // would turn a small routine into a phase because it has two exits.
        const inner = (inRegion.get(region.key) ?? [])
          // Engine 3.1.0: a row put into the result (`collectStep`) is the yes of a decision, not an element that
          // makes a routine one step or a phase — the routine folds, or not, exactly as before it was drawn. The same
          // holds for the call of a technical helper drawn as an arm's outcome (`helperStep`): a log note is not an
          // element that turns a one-step routine into a level of its own.
          .filter((n) => n.id !== region.endNodeId && n.detail?.early !== true && n.detail?.collects !== true
            && n.detail?.helperCall !== true);
        const callers = callersOf.get(region.key) ?? [];
        if (!callers.length) continue;
        // Roadmap 2.17 (b): a routine that iterates a business table is a phase,
        // not a step — and that holds for a decision table too. Since the body
        // of that `LOOP AT` is a region of its own, the routine around it can
        // count two elements where it used to count ten
        // (`AUDIT_TRAVEL_EXPENSES` of `Z_EMPLOYEE_EXPENSE_VAL` went from seven
        // inner nodes to two, `CALCULATE_RISK_SCORES` of the 1.000-line example
        // from twelve to two), and §5.8's "more than three elements" would fold
        // a whole iteration into one box. The marker is what says there are
        // many: a region holding one is never one step.
        if (inner.some((n) => n.detail?.multiInstance === true)) {
          for (const caller of callers) caller.collapsed = false;
          continue;
        }
        if (callers[0].kind === 'business-rule-task') {
          for (const caller of callers) caller.collapsed = inner.length <= 3;
          continue;
        }
        // Engine 3.1.0 (AB-15a): a routine that calls a phase of its own is not one step. `main` creating the object
        // and calling `run` has two elements, and folding it onto the constructor's read hid the whole process
        // behind one box named after that read. A phase inside keeps the routine a phase. A routine's call of itself
        // (a retry by recursion) is not a phase of its own: it opens the very region being decided.
        if (this.reads310 && inner.some((n) => n.kind === 'sub-process' && n.expandsTo && n.expandsTo !== region.key && !n.collapsed)) {
          for (const caller of callers) {
            if (caller.collapsed) {
              caller.collapsed = false;
              caller.kind = 'sub-process';
              if (caller.detail) delete caller.detail.collapsedFrom;
              changed = true;
            }
          }
          continue;
        }
        const steps = inner.filter((n) => DOMINANT_ORDER.includes(n.kind));
        if (!inner.length || inner.length > 3 || !steps.length) {
          for (const caller of callers) caller.collapsed = false;
          continue;
        }
        const dominant = [...steps].sort(
          (a, b) => DOMINANT_ORDER.indexOf(a.kind) - DOMINANT_ORDER.indexOf(b.kind),
        )[0];
        for (const caller of callers) {
          if (caller.kind !== dominant.kind) changed = true;
          caller.kind = dominant.kind;
          caller.collapsed = true;
          caller.detail = { ...(caller.detail ?? {}), collapsedFrom: dominant.label };
        }
      }
      if (!changed) break;
    }
  }

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


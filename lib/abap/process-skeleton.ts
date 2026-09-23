import { afterKeyword, maskLiterals, type AbapStatement, type SourceRange } from './statement-reader';
import { type Block, type BlockStructure } from './block-structure';
import { type Branch, type ControlFlowReport } from './control-flow';
import { type CallGraphReport } from './call-graph';
import { databaseWriteIn } from './open-sql-discrimination';
import { buildProcessFacts, type ProcessFacts } from './process-facts';
import {
  hasOnlyTechnicalConditions,
  isTechnicalGateway,
  type ComparableElementKind,
} from './element-comparability';

/**
 * The process skeleton — roadmap 2.3.
 *
 * Steps, decisions, starts and ends, read out of the branches of 2.1 and the
 * calls of 2.2. No model is asked anything: without an API key this is the whole
 * process map, in the technical names the code itself uses. The palette is the
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
 * What this file does **not** do: draw anything. 2.3 is the reconstruction; the
 * BPMN view is 2.5 and the export 2.6. Neither is imported here, and nothing
 * here reaches the signed run.
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
  /** Start event — a classic event block, or the implicit `START-OF-SELECTION`. */
  | 'start'
  /** End event — the normal end of an entry or of a sub-process. */
  | 'end'
  /** Error end event — `MESSAGE … TYPE 'E'/'A'/'X'`, `RAISE`, `LEAVE PROGRAM`. */
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
  | 'no-return'
  | 'abort';

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
}

export type FormEffect =
  | 'write'
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
   * The evidence token, and nothing else — `V_VBAK_VKO`, `SCREEN 9000`,
   * `UPDATE TASK`. Never a job title and never a word from a list: §8 of the
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
   * purpose: `DESIGN.md` §5.8 calls that actor *"Prüfer (außerhalb des
   * Programms)"* — the checker does not execute a statement of this program, and
   * saying they do would be a sentence the source does not contain.
   */
  nodeIds: string[];
  /** 2.16: reconstructed from the code, never *Model proposal*, never confirmed. */
  status: 'reconstructed';
}

/** Above this many lanes no further evidence opens one (2.16, "mit Obergrenze"). */
export const MAX_LANES = 12;

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
}

/* ------------------------------------------------------------------ *
 * Keyword tables. Every one of them decides a kind out of §5.8, and
 * every one is a list of words the source may contain — never a guess
 * about what the program means.
 * ------------------------------------------------------------------ */

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

/** Statements that declare rather than do. None of them is a step. */
const DECLARATIVE = new Set([
  'REPORT', 'PROGRAM', 'FUNCTION-POOL', 'TABLES', 'TYPES', 'DATA', 'CONSTANTS',
  'FIELD-SYMBOLS', 'PARAMETERS', 'SELECT-OPTIONS', 'SELECTION-SCREEN', 'RANGES',
  'STATICS', 'CLASS-DATA', 'TYPE-POOLS', 'INFOTYPES', 'NODES', 'INCLUDE',
  'DEFINE', 'END-OF-DEFINITION', 'ENDFORM', 'ENDMODULE', 'ENDMETHOD',
  'ENDCLASS', 'ENDINTERFACE', 'CONTROLS', 'TYPE-POOL',
]);

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
 * the whole analysis in a `RangeError` (see `formRegion`). Two hundred is far
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

function snippet(text: string): string {
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/**
 * The statements inside a block, first and last, both inclusive.
 *
 * A block nothing closed has its last statement *as* its `closeIndex` rather
 * than one past it, and reading it with the terminated formula silently drops
 * the last statement of the routine — which for an unterminated `FORM` is the
 * one statement that made it a step at all.
 */
function bodyRange(block: Block): [number, number] {
  return [block.openIndex + 1, block.terminated ? block.closeIndex - 1 : block.closeIndex];
}

/** 0-based index of the first token equal to `word`, or 0 when there is none. */
function tokenIndexOf(statement: AbapStatement, word: RegExp): number {
  const tokens = statement.text.split(' ');
  const at = tokens.findIndex((t) => word.test(t));
  return at < 0 ? 0 : at;
}

function anchorOf(statement: AbapStatement, tokenOffset = 0): NodeAnchor {
  return {
    statementIndex: statement.index,
    tokenOffset,
    lineStart: statement.lineStart,
    lineEnd: statement.lineEnd,
  };
}

/** `MESSAGE e001 …`, `MESSAGE '…' TYPE 'E'` — the types that end the process. */
function isErrorMessage(text: string): boolean {
  if (/^MESSAGE\s+[eaxEAX]\d/.test(text)) return true;
  return /^MESSAGE\b[\s\S]*\bTYPE\s+'[EAXeax]'/.test(text);
}

/**
 * The Open SQL tables a `SELECT` reads, first one first.
 *
 * Read from the code, not from the statement as written: `SELECT 'FROM KNA1' AS
 * note FROM vbak INTO TABLE @lt.` took its first match from inside the literal,
 * so the reconstructed process showed a read of KNA1 — a table the program does
 * not touch — and none of VBAK (full review of b88c77b4b5d1, b785524eb15e /
 * 799c2176c57b / 9c2f1ba7fbc7).
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
 * (counter-review of c5085bbf, CR-07). What the statement proves is that SQL
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
 * displayed process simply did not show the data access (full review of
 * b88c77b4b5d1, 854c7e288bb7 / aa5214851b78 / 451efc95dcf9).
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

function isFileOutput(statement: AbapStatement): boolean {
  if (statement.keyword === 'TRANSFER') return true;
  return statement.keyword === 'OPEN' && /^OPEN\s+DATASET\b/i.test(statement.text);
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

export function buildProcessSkeleton(source: string): ProcessSkeleton {
  return buildProcessSkeletonFrom(buildProcessFacts(source));
}

/**
 * The same build, for a caller that already holds the facts of 2.1 and 2.2.
 *
 * The seam matters: branches, calls and blocks have to come from **one** reading
 * of the source, or the gateway and the task drawn from the same `IF` carry two
 * different line numbers (`process-facts.ts`).
 */
export function buildProcessSkeletonFrom(facts: ProcessFacts): ProcessSkeleton {
  return new SkeletonBuilder(
    facts.statements,
    facts.structure,
    facts.control,
    facts.calls,
  ).build();
}

interface Exit {
  from: string;
  condition: string;
  kind: SkeletonEdgeKind;
  reason?: SkeletonEdgeReason;
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

interface EntryPoint {
  statement: AbapStatement;
  lastIndex: number;
  label: string;
  rank: number;
  implicit: boolean;
}

/**
 * Does this condition say the step before it **failed**, or that it worked?
 * Roadmap 2.15 — `foldTechnicalGateways` needs to know which of the two arms is
 * the error arm before it can hang one on a boundary event, and the source is
 * the only place that says so.
 *
 * Anchored on purpose, and conservative on purpose. `sy-subrc <> 0` is an error
 * arm; `sy-subrc = 0 AND ls_eine-peinh > 0` is not read at all, although the
 * marker rule of `element-comparability.ts` calls it technical — it carries a
 * business comparison beside the return code, and negating that onto a boundary
 * event would be this engine saying something the source does not. A condition
 * this function cannot read returns `null`, and `null` keeps the gateway.
 *
 * ES2017 target: no lookbehind, no named groups, no `s` flag.
 */
const FAILURE_CONDITIONS: RegExp[] = [
  /^SY-(?:SUBRC|TABIX)\s*(?:<>|NE|>|GT)\s*0$/i,
  /^SY-(?:SUBRC|TABIX)\s+IS\s+NOT\s+INITIAL$/i,
  /^[\w/]*(?:<[\w/]+>|[\w/]+)(?:->[\w/]+)?\s+IS\s+NOT\s+(?:ASSIGNED|BOUND)$/i,
  /^LINES\s*\([^()]*\)\s*(?:=|EQ)\s*0$/i,
  /^LINES\s*\([^()]*\)\s+IS\s+INITIAL$/i,
];

const SUCCESS_CONDITIONS: RegExp[] = [
  /^SY-(?:SUBRC|TABIX)\s*(?:=|EQ)\s*0$/i,
  /^SY-(?:SUBRC|TABIX)\s+IS\s+INITIAL$/i,
  /^[\w/]*(?:<[\w/]+>|[\w/]+)(?:->[\w/]+)?\s+IS\s+(?:ASSIGNED|BOUND)$/i,
  /^LINES\s*\([^()]*\)\s*(?:>|GT)\s*0$/i,
];

function conditionAsserts(condition: string): 'failure' | 'success' | null {
  let text = condition.trim();
  let negated = false;
  // `CHECK sy-subrc = 0.` leaves `NOT ( sy-subrc = 0 )` on the other arm
  // (`walkCheck`), and that arm is the error arm.
  const not = /^NOT\s*\(([\s\S]*)\)$/i.exec(text);
  if (not) {
    negated = true;
    text = not[1].trim();
  }
  for (const pattern of FAILURE_CONDITIONS) {
    if (pattern.test(text)) return negated ? 'success' : 'failure';
  }
  for (const pattern of SUCCESS_CONDITIONS) {
    if (pattern.test(text)) return negated ? 'failure' : 'success';
  }
  return null;
}

/**
 * Which of the two arms is the error arm — roadmap 2.15.
 *
 * Either one of them says so itself (`sy-subrc <> 0`), or one says the step
 * worked and the other is the `ELSE` with no words of its own, which is then the
 * error arm by elimination. Anything else is `null`: two arms that both read as
 * failure, or neither, are not the shape this rule is about.
 */
function failureArm(arms: SkeletonEdge[]): SkeletonEdge | null {
  const failing = arms.filter((e) => conditionAsserts(e.condition) === 'failure');
  if (failing.length === 1) return failing[0];
  if (failing.length > 1) return null;
  const working = arms.filter((e) => conditionAsserts(e.condition) === 'success');
  const bare = arms.filter((e) => !e.condition.trim());
  if (working.length === 1 && bare.length === 1) return bare[0];
  return null;
}

class SkeletonBuilder {
  private nodes: SkeletonNode[] = [];
  private edges: SkeletonEdge[] = [];
  private regions: SkeletonRegion[] = [];
  private notes: SkeletonNote[] = [];
  /** Next free slot per statement — the second half of a node's identity. */
  private slots = new Map<number, number>();
  private unanchoredCount = 0;
  private blockAt = new Map<number, Block>();
  private branchAt = new Map<number, Branch>();
  private formBlocks = new Map<string, Block>();
  private effects = new Map<string, Set<FormEffect>>();
  private helpers = new Set<string>();
  private regionOfForm = new Map<string, SkeletonRegion>();
  /** The chain of routines being expanded right now — the floor of `formRegion`. */
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

  constructor(
    private statements: AbapStatement[],
    private structure: BlockStructure,
    private control: ControlFlowReport,
    private calls: CallGraphReport,
  ) {}

  build(): ProcessSkeleton {
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
    this.readSelectionScreen();
    this.readEffects();
    this.noteWhatIsNotRead();

    const entries = this.readEntryPoints();
    for (const entry of entries) this.buildEntryRegion(entry);
    this.collapseSmallRegions();
    this.applyGuards();
    // Roadmap 2.15: after the guards, so a folded run switch is already on its
    // flow when the conditions of a gateway are read — and before the notes,
    // which are counted over the graph this pass leaves behind.
    this.foldTechnicalGateways();
    this.noteUnreachableSteps();
    // Roadmap 2.16, last: a lane holds node ids, and `foldTechnicalGateways`
    // is the pass that can still drop one.
    const lanes = this.buildLanes();

    return {
      nodes: this.nodes,
      edges: this.edges,
      regions: this.regions,
      lanes,
      laneEvidence: this.evidence,
      entries: this.regions
        .filter((r) => r.kind === 'entry')
        .sort((a, b) => (a.runtimeRank ?? 0) - (b.runtimeRank ?? 0)
          || (a.anchor?.lineStart ?? 0) - (b.anchor?.lineStart ?? 0))
        .map((r) => r.key),
      notDrawn: {
        unreached: this.unreached(),
        unreachedLines: this.unreachedLines(),
        technicalHelpers: this.technicalHelpers(),
        clones: this.clones(),
      },
      anchoredNodes: this.nodes.length - this.unanchoredCount,
      unanchoredNodes: this.unanchoredCount,
      notes: this.notes,
    };
  }

  /* ---------------- nodes and edges ---------------- */

  /**
   * Rule 7. The slot counts up per statement, so a statement that yields two
   * nodes yields two identities. A node with no statement gets `nd-x-<n>`, which
   * cannot collide with an anchored one either.
   */
  private addNode(
    kind: SkeletonNodeKind,
    label: string,
    anchor: NodeAnchor | null,
    region: SkeletonRegion,
    container: string | null,
    extra: Partial<SkeletonNode> = {},
  ): SkeletonNode {
    let id: string;
    if (anchor) {
      const slot = this.slots.get(anchor.statementIndex) ?? 0;
      this.slots.set(anchor.statementIndex, slot + 1);
      id = `nd-${anchor.statementIndex}-${slot}`;
    } else {
      this.unanchoredCount += 1;
      id = `nd-x-${this.unanchoredCount}`;
    }
    const node: SkeletonNode = {
      id,
      kind,
      label,
      anchor,
      region: region.key,
      container,
      ...extra,
    };
    this.nodes.push(node);
    return node;
  }

  private connect(from: Exit[], to: string): void {
    for (const exit of from) {
      this.edges.push({
        from: exit.from,
        to,
        kind: exit.kind,
        condition: exit.condition,
        ...(exit.reason ? { reason: exit.reason } : {}),
      });
    }
  }

  private note(reason: SkeletonNoteReason, statement: AbapStatement, detail: string): void {
    this.notes.push({
      reason,
      detail,
      snippet: snippet(statement.text),
      lineStart: statement.lineStart,
      lineEnd: statement.lineEnd,
    });
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
        this.note('include-not-read', statement,
          'The text of an INCLUDE is not part of this source, so whatever it contributes to the process is not in this skeleton.');
      }
      if (statement.nativeSql) {
        this.note('native-sql', statement,
          'Native SQL is passed through to the database unread. What it touches is not drawn.');
      }
      if (statement.keyword === 'COMMIT' || statement.keyword === 'ROLLBACK') {
        this.note('commit-boundary', statement,
          'A commit boundary is IT knowledge and belongs in the Technical overlay (DESIGN.md §5.8), not in the flow.');
      }
    }
    for (const branch of this.control.notHandled) {
      if (branch.reason !== 'chained-branch') continue;
      this.notes.push({ ...branch, reason: 'chained-branch' });
    }
    for (const open of this.structure.unterminated) {
      const statement = this.statements.find((s) => s.lineStart === open.lineStart);
      if (!statement) continue;
      this.note('unterminated-container', statement,
        `No closing statement ends this ${open.kind}. Everything read inside it runs to the end of the file and is a guess, not an anchor.`);
    }
    for (const perform of this.calls.performs) {
      if (!perform.dynamic) continue;
      const statement = this.statements.find(
        (s) => s.lineStart === perform.lineStart && s.text === perform.text,
      );
      if (statement) {
        this.note('dynamic-call', statement,
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
   */
  private readEffects(): void {
    for (const [name, block] of this.formBlocks) {
      this.effects.set(name, this.directEffects(block));
      this.performedFrom.set(name, []);
    }
    for (const [name, block] of this.formBlocks) {
      const performed: string[] = [];
      const [from, to] = bodyRange(block);
      for (let i = from; i <= to; i++) {
        const statement = this.statements[i];
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

  private directEffects(block: Block, expanding: Set<string> = new Set()): Set<FormEffect> {
    const out = new Set<FormEffect>();
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
        // DEFINE the end of the whole analysis (security audit of b88c77b,
        // SEC-2026-227). A macro already being expanded is read once.
        if (!expanding.has(statement.keyword)) {
          expanding.add(statement.keyword);
          for (const effect of this.directEffects(macro.block, expanding)) out.add(effect);
          expanding.delete(statement.keyword);
        }
        continue;
      }
      const text = statement.text;
      if ((statement.keyword === 'SELECT' || isEmbeddedSelect(text)) && selectTables(text).length) out.add('read');
      if (databaseWriteIn(text)) out.add('write');
      if (adbcExecution(text)) out.add('call');
      if (/^CALL\s+FUNCTION\b/i.test(text)) {
        const kind = functionTaskKind(/^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text)?.[1]?.toUpperCase());
        if (kind === 'user-task') out.add('human');
        else if (kind === 'output') out.add('file');
        else out.add('call');
      }
      if (/^CALL\s+TRANSACTION\b/i.test(text) || statement.keyword === 'SUBMIT') out.add('call');
      if (/^CALL\s+SCREEN\b/i.test(text)) out.add('human');
      if (isListOutput(statement) || isFileOutput(statement)) out.add('file');
      if (isErrorMessage(text) || statement.keyword === 'RAISE') out.add('error');
      if (/^LEAVE\s+PROGRAM\b/i.test(text)) out.add('error');
      if (statement.keyword === 'AUTHORITY-CHECK') out.add('authority');
      const perform = /^PERFORM\s+([\w/]+)/i.exec(text);
      if (perform && !this.formBlocks.has(perform[1].toUpperCase())) out.add('call');
    }
    if (out.size === 0 && this.classifiesFromLiterals(block)) out.add('business-rule');
    return out;
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
   * Rule 4. The event blocks, and — when the program has no `START-OF-SELECTION`
   * — the statements it writes at program level, which ABAP runs as the implicit
   * one. A report without the keyword still has a skeleton.
   */
  private readEntryPoints(): EntryPoint[] {
    const out: EntryPoint[] = [];
    const isBoundary = (i: number) => {
      const block = this.blockAt.get(i);
      return this.isEventStatement(this.statements[i])
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
      out.push({
        statement: this.statements[i],
        lastIndex: Math.max(i, last),
        label: this.statements[i].text,
        rank: this.runtimeRank(this.statements[i].text),
        implicit: false,
      });
    }

    if (!out.some((e) => /^START-OF-SELECTION$/i.test(e.label))) {
      const free = this.programLevelStatements();
      if (free.length) {
        out.push({
          statement: free[0],
          lastIndex: free[free.length - 1].index,
          label: 'START-OF-SELECTION',
          rank: 5,
          implicit: true,
        });
      } else if (out.length === 0) {
        this.notes.push({
          reason: 'no-entry-point',
          detail:
            'This source names no event block and writes no statement at program level, so nothing here says where the process begins. Every routine it defines is listed as not reached.',
          snippet: '',
          lineStart: 1,
          lineEnd: Math.max(1, this.statements[this.statements.length - 1]?.lineEnd ?? 1),
        });
      }
    }
    return out;
  }

  /** Executable statements outside every block and outside every event block. */
  private programLevelStatements(): AbapStatement[] {
    const inEvent = new Set<number>();
    for (let i = 0; i < this.statements.length; i++) {
      if (!this.isEventStatement(this.statements[i])) continue;
      for (let j = i; j < this.statements.length; j++) {
        const block = this.blockAt.get(j);
        const boundary = j > i && (this.isEventStatement(this.statements[j])
          || (block !== undefined && (block.kind === 'form' || block.kind === 'module'
            || block.kind === 'class' || block.kind === 'interface' || block.kind === 'define')));
        if (boundary) break;
        inEvent.add(j);
      }
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
    if (this.regions.some((r) => r.key === key)) return;
    const region: SkeletonRegion = {
      key,
      kind: 'entry',
      label: entry.label,
      anchor: anchorOf(entry.statement),
      runtimeRank: entry.rank,
      endNodeId: '',
      entryNodeId: null,
    };
    this.regions.push(region);

    const container = entry.implicit ? null : entry.label;
    const start = this.addNode('start', entry.label, anchorOf(entry.statement), region, container, {
      detail: { implicit: entry.implicit, runtimeRank: entry.rank },
    });
    const last = this.statements[entry.lastIndex];
    const end = this.addNode('end', entry.label, anchorOf(last), region, container);
    region.endNodeId = end.id;

    const from = entry.implicit ? entry.statement.index : entry.statement.index + 1;
    const exits = this.walkRange(from, entry.lastIndex, {
      region, container, loops: [], loopBreaks: [],
    }, [{ from: start.id, condition: '', kind: 'sequence' }]);
    region.entryNodeId = start.id;
    this.connect(exits, end.id);
  }

  /** The region a `FORM` opens, built once however often the routine is performed. */
  private formRegion(name: string): SkeletonRegion | null {
    const known = this.regionOfForm.get(name);
    if (known) return known;
    const block = this.formBlocks.get(name);
    if (!block) return null;

    // A chain of PERFORMs is followed by recursion — this method, the walk over
    // the routine it opens, and the PERFORM in that routine call one another —
    // so the depth of the chain is the depth of the call stack. A source with a
    // 6000-link chain fits in 410 kB, well under the 1 MB a `legacyCode` field
    // may hold, and the stack gave out before the walk did: `RangeError:
    // Maximum call stack size exceeded` out of `buildProcessSkeleton`, and with
    // it every reading derived from it (security audit of b88c77b). The floor
    // answers the way the macro floor above does: read what can be read, and
    // say what was left unread rather than fail. Real chains are two digits at
    // most; this one is the last link that still gets opened.
    if (this.expanding.length >= MAX_PERFORM_EXPANSION) {
      this.note('expansion-depth-reached', this.statements[block.openIndex],
        `${name} is performed ${MAX_PERFORM_EXPANSION} calls deep, in a chain that starts at `
        + `${this.expanding[0]}. The call is drawn; what this routine does is not read, `
        + 'so no step inside it is in this skeleton.');
      return null;
    }

    const opener = this.statements[block.openIndex];
    const region: SkeletonRegion = {
      key: `form:${name}`,
      kind: 'sub-process',
      label: name,
      anchor: anchorOf(opener),
      endNodeId: '',
      entryNodeId: null,
      effects: [...(this.effects.get(name) ?? [])],
    };
    this.regions.push(region);
    this.regionOfForm.set(name, region);

    const closer = this.statements[block.closeIndex];
    const end = block.terminated
      ? this.addNode('end', name, anchorOf(closer), region, name)
      // Rule 1: nothing closed this routine, so where it ends is a guess. A node
      // that says so must not look like a node that carries a range.
      : this.addNode('end', name, null, region, name, {
        unanchoredReason: `FORM ${name} is not closed by ENDFORM in this source, so it has no end to anchor to.`,
      });
    region.endNodeId = end.id;

    const [from, to] = bodyRange(block);
    const guarded = this.readGuard(from, to, region);
    const before = this.nodes.length;
    this.expanding.push(name);
    const exits = this.walkRange(guarded, to, {
      region, container: name, loops: [], loopBreaks: [],
    }, []);
    this.expanding.pop();
    // A sub-process has no start event of its own — the call site is where it
    // begins — so its first node is the one nothing inside the region points at.
    // It is looked up by region and not by position: a `PERFORM` inside this
    // routine builds the region it opens *before* it adds its own call site, so
    // the node at `before` can belong to a routine one level down.
    region.entryNodeId = this.nodes.slice(before).find((n) => n.region === region.key)?.id ?? null;
    this.connect(exits, end.id);
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
          if (block.kind === 'if' || block.kind === 'case') live = this.walkBranch(block, ctx, live);
          else if (block.kind === 'try') live = this.walkTry(block, ctx, live);
          else if (block.kind === 'at') live = this.walkGroupChange(block, ctx, live);
          else live = this.walkLoop(block, ctx, live);
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
   * `DESIGN.md` §5.8 draws a parallel gateway *"nur wo der Code Parallelität
   * beweist"*, and 2.17 says what that proof is: **two or more**
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
    const fork = this.addNode('parallel-gateway', 'STARTING NEW TASK',
      anchorOf(first, tokenIndexOf(first, /^STARTING$/i)), ctx.region, ctx.container, {
        detail: { direction: 'diverging', branches: group.members.length },
      });
    this.connect(incoming, fork.id);

    const branchExits: Exit[] = [];
    for (const member of group.members) {
      branchExits.push(...this.walkStatement(this.statements[member], ctx,
        [{ from: fork.id, condition: '', kind: 'sequence' }], null).exits);
    }
    if (group.joinIndex === null) return branchExits;

    const wait = this.statements[group.joinIndex];
    const join = this.addNode('parallel-gateway', snippet(wait.text), anchorOf(wait),
      ctx.region, ctx.container, { detail: { direction: 'converging', branches: group.members.length } });
    this.connect(branchExits, join.id);
    return [{ from: join.id, condition: '', kind: 'sequence' }];
  }

  private walkBranch(block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
    const branch = this.branchAt.get(block.openIndex);
    const opener = this.statements[block.openIndex];
    if (!branch) {
      // 2.1 refused to read this construct (a chained IF, a macro body). The
      // skeleton refuses the gateway too and walks the body as a sequence, so
      // nothing inside it is lost.
      return this.walkRange(block.openIndex + 1, block.closeIndex - 1, ctx, incoming);
    }

    const label = branch.kind === 'case' ? (branch.selector ?? 'CASE') : snippet(opener.text);
    const gateway = this.addNode('gateway', label, anchorOf(opener), ctx.region, ctx.container, {
      detail: { branchId: branch.id, branchKind: branch.kind, arms: branch.arms.length },
    });
    this.connect(incoming, gateway.id);

    const exits: Exit[] = [];
    let hasDefault = false;
    for (let a = 0; a < branch.arms.length; a++) {
      const arm = branch.arms[a];
      const next = branch.arms[a + 1];
      const bodyFrom = arm.headerIndex + 1;
      const bodyTo = (next ? next.headerIndex : block.closeIndex) - 1;
      const isDefault = arm.kind === 'else' || arm.kind === 'when-others';
      if (isDefault) hasDefault = true;
      const armExits = this.walkRange(bodyFrom, bodyTo, ctx, [{
        from: gateway.id,
        condition: arm.condition,
        kind: isDefault ? 'default' : 'conditional',
      }]);
      exits.push(...armExits);
    }
    // No ELSE and no WHEN OTHERS: the gateway itself is the way past it.
    if (!hasDefault) exits.push({ from: gateway.id, condition: '', kind: 'default' });
    return exits;
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
    const gateway = this.addNode('gateway', snippet(opener.text), anchorOf(opener),
      ctx.region, ctx.container, { detail: { source: 'AT', condition } });
    this.connect(incoming, gateway.id);
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
        || statement.keyword === 'RAISE' || isErrorMessage(text)
        || /^LEAVE\s+PROGRAM\b/i.test(text) || /^LEAVE\s+TO\s+TRANSACTION\b/i.test(text)) {
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
    this.regions.push(region);

    const node = this.addNode('loop', table, anchorOf(opener), ctx.region, ctx.container, {
      expandsTo: region.key,
      detail: {
        loopKind: 'multi-instance',
        over: table.toUpperCase(),
        multiInstance: true,
        isSequential: true,
      },
    });
    this.connect(incoming, node.id);

    // The body is walked before the region gets an end node, because whether it
    // needs one is what the walk answers. Nothing in the body can read
    // `region.endNodeId` on the way: every statement that would — `CHECK`,
    // `RETURN`, `STOP`, a `SUBMIT` that does not come back — is a statement
    // `bodyStaysInLoop` has already refused.
    const before = this.nodes.length;
    const exits = this.walkRange(block.openIndex + 1, block.closeIndex - 1, {
      region, container: ctx.container, loops: [], loopBreaks: [],
    }, []);
    const body = this.nodes.slice(before).filter((n) => n.region === region.key);

    // **A body that draws nothing gets no plane.** `LOOP AT gt_orders … lv_sum
    // = lv_sum + ls-netwr … ENDLOOP` is a calculation, and §5.8 gives a
    // calculation no element — so the region would hold one end event and
    // nothing to reach it. §5.8 offers the other half of the same row for
    // exactly this: *eine Aktivität* with the marker on it, no sub-process. The
    // loop keeps its anchor, its table and its marker and stops expanding.
    if (!body.length) {
      this.regions = this.regions.filter((r) => r !== region);
      delete node.expandsTo;
      return [{ from: node.id, condition: '', kind: 'sequence' }];
    }

    const closer = this.statements[block.closeIndex];
    const end = block.terminated
      ? this.addNode('end', table, anchorOf(closer), region, ctx.container)
      : this.addNode('end', table, null, region, ctx.container, {
        unanchoredReason: `LOOP AT ${table} is not closed by ENDLOOP in this source, so its body has no end to anchor to.`,
      });
    region.endNodeId = end.id;
    region.entryNodeId = body[0].id;
    this.connect(exits, end.id);

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
      ? this.addNode('read', tables[0], anchorOf(opener, tokenIndexOf(opener, /^FROM$/i) + 1),
        ctx.region, ctx.container, {
          detail: { tables, iterates: true, loopKind: 'multi-instance' },
        })
      : this.addNode('loop', table ?? opener.keyword, anchorOf(opener), ctx.region, ctx.container, {
        detail: {
          loopKind: block.kind === 'loop' ? 'multi-instance' : 'standard',
          ...(table ? { over: table.toUpperCase() } : {}),
        },
      });
    this.connect(incoming, node.id);

    const breaks: Exit[] = [];
    const bodyExits = this.walkRange(block.openIndex + 1, block.closeIndex - 1, {
      ...ctx,
      loops: [...ctx.loops, node.id],
      loopBreaks: [...ctx.loopBreaks, breaks],
    }, [{ from: node.id, condition: '', kind: 'sequence' }]);
    for (const exit of bodyExits) {
      this.edges.push({ from: exit.from, to: node.id, kind: 'loop-back', condition: exit.condition });
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
    const beforeProtected = this.nodes.length;
    const exits = this.walkRange(block.openIndex + 1, protectedTo, ctx, incoming);
    const attachedTo = this.nodes.slice(beforeProtected).find((n) => n.region === ctx.region.key) ?? null;

    const out = [...exits];
    for (let h = 0; h < handlers.length; h++) {
      const header = this.statements[handlers[h]];
      const boundary = this.addNode('error-boundary', afterKeyword(header) || header.keyword,
        anchorOf(header), ctx.region, ctx.container, {
          detail: { attachedTo: attachedTo?.id ?? '', source: header.keyword },
        });
      if (attachedTo) {
        this.edges.push({ from: attachedTo.id, to: boundary.id, kind: 'boundary', condition: '' });
      } else {
        // A protected part that drew no node still runs, so its handler is still
        // a path the program can take. Leaving the boundary unconnected made
        // `noteUnreachableSteps` say the opposite — that nothing leads to the
        // CATCH because what stands before it does not come back — with no
        // control flow anywhere in the source to show it (counter-review of
        // c5085bbf, CR-07). The handler hangs on what entered the TRY.
        for (const entry of incoming) {
          this.edges.push({ from: entry.from, to: boundary.id, kind: 'boundary', condition: '' });
        }
      }
      const to = (handlers[h + 1] ?? block.closeIndex) - 1;
      out.push(...this.walkRange(handlers[h] + 1, to, ctx,
        [{ from: boundary.id, condition: '', kind: 'sequence' }]));
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
      this.connect(incoming, node.id);
      return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: null };
    };

    if (statement.nativeSql || DECLARATIVE.has(statement.keyword)) {
      return { exits: incoming, outputRun: null };
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
      this.leaveTo(incoming, ctx.region.endNodeId, 'sequence', reason);
      return { exits: [], outputRun: null };
    }

    /* Rule 3 — what comes back, and what does not. */
    if (statement.keyword === 'SUBMIT') {
      const returns = /\bAND\s+RETURN\b/i.test(text) || /\bVIA\s+JOB\b/i.test(text);
      const program = /^SUBMIT\s+(?:\(\s*([\w/]+)\s*\)|'([^']*)'|([\w/]+))/i.exec(text);
      const node = this.addNode('call-activity',
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
      this.connect(incoming, node.id);
      if (returns) return { exits: [{ from: node.id, condition: '', kind: 'sequence' }], outputRun: null };
      this.edges.push({ from: node.id, to: ctx.region.endNodeId, kind: 'sequence', condition: '', reason: 'no-return' });
      return { exits: [], outputRun: null };
    }
    if (/^LEAVE\s+TO\s+TRANSACTION\b/i.test(text)) {
      const code = /TRANSACTION\s+'([^']*)'/i.exec(text)?.[1]?.toUpperCase();
      const node = this.addNode('call-activity', code ?? 'LEAVE TO TRANSACTION',
        anchorOf(statement), ctx.region, ctx.container, { detail: { returns: false } });
      this.connect(incoming, node.id);
      this.edges.push({ from: node.id, to: ctx.region.endNodeId, kind: 'sequence', condition: '', reason: 'no-return' });
      return { exits: [], outputRun: null };
    }
    if (/^LEAVE\s+PROGRAM\b/i.test(text) || isErrorMessage(text) || statement.keyword === 'RAISE') {
      const node = this.addNode('end-error', this.errorLabel(statement), anchorOf(statement),
        ctx.region, ctx.container);
      this.connect(incoming, node.id);
      return { exits: [], outputRun: null };
    }

    if (statement.keyword === 'PERFORM') return { ...this.walkPerform(statement, ctx, incoming), outputRun: null };

    if (/^CALL\s+FUNCTION\b/i.test(text)) return { ...this.walkFunction(statement, ctx, incoming), outputRun: null };

    if (/^CALL\s+TRANSACTION\b/i.test(text)) {
      const call = this.calls.transactions.find((t) => t.lineStart === statement.lineStart);
      const node = this.addNode('transaction', call?.code ?? call?.codeExpression ?? 'CALL TRANSACTION',
        anchorOf(statement, 2), ctx.region, ctx.container, {
          detail: {
            batchInput: call?.batchInput ?? false,
            dynamic: call?.dynamic ?? true,
            // Rule 3: batch input returns, and the caller goes on.
            returns: true,
          },
        });
      return keep(node);
    }
    if (/^CALL\s+SCREEN\b/i.test(text)) {
      const screen = /^CALL\s+SCREEN\s+([\w/]+)/i.exec(text)?.[1] ?? 'CALL SCREEN';
      // 2.16: a dynpro is a person. The token is written the way the source
      // writes it, `SCREEN 9000`, and both words are in the statement.
      this.recordEvidence('human', `SCREEN ${screen.toUpperCase()}`, anchorOf(statement, 1), statement);
      return keep(this.addNode('user-task', screen, anchorOf(statement, 2), ctx.region, ctx.container));
    }

    if (statement.keyword === 'SELECT' || isEmbeddedSelect(text)) {
      const tables = selectTables(text);
      if (tables.length) {
        return keep(this.addNode('read', tables[0],
          anchorOf(statement, tokenIndexOf(statement, /^FROM$/i) + 1), ctx.region, ctx.container, {
            detail: { tables, single: /^SELECT\s+SINGLE\b/i.test(text) },
          }));
      }
      return { exits: incoming, outputRun: null };
    }
    const write = databaseWriteIn(text);
    if (write) {
      return keep(this.addNode('write', write.table.toUpperCase(),
        anchorOf(statement, tokenIndexOf(statement, new RegExp(`^${write.table}$`, 'i'))),
        ctx.region, ctx.container, { detail: { operation: write.keyword } }));
    }

    const adbc = adbcExecution(text);
    if (adbc) {
      return keep(this.addNode('call-opaque', adbc.method,
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

    if (isListOutput(statement) || isFileOutput(statement)) {
      const target = isFileOutput(statement) ? 'file' : 'list';
      if (outputRun && outputRun.detail?.target === target && outputRun.anchor) {
        // A run of `WRITE` is one result list, not eight data objects. The run
        // keeps the anchor of its first statement (rule 2) and grows its range.
        outputRun.anchor.lineEnd = statement.lineEnd;
        const detail = outputRun.detail as { statements: number };
        detail.statements += 1;
        return { exits: incoming, outputRun };
      }
      const node = this.addNode('output', statement.keyword, anchorOf(statement), ctx.region,
        ctx.container, { detail: { statements: 1, target } });
      this.connect(incoming, node.id);
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
    return { exits: incoming, outputRun: null };
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
      this.edges.push({ from: exit.from, to, kind, condition: exit.condition, reason });
    }
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
    const gateway = this.addNode('gateway', snippet(statement.text), anchorOf(statement, 1),
      ctx.region, ctx.container, { detail: { source: 'CHECK', condition } });
    this.connect(incoming, gateway.id);

    const falsePath: Exit[] = [{ from: gateway.id, condition: `NOT ( ${condition} )`, kind: 'conditional' }];
    if (ctx.loops.length) {
      this.leaveTo(falsePath, ctx.loops[ctx.loops.length - 1], 'loop-back', 'check-leaves-loop');
    } else if (ctx.region.kind === 'sub-process') {
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
      const node = this.addNode('call-opaque',
        target ?? call?.text ?? 'PERFORM', anchorOf(statement, 1), ctx.region, ctx.container, {
          detail: {
            dynamic: call?.dynamic ?? false,
            ...(call?.program ? { program: call.program } : {}),
            // The source of the routine is not here. The flow still returns.
            returns: true,
          },
        });
      this.connect(incoming, node.id);
      return { exits: [{ from: node.id, condition: '', kind: 'sequence' }] };
    }

    if (this.helpers.has(target)) {
      // §5.8: a routine without an effect of its own is part of its caller.
      return { exits: incoming };
    }

    const region = this.formRegion(target);
    const block = this.formBlocks.get(target);
    const effects = this.effects.get(target) ?? new Set<FormEffect>();
    const onlyRule = effects.size === 1 && effects.has('business-rule');
    // Rule 2: the anchor of the call is the call, not the routine. The routine's
    // own range travels alongside it as the secondary one, so a reader can jump
    // to the definition without the node pretending to live there.
    const anchor: NodeAnchor = {
      ...anchorOf(statement, 1),
      ...(block
        ? { secondary: { lineStart: block.lineStart, lineEnd: block.lineEnd, reason: 'routine-definition' as const } }
        : {}),
    };
    const node = this.addNode(onlyRule ? 'business-rule-task' : 'sub-process', target,
      anchor, ctx.region, ctx.container, {
        ...(region ? { expandsTo: region.key } : {}),
        detail: { effects: [...effects] },
      });
    this.connect(incoming, node.id);
    return { exits: [{ from: node.id, condition: '', kind: 'sequence' }] };
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
    const node = this.addNode(kind, label, anchorOf(statement, 2), ctx.region, ctx.container, {
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
    this.connect(incoming, node.id);
    this.readLaneEvidence(statement, kind, label, call?.destination);
    const exits: Exit[] = [{ from: node.id, condition: '', kind: 'sequence' }];

    if (/\bEXCEPTIONS\b/i.test(statement.text) && this.handlesSubrcAfter(statement.index)) {
      const boundary = this.addNode('error-boundary', label,
        anchorOf(statement, tokenIndexOf(statement, /^EXCEPTIONS$/i)), ctx.region, ctx.container, {
          detail: { attachedTo: node.id, exceptions: this.exceptionNames(statement.text) },
        });
      this.edges.push({ from: node.id, to: boundary.id, kind: 'boundary', condition: '' });
      exits.push({ from: boundary.id, condition: '', kind: 'sequence' });
    }
    return { exits };
  }

  /** Does the statement right after this one read `sy-subrc`? §5.8 asks for it. */
  private handlesSubrcAfter(index: number): boolean {
    for (let i = index + 1; i <= index + 2 && i < this.statements.length; i++) {
      const next = this.statements[i];
      if (!['IF', 'CASE', 'CHECK'].includes(next.keyword)) continue;
      if (/\bsy-subrc\b/i.test(next.text)) return true;
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
    this.note('macro-call', statement,
      `The body of macro ${statement.keyword} is expanded here by the compiler. Its effects are anchored at this call site; the definition is a secondary range.`);

    let live = incoming;
    for (let i = macro.block.openIndex + 1; i < macro.block.closeIndex; i++) {
      const body = this.statements[i];
      const node = this.macroEffectNode(body, statement, ctx);
      if (!node) continue;
      this.connect(live, node.id);
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
      this.addNode(kind, label, {
        ...anchorOf(site),
        secondary: { lineStart: body.lineStart, lineEnd: body.lineEnd, reason: 'macro-definition' },
      }, ctx.region, ctx.container, { detail: { ...(detail ?? {}), fromMacro: site.keyword } });

    const write = databaseWriteIn(body.text);
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
    if (isErrorMessage(body.text)) return at('end-error', this.errorLabel(body));
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
    // `deriveBusinessRules` took (security audit of b88c77b). Neither `region`
    // nor `expandsTo` is written in this method; only `kind`, `collapsed` and
    // `detail` are. So the two groupings are read once, in node order, and a
    // pass then costs what its own nodes cost.
    const inRegion = new Map<string, SkeletonNode[]>();
    const callersOf = new Map<string, SkeletonNode[]>();
    for (const node of this.nodes) {
      const own = inRegion.get(node.region);
      if (own) own.push(node);
      else inRegion.set(node.region, [node]);
      if (node.expandsTo === undefined) continue;
      const callers = callersOf.get(node.expandsTo);
      if (callers) callers.push(node);
      else callersOf.set(node.expandsTo, [node]);
    }

    for (let pass = 0; pass <= this.regions.length; pass++) {
      let changed = false;
      for (const region of this.regions) {
        if (region.kind !== 'sub-process') continue;
        // Roadmap 2.17 (b): the body of a `LOOP AT` is a region, but it is not a
        // routine small enough to be one step. Collapsing it would put the
        // dominant kind of the body on the loop element and take the
        // multi-instance marker off the only element that can carry it — the one
        // that contains the body. §5.8 collapses a `FORM`, never a loop.
        if (region.multiInstance) continue;
        const inner = (inRegion.get(region.key) ?? []).filter((n) => n.id !== region.endNodeId);
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

  /**
   * A step nothing can reach, because what stands before it never comes back.
   *
   * `SUBMIT` without `AND RETURN`, `LEAVE PROGRAM`, `MESSAGE … TYPE 'E'`: the
   * statements written after one of those are still read and still anchored —
   * dropping them would cost the reader the lines — but they hang off no flow,
   * and a node with no way in is said out loud rather than drawn as if
   * something led to it.
   *
   * A boundary event is not one of them. It is attached to an activity rather
   * than reached by a sequence flow, so "nothing leads to it" is a statement
   * about this reader's graph and not about the program — and it was made about
   * a `CATCH` whose protected part simply drew no node (counter-review of
   * c5085bbf, CR-07). Unreachable is claimed where the source shows it.
   */
  private noteUnreachableSteps(): void {
    const reached = new Set(this.edges.map((e) => e.to));
    const entryNodes = new Set(this.regions.map((r) => r.entryNodeId));
    for (const node of this.nodes) {
      if (reached.has(node.id) || entryNodes.has(node.id) || node.kind === 'start') continue;
      if (node.kind === 'error-boundary') continue;
      const statement = node.anchor ? this.statements[node.anchor.statementIndex] : undefined;
      this.notes.push({
        reason: 'unreachable-after-abort',
        detail: `Nothing in this source leads to ${node.kind} "${node.label}": what stands before it in ${node.container ?? 'the program'} does not come back.`,
        snippet: statement ? snippet(statement.text) : node.label,
        lineStart: node.anchor?.lineStart ?? 0,
        lineEnd: node.anchor?.lineEnd ?? 0,
      });
    }
  }

  /**
   * §5.8's conditional flow: the run switch sits on the edge, not on a gateway.
   *
   * An edge that already carries a condition keeps it — an `IF` around the call
   * said something the switch does not, and joining the two with an `AND` this
   * engine wrote would be a condition nobody put in the source (rule 6). The
   * switch is on the node either way.
   */
  private applyGuards(): void {
    for (const region of this.regions) {
      const guard = region.guard;
      if (!guard) continue;
      const callers = this.nodes.filter((n) => n.expandsTo === region.key);
      const ids = new Set(callers.map((n) => n.id));
      for (const caller of callers) {
        caller.detail = { ...(caller.detail ?? {}), guard: guard.condition };
      }
      for (const edge of this.edges) {
        if (!ids.has(edge.to) || edge.condition) continue;
        edge.kind = 'conditional';
        edge.condition = guard.condition;
      }
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

  /**
   * The lanes — roadmap 2.16 (§16 V3).
   *
   * Two rules and no third:
   *
   * 1. **One lane for the run.** Every flow node of this program is executed by
   *    the same actor: the run. There is exactly one run per start, and the code
   *    proves no handover inside a program — so a second lane for the program's
   *    own steps would be a sentence the source does not contain. What the
   *    evidence decides is not *how many* such lanes there are but **what this
   *    one is called**: the first `human` or `system` token in source order,
   *    which is the first statement in the run that says who is at the keyboard
   *    or that nobody is. With no such token the lane takes the program's own
   *    name from `REPORT`/`PROGRAM`, which is still a token out of the source.
   * 2. **One lane per distinct `AUTHORITY-CHECK` object.** That is the only
   *    place ABAP names an actor *outside* the program, and §5.8 calls it
   *    exactly that — *"Prüfer (außerhalb des Programms)"*. Two checks on
   *    `V_VBAK_VKO` are one actor and therefore one lane; the lane holds no flow
   *    node, because the checker runs none of them.
   *
   * Measured on the 1.000-line example: four kinds of evidence (L197/L205
   * authority, L510 update task, L616 ALV, L402 destination) and **2 lanes** —
   * the destination is a pool, the two authority checks are one object, and the
   * run is one lane whatever else it does. `CALL SCREEN 9000` at L670 never
   * arrives here at all: no entry point reaches `legacy_call_screen_example`, so
   * the walk never passes the statement.
   *
   * `MAX_LANES` is the upper bound 2.16 asks for. Evidence past it opens no
   * lane and stays visible in `laneEvidence`.
   */
  private buildLanes(): SkeletonLane[] {
    if (!this.nodes.length) return [];
    const lanes: SkeletonLane[] = [];

    const runEvidence = this.evidence
      .filter((e) => e.kind === 'human' || e.kind === 'system')
      .sort((a, b) => a.anchor.statementIndex - b.anchor.statementIndex);
    const named = runEvidence[0];
    const program = this.programName();
    const entry = this.regions.find((r) => r.kind === 'entry' && r.anchor);
    const anchor = named?.anchor ?? program?.anchor ?? entry?.anchor ?? this.firstAnchor();
    if (!anchor) return [];

    lanes.push({
      id: 'lane-1',
      kind: named ? (named.kind === 'human' ? 'human' : 'system') : 'program',
      name: named?.token ?? program?.name ?? '',
      ...(named || program ? {} : {
        unnamedReason:
          'The source names no dialogue, no background task and no program name, so nothing in it says who runs these steps.',
      }),
      anchor,
      evidence: runEvidence,
      nodeIds: this.nodes.map((n) => n.id),
      status: 'reconstructed',
    });

    const byObject = new Map<string, LaneEvidence[]>();
    for (const e of this.evidence) {
      if (e.kind !== 'authority') continue;
      byObject.set(e.token, [...(byObject.get(e.token) ?? []), e]);
    }
    for (const [token, evidence] of byObject) {
      if (lanes.length >= MAX_LANES) break;
      lanes.push({
        id: `lane-${lanes.length + 1}`,
        kind: 'authority',
        name: token,
        anchor: evidence[0].anchor,
        evidence,
        nodeIds: [],
        status: 'reconstructed',
      });
    }
    return lanes;
  }

  /** `REPORT zlegacy_order_fulfillment_audit …` — a token out of the source, upper-cased. */
  private programName(): { name: string; anchor: NodeAnchor } | null {
    for (const statement of this.statements) {
      if (statement.keyword !== 'REPORT' && statement.keyword !== 'PROGRAM') continue;
      const name = /^(?:REPORT|PROGRAM)\s+([\w/]+)/i.exec(statement.text)?.[1];
      if (name) return { name: name.toUpperCase(), anchor: anchorOf(statement, 1) };
    }
    return null;
  }

  private firstAnchor(): NodeAnchor | null {
    return this.nodes.find((n) => n.anchor)?.anchor ?? null;
  }

  /* ---------------- roadmap 2.15 ---------------- */

  /**
   * A return code is the **effect of a step**, not a decision of the process —
   * roadmap 2.15 (§16 V2), after 1.9.
   *
   * `IF sy-subrc <> 0.` right behind a call, a read or a write is not something
   * the process decides. It is the one step reporting whether it worked, and the
   * target format has a shape for exactly that: a boundary event on the step,
   * with the error path leaving it. Drawing it as an `exclusiveGateway` is what
   * made this engine's maps read like a control-flow graph with BPMN names —
   * measured over the eight shipped examples, **27 of 68 gateways (39,7 %)** are
   * of this kind by their conditions, and decisions per activity stood at 0,82
   * against 0,10 in the median of the reference holding.
   *
   * Worse, for a `CALL FUNCTION … EXCEPTIONS` the same error path was drawn
   * **twice**: `walkFunction` hangs a boundary event on the call when the next
   * statements read `sy-subrc`, and then the `IF` that reads it walked through
   * here as a gateway of its own. In 5 of 5 such places both were drawn, and
   * `tests/abap-process-skeleton.spec.ts` pinned only the pair, never the
   * gateway behind it. 2.15 says which of the two survives: "the boundary event
   * `walkFunction` creates today **in addition** becomes the only one".
   *
   * The rule is not written here. Both halves of it live in
   * `element-comparability.ts` — `hasOnlyTechnicalConditions` for the conditions,
   * `isTechnicalGateway` for conditions **and** the single call/read/write
   * predecessor — so that the Business view and the export cannot drift apart
   * about what a decision is. Two copies of one rule are two rules.
   *
   * What this pass does **not** do, each for a reason that cost a measurement:
   *
   * - **No cascade.** The pass decides on the graph as the walk left it and
   *   never on its own result. In `Z_MM_PO_APPROVAL` `check_authority` the
   *   second `IF sy-subrc <> 0.` belongs to an `AUTHORITY-CHECK`, which draws no
   *   node (it is lane evidence, 2.16); its only predecessor in the graph is the
   *   `SELECT … FROM eban` of the *first* check. Folding the first one and then
   *   reading the graph again would hang the authority error on that read — a
   *   sentence the source does not contain.
   * - **No fold without a named error arm.** `sy-subrc = 0 AND ls_eine-peinh > 0`
   *   is technical by the marker rule and still half a business condition; it
   *   stays a gateway. Only the shapes `conditionAsserts` can read end up as a
   *   boundary.
   * - **No fold of a gateway with more than two arms**, and none whose step
   *   already leads somewhere else: both would leave an activity with two
   *   unconditional ways out, which is not a shape BPMN gives a meaning to.
   *
   * Rule 6 is untouched throughout: the condition text travels **verbatim** onto
   * the flow that leaves the boundary event, and the other arm keeps its own
   * words too. Nothing becomes unreachable — every arm of the gateway is still a
   * flow, only from one node further up.
   */
  private foldTechnicalGateways(): void {
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    const outgoing = new Map<string, SkeletonEdge[]>();
    const incoming = new Map<string, SkeletonEdge[]>();
    for (const edge of this.edges) {
      const from = outgoing.get(edge.from);
      if (from) from.push(edge); else outgoing.set(edge.from, [edge]);
      const to = incoming.get(edge.to);
      if (to) to.push(edge); else incoming.set(edge.to, [edge]);
    }
    const entryNodes = new Set(this.regions.map((r) => r.entryNodeId));
    const droppedNodes = new Set<string>();
    const droppedEdges = new Set<SkeletonEdge>();
    /**
     * Decided first, applied afterwards — this is the "no cascade" above, and it
     * has to be two loops to be true. The maps hold the **same** edge objects the
     * apply step writes `from` on, so a single loop would read its own result
     * one gateway later and fold the `AUTHORITY-CHECK` of `check_authority` onto
     * the `SELECT … FROM eban` two statements above it.
     */
    const plans: Array<{
      gateway: SkeletonNode;
      step: SkeletonNode;
      boundary?: SkeletonNode;
      failure: SkeletonEdge;
      survivor: SkeletonEdge;
      into: SkeletonEdge[];
    }> = [];

    for (const gateway of this.nodes) {
      if (gateway.kind !== 'gateway' || entryNodes.has(gateway.id)) continue;
      const arms = outgoing.get(gateway.id) ?? [];
      const into = incoming.get(gateway.id) ?? [];
      // Two arms: the step failed, or it did not. A `CASE` with three ways out
      // is not this shape whatever its conditions say.
      if (arms.length !== 2) continue;
      if (!hasOnlyTechnicalConditions(arms.map((e) => e.condition))) continue;

      // The predecessor half. Two shapes are accepted and nothing else: one
      // call/read/write step, or that step **together with the boundary event
      // `walkFunction` already hung on it** — which is the double drawing, and
      // the boundary is itself the proof that this step's `sy-subrc` is what the
      // branch reads (`walkFunction` hangs one only on a `CALL FUNCTION …
      // EXCEPTIONS` whose next statements read it).
      const predecessors = into.map((e) => byId.get(e.from)).filter((n): n is SkeletonNode => !!n);
      let step: SkeletonNode | undefined;
      let boundary: SkeletonNode | undefined;
      if (predecessors.length === 1) {
        const only = predecessors[0];
        if (isTechnicalGateway({
          conditions: arms.map((e) => e.condition),
          predecessorKinds: [only.kind as ComparableElementKind],
        })) step = only;
      } else if (predecessors.length === 2) {
        const hung = predecessors.find((n) => n.kind === 'error-boundary');
        const other = predecessors.find((n) => n !== hung);
        if (hung && other && hung.detail?.attachedTo === other.id) {
          step = other;
          boundary = hung;
        }
      }
      if (!step) continue;

      // The step may not already lead somewhere else, and a boundary that is
      // reused may not either: both would end up with two ways out.
      const stepOut = (outgoing.get(step.id) ?? []).filter((e) => e.kind !== 'boundary');
      if (stepOut.length !== 1 || stepOut[0].to !== gateway.id) continue;
      if (boundary) {
        const hungOut = outgoing.get(boundary.id) ?? [];
        if (hungOut.length !== 1 || hungOut[0].to !== gateway.id) continue;
      }

      // **The branch has to read *this* step's return code, and adjacency is
      // the only proof of that this reader has.** `sy-subrc` is one global
      // field: every statement that sets it overwrites the one before. Corpus
      // case CC-055 is the whole argument — `CALL TRANSACTION 'XD01' … / READ
      // TABLE gt_msg … / IF sy-subrc = 0.` The `READ TABLE` draws no node, so
      // the graph shows the gateway hanging off the call, and folding it would
      // hang "did the message table contain an error?" on the transaction as
      // its failure. The corpus caught exactly that (`skelett`, CC-055), which
      // is what 1.9 was built before this step for.
      //
      // So: the `IF` must be the statement right after the step. The one
      // exception is a step that already carries a boundary event, because
      // `handlesSubrcAfter` drew it with a window of two statements — and the
      // two have to agree, or the double drawing this step removes comes back.
      const stepStatement = step.anchor?.statementIndex;
      const branchStatement = gateway.anchor?.statementIndex;
      if (stepStatement === undefined || branchStatement === undefined) continue;
      const distance = branchStatement - stepStatement;
      if (distance < 1 || distance > (boundary ? 2 : 1)) continue;

      const failure = failureArm(arms);
      if (!failure) continue;
      const survivor = arms.find((e) => e !== failure);
      if (!survivor) continue;

      plans.push({ gateway, step, boundary, failure, survivor, into });
    }

    for (const { gateway, step, boundary, failure, survivor, into } of plans) {
      if (boundary) {
        // The double drawing. The boundary event that was already there takes
        // the error arm and becomes the only one; the gateway goes.
        failure.from = boundary.id;
        droppedNodes.add(gateway.id);
        for (const edge of into) droppedEdges.add(edge);
      } else {
        // No boundary yet: the gateway **becomes** one, in place. Keeping the
        // node rather than dropping it and adding another keeps the id, and with
        // it the anchor of the `IF` — which is the line a reader of the map
        // wants to see when they follow the error path (2.5).
        gateway.kind = 'error-boundary';
        gateway.label = step.label;
        gateway.detail = {
          ...(gateway.detail ?? {}),
          attachedTo: step.id,
          foldedGateway: true,
          // Only when the source wrote words on this arm. `IF sy-subrc = 0. …
          // ELSE. …` puts them on the *other* one, and the error arm is the
          // `ELSE`, which has none — inventing one here would be rule 6 broken
          // in the one place the step touches.
          ...(failure.condition ? { condition: failure.condition } : {}),
        };
        const attach = into[0];
        attach.kind = 'boundary';
        attach.condition = '';
      }
      // The other arm carries on from the step itself, with its own words on it
      // (rule 6). `default` is a gateway's word for "the way past it", and this
      // is no longer a gateway.
      survivor.from = step.id;
      if (survivor.kind === 'default' || survivor.kind === 'conditional') survivor.kind = 'sequence';
    }

    if (droppedNodes.size) this.nodes = this.nodes.filter((n) => !droppedNodes.has(n.id));
    if (droppedEdges.size) this.edges = this.edges.filter((e) => !droppedEdges.has(e));
  }

  private unreached(): UnreachedRegion[] {
    const out: UnreachedRegion[] = [];
    for (const name of this.calls.unreachable) {
      const block = this.formBlocks.get(name);
      if (block) out.push({ name, kind: 'form', lineStart: block.lineStart, lineEnd: block.lineEnd });
    }
    // A screen module runs from a dynpro, and a dynpro is not in this source: no
    // entry point here reaches one, so §5.8 counts them with the unreached code
    // rather than drawing a start event nothing proves.
    for (const block of this.structure.blocks) {
      if (block.kind !== 'module') continue;
      const name = /^MODULE\s+([\w/]+)/i.exec(this.statements[block.openIndex].text)?.[1];
      if (name) {
        out.push({ name: name.toUpperCase(), kind: 'module', lineStart: block.lineStart, lineEnd: block.lineEnd });
      }
    }
    return out.sort((a, b) => a.lineStart - b.lineStart);
  }

  private unreachedLines(): number {
    return this.unreached().reduce((sum, r) => sum + (r.lineEnd - r.lineStart + 1), 0);
  }

  private technicalHelpers(): FoldedForm[] {
    const out: FoldedForm[] = [];
    for (const name of this.helpers) {
      if (this.calls.unreachable.includes(name)) continue;
      const block = this.formBlocks.get(name);
      if (!block) continue;
      out.push({
        name,
        lineStart: block.lineStart,
        lineEnd: block.lineEnd,
        // Counted off 2.2's call graph, not off the walk: a helper performed
        // only by another helper is never walked and would otherwise read as
        // called from nowhere.
        callSites: this.calls.performs.filter((p) => p.target === name).length,
      });
    }
    return out.sort((a, b) => a.lineStart - b.lineStart);
  }

  /**
   * §5.8: *"14 forms identical except the rule number"*.
   *
   * Two routines are the same shape when their bodies match once every number is
   * replaced by `#` and every occurrence of their own name is removed — which is
   * exactly what the fourteen rule routines of the reference case differ by.
   */
  private clones(): CloneGroup[] {
    const groups = new Map<string, string[]>();
    for (const [name, block] of this.formBlocks) {
      const body: string[] = [];
      // The `FORM` header is part of the shape: two routines with the same body
      // and different parameters are not the same routine.
      for (let i = block.openIndex; i <= bodyRange(block)[1]; i++) {
        body.push(this.statements[i].text.toUpperCase().replace(/\d+/g, '#'));
      }
      const shape = body.join(' | ').split(name.toUpperCase()).join('<SELF>');
      groups.set(shape, [...(groups.get(shape) ?? []), name]);
    }
    const out: CloneGroup[] = [];
    for (const [shape, names] of groups) {
      if (names.length < 2) continue;
      const blocks = names
        .map((n) => this.formBlocks.get(n))
        .filter((b): b is Block => b !== undefined);
      if (!blocks.length) continue;
      out.push({
        names: names.sort(),
        lineStart: Math.min(...blocks.map((b) => b.lineStart)),
        lineEnd: Math.max(...blocks.map((b) => b.lineEnd)),
        shape: snippet(shape),
      });
    }
    return out.sort((a, b) => a.lineStart - b.lineStart);
  }
}


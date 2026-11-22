import { maskLiterals, type AbapStatement } from '../statement-reader';
import type { SkeletonNodeKind } from '../process-skeleton';

/**
 * The recognisers of the skeleton — engine 4 phase 3 (`docs/design/engine4.md`, "Phase 3"). Every small reader
 * over one statement that decides a kind, an effect or an end, moved out of `process-skeleton.ts` unchanged, so a
 * concept is read in one place that every pass imports. One recogniser per concept, each with its probe spec, is
 * the second half of phase 3; this file is where they gather.
 */

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

/* ------------------------------------------------------------------ *
 * Small readers over one statement.
 * ------------------------------------------------------------------ */

/**
 * Engine 3.1.0 (`flagStep`): `field = value` where the value is one literal, a number or one name — `abap_true`,
 * `space`, a constant. A computed value (`a + b`, a call, a constructor) is a calculation, not a flag.
 */
export const FLAG_ASSIGNMENT = /^((?:<[\w/]+>|[\w/]+)(?:-[\w/]+)*)\s*=\s*('(?:[^']|'')*'|`(?:[^`]|``)*`|-?\d+|[\w/]+=>[\w/]+|[\w/]+)\s*\.?$/;
/** The built-in constants a flag is set to. Any other bare name must be a `CONSTANTS` of this source. */
export const BUILT_IN_FLAG_VALUES = new Set(['ABAP_TRUE', 'ABAP_FALSE', 'ABAP_UNDEFINED', 'SPACE']);
/** Engine 3.1.0 (`buildsWhileDeciding`): the blocks that decide or iterate around an append. */
export const DECIDING_BLOCKS = new Set(['if', 'case', 'loop', 'do', 'while', 'select']);
/** Engine 3.1.0 (`buildsWhileDeciding`): the statements that add rows to an internal table. */
export const BUILDS_TABLE = /^(?:APPEND\b[\s\S]*\bTO\b|COLLECT\b[\s\S]*\bINTO\b|INSERT\b[\s\S]*\bINTO\s+TABLE\b)/i;
/** Engine 3.1.0 (`collectStep`): a row built with the fields of a message (BAPIRET2, BAL, SYMSG). */
export const MESSAGE_ROW = /\b(?:MSGTY|MSGNO|MSGID|MSGV1)\s*=|\bTYPE\s*=[\s\S]*\bMESSAGE\s*=|\bMESSAGE\s*=[\s\S]*\bTYPE\s*=/i;
/** Engine 3.1.0 (`collectStep`): the table such a statement adds its row to. */
export const COLLECT_TARGET = /\b(?:TO|INTO\s+TABLE|INTO)\s+((?:<[\w/]+>|[\w/]+)(?:-[\w/]+)*)(?:\[\])?\s*(?:\.|$|\s(?:SORTED|REFERENCE|ASSIGNING)\b)/i;

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
export function isErrorMessage(text: string, anyCase = false): boolean {
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
export function isInfoMessage(text: string, anyCase = false): boolean {
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
export function isRaiseEvent(text: string): boolean {
  return /^RAISE\s+EVENT\b/i.test(text);
}

/** ADR-066 — the trigger of a FORM called by output control. */
export const OUTPUT_CONTROL = 'output control';

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
export const USER_EXIT = 'user exit';
const USER_EXIT_FORM = /^FORM\s+USEREXIT_\w+/i;

export function formConvention(opener: string): string | null {
  if (OUTPUT_CONTROL_FORM.test(opener.trim())) return OUTPUT_CONTROL;
  if (USER_EXIT_FORM.test(opener)) return USER_EXIT;
  return null;
}

/** `RAISE EXCEPTION …`, `RAISE cx_…`, `RAISE RESUMABLE …` — the `RAISE` that ends the flow. */
export function raisesException(statement: AbapStatement): boolean {
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
export function selectTables(text: string): string[] {
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
export function adbcExecution(text: string): { method: string; argument: string } | null {
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
export function isEmbeddedSelect(text: string): boolean {
  const code = maskLiterals(text);
  return /^(?:WITH\b|OPEN\s+CURSOR\b)/i.test(code.trim()) && /\bSELECT\b/i.test(code);
}

/** True for `WRITE …` that puts something on the list rather than into a field. */
export function isListOutput(statement: AbapStatement): boolean {
  if (!LIST_OUTPUT.has(statement.keyword)) return false;
  if (statement.keyword !== 'WRITE') return true;
  return !/\bTO\b/i.test(statement.text);
}

/** ADR-066 — `METHOD name BY DATABASE PROCEDURE|FUNCTION …`, an AMDP method; group 1 is the name. */
export const AMDP_METHOD = /^METHOD\s+([\w/~]+)\s+BY\s+DATABASE\s+(?:PROCEDURE|FUNCTION)\b/i;

/**
 * ADR-066 — the database objects an AMDP method's `USING` clause names,
 * upper-cased. The ABAP keyword documentation requires every dictionary
 * object the procedure accesses to be listed there; other AMDP methods named
 * as `class=>method` are not tables and are left out.
 */
export function amdpTables(opener: string): string[] {
  const using = /\bUSING\s+([\s\S]+)$/i.exec(opener.replace(/\.\s*$/, ''))?.[1] ?? '';
  return using.split(/[\s,]+/).filter((t) => /^[\w/]+$/.test(t)).map((t) => t.toUpperCase());
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
export function alvEventRows(statements: readonly AbapStatement[], table: string): Set<string> {
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
export function receivesResults(text: string): boolean {
  return /^RECEIVE\s+RESULTS\s+FROM\s+FUNCTION\b/i.test(text);
}

export function isFileOutput(statement: AbapStatement): boolean {
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
export function closesDataset(statement: AbapStatement): boolean {
  return statement.keyword === 'CLOSE' && /^CLOSE\s+DATASET\b/i.test(statement.text);
}

/**
 * The file a file statement works on, upper-cased: the `dset` operand of
 * `OPEN DATASET dset`, `CLOSE DATASET dset` and `TRANSFER dobj TO dset`.
 */
export function datasetOf(statement: AbapStatement): string | null {
  const operand = /^(?:OPEN|CLOSE)\s+DATASET\s+([^\s.]+(?:\.[^\s.]+)*)/i.exec(statement.text)
    ?? /^TRANSFER\b[\s\S]*?\bTO\s+([^\s.]+(?:\.[^\s.]+)*)/i.exec(statement.text);
  return operand ? operand[1].toUpperCase() : null;
}

/** The kind of task a `CALL FUNCTION` is, by the module it names (§5.8). */
export function functionTaskKind(name: string | undefined): SkeletonNodeKind {
  if (!name) return 'service-task';
  const bare = name.replace(/^\/[^/]+\//, '');
  if (SEND_FUNCTIONS.has(bare)) return 'send-task';
  if (USER_FUNCTION.test(bare)) return 'user-task';
  if (FILE_FUNCTIONS.has(bare)) return 'output';
  return 'service-task';
}

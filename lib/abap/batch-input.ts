import { readStatements, type AbapStatement } from './statement-reader';
import { readBlocks, containerAt, type Container } from './block-structure';

/**
 * Batch input read field by field — roadmap 3.0.7, from the
 * MM case review.
 *
 * `CALL TRANSACTION 'ME22' USING it_bdc` says only that a transaction is
 * driven. What it changes is written in the rows of `it_bdc`: a screen
 * (`SAPMM06E` `1117`) and the screen fields filled on it (`EKET-EEIND(01)`).
 * This reader collects those rows, in the order the source fills them, and ties
 * them to the batch-input call they feed. Whether a field's structure is a
 * database table is not decided here — screen structures such as `RM06E` or
 * `RV45A` look exactly like tables in the source — and `writesOf` takes that
 * decision as an argument, so the server side asks the SAP catalogue and a
 * client-safe caller can ask something smaller.
 *
 * Three ways the rows are written, all of them read:
 *
 *   1. **A routine or macro that fills one row** — `PERFORM bdc_field USING
 *      'EKET-EEIND(01)' l_datum.`, `bdc_f 'BKPF-BLDAT' lv_datum.`. Its body
 *      assigns a parameter to `-fnam` (or `fnam = &1` inside `VALUE #( … )`);
 *      the argument in that position at the call site is the field. The same
 *      for `-program`/`-dynpro`: a screen.
 *   2. **The row written in place** — `ls_bdc-fnam = 'VBAK-LIFSK'.` with its
 *      `-fval` after it, `ls_bdc-program = 'SAPMV45A'.` with its `-dynpro`.
 *   3. **`VALUE #( … )` with literals** — `( program = 'SAPMV45A' dynpro =
 *      '0102' dynbegin = 'X' ) ( fnam = 'VBAK-VBELN' fval = lv_vbeln )`.
 *
 * Only literal field names are read. A name computed at run time is not
 * guessed at, and the call then has fewer fields than it fills — never more.
 *
 * Which call a row belongs to: the rows filled in the routine that makes the
 * call, and in the routines it performs. Where that finds none and every
 * batch-input call of the source reads the same table, every row of the source
 * is that table's (rows built in a sibling routine, `PERFORM build` before
 * `PERFORM post`).
 *
 * Of those, a row stays out of a call only when the source says it went to
 * another call's table (`APPEND ls TO it_a` for ME22 and `APPEND ls TO it_b`
 * for VA02 used to give both calls both fields). A row's table
 * is read where it is written plainly — the next `APPEND <wa> TO <table>` /
 * `INSERT <wa> INTO TABLE <table>` of its work area within a few statements,
 * the `APPEND INITIAL LINE … ASSIGNING <fs>` before a field-symbol row, the
 * target of `<table> = VALUE #( … )` or `APPEND [LINES OF] VALUE #( … ) TO
 * <table>`, the table a carrier's body appends to (literal, or the argument
 * that names it). A row is dropped from a call only when its table is known,
 * differs from the call's, is the table of another batch-input call, and no
 * statement copies the one into the other (`it_b = it_a`, `MOVE`,
 * `APPEND LINES OF`, a routine or method given both). A row whose table is not
 * read, or is ambiguous, stays with every call that reaches it — a real write
 * is never dropped for a guess.
 * Pure: no catalogue, no model, no clock.
 */

/** A screen of the driven transaction: `SAPMM06E` `1117`. */
export interface BatchInputScreen {
  program: string;
  screen: string;
  line: number;
}

/** One screen field filled with a value. */
export interface BatchInputField {
  /** Upper-cased, index removed: `EKET-EEIND`. */
  field: string;
  /** As the source writes it: `EKET-EEIND(01)`. */
  raw: string;
  /** The part before the dash: `EKET`. */
  structure: string;
  /** The part after it: `EEIND`. */
  component: string;
  /** The value operand as written: `l_datum`, `'SA'`. Empty when it is not readable. */
  value: string;
  /** The screen the field is filled on, when one was named before it. */
  screen: BatchInputScreen | null;
  line: number;
  /** The last line of the statement that fills it — a `VALUE #( … )` spans several. */
  lineEnd: number;
  /**
   * The component is a document or master-data number (`VBELN`, `EBELN`,
   * `BELNR`, …): on a change transaction it names the object to open, it does
   * not change it. Never counted as a change (`writesOf`).
   */
  key: boolean;
}

export interface BatchInputCall {
  /** The transaction code, upper-cased; `null` when it is computed. */
  transaction: string | null;
  /** `CALL TRANSACTION … USING`, or a session row (`BDC_INSERT`). */
  via: 'call-transaction' | 'session';
  /** The table the rows stand in — `IT_BDC` — when the call names it. */
  table: string | null;
  line: number;
  statementIndex: number;
  screens: BatchInputScreen[];
  /** The fields filled, without the control fields (`BDC_OKCODE`, `BDC_CURSOR`, `BDC_SUBSCR`). */
  fields: BatchInputField[];
  /** The function codes the run presses, in order: `/00`, `=BU`. */
  okCodes: string[];
  /**
   * A row of this call names its field, or its function code, by a value
   * computed at run time — so `fields`/`okCodes` are not all it fills or
   * presses, and an Enter among them proves nothing.
   * Absent when every row was read.
   */
  unreadRows?: true;
}

/** What a field write amounts to once its structure is known to be a database table. */
export interface BatchInputWrite {
  table: string;
  /** Components filled, upper-cased, in first-fill order: `EEIND`. */
  components: string[];
  /** The fields as written, for the anchor sentence: `EKET-EEIND(01)`. */
  raw: string[];
  lines: number[];
  /** The statement that fills the first of them, as a range. */
  firstFill: { lineStart: number; lineEnd: number };
}

const CONTROL_FIELDS = new Set(['BDC_OKCODE', 'BDC_CURSOR', 'BDC_SUBSCR']);

/**
 * Number fields that identify a document or a master record. Filled on the
 * initial screen of VA02 or ME22 they say *which* order is opened; the
 * transaction does not change them. A list of words the source may contain,
 * not a reading of the DDIC (which this reader does not have).
 */
const KEY_COMPONENTS = new Set([
  'VBELN', 'POSNR', 'EBELN', 'EBELP', 'ETENR', 'BELNR', 'BUZEI', 'GJAHR', 'AUFNR', 'QMNUM',
  'BANFN', 'BNFPO', 'MBLNR', 'MJAHR', 'KUNNR', 'LIFNR', 'MATNR', 'BSTNR', 'ANLN1', 'ANLN2',
]);
const LITERAL = /^'((?:[^']|'')*)'$/;
const FIELD_NAME = /^([A-Z0-9_/]+)-([A-Z0-9_/]+)(?:\((\d+)\))?$/i;

/** The arguments of a call, literals kept whole: `'A B' x 'C'` → three. */
function splitArguments(text: string): string[] {
  const out: string[] = [];
  const re = /'(?:[^']|'')*'|`[^`]*`|[^\s]+/g;
  for (const m of text.matchAll(re)) out.push(m[0]);
  return out;
}

function literalValue(operand: string | undefined): string | null {
  if (!operand) return null;
  const m = LITERAL.exec(operand.trim());
  return m ? m[1].replace(/''/g, "'") : null;
}

/** What one carrier — a FORM or a macro — writes into a row, by argument position. */
interface Carrier {
  field?: number;
  value?: number;
  program?: number;
  screen?: number;
}

function carrierOf(parameters: string[], body: AbapStatement[], macro: boolean): Carrier | null {
  const position = (operand: string): number | undefined => {
    const name = operand.trim().toUpperCase();
    if (macro) {
      const m = /^&(\d)$/.exec(name);
      return m ? Number(m[1]) - 1 : undefined;
    }
    const i = parameters.indexOf(name);
    return i >= 0 ? i : undefined;
  };
  const carrier: Carrier = {};
  for (const statement of body) {
    const text = statement.text;
    for (const [component, key] of [['FNAM', 'field'], ['FVAL', 'value'], ['PROGRAM', 'program'], ['DYNPRO', 'screen']] as const) {
      const assigned = new RegExp(`(?:-|\\(\\s*|\\s)${component}\\s*=\\s*([^\\s).]+)`, 'i').exec(text);
      if (!assigned) continue;
      const at = position(assigned[1]);
      if (at !== undefined && carrier[key] === undefined) carrier[key] = at;
    }
  }
  return carrier.field !== undefined || carrier.program !== undefined ? carrier : null;
}

/**
 * The internal table a carrier's body appends its row to: a literal name, or
 * the argument at the call site that names it (`&3` of a macro, a `TABLES`,
 * `USING` or `CHANGING` parameter of a FORM). Absent when the body appends to
 * none, or to more than one.
 */
type CarrierTable =
  | { literal: string }
  | { macroArg: number }
  | { formParam: { clause: string; index: number } };

type Event = (
  | { kind: 'screen'; program: string; screen: string; index: number; line: number }
  | { kind: 'field'; raw: string; value: string; index: number; line: number }
  | { kind: 'unread'; index: number; line: number }
) & {
  /** The internal table the row is appended to, upper-cased; `null` when it is not read. */
  table: string | null;
};

const TABLE_OPERAND = String.raw`([\w/<>&~-]+(?:\[\])?)`;
const normTable = (name: string): string => name.toUpperCase().replace(/\[\]$/, '');

/**
 * The row and the table of an `APPEND`/`INSERT` into an internal table:
 * `APPEND ls TO it_a` → `ls`, `IT_A`; `APPEND bdcdata.` (header line) →
 * `bdcdata`, `BDCDATA`. `lines` for `LINES OF`, whose source is a table.
 */
function appendOf(text: string): { source: string; table: string; lines: boolean } | null {
  const body = text.replace(/\.\s*$/, '').trim();
  if (/^(?:APPEND|INSERT)\s+INITIAL\s+LINE\b/i.test(body)) return null;
  let m = new RegExp(String.raw`^APPEND\s+(LINES\s+OF\s+)?([\s\S]+)\s+TO\s+${TABLE_OPERAND}(?:\s+(?:SORTED\s+BY|ASSIGNING|REFERENCE\s+INTO)\b[\s\S]*)?$`, 'i').exec(body);
  if (m) return { source: m[2].trim(), table: normTable(m[3]), lines: !!m[1] };
  m = new RegExp(String.raw`^INSERT\s+(LINES\s+OF\s+)?([\s\S]+)\s+INTO\s+(?:TABLE\s+)?${TABLE_OPERAND}(?:\s+(?:INDEX|ASSIGNING|REFERENCE\s+INTO)\b[\s\S]*)?$`, 'i').exec(body);
  if (m) return { source: m[2].trim(), table: normTable(m[3]), lines: !!m[1] };
  m = /^APPEND\s+([\w/]+)$/i.exec(body);
  if (m) return { source: m[1], table: normTable(m[1]), lines: false };
  return null;
}

/** `APPEND INITIAL LINE TO it ASSIGNING <fs>` → `<FS>`, `IT`. */
function initialLineOf(text: string): { fieldSymbol: string; table: string } | null {
  const m = new RegExp(String.raw`^(?:APPEND\s+INITIAL\s+LINE\s+TO|INSERT\s+INITIAL\s+LINE\s+INTO\s+(?:TABLE\s+)?)\s*${TABLE_OPERAND}[\s\S]*?\bASSIGNING\s+(?:FIELD-SYMBOL\()?(<[\w/]+>)`, 'i').exec(text.trim());
  return m ? { fieldSymbol: m[2].toUpperCase(), table: normTable(m[1]) } : null;
}

/** Statements a work area's row is not followed across. */
const ROW_BOUNDARY = /^(?:FORM|ENDFORM|METHOD|ENDMETHOD|MODULE|ENDMODULE|FUNCTION|ENDFUNCTION|DEFINE|END-OF-DEFINITION|CALL\s+TRANSACTION)\b/i;
const ROW_WINDOW = 10;

/** Arguments by clause: `PERFORM x TABLES it USING 'A' b` → TABLES [it], USING ['A', b]. */
function clausesOf(tokens: string[], skipTypes: boolean): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let clause = '';
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k].replace(/\.$/, '');
    const upper = token.toUpperCase();
    if (['TABLES', 'USING', 'CHANGING', 'RAISING'].includes(upper)) { clause = upper; continue; }
    if (!clause || !token) continue;
    if (skipTypes && ['TYPE', 'LIKE', 'STRUCTURE'].includes(upper)) {
      k++;
      while (k < tokens.length && ['REF', 'TO', 'STANDARD', 'SORTED', 'HASHED', 'ANY', 'TABLE', 'OF', 'LINE'].includes(tokens[k].toUpperCase())) k++;
      continue;
    }
    const name = skipTypes ? upper.replace(/^VALUE\(|\)$/g, '') : token;
    out.set(clause, [...(out.get(clause) ?? []), name]);
  }
  return out;
}

export function readBatchInput(source: string): BatchInputCall[] {
  return readBatchInputFrom(readStatements(source));
}

export function readBatchInputFrom(statements: AbapStatement[]): BatchInputCall[] {
  const structure = readBlocks(statements);

  // The carriers: FORMs and macros whose body fills a row from a parameter.
  const carriers = new Map<string, { carrier: Carrier; macro: boolean; table?: CarrierTable }>();
  const formParameters = (opener: string): string[] => {
    const m = /\b(?:USING|CHANGING)\b([\s\S]*)$/i.exec(opener);
    if (!m) return [];
    return m[1]
      .replace(/\b(?:USING|CHANGING|RAISING)\b/gi, ' ')
      .replace(/\b(?:TYPE|LIKE)\s+(?:REF\s+TO\s+|STANDARD\s+TABLE\s+OF\s+|TABLE\s+OF\s+|LINE\s+OF\s+)?[\w/~=>-]+/gi, ' ')
      .split(/\s+/)
      .map((p) => p.replace(/^VALUE\(|\)$/gi, '').toUpperCase())
      .filter((p) => /^[A-Z_][\w/]*$/.test(p));
  };
  for (const block of structure.blocks) {
    if (block.kind !== 'form' && block.kind !== 'define') continue;
    const opener = statements[block.openIndex].text;
    const name = (block.kind === 'form' ? /^FORM\s+([\w/]+)/i : /^DEFINE\s+([\w/]+)/i).exec(opener)?.[1]?.toUpperCase();
    if (!name) continue;
    const body = statements.slice(block.openIndex + 1, block.closeIndex);
    const carrier = carrierOf(block.kind === 'form' ? formParameters(opener) : [], body, block.kind === 'define');
    if (!carrier) continue;
    // The table the carrier's row goes to — one, or it is not read.
    const appended = new Set<string>();
    for (const statement of body) {
      const append = appendOf(statement.text);
      if (append) appended.add(append.table);
      const initial = initialLineOf(statement.text);
      if (initial) appended.add(initial.table);
    }
    let table: CarrierTable | undefined;
    if (appended.size === 1) {
      const target = [...appended][0];
      const macroArg = /^&(\d)$/.exec(target);
      if (block.kind === 'define') {
        table = macroArg ? { macroArg: Number(macroArg[1]) - 1 } : { literal: target };
      } else if (!macroArg) {
        const clauses = clausesOf(splitArguments(opener.replace(/^FORM\s+[\w/]+/i, '')), true);
        for (const [clause, names] of clauses) {
          const index = names.indexOf(target);
          if (index >= 0) { table = { formParam: { clause, index } }; break; }
        }
        table ??= { literal: target };
      }
    }
    carriers.set(name, { carrier, macro: block.kind === 'define', ...(table ? { table } : {}) });
  }

  // The table an in-place row (`ls-fnam = …`) goes to: the next APPEND/INSERT
  // of its work area before the next row of it starts, or — for a field
  // symbol — the `APPEND INITIAL LINE … ASSIGNING` nearest before it. One
  // table, or the row's table is not read.
  const rowTableOf = (workArea: string, at: number): string | null => {
    const wa = workArea.toUpperCase();
    const tables = new Set<string>();
    const newRow = new RegExp(`^${wa.replace(/[^\w]/g, (c) => `\\${c}`)}-(?:FNAM|PROGRAM)\\s*=`, 'i');
    // The tables seen are all the row's tables only when the scan reached the
    // row's end — a boundary, the next row, or the end of the source. A window
    // that runs out first may hide a later append of the same row elsewhere,
    // so the destination is then unknown.
    let closed = false;
    for (let j = at + 1; j < at + 1 + ROW_WINDOW; j++) {
      if (j >= statements.length) { closed = true; break; }
      const text = statements[j].text;
      if (ROW_BOUNDARY.test(text) || newRow.test(text)) { closed = true; break; }
      const append = appendOf(text);
      if (append && !append.lines && append.source.toUpperCase() === wa) tables.add(append.table);
    }
    // The window ending exactly at the end of the source reached the row's end too.
    if (at + 1 + ROW_WINDOW >= statements.length) closed = true;
    if (!closed && tables.size) return null;
    if (!tables.size && wa.startsWith('<')) {
      for (let j = at - 1; j >= Math.max(0, at - ROW_WINDOW); j--) {
        const text = statements[j].text;
        if (ROW_BOUNDARY.test(text)) break;
        const initial = initialLineOf(text);
        if (initial && initial.fieldSymbol === wa) { tables.add(initial.table); break; }
      }
    }
    return tables.size === 1 ? [...tables][0] : null;
  };
  // The table a `VALUE #( … )` statement's rows go to.
  const valueTableOf = (text: string, at: number): string | null => {
    const append = appendOf(text);
    if (append && /^VALUE\b/i.test(append.source.replace(/^LINES\s+OF\s+/i, ''))) return append.table;
    const assigned = /^(?:DATA\(([\w/]+)\)|([\w/<>-]+)(?:\[\])?)\s*=\s*VALUE\b/i.exec(text.trim());
    if (!assigned) return null;
    const target = (assigned[1] ?? assigned[2]).toUpperCase();
    // A work area filled whole and appended after: its table.
    return rowTableOf(target, at) ?? target;
  };

  const events: Event[] = [];
  const insideCarrier = (line: number) => {
    const container = containerAt(structure.containers, line);
    return container?.kind === 'form' && carriers.has(container.name);
  };
  const defineAt = new Set<number>();
  for (const block of structure.blocks) {
    if (block.kind !== 'define') continue;
    for (let i = block.openIndex; i <= block.closeIndex; i++) defineAt.add(i);
  }

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (defineAt.has(i)) continue;
    const text = statement.text;

    // 1. A call of a carrier.
    // `TABLES` before `USING` names the table the row goes to, not a field.
    const perform = /^PERFORM\s+([\w/]+)(?:\s+TABLES\s+[\s\S]*?)?(?:\s+USING\s+([\s\S]*?))?\.?$/i.exec(text);
    const callee = perform ? perform[1].toUpperCase() : statement.keyword;
    const entry = carriers.get(callee);
    if (entry && (perform ? !entry.macro : entry.macro)) {
      const args = splitArguments(perform ? (perform[2] ?? '') : text.slice(statement.keyword.length).replace(/\.\s*$/, ''));
      const { carrier } = entry;
      // The table the carrier's row goes to, as this call names it.
      let table: string | null = null;
      if (entry.table && 'literal' in entry.table) table = entry.table.literal;
      else if (entry.table && 'macroArg' in entry.table) {
        const arg = args[entry.table.macroArg];
        table = arg && literalValue(arg) === null ? normTable(arg) : null;
      } else if (entry.table && perform) {
        const { clause, index } = entry.table.formParam;
        const arg = clausesOf(splitArguments(text.replace(/^PERFORM\s+[\w/]+/i, '')), false).get(clause)?.[index];
        table = arg && literalValue(arg) === null ? normTable(arg) : null;
      }
      const program = carrier.program !== undefined ? literalValue(args[carrier.program]) : null;
      const screen = carrier.screen !== undefined ? literalValue(args[carrier.screen]) : null;
      if (program && screen) {
        events.push({ kind: 'screen', program: program.toUpperCase(), screen, index: i, line: statement.lineStart, table });
      }
      const field = carrier.field !== undefined ? literalValue(args[carrier.field]) : null;
      if (carrier.field !== undefined && !field && (args[carrier.field] ?? '').trim()) {
        events.push({ kind: 'unread', index: i, line: statement.lineStart, table });
      }
      if (field) {
        events.push({
          kind: 'field', raw: field, value: carrier.value !== undefined ? args[carrier.value] ?? '' : '',
          index: i, line: statement.lineStart, table,
        });
      }
      continue;
    }
    if (insideCarrier(statement.lineStart)) continue;

    // 2. The row written in place.
    const fnam = /^([\w/<>]+)-FNAM\s*=\s*('(?:[^']|'')*')\s*\.?$/i.exec(text);
    if (fnam) {
      const raw = literalValue(fnam[2]);
      let value = '';
      for (let j = i + 1; j < Math.min(statements.length, i + 4); j++) {
        const fval = /^[\w/<>]+-FVAL\s*=\s*(.+?)\s*\.?$/i.exec(statements[j].text);
        if (fval) { value = fval[1]; break; }
      }
      if (raw) events.push({ kind: 'field', raw, value, index: i, line: statement.lineStart, table: rowTableOf(fnam[1], i) });
      continue;
    }
    // A field name computed at run time: not guessed at, but not nothing either.
    const computed = /^([\w/<>]+)-FNAM\s*=\s*[^'\s]/i.exec(text);
    if (computed) {
      events.push({ kind: 'unread', index: i, line: statement.lineStart, table: rowTableOf(computed[1], i) });
      continue;
    }
    const program = /^([\w/<>]+)-PROGRAM\s*=\s*('(?:[^']|'')*')\s*\.?$/i.exec(text);
    if (program) {
      for (let j = i + 1; j < Math.min(statements.length, i + 4); j++) {
        const dynpro = /^[\w/<>]+-DYNPRO\s*=\s*('(?:[^']|'')*')\s*\.?$/i.exec(statements[j].text);
        if (dynpro) {
          const p = literalValue(program[2]);
          const d = literalValue(dynpro[1]);
          if (p && d) events.push({ kind: 'screen', program: p.toUpperCase(), screen: d, index: i, line: statement.lineStart, table: rowTableOf(program[1], i) });
          break;
        }
      }
      continue;
    }

    // 3. `VALUE #( … )` rows with literals.
    if (/\bVALUE\s+[\w#]*\s*\(/i.test(text)) {
      const rows = /\bPROGRAM\s*=\s*('(?:[^']|'')*')\s+DYNPRO\s*=\s*('(?:[^']|'')*')|\bFNAM\s*=\s*('(?:[^']|'')*')(?:\s+FVAL\s*=\s*('(?:[^']|'')*'|[^\s)]+))?/gi;
      const table = valueTableOf(text, i);
      if (/\bFNAM\s*=\s*[^'\s]/i.test(text)) events.push({ kind: 'unread', index: i, line: statement.lineStart, table });
      for (const m of text.matchAll(rows)) {
        if (m[1]) {
          const p = literalValue(m[1]);
          const d = literalValue(m[2]);
          if (p && d) events.push({ kind: 'screen', program: p.toUpperCase(), screen: d, index: i, line: statement.lineStart, table });
        } else {
          const raw = literalValue(m[3]);
          if (raw) events.push({ kind: 'field', raw, value: m[4] ?? '', index: i, line: statement.lineStart, table });
        }
      }
    }
  }

  // The batch-input calls. A transaction code in a constant is read from its
  // declaration (`CONSTANTS c_tcode_va02 TYPE sytcode VALUE 'VA02'`).
  const constants = new Map<string, string>();
  for (const statement of statements) {
    const m = /^CONSTANTS\s*:?\s*([\w/]+)\b[\s\S]*?\bVALUE\s+'((?:[^']|'')*)'/i.exec(statement.text);
    if (m) constants.set(m[1].toUpperCase(), m[2]);
  }
  const codeOf = (operand: string): string | null => {
    const literal = literalValue(operand);
    if (literal !== null) return literal.toUpperCase() || null;
    return constants.get(operand.toUpperCase())?.toUpperCase() ?? null;
  };
  const calls: Array<Omit<BatchInputCall, 'screens' | 'fields' | 'okCodes'>> = [];
  for (const statement of statements) {
    const text = statement.text;
    const transaction = /^CALL\s+TRANSACTION\s+('[^']*'|[\w/]+)[\s\S]*?\bUSING\s+([\w/<>]+)/i.exec(text);
    if (transaction) {
      calls.push({
        transaction: codeOf(transaction[1]),
        via: 'call-transaction',
        table: transaction[2].toUpperCase().replace(/\[\]$/, ''),
        line: statement.lineStart,
        statementIndex: statement.index,
      });
      continue;
    }
    if (/^CALL\s+FUNCTION\s+'BDC_INSERT'/i.test(text)) {
      const tcode = /\bTCODE\s*=\s*('[^']*'|[\w/-]+)/i.exec(text);
      const table = /\bDYNPROTAB\s*=\s*([\w/<>]+)/i.exec(text);
      calls.push({
        transaction: tcode ? codeOf(tcode[1]) : null,
        via: 'session',
        table: table ? table[1].toUpperCase() : null,
        line: statement.lineStart,
        statementIndex: statement.index,
      });
    }
  }
  if (!calls.length) return [];

  // Which routines each routine performs — the reach of a call.
  const performs = new Map<string, Set<string>>();
  for (const statement of statements) {
    const m = /^PERFORM\s+([\w/]+)/i.exec(statement.text);
    if (!m) continue;
    const from = containerAt(structure.containers, statement.lineStart)?.name ?? '';
    if (!performs.has(from)) performs.set(from, new Set());
    performs.get(from)!.add(m[1].toUpperCase());
  }
  const reach = (start: string): Set<string> => {
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      for (const next of performs.get(queue.shift()!) ?? []) {
        if (seen.has(next) || carriers.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };
  const containerName = (line: number): string => {
    const c: Container | null = containerAt(structure.containers, line);
    return c?.name ?? '';
  };

  // Tables the source may copy into one another (`it_b = it_a`, `MOVE`,
  // `APPEND LINES OF`, a routine or method given both): one table for the
  // question below, since a row in the one can end up in the other.
  const callTables = new Set(calls.map((c) => c.table).filter((t): t is string => t !== null));
  const relevant = new Set([...callTables, ...events.map((e) => e.table).filter((t): t is string => t !== null)]);
  const parent = new Map<string, string>();
  const root = (name: string): string => {
    let at = name;
    while (parent.has(at) && parent.get(at) !== at) at = parent.get(at)!;
    return at;
  };
  const link = (a: string, b: string) => {
    const ra = root(normTable(a));
    const rb = root(normTable(b));
    if (ra !== rb) parent.set(ra, rb);
  };
  const IDENT = String.raw`([\w/<>~-]+)(?:\[\])?`;
  for (const statement of statements) {
    if (statement.nativeSql || defineAt.has(statement.index)) continue;
    const text = statement.text.replace(/\.\s*$/, '').trim();
    const assigned = new RegExp(String.raw`^(?:DATA\(([\w/]+)\)|${IDENT})\s*=\s*([\s\S]+)$`, 'i').exec(text);
    if (assigned) {
      const target = assigned[1] ?? assigned[2];
      const rhs = assigned[3].trim();
      const source =
        new RegExp(String.raw`^${IDENT}$`, 'i').exec(rhs)?.[1] ??
        new RegExp(String.raw`^CORRESPONDING\s+[\w#~/]*\s*\(\s*(?:BASE\s*\(\s*[^)]*\)\s*)?${IDENT}`, 'i').exec(rhs)?.[1] ??
        new RegExp(String.raw`^VALUE\s+[\w#~/]*\s*\(\s*BASE\s+${IDENT}`, 'i').exec(rhs)?.[1];
      if (source) link(target, source);
      continue;
    }
    const move = new RegExp(String.raw`^MOVE(?:-CORRESPONDING)?\s+${IDENT}\s+TO\s+${IDENT}`, 'i').exec(text);
    if (move) { link(move[1], move[2]); continue; }
    const append = appendOf(text);
    if (append?.lines) {
      const source = new RegExp(String.raw`^${IDENT}$`, 'i').exec(append.source)?.[1];
      if (source) link(source, append.table);
      continue;
    }
    // A routine, function or method given two of the tables may copy one into the other.
    const keyword = statement.keyword;
    if ((keyword === 'PERFORM' && !carriers.has(/^PERFORM\s+([\w/]+)/i.exec(text)?.[1]?.toUpperCase() ?? ''))
      || (keyword === 'CALL' && !/^CALL\s+TRANSACTION\b/i.test(text))
      || /->|=>/.test(text)) {
      const named = [...new Set(text.split(/[^\w/<>~-]+/).map((w) => normTable(w)).filter((w) => relevant.has(w)))];
      for (let k = 1; k < named.length; k++) link(named[0], named[k]);
    }
  }

  return calls.map((call) => {
    const scope = reach(containerName(call.line));
    let mine = events.filter((e) => scope.has(containerName(e.line)));
    // Rows filled in a sibling routine (`PERFORM build` then `PERFORM post`)
    // are not in reach; where every batch-input call of the source reads the
    // same table, they are that table's rows all the same.
    if (!mine.length && calls.every((other) => other.table !== null && other.table === call.table)) mine = events;
    // A routine name written twice (two copies of one program pasted together)
    // is reached by name; of its instances, the one nearest the call fills its
    // rows — otherwise the second copy's rows would stand in the first's call.
    const nearest = new Map<string, number>();
    for (const e of mine) {
      const c = containerAt(structure.containers, e.line);
      const key = c?.name ?? '';
      const distance = Math.abs((c?.lineStart ?? e.line) - call.line);
      const best = nearest.get(key);
      if (best === undefined || distance < Math.abs(best - call.line)) nearest.set(key, c?.lineStart ?? e.line);
    }
    mine = mine.filter((e) => {
      const c = containerAt(structure.containers, e.line);
      return (c?.lineStart ?? e.line) === nearest.get(c?.name ?? '') || !c;
    });
    // A row the source appends to another batch-input call's table is that
    // call's, not this one's — unless the one table may be copied into the
    // other. A row whose table is not read stays.
    if (call.table) {
      const own = root(call.table);
      mine = mine.filter((e) => !e.table || e.table === call.table || !callTables.has(e.table) || root(e.table) === own);
    }
    const screens: BatchInputScreen[] = [];
    const fields: BatchInputField[] = [];
    const okCodes: string[] = [];
    let unread = false;
    let current: BatchInputScreen | null = null;
    for (const e of [...mine].sort((a, b) => a.index - b.index)) {
      if (e.kind === 'unread') {
        unread = true;
        continue;
      }
      if (e.kind === 'screen') {
        current = { program: e.program, screen: e.screen, line: e.line };
        screens.push(current);
        continue;
      }
      const upper = e.raw.trim().toUpperCase();
      if (CONTROL_FIELDS.has(upper)) {
        if (upper === 'BDC_OKCODE') {
          const code = literalValue(e.value);
          if (code) okCodes.push(code);
          else if (e.value.trim()) unread = true;
        }
        continue;
      }
      const m = FIELD_NAME.exec(upper);
      if (!m) continue;
      fields.push({
        field: `${m[1]}-${m[2]}`,
        raw: e.raw.trim(),
        structure: m[1],
        component: m[2],
        value: e.value.trim(),
        screen: current,
        line: e.line,
        lineEnd: statements[e.index]?.lineEnd ?? e.line,
        key: KEY_COMPONENTS.has(m[2]),
      });
    }
    return { ...call, screens, fields, okCodes, ...(unread ? { unreadRows: true as const } : {}) };
  });
}

/**
 * The database tables a call changes — the fields whose structure `isTable`
 * accepts, grouped per table in first-fill order; a key field names the
 * object and is no change. A call filling no such field
 * changes nothing this reader can name.
 */
export function writesOf(call: BatchInputCall, isTable: (name: string) => boolean): BatchInputWrite[] {
  const byTable = new Map<string, BatchInputWrite>();
  for (const field of call.fields) {
    if (field.key || !isTable(field.structure)) continue;
    const entry = byTable.get(field.structure) ?? { table: field.structure, components: [], raw: [], lines: [], firstFill: { lineStart: field.line, lineEnd: field.lineEnd } };
    if (!entry.components.includes(field.component)) entry.components.push(field.component);
    if (!entry.raw.includes(field.raw)) entry.raw.push(field.raw);
    if (!entry.lines.includes(field.line)) entry.lines.push(field.line);
    byTable.set(field.structure, entry);
  }
  return [...byTable.values()];
}

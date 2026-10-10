import { readStatements, type AbapStatement } from './statement-reader';
import { readBlocks, containerAt, type Container } from './block-structure';

/**
 * Batch input read field by field — roadmap 3.0.7, from the
 * ZMM_BESTELLUEBERSICHT review.
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

type Event =
  | { kind: 'screen'; program: string; screen: string; index: number; line: number }
  | { kind: 'field'; raw: string; value: string; index: number; line: number };

export function readBatchInput(source: string): BatchInputCall[] {
  return readBatchInputFrom(readStatements(source));
}

export function readBatchInputFrom(statements: AbapStatement[]): BatchInputCall[] {
  const structure = readBlocks(statements);

  // The carriers: FORMs and macros whose body fills a row from a parameter.
  const carriers = new Map<string, { carrier: Carrier; macro: boolean }>();
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
    if (carrier) carriers.set(name, { carrier, macro: block.kind === 'define' });
  }

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
    const perform = /^PERFORM\s+([\w/]+)(?:\s+USING\s+([\s\S]*?))?\.?$/i.exec(text);
    const callee = perform ? perform[1].toUpperCase() : statement.keyword;
    const entry = carriers.get(callee);
    if (entry && (perform ? !entry.macro : entry.macro)) {
      const args = splitArguments(perform ? (perform[2] ?? '') : text.slice(statement.keyword.length).replace(/\.\s*$/, ''));
      const { carrier } = entry;
      const program = carrier.program !== undefined ? literalValue(args[carrier.program]) : null;
      const screen = carrier.screen !== undefined ? literalValue(args[carrier.screen]) : null;
      if (program && screen) {
        events.push({ kind: 'screen', program: program.toUpperCase(), screen, index: i, line: statement.lineStart });
      }
      const field = carrier.field !== undefined ? literalValue(args[carrier.field]) : null;
      if (field) {
        events.push({
          kind: 'field', raw: field, value: carrier.value !== undefined ? args[carrier.value] ?? '' : '',
          index: i, line: statement.lineStart,
        });
      }
      continue;
    }
    if (insideCarrier(statement.lineStart)) continue;

    // 2. The row written in place.
    const fnam = /^[\w/<>]+-FNAM\s*=\s*('(?:[^']|'')*')\s*\.?$/i.exec(text);
    if (fnam) {
      const raw = literalValue(fnam[1]);
      let value = '';
      for (let j = i + 1; j < Math.min(statements.length, i + 4); j++) {
        const fval = /^[\w/<>]+-FVAL\s*=\s*(.+?)\s*\.?$/i.exec(statements[j].text);
        if (fval) { value = fval[1]; break; }
      }
      if (raw) events.push({ kind: 'field', raw, value, index: i, line: statement.lineStart });
      continue;
    }
    const program = /^[\w/<>]+-PROGRAM\s*=\s*('(?:[^']|'')*')\s*\.?$/i.exec(text);
    if (program) {
      for (let j = i + 1; j < Math.min(statements.length, i + 4); j++) {
        const dynpro = /^[\w/<>]+-DYNPRO\s*=\s*('(?:[^']|'')*')\s*\.?$/i.exec(statements[j].text);
        if (dynpro) {
          const p = literalValue(program[1]);
          const d = literalValue(dynpro[1]);
          if (p && d) events.push({ kind: 'screen', program: p.toUpperCase(), screen: d, index: i, line: statement.lineStart });
          break;
        }
      }
      continue;
    }

    // 3. `VALUE #( … )` rows with literals.
    if (/\bVALUE\s+[\w#]*\s*\(/i.test(text)) {
      const rows = /\bPROGRAM\s*=\s*('(?:[^']|'')*')\s+DYNPRO\s*=\s*('(?:[^']|'')*')|\bFNAM\s*=\s*('(?:[^']|'')*')(?:\s+FVAL\s*=\s*('(?:[^']|'')*'|[^\s)]+))?/gi;
      for (const m of text.matchAll(rows)) {
        if (m[1]) {
          const p = literalValue(m[1]);
          const d = literalValue(m[2]);
          if (p && d) events.push({ kind: 'screen', program: p.toUpperCase(), screen: d, index: i, line: statement.lineStart });
        } else {
          const raw = literalValue(m[3]);
          if (raw) events.push({ kind: 'field', raw, value: m[4] ?? '', index: i, line: statement.lineStart });
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
    const screens: BatchInputScreen[] = [];
    const fields: BatchInputField[] = [];
    const okCodes: string[] = [];
    let current: BatchInputScreen | null = null;
    for (const e of [...mine].sort((a, b) => a.index - b.index)) {
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
    return { ...call, screens, fields, okCodes };
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

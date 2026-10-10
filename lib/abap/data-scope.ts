import { maskLiterals, readStatements, type AbapStatement } from './statement-reader';
import { readBlocks, containerAt } from './block-structure';

/**
 * Data scope, derived values and selection defaults — roadmap 3.0.7, from the
 * ZMM_BESTELLUEBERSICHT review.
 *
 * The review asked three questions the map does not answer and a business
 * reader does: *which* purchase orders does the list show (the `WHERE` of each
 * read — `loekz = space`, `elikz = space`, `bukrs IN s_bukrs`), which of its
 * figures the program computes rather than reads (`offen = menge - wemng`), and
 * what the selection screen fills in before anybody types (`s_bukrs DEFAULT
 * '1000'`, `s_bedat-low = sy-datum - 365` in `INITIALIZATION`). All three are
 * written in the source; this module lists them with their lines and says
 * where each operand comes from — the selection screen, a fixed value, another
 * table — and nothing about what they mean.
 *
 * Pure: statements in, three lists out; no catalogue, no model.
 */

export type OperandOrigin =
  /** A `PARAMETERS` or `SELECT-OPTIONS` of this program: the user decides. */
  | 'selection'
  /** A literal, `space`, a constant or `sy-datum`: the program decides. */
  | 'fixed'
  /** A field of a table read before — `FOR ALL ENTRIES IN it_ekko`, `it_ekpo-ebeln`. */
  | 'previous-read'
  /** Any other data object. */
  | 'variable';

export interface ScopeFilter {
  /** The condition as written: `loekz = space`. */
  condition: string;
  field: string;
  operator: string;
  operand: string;
  origin: OperandOrigin;
}

export interface DataScope {
  line: number;
  /** The tables read, upper-cased, as `FROM`/`JOIN` name them. */
  tables: string[];
  single: boolean;
  /** `FOR ALL ENTRIES IN <itab>`, when the read is driven by an earlier one. */
  forAllEntries?: string;
  /** The top-level `AND` terms of the `WHERE`. A term with an `OR` stays whole. */
  filters: ScopeFilter[];
  /** One sentence: which rows are read, the fixed filters first. */
  sentence: string;
}

export interface DerivedValue {
  line: number;
  /** The field computed: `it_ausgabe-offen`. */
  target: string;
  expression: string;
  /** The data objects the expression reads, as written. */
  inputs: string[];
  /** `x = x + y` — a running total rather than a value of its own. */
  accumulates: boolean;
  container: string | null;
}

export interface SelectionDefault {
  /** `s_bukrs`, `p_offen`. */
  name: string;
  line: number;
  /** What it is preset to, as written: `'1000'`, `sy-datum - 365`. */
  value: string;
  /** Which part is preset: the whole parameter, or `LOW`/`HIGH`/`OPTION`/`SIGN` of a range. */
  part: 'value' | 'LOW' | 'HIGH' | 'OPTION' | 'SIGN';
  from: 'declaration' | 'initialization';
  /** The input must be filled (`OBLIGATORY`). */
  obligatory: boolean;
}

export interface DataScopeReport {
  reads: DataScope[];
  derived: DerivedValue[];
  defaults: SelectionDefault[];
}

const FIXED = /^(?:'(?:[^']|'')*'|`[^`]*`|-?\d+(?:\.\d+)?|SPACE|ABAP_TRUE|ABAP_FALSE|SY-DATUM|SY-UZEIT|SY-LANGU|SY-MANDT|SY-UNAME)$/i;

/** Split on a word at parenthesis depth 0, keeping literals whole. */
function splitTop(text: string, word: string): string[] {
  const masked = maskLiterals(text);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const re = new RegExp(`\\s${word}\\s`, 'iy');
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0) {
      re.lastIndex = i;
      if (re.test(masked)) {
        parts.push(text.slice(start, i).trim());
        start = i + word.length + 2;
        i = start - 1;
      }
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

export function readDataScope(source: string): DataScopeReport {
  return readDataScopeFrom(readStatements(source));
}

export function readDataScopeFrom(statements: AbapStatement[]): DataScopeReport {
  const structure = readBlocks(statements);
  const selection = new Set<string>();
  const constants = new Set<string>();
  const defaults: SelectionDefault[] = [];

  for (const statement of statements) {
    const text = statement.text;
    const input = /^(PARAMETERS|SELECT-OPTIONS)\s*:?\s*([\w/]+)/i.exec(text);
    if (input) {
      selection.add(input[2].toUpperCase());
      const obligatory = /\bOBLIGATORY\b/i.test(maskLiterals(text));
      const value = /\bDEFAULT\s+('(?:[^']|'')*'|[\w/-]+)(?:\s+TO\s+('(?:[^']|'')*'|[\w/-]+))?/i.exec(text);
      if (value) {
        const range = input[1].toUpperCase() === 'SELECT-OPTIONS';
        defaults.push({ name: input[2], line: statement.lineStart, value: value[1], part: range ? 'LOW' : 'value', from: 'declaration', obligatory });
        if (range && value[2]) defaults.push({ name: input[2], line: statement.lineStart, value: value[2], part: 'HIGH', from: 'declaration', obligatory });
      } else if (/\bAS\s+CHECKBOX\b/i.test(text) || obligatory) {
        // A checkbox without DEFAULT starts empty, and an obligatory input
        // without one starts empty and must be filled: both say what the
        // screen shows before anybody types, so both are listed.
        if (obligatory) defaults.push({ name: input[2], line: statement.lineStart, value: '', part: 'value', from: 'declaration', obligatory });
      }
    }
    const constant = /^CONSTANTS\s*:?\s*([\w/]+)/i.exec(text);
    if (constant) constants.add(constant[1].toUpperCase());
  }

  // Presets written in INITIALIZATION (or LOAD-OF-PROGRAM).
  for (const statement of statements) {
    const container = containerAt(structure.containers, statement.lineStart);
    if (container?.kind !== 'event' || !/^(?:INITIALIZATION|LOAD-OF-PROGRAM)$/i.test(container.name)) continue;
    const assign = /^([\w/]+)(?:-(LOW|HIGH|OPTION|SIGN))?\s*=\s*(.+?)\s*\.?$/i.exec(statement.text);
    if (!assign || !selection.has(assign[1].toUpperCase())) continue;
    const declared = defaults.find((d) => d.name.toUpperCase() === assign[1].toUpperCase());
    defaults.push({
      name: assign[1],
      line: statement.lineStart,
      value: assign[3],
      part: (assign[2]?.toUpperCase() as SelectionDefault['part'] | undefined) ?? 'value',
      from: 'initialization',
      obligatory: declared?.obligatory ?? false,
    });
  }

  const originOf = (operand: string, drivers: Set<string>): OperandOrigin => {
    const bare = operand.trim().replace(/^@/, '').replace(/^\(|\)$/g, '');
    const head = bare.split('-')[0].toUpperCase();
    if (selection.has(head)) return 'selection';
    if (FIXED.test(bare) || constants.has(bare.toUpperCase())) return 'fixed';
    if (drivers.has(head)) return 'previous-read';
    return 'variable';
  };

  const reads: DataScope[] = [];
  for (const statement of statements) {
    if (statement.keyword !== 'SELECT') continue;
    const text = statement.text.replace(/\.\s*$/, '');
    const tables = [...text.matchAll(/\b(?:FROM|JOIN)\s+([\w/]+)/gi)]
      .map((m) => m[1].toUpperCase())
      .filter((name, i, all) => all.indexOf(name) === i && !/^(?:TABLE|@)/.test(name));
    if (!tables.length) continue;
    const fae = /\bFOR\s+ALL\s+ENTRIES\s+IN\s+@?([\w/]+)/i.exec(text);
    const drivers = new Set<string>(fae ? [fae[1].toUpperCase()] : []);
    const where = /\bWHERE\b([\s\S]*?)(?=\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|UP\s+TO|INTO|APPENDING|%_HINTS|BYPASSING)\b|$)/i.exec(text);
    const filters: ScopeFilter[] = [];
    for (const term of where ? splitTop(where[1].trim(), 'AND') : []) {
      const m = /^(?:NOT\s+)?([\w/~-]+)\s+(=|<>|<=|>=|<|>|EQ|NE|LT|LE|GT|GE|IN|NOT\s+IN|LIKE|BETWEEN|IS)\s+([\s\S]+)$/i.exec(term);
      if (!m || /\sOR\s/i.test(maskLiterals(term))) {
        filters.push({ condition: term, field: '', operator: '', operand: term, origin: 'variable' });
        continue;
      }
      filters.push({ condition: term, field: m[1], operator: m[2].toUpperCase(), operand: m[3].trim(), origin: originOf(m[3], drivers) });
    }
    const fixed = filters.filter((f) => f.origin === 'fixed').map((f) => f.condition);
    const chosen = filters.filter((f) => f.origin === 'selection').map((f) => f.condition);
    const keyed = filters.filter((f) => f.origin === 'variable' || (f.origin === 'previous-read' && !fae)).map((f) => f.condition);
    const parts = [
      fixed.length ? `only where ${fixed.join(' and ')} (fixed in the code)` : '',
      chosen.length ? `restricted by the selection screen: ${chosen.join(', ')}` : '',
      fae ? `for the entries of ${fae[1]}` : '',
      keyed.length ? `by ${keyed.join(' and ')}` : '',
    ].filter(Boolean);
    reads.push({
      line: statement.lineStart,
      tables,
      single: /^SELECT\s+SINGLE\b/i.test(text),
      ...(fae ? { forAllEntries: fae[1] } : {}),
      filters,
      sentence: `${tables.join(', ')} ${parts.length ? `is read ${parts.join('; ')}` : 'is read without a WHERE condition'}.`,
    });
  }

  // Derived values: an assignment whose right-hand side computes.
  const derived: DerivedValue[] = [];
  for (const statement of statements) {
    if (/^(?:DATA|CONSTANTS|PARAMETERS|SELECT-OPTIONS|TYPES|STATICS|CLASS-DATA|FIELD-SYMBOLS)\b/i.test(statement.text)) continue;
    const assign = /^([\w/<>]+(?:-[\w/]+)*)\s*=\s*(.+?)\s*\.?$/.exec(statement.text);
    if (!assign) continue;
    const expression = assign[2];
    const masked = maskLiterals(expression);
    if (!/\s[-+*/]\s|\b(?:DIV|MOD)\b|\*\*/.test(masked)) continue;
    if (/^(?:VALUE|NEW|COND|SWITCH|CONV|REDUCE|FILTER|CORRESPONDING)\b/i.test(masked.trim())) continue;
    const inputs = [...new Set([...masked.matchAll(/(?<![\w'])([A-Za-z_][\w/]*(?:-[\w/]+)*)/g)]
      .map((m) => m[1])
      .filter((name) => !/^(?:DIV|MOD|ABS|ROUND|CEIL|FLOOR|TRUNC|FRAC|SIGN|LINES|STRLEN)$/i.test(name)))];
    const target = assign[1];
    derived.push({
      line: statement.lineStart,
      target,
      expression,
      inputs,
      accumulates: inputs.some((name) => name.toUpperCase() === target.toUpperCase()),
      container: containerAt(structure.containers, statement.lineStart)?.name ?? null,
    });
  }

  return { reads, derived, defaults };
}

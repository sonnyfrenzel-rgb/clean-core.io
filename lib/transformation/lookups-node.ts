/**
 * The original's reads inside its steps on the Node route (roadmap 3.0.17 criterion 3, scaffold version 15).
 *
 * The defect it closes: the package took as input only the main read of the original (`SELECT … FROM likp INTO
 * TABLE gt_deliveries`, one input list per source structure, `input-lists.ts`). A step that reads more on its own
 * — `SELECT SINGLE land1 FROM kna1 INTO lv_land1 WHERE kunnr = is_delivery-kunnr`, `SELECT matnr FROM lips INTO
 * TABLE lt_matnr WHERE …`, `SELECT SINGLE * FROM zsd_freight_rate … WHERE valid_from <= sy-datum …` — had neither
 * an input nor a lookup, so the model searched lists that do not exist (`st.records` for a `land1`, `(st.local as
 * any).rates`) or declined the unit (the side-by-side starter example, three real runs, 17.10.2026).
 *
 * What the engine writes instead, for every such read inside a unit (a `SELECT SINGLE`, or a `SELECT … INTO|
 * APPENDING TABLE` into a table that is not one of the input lists — those are the main read), one FROM table, no
 * JOIN, no FOR ALL ENTRIES, no aggregate:
 *   - one lookup list per source table in the request and in the action (`kna1: many db.Kna1`), typed by the
 *     columns the original reads: the fields it selects, the columns its WHERE names, and — for `SELECT *` or a
 *     work area — the components the unit reads from the target (`ls_rate-rate_per_kg`). The columns' types are in
 *     the dictionary, not in the source: they are text as the request sends it. A run starts with the rows in
 *     `st.local.db<Table>`, the same way an input list starts in the original's global table (`seedOf`).
 *   - `srv/lib/lookups.ts`, engine-written: one function per read, `select_kna1_L156(st, where)`, mirroring the
 *     ABAP semantics — `SELECT SINGLE` answers the first matching row or null with sy-subrc 0/4, `SELECT … INTO
 *     TABLE` the matching rows with sy-subrc 0/4 and sy-dbcnt. A WHERE of `col op value` joined by AND (= <> < <=
 *     > >= and their EQ … GE forms) is written by the engine and takes the values by column; any other WHERE (OR,
 *     IN, LIKE, BETWEEN, parentheses) takes a predicate, and the frame names exactly which condition is open.
 *   - in the frame of the unit whose lines hold the read: `const lookup_L156 = () => select_kna1_L156(st, { kunnr:
 *     args.isDelivery.kunnr });` where the engine can read every value outside the routine (a literal, a constant,
 *     a selection field, a parameter of the routine, a global, sy-datum); the body calls it where the original
 *     reads. Otherwise (a local the routine computes first, `WHERE matnr = lv_matnr`) the fill request names the
 *     exact call with the open value (`select_mara_L197(st, { matnr: <lv_matnr> })`).
 * Remote access (`srv/access.ts`) is unchanged: wiring a lookup list to a remote read is a developer step, and
 * TRACE.md names which list comes from which SAP table.
 *
 * Pure and deterministic. No network, no model.
 */

import type { AbapStatement } from '../abap/statement-reader';
import type { AbapShapes } from './abap-shapes';
import type { InputColumn, InputList } from './input-lists';
import { camelName, pascalName } from './naming';
import type { LookupEntry, Unit, UnitPlan } from './types';

/** The package file of the lookups. */
export const LOOKUPS_FILE = 'srv/lib/lookups.ts';
/** The comment that names one lookup list in `srv/lib/lookups.ts`; `lookupListsIn` and TRACE.md read it. */
export const LOOKUP_TAG = '@cc-lookup';

export type LookupOp = '=' | '<>' | '<' | '<=' | '>' | '>=';

export interface LookupCondition {
  /** The column the original compares, lower case. */
  column: string;
  op: LookupOp;
  /** The operand as the original writes it (`is_delivery-kunnr`, `'X'`, `sy-datum`). */
  operand: string;
  /** The key of the `where` values the function takes. */
  key: string;
  /**
   * How the comparison orders: by value only where the operand's declared type says so —
   * `number` for a numeric type or an unquoted number, `date` for a date (`sy-datum`, `TYPE d`) — and otherwise as
   * text, the way ABAP compares two character fields (`'10' < '2'`; a key with leading zeros stays text).
   */
  compare: 'text' | 'number' | 'date';
}

/** One read of the original inside a unit. */
export interface LookupRead {
  line: number;
  unitId: string;
  /** The SAP table, upper case. */
  table: string;
  single: boolean;
  /** The statement on one line. */
  text: string;
  /** The columns the read names, lower case: selected, compared, read from the target. */
  columns: string[];
  /** The WHERE as conditions the engine writes, or null when it takes a predicate. */
  conditions: LookupCondition[] | null;
  /** The WHERE as the original writes it (empty when it has none). */
  where: string;
  /** `select_kna1_L156`. */
  helper: string;
}

const comment = (s: string) => s.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const sq = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const CLIENT = /^(?:mandt|client)$/i;

const OPS: Record<string, LookupOp> = { '=': '=', EQ: '=', '<>': '<>', NE: '<>', '<': '<', LT: '<', '<=': '<=', LE: '<=', '>': '>', GT: '>', '>=': '>=', GE: '>=' };

/** Is a line inside one of the unit's own ranges? */
const inUnit = (u: Unit, line: number) => u.abap.some((r) => line >= r.lineStart && line <= r.lineEnd);
const span = (u: Unit) => u.abap.reduce((n, r) => n + (r.lineEnd - r.lineStart + 1), 0);

/** The unit that carries a line: the smallest one holding it, never a split routine's parent (its parts carry it). */
function unitOfLine(plan: Pick<UnitPlan, 'units'>, line: number): Unit | null {
  const parents = new Set(plan.units.flatMap((u) => (u.part ? [u.part.parent] : [])));
  const holding = plan.units.filter((u) => !parents.has(u.id) && inUnit(u, line));
  holding.sort((a, b) => Number(a.kind === 'orchestrator') - Number(b.kind === 'orchestrator') || span(a) - span(b));
  return holding[0] ?? null;
}

/** Does the unit declare this data object itself (`DATA ls_x …`, `DATA: ls_x …`, `DATA(ls_x)`, a FORM parameter)? */
function declaredIn(u: Unit, statements: readonly AbapStatement[], name: string): boolean {
  const n = escapeRe(name);
  const decl = new RegExp(`^(?:DATA|STATICS|FIELD-SYMBOLS)\\b[\\s:]*(?:[\\s\\S]*?,\\s*)?${n}(?![\\w-])`, 'i');
  const inline = new RegExp(`\\b(?:DATA|FINAL)\\(\\s*${n}\\s*\\)`, 'i');
  const param = new RegExp(`^(?:FORM|METHOD)\\b[\\s\\S]*\\b(?:USING|CHANGING|TABLES|IMPORTING|EXPORTING|RETURNING)\\b[\\s\\S]*(?<![\\w-])(?:VALUE\\(\\s*)?${n}(?![\\w-])`, 'i');
  return statements.some((st) => inUnit(u, st.lineStart) && (decl.test(st.text) || inline.test(st.text) || param.test(st.text)));
}

/** The clauses of one SELECT, or null when it is not a lookup the engine carries. */
function parseSelect(text: string): { table: string; single: boolean; fields: string[] | null; target: string; intoTable: boolean; where: string } | null {
  const t = text.replace(/\.\s*$/, '').trim();
  if (!/^SELECT\b/i.test(t)) return null;
  if (/\bJOIN\b|\bFOR\s+ALL\s+ENTRIES\b|\bUNION\b|\(\s*SELECT\b/i.test(t)) return null;
  const single = /^SELECT\s+SINGLE\b/i.test(t);
  const from = /\bFROM\s+(\/?[A-Za-z][\w/]*)/i.exec(t);
  if (!from) return null;
  const into = /\b(INTO|APPENDING)\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?(TABLE\s+)?@?(?:DATA\(\s*)?(\(?[\w/<>-]+)/i.exec(t);
  if (!into) return null;
  const intoTable = Boolean(into[2]);
  // A SELECT … ENDSELECT loop and an APPENDING into a work area are not one read with one answer.
  if (!single && !intoTable) return null;
  const target = into[3].replace(/^\(/, '');
  const head = t.slice(0, from.index).replace(/^SELECT\s+(?:SINGLE\s+)?(?:DISTINCT\s+)?/i, '').trim();
  const fieldsClause = /\bFIELDS\s+([\s\S]*?)(?=\bWHERE\b|\bINTO\b|\bAPPENDING\b|\bORDER\s+BY\b|\bGROUP\s+BY\b|\bUP\s+TO\b|$)/i.exec(t)?.[1]?.trim();
  const list = (head || fieldsClause || '').replace(/,/g, ' ').trim();
  if (/\(/.test(list)) return null;
  const fields = list === '*' || list === '' ? null : list.split(/\s+/).map((f) => f.replace(/^\w+~/, '').toLowerCase()).filter((f) => /^\w+$/.test(f));
  const where = /\bWHERE\s+([\s\S]*?)(?=\s+(?:INTO|APPENDING|ORDER\s+BY|GROUP\s+BY|HAVING|UP\s+TO|%_HINTS|FIELDS)\b|$)/i.exec(t)?.[1]?.trim() ?? '';
  return { table: from[1].toUpperCase(), single, fields, target, intoTable, where };
}

const NUMERIC_SCALARS = new Set(['i', 'int1', 'int2', 'int4', 'int8', 'b', 's', 'p', 'f', 'decfloat16', 'decfloat34']);

/** How a comparison with this operand orders, from what the source declares of it (see `LookupCondition.compare`). */
function compareOf(operand: string, line: number, shapes: AbapShapes | null): LookupCondition['compare'] {
  if (/^-?\d+$/.test(operand)) return 'number';
  if (/^['`]/.test(operand)) return 'text';
  if (/^sy-(?:datum|datlo)$/i.test(operand)) return 'date';
  if (!shapes) return 'text';
  if (shapes.typeOf(operand, line) === 'number') return 'number';
  const scalar = shapes.scalarOf(operand, line);
  if (!scalar || scalar.dictionary) return 'text';
  if (scalar.type === 'd') return 'date';
  return NUMERIC_SCALARS.has(scalar.type) ? 'number' : 'text';
}

/** Words of a WHERE that are no column (`status IS NOT INITIAL`, `f NOT IN …`). */
const WHERE_WORDS = new Set(['and', 'or', 'not', 'is', 'null', 'initial', 'in', 'like', 'between', 'escape']);

/**
 * Every column a WHERE the engine does not write names: the left side of a comparison,
 * of IN/LIKE/BETWEEN and of `IS [NOT] INITIAL`/`IS [NOT] NULL`, each with or without NOT — so the row type holds it
 * and the body's predicate on the row type-checks.
 */
function whereColumns(where: string): string[] {
  const text = where.replace(/'(?:[^']|'')*'|`[^`]*`/g, "''");
  const out = new Set<string>();
  const re = /(?:^|[\s(])(?:\w+~)?([a-z]\w*)\s*(?:=|<>|<=|>=|<|>|\b(?:EQ|NE|LT|LE|GT|GE|IN|LIKE|BETWEEN|IS|NOT)\b)/gi;
  for (const m of text.matchAll(re)) {
    const name = m[1].toLowerCase();
    if (!WHERE_WORDS.has(name)) out.add(name);
  }
  return [...out];
}

/** A WHERE of `col op operand` joined by AND, or null when it holds anything else. */
function conditionsOf(where: string): Array<Omit<LookupCondition, 'key' | 'compare'>> | null {
  if (where === '') return [];
  if (/[()]|\bOR\b|\bNOT\b|\bIN\b|\bLIKE\b|\bBETWEEN\b|\bIS\b/i.test(where.replace(/'(?:[^']|'')*'/g, "''"))) return null;
  const out: Array<Omit<LookupCondition, 'key' | 'compare'>> = [];
  for (const part of where.split(/\s+AND\s+/i)) {
    const m = /^(?:\w+~)?(\w+)\s*(<>|<=|>=|=|<|>|\b(?:EQ|NE|LT|LE|GT|GE)\b)\s*(@?(?:'(?:[^']|'')*'|`[^`]*`|-?\d+|[\w/<>-]+))$/i.exec(part.trim());
    if (!m) return null;
    out.push({ column: m[1].toLowerCase(), op: OPS[m[2].toUpperCase()], operand: m[3].replace(/^@/, '') });
  }
  return out;
}

/**
 * The reads inside the units the package carries — see the file comment. `mainTables`: the input lists' global
 * tables (a read into one of them is the main read, already an input list).
 */
export function lookupReadsOf(plan: Pick<UnitPlan, 'units'>, statements: readonly AbapStatement[], mainTables: ReadonlySet<string>, shapes: AbapShapes | null = null): LookupRead[] {
  const out: LookupRead[] = [];
  const seen = new Map<string, number>();
  for (const s of statements) {
    if (s.nativeSql || s.keyword !== 'SELECT') continue;
    const p = parseSelect(s.text);
    if (!p) continue;
    if (p.intoTable && mainTables.has(p.target.toUpperCase())) continue;
    const u = unitOfLine(plan, s.lineStart);
    if (!u) continue;
    const conds = conditionsOf(p.where);
    const columns = new Set<string>(p.fields ?? []);
    for (const c of conds ?? []) columns.add(c.column);
    if (conds === null) for (const c of whereColumns(p.where)) columns.add(c);
    // SELECT * or a work area: the components the unit reads from the target. A work area the unit does not declare
    // is the program's own (scaffold version 17, starter examples check 18.10.2026, E5): `SELECT SINGLE * FROM eban
    // INTO gs_eban` in READ_REQUISITION, and CHECK_REQUISITION reads gs_eban-matnr, -werks, -frgkz — the row type
    // held only the ten components READ_REQUISITION names, and a request that sent MATNR was refused as "not a
    // component of EBAN". Every component the program reads from a global work area is a column.
    if (p.fields === null) {
      const re = new RegExp(`(?<![\\w-])${escapeRe(p.target)}-(\\w+)`, 'gi');
      const local = declaredIn(u, statements, p.target);
      for (const st of statements) if (!local || inUnit(u, st.lineStart)) for (const m of st.text.matchAll(re)) columns.add(m[1].toLowerCase());
    }
    const keys = new Map<string, number>();
    const conditions =
      conds?.map((c) => {
        const n = (keys.get(c.column) ?? 0) + 1;
        keys.set(c.column, n);
        return { ...c, key: n === 1 ? camelName(c.column) : `${camelName(c.column)}${n}`, compare: compareOf(c.operand, s.lineStart, shapes) };
      }) ?? null;
    const base = `select_${p.table.toLowerCase().replace(/^\/([^/]+)\//, '$1_').replace(/[^a-z0-9_]/g, '_')}_L${s.lineStart}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({
      line: s.lineStart,
      unitId: u.id,
      table: p.table,
      single: p.single,
      text: comment(s.text).slice(0, 240),
      columns: [...columns].filter((c) => !CLIENT.test(c)),
      conditions,
      where: comment(p.where),
      helper: n === 1 ? base : `${base}_${n}`,
    });
  }
  return out;
}

/**
 * One lookup list per SAP table the reads name, after the input lists: the request key (`kna1`), the run's
 * table (`st.local.dbKna1`), the row type (`Kna1Row`), the CDS row type and entity. `taken`: request keys,
 * TypeScript type names, Locals keys and CDS names already used.
 */
export function lookupListsOf(
  reads: readonly LookupRead[],
  taken: { keys: ReadonlySet<string>; types: ReadonlySet<string>; locals: ReadonlySet<string>; cds: ReadonlySet<string> },
): InputList[] {
  const keys = new Set(taken.keys);
  const types = new Set(taken.types);
  const locals = new Set(taken.locals);
  const cds = new Set(taken.cds);
  const unique = (base: string, used: Set<string>) => {
    let out = base;
    for (let i = 2; used.has(out); i++) out = `${base}${i}`;
    used.add(out);
    return out;
  };
  const tables = [...new Set(reads.map((r) => r.table))];
  return tables.map((table) => {
    const of = reads.filter((r) => r.table === table);
    const names = [...new Set(of.flatMap((r) => r.columns))];
    const pascal = pascalName(table);
    const cdsType = unique(pascal, cds);
    const entity = unique(/(?:s|x|z|ch|sh)$/i.test(cdsType) ? `${cdsType}es` : `${cdsType}s`, cds);
    const columns: InputColumn[] = names.map((name) => ({
      name,
      key: camelName(name),
      line: of.find((r) => r.columns.includes(name))!.line,
      abap: `TYPE ${table.toLowerCase()}-${name}`,
      kind: 'text',
      digits: null,
      places: 0,
      max: null,
      length: null,
      obligatory: false,
      values: null,
      init: 'null',
      scalar: null,
      declaration: `${table}-${name.toUpperCase()} (dictionary type)`,
    }));
    const key = unique(keys.has(camelName(table)) ? `${camelName(table)}Rows` : camelName(table), keys);
    return {
      key,
      global: { name: table, key: unique(`db${pascal}`, locals), line: of[0].line },
      structure: { name: table, tsName: unique(`${pascal}Row`, types), line: 0, lineEnd: 0 },
      cds: { type: cdsType, entity },
      columns,
      filledBy: ['lookup'],
      lookup: { table, lines: of.map((r) => r.line) },
    };
  });
}

interface Resolved {
  expr: string | null;
  name: string;
}

/** The TypeScript expression of an operand at the unit's entry, or null when only the routine knows it. */
function resolveOperand(
  token: string,
  u: Unit,
  line: number,
  plan: Pick<UnitPlan, 'fields'>,
  shapes: AbapShapes,
  constants: ReadonlyMap<string, string>,
): Resolved {
  if (/^'/.test(token)) return { expr: sq(token.slice(1, -1).replace(/''/g, "'")), name: token };
  if (/^`/.test(token)) return { expr: sq(token.slice(1, -1)), name: token };
  if (/^-?\d+$/.test(token)) return { expr: sq(token), name: token };
  const upper = token.toUpperCase();
  if (upper === 'SY-DATUM') return { expr: 'syDatum()', name: token };
  const constant = constants.get(upper);
  if (constant !== undefined) return { expr: sq(constant), name: token };
  const selection = plan.fields.find((f) => f.where === 'selection' && f.kind !== 'range' && f.original === upper);
  if (selection) return { expr: `sel.${selection.key}`, name: token };
  const [base, ...components] = token.toLowerCase().split('-');
  const global = shapes.globals.find((g) => g.name.toLowerCase() === base);
  const param = !u.part ? u.parameters.find((p) => p.name.toLowerCase() === base && p.direction !== 'tables') : undefined;
  if (param) {
    if (components.length > 1) return { expr: null, name: token };
    if (components.length === 1 && shapes.typeOf(token, line) === null) return { expr: null, name: token };
    const at = `args.${camelName(base)}${param.direction === 'changing' ? '.value' : ''}`;
    return { expr: components.length === 1 ? `${at}.${camelName(components[0])}` : at, name: token };
  }
  if (global && components.length === 0 && u.kind !== 'orchestrator') return { expr: `st.local.${global.key}`, name: token };
  return { expr: null, name: token };
}

/** The CONSTANTS with one literal VALUE (the reading `authority-node.ts` makes). */
function constantsOf(statements: readonly AbapStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const s of statements) {
    if (s.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s+([\w/]+)\b[\s\S]*?\bVALUE\s+'((?:[^']|'')*)'/i.exec(s.text);
    if (!m) continue;
    const name = m[1].toUpperCase();
    const value = m[2].replace(/''/g, "'");
    if (out.has(name) && out.get(name) !== value) ambiguous.add(name);
    out.set(name, value);
  }
  for (const n of ambiguous) out.delete(n);
  return out;
}

/** The answer type of a read's function. */
const answerOf = (r: LookupRead, row: string) => (r.single ? `SelectSingle<${row}>` : `SelectTable<${row}>`);

/** The reads of one unit, with the function its frame holds or the exact call its body writes. */
export function lookupEntriesOf(
  u: Unit,
  reads: readonly LookupRead[],
  lists: readonly InputList[],
  plan: Pick<UnitPlan, 'fields'>,
  shapes: AbapShapes,
  statements: readonly AbapStatement[],
): LookupEntry[] {
  const constants = constantsOf(statements);
  // Two reads on one line get two frame names: `lookup_L156`, then `lookup_L156_2`.
  const onLine = new Map<number, number>();
  return reads
    .filter((r) => r.unitId === u.id)
    .map((r) => {
      const nth = (onLine.get(r.line) ?? 0) + 1;
      onLine.set(r.line, nth);
      const list = lists.find((l) => l.lookup?.table === r.table)!;
      const answer = answerOf(r, list.structure.tsName);
      if (r.conditions === null) {
        return {
          line: r.line,
          table: r.table,
          list: list.key,
          read: r.text,
          helper: r.helper,
          fn: null,
          call: `${r.helper}(st, (row) => <WHERE ${r.where}>)`,
          returns: answer,
          open: [`WHERE ${r.where}`],
        };
      }
      const values = r.conditions.map((c) => ({ c, ...resolveOperand(c.operand, u, r.line, plan, shapes, constants) }));
      const open = values.filter((v) => v.expr === null).map((v) => v.name);
      const object = values.map((v) => `${v.c.key}: ${v.expr ?? `<${v.name}>`}`).join(', ');
      return {
        line: r.line,
        table: r.table,
        list: list.key,
        read: r.text,
        helper: r.helper,
        fn: open.length === 0 ? `lookup_L${r.line}${nth === 1 ? '' : `_${nth}`}` : null,
        call: `${r.helper}(st, { ${object} })`,
        returns: answer,
        ...(open.length ? { open } : {}),
      };
    });
}

/** The frame lines before a body: one function per read the engine can write whole. */
export function lookupFrameLines(entries: readonly LookupEntry[]): string[] {
  return entries
    .filter((e) => e.fn !== null)
    .map((e) => `  const ${e.fn} = (): ${e.returns} => ${e.call}; // the SELECT at L${e.line}: call it there (engine, srv/lib/lookups.ts; rows: the request's list ${e.list})`);
}

/** The lines of a unit's doc comment that name its reads. */
export function lookupDocLines(entries: readonly LookupEntry[]): string[] {
  return entries.map((e) =>
    e.fn !== null
      ? ` * Lookup (engine): ${e.fn}() is the read at L${e.line} (${comment(e.read).slice(0, 160)}) — call it where the original reads; it answers ${e.returns.startsWith('SelectSingle') ? '{ row, sySubrc }' : '{ rows, sySubrc, dbcnt }'} from the list ${e.list}.`
      : ` * Lookup: at L${e.line} the body calls ${comment(e.call)} — it answers ${e.returns.startsWith('SelectSingle') ? '{ row, sySubrc }' : '{ rows, sySubrc, dbcnt }'} from the list ${e.list} (${(e.open ?? []).map(comment).join(', ')} open: known only inside the routine or not read by the engine).`,
  );
}

/** The names a body of this unit may call for its reads. */
export function lookupAvailable(entries: readonly LookupEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => (e.fn ? [e.fn] : [e.helper, ...(e.call.includes('syDatum()') ? ['syDatum'] : [])])))];
}

/** The import line of a frame with reads, or none. */
export function lookupImport(entries: readonly LookupEntry[], libDir: string): string[] {
  if (entries.length === 0) return [];
  const names = new Set<string>();
  for (const e of entries) {
    names.add(e.helper);
    if (e.call.includes('syDatum()')) names.add('syDatum');
  }
  // The answer types the frame's functions name (`(): SelectSingle<Kna1Row> => …`).
  const answers = new Set<string>();
  const rows = new Set<string>();
  for (const e of entries) {
    const m = /^(\w+)<(\w+)>$/.exec(e.returns);
    if (m && e.fn) {
      answers.add(m[1]);
      rows.add(m[2]);
    }
  }
  return [
    `import { ${[...names].sort().join(', ')}${answers.size ? `, type ${[...answers].sort().join(', type ')}` : ''} } from '${libDir}lookups.ts';`,
    ...(rows.size ? [`import type { ${[...rows].sort().join(', ')} } from '${libDir}types.ts';`] : []),
  ];
}

const OP_TS: Record<LookupOp, (a: string, b: string, k: string) => string> = {
  '=': (a, b, k) => `eq(${a}, ${b}${k})`,
  '<>': (a, b, k) => `!eq(${a}, ${b}${k})`,
  '<': (a, b, k) => `cmp(${a}, ${b}${k}) < 0`,
  '<=': (a, b, k) => `cmp(${a}, ${b}${k}) <= 0`,
  '>': (a, b, k) => `cmp(${a}, ${b}${k}) > 0`,
  '>=': (a, b, k) => `cmp(${a}, ${b}${k}) >= 0`,
};

/** `srv/lib/lookups.ts` — one function per read, over the lookup lists. */
export function lookupsFile(program: string | null, reads: readonly LookupRead[], lists: readonly InputList[]): string {
  const lookupLists = lists.filter((l) => l.lookup);
  const lines: string[] = [];
  lines.push('/**');
  lines.push(` * The reads ${program ?? 'the original'} makes inside its steps — written by Clean-Core.io (engine).`);
  lines.push(' * Each SAP table the steps read is a lookup list of the request (and of the action), its rows in st.local:');
  for (const l of lookupLists) lines.push(` *   ${LOOKUP_TAG} ${l.key} ← ${l.lookup!.table} (L${l.lookup!.lines.join(', L')}) st.local.${l.global.key}`);
  lines.push(' * The rows come with the request: a remote read (srv/access.ts) is not wired to these lists — that is a developer step.');
  lines.push(' * SELECT SINGLE answers the first matching row or null, sy-subrc 0 or 4; SELECT … INTO TABLE the matching rows,');
  lines.push(' * sy-subrc 0 or 4 and sy-dbcnt. A column is text as the request sends it: its type is in the dictionary.');
  lines.push(' */');
  lines.push(`import type { RunState, ${[...new Set(lookupLists.map((l) => l.structure.tsName))].join(', ')} } from './types.ts';`);
  lines.push('');
  lines.push('/** SELECT SINGLE: the row, and sy-subrc (0 found, 4 not found). */');
  lines.push('export interface SelectSingle<R> {\n  row: R | null;\n  sySubrc: number;\n}');
  lines.push('/** SELECT … INTO TABLE: the rows, sy-subrc (0 found, 4 none) and sy-dbcnt. */');
  lines.push('export interface SelectTable<R> {\n  rows: R[];\n  sySubrc: number;\n  dbcnt: number;\n}');
  lines.push('');
  lines.push("/** sy-datum: today's date (UTC) as YYYYMMDD. */");
  lines.push("export function syDatum(): string {\n  return new Date().toISOString().slice(0, 10).replace(/-/g, '');\n}");
  lines.push('');
  lines.push('const textOf = (v: unknown): string => (v === null || v === undefined ? \'\' : String(v));');
  lines.push("/** A date as YYYYMMDD (2026-10-17 and 20261017 alike), else null. */");
  lines.push("const dateOf = (s: string): string | null => (/^\\d{4}-\\d{2}-\\d{2}$/.test(s) ? s.replace(/-/g, '') : /^\\d{8}$/.test(s) ? s : null);");
  lines.push('/** A number by its value (the operand the original compares with is of a numeric type), else null. */');
  lines.push("const numberOf = (s: string): number | null => (/^[-+]?\\d+(?:\\.\\d+)?$/.test(s) ? Number(s) : null);");
  lines.push('/**');
  lines.push(" * How a comparison orders, from the type the original declares for what it compares with: 'number' and 'date' by");
  lines.push(" * value; 'text' (the default) as ABAP compares two character fields, character by character — '10' < '2', and a key");
  lines.push(" * with leading zeros ('0001') is never read as a number.");
  lines.push(' */');
  lines.push("export type Compare = 'text' | 'number' | 'date';");
  lines.push('/** Equal as the original compares: trailing blanks do not count; by value only for a numeric or a date operand. */');
  lines.push("export function eq(a: unknown, b: unknown, as: Compare = 'text'): boolean {");
  lines.push('  return cmp(a, b, as) === 0;');
  lines.push('}');
  lines.push('/** The order of two values: by value for a numeric or a date operand, else by characters (trailing blanks do not count). */');
  lines.push("export function cmp(a: unknown, b: unknown, as: Compare = 'text'): number {");
  lines.push("  const x = textOf(a).replace(/\\s+$/, '');");
  lines.push("  const y = textOf(b).replace(/\\s+$/, '');");
  lines.push("  if (as === 'date') {");
  lines.push('    const dx = dateOf(x);');
  lines.push('    const dy = dateOf(y);');
  lines.push('    if (dx !== null && dy !== null) return dx < dy ? -1 : dx > dy ? 1 : 0;');
  lines.push("  } else if (as === 'number') {");
  lines.push('    const nx = numberOf(x);');
  lines.push('    const ny = numberOf(y);');
  lines.push('    if (nx !== null && ny !== null) return nx < ny ? -1 : nx > ny ? 1 : 0;');
  lines.push('  }');
  lines.push('  return x < y ? -1 : x > y ? 1 : 0;');
  lines.push('}');
  lines.push('');
  lines.push('function single<R>(rows: readonly R[], match: (row: R) => boolean): SelectSingle<R> {');
  lines.push('  const row = rows.find(match) ?? null;');
  lines.push('  return { row, sySubrc: row ? 0 : 4 };');
  lines.push('}');
  lines.push('function table<R>(rows: readonly R[], match: (row: R) => boolean): SelectTable<R> {');
  lines.push('  const hit = rows.filter(match);');
  lines.push('  return { rows: hit, sySubrc: hit.length > 0 ? 0 : 4, dbcnt: hit.length };');
  lines.push('}');
  lines.push('');
  for (const r of reads) {
    const l = lookupLists.find((x) => x.lookup!.table === r.table)!;
    const row = l.structure.tsName;
    const answer = answerOf(r, row);
    const run = r.single ? 'single' : 'table';
    lines.push(`/** L${r.line}: ${comment(r.text)} */`);
    if (r.conditions === null) {
      lines.push(` // The WHERE (${comment(r.where)}) is not one the engine writes: the body passes it as a predicate on the row.`);
      lines.push(`export function ${r.helper}(st: RunState, where: (row: ${row}) => boolean): ${answer} {`);
      lines.push(`  return ${run}(st.local.${l.global.key}, where);`);
    } else {
      const params = r.conditions.length ? `{ ${r.conditions.map((c) => `${c.key}: unknown`).join('; ')} }` : 'Record<string, never>';
      const test = r.conditions.map((c) => OP_TS[c.op](`row.${camelName(c.column)}`, `where.${c.key}`, c.compare === 'text' ? '' : `, ${sq(c.compare)}`));
      lines.push(`export function ${r.helper}(st: RunState, where: ${params}): ${answer} {`);
      if (r.conditions.length === 0) lines.push('  void where;');
      lines.push(`  return ${run}(st.local.${l.global.key}, (row) => ${test.length ? test.join(' && ') : 'true'});`);
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

/** The lookup lists `srv/lib/lookups.ts` names (`kna1 ← KNA1 (L156)`), for TRACE.md; none when absent. */
export function lookupListsIn(content: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`^ \\*\\s+${LOOKUP_TAG} (\\S+ ← \\S+ \\([^)]*\\))`, 'gm');
  for (let m = re.exec(content); m !== null; m = re.exec(content)) out.push(m[1]);
  return out;
}

/**
 * The original's own data shapes, as TypeScript (roadmap 3.0.13, A3): every
 * structure the program declares (`TYPES|DATA: BEGIN OF … END OF`) as an
 * interface of its components, every table type as an array of its line, and
 * the program's global data objects as the typed working state of a run
 * (`RunState.local: Locals` in `srv/lib/types.ts`).
 *
 * Why: the steps' working data — the original's global tables and variables —
 * lived in `RunState.local: Record<string, unknown>`. A body could read
 * `st.local.gtClaims[0].pirce` and nothing, not even the type check, could
 * say the field does not exist. Typed, the type check of the candidate does.
 *
 * The types, by what the original declares:
 *
 *   - a whole number (`i`, `int1`, `int2`, `int4`, `b`, `s`, a count or return
 *     code of the system such as `sy-tabix`) is `number` (3.0.14 item 1: as
 *     text, `lv_count > 5000` and `lv_count = lines( … )` were the most
 *     frequent type errors of the acceptance runs);
 *   - every other scalar (`c`, `n`, `d`, `t`, `string`, `p`, `int8`, a
 *     dictionary type) is `string` — decimals reach a body as text in this
 *     port, and are computed through `dec.*`; the ABAP type stays in the
 *     comment, with its places;
 *   - a structure is its interface; a table of a line type is that type's
 *     array (`TYPE STANDARD TABLE OF ty_claim`, `TYPE tt_claim`);
 *   - a reference (`REF TO`), a component reference (`TYPE x-y`) and anything
 *     not read are `unknown` — never a guess.
 *
 * Each global starts at its ABAP initial value (`''`, `'0'`, `'0.000'`,
 * `'00000000'` for a date, `[]` for a table, every component initial for a
 * structure), so a step reads what the original's step would read.
 *
 * `typeOf(name, line)` (3.0.13, acceptance run 14.10.2026): the same types
 * for any data object where a line reads it — a FORM's parameters, its DATA,
 * FIELD-SYMBOLS and inline `INTO DATA(…)`, a structure's component, a system
 * field (`sy-subrc` a number, `sy-datum` text). The guards' `values` and the
 * steps' arguments are typed from it, so a faithful body's `dec.compare(
 * values.lvSum, '100')` compiles instead of failing on `GuardValue`/`unknown`.
 *
 * Pure: statements in, declarations out. No network, no model.
 */

import type { AbapStatement } from '../abap/statement-reader';
import type { BlockStructure } from '../abap/block-structure';
import { camelName, pascalName } from './naming';
import { formParameters, SAP_STRUCTURE_EQUIVALENTS } from './rap-contract';

export interface ShapeField {
  /** As the original writes it, lower case. */
  name: string;
  /** The TypeScript property name. */
  key: string;
  /** `TYPE ty_raw`, `TYPE c LENGTH 10`, `TYPE STANDARD TABLE OF ty_policy`. */
  abap: string;
  /** The TypeScript type. */
  ts: string;
  /** The initial value as a TypeScript expression. */
  init: string;
  line: number;
  /**
   * The ABAP scalar type behind the declaration, through every `TYPES` alias (`ty_raw` → `p LENGTH 12
   * DECIMALS 6`), for the CAP data model and the per-structure input contract (3.0.13, CAP shell); null for a
   * structure, a table, a reference, or a type the source does not declare (a dictionary type such as `vkorg`
   * is `{ type: 'vkorg', dictionary: true }` — its length is in the dictionary, not here).
   */
  scalar: AbapScalar | null;
}

/** An ABAP scalar type as the source declares it. */
export interface AbapScalar {
  /** Lower case: `p`, `i`, `int8`, `c`, `n`, `d`, `t`, `string`, `f`, `decfloat34`, or a dictionary name. */
  type: string;
  length: number | null;
  decimals: number | null;
  /** A name the source does not declare and that is no built-in type: a dictionary type or data element. */
  dictionary: boolean;
}

const BUILTIN_SCALARS = new Set(['p', 'i', 'int1', 'int2', 'int4', 'int8', 'b', 's', 'c', 'n', 'd', 't', 'string', 'xstring', 'x', 'f', 'decfloat16', 'decfloat34', 'utclong']);

export interface ShapeStructure {
  /** As the original names it, lower case. */
  name: string;
  /** The interface name. */
  tsName: string;
  line: number;
  lineEnd: number;
  fields: ShapeField[];
}

export interface AbapShapes {
  structures: ShapeStructure[];
  /** The program's global data objects (DATA outside FORM, METHOD, MODULE, CLASS). */
  globals: ShapeField[];
  /**
   * The TypeScript type of a data object as the original declares it where `line` reads it — `lv_sum`,
   * `ls_op-effort`, `<ls_row>`, `cv_code`, `sy-subrc` — or null when no declaration says (see `typeAt`).
   */
  typeOf(name: string, line: number): string | null;
  /**
   * The ABAP scalar type behind a data object where `line` reads it — `lv_qty` → `p LENGTH 8 DECIMALS 3`,
   * `cs_result-status` → `c LENGTH 10`, `sy-subrc` → `i`, `sy-datum` → `d` — or null for a structure, a table, a
   * reference or a name no declaration of the source types (3.0.17 criterion 3: the engine writes a check's
   * predicate where the original's condition and this type decide it).
   */
  scalarOf(name: string, line: number): AbapScalar | null;
}

/**
 * System fields that hold a count or a return code: a number in the port (`check` hands them in as one). Every
 * other system field (`sy-datum`, `sy-uname`, `sy-langu`) is text, like the original's character types.
 */
export const NUMERIC_SYSTEM_FIELDS: ReadonlySet<string> = new Set(['subrc', 'tabix', 'index', 'dbcnt', 'fdpos', 'tfill', 'lsind', 'linno', 'colno', 'pagno', 'linct', 'linsz', 'cpage', 'staro', 'stepl', 'loopc']);

const NUMERIC_INITIAL: Record<string, string> = { i: '0', int1: '0', int2: '0', int4: '0', int8: '0', b: '0', s: '0', f: '0', decfloat16: '0', decfloat34: '0' };
const LOCAL_BLOCKS = new Set(['form', 'method', 'module', 'class', 'interface', 'define']);

interface Decl {
  name: string;
  rest: string;
  line: number;
}

/**
 * The declarations after the name: `TYPE STANDARD TABLE OF ty_x WITH DEFAULT KEY` →
 * `{ table: true, ref: false, like: false, type: 'ty_x', length, decimals }`.
 */
function readTypeExpr(rest: string): { table: boolean; ref: boolean; like: boolean; lineOf: boolean; type: string | null; length: number | null; decimals: number | null } {
  const m = /^(TYPE|LIKE)\s+(?:(?:STANDARD|SORTED|HASHED|ANY|INDEX)\s+)?(?:(TABLE)\s+OF\s+)?(?:(LINE)\s+OF\s+)?(?:(REF)\s+TO\s+)?([\w/-]+)/i.exec(rest);
  const length = /\bLENGTH\s+(\d+)/i.exec(rest);
  const decimals = /\bDECIMALS\s+(\d+)/i.exec(rest);
  const old = /^\((\d+)\)/.exec(rest);
  if (!m) {
    // `lv_x(10)` with no TYPE is a character field.
    return { table: false, ref: false, like: false, lineOf: false, type: old || rest.trim() === '' ? 'c' : null, length: old ? Number(old[1]) : null, decimals: null };
  }
  return {
    table: Boolean(m[2]),
    ref: Boolean(m[4]),
    like: m[1].toUpperCase() === 'LIKE',
    lineOf: Boolean(m[3]),
    type: m[5].toLowerCase(),
    length: length ? Number(length[1]) : null,
    decimals: decimals ? Number(decimals[1]) : null,
  };
}

/** The original's structures, table types and globals as TypeScript — see the file comment. */
export function readAbapShapes(statements: readonly AbapStatement[], blocks: Pick<BlockStructure, 'enclosing'>, reserved: ReadonlySet<string> = new Set()): AbapShapes {
  const scalarAlias = new Map<string, Decl>();
  const tableType = new Map<string, Decl>();
  const structDecls: Array<{ name: string; line: number; lineEnd: number; data: boolean; components: Decl[] }> = [];
  const globalDecls: Decl[] = [];
  const stack: Array<(typeof structDecls)[number]> = [];
  // The data objects of each FORM or METHOD (3.0.13, acceptance run 14.10.2026): its parameters, DATA,
  // FIELD-SYMBOLS and inline declarations, so a guard's values and a step's arguments get the declared type.
  const procedures: Array<{ lineStart: number; lineEnd: number }> = [];
  const localDecls = new Map<number, Map<string, Decl>>();
  const localTypeNames = new Set<string>();
  let localStructDepth = 0;
  const procedureOf = (i: number) => {
    const p = [...(blocks.enclosing[i] ?? [])].reverse().find((b) => b.kind === 'form' || b.kind === 'method' || b.kind === 'module');
    if (p && !procedures.some((x) => x.lineStart === p.lineStart)) procedures.push({ lineStart: p.lineStart, lineEnd: p.lineEnd });
    return p ?? null;
  };
  const declareLocal = (proc: number, d: Decl) => {
    const m = localDecls.get(proc) ?? new Map<string, Decl>();
    if (!m.has(d.name)) m.set(d.name, d);
    localDecls.set(proc, m);
  };

  statements.forEach((st, i) => {
    if (st.keyword === 'FORM') {
      // The opening statement is not inside its own block: the FORM's block is the one its next statement is in.
      const form = (blocks.enclosing[i + 1] ?? []).find((b) => b.kind === 'form' && b.openIndex === i);
      if (form) {
        procedureOf(i + 1);
        for (const p of formParameters(st.text)) {
          const typed = p.phrase ? p.phrase.replace(/^STRUCTURE\s+/i, 'TYPE ') : 'TYPE any';
          const lineType = /^TYPE\s+([\w/]+)$/i.exec(typed)?.[1];
          // TABLES p STRUCTURE s: a table of s (unless s is a table type of the program already).
          const tables = lineType && !tableType.has(lineType.toLowerCase()) ? `TYPE STANDARD TABLE OF ${lineType}` : lineType ? typed : 'TYPE STANDARD TABLE';
          declareLocal(form.lineStart, { name: p.name, rest: p.section === 'tables' ? tables : typed, line: st.lineStart });
        }
      }
      return;
    }
    const proc = procedureOf(i);
    if (proc) {
      // `LOOP AT t INTO DATA(x)`, `READ TABLE t … ASSIGNING FIELD-SYMBOL(<x>)`: a row of the table read.
      const inline = /^(?:LOOP\s+AT|READ\s+TABLE)\s+([\w/]+)(?:\[\])?\b[\s\S]*?\b(?:INTO\s+DATA|ASSIGNING\s+FIELD-SYMBOL)\(\s*(<?[\w/]+>?)\s*\)/i.exec(st.text);
      if (inline) declareLocal(proc.lineStart, { name: inline[2].toLowerCase(), rest: `LIKE LINE OF ${inline[1].toLowerCase()}`, line: st.lineStart });
      if (st.keyword === 'FIELD-SYMBOLS' || st.keyword === 'STATICS' || (st.keyword === 'DATA' && localStructDepth === 0)) {
        const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '').replace(/\.\s*$/, '');
        const m = /^(<?[\w/]+>?)(\(\d+\))?(?:\s+([\s\S]*))?$/.exec(rest);
        if (m && !/^(?:BEGIN|END)$/i.test(m[1])) declareLocal(proc.lineStart, { name: m[1].toLowerCase(), rest: `${m[2] ?? ''}${m[3] ? (m[2] ? ' ' : '') + m[3] : ''}`.trim(), line: st.lineStart });
      }
      if (st.keyword === 'TYPES') {
        const m = /^TYPES\s*:?\s*(?:BEGIN\s+OF\s+)?([\w/]+)/i.exec(st.text);
        if (m && !/^TYPES\s*:?\s*END\s+OF/i.test(st.text)) localTypeNames.add(m[1].toLowerCase());
      }
    }
    if (st.keyword === 'INCLUDE' && stack.length > 0) {
      // `INCLUDE STRUCTURE bdcdata.` inside `DATA: BEGIN OF … END OF`: the included components (rap-contract.ts).
      const inc = /^INCLUDE\s+(?:STRUCTURE|TYPE)\s+([\w/]+)/i.exec(st.text);
      const own = inc ? structDecls.find((s) => s.name === inc[1].toLowerCase()) : undefined;
      const sap = inc ? SAP_STRUCTURE_EQUIVALENTS[inc[1].toLowerCase()] : undefined;
      if (own) stack[stack.length - 1].components.push(...own.components);
      else if (sap) stack[stack.length - 1].components.push(...sap.map((c) => ({ name: c.name, rest: c.phrase, line: st.lineStart })));
      return;
    }
    if (st.keyword !== 'TYPES' && st.keyword !== 'DATA') return;
    const local = (blocks.enclosing[i] ?? []).some((b) => LOCAL_BLOCKS.has(b.kind));
    const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '').replace(/\.\s*$/, '');
    const begin = /^BEGIN\s+OF\s+([\w/]+)/i.exec(rest);
    if (begin) {
      if (local && stack.length === 0) {
        localStructDepth++;
        return;
      }
      const s = { name: begin[1].toLowerCase(), line: st.lineStart, lineEnd: st.lineStart, data: st.keyword === 'DATA', components: [] as Decl[] };
      if (stack.length > 0) {
        // A nested structure is a component typed by itself.
        stack[stack.length - 1].components.push({ name: s.name, rest: `TYPE ${s.name}`, line: st.lineStart });
      }
      structDecls.push(s);
      stack.push(s);
      return;
    }
    const end = /^END\s+OF\s+([\w/]+)/i.exec(rest);
    if (end) {
      if (stack.length === 0 && localStructDepth > 0) {
        localStructDepth--;
        return;
      }
      const s = stack.pop();
      if (s) {
        s.lineEnd = st.lineStart;
        // `DATA: BEGIN OF gs_x … END OF gs_x.` at program level is a global of that shape.
        if (s.data && stack.length === 0 && !local) globalDecls.push({ name: s.name, rest: `TYPE ${s.name}`, line: s.line });
      }
      return;
    }
    const m = /^([\w/]+)(\(\d+\))?(?:\s+([\s\S]*))?$/.exec(rest);
    if (!m) return;
    const decl: Decl = { name: m[1].toLowerCase(), rest: `${m[2] ?? ''}${m[3] ? (m[2] ? ' ' : '') + m[3] : ''}`.trim(), line: st.lineStart };
    if (stack.length > 0) {
      stack[stack.length - 1].components.push(decl);
      return;
    }
    if (local) return;
    if (st.keyword === 'TYPES') {
      const t = readTypeExpr(decl.rest);
      if (t.table) tableType.set(decl.name, decl);
      else scalarAlias.set(decl.name, decl);
      return;
    }
    globalDecls.push(decl);
  });

  // Interface names: the original's, unless another declaration of types.ts already holds it.
  const tsNames = new Map<string, string>();
  const taken = new Set(reserved);
  for (const s of structDecls) {
    if (tsNames.has(s.name)) continue;
    let n = pascalName(s.name);
    if (taken.has(n)) n = `${n}Structure`;
    for (let k = 2; taken.has(n); k++) n = `${pascalName(s.name)}Structure${k}`;
    taken.add(n);
    tsNames.set(s.name, n);
  }
  const structByName = new Map(structDecls.map((s) => [s.name, s]));
  const globalByName = new Map(globalDecls.map((g) => [g.name, g]));

  /** The TypeScript type and initial value of a declaration's type expression. */
  // `scope`: the data objects of the procedure a declaration is in, for its LIKE (globals otherwise).
  const resolve = (rest: string, depth = 0, scope?: ReadonlyMap<string, Decl>): { ts: string; init: string } => {
    if (depth > 6) return { ts: 'unknown', init: 'null' };
    const t = readTypeExpr(rest);
    if (t.ref || !t.type) return { ts: 'unknown', init: 'null' };
    if (t.type.includes('-')) {
      // `TYPE sy-tabix`, `LIKE sy-datum` (3.0.14 item 1): a system field's own type — a count or return code a
      // number, every other one text (`sy-datum` a date). Any other component reference is not read here.
      const sy = /^sy-(\w+)$/.exec(t.type);
      if (!sy || t.table) return { ts: 'unknown', init: 'null' };
      return NUMERIC_SYSTEM_FIELDS.has(sy[1]) ? { ts: 'number', init: '0' } : { ts: 'string', init: scalarInitial(SYSTEM_DATE_TIME[sy[1]] ?? 'c', null, null) };
    }
    // Generic types (a FORM's `TYPE any`, `TYPE STANDARD TABLE`): nothing the port may assume.
    if (!t.like && t.type === 'table') return { ts: 'unknown[]', init: '[]' };
    if (!t.like && GENERIC.has(t.type)) return { ts: 'unknown', init: 'null' };
    if (t.table) {
      const line = resolve(`${t.like ? 'LIKE' : 'TYPE'} ${t.type}`, depth + 1, scope);
      return { ts: line.ts === 'unknown' ? 'unknown[]' : /[|&]/.test(line.ts) ? `Array<${line.ts}>` : `${line.ts}[]`, init: '[]' };
    }
    if (t.like) {
      const g = scope?.get(t.type) ?? globalByName.get(t.type);
      if (!g) return { ts: 'unknown', init: 'null' };
      const of = resolve(g.rest, depth + 1, scope);
      if (t.lineOf) return of.ts.endsWith('[]') ? { ts: of.ts.slice(0, -2), init: initOfTs(of.ts.slice(0, -2)) } : { ts: 'unknown', init: 'null' };
      return of;
    }
    const s = structByName.get(t.type);
    if (s) {
      const name = tsNames.get(s.name)!;
      return { ts: name, init: structInit(s, depth + 1) };
    }
    const tt = tableType.get(t.type);
    if (tt) return resolve(tt.rest, depth + 1);
    const alias = scalarAlias.get(t.type);
    if (alias) return resolve(alias.rest, depth + 1);
    // A type a FORM declares for itself is not in srv/lib/types.ts: never guessed as text.
    if (scope && localTypeNames.has(t.type)) return { ts: 'unknown', init: 'null' };
    // A whole-number type is a number (3.0.14 item 1): counts, indexes and return codes are compared and counted as
    // numbers (`lv_count > 5000`, `lv_matches = 1`). As text they gave the most frequent type errors of the
    // acceptance runs — the model writes them as numbers, and the prompt says counts are numbers.
    if (INTEGER_TYPES.has(t.type)) return { ts: 'number', init: '0' };
    return { ts: 'string', init: scalarInitial(t.type, t.length, t.decimals) };
  };

  const initOfTs = (ts: string): string => {
    const s = [...tsNames].find(([, n]) => n === ts);
    if (s) return structInit(structByName.get(s[0])!, 1);
    return ts.endsWith('[]') ? '[]' : ts === 'string' ? "''" : ts === 'number' ? '0' : 'null';
  };

  function structInit(s: (typeof structDecls)[number], depth: number): string {
    if (depth > 6) return '{}';
    const parts = s.components.map((c) => `${camelName(c.name)}: ${resolve(c.rest, depth + 1).init}`);
    return `{ ${parts.join(', ')} }`;
  }

  /** The scalar behind a declaration, through aliases; null for anything that is not one. */
  const scalarOf = (rest: string, depth = 0): AbapScalar | null => {
    if (depth > 6) return null;
    const t = readTypeExpr(rest);
    // A count or return code of the system (`TYPE sy-tabix`) is a whole number, as `resolve` types it.
    const sy = t.type ? /^sy-(\w+)$/.exec(t.type) : null;
    if (sy && !t.ref && !t.table && NUMERIC_SYSTEM_FIELDS.has(sy[1])) return { type: 'i', length: null, decimals: null, dictionary: false };
    if (t.ref || t.table || !t.type || t.type.includes('-')) return null;
    if (t.like) {
      const g = globalByName.get(t.type);
      return g && !t.lineOf ? scalarOf(g.rest, depth + 1) : null;
    }
    if (structByName.has(t.type) || tableType.has(t.type)) return null;
    const alias = scalarAlias.get(t.type);
    if (alias) {
      const inner = scalarOf(alias.rest, depth + 1);
      // `TYPE ty_x LENGTH 5` on an alias of a generic type keeps the outer length.
      return inner ? { ...inner, length: t.length ?? inner.length, decimals: t.decimals ?? inner.decimals } : null;
    }
    return { type: t.type, length: t.length, decimals: t.decimals, dictionary: !BUILTIN_SCALARS.has(t.type) };
  };

  const fieldOf = (d: Decl): ShapeField => {
    const r = resolve(d.rest);
    // `VALUE 'X'`, `VALUE 100`, `VALUE abap_true`: the start value the original gives a scalar.
    const scalarTs = r.ts === 'string' || r.ts === 'number';
    const value = scalarTs ? /\bVALUE\s+('(?:[^']|'')*'|`[^`]*`|-?\d+(?:\.\d+)?|abap_true|abap_false|space)(?:\s|$)/i.exec(d.rest) : null;
    let init = r.init;
    if (value) {
      const v = value[1];
      const text = /^'/.test(v) ? v.slice(1, -1).replace(/''/g, "'") : /^`/.test(v) ? v.slice(1, -1) : /^abap_true$/i.test(v) ? 'X' : /^(?:abap_false|space)$/i.test(v) ? '' : v;
      // A number's start value as a number literal; one that is no whole number keeps the initial 0.
      init = r.ts === 'number' ? (/^-?\d+$/.test(text.trim()) ? String(Number(text.trim())) : r.init) : JSON.stringify(text);
    }
    const abap = d.rest
      .replace(/\s+WITH\s+(?:NON-UNIQUE\s+|UNIQUE\s+)?(?:DEFAULT\s+)?KEY\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { name: d.name, key: camelName(d.name), abap: abap || 'TYPE c', ts: r.ts, init, line: d.line, scalar: scalarTs ? scalarOf(d.rest) : null };
  };

  const seen = new Set<string>();
  const structures: ShapeStructure[] = [];
  for (const s of structDecls) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    const keys = new Set<string>();
    const fields = s.components.map(fieldOf).filter((f) => (keys.has(f.key) ? false : (keys.add(f.key), true)));
    structures.push({ name: s.name, tsName: tsNames.get(s.name)!, line: s.line, lineEnd: s.lineEnd, fields });
  }
  const globalKeys = new Set<string>();
  const globals = globalDecls.map(fieldOf).filter((g) => (globalKeys.has(g.key) ? false : (globalKeys.add(g.key), true)));

  const byTsName = new Map(structures.map((s) => [s.tsName, s]));
  const typeOf = (name: string, line: number): string | null => {
    const [base, ...components] = name.toLowerCase().trim().split('-');
    if (!base) return null;
    if (base === 'sy') return components.length === 1 ? (NUMERIC_SYSTEM_FIELDS.has(components[0]) ? 'number' : 'string') : null;
    // The innermost FORM or METHOD around the line, then the program's globals.
    const proc = procedures.filter((p) => line >= p.lineStart && line <= p.lineEnd).sort((a, b) => b.lineStart - a.lineStart)[0];
    const scope = proc ? localDecls.get(proc.lineStart) : undefined;
    const decl = scope?.get(base) ?? globalByName.get(base);
    if (!decl) return null;
    let ts = resolve(decl.rest, 0, scope).ts;
    for (const c of components) {
      const s = byTsName.get(ts);
      const f = s?.fields.find((x) => x.key === camelName(c));
      if (!f) return null;
      ts = f.ts;
    }
    return ts;
  };
  const scalarAt = (name: string, line: number): AbapScalar | null => {
    const [base, ...components] = name.toLowerCase().trim().split('-');
    if (!base) return null;
    if (base === 'sy') {
      if (components.length !== 1) return null;
      if (NUMERIC_SYSTEM_FIELDS.has(components[0])) return { type: 'i', length: null, decimals: null, dictionary: false };
      const dt = SYSTEM_DATE_TIME[components[0]];
      return dt ? { type: dt, length: null, decimals: null, dictionary: false } : null;
    }
    const proc = procedures.filter((p) => line >= p.lineStart && line <= p.lineEnd).sort((a, b) => b.lineStart - a.lineStart)[0];
    const scope = proc ? localDecls.get(proc.lineStart) : undefined;
    const decl = scope?.get(base) ?? globalByName.get(base);
    if (!decl) return null;
    if (components.length === 0) return scalarOf(decl.rest);
    let ts = resolve(decl.rest, 0, scope).ts;
    let field: ShapeField | undefined;
    for (const c of components) {
      field = byTsName.get(ts)?.fields.find((x) => x.key === camelName(c));
      if (!field) return null;
      ts = field.ts;
    }
    return field?.scalar ?? null;
  };
  return { structures, globals, typeOf, scalarOf: scalarAt };
}

/**
 * The whole-number types that are a `number` in the port (3.0.14 item 1). `int8` stays text: its range is past
 * JavaScript's exact integers, so it is computed as decimal text like a packed field.
 */
export const INTEGER_TYPES: ReadonlySet<string> = new Set(['i', 'int1', 'int2', 'int4', 'b', 's']);

/** The system fields that are a date or a time, for their initial value (every other text field starts empty). */
const SYSTEM_DATE_TIME: Readonly<Record<string, string>> = { datum: 'd', datlo: 'd', uzeit: 't', timlo: 't' };

/** Generic ABAP types: a parameter so typed takes anything (`clike` and its kin are text in the port). */
const GENERIC = new Set(['any', 'data', 'object']);

/** The ABAP initial value of a scalar, as the port holds it (text). */
function scalarInitial(type: string, length: number | null, decimals: number | null): string {
  if (type === 'p') return decimals && decimals > 0 ? `'0.${'0'.repeat(decimals)}'` : "'0'";
  if (NUMERIC_INITIAL[type] !== undefined) return "'0'";
  if (type === 'd') return "'00000000'";
  if (type === 't') return "'000000'";
  if (type === 'n') return `'${'0'.repeat(Math.max(1, Math.min(length ?? 1, 40)))}'`;
  return "''";
}

/** The comment of a field: the original's name, its declaration, its line. */
export function shapeComment(f: ShapeField): string {
  return `${f.name.toUpperCase()} — ${f.abap.replace(/\*\//g, '* /')}, L${f.line}.`;
}

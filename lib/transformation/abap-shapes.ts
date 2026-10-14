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
 *   - a scalar (`c`, `n`, `d`, `t`, `string`, `i`, `p`, a dictionary type) is
 *     `string` — numbers reach a body as text in this port, and are computed
 *     through `dec.*`; the ABAP type stays in the comment, with its places;
 *   - a structure is its interface; a table of a line type is that type's
 *     array (`TYPE STANDARD TABLE OF ty_claim`, `TYPE tt_claim`);
 *   - a reference (`REF TO`), a component reference (`TYPE x-y`) and anything
 *     not read are `unknown` — never a guess.
 *
 * Each global starts at its ABAP initial value (`''`, `'0'`, `'0.000'`,
 * `'00000000'` for a date, `[]` for a table, every component initial for a
 * structure), so a step reads what the original's step would read.
 *
 * Pure: statements in, declarations out. No network, no model.
 */

import type { AbapStatement } from '../abap/statement-reader';
import type { BlockStructure } from '../abap/block-structure';
import { camelName, pascalName } from './naming';

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
}

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

  statements.forEach((st, i) => {
    if (st.keyword !== 'TYPES' && st.keyword !== 'DATA') return;
    const local = (blocks.enclosing[i] ?? []).some((b) => LOCAL_BLOCKS.has(b.kind));
    const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '').replace(/\.\s*$/, '');
    const begin = /^BEGIN\s+OF\s+([\w/]+)/i.exec(rest);
    if (begin) {
      if (local && stack.length === 0) return;
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
  const resolve = (rest: string, depth = 0): { ts: string; init: string } => {
    if (depth > 6) return { ts: 'unknown', init: 'null' };
    const t = readTypeExpr(rest);
    if (t.ref || !t.type) return { ts: 'unknown', init: 'null' };
    if (t.type.includes('-')) return { ts: 'unknown', init: 'null' };
    if (t.table) {
      const line = resolve(`TYPE ${t.type}`, depth + 1);
      return { ts: line.ts === 'unknown' ? 'unknown[]' : /[|&]/.test(line.ts) ? `Array<${line.ts}>` : `${line.ts}[]`, init: '[]' };
    }
    if (t.like) {
      const g = globalByName.get(t.type);
      if (!g) return { ts: 'unknown', init: 'null' };
      const of = resolve(g.rest, depth + 1);
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
    return { ts: 'string', init: scalarInitial(t.type, t.length, t.decimals) };
  };

  const initOfTs = (ts: string): string => {
    const s = [...tsNames].find(([, n]) => n === ts);
    if (s) return structInit(structByName.get(s[0])!, 1);
    return ts.endsWith('[]') ? '[]' : ts === 'string' ? "''" : 'null';
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
    const value = r.ts === 'string' ? /\bVALUE\s+('(?:[^']|'')*'|`[^`]*`|-?\d+(?:\.\d+)?|abap_true|abap_false|space)(?:\s|$)/i.exec(d.rest) : null;
    let init = r.init;
    if (value) {
      const v = value[1];
      const text = /^'/.test(v) ? v.slice(1, -1).replace(/''/g, "'") : /^`/.test(v) ? v.slice(1, -1) : /^abap_true$/i.test(v) ? 'X' : /^(?:abap_false|space)$/i.test(v) ? '' : v;
      init = JSON.stringify(text);
    }
    const abap = d.rest
      .replace(/\s+WITH\s+(?:NON-UNIQUE\s+|UNIQUE\s+)?(?:DEFAULT\s+)?KEY\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { name: d.name, key: camelName(d.name), abap: abap || 'TYPE c', ts: r.ts, init, line: d.line, scalar: r.ts === 'string' ? scalarOf(d.rest) : null };
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
  return { structures, globals };
}

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

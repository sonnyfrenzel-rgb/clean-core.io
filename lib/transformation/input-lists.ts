/**
 * The input of a Node/CAP package, one named list per source structure (roadmap 3.0.13, "typed records per
 * source structure instead of one field union"; agent 6's open point 1).
 *
 * Until scaffold version 7 the request carried one record list (`records: Rec[]`) whose `Rec` folded the
 * input components of every input structure into one object: the SD example's claims, policies and events
 * became one record, its `ORG` was the claim's and its `KNOWN_AT` the policy's, and a request could not hand in
 * two claims and one policy at all. Now each input table of the original is a list of its own, typed by its
 * own structure, and a run starts with those rows in the original's own global table — exactly where the
 * original's FORMs read them, and where the original's demo cases already put them (`node-demo.ts`).
 *
 * An input table is a global internal table whose line is a structure the source declares, and which the
 * original fills from outside its logic:
 *   - in its demo-data routines (`plan.notCarried`, reason `fixture`), its demo-case routine (the golden
 *     master's case switch), or in routines only those call — the reading the RAP scaffold makes of its
 *     inputs (`scaffold-rap.ts`, "the globals the original's demo-data routines fill"), widened to the
 *     routines that build the demo rows (an `ADD_<ROW>` routine called only by the demo build and the cases);
 *   - by a `SELECT … INTO|APPENDING TABLE` — a read of SAP data;
 *   - or it is the table of a structure the planner read input record fields from (`ContractField.where`).
 * Every other global table is computed by the logic and is not input.
 *
 * Each column carries its ABAP type, resolved through the source's `TYPES` (`abap-shapes.ts`): a packed
 * number keeps digits and places, `i` is an integer, `d` a date, `n` digits, `c` text of its length. A
 * one-character field lists the values the original compares or assigns to it (`'X'`, `''`) — information
 * for the reader and the CDS model, never a check: the original may know values the source does not show.
 *
 * Pure: plan, facts and shapes in, lists out. No network, no model.
 */

import type { AbapStatement } from '../abap/statement-reader';
import type { BlockStructure } from '../abap/block-structure';
import type { CallGraphReport } from '../abap/call-graph';
import type { AbapShapes, AbapScalar, ShapeField, ShapeStructure } from './abap-shapes';
import { camelName, pascalName } from './naming';
import type { ContractField, UnitPlan } from './types';

export type InputColumnKind = 'packed' | 'integer' | 'digits' | 'date' | 'text';

export interface InputColumn {
  /** As the original names the component, lower case. */
  name: string;
  /** The property name (the structure interface's, `abap-shapes.ts`). */
  key: string;
  line: number;
  /** `TYPE ty_raw` as declared. */
  abap: string;
  kind: InputColumnKind;
  digits: number | null;
  places: number;
  /** The largest value a packed or integer column holds, else null. */
  max: string | null;
  /** The length of a text column, when the source declares it. */
  length: number | null;
  /** Obligatory where the planner made the field an obligatory input (a packed input component). */
  obligatory: boolean;
  /** One-character columns: the values the original compares or assigns (always with `''`); else null. */
  values: string[] | null;
  /** The initial value, as a TypeScript literal (`abap-shapes.ts`). */
  init: string;
  /** The ABAP scalar behind the column, or null (a nested structure, a reference). */
  scalar: AbapScalar | null;
  /** The declaration as the input contract states it in a message: `P(23,6)`, `TYPE c LENGTH 10`. */
  declaration: string;
}

export interface InputList {
  /** The request key: `claims` for `GT_CLAIMS`. */
  key: string;
  /** The original's global table the rows go into. */
  global: { name: string; key: string; line: number };
  structure: { name: string; tsName: string; line: number; lineEnd: number };
  /** The CDS names: the row type (`Claim`) and the entity (`Claims`). */
  cds: { type: string; entity: string };
  columns: InputColumn[];
  /** Why it is input: demo data fills it, a SELECT reads it, or the planner read record fields from it. */
  filledBy: Array<'demo' | 'read' | 'record-fields'>;
}

export interface InputListFacts {
  statements: readonly AbapStatement[];
  blocks: Pick<BlockStructure, 'containers'>;
  graph: Pick<CallGraphReport, 'edges'>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The integer bounds of ABAP's integer types. */
const INT_MAX: Record<string, string> = { i: '2147483647', int4: '2147483647', int8: '9223372036854775807', int2: '32767', int1: '255', b: '255', s: '32767' };

function packedDigits(s: AbapScalar): { digits: number; places: number } {
  const bytes = s.length ?? 8;
  return { digits: Math.max(1, Math.min(31, 2 * bytes - 1)), places: Math.max(0, s.decimals ?? 0) };
}

function packedMax(digits: number, places: number): string {
  const whole = Math.max(0, digits - places);
  return `${whole > 0 ? '9'.repeat(whole) : '0'}${places > 0 ? `.${'9'.repeat(places)}` : ''}`;
}

/** The kind, bounds and declaration of one column, from its ABAP scalar. */
function columnType(f: ShapeField): Pick<InputColumn, 'kind' | 'digits' | 'places' | 'max' | 'length' | 'declaration'> {
  const s = f.scalar;
  if (!s) return { kind: 'text', digits: null, places: 0, max: null, length: null, declaration: f.abap };
  if (s.type === 'p') {
    const { digits, places } = packedDigits(s);
    return { kind: 'packed', digits, places, max: packedMax(digits, places), length: null, declaration: `P(${digits},${places})` };
  }
  if (INT_MAX[s.type]) return { kind: 'integer', digits: null, places: 0, max: INT_MAX[s.type], length: null, declaration: f.abap };
  if (s.type === 'n') return { kind: 'digits', digits: s.length ?? 1, places: 0, max: null, length: s.length ?? 1, declaration: f.abap };
  if (s.type === 'd') return { kind: 'date', digits: null, places: 0, max: null, length: null, declaration: f.abap };
  if (s.type === 't') return { kind: 'text', digits: null, places: 0, max: null, length: 6, declaration: f.abap };
  if (s.type === 'c') return { kind: 'text', digits: null, places: 0, max: null, length: s.length ?? 1, declaration: f.abap };
  return { kind: 'text', digits: null, places: 0, max: null, length: null, declaration: f.abap };
}

/** `'X'`, `''`: the literals the source compares a one-character component with or assigns to it. */
function valuesOf(statements: readonly AbapStatement[], component: string): string[] | null {
  const n = escapeRe(component);
  const found = new Set<string>();
  const literal = new RegExp(`[\\w>~)-]-${n}\\s*(?:=|<>|EQ|NE)\\s*('(?:[^']|'')?'|abap_true|abap_false|space)(?![\\w'])`, 'gi');
  for (const st of statements) {
    for (const m of st.text.matchAll(literal)) {
      const v = m[1];
      found.add(/^abap_true$/i.test(v) ? 'X' : /^(?:abap_false|space)$/i.test(v) ? '' : v.slice(1, -1).replace(/''/g, "'"));
    }
  }
  if (found.size === 0) return null;
  found.add('');
  return [...found].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
}

/**
 * The routines the original runs only for its demo data: its fixture routines, its demo-case routine (the case
 * switch the golden master reads, `golden-master.ts`), and the routines only those call.
 */
function demoRoutines(plan: Pick<UnitPlan, 'notCarried'>, graph: Pick<CallGraphReport, 'edges'>, caseRoutines: readonly string[]): Set<string> {
  const demo = new Set([...plan.notCarried.filter((n) => n.reason === 'fixture').map((n) => n.routine.toUpperCase()), ...caseRoutines.map((r) => r.toUpperCase())]);
  if (demo.size === 0) return demo;
  for (let changed = true; changed; ) {
    changed = false;
    const callees = new Set(graph.edges.map((e) => e.to));
    for (const r of callees) {
      if (demo.has(r)) continue;
      const callers = graph.edges.filter((e) => e.to === r);
      if (callers.length > 0 && callers.every((e) => e.from !== null && demo.has(e.from))) {
        demo.add(r);
        changed = true;
      }
    }
  }
  return demo;
}

/** Does a statement fill this table (APPEND … TO, INSERT … INTO TABLE, = VALUE, SELECT … INTO TABLE)? */
function fills(text: string, table: string): boolean {
  const n = escapeRe(table);
  return (
    new RegExp(`\\b(?:TO|INTO(?:\\s+(?:CORRESPONDING\\s+FIELDS\\s+OF\\s+)?TABLE)?|APPENDING(?:\\s+(?:CORRESPONDING\\s+FIELDS\\s+OF\\s+)?TABLE)?)\\s+@?${n}(?![\\w-])`, 'i').test(text) ||
    new RegExp(`^${n}\\s*=`, 'i').test(text)
  );
}

const reads = (text: string, table: string) =>
  /^SELECT\b/i.test(text) && new RegExp(`\\b(?:INTO|APPENDING)\\s+(?:CORRESPONDING\\s+FIELDS\\s+OF\\s+)?TABLE\\s+@?${escapeRe(table)}(?![\\w-])`, 'i').test(text);

/** The list key of a global table: `gt_claims` → `claims`. */
function listKeyOf(global: string): string {
  const stripped = global.replace(/^(?:gt|lt|it|mt|t)_/i, '');
  return camelName(stripped || global);
}

/** The CDS row type of a structure: `ty_claim` → `Claim`; the entity is its plural. */
function cdsNamesOf(structure: string): { type: string; entity: string } {
  const stripped = structure.replace(/^(?:ty|tys|ts|gty|lty|t)_/i, '');
  const type = pascalName(stripped || structure);
  const entity = /(?:s|x|z|ch|sh)$/i.test(type) ? `${type}es` : /[^aeiou]y$/i.test(type) ? `${type.slice(0, -1)}ies` : `${type}s`;
  return { type, entity };
}

/**
 * The input lists of a program — see the file comment. `reserved`: request keys already taken (the
 * selection's keys, `records`, `run`); a list whose key collides gets `Rows` appended.
 */
export function inputListsOf(
  plan: Pick<UnitPlan, 'notCarried' | 'fields'>,
  facts: InputListFacts,
  shapes: AbapShapes,
  reserved: ReadonlySet<string> = new Set(),
  caseRoutines: readonly string[] = [],
): InputList[] {
  const byTs = new Map(shapes.structures.map((s) => [s.tsName, s]));
  const demo = demoRoutines(plan, facts.graph, caseRoutines);
  const demoRanges = facts.blocks.containers.filter((c) => c.kind === 'form' && demo.has(c.name.toUpperCase()));
  const inDemo = (line: number) => demoRanges.some((c) => line >= c.lineStart && line <= c.lineEnd);
  const recordOwners = new Set<string>();
  for (const f of plan.fields) {
    if (f.where !== 'record') continue;
    const owner = shapes.structures.find((s) => f.line > s.line && f.line < s.lineEnd);
    if (owner) recordOwners.add(owner.name);
  }
  const tables = shapes.globals.flatMap((g) => {
    const s = g.ts.endsWith('[]') ? byTs.get(g.ts.slice(0, -2)) : undefined;
    return s ? [{ g, s }] : [];
  });
  const filled = new Map<string, InputList['filledBy']>();
  for (const { g } of tables) {
    const by: InputList['filledBy'] = [];
    if (facts.statements.some((st) => inDemo(st.lineStart) && fills(st.text, g.name))) by.push('demo');
    if (facts.statements.some((st) => reads(st.text, g.name))) by.push('read');
    filled.set(g.name, by);
  }
  // A structure the planner read record fields from, with no table filled from outside: its first table.
  for (const owner of recordOwners) {
    const of = tables.filter((t) => t.s.name === owner);
    if (of.length > 0 && !of.some((t) => (filled.get(t.g.name) ?? []).length > 0)) filled.get(of[0].g.name)!.push('record-fields');
  }
  const taken = new Set(reserved);
  // One CDS type and entity per structure, however many input tables share it.
  const cdsOf = new Map<string, { type: string; entity: string }>();
  const cdsTaken = new Set<string>();
  const lists: InputList[] = [];
  for (const { g, s } of tables) {
    const filledBy = filled.get(g.name) ?? [];
    if (filledBy.length === 0) continue;
    let key = listKeyOf(g.name);
    if (taken.has(key)) key = `${key}Rows`;
    for (let i = 2; taken.has(key); i++) key = `${listKeyOf(g.name)}Rows${i}`;
    taken.add(key);
    let cds = cdsOf.get(s.name);
    if (!cds) {
      cds = cdsNamesOf(s.name);
      for (let i = 2; cdsTaken.has(cds.type) || cdsTaken.has(cds.entity); i++) cds = { type: `${cdsNamesOf(s.name).type}${i}`, entity: `${cdsNamesOf(s.name).entity}${i}` };
      cdsTaken.add(cds.type);
      cdsTaken.add(cds.entity);
      cdsOf.set(s.name, cds);
    }
    lists.push({
      key,
      global: { name: g.name, key: g.key, line: g.line },
      structure: { name: s.name, tsName: s.tsName, line: s.line, lineEnd: s.lineEnd },
      cds,
      columns: columnsOf(s, plan.fields, facts.statements),
      filledBy,
    });
  }
  return lists;
}

function columnsOf(s: ShapeStructure, fields: readonly ContractField[], statements: readonly AbapStatement[]): InputColumn[] {
  return s.fields.map((f) => {
    const t = columnType(f);
    const planned = fields.find((x) => x.where === 'record' && x.line === f.line);
    const oneChar = t.kind === 'text' && t.length === 1;
    return {
      name: f.name,
      key: f.key,
      line: f.line,
      abap: f.abap,
      ...t,
      obligatory: planned?.obligatory ?? false,
      values: oneChar ? valuesOf(statements, f.name) : null,
      init: f.init,
      scalar: f.scalar,
    };
  });
}

/** The list a structure component (by its line) belongs to, or null. */
export function listOfLine(lists: readonly InputList[], line: number): InputList | null {
  return lists.find((l) => line > l.structure.line && line < l.structure.lineEnd) ?? null;
}

/** The list of a request path (`claims[].price` → `claims`; `records[].x` → `records`), or null for a scalar path. */
export function listOfPath(path: string | null): string | null {
  if (!path) return null;
  const at = path.indexOf('[]');
  return at > 0 ? path.slice(0, at) : null;
}

/**
 * The plan as the Node package sees it: a record field whose structure has an input list moves from the one
 * record list (`records[].price`) into its own list (`claims[].price`). Every other field is unchanged, so a
 * program without input tables keeps the request it had.
 */
export function withListPaths<P extends Pick<UnitPlan, 'fields'>>(plan: P, lists: readonly InputList[]): P {
  if (lists.length === 0) return plan;
  return {
    ...plan,
    fields: plan.fields.map((f) => {
      if (f.where !== 'record') return f;
      const list = listOfLine(lists, f.line);
      return list ? { ...f, path: `${list.key}[].${f.key}` } : f;
    }),
  };
}

/** The work areas a program reads the rows of an input table into (`LOOP AT gt_raw INTO ls_raw`), per list. */
export function workAreasOf(statements: readonly AbapStatement[], lists: readonly InputList[]): Map<string, InputList> {
  const out = new Map<string, InputList>();
  for (const l of lists) {
    const t = escapeRe(l.global.name);
    const re = new RegExp(`^(?:LOOP\\s+AT|READ\\s+TABLE)\\s+${t}\\b[\\s\\S]*?\\bINTO\\s+(?:DATA\\(\\s*)?([\\w]+)`, 'i');
    for (const st of statements) {
      const m = re.exec(st.text);
      if (m) out.set(m[1].toUpperCase(), l);
    }
  }
  return out;
}

/**
 * The typed contract of the RAP logic class (roadmap 3.0.13 item 2, "a typed
 * contract before any fill"), read from the original's declarations before
 * any body is written.
 *
 * What the 3.0.12 scaffold wrote, and the two external reviews of the SD
 * example found (14.10.2026): every method `(is_sel, CHANGING cs_st)`, a
 * selection structure whose components were renamed (`eff` for `P_EFF`), the
 * program's globals nowhere — so a faithful port of a FORM (`gt_claims`,
 * `p_org`, `check_stamp( iv_stamp … )`) could not compile, and each call site
 * invented its own signature. The contract here is one consistent choice:
 *
 *   - **the original's global TYPES** are the class's public types, as
 *     declared (packed stays packed with its places, `i` stays an integer,
 *     dates `d`, flags `c LENGTH 1`), normalised to ABAP Cloud syntax
 *     (`x(10) TYPE c` → `TYPE c LENGTH 10`, `OCCURS` → a standard table,
 *     `LIKE` resolved to the type it names);
 *   - **the original's globals and selection inputs are instance attributes
 *     under their original names** (`gt_claims`, `gv_status`, `p_org`,
 *     `s_show`), its constants class constants — so a FORM body ports as it
 *     reads; the selection also travels as a structure (`ty_run_selection`)
 *     whose components keep the same names;
 *   - **every routine's signature comes from its FORM interface**: USING →
 *     IMPORTING (CHANGING when the routine writes the parameter), CHANGING →
 *     CHANGING, TABLES → CHANGING of a table type, each with the declared
 *     type; a type a method parameter cannot carry inline (`TYPE c LENGTH 10`,
 *     `TABLE OF …`) becomes a named type of the class;
 *   - **a symbol table per routine** (its parameters, its DATA, the globals),
 *     which the guard predicates and the access layer read to type what they
 *     take.
 *
 * Pure: statements in, declarations out. No network, no model.
 */

import { containerAt, type Container } from '../abap/block-structure';
import type { AbapStatement } from '../abap/statement-reader';
import type { EngineFacts } from './unit-plan';

/** A declaration as the class writes it: `name TYPE …` (the phrase starts with TYPE or LIKE). */
export interface AbapDecl {
  name: string;
  /** `TYPE ty_i`, `TYPE STANDARD TABLE OF ty_policy WITH DEFAULT KEY`, `TYPE c LENGTH 10`. */
  phrase: string;
  line: number;
}

export interface SelectionField extends AbapDecl {
  kind: 'parameter' | 'range';
  /** The type name a range is of (`ty_cid`), for its line type. */
  rangeOf: string | null;
}

export interface RapParam {
  name: string;
  direction: 'importing' | 'changing';
  /** A phrase a METHODS parameter can carry: `TYPE ty_stamp`, `TYPE c`, `TYPE STANDARD TABLE`, `TYPE any`. */
  phrase: string;
  /** The FORM's own words, for the prompt: `USING iv_stamp TYPE ty_stamp`. */
  original: string;
}

export interface RoutineScope {
  /** Lower-case name → its declaration phrase, the routine's parameters and DATA first. */
  locals: Map<string, string>;
  /** Types the routine declares itself (not visible in the class). */
  localTypes: Set<string>;
  params: RapParam[];
}

export interface RapContract {
  /** Statements of the class's public TYPES, in order (without the period). */
  types: string[];
  /** CONSTANTS statements (without the period). */
  constants: string[];
  /** Names of the constants. */
  constantNames: Set<string>;
  /** The original's global data objects, as attributes. */
  globals: AbapDecl[];
  /** Selection inputs, as attributes and as components of the run's selection. */
  selection: SelectionField[];
  /** What could not be carried as a declaration (an obsolete or dialog-only statement), with its line. */
  skipped: Array<{ line: number; text: string }>;
  /** Every type name the class declares (lower case). */
  typeNames: Set<string>;
  /** Named types the contract added for method parameters, `TYPES name TYPE …` (without the period). */
  namedTypes: string[];
  /** Lower-case name of a global or selection input → its phrase. */
  globalScope: Map<string, string>;
  /**
   * The customer tables (`Z*`, `Y*`) the original writes or types data by, whose dictionary definition the package
   * does not ship (acceptance run 4, 14.10.2026, PO: `DATA ls_appr TYPE zmm_po_appr` did not activate). Each is a
   * structure type of the class under the table's own name, built from the fields the original uses; the access
   * layer's write method takes a row of it. Empty when there is none.
   */
  customerTables: CustomerTable[];
  /** The scope of a routine (upper-case FORM or METHOD name). */
  scopeOf(routine: string): RoutineScope;
  /** A phrase a METHODS parameter can carry for this declaration phrase, naming a type when it must (hint: the parameter). */
  paramPhrase(phrase: string | null, hint: string, generic?: 'table' | 'any'): string;
  /** A declaration phrase with LIKE resolved in this scope, or null when it cannot be. */
  resolve(phrase: string, scope?: ReadonlyMap<string, string>): string | null;
}

export interface CustomerTable {
  /** The table's name, lower case — also the name of the structure type the class declares. */
  name: string;
  /** The fields the original uses, typed by what it assigns them or is assigned from (`TYPE string` when unknown). */
  components: Array<{ name: string; phrase: string }>;
}

const PROCEDURE = new Set<Container['kind']>(['form', 'method', 'module', 'function']);

/** Statement keywords that declare nothing ABAP Cloud has: skipped with a note. */
const NOT_CARRIED = /^(?:TABLES|NODES|FIELD-GROUPS|TYPE-POOLS|TYPE-POOL|INFOTYPES|CONTROLS|LOCAL|DEFINE|END-OF-DEFINITION)$/i;

/** `name(10) TYPE c VALUE 'x' READ-ONLY` → name, length, the phrase, the VALUE clause. */
function splitDecl(rest: string): { name: string; length: string | null; phrase: string; value: string | null; headerLine: boolean } | null {
  const m = /^(<?[\w/]+>?)(?:\((\d+)\))?\s*([\s\S]*)$/.exec(rest.trim());
  if (!m) return null;
  let tail = m[3].trim();
  const headerLine = /\bWITH\s+HEADER\s+LINE\b/i.test(tail);
  tail = tail.replace(/\s*\bWITH\s+HEADER\s+LINE\b/i, '').replace(/\s*\bREAD-ONLY\b/i, '');
  let value: string | null = null;
  const v = /\s*\bVALUE\s+([\s\S]+)$/i.exec(tail);
  if (v) {
    value = v[1].trim();
    tail = tail.slice(0, v.index).trim();
  }
  tail = tail.replace(/\s*\bIS\s+INITIAL\b/i, '').trim();
  return { name: m[1], length: m[2] ?? null, phrase: tail, value, headerLine };
}

/** A declaration's tail normalised to ABAP Cloud: lengths into LENGTH, OCCURS into a standard table, a missing type into `c`. */
export function normalisePhrase(tail: string, length: string | null): string {
  let t = tail.replace(/\s+/g, ' ').trim();
  if (!t) return `TYPE c LENGTH ${length ?? '1'}`;
  t = t.replace(/^STRUCTURE\s+/i, 'TYPE ');
  const occurs = /^(TYPE|LIKE)\s+(?:LINE\s+OF\s+)?([\w/-]+)\s+OCCURS\s+\d+$/i.exec(t);
  if (occurs) return `${occurs[1].toUpperCase()} STANDARD TABLE OF ${occurs[2]} WITH DEFAULT KEY`;
  if (/^OCCURS\s+\d+$/i.test(t)) return `TYPE STANDARD TABLE OF c WITH DEFAULT KEY`;
  // A packed type in a class needs its DECIMALS (abaplint: "Specify DECIMALS in OO context").
  const packed = /^TYPE\s+p\s+LENGTH\s+(\d+)$/i.exec(t);
  if (packed) return `TYPE p LENGTH ${packed[1]} DECIMALS 0`;
  const elementary = /^TYPE\s+([cnxp])(?:\s+(DECIMALS\s+\d+))?$/i.exec(t);
  if (elementary) {
    const k = elementary[1].toLowerCase();
    if (k === 'p') return `TYPE p LENGTH ${length ?? '8'} ${elementary[2] ? elementary[2].toUpperCase() : 'DECIMALS 0'}`;
    return length ? `TYPE ${k} LENGTH ${length}` : `TYPE ${k}`;
  }
  // `TYPE TABLE OF x` and `TYPE STANDARD TABLE OF x` without a key: the original's default key.
  const table = /^TYPE\s+(?:STANDARD\s+)?TABLE\s+OF\s+(?:REF\s+TO\s+)?[\w/-]+$/i.exec(t);
  if (table) return `${t.replace(/^TYPE\s+(?:STANDARD\s+)?TABLE/i, 'TYPE STANDARD TABLE')} WITH DEFAULT KEY`;
  return t;
}

/** The type name of a simple phrase (`TYPE ty_x` → `ty_x`), else null. */
export function simpleTypeName(phrase: string): string | null {
  const m = /^TYPE\s+([\w/]+(?:-[\w/]+)*)$/i.exec(phrase.trim());
  return m ? m[1] : null;
}

/** The line type of a table phrase (`TYPE STANDARD TABLE OF ty_x WITH …` → `ty_x`), else null. */
export function tableLineOf(phrase: string): string | null {
  const m = /^TYPE\s+(?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+([\w/]+(?:-[\w/]+)*)/i.exec(phrase.trim());
  return m ? m[1] : null;
}

/** METHODS parameters accept a type name, a generic type or REF TO — anything longer needs a named type. */
function carriesInline(phrase: string): boolean {
  return /^TYPE\s+(?:REF\s+TO\s+)?[\w/]+(?:-[\w/]+)*$/i.test(phrase) || /^TYPE\s+(?:STANDARD\s+|SORTED\s+|HASHED\s+|INDEX\s+|ANY\s+)?TABLE$/i.test(phrase);
}

const PHRASE = /^(?:(TYPE|LIKE)\s+(REF\s+TO\s+[\w/<>-]+|(?:STANDARD\s+|SORTED\s+|HASHED\s+|INDEX\s+|ANY\s+)?TABLE(?:\s+OF\s+(?:REF\s+TO\s+)?[\w/-]+)?(?:\s+WITH\s+(?:NON-UNIQUE\s+|UNIQUE\s+)?(?:DEFAULT\s+KEY|EMPTY\s+KEY|KEY\s+[\w-]+(?:\s+[\w-]+)*?))?|LINE\s+OF\s+[\w/-]+|RANGE\s+OF\s+[\w/-]+|[\w/-]+)|STRUCTURE\s+([\w/-]+))(?=\s|$)/i;

/** The parameters of a FORM statement, in order. */
export function formParameters(text: string): Array<{ name: string; section: 'tables' | 'using' | 'changing'; phrase: string | null; byValue: boolean; original: string }> {
  const rest = text.replace(/^FORM\s+[\w/-]+\s*/i, '');
  const out: Array<{ name: string; section: 'tables' | 'using' | 'changing'; phrase: string | null; byValue: boolean; original: string }> = [];
  type Section = 'tables' | 'using' | 'changing' | 'raising';
  let section = null as Section | null;
  let s = rest.trim();
  for (let guard = 0; s && guard < 400; guard++) {
    const sec = /^(TABLES|USING|CHANGING|RAISING)\b\s*/i.exec(s);
    if (sec) {
      section = sec[1].toLowerCase() as Section;
      s = s.slice(sec[0].length);
      continue;
    }
    const p = /^(?:VALUE\(\s*([\w/]+)\s*\)|([\w/]+))\s*/i.exec(s);
    if (!p) break;
    s = s.slice(p[0].length);
    if (section === 'raising' || section === null) continue;
    const name = (p[1] ?? p[2]).toLowerCase();
    const ph = PHRASE.exec(s);
    let phrase: string | null = null;
    if (ph) {
      phrase = ph[3] ? `TYPE ${ph[3]}` : `${ph[1].toUpperCase()} ${ph[2]}`;
      s = s.slice(ph[0].length).trim();
    }
    out.push({ name, section, phrase, byValue: Boolean(p[1]), original: `${section.toUpperCase()} ${p[1] ? `VALUE(${name})` : name}${phrase ? ` ${phrase}` : ''}` });
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/<>]/g, '\\$&');

/**
 * SAP dictionary structures ABAP Cloud does not have, which an original includes into a structure of its own
 * (`DATA: BEGIN OF gt_bdcdata OCCURS 0. INCLUDE STRUCTURE bdcdata. DATA: END OF gt_bdcdata.`): their components,
 * with SAP's names and lengths, so the batch input the original builds stays a typed structure of the class
 * (acceptance run 14.10.2026, SD order cockpit: `ty_bdcdata` was declared with no components and the class did
 * not compile). The component list is SAP's dictionary definition; nothing is invented.
 */
export const SAP_STRUCTURE_EQUIVALENTS: Readonly<Record<string, ReadonlyArray<{ name: string; phrase: string }>>> = {
  bdcdata: [
    { name: 'program', phrase: 'TYPE c LENGTH 40' },
    { name: 'dynpro', phrase: 'TYPE n LENGTH 4' },
    { name: 'dynbegin', phrase: 'TYPE c LENGTH 1' },
    { name: 'fnam', phrase: 'TYPE c LENGTH 132' },
    { name: 'fval', phrase: 'TYPE c LENGTH 132' },
  ],
  bdcmsgcoll: [
    { name: 'tcode', phrase: 'TYPE c LENGTH 20' },
    { name: 'dyname', phrase: 'TYPE c LENGTH 40' },
    { name: 'dynumb', phrase: 'TYPE c LENGTH 4' },
    { name: 'msgtyp', phrase: 'TYPE c LENGTH 1' },
    { name: 'msgspra', phrase: 'TYPE c LENGTH 1' },
    { name: 'msgid', phrase: 'TYPE c LENGTH 20' },
    { name: 'msgnr', phrase: 'TYPE c LENGTH 3' },
    { name: 'msgv1', phrase: 'TYPE c LENGTH 100' },
    { name: 'msgv2', phrase: 'TYPE c LENGTH 100' },
    { name: 'msgv3', phrase: 'TYPE c LENGTH 100' },
    { name: 'msgv4', phrase: 'TYPE c LENGTH 100' },
    { name: 'env', phrase: 'TYPE c LENGTH 4' },
    { name: 'fldname', phrase: 'TYPE c LENGTH 132' },
  ],
};

/**
 * The TYPES statements of `INCLUDE STRUCTURE x` inside a structure: a structure the program declares itself is
 * included by name; an SAP structure ABAP Cloud lacks is spelled out (`SAP_STRUCTURE_EQUIVALENTS`); any other
 * dictionary structure is included by name, for the developer's system to resolve.
 */
function includedComponents(structure: string, declared: ReadonlySet<string>): string[] {
  const name = structure.toLowerCase();
  const sap = declared.has(name) ? undefined : SAP_STRUCTURE_EQUIVALENTS[name];
  return sap ? sap.map((c) => `TYPES ${c.name} ${c.phrase}`) : [`TYPES INCLUDE TYPE ${name}`];
}

/** Whether a routine's statements write to a data object (an assignment, CLEAR, APPEND … TO, …) — a USING parameter so written becomes CHANGING. */
function writesTo(statements: readonly AbapStatement[], name: string): boolean {
  const n = escapeRe(name);
  const target = new RegExp(`^${n}(?:-[\\w/]+)*(?:\\+\\d+)?(?:\\(\\d+\\))?\\s*(?:[-+*/]|&&)?=(?!=)`, 'i');
  const first = new RegExp(`^(?:CLEAR|REFRESH|FREE|SORT|CONDENSE|TRANSLATE|SHIFT|MULTIPLY|DIVIDE|MODIFY|DELETE(?:\\s+ADJACENT\\s+DUPLICATES\\s+FROM|\\s+TABLE)?|OVERLAY|UNPACK)\\s+${n}(?![\\w-])`, 'i');
  const into = new RegExp(`\\b(?:TO|INTO(?:\\s+TABLE)?|FROM)\\s+${n}(?![\\w-])`, 'i');
  const inside = new RegExp(`^REPLACE\\b[\\s\\S]*\\bIN\\s+${n}(?![\\w-])`, 'i');
  for (const st of statements) {
    const t = st.text;
    if (target.test(t) || first.test(t) || inside.test(t)) return true;
    if (/^(?:APPEND|INSERT|COLLECT|MOVE|MOVE-CORRESPONDING|CONCATENATE|SPLIT|WRITE|ADD|UNPACK|SELECT|READ)\b/i.test(t) && into.test(t)) {
      // SUBTRACT x FROM y writes y; SELECT … FROM tab reads tab.
      if (/^SELECT\b/i.test(t) && !new RegExp(`\\bINTO\\s+(?:TABLE\\s+|CORRESPONDING\\s+FIELDS\\s+OF\\s+(?:TABLE\\s+)?)?@?${n}(?![\\w-])`, 'i').test(t)) continue;
      if (/^READ\b/i.test(t) && !new RegExp(`\\bINTO\\s+${n}(?![\\w-])`, 'i').test(t)) continue;
      return true;
    }
    if (/^SUBTRACT\b/i.test(t) && new RegExp(`\\bFROM\\s+${n}(?![\\w-])`, 'i').test(t)) return true;
  }
  return false;
}

/** The contract of a program — see the file comment. */
export function readRapContract(facts: Pick<EngineFacts, 'statements' | 'blocks' | 'graph'>, reserved: ReadonlySet<string> = new Set()): RapContract {
  const { statements, blocks } = facts;
  const containers = blocks.containers;
  const types: string[] = [];
  const constants: string[] = [];
  const constantNames = new Set<string>();
  const globals: AbapDecl[] = [];
  const selection: SelectionField[] = [];
  const skipped: RapContract['skipped'] = [];
  const typeNames = new Set<string>();
  const typeDefs = new Map<string, string>();
  const globalScope = new Map<string, string>();
  const namedTypes: string[] = [];
  const namedByPhrase = new Map<string, string>();
  const usedNames = new Set<string>([...reserved].map((r) => r.toLowerCase()));

  const isGlobal = (line: number) => {
    const c = containerAt(containers as Container[], line);
    return !c || !(PROCEDURE.has(c.kind) || c.kind === 'class');
  };

  const resolveIn = (phrase: string, scope: ReadonlyMap<string, string> | null, depth = 0): string | null => {
    const p = phrase.trim();
    if (!/^LIKE\b/i.test(p)) return p;
    if (depth > 6) return null;
    const lookup = (name: string) => scope?.get(name.toLowerCase()) ?? globalScope.get(name.toLowerCase()) ?? null;
    const lineOf = /^LIKE\s+LINE\s+OF\s+([\w/<>]+)$/i.exec(p);
    if (lineOf) {
      const of = lookup(lineOf[1]);
      const r = of ? resolveIn(of, scope, depth + 1) : null;
      if (!r) return null;
      const line = tableLineOf(r);
      if (line) return `TYPE ${line}`;
      const named = simpleTypeName(r);
      if (!named) return null;
      // A table type the program declares: its line type by name (`ty_rcv_tab` → `ty_rcv`).
      const def = typeDefs.get(named.toLowerCase());
      const ownLine = def ? tableLineOf(def) : null;
      return ownLine ? `TYPE ${ownLine}` : `TYPE LINE OF ${named}`;
    }
    const tableOf = /^LIKE\s+(?:STANDARD\s+)?TABLE\s+OF\s+([\w/<>]+)(.*)$/i.exec(p);
    if (tableOf) {
      const of = lookup(tableOf[1]);
      const r = of ? resolveIn(of, scope, depth + 1) : null;
      const named = r ? simpleTypeName(r) : null;
      return named ? `TYPE STANDARD TABLE OF ${named}${tableOf[2] || ' WITH DEFAULT KEY'}` : null;
    }
    const like = /^LIKE\s+([\w/<>]+)((?:-[\w/]+)*)$/i.exec(p);
    if (!like) return null;
    const own = lookup(like[1]);
    if (!own) {
      // A name the program does not declare: a DDIC structure or field (`LIKE vbak-vbeln`, `LIKE sy-tabix`).
      return /^</.test(like[1]) ? null : `TYPE ${like[1]}${like[2]}`;
    }
    const r = resolveIn(own, scope, depth + 1);
    if (!r) return null;
    if (!like[2]) return r;
    const named = simpleTypeName(r);
    return named ? `TYPE ${named}${like[2]}` : null;
  };

  // ---- global declarations, in source order
  const structStack: Array<{ kind: 'TYPES' | 'DATA' | 'CONSTANTS'; name: string; typeName: string; occurs: boolean; nested?: boolean }> = [];
  for (const st of statements) {
    if (st.nativeSql || !isGlobal(st.lineStart)) continue;
    const kw = st.keyword;
    if (NOT_CARRIED.test(kw)) {
      if (kw !== 'TYPE-POOLS' && kw !== 'TYPE-POOL') skipped.push({ line: st.lineStart, text: st.text.slice(0, 80) });
      continue;
    }
    // `INCLUDE STRUCTURE bdcdata.` between `DATA: BEGIN OF … END OF` is a statement of its own (keyword INCLUDE):
    // read before the keyword filter, or the structure ends up with no components (acceptance run 14.10.2026, SD).
    if (kw === 'INCLUDE' && structStack.length > 0) {
      const inc = /^INCLUDE\s+(?:STRUCTURE|TYPE)\s+([\w/]+)/i.exec(st.text);
      const s = structStack[structStack.length - 1];
      if (inc && s.kind !== 'CONSTANTS') types.push(...includedComponents(inc[1], typeNames));
      continue;
    }
    if (kw !== 'TYPES' && kw !== 'DATA' && kw !== 'CONSTANTS' && kw !== 'CLASS-DATA' && kw !== 'STATICS' && kw !== 'RANGES' && kw !== 'PARAMETERS' && kw !== 'PARAMETER' && kw !== 'SELECT-OPTIONS') continue;
    const rest = st.text.slice(kw.length).replace(/^\s*:?\s*/, '');
    if (kw === 'PARAMETERS' || kw === 'PARAMETER') {
      const m = /^([\w/]+)(?:\((\d+)\))?\s*([\s\S]*)$/.exec(rest);
      if (!m) continue;
      const name = m[1].toLowerCase();
      let tail = m[3];
      let phrase: string;
      if (/\bAS\s+CHECKBOX\b|\bRADIOBUTTON\s+GROUP\b/i.test(tail)) phrase = 'TYPE c LENGTH 1';
      else {
        const t = /\b(TYPE|LIKE)\s+([\w/]+(?:-[\w/]+)*)/i.exec(tail);
        const lengthClause = /\bLENGTH\s+(\d+)/i.exec(tail);
        const decimals = /\bDECIMALS\s+(\d+)/i.exec(tail);
        const typed = t ? `${t[1].toUpperCase()} ${t[2]}${decimals ? ` DECIMALS ${decimals[1]}` : ''}` : '';
        phrase = normalisePhrase(typed, lengthClause?.[1] ?? m[2] ?? (typed ? null : '8'));
        phrase = resolveIn(phrase, null) ?? 'TYPE string';
      }
      selection.push({ name, phrase, line: st.lineStart, kind: 'parameter', rangeOf: null });
      globalScope.set(name, phrase);
      continue;
    }
    if (kw === 'SELECT-OPTIONS' || kw === 'RANGES') {
      const m = /^([\w/]+)\s+FOR\s+([\w/]+(?:-[\w/]+)*)/i.exec(rest);
      if (!m) continue;
      const name = m[1].toLowerCase();
      const of = globalScope.get(m[2].toLowerCase());
      // `FOR gt_orders-kunnr`: a component of a global's row is a type of the row's structure (`ty_order-kunnr`).
      const [holder, ...component] = m[2].toLowerCase().split('-');
      const held = component.length > 0 ? globalScope.get(holder) : undefined;
      const heldType = held ? tableLineOf(held) ?? simpleTypeName(held) : null;
      const heldLine = heldType ? tableLineOf(typeDefs.get(heldType) ?? '') ?? heldType : null;
      const named = of
        ? simpleTypeName(of)
        : heldLine
          ? `${heldLine}-${component.join('-')}`
          : m[2].includes('-') || !globalScope.has(m[2].toLowerCase())
            ? m[2].toLowerCase()
            : null;
      const rangeOf = named ?? 'string';
      const phrase = `TYPE RANGE OF ${rangeOf}`;
      if (kw === 'SELECT-OPTIONS') selection.push({ name, phrase, line: st.lineStart, kind: 'range', rangeOf });
      else globals.push({ name, phrase, line: st.lineStart });
      globalScope.set(name, phrase);
      continue;
    }
    const begin = /^BEGIN\s+OF\s+([\w/]+)([\s\S]*)$/i.exec(rest);
    if (begin) {
      const name = begin[1].toLowerCase();
      const occurs = /\bOCCURS\b/i.test(begin[2]);
      const k = kw === 'TYPES' ? 'TYPES' : kw === 'CONSTANTS' ? 'CONSTANTS' : 'DATA';
      if (structStack.length > 0) {
        // A substructure: a component of the enclosing structure, not a type of its own.
        const outer = structStack[structStack.length - 1];
        if (outer.kind === 'CONSTANTS') constants.push(`CONSTANTS BEGIN OF ${name}`);
        else types.push(`TYPES BEGIN OF ${name}`);
        structStack.push({ kind: outer.kind, name, typeName: name, occurs: false, nested: true });
        continue;
      }
      // A DATA structure becomes a type of the class and an attribute of that type.
      let typeName = name;
      if (k === 'DATA') {
        typeName = `ty_${name.replace(/^(?:gs_|gt_|ls_|lt_|wa_|it_|s_|t_)/, '')}`.slice(0, 30);
        for (let i = 2; typeNames.has(typeName); i++) typeName = `${typeName.slice(0, 27)}_${i}`;
      }
      if (k === 'CONSTANTS') constants.push(`CONSTANTS BEGIN OF ${name}`);
      else {
        types.push(`TYPES BEGIN OF ${typeName}`);
        typeNames.add(typeName);
      }
      structStack.push({ kind: k, name, typeName, occurs });
      continue;
    }
    const end = /^END\s+OF\s+([\w/]+)/i.exec(rest);
    if (end && structStack.length > 0) {
      const s = structStack.pop()!;
      if (s.nested) {
        if (s.kind === 'CONSTANTS') constants.push(`CONSTANTS END OF ${s.name}`);
        else types.push(`TYPES END OF ${s.name}`);
        continue;
      }
      if (s.kind === 'CONSTANTS') {
        constants.push(`CONSTANTS END OF ${s.name}`);
        constantNames.add(s.name);
        continue;
      }
      types.push(`TYPES END OF ${s.typeName}`);
      typeDefs.set(s.typeName, 'STRUCTURE');
      if (s.kind === 'DATA') {
        const phrase = s.occurs ? `TYPE STANDARD TABLE OF ${s.typeName} WITH DEFAULT KEY` : `TYPE ${s.typeName}`;
        globals.push({ name: s.name, phrase, line: st.lineStart });
        globalScope.set(s.name, phrase);
      }
      continue;
    }
    const inc = /^INCLUDE\s+(?:STRUCTURE|TYPE)\s+([\w/]+)/i.exec(rest);
    if (inc && structStack.length > 0) {
      const s = structStack[structStack.length - 1];
      if (s.kind !== 'CONSTANTS') types.push(...includedComponents(inc[1], typeNames));
      continue;
    }
    const d = splitDecl(rest);
    if (!d) continue;
    const name = d.name.toLowerCase();
    let phrase = normalisePhrase(d.phrase, d.length);
    if (d.headerLine && !/TABLE\s+OF/i.test(phrase)) {
      const n = simpleTypeName(phrase);
      if (n) phrase = `TYPE STANDARD TABLE OF ${n} WITH DEFAULT KEY`;
    }
    const resolved = resolveIn(phrase, null);
    if (!resolved) {
      skipped.push({ line: st.lineStart, text: st.text.slice(0, 80) });
      continue;
    }
    if (structStack.length > 0) {
      const s = structStack[structStack.length - 1];
      if (s.kind === 'CONSTANTS') constants.push(`CONSTANTS ${name} ${resolved}${d.value ? ` VALUE ${d.value}` : ''}`);
      else types.push(`TYPES ${name} ${resolved}`);
      continue;
    }
    if (kw === 'TYPES') {
      types.push(`TYPES ${name} ${resolved}`);
      typeNames.add(name);
      typeDefs.set(name, resolved);
    } else if (kw === 'CONSTANTS') {
      constants.push(`CONSTANTS ${name} ${resolved}${d.value ? ` VALUE ${d.value}` : ''}`);
      constantNames.add(name);
      globalScope.set(name, resolved);
    } else {
      globals.push({ name, phrase: resolved, line: st.lineStart });
      globalScope.set(name, resolved);
    }
  }
  for (const n of [...typeNames, ...globals.map((g) => g.name), ...selection.map((s) => s.name), ...constantNames]) usedNames.add(n.toLowerCase());

  const paramPhrase: RapContract['paramPhrase'] = (phrase, hint, generic = 'any') => {
    if (!phrase) return generic === 'table' ? 'TYPE STANDARD TABLE' : 'TYPE any';
    const p = phrase.trim();
    if (carriesInline(p)) return p;
    const existing = namedByPhrase.get(p.toLowerCase());
    if (existing) return `TYPE ${existing}`;
    const base = `ty_${hint.toLowerCase().replace(/^(?:[iecr][vstro]_|l[vstro]_|g[vstro]_|p_|s_)/, '').replace(/[^a-z0-9_]/g, '_')}`.slice(0, 26) || 'ty_value';
    let name = base;
    for (let i = 2; usedNames.has(name); i++) name = `${base.slice(0, 26)}_${i}`;
    usedNames.add(name);
    typeNames.add(name);
    namedByPhrase.set(p.toLowerCase(), name);
    namedTypes.push(`TYPES ${name} ${p.replace(/^TYPE\s+/i, 'TYPE ')}`);
    return `TYPE ${name}`;
  };

  // ---- routine scopes
  const scopes = new Map<string, RoutineScope>();
  const scopeOf = (routine: string): RoutineScope => {
    const key = routine.toUpperCase();
    const hit = scopes.get(key);
    if (hit) return hit;
    const container = containers.find((c) => (c.kind === 'form' || c.kind === 'method') && c.name === key);
    const locals = new Map<string, string>();
    const localTypes = new Set<string>();
    const params: RapParam[] = [];
    if (!container) {
      const empty = { locals, localTypes, params };
      scopes.set(key, empty);
      return empty;
    }
    const own = statements.filter((s) => s.lineStart >= container.lineStart && s.lineStart <= container.lineEnd && !s.nativeSql);
    const head = own.find((s) => s.lineStart === container.lineStart && /^(?:FORM|METHOD)$/i.test(s.keyword));
    if (head && container.kind === 'form') {
      const body = own.filter((s) => s !== head);
      for (const p of formParameters(head.text)) {
        const declared = p.phrase ? normalisePhrase(p.phrase, null) : null;
        const resolved = declared ? resolveIn(declared, null) : null;
        locals.set(p.name, resolved ?? (p.section === 'tables' ? 'TYPE STANDARD TABLE' : 'TYPE any'));
        let typed: string;
        if (p.section === 'tables') {
          const line = resolved && (simpleTypeName(resolved) ?? null);
          // TABLES p STRUCTURE s / TYPE s: a table of s, unless s already is a table type.
          const isTable = line && typeDefs.get(line.toLowerCase())?.match(/TABLE\s+OF/i);
          typed = !resolved ? 'TYPE STANDARD TABLE' : isTable ? resolved : line ? paramPhrase(`TYPE STANDARD TABLE OF ${line} WITH DEFAULT KEY`, p.name) : paramPhrase(resolved, p.name, 'table');
          if (!isTable && line) locals.set(p.name, `TYPE STANDARD TABLE OF ${line} WITH DEFAULT KEY`);
        } else typed = paramPhrase(resolved, p.name);
        const direction: RapParam['direction'] = p.section === 'using' && !writesTo(body, p.name) ? 'importing' : 'changing';
        params.push({ name: p.name, direction, phrase: typed, original: p.original });
      }
    }
    for (const s of own) {
      // Inline declarations of a work area or field symbol: a row of the table read (`LOOP AT t INTO DATA(ls)`).
      const inline = /^(?:LOOP\s+AT|READ\s+TABLE)\s+([\w/]+)(?:\[\])?\b[\s\S]*?\b(?:INTO\s+DATA|ASSIGNING\s+FIELD-SYMBOL)\(\s*(<?[\w/]+>?)\s*\)/i.exec(s.text);
      if (inline && !locals.has(inline[2].toLowerCase())) {
        const r = resolveIn(`LIKE LINE OF ${inline[1]}`, locals);
        locals.set(inline[2].toLowerCase(), r ?? '');
      }
      if (s.keyword === 'TYPES') {
        const m = /^TYPES\s*:?\s*(?:BEGIN\s+OF\s+)?([\w/]+)/i.exec(s.text);
        if (m && !/^TYPES\s*:?\s*END\s+OF/i.test(s.text)) localTypes.add(m[1].toLowerCase());
        continue;
      }
      if (s.keyword !== 'DATA' && s.keyword !== 'STATICS' && s.keyword !== 'FIELD-SYMBOLS' && s.keyword !== 'CONSTANTS') continue;
      const rest = s.text.slice(s.keyword.length).replace(/^\s*:?\s*/, '');
      if (/^(?:BEGIN|END)\s+OF\b/i.test(rest)) continue;
      const d = splitDecl(rest);
      if (!d) continue;
      const phrase = normalisePhrase(d.phrase, d.length);
      const r = resolveIn(phrase, locals);
      const usesLocalType = [...localTypes].some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(phrase));
      if (r && !usesLocalType) locals.set(d.name.toLowerCase(), r);
      else locals.set(d.name.toLowerCase(), '');
    }
    const scope = { locals, localTypes, params };
    scopes.set(key, scope);
    return scope;
  };

  // ---- customer tables the package does not ship (acceptance run 4): a structure of the class under their name
  const customerTables = customerTablesOf(facts, typeNames, globalScope, scopeOf, (phrase, scope) => resolveIn(phrase, scope)).filter(
    // A class's types and attributes share one namespace: a table named like a global of the original stays out.
    (t) => !usedNames.has(t.name),
  );
  for (const t of customerTables) {
    if (t.components.length > 0) types.push(`TYPES BEGIN OF ${t.name}`, ...t.components.map((c) => `TYPES ${c.name} ${c.phrase}`), `TYPES END OF ${t.name}`);
    else types.push(`TYPES ${t.name} TYPE string`);
    typeNames.add(t.name);
    usedNames.add(t.name);
    typeDefs.set(t.name, t.components.length > 0 ? 'STRUCTURE' : 'TYPE string');
  }

  return {
    types,
    constants,
    constantNames,
    globals,
    selection,
    skipped,
    typeNames,
    namedTypes,
    globalScope,
    customerTables,
    scopeOf,
    paramPhrase,
    resolve: (phrase, scope) => resolveIn(phrase, scope ?? null),
  };
}

const CUSTOMER_TABLE = /^\/?[zy][\w/]*$/i;
/** System fields a customer table's field is commonly filled from, with their dictionary types. */
const SY_TYPES: Record<string, string> = {
  'sy-datum': 'TYPE d',
  'sy-uzeit': 'TYPE t',
  'sy-mandt': 'TYPE c LENGTH 3',
  'sy-uname': 'TYPE c LENGTH 12',
  'sy-langu': 'TYPE c LENGTH 1',
  'sy-tabix': 'TYPE i',
  'sy-index': 'TYPE i',
};

/**
 * The customer tables an original writes, or declares data by, that the package does not ship — each with the
 * fields the original uses (`ls_appr-banfn = p_banfn`, `VALUE #( objkey = lv_objkey … )`, `UPDATE z SET f = …`),
 * typed by what it assigns them or is assigned from (`TYPE string` when that is not known). Nothing beyond the
 * fields the original names is invented.
 */
function customerTablesOf(
  facts: Pick<EngineFacts, 'statements' | 'blocks' | 'graph'>,
  declaredTypes: ReadonlySet<string>,
  globalScope: ReadonlyMap<string, string>,
  scopeOf: (routine: string) => RoutineScope,
  resolve: (phrase: string, scope: ReadonlyMap<string, string> | null) => string | null,
): CustomerTable[] {
  const { statements, blocks } = facts;
  const isCustomer = (n: string) => CUSTOMER_TABLE.test(n) && !declaredTypes.has(n.toLowerCase());
  const tables = new Set<string>();
  for (const w of facts.graph.databaseWrites) if (isCustomer(w.table)) tables.add(w.table.toLowerCase());
  // A declaration typed by a customer table: `TYPE z`, `LIKE z`, `TYPE [STANDARD] TABLE OF z`, `TYPE z-field`.
  const DECL = /^(?:DATA|STATICS|CLASS-DATA|TYPES|CONSTANTS|PARAMETERS|FIELD-SYMBOLS)\b/i;
  const typedBy = /\b(?:TYPE|LIKE)\s+(?:(?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+|LINE\s+OF\s+|RANGE\s+OF\s+)?(\/?[zy][\w/]*)(-[\w/]+)?(?![\w/-])/gi;
  for (const st of statements) {
    if (st.nativeSql || !DECL.test(st.text)) continue;
    for (const m of st.text.matchAll(typedBy)) if (isCustomer(m[1])) tables.add(m[1].toLowerCase());
  }
  if (tables.size === 0) return [];

  const routineOf = (line: number) => {
    const c = containerAt(blocks.containers as Container[], line);
    return c && (c.kind === 'form' || c.kind === 'method') && c.name ? c.name : null;
  };
  // Data objects typed by each table: work areas (a row) and internal tables (a row through a loop or a read).
  const rowOf = new Map<string, string>();
  const tabOf = new Map<string, string>();
  const declRe = /^(?:DATA|STATICS|CLASS-DATA)\s*:?\s*([\w/]+)\s+(?:TYPE|LIKE)\s+(?:(?:STANDARD\s+|SORTED\s+|HASHED\s+)?(TABLE\s+OF\s+))?(\/?[zy][\w/]*)(?![\w/-])/i;
  for (const st of statements) {
    const m = declRe.exec(st.text);
    if (!m || !tables.has(m[3].toLowerCase())) continue;
    (m[2] ? tabOf : rowOf).set(m[1].toLowerCase(), m[3].toLowerCase());
  }
  for (const st of statements) {
    const m = /^(?:LOOP\s+AT|READ\s+TABLE)\s+([\w/]+)\b[\s\S]*?\b(?:INTO\s+(?:DATA\(\s*)?|ASSIGNING\s+(?:FIELD-SYMBOL\(\s*)?)(<?[\w/]+>?)/i.exec(st.text);
    const t = m ? tabOf.get(m[1].toLowerCase()) : undefined;
    if (m && t && !rowOf.has(m[2].toLowerCase())) rowOf.set(m[2].toLowerCase(), t);
  }
  // TABLES z, `TYPE z-field`: the table's own name stands for its row.
  for (const t of tables) rowOf.set(t, t);

  const fields = new Map<string, Map<string, string | null>>();
  for (const t of tables) fields.set(t, new Map());
  const mentions = (phrase: string, name: string) => new RegExp(`(?:^|[^\\w/])${escapeRe(name)}(?![\\w/])`, 'i').test(phrase);
  const typeOf = (expr: string, line: number): string | null => {
    const e = expr.trim().replace(/^@/, '').toLowerCase();
    if (SY_TYPES[e]) return SY_TYPES[e];
    if (/^-?\d+$/.test(e)) return 'TYPE i';
    if (!/^<?[a-z_][\w/]*>?$/.test(e)) return null;
    const routine = routineOf(line);
    const scope = routine ? scopeOf(routine) : null;
    const declared = scope?.locals.get(e) || globalScope.get(e) || null;
    if (!declared) return null;
    const r = resolve(declared, scope?.locals ?? null);
    if (!r || /^TYPE\s+(?:any|data|c|n|x|p|csequence|simple|clike|numeric)$/i.test(r) || /\bTABLE\b|\bREF\s+TO\b/i.test(r)) return null;
    // A type the routine declares itself, or a customer table, is no type the class can name.
    if (scope && [...scope.localTypes].some((lt) => mentions(r, lt))) return null;
    if ([...tables].some((t) => mentions(r, t))) return null;
    return r;
  };
  const note = (table: string, field: string, phrase: string | null) => {
    const f = field.toLowerCase();
    const m = fields.get(table)!;
    if (!m.has(f) || (m.get(f) === null && phrase)) m.set(f, phrase);
  };
  const strip = (t: string) => t.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`|\|(?:[^|\\]|\\.)*\|/g, "''");
  for (const st of statements) {
    if (st.nativeSql) continue;
    const text = strip(st.text);
    // `ls-f = rhs` and `lhs = ls-f`.
    const assign = /^([\w/<>]+)-([\w/]+)\s*=\s*(.+)$/i.exec(text);
    if (assign && rowOf.has(assign[1].toLowerCase())) note(rowOf.get(assign[1].toLowerCase())!, assign[2], typeOf(assign[3], st.lineStart));
    const back = /^([\w/<>]+)\s*=\s*([\w/<>]+)-([\w/]+)$/i.exec(text);
    if (back && rowOf.has(back[2].toLowerCase())) note(rowOf.get(back[2].toLowerCase())!, back[3], typeOf(back[1], st.lineStart));
    // Any other use of a component, in a declaration (`TYPE z-f`) or a statement.
    for (const m of text.matchAll(/(?:^|[^\w/>-])(<?[\w/]+>?)-([a-z_][\w/]*)/gi)) {
      const t = rowOf.get(m[1].toLowerCase());
      if (t) note(t, m[2], null);
    }
    // A write with its row spelled out: `INSERT z FROM @( VALUE #( f = x … ) )`, `UPDATE z SET f = x, …`.
    const write = /^(?:INSERT|MODIFY|UPDATE)\s+(\/?[zy][\w/]*)(?![\w/])([\s\S]*)$/i.exec(text);
    if (write && tables.has(write[1].toLowerCase())) {
      const t = write[1].toLowerCase();
      const value = /\bVALUE\s+#\(([\s\S]*)\)/i.exec(write[2]);
      if (value) for (const m of value[1].matchAll(/\b([a-z_]\w*)\s*=\s*(@?[\w/<>-]+)/gi)) note(t, m[1], typeOf(m[2], st.lineStart));
      const set = /^\s*SET\s+([\s\S]*?)(?:\bWHERE\b|$)/i.exec(write[2]);
      if (set) for (const m of set[1].matchAll(/\b([a-z_]\w*)\s*=\s*(@?[\w/<>-]+)/gi)) note(t, m[1], typeOf(m[2], st.lineStart));
    }
  }
  return [...tables].sort().map((name) => ({
    name,
    components: [...fields.get(name)!].map(([f, phrase]) => ({ name: f, phrase: phrase ?? 'TYPE string' })),
  }));
}

/** The components of a structure type the class declares (`TYPES BEGIN OF x … END OF x`), name → phrase; null when it is not one. */
export function structureComponents(contract: Pick<RapContract, 'types'>, typeName: string): Array<{ name: string; phrase: string }> | null {
  const t = typeName.toLowerCase();
  const start = contract.types.findIndex((s) => new RegExp(`^TYPES BEGIN OF ${escapeRe(t)}$`, 'i').test(s));
  if (start < 0) return null;
  const out: Array<{ name: string; phrase: string }> = [];
  let depth = 0;
  for (let i = start + 1; i < contract.types.length; i++) {
    const s = contract.types[i];
    if (/^TYPES BEGIN OF /i.test(s)) {
      depth++;
      continue;
    }
    if (/^TYPES END OF /i.test(s)) {
      if (depth === 0) return out;
      depth--;
      continue;
    }
    if (depth > 0) continue;
    const m = /^TYPES ([\w/]+) (.+)$/i.exec(s);
    if (m && !/^INCLUDE$/i.test(m[1])) out.push({ name: m[1].toLowerCase(), phrase: m[2] });
  }
  return out;
}

/** The definition phrase of a type the class declares (`ty_i` → `TYPE p LENGTH 16 DECIMALS 0`); `STRUCTURE` for a structure; null when unknown. */
export function typeDefinition(contract: Pick<RapContract, 'types' | 'namedTypes'>, typeName: string): string | null {
  const t = typeName.toLowerCase();
  // Top-level statements only: a structure's component of the same name is no type.
  let depth = 0;
  for (const s of [...contract.types, ...contract.namedTypes]) {
    if (/^TYPES BEGIN OF /i.test(s)) {
      if (depth === 0 && new RegExp(`^TYPES BEGIN OF ${escapeRe(t)}$`, 'i').test(s)) return 'STRUCTURE';
      depth++;
      continue;
    }
    if (/^TYPES END OF /i.test(s)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    const m = new RegExp(`^TYPES ${escapeRe(t)} (TYPE .+)$`, 'i').exec(s);
    if (m) return m[1];
  }
  return null;
}

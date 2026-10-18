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
  /**
   * The type the original names, where ABAP Cloud does not permit it and the phrase is a built-in type instead
   * (`rlgrap-filename`, scaffold version 11) — for a comment beside the declaration. Absent otherwise.
   */
  was?: string;
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
  /**
   * A METHOD's RETURNING parameter, read from its declaration in the class definition — the class's own, else an
   * ancestor's for a REDEFINITION (scaffold 17). Absent for a FORM, and for a method that returns nothing.
   */
  returning?: { name: string; phrase: string };
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
  /**
   * The SAP tables the access layer reads or writes, each with a row type of the class (`vbak` → `ty_vbak_row`) built
   * from the fields the original uses — ABAP Cloud has no type VBAK (scaffold version 11, the first SAP activation,
   * 15.10.2026: a body's `TYPE STANDARD TABLE OF vbak` did not activate). `rowType` is null where the original names
   * no field of the table: then there is no row type to offer.
   */
  sapRows: SapRow[];
  /**
   * TYPES statements of `types` (as stored, without the period) whose type the original names in a way ABAP Cloud
   * does not permit, with what it named (`TYPES p_file TYPE c LENGTH 128` → `rlgrap-filename`).
   */
  typeNotes: Map<string, string>;
  /**
   * The scope of a routine (upper-case FORM or METHOD name). `line`, a line inside the routine, picks one of several
   * routines of that name — methods of different local classes (scaffold 17); without it, the first.
   */
  scopeOf(routine: string, line?: number): RoutineScope;
  /**
   * The instance and static attributes the original's local classes declare (`DATA`/`CLASS-DATA` in a CLASS …
   * DEFINITION), as attributes of the one logic class the routines become (scaffold 17): a method's body reads them
   * (`rv_tax = mv_netwr * '0.19'`), and undeclared every faithful body was refused. One per name — the classes are
   * flattened into one; a name the program also declares globally is the global's. In source order.
   */
  classAttributes: AbapDecl[];
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

export interface SapRow {
  /** The SAP table, lower case (`vbak`). */
  table: string;
  /** The row type the class declares for it (`ty_vbak_row`), or null when the original names none of its fields. */
  rowType: string | null;
  components: Array<{ name: string; phrase: string }>;
}

/**
 * Fields of SAP tables and structures whose dictionary type is certain (S/4HANA; MATNR is CHAR 40 there): a
 * declaration `TYPE <table>-<field>` ABAP Cloud refuses becomes this built-in type. Any other is `TYPE string`.
 * Only what is sure is listed — a wrong length would truncate silently.
 */
export const NOT_RELEASED_FIELD_TYPES: Readonly<Record<string, string>> = {
  'rlgrap-filename': 'c LENGTH 128',
  'vbak-vbeln': 'c LENGTH 10',
  'vbap-vbeln': 'c LENGTH 10',
  'vbap-posnr': 'n LENGTH 6',
  'vbak-kunnr': 'c LENGTH 10',
  'kna1-kunnr': 'c LENGTH 10',
  'vbak-vkorg': 'c LENGTH 4',
  'vbak-vtweg': 'c LENGTH 2',
  'vbak-spart': 'c LENGTH 2',
  'vbak-auart': 'c LENGTH 4',
  'vbak-erdat': 'd',
  'vbak-ernam': 'c LENGTH 12',
  'vbak-waerk': 'c LENGTH 5',
  'vbak-netwr': 'p LENGTH 8 DECIMALS 2',
  'vbap-netwr': 'p LENGTH 8 DECIMALS 2',
  'vbap-kwmeng': 'p LENGTH 8 DECIMALS 3',
  'vbap-matnr': 'c LENGTH 40',
  'mara-matnr': 'c LENGTH 40',
  'vbap-werks': 'c LENGTH 4',
  'vbak-lifsk': 'c LENGTH 2',
  'vbak-faksk': 'c LENGTH 2',
  'eban-banfn': 'c LENGTH 10',
  'eban-bnfpo': 'n LENGTH 5',
  'eban-ekgrp': 'c LENGTH 3',
  'mara-mtart': 'c LENGTH 4',
  'mara-matkl': 'c LENGTH 9',
  'kna1-land1': 'c LENGTH 3',
  'kna1-name1': 'c LENGTH 35',
  't001-bukrs': 'c LENGTH 4',
  'knb1-bukrs': 'c LENGTH 4',
};

/** The names a type phrase may keep as `<holder>-<field>`: the system fields (released), and customer names. */
const KEPT_HOLDER = /^(?:sy|syst|\/?[zy][\w/]*)$/i;

/**
 * A type phrase ABAP Cloud permits (scaffold version 11, the first SAP activation, 15.10.2026: `TYPE rlgrap-filename`
 * — "The use of Table RLGRAP is not permitted"). A component of a table or structure the program does not declare,
 * not a system field and not a customer name, becomes a built-in type (`NOT_RELEASED_FIELD_TYPES`, else `string`; a
 * range or table of one `string`, which `RANGE OF` takes and `c LENGTH n` it does not); an SAP table the access layer
 * reads, as a whole, becomes its row type (`sapRows`). `was` names what the original wrote, null when nothing changed.
 */
export function cloudPhrase(phrase: string, declared: (name: string) => boolean, sapRows: ReadonlyMap<string, string> = new Map()): { phrase: string; was: string | null } {
  const p = phrase.trim();
  const field = /^TYPE\s+(RANGE\s+OF\s+|(?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+|LINE\s+OF\s+)?(\/?[\w/]+)-([\w/]+(?:-[\w/]+)*)(\s+WITH\s+[\s\S]*)?$/i.exec(p);
  if (field) {
    const holder = field[2].toLowerCase();
    if (KEPT_HOLDER.test(holder) || declared(holder)) return { phrase: p, was: null };
    const was = `${holder}-${field[3].toLowerCase()}`;
    const prefix = (field[1] ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!prefix || prefix === 'LINE OF') return { phrase: `TYPE ${NOT_RELEASED_FIELD_TYPES[was] ?? 'string'}`, was };
    if (prefix === 'RANGE OF') return { phrase: 'TYPE RANGE OF string', was };
    // A sorted or hashed key names components a string line does not have: a standard table with the default key.
    return { phrase: 'TYPE STANDARD TABLE OF string WITH DEFAULT KEY', was };
  }
  const whole = /^TYPE\s+((?:STANDARD\s+|SORTED\s+|HASHED\s+)?TABLE\s+OF\s+|LINE\s+OF\s+)?(\/?[\w/]+)(\s+WITH\s+[\s\S]*)?$/i.exec(p);
  const row = whole ? sapRows.get(whole[2].toLowerCase()) : undefined;
  if (!whole || !row) return { phrase: p, was: null };
  const was = whole[2].toLowerCase();
  if (!whole[1] || /^LINE/i.test(whole[1])) return { phrase: `TYPE ${row}`, was };
  return { phrase: `TYPE ${whole[1].replace(/\s+/g, ' ')}${row}${whole[3] ?? ' WITH DEFAULT KEY'}`, was };
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

interface ClassDefinition {
  name: string;
  parent: string | null;
  attributes: Array<{ name: string; phrase: string; length: string | null; line: number; text: string }>;
  /** Upper-case method name → its METHODS statement (without the keyword). */
  methods: Map<string, { text: string; line: number }>;
}

/**
 * The local classes' definitions (scaffold 17): `CLASS x DEFINITION [INHERITING FROM y]` … `ENDCLASS`, with the
 * `DATA`/`CLASS-DATA` attributes (no structure) and the `METHODS`/`CLASS-METHODS` declarations each holds.
 */
function readClassDefinitions(statements: readonly AbapStatement[], containers: readonly Container[]): Map<string, ClassDefinition> {
  const out = new Map<string, ClassDefinition>();
  for (const c of containers) {
    if (c.kind !== 'class') continue;
    const head = statements.find((s) => s.lineStart === c.lineStart && s.keyword === 'CLASS');
    const m = head ? /^CLASS\s+([\w/]+)\s+DEFINITION\b([\s\S]*)$/i.exec(head.text) : null;
    if (!head || !m || /\b(?:DEFERRED|LOAD)\b/i.test(m[2])) continue;
    const def: ClassDefinition = { name: m[1].toUpperCase(), parent: /\bINHERITING\s+FROM\s+([\w/]+)/i.exec(m[2])?.[1].toUpperCase() ?? null, attributes: [], methods: new Map() };
    let inStructure = 0;
    for (const st of statements) {
      if (st.lineStart <= c.lineStart || st.lineStart > c.lineEnd || st.nativeSql) continue;
      const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '');
      if (st.keyword === 'DATA' || st.keyword === 'CLASS-DATA') {
        if (/^BEGIN\s+OF\b/i.test(rest)) inStructure++;
        else if (/^END\s+OF\b/i.test(rest)) inStructure = Math.max(0, inStructure - 1);
        else if (inStructure === 0) {
          const d = splitDecl(rest);
          if (d && !d.name.startsWith('<')) def.attributes.push({ name: d.name.toLowerCase(), phrase: d.phrase, length: d.length, line: st.lineStart, text: st.text });
        }
      } else if (st.keyword === 'METHODS' || st.keyword === 'CLASS-METHODS') {
        const name = /^([\w/~]+)/.exec(rest)?.[1].toUpperCase();
        if (name && !def.methods.has(name)) def.methods.set(name, { text: rest, line: st.lineStart });
      }
    }
    if (!out.has(def.name)) out.set(def.name, def);
  }
  return out;
}

/** The declaration of a method of a class: its own, or the nearest ancestor's when it is a REDEFINITION or absent. */
function methodDeclarationOf(classes: ReadonlyMap<string, ClassDefinition>, owner: string, method: string): { text: string; line: number } | null {
  let cls = classes.get(owner);
  for (let depth = 0; cls && depth < 16; depth++) {
    const d = cls.methods.get(method);
    if (d && !/\bREDEFINITION\b/i.test(d.text)) return d;
    cls = cls.parent ? classes.get(cls.parent) : undefined;
  }
  return null;
}

type MethodSection = 'importing' | 'exporting' | 'changing' | 'returning';

/**
 * The parameters of a METHODS declaration without its keyword (`calculate_tax ABSTRACT RETURNING VALUE(rv_tax) TYPE
 * vbak-netwr`), in order, each with its section and type phrase (OPTIONAL and DEFAULT dropped).
 */
export function methodParameters(text: string): Array<{ name: string; section: MethodSection; phrase: string | null; original: string }> {
  const tokens = text.replace(/\.\s*$/, '').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').split(/\s+/).filter(Boolean).slice(1);
  const out: Array<{ name: string; section: MethodSection; phrase: string | null; original: string }> = [];
  let section: MethodSection | null = null;
  let current: { name: string; section: MethodSection } | null = null;
  const words: string[] = [];
  const close = () => {
    if (current) {
      const phrase = words.join(' ').replace(/\s+\b(?:OPTIONAL|DEFAULT)\b[\s\S]*$/i, '').trim();
      out.push({ ...current, phrase: phrase || null, original: `${current.section.toUpperCase()} ${current.name}${phrase ? ` ${phrase}` : ''}` });
    }
    current = null;
    words.length = 0;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const up = t.toUpperCase();
    if (up === 'IMPORTING' || up === 'EXPORTING' || up === 'CHANGING' || up === 'RETURNING') {
      close();
      section = up.toLowerCase() as MethodSection;
      continue;
    }
    if (up === 'RAISING' || up === 'EXCEPTIONS' || up === 'REDEFINITION' || up === 'ABSTRACT' || up === 'FINAL') {
      close();
      section = null;
      continue;
    }
    if (!section) continue;
    const next = tokens[i + 1]?.toUpperCase();
    if (next === 'TYPE' || next === 'LIKE') {
      close();
      const name = (/^(?:VALUE|REFERENCE)\(([\w/]+)\)$/i.exec(t)?.[1] ?? t).toLowerCase();
      if (/^[a-z_][\w/]*$/i.test(name)) current = { name, section };
      continue;
    }
    if (current) words.push(t);
  }
  close();
  return out;
}

/** The contract of a program — see the file comment. */
export function readRapContract(
  facts: Pick<EngineFacts, 'statements' | 'blocks' | 'graph'>,
  reserved: ReadonlySet<string> = new Set(),
  options: {
    /** The SAP tables the access layer reads or writes (scaffold version 11): each gets a row type of the class. */
    sapTables?: readonly string[];
  } = {},
): RapContract {
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
  const typeNotes = new Map<string, string>();

  // ---- ABAP Cloud has no type of an SAP table, nor a component of one (scaffold version 11, the first SAP activation)
  const rowTypeOf = new Map<string, string>();
  for (const t of new Set((options.sapTables ?? []).map((x) => x.toLowerCase()))) {
    if (CUSTOMER_TABLE.test(t)) continue;
    let name = `ty_${t.replace(/^\/([^/]+)\//, '$1_').replace(/[^a-z0-9_]/g, '_').slice(0, 23)}_row`;
    for (let i = 2; usedNames.has(name); i++) name = `${name.slice(0, 27)}_${i}`;
    usedNames.add(name);
    rowTypeOf.set(t, name);
  }
  /** Index in `types` of the first statement that names a row type: the row types are declared before it. */
  let firstRowUse: number | null = null;
  /** The SAP tables a declaration of the original is typed by as a whole: their row type must exist. */
  const rowUsed = new Set<string>();
  const cloud = (phrase: string, local?: ReadonlyMap<string, string>, localTypes?: ReadonlySet<string>) => {
    const c = cloudPhrase(phrase, (h) => typeNames.has(h) || globalScope.has(h) || !!local?.has(h) || !!localTypes?.has(h), rowTypeOf);
    if (c.was && rowTypeOf.has(c.was)) rowUsed.add(c.was);
    return c;
  };
  /** A TYPES statement for `types`, with a note where the original's type is not permitted. */
  const typesStatement = (name: string, phrase: string): string => {
    const c = cloud(phrase);
    const statement = `TYPES ${name} ${c.phrase}`;
    if (c.was) {
      typeNotes.set(statement, c.was);
      if (rowTypeOf.has(c.was) && firstRowUse === null) firstRowUse = types.length;
    }
    return statement;
  };

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
      let was: string | null = null;
      if (/\bAS\s+CHECKBOX\b|\bRADIOBUTTON\s+GROUP\b/i.test(tail)) phrase = 'TYPE c LENGTH 1';
      else {
        const t = /\b(TYPE|LIKE)\s+([\w/]+(?:-[\w/]+)*)/i.exec(tail);
        const lengthClause = /\bLENGTH\s+(\d+)/i.exec(tail);
        const decimals = /\bDECIMALS\s+(\d+)/i.exec(tail);
        const typed = t ? `${t[1].toUpperCase()} ${t[2]}${decimals ? ` DECIMALS ${decimals[1]}` : ''}` : '';
        phrase = normalisePhrase(typed, lengthClause?.[1] ?? m[2] ?? (typed ? null : '8'));
        ({ phrase, was } = cloud(resolveIn(phrase, null) ?? 'TYPE string'));
      }
      selection.push({ name, phrase, line: st.lineStart, kind: 'parameter', rangeOf: null, ...(was ? { was } : {}) });
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
      const c = cloud(`TYPE RANGE OF ${named ?? 'string'}`);
      const rangeOf = c.was ? 'string' : named ?? 'string';
      const phrase = c.phrase;
      const was = c.was ? { was: c.was } : {};
      if (kw === 'SELECT-OPTIONS') selection.push({ name, phrase, line: st.lineStart, kind: 'range', rangeOf, ...was });
      else globals.push({ name, phrase, line: st.lineStart, ...was });
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
    const original = resolveIn(phrase, null);
    if (!original) {
      skipped.push({ line: st.lineStart, text: st.text.slice(0, 80) });
      continue;
    }
    if (structStack.length > 0) {
      const s = structStack[structStack.length - 1];
      if (s.kind === 'CONSTANTS') constants.push(`CONSTANTS ${name} ${cloud(original).phrase}${d.value ? ` VALUE ${d.value}` : ''}`);
      else types.push(typesStatement(name, original));
      continue;
    }
    const { phrase: resolved, was } = cloud(original);
    if (kw === 'TYPES') {
      types.push(typesStatement(name, original));
      typeNames.add(name);
      typeDefs.set(name, resolved);
    } else if (kw === 'CONSTANTS') {
      constants.push(`CONSTANTS ${name} ${resolved}${d.value ? ` VALUE ${d.value}` : ''}`);
      constantNames.add(name);
      globalScope.set(name, resolved);
    } else {
      globals.push({ name, phrase: resolved, line: st.lineStart, ...(was ? { was } : {}) });
      globalScope.set(name, resolved);
    }
  }
  // ---- the local classes' definitions (scaffold 17): their attributes, their methods' declarations, their parents
  const classes = readClassDefinitions(statements, containers);
  const classAttributes: AbapDecl[] = [];
  for (const def of classes.values()) {
    for (const a of def.attributes) {
      const name = a.name;
      if (globalScope.has(name) || typeNames.has(name) || classAttributes.some((x) => x.name === name)) continue;
      const original = resolveIn(normalisePhrase(a.phrase, a.length), null);
      if (!original) {
        skipped.push({ line: a.line, text: a.text.slice(0, 80) });
        continue;
      }
      const { phrase: resolved, was } = cloud(original);
      classAttributes.push({ name, phrase: resolved, line: a.line, ...(was ? { was } : {}) });
    }
  }
  for (const a of classAttributes) globalScope.set(a.name, a.phrase);
  for (const n of [...typeNames, ...globals.map((g) => g.name), ...classAttributes.map((g) => g.name), ...selection.map((s) => s.name), ...constantNames]) usedNames.add(n.toLowerCase());

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
  const scopeOf = (routine: string, line?: number): RoutineScope => {
    const name = routine.toUpperCase();
    const named = containers.filter((c) => (c.kind === 'form' || c.kind === 'method') && c.name === name);
    const container = (line !== undefined ? named.find((c) => c.lineStart <= line && line <= c.lineEnd) : undefined) ?? named[0];
    const key = container ? `${name}@${container.lineStart}` : name;
    const hit = scopes.get(key);
    if (hit) return hit;
    const locals = new Map<string, string>();
    const localTypes = new Set<string>();
    const params: RapParam[] = [];
    if (!container) {
      const empty = { locals, localTypes, params };
      scopes.set(key, empty);
      return empty;
    }
    let returning: RoutineScope['returning'];
    const own = statements.filter((s) => s.lineStart >= container.lineStart && s.lineStart <= container.lineEnd && !s.nativeSql);
    const head = own.find((s) => s.lineStart === container.lineStart && /^(?:FORM|METHOD)$/i.test(s.keyword));
    if (head && container.kind === 'form') {
      const body = own.filter((s) => s !== head);
      for (const p of formParameters(head.text)) {
        const declared = p.phrase ? normalisePhrase(p.phrase, null) : null;
        const raw = declared ? resolveIn(declared, null) : null;
        const resolved = raw ? cloud(raw).phrase : null;
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
    if (head && container.kind === 'method') {
      // The signature is in the class definition (scaffold 17): the class's own METHODS, else an ancestor's when the
      // class redefines it. Without it the method had no parameters and every body reading one was refused.
      const owner = containers.find((k) => k.kind === 'class' && k.lineStart <= container.lineStart && container.lineEnd <= k.lineEnd)?.name ?? null;
      const declared = owner ? methodDeclarationOf(classes, owner, name) : null;
      for (const p of declared ? methodParameters(declared.text) : []) {
        const decl = p.phrase ? normalisePhrase(p.phrase, null) : null;
        const raw = decl ? resolveIn(decl, null) : null;
        const resolved = raw ? cloud(raw).phrase : null;
        locals.set(p.name, resolved ?? 'TYPE any');
        const typed = paramPhrase(resolved, p.name);
        if (p.section === 'returning') returning = { name: p.name, phrase: typed };
        else params.push({ name: p.name, direction: p.section === 'importing' ? 'importing' : 'changing', phrase: typed, original: p.original });
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
      const raw = resolveIn(phrase, locals);
      const r = raw ? cloud(raw, locals, localTypes).phrase : null;
      const usesLocalType = [...localTypes].some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(phrase));
      if (r && !usesLocalType) locals.set(d.name.toLowerCase(), r);
      else locals.set(d.name.toLowerCase(), '');
    }
    const scope: RoutineScope = { locals, localTypes, params, ...(returning ? { returning } : {}) };
    scopes.set(key, scope);
    return scope;
  };

  // ---- customer tables the package does not ship (acceptance run 4): a structure of the class under their name
  const customerTables = customerTablesOf(facts, typeNames, globalScope, scopeOf, (phrase, scope) => resolveIn(phrase, scope)).filter(
    // A class's types and attributes share one namespace: a table named like a global of the original stays out.
    (t) => !usedNames.has(t.name),
  );
  for (const t of customerTables) {
    for (const c of t.components) c.phrase = cloud(c.phrase).phrase;
    if (t.components.length > 0) types.push(`TYPES BEGIN OF ${t.name}`, ...t.components.map((c) => `TYPES ${c.name} ${c.phrase}`), `TYPES END OF ${t.name}`);
    else types.push(`TYPES ${t.name} TYPE string`);
    typeNames.add(t.name);
    usedNames.add(t.name);
    typeDefs.set(t.name, t.components.length > 0 ? 'STRUCTURE' : 'TYPE string');
  }

  // ---- the SAP tables the access layer reads or writes: a row type each, from the fields the original uses
  const sapRows: SapRow[] = [];
  if (rowTypeOf.size > 0) {
    // Every routine's declarations are read now, so a local typed by an SAP table marks its row type as needed.
    for (const c of containers) if ((c.kind === 'form' || c.kind === 'method') && c.name) scopeOf(c.name, c.lineStart);
    /** The same-named component of the structure a SELECT reads into, where the program declares that structure. */
    const selectInto = (target: string, field: string, scope: ReadonlyMap<string, string> | null): string | null => {
      const declared = scope?.get(target.toLowerCase()) || globalScope.get(target.toLowerCase());
      if (!declared) return null;
      const line = tableLineOf(declared) ?? simpleTypeName(declared);
      const own = line ? tableLineOf(typeDefs.get(line.toLowerCase()) ?? '') ?? line : null;
      const comp = own ? structureComponents({ types }, own)?.find((x) => x.name === field) : undefined;
      return comp && !/\bTABLE\b|\bREF\s+TO\b/i.test(comp.phrase) ? comp.phrase : null;
    };
    const fields = tableFieldsOf(facts, new Set(rowTypeOf.keys()), globalScope, scopeOf, (phrase, scope) => resolveIn(phrase, scope), selectInto);
    const blocks: string[] = [];
    for (const [table, name] of rowTypeOf) {
      const known = [...(fields.get(table) ?? new Map<string, string | null>())].filter(([f]) => /^[a-z_]\w*$/i.test(f));
      const components = known.map(([f, phrase]) => {
        const builtin = NOT_RELEASED_FIELD_TYPES[`${table}-${f}`];
        return { name: f, phrase: cloud(phrase ?? (builtin ? `TYPE ${builtin}` : 'TYPE string')).phrase };
      });
      if (components.length === 0 && !rowUsed.has(table)) {
        sapRows.push({ table, rowType: null, components });
        continue;
      }
      if (components.length > 0) blocks.push(`TYPES BEGIN OF ${name}`, ...components.map((c) => `TYPES ${c.name} ${c.phrase}`), `TYPES END OF ${name}`);
      else blocks.push(`TYPES ${name} TYPE string`);
      typeNames.add(name);
      typeDefs.set(name, components.length > 0 ? 'STRUCTURE' : 'TYPE string');
      sapRows.push({ table, rowType: name, components });
    }
    // Before the first statement that names one, at the top level (never inside a structure).
    let at = firstRowUse ?? types.length;
    let depth = 0;
    let open = 0;
    for (let i = 0; i < at; i++) {
      if (/^TYPES BEGIN OF /i.test(types[i])) {
        if (depth === 0) open = i;
        depth++;
      } else if (/^TYPES END OF /i.test(types[i])) depth = Math.max(0, depth - 1);
    }
    if (depth > 0) at = open;
    types.splice(at, 0, ...blocks);
  }

  return {
    types,
    constants,
    constantNames,
    globals,
    classAttributes,
    selection,
    skipped,
    typeNames,
    namedTypes,
    globalScope,
    customerTables,
    sapRows,
    typeNotes,
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
  scopeOf: (routine: string, line?: number) => RoutineScope,
  resolve: (phrase: string, scope: ReadonlyMap<string, string> | null) => string | null,
): CustomerTable[] {
  const { statements } = facts;
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
  const fields = tableFieldsOf(facts, tables, globalScope, scopeOf, resolve, null);
  return [...tables].sort().map((name) => ({
    name,
    components: [...fields.get(name)!].map(([f, phrase]) => ({ name: f, phrase: phrase ?? 'TYPE string' })),
  }));
}

/**
 * The fields an original uses of each of `tables` — of a data object typed by the table (`ls-f = x`, `x = ls-f`, a
 * loop or read into a row), of a write with its row spelled out — with the type of what it assigns them or is
 * assigned from (null when that is not known). `selectInto`, for SAP tables (scaffold version 11): also the fields a
 * SELECT on the table names, typed by the same-named component of the structure it reads into where the program
 * declares one (`SELECT vbeln FROM vbak INTO TABLE gt_orders` with `gt_orders` of `ty_order`, `vbeln TYPE vbeln_va`).
 */
function tableFieldsOf(
  facts: Pick<EngineFacts, 'statements' | 'blocks' | 'graph'>,
  tables: ReadonlySet<string>,
  globalScope: ReadonlyMap<string, string>,
  scopeOf: (routine: string, line?: number) => RoutineScope,
  resolve: (phrase: string, scope: ReadonlyMap<string, string> | null) => string | null,
  selectInto: ((target: string, field: string, scope: ReadonlyMap<string, string> | null) => string | null) | null,
): Map<string, Map<string, string | null>> {
  const { statements, blocks } = facts;

  const routineOf = (line: number) => {
    const c = containerAt(blocks.containers as Container[], line);
    return c && (c.kind === 'form' || c.kind === 'method') && c.name ? c.name : null;
  };
  // Data objects typed by each table: work areas (a row) and internal tables (a row through a loop or a read).
  const rowOf = new Map<string, string>();
  const tabOf = new Map<string, string>();
  const declRe = /^(?:DATA|STATICS|CLASS-DATA)\s*:?\s*([\w/]+)\s+(?:TYPE|LIKE)\s+(?:(?:STANDARD\s+|SORTED\s+|HASHED\s+)?(TABLE\s+OF\s+))?(\/?[a-z][\w/]*)(?![\w/-])/i;
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
    const scope = routine ? scopeOf(routine, line) : null;
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
      // A table's column too, for an SAP table (`FOR ALL ENTRIES IN lt_vbrp WHERE vbeln = lt_vbrp-vbeln`).
      const t = rowOf.get(m[1].toLowerCase()) ?? (selectInto ? tabOf.get(m[1].toLowerCase()) : undefined);
      if (t) note(t, m[2], null);
    }
    // A write with its row spelled out: `INSERT z FROM @( VALUE #( f = x … ) )`, `UPDATE z SET f = x, …`.
    const write = /^(?:INSERT|MODIFY|UPDATE)\s+(\/?[a-z][\w/]*)(?![\w/])([\s\S]*)$/i.exec(text);
    if (write && tables.has(write[1].toLowerCase())) {
      const t = write[1].toLowerCase();
      const value = /\bVALUE\s+#\(([\s\S]*)\)/i.exec(write[2]);
      if (value) for (const m of value[1].matchAll(/\b([a-z_]\w*)\s*=\s*(@?[\w/<>-]+)/gi)) note(t, m[1], typeOf(m[2], st.lineStart));
      const set = /^\s*SET\s+([\s\S]*?)(?:\bWHERE\b|$)/i.exec(write[2]);
      if (set) for (const m of set[1].matchAll(/\b([a-z_]\w*)\s*=\s*(@?[\w/<>-]+)/gi)) note(t, m[1], typeOf(m[2], st.lineStart));
    }
    if (selectInto && /^SELECT\b/i.test(text)) {
      const flat = text.replace(/\s+/g, ' ');
      const from = [...flat.matchAll(/\b(?:FROM|JOIN) (\/?[a-z][\w/]*)(?: AS ([\w]+))?/gi)];
      const alias = new Map<string, string>();
      for (const m of from) {
        alias.set(m[1].toLowerCase(), m[1].toLowerCase());
        if (m[2]) alias.set(m[2].toLowerCase(), m[1].toLowerCase());
      }
      const read = [...new Set(from.map((m) => m[1].toLowerCase()))];
      if (!read.some((t) => tables.has(t))) continue;
      const list =
        /\bFIELDS ([\s\S]*?)(?= (?:WHERE|INTO|APPENDING|GROUP|ORDER|HAVING|UP|FOR)\b|$)/i.exec(flat)?.[1] ??
        /^SELECT (?:SINGLE )?(?:FOR UPDATE )?(?:DISTINCT )?([\s\S]*?) FROM\b/i.exec(flat)?.[1] ??
        '';
      const into = /\b(?:INTO|APPENDING) (?:CORRESPONDING FIELDS OF )?(?:TABLE )?@?([\w/]+)/i.exec(flat)?.[1] ?? null;
      const routine = routineOf(st.lineStart);
      const scope = routine ? scopeOf(routine, st.lineStart).locals : null;
      for (const token of list.replace(/\bAS \w+/gi, ' ').split(/[\s,()]+/)) {
        const m = /^(?:([\w/]+)~)?([a-z_]\w*)$/i.exec(token);
        if (!m || /^(?:SINGLE|DISTINCT|FOR|UPDATE|COUNT|SUM|MIN|MAX|AVG|CAST|AS|DATA)$/i.test(m[2])) continue;
        const table = m[1] ? alias.get(m[1].toLowerCase()) : read.length === 1 ? read[0] : undefined;
        if (!table || !tables.has(table)) continue;
        note(table, m[2], into ? selectInto(into, m[2].toLowerCase(), scope) : null);
      }
      // The fields its WHERE compares (`WHERE vbeln = …`, `a~vkorg IN s_vkorg`): fields of the table, too.
      const where = /\bWHERE ([\s\S]*?)(?= (?:INTO|APPENDING|GROUP|ORDER|HAVING|UP)\b|$)/i.exec(flat)?.[1] ?? '';
      for (const m of where.matchAll(/(?:^|[\s(])(?:([\w/]+)~)?([a-z_]\w*)\s*(?:=|<>|<=|>=|<|>|\b(?:EQ|NE|LT|LE|GT|GE|IN|BETWEEN|LIKE|IS)\b)/gi)) {
        if (/^(?:AND|OR|NOT)$/i.test(m[2])) continue;
        const table = m[1] ? alias.get(m[1].toLowerCase()) : read.length === 1 ? read[0] : undefined;
        if (!table || !tables.has(table)) continue;
        note(table, m[2], into ? selectInto(into, m[2].toLowerCase(), scope) : null);
      }
    }
  }
  return fields;
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

import type { ProcessSkeleton, SkeletonEdge, SkeletonNode } from './process-skeleton';
import {
  ACRONYMS,
  EVENT_TERMS_EN,
  FIELD_TERMS_EN,
  FIELD_VALUE_TERMS_EN,
  FUNCTION_TERMS_EN,
  ROUTINE_ABBREVIATIONS,
  STEM_ABBREVIATIONS,
  TABLE_TERMS_EN,
  TRANSACTION_TERMS_EN,
  type PlainTerm,
} from './plain-glossary';
import {
  hasGermanWord,
  isUntranslatable,
  translateGermanText,
  translateGermanWords,
  type WordSources,
} from './german-terms';
import { engineReads310Apply } from './engine-reads-310-gate';
import { authorCommentsOf, type AuthorComment } from './author-comments';
import { CUSTOMER_TEXT_LABEL, isCustomerTexts, type CustomerTexts } from './customer-texts';
import {
  NAMING_ABBREVIATIONS,
  SAP_FIELD_VALUES,
  SAP_FIELDS,
  SAP_FUNCTIONS,
  SAP_TABLES,
  SAP_TRANSACTIONS,
  SAP_AUTHORIZATION_OBJECTS,
  dictionaryWords,
} from './sap-dictionary';
import { APP_VERSION } from '../version';
import { readStateMachine, stateWords, transitionsIn, type CommandArm, type ScenarioDriver, type StateMachine, type StateTransition } from './state-machine';
import { interfaceOfMethod, isConstructorName, isTechnicalMethodName, ownMethodName } from './technical-methods';

/**
 * Plain-language wording for the process map — deterministic, no model.
 *
 * The skeleton (`process-skeleton.ts`) names every element with a token out of
 * the source: `IF s_vkorg[] IS INITIAL`, `E001`, `SELECT EBAN`. That is exact
 * and unreadable for a business reader. This module turns each of those tokens
 * into a short English label built only from what the code says: the condition
 * of a branch, the declaration of a selection field, the table a statement
 * reads, the literal text of a message, the name of a routine.
 *
 * Rules that hold everywhere:
 *
 * - **Nothing is guessed.** An identifier without an entry in
 *   `plain-glossary.ts` is shown as its humanised name, never as a business
 *   meaning the code does not support. A condition that cannot be parsed is
 *   shown humanised and literal, or as the neutral "Condition met?".
 * - **Deterministic and total.** Same input, same output; no function throws.
 * - **Provenance is `reconstructed`** (`lib/provenance.ts`), never "model".
 *   The optional model layer (`lib/process-naming.ts`) stays a layer on top.
 * - **Short.** A label stays within `MAX_LABEL` characters; a longer
 *   rendering falls back to a shorter, still literal one.
 */

export const PLAIN_LABEL_PROVENANCE = 'reconstructed' as const;

/**
 * No label this module produces is longer than this — apart from the original
 * of a translated German name in parentheses, which may add up to
 * `ORIGINAL_NOTE_ROOM` characters.
 */
export const MAX_LABEL = 48;
export const ORIGINAL_NOTE_ROOM = 28;

/* ------------------------------------------------------------------ *
 * Context: what the source declares
 * ------------------------------------------------------------------ */

interface PlainStatement {
  /** 1-based line the statement starts on. */
  line: number;
  /** 1-based line the statement ends on. */
  endLine: number;
  /** The statement without comments, whitespace collapsed, without the period. */
  text: string;
}

interface SelectionField {
  /** `vbak-vkorg` for `SELECT-OPTIONS s_vkorg FOR vbak-vkorg`, `null` without one. */
  ref: string | null;
  /** `AS CHECKBOX` / `RADIOBUTTON`. */
  checkbox: boolean;
  selectOption: boolean;
}

export interface PlainContext {
  /** Source lines, CRLF normalised, BOM removed. */
  readonly lines: readonly string[];
  readonly statements: readonly PlainStatement[];
  /** `PARAMETERS` and `SELECT-OPTIONS`, by lower-case name. */
  readonly selections: ReadonlyMap<string, SelectionField>;
  /** `CONSTANTS … VALUE <literal>`, by lower-case name → the literal without quotes. */
  readonly constants: ReadonlyMap<string, string>;
  /** `DATA x TYPE y` / `LIKE y`, by lower-case name → lower-case type reference. */
  readonly types: ReadonlyMap<string, string>;
  /** Names declared as internal tables. */
  readonly tables: ReadonlySet<string>;
  /** Names declared `TYPE abap_bool` / `AS CHECKBOX`. */
  readonly flags: ReadonlySet<string>;
  /**
   * From engine 3.1.0 (`ENGINE_READS_310_FROM`): the business-language readings — positive questions, the result
   * check of a BAPI, internal tables named after their source, a stop said by its message's own text. False (or
   * absent) for an older engine, which keeps its picture.
   */
  readonly reads310?: boolean;
  /**
   * Where an internal table's rows come from, by lower-case table name → lower-case database table: the table a
   * `SELECT … INTO TABLE` fills it from, or the row type of `TYPE [STANDARD] TABLE OF <dbtab>`. Read for 3.1.0.
   */
  readonly sources?: ReadonlyMap<string, string>;
  /** Database tables the source selects from, lower case. */
  readonly selected?: ReadonlySet<string>;
  /**
   * 3.1.0 (H5b, owner decision 06.11.2026): the customer's own dictionary texts from the uploaded abapGit package —
   * the first source of words for this project. Absent without an upload that had them, and for an older engine.
   */
  readonly customer?: CustomerTexts;
  /** 3.1.0: the customer texts a label was just built from, code → text — read and cleared by `plainLabels`. */
  readonly customerUsed?: Map<string, string>;
  /**
   * 3.1.0 (AB-15a): the program's status workflow (`lib/abap/state-machine.ts`), read once on first use — null when
   * the code shows none. Absent for an older engine, which keeps its picture.
   */
  readonly stateMachine?: () => StateMachine | null;
}

/** What `plainContext` and `plainLabels` read besides the source. */
export interface PlainOptions {
  /** The engine the wording is read for (`engineVersionOfProject`); this release when absent. */
  engineVersion?: string | null;
  /** 3.1.0 (H5b): the project's customer texts (`lib/abap/customer-texts.ts`); read only from that engine on. */
  customerTexts?: CustomerTexts | null;
}

const EMPTY_CONTEXT: PlainContext = Object.freeze({
  lines: [] as string[],
  statements: [] as PlainStatement[],
  selections: new Map<string, SelectionField>(),
  constants: new Map<string, string>(),
  types: new Map<string, string>(),
  tables: new Set<string>(),
  flags: new Set<string>(),
});

/** Statements of the source, comments removed, one entry per period. */
function splitStatements(lines: readonly string[]): PlainStatement[] {
  const out: PlainStatement[] = [];
  let buffer = '';
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.startsWith('*')) continue;
    let quote: string | null = null;
    for (let j = 0; j < raw.length; j++) {
      const ch = raw[j];
      if (quote) {
        buffer += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"') break;
      if (!buffer.trim() && !/\s/.test(ch)) start = i + 1;
      if (ch === "'" || ch === '`' || ch === '|') {
        quote = ch;
        buffer += ch;
        continue;
      }
      if (ch === '.') {
        const text = buffer.replace(/\s+/g, ' ').trim();
        if (text) out.push({ line: start, endLine: i + 1, text });
        buffer = '';
        continue;
      }
      buffer += ch;
    }
    buffer += ' ';
  }
  const rest = buffer.replace(/\s+/g, ' ').trim();
  if (rest) out.push({ line: start, endLine: lines.length, text: rest });
  return out;
}

/** Splits on a separator outside literals and parentheses. */
function splitOutside(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function unquote(literal: string): string {
  const m = /^(['`])([\s\S]*)\1(?:\(\w{1,3}\))?$/.exec(literal.trim());
  if (!m) return literal.trim();
  return m[2].split(m[1] + m[1]).join(m[1]);
}

const DECLARATION = /^(PARAMETERS|PARAMETER|SELECT-OPTIONS|DATA|CLASS-DATA|STATICS|CONSTANTS)\b\s*:?\s*([\s\S]*)$/i;

/**
 * Reads what the source declares: selection fields, constants, data types,
 * internal tables and flags. Pure — the source is the only input.
 */
export function plainContext(source: string, options: PlainOptions = {}): PlainContext {
  try {
    const lines = String(source ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    const statements = splitStatements(lines);
    const selections = new Map<string, SelectionField>();
    const constants = new Map<string, string>();
    const types = new Map<string, string>();
    const tables = new Set<string>();
    const flags = new Set<string>();
    const reads310 = engineReads310Apply(options.engineVersion === undefined ? APP_VERSION : options.engineVersion);
    const sources = new Map<string, string>();
    const selected = new Set<string>();
    /** Tables whose `sources` entry is only their declared row type: a `SELECT` that fills them says more. */
    const rowTyped = new Set<string>();
    for (const statement of statements) {
      if (reads310) readSelectSource(statement.text, sources, selected, rowTyped);
      const m = DECLARATION.exec(statement.text);
      if (!m) continue;
      const keyword = m[1].toUpperCase();
      for (const part of splitOutside(m[2], ',')) {
        const words = part.split(/\s+/);
        const name = words[0]?.toLowerCase().replace(/\(\d+\)$/, '');
        if (!name || /^(BEGIN|END)$/i.test(name)) continue;
        const rest = words.slice(1).join(' ');
        if (keyword === 'SELECT-OPTIONS') {
          const ref = /\bFOR\s+([\w/-]+)/i.exec(rest)?.[1]?.toLowerCase() ?? null;
          selections.set(name, { ref, checkbox: false, selectOption: true });
          continue;
        }
        if (keyword.startsWith('PARAMETER')) {
          const ref = /\b(?:TYPE|LIKE)\s+([\w/]+-[\w/]+)/i.exec(rest)?.[1]?.toLowerCase() ?? null;
          const checkbox = /\bAS\s+CHECKBOX\b|\bRADIOBUTTON\b/i.test(rest);
          selections.set(name, { ref, checkbox, selectOption: false });
          if (checkbox) flags.add(name);
          continue;
        }
        if (keyword === 'CONSTANTS') {
          const value = /\bVALUE\s+('(?:[^']|'')*'|`[^`]*`|-?\d+)/i.exec(rest)?.[1];
          if (value !== undefined) constants.set(name, unquote(value));
          continue;
        }
        if (/\b(?:TABLE\s+OF|RANGE\s+OF)\b/i.test(rest)) tables.add(name);
        // 3.1.0: the row type of a table typed on a database table — `TYPE STANDARD TABLE OF vbak`.
        const row = /\bTABLE\s+OF\s+(?!REF\b)([\w/]+)/i.exec(rest)?.[1]?.toLowerCase();
        if (reads310 && row && !sources.has(name)) {
          sources.set(name, row);
          rowTyped.add(name);
        }
        const type = /\b(?:TYPE|LIKE)\s+(?:REF\s+TO\s+)?([\w/-]+)/i.exec(rest)?.[1]?.toLowerCase();
        if (type) {
          types.set(name, type);
          if (type === 'abap_bool' || type === 'boole_d' || type === 'xfeld' || type === 'flag') flags.add(name);
        }
      }
    }
    const customer = reads310 && isCustomerTexts(options.customerTexts) ? options.customerTexts : undefined;
    let machine: StateMachine | null | undefined;
    const stateMachine = () => (machine === undefined ? (machine = readStateMachine(lines.join('\n'))) : machine);
    return reads310
      ? { lines, statements, selections, constants, types, tables, flags, reads310, sources, selected, stateMachine, ...(customer ? { customer, customerUsed: new Map<string, string>() } : {}) }
      : { lines, statements, selections, constants, types, tables, flags };
  } catch {
    return EMPTY_CONTEXT;
  }
}

/**
 * 3.1.0: what a `SELECT` says about where an internal table's rows come from. `SELECT … FROM vbak … INTO TABLE
 * gt_auftr` (or `APPENDING`, `CORRESPONDING FIELDS OF`, `@DATA(…)`) makes `gt_auftr` rows of VBAK. A join records
 * the table it reads, never a source.
 */
function readSelectSource(text: string, sources: Map<string, string>, selected: Set<string>, rowTyped: Set<string>): void {
  if (!/^SELECT\b/i.test(text)) return;
  const from = /\bFROM\s+([\w/]+)/i.exec(text)?.[1]?.toLowerCase();
  if (!from) return;
  selected.add(from);
  if (/\bJOIN\b/i.test(text)) return;
  const into = /\b(?:INTO|APPENDING)\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?TABLE\s+@?(?:DATA\(\s*)?([\w<>/]+)/i.exec(text)?.[1]?.toLowerCase();
  // The table a SELECT fills a table from wins over its declared row type, which may be a local type (`ty_row`) that
  // names no table at all; the first SELECT still wins over a later one.
  if (into && (!sources.has(into) || rowTyped.has(into))) {
    sources.set(into, from);
    rowTyped.delete(into);
  }
}

function contextOf(ctx?: PlainContext): PlainContext {
  return ctx ?? EMPTY_CONTEXT;
}

/** The statement that starts on (or spans) a line. */
function statementAt(ctx: PlainContext, line: number | undefined): PlainStatement | undefined {
  if (!line) return undefined;
  return ctx.statements.find((s) => s.line === line)
    ?? ctx.statements.find((s) => s.line <= line && s.endLine >= line);
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

const IDENTIFIER_PREFIX =
  /^(?:lv|gv|ls|lt|gt|gs|iv|ev|cv|rv|it|et|ct|rt|is|es|cs|rs|lo|go|io|ro|mv|ms|mt|mo|lc|gc|fs|wa|p|s|c|r|i|e)_/;

const SY_TERMS: Readonly<Record<string, string>> = Object.freeze({
  'sy-datum': 'Today',
  'sy-uzeit': 'Current time',
  'sy-uname': 'User',
  'sy-tabix': 'Row number',
  'sy-index': 'Pass number',
  'sy-dbcnt': 'Rows processed',
  'sy-batch': 'Background run',
  'sy-ucomm': 'User command',
  'sy-tcode': 'Transaction',
  'sy-langu': 'Language',
  'sy-mandt': 'Client',
  'sy-msgid': 'Message class',
  'sy-msgno': 'Message number',
});

/** Words that read as a state on their own: `gv_rejected = abap_true` → "Rejected". */
const STATE_WORDS = new Set(['ok', 'valid', 'invalid', 'active', 'inactive', 'open', 'closed', 'on hold', 'due']);

function sentenceCase(text: string): string {
  const s = text.trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Lower-cases the first letter, unless the first word is an acronym (MRP, ID, ALV). */
function lcFirst(text: string): string {
  if (/^[A-Z0-9]{2,}\b/.test(text) || /^[A-Z][A-Z/]/.test(text)) return text;
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}

function wordCase(word: string): string {
  return ACRONYMS.has(word) ? word.toUpperCase() : word;
}

/** Strips brackets, field-symbol angles, `@` and `!`, and lower-cases. */
function cleanIdentifier(identifier: string): string {
  return identifier.trim().replace(/\[\s*\]/g, '').replace(/[<>@!]/g, '').toLowerCase();
}

/** The name part of an identifier: after the last component selector, without prefix. */
function stemOf(identifier: string): string {
  let name = cleanIdentifier(identifier);
  const parts = name.split(/->|=>|-|~/).filter(Boolean);
  name = parts[parts.length - 1] ?? name;
  const stripped = name.replace(IDENTIFIER_PREFIX, '');
  return stripped || name;
}

/**
 * 3.1.0 (H5): a field's business word — the glossary every engine reads first, then the dictionary of 3.1.0
 * (`sap-dictionary.ts`). An older engine reads the glossary alone.
 */
function fieldTermOf(key: string, ctx: PlainContext | undefined): PlainTerm | undefined {
  const k = key.toLowerCase();
  const customer = customerWord(ctx, 'fields', k);
  if (customer) return { singular: customer, plural: customer };
  return own(FIELD_TERMS_EN, k) ?? (ctx?.reads310 ? own(SAP_FIELDS, k) : undefined);
}

/** 3.1.0 (H5b): the customer's own text for a field, a table or a selection field, noted as used. */
function customerWord(ctx: PlainContext | undefined, kind: 'fields' | 'tables' | 'selections', key: string): string | undefined {
  const texts = ctx?.customer?.[kind];
  const text = texts ? own(texts, key.toLowerCase()) : undefined;
  if (text) ctx?.customerUsed?.set(key.toUpperCase(), text);
  return text;
}

/** A key of one of the tables — never an inherited one (`constructor`, `toString`). */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/** Word-by-word English for an identifier stem without a glossary entry. */
function humaniseStem(stem: string, ctx?: PlainContext): string {
  const key = stem.toLowerCase();
  const hit = fieldTermOf(key, ctx);
  if (hit) return hit.singular;
  // A German name (`ausgabe`, `lieferdatum`) in English — or, when it cannot be
  // read in full, the name as the source writes it, never a half translation.
  const german = translateGermanWords(key.split(/[_\s]+/), 'field', ctx?.reads310 ? FIELD_SOURCES_310 : FIELD_SOURCES);
  if (isUntranslatable(german)) return stem.toUpperCase();
  if (german) return german.english;
  const words = key.split(/[_\s]+/).filter(Boolean).map((w) => {
    const abbreviation = own(STEM_ABBREVIATIONS, w) ?? (ctx?.reads310 ? own(NAMING_ABBREVIATIONS, w) : undefined);
    if (abbreviation) return abbreviation;
    const term = fieldTermOf(w, ctx);
    if (term && w.length >= 4 && !PLAIN_WORD_KEYS.has(w)
      && term.singular.toLowerCase().replace(/s$/, '') !== w.replace(/s$/, '')) {
      return lcFirst(term.singular);
    }
    return wordCase(w);
  });
  return sentenceCase(words.join(' ')) || stem;
}

let glossaryWords: Set<string> | null = null;

/** Every English word the glossary uses — what a component name may be and still read as a word. */
function englishGlossaryWords(): Set<string> {
  if (glossaryWords) return glossaryWords;
  const words = new Set<string>();
  const add = (text: string) => { for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) words.add(w); };
  for (const t of Object.values(FIELD_TERMS_EN)) add(`${t.singular} ${t.plural}`);
  for (const t of Object.values(TABLE_TERMS_EN)) add(`${t.singular} ${t.plural}`);
  for (const v of [...Object.values(STEM_ABBREVIATIONS), ...Object.values(ROUTINE_ABBREVIATIONS),
    ...Object.values(FUNCTION_TERMS_EN), ...Object.values(TRANSACTION_TERMS_EN), ...Object.values(EVENT_TERMS_EN)]) add(v);
  // Read only by `isFieldCode` and `customTableTerm`, both of 3.1.0: the dictionary's words are English words too.
  for (const v of dictionaryWords()) add(v);
  glossaryWords = words;
  return words;
}

/**
 * 3.1.0: is a structure component (`is_delivery-gewei`) a dictionary field code rather than a word? Four to six
 * letters or digits, the shape of SAP's field names; no glossary entry, no English word the glossary uses, no German
 * word the engine can translate. `menge`, `price`, `status` are words; `gewei`, `profl`, `mmsta` are codes.
 */
function isFieldCode(field: string): boolean {
  const f = field.toLowerCase();
  if (!/^[a-z][a-z0-9]{3,5}$/.test(f)) return false;
  if (own(FIELD_TERMS_EN, f) || own(STEM_ABBREVIATIONS, f) || englishGlossaryWords().has(f) || englishGlossaryWords().has(f.replace(/s$/, ''))) return false;
  const german = translateGermanWords([f], 'field', FIELD_SOURCES);
  return !german || isUntranslatable(german);
}

/**
 * 3.1.0 (H5, owner decision 06.11.2026): a dictionary field — said by its word, never as "Field PROFL" — whose
 * purpose the code does not state. The decision that tests it carries the note `UNSTATED_CHECK`.
 */
function isDictionaryField(field: string, ctx: PlainContext): boolean {
  const f = field.toLowerCase();
  return !!ctx.reads310 && !own(FIELD_TERMS_EN, f) && !!own(SAP_FIELDS, f);
}

/** A word of a name the glossary knows (`kunnr` → "customer number"). */
function knownWord(word: string): string | null {
  const term = own(FIELD_TERMS_EN, word);
  return term && word.length >= 4 && !PLAIN_WORD_KEYS.has(word) ? lcFirst(term.singular) : null;
}

/** 3.1.0: the same, with the dictionary (`sap-dictionary.ts`). */
function knownWord310(word: string): string | null {
  const base = knownWord(word);
  if (base) return base;
  const term = own(SAP_FIELDS, word);
  return term && word.length >= 4 && !PLAIN_WORD_KEYS.has(word) ? lcFirst(term.singular) : null;
}

/** What the German translation may lean on, for variable names and for routine names. */
const FIELD_SOURCES: WordSources = { abbreviations: STEM_ABBREVIATIONS, acronyms: ACRONYMS, known: knownWord };
const ROUTINE_SOURCES: WordSources = { abbreviations: ROUTINE_ABBREVIATIONS, acronyms: ACRONYMS, known: knownWord };
/** 3.1.0: the sources with the dictionary and the larger German vocabulary (`german-terms.ts`, `reads310`). */
const FIELD_SOURCES_310: WordSources = {
  abbreviations: { ...STEM_ABBREVIATIONS, ...NAMING_ABBREVIATIONS, ...STEM_ABBREVIATIONS }, acronyms: ACRONYMS, known: knownWord310, reads310: true,
};
/** 3.1.0: the words of a customer table's name — German and SAP field words, no abbreviation of a variable name. */
const TABLE_SOURCES_310: WordSources = { acronyms: ACRONYMS, known: knownWord310, reads310: true };
const ROUTINE_SOURCES_310: WordSources = { abbreviations: ROUTINE_ABBREVIATIONS, acronyms: ACRONYMS, known: knownWord310, reads310: true };

/** Glossary keys that are ordinary English words — not expanded inside a compound stem. */
const PLAIN_WORD_KEYS = new Set(['where', 'form', 'case', 'func', 'rows', 'keys', 'text', 'type', 'name', 'land']);

/**
 * A database table's business object. `dbTable`: the caller knows the name is a database table (a `SELECT`, a write);
 * otherwise a customer table's own words (`customTableTerm`) are read only for a table the source selects from.
 */
function tableTermOf(name: string, ctx?: PlainContext, dbTable = false): PlainTerm | null {
  const key = name.trim().toLowerCase();
  const customer = dbTable || ctx?.selected?.has(key) ? customerWord(ctx, 'tables', key) : undefined;
  if (customer) return { singular: customer, plural: customer };
  const base = own(TABLE_TERMS_EN, key);
  if (base || !ctx?.reads310) return base ?? null;
  const sap = own(SAP_TABLES, key);
  if (sap) return sap;
  return dbTable || ctx.selected?.has(key) ? customTableTerm(key) : null;
}

/**
 * 3.1.0 (H5/H8): a database table's business object as the Business view of `engineVersion` words it — the glossary,
 * then the dictionary and a customer table's own words. For callers outside the process map ("In short"). Null before
 * 3.1.0 for anything the glossary does not know.
 */
export function businessTableTerm(name: string, options: PlainOptions = {}): PlainTerm | null {
  const reads310 = engineReads310Apply(options.engineVersion === undefined ? APP_VERSION : options.engineVersion);
  const customer = reads310 && isCustomerTexts(options.customerTexts) ? { customer: options.customerTexts } : {};
  return tableTermOf(name, reads310 ? { ...EMPTY_CONTEXT, reads310: true, ...customer } : EMPTY_CONTEXT, true);
}

/** 3.1.0: whether `businessTableTerm` names a customer table by the words of its own name (its code then stays beside it). */
export function isCustomTableWorded(name: string, options: PlainOptions = {}): boolean {
  const reads310 = engineReads310Apply(options.engineVersion === undefined ? APP_VERSION : options.engineVersion);
  return reads310 && isCustomTableWord(name, { ...EMPTY_CONTEXT, reads310: true });
}

/** 3.1.0: a function module's or transaction's business word, the glossary first, then the dictionary. */
export function businessCallWord(name: string, kind: 'function' | 'transaction', options: PlainOptions = {}): string | null {
  const key = name.trim().toUpperCase();
  const base = kind === 'transaction' ? own(TRANSACTION_TERMS_EN, key) : own(FUNCTION_TERMS_EN, key);
  if (base) return base;
  if (!engineReads310Apply(options.engineVersion === undefined ? APP_VERSION : options.engineVersion)) return null;
  return (kind === 'transaction' ? own(SAP_TRANSACTIONS, key) : own(SAP_FUNCTIONS, key)) ?? null;
}

/** The application prefixes of a customer table's name (`ZSD_`, `ZMM_`, `YFI_`): they say where it belongs, not what it holds. */
const MODULE_PREFIX = new Set(['sd', 'mm', 'fi', 'co', 'pp', 'pm', 'qm', 'wm', 'hr', 'ps', 'ca', 'bc', 'cs', 'le', 'im', 're',
  'tr', 'fm', 'ehs', 'gts', 'ewm', 'tm', 'crm', 'srm', 'bw', 'if', 'int', 'ic', 'mdg', 'pa', 'py', 'pt', 'om', 'tv', 'aa', 'gl',
  'ap', 'ar', 'cm', 'ml', 'pi', 'ecc', 'cc']);

/**
 * 3.1.0 (H5): a customer table (`ZFI_ABGRENZ`, `ZSD_PRICE_STRAT`) in the words its own name is made of — only when
 * every word of it is a word the engine knows (German through `german-terms.ts`, English through the glossary and the
 * dictionary). Its prefix (`Z`, `ZSD_`) says where it belongs and is dropped. Null where one word is not known: the
 * table is then said as the code it is. The code stays beside the words wherever the table is read (`readName`).
 */
function customTableTerm(key: string): PlainTerm | null {
  if (!/^[zy]/.test(key) || key.includes('/')) return null;
  const words = key.split('_').filter(Boolean);
  const head = words[0].slice(1);
  // `ZSD_…`, `Z_…`, and a customer's own short prefix (`ZFT_`, `ZPOS_`) when more words follow.
  if (MODULE_PREFIX.has(head) || head === '' || (head.length <= 3 && words.length > 1)) words.shift();
  else words[0] = head;
  // Every word at least three letters: a two-letter part (`BG`, `RR`) is an abbreviation no one has written down.
  if (!words.length || words.some((w) => w.length < 3 || /\d/.test(w))) return null;
  const german = translateGermanWords(words, 'item', TABLE_SOURCES_310);
  if (isUntranslatable(german)) return null;
  let singular: string;
  if (german) singular = singularPhrase(german.english.toLowerCase());
  else {
    const english = englishGlossaryWords();
    if (words.some((w) => !english.has(w))) return null;
    singular = singularPhrase(words.join(' '));
  }
  if (!singular.trim()) return null;
  return { singular: sentenceCase(singular), plural: sentenceCase(pluralOf(singular)) };
}

/** The singular of a phrase: its last word, unless that word does not inflect ("status", "data"). */
function singularPhrase(phrase: string): string {
  return /(?:status|data|analysis|ss|us)$/.test(phrase) ? phrase : singularOf(phrase);
}

/** 3.1.0: a table the label names by the words of its customer name (`customTableTerm`) — its code then stays beside it. */
function isCustomTableWord(name: string, ctx: PlainContext | undefined): boolean {
  const key = name.trim().toLowerCase();
  if (ctx?.customer && own(ctx.customer.tables, key)) return true;
  return !!ctx?.reads310 && !own(TABLE_TERMS_EN, key) && !own(SAP_TABLES, key) && customTableTerm(key) !== null;
}

function isInternalTable(identifier: string, ctx: PlainContext): boolean {
  const lower = cleanIdentifier(identifier);
  const base = lower.split(/->|=>|-|~/)[0];
  const selection = ctx.selections.get(base);
  if (selection?.selectOption) return false;
  if (/\[\s*\]/.test(identifier)) return true;
  if (ctx.tables.has(base)) return true;
  return /^(?:gt|lt|it|et|ct|mt|rt)_/.test(base) && !lower.includes('-');
}

function isSelectionField(identifier: string, ctx: PlainContext): boolean {
  const lower = cleanIdentifier(identifier);
  return ctx.selections.has(lower) || /^p_/.test(lower);
}

function singularOf(word: string): string {
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

function pluralOf(word: string): string {
  if (/(?:ss|sh|ch|x)$/.test(word) && !/status$/.test(word)) return `${word}es`;
  if (/s$/.test(word) || / data$|stock$|status$/.test(word)) return word;
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
  return `${word}s`;
}

/**
 * 3.1.0: the return table of a BAPI by its usual names — `gt_return`, `lt_ret`, `et_bapiret2`, `lt_messages`.
 * What it holds is the messages SAP returned, and that is what the label says.
 */
const RETURN_STEM = /^(?:return|returns|ret|rets|bapiret[12]?|bapireturn|messages|msgs|rettab|return_tab)$/;
const SAP_MESSAGE: PlainTerm = Object.freeze({ singular: 'message from SAP', plural: 'messages from SAP' });

/**
 * 3.1.0: what the rows of an internal table are, from where they come — the table's own name when it is a database
 * table the glossary knows (`gt_kna1`), the table a `SELECT` fills it from or its row type (`gt_auftr` from VBAK →
 * "sales order"), the messages SAP returned. Null before 3.1.0 and where nothing says it.
 */
function sourceTermOf(identifier: string, ctx: PlainContext | undefined): PlainTerm | null {
  if (!ctx?.reads310) return null;
  const base = cleanIdentifier(identifier).split(/->|=>|-|~/)[0];
  const stem = stemOf(identifier);
  if (RETURN_STEM.test(stem)) return SAP_MESSAGE;
  const source = ctx.sources?.get(base);
  return tableTermOf(stem, ctx) ?? (source ? tableTermOf(source, ctx, true) : null);
}

/**
 * 3.1.0: the database table an internal table is named after or filled from, when the glossary has no word for it
 * — said as the code it is ("entries of VBEP"), never as a plural made up from a table name ("vbeps").
 */
function sourceCodeOf(identifier: string, ctx: PlainContext | undefined): string | null {
  if (!ctx?.reads310) return null;
  const base = cleanIdentifier(identifier).split(/->|=>|-|~/)[0];
  const stem = stemOf(identifier);
  if (ctx.selected?.has(stem)) return stem.toUpperCase();
  const source = ctx.sources?.get(base);
  return source && ctx.selected?.has(source) ? source.toUpperCase() : null;
}

/** What one entry of an internal table is called: `gt_orders` → "order". */
function itemOf(identifier: string, ctx?: PlainContext): string {
  const stem = stemOf(identifier);
  const term = fieldTermOf(stem, ctx);
  if (term && !RETURN_STEM.test(stem)) return lcFirst(term.singular);
  const fromSource = sourceTermOf(identifier, ctx);
  if (fromSource) return lcFirst(fromSource.singular);
  if (term) return lcFirst(term.singular);
  const german = germanItem(stem, ctx);
  const code = sourceCodeOf(identifier, ctx);
  if (code && !german) return `entry of ${code}`;
  if (german === null) return `entry of ${technicalName(identifier)}`;
  if (german) return lcFirst(singularOf(german));
  return lcFirst(singularOf(humaniseStem(stem, ctx)));
}

/**
 * 3.1.0: what one row of an internal table is, only where something says it — the glossary, the dictionary, the
 * customer's texts, the table it is filled from, or a German name read in full. Null where only the name made into
 * words would say it ("meld", "esc").
 */
function knownItemOf(identifier: string, ctx: PlainContext): string | null {
  const stem = stemOf(identifier);
  const term = fieldTermOf(stem, ctx);
  if (term && !RETURN_STEM.test(stem)) return lcFirst(term.singular);
  const fromSource = sourceTermOf(identifier, ctx);
  if (fromSource) return lcFirst(fromSource.singular);
  const german = germanItem(stem, ctx);
  return german ? lcFirst(singularOf(german)) : null;
}

/** One row of a German-named table in English ("output line"); `null` when it cannot be read; '' when not German. */
function germanItem(stem: string, ctx?: PlainContext): string | null {
  const german = translateGermanWords(stem.split(/[_\s]+/), 'item', ctx?.reads310 ? FIELD_SOURCES_310 : FIELD_SOURCES);
  if (isUntranslatable(german)) return null;
  return german ? german.english : '';
}

/** An identifier as the source writes it, for a label that cannot word it. */
function technicalName(identifier: string): string {
  return cleanIdentifier(identifier).toUpperCase();
}

/** What several entries are called: `gt_orders` → "orders", `lt_kunnr` → "customer numbers". */
function itemsOf(identifier: string, ctx?: PlainContext): string {
  const stem = stemOf(identifier);
  const term = fieldTermOf(stem, ctx);
  if (term && !RETURN_STEM.test(stem)) return lcFirst(term.plural);
  const fromSource = sourceTermOf(identifier, ctx);
  if (fromSource) return lcFirst(fromSource.plural);
  if (term) return lcFirst(term.plural);
  const german = germanItem(stem, ctx);
  const code = sourceCodeOf(identifier, ctx);
  if (code && !german) return `entries of ${code}`;
  if (german === null) return `entries in ${technicalName(identifier)}`;
  if (german) return lcFirst(pluralOf(german));
  return lcFirst(pluralOf(humaniseStem(stem, ctx)));
}

/**
 * The business word for an identifier.
 *
 * `gs_eban-werks` → "Plant"; `s_vkorg` → "Sales organization" (through its
 * `FOR vbak-vkorg`); `p_lim` → "Limit"; `c_max_items` → its value when that
 * is a short literal; `gs_eban-xyz` → "XYZ of purchase requisition"; anything
 * else → the humanised name, never a guess.
 */
export function humaniseField(identifier: string, ctx?: PlainContext): string {
  return fieldWord(identifier, ctx, false);
}

function termWord(term: PlainTerm, short: boolean): string {
  return short && term.short ? term.short : term.singular;
}

function fieldWord(identifier: string, ctx: PlainContext | undefined, short: boolean): string {
  try {
    const c = contextOf(ctx);
    const raw = String(identifier ?? '').trim();
    if (!raw) return '';
    if (/^['`]/.test(raw)) return unquote(raw);
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return raw;
    const lower = cleanIdentifier(raw);
    if (lower === 'abap_true') return 'Yes';
    if (lower === 'abap_false' || lower === 'space') return 'No';
    if (lower.startsWith('sy-')) return SY_TERMS[lower] ?? humaniseStem(lower.slice(3), c);
    const constant = c.constants.get(lower);
    if (constant !== undefined && constant.trim() && constant.length <= 12) return constant;
    const selection = c.selections.get(lower);
    // 3.1.0 (H5b): the program's own selection text says what someone enters here.
    const selectionText = selection ? customerWord(c, 'selections', lower) : undefined;
    if (selectionText) return selectionText;
    if (selection?.ref) {
      const field = selection.ref.split('-').pop() ?? '';
      const term = fieldTermOf(field, c);
      if (term) return termWord(term, short);
    }
    const parts = lower.split(/->|=>|-|~/).filter(Boolean);
    if (parts.length > 1) {
      const field = parts[parts.length - 1];
      const term = fieldTermOf(field, c);
      if (term) return termWord(term, short);
      const owner = parts[parts.length - 2];
      const ownerType = c.types.get(owner) ?? owner.replace(IDENTIFIER_PREFIX, '');
      const table = tableTermOf(ownerType, c);
      if (table && !field.includes('_') && field.length <= 10) {
        return `${field.toUpperCase()} of ${lcFirst(table.singular)}`;
      }
      // 3.1.0: a dictionary field the glossary does not know is said as the code it is — "field PROFL" — never as
      // a word made up from it ("Profl"). The engine cannot know what the customer uses it for, and says so.
      if (c.reads310 && isFieldCode(field)) return `Field ${field.toUpperCase()}`;
      return humaniseStem(field.replace(IDENTIFIER_PREFIX, '') || field, c);
    }
    const stemTerm = fieldTermOf(stemOf(lower), c);
    if (stemTerm) return termWord(stemTerm, short);
    // 3.1.0: a variable typed on a dictionary field (`lv_profl TYPE mara-profl`) — the same: the field's code.
    const typedOn = c.types.get(lower) ?? '';
    const typedField = /^[\w/]+-([\w]+)$/.exec(typedOn)?.[1];
    if (c.reads310 && typedField && typedField === stemOf(lower) && isFieldCode(typedField)) return `Field ${typedField.toUpperCase()}`;
    // 3.1.0: typed on a field the dictionary knows (`lv_x TYPE mara-profl`) — the field's word.
    const typedTerm = c.reads310 && typedField ? own(SAP_FIELDS, typedField) : undefined;
    if (typedTerm) return termWord(typedTerm, short);
    return humaniseStem(stemOf(lower), c);
  } catch {
    return String(identifier ?? '');
  }
}

/**
 * A routine, function module or event name as words: `READ_REQUISITION` →
 * "Read requisition", `CHANGE_SALES_ORDER_BDC` → "Change sales order by simulated entry".
 */
export function humaniseRoutine(name: string, ctx?: PlainContext): string {
  return routineWords(name, true, ctx);
}

/**
 * `withOriginal`: a translated German name carries its original in
 * parentheses — for a step. Inside a condition ("Check not set?") it does not.
 */
function routineWords(name: string, withOriginal: boolean, ctx?: PlainContext): string {
  try {
    let words = String(name ?? '').trim().toLowerCase()
      .replace(/^\/\w+\//, '')
      .split(/[_\s-]+/).filter(Boolean);
    if (words.length > 1 && (words[0] === 'z' || words[0] === 'y')) words = words.slice(1);
    else if (words.length && /^[zy][a-z]{0,2}$/.test(words[0]) && words.length > 1 && words[0].length === 1) {
      words = words.slice(1);
    }
    // A German name in English, the original in parentheses: `DATEN_LESEN` →
    // "Read data (Daten lesen)". One that cannot be read in full is shown as
    // the source writes it.
    const german = translateGermanWords(words, 'routine', ctx?.reads310 ? ROUTINE_SOURCES_310 : ROUTINE_SOURCES);
    if (isUntranslatable(german)) return String(name).trim().toUpperCase();
    if (german) {
      const english = withoutTechnique(german.english);
      return withOriginal ? `${english} (${german.original ?? String(name).trim().toUpperCase()})` : english;
    }
    const out = words.map((w) => (Object.prototype.hasOwnProperty.call(ROUTINE_ABBREVIATIONS, w) ? ROUTINE_ABBREVIATIONS[w] : wordCase(w)));
    return sentenceCase(withoutTechnique(out.join(' ')));
  } catch {
    return String(name ?? '');
  }
}

/**
 * A routine name says what the routine does in the words its developer chose —
 * and those words often name the SAP technique instead (owner, 11.10.2026:
 * "does a business consumer understand 'ALV list'?"). The technique words of a
 * name are said in business words; nothing is added that the name does not say:
 *
 * - `batch input` (and `BDC`, through `ROUTINE_ABBREVIATIONS`) is the way the
 *   step does its work, so it moves behind what is done — `CREATE_PO_BATCH_INPUT`
 *   → "Create purchase order by simulated entry";
 * - `field catalog` is what an ALV list calls its column definition → "list columns".
 *
 * `ALV` itself is "result list" in `ROUTINE_ABBREVIATIONS`. The name as the
 * source writes it stays the element's technical name.
 */
function withoutTechnique(words: string): string {
  let text = words.replace(/\bfield catalog\b/gi, 'list columns');
  if (/\bbatch input\b/i.test(text)) {
    const rest = text.replace(/\s*\bbatch input\b\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    text = rest ? `${rest} by simulated entry` : 'simulated entry';
  }
  return text;
}

function humaniseLiteralValue(value: string): string {
  const text = unquote(value);
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(text)) return sentenceCase(text.toLowerCase().replace(/_/g, ' '));
  return text;
}

/** Shortens free text to about six words. */
function shortText(text: string, words = 6): string {
  const parts = text.replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '').split(' ');
  if (parts.length <= words) return parts.join(' ');
  return `${parts.slice(0, words).join(' ')}…`;
}

/** Keeps a label within `max` characters, cutting at a word boundary. */
function fit(label: string, max = MAX_LABEL): string {
  const s = label.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  // The original of a translated name ("Read data (Daten lesen)") does not count
  // against the limit while it is short; a long one is dropped, never cut.
  const note = /^(.+) \([^()]+\)$/.exec(s);
  if (note) {
    if (note[1].length <= max && s.length <= max + ORIGINAL_NOTE_ROOM) return s;
    return fit(note[1], max);
  }
  const question = s.endsWith('?');
  const room = max - 1 - (question ? 1 : 0);
  let cut = s.slice(0, room);
  const space = cut.lastIndexOf(' ');
  if (space > room / 2) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,:;–-]+$/, '')}…${question ? '?' : ''}`;
}

/** The first wording that fits a label whole; the last one, shortened, when none does. */
function firstFitting(candidates: readonly string[]): string {
  const whole = candidates.find((c) => c.replace(/\s+/g, ' ').trim().length <= MAX_LABEL);
  return fit(whole ?? candidates[candidates.length - 1] ?? '');
}

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

type CmpOp =
  | '=' | '<>' | '>' | '<' | '>=' | '<='
  | 'CP' | 'NP' | 'CS' | 'NS' | 'CO' | 'CN' | 'CA' | 'NA'
  | 'initial' | 'notinitial' | 'bound' | 'notbound'
  | 'in' | 'notin' | 'between' | 'notbetween' | 'truthy' | 'falsy';

type Cond =
  | { k: 'and' | 'or'; parts: Cond[] }
  | { k: 'cmp'; left: string; op: CmpOp; right: string; right2?: string };

const COMPARE: Readonly<Record<string, CmpOp>> = Object.freeze({
  '=': '=', EQ: '=', '<>': '<>', NE: '<>', '><': '<>', '>': '>', GT: '>', '<': '<', LT: '<',
  '>=': '>=', GE: '>=', '=>': '>=', '<=': '<=', LE: '<=', '=<': '<=',
  CP: 'CP', NP: 'NP', CS: 'CS', NS: 'NS', CO: 'CO', CN: 'CN', CA: 'CA', NA: 'NA',
});

const NEGATE: Readonly<Record<CmpOp, CmpOp>> = Object.freeze({
  '=': '<>', '<>': '=', '>': '<=', '<=': '>', '<': '>=', '>=': '<',
  CP: 'NP', NP: 'CP', CS: 'NS', NS: 'CS', CO: 'CN', CN: 'CO', CA: 'NA', NA: 'CA',
  initial: 'notinitial', notinitial: 'initial', bound: 'notbound', notbound: 'bound',
  in: 'notin', notin: 'in', between: 'notbetween', notbetween: 'between', truthy: 'falsy', falsy: 'truthy',
});

const ARITHMETIC = new Set(['+', '-', '*', '/', '**', 'MOD', 'DIV']);
const LOGICAL = new Set(['AND', 'OR', 'NOT', 'EQUIV']);

function tokenize(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === ch) {
          if (text[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      let end = Math.min(j + 1, text.length);
      const symbol = /^\(\w{1,3}\)/.exec(text.slice(end));
      if (symbol) end += symbol[0].length;
      out.push(text.slice(i, end));
      i = end;
      continue;
    }
    let j = i;
    while (j < text.length && !/\s/.test(text[j]) && text[j] !== "'" && text[j] !== '`') j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

class ConditionParser {
  private i = 0;
  constructor(private readonly tokens: string[]) {}

  parse(): Cond | null {
    const c = this.or();
    return c && this.i === this.tokens.length ? c : null;
  }

  private peek(): string {
    return this.tokens[this.i] ?? '';
  }

  private up(): string {
    return this.peek().toUpperCase();
  }

  private or(): Cond | null {
    const parts: Cond[] = [];
    const first = this.and();
    if (!first) return null;
    parts.push(first);
    while (this.up() === 'OR') {
      this.i++;
      const next = this.and();
      if (!next) return null;
      parts.push(next);
    }
    return parts.length === 1 ? parts[0] : { k: 'or', parts };
  }

  private and(): Cond | null {
    const parts: Cond[] = [];
    const first = this.not();
    if (!first) return null;
    parts.push(first);
    while (this.up() === 'AND') {
      this.i++;
      const next = this.not();
      if (!next) return null;
      parts.push(next);
    }
    return parts.length === 1 ? parts[0] : { k: 'and', parts };
  }

  private not(): Cond | null {
    if (this.up() === 'NOT') {
      this.i++;
      const inner = this.not();
      return inner ? negate(inner) : null;
    }
    return this.primary();
  }

  private primary(): Cond | null {
    if (this.peek() === '(') {
      this.i++;
      const inner = this.or();
      if (!inner || this.peek() !== ')') return null;
      this.i++;
      return inner;
    }
    return this.relation();
  }

  private term(): string | null {
    const token = this.peek();
    if (!token || token === ')' || token === '(') return null;
    const upper = token.toUpperCase();
    if (LOGICAL.has(upper) || COMPARE[upper] || upper === 'IS' || upper === 'IN' || upper === 'BETWEEN') {
      return null;
    }
    this.i++;
    if (!token.endsWith('(')) return token;
    // A functional call or a table expression: collect up to the matching parenthesis.
    const parts = [token];
    let depth = 1;
    while (this.i < this.tokens.length && depth > 0) {
      const t = this.tokens[this.i++];
      parts.push(t);
      if (t.endsWith('(')) depth++;
      if (t.startsWith(')')) depth--;
    }
    return depth === 0 ? parts.join(' ') : null;
  }

  private operand(): string | null {
    const first = this.term();
    if (first === null) return null;
    const parts = [first];
    while (ARITHMETIC.has(this.up())) {
      parts.push(this.tokens[this.i++].toUpperCase());
      const next = this.term();
      if (next === null) return null;
      parts.push(next);
    }
    return parts.join(' ');
  }

  private relation(): Cond | null {
    const left = this.operand();
    if (left === null) return null;
    const op = this.up();
    if (op === 'IS') {
      this.i++;
      let negated = false;
      if (this.up() === 'NOT') {
        negated = true;
        this.i++;
      }
      const what = this.up();
      this.i++;
      let base: CmpOp;
      if (what === 'INITIAL') base = 'initial';
      else if (what === 'BOUND' || what === 'ASSIGNED' || what === 'SUPPLIED' || what === 'REQUESTED') base = 'bound';
      else if (what === 'INSTANCE') {
        if (this.up() !== 'OF') return null;
        this.i += 2;
        base = 'bound';
      } else return null;
      return { k: 'cmp', left, op: negated ? NEGATE[base] : base, right: '' };
    }
    let negated = false;
    if (op === 'NOT' && (this.tokens[this.i + 1] ?? '').toUpperCase().match(/^(BETWEEN|IN)$/)) {
      negated = true;
      this.i++;
    }
    const keyword = this.up();
    if (keyword === 'BETWEEN') {
      this.i++;
      const low = this.operand();
      if (low === null || this.up() !== 'AND') return null;
      this.i++;
      const high = this.operand();
      if (high === null) return null;
      return { k: 'cmp', left, op: negated ? 'notbetween' : 'between', right: low, right2: high };
    }
    if (keyword === 'IN') {
      this.i++;
      const range = this.operand();
      if (range === null) return null;
      return { k: 'cmp', left, op: negated ? 'notin' : 'in', right: range };
    }
    const compare = COMPARE[keyword];
    if (compare) {
      this.i++;
      const right = this.operand();
      if (right === null) return null;
      return { k: 'cmp', left, op: compare, right };
    }
    // A predicate on its own: `line_exists( … )`, a boolean method call.
    return { k: 'cmp', left, op: 'truthy', right: '' };
  }
}

function negate(c: Cond): Cond {
  if (c.k === 'cmp') return { ...c, op: NEGATE[c.op] };
  return { k: c.k === 'and' ? 'or' : 'and', parts: c.parts.map(negate) };
}

/** `IF x.` → `x`: the keyword and the period go, the condition stays. */
function stripCondition(condition: string): string {
  return String(condition ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:IF|ELSEIF|CHECK|WHILE|WHEN)\s+/i, '')
    .replace(/\s*\.$/, '');
}

function parseCondition(condition: string): Cond | null {
  try {
    const text = stripCondition(condition);
    if (!text) return null;
    return new ConditionParser(tokenize(text)).parse();
  } catch {
    return null;
  }
}

/* --- what set sy-subrc -------------------------------------------------- */

type Setter =
  | { kind: 'select'; table: string; single: boolean }
  | { kind: 'read-table'; table: string }
  /** 3.1.0: `READ TABLE gt_return … WITH KEY type = 'E'` — a search for an error message SAP returned. */
  | { kind: 'sap-error' }
  | { kind: 'authority' | 'call' | 'open' | 'dataset' | 'write' | 'loop' | 'assign' | 'find' | 'unknown' };

const BLOCK_START = /^(?:FORM|ENDFORM|METHOD|ENDMETHOD|MODULE|ENDMODULE|FUNCTION|ENDFUNCTION|START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|AT\s|LOAD-OF-PROGRAM|TOP-OF-PAGE)\b/i;

/** Looks backwards from a line for the statement whose `sy-subrc` the condition reads. */
function setterBefore(ctx: PlainContext, line: number | undefined): Setter {
  if (!line) return { kind: 'unknown' };
  const before = ctx.statements.filter((s) => s.line < line);
  for (let i = before.length - 1; i >= 0; i--) {
    const text = before[i].text;
    if (BLOCK_START.test(text)) break;
    if (/^SELECT\b/i.test(text)) {
      const table = /\bFROM\s+([\w/]+)/i.exec(text)?.[1] ?? '';
      const single = /^SELECT\s+SINGLE\b/i.test(text) || /\bUP\s+TO\s+1\s+ROWS\b/i.test(text);
      return { kind: 'select', table, single };
    }
    if (/^READ\s+TABLE\b/i.test(text)) {
      const table = /^READ\s+TABLE\s+([\w<>\-[\]/]+)/i.exec(text)?.[1] ?? '';
      if (ctx.reads310 && isReturnTable(table, ctx) && /\bWITH\s+KEY\b[\s\S]*\b(?:type|msgty)\s*=\s*'[EA]'/i.test(text)) {
        return { kind: 'sap-error' };
      }
      return { kind: 'read-table', table };
    }
    if (/^READ\s+DATASET\b/i.test(text)) return { kind: 'dataset' };
    if (/^AUTHORITY-CHECK\b/i.test(text)) return { kind: 'authority' };
    if (/^CALL\s+(?:FUNCTION|TRANSACTION|METHOD|DIALOG)\b/i.test(text)) return { kind: 'call' };
    if (/^OPEN\s+DATASET\b/i.test(text)) return { kind: 'open' };
    if (/^(?:INSERT|UPDATE|MODIFY|DELETE)\b/i.test(text)) return { kind: 'write' };
    if (/^(?:LOOP\s+AT|ENDLOOP)\b/i.test(text)) return { kind: 'loop' };
    if (/^ASSIGN\b/i.test(text)) return { kind: 'assign' };
    if (/^FIND\b/i.test(text)) return { kind: 'find' };
  }
  return { kind: 'unknown' };
}

/** 3.1.0: a table or structure that holds the messages a BAPI returned — by its name or its type (`BAPIRET2`). */
function isReturnTable(identifier: string, ctx: PlainContext): boolean {
  const lower = cleanIdentifier(identifier);
  const base = lower.split(/->|=>|-|~/)[0];
  if (RETURN_STEM.test(stemOf(base))) return true;
  const type = ctx.types.get(base) ?? ctx.sources?.get(base) ?? '';
  return /^bapiret|^bapireturn/.test(type);
}

/**
 * 3.1.0: does a comparison ask whether SAP returned an error? `ls_return-type = 'E'`, `ls_ret-type CA 'EA'`,
 * `line_exists( lt_return[ type = 'E' ] )` → true; their negations → false; anything else → null. Only on a table or
 * structure the code names or types as a BAPI's return (`isReturnTable`), and only for the types E and A.
 */
function sapErrorCheck(c: Extract<Cond, { k: 'cmp' }>, ctx: PlainContext): boolean | null {
  if (!ctx.reads310) return null;
  const left = c.left.trim();
  const exists = /^line_exists\(\s*([\w<>/-]+)\s*\[\s*(?:type|msgty)\s*=\s*'([EA])'\s*\]\s*\)$/i.exec(left);
  if (exists && isReturnTable(exists[1], ctx)) {
    if (c.op === 'truthy') return true;
    if (c.op === 'falsy') return false;
    return null;
  }
  const field = /^([\w<>/]+)-(?:type|msgty)$/i.exec(left);
  if (!field || !isReturnTable(field[1], ctx)) return null;
  const value = unquote(c.right).toUpperCase();
  if ((c.op === '=' || c.op === '<>') && /^[EA]$/.test(value)) return c.op === '=';
  if ((c.op === 'CA' || c.op === 'NA') && /^[EAX]+$/.test(value) && /E/.test(value)) return c.op === 'CA';
  return null;
}

/** "Found"/"Nothing found" and their kin, as specific as the setter allows. */
function subrcPhrase(setter: Setter, success: boolean, short: boolean, ctx?: PlainContext): string {
  switch (setter.kind) {
    case 'sap-error': return success ? 'SAP reported an error' : 'No error from SAP';
    case 'select': {
      const term = tableTermOf(setter.table, ctx, true);
      if (!term || short) return success ? 'Found' : 'Nothing found';
      const word = setter.single ? term.singular : term.plural;
      return success ? `${word} found` : `No ${lcFirst(word)} found`;
    }
    case 'read-table': {
      if (short || !setter.table) return success ? 'Found' : 'Nothing found';
      const item = itemOf(setter.table, ctx);
      return success ? `${sentenceCase(item)} found` : `No ${item} found`;
    }
    case 'authority': return success ? 'Authorized' : 'Not authorized';
    case 'call': return success ? 'Call successful' : 'Call failed';
    case 'open': return success ? 'File opened' : 'File not opened';
    case 'dataset': return success ? 'Line read' : 'End of file';
    case 'write': return success ? 'Saved' : 'Not saved';
    case 'loop': return success ? 'Entries found' : 'No entries';
    case 'assign': return success ? 'Assigned' : 'Not assigned';
    case 'find': return success ? 'Found' : 'Not found';
    default: return success ? 'Successful' : 'Failed';
  }
}

/* --- rendering -------------------------------------------------------- */

interface Env {
  ctx: PlainContext;
  line?: number;
  short: boolean;
  /**
   * The wording of a business rule (`ruleConditionText`), not of a label: no
   * length limit, a compound condition as a list, and `sy-subrc` named after
   * the step that set it even where a label would say only "Failed".
   */
  rule?: boolean;
}

/**
 * What a fixed value of an SAP standard field means (`FIELD_VALUE_TERMS_EN`):
 * `ps_item-shkzg` and `'H'` → "credit". Null for any field or value not listed.
 */
function valueMeaning(left: string, value: string, ctx: PlainContext): string | null {
  const lower = cleanIdentifier(left);
  const selection = ctx.selections.get(lower);
  const field = selection?.ref ? (selection.ref.split('-').pop() ?? '') : stemOf(lower);
  const key = field.toLowerCase();
  const customerValues = ctx.customer ? own(ctx.customer.values, key) : undefined;
  const customerValue = customerValues ? own(customerValues, value.trim().toUpperCase()) : undefined;
  if (customerValue) {
    ctx.customerUsed?.set(`${key.toUpperCase()} = ${value.trim().toUpperCase()}`, customerValue);
    return customerValue;
  }
  const values = own(FIELD_VALUE_TERMS_EN, key) ?? (ctx.reads310 ? own(SAP_FIELD_VALUES, key) : undefined);
  return values ? (own(values, value.trim().toUpperCase()) ?? null) : null;
}

/** `ls_ref-kunnr` → "reference": the structure a component belongs to, in words; null for a plain variable. */
function ownerWord(operand: string): string | null {
  const parts = cleanIdentifier(operand).split(/->|=>|-|~/).filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[parts.length - 2];
  // A FORM parameter's `ps_`/`pt_`/`pv_` is a prefix too, here: `ps_item` is "item".
  const stem = owner.replace(IDENTIFIER_PREFIX, '').replace(/^p[stvo]_/, '') || owner;
  return lcFirst(humaniseStem(stem));
}

/** `sy-subrc` in a business rule: what the step before it did, in a sentence. */
function ruleSubrcPhrase(setter: Setter, success: boolean, ctx?: PlainContext): string {
  switch (setter.kind) {
    case 'sap-error': return success ? 'SAP reported an error' : 'SAP reported no error';
    case 'select': {
      if (tableTermOf(setter.table, ctx, true)) return subrcPhrase(setter, success, false, ctx);
      return success ? 'The previous read found an entry' : 'The previous read found nothing';
    }
    case 'read-table':
      return success ? 'The previous read found an entry' : 'The previous read found nothing';
    case 'authority': return success ? 'The authorization check passed' : 'The authorization check failed';
    case 'call': return success ? 'The previous call succeeded' : 'The previous call failed';
    case 'open': return success ? 'The file was opened' : 'The file could not be opened';
    case 'dataset': return success ? 'A line of the file was read' : 'The end of the file was reached';
    case 'write': return success ? 'The previous database change succeeded' : 'The previous database change failed';
    case 'loop': return success ? 'The previous loop found entries' : 'The previous loop found no entries';
    case 'assign': return success ? 'The assignment succeeded' : 'The assignment failed';
    case 'find': return success ? 'The search found a match' : 'The search found nothing';
    default: return success ? 'The previous step succeeded' : 'The previous step failed';
  }
}

interface AtomText {
  /** Normalised left operand — two atoms on the same field share it. */
  key: string;
  subject: string;
  /** The whole phrase, sentence case. */
  full: string;
  /** The predicate without the subject, lower case: "above 180", "missing". */
  pred: string;
  /** The predicate as an arm of a several-armed decision on one field. */
  arm: string;
  /** For a comparison with a literal: the literal alone. */
  value?: string;
  /** Question form when it is not `full + '?'`. */
  question?: string;
  /** True when the question's "Yes" is the branch where the condition is false. */
  inverted?: boolean;
  /** For merging "A and B selected": the predicate shared by subjects. */
  sharedPred?: string;
}

const TRUE_VALUES = new Set(['abap_true', "'x'", '`x`']);
const FALSE_VALUES = new Set(['abap_false', 'space', "''", "' '", '``', '` `']);

function isParticiple(identifier: string, ctx?: PlainContext): boolean {
  const words = humaniseStem(stemOf(identifier), ctx).toLowerCase();
  if (/ed$/.test(words) || STATE_WORDS.has(words)) return true;
  // 3.1.0: a name that ends in a state ("batch input session open") reads as that state.
  return !!ctx?.reads310 && / /.test(words) && STATE_WORDS.has(words.split(' ').pop() ?? '');
}

/**
 * 3.1.0 (owner decision 06.11.2026): the SAP field an operand reads when the glossary every engine reads has no word
 * for it — a dictionary field (`is_mat-profl`, "dangerous goods profile") or a field code the engine cannot word at all
 * (`ls_x-zzflag`). Its upper-case code, or null. A selection field, a system field and an internal table are not one.
 */
function unstatedFieldOf(operand: string, ctx: PlainContext): string | null {
  if (!ctx.reads310) return null;
  const lower = cleanIdentifier(operand);
  if (!/^[\w/<>~-]+$/.test(lower) || lower.startsWith('sy-') || ctx.selections.has(lower)) return null;
  const parts = lower.split(/->|=>|-|~/).filter(Boolean);
  const field = parts.length > 1 ? parts[parts.length - 1] : /^[\w/]+-([\w]+)$/.exec(ctx.types.get(lower) ?? '')?.[1];
  if (!field || own(FIELD_TERMS_EN, field)) return null;
  return isDictionaryField(field, ctx) || isFieldCode(field) ? field.toUpperCase() : null;
}

/** The note an unknown check carries (owner decision 06.11.2026), with the fields it reads. */
export function unstatedCheckNote(fields: readonly string[]): string {
  const list = [...new Set(fields)];
  return list.length ? `The code does not say what this check means (field${list.length > 1 ? 's' : ''} ${list.join(', ')}).` : '';
}

/**
 * 3.1.0: the fields of a condition whose meaning the code does not state — a field tested for being set or empty, or
 * compared with a value SAP does not define for every system. A comparison with a value of a fixed SAP domain
 * ("Overall status C (completely processed)") says what it means and is not listed.
 */
function unstatedFieldsOf(condition: string, ctx: PlainContext): string[] {
  if (!ctx.reads310) return [];
  const parsed = parseCondition(condition);
  if (!parsed) return [];
  const out: string[] = [];
  const walk = (c: Cond) => {
    if (c.k !== 'cmp') {
      c.parts.forEach(walk);
      return;
    }
    for (const side of [c.left, c.right]) {
      const code = side ? unstatedFieldOf(side, ctx) : null;
      if (!code) continue;
      const literal = /^['`]/.test(c.right.trim()) ? unquote(c.right) : null;
      if (side === c.left && literal !== null && valueMeaning(c.left, literal, ctx)) continue;
      out.push(code);
    }
  };
  walk(parsed);
  return out;
}

function valueText(operand: string, env: Env): { text: string; literal: boolean } {
  const raw = operand.trim();
  if (/^['`]/.test(raw)) return { text: unquote(raw), literal: true };
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return { text: raw, literal: true };
  const lower = cleanIdentifier(raw);
  const constant = env.ctx.constants.get(lower);
  if (constant !== undefined && constant.trim() && constant.length <= 12) return { text: constant, literal: true };
  if (lower === 'sy-datum') return { text: 'today', literal: true };
  return { text: lcFirst(humaniseOperand(raw, env.ctx, env.short)), literal: false };
}

/** An operand that may be arithmetic or a call, as words. */
function humaniseOperand(operand: string, ctx: PlainContext, short = false): string {
  const text = operand.trim();
  // Offset and length — `gs_konv-kschl(1)`, `lv_text+2(3)` — are a part of
  // the field, not a call.
  const part = /^([\w<>~/-]+?)(?:\+(\d+))?\((\d+)\)$/.exec(text);
  if (part) {
    const field = lcFirst(fieldWord(part[1], ctx, short));
    const offset = Number(part[2] ?? 0);
    const length = Number(part[3]);
    if (offset === 0) return length === 1 ? `First character of ${field}` : `First ${length} characters of ${field}`;
    return length === 1
      ? `Character ${offset + 1} of ${field}`
      : `Characters ${offset + 1} to ${offset + length} of ${field}`;
  }
  if (/\(/.test(text)) {
    const fn = /^([\w~>=-]+)\(/.exec(text)?.[1] ?? '';
    if (/^line_exists$/i.test(fn)) return 'Entry exists';
    if (/^lines$/i.test(fn)) {
      const inner = /\(\s*([\w<>\-[\]]+)\s*\)/.exec(text)?.[1];
      return inner ? `Number of ${itemsOf(inner, ctx)}` : 'Number of entries';
    }
    const name = fn.split(/->|=>/).pop() ?? fn;
    // 3.1.0 (AB-15a): a getter is the value it gets — `get_status( )` is the status, not "Get status".
    const got = ctx.reads310 ? /^get_?(\w+)$/i.exec(name.split('~').pop() ?? name)?.[1] : undefined;
    if (got) return humaniseOperand(got, ctx, short);
    return routineWords(name, false, ctx) || 'Result';
  }
  const tokens = text.split(/\s+/);
  if (tokens.length === 1) return fieldWord(text, ctx, short);
  return sentenceCase(tokens.map((t, i) => {
    const upper = t.toUpperCase();
    if (upper === 'MOD') return 'modulo';
    if (upper === 'DIV') return 'divided by';
    if (ARITHMETIC.has(upper)) return t;
    const word = fieldWord(t, ctx, short);
    return i === 0 ? word : lcFirst(word);
  }).join(' '));
}

function atomText(c: Extract<Cond, { k: 'cmp' }>, env: Env): AtomText {
  const left = c.left.trim();
  const leftLower = cleanIdentifier(left);
  const key = leftLower;

  // sy-subrc: what the statement before it did.
  if (leftLower === 'sy-subrc') {
    const right = cleanIdentifier(c.right);
    let success: boolean | null = null;
    if (right === '0') {
      if (c.op === '=') success = true;
      else if (c.op === '<>' || c.op === '>') success = false;
    } else if (/^\d+$/.test(right) && (c.op === '=' || c.op === '>=')) {
      success = false;
    }
    if (success !== null) {
      const setter = setterBefore(env.ctx, env.line);
      const phrase = env.rule ? ruleSubrcPhrase(setter, success, env.ctx) : subrcPhrase(setter, success, env.short, env.ctx);
      const question = setter.kind === 'sap-error' && success && !env.rule ? 'Did SAP report an error?' : undefined;
      return { key, subject: phrase, full: phrase, pred: lcFirst(phrase), arm: phrase, ...(question ? { question } : {}) };
    }
    const value = cleanIdentifier(c.right);
    const code = env.rule ? 'Return code of the previous step' : 'Return code';
    const phrase = c.op === '=' ? `${code} ${value}` : `${code} ${opWords(c.op, value)}`;
    return { key, subject: 'Return code', full: phrase, pred: lcFirst(phrase), arm: phrase };
  }

  // 3.1.0: the result check of a BAPI — whether SAP returned an error — said as that, not as a field test.
  const sapError = sapErrorCheck(c, env.ctx);
  if (sapError !== null) {
    const phrase = sapError ? 'SAP reported an error' : (env.rule ? 'SAP reported no error' : 'No error from SAP');
    const key2 = 'sap-error';
    return { key: key2, subject: phrase, full: phrase, pred: lcFirst(phrase), arm: phrase, ...(sapError && !env.rule ? { question: 'Did SAP report an error?' } : {}) };
  }

  // `x MOD n = 0`
  const mod = /^(.+?)\s+MOD\s+(\d+)$/i.exec(left);
  if (mod && c.op === '=' && cleanIdentifier(c.right) === '0') {
    const subject = humaniseOperand(mod[1], env.ctx, env.short);
    const pred = `multiple of ${mod[2]}`;
    return { key, subject, full: `${subject} ${pred}`, pred, arm: sentenceCase(pred) };
  }

  const subject = humaniseOperand(left, env.ctx, env.short);
  const rightLower = cleanIdentifier(c.right);
  const table = isInternalTable(left, env.ctx);
  const selection = isSelectionField(left, env.ctx);

  // Flags: `= abap_true`, `= 'X'`, `= abap_false`, `= space`.
  let flag: boolean | null = null;
  if ((c.op === '=' || c.op === '<>') && c.right) {
    const raw = c.right.trim().toLowerCase();
    if (TRUE_VALUES.has(raw) || TRUE_VALUES.has(rightLower)) flag = c.op === '=';
    else if (FALSE_VALUES.has(raw) || FALSE_VALUES.has(rightLower)) flag = c.op !== '=';
  }
  if (flag !== null) {
    const participle = !selection && isParticiple(left, env.ctx);
    const setWord = selection ? 'selected' : 'set';
    if (flag) {
      const full = participle ? subject : `${subject} ${setWord}`;
      return { key, subject, full, pred: setWord, arm: sentenceCase(setWord), sharedPred: setWord };
    }
    const notWord = `not ${setWord}`;
    const full = participle ? `Not ${lcFirst(subject)}` : `${subject} ${notWord}`;
    return { key, subject, full, pred: notWord, arm: sentenceCase(notWord), sharedPred: notWord };
  }

  if (c.op === 'initial' || c.op === 'notinitial') {
    const empty = c.op === 'initial';
    if (table) {
      const items = itemsOf(left, env.ctx);
      return {
        key,
        subject: sentenceCase(items),
        full: empty ? `No ${items}` : `${sentenceCase(items)} present`,
        pred: empty ? 'empty' : 'present',
        arm: empty ? 'Empty' : 'Present',
        question: `Any ${items}?`,
        inverted: empty,
      };
    }
    // 3.1.0 (owner decision 06.11.2026): an SAP field is set or not set — "Dangerous goods profile set?", never
    // "Field PROFL given?". "Given" stays for what someone entered.
    if (!env.rule && !selection && unstatedFieldOf(left, env.ctx)) {
      return {
        key,
        subject,
        full: empty ? `${subject} not set` : `${subject} set`,
        pred: empty ? 'not set' : 'set',
        arm: empty ? 'Not set' : 'Set',
        question: `${subject} set?`,
        inverted: empty,
        sharedPred: empty ? 'not set' : 'set',
      };
    }
    if (env.rule) {
      // In a rule's list "is empty"/"is filled" reads where "No …" would not.
      const pred = empty ? 'is empty' : 'is filled';
      return { key, subject, full: `${subject} ${pred}`, pred, arm: sentenceCase(pred), sharedPred: pred };
    }
    return {
      key,
      subject,
      full: empty ? `No ${lcFirst(subject)}` : `${subject} given`,
      pred: empty ? 'missing' : 'given',
      arm: empty ? 'Missing' : 'Given',
      question: `${subject} given?`,
      inverted: empty,
      sharedPred: empty ? 'missing' : 'given',
    };
  }

  if (c.op === 'bound' || c.op === 'notbound') {
    const pred = c.op === 'bound' ? 'available' : 'not available';
    return { key, subject, full: `${subject} ${pred}`, pred, arm: sentenceCase(pred), sharedPred: pred };
  }

  if (c.op === 'truthy' || c.op === 'falsy') {
    const yes = c.op === 'truthy';
    if (/^line_exists\(/i.test(left)) {
      // 3.1.0: what is looked up, in the list it is looked up in — "Sales order in the list?", not "Entry exists?".
      const table = env.ctx.reads310 ? /^line_exists\(\s*([\w<>/-]+)\s*\[/i.exec(left)?.[1] : undefined;
      if (table) {
        const item = sentenceCase(itemOf(table, env.ctx));
        const phrase = yes ? `${item} in the list` : `${item} not in the list`;
        return { key, subject: phrase, full: phrase, pred: lcFirst(phrase), arm: phrase, question: `${item} in the list?`, inverted: !yes };
      }
      const phrase = yes ? 'Entry exists' : 'No entry exists';
      return { key, subject: phrase, full: phrase, pred: lcFirst(phrase), arm: phrase };
    }
    const full = yes ? subject : `Not ${lcFirst(subject)}`;
    return { key, subject, full, pred: yes ? 'true' : 'not true', arm: full };
  }

  if (c.op === 'in' || c.op === 'notin') {
    const pred = c.op === 'in' ? 'in selection' : 'not in selection';
    return { key, subject, full: `${subject} ${pred}`, pred, arm: sentenceCase(pred), sharedPred: pred };
  }

  if (c.op === 'between' || c.op === 'notbetween') {
    const low = valueText(c.right, env).text;
    const high = valueText(c.right2 ?? '', env).text;
    const pred = `${c.op === 'between' ? '' : 'not '}between ${low} and ${high}`;
    return { key, subject, full: `${subject} ${pred}`, pred, arm: sentenceCase(pred) };
  }

  const value = valueText(c.right, env);
  // A fixed value SAP defines for the field ('H' of the debit/credit
  // indicator) carries its meaning; the value itself stays beside it.
  // A label too long for it drops the meaning before it drops the condition.
  const meaning = value.literal && (env.rule || !env.short) && /^['`]/.test(c.right.trim())
    ? valueMeaning(left, value.text, env.ctx)
    : null;
  if (meaning) value.text = `${value.text} (${meaning})`;
  if (c.op === '=' && value.literal) {
    if (value.text === '0') {
      return { key, subject, full: `${subject} zero`, pred: 'zero', arm: 'Zero' };
    }
    return { key, subject, full: `${subject} ${value.text}`, pred: value.text, arm: value.text, value: value.text };
  }
  if (c.op === '<>' && value.literal) {
    const pred = value.text === '0' ? 'not zero' : `not ${value.text}`;
    return { key, subject, full: `${subject} ${pred}`, pred, arm: sentenceCase(pred), value: value.text };
  }
  // The same field on both sides — `ls_ref-kunnr <> ps_item-kunnr` — is
  // told apart by the structures that hold it, not read as "customer number
  // differs from customer number".
  if (!value.literal && value.text.toLowerCase() === subject.toLowerCase()) {
    const ownerLeft = ownerWord(left);
    const ownerRight = ownerWord(c.right);
    // 3.1.0: where the owners do not fit a label, the two values are said to differ — or to be the same.
    if (env.ctx.reads310 && env.short && !env.rule && (c.op === '<>' || c.op === '=')) {
      const many = sentenceCase(pluralOf(lcFirst(subject)));
      const phrase = c.op === '<>' ? `${many} differ` : `Same ${lcFirst(subject)}`;
      return { key, subject: phrase, full: phrase, pred: lcFirst(phrase), arm: phrase };
    }
    if (ownerLeft && ownerRight && ownerLeft !== ownerRight) {
      const pred = opWords(c.op, `that of the ${ownerRight}`, false);
      const named = `${subject} of the ${ownerLeft}`;
      return { key, subject: named, full: `${named} ${pred}`, pred, arm: sentenceCase(pred) };
    }
  }
  const pred = env.short && (c.op === 'CP' || c.op === 'NP') && value.literal
    ? `${c.op === 'NP' ? 'not ' : ''}${value.text}`
    : opWords(c.op, value.text, value.literal);
  return { key, subject, full: `${subject} ${pred}`, pred, arm: sentenceCase(pred) };
}

function opWords(op: CmpOp, value: string, literal = true): string {
  switch (op) {
    case '=': return literal ? value : `equals ${value}`;
    case '<>': return literal ? `not ${value}` : `differs from ${value}`;
    case '>': return `above ${value}`;
    case '<': return value === '0' ? 'negative' : `below ${value}`;
    case '>=': return `at least ${value}`;
    case '<=': return `at most ${value}`;
    case 'CP': return `matches ${value}`;
    case 'NP': return `does not match ${value}`;
    case 'CS': return `contains ${value}`;
    case 'NS': return `does not contain ${value}`;
    // `CO '0123456789'` is the ABAP idiom for "digits only"; any other set is
    // named as the characters it lists.
    case 'CO': return literal && isDigitSet(value) ? 'contains only digits' : `only contains ${value}`;
    case 'CN': return literal && isDigitSet(value) ? 'contains non-digits' : `contains characters other than ${value}`;
    case 'CA': return `contains any of ${value}`;
    case 'NA': return `contains none of ${value}`;
    default: return value;
  }
}

/** The ten digits and nothing else, in any order. A set with a blank allows blanks too and is not "digits". */
function isDigitSet(value: string): boolean {
  return /^\d{10}$/.test(value) && new Set(value).size === 10;
}

function joinList(items: string[], joiner: string): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`;
}

interface Rendered {
  full: string;
  question: string;
  inverted: boolean;
}

function render(c: Cond, env: Env): Rendered {
  if (c.k === 'cmp') {
    const atom = atomText(c, env);
    return { full: atom.full, question: atom.question ?? `${atom.full}?`, inverted: atom.inverted === true };
  }
  const joiner = c.k === 'and' ? 'and' : 'or';
  const flat: Cond[] = [];
  for (const part of c.parts) {
    if (part.k === c.k) flat.push(...part.parts);
    else flat.push(part);
  }
  const atoms = flat.every((p) => p.k === 'cmp')
    ? flat.map((p) => atomText(p as Extract<Cond, { k: 'cmp' }>, env))
    : null;
  // 3.1.0: parts that say the same thing are said once — `line_exists( … type = 'E' ) OR line_exists( … type = 'A' )`
  // is one question whether SAP reported an error, not "Entry exists or entry exists".
  if (env.ctx.reads310 && atoms && atoms.length > 1 && atoms.every((a) => a.full === atoms[0].full)) {
    return { full: atoms[0].full, question: atoms[0].question ?? `${atoms[0].full}?`, inverted: atoms[0].inverted === true };
  }
  let full: string | null = null;
  if (atoms && atoms.length > 1) {
    const sameKey = atoms.every((a) => a.key === atoms[0].key) && atoms[0].key !== 'sy-subrc';
    if (sameKey) {
      const subject = atoms[0].subject;
      const flatCmp = flat as Extract<Cond, { k: 'cmp' }>[];
      const range = env.ctx.reads310 && flatCmp.length === 2 ? rangeOf(flatCmp, joiner, env) : null;
      if (range) {
        full = `${subject} ${range}`;
      } else if (joiner === 'or' && flatCmp.every((p) => p.op === '=') && atoms.every((a) => a.value !== undefined)) {
        full = `${subject} ${joinList(atoms.map((a) => a.value ?? ''), 'or')}`;
      } else if (joiner === 'and' && flatCmp.every((p) => p.op === '<>') && atoms.every((a) => a.value !== undefined)) {
        full = `${subject} not ${joinList(atoms.map((a) => a.value ?? ''), 'or')}`;
      } else {
        full = `${subject} ${atoms.map((a) => a.pred).join(` ${joiner} `)}`;
      }
    } else if (atoms.every((a) => a.sharedPred && a.sharedPred === atoms[0].sharedPred)) {
      const subjects = atoms.map((a, i) => (i === 0 ? a.subject : lcFirst(a.subject)));
      full = `${joinList(subjects, joiner)} ${atoms[0].sharedPred}`;
    }
  }
  if (full === null && env.rule) full = ruleList(flat, joiner, env);
  if (full === null) {
    const parts = flat.map((p) => render(p, env).full);
    full = parts.map((p, i) => (i === 0 ? p : lcFirst(p))).join(` ${joiner} `);
  }
  return { full, question: `${full}?`, inverted: false };
}

/**
 * 3.1.0: two bounds on one field as one range — `x < a OR x > b` is "outside a to b", `x >= a AND x <= b` is "between
 * a and b". Exactly what the code compares; null for anything else.
 */
function rangeOf(parts: ReadonlyArray<Extract<Cond, { k: 'cmp' }>>, joiner: 'and' | 'or', env: Env): string | null {
  const low = (op: CmpOp) => op === '<' || op === '<=';
  const high = (op: CmpOp) => op === '>' || op === '>=';
  const [a, b] = parts;
  const lowPart = low(a.op) ? a : low(b.op) ? b : null;
  const highPart = high(a.op) ? a : high(b.op) ? b : null;
  if (!lowPart || !highPart || lowPart === highPart) return null;
  // Only where the words keep each endpoint as the code has it: "between" includes both, "outside" excludes both.
  // `x > 5 AND x < 10` or `x <= 5 OR x >= 10` keeps its operators instead.
  if (joiner === 'and' ? lowPart.op !== '<=' || highPart.op !== '>=' : lowPart.op !== '<' || highPart.op !== '>') return null;
  const lo = valueText(lowPart.right, env).text;
  const hi = valueText(highPart.right, env).text;
  // Only bounds known to be in order: `x < 100 OR x > 10` is no range "outside 100 to 10", and a field's value is unknown.
  const number = (v: string) => (/^-?\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v) : null);
  const [l, h] = [number(lo), number(hi)];
  if (l === null || h === null || (joiner === 'or' ? l > h : h > l)) return null;
  if (joiner === 'or') return `outside ${lo} to ${hi}`;
  return `between ${hi} and ${lo}`;
}

/**
 * The parts of a compound condition as one readable list, for a business rule:
 * "A, b and c". A part on the same field as the one before it keeps only its
 * predicate ("invoice reference given and not V"); a group inside the list is
 * marked as one ("either … or …", "both … and …").
 */
function ruleList(flat: Cond[], joiner: 'and' | 'or', env: Env): string {
  const items: string[] = [];
  let previousKey: string | null = null;
  for (const part of flat) {
    if (part.k === 'cmp') {
      const atom = atomText(part, env);
      const same = previousKey !== null && atom.key === previousKey && atom.key !== 'sy-subrc';
      items.push(same ? atom.pred : items.length === 0 ? atom.full : lcFirst(atom.full));
      previousKey = atom.key;
      continue;
    }
    const inner = lcFirst(render(part, env).full);
    items.push(`${part.k === 'or' ? 'either' : 'both'} ${inner}`);
    previousKey = null;
  }
  return sentenceCase(joinList(items, joiner));
}

/** A business rule's title is a line, not a label: longer than `MAX_LABEL`, still one line. */
export const MAX_RULE_TITLE = 80;

/** The wording of a business rule's condition (`ruleConditionText`). */
export interface RuleConditionText {
  /** A short name for the rule: the whole condition when it fits a line, else its first part and how many follow. */
  title: string;
  /** The whole condition in words, or null when it could not be read. */
  full: string | null;
}

/** Said in place of a condition the engine cannot read — in words, never as the code. */
export const UNREAD_CONDITION = 'A condition the engine could not put into words';

/**
 * A business rule's condition in words — deterministic, no model. Unlike a
 * process-map label it has no length limit: every part of a compound
 * condition is named, AND and OR as a list. `line` is the line of the
 * condition, so `sy-subrc` is named after the statement that set it.
 *
 * `ps_item-shkzg = 'H' AND ps_item-rebzg IS NOT INITIAL AND ps_item-rebzg <> 'V'`
 * → "Debit/credit indicator H (credit), invoice reference given and not V".
 */
export function ruleConditionText(condition: string, ctx?: PlainContext, line?: number): RuleConditionText {
  try {
    const c = contextOf(ctx);
    const parsed = parseCondition(condition);
    if (!parsed) return { title: UNREAD_CONDITION, full: null };
    const full = sentenceCase(render(parsed, { ctx: c, line, short: false, rule: true }).full);
    if (full.length <= MAX_RULE_TITLE) return { title: full, full };
    const short = sentenceCase(render(parsed, { ctx: c, line, short: true, rule: true }).full);
    if (short.length <= MAX_RULE_TITLE) return { title: short, full };
    return { title: gistOf(parsed, { ctx: c, line, short: true, rule: true }) ?? fit(short, MAX_RULE_TITLE), full };
  } catch {
    return { title: UNREAD_CONDITION, full: null };
  }
}

/** "Invoice reference contains non-digits, or 2 more conditions" — a compound condition too long for a title. */
function gistOf(c: Cond, env: Env): string | null {
  if (c.k === 'cmp') return null;
  const flat: Cond[] = [];
  for (const part of c.parts) {
    if (part.k === c.k) flat.push(...part.parts);
    else flat.push(part);
  }
  const first = sentenceCase(render(flat[0], env).full);
  const more = flat.length - 1;
  const gist = `${first}, ${c.k} ${more} more condition${more === 1 ? '' : 's'}`;
  return gist.length <= MAX_RULE_TITLE ? gist : null;
}

/** The condition humanised token by token — the fallback for what does not parse. */
function literalRendering(condition: string, ctx: PlainContext): string {
  const text = stripCondition(condition);
  const words = tokenize(text).map((t) => {
    const upper = t.toUpperCase();
    if (/^['`]/.test(t)) return unquote(t);
    if (LOGICAL.has(upper)) return upper.toLowerCase();
    const op = COMPARE[upper];
    if (op) return opWords(op, '').trim() || t;
    if (upper === 'IS') return 'is';
    if (upper === 'INITIAL') return 'empty';
    if (t === '(' || t === ')') return '';
    if (/^[\w<>[\]@~-]+$/.test(t) && /[a-z]/i.test(t)) return lcFirst(humaniseField(t, ctx));
    return t;
  }).filter(Boolean);
  return sentenceCase(words.join(' '));
}

export interface PlainQuestion {
  question: string;
  yes: string;
  no: string;
  /** The label for the branch where the ABAP condition is TRUE. */
  trueBranch: string;
  /** The label for the branch where the ABAP condition is FALSE. */
  falseBranch: string;
}

const NEUTRAL_QUESTION: PlainQuestion = Object.freeze({
  question: 'Condition met?',
  yes: 'Yes',
  no: 'No',
  trueBranch: 'Yes',
  falseBranch: 'No',
});

/**
 * A condition as a yes/no question. `s_vkorg[] IS INITIAL` → "Sales
 * organization given?" with the TRUE branch labelled "No". `line` is the line
 * of the decision in the source; with it, `sy-subrc` is read off the
 * statement that set it.
 */
export function conditionToQuestion(condition: string, ctx?: PlainContext, line?: number): PlainQuestion {
  try {
    const c = contextOf(ctx);
    const parsed = parseCondition(condition);
    if (parsed) {
      for (const short of [false, true]) {
        const r = render(parsed, { ctx: c, line, short });
        if (r.question.length <= MAX_LABEL) {
          const asked = c.reads310 ? positiveQuestion(parsed, r, { ctx: c, line, short }) : r;
          // `asked.inverted` says the question's Yes is where the condition it renders is false; after a turn the
          // rendered condition is the negation, so the branch where the ABAP condition is TRUE swaps once more.
          const turned = asked !== r;
          const yesWhenTrue = turned ? asked.inverted : !asked.inverted;
          return {
            question: asked.question,
            yes: 'Yes',
            no: 'No',
            trueBranch: yesWhenTrue ? 'Yes' : 'No',
            falseBranch: yesWhenTrue ? 'No' : 'Yes',
          };
        }
      }
      // 3.1.0: a compound condition too long for a label is said by its first part and how many follow — never as
      // the empty "Condition met?". The whole condition stays in the element's detail and in the IT view.
      if (c.reads310) {
        const gist = gistQuestion(parsed, { ctx: c, line, short: true });
        if (gist) return { question: gist, yes: 'Yes', no: 'No', trueBranch: 'Yes', falseBranch: 'No' };
      }
    }
    const literal = literalRendering(condition, c);
    if (literal && literal.length <= 40) return { ...NEUTRAL_QUESTION, question: `${literal}?` };
    return { ...NEUTRAL_QUESTION };
  } catch {
    return { ...NEUTRAL_QUESTION };
  }
}

/** Words that make a question negative: "Not authorized?", "No entries?", "Test run not selected?". */
function negativeWords(text: string): number {
  return (text.match(/\b(?:not|no|nothing|none|never)\b/gi) ?? []).length;
}

/**
 * 3.1.0 (owner decision E1): a decision point asks the positive way round. "Not authorized?" becomes
 * "Authorized?" — the condition's negation, rendered — when that reads with fewer negative words and still fits a
 * label; the branches are swapped by the caller, so each still goes where the code sends it.
 */
function positiveQuestion(parsed: Cond, r: Rendered, env: Env): Rendered {
  const before = negativeWords(r.question);
  if (before === 0) return r;
  const turned = render(negate(parsed), env);
  if (turned.question.length > MAX_LABEL) return r;
  return negativeWords(turned.question) < before ? turned : r;
}

/** 3.1.0: "Nothing found, or 1 more condition?" — a compound condition by its first part, for a label. */
function gistQuestion(parsed: Cond, env: Env): string | null {
  if (parsed.k === 'cmp') return null;
  const flat: Cond[] = [];
  for (const part of parsed.parts) {
    if (part.k === parsed.k) flat.push(...part.parts);
    else flat.push(part);
  }
  const first = sentenceCase(render(flat[0], env).full);
  const more = flat.length - 1;
  const question = `${first}, ${parsed.k} ${more} more condition${more === 1 ? '' : 's'}?`;
  return question.length <= MAX_LABEL ? question : null;
}

/**
 * A condition as a predicate phrase, sentence case, no question mark:
 * "Currency not EUR", "Days negative", "Download selected".
 */
export function conditionToPhrase(condition: string, ctx?: PlainContext, line?: number): string {
  try {
    const c = contextOf(ctx);
    const parsed = parseCondition(condition);
    if (parsed) {
      for (const short of [false, true]) {
        const r = render(parsed, { ctx: c, line, short });
        if (r.full.length <= MAX_LABEL) return r.full;
      }
    }
    const literal = literalRendering(condition, c);
    if (literal && literal.length <= 40) return literal;
    return 'Condition met';
  } catch {
    return 'Condition met';
  }
}

/** One arm of a several-armed decision on one field: "Above 180", "BLOCKED". */
function armText(condition: string, env: Env): { key: string; arm: string } | null {
  const parsed = parseCondition(condition);
  if (!parsed || parsed.k !== 'cmp') return null;
  const atom = atomText(parsed, env);
  if (atom.key === 'sy-subrc') return null;
  return { key: atom.key, arm: atom.arm };
}

/**
 * A rule in one sentence. `{ constant: { name: 'c_doc_type', value: 'NB' } }` →
 * "Only document type NB is processed"; `{ condition: "gs_eban-waers <> 'EUR'" }`
 * → "Currency other than EUR".
 */
export function ruleToSentence(
  input: { condition?: string; constant?: { name: string; value: string }; field?: string },
  ctx?: PlainContext,
): string {
  try {
    const c = contextOf(ctx);
    if (input.constant) {
      const subject = humaniseStem(stemOf(input.constant.name), c);
      const value = unquote(input.constant.value);
      return fit(`Only ${lcFirst(subject)} ${value} is processed`);
    }
    if (input.condition) {
      const parsed = parseCondition(input.condition);
      if (parsed && parsed.k === 'cmp' && parsed.op === '<>' && !/^sy-subrc$/i.test(parsed.left.trim())) {
        const value = valueText(parsed.right, { ctx: c, short: false });
        if (value.literal && !FALSE_VALUES.has(parsed.right.trim().toLowerCase())
          && !TRUE_VALUES.has(parsed.right.trim().toLowerCase())) {
          return fit(`${humaniseOperand(parsed.left, c)} other than ${value.text}`);
        }
      }
      return conditionToPhrase(input.condition, c);
    }
    if (input.field) return fit(humaniseField(input.field, c));
    return '';
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ *
 * Steps and events
 * ------------------------------------------------------------------ */

function detailString(node: SkeletonNode, key: string): string {
  const value = node.detail?.[key];
  return typeof value === 'string' ? value : '';
}

function isMultiInstance(node: SkeletonNode): boolean {
  return node.kind === 'loop' && node.detail?.multiInstance === true;
}

function isDecision(node: SkeletonNode): boolean {
  return node.kind === 'gateway' || (node.kind === 'loop' && !isMultiInstance(node));
}

function isCallSite(node: SkeletonNode): boolean {
  return Boolean(node.expandsTo) || node.detail?.collapsedFrom !== undefined || Array.isArray(node.detail?.effects);
}

function eventName(label: string): string {
  const upper = label.trim().toUpperCase().replace(/\s+/g, ' ');
  const keys = Object.keys(EVENT_TERMS_EN).sort((a, b) => b.length - a.length);
  const hit = keys.find((k) => upper === k || upper.startsWith(`${k} `));
  if (hit) return EVENT_TERMS_EN[hit];
  return sentenceCase(upper.toLowerCase().replace(/-/g, ' '));
}

/**
 * What a function module does, for a business reader (owner, 11.10.2026).
 *
 * A listed module says its business name (`plain-glossary.ts`). A module
 * family SAP names by what it does says that and no more: every `REUSE_ALV_*`
 * builds or shows an ALV list, every `ENQUEUE_*`/`DEQUEUE_*` sets or releases a
 * lock, `F4IF_*` offers input help. A `BAPI_*` drops the word "BAPI" — it names
 * the interface, not the work. Anything else is its humanised name, never a
 * meaning the name does not carry; the module name stays the technical name.
 */
function functionName(name: string, dynamic: boolean, ctx?: PlainContext): string {
  if (dynamic) return 'Run a step chosen at runtime';
  const upper = name.trim().toUpperCase();
  const bare = upper.replace(/^\/[^/]+\//, '');
  const known = own(FUNCTION_TERMS_EN, upper) ?? own(FUNCTION_TERMS_EN, bare)
    ?? (ctx?.reads310 ? own(SAP_FUNCTIONS, upper) ?? own(SAP_FUNCTIONS, bare) : undefined);
  if (known) return known;
  // 3.1.0 (H5): the application log (`BAL_*`) is the run's log, by what the module family does.
  if (ctx?.reads310 && /^BAL_/.test(bare)) {
    if (/^BAL_DSP_/.test(bare)) return 'Show the run log';
    if (/^BAL_DB_(?:LOAD|SEARCH)|_READ$|_GET/.test(bare)) return 'Read the run log';
    return 'Write the run log';
  }
  if (/^REUSE_ALV_/.test(bare)) return /DISPLAY/.test(bare) ? 'Show the result list' : 'Prepare the result list';
  if (/^ENQUEUE_/.test(bare)) return 'Lock data for editing';
  if (/^DEQUEUE_/.test(bare)) return 'Release the lock';
  if (/^F4IF_/.test(bare)) return 'Offer input help';
  if (/^BAPI_./.test(bare)) return humaniseRoutine(bare.slice(5), ctx) || upper;
  return humaniseRoutine(upper.replace(/^[ZY]_/, ''), ctx) || upper;
}

/**
 * Does a run of list output go to the printer? It does when `NEW-PAGE PRINT ON`
 * stands inside its lines, or when one of its other statements comes while the
 * last `NEW-PAGE PRINT ON|OFF` before it, in source order, switched printing
 * on — a `WRITE` in a loop after `NEW-PAGE PRINT ON` prints too, and a lone
 * `NEW-PAGE PRINT OFF` prints nothing.
 */
function printsList(node: SkeletonNode, ctx: PlainContext): boolean {
  const from = node.anchor?.lineStart;
  if (!from) return false;
  const to = Math.max(from, node.anchor?.lineEnd ?? from);
  let printing = false;
  for (const s of ctx.statements) {
    if (s.line > to) break;
    const mode = /^NEW-PAGE\b[\s\S]*\bPRINT\s+(ON|OFF)\b/i.exec(s.text);
    const on: boolean = mode ?mode[1].toUpperCase() === 'ON' : printing;
    if (s.line >= from && on) return true;
    if (mode) printing = on;
  }
  return false;
}

function readName(node: SkeletonNode, ctx?: PlainContext): string {
  const tables = Array.isArray(node.detail?.tables) ? (node.detail?.tables as string[]) : [node.label];
  const single = node.detail?.single === true;
  const first = tableTermOf(tables[0] ?? '', ctx, true);
  if (!first) return `Read ${tables[0] ?? node.label}`;
  const word = (term: PlainTerm) => lcFirst(single ? term.singular : term.plural);
  // 3.1.0 (H5): a customer table said in the words of its own name keeps its code beside them.
  if (tables.length === 1 && isCustomTableWord(tables[0], ctx)) {
    return firstFitting([`Read ${word(first)} (${tables[0].toUpperCase()})`, `Read ${word(first)}`]);
  }
  if (tables.length === 1) return `Read ${word(first)}`;
  const second = tableTermOf(tables[1] ?? '', ctx, true);
  if (tables.length === 2 && second) {
    const both = `Read ${word(first)} and ${word(second)}`;
    if (both.length <= 40) return both;
  }
  return `Read ${word(first)} and related data`;
}

function writeName(node: SkeletonNode, ctx: PlainContext): string {
  const operation = detailString(node, 'operation').toUpperCase();
  const verb = ({ INSERT: 'Create', UPDATE: 'Update', MODIFY: 'Save', DELETE: 'Delete' } as Record<string, string>)[operation]
    ?? 'Save';
  const target = node.label;
  if (isInternalTable(target, ctx) || /^(?:GT|LT|IT|ET|CT|MT)_/i.test(target)) {
    return `Update ${lcFirst(humaniseStem(stemOf(target), ctx))} list`;
  }
  const term = tableTermOf(target, ctx, true);
  if (term && isCustomTableWord(target, ctx)) return firstFitting([`${verb} ${lcFirst(term.singular)} (${target.toUpperCase()})`, `${verb} ${lcFirst(term.singular)}`]);
  if (term) return `${verb} ${lcFirst(term.singular)}`;
  return `${verb} entry in ${target.toUpperCase()}`;
}

/**
 * 3.1.0 (AB-15a): the name of a call of a routine. Before 3.1.0, and for every call that is not one of the cases
 * below, the routine's name in words. From 3.1.0:
 *
 *   - **a routine that moves the program's status** (`lib/abap/state-machine.ts`) says the move beside its name:
 *     "Approve (Submitted → Approved)" — the from-values only where the code demands them;
 *   - **a method of an interface** is named by its own name, without the interface (`LIF_STORE~SAVE` → "Save");
 *   - **a constructor drawn as a phase** prepares the run ("Prepare the run"), never "Constructor".
 *
 * A technical method folded onto one step is named by that step in `plainLabels`, which holds the skeleton.
 */
function callSiteName(node: SkeletonNode, c: PlainContext): string {
  const plain = humaniseRoutine(node.label, c);
  if (!c.reads310) return plain;
  const method = node.detail?.method === true || /^method:/i.test(node.expandsTo ?? '');
  const own = method ? ownMethodName(node.label) : node.label;
  const words = method && (interfaceOfMethod(node.label) || own !== node.label) ? humaniseRoutine(own, c) || plain : plain;
  const routine = /^(?:method|form|function):(.+)$/i.exec(node.expandsTo ?? '')?.[1];
  const moves = routine && c.stateMachine ? transitionsIn(c.stateMachine(), routine) : [];
  if (moves.length) return transitionName(words, moves, c.stateMachine?.() ?? null);
  // A constructor prepares the object the run works with; its class name is the developer's, not the business's.
  if (method && isConstructorName(node.label)) return 'Prepare the run';
  // Round 2: an interface method named by one word says what it does where the call shows it — a store's
  // `commit`/`persist` saves the changes; an English noun whose result the call assigns (`ls_claim = lo_vault->claim(
  // … )`) is read: "Get claim". A name the vocabulary translated (German) keeps its words.
  if (method && interfaceOfMethod(node.label) && /^[a-z]+$/i.test(own) && !/\(/.test(words)) {
    if (SAVE_METHODS.test(own)) return 'Save the changes';
    const text = statementAt(c, node.anchor?.lineStart)?.text ?? '';
    const assigned = new RegExp(String.raw`^(?:DATA\(\s*)?[\w/<>~-]+\s*\)?\s*=\s*(?:NEW\s+)?(?:[\w/]+(?:->|=>))*${own.replace(/[^\w]/g, '')}\(`, 'i').test(text);
    if (assigned && !ONE_WORD_VERBS.has(own.toLowerCase()) && !/(?:ize|ise|ate|ify)$/i.test(own)) return `Get ${lcFirst(words)}`;
  }
  return words;
}

/** A store's method that writes everything it was given at once (round 2 of AB-15a): said as "Save the changes". */
const SAVE_METHODS = /^(?:commit|persist|flush|save_all)$/i;

/** One-word method names that already are a verb — never "Get …" (round 2 of AB-15a). */
const ONE_WORD_VERBS = new Set((
  'add apply approve assign authorize book build calculate call cancel change check clear close collect commit compute '
  + 'convert copy count create decide delete determine dispatch display do execute exists filter find flush generate get '
  + 'grant handle has init insert is load lock log main map merge modify move normalize normalise notify open parse patch '
  + 'persist post prepare print process read refresh register reject release remove render reset require run save select '
  + 'send set show sort start store submit test transfer unlock update validate verify write'
).split(' '));

/**
 * A status value in words (`stateWords`), in English where the value is German the vocabulary can translate
 * ("ABGELEHNT" → "Rejected"); German it cannot translate stays the code it is — never a German word in an English label.
 */
function stateSaid(value: string, constant: string | null): string {
  const words = value.replace(/_/g, ' ').trim().toLowerCase();
  if (/^[a-zäöüß ]{3,}$/.test(words)) {
    const english = translateGermanText(words, FIELD_SOURCES_310)?.english;
    if (english) return sentenceCase(english);
    if (hasGermanWord(words, FIELD_SOURCES_310) || germanUntranslated(words)) return value.toUpperCase();
  }
  return stateWords(value, constant);
}

/** "Approve (Submitted → Approved)", "Decide (Pending → Approved or Rejected)", "Start (to Draft)". */
function transitionName(words: string, moves: readonly StateTransition[], machine: StateMachine | null): string {
  const say = (value: string) => {
    const known = machine?.states.find((s) => s.value === value);
    return stateSaid(value, known?.constant ?? null);
  };
  const to = [...new Set(moves.map((m) => m.to))];
  const from = [...new Set(moves.flatMap((m) => m.from))].filter((v) => !to.includes(v) || to.length > 1);
  const target = to.length <= 2 ? to.map(say).join(' or ') : `${to.length} statuses`;
  const move = from.length && from.length <= 2 ? `${from.map(say).join(' or ')} → ${target}` : `to ${target}`;
  return `${words} (${move})`;
}

/**
 * A command in words, as the verb of its step: `SUBMIT` → "Submit", `gc_cmd_release` → "Release", a German command the
 * vocabulary can translate in English; a code (`'01'`) stays the code ("Command '01'").
 */
function commandSaid(value: string, constant: string | null): string {
  const v = value.trim();
  if (/^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß_ ]{2,}$/.test(v)) return stateSaid(v, null);
  if (constant) {
    const stem = (constant.split(/=>|-/).pop() ?? constant)
      .replace(/^(?:g|l|m|s)?c_/i, '')
      .replace(/^(?:co|c)_/i, '')
      .replace(/^(?:cmd|command|action|act|fcode|ucomm|okcode|fc)_/i, '');
    if (/^[a-z][a-z_]{2,}$/i.test(stem)) return stateSaid(stem.toUpperCase(), null);
  }
  return `Command '${v}'`;
}

/** The steps of a command workflow (`WorkflowLabels`), or null. */
function workflowLabelsOf(machine: StateMachine | null, ctx: PlainContext): WorkflowLabels | null {
  const flow = machine?.workflow;
  if (!machine || !flow) return null;
  const steps = [...flow.arms, ...flow.checks].map((arm: CommandArm): WorkflowStep => {
    const verbs = arm.values.map((v, k) => commandSaid(v, arm.constants[k] ?? null));
    // A command that is a code (`'A'`) is no verb: the step says the move itself — "Set status (Approval → Rejected)".
    const said = !verbs.some((v) => v.startsWith('Command '));
    const words = !said ? `Set ${machine.field}`
      : verbs.length <= 2 ? verbs.map((w, k) => (k ? lcFirst(w) : w)).join(' or ') : `${verbs[0]} or ${verbs.length - 1} more`;
    const opener = statementAt(ctx, arm.line)?.text ?? `WHEN ${arm.values.join(' OR ')}`;
    return {
      // An arm that moves nothing holds the checks its command must pass first.
      name: arm.transitions.length ? transitionName(words, arm.transitions, machine) : `Checks for ${lcFirst(words)}`,
      technicalName: opener.replace(/\.$/, ''),
      line: arm.line,
      decision: arm.decision,
      lineStart: arm.lineStart,
      lineEnd: arm.lineEnd,
      moves: arm.transitions.map((t) => t.line),
      said,
      when: [...arm.values.map((v) => `'${v}'`), ...arm.constants.filter((c): c is string => !!c)],
    };
  });
  return { routine: flow.routine, steps, driver: machine.driver };
}

/** The kinds a status setter's call can be drawn as. */
const STEP_KINDS_FOR_MOVES = new Set<string>(['call-opaque', 'task', 'write', 'send-task', 'service-task', 'sub-process', 'call-activity']);

/** Readable name for a step, a sub-process, a loop or an event. */
export function stepName(node: SkeletonNode, ctx?: PlainContext): string {
  try {
    const c = contextOf(ctx);
    const line = node.anchor?.lineStart;
    // 3.1.0 (AB-15a): the call of a status setter (`set_status( gc_approved )`) is the move it makes.
    if (c.reads310 && c.stateMachine && STEP_KINDS_FOR_MOVES.has(node.kind)) {
      const machine = c.stateMachine?.();
      const move = machine?.transitions.find((t) => t.line === line);
      if (machine && move && /\(/.test(statementAt(c, line)?.text ?? '')) {
        return fit(`Set ${machine.field} to ${stateSaid(move.to, move.toConstant)}`);
      }
    }
    switch (node.kind) {
      case 'start': {
        if (node.detail?.subProcess === true) return 'Start';
        const origin = detailString(node, 'origin');
        if (origin && origin !== 'event' && origin !== 'implicit') return 'Start';
        // A report with `PARAMETERS`/`SELECT-OPTIONS` runs on what someone
        // entered on its selection screen: the start says so (owner, 11.10.2026).
        if (/^START-OF-SELECTION$/i.test(node.label.trim()) && c.selections.size > 0) {
          return 'Run starts with the entered selection';
        }
        return fit(eventName(node.label));
      }
      case 'end':
        return node.detail?.early === true ? 'Ends early' : 'Done';
      case 'end-error':
        return outcomeName(node, null, c);
      case 'parallel-gateway':
        return '';
      case 'gateway':
        return gatewayQuestion(node, c);
      case 'error-boundary':
        return boundaryName(node, c);
      default:
        break;
    }
    if (node.kind === 'loop') {
      if (isMultiInstance(node)) return fit(`For each ${itemOf(node.label, c)}`);
      return loopQuestion(node, c);
    }
    if (isCallSite(node)) return fit(callSiteName(node, c));
    switch (node.kind) {
      case 'read':
        return fit(readName(node, c));
      case 'write':
        return fit(writeName(node, c));
      case 'service-task':
      case 'send-task':
        return fit(functionName(node.label, node.detail?.dynamic === true, c));
      case 'user-task': {
        if (detailString(node, 'message')) return 'Show message';
        // `CALL SCREEN 9000`: a person enters data on a screen of the program.
        if (/^\d+$/.test(node.label) || /^CALL\s+SCREEN\b/i.test(statementAt(c, line)?.text ?? '')) {
          return fit(`Enter data on screen ${node.label.toUpperCase()}`);
        }
        return fit(functionName(node.label, node.detail?.dynamic === true, c));
      }
      case 'output': {
        const target = detailString(node, 'target');
        const label = node.label.toUpperCase();
        if (target === 'list') return printsList(node, c) ? 'Print the list' : 'Show the result list';
        if (target === 'file') {
          // `… DATASET`: a file on the application server, not on the user's PC.
          if (label === 'OPEN') return 'Open a file on the server';
          if (label === 'CLOSE') return 'Close the file on the server';
          if (label === 'READ') return 'Read a file on the server';
          if (label === 'DELETE') return 'Delete a file on the server';
          return 'Write a file on the server';
        }
        return fit(functionName(node.label, node.detail?.dynamic === true, c));
      }
      case 'transaction': {
        if (node.detail?.dynamic === true) return 'Run a transaction chosen at runtime';
        const code = node.label.toUpperCase();
        const known = own(TRANSACTION_TERMS_EN, code) ?? (c.reads310 ? own(SAP_TRANSACTIONS, code) : undefined);
        // `CALL TRANSACTION … USING`: the program types into the transaction's
        // screens itself — batch input, a simulated entry.
        if (node.detail?.batchInput === true) {
          return firstFitting(known
            ? [`${known} (${code}) by simulated entry`, `${known} by simulated entry`, `${known} (${code})`]
            : [`Simulated entry in transaction ${code}`]);
        }
        return fit(known ? firstFitting([`${known} (${code})`, known]) : `Run transaction ${code}`);
      }
      case 'call-activity': {
        const text = statementAt(c, line)?.text ?? '';
        if (/^LEAVE\s+TO\s+TRANSACTION\b/i.test(text) || node.detail?.returns === false && !/^SUBMIT\b/i.test(text)) {
          const known = own(TRANSACTION_TERMS_EN, node.label.toUpperCase()) ?? (c.reads310 ? own(SAP_TRANSACTIONS, node.label.toUpperCase()) : undefined);
          return fit(known ? `Go to: ${lcFirst(known)}` : `Go to transaction ${node.label.toUpperCase()}`);
        }
        // `SUBMIT`: another report runs — printed when it goes to the spool,
        // in the background when it goes to a job.
        if (node.detail?.dynamic === true) return 'Start a report chosen at runtime';
        const report = node.label.toUpperCase();
        if (/\bTO\s+SAP-SPOOL\b/i.test(text)) return firstFitting([`Print the report ${report}`]);
        if (node.detail?.viaJob === true) {
          return firstFitting([`Start the report ${report} in the background`, `Start the report ${report}`]);
        }
        return fit(`Start the report ${report}`);
      }
      case 'task': {
        // A change to an internal table (`MODIFY gt_stock FROM gs_stock`) is
        // labelled with the table's name by the skeleton; as a routine name it
        // read "Gt stock" in the Business view. It is a change to the program's
        // own working list, and the label says so — never a write to SAP data.
        // 3.1.0: a row the engine draws as the yes of an arm that draws nothing else (`collectStep`) goes into the
        // program's result: said so, by what the row is where the code says it, else as "the row".
        if (c.reads310 && node.detail?.internalTable === true && node.detail?.collects === true) {
          const known = knownItemOf(node.label, c);
          return fit(known ? `Put the ${known} in the result list` : 'Put the row in the result list');
        }
        if (node.detail?.internalTable === true) {
          const item = itemOf(node.label, c);
          const op = detailString(node, 'operation').toUpperCase();
          if (op === 'DELETE') return fit(`Remove the ${item} from the list`);
          if (op === 'INSERT' || op === 'APPEND') return fit(`Add the ${item} to the list`);
          return fit(`Update the ${item} in the list`);
        }
        // 3.1.0: the steps the engine draws for an arm that would otherwise draw nothing (`process-skeleton.ts`).
        if (c.reads310 && node.detail?.flagStep === true) return fit(flagStepName(node, c));
        if (c.reads310 && node.detail?.helperCall === true) {
          const said = programTextOf(node);
          if (said) return firstFitting([`Note: ${lcFirst(said)}`, `Note: ${lcFirst(shortText(said, 5))}`]);
          // A log helper without a sentence of its own: what it does, not its name ("Add log").
          if (/(?:^|[_:])(?:log|logs|protokoll|applog)(?:[_:]|$)/i.test(String(node.detail?.routine ?? node.label))) return 'Note in the run log';
        }
        return fit(humaniseRoutine(node.label, c) || 'Step');
      }
      case 'call-opaque': {
        if (/^PERFORM$/i.test(node.label)) return 'Call routine';
        const name = node.label.replace(/\(.*$/, '').split(/->|=>/).pop() ?? node.label;
        return fit(humaniseRoutine(name, c) || 'Call');
      }
      default:
        return fit(humaniseRoutine(node.label, c) || 'Step');
    }
  } catch {
    return fit(humaniseRoutine(node?.label ?? '') || 'Step');
  }
}

/**
 * 3.1.0: the program's own sentence an engine step carries (`detail.programTexts`, written next to the step in the
 * same arm) in English where every word is known, as written otherwise — '' when there is none or it is German the
 * engine cannot put into English (the element's detail keeps the statement).
 */
function programTextOf(node: SkeletonNode): string {
  const texts = Array.isArray(node.detail?.programTexts) ? (node.detail?.programTexts as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  for (const t of texts) {
    if (!t.trim()) continue;
    const english = translateGermanText(t, FIELD_SOURCES_310)?.english;
    // German the engine cannot put into English stays out of the label (owner decision E2); the detail keeps it.
    if (!english && (germanUntranslated(t) || hasGermanWord(t, FIELD_SOURCES_310))) continue;
    return (english ?? t).replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '');
  }
  return '';
}

/**
 * 3.1.0: a flag step — an arm that only sets a field a later decision reads (`gv_approved = abap_true`). Its own
 * sentence first ("Approved without limit check (central warehouse)"); else what it sets: "Mark as approved",
 * "Set emergency", "Result status: no quote", "Set status to C (completely processed)". Never the assignment as code.
 */
function flagStepName(node: SkeletonNode, ctx: PlainContext): string {
  const m = /^([\w/<>~-]+(?:->[\w]+)?)\s*=\s*(.+?)\.?$/.exec(node.label.trim());
  const said = programTextOf(node);
  if (!m) return said ? sentenceCase(said) : humaniseRoutine(node.label, ctx) || 'Step';
  const [, field, rawValue] = m;
  const value = rawValue.trim();
  const subject = humaniseField(field, ctx);
  const literal = /^['`]/.test(value) ? unquote(value) : null;
  // The program's sentence is the value set into the field itself: the field and the sentence.
  if (said && literal !== null && englishText(literal).replace(/[.:;,]+$/, '').trim() === said) return firstFitting([`${subject}: ${lcFirst(said)}`, sentenceCase(said)]);
  if (said) return sentenceCase(said);
  // 3.1.0 (AB-15a): a move of the program's status workflow says the state in words ("Set status to Declined").
  const move = ctx.stateMachine?.()?.transitions.find((t) => t.line === node.anchor?.lineStart);
  if (move) return `Set ${lcFirst(subject)} to ${stateSaid(move.to, move.toConstant)}`;
  const lower = value.toLowerCase();
  const participle = isParticiple(field, ctx);
  if (TRUE_VALUES.has(lower)) return participle ? `Mark as ${lcFirst(subject)}` : `Set ${lcFirst(subject)}`;
  if (FALSE_VALUES.has(lower)) return participle ? `Mark as not ${lcFirst(subject)}` : `Clear ${lcFirst(subject)}`;
  const shown = literal ?? (/^-?\d+(?:\.\d+)?$/.test(value) ? value : (ctx.constants.get(value.toLowerCase()) ?? humaniseField(value, ctx)));
  const meaning = literal !== null ? valueMeaning(field, literal, ctx) : null;
  return firstFitting([`Set ${lcFirst(subject)} to ${shown}${meaning ? ` (${meaning})` : ''}`, `Set ${lcFirst(subject)} to ${shown}`]);
}

function boundaryName(node: SkeletonNode, ctx: PlainContext): string {
  const attached = node.detail?.attachedTo;
  if (attached === '') return 'Error caught';
  const line = node.anchor?.lineStart;
  if (node.detail?.foldedGateway === true) {
    let condition = detailString(node, 'condition');
    if (!condition) {
      // The skeleton folds the failure arm into the boundary and writes its
      // condition only when the source wrote one on that arm. Without it the
      // failure arm is the ELSE (or the way past) of the IF on this line.
      const text = statementAt(ctx, line)?.text ?? '';
      if (/^IF\s/i.test(text)) condition = `NOT ( ${stripCondition(text)} )`;
    }
    if (condition) return fit(conditionToPhrase(condition, ctx, line));
  }
  return 'On error';
}

function gatewayQuestion(node: SkeletonNode, ctx: PlainContext): string {
  const line = node.anchor?.lineStart;
  if (node.detail?.branchKind === 'case') return fit(`${humaniseOperand(node.label, ctx)}?`);
  const condition = detailString(node, 'condition') || stripCondition(node.label);
  return conditionToQuestion(condition, ctx, line).question;
}

function loopQuestion(node: SkeletonNode, ctx: PlainContext): string {
  const over = detailString(node, 'over');
  if (over) return fit(`More ${itemsOf(over, ctx)}?`);
  const text = statementAt(ctx, node.anchor?.lineStart)?.text ?? '';
  if (/^WHILE\s/i.test(text)) return conditionToQuestion(text, ctx, node.anchor?.lineStart).question;
  if (/^LOOP\s+AT\s+([\w<>-]+)/i.test(text)) {
    return fit(`More ${itemsOf(/^LOOP\s+AT\s+([\w<>-]+)/i.exec(text)?.[1] ?? '', ctx)}?`);
  }
  return 'Repeat?';
}

interface MessageInfo {
  text?: string;
  id?: string;
  withText?: string;
  raised?: string;
  leaveProgram?: boolean;
}

/** A German message text in English, when every word of it is known; else as written. */
function englishText(text: string): string {
  return translateGermanText(text, FIELD_SOURCES)?.english ?? text;
}

/**
 * The program's own words on a `MESSAGE` at a line — its literal text or its `WITH` text — for the naming stage's
 * facts (3.1.0, `lib/naming-facts.ts`). Empty when the line holds no message with a literal.
 */
export function messageWordsAt(ctx: PlainContext, line: number | undefined): string[] {
  const m = messageAt(ctx, line);
  return [m.text, m.withText].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

/** German at a glance: an umlaut, or one of the words no English text carries. */
const GERMAN_HINT = /[äöüßÄÖÜ]|\b(?:nicht|kein|keine|keinen|keiner|f(?:ue|ü)r|der|die|das|ist|sind|nur|und|oder|bitte|vorhanden|gefunden|fehlt|wurde|wurden|werden|mit|zum|zur|bei|auf|ung(?:ue|ü)ltig|fehler|konnte|nicht)\b/i;

/** 3.1.0: a text in German the engine cannot put into English word for word. */
function germanUntranslated(text: string): boolean {
  return GERMAN_HINT.test(text) && translateGermanText(text, FIELD_SOURCES) === null;
}

function messageAt(ctx: PlainContext, line: number | undefined): MessageInfo {
  const text = statementAt(ctx, line)?.text ?? '';
  if (/^LEAVE\s+PROGRAM\b/i.test(text)) return { leaveProgram: true };
  const raised = /^RAISE\s+(?:EXCEPTION\s+TYPE\s+)?([\w/]+)/i.exec(text)?.[1];
  if (raised) return { raised };
  if (!/^MESSAGE\b/i.test(text)) return {};
  const literal = /^MESSAGE\s+('(?:[^']|'')*'|`[^`]*`)/i.exec(text)?.[1];
  if (literal) return { text: unquote(literal) };
  const info: MessageInfo = {};
  const short = /^MESSAGE\s+([AEIWSX])(\d{3})\b/i.exec(text);
  if (short) info.id = `${short[1]}${short[2]}`.toUpperCase();
  const long = /\bTYPE\s+'([AEIWSX])'.*\bNUMBER\s+'?(\d{3})'?/i.exec(text);
  if (!info.id && long) info.id = `${long[1]}${long[2]}`.toUpperCase();
  const withText = /\bWITH\s+('(?:[^']|'')*'|`[^`]*`)/i.exec(text)?.[1];
  if (withText) info.withText = unquote(withText);
  return info;
}

/**
 * The name of an end event. A normal end is "Done"; an early end says why it
 * ends, from the branch that leads to it ("Stopped: no orders", "Rejected: no
 * material"); an error end reads its `MESSAGE` ("Stop: no sales organization
 * (E001)").
 *
 * `options.rejected` is set by `plainLabels` when the path to the end passes a
 * routine named `REJECT…` — "Rejected" is said only then.
 */
export function outcomeName(
  end: SkeletonNode,
  leadingCondition: { condition: string; truth: boolean } | null,
  ctx?: PlainContext,
  options?: { rejected?: boolean; line?: number },
): string {
  try {
    const c = contextOf(ctx);
    const phraseOf = (short: boolean): string => {
      if (!leadingCondition) return '';
      const cond = leadingCondition.truth ? leadingCondition.condition : `NOT ( ${stripCondition(leadingCondition.condition)} )`;
      const parsed = parseCondition(cond);
      if (parsed) {
        const r = render(parsed, { ctx: c, line: options?.line, short });
        if (r.full.length <= MAX_LABEL) return r.full;
      }
      return conditionToPhrase(cond, c, options?.line);
    };
    if (end.kind === 'end-error') {
      const message = messageAt(c, end.anchor?.lineStart);
      // 3.1.0 (owner decision E2): a German text the engine cannot put into English stays out of the label; the
      // element's detail keeps it word for word (`PlainLabels.technical`).
      const germanText = c.reads310 && !!message.text && germanUntranslated(message.text);
      if (message.text && !germanText) return fit(`Stop: ${lcFirst(shortText(englishText(message.text)))}`);
      if (message.leaveProgram) return 'Program ends';
      const id = message.id ?? (/^[AEIWSX]\d{3}$/i.test(end.label) ? end.label.toUpperCase() : '');
      // 3.1.0: the program's own words on the message (`MESSAGE e002 WITH 'No authorization for purchasing group'`)
      // say why it stops better than a reading of the condition before it.
      if (c.reads310 && message.withText && !germanUntranslated(message.withText) && /\s/.test(message.withText.trim())) {
        const said = lcFirst(englishText(message.withText).replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, ''));
        return firstFitting([
          `Stop: ${said}${id ? ` (${id})` : ''}`,
          `Stop: ${said}`,
          `Stop: ${lcFirst(shortText(said, 5))}${id ? ` (${id})` : ''}`,
        ]);
      }
      for (const short of [false, true]) {
        const phrase = phraseOf(short);
        if (!phrase || phrase === 'Condition met') continue;
        const withId = `Stop: ${lcFirst(phrase)}${id ? ` (${id})` : ''}`;
        if (withId.length <= MAX_LABEL) return withId;
        const without = `Stop: ${lcFirst(phrase)}`;
        if (without.length <= MAX_LABEL) return without;
      }
      if (message.withText) return fit(`Stop: ${lcFirst(shortText(englishText(message.withText), 5))}${id ? ` (${id})` : ''}`);
      if (message.raised) return fit(`Stop: ${lcFirst(humaniseRoutine(message.raised.replace(/^[ZY]?CX_/i, '')))}`);
      if (germanText) return id ? `Stop with a message in German (${id})` : 'Stop with a message in German';
      if (id) return c.reads310 ? `Stop with an error message (${id})` : `Error ${id}`;
      return 'Stop: error';
    }
    if (end.detail?.early === true) {
      for (const short of [false, true]) {
        const phrase = phraseOf(short);
        if (!phrase || phrase === 'Condition met') continue;
        const label = `${options?.rejected ? 'Rejected' : 'Stopped'}: ${lcFirst(phrase)}`;
        if (label.length <= MAX_LABEL) return label;
      }
      return options?.rejected ? 'Rejected' : 'Ends early';
    }
    return 'Done';
  } catch {
    return end?.kind === 'end-error' ? 'Stop: error' : 'Done';
  }
}

/* ------------------------------------------------------------------ *
 * The whole skeleton
 * ------------------------------------------------------------------ */

export interface PlainLabels {
  nodes: Map<string, string>;
  /** Label of a flow; '' when none. Works for edges that are not in `skeleton.edges`. */
  flow(edge: SkeletonEdge): string;
  /** The exact technical text the label was made from (for tooltips/documentation). */
  technical(nodeId: string): string;
  /**
   * The SAP technique a step's business label no longer names, in the
   * statement's own words — `CALL SCREEN 9000`, `CALL TRANSACTION 'ME21N'
   * USING … (batch input)`, `CALL FUNCTION 'GUI_UPLOAD'`. For the element's
   * documentation, under the label (owner, 11.10.2026). '' when the step has
   * no such technique — the documentation then keeps the technical name.
   */
  technique(nodeId: string): string;
  /**
   * 3.1.0: what a reader should know beside the label, in the engine's words — for an unknown check "The code does
   * not say what this check means (field PROFL)." (owner decision 06.11.2026). '' when there is nothing to add, and
   * always '' for an older engine.
   */
  detail?(nodeId: string): string;
  /**
   * 3.1.0 (H4, owner decision E2): the author's comment at the element's statement — or, for a routine, above its
   * definition — word for word, for the documentation under the tag "Author's comment". Never the label. Null without
   * one, and always null for an older engine.
   */
  comment?(nodeId: string): AuthorComment | null;
  /**
   * 3.1.0 (H9): a lane's name for a business reader — an authorization check by what it protects, with its object
   * ("Authorization for purchase requisitions by purchasing group (M_BANF_EKG)"). '' keeps the skeleton's name; always
   * '' for an older engine.
   */
  lane?(lane: { kind: string; name: string }): string;
  /**
   * 3.1.0 (AB-15a, round 2): the status workflow one routine runs as a decision over a command
   * (`StateMachine.workflow`) — each arm that moves the status named as the move ("Approve (Submitted → Approved)"),
   * with its lines — and the program's run when it is only a demo driver of it. Null without one, and always null for
   * an older engine. The business map (`lib/bpmn/model.ts`, `readsObjects`) draws the arms as the steps.
   */
  workflow?: WorkflowLabels | null;
}

/** One step of a command workflow on the business map: an arm of the decision, named as the move it makes. */
export interface WorkflowStep {
  /** "Approve (Submitted → Approved)". */
  name: string;
  /** The arm's opener as the code writes it (`WHEN 'APPROVE'`). */
  technicalName: string;
  /** The arm's opener (`WHEN`, `IF`, `ELSEIF`) and the decision it belongs to (`CASE`, `IF`). */
  line: number;
  decision: number;
  lineStart: number;
  lineEnd: number;
  /** The lines of the moves in the arm; empty for an arm of checks only ("Checks for grant"). */
  moves: number[];
  /** True when the command is said in words ("Approve"); false for a code (`'A'`), where the step says the move only. */
  said: boolean;
  /** How the code can write the arm's values on a decision's arm: the literal (`'APPROVE'`) or the constant's name. */
  when: string[];
}

export interface WorkflowLabels {
  /** The routine that runs the workflow, `CLASS=>METHOD` upper case. */
  routine: string;
  steps: WorkflowStep[];
  driver: ScenarioDriver | null;
}

function normalise(condition: string): string {
  return stripCondition(condition).replace(/\s*\(\s*/g, ' ( ').replace(/\s*\)\s*/g, ' ) ').replace(/\s+/g, ' ').trim()
    .toLowerCase();
}

interface DecisionPlan {
  question: string;
  arm(edge: SkeletonEdge): string;
}

function technicalOf(node: SkeletonNode): string {
  if (node.kind === 'read' && !isCallSite(node)) {
    const tables = Array.isArray(node.detail?.tables) ? (node.detail?.tables as string[]) : [node.label];
    return `SELECT ${tables.join(', ')}`;
  }
  if (node.kind === 'write' && !isCallSite(node) && detailString(node, 'operation')) {
    return `${detailString(node, 'operation')} ${node.label}`;
  }
  if (isMultiInstance(node)) return `LOOP AT ${node.label}`;
  if (node.kind === 'end' && node.detail?.early === true) {
    return `${detailString(node, 'routine') || node.container || ''} (${detailString(node, 'exit') || node.label})`.trim();
  }
  if (node.kind === 'error-boundary' && detailString(node, 'condition')) {
    return `${node.label}: ${detailString(node, 'condition')}`;
  }
  return node.label;
}

/** See `PlainLabels.technique`. Only tokens of the statement and the SAP name of its technique; '' without one. */
function techniqueOf(node: SkeletonNode, ctx: PlainContext): string {
  const text = statementAt(ctx, node.anchor?.lineStart)?.text ?? '';
  const name = node.label.toUpperCase();
  const fm = /^CALL\s+FUNCTION\b/i.test(text);
  switch (node.kind) {
    case 'service-task':
    case 'send-task':
    case 'user-task':
    case 'output': {
      if (fm && !isCallSite(node)) {
        const how = [
          typeof node.detail?.destination === 'string' ? `DESTINATION ${node.detail.destination} (remote call)` : '',
          node.detail?.inUpdateTask === true ? 'IN UPDATE TASK (runs when the changes are saved)' : '',
          node.detail?.startingNewTask === true ? 'STARTING NEW TASK (runs in parallel)' : '',
        ].filter(Boolean).join(' ');
        const family = /^REUSE_ALV_/.test(name) ? ' (ALV list)' : /^BAPI_/.test(name) ? ' (BAPI)' : '';
        return `CALL FUNCTION '${name}'${family}${how ? ` ${how}` : ''}`;
      }
      if (node.kind === 'user-task' && /^CALL\s+SCREEN\b/i.test(text)) return `CALL SCREEN ${name} (dynpro)`;
      if (node.kind === 'output' && detailString(node, 'target') === 'list') {
        return `${name} (list output${printsList(node, ctx) ? ' to the spool' : ''})`;
      }
      if (node.kind === 'output' && detailString(node, 'target') === 'file') return `${name} DATASET (application server file)`;
      return '';
    }
    case 'transaction':
      if (isCallSite(node)) return '';
      return `CALL TRANSACTION '${name}'${node.detail?.batchInput === true ? ' USING … (batch input)' : ''}`;
    case 'call-activity':
      if (/^SUBMIT\b/i.test(text)) {
        return `SUBMIT ${name}${node.detail?.returns === true ? ' AND RETURN' : ''}${node.detail?.viaJob === true ? ' VIA JOB' : ''}${/\bTO\s+SAP-SPOOL\b/i.test(text) ? ' TO SAP-SPOOL' : ''}`;
      }
      if (/^LEAVE\s+TO\s+TRANSACTION\b/i.test(text)) return `LEAVE TO TRANSACTION '${name}'`;
      return '';
    case 'start':
      if (/^START-OF-SELECTION$/i.test(node.label.trim()) && ctx.selections.size > 0) {
        return 'START-OF-SELECTION (after the selection screen)';
      }
      return '';
    default:
      return '';
  }
}

/**
 * Every node of a skeleton gets a plain-language label (a parallel gateway
 * gets none, by BPMN convention), and every flow out of a decision gets the
 * name of its branch.
 */
export function plainLabels(skeleton: ProcessSkeleton, source?: string, options: PlainOptions = {}): PlainLabels {
  const ctx = plainContext(source ?? '', options);
  const nodes = new Map<string, string>();
  const technical = new Map<string, string>();
  const technique = new Map<string, string>();
  const details = new Map<string, string>();
  const comments = new Map<string, AuthorComment>();
  const commentReader = ctx.reads310 ? authorCommentsOf(source ?? '') : null;
  const byId = new Map<string, SkeletonNode>();
  const outs = new Map<string, SkeletonEdge[]>();
  const ins = new Map<string, SkeletonEdge[]>();
  const plans = new Map<string, DecisionPlan>();

  const skeletonNodes = Array.isArray(skeleton?.nodes) ? skeleton.nodes : [];
  const skeletonEdges = Array.isArray(skeleton?.edges) ? skeleton.edges : [];
  for (const node of skeletonNodes) byId.set(node.id, node);
  for (const edge of skeletonEdges) {
    if (!outs.has(edge.from)) outs.set(edge.from, []);
    outs.get(edge.from)?.push(edge);
    if (!ins.has(edge.to)) ins.set(edge.to, []);
    ins.get(edge.to)?.push(edge);
  }

  const lineOf = (node: SkeletonNode | undefined) => node?.anchor?.lineStart;
  const inRegion = new Map<string, SkeletonNode[]>();
  for (const node of skeletonNodes) inRegion.set(node.region, [...(inRegion.get(node.region) ?? []), node]);
  /**
   * 3.1.0 (AB-15a): the step a collapsed call of a technical or an interface method stands for — the skeleton's
   * `collapsedFrom`, followed through further collapsed calls to the statement. Null for every other node.
   */
  const foldedStepOf = (node: SkeletonNode): SkeletonNode | null => {
    const method = node.detail?.method === true;
    if (!method || node.collapsed !== true || !(isTechnicalMethodName(node.label) || interfaceOfMethod(node.label))) return null;
    // A constructor is the set-up of the run whatever it reads (`callSiteName`): "Prepare the run".
    if (isConstructorName(node.label)) return null;
    // A status setter's call is the move it makes (`stepName`), not what the setter does besides.
    if (ctx.stateMachine?.()?.transitions.some((t) => t.line === node.anchor?.lineStart)) return null;
    let step: SkeletonNode | undefined = node;
    for (let depth = 0; step?.collapsed === true && step.expandsTo && depth < 10; depth++) {
      const from = detailString(step, 'collapsedFrom');
      const kind: SkeletonNode['kind'] = step.kind;
      step = (inRegion.get(step.expandsTo) ?? []).find((n) => n.kind === kind && n.label === from);
    }
    // Only a statement names it; a further routine call keeps the method's own name ("Process", not "Check").
    return step && step !== node && !isCallSite(step) ? step : null;
  };
  const phrase = (condition: string, node: SkeletonNode | undefined) =>
    fit(conditionToPhrase(condition, ctx, lineOf(node)));

  const conditionsOf = (node: SkeletonNode): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const edge of outs.get(node.id) ?? []) {
      if (edge.kind === 'boundary' || !edge.condition) continue;
      const key = normalise(edge.condition);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(edge.condition);
    }
    return out;
  };

  /** The first nodes of a cycle loop's body: those from which a loop-back returns to it. */
  const bodyTargets = (loop: SkeletonNode): Set<string> => {
    const result = new Set<string>();
    for (const edge of outs.get(loop.id) ?? []) {
      const seen = new Set<string>([loop.id]);
      const queue = [edge.to];
      let back = false;
      while (queue.length && !back && seen.size < 2000) {
        const id = queue.shift() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const next of outs.get(id) ?? []) {
          if (next.to === loop.id) {
            if (next.kind === 'loop-back') back = true;
            continue;
          }
          queue.push(next.to);
        }
      }
      if (back || edge.to === loop.id) result.add(edge.to);
    }
    return result;
  };

  const planFor = (node: SkeletonNode): DecisionPlan => {
    const line = lineOf(node);
    const env: Env = { ctx, line, short: false };
    if (node.kind === 'loop') {
      const body = bodyTargets(node);
      return {
        question: loopQuestion(node, ctx),
        arm: (edge) => {
          if (body.has(edge.to)) return 'Next';
          if (edge.condition) return phrase(edge.condition, node);
          return 'Done';
        },
      };
    }
    if (node.detail?.branchKind === 'case') {
      // 3.1.0: `CASE sy-subrc` asks how the step before it ended, and its arms say so ("Found", "Return code 4").
      if (ctx.reads310 && cleanIdentifier(node.label) === 'sy-subrc') {
        const setter = setterBefore(ctx, line);
        return {
          question: 'How did the previous step end?',
          arm: (edge) => {
            if (!edge.condition) return 'Other';
            const values = splitCaseValues(edge.condition).map((v) => unquote(v));
            if (values.length === 1 && values[0] === '0') return fit(subrcPhrase(setter, true, false, ctx));
            return fit(`Return code ${joinList(values, 'or')}`);
          },
        };
      }
      const subject = humaniseOperand(node.label, ctx);
      const command = subject === 'User command';
      return {
        question: fit(`${subject}?`),
        arm: (edge) => {
          if (!edge.condition) return 'Other';
          const values = splitCaseValues(edge.condition).map((v) => {
            if (!/^['`]/.test(v) && !/^-?\d+$/.test(v)) return humaniseField(v, ctx);
            // A function code stays the identifier it is; a standard one also says what it does.
            const code = unquote(v);
            const standard = command ? STANDARD_FUNCTION_CODES[code.toUpperCase()] : undefined;
            if (standard) return `${standard} (${code})`;
            return command ? code : humaniseLiteralValue(v);
          });
          return fit(joinList(values, 'or'));
        },
      };
    }
    if (detailString(node, 'source') === 'CHECK') {
      const condition = detailString(node, 'condition') || stripCondition(node.label);
      const q = conditionToQuestion(condition, ctx, line);
      const yes = normalise(condition);
      const no = normalise(`NOT ( ${condition} )`);
      return {
        question: q.question,
        arm: (edge) => {
          const key = normalise(edge.condition);
          if (key === yes) return q.trueBranch;
          if (!key || key === no) return q.falseBranch;
          return phrase(edge.condition, node);
        },
      };
    }
    const conditions = conditionsOf(node);
    if (conditions.length <= 1) {
      const condition = conditions[0] ?? stripCondition(node.label);
      const q = conditionToQuestion(condition, ctx, line);
      const yes = normalise(condition);
      const no = normalise(`NOT ( ${condition} )`);
      return {
        question: q.question,
        arm: (edge) => {
          const key = normalise(edge.condition);
          if (key === yes) return q.trueBranch;
          if (!key || key === no) return q.falseBranch;
          return phrase(edge.condition, node);
        },
      };
    }
    // Several arms (an ELSEIF chain): one question on the field they all test,
    // or the neutral "Which case applies?".
    const arms = conditions.map((condition) => armText(condition, env));
    const sameField = arms.every((a) => a && a.key === arms[0]?.key);
    const known = new Map<string, string>();
    conditions.forEach((condition, i) => {
      known.set(normalise(condition), sameField ? fit(arms[i]?.arm ?? '') : phrase(condition, node));
    });
    const firstLeft = parseCondition(conditions[0]);
    const subject = sameField && firstLeft?.k === 'cmp' ? humaniseOperand(firstLeft.left, ctx) : '';
    // 3.1.0: two cases on different subjects are asked by name — "Error set or test run not selected?" — where that
    // fits a label; "Which case applies?" only where it does not.
    const named = !sameField && ctx.reads310 && conditions.length === 2
      ? `${known.get(normalise(conditions[0]))} or ${lcFirst(known.get(normalise(conditions[1])) ?? '')}?`
      : '';
    return {
      question: sameField && subject ? fit(`${subject}?`) : named && named.length <= MAX_LABEL && !/…/.test(named) ? named : 'Which case applies?',
      arm: (edge) => {
        if (!edge.condition) return 'Otherwise';
        return known.get(normalise(edge.condition)) ?? phrase(edge.condition, node);
      },
    };
  };

  /** 3.1.0 (H5b): the customer texts each decision's question was built from, kept until its label is set. */
  const planCustomer = new Map<string, Array<[string, string]>>();
  for (const node of skeletonNodes) {
    if (isDecision(node)) {
      ctx.customerUsed?.clear();
      try {
        plans.set(node.id, planFor(node));
      } catch {
        plans.set(node.id, { question: 'Condition met?', arm: (edge) => (edge.condition ? 'Yes' : 'No') });
      }
      if (ctx.customerUsed?.size) planCustomer.set(node.id, [...ctx.customerUsed]);
    }
  }

  /** Walks back from an end to the branch that leads to it. */
  const leadingOf = (end: SkeletonNode) => {
    let current = end.id;
    let rejected = false;
    const seen = new Set<string>([end.id]);
    for (let step = 0; step < 50; step++) {
      const preds = (ins.get(current) ?? []).filter((e) => e.kind !== 'boundary');
      if (preds.length !== 1) return { lead: null, rejected, line: undefined };
      const edge = preds[0];
      const from = byId.get(edge.from);
      if (!from) break;
      if (isDecision(from) || from.kind === 'error-boundary') {
        const line = lineOf(from);
        if (from.kind === 'loop') return { lead: null, rejected, line };
        if (edge.condition) return { lead: { condition: edge.condition, truth: true }, rejected, line };
        if (from.kind === 'gateway' && from.detail?.branchKind !== 'case') {
          const conditions = detailString(from, 'source') === 'CHECK'
            ? [detailString(from, 'condition') || stripCondition(from.label)]
            : conditionsOf(from);
          if (conditions.length === 1) return { lead: { condition: conditions[0], truth: false }, rejected, line };
        }
        return { lead: null, rejected, line };
      }
      const names = `${from.label} ${detailString(from, 'collapsedFrom')}`;
      if (/(?:^|\s)REJECT/i.test(names)) rejected = true;
      if (seen.has(from.id)) break;
      seen.add(from.id);
      current = from.id;
    }
    return { lead: null, rejected, line: undefined };
  };

  for (const node of skeletonNodes) {
    let label: string;
    ctx.customerUsed?.clear();
    try {
      if (isDecision(node)) {
        label = plans.get(node.id)?.question ?? 'Condition met?';
        for (const [code, text] of planCustomer.get(node.id) ?? []) ctx.customerUsed?.set(code, text);
      } else if (node.kind === 'end-error' || (node.kind === 'end' && node.detail?.early === true)) {
        const { lead, rejected, line } = leadingOf(node);
        label = outcomeName(node, lead, ctx, { rejected, line });
      } else {
        // 3.1.0 (AB-15a): a technical method, or an interface method, that the skeleton folded onto the one thing it
        // does is named by that thing — "Read change request", "Show the result list" — not "Lif store~row".
        const step = ctx.reads310 ? foldedStepOf(node) : null;
        const said = step ? stepName(step, ctx) : '';
        // A getter keeps its own words where its read could only be said as a table's code ("Get tolerance", not
        // "Read ZPP_TOL"): the code is no better a name than the developer's.
        label = said && !(/^get_/i.test(ownMethodName(node.label)) && /^Read [A-Z0-9_/]+$/.test(said)) ? said : stepName(node, ctx);
      }
    } catch {
      label = humaniseRoutine(node.label) || 'Step';
    }
    if (!label && node.kind !== 'parallel-gateway') label = humaniseRoutine(node.label) || 'Step';
    nodes.set(node.id, node.kind === 'parallel-gateway' ? '' : fit(label));
    // 3.1.0: a stop whose German text stays out of the label keeps it, word for word, in its detail.
    const germanText = ctx.reads310 && node.kind === 'end-error' ? messageAt(ctx, lineOf(node)).text : undefined;
    const german = germanText && germanUntranslated(germanText) ? statementAt(ctx, lineOf(node))?.text : undefined;
    technical.set(node.id, german ?? technicalOf(node));
    try {
      technique.set(node.id, techniqueOf(node, ctx));
    } catch {
      technique.set(node.id, '');
    }
    // 3.1.0 (H5b): the customer's own words the label was built from, each marked as theirs.
    const usedCustomer = ctx.customerUsed && node.kind !== 'parallel-gateway' ? [...ctx.customerUsed] : [];
    // 3.1.0 (H4): the author's comment at the statement, or above the routine the element opens.
    if (commentReader && !/^(?:parallel-gateway|start|end)$/.test(node.kind)) {
      try {
        const stmt = statementAt(ctx, lineOf(node));
        let comment = stmt ? commentReader.at(stmt.line, stmt.endLine) : null;
        const routine = /^(?:form|method):(.+)$/i.exec(node.expandsTo ?? '')?.[1];
        if (!comment && routine) {
          const name = routine.split(/=>|~|\./).pop()?.toLowerCase() ?? '';
          const def = ctx.statements.find((s) => new RegExp(`^(?:FORM|METHOD)\\s+${name.replace(/[^\w/]/g, '')}\\b`, 'i').test(s.text));
          if (def) comment = commentReader.at(def.line, def.line);
        }
        if (comment) comments.set(node.id, comment);
      } catch { /* no comment */ }
    }
    // 3.1.0: an unknown check says so beside its label (owner decision 06.11.2026).
    if (ctx.reads310 && node.kind === 'gateway' && node.detail?.branchKind !== 'case') {
      try {
        const conditions = detailString(node, 'source') === 'CHECK'
          ? [detailString(node, 'condition') || stripCondition(node.label)]
          : conditionsOf(node);
        const note = unstatedCheckNote((conditions.length ? conditions : [stripCondition(node.label)]).flatMap((c) => unstatedFieldsOf(c, ctx)));
        if (note) details.set(node.id, note);
      } catch { /* no note */ }
    }
    if (usedCustomer.length) {
      const said = `${CUSTOMER_TEXT_LABEL}: ${usedCustomer.map(([code, text]) => `${code} “${text}”`).join('; ')}.`;
      details.set(node.id, [details.get(node.id), said].filter(Boolean).join(' '));
    }
  }

  return {
    nodes,
    flow(edge: SkeletonEdge): string {
      try {
        if (!edge || edge.kind === 'boundary') return '';
        const from = byId.get(edge.from);
        if (from && isDecision(from)) return fit(plans.get(from.id)?.arm(edge) ?? '');
        if (from?.kind === 'error-boundary') return '';
        if (!edge.condition) return '';
        // A condition on a flow out of a step (a folded run switch, the
        // survivor of a folded `IF sy-subrc`, a synthetic bypass): its
        // `sy-subrc` is the one the step itself sets.
        const own = from ? statementAt(ctx, lineOf(from)) : undefined;
        const after = own ? own.endLine + 1 : lineOf(from);
        return fit(conditionToPhrase(edge.condition, ctx, after));
      } catch {
        return '';
      }
    },
    technical(nodeId: string): string {
      return technical.get(nodeId) ?? '';
    },
    technique(nodeId: string): string {
      return technique.get(nodeId) ?? '';
    },
    detail(nodeId: string): string {
      return details.get(nodeId) ?? '';
    },
    comment(nodeId: string): AuthorComment | null {
      return comments.get(nodeId) ?? null;
    },
    lane(lane: { kind: string; name: string }): string {
      if (!ctx.reads310 || lane.kind !== 'authority') return '';
      const token = lane.name.trim().toUpperCase();
      const word = own(SAP_AUTHORIZATION_OBJECTS, token);
      return word ? `Authorization for ${lcFirst(word)} (${token})` : '';
    },
    workflow: ctx.reads310 && ctx.stateMachine ? workflowLabelsOf(ctx.stateMachine(), ctx) : null,
  };
}

/** Function codes of the SAP GUI and ALV standard that a user-command branch tests. */
const STANDARD_FUNCTION_CODES: Readonly<Record<string, string>> = Object.freeze({
  '&IC1': 'Double-click',
  '&F03': 'Back',
  '&F15': 'Exit',
  '&F12': 'Cancel',
  '&DATA_SAVE': 'Save',
});

function splitCaseValues(condition: string): string[] {
  return splitOutside(stripCondition(condition).replace(/\s+OR\s+/gi, ','), ',');
}

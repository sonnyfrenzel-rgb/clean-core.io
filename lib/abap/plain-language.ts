import type { ProcessSkeleton, SkeletonEdge, SkeletonNode } from './process-skeleton';
import {
  ACRONYMS,
  EVENT_TERMS_EN,
  FIELD_TERMS_EN,
  FUNCTION_TERMS_EN,
  ROUTINE_ABBREVIATIONS,
  STEM_ABBREVIATIONS,
  TABLE_TERMS_EN,
  TRANSACTION_TERMS_EN,
  type PlainTerm,
} from './plain-glossary';

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

/** No label this module produces is longer than this. */
export const MAX_LABEL = 48;

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
export function plainContext(source: string): PlainContext {
  try {
    const lines = String(source ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    const statements = splitStatements(lines);
    const selections = new Map<string, SelectionField>();
    const constants = new Map<string, string>();
    const types = new Map<string, string>();
    const tables = new Set<string>();
    const flags = new Set<string>();
    for (const statement of statements) {
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
        const type = /\b(?:TYPE|LIKE)\s+(?:REF\s+TO\s+)?([\w/-]+)/i.exec(rest)?.[1]?.toLowerCase();
        if (type) {
          types.set(name, type);
          if (type === 'abap_bool' || type === 'boole_d' || type === 'xfeld' || type === 'flag') flags.add(name);
        }
      }
    }
    return { lines, statements, selections, constants, types, tables, flags };
  } catch {
    return EMPTY_CONTEXT;
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
  /^(?:lv|gv|ls|lt|gt|gs|iv|ev|cv|rv|it|et|ct|rt|is|es|cs|rs|lo|go|io|ro|mv|ms|mt|mo|lc|gc|fs|wa|p|s|c)_/;

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

/** Word-by-word English for an identifier stem without a glossary entry. */
function humaniseStem(stem: string): string {
  const key = stem.toLowerCase();
  const hit = FIELD_TERMS_EN[key];
  if (hit) return hit.singular;
  const words = key.split(/[_\s]+/).filter(Boolean).map((w) => {
    const abbreviation = STEM_ABBREVIATIONS[w];
    if (abbreviation) return abbreviation;
    const term = FIELD_TERMS_EN[w];
    if (term && w.length >= 4 && !PLAIN_WORD_KEYS.has(w)
      && term.singular.toLowerCase().replace(/s$/, '') !== w.replace(/s$/, '')) {
      return lcFirst(term.singular);
    }
    return wordCase(w);
  });
  return sentenceCase(words.join(' ')) || stem;
}

/** Glossary keys that are ordinary English words — not expanded inside a compound stem. */
const PLAIN_WORD_KEYS = new Set(['where', 'form', 'case', 'func', 'rows', 'keys', 'text', 'type', 'name', 'land']);

function tableTermOf(name: string): PlainTerm | null {
  return TABLE_TERMS_EN[name.trim().toLowerCase()] ?? null;
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
  if (/s$/.test(word) || / data$|stock$|status$/.test(word)) return word;
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
  return `${word}s`;
}

/** What one entry of an internal table is called: `gt_orders` → "order". */
function itemOf(identifier: string): string {
  const stem = stemOf(identifier);
  const term = FIELD_TERMS_EN[stem];
  if (term) return lcFirst(term.singular);
  return lcFirst(singularOf(humaniseStem(stem)));
}

/** What several entries are called: `gt_orders` → "orders", `lt_kunnr` → "customer numbers". */
function itemsOf(identifier: string): string {
  const stem = stemOf(identifier);
  const term = FIELD_TERMS_EN[stem];
  if (term) return lcFirst(term.plural);
  return lcFirst(pluralOf(humaniseStem(stem)));
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
    if (lower.startsWith('sy-')) return SY_TERMS[lower] ?? humaniseStem(lower.slice(3));
    const constant = c.constants.get(lower);
    if (constant !== undefined && constant.trim() && constant.length <= 12) return constant;
    const selection = c.selections.get(lower);
    if (selection?.ref) {
      const field = selection.ref.split('-').pop() ?? '';
      const term = FIELD_TERMS_EN[field];
      if (term) return termWord(term, short);
    }
    const parts = lower.split(/->|=>|-|~/).filter(Boolean);
    if (parts.length > 1) {
      const field = parts[parts.length - 1];
      const term = FIELD_TERMS_EN[field];
      if (term) return termWord(term, short);
      const owner = parts[parts.length - 2];
      const ownerType = c.types.get(owner) ?? owner.replace(IDENTIFIER_PREFIX, '');
      const table = tableTermOf(ownerType);
      if (table && !field.includes('_') && field.length <= 10) {
        return `${field.toUpperCase()} of ${lcFirst(table.singular)}`;
      }
      return humaniseStem(field.replace(IDENTIFIER_PREFIX, '') || field);
    }
    const stemTerm = FIELD_TERMS_EN[stemOf(lower)];
    if (stemTerm) return termWord(stemTerm, short);
    return humaniseStem(stemOf(lower));
  } catch {
    return String(identifier ?? '');
  }
}

/**
 * A routine, function module or event name as words: `READ_REQUISITION` →
 * "Read requisition", `CHANGE_SALES_ORDER_BDC` → "Change sales order batch input".
 */
export function humaniseRoutine(name: string): string {
  try {
    let words = String(name ?? '').trim().toLowerCase()
      .replace(/^\/\w+\//, '')
      .split(/[_\s-]+/).filter(Boolean);
    if (words.length > 1 && (words[0] === 'z' || words[0] === 'y')) words = words.slice(1);
    else if (words.length && /^[zy][a-z]{0,2}$/.test(words[0]) && words.length > 1 && words[0].length === 1) {
      words = words.slice(1);
    }
    const out = words.map((w) => ROUTINE_ABBREVIATIONS[w] ?? wordCase(w));
    return sentenceCase(out.join(' '));
  } catch {
    return String(name ?? '');
  }
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
  const question = s.endsWith('?');
  const room = max - 1 - (question ? 1 : 0);
  let cut = s.slice(0, room);
  const space = cut.lastIndexOf(' ');
  if (space > room / 2) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,:;–-]+$/, '')}…${question ? '?' : ''}`;
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
      return { kind: 'read-table', table: /^READ\s+TABLE\s+([\w<>\-[\]/]+)/i.exec(text)?.[1] ?? '' };
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

/** "Found"/"Nothing found" and their kin, as specific as the setter allows. */
function subrcPhrase(setter: Setter, success: boolean, short: boolean): string {
  switch (setter.kind) {
    case 'select': {
      const term = tableTermOf(setter.table);
      if (!term || short) return success ? 'Found' : 'Nothing found';
      const word = setter.single ? term.singular : term.plural;
      return success ? `${word} found` : `No ${lcFirst(word)} found`;
    }
    case 'read-table': {
      if (short || !setter.table) return success ? 'Found' : 'Nothing found';
      const item = itemOf(setter.table);
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

function isParticiple(identifier: string): boolean {
  const words = humaniseStem(stemOf(identifier)).toLowerCase();
  return /ed$/.test(words) || STATE_WORDS.has(words);
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
  if (/\(/.test(text)) {
    const fn = /^([\w~>=-]+)\(/.exec(text)?.[1] ?? '';
    if (/^line_exists$/i.test(fn)) return 'Entry exists';
    if (/^lines$/i.test(fn)) {
      const inner = /\(\s*([\w<>\-[\]]+)\s*\)/.exec(text)?.[1];
      return inner ? `Number of ${itemsOf(inner)}` : 'Number of entries';
    }
    const name = fn.split(/->|=>/).pop() ?? fn;
    return humaniseRoutine(name) || 'Result';
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
      const phrase = subrcPhrase(setterBefore(env.ctx, env.line), success, env.short);
      return { key, subject: phrase, full: phrase, pred: lcFirst(phrase), arm: phrase };
    }
    const value = cleanIdentifier(c.right);
    const phrase = c.op === '=' ? `Return code ${value}` : `Return code ${opWords(c.op, value)}`;
    return { key, subject: 'Return code', full: phrase, pred: lcFirst(phrase), arm: phrase };
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
    const participle = !selection && isParticiple(left);
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
      const items = itemsOf(left);
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
    case 'CO': return `only contains ${value}`;
    case 'CN': return `not only ${value}`;
    case 'CA': return `contains any of ${value}`;
    case 'NA': return `contains none of ${value}`;
    default: return value;
  }
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
  let full: string | null = null;
  if (atoms && atoms.length > 1) {
    const sameKey = atoms.every((a) => a.key === atoms[0].key) && atoms[0].key !== 'sy-subrc';
    if (sameKey) {
      const subject = atoms[0].subject;
      const flatCmp = flat as Extract<Cond, { k: 'cmp' }>[];
      if (joiner === 'or' && flatCmp.every((p) => p.op === '=') && atoms.every((a) => a.value !== undefined)) {
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
  if (full === null) {
    const parts = flat.map((p) => render(p, env).full);
    full = parts.map((p, i) => (i === 0 ? p : lcFirst(p))).join(` ${joiner} `);
  }
  return { full, question: `${full}?`, inverted: false };
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
          return {
            question: r.question,
            yes: 'Yes',
            no: 'No',
            trueBranch: r.inverted ? 'No' : 'Yes',
            falseBranch: r.inverted ? 'Yes' : 'No',
          };
        }
      }
    }
    const literal = literalRendering(condition, c);
    if (literal && literal.length <= 40) return { ...NEUTRAL_QUESTION, question: `${literal}?` };
    return { ...NEUTRAL_QUESTION };
  } catch {
    return { ...NEUTRAL_QUESTION };
  }
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
      const subject = humaniseStem(stemOf(input.constant.name));
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

function functionName(name: string, dynamic: boolean): string {
  if (dynamic) return 'Call function (dynamic)';
  const upper = name.trim().toUpperCase();
  return FUNCTION_TERMS_EN[upper] ?? (humaniseRoutine(upper.replace(/^[ZY]_/, '')) || upper);
}

function readName(node: SkeletonNode): string {
  const tables = Array.isArray(node.detail?.tables) ? (node.detail?.tables as string[]) : [node.label];
  const single = node.detail?.single === true;
  const first = tableTermOf(tables[0] ?? '');
  if (!first) return `Read ${tables[0] ?? node.label}`;
  const word = (term: PlainTerm) => lcFirst(single ? term.singular : term.plural);
  if (tables.length === 1) return `Read ${word(first)}`;
  const second = tableTermOf(tables[1] ?? '');
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
    return `Update ${lcFirst(humaniseStem(stemOf(target)))} list`;
  }
  const term = tableTermOf(target);
  if (term) return `${verb} ${lcFirst(term.singular)}`;
  return `${verb} entry in ${target.toUpperCase()}`;
}

/** Readable name for a step, a sub-process, a loop or an event. */
export function stepName(node: SkeletonNode, ctx?: PlainContext): string {
  try {
    const c = contextOf(ctx);
    const line = node.anchor?.lineStart;
    switch (node.kind) {
      case 'start': {
        if (node.detail?.subProcess === true) return 'Start';
        const origin = detailString(node, 'origin');
        if (origin && origin !== 'event' && origin !== 'implicit') return 'Start';
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
      if (isMultiInstance(node)) return fit(`For each ${itemOf(node.label)}`);
      return loopQuestion(node, c);
    }
    if (isCallSite(node)) return fit(humaniseRoutine(node.label));
    switch (node.kind) {
      case 'read':
        return fit(readName(node));
      case 'write':
        return fit(writeName(node, c));
      case 'service-task':
      case 'send-task':
        return fit(functionName(node.label, node.detail?.dynamic === true));
      case 'user-task': {
        if (detailString(node, 'message')) return 'Show message';
        if (/^\d+$/.test(node.label)) return `Show screen ${node.label}`;
        return fit(functionName(node.label, node.detail?.dynamic === true));
      }
      case 'output': {
        const target = detailString(node, 'target');
        const label = node.label.toUpperCase();
        if (target === 'list') return 'Write list';
        if (target === 'file') {
          if (label === 'OPEN') return 'Open file';
          if (label === 'CLOSE') return 'Close file';
          if (label === 'READ') return 'Read file';
          if (label === 'DELETE') return 'Delete file';
          return 'Write file';
        }
        return fit(functionName(node.label, node.detail?.dynamic === true));
      }
      case 'transaction': {
        if (node.detail?.dynamic === true) return 'Run transaction (dynamic)';
        return fit(TRANSACTION_TERMS_EN[node.label.toUpperCase()] ?? `Run transaction ${node.label.toUpperCase()}`);
      }
      case 'call-activity': {
        const text = statementAt(c, line)?.text ?? '';
        if (/^LEAVE\s+TO\s+TRANSACTION\b/i.test(text) || node.detail?.returns === false && !/^SUBMIT\b/i.test(text)) {
          const known = TRANSACTION_TERMS_EN[node.label.toUpperCase()];
          return fit(known ? `Go to: ${lcFirst(known)}` : `Go to transaction ${node.label.toUpperCase()}`);
        }
        return fit(`Run program ${node.label.toUpperCase()}`);
      }
      case 'call-opaque': {
        if (/^PERFORM$/i.test(node.label)) return 'Call routine';
        const name = node.label.replace(/\(.*$/, '').split(/->|=>/).pop() ?? node.label;
        return fit(humaniseRoutine(name) || 'Call');
      }
      default:
        return fit(humaniseRoutine(node.label) || 'Step');
    }
  } catch {
    return fit(humaniseRoutine(node?.label ?? '') || 'Step');
  }
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
  if (over) return fit(`More ${itemsOf(over)}?`);
  const text = statementAt(ctx, node.anchor?.lineStart)?.text ?? '';
  if (/^WHILE\s/i.test(text)) return conditionToQuestion(text, ctx, node.anchor?.lineStart).question;
  if (/^LOOP\s+AT\s+([\w<>-]+)/i.test(text)) {
    return fit(`More ${itemsOf(/^LOOP\s+AT\s+([\w<>-]+)/i.exec(text)?.[1] ?? '')}?`);
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
      if (message.text) return fit(`Stop: ${lcFirst(shortText(message.text))}`);
      if (message.leaveProgram) return 'Program ends';
      const id = message.id ?? (/^[AEIWSX]\d{3}$/i.test(end.label) ? end.label.toUpperCase() : '');
      for (const short of [false, true]) {
        const phrase = phraseOf(short);
        if (!phrase || phrase === 'Condition met') continue;
        const withId = `Stop: ${lcFirst(phrase)}${id ? ` (${id})` : ''}`;
        if (withId.length <= MAX_LABEL) return withId;
        const without = `Stop: ${lcFirst(phrase)}`;
        if (without.length <= MAX_LABEL) return without;
      }
      if (message.withText) return fit(`Stop: ${lcFirst(shortText(message.withText, 5))}${id ? ` (${id})` : ''}`);
      if (message.raised) return fit(`Stop: ${lcFirst(humaniseRoutine(message.raised.replace(/^[ZY]?CX_/i, '')))}`);
      if (id) return `Error ${id}`;
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

/**
 * Every node of a skeleton gets a plain-language label (a parallel gateway
 * gets none, by BPMN convention), and every flow out of a decision gets the
 * name of its branch.
 */
export function plainLabels(skeleton: ProcessSkeleton, source?: string): PlainLabels {
  const ctx = plainContext(source ?? '');
  const nodes = new Map<string, string>();
  const technical = new Map<string, string>();
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
      return {
        question: fit(`${humaniseOperand(node.label, ctx)}?`),
        arm: (edge) => {
          if (!edge.condition) return 'Other';
          const values = splitCaseValues(edge.condition).map((v) =>
            (/^['`]/.test(v) || /^-?\d+$/.test(v) ? humaniseLiteralValue(v) : humaniseField(v, ctx)));
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
    return {
      question: sameField && subject ? fit(`${subject}?`) : 'Which case applies?',
      arm: (edge) => {
        if (!edge.condition) return 'Otherwise';
        return known.get(normalise(edge.condition)) ?? phrase(edge.condition, node);
      },
    };
  };

  for (const node of skeletonNodes) {
    if (isDecision(node)) {
      try {
        plans.set(node.id, planFor(node));
      } catch {
        plans.set(node.id, { question: 'Condition met?', arm: (edge) => (edge.condition ? 'Yes' : 'No') });
      }
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
    try {
      if (isDecision(node)) {
        label = plans.get(node.id)?.question ?? 'Condition met?';
      } else if (node.kind === 'end-error' || (node.kind === 'end' && node.detail?.early === true)) {
        const { lead, rejected, line } = leadingOf(node);
        label = outcomeName(node, lead, ctx, { rejected, line });
      } else {
        label = stepName(node, ctx);
      }
    } catch {
      label = humaniseRoutine(node.label) || 'Step';
    }
    if (!label && node.kind !== 'parallel-gateway') label = humaniseRoutine(node.label) || 'Step';
    nodes.set(node.id, node.kind === 'parallel-gateway' ? '' : fit(label));
    technical.set(node.id, technicalOf(node));
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
  };
}

function splitCaseValues(condition: string): string[] {
  return splitOutside(stripCondition(condition).replace(/\s+OR\s+/gi, ','), ',');
}

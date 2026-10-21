/**
 * The fixed library files of the Node.js scaffold (design §6.2): exact
 * decimals, the CSV writer and reader, the run store and the errors. The same
 * text for every program — written by the engine, never by the model, and
 * probed on every package by the acceptance harness (rounding, decimal
 * quantities, run ids, CSV escaping; design §6.2, "six of the ten probes test
 * code the model cannot change").
 *
 * The files are TypeScript a current Node runs without a build step (only
 * erasable syntax, relative imports with their `.ts` extension, `import type`
 * for types), so the harness and the isolated runner import them as they are.
 *
 * The decimal algorithms are those of `lib/testing-engine-cases.ts`
 * (`parseDecimal`, `formatScaled`, `divRound`, `roundCommercial`): one
 * arithmetic for the expected values and for the code under test.
 *
 * Pure strings. No network, no model.
 */

/** srv/lib/errors.ts */
export const ERRORS_TS = String.raw`/**
 * Errors of the package. Written by Clean-Core.io (engine) — not a model proposal.
 */

/** One reason a request is refused: the request path or original field, the rule id or line, and a sentence. */
export interface RefusalError {
  field: string | null;
  rule: string;
  message: string;
}

/** A refusal of the whole input, as the original's error message, RAISE, LEAVE or STOP refuses it. */
export class Refusal extends Error {
  readonly errors: RefusalError[];
  constructor(errors: RefusalError[]) {
    super(errors.map((e) => e.message).join('; '));
    this.name = 'Refusal';
    this.errors = errors;
  }
}

/** A function the generation left as a stub: the model did not write it, or its body was refused. */
export class NotImplementedFill extends Error {
  readonly unitId: string;
  readonly fn: string;
  constructor(unitId: string, fn: string) {
    super(unitId + ' ' + fn + ': not written - the generation left this function as a stub');
    this.name = 'NotImplementedFill';
    this.unitId = unitId;
    this.fn = fn;
  }
}
`;

/** srv/lib/decimal.ts */
export const DECIMAL_TS = String.raw`/**
 * Exact decimals for packed fields (ABAP TYPE p): a value is a decimal string
 * at its field's places, computed on scaled bigint - never binary floating
 * point. Rounding is commercial (half away from zero) for both signs, as ABAP
 * rounds on assignment to a packed field.
 * Written by Clean-Core.io (engine) - not a model proposal.
 */

export interface Scaled {
  v: bigint;
  d: number;
}

/**
 * A decimal value as a body holds one: its text at the field's places ("12.50" - the one representation of a
 * packed field, a record field, a global and a check's value), a finite number (a count, sy-subrc), or what
 * parse returned. Every helper takes any of them, so a value a step computed passes as it is.
 */
export type Decimal = string | number | Scaled;

const TEN = BigInt(10);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const pow10 = (n: number): bigint => TEN ** BigInt(n);
const STRICT = /^([-+]?)(\d+)(?:\.(\d+))?$/;

const isScaled = (x: unknown): x is Scaled => typeof x === 'object' && x !== null && typeof (x as Scaled).v === 'bigint' && typeof (x as Scaled).d === 'number';

/** "-12.345" -> { v: -12345n, d: 3 }; null when it is not a plain decimal (no exponent, no unit, no spaces inside). */
export function parse(text: Decimal | null | undefined): Scaled | null {
  if (isScaled(text)) return text;
  const raw = typeof text === 'number' ? (Number.isFinite(text) && !/e/i.test(String(text)) ? String(text) : '') : text;
  if (typeof raw !== 'string') return null;
  const m = STRICT.exec(raw.trim());
  if (!m) return null;
  const frac = m[3] ?? '';
  const v = BigInt(m[2] + frac);
  return { v: m[1] === '-' ? -v : v, d: frac.length };
}

/** Like parse, but throws a RangeError naming the value. */
export function must(text: Decimal): Scaled {
  const p = parse(text);
  if (!p) throw new RangeError('not a decimal: ' + String(text));
  return p;
}

/**
 * A decimal with exactly d places; never "-0". A bigint is a scaled integer (format(1250n, 2) is "12.50");
 * any other value is rounded commercially to d places (format("12.5", 2) is "12.50").
 */
export function format(v: bigint | Decimal, d: number): string {
  if (typeof v !== 'bigint') return round(v, d);
  const neg = v < ZERO;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(d + 1, '0');
  const int = d > 0 ? s.slice(0, -d) : s;
  const frac = d > 0 ? '.' + s.slice(-d) : '';
  return (neg && abs !== ZERO ? '-' : '') + int + frac;
}

/** a / b rounded half away from zero. */
export function divRound(a: bigint, b: bigint): bigint {
  if (b === ZERO) throw new RangeError('division by zero');
  const neg = a < ZERO !== b < ZERO;
  const aa = a < ZERO ? -a : a;
  const bb = b < ZERO ? -b : b;
  let q = aa / bb;
  if ((aa % bb) * TWO >= bb) q += ONE;
  return neg ? -q : q;
}

function at(x: Scaled, d: number): bigint {
  return d >= x.d ? x.v * pow10(d - x.d) : divRound(x.v, pow10(x.d - d));
}

/** A decimal rounded commercially to places. */
export function round(text: Decimal, places: number): string {
  return format(at(must(text), places), places);
}

export function add(a: Decimal, b: Decimal, places: number): string {
  const x = must(a);
  const y = must(b);
  const d = Math.max(x.d, y.d);
  return format(at({ v: at(x, d) + at(y, d), d }, places), places);
}

export function sub(a: Decimal, b: Decimal, places: number): string {
  const x = must(a);
  const y = must(b);
  const d = Math.max(x.d, y.d);
  return format(at({ v: at(x, d) - at(y, d), d }, places), places);
}

export function mul(a: Decimal, b: Decimal, places: number): string {
  const x = must(a);
  const y = must(b);
  return format(at({ v: x.v * y.v, d: x.d + y.d }, places), places);
}

/** a / b at places, rounded commercially; throws on division by zero. */
export function div(a: Decimal, b: Decimal, places: number): string {
  const x = must(a);
  const y = must(b);
  if (y.v === ZERO) throw new RangeError('division by zero');
  return format(divRound(x.v * pow10(places + y.d), y.v * pow10(x.d)), places);
}

/** -1, 0 or 1. */
export function compare(a: Decimal, b: Decimal): number {
  const x = must(a);
  const y = must(b);
  const d = Math.max(x.d, y.d);
  const l = at(x, d);
  const r = at(y, d);
  return l === r ? 0 : l < r ? -1 : 1;
}

/** A value as text at its own places ("12.50" stays "12.50", 3 is "3"). */
const asText = (a: Decimal): string => (typeof a === 'string' ? a : format(must(a).v, must(a).d));

export const isZero = (a: Decimal): boolean => must(a).v === ZERO;
export const neg = (a: Decimal, places: number): string => sub('0', a, places);
export const abs = (a: Decimal, places: number): string => (must(a).v < ZERO ? neg(a, places) : round(a, places));
export const max = (a: Decimal, b: Decimal): string => (compare(a, b) >= 0 ? asText(a) : asText(b));
export const min = (a: Decimal, b: Decimal): string => (compare(a, b) <= 0 ? asText(a) : asText(b));

/** Does a value at its places fit the bound of its type (|value| <= max)? */
export function fits(text: Decimal, bound: Decimal): boolean {
  const x = must(text);
  const m = must(bound);
  const d = Math.max(x.d, m.d);
  const v = at(x, d);
  return (v < ZERO ? -v : v) <= at(m, d);
}

/** amount x rate % at places, rounded commercially. */
export function percentOf(amount: Decimal, ratePercent: Decimal, places: number): string {
  const a = must(amount);
  const r = must(ratePercent);
  return format(divRound(a.v * r.v * pow10(places), pow10(a.d + r.d + 2)), places);
}
`;

/** srv/lib/csv.ts — RFC 4180 with the formula guard (rule 20). */
export const CSV_TS = String.raw`/**
 * CSV as RFC 4180 writes it: a field holding the delimiter, a quote or a line
 * break is quoted and inner quotes are doubled; records end with CRLF.
 *
 * Formula guard: a text cell whose first character after leading spaces and
 * tabs is = + - or @, or that starts with a tab or a carriage return, gets a
 * leading apostrophe, so a spreadsheet shows it as text instead of running it
 * (rule 20; security finding SEC-2026-803: " =1+1" is caught, not only "=1+1").
 * A cell that is exactly a plain number ("-12.50") is a value, not a formula,
 * and stays as it is.
 * Written by Clean-Core.io (engine) - not a model proposal.
 */

const PLAIN_NUMBER = /^[-+]?\d+(?:\.\d+)?$/;

/** The text a spreadsheet will not run as a formula. */
export function neutralise(text: string): string {
  if (PLAIN_NUMBER.test(text)) return text;
  const lead = text.replace(/^[ \t]+/, '');
  if (/^[=+\-@]/.test(lead) || /^[\t\r]/.test(text)) return "'" + text;
  return text;
}

/** One cell: numbers and booleans as they are, text neutralised, quoted where RFC 4180 needs it. */
export function cell(value: unknown, delimiter: string = ','): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'number') s = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'bigint' || typeof value === 'boolean') s = String(value);
  else s = neutralise(String(value));
  const needsQuotes = s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r');
  return needsQuotes ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function row(values: readonly unknown[], delimiter: string = ','): string {
  return values.map((v) => cell(v, delimiter)).join(delimiter);
}

/** A header line and one line per row, in the order of columns; CRLF line ends. */
export function table(columns: readonly string[], rows: ReadonlyArray<Record<string, unknown>>, delimiter: string = ','): string {
  const lines = [row(columns, delimiter)];
  for (const r of rows) lines.push(row(columns.map((c) => r[c]), delimiter));
  return lines.join('\r\n') + '\r\n';
}

/** RFC 4180 reader: records of fields. Quoted fields may hold the delimiter, quotes and line breaks. */
export function parse(text: string, delimiter: string = ','): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' && text[i + 1] === '\n') i++;
    if (ch === '\n' || ch === '\r') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (quoted) throw new RangeError('CSV: a quoted field is not closed');
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Rows of a CSV with a header line, as objects keyed by the header; a row with another width is refused. */
export function objects(text: string, delimiter: string = ','): Array<Record<string, string>> {
  const records = parse(text, delimiter);
  if (records.length === 0) return [];
  const header = records[0].map((h) => h.trim());
  return records.slice(1).map((r, i) => {
    if (r.length !== header.length) throw new RangeError('CSV: row ' + (i + 2) + ' has ' + r.length + ' fields, the header has ' + header.length);
    const o: Record<string, string> = {};
    header.forEach((h, j) => {
      o[h] = r[j];
    });
    return o;
  });
}
`;

/** srv/lib/run-store.ts — rule 18. */
export const RUN_STORE_TS = String.raw`/**
 * Immutable runs, each under a collision-free id (crypto.randomUUID - never
 * the clock). A run is never overwritten; there is no "latest result".
 * Written by Clean-Core.io (engine) - not a model proposal.
 */
import { randomUUID } from 'node:crypto';

export interface RunRecord<S = unknown, R = unknown> {
  readonly runId: string;
  readonly createdAt: string;
  readonly selection: S;
  readonly sourceRevision: string;
  readonly ruleRevision: string;
  readonly contextDigest: string | null;
  /** False while a function of the process is still a stub (not written by the generation). */
  readonly complete: boolean;
  readonly notFilled: readonly string[];
  readonly records: number;
  readonly result: R;
}

export interface RunStore<S = unknown, R = unknown> {
  create(run: Omit<RunRecord<S, R>, 'runId' | 'createdAt'>): RunRecord<S, R>;
  get(runId: string): RunRecord<S, R> | null;
  size(): number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export function createRunStore<S = unknown, R = unknown>(): RunStore<S, R> {
  const runs = new Map<string, RunRecord<S, R>>();
  return {
    create(run) {
      let runId = randomUUID();
      while (runs.has(runId)) runId = randomUUID();
      const record = deepFreeze(structuredClone({ ...run, runId, createdAt: new Date().toISOString() })) as RunRecord<S, R>;
      runs.set(runId, record);
      return record;
    },
    get(runId) {
      return runs.get(String(runId)) ?? null;
    },
    size() {
      return runs.size;
    },
  };
}
`;

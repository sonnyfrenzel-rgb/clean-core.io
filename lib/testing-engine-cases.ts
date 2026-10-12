/**
 * Boundary cases derived by the engine from the ORIGINAL — written by
 * Clean-Core.io, not by the testing model (roadmap 3.0.12, part C).
 *
 * Three external reviews of generated packages (CO, PP, SD, 12.10.2026) found
 * the same classes of defect that no generated test caught: packed decimals
 * computed in binary floating point (a status changed at 0.3 kg), rounding
 * that is not ABAP's commercial rounding for both signs, the original's guards
 * dropped, `parseInt` accepting "2026x", an empty request reported as a
 * successful simulation, and two runs in the same millisecond overwriting each
 * other. The model's rule-traced cases (ADR-095) depend on the model noticing
 * these; the cases here do not. They are read from the source the active run
 * signed:
 *
 *   - **precision**, for every packed field the source declares (`TYPE p
 *     LENGTH n DECIMALS d`, `name(n) TYPE p DECIMALS d` — read by
 *     `readOriginalContract`, `lib/abap/original-contract.ts`, the same reader
 *     the code-draft prompt states the facts from; n bytes hold 2n − 1
 *     digits): the largest value the declaration holds is accepted, one unit of
 *     the last place more is refused, a value with d+1 places is rounded
 *     commercially (half away from zero, both signs), and sums that binary
 *     floating point gets wrong give the exact decimal result at the field's
 *     places. A field typed by a DDIC element has places the source does not
 *     hold and gets no precision case;
 *   - **guards**, for every check of the source that refuses, stops or skips
 *     (`readGuardsFrom`: an IF/ELSEIF whose own branch ends the flow, every
 *     CHECK) — traced to the engine's business rule on that line when there is
 *     one, else to the line: one case that breaks exactly that check and no
 *     other (PP review TC_01), and one where the excluded input is necessary —
 *     the result differs if the exclusion is lost (TC_10);
 *   - **input contract**, on the selection inputs and the packed fields: an
 *     empty request is not a success; non-finite, "2026x" and "1.9" are
 *     refused for integer inputs; an invalid date (20260230) is refused; a
 *     missing value is not 0;
 *   - **run identity**: two runs in the same millisecond get different ids and
 *     neither overwrites the other.
 *
 * Every case is data — input and expected outcome — with its trace (rule id or
 * declared field, and the line). The expected results are computed here with
 * exact decimal arithmetic (BigInt), never with JavaScript numbers. The suite
 * code that asserts them is asked of the model in the testing prompt, under
 * the case id; the case itself — its inputs and expectations — is never the
 * model's: a model case with an engine id is replaced.
 *
 * Pure: no React, no Firestore, no model. The business rules are handed in, so
 * this module does not pull the rule derivation with it; they only name the
 * guards (`BR-nnn`) and resolve a constant's value.
 */

import type { BusinessRule } from './abap/business-rule-set';
import { readOriginalContract, type OriginalContract } from './abap/original-contract';
import { readStatements } from './abap/statement-reader';
import type { CallExpect, CallValue, EngineCaseCall } from './engine-call-contract';

/* ------------------------------------------------------------------ types */

export const ENGINE_CASE_PREFIX = 'TC_ENG_';

export type EngineCaseFamily = 'precision' | 'guard' | 'contract' | 'run-identity';

export type EngineCaseKind =
  | 'precision-max'
  | 'precision-overflow'
  | 'precision-rounding'
  | 'precision-exact-arithmetic'
  | 'guard-breaks-one'
  | 'guard-exclusion-necessary'
  | 'contract-empty-request'
  | 'contract-integer'
  | 'contract-non-finite'
  | 'contract-date'
  | 'contract-null-not-zero'
  | 'run-identity';

export const ENGINE_CASE_FAMILY_WORD: Readonly<Record<EngineCaseFamily, string>> = Object.freeze({
  precision: 'precision',
  guard: 'guard',
  contract: 'input contract',
  'run-identity': 'run identity',
});

/** Where a case comes from. Firestore-safe: no nested arrays, no `undefined`. */
export interface EngineCaseTrace {
  basis: 'declared-type' | 'business-rule' | 'input-contract' | 'run-identity';
  /** The business rule a guard case breaks: `BR-004`. */
  ruleId?: string;
  /** The declared field(s) a precision or contract case is about. */
  field?: string;
  /** The declaration as the engine read it: `P(13,2)`, `ddic:GJAHR`. */
  declaration?: string;
  /** Lines of the ORIGINAL. Empty only for run identity, which no line declares. */
  lines: Array<{ start: number; end: number }>;
  /** The source line, verbatim (trimmed). */
  quote?: string;
}

export interface EngineCaseExample {
  input: string;
  expected: string;
  /**
   * The same example in machine form, run through the call contract
   * (`lib/engine-call-contract.ts`) without a model-written assertion. Absent
   * where the contract cannot express it (exact arithmetic, a value with no
   * machine form): the model's test is then the only assertion.
   */
  call?: EngineCaseCall;
}

export interface EngineCaseData {
  kind: EngineCaseKind;
  family: EngineCaseFamily;
  trace: EngineCaseTrace;
  examples: EngineCaseExample[];
}

/** One engine case as it is stored in `testCases` — the fields every case has, plus its data. */
export interface EngineTestCase {
  id: string;
  name: string;
  category: string;
  description: string;
  priority: 'High' | 'Medium';
  steps: string[];
  expectedResult: string;
  testData: string;
  /** Who wrote the case: the engine. A model case has no `origin`. */
  origin: 'engine';
  engineCase: EngineCaseData;
  /** For a guard case: the rule, so the origin check anchors it like a model case. */
  derivedFrom?: { kind: 'rule'; ref: string; lines: Array<{ start: number; end: number }>; quote?: string };
}

export interface EngineCaseDerivation {
  cases: EngineTestCase[];
  /** What was left out and why — said, never silent. */
  limits: string[];
  /** Cases past the caps, counted for STATUS ("n more not covered"). */
  notCovered: { precision: number; guard: number };
}

/* ---------------------------------------------------------------- limits */

/**
 * At most this many precision cases (four per packed field: selection inputs
 * first, then record components, then working variables) and this many guard cases (two per check: checks
 * with a business-rule id first, then source order). Owner, 12.10.2026: the
 * rest is counted in STATUS as not covered.
 */
export const MAX_PRECISION_CASES = 20;
export const MAX_GUARD_CASES = 20;
/** At most this many fields are listed in one contract case. */
const MAX_CONTRACT_FIELDS = 8;

/* ------------------------------------------------------- exact decimals */

const pow10 = (n: number): bigint => BigInt(10) ** BigInt(n);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/** A scaled integer as a decimal string with exactly `d` places; never "-0". */
export function formatScaled(v: bigint, d: number): string {
  const neg = v < ZERO;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(d + 1, '0');
  const int = d > 0 ? s.slice(0, -d) : s;
  const frac = d > 0 ? `.${s.slice(-d)}` : '';
  return `${neg && abs !== ZERO ? '-' : ''}${int}${frac}`;
}

/** `"-12.345"` → { v: -12345n, d: 3 }; null when it is not a plain decimal. */
export function parseDecimal(text: string): { v: bigint; d: number } | null {
  const m = text.trim().match(/^([-+]?)(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const frac = m[3] ?? '';
  const v = BigInt(`${m[2]}${frac}`);
  return { v: m[1] === '-' ? -v : v, d: frac.length };
}

/** a / b rounded half away from zero — ABAP's commercial rounding. */
export function divRound(a: bigint, b: bigint): bigint {
  const neg = a < ZERO !== b < ZERO;
  const aa = a < ZERO ? -a : a;
  const bb = b < ZERO ? -b : b;
  let q = aa / bb;
  if ((aa % bb) * TWO >= bb) q += ONE;
  return neg ? -q : q;
}

/** A decimal rounded commercially to `to` places, as ABAP assigns it to a packed field. */
export function roundCommercial(text: string, to: number): string {
  const p = parseDecimal(text);
  if (!p) throw new Error(`not a decimal: ${text}`);
  if (p.d <= to) return formatScaled(p.v * pow10(to - p.d), to);
  return formatScaled(divRound(p.v, pow10(p.d - to)), to);
}

/** Compare two decimals exactly. */
function compareDecimal(a: string, b: string): number | null {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  if (!x || !y) return null;
  const d = Math.max(x.d, y.d);
  const xv = x.v * pow10(d - x.d);
  const yv = y.v * pow10(d - y.d);
  return xv === yv ? 0 : xv < yv ? -1 : 1;
}

/** Exact sum of decimals, at `d` places (each term rounded commercially first, as a P field holds it). */
function exactAt(terms: readonly string[], d: number, sign: readonly number[]): string {
  let acc = ZERO;
  terms.forEach((t, i) => {
    const r = parseDecimal(roundCommercial(t, d))!;
    acc += sign[i] < 0 ? -r.v : r.v;
  });
  return formatScaled(acc, d);
}

/* --------------------------------------------------------------- fields */

/**
 * One field the cases are about, from `readOriginalContract`: a packed decimal
 * the source declares (`decimals`) or a selection input (`inputs`). An input
 * typed by a name the original contract does not resolve is read by
 * `INPUT_TYPE_KIND` — a short list of built-in types and DDIC elements whose
 * domain is fixed; anything else stays `other` and gets only the empty-request
 * and missing-value cases.
 */
export type FieldKind = 'packed' | 'integer' | 'digits' | 'date' | 'other';

interface Field {
  name: string;
  kind: FieldKind;
  /** Packed: total digits and places, and the largest value (`packedMax`). Digits: the length. */
  digits: number | null;
  decimals: number;
  max: string | null;
  input: boolean;
  /** A component of a structure (`BEGIN OF … END OF`) — a record field that reaches the target as data. */
  component: boolean;
  obligatory: boolean;
  line: number;
  quote: string;
  /** `P(15,2)`, `TYPE gjahr`. */
  declaration: string;
}

/** Built-in ABAP types and DDIC elements with a fixed domain, for selection inputs. */
const INPUT_TYPE_KIND: Readonly<Record<string, { kind: FieldKind; digits?: number; max?: string }>> = Object.freeze({
  I: { kind: 'integer', max: '2147483647' },
  INT4: { kind: 'integer', max: '2147483647' },
  INT8: { kind: 'integer', max: '9223372036854775807' },
  INT2: { kind: 'integer', max: '32767' },
  S: { kind: 'integer', max: '32767' },
  INT1: { kind: 'integer', max: '255' },
  B: { kind: 'integer', max: '255' },
  GJAHR: { kind: 'digits', digits: 4 },
  MONAT: { kind: 'digits', digits: 2 },
  POPER: { kind: 'digits', digits: 3 },
  POSNR: { kind: 'digits', digits: 6 },
  D: { kind: 'date' },
  DATS: { kind: 'date' },
  DATUM: { kind: 'date' },
  SYDATUM: { kind: 'date' },
  BUDAT: { kind: 'date' },
  BLDAT: { kind: 'date' },
  ERDAT: { kind: 'date' },
});

function readFields(source: string, contract: OriginalContract): Field[] {
  const lines = source.split(/\r\n|\r|\n/);
  // A constant is not an input and holds one value: no boundary case for it.
  const keywordAt = new Map<number, string>();
  const componentLines = new Set<number>();
  let depth = 0;
  for (const st of readStatements(source)) {
    if (!keywordAt.has(st.lineStart)) keywordAt.set(st.lineStart, st.keyword);
    const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '');
    if (/^BEGIN\s+OF\b/i.test(rest)) depth++;
    else if (/^END\s+OF\b/i.test(rest)) depth = Math.max(0, depth - 1);
    else if (depth > 0) componentLines.add(st.lineStart);
  }
  const quote = (line: number) => (lines[line - 1] ?? '').trim().replace(/[,.]\s*$/, '').slice(0, 200);
  const inputByName = new Map(contract.inputs.filter((i) => i.kind === 'parameter' && !i.flag).map((i) => [i.name.toLowerCase(), i]));
  const out: Field[] = [];
  const seen = new Set<string>();
  for (const d of contract.decimals) {
    if (keywordAt.get(d.line) === 'CONSTANTS') continue;
    const key = d.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const input = inputByName.get(key);
    out.push({
      name: key,
      kind: 'packed',
      digits: d.digits,
      decimals: d.decimals,
      max: d.max,
      input: !!input,
      component: componentLines.has(d.line),
      obligatory: input?.obligatory ?? false,
      line: d.line,
      quote: quote(d.line),
      declaration: `P(${d.digits},${d.decimals})`,
    });
  }
  for (const i of inputByName.values()) {
    const key = i.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const typeName = (i.type ?? '').toUpperCase();
    const known = INPUT_TYPE_KIND[typeName];
    out.push({
      name: key,
      kind: known?.kind ?? 'other',
      digits: known?.digits ?? null,
      decimals: 0,
      max: known?.max ?? null,
      input: true,
      component: false,
      obligatory: i.obligatory,
      line: i.line,
      quote: quote(i.line),
      declaration: i.type ? `TYPE ${i.type.toLowerCase()}` : 'type not stated',
    });
  }
  return out;
}

/** The declared field a name in a condition refers to: the exact name, else the component name (`gs_rcv-quota` → `quota`). */
function fieldFor(fields: readonly Field[], subject: string | null): Field | null {
  if (!subject) return null;
  const s = subject.toLowerCase();
  const comp = s.includes('-') ? s.slice(s.lastIndexOf('-') + 1) : s;
  return fields.find((f) => f.name === s) ?? fields.find((f) => f.name === comp) ?? null;
}

/* ------------------------------------------------------------- helpers */

const lineRange = (s: number, e: number) => ({ start: s, end: e });
const fieldWord = (f: Field) => f.name.toUpperCase();

function fieldTrace(f: Field): EngineCaseTrace {
  return { basis: 'declared-type', field: f.name, declaration: f.declaration, lines: [lineRange(f.line, f.line)], quote: f.quote };
}

function contractTrace(fields: readonly Field[]): EngineCaseTrace {
  const t: EngineCaseTrace = { basis: 'input-contract', lines: fields.map((f) => lineRange(f.line, f.line)) };
  if (fields.length > 0) {
    t.field = fields.map((f) => f.name).join(', ');
    t.declaration = fields.map((f) => `${f.name}: ${f.declaration}`).join('; ');
  }
  return t;
}

/* ----------------------------------------------------------- precision */

function precisionCases(f: Field, guards: readonly GuardCase[], fields: readonly Field[]): Array<Omit<EngineTestCase, 'id'>> {
  // A value that fits the declaration can still be refused or skipped by one of
  // the original's checks on the same field (SD: P(5,2) holds 999.99, a check
  // refuses anything over 30.00) — the expectation then names that check.
  const guarded = guards.filter((g) => g.numeric && g.operator && g.operand !== null && fieldFor(fields, g.subject) === f);
  const stoppedBy = (value: string): GuardCase | null =>
    guarded.find((g) => {
      const h = holds(value, g.operator!, g.operand!);
      return h !== null && (g.rejectsWhen === 'holds' ? h : !h);
    }) ?? null;
  const then = (value: string): string => {
    const g = stoppedBy(value);
    return g ? `, then ${outcomeWord(g)} by ${guardName(g)} (${g.condition}) as in the original` : '';
  };
  const fits = (value: string): string => {
    const g = stoppedBy(value);
    return g ? `fits ${f.declaration} exactly (${value})${then(value)}` : `accepted; kept exactly as ${value}`;
  };
  const NAME = f.name.toUpperCase();
  /** Accepted and held as `kept` — or, where a check on the field rejects `kept`, refused by that check. */
  const keptCall = (input: string, kept: string): EngineCaseCall => {
    const g = stoppedBy(kept);
    return g
      ? { op: 'simulate', set: [{ field: NAME, to: { value: input } }], expect: guardRefusal(g) }
      : { op: 'validate', set: [{ field: NAME, to: { value: input } }], expect: { kind: 'accepted', field: NAME, normalized: kept } };
  };
  const refusedCall = (input: string): EngineCaseCall => ({ op: 'validate', set: [{ field: NAME, to: { value: input } }], expect: { kind: 'refused', field: NAME } });
  const D = f.digits ?? 15;
  const d = f.decimals;
  const name = fieldWord(f);
  const decl = f.declaration;
  // The bound the ABAP way: n bytes hold 2n − 1 digits (`packedMax`).
  const max = f.max ?? formatScaled(pow10(D) - ONE, d);
  const over = formatScaled(parseDecimal(max)!.v + ONE, d);
  const ulp = formatScaled(ONE, d);
  const trace = fieldTrace(f);
  const where = `declared at L${f.line} as ${decl}`;
  const out: Array<Omit<EngineTestCase, 'id'>> = [];

  out.push(
    makeCase({
      kind: 'precision-max',
      family: 'precision',
      trace,
      name: `${name}: the largest value ${decl} holds is kept exactly`,
      description: `${name} is ${where}: ${D} digits, ${d} of them after the point. The largest value it holds is accepted and kept to the last place.`,
      examples: [
        { input: `${name} = ${max}`, expected: fits(max), call: keptCall(max, max) },
        { input: `${name} = -${max}`, expected: fits(`-${max}`), call: keptCall(`-${max}`, `-${max}`) },
      ],
    }),
  );
  out.push(
    makeCase({
      kind: 'precision-overflow',
      family: 'precision',
      trace,
      name: `${name}: one unit of the last place over the maximum is refused`,
      description: `${name} is ${where}. ${over} is ${max} + ${ulp} and does not fit: the original raises an overflow (CX_SY_CONVERSION_OVERFLOW on assignment, CX_SY_ARITHMETIC_OVERFLOW in a calculation) instead of going on with a wrong value. The target must refuse it — never wrap, truncate or keep it as a binary float.`,
      examples: [
        { input: `${name} = ${over}`, expected: `refused as too large for ${decl}; nothing is computed or stored with it`, call: refusedCall(over) },
        { input: `${name} = -${over}`, expected: `refused as too large for ${decl}; nothing is computed or stored with it`, call: refusedCall(`-${over}`) },
      ],
    }),
  );

  const half = `0.${'0'.repeat(d)}5`;
  const below = `0.${'0'.repeat(d)}4`;
  const tie = d === 0 ? '2.5' : `1.${'0'.repeat(d)}5`;
  const rounding = [half, `-${half}`, below, `-${below}`, tie, `-${tie}`].map((v) => ({ v, input: `${name} = ${v}`, expected: roundCommercial(v, d) }));
  out.push(
    makeCase({
      kind: 'precision-rounding',
      family: 'precision',
      trace,
      name: `${name}: a value with ${d + 1} decimal places is rounded commercially, both signs`,
      description: `${name} is ${where}. ABAP rounds a value with more places than the field holds commercially — half away from zero, the same for negative values — when it is assigned or computed into the field. Banker's rounding, truncation, and Number.prototype.toFixed on a binary float (1.005 → "1.00") all differ from it.`,
      examples: rounding.map((e) => ({ input: e.input, expected: `kept as ${e.expected}${then(e.expected)}`, call: keptCall(e.v, e.expected) })),
    }),
  );

  const arithmetic: EngineCaseExample[] = [];
  if (d > 0) {
    arithmetic.push(
      { input: `${name} = 0.1 + 0.2`, expected: exactAt(['0.1', '0.2'], d, [1, 1]) },
      { input: `${name} = 0.4 - 0.1`, expected: exactAt(['0.4', '0.1'], d, [1, -1]) },
      { input: `${name} = 0.3 - 0.2`, expected: exactAt(['0.3', '0.2'], d, [1, -1]) },
      { input: `${name} = 0.1 added ten times`, expected: exactAt(Array(10).fill('0.1'), d, Array(10).fill(1)) },
    );
  }
  arithmetic.push(
    { input: `${name} = 2 / 3`, expected: formatScaled(divRound(TWO * pow10(d), BigInt(3)), d) },
    { input: `${name} = -2 / 3`, expected: formatScaled(divRound(-TWO * pow10(d), BigInt(3)), d) },
  );
  out.push(
    makeCase({
      kind: 'precision-exact-arithmetic',
      family: 'precision',
      trace,
      name: `${name}: sums and quotients are exact at ${d} decimal places`,
      description: `${name} is ${where}. Packed arithmetic is decimal: 0.1 + 0.2 is 0.3, not 0.30000000000000004, and a quotient is rounded commercially to the field's ${d} places (a ratio of six places stays six). A comparison against a threshold then gives the original's answer — binary floating point changed a status at 0.3 kg (PP review).`,
      examples: arithmetic.map((e) => ({ input: e.input, expected: `exactly ${e.expected}${then(e.expected)}` })),
    }),
  );
  return out;
}

/* --------------------------------------------------------------- guards */

type GuardOutcome = 'refuses' | 'skips';

interface GuardCase {
  /** The engine's business rule on the guard's line, when there is one (`BR-004`). */
  ruleId: string | null;
  /** The condition as written. */
  condition: string;
  /** The rule rejects when its condition holds (IF … ending), or when it fails (CHECK). */
  rejectsWhen: 'holds' | 'fails';
  outcome: GuardOutcome;
  /** How the original ends the flow there: `MESSAGE e002(zco)`, `CONTINUE`. */
  ending: string;
  subject: string | null;
  operator: string | null;
  /** The compared value: a literal (number or text) or a field name. */
  operand: string | null;
  operandIsField: boolean;
  line: number;
  quote: string;
  breaking: string;
  passing: string;
  numeric: boolean;
  /** The breaking value in machine form, or null when it has none ("a value for which … holds"). */
  breakingCall: CallValue | null;
  /** The passing value in machine form; `base` — as in the contract's base request, which passes every check. */
  passingCall: CallValue | 'base';
}

const OPS: Readonly<Record<string, string>> = Object.freeze({
  '>': '>', GT: '>', '>=': '>=', GE: '>=', '<': '<', LT: '<', '<=': '<=', LE: '<=', '=': '=', EQ: '=', '<>': '<>', NE: '<>',
});

/** Lines that stand inside a loop (LOOP, DO, WHILE, SELECT … ENDSELECT). */
function loopLines(source: string): Set<number> {
  const out = new Set<number>();
  let depth = 0;
  for (const st of readStatements(source)) {
    const kw = st.keyword;
    if (kw === 'ENDLOOP' || kw === 'ENDDO' || kw === 'ENDWHILE' || kw === 'ENDSELECT') depth = Math.max(0, depth - 1);
    if (depth > 0) for (let l = st.lineStart; l <= st.lineEnd; l++) out.add(l);
    if (kw === 'LOOP' || kw === 'DO' || kw === 'WHILE' || (kw === 'SELECT' && !/\bSINGLE\b|\bINTO\s+TABLE\b|\bAPPENDING\s+TABLE\b/i.test(st.text))) depth++;
  }
  return out;
}

/** Does `value op literal` hold? null when it cannot be decided exactly. */
function holds(value: string, op: string, literal: string): boolean | null {
  const c = compareDecimal(value, literal);
  if (c === null) return null;
  switch (op) {
    case '>': return c > 0;
    case '>=': return c >= 0;
    case '<': return c < 0;
    case '<=': return c <= 0;
    case '=': return c === 0;
    case '<>': return c !== 0;
    default: return null;
  }
}

function boundaryValues(op: string, operand: string, operandIsField: boolean, scale: number): { holdsValue: string; failsValue: string; numeric: boolean } {
  const p = operandIsField ? null : parseDecimal(operand);
  if (!p) {
    const q = operandIsField ? operand.toUpperCase() : `'${operand}'`;
    const words: Record<string, [string, string]> = {
      '=': [`equal to ${q}`, `different from ${q}`],
      '<>': [`different from ${q}`, `equal to ${q}`],
      '>': [`greater than ${q}`, `equal to ${q}`],
      '>=': [`equal to ${q}`, `less than ${q}`],
      '<': [`less than ${q}`, `equal to ${q}`],
      '<=': [`equal to ${q}`, `greater than ${q}`],
    };
    const w = words[op] ?? [`a value for which "${op} ${q}" holds`, `a value for which "${op} ${q}" does not hold`];
    return { holdsValue: w[0], failsValue: w[1], numeric: false };
  }
  const d = Math.max(scale, p.d);
  const v = p.v * pow10(d - p.d);
  const at = formatScaled(v, d);
  const up = formatScaled(v + ONE, d);
  const down = formatScaled(v - ONE, d);
  switch (op) {
    case '>': return { holdsValue: up, failsValue: at, numeric: true };
    case '>=': return { holdsValue: at, failsValue: down, numeric: true };
    case '<': return { holdsValue: down, failsValue: at, numeric: true };
    case '<=': return { holdsValue: at, failsValue: up, numeric: true };
    case '=': return { holdsValue: at, failsValue: up, numeric: true };
    case '<>': return { holdsValue: up, failsValue: at, numeric: true };
    default: return { holdsValue: `a value for which "${op} ${at}" holds`, failsValue: `a value for which "${op} ${at}" does not hold`, numeric: false };
  }
}

/** The engine rule that stands on a guard's line, and the literal it reads there (through a constant, too). */
function ruleOnLine(rules: readonly BusinessRule[], line: number): { id: string; literal: string | null } | null {
  for (const rule of rules) {
    const param = rule.parameters.find((p) => p.operator.toUpperCase() !== 'VALUE' && p.lineStart <= line && line <= p.lineEnd);
    if (param) return { id: rule.id, literal: param.values[0] ?? null };
    if (rule.typeBasis.some((b) => b.anchors.some((a) => a.lineStart <= line && line <= a.lineEnd))) return { id: rule.id, literal: null };
  }
  return null;
}

function readGuardCases(source: string, contract: OriginalContract, rules: readonly BusinessRule[], fields: readonly Field[]): GuardCase[] {
  const inLoop = loopLines(source);
  const lines = source.split(/\r\n|\r|\n/);
  return contract.guards.map((g): GuardCase => {
    const rule = ruleOnLine(rules, g.line);
    const rejectsWhen: GuardCase['rejectsWhen'] = g.effect === 'check' ? 'fails' : 'holds';
    const outcome: GuardOutcome =
      g.effect === 'continue' || (g.effect === 'check' && inLoop.has(g.line)) ? 'skips' : 'refuses';
    const cond = g.condition.trim();
    let subject: string | null = null;
    let operator: string | null = null;
    let operand: string | null = null;
    let operandIsField = false;
    let breaking = `a value for which "${cond}" ${rejectsWhen === 'holds' ? 'holds' : 'does not hold'}`;
    let passing = `a value for which "${cond}" ${rejectsWhen === 'holds' ? 'does not hold' : 'holds'}`;
    let numeric = false;
    let breakingCall: CallValue | null = null;
    let passingCall: CallValue | 'base' = 'base';
    const initial = cond.match(/^([\w/~-]+)\s+IS\s+(NOT\s+)?INITIAL$/i);
    const cmp = cond.match(/^([\w/~-]+)\s*(>=|<=|<>|=|>|<|\bGE\b|\bLE\b|\bNE\b|\bEQ\b|\bGT\b|\bLT\b)\s*('(?:[^']|'')*'|[\w/~.-]+)$/i);
    if (initial) {
      subject = initial[1];
      const isInitialHolds = !initial[2];
      // "holds" for IS INITIAL means empty; for IS NOT INITIAL it means filled.
      const emptyRejects = (rejectsWhen === 'holds') === isInitialHolds;
      breaking = emptyRejects ? 'empty (initial: no rows, blank, or 0)' : 'filled (not initial)';
      passing = emptyRejects ? 'filled (not initial)' : 'empty (initial)';
      if (emptyRejects) breakingCall = { special: 'empty' };
      else passingCall = { special: 'empty' };
    } else if (cmp) {
      subject = cmp[1];
      operator = OPS[cmp[2].toUpperCase()] ?? cmp[2];
      const raw = cmp[3];
      const quoted = /^'.*'$/.test(raw);
      const literalFromRule = rule?.literal ?? null;
      if (quoted || /^[-+]?\d+(\.\d+)?$/.test(raw)) operand = quoted ? raw.slice(1, -1).replace(/''/g, "'") : raw;
      else if (literalFromRule !== null) operand = literalFromRule; // a constant: the engine read its value
      else {
        operand = raw;
        operandIsField = true;
      }
      const declared = fieldFor(fields, subject);
      const scale = declared?.kind === 'packed' ? declared.decimals : 0;
      const b = boundaryValues(operator, operand, operandIsField, scale);
      breaking = rejectsWhen === 'holds' ? b.holdsValue : b.failsValue;
      passing = rejectsWhen === 'holds' ? b.failsValue : b.holdsValue;
      numeric = b.numeric;
      const holdsCall: CallValue | null = b.numeric
        ? { value: b.holdsValue }
        : operandIsField
          ? operator === '=' ? { sameAs: operand.toUpperCase() } : operator === '<>' ? { differentFrom: operand.toUpperCase() } : null
          : operator === '=' ? { value: operand } : null;
      const failsCall: CallValue | null = b.numeric
        ? { value: b.failsValue }
        : operandIsField
          ? operator === '=' ? { differentFrom: operand.toUpperCase() } : operator === '<>' ? { sameAs: operand.toUpperCase() } : null
          : operator === '<>' ? { value: operand } : null;
      breakingCall = rejectsWhen === 'holds' ? holdsCall : failsCall;
      passingCall = (rejectsWhen === 'holds' ? failsCall : holdsCall) ?? 'base';
    }
    return {
      ruleId: rule?.id ?? null,
      condition: cond,
      rejectsWhen,
      outcome,
      ending: g.ending,
      subject,
      operator,
      operand,
      operandIsField,
      line: g.line,
      quote: (lines[g.line - 1] ?? cond).trim(),
      breaking,
      passing,
      numeric,
      breakingCall,
      passingCall,
    };
  });
}

function notRefusedBy(g: GuardCase): CallExpect {
  const expect: CallExpect = { kind: 'not-refused-by', rule: g.ruleId ?? `L${g.line}` };
  if (g.subject) expect.field = g.subject.toUpperCase();
  return expect;
}

/** What a refusal by this check looks like through the call contract. */
function guardRefusal(g: GuardCase, others: readonly GuardCase[] = []): CallExpect {
  const expect: CallExpect = { kind: 'refused', rule: g.ruleId ?? `L${g.line}` };
  if (g.subject) expect.field = g.subject.toUpperCase();
  const notRules = others.map((o) => o.ruleId).filter((id): id is string => !!id && id !== g.ruleId);
  if (notRules.length > 0) expect.notRules = notRules;
  return expect;
}

function guardSet(g: GuardCase, value: CallValue | 'base'): EngineCaseCall['set'] {
  return value === 'base' || !g.subject ? [] : [{ field: g.subject.toUpperCase(), to: value }];
}

const guardName = (g: GuardCase) => g.ruleId ?? `the check at L${g.line}`;
const outcomeWord = (g: GuardCase) => (g.outcome === 'skips' ? 'skipped' : 'refused');
const guardInputWord = (g: GuardCase, value: string) => (g.subject ? `${g.subject.toUpperCase()} ${/^(empty|filled|equal|different|greater|less|a value)/.test(value) ? value : `= ${value}`}` : value);

/** Other guards on the same subject that the breaking value also breaks — the case would not isolate its own. */
function alsoBroken(g: GuardCase, all: readonly GuardCase[]): GuardCase[] {
  if (!g.numeric || !g.subject) return [];
  return all.filter((o) => {
    if (o === g || !o.numeric || !o.subject || o.subject.toLowerCase() !== g.subject!.toLowerCase() || !o.operator || o.operand === null) return false;
    const h = holds(g.breaking, o.operator, o.operand);
    if (h === null) return false;
    return o.rejectsWhen === 'holds' ? h : !h;
  });
}

function guardCases(g: GuardCase, all: readonly GuardCase[]): Array<Omit<EngineTestCase, 'id'>> {
  const id = guardName(g);
  const others = all.filter((o) => o !== g);
  const othersWord =
    others.length === 0
      ? 'there is no other guard'
      : `every other guard satisfied: ${others
          .slice(0, 8)
          .map((o) => `${guardName(o)} (${guardInputWord(o, o.passing)})`)
          .join(', ')}${others.length > 8 ? `, and ${others.length - 8} more` : ''}`;
  const trace: EngineCaseTrace = { basis: 'business-rule', lines: [lineRange(g.line, g.line)], quote: g.quote };
  if (g.ruleId) trace.ruleId = g.ruleId;
  if (g.subject) trace.field = g.subject.toLowerCase();
  const derivedFrom = g.ruleId ? { kind: 'rule' as const, ref: g.ruleId, lines: [lineRange(g.line, g.line)], quote: g.quote } : undefined;
  const how =
    g.outcome === 'skips'
      ? `skips the record and goes on with the next (${g.ending}, L${g.line})`
      : `stops processing — the input is refused (${g.ending})`;
  const clash = alsoBroken(g, all);
  const clashNote =
    clash.length > 0
      ? ` The breaking value also breaks ${clash.map(guardName).join(', ')} on the same field, so the field alone cannot isolate ${id}: the outcome must still name ${id}, which the original checks at L${g.line}.`
      : '';
  const unruled = g.ruleId ? '' : ' The engine\'s business rules hold no rule for this check (its condition names no value written in the code), so it is traced by its line.';
  const breakSet = g.breakingCall ? guardSet(g, g.breakingCall) : null;
  const passSet = guardSet(g, g.passingCall);
  const withCall = (example: EngineCaseExample, call: EngineCaseCall | null): EngineCaseExample => (call ? { ...example, call } : example);
  const negative = makeCase({
    kind: 'guard-breaks-one',
    family: 'guard',
    trace,
    derivedFrom,
    name: `${id}: input that breaks only "${g.condition}" is ${outcomeWord(g)}`,
    description: `The original's check at L${g.line} (${g.condition}) ${how} when its condition ${g.rejectsWhen === 'holds' ? 'holds' : 'does not hold'}. The input breaks exactly this check and no other, so a ${outcomeWord(g)} outcome can only come from it — a negative case must fail for its own reason (PP review TC_01).${clashNote}${unruled}`,
    examples: [
      withCall(
        {
          input: `${guardInputWord(g, g.breaking)}; ${othersWord}`,
          expected: `${outcomeWord(g)} by ${id} — and by no other check; the outcome names this check's condition (${g.condition})`,
        },
        !breakSet
          ? null
          : g.outcome === 'skips'
            ? { op: 'simulate', mode: 'append', set: breakSet, expect: { kind: 'records-delta', delta: 0 } }
            : { op: 'simulate', set: breakSet, expect: guardRefusal(g, all) },
      ),
    ],
  });
  const subjectWord = g.subject ? g.subject.toUpperCase() : 'the checked value';
  const exclusion =
    g.outcome === 'skips'
      ? makeCase({
          kind: 'guard-exclusion-necessary',
          family: 'guard',
          trace,
          derivedFrom,
          name: `${id}: the record it excludes changes the result`,
          description: `The check at L${g.line} (${g.condition}) excludes a record. Two records identical except for ${subjectWord}: if the exclusion is lost, the result differs — so the exclusion is necessary to the outcome, not incidental (PP review TC_10).${unruled}`,
          examples: [
            withCall(
              {
                input: `record A appended to a request that passes every check: ${guardInputWord(g, g.passing)}; ${othersWord}`,
                expected: 'A is in the result: one record more than without it',
              },
              breakSet ? { op: 'simulate', mode: 'append', set: passSet, expect: { kind: 'records-delta', delta: 1 } } : null,
            ),
            withCall(
              {
                input: `record B appended instead: identical to A except ${guardInputWord(g, g.breaking)}`,
                expected: 'B is excluded: no record more than without it. With B included the count would be one higher — the case fails if the exclusion is lost',
              },
              breakSet ? { op: 'simulate', mode: 'append', set: breakSet, expect: { kind: 'records-delta', delta: 0 } } : null,
            ),
          ],
        })
      : makeCase({
          kind: 'guard-exclusion-necessary',
          family: 'guard',
          trace,
          derivedFrom,
          name: `${id}: the refusal comes from the checked value alone`,
          description: `The check at L${g.line} (${g.condition}) refuses the input. The same input with only ${subjectWord} moved to the other side of the condition must pass it — so the refused value is what the refusal depends on (PP review TC_10).${unruled}`,
          examples: [
            withCall(
              { input: `request R1: ${guardInputWord(g, g.breaking)}; ${othersWord}`, expected: `refused by ${id}` },
              breakSet ? { op: 'simulate', set: breakSet, expect: guardRefusal(g) } : null,
            ),
            withCall(
              { input: `request R2: R1 with ${guardInputWord(g, g.passing)} only`, expected: `not refused by ${id}: processing goes past L${g.line}` },
              breakSet ? { op: 'simulate', set: passSet, expect: { ...notRefusedBy(g) } } : null,
            ),
          ],
        });
  return [negative, exclusion];
}

/* ----------------------------------------------------- input contract */

function contractCases(fields: readonly Field[]): Array<Omit<EngineTestCase, 'id'>> {
  const out: Array<Omit<EngineTestCase, 'id'>> = [];
  const inputs = fields.filter((f) => f.input);
  const obligatory = inputs.filter((f) => f.obligatory);

  const emptyBasis = obligatory.length > 0 ? obligatory : inputs;
  out.push(
    makeCase({
      kind: 'contract-empty-request',
      family: 'contract',
      trace: contractTrace(emptyBasis),
      name: 'An empty request is not a success',
      description:
        obligatory.length > 0
          ? `The original refuses to run without ${obligatory.map(fieldWord).join(', ')} (OBLIGATORY, L${obligatory.map((f) => f.line).join(', L')}). An empty request must be refused with a message that names what is missing — never answered as a successful run with zero rows or zero totals (CO review F05/F08).`
          : 'An empty request — no parameters, no records — must be refused with a message that names what is missing, never answered as a successful run with zero rows or zero totals (CO review F05/F08). The original declares no mandatory input, so this is the input contract of the target, not a line of the original.',
      examples: [
        { input: 'empty JSON body {}', expected: 'refused; the message names the missing input; no result and no run is recorded as successful', call: { op: 'simulate', mode: 'empty', set: [], expect: { kind: 'not-success' } } },
        { input: 'CSV with only a header line', expected: 'refused the same way as the empty JSON body' },
      ],
    }),
  );

  const ints = inputs.filter((f) => f.kind === 'integer' || f.kind === 'digits').slice(0, MAX_CONTRACT_FIELDS);
  if (ints.length > 0) {
    const examples: EngineCaseExample[] = [];
    for (const f of ints) {
      const n = fieldWord(f);
      const refuse = (to: CallValue): EngineCaseCall => ({ op: 'validate', set: [{ field: n, to }], expect: { kind: 'refused', field: n } });
      examples.push(
        { input: `${n} = "2026x"`, expected: `refused; the message names ${n} — never read as 2026`, call: refuse({ value: '2026x' }) },
        { input: `${n} = "1.9"`, expected: 'refused — never read as 1 or 2', call: refuse({ value: '1.9' }) },
        { input: `${n} = NaN`, expected: 'refused', call: refuse({ special: 'NaN' }) },
        { input: `${n} = Infinity`, expected: 'refused', call: refuse({ special: 'Infinity' }) },
      );
      if (f.kind === 'digits' && f.digits) {
        const v = '9'.repeat(f.digits + 1);
        examples.push({ input: `${n} = ${v}`, expected: `refused: more than ${f.digits} digits`, call: refuse({ value: v }) });
      }
      if (f.kind === 'integer' && f.max) {
        const v = (BigInt(f.max) + ONE).toString();
        examples.push({ input: `${n} = ${v}`, expected: `refused: above ${f.max}, the largest value of the declared type`, call: refuse({ value: v }) });
      }
    }
    out.push(
      makeCase({
        kind: 'contract-integer',
        family: 'contract',
        trace: contractTrace(ints),
        name: 'Integer inputs refuse text, fractions and non-finite numbers',
        description: `Whole numbers in the original: ${ints.map((f) => `${fieldWord(f)} (${f.declaration}, L${f.line})`).join(', ')}. Every input channel — JSON and CSV alike — applies the same contract: "2026x" is not 2026 (parseInt accepts it), "1.9" is not 1, and NaN or Infinity is no number at all (CO review F05/F08).`,
        examples,
      }),
    );
  }

  // What reaches the target as data: the selection inputs and the record components — not working variables.
  const dataFields = fields.filter((f) => f.input || f.component);
  const packed = dataFields.filter((f) => f.kind === 'packed').slice(0, MAX_CONTRACT_FIELDS);
  if (packed.length > 0) {
    const examples: EngineCaseExample[] = [];
    for (const f of packed) {
      const n = fieldWord(f);
      const refuse = (to: CallValue): EngineCaseCall => ({ op: 'validate', set: [{ field: n, to }], expect: { kind: 'refused', field: n } });
      examples.push(
        { input: `${n} = NaN`, expected: `refused; the message names ${n}`, call: refuse({ special: 'NaN' }) },
        { input: `${n} = Infinity`, expected: 'refused', call: refuse({ special: 'Infinity' }) },
        { input: `${n} = -Infinity`, expected: 'refused', call: refuse({ special: '-Infinity' }) },
        { input: `${n} = "12.5x"`, expected: 'refused — never read as 12.5', call: refuse({ value: '12.5x' }) },
      );
    }
    out.push(
      makeCase({
        kind: 'contract-non-finite',
        family: 'contract',
        trace: contractTrace(packed),
        name: 'Decimal fields refuse non-finite and malformed numbers',
        description: `Packed decimals in the original: ${packed.map((f) => `${fieldWord(f)} (${f.declaration}, L${f.line})`).join(', ')}. A packed field cannot hold NaN or Infinity; a threshold that becomes NaN makes every comparison false (CO review F05/F08).`,
        examples,
      }),
    );
  }

  const dates = inputs.filter((f) => f.kind === 'date').slice(0, MAX_CONTRACT_FIELDS);
  if (dates.length > 0) {
    const examples: EngineCaseExample[] = [];
    for (const f of dates) {
      const n = fieldWord(f);
      const date = (value: string, expect: CallExpect): EngineCaseCall => ({ op: 'validate', set: [{ field: n, to: { value } }], expect });
      const refused: CallExpect = { kind: 'refused', field: n };
      examples.push(
        { input: `${n} = 20260230`, expected: 'refused: 30 February does not exist — never rolled over to 2 March', call: date('20260230', refused) },
        { input: `${n} = 20261301`, expected: 'refused: there is no month 13', call: date('20261301', refused) },
        { input: `${n} = 2026-02-30`, expected: 'refused', call: date('2026-02-30', refused) },
        { input: `${n} = 20240229`, expected: 'accepted: 29 February 2024 exists (leap year)', call: date('20240229', { kind: 'accepted', field: n }) },
      );
    }
    out.push(
      makeCase({
        kind: 'contract-date',
        family: 'contract',
        trace: contractTrace(dates),
        name: 'Invalid dates are refused',
        description: `Dates in the original: ${dates.map((f) => `${fieldWord(f)} (${f.declaration}, L${f.line})`).join(', ')}. A JavaScript Date silently rolls 2026-02-30 over to 2 March; the target must refuse it (PP review).`,
        examples,
      }),
    );
  }

  const numeric = dataFields.filter((f) => f.kind === 'packed' || f.kind === 'integer').slice(0, MAX_CONTRACT_FIELDS);
  if (numeric.length > 0) {
    const examples: EngineCaseExample[] = [];
    for (const f of numeric) {
      const n = fieldWord(f);
      examples.push(
        {
          input: `${n} missing (null)`,
          expected: f.obligatory ? `refused as missing — ${n} is OBLIGATORY in the original` : 'reported as missing — never computed as 0',
          call: {
            op: 'validate',
            set: [{ field: n, to: { value: null } }],
            expect: f.obligatory ? { kind: 'refused', field: n } : { kind: 'not-zero', field: n },
          },
        },
        { input: `${n} = 0`, expected: 'accepted as the value zero — not as missing', call: { op: 'validate', set: [{ field: n, to: { value: '0' } }], expect: { kind: 'zero', field: n } } },
      );
    }
    out.push(
      makeCase({
        kind: 'contract-null-not-zero',
        family: 'contract',
        trace: contractTrace(numeric),
        name: 'A missing value is not zero',
        description:
          'ABAP has no null: an initial field is 0 or blank. The target receives JSON and CSV, where a missing value and 0 differ — a credit limit of 0 is not "no credit limit" (FI review). A missing value must not silently become 0, and an explicit 0 must not be read as missing.',
        examples,
      }),
    );
  }
  return out;
}

function runIdentityCase(): Omit<EngineTestCase, 'id'> {
  return makeCase({
    kind: 'run-identity',
    family: 'run-identity',
    trace: { basis: 'run-identity', lines: [] },
    name: 'Two runs in the same millisecond get different ids and neither overwrites the other',
    description:
      'Every result and every export is bound to an immutable run id (CO review F09, PP review). An id built from the clock alone collides when two runs start in the same millisecond, and the second run then overwrites the first. There is no global "latest result".',
    examples: [
      {
        input: 'two runs with the same input, started with the clock fixed to the same millisecond',
        expected: 'two different run ids',
        // The same call checks both examples: two ids, and the first run read back by its own id after the second.
        call: { op: 'run-identity', set: [], expect: { kind: 'distinct-runs' } },
      },
      {
        input: 'read each run\'s result and export by its own id after both have finished',
        expected: 'each returns its own run\'s result, unchanged; neither was overwritten by the other',
        call: { op: 'run-identity', set: [], expect: { kind: 'distinct-runs' } },
      },
    ],
  });
}

/* --------------------------------------------------------------- assembly */

const FAMILY_CATEGORY: Readonly<Record<EngineCaseFamily, string>> = Object.freeze({
  precision: 'Engine · precision',
  guard: 'Engine · guard',
  contract: 'Engine · input contract',
  'run-identity': 'Engine · run identity',
});

function makeCase(input: {
  kind: EngineCaseKind;
  family: EngineCaseFamily;
  trace: EngineCaseTrace;
  name: string;
  description: string;
  examples: EngineCaseExample[];
  derivedFrom?: EngineTestCase['derivedFrom'];
}): Omit<EngineTestCase, 'id'> {
  const c: Omit<EngineTestCase, 'id'> = {
    name: input.name,
    category: FAMILY_CATEGORY[input.family],
    description: `Derived by Clean-Core.io from the original, not by the testing model. ${input.description}`,
    priority: 'High',
    steps: input.examples.map((e) => `Input ${e.input} → expect ${e.expected}.`),
    expectedResult: input.examples.map((e) => `${e.input} → ${e.expected}`).join('; '),
    testData: JSON.stringify(input.examples),
    origin: 'engine',
    engineCase: { kind: input.kind, family: input.family, trace: input.trace, examples: input.examples },
  };
  if (input.derivedFrom) c.derivedFrom = input.derivedFrom;
  return c;
}

/**
 * The engine cases of one source: guards first, then precision, then the input
 * contract and run identity. Ids are `TC_ENG_01` … in that order — stable for
 * one source and one rule set.
 */
export function deriveEngineCases(source: string, rules: readonly BusinessRule[]): EngineCaseDerivation {
  const limits: string[] = [];
  const contract = readOriginalContract(source);
  const fields = readFields(source, contract);
  const guards = readGuardCases(source, contract, rules, fields);
  const drafted: Array<Omit<EngineTestCase, 'id'>> = [];

  // Guards: checks with a business-rule id first, then source order; two cases each, up to the cap.
  const guardOrder = [...guards.filter((g) => g.ruleId), ...guards.filter((g) => !g.ruleId)];
  const guardBudget = Math.floor(MAX_GUARD_CASES / 2);
  const chosenGuards = new Set(guardOrder.slice(0, guardBudget));
  const droppedGuards = guardOrder.slice(guardBudget);
  if (droppedGuards.length > 0) {
    limits.push(`${droppedGuards.length * 2} guard cases past the first ${MAX_GUARD_CASES} are not covered: ${droppedGuards.map(guardName).join(', ')}.`);
  }
  // Emitted in source order, so the ids follow the program.
  for (const g of guards) if (chosenGuards.has(g)) drafted.push(...guardCases(g, guards));

  // Precision: selection inputs first, then record components (both reach the target as data and run
  // through the call contract), then working variables; source order within each; four cases per field.
  const packed = fields.filter((f) => f.kind === 'packed');
  const ordered = [...packed.filter((f) => f.input), ...packed.filter((f) => !f.input && f.component), ...packed.filter((f) => !f.input && !f.component)];
  const precisionDrafted = ordered.flatMap((f) => precisionCases(f, guards, fields).map((c) => ({ c, f })));
  const shownPrecision = precisionDrafted.slice(0, MAX_PRECISION_CASES);
  const droppedPrecision = precisionDrafted.slice(MAX_PRECISION_CASES);
  if (droppedPrecision.length > 0) {
    limits.push(
      `${droppedPrecision.length} precision cases past the first ${MAX_PRECISION_CASES} are not covered: ${[...new Set(droppedPrecision.map((x) => x.f.name))].join(', ')}.`,
    );
  }
  drafted.push(...shownPrecision.map((x) => x.c));

  drafted.push(...contractCases(fields));
  drafted.push(runIdentityCase());

  const width = Math.max(2, String(drafted.length).length);
  const cases = drafted.map((c, i) => ({ id: `${ENGINE_CASE_PREFIX}${String(i + 1).padStart(width, '0')}`, ...c }));
  return { cases, limits, notCovered: { precision: droppedPrecision.length, guard: droppedGuards.length * 2 } };
}

/**
 * How many engine cases the caps left out for this source — counted from the
 * source alone (the caps do not depend on the rule ids), for STATUS.
 */
export function engineCasesNotCovered(source: string): { precision: number; guard: number } {
  try {
    return deriveEngineCases(source, []).notCovered;
  } catch {
    return { precision: 0, guard: 0 };
  }
}

/** "Engine cases past the caps (20 precision, 20 guard): 8 more not covered — 4 precision, 4 guard." */
export function engineCasesNotCoveredSentence(left: { precision: number; guard: number }): string {
  return `Engine cases past the caps (${MAX_PRECISION_CASES} precision, ${MAX_GUARD_CASES} guard): ${left.precision + left.guard} more not covered — ${left.precision} precision, ${left.guard} guard.`;
}

/* ------------------------------------------------------ reading stored cases */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const FAMILIES: readonly EngineCaseFamily[] = ['precision', 'guard', 'contract', 'run-identity'];

/** The engine data of a stored case, or null when it is not an engine case. Read defensively — `testCases` is client-written. */
export function engineCaseOf(tc: Record<string, unknown> | null | undefined): EngineCaseData | null {
  if (!tc || tc.origin !== 'engine' || !isPlainObject(tc.engineCase)) return null;
  const e = tc.engineCase;
  if (typeof e.kind !== 'string' || !FAMILIES.includes(e.family as EngineCaseFamily) || !isPlainObject(e.trace) || !Array.isArray(e.examples)) return null;
  const examples = e.examples
    .filter((x): x is EngineCaseExample => isPlainObject(x) && typeof x.input === 'string' && typeof x.expected === 'string')
    .map((x) => {
      const out: EngineCaseExample = { input: x.input, expected: x.expected };
      if (isPlainObject(x.call) && typeof x.call.op === 'string' && Array.isArray(x.call.set) && isPlainObject(x.call.expect)) out.call = x.call as unknown as EngineCaseCall;
      return out;
    });
  const t = e.trace;
  const lines = Array.isArray(t.lines)
    ? t.lines.filter((l): l is { start: number; end: number } => isPlainObject(l) && Number.isInteger(l.start) && Number.isInteger(l.end))
    : [];
  const trace: EngineCaseTrace = { basis: t.basis as EngineCaseTrace['basis'], lines };
  if (typeof t.ruleId === 'string') trace.ruleId = t.ruleId;
  if (typeof t.field === 'string') trace.field = t.field;
  if (typeof t.declaration === 'string') trace.declaration = t.declaration;
  if (typeof t.quote === 'string') trace.quote = t.quote;
  return { kind: e.kind as EngineCaseKind, family: e.family as EngineCaseFamily, trace, examples };
}

export const isEngineCase = (tc: Record<string, unknown> | null | undefined): boolean => engineCaseOf(tc) !== null;

/**
 * The generated case list with the engine cases in it: every model case whose
 * id is an engine id is dropped (the model does not write engine cases), and
 * the engine cases follow the model's. Idempotent.
 */
export function withEngineCases<T extends Record<string, unknown>>(
  cases: readonly T[],
  engine: readonly EngineTestCase[],
): Array<T | (EngineTestCase & Record<string, unknown>)> {
  const kept = cases.filter((c) => !String(c.id ?? '').toUpperCase().startsWith(ENGINE_CASE_PREFIX) && c.origin !== 'engine');
  return [...kept, ...(engine as Array<EngineTestCase & Record<string, unknown>>)];
}

/* ------------------------------------------------------------- counting */

export interface EngineCaseCounts {
  model: number;
  engine: number;
  byFamily: Record<EngineCaseFamily, number>;
}

/** Engine cases and model cases, counted apart. */
export function countEngineCases(cases: ReadonlyArray<Record<string, unknown>>): EngineCaseCounts {
  const byFamily: Record<EngineCaseFamily, number> = { precision: 0, guard: 0, contract: 0, 'run-identity': 0 };
  let engine = 0;
  for (const tc of cases) {
    const e = engineCaseOf(tc);
    if (!e) continue;
    engine++;
    byFamily[e.family]++;
  }
  return { model: cases.length - engine, engine, byFamily };
}

/** "9 cases written by the testing model · 14 derived by Clean-Core.io from the original (8 precision, 4 guard, 1 input contract, 1 run identity)". */
export function engineCaseCountsSentence(c: EngineCaseCounts): string {
  const model = `${c.model} ${c.model === 1 ? 'case' : 'cases'} written by the testing model`;
  if (c.engine === 0) return `${model} · no case derived by Clean-Core.io from the original`;
  const parts = FAMILIES.filter((f) => c.byFamily[f] > 0).map((f) => `${c.byFamily[f]} ${ENGINE_CASE_FAMILY_WORD[f]}`);
  return `${model} · ${c.engine} derived by Clean-Core.io from the original (${parts.join(', ')})`;
}

/* --------------------------------------------------------------- prompt */

/**
 * The part of the testing prompt that asks for the code of the engine cases.
 * The cases themselves are fixed: the model writes one test per id that
 * asserts every example, and does not list them under `testCases`.
 */
export function engineCasePromptSection(cases: readonly EngineTestCase[], route: 'node' | 'abap-unit'): string {
  if (cases.length === 0) return '';
  const title =
    route === 'node'
      ? "test('TC_ENG_01: …', …)"
      : 'a test method whose name starts with the id (methods tc_eng_01_… for testing.)';
  const lines = cases.map(
    (c) =>
      `  ${c.id} — ${c.name}\n` + c.engineCase.examples.map((e) => `      input: ${e.input}\n      expected: ${e.expected}`).join('\n'),
  );
  return `
        ENGINE CASES (fixed by Clean-Core.io from the ORIGINAL's declared types and guards; do not change them). The product runs them itself through the call contract (srv/engine-contract); your tests for them are an extra check:
        - Write exactly one test per case below, titled with its id first: ${title}. Assert EVERY example with the literal expected value given.
        - The field names are the ORIGINAL's; map each to the generated code's own name for it. Use exact decimal comparison on strings or scaled integers — never compare binary floats.
        - If the generated code has no way to express a case's input (no such field, no such channel), the test must skip with the reason (t.skip('…') / a skipped ABAP Unit method) — never pass without asserting.
        - Do NOT list these cases under "testCases": the product adds them itself.
${lines.join('\n')}
`;
}

/* --------------------------------------------------------------- export */

/** The engine cases as the delivery package ships them: `test/engine-cases.json`. */
export const ENGINE_CASES_FILE = 'test/engine-cases.json';

export function engineCasesFile(cases: ReadonlyArray<Record<string, unknown>>): string | null {
  const engine = cases
    .map((tc) => ({ tc, data: engineCaseOf(tc) }))
    .filter((x): x is { tc: Record<string, unknown>; data: EngineCaseData } => x.data !== null);
  if (engine.length === 0) return null;
  return `${JSON.stringify(
    {
      format: 'clean-core.engine-cases/1',
      note: 'Derived by Clean-Core.io from the original ABAP source (declared types, business-rule guards, input contract, run identity), without a model. Each example is an input and the outcome the original gives or its contract requires; the suite asserts them under the same case id.',
      cases: engine.map(({ tc, data }) => ({
        id: String(tc.id ?? ''),
        name: String(tc.name ?? ''),
        family: data.family,
        kind: data.kind,
        trace: data.trace,
        examples: data.examples,
      })),
    },
    null,
    2,
  )}\n`;
}

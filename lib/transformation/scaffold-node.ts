/**
 * The Node.js scaffold (design §6.2): every file of the generated package is
 * written here, by the engine; the model writes only between fill markers —
 * the body of each unit's function and the predicate of each guard.
 *
 * Engine-written, and so out of the model's reach: exact decimals with the
 * declared places and bounds (branded types from the packed fields), one input
 * contract for JSON, query and CSV, one wrapper per carried guard with its
 * rule id and line, the run store keyed by `crypto.randomUUID()`, RFC 4180
 * CSV with the formula guard, `createApp()` without `listen`, the call
 * contract (`CONTRACT`, `validate`, `simulate`, `getRun`, `compute`), the
 * engine cases and their runner, the acceptance adapter, and the trace.
 *
 * Deviation from the design table, on purpose: the app factory uses
 * `node:http`, not Express. The package then declares no runtime dependency
 * at all (rule 23: dependencies = imports), and the acceptance harness — which
 * never installs anything — can import `srv/app.ts` and prove that importing
 * it opens no port.
 *
 * The package runs on Node ≥ 22.18 without a build step (type stripping):
 * only erasable TypeScript, relative imports with `.ts`, `import type`.
 *
 * Pure and deterministic: the same plan gives the same files. No network, no
 * model.
 */

import { sha256Hex } from '../artefact-digest';
// The cases the scaffold writes are branded the one way a case is: recomputed and matched (QA round 3).
import { engineCaseProvenance } from '../engine-case-provenance';
import { ENGINE_RUNTIME_JS } from '../test-sandbox/engine-runtime';
import { deriveEngineCases, ENGINE_CASES_FILE, engineCasesFile, type EngineCaseDerivation } from '../testing-engine-cases';
import { acceptanceAdapter, contractModel } from './call-contract';
import { defuseMarkers, findRegions, regionText, scaffoldDigest } from './markers';
import { CSV_TS, DECIMAL_TS, ERRORS_TS, RUN_STORE_TS } from './runtime-node';
import { camelName, pascalName, rangeWords, type EngineFacts } from './unit-plan';
import { SCAFFOLD_VERSION, type ContractField, type PlanGuard, type RequiredGuard, type Scaffold, type ScaffoldFile, type Unit, type UnitPlan } from './types';

/** The Node major of the container; the same as `PACKAGE_NODE_MAJOR` (lib/delivery-package.ts, not imported to keep this module small — a spec holds them equal). */
export const SCAFFOLD_NODE_MAJOR = 22;

export interface NodeScaffoldOptions {
  /** Track A's `contextDigest`, when the context pack was built; enters run records and the trace. */
  contextDigest?: string | null;
  /** The engine cases; derived from the source when absent. */
  cases?: EngineCaseDerivation;
  /** The run the package is built from (§12.3). */
  runId?: string | null;
}

/** Helpers every body may call (§8.2 `available.helpers`). */
export const NODE_HELPERS: readonly string[] = [
  'dec.parse', 'dec.must', 'dec.format', 'dec.round', 'dec.add', 'dec.sub', 'dec.mul', 'dec.div', 'dec.compare', 'dec.isZero',
  'dec.neg', 'dec.abs', 'dec.max', 'dec.min', 'dec.fits', 'dec.percentOf', 'csv.cell', 'csv.row', 'csv.table', 'checked',
];

const q = (s: string) => JSON.stringify(s);
/** A single-quoted string literal (ids and names only: letters, digits, dots, underscores). */
const sq = (s: string) => `'${s.replace(/[^\w.]/g, '')}'`;

function packageNameOf(program: string | null): string {
  const base = (program ?? 'clean-core-program').toLowerCase().replace(/^\/[\w]+\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'clean-core-program'}-node`;
}

/** The TypeScript type of a contract field in `Selection` / `Rec`. */
function fieldType(f: ContractField): string {
  const opt = f.obligatory ? '' : ' | null';
  switch (f.kind) {
    case 'packed':
      return `Dec<${q(f.original)}>${opt}`;
    case 'flag':
      return 'boolean';
    case 'range':
      return 'Range[]';
    default:
      return `string${opt}`;
  }
}

function decimalTypeName(f: ContractField): string {
  return pascalName(f.original);
}

/* ------------------------------------------------------------- lib/types */

function typesFile(plan: UnitPlan, contextDigest: string | null, ruleRevision: string): string {
  const packed = plan.fields.filter((f) => f.kind === 'packed');
  const selection = plan.fields.filter((f) => f.where === 'selection');
  const record = plan.fields.filter((f) => f.where === 'record');
  const lines: string[] = [];
  lines.push('/**');
  lines.push(` * Types of ${plan.program ?? 'the program'} — written by Clean-Core.io (engine) from the original's declarations.`);
  lines.push(' * A packed field is a decimal string at its declared places (Dec<NAME>); its bound is in DECIMALS.');
  lines.push(' */');
  lines.push("import type { Refusal } from './errors.ts';");
  lines.push('');
  lines.push(`export const PROGRAM = ${q(plan.program ?? '')};`);
  lines.push(`/** sha256 of the original source the package was built from. */`);
  lines.push(`export const SOURCE_REVISION = ${q(plan.sourceSha256)};`);
  lines.push(`/** sha256 of the rule decisions the scaffold applied. */`);
  lines.push(`export const RULE_REVISION = ${q(ruleRevision)};`);
  lines.push(`export const CONTEXT_DIGEST: string | null = ${contextDigest ? q(contextDigest) : 'null'};`);
  lines.push('');
  lines.push('/** A packed decimal of the original field N: a decimal string at the field\'s places. */');
  lines.push("export type Dec<N extends string> = string & { readonly __dec: N };");
  lines.push('');
  lines.push('export interface DecimalField {');
  lines.push('  readonly name: string;');
  lines.push('  readonly digits: number;');
  lines.push('  readonly places: number;');
  lines.push('  /** The largest value the declaration holds; the smallest is its negative. */');
  lines.push('  readonly max: string;');
  lines.push('  readonly line: number;');
  lines.push('}');
  lines.push('');
  lines.push('/** Every packed field the original declares (constants excluded), by its original name. */');
  lines.push('export const DECIMALS: Readonly<Record<string, DecimalField>> = {');
  for (const f of packed) lines.push(`  ${q(f.original)}: { name: ${q(f.original)}, digits: ${f.digits}, places: ${f.places}, max: ${q(f.max ?? '0')}, line: ${f.line} },`);
  lines.push('};');
  lines.push('');
  for (const f of packed) lines.push(`/** ${f.original}: ${f.declaration}, L${f.line}. */\nexport type ${decimalTypeName(f)} = Dec<${q(f.original)}>;`);
  if (packed.length > 0) lines.push('');
  lines.push("export interface Range {\n  sign: 'I' | 'E';\n  option: string;\n  low: string;\n  high: string | null;\n}");
  lines.push('');
  lines.push('/** The selection, validated (srv/lib/input-contract.ts). */');
  lines.push('export interface Selection {');
  for (const f of selection) lines.push(`  /** ${f.original} — ${f.declaration}${f.obligatory ? ', obligatory' : ''}, L${f.line}. */\n  ${f.key}: ${fieldType(f)};`);
  if (plan.fields.length === 0) lines.push('  run?: boolean;');
  lines.push('}');
  lines.push('');
  lines.push('/** One input record, validated. */');
  lines.push('export interface Rec {');
  for (const f of record) lines.push(`  /** ${f.original} — ${f.declaration}, L${f.line}. */\n  ${f.key}: ${fieldType(f)};`);
  lines.push('}');
  lines.push('');
  lines.push('/** A validated request: the selection and the records. */');
  lines.push('export type Request = Selection & { records: Rec[] };');
  lines.push('');
  lines.push('/** What one run carries through the steps. No module-level state: a new RunState per run. */');
  lines.push('export interface RunState {');
  lines.push('  readonly selection: Selection;');
  lines.push('  /** The records still in the run; a skipping check removes one. */');
  lines.push('  records: Rec[];');
  lines.push('  /** Output rows of the list or file the original writes. */');
  lines.push('  rows: Array<Record<string, unknown>>;');
  lines.push('  result: Record<string, unknown>;');
  lines.push('  issues: Array<{ severity: string; message: string; rule?: string }>;');
  lines.push('  /** Regions of the package still left as stubs when this run reached them. */');
  lines.push('  notFilled: string[];');
  lines.push('  /** Working data of the steps (the original\'s global variables). */');
  lines.push('  local: Record<string, unknown>;');
  lines.push('}');
  lines.push('');
  lines.push('/** A step refuses the input (Refusal), or goes on (nothing). */');
  lines.push('export type StepResult = Refusal | void;');
  lines.push('');
  return lines.join('\n');
}

/* ----------------------------------------------------- lib/input-contract */

const INPUT_CORE = String.raw`
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The text of a scalar as a client sends it; undefined for anything that is not one (NaN, Infinity, objects). */
function scalarText(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') return Number.isFinite(raw) && !/e/i.test(String(raw)) ? String(raw) : undefined;
  if (typeof raw === 'bigint') return String(raw);
  return undefined;
}

function realDate(text: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return m[1] + m[2] + m[3];
}

const OPTIONS = new Set(['EQ', 'NE', 'BT', 'NB', 'CP', 'NP', 'GT', 'GE', 'LT', 'LE']);

function rangeOf(raw: unknown): Range | null {
  if (typeof raw === 'string') return { sign: 'I', option: 'EQ', low: raw, high: null };
  if (!isObj(raw)) return null;
  const sign = raw.sign === undefined ? 'I' : raw.sign;
  const option = raw.option === undefined ? (raw.high !== undefined && raw.high !== null ? 'BT' : 'EQ') : raw.option;
  if ((sign !== 'I' && sign !== 'E') || typeof option !== 'string' || !OPTIONS.has(option)) return null;
  if (typeof raw.low !== 'string') return null;
  if (raw.high !== undefined && raw.high !== null && typeof raw.high !== 'string') return null;
  return { sign, option, low: raw.low, high: typeof raw.high === 'string' ? raw.high : null };
}

/** One field, normalised — or an error pushed, and undefined returned. */
function normalise(spec: FieldSpec, raw: unknown, path: string, errors: InputError[]): unknown {
  const rule = 'L' + spec.line;
  const fail = (message: string): undefined => {
    errors.push({ field: path, rule, message: spec.original + ' (' + path + '): ' + message });
    return undefined;
  };
  if (spec.kind === 'flag') {
    if (raw === undefined || raw === null || raw === false || raw === '' || raw === ' ' || raw === 'false') return false;
    if (raw === true || raw === 'X' || raw === 'x' || raw === 'true') return true;
    return fail('a switch is true or false (X or blank)');
  }
  if (spec.kind === 'range') {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) return fail('a selection range is a list');
    const out: Range[] = [];
    for (const item of raw) {
      const r = rangeOf(item);
      if (!r) return fail('a range entry is a value or { sign: I|E, option, low, high }');
      out.push(r);
    }
    return out;
  }
  const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
  if (empty) {
    if (raw === '' && spec.kind !== 'text') return fail('an empty value is no ' + spec.kind + ' value');
    if (spec.obligatory) return fail('required');
    return null;
  }
  const text = scalarText(raw);
  if (text === undefined) return fail('not a finite value');
  switch (spec.kind) {
    case 'packed': {
      if (!dec.parse(text)) return fail('not a decimal number');
      const rounded = dec.round(text, spec.places);
      if (spec.max !== null && !dec.fits(rounded, spec.max)) return fail('outside ' + spec.declaration + ' (largest ' + spec.max + ')');
      return rounded;
    }
    case 'integer': {
      if (!/^[-+]?\d+$/.test(text)) return fail('not a whole number');
      const v = BigInt(text);
      if (spec.max !== null && (v > BigInt(spec.max) || v < -BigInt(spec.max) - BigInt(1))) return fail('outside the range of ' + spec.declaration);
      return v.toString();
    }
    case 'digits': {
      const n = spec.digits ?? 0;
      if (!/^\d+$/.test(text) || (n > 0 && text.length > n)) return fail('not a number of at most ' + n + ' digits');
      return n > 0 ? text.padStart(n, '0') : text;
    }
    case 'date': {
      const d = realDate(text);
      return d ?? fail('not a calendar date (YYYYMMDD)');
    }
    default:
      return text;
  }
}

/**
 * The one input contract (rules 15-17, 19): JSON body, query and CSV upload
 * all pass here. Unknown options are refused, never ignored; an empty request
 * or an empty selection is a refusal, never a successful run.
 */
export function validateRequest(raw: unknown): Validation {
  const errors: InputError[] = [];
  if (!isObj(raw)) return { ok: false, errors: [{ field: null, rule: 'INPUT', message: 'the request is not an object' }], normalized: null };
  if (Object.keys(raw).length === 0) errors.push({ field: null, rule: 'INPUT', message: 'empty request: nothing is selected' });
  const selectionSpecs = FIELDS.filter((f) => f.where === 'selection');
  const recordSpecs = FIELDS.filter((f) => f.where === 'record');
  const known = new Set(selectionSpecs.map((f) => f.key));
  if (recordSpecs.length > 0) known.add('records');
  if (FIELDS.length === 0) known.add('run');
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) errors.push({ field: key, rule: 'INPUT', message: key + ': the original offers no such option' });
  }
  const out: Record<string, unknown> = {};
  for (const spec of selectionSpecs) {
    const v = normalise(spec, raw[spec.key], spec.key, errors);
    if (v !== undefined) out[spec.key] = v;
  }
  const records: Array<Record<string, unknown>> = [];
  if (recordSpecs.length > 0) {
    const list = raw.records;
    if (!Array.isArray(list) || list.length === 0) {
      errors.push({ field: 'records', rule: 'INPUT', message: 'empty selection: no records' });
    } else {
      const recordKeys = new Set(recordSpecs.map((f) => f.key));
      list.forEach((item, i) => {
        if (!isObj(item)) {
          errors.push({ field: 'records[' + i + ']', rule: 'INPUT', message: 'a record is an object' });
          return;
        }
        for (const key of Object.keys(item)) {
          if (!recordKeys.has(key)) errors.push({ field: 'records[' + i + '].' + key, rule: 'INPUT', message: key + ': not a field of the record' });
        }
        const rec: Record<string, unknown> = {};
        for (const spec of recordSpecs) {
          const v = normalise(spec, item[spec.key], 'records[' + i + '].' + spec.key, errors);
          if (v !== undefined) rec[spec.key] = v;
        }
        records.push(rec);
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors, normalized: null };
  return { ok: true, errors: [], normalized: { ...(out as unknown as Selection), records: records as unknown as Rec[] } };
}

/** A CSV upload of records plus the selection in the query, as the raw request validateRequest reads. */
export function requestFromCsv(text: string, query: Record<string, string | undefined>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const spec of FIELDS.filter((f) => f.where === 'selection')) {
    const v = query[spec.key] ?? query[spec.original] ?? query[spec.original.toLowerCase()];
    if (v === undefined) continue;
    raw[spec.key] = spec.kind === 'range' ? v.split(',').filter((x) => x !== '') : v;
  }
  if (FIELDS.some((f) => f.where === 'record')) {
    const byName = new Map<string, string>();
    for (const spec of FIELDS.filter((f) => f.where === 'record')) {
      byName.set(spec.key.toLowerCase(), spec.key);
      byName.set(spec.original.toLowerCase(), spec.key);
    }
    raw.records = csv.objects(text, CSV_DELIMITER).map((row) => {
      const rec: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) rec[byName.get(k.toLowerCase()) ?? k] = v;
      return rec;
    });
  }
  return raw;
}
`;

function inputContractFile(plan: UnitPlan): string {
  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * The input contract — one validator for JSON, query and CSV (rules 15–17, 19).');
  lines.push(" * Written by Clean-Core.io (engine) from the original's selection screen and declarations.");
  lines.push(' */');
  lines.push("import * as csv from './csv.ts';");
  lines.push("import * as dec from './decimal.ts';");
  lines.push("import type { Range, Rec, Request, Selection } from './types.ts';");
  lines.push('');
  lines.push("export type FieldKind = 'packed' | 'integer' | 'digits' | 'date' | 'flag' | 'range' | 'text';");
  lines.push('export interface FieldSpec {');
  lines.push('  readonly original: string;');
  lines.push('  readonly key: string;');
  lines.push("  readonly where: 'selection' | 'record';");
  lines.push('  readonly kind: FieldKind;');
  lines.push('  readonly digits: number | null;');
  lines.push('  readonly places: number;');
  lines.push('  readonly max: string | null;');
  lines.push('  readonly obligatory: boolean;');
  lines.push('  readonly line: number;');
  lines.push('  readonly declaration: string;');
  lines.push('}');
  lines.push('export interface InputError {\n  field: string | null;\n  rule: string;\n  message: string;\n}');
  lines.push('export interface Validation {\n  ok: boolean;\n  errors: InputError[];\n  normalized: Request | null;\n}');
  lines.push('');
  lines.push(`/** The delimiter of CSV files: the original's (${q(plan.csvDelimiter)}). */`);
  lines.push(`export const CSV_DELIMITER = ${q(plan.csvDelimiter)};`);
  lines.push('');
  lines.push("/** Every field of the request, from the original's declarations. */");
  lines.push('export const FIELDS: readonly FieldSpec[] = [');
  for (const f of plan.fields.filter((x) => x.where !== 'internal')) {
    lines.push(
      `  { original: ${q(f.original)}, key: ${q(f.key)}, where: ${q(f.where)}, kind: ${q(f.kind)}, digits: ${f.digits ?? 'null'}, places: ${f.places}, max: ${f.max ? q(f.max) : 'null'}, obligatory: ${f.obligatory}, line: ${f.line}, declaration: ${q(f.declaration)} },`,
    );
  }
  lines.push('];');
  return lines.join('\n') + '\n' + INPUT_CORE;
}

/* ------------------------------------------------------------ lib/guards */

function subjectPath(plan: UnitPlan, subject: string | null): string | null {
  if (!subject) return null;
  const s = subject.toUpperCase();
  const comp = s.includes('-') ? s.slice(s.lastIndexOf('-') + 1) : s;
  const f = plan.fields.find((x) => x.original === s) ?? plan.fields.find((x) => x.original === comp);
  return f?.path ?? null;
}

const predicateName = (g: PlanGuard) => `when_${g.id.replace('-', '')}`;
/** The `values` type of a derived guard (`G0066Values`), or null for a raw one. */
const guardValuesType = (g: PlanGuard) => (g.basis === 'derived' && g.operands.length > 0 ? `${g.id.replace('-', '')}Values` : null);

/** "guard_BR_004_G0066 (L66, values { lvSum }); skip_G0074 (L74)". */
function bodyCallWords(u: Unit, plan: UnitPlan): string {
  return u.bodyCalls
    .map((id) => {
      const g = plan.guards.find((x) => x.id === id)!;
      return `${g.helper} (L${g.line}${g.operands.length ? `, values { ${g.operands.map((o) => o.key).join(', ')} }` : ''})`;
    })
    .join('; ');
}

/** The guards a body region must call, for `spliceBodies` (placement `body`). */
export function requiredGuardsOf(u: Unit, plan: UnitPlan, track: 'node' | 'rap'): RequiredGuard[] {
  return u.bodyCalls.map((id) => {
    const g = plan.guards.find((x) => x.id === id)!;
    return { id, helper: track === 'node' ? g.helper : `when_${g.id.replace('-', '').toLowerCase()}`, line: g.line, op: g.op, literals: g.literals };
  });
}

function guardDoc(g: PlanGuard, plan: UnitPlan): string {
  const rule = g.rule ? `${g.rule} (${g.decision})` : 'no business rule — traced by its line';
  const proposal = g.rule && g.decision === 'change' ? plan.rules.find((r) => r.id === g.rule)?.proposal : null;
  return [
    '/**',
    ` * ${g.id} · ${rule} · L${g.line}: ${g.condition.replace(/\*\//g, '* /')}`,
    ` * The original: ${g.ending.replace(/\*\//g, '* /')} (L${g.endingLine}, ${g.effect}).${g.decision === 'open' ? ' Open — kept as the original until decided.' : ''}`,
    ...(proposal ? [` * Owner's proposal (change): ${proposal.replace(/\*\//g, '* /').replace(/\s+/g, ' ').slice(0, 400)}`] : []),
    g.placement === 'body'
      ? ` * ${g.basis === 'derived' ? `Derived (${(g.basisReason ?? '').replace(/\*\//g, '* /')})` : 'Skips one record'}: the body calls ${g.helper} where the original checks, at L${g.line}${g.operands.length ? `, handing in ${g.operands.map((o) => o.key).join(', ')}` : ''}.`
      : ` * Raw input: checked ${g.placement === 'selection' ? 'with the selection, before any step' : "at the step's entry, before any calculation"}.`,
    ' */',
  ].join('\n');
}

interface Built {
  file: ScaffoldFile;
  regions: Array<{ regionId: string; available: string[] }>;
}

function guardsFile(plan: UnitPlan): Built {
  const carried = plan.guards.filter((g) => g.carried);
  const regions: Built['regions'] = [];
  const out: string[] = [];
  out.push('/**');
  out.push(" * The original's checks that refuse, stop or skip — one predicate and one wrapper each (rule 15).");
  out.push(' * The wrappers (name, rule id, line, effect) are written by Clean-Core.io (engine); each predicate');
  out.push(" * between fill markers says whether the original's condition holds, and is a model proposal.");
  out.push(' */');
  out.push("import * as dec from './decimal.ts';");
  out.push("import { NotImplementedFill, Refusal } from './errors.ts';");
  out.push("import type { Rec, RunState, Selection } from './types.ts';");
  out.push('');
  out.push('/** Run a check or a step; a stub (not written by the generation) is recorded on the run and skipped. */');
  out.push('export function checked<T>(st: RunState, fn: () => T): T | null {');
  out.push('  try {');
  out.push('    return fn();');
  out.push('  } catch (err) {');
  out.push('    if (err instanceof NotImplementedFill) {');
  out.push('      st.notFilled.push(err.unitId);');
  out.push('      return null;');
  out.push('    }');
  out.push('    throw err;');
  out.push('  }');
  out.push('}');
  out.push('');
  out.push('/** A computed value a derived check reads, as the step computed it. */');
  out.push('export type GuardValue = string | number | boolean | null;');
  for (const g of carried) {
    const pred = predicateName(g);
    const valuesType = guardValuesType(g);
    if (valuesType) {
      out.push('');
      out.push(`/** The values ${g.helper} reads, computed by the step before L${g.line}. */`);
      out.push(`export interface ${valuesType} {\n${g.operands.map((o) => `  /** ${o.name} */\n  ${o.key}: GuardValue;`).join('\n')}\n}`);
    }
    const valuesParam = valuesType ? `, values: ${valuesType}` : '';
    const valuesArg = valuesType ? ', values' : '';
    const recordParam = valuesType ? 'record: Rec | null' : 'record: Rec | null = null';
    const sig = `export function ${pred}(sel: Selection, st: RunState, record: Rec | null${valuesParam}): boolean`;
    const doc = guardDoc(g, plan);
    out.push('');
    out.push(doc);
    out.push(`${sig} {`);
    out.push(regionText('node', g.regionId!, `${sig}\n${doc}`, '  ', `throw new NotImplementedFill(${sq(g.regionId!)}, ${sq(pred)});`));
    out.push('}');
    regions.push({ regionId: g.regionId!, available: ['dec.parse', 'dec.must', 'dec.compare', 'dec.isZero', 'dec.round', 'dec.add', 'dec.sub', 'dec.mul', 'dec.div', 'dec.fits'] });
    // The wrapper: what the original does when the condition holds (IF) or fails (CHECK).
    const refuseWhen = g.effect === 'check' ? `!${pred}(sel, st, record${valuesArg})` : `${pred}(sel, st, record${valuesArg})`;
    const ruleWord = g.rule ?? `L${g.line}`;
    const message = `${ruleWord}, L${g.line}: ${g.condition}${g.effect === 'check' ? ' does not hold' : ''} — ${g.ending}`;
    const field = subjectPath(plan, g.subject);
    if (g.outcome === 'refuses') {
      out.push(`/** Refuses the input as the original does at L${g.line}. */`);
      out.push(`export function ${g.helper}(sel: Selection, st: RunState, ${recordParam}${valuesParam}): Refusal | null {`);
      out.push(`  return ${refuseWhen} ? new Refusal([{ field: ${field ? q(field) : 'null'}, rule: ${q(ruleWord)}, message: ${q(message.slice(0, 300))} }]) : null;`);
      out.push('}');
    } else {
      const verb = g.outcome === 'skips' ? 'Skips the record' : 'Ends the step early';
      out.push(`/** ${verb} as the original does at L${g.line} (${g.ending}). */`);
      out.push(`export function ${g.helper}(sel: Selection, st: RunState, ${recordParam}${valuesParam}): boolean {`);
      out.push(`  return ${refuseWhen};`);
      out.push('}');
    }
  }
  const selectionChecks = carried.filter((g) => g.placement === 'selection' && g.outcome === 'refuses');
  out.push('');
  out.push("/** The selection-screen checks (AT SELECTION-SCREEN), before any step runs. */");
  out.push('export function checkSelection(sel: Selection, st: RunState): Refusal | null {');
  for (const g of selectionChecks) {
    out.push(`  const ${g.id.replace('-', '').toLowerCase()} = checked(st, () => ${g.helper}(sel, st, null));`);
    out.push(`  if (${g.id.replace('-', '').toLowerCase()}) return ${g.id.replace('-', '').toLowerCase()};`);
  }
  out.push('  return null;');
  out.push('}');
  out.push('');
  return { file: { path: 'srv/lib/guards.ts', content: out.join('\n'), owner: carried.length > 0 ? 'fill' : 'engine' }, regions };
}

/* ----------------------------------------------------------------- steps */

function argsInterface(u: Unit): string | null {
  if (u.parameters.length === 0 || u.part) return null;
  const name = `${u.fn[0].toUpperCase()}${u.fn.slice(1)}Args`;
  const members = u.parameters.map((p) => {
    const key = camelName(p.name);
    const type = p.direction === 'changing' ? '{ value: unknown }' : p.direction === 'tables' ? 'unknown[]' : 'unknown';
    return `  /** ${p.name.toUpperCase()} (${p.direction.toUpperCase()}). */\n  ${key}: ${type};`;
  });
  return `export interface ${name} {\n${members.join('\n')}\n}`;
}

function unitDoc(u: Unit, plan: UnitPlan): string {
  const rules = u.rules.map((id) => {
    const r = plan.rules.find((x) => x.id === id);
    if (!r) return id;
    if (r.decision === 'change') return `${id} (change — owner's proposal: ${(r.proposal ?? 'not stated').replace(/\*\//g, '* /').replace(/\s+/g, ' ').slice(0, 300)})`;
    return `${id} (${r.decision}${r.decision === 'open' ? ' — kept as the original until decided' : ''})`;
  });
  const guards = u.guards.map((id) => {
    const g = plan.guards.find((x) => x.id === id)!;
    return `${id} → ${g.helper}`;
  });
  const program = plan.program ?? 'the original';
  const routine = u.routine ? `${u.kind === 'method' ? 'METHOD' : 'FORM'} ${u.routine}` : 'event blocks';
  return [
    '/**',
    ` * ${u.title}.`,
    ` * ABAP: ${program} ${rangeWords(u.abap.slice(0, 1))} (${routine})${u.folded.length ? `; folded: ${u.folded.join(', ')} (${rangeWords(u.abap.slice(1))})` : ''}`,
    ` * Rules: ${rules.length ? rules.join(', ') : 'none'}`,
    ` * Guards: ${guards.length ? guards.join(', ') : 'none'}`,
    ...(u.bodyCalls.length > 0 ? [` * The body calls, where the original checks: ${bodyCallWords(u, plan)}`] : []),
    ` * Unit ${u.id}: the frame is written by Clean-Core.io (engine); the body between the markers is a model proposal.`,
    ' */',
  ].join('\n');
}

function guardCallLines(u: Unit, plan: UnitPlan): string[] {
  const out: string[] = [];
  for (const id of u.guardCalls) {
    const g = plan.guards.find((x) => x.id === id)!;
    const v = id.replace('-', '').toLowerCase();
    if (g.outcome === 'refuses') {
      out.push(`  const ${v} = checked(st, () => ${g.helper}(sel, st, null));`);
      out.push(`  if (${v}) return ${v};`);
    } else {
      out.push(`  if (checked(st, () => ${g.helper}(sel, st, null))) return;`);
    }
  }
  return out;
}

function guardImports(u: Unit, plan: UnitPlan): string[] {
  const names = new Set<string>(['checked']);
  for (const id of u.guards) {
    const g = plan.guards.find((x) => x.id === id)!;
    names.add(g.helper);
    names.add(predicateName(g));
  }
  return [...names];
}

function stepFile(u: Unit, plan: UnitPlan): Built {
  const libDir = u.file.startsWith('srv/steps/') ? '../lib/' : './lib/';
  const callees = u.callees.map((id) => plan.units.find((x) => x.id === id)!).filter(Boolean);
  const out: string[] = [];
  out.push(`// ${u.id} ${u.title} — generated by Clean-Core.io (engine). Fill regions: between the fill markers.`);
  out.push(`import * as csv from '${libDir}csv.ts';`);
  out.push(`import * as dec from '${libDir}decimal.ts';`);
  out.push(`import { NotImplementedFill, Refusal } from '${libDir}errors.ts';`);
  out.push(`import { ${guardImports(u, plan).join(', ')} } from '${libDir}guards.ts';`);
  out.push(`import { DECIMALS } from '${libDir}types.ts';`);
  out.push(`import type { Dec, Rec, RunState, Selection, StepResult } from '${libDir}types.ts';`);
  for (const c of callees) {
    const rel = u.file.startsWith('srv/steps/') ? `./${c.file.replace('srv/steps/', '')}` : `./${c.file.replace('srv/', '')}`;
    out.push(`import { ${c.fn} } from '${rel}';`);
  }
  out.push('');
  const args = argsInterface(u);
  if (args) {
    out.push(args);
    out.push('');
  }
  const doc = unitDoc(u, plan);
  const guardLines = guardCallLines(u, plan);
  out.push(doc);
  out.push(`${u.signature} {`);
  out.push(...guardLines);
  out.push(regionText('node', u.id, `${u.signature}\n${guardLines.join('\n')}\n${doc}`, '  ', `throw new NotImplementedFill(${sq(u.id)}, ${sq(u.fn)});`));
  out.push('}');
  out.push('');
  const available = [...NODE_HELPERS, ...callees.map((c) => c.fn), ...guardImports(u, plan).filter((n) => n !== 'checked'), 'DECIMALS'];
  return { file: { path: u.file, content: out.join('\n'), owner: 'fill' }, regions: [{ regionId: u.id, available }] };
}

/** The parent of a split routine: engine-written, calls its parts in order with one shared local state. */
function splitParentFile(u: Unit, parts: Unit[], plan: UnitPlan): ScaffoldFile {
  const out: string[] = [];
  out.push(`// ${u.id} ${u.title} — split above the hard budget; generated by Clean-Core.io (engine).`);
  const guardNames = u.guardCalls.map((id) => plan.guards.find((g) => g.id === id)!.helper);
  if (guardNames.length > 0) out.push(`import { checked, ${guardNames.join(', ')} } from '../lib/guards.ts';`);
  out.push("import type { RunState, Selection, StepResult } from '../lib/types.ts';");
  for (const p of parts) out.push(`import { ${p.fn} } from './${p.file.replace('srv/steps/', '')}';`);
  out.push('');
  const args = argsInterface(u);
  if (args) out.push(args, '');
  out.push(unitDoc(u, plan));
  out.push(`${u.signature} {`);
  out.push(...guardCallLines(u, plan));
  out.push('  const local: Record<string, unknown> = {};');
  for (const p of parts) {
    out.push(`  const r${p.part!.index} = ${p.fn}(sel, st, local);`);
    out.push(`  if (r${p.part!.index}) return r${p.part!.index};`);
  }
  out.push('}');
  out.push('');
  return { path: u.file, content: out.join('\n'), owner: 'engine' };
}

/* ---------------------------------------------------------- process, app */

function processFile(plan: UnitPlan, facts: EngineFacts): Built {
  const orch = plan.units.find((u) => u.kind === 'orchestrator')!;
  const steps = plan.units.filter((u) => u.kind !== 'orchestrator' && !u.part);
  const fnOf = new Map<string, Unit>();
  for (const u of plan.units) if (u.routine && !u.part) fnOf.set(u.routine, u);
  for (const f of plan.folded) fnOf.set(f.routine, plan.units.find((u) => u.id === f.into)!);
  const reading = facts.graph.edges
    .filter((e) => e.from === null || e.fromKind === 'event' || e.fromKind === 'program' || e.fromKind === 'module')
    .sort((a, b) => a.lineStart - b.lineStart)
    .map((e) => {
      const u = fnOf.get(e.to);
      const where = u && u.kind !== 'orchestrator' ? `${u.fn} (${u.id})` : u ? 'folded into this function' : 'not carried over';
      return ` *   L${e.lineStart} ${e.from ?? 'program'}: PERFORM ${e.to.toLowerCase()} → ${where}`;
    });
  const out: string[] = [];
  out.push('/**');
  out.push(' * The process: the selection checks, then the steps in the original order.');
  out.push(' * runProcess is written by Clean-Core.io (engine); the body of runSteps is a model proposal.');
  out.push(' */');
  out.push("import * as csv from './lib/csv.ts';");
  out.push("import * as dec from './lib/decimal.ts';");
  out.push("import { NotImplementedFill, Refusal } from './lib/errors.ts';");
  out.push(`import { ${['checked', 'checkSelection', ...guardImports(orch, plan).filter((n) => n !== 'checked')].join(', ')} } from './lib/guards.ts';`);
  out.push("import type { Rec, RunState, Selection, StepResult } from './lib/types.ts';");
  for (const s of steps) out.push(`import { ${s.fn} } from './${s.file.replace('srv/', '')}';`);
  out.push('');
  const doc = [
    unitDoc(orch, plan).replace(/ \*\/$/, ''),
    ' * Reading order of the original (engine):',
    ...(reading.length ? reading : [' *   (no PERFORM at program level)']),
    ' */',
  ].join('\n');
  const guardLines = guardCallLines(orch, plan);
  out.push(doc);
  out.push(`${orch.signature} {`);
  out.push(...guardLines);
  out.push(regionText('node', orch.id, `${orch.signature}\n${guardLines.join('\n')}\n${doc}`, '  ', `throw new NotImplementedFill(${sq(orch.id)}, ${sq(orch.fn)});`));
  out.push('}');
  out.push('');
  out.push('export interface ProcessOutcome {');
  out.push('  refusal: Refusal | null;');
  out.push('  /** False while a function the run reached is still a stub. */');
  out.push('  complete: boolean;');
  out.push('  notFilled: string[];');
  out.push('  state: RunState;');
  out.push('}');
  out.push('');
  out.push('/** One run: a fresh state, the selection checks, then runSteps. A stub is recorded, never hidden. */');
  out.push('export function runProcess(sel: Selection, records: Rec[]): ProcessOutcome {');
  out.push('  const st: RunState = { selection: sel, records: records.slice(), rows: [], result: {}, issues: [], notFilled: [], local: {} };');
  out.push('  const done = (refusal: Refusal | null): ProcessOutcome => {');
  out.push('    const notFilled = [...new Set(st.notFilled)];');
  out.push('    return { refusal, complete: notFilled.length === 0, notFilled, state: st };');
  out.push('  };');
  out.push('  const first = checkSelection(sel, st);');
  out.push('  if (first) return done(first);');
  out.push('  try {');
  out.push('    const r = runSteps(sel, st);');
  out.push('    if (r instanceof Refusal) return done(r);');
  out.push('  } catch (err) {');
  out.push('    if (err instanceof Refusal) return done(err);');
  out.push('    if (err instanceof NotImplementedFill) st.notFilled.push(err.unitId);');
  out.push('    else throw err;');
  out.push('  }');
  out.push('  return done(null);');
  out.push('}');
  out.push('');
  const available = [...NODE_HELPERS, ...steps.map((s) => s.fn), ...guardImports(orch, plan).filter((n) => n !== 'checked')];
  return { file: { path: 'srv/process.ts', content: out.join('\n'), owner: 'fill' }, regions: [{ regionId: orch.id, available }] };
}

const SIMULATE_TS = String.raw`/**
 * One simulation: validate, run the process, store the run under a fresh id.
 * Shared by the HTTP app and the call contract. Written by Clean-Core.io (engine).
 */
import { validateRequest, type InputError } from './lib/input-contract.ts';
import type { RunRecord, RunStore } from './lib/run-store.ts';
import { CONTEXT_DIGEST, RULE_REVISION, SOURCE_REVISION, type Selection } from './lib/types.ts';
import { runProcess } from './process.ts';

export interface RunResult {
  rows: Array<Record<string, unknown>>;
  result: Record<string, unknown>;
  issues: Array<{ severity: string; message: string; rule?: string }>;
}

export interface SimulateAnswer {
  ok: boolean;
  runId: string | null;
  /** Input records in the result (a skipping check removes one). */
  records: number;
  errors: InputError[];
  /** False while a function the run reached is still a stub. */
  complete: boolean;
  notFilled: string[];
  run: RunRecord<Selection, RunResult> | null;
}

export function simulateRequest(raw: unknown, store: RunStore<Selection, RunResult>): SimulateAnswer {
  const v = validateRequest(raw);
  if (!v.ok || !v.normalized) return { ok: false, runId: null, records: 0, errors: v.errors, complete: false, notFilled: [], run: null };
  const { records, ...selection } = v.normalized;
  const outcome = runProcess(selection, records);
  if (outcome.refusal) {
    return { ok: false, runId: null, records: 0, errors: outcome.refusal.errors, complete: outcome.complete, notFilled: outcome.notFilled, run: null };
  }
  const st = outcome.state;
  const run = store.create({
    selection,
    sourceRevision: SOURCE_REVISION,
    ruleRevision: RULE_REVISION,
    contextDigest: CONTEXT_DIGEST,
    complete: outcome.complete,
    notFilled: outcome.notFilled,
    records: st.records.length,
    result: { rows: st.rows, result: st.result, issues: st.issues },
  });
  return { ok: true, runId: run.runId, records: run.records, errors: [], complete: run.complete, notFilled: [...run.notFilled], run };
}
`;

const APP_TS = String.raw`/**
 * The HTTP app - a factory, no listen (rule 22): importing this module opens
 * no port. srv/server.ts is the only file that listens.
 * Every route reads its input through the one input contract and binds its
 * result to a run id. Written by Clean-Core.io (engine).
 */
import http from 'node:http';
import * as csv from './lib/csv.ts';
import { CSV_DELIMITER, requestFromCsv } from './lib/input-contract.ts';
import { createRunStore, type RunRecord, type RunStore } from './lib/run-store.ts';
import type { Selection } from './lib/types.ts';
import { simulateRequest, type RunResult } from './simulate.ts';

const MAX_BODY = 5 * 1024 * 1024;

export interface AppDeps {
  store?: RunStore<Selection, RunResult>;
}

/** A run's rows as CSV; every row names its run, the source revision and the rule revision. */
export function exportCsv(run: RunRecord<Selection, RunResult>): string {
  const rows = run.result.rows;
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const bound = rows.map((r) => ({ run_id: run.runId, source_revision: run.sourceRevision, rule_revision: run.ruleRevision, ...r }));
  return csv.table(['run_id', 'source_revision', 'rule_revision', ...columns], bound, CSV_DELIMITER);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new RangeError('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown, type: string = 'application/json'): void {
  res.statusCode = status;
  res.setHeader('content-type', type + '; charset=utf-8');
  res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
}

export function createApp(deps: AppDeps = {}): http.Server {
  const store = deps.store ?? createRunStore<Selection, RunResult>();
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const answer = async (): Promise<void> => {
      if (req.method === 'POST' && url.pathname === '/api/simulate') {
        let raw: unknown;
        try {
          raw = JSON.parse(await readBody(req));
        } catch {
          send(res, 400, { ok: false, errors: [{ field: null, rule: 'INPUT', message: 'the body is not JSON' }] });
          return;
        }
        const a = simulateRequest(raw, store);
        send(res, a.ok ? 200 : 422, { ok: a.ok, runId: a.runId, records: a.records, complete: a.complete, notFilled: a.notFilled, errors: a.errors });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/simulate.csv') {
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => {
          query[k] = v;
        });
        let raw: unknown;
        try {
          raw = requestFromCsv(await readBody(req), query);
        } catch (err) {
          send(res, 400, { ok: false, errors: [{ field: null, rule: 'INPUT', message: String((err as Error).message) }] });
          return;
        }
        const a = simulateRequest(raw, store);
        send(res, a.ok ? 200 : 422, { ok: a.ok, runId: a.runId, records: a.records, complete: a.complete, notFilled: a.notFilled, errors: a.errors });
        return;
      }
      const m = /^\/api\/runs\/([0-9a-f-]{36})(\/export\.csv)?$/.exec(url.pathname);
      if (req.method === 'GET' && m) {
        const run = store.get(m[1]);
        if (!run) {
          send(res, 404, { ok: false, errors: [{ field: 'runId', rule: 'RUN', message: 'no run with this id' }] });
          return;
        }
        if (m[2]) send(res, 200, exportCsv(run), 'text/csv');
        else send(res, 200, run);
        return;
      }
      send(res, 404, { ok: false, errors: [{ field: null, rule: 'ROUTE', message: 'not found' }] });
    };
    answer().catch((err: unknown) => send(res, 500, { ok: false, errors: [{ field: null, rule: 'SERVER', message: String((err as Error)?.message ?? err) }] }));
  });
}
`;

const SERVER_TS = String.raw`// The only file that listens (rule 22), and only when started directly. Written by Clean-Core.io (engine).
import { pathToFileURL } from 'node:url';
import { createApp } from './app.ts';

const raw = process.env.PORT ?? '8080';
const port = /^\d{1,5}$/.test(raw) ? +raw : 8080;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(port, () => {
    process.stdout.write('listening on ' + port + '\n');
  });
}
`;

function engineContractFile(plan: UnitPlan): string {
  const model = contractModel(plan);
  return [
    '/**',
    ' * The call contract (code-draft rule 24): the engine cases run against these five exports without a',
    ' * model-written assertion. No server, no I/O on import. Written by Clean-Core.io (engine).',
    ' */',
    "import * as dec from './lib/decimal.ts';",
    "import { validateRequest, type InputError } from './lib/input-contract.ts';",
    "import { createRunStore } from './lib/run-store.ts';",
    "import { DECIMALS, type Request, type Selection } from './lib/types.ts';",
    "import { simulateRequest, type RunResult } from './simulate.ts';",
    '',
    `export const CONTRACT = ${JSON.stringify(model, null, 2)};`,
    '',
    'const store = createRunStore<Selection, RunResult>();',
    '',
    '/** Obligatory fields the original gives no valid value for: a request without them cannot be the base of a case. */',
    `const MISSING_BASE: ReadonlyArray<{ original: string; path: string }> = ${JSON.stringify(plan.fields.filter((f) => plan.missingBaseValues.includes(f.original) && f.path).map((f) => ({ original: f.original, path: f.path })))};`,
    '',
    'function requireBaseValues(request: unknown): void {',
    '  const r = (request ?? {}) as Record<string, unknown>;',
    '  if (Object.keys(r).length === 0) return;',
    '  const first = Array.isArray(r.records) ? (r.records[0] as Record<string, unknown> | undefined) : undefined;',
    '  const absent = MISSING_BASE.filter((m) => {',
    "    const key = m.path.slice(m.path.lastIndexOf('.') + 1);",
    '    const holder = m.path.startsWith("records[].") ? first : r;',
    '    return !holder || holder[key] === undefined || holder[key] === null;',
    '  });',
    "  if (absent.length > 0) throw new Error('Not run — no valid base value known for ' + absent.map((m) => m.original).join(', '));",
    '}',
    '',
    'export function validate(request: unknown): { ok: boolean; errors: InputError[]; normalized: Request | null } {',
    '  requireBaseValues(request);',
    '  const v = validateRequest(request);',
    '  return { ok: v.ok, errors: v.errors, normalized: v.normalized };',
    '}',
    '',
    'export function simulate(request: unknown): { ok: boolean; runId: string | null; records: number; errors: InputError[]; complete: boolean; notFilled: string[] } {',
    '  requireBaseValues(request);',
    '  const a = simulateRequest(request, store);',
    '  return { ok: a.ok, runId: a.runId, records: a.records, errors: a.errors, complete: a.complete, notFilled: a.notFilled };',
    '}',
    '',
    'export function getRun(runId: string) {',
    '  return store.get(String(runId));',
    '}',
    '',
    '/** a op b for a declared packed field (internal ones too), rounded commercially to its places; refuses a result over its bound. */',
    'export function compute(field: string, a: string, op: string, b: string): string {',
    '  const name = String(field).toUpperCase();',
    "  const spec = DECIMALS[name] ?? (name.includes('-') ? DECIMALS[name.slice(name.lastIndexOf('-') + 1)] : undefined);",
    "  if (!spec) throw new RangeError('no packed field ' + name + ' in the original');",
    "  if (!dec.parse(String(a)) || !dec.parse(String(b))) throw new RangeError('not a decimal');",
    '  let out: string;',
    "  if (op === '+') out = dec.add(String(a), String(b), spec.places);",
    "  else if (op === '-') out = dec.sub(String(a), String(b), spec.places);",
    "  else if (op === '*') out = dec.mul(String(a), String(b), spec.places);",
    "  else if (op === '/') out = dec.div(String(a), String(b), spec.places);",
    "  else throw new RangeError('unknown operator ' + op);",
    "  if (!dec.fits(out, spec.max)) throw new RangeError(name + ': ' + out + ' does not fit P(' + spec.digits + ',' + spec.places + ')');",
    '  return out;',
    '}',
    '',
  ].join('\n');
}

const SHIMS_TS = String.raw`/**
 * Entry points for the acceptance harness's probes (acceptance-adapter.json):
 * thin calls into the package's own decimal and CSV code, so the probes test
 * the code the package runs. Test-only; written by Clean-Core.io (engine).
 */
import * as csv from '../srv/lib/csv.ts';
import * as dec from '../srv/lib/decimal.ts';
import { CSV_DELIMITER } from '../srv/lib/input-contract.ts';

const text = (v: unknown): string => (typeof v === 'number' ? String(v) : String(v));

/** amount x rate % at places through dec.percentOf; the probe compares numbers. */
export function percentOf(amount: unknown, ratePercent: unknown, places: number): { value: number } {
  return { value: +dec.percentOf(text(amount), text(ratePercent), places) };
}

/** Required minus withdrawn against available, exact at three places. */
export function coverage(input: { required: unknown; withdrawn: unknown; available: unknown }): { status: string; open: string } {
  const open = dec.sub(text(input.required), text(input.withdrawn), 3);
  return { status: dec.compare(dec.round(text(input.available), 3), open) >= 0 ? 'COVERED' : 'SHORTAGE', open };
}

/** The package's CSV writer on probe rows, with the original's delimiter. */
export function csvRows(rows: Array<Record<string, unknown>>): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return csv.table(columns, rows, CSV_DELIMITER);
}
`;

const CASES_TEST_MJS = String.raw`// Runs every engine case through the call contract with node:test - no model-written assertion.
// Written by Clean-Core.io (engine). The runtime is the one the isolated test runner executes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEngineState, runEngineCase } from './engine-runtime.mjs';
import * as contract from '../srv/engine-contract.ts';

const { cases } = JSON.parse(fs.readFileSync(new URL('./engine-cases.json', import.meta.url), 'utf8'));
const state = createEngineState();

for (const c of cases) {
  test(c.id + ' ' + c.name, async (t) => {
    const r = await runEngineCase(contract, c, state);
    if (r.status === 'Not run') {
      t.skip(r.reason);
      return;
    }
    assert.equal(r.status, 'Passed', JSON.stringify(r.examples.filter((e) => e.status === 'fail')));
  });
}
`;

function fixturesFile(plan: UnitPlan): ScaffoldFile | null {
  const fixtures = plan.notCarried.filter((n) => n.reason === 'fixture');
  if (fixtures.length === 0) return null;
  return {
    path: 'srv/fixtures.ts',
    owner: 'engine',
    content: [
      '/**',
      " * The original's demo data is not carried over in this version (owner, 12.10.2026): its routines",
      ` * (${fixtures.map((f) => `${f.routine} L${f.lineStart}–L${f.lineEnd}`).join(', ')}) are fixtures.`,
      ' * This loader reads test/fixtures/original-demo.json; until the engine extracts the demo cases it holds no records.',
      ' * Written by Clean-Core.io (engine).',
      ' */',
      "import fs from 'node:fs';",
      '',
      'export interface OriginalDemo {',
      '  note: string;',
      '  routines: string[];',
      '  records: Array<Record<string, unknown>>;',
      '}',
      '',
      'export function loadOriginalDemo(file: URL = new URL(\'../test/fixtures/original-demo.json\', import.meta.url)): OriginalDemo {',
      "  return JSON.parse(fs.readFileSync(file, 'utf8')) as OriginalDemo;",
      '}',
      '',
    ].join('\n'),
  };
}

/* ------------------------------------------------------------- db, misc */

function schemaCds(plan: UnitPlan, facts: EngineFacts): string {
  const name = (plan.program ?? 'program').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const tables = new Set<string>();
  for (const st of facts.statements) {
    const m = /\bFROM\s+([a-z][\w/]*)/i.exec(st.keyword === 'SELECT' ? st.text : '');
    if (m && !/^@/.test(m[1])) tables.add(m[1].toUpperCase());
  }
  for (const w of facts.graph.databaseWrites) tables.add(w.table);
  const record = plan.fields.filter((f) => f.where === 'record');
  const out: string[] = [];
  out.push(`// Entities for ${plan.program ?? 'the program'} — written by Clean-Core.io (engine).`);
  out.push(`// Tables the original reads or writes: ${[...tables].sort().join(', ') || 'none found'}. Their fields are not in the source and are not invented here.`);
  out.push(`namespace cc.${name};`);
  out.push('');
  out.push('entity InputRecords {');
  out.push('  key ID : UUID;');
  for (const f of record) {
    const type = f.kind === 'packed' ? `Decimal(${f.digits}, ${f.places})` : 'String';
    out.push(`  ${f.key} : ${type}; // ${f.original}, ${f.declaration}, L${f.line}`);
  }
  out.push('}');
  out.push('');
  return out.join('\n');
}

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      description: 'Generated by Clean-Core.io: engine-written scaffold, model-written function bodies (see TRACE.md).',
      engines: { node: '>=22.18' },
      scripts: { start: 'node srv/server.ts', test: 'node --test test/', typecheck: 'tsc -p .' },
      dependencies: {},
      devDependencies: { typescript: '^5.9.3', '@types/node': '^22.0.0' },
    },
    null,
    2,
  )}\n`;
}

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      erasableSyntaxOnly: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['srv/**/*.ts', 'test/**/*.ts'],
  },
  null,
  2,
)}\n`;

const DOCKERFILE = `# Container for review and local trials — a fixed template of Clean-Core.io.
# It has not been built, scanned or deployed by Clean-Core.io.
# The package has no runtime dependency and runs its TypeScript on Node's type stripping.
FROM node:${SCAFFOLD_NODE_MAJOR}-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package.json ./
COPY srv ./srv
USER node
EXPOSE 8080
CMD ["node", "srv/server.ts"]
`;

/* ------------------------------------------------------------------ build */

/** sha256 of the rule decisions the scaffold applied. */
export function ruleRevisionOf(plan: Pick<UnitPlan, 'rules'>): string {
  return sha256Hex(JSON.stringify(plan.rules.map((r) => [r.id, r.decision, r.proposal ?? ''])));
}

/** The Node.js scaffold of a plan — see the file comment. */
export function buildNodeScaffold(plan: UnitPlan, facts: EngineFacts, options: NodeScaffoldOptions = {}): Scaffold {
  const contextDigest = options.contextDigest ?? null;
  const cases = options.cases ?? deriveEngineCases(facts.source, facts.ruleSet.rules);
  const name = packageNameOf(plan.program);
  const files: ScaffoldFile[] = [];
  const available: Record<string, string[]> = {};
  const add = (b: Built) => {
    files.push(b.file);
    for (const r of b.regions) available[r.regionId] = r.available;
  };

  files.push({ path: 'package.json', content: packageJson(name), owner: 'engine' });
  files.push({ path: 'tsconfig.json', content: TSCONFIG, owner: 'engine' });
  files.push({ path: 'srv/lib/errors.ts', content: ERRORS_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/decimal.ts', content: DECIMAL_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/csv.ts', content: CSV_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/run-store.ts', content: RUN_STORE_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/types.ts', content: typesFile(plan, contextDigest, ruleRevisionOf(plan)), owner: 'engine' });
  files.push({ path: 'srv/lib/input-contract.ts', content: inputContractFile(plan), owner: 'engine' });
  add(guardsFile(plan));
  for (const u of plan.units) {
    if (u.kind === 'orchestrator') continue;
    const parts = plan.units.filter((p) => p.part?.parent === u.id);
    if (parts.length > 0) files.push(splitParentFile(u, parts, plan));
    else add(stepFile(u, plan));
  }
  add(processFile(plan, facts));
  files.push({ path: 'srv/simulate.ts', content: SIMULATE_TS, owner: 'engine' });
  files.push({ path: 'srv/app.ts', content: APP_TS, owner: 'engine' });
  files.push({ path: 'srv/server.ts', content: SERVER_TS, owner: 'engine' });
  files.push({ path: 'srv/engine-contract.ts', content: engineContractFile(plan), owner: 'engine' });
  const fixtures = fixturesFile(plan);
  if (fixtures) {
    files.push(fixtures);
    files.push({
      path: 'test/fixtures/original-demo.json',
      owner: 'engine',
      content: `${JSON.stringify(
        {
          note: 'Demo data of the original is not carried over in this version; the engine extracts it as cases later (roadmap 3.0.16).',
          routines: plan.notCarried.filter((n) => n.reason === 'fixture').map((n) => n.routine),
          records: [],
        },
        null,
        2,
      )}\n`,
    });
  }
  files.push({ path: 'db/schema.cds', content: schemaCds(plan, facts), owner: 'engine' });
  files.push({
    path: ENGINE_CASES_FILE,
    content: engineCasesFile(engineCaseProvenance(cases.cases as unknown as Array<Record<string, unknown>>, cases).verified) ?? `${JSON.stringify({ format: 'clean-core.engine-cases/1', cases: [] }, null, 2)}\n`,
    owner: 'engine',
  });
  files.push({ path: 'test/engine-runtime.mjs', content: ENGINE_RUNTIME_JS, owner: 'engine' });
  files.push({ path: 'test/engine-cases.test.mjs', content: CASES_TEST_MJS, owner: 'engine' });
  files.push({ path: 'test/acceptance-shims.ts', content: SHIMS_TS, owner: 'engine' });
  files.push({ path: 'Dockerfile', content: DOCKERFILE, owner: 'engine' });

  const modules: Record<string, string> = {
    contract: 'srv/engine-contract.ts',
    app: 'srv/app.ts',
    shims: 'test/acceptance-shims.ts',
    process: 'srv/process.ts',
    decimal: 'srv/lib/decimal.ts',
    csv: 'srv/lib/csv.ts',
    runStore: 'srv/lib/run-store.ts',
  };
  const adapter = acceptanceAdapter(plan, { packageName: name, modules, delimiter: plan.csvDelimiter });
  files.push({ path: 'acceptance-adapter.json', content: `${JSON.stringify(adapter, null, 2)}\n`, owner: 'engine' });

  // traceability.json and TRACE.md are not part of the scaffold: they say who filled each function, so they
  // are written after the fills (`withTrace`, trace.ts) and stay outside the digest.
  for (const file of files) file.content = defuseMarkers(file.content);
  const required: Record<string, RequiredGuard[]> = {};
  for (const u of plan.units) if (u.bodyCalls.length > 0) required[u.id] = requiredGuardsOf(u, plan, 'node');
  return { track: 'node', version: SCAFFOLD_VERSION, files, units: plan.units, regions: findRegions(files), digest: scaffoldDigest(files), adapter, notCarried: plan.notCarried, available, required };
}

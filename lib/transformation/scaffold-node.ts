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

import type { AbapStatement } from '../abap/statement-reader';
import { sha256Hex } from '../artefact-digest';
// The cases the scaffold writes are branded the one way a case is: recomputed and matched (QA round 3).
import { engineCaseProvenance } from '../engine-case-provenance';
import { ENGINE_RUNTIME_JS } from '../test-sandbox/engine-runtime';
import { deriveEngineCases, ENGINE_CASES_FILE, engineCasesFile, type EngineCaseDerivation } from '../testing-engine-cases';
import { NUMERIC_SYSTEM_FIELDS, readAbapShapes, shapeComment, type AbapScalar, type AbapShapes } from './abap-shapes';
import { withDraftHeader, type AgainstDecision } from './decision-header';
import { originalDemoCases, type OriginalDemoCases } from './golden-master';
import { nodeDemoFiles } from './node-demo';
import { acceptanceAdapter, contractModel } from './call-contract';
import { capShellFiles } from './cap-shell';
import { inputListsOf, listOfPath, withListPaths, workAreasOf, type InputList } from './input-lists';
import { fillProbeConfigs } from './fill-probes';
import { defuseMarkers, findRegions, regionText, scaffoldDigest } from './markers';
import { CSV_TS, DECIMAL_TS, ERRORS_TS, RUN_STORE_TS } from './runtime-node';
import { camelName, pascalName, rangeWords, type EngineFacts } from './unit-plan';
import { operandsOf } from './guard-basis';
import { AUTHORITY_FILE, authorityDocLines, authorityEntriesOf, authorityFile, authorityFrameLines } from './authority-node';
import { LOOKUPS_FILE, lookupAvailable, lookupDocLines, lookupEntriesOf, lookupFrameLines, lookupImport, lookupListsOf, lookupReadsOf, lookupsFile } from './lookups-node';
import { NO_ENTRY_POINT, SCAFFOLD_VERSION, type AuthorityEntry, type LookupEntry, type ContractField, type PlanGuard, type RequiredGuard, type Scaffold, type ScaffoldFile, type Unit, type UnitPlan } from './types';

/** The Node major of the container; the same as `PACKAGE_NODE_MAJOR` (lib/delivery-package.ts, not imported to keep this module small — a spec holds them equal). */
export const SCAFFOLD_NODE_MAJOR = 22;

export interface NodeScaffoldOptions {
  /** Track A's `contextDigest`, when the context pack was built; enters run records and the trace. */
  contextDigest?: string | null;
  /** The engine cases; derived from the source when absent. */
  cases?: EngineCaseDerivation;
  /** The run the package is built from (§12.3). */
  runId?: string | null;
  /** The live decision on record this rebuild contradicts: every main file says so in its first line (3.0.13, B6). */
  against?: AgainstDecision | null;
  /** The original's demo cases (`originalDemoCases`); read from the source when absent, none when null (A4). */
  originalDemo?: OriginalDemoCases | null;
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
    case 'integer':
      // A whole number within JavaScript's exact integers is a number (3.0.14 item 1); an int8 stays text.
      return `${wholeNumber(f.max) ? 'number' : 'string'}${opt}`;
    default:
      return `string${opt}`;
  }
}

/** Is an integer field with this bound a `number` in the port (`abap-shapes.ts` INTEGER_TYPES)? Up to int4's 2147483647. */
function wholeNumber(max: string | null | undefined): boolean {
  return typeof max === 'string' && /^\d{1,10}$/.test(max);
}

function decimalTypeName(f: ContractField): string {
  return pascalName(f.original);
}

/* ------------------------------------------------------------- lib/types */

/** The names types.ts declares itself; a structure of the original that shares one is suffixed (`abap-shapes.ts`). */
function typesReserved(plan: UnitPlan): Set<string> {
  return new Set([
    'Dec', 'DecimalField', 'Range', 'Selection', 'Rec', 'Request', 'RunState', 'StepResult', 'Locals', 'Refusal',
    ...plan.fields.filter((f) => f.kind === 'packed').map(decimalTypeName),
  ]);
}

/** A record field still carried in the one record list (`records[].x`): its structure has no input list of its own. */
const inRecords = (f: ContractField) => f.where === 'record' && (listOfPath(f.path) ?? 'records') === 'records';

/**
 * Every type srv/lib/types.ts exports — what a step, the process and the guards import (3.0.13, acceptance run
 * 14.10.2026): a body that names the original's structure (`TyPolicy`) or `Range` found nothing, and `Range`
 * then silently meant the DOM's.
 */
function typeExportNames(plan: UnitPlan, shapes: AbapShapes): string[] {
  const packed = plan.fields.filter((f) => f.kind === 'packed').map(decimalTypeName);
  return [...new Set(['Dec', 'DecimalField', 'Range', 'Selection', 'Rec', 'Request', 'Locals', 'RunState', 'StepResult', ...packed, ...shapes.structures.map((s) => s.tsName)])];
}

/** A value a guard reads or a step takes, typed as the original declares it where `line` reads it (`abap-shapes.ts`). */
function declaredType(shapes: AbapShapes, name: string, line: number, fallback: string): string {
  const ts = shapes.typeOf(name, line);
  return ts ?? fallback;
}

function typesFile(plan: UnitPlan, contextDigest: string | null, ruleRevision: string, shapes: AbapShapes, lists: readonly InputList[]): string {
  const lookups = lists.filter((l) => l.lookup);
  const packed = plan.fields.filter((f) => f.kind === 'packed');
  const selection = plan.fields.filter((f) => f.where === 'selection');
  const record = plan.fields.filter(inRecords);
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
  // The structure each record field comes from (A3, 3.0.13). Since scaffold version 7 a structure with an input
  // table of its own is a list of its own (`Inputs` below); only fields of a structure without one stay here.
  const ownerOf = (line: number) => shapes.structures.find((s) => line > s.line && line < s.lineEnd);
  const owners = [...new Set(record.map((f) => ownerOf(f.line)).filter((s): s is NonNullable<typeof s> => !!s))];
  lines.push('/**');
  lines.push(' * One input record of the record list (`records`), validated.');
  if (owners.length > 1) {
    lines.push(` * A record holds the input fields of ${owners.map((s) => `${s.name.toUpperCase()} (${s.tsName}, L${s.line}–${s.lineEnd})`).join(', ')}`);
    lines.push(' * together — the original has no input table of these structures; each field names the structure it comes from.');
  } else if (owners.length === 1) {
    lines.push(` * Its fields are the input components of ${owners[0].name.toUpperCase()} (${owners[0].tsName}, L${owners[0].line}–${owners[0].lineEnd}).`);
  }
  if (lists.length > 0) lines.push(` * The input structures with a table of their own are lists of their own (Inputs): ${lists.map((l) => `${l.key} (${l.structure.name.toUpperCase()})`).join(', ')}.`);
  lines.push(' */');
  lines.push('export interface Rec {');
  for (const f of record) {
    const owner = ownerOf(f.line);
    lines.push(`  /** ${f.original} — ${f.declaration}, L${f.line}${owner ? `, of ${owner.name.toUpperCase()}` : ''}. */\n  ${f.key}: ${fieldType(f)};`);
  }
  lines.push('}');
  lines.push('');
  lines.push('/**');
  lines.push(" * The input lists, one per input table of the original, each typed by its own structure (scaffold version 7).");
  lines.push(" * A run starts with these rows in the original's global table (srv/lib/input-contract.ts seedOf).");
  lines.push(' */');
  lines.push('export interface Inputs {');
  for (const l of lists) lines.push(`  /** ${l.global.name.toUpperCase()} (L${l.global.line}) — rows of ${l.structure.name.toUpperCase()}; ${l.filledBy.map((b) => (b === 'demo' ? "the original's demo data fills it" : b === 'read' ? 'a SELECT fills it' : b === 'lookup' ? `a step reads it (L${l.lookup?.lines.join(', L')}): a lookup list, answered by srv/lib/lookups.ts` : 'its input fields')).join(', ')}. */\n  ${l.key}: ${l.structure.tsName}[];`);
  lines.push('}');
  lines.push('');
  lines.push('/** A validated request: the selection, the record list and the input lists. */');
  lines.push('export type Request = Selection & { records: Rec[] } & Inputs;');
  lines.push('');
  // Every structure the original declares, typed by its components (scalars as text: numbers are computed through dec.*).
  for (const s of shapes.structures) {
    lines.push(`/** ${s.name.toUpperCase()} — the original's structure, L${s.line}–${s.lineEnd}. Decimals are text at their places (compute with dec.*); whole numbers are numbers. */`);
    lines.push(`export interface ${s.tsName} {`);
    for (const f of s.fields) lines.push(`  /** ${shapeComment(f)} */\n  ${f.key}: ${f.ts};`);
    lines.push('}');
    lines.push('');
  }
  // A row of each SAP table a step reads on its own (scaffold version 15, `lookups-node.ts`): the columns the reads name.
  for (const l of lookups) {
    lines.push(`/** A row of ${l.lookup!.table}, as the original reads it at L${l.lookup!.lines.join(', L')}: the columns its reads name. Their types are in the dictionary: text as the request sends it. */`);
    lines.push(`export interface ${l.structure.tsName} {`);
    for (const c of l.columns) lines.push(`  /** ${c.name.toUpperCase()} — ${c.abap}, L${c.line}. */\n  ${c.key}: string | null;`);
    lines.push('}');
    lines.push('');
  }
  lines.push(
    lists.length > 0
      ? `/** The original's global data, typed by its declarations: what the steps share in one run (st.local). The request's input lists start the run in their tables: ${lists.map((l) => `${l.key} → ${l.global.key}`).join(', ')}. */`
      : "/** The original's global data, typed by its declarations: what the steps share in one run (st.local). */",
  );
  lines.push('export interface Locals {');
  for (const g of shapes.globals) lines.push(`  /** ${shapeComment(g)} */\n  ${g.key}: ${g.ts};`);
  for (const l of lookups) lines.push(`  /** ${l.lookup!.table} — the rows of the lookup list ${l.key}; not a global of the original: srv/lib/lookups.ts reads them where a step reads ${l.lookup!.table}. */\n  ${l.global.key}: ${l.structure.tsName}[];`);
  lines.push('}');
  lines.push('');
  lines.push('/** A fresh run: every global at its ABAP initial value (or the VALUE the original declares). */');
  lines.push('export function initialLocals(): Locals {');
  const inits = [...shapes.globals.map((g) => `    ${g.key}: ${g.init},`), ...lookups.map((l) => `    ${l.global.key}: [],`)];
  lines.push(inits.length ? `  return {\n${inits.join('\n')}\n  };` : '  return {};');
  lines.push('}');
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
  lines.push("  /** Working data of the steps: the original's global data, typed (Locals). */");
  lines.push('  local: Locals;');
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
  if (spec.length !== null && spec.kind === 'text' && text.length > spec.length) return fail('longer than ' + spec.declaration + ' (' + spec.length + ' characters)');
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
      // Up to int4 a whole number is a number in this package (types.ts); an int8 stays exact text.
      return spec.max !== null && spec.max.length <= 10 ? Number(v) : v.toString();
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
  for (const l of LISTS) known.add(l.key);
  if (FIELDS.length === 0 && LISTS.length === 0) known.add('run');
  for (const key of Object.keys(raw)) {
    if (known.has(key)) continue;
    const listed = key === 'records' && LISTS.length > 0;
    errors.push({ field: key, rule: 'INPUT', message: listed ? 'records: this package takes one list per input structure (' + LISTS.map((l) => l.key).join(', ') + '), not one record list' : key + ': the original offers no such option' });
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
  // One list per input structure (scaffold version 7): each row validated by its own structure's components.
  const inputs: Record<string, unknown> = {};
  for (const l of LISTS) {
    const list = raw[l.key];
    const rows: Array<Record<string, unknown>> = [];
    if (list !== undefined && list !== null && !Array.isArray(list)) {
      errors.push({ field: l.key, rule: 'INPUT', message: l.key + ': a list of ' + l.original + ' rows' });
    } else if (Array.isArray(list)) {
      const columns = new Set(l.columns.map((c) => c.key));
      list.forEach((item, i) => {
        const at = l.key + '[' + i + ']';
        if (!isObj(item)) {
          errors.push({ field: at, rule: 'INPUT', message: 'a row of ' + l.original + ' is an object' });
          return;
        }
        for (const key of Object.keys(item)) {
          if (!columns.has(key)) errors.push({ field: at + '.' + key, rule: 'INPUT', message: key + ': not a component of ' + l.original });
        }
        const row = l.initial();
        for (const c of l.columns) {
          const v = normalise(c, item[c.key], at + '.' + c.key, errors);
          if (v !== undefined && v !== null) row[c.key] = v;
        }
        rows.push(row);
      });
    }
    inputs[l.key] = rows;
  }
  // Rule 17: the lists that carry the original's input records cannot all be empty — no rows, nothing selected.
  const required = LISTS.filter((l) => l.required);
  if (required.length > 0 && required.every((l) => (inputs[l.key] as unknown[]).length === 0)) {
    errors.push({ field: required.length === 1 ? required[0].key : null, rule: 'INPUT', message: 'empty selection: no rows in ' + required.map((l) => l.key).join(', ') });
  }
  if (errors.length > 0) return { ok: false, errors, normalized: null };
  return { ok: true, errors: [], normalized: { ...(out as unknown as Selection), records: records as unknown as Rec[], ...(inputs as unknown as Inputs) } };
}

/** A validated request in its parts: the selection, the record list, the input lists. */
export function splitRequest(r: Request): { selection: Selection; records: Rec[]; inputs: Inputs } {
  const rest: Record<string, unknown> = { ...(r as unknown as Record<string, unknown>) };
  const records = (Array.isArray(rest.records) ? rest.records : []) as Rec[];
  delete rest.records;
  const inputs: Record<string, unknown> = {};
  for (const l of LISTS) {
    inputs[l.key] = Array.isArray(rest[l.key]) ? rest[l.key] : [];
    delete rest[l.key];
  }
  return { selection: rest as unknown as Selection, records, inputs: inputs as unknown as Inputs };
}

/**
 * The selection alone, through the same contract (3.0.13): the original's demo cases (srv/fixtures.ts) bring
 * their input as the original's own tables, not as request records, so only their selection is validated here.
 */
export function validateSelection(raw: unknown): { ok: boolean; errors: InputError[]; selection: Selection | null } {
  const errors: InputError[] = [];
  if (!isObj(raw)) return { ok: false, errors: [{ field: null, rule: 'INPUT', message: 'the selection is not an object' }], selection: null };
  const specs = FIELDS.filter((f) => f.where === 'selection');
  const known = new Set(specs.map((f) => f.key));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) errors.push({ field: key, rule: 'INPUT', message: key + ': the original offers no such option' });
  }
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    const v = normalise(spec, raw[spec.key], spec.key, errors);
    if (v !== undefined) out[spec.key] = v;
  }
  if (errors.length > 0) return { ok: false, errors, selection: null };
  return { ok: true, errors: [], selection: out as unknown as Selection };
}

/**
 * A CSV upload of rows plus the selection in the query, as the raw request validateRequest reads. The rows are
 * the input list the query names (list=claims), else the record list, else the first input list.
 */
export function requestFromCsv(text: string, query: Record<string, string | undefined>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const spec of FIELDS.filter((f) => f.where === 'selection')) {
    const v = query[spec.key] ?? query[spec.original] ?? query[spec.original.toLowerCase()];
    if (v === undefined) continue;
    raw[spec.key] = spec.kind === 'range' ? v.split(',').filter((x) => x !== '') : v;
  }
  const named = LISTS.find((l) => l.key === query.list);
  const target = named ?? (FIELDS.some((f) => f.where === 'record') ? undefined : LISTS[0]);
  if (target) {
    const byName = new Map<string, string>();
    for (const c of target.columns) {
      byName.set(c.key.toLowerCase(), c.key);
      byName.set(c.original.toLowerCase(), c.key);
    }
    raw[target.key] = csv.objects(text, CSV_DELIMITER).map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) out[byName.get(k.toLowerCase()) ?? k] = v;
      return out;
    });
    return raw;
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

function inputContractFile(plan: UnitPlan, lists: readonly InputList[]): string {
  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * The input contract — one validator for JSON, query and CSV (rules 15–17, 19).');
  lines.push(" * Written by Clean-Core.io (engine) from the original's selection screen and declarations.");
  lines.push(' * Since scaffold version 7 each input table of the original is a list of its own (LISTS), typed by its structure.');
  lines.push(' */');
  lines.push("import * as csv from './csv.ts';");
  lines.push("import * as dec from './decimal.ts';");
  lines.push("import type { Inputs, Locals, Range, Rec, Request, Selection } from './types.ts';");
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
  lines.push('  /** The length of a text field, where the original declares it; a longer value is refused. */');
  lines.push('  readonly length: number | null;');
  lines.push('}');
  lines.push('/** One input list: the request key, the original\'s table it fills, its structure\'s components. */');
  lines.push('export interface ListSpec {');
  lines.push('  readonly key: string;');
  lines.push('  /** The original\'s structure, upper case. */');
  lines.push('  readonly original: string;');
  lines.push('  /** The original\'s global table, upper case, and its key in Locals. */');
  lines.push('  readonly table: string;');
  lines.push('  readonly global: string;');
  lines.push('  readonly columns: readonly FieldSpec[];');
  lines.push("  /** It carries the original's input records: a request needs rows in at least one such list. */");
  lines.push('  readonly required: boolean;');
  lines.push('  /** A row with every component at its initial value. */');
  lines.push('  readonly initial: () => Record<string, unknown>;');
  lines.push('}');
  lines.push('export interface InputError {\n  field: string | null;\n  rule: string;\n  message: string;\n}');
  lines.push('export interface Validation {\n  ok: boolean;\n  errors: InputError[];\n  normalized: Request | null;\n}');
  lines.push('');
  lines.push(`/** The delimiter of CSV files: the original's (${q(plan.csvDelimiter)}). */`);
  lines.push(`export const CSV_DELIMITER = ${q(plan.csvDelimiter)};`);
  lines.push('');
  lines.push("/** Every field of the selection and of the record list, from the original's declarations. */");
  lines.push('export const FIELDS: readonly FieldSpec[] = [');
  for (const f of plan.fields.filter((x) => x.where === 'selection' || inRecords(x))) {
    lines.push(
      `  { original: ${q(f.original)}, key: ${q(f.key)}, where: ${q(f.where)}, kind: ${q(f.kind)}, digits: ${f.digits ?? 'null'}, places: ${f.places}, max: ${f.max ? q(f.max) : 'null'}, obligatory: ${f.obligatory}, line: ${f.line}, declaration: ${q(f.declaration)}, length: null },`,
    );
  }
  lines.push('];');
  lines.push('');
  lines.push("/** The input lists: one per input table of the original, each row checked against its structure's components. */");
  lines.push('export const LISTS: readonly ListSpec[] = [');
  for (const l of lists) {
    lines.push(`  {`);
    const required = plan.fields.some((f) => f.where === 'record' && listOfPath(f.path) === l.key);
    lines.push(`    key: ${q(l.key)}, original: ${q(l.structure.name.toUpperCase())}, table: ${q(l.global.name.toUpperCase())}, global: ${q(l.global.key)}, required: ${required},`);
    lines.push('    columns: [');
    for (const c of l.columns) {
      lines.push(
        `      { original: ${q(c.name.toUpperCase())}, key: ${q(c.key)}, where: "record", kind: ${q(c.kind)}, digits: ${c.digits ?? 'null'}, places: ${c.places}, max: ${c.max ? q(c.max) : 'null'}, obligatory: ${c.obligatory}, line: ${c.line}, declaration: ${q(c.declaration)}, length: ${c.length ?? 'null'} },`,
      );
    }
    lines.push('    ],');
    lines.push(`    initial: () => ({ ${l.columns.map((c) => `${c.key}: ${c.init}`).join(', ')} }),`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  lines.push("/** The original's table each input list fills, by the table's name (GT_CLAIMS → gtClaims); a lookup list fills none. */");
  lines.push(`export const LIST_GLOBALS: Readonly<Record<string, string>> = ${JSON.stringify(Object.fromEntries(lists.filter((l) => !l.lookup).map((l) => [l.global.name.toUpperCase(), l.global.key])))};`);
  lines.push('');
  lines.push("/** The input lists as the run's start values of the original's global tables. */");
  lines.push('export function seedOf(inputs: Inputs): Partial<Locals> {');
  lines.push(lists.length ? `  return { ${lists.map((l) => `${l.global.key}: inputs.${l.key}`).join(', ')} };` : '  void inputs;\n  return {};');
  lines.push('}');
  lines.push('');
  lines.push("/** The rows still in the original's input tables after a run (a skipping check removes one). */");
  lines.push('export function inputRowsOf(local: Locals): number {');
  // A lookup list's rows are what a step looks up, not input records of the run.
  const counted = lists.filter((l) => !l.lookup);
  lines.push(counted.length ? `  return ${counted.map((l) => `local.${l.global.key}.length`).join(' + ')};` : '  void local;\n  return 0;');
  lines.push('}');
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

/**
 * The values a check of the Node package reads (3.0.13): a derived check's computed operands, and — for a check
 * that reads only the input — the parameters of its routine it names (`IF iv_amount IS INITIAL` in a FORM with
 * `USING iv_amount`). The predicate has no `args`; the engine hands them in at the step's entry (acceptance run
 * 14.10.2026: predicates read `args`, "Cannot find name 'args'"). A parameter's component is handed in only where
 * the parameter's type is known, so the hand-over compiles.
 */
function nodeGuardOperands(g: PlanGuard, plan: Pick<UnitPlan, 'units'>, shapes: AbapShapes): Array<{ name: string; key: string }> {
  if (g.basis === 'derived') return g.operands;
  const u = plan.units.find((x) => x.id === g.unitId);
  if (!u || u.part || u.parameters.length === 0) return [];
  const params = new Set(u.parameters.map((p) => p.name.toLowerCase()));
  return operandsOf(g.condition)
    .filter((o) => params.has(o.split('-')[0]) && (!o.includes('-') || shapes.typeOf(o, g.line) !== null))
    .map((o) => ({ name: o, key: camelName(o) }));
}

/** The `values` type of a guard that reads values (`G0066Values`), or null for one that reads none. */
const guardValuesType = (g: PlanGuard, plan: Pick<UnitPlan, 'units'>, shapes: AbapShapes) =>
  nodeGuardOperands(g, plan, shapes).length > 0 ? `${g.id.replace('-', '')}Values` : null;

/** "guard_BR_004_G0066 (L66, values { lvSum }); skip_G0074 (L74)". */
function bodyCallWords(u: Unit, plan: UnitPlan): string {
  return u.bodyCalls
    .map((id) => {
      const g = plan.guards.find((x) => x.id === id)!;
      return `${g.helper} (L${g.line}${g.operands.length ? `, values { ${g.operands.map((o) => o.key).join(', ')} }` : ''})`;
    })
    .join('; ');
}

/** Does an ABAP statement's text use this literal (`'SHIP'`, `100`)? */
function usesLiteral(text: string, literal: string): boolean {
  if (/^-?\d+(?:\.\d+)?$/.test(literal)) return new RegExp(`(?<![\\w.'-])${literal.replace(/[.-]/g, '\\$&')}(?![\\w.])`).test(text);
  return text.includes(`'${literal.replace(/'/g, "''")}'`);
}

/**
 * The guards a body region must call, for `spliceBodies` (placement `body`).
 * `literals` are what `bodyGuards` reads as the guard's condition written
 * inline. A literal the unit's own code also uses outside any check — `WHEN
 * 'SHIP'` before `IF ls_parent-kind = 'SHIP' AND lv_qty > …` — is part of the
 * routine a faithful body translates, not evidence of an inlined check, and is
 * left out (A/B 13.10.2026, U16: every faithful body was refused). Other
 * checks' statements do not count: each is a guard of its own.
 */
export function requiredGuardsOf(u: Unit, plan: UnitPlan, track: 'node' | 'rap', statements: readonly AbapStatement[] = []): RequiredGuard[] {
  const guardLines = new Set(plan.guards.map((g) => g.line));
  const own = statements.filter((s) => !guardLines.has(s.lineStart) && u.abap.some((r) => s.lineStart >= r.lineStart && s.lineStart <= r.lineEnd));
  return u.bodyCalls.map((id) => {
    const g = plan.guards.find((x) => x.id === id)!;
    const literals = g.literals.filter((lit) => !own.some((s) => usesLiteral(s.text, lit)));
    return { id, helper: track === 'node' ? g.helper : `when_${g.id.replace('-', '').toLowerCase()}`, line: g.line, op: g.op, literals };
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

/**
 * The value of each constant the original declares with a literal (`CONSTANTS c_home TYPE waers VALUE 'EUR'`),
 * lower case name → `{ text, quoted }`; `abap_true` is `X`, `abap_false` and `space` are empty.
 */
export function constantValuesOf(statements: readonly AbapStatement[]): Map<string, { text: string; quoted: boolean }> {
  const out = new Map<string, { text: string; quoted: boolean }>();
  for (const st of statements) {
    if (st.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s*:?\s*([\w/]+)\b.*?\bVALUE\s+('(?:[^']|'')*'|`[^`]*`|-?\d+(?:\.\d+)?|abap_true|abap_false|space)\s*\.?\s*$/i.exec(st.text);
    if (!m) continue;
    const literal = literalOf(m[2]);
    if (literal) out.set(m[1].toLowerCase(), literal);
  }
  return out;
}

/** An ABAP literal as text: `'EUR'` (quoted), `100`, `abap_true` (`X`); null for anything else. */
function literalOf(token: string): { text: string; quoted: boolean } | null {
  if (/^'(?:[^']|'')*'$/.test(token)) return { text: token.slice(1, -1).replace(/''/g, "'"), quoted: true };
  if (/^`[^`]*`$/.test(token)) return { text: token.slice(1, -1), quoted: true };
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return { text: token, quoted: false };
  if (/^abap_true$/i.test(token)) return { text: 'X', quoted: true };
  if (/^(?:abap_false|space)$/i.test(token)) return { text: '', quoted: true };
  return null;
}

const JS_OPS: Readonly<Record<string, string>> = { '=': '===', '<>': '!==', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };
const ABAP_OPS: Readonly<Record<string, string>> = { '=': '=', EQ: '=', '<>': '<>', NE: '<>', '<': '<', LT: '<', '>': '>', GT: '>', '<=': '<=', LE: '<=', '>=': '>=', GE: '>=' };

/**
 * The predicate of a check, written by the engine where the original's condition decides it from a value the
 * engine hands in and its declared type (3.0.17 criterion 3: the model inverted `CHECK cs_result-status IS
 * INITIAL` into `!== ''`, and a delivery already NO_QUOTE came out REVIEW). One comparison or an `IS [NOT]
 * INITIAL`/`BOUND`/`ASSIGNED` on one of the check's `values`, against a literal or a constant of the source,
 * with ABAP's initial value per type: text blank, a number 0, a packed number zero, a date `00000000`, a NUMC all
 * zeros. Null — the model writes it in a fill region — for anything else (AND/OR, NOT, a second variable, a type
 * whose comparison the port cannot reproduce exactly), and for a type the engine has not resolved to a supported
 * scalar (QA finding 95f6ea84e8af): a dictionary type is only known by its fixed domain (`char10`, `numc4`, `datum`,
 * `abap_bool` …, `FIXED_DOMAINS`), a generic or unread type not at all — a dictionary date is initial at '00000000',
 * a dictionary amount at 0, and neither is text.
 */
/**
 * Dictionary types whose domain is fixed and known without the dictionary (QA finding 95f6ea84e8af): the generic
 * CHARnn/NUMCnn elements, ABAP_BOOL and its kin, and the date, time and period elements every system has. Any other
 * dictionary type keeps its predicate a fill region.
 */
const FIXED_DOMAINS: Readonly<Record<string, { type: 'c' | 'n' | 'd' | 't'; length?: number }>> = {
  abap_bool: { type: 'c', length: 1 },
  boole_d: { type: 'c', length: 1 },
  xfeld: { type: 'c', length: 1 },
  flag: { type: 'c', length: 1 },
  dats: { type: 'd' },
  datum: { type: 'd' },
  sydatum: { type: 'd' },
  budat: { type: 'd' },
  bldat: { type: 'd' },
  erdat: { type: 'd' },
  tims: { type: 't' },
  uzeit: { type: 't' },
  syuzeit: { type: 't' },
  gjahr: { type: 'n', length: 4 },
  monat: { type: 'n', length: 2 },
  poper: { type: 'n', length: 3 },
  posnr: { type: 'n', length: 6 },
};

/** The fixed domain of a dictionary type (`char10` → C 10, `numc4` → N 4, `datum` → D), or undefined. */
function fixedDomainOf(type: string): { type: 'c' | 'n' | 'd' | 't'; length?: number } | undefined {
  if (Object.prototype.hasOwnProperty.call(FIXED_DOMAINS, type)) return FIXED_DOMAINS[type];
  const m = /^(char|numc)(\d{1,3})$/.exec(type);
  return m ? { type: m[1] === 'char' ? 'c' : 'n', length: Number(m[2]) } : undefined;
}

type PredicateKind = 'number' | 'decimal' | 'char' | 'string' | 'numc' | 'date' | 'time' | 'table';

/**
 * The kind of a value the engine writes a predicate on, from its TypeScript type in the port and the ABAP scalar
 * behind it; null where the type is not resolved to one the engine supports — a dictionary type outside
 * `FIXED_DOMAINS`, a generic type (`TYPE any`), a reference, a structure, a type no declaration of the source names.
 */
function predicateKindOf(ts: string | null, scalar: AbapScalar | null): PredicateKind | null {
  if (ts === 'number') return 'number';
  if (ts !== null && ts.endsWith('[]') && ts !== 'unknown[]') return 'table';
  if (ts !== 'string' || !scalar) return null;
  const type = scalar.dictionary ? fixedDomainOf(scalar.type)?.type : scalar.type;
  if (!type) return null;
  if (['p', 'f', 'decfloat16', 'decfloat34', 'int8'].includes(type)) return 'decimal';
  if (type === 'c') return 'char';
  if (type === 'string' || type === 'xstring') return 'string';
  if (type === 'n') return 'numc';
  if (type === 'd') return 'date';
  if (type === 't') return 'time';
  return null;
}

/**
 * The type a check reads, in words, for the fill request where its predicate stays the model's (QA finding
 * 95f6ea84e8af): `cs_x-amount: TYPE wrbtr (dictionary type: its domain is not in the source)`.
 */
export function declaredTypeWords(g: Pick<PlanGuard, 'line' | 'basis' | 'operands' | 'unitId' | 'condition'>, plan: Pick<UnitPlan, 'units'>, shapes: AbapShapes): string[] {
  return nodeGuardOperands(g as PlanGuard, plan, shapes).map((o) => {
    const scalar = shapes.scalarOf(o.name, g.line);
    const ts = shapes.typeOf(o.name, g.line);
    if (scalar && /^(?:any|data|simple|clike|csequence|numeric|xsequence|object)$/.test(scalar.type)) return `${o.name}: TYPE ${scalar.type} (generic: the type of what the caller hands in)`;
    if (scalar?.dictionary) return `${o.name}: TYPE ${scalar.type} (dictionary type: its domain is not in the source)`;
    if (scalar) return `${o.name}: TYPE ${scalar.type}${scalar.length ? ` LENGTH ${scalar.length}` : ''}${scalar.decimals ? ` DECIMALS ${scalar.decimals}` : ''}`;
    return `${o.name}: ${ts && ts !== 'unknown' ? `${ts} in the port` : 'type not declared in the source'}`;
  });
}

export function enginePredicateOf(
  g: Pick<PlanGuard, 'condition' | 'line' | 'basis' | 'operands' | 'unitId'>,
  plan: Pick<UnitPlan, 'units'>,
  shapes: AbapShapes,
  constants: ReadonlyMap<string, { text: string; quoted: boolean }>,
): string[] | null {
  const condition = g.condition.trim();
  if (condition.includes('…')) return null;
  const operands = nodeGuardOperands(g as PlanGuard, plan, shapes);
  const SUBJECT = String.raw`(<?[\w/~]+>?(?:-[\w/~]+)*)`;
  const unary = new RegExp(String.raw`^${SUBJECT}\s+IS\s+(NOT\s+)?(INITIAL|BOUND|ASSIGNED)$`, 'i').exec(condition);
  const binary = new RegExp(String.raw`^${SUBJECT}\s*(>=|<=|<>|=|>|<|\bGE\b|\bLE\b|\bNE\b|\bEQ\b|\bGT\b|\bLT\b)\s*('(?:[^']|'')*'|\x60[^\x60]*\x60|-?\d+(?:\.\d+)?|[\w/~]+)$`, 'i').exec(condition);
  const subject = (unary ?? binary)?.[1].toLowerCase();
  const operand = subject ? operands.find((o) => o.name === subject) : undefined;
  if (!subject || !operand) return null;
  const v = `values.${operand.key}`;
  const ts = shapes.typeOf(subject, g.line);
  const scalar = shapes.scalarOf(subject, g.line);
  const kind = predicateKindOf(ts, scalar);
  if (!kind) return null;
  const domain = scalar?.dictionary ? fixedDomainOf(scalar.type) : undefined;
  const typeWord =
    kind === 'table'
      ? 'an internal table'
      : domain
        ? `dictionary type ${scalar!.type}, domain ${domain.type.toUpperCase()}${domain.length ? ` ${domain.length}` : ''}`
        : `${subject.startsWith('sy-') ? 'a system field, ' : 'declared '}${scalar ? `TYPE ${scalar.type}${scalar.length ? ` LENGTH ${scalar.length}` : ''}${scalar.decimals ? ` DECIMALS ${scalar.decimals}` : ''}` : 'as a whole number'}`;
  const head = `// Written by Clean-Core.io (engine), not a model: the original's condition at L${g.line}, ${condition.replace(/\*\//g, '* /')}, on ${subject} (${typeWord}).`;

  if (unary) {
    const not = Boolean(unary[2]);
    const test = unary[3].toUpperCase();
    let expr: string;
    let note: string;
    // A reference or a field symbol has no type the engine resolves: BOUND and ASSIGNED stay the model's.
    if (test !== 'INITIAL') return null;
    switch (kind) {
      case 'number':
        expr = `${v} === 0`;
        note = 'A whole number is initial at 0.';
        break;
      case 'decimal':
        expr = `${v}.trim() === '' || dec.isZero(${v})`;
        note = 'A packed number is initial at zero, at any places.';
        break;
      case 'char':
        expr = `/^ *$/.test(${v})`;
        note = 'A character field is initial when it holds only blanks.';
        break;
      case 'string':
        expr = `${v} === ''`;
        note = 'A string is initial when it is empty.';
        break;
      case 'numc':
        expr = `/^[0 ]*$/.test(${v})`;
        note = 'A numeric text (NUMC) is initial when it holds only zeros.';
        break;
      case 'date':
        expr = `${v}.trim() === '' || ${v} === '00000000'`;
        note = "A date is initial at '00000000'.";
        break;
      case 'time':
        expr = `${v}.trim() === '' || ${v} === '000000'`;
        note = "A time is initial at '000000'.";
        break;
      default:
        expr = `${v}.length === 0`;
        note = 'An internal table is initial when it has no rows.';
    }
    return [head, `// ${note}`, `return ${not ? `!(${expr})` : expr};`];
  }

  const op = ABAP_OPS[binary![2].toUpperCase()];
  const rhsToken = binary![3];
  const rhs = literalOf(rhsToken) ?? constants.get(rhsToken.toLowerCase()) ?? null;
  if (!op || !rhs) return null;
  const via = literalOf(rhsToken) ? '' : ` ${rhsToken.toLowerCase()} is the constant ${rhs.quoted ? `'${rhs.text}'` : rhs.text}.`;
  const js = JS_OPS[op];
  const lit = rhs.text;
  const equality = op === '=' || op === '<>';
  let expr: string | null = null;
  let note = '';
  switch (kind) {
    case 'number':
      if (/^-?\d+$/.test(lit.trim())) {
        expr = `${v} ${js} ${Number(lit.trim())}`;
        note = 'A whole number, compared as a number.';
      }
      break;
    case 'decimal':
      if (/^-?\d+(?:\.\d+)?$/.test(lit.trim())) {
        expr = `dec.compare(${v}, ${q(lit.trim())}) ${js} 0`;
        note = 'A packed number, compared exactly as a decimal.';
      }
      break;
    case 'numc':
      if (/^\d+$/.test(lit.trim())) {
        expr = `dec.compare(${v}.trim() || '0', ${q(lit.trim())}) ${js} 0`;
        note = 'A numeric text (NUMC), compared by its value.';
      }
      break;
    case 'date':
    case 'time':
      if (rhs.quoted && new RegExp(`^\\d{${kind === 'date' ? 8 : 6}}$`).test(lit)) {
        const initial = kind === 'date' ? '00000000' : '000000';
        expr = `(${v}.trim() || '${initial}') ${js} ${q(lit)}`;
        note = `A ${kind}, compared digit by digit (initial is '${initial}').`;
      }
      break;
    case 'char':
    case 'string':
      // A character comparison ignores trailing blanks; an order between texts is the model's.
      if (equality && rhs.quoted) {
        expr = `${v}.replace(/ +$/, '') ${js} ${q(lit.replace(/ +$/, ''))}`;
        note = 'Compared as text, trailing blanks ignored, as ABAP compares character fields.';
      }
      break;
    default:
      break;
  }
  if (!expr) return null;
  return [head, `// ${note}${via}`, `return ${expr};`];
}

function guardsFile(
  plan: UnitPlan,
  shapes: AbapShapes,
  lists: readonly InputList[] = [],
  constants: ReadonlyMap<string, { text: string; quoted: boolean }> = new Map(),
  wired: ReadonlySet<string> = new Set(),
): Built {
  // The row a check reads (scaffold version 7): a row of the input list its subject belongs to, else a record.
  const rowTypeOf = (g: PlanGuard): string => {
    const list = listOfPath(subjectPath(plan, g.subject));
    return lists.find((l) => l.key === list)?.structure.tsName ?? 'Rec';
  };
  const rowTypes = [...new Set(plan.guards.filter((g) => g.carried).map(rowTypeOf).filter((t) => t !== 'Rec'))].sort();
  const carried = plan.guards.filter((g) => g.carried);
  const regions: Built['regions'] = [];
  const out: string[] = [];
  out.push('/**');
  out.push(" * The original's checks that refuse, stop or skip — one predicate and one wrapper each (rule 15).");
  out.push(' * The wrappers (name, rule id, line, effect) are written by Clean-Core.io (engine); each predicate');
  out.push(" * between fill markers says whether the original's condition holds, and is a model proposal; a predicate");
  out.push(' * with no fill markers is written by the engine from the condition and the declared type.');
  out.push(' * Every wrapper and predicate takes (sel, st, record, values): values holds what a derived check reads,');
  out.push(' * typed as the original declares it, and is empty ({}) for a check that reads only the input.');
  out.push(' */');
  out.push("import * as dec from './decimal.ts';");
  out.push("import { NotImplementedFill, Refusal } from './errors.ts';");
  out.push(`import type { ${[...new Set([...typeExportNames(plan, shapes), ...rowTypes])].join(', ')} } from './types.ts';`);
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
  out.push('/** A computed value a derived check reads whose declaration the engine could not read. */');
  out.push('export type GuardValue = string | number | boolean | null;');
  out.push('/** The values of a check that reads only the input: none. */');
  out.push('export type NoValues = Record<never, never>;');
  for (const g of carried) {
    const pred = predicateName(g);
    const valuesType = guardValuesType(g, plan, shapes);
    if (valuesType) {
      // Each value typed as the original declares it where it checks (3.0.13, acceptance run 14.10.2026:
      // `GuardValue` everywhere, and a faithful `dec.compare(values.lvSum, '100')` did not compile). A routine's
      // parameter has the type of its argument (`argsInterface`), `unknown` where the FORM does not say.
      const raw = g.basis !== 'derived';
      out.push('');
      out.push(raw ? `/** The parameters of its routine ${g.helper} reads, handed in at the step's entry. */` : `/** The values ${g.helper} reads, computed by the step before L${g.line}. */`);
      const fields = nodeGuardOperands(g, plan, shapes).map((o) => `  /** ${o.name} */\n  ${o.key}: ${declaredType(shapes, o.name, g.line, raw ? 'unknown' : 'GuardValue')};`);
      out.push(`export interface ${valuesType} {\n${fields.join('\n')}\n}`);
    }
    // One signature for every check (3.0.13): (sel, st, record, values) — the prompt says so, and a body's
    // `guard_X(sel, st, null, {})` on a check with no values used to fail with "Expected 2-3 arguments, but got 4".
    const valuesParam = valuesType ? `, values: ${valuesType}` : ', values: NoValues = {}';
    const valuesArg = ', values';
    const rowType = rowTypeOf(g);
    const recordParam = valuesType ? `record: ${rowType} | null` : `record: ${rowType} | null = null`;
    const sig = `export function ${pred}(sel: Selection, st: RunState, ${recordParam}${valuesParam}): boolean`;
    const doc = guardDoc(g, plan);
    out.push('');
    out.push(doc);
    out.push(`${sig} {`);
    // The engine writes a CHECK's predicate where the condition and the declared type decide it (3.0.17 criterion 3):
    // a CHECK holds where the run goes on, the inverse of an IF guard, and the model inverted it. An IF guard's
    // predicate stays the model's for now — the reach measurement and the repair rounds are built on those regions.
    // The check on sy-subrc the frame runs with its AUTHORITY-CHECK (QA finding 8394df76b027) is engine-written too.
    const written = g.effect === 'check' || wired.has(g.id) ? enginePredicateOf(g, plan, shapes, constants) : null;
    if (written) {
      out.push(...written.map((l) => `  ${l}`));
    } else {
      out.push(regionText('node', g.regionId!, `${sig}\n${doc}`, '  ', `throw new NotImplementedFill(${sq(g.regionId!)}, ${sq(pred)});`));
      regions.push({ regionId: g.regionId!, available: ['dec.parse', 'dec.must', 'dec.compare', 'dec.isZero', 'dec.round', 'dec.add', 'dec.sub', 'dec.mul', 'dec.div', 'dec.fits'] });
    }
    out.push('}');
    // The wrapper: what the original does when the condition holds (IF) or fails (CHECK).
    const refuseWhen = g.effect === 'check' ? `!${pred}(sel, st, record${valuesArg})` : `${pred}(sel, st, record${valuesArg})`;
    const ruleWord = g.rule ?? `L${g.line}`;
    // What the original's CHECK does where it stands (3.0.17 criterion 3): at event level it ends the event block.
    const message = `${ruleWord}, L${g.line}: ${g.condition}${g.effect === 'check' ? ' does not hold' : ''} — ${g.ending}${g.effect === 'check' ? ' ends its event block' : ''}`;
    const field = subjectPath(plan, g.subject);
    if (g.outcome === 'refuses') {
      out.push(
        g.effect === 'check'
          ? `/** Refuses the input as the original does at L${g.line}: its CHECK stands at event level and ends the event block when the condition does not hold. */`
          : `/** Refuses the input as the original does at L${g.line}. */`,
      );
      out.push(`export function ${g.helper}(sel: Selection, st: RunState, ${recordParam}${valuesParam}): Refusal | null {`);
      out.push(`  return ${refuseWhen} ? new Refusal([{ field: ${field ? q(field) : 'null'}, rule: ${q(ruleWord)}, message: ${q(message.slice(0, 300))} }]) : null;`);
      out.push('}');
    } else {
      const verb = g.outcome === 'skips' ? 'Skips the record' : 'Ends the step early';
      const said = g.condition.replace(/\*\//g, '* /');
      // A CHECK never refuses inside a routine: it leaves the routine, or the loop's pass (3.0.17 criterion 3).
      out.push(
        g.effect !== 'check'
          ? `/** ${verb} as the original does at L${g.line} (${g.ending}). */`
          : g.outcome === 'skips'
            ? `/** Skips the record as the original's CHECK does at L${g.line} inside a loop: true when ${said} does not hold — the loop goes on with its next pass, no refusal. */`
            : `/** Leaves the routine as the original's CHECK does at L${g.line}: true when ${said} does not hold — the step returns and the run goes on, no refusal. */`,
      );
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
  return { file: { path: 'srv/lib/guards.ts', content: out.join('\n'), owner: regions.length > 0 ? 'fill' : 'engine' }, regions };
}

/* ----------------------------------------------------------------- steps */

function argsInterface(u: Unit, shapes: AbapShapes): string | null {
  if (u.parameters.length === 0 || u.part) return null;
  const name = `${u.fn[0].toUpperCase()}${u.fn.slice(1)}Args`;
  // Typed as the FORM declares each parameter (3.0.13, acceptance run 14.10.2026: every argument was `unknown`,
  // and a faithful `dec.compare(args.ivNum, '0')` did not compile); `unknown` only where the FORM says nothing.
  const at = u.abap[0]?.lineStart ?? 0;
  const members = u.parameters.map((p) => {
    const key = camelName(p.name);
    const declared = shapes.typeOf(p.name, at);
    const of = declared ?? (p.direction === 'tables' ? 'unknown[]' : 'unknown');
    const row = p.direction === 'tables' && !/\[\]$|^Array</.test(of) ? 'unknown[]' : of;
    const type = p.direction === 'changing' ? `{ value: ${of} }` : p.direction === 'tables' ? row : of;
    return `  /** ${p.name.toUpperCase()} (${p.direction.toUpperCase()}). */\n  ${key}: ${type};`;
  });
  return `export interface ${name} {\n${members.join('\n')}\n}`;
}

function unitDoc(u: Unit, plan: UnitPlan, auth: readonly AuthorityEntry[] = [], reads: readonly LookupEntry[] = []): string {
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
    ...authorityDocLines(auth),
    ...lookupDocLines(reads),
    ` * Unit ${u.id}: the frame is written by Clean-Core.io (engine); the body between the markers is a model proposal.`,
    ' */',
  ].join('\n');
}

/** Statements that declare and do nothing, before a check the frame may run at the step's entry. */
const DECLARING_KEYWORDS = new Set(['DATA', 'TYPES', 'CONSTANTS', 'FIELD-SYMBOLS', 'STATICS', 'TABLES', 'FORM', 'METHOD', 'FUNCTION', 'MODULE']);
const CONTAINER_BLOCKS = new Set(['form', 'method', 'module', 'class', 'interface', 'define']);

/**
 * The AUTHORITY-CHECKs whose whole sequence the frame runs (QA finding 8394df76b027): the check the engine wrote
 * (`fn`), standing at the top level of the routine with nothing before it but declarations and checks the frame runs
 * already, and directly followed by the derived check on its sy-subrc — an IF whose only statement ends the flow
 * (`IF sy-subrc <> 0. MESSAGE … TYPE 'E'.`, RETURN, EXIT) and whose guard refuses or stops. Every other check stays
 * the body's, with the body checks on its answer (`authorityRefusals`, markers.ts).
 */
export function wireAuthority(u: Unit, plan: Pick<UnitPlan, 'guards'>, facts: Pick<EngineFacts, 'statements' | 'blocks'>, entries: readonly AuthorityEntry[]): AuthorityEntry[] {
  if (u.kind === 'orchestrator' || u.part || entries.length === 0) return [...entries];
  const { statements, blocks } = facts;
  const topLevel = (i: number) => (blocks.enclosing[i] ?? []).every((b) => CONTAINER_BLOCKS.has(b.kind));
  const ifBlockOf = (i: number) => blocks.blocks.find((b) => b.kind === 'if' && b.openIndex === i) ?? null;
  const entryLines = new Set(u.guardCalls.map((id) => plan.guards.find((g) => g.id === id)?.line).filter((l): l is number => l !== undefined));
  const wiredLines = new Set<number>();
  return entries.map((e) => {
    if (!e.fn) return e;
    const at = statements.flatMap((s, i) => (s.keyword === 'AUTHORITY-CHECK' && s.lineStart === e.line ? [i] : []));
    if (at.length !== 1 || !topLevel(at[0])) return e;
    const i = at[0];
    const next = statements[i + 1];
    const g = next && next.keyword === 'IF' && topLevel(i + 1) ? plan.guards.find((x) => x.line === next.lineStart && x.carried && x.unitId === u.id) : undefined;
    if (!g || g.placement !== 'body' || (g.outcome !== 'refuses' && g.outcome !== 'stops')) return e;
    if (g.operands.length !== 1 || g.operands[0].name !== 'sy-subrc' || operandsOf(g.condition).join(',') !== 'sy-subrc') return e;
    // The IF holds the ending alone: no ELSE, nothing the guard would skip.
    const block = ifBlockOf(i + 1);
    if (!block || block.closeIndex !== i + 3 || statements[i + 2].lineStart !== g.endingLine || statements[i + 3].keyword !== 'ENDIF') return e;
    // Nothing before it in the routine that the frame does not run first.
    const container = blocks.blocks
      .filter((b) => (b.kind === 'form' || b.kind === 'method') && b.openIndex < i && b.closeIndex > i)
      .sort((a, b) => b.openIndex - a.openIndex)[0];
    if (!container) return e;
    for (let k = container.openIndex + 1; k < i; k++) {
      const s = statements[k];
      if (!topLevel(k)) continue;
      if (DECLARING_KEYWORDS.has(s.keyword) || s.keyword === 'ENDIF') continue;
      if (entryLines.has(s.lineStart) || wiredLines.has(s.lineStart)) continue;
      return e;
    }
    wiredLines.add(e.line);
    wiredLines.add(g.line);
    return { ...e, wired: { guard: g.id, helper: g.helper } };
  });
}

/**
 * How the original handles each check's sy-subrc (QA finding 9bdd914427a5): `ends: 'loop'` where the statement right
 * after the check is the derived check on sy-subrc and it skips the pass (CONTINUE, a CHECK in the loop) or leaves
 * the loop (EXIT inside a loop). Anything else — a refusal, a RETURN, an EXIT outside a loop, or no derived check
 * there — keeps the strict reading: the body's path must end with return or throw.
 */
export function authorityEndings(u: Unit, plan: Pick<UnitPlan, 'guards'>, facts: Pick<EngineFacts, 'statements' | 'blocks'>, entries: readonly AuthorityEntry[]): AuthorityEntry[] {
  const { statements, blocks } = facts;
  const LOOPS = new Set(['loop', 'do', 'while', 'select']);
  return entries.map((e) => {
    const at = statements.findIndex((s) => s.keyword === 'AUTHORITY-CHECK' && s.lineStart === e.line);
    const next = at >= 0 ? statements[at + 1] : undefined;
    if (!next || (next.keyword !== 'IF' && next.keyword !== 'CHECK')) return e;
    const g = plan.guards.find((x) => x.line === next.lineStart && x.carried && x.unitId === u.id && x.operands.some((o) => o.name === 'sy-subrc'));
    if (!g) return e;
    const inLoop = (blocks.enclosing[at + 1] ?? []).some((b) => LOOPS.has(b.kind));
    const loopLevel = g.outcome === 'skips' || (g.effect === 'exit' && inLoop);
    return loopLevel && inLoop ? { ...e, ends: 'loop' as const } : e;
  });
}

/** The frame's call of a wired AUTHORITY-CHECK and its derived check, at the step's entry. */
function wiredAuthorityLines(e: AuthorityEntry, plan: UnitPlan): string[] {
  const g = plan.guards.find((x) => x.id === e.wired!.guard)!;
  const answer = `sySubrc_L${e.line}${e.fn!.slice(`authority_L${e.line}`.length)}`;
  const call = `${g.helper}(sel, st, null, { ${g.operands[0].key}: ${answer} })`;
  const v = g.id.replace('-', '').toLowerCase();
  return [
    `  // The AUTHORITY-CHECK at L${e.line} and its check on sy-subrc at L${g.line}, run by the frame (engine): the body writes neither.`,
    `  const ${answer} = ${e.fn}();`,
    ...(g.outcome === 'refuses' ? [`  const ${v} = checked(st, () => ${call});`, `  if (${v}) return ${v};`] : [`  if (checked(st, () => ${call})) return;`]),
  ];
}

function guardCallLines(u: Unit, plan: UnitPlan, shapes: AbapShapes, auth: readonly AuthorityEntry[] = []): string[] {
  // In the original's order: the raw checks and the AUTHORITY-CHECKs the frame runs whole.
  const calls: Array<{ line: number; lines: string[] }> = auth.filter((e) => e.wired).map((e) => ({ line: e.line, lines: wiredAuthorityLines(e, plan) }));
  for (const id of u.guardCalls) {
    const g = plan.guards.find((x) => x.id === id)!;
    const v = id.replace('-', '').toLowerCase();
    // The routine's parameters the check reads, from the step's own arguments (`nodeGuardOperands`).
    const handed = nodeGuardOperands(g, plan, shapes).map((o) => {
      const [base, ...components] = o.name.split('-');
      const p = u.parameters.find((x) => x.name.toLowerCase() === base);
      const arg = `args.${camelName(base)}${p?.direction === 'changing' ? '.value' : ''}`;
      return `${o.key}: ${[arg, ...components.map(camelName)].join('.')}`;
    });
    const call = `${g.helper}(sel, st, null${handed.length ? `, { ${handed.join(', ')} }` : ''})`;
    calls.push({ line: g.line, lines: g.outcome === 'refuses' ? [`  const ${v} = checked(st, () => ${call});`, `  if (${v}) return ${v};`] : [`  if (checked(st, () => ${call})) return;`] });
  }
  return calls.sort((a, b) => a.line - b.line).flatMap((c) => c.lines);
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

function stepFile(u: Unit, plan: UnitPlan, shapes: AbapShapes, auth: readonly AuthorityEntry[] = [], reads: readonly LookupEntry[] = []): Built {
  const libDir = u.file.startsWith('srv/steps/') ? '../lib/' : './lib/';
  const callees = u.callees.map((id) => plan.units.find((x) => x.id === id)!).filter(Boolean);
  const out: string[] = [];
  out.push(`// ${u.id} ${u.title} — generated by Clean-Core.io (engine). Fill regions: between the fill markers.`);
  out.push(`import * as csv from '${libDir}csv.ts';`);
  out.push(`import * as dec from '${libDir}decimal.ts';`);
  out.push(`import { NotImplementedFill, Refusal } from '${libDir}errors.ts';`);
  out.push(`import { ${guardImports(u, plan).join(', ')} } from '${libDir}guards.ts';`);
  // The original's AUTHORITY-CHECKs in these lines (scaffold version 15): computed in the frame, never by the model.
  if (auth.length > 0) out.push(`import { authority_check } from '${libDir}authority.ts';`);
  // The original's reads in these lines (scaffold version 15): answered from the request's lookup lists.
  out.push(...lookupImport(reads, libDir));
  out.push(`import { DECIMALS } from '${libDir}types.ts';`);
  out.push(`import type { ${typeExportNames(plan, shapes).join(', ')} } from '${libDir}types.ts';`);
  for (const c of callees) {
    const rel = u.file.startsWith('srv/steps/') ? `./${c.file.replace('srv/steps/', '')}` : `./${c.file.replace('srv/', '')}`;
    out.push(`import { ${c.fn} } from '${rel}';`);
  }
  out.push('');
  const args = argsInterface(u, shapes);
  if (args) {
    out.push(args);
    out.push('');
  }
  const doc = unitDoc(u, plan, auth, reads);
  // The frame's functions first, then the checks it runs at the entry in the original's order — an AUTHORITY-CHECK
  // the frame runs whole calls its function (QA finding 8394df76b027).
  const guardLines = [...authorityFrameLines(auth), ...lookupFrameLines(reads), ...guardCallLines(u, plan, shapes, auth)];
  out.push(doc);
  out.push(`${u.signature} {`);
  out.push(...guardLines);
  out.push(regionText('node', u.id, `${u.signature}\n${guardLines.join('\n')}\n${doc}`, '  ', `throw new NotImplementedFill(${sq(u.id)}, ${sq(u.fn)});`));
  out.push('}');
  out.push('');
  const available = [
    ...NODE_HELPERS,
    ...callees.map((c) => c.fn),
    ...guardImports(u, plan).filter((n) => n !== 'checked'),
    'DECIMALS',
    ...auth.flatMap((e) => (e.fn && !e.wired ? [e.fn] : [])),
    ...(auth.some((e) => e.fn === null) ? ['authority_check'] : []),
    ...lookupAvailable(reads),
  ];
  return { file: { path: u.file, content: out.join('\n'), owner: 'fill' }, regions: [{ regionId: u.id, available }] };
}

/** The parent of a split routine: engine-written, calls its parts in order with one shared local state. */
function splitParentFile(u: Unit, parts: Unit[], plan: UnitPlan, shapes: AbapShapes): ScaffoldFile {
  const out: string[] = [];
  out.push(`// ${u.id} ${u.title} — split into parts (above the hard budget or the fill prompt's cap); generated by Clean-Core.io (engine).`);
  const guardNames = u.guardCalls.map((id) => plan.guards.find((g) => g.id === id)!.helper);
  if (guardNames.length > 0) out.push(`import { checked, ${guardNames.join(', ')} } from '../lib/guards.ts';`);
  out.push(`import type { ${typeExportNames(plan, shapes).join(', ')} } from '../lib/types.ts';`);
  for (const p of parts) out.push(`import { ${p.fn} } from './${p.file.replace('srv/steps/', '')}';`);
  out.push('');
  const args = argsInterface(u, shapes);
  if (args) out.push(args, '');
  out.push(unitDoc(u, plan));
  out.push(`${u.signature} {`);
  out.push(...guardCallLines(u, plan, shapes));
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

function processFile(plan: UnitPlan, facts: EngineFacts, shapes: AbapShapes, auth: readonly AuthorityEntry[] = [], reads: readonly LookupEntry[] = []): Built {
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
  if (auth.length > 0) out.push("import { authority_check } from './lib/authority.ts';");
  out.push(...lookupImport(reads, './lib/'));
  out.push("import { initialLocals } from './lib/types.ts';");
  out.push(`import type { ${typeExportNames(plan, shapes).join(', ')} } from './lib/types.ts';`);
  for (const s of steps) out.push(`import { ${s.fn} } from './${s.file.replace('srv/', '')}';`);
  out.push('');
  const doc = [
    unitDoc(orch, plan, auth, reads).replace(/ \*\/$/, ''),
    ' * Reading order of the original (engine):',
    ...(reading.length ? reading : [' *   (no PERFORM at program level)']),
    ' */',
  ].join('\n');
  const guardLines = [...guardCallLines(orch, plan, shapes), ...authorityFrameLines(auth), ...lookupFrameLines(reads)];
  out.push(doc);
  out.push(`${orch.signature} {`);
  out.push(...guardLines);
  if (orch.abap.length === 0) {
    // No entry point (scaffold 15): no event block, no module and no statement at program level, so the original runs
    // nothing when it is started. There is no line to port, and a model asked for the run order could only invent
    // one; the engine writes the body and says why (roadmap 3.0.17 item 6).
    out.push(...NO_ENTRY_POINT.map((l) => `  // ${l}`));
    out.push('  return;');
  } else {
    out.push(regionText('node', orch.id, `${orch.signature}\n${guardLines.join('\n')}\n${doc}`, '  ', `throw new NotImplementedFill(${sq(orch.id)}, ${sq(orch.fn)});`));
  }
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
  out.push('/**');
  out.push(' * One run: a fresh state, the selection checks, then runSteps. A stub is recorded, never hidden.');
  out.push(" * `seed`: globals the run starts with instead of their initial value — the original's demo tables (srv/fixtures.ts).");
  out.push(' */');
  out.push('export function runProcess(sel: Selection, records: Rec[], seed: Partial<Locals> = {}): ProcessOutcome {');
  out.push('  const st: RunState = { selection: sel, records: records.slice(), rows: [], result: {}, issues: [], notFilled: [], local: { ...initialLocals(), ...seed } };');
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
  const available = [
    ...NODE_HELPERS,
    ...steps.map((s) => s.fn),
    ...guardImports(orch, plan).filter((n) => n !== 'checked'),
    ...auth.flatMap((e) => (e.fn && !e.wired ? [e.fn] : [])),
    ...(auth.some((e) => e.fn === null) ? ['authority_check'] : []),
    ...lookupAvailable(reads),
  ];
  return { file: { path: 'srv/process.ts', content: out.join('\n'), owner: 'fill' }, regions: [{ regionId: orch.id, available }] };
}

const SIMULATE_TS = String.raw`/**
 * One simulation: validate, run the process, store the run under a fresh id.
 * Shared by the HTTP app and the call contract. Written by Clean-Core.io (engine).
 */
import { inputRowsOf, seedOf, splitRequest, validateRequest, type InputError } from './lib/input-contract.ts';
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
  /** Input records and input-list rows in the result (a skipping check removes one). */
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
  const { selection, records, inputs } = splitRequest(v.normalized);
  const outcome = runProcess(selection, records, seedOf(inputs));
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
    records: st.records.length + inputRowsOf(st.local),
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
// The core's own HTTP app (npm run core). cds watch under tsx reads this file as a custom server.ts: it exports
// nothing, so CAP starts its own server and serves srv/service.cds.
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

function engineContractFile(plan: UnitPlan, lists: readonly InputList[], statements: readonly AbapStatement[], shapes: AbapShapes): string {
  const model = contractModel(plan);
  // A work area the original reads an input table's rows into (LOOP AT gt_raw INTO ls_raw) names that list's
  // columns: LS_RAW-KNOWN_AT is raw[].knownAt, not the first structure's KNOWN_AT (scaffold version 7).
  for (const [area, list] of workAreasOf(statements, lists)) {
    for (const c of list.columns) {
      const name = `${area}-${c.name.toUpperCase()}`;
      if (!(name in model.fields)) model.fields[name] = `${list.key}[].${c.key}`;
    }
  }
  return [
    '/**',
    ' * The call contract (code-draft rule 24): the engine cases run against these exports without a',
    " * model-written assertion; `check` asks one check's predicate directly. No server, no I/O on import.",
    ' * Written by Clean-Core.io (engine).',
    ' */',
    "import * as dec from './lib/decimal.ts';",
    "import { NotImplementedFill } from './lib/errors.ts';",
    "import * as guards from './lib/guards.ts';",
    "import { LIST_GLOBALS, seedOf, splitRequest, validateRequest, type InputError } from './lib/input-contract.ts';",
    "import { createRunStore } from './lib/run-store.ts';",
    "import { DECIMALS, initialLocals, type Locals, type Request, type Selection } from './lib/types.ts';",
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
    '  const absent = MISSING_BASE.filter((m) => {',
    "    const key = m.path.slice(m.path.lastIndexOf('.') + 1);",
    "    const at = m.path.indexOf('[]');",
    '    const list = at > 0 ? r[m.path.slice(0, at)] : undefined;',
    '    const holder = at > 0 ? (Array.isArray(list) ? (list[0] as Record<string, unknown> | undefined) : undefined) : r;',
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
    ...checkExport(plan, lists, shapes),
  ].join('\n');
}

/**
 * `check(guard, request, values)` (3.0.12, owner 13.10.2026): whether the predicate of one carried check
 * holds — the request validated as `validate` does, a fresh run state, the computed values a derived check
 * reads handed in by original name. A value is handed in only in a form the port fixes: a system field
 * (`SY-SUBRC`) as a number, a declared decimal as a decimal string at its places; any other computed value
 * is `unsupported` and the case is not run. A predicate still a stub answers `notFilled`.
 */
function checkExport(plan: UnitPlan, lists: readonly InputList[], shapes: AbapShapes): string[] {
  const listTables = new Set(lists.map((l) => l.global.name.toUpperCase()));
  const decimals = new Set(plan.decimals.map((d) => d.name.toUpperCase()));
  const recordTable = plan.fields.some((f) => f.where === 'record');
  const fieldNames = new Set(plan.fields.map((f) => f.original));
  type CheckSpec = { predicate: string; record: boolean; list: string | null; table: string | null; operands: Array<{ name: string; key: string; form: 'number' | 'decimal' | 'text' | null }> };
  const table: Record<string, CheckSpec> = {};
  for (const g of plan.guards) {
    if (!g.carried || !g.regionId) continue;
    const subject = g.subject ? g.subject.toUpperCase() : null;
    // `gt_rcv IS INITIAL` on the table the records stand for: the check is asked with no records.
    const isTable = Boolean(subject && /\bIS\s+(?:NOT\s+)?INITIAL\s*$/i.test(g.condition) && (listTables.has(subject) || (recordTable && !subject.includes('-') && !fieldNames.has(subject))));
    table[g.id] = {
      predicate: predicateName(g),
      record: g.outcome === 'skips',
      list: lists.find((l) => l.key === listOfPath(subjectPath(plan, g.subject)))?.global.key ?? null,
      table: isTable ? subject : null,
      operands: nodeGuardOperands(g, plan, shapes).map((o) => {
        const name = o.name.toUpperCase();
        const comp = name.includes('-') ? name.slice(name.lastIndexOf('-') + 1) : name;
        // A system field as the guard's values type it (abap-shapes.ts): a count or return code a number, sy-datum text.
        const sy = name.startsWith('SY-') ? (NUMERIC_SYSTEM_FIELDS.has(comp.toLowerCase()) ? 'number' : 'text') : null;
        // A whole number as the values type it (3.0.14 item 1: `lv_count TYPE i` was not handed in, its case not run).
        const whole = shapes.typeOf(o.name, g.line) === 'number' ? 'number' : null;
        return { name, key: o.key, form: sy ?? whole ?? (decimals.has(name) || decimals.has(comp) ? 'decimal' : null) };
      }),
    };
  }
  return [
    '/** The carried checks: the predicate, whether it reads a record, the record table it tests, the values it reads. */',
    `const CHECKS: Record<string, { predicate: string; record: boolean; list: string | null; table: string | null; operands: Array<{ name: string; key: string; form: 'number' | 'decimal' | 'text' | null }> }> = ${JSON.stringify(table, null, 2)};`,
    '',
    "/** Does the predicate of the original's check `guard` (`G-0061`) hold on this request? `values`: the computed values it reads, by original name. */",
    'export function check(guard: string, request: unknown, values: Record<string, unknown> = {}) {',
    '  const spec = CHECKS[String(guard)];',
    '  if (!spec) return { ok: false, known: false, errors: [] as InputError[] };',
    '  requireBaseValues(request);',
    '  const v = validateRequest(request);',
    '  if (!v.ok || !v.normalized) return { ok: false, errors: v.errors };',
    '  const { selection, records, inputs } = splitRequest(v.normalized);',
    '  const given = (values ?? {}) as Record<string, unknown>;',
    '  const asked = spec.table !== null ? given[spec.table] : undefined;',
    "  const empty = typeof asked === 'object' && asked !== null && (asked as { special?: unknown }).special === 'empty';",
    '  // The table the check tests, asked empty: an input list empties its own table, otherwise the record list.',
    '  const emptyList = empty && spec.table !== null ? LIST_GLOBALS[spec.table] : undefined;',
    '  const local = { ...initialLocals(), ...seedOf(inputs), ...(emptyList ? { [emptyList]: [] } : {}) } as Locals;',
    '  const st = { selection, records: empty && !emptyList ? [] : records.slice(), rows: [], result: {}, issues: [], notFilled: [] as string[], local };',
    '  const missingValues = spec.operands.filter((o) => !(o.name in given)).map((o) => o.name);',
    '  if (missingValues.length > 0) return { ok: false, missingValues, errors: [] as InputError[] };',
    '  const unsupported = spec.operands.filter((o) => o.form === null).map((o) => o.name);',
    '  if (unsupported.length > 0) return { ok: false, unsupported, errors: [] as InputError[] };',
    '  const handed: Record<string, unknown> = {};',
    '  for (const o of spec.operands) {',
    '    const raw = String(given[o.name]);',
    "    const decimal = DECIMALS[o.name] ?? DECIMALS[o.name.slice(o.name.lastIndexOf('-') + 1)];",
    "    handed[o.key] = o.form === 'number' ? Number(raw) : o.form === 'text' ? raw : decimal && dec.parse(raw) ? dec.round(raw, decimal.places) : raw;",
    '  }',
    '  // The row a skipping check reads: the first of its input list (scaffold version 7), else the first record.',
    '  const rows = spec.list !== null ? (local as unknown as Record<string, unknown[]>)[spec.list] : st.records;',
    '  const record = spec.record ? (rows[0] ?? null) : null;',
    '  const predicate = (guards as unknown as Record<string, (...args: unknown[]) => unknown>)[spec.predicate];',
    '  try {',
    '    return { ok: true, holds: predicate(selection, st, record, handed) === true };',
    '  } catch (err) {',
    '    if (err instanceof NotImplementedFill) return { ok: false, notFilled: true, errors: [] as InputError[] };',
    '    throw err;',
    '  }',
    '}',
    '',
  ];
}

const SHIMS_TS = String.raw`/**
 * Entry points for the acceptance harness's probes (acceptance-adapter.json):
 * thin calls into the package's own decimal and CSV code, so the probes test
 * the code the package runs — and, for the probes of the written functions
 * (display filter, recalculation, negative write), one run of the whole
 * process on the probe's request. A run that reaches a function still left as
 * a stub answers with nothing to judge, so the probe reads Not run.
 * Test-only; written by Clean-Core.io (engine).
 */
import { exportCsv } from '../srv/app.ts';
import * as csv from '../srv/lib/csv.ts';
import * as dec from '../srv/lib/decimal.ts';
import { CSV_DELIMITER, LIST_GLOBALS, seedOf, splitRequest, validateRequest } from '../srv/lib/input-contract.ts';
import { createRunStore } from '../srv/lib/run-store.ts';
import type { RunState, Selection } from '../srv/lib/types.ts';
import { runProcess } from '../srv/process.ts';
import { simulateRequest, type RunResult } from '../srv/simulate.ts';

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

type ProcessRun = { state: 'refused' } | { state: 'incomplete'; notFilled: string[] } | { state: 'complete'; st: RunState };

/** One run of the whole process on a request, through the one input contract — as simulate runs it. */
function processRun(request: unknown): ProcessRun {
  const v = validateRequest(request);
  if (!v.ok || !v.normalized) return { state: 'refused' };
  const { selection, records, inputs } = splitRequest(v.normalized);
  const outcome = runProcess(selection, records, seedOf(inputs));
  if (outcome.refusal) return { state: 'refused' };
  if (!outcome.complete) return { state: 'incomplete', notFilled: outcome.notFilled };
  return { state: 'complete', st: outcome.state };
}

const notFilledOf = (r: ProcessRun): string[] => (r.state === 'incomplete' ? r.notFilled : []);

/** The list a run shows (its rows); null when the run was refused or reached a stub. */
export function listOf(request: unknown): { rows: Array<Record<string, unknown>> | null; refused: boolean; notFilled: string[] } {
  const r = processRun(request);
  return { rows: r.state === 'complete' ? r.st.rows : null, refused: r.state === 'refused', notFilled: notFilledOf(r) };
}

/** The export of a run, as the app writes it; null when the run was refused or reached a stub. */
export function exportOf(request: unknown): { csv: string | null } {
  const a = simulateRequest(request, createRunStore<Selection, RunResult>());
  return { csv: a.ok && a.complete && a.run ? exportCsv(a.run) : null };
}

const numberOf = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : typeof raw === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : null;

/** The value of one record field after a run: as the list shows it, else as the record holds it; null when there is none. */
export function recalcOf(request: unknown, key: string): { value: number | null; notFilled: string[] } {
  const r = processRun(request);
  if (r.state !== 'complete') return { value: null, notFilled: notFilledOf(r) };
  const row = r.st.rows[0];
  const local = r.st.local as unknown as Record<string, unknown>;
  const firstRows = Object.values(LIST_GLOBALS).map((g) => (Array.isArray(local[g]) ? (local[g] as Array<Record<string, unknown>>)[0] : undefined));
  const record = [r.st.records[0] as unknown as Record<string, unknown> | undefined, ...firstRows].find((x) => x !== undefined && key in x);
  const raw = row && key in row ? row[key] : record ? record[key] : undefined;
  return { value: numberOf(raw), notFilled: [] };
}

/**
 * Was the write of this request refused or accepted? A run that reaches a stub throws instead: the probe's
 * control write then reads as not runnable, so a predicate still left as a stub is never judged.
 */
export function writeOf(request: unknown): { outcome: 'refused' | 'accepted' } {
  const r = processRun(request);
  if (r.state === 'incomplete') throw new Error('not judged: the run reached functions still left as stubs (' + r.notFilled.join(', ') + ')');
  return { outcome: r.state === 'refused' ? 'refused' : 'accepted' };
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
      // A case that did not run is no evidence (3.0.13, A5): said as such, never counted as passed.
      t.skip('NOT RUN - not evidence: ' + r.reason);
      return;
    }
    assert.equal(r.status, 'Passed', JSON.stringify(r.examples.filter((e) => e.status === 'fail')));
  });
}
`;

/* ----------------------------------------------------------------- misc */

// db/schema.cds, srv/service.cds and package.json: the CAP shell (cap-shell.ts, scaffold version 7).

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      // No DOM (3.0.13): its global `Range` stood in for the package's own when a step forgot the import.
      lib: ['ES2022'],
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
# It runs the core's HTTP app (srv/server.ts), which imports nothing beyond Node, on Node's type stripping;
# the CAP service (npm start: cds-serve, or mta.yaml on SAP BTP) needs the dependencies in package.json.
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

  const shapes = readAbapShapes(facts.statements, facts.blocks, typesReserved(plan));
  // One list per input structure (scaffold version 7): the plan as this package sees it moves each record field
  // whose structure has an input table into that table's list. The planner's own plan is unchanged.
  const originalDemo = options.originalDemo === undefined ? originalDemoCases(facts.source) : options.originalDemo;
  const lists = inputListsOf(plan, facts, shapes, new Set([...plan.fields.filter((f) => f.where === 'selection').map((f) => f.key), 'records', 'run']), originalDemo ? [originalDemo.switch.routine, originalDemo.baseline.routine] : []);
  plan = withListPaths(plan, lists);
  // The original's reads inside its steps (scaffold version 15, `lookups-node.ts`): one lookup list per SAP table,
  // after the input lists, in the request, the action and the run (st.local.db<Table>).
  const reads = lookupReadsOf(plan, facts.statements, new Set(lists.map((l) => l.global.name.toUpperCase())), shapes);
  const lookupLists = lookupListsOf(reads, {
    keys: new Set([...plan.fields.filter((f) => f.where === 'selection').map((f) => f.key), 'records', 'run', ...lists.map((l) => l.key)]),
    types: new Set([...typesReserved(plan), ...shapes.structures.map((s) => s.tsName)]),
    locals: new Set(shapes.globals.map((g) => g.key)),
    // The entities of the customer tables a writing program writes (`cap-shell.ts`) are taken as well.
    cds: new Set([...lists.flatMap((l) => [l.cds.type, l.cds.entity]), ...facts.graph.databaseWrites.map((w) => pascalName(w.table))]),
  });
  const allLists = [...lists, ...lookupLists];
  // The CAP shell around the core (scaffold version 7, `cap-shell.ts`): package.json, the data model, the service.
  const cap = capShellFiles({ plan, facts, lists: allLists, packageName: name });
  files.push({ path: 'package.json', content: cap.packageJson, owner: 'engine' });
  files.push({ path: 'tsconfig.json', content: TSCONFIG, owner: 'engine' });
  files.push({ path: 'srv/lib/errors.ts', content: ERRORS_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/decimal.ts', content: DECIMAL_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/csv.ts', content: CSV_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/run-store.ts', content: RUN_STORE_TS, owner: 'engine' });
  files.push({ path: 'srv/lib/types.ts', content: typesFile(plan, contextDigest, ruleRevisionOf(plan), shapes, allLists), owner: 'engine' });
  files.push({ path: 'srv/lib/input-contract.ts', content: inputContractFile(plan, allLists), owner: 'engine' });
  // The original's AUTHORITY-CHECKs (scaffold version 15, `authority-node.ts`): the seam fails closed, and each
  // function whose lines hold a check gets it written in its frame — with its check on sy-subrc where the frame can
  // run both at the step's entry (QA finding 8394df76b027, `wireAuthority`).
  const checks = facts.graph.authorityChecks;
  const authority: Record<string, AuthorityEntry[]> = {};
  for (const u of plan.units) {
    const entries = checks.length > 0 ? authorityEndings(u, plan, facts, wireAuthority(u, plan, facts, authorityEntriesOf(u, plan, checks, facts.statements))) : [];
    if (entries.length > 0) authority[u.id] = entries;
  }
  const wiredGuards = new Set(Object.values(authority).flatMap((es) => es.flatMap((e) => (e.wired ? [e.wired.guard] : []))));
  add(guardsFile(plan, shapes, lists, constantValuesOf(facts.statements), wiredGuards));
  if (checks.length > 0) files.push({ path: AUTHORITY_FILE, content: authorityFile(plan.program, checks), owner: 'engine' });
  const lookups: Record<string, LookupEntry[]> = {};
  for (const u of plan.units) {
    const entries = reads.length > 0 ? lookupEntriesOf(u, reads, lookupLists, plan, shapes, facts.statements) : [];
    if (entries.length > 0) lookups[u.id] = entries;
  }
  if (reads.length > 0) files.push({ path: LOOKUPS_FILE, content: lookupsFile(plan.program, reads, lookupLists), owner: 'engine' });
  for (const u of plan.units) {
    if (u.kind === 'orchestrator') continue;
    const parts = plan.units.filter((p) => p.part?.parent === u.id);
    if (parts.length > 0) files.push(splitParentFile(u, parts, plan, shapes));
    else add(stepFile(u, plan, shapes, authority[u.id], lookups[u.id]));
  }
  const orchestrator = plan.units.find((u) => u.kind === 'orchestrator');
  add(processFile(plan, facts, shapes, orchestrator ? authority[orchestrator.id] : [], orchestrator ? lookups[orchestrator.id] : []));
  files.push({ path: 'srv/simulate.ts', content: SIMULATE_TS, owner: 'engine' });
  files.push({ path: 'srv/app.ts', content: APP_TS, owner: 'engine' });
  files.push({ path: 'srv/server.ts', content: SERVER_TS, owner: 'engine' });
  files.push({ path: 'srv/engine-contract.ts', content: engineContractFile(plan, lists, facts.statements, shapes), owner: 'engine' });
  // The original's demo cases (3.0.13, A4): the golden master as data, a loader that runs one case through the
  // process with the case's tables as the run's globals, and a test that runs them all (`node-demo.ts`).
  files.push(...nodeDemoFiles(plan, shapes, originalDemo));
  files.push(...cap.files);
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
  const adapter = acceptanceAdapter(plan, { packageName: name, modules, delimiter: plan.csvDelimiter, fill: fillProbeConfigs(plan, facts) });
  files.push({ path: 'acceptance-adapter.json', content: `${JSON.stringify(adapter, null, 2)}\n`, owner: 'engine' });

  // traceability.json and TRACE.md are not part of the scaffold: they say who filled each function, so they
  // are written after the fills (`withTrace`, trace.ts) and stay outside the digest.
  for (const file of files) file.content = defuseMarkers(file.content);
  // Engine-written and before the digest: the regions are found in the files as they ship (B6).
  files.splice(0, files.length, ...withDraftHeader(files, options.against));
  // The ABAP types a predicate the model writes reads (QA finding 95f6ea84e8af).
  const regions = findRegions(files);
  const regionIds = new Set(regions.map((r) => r.regionId));
  const predicateTypes: Record<string, string[]> = {};
  for (const g of plan.guards) {
    if (!g.carried || !g.regionId || !regionIds.has(g.regionId)) continue;
    const words = declaredTypeWords(g, plan, shapes);
    if (words.length > 0) predicateTypes[g.id] = words;
  }
  const required: Record<string, RequiredGuard[]> = {};
  for (const u of plan.units) {
    // A check on sy-subrc the frame runs with its AUTHORITY-CHECK is no call the body must make.
    const bodyCalls = u.bodyCalls.filter((id) => !wiredGuards.has(id));
    if (bodyCalls.length > 0) required[u.id] = requiredGuardsOf({ ...u, bodyCalls }, plan, 'node', facts.statements);
  }
  return {
    track: 'node',
    version: SCAFFOLD_VERSION,
    files,
    units: plan.units,
    regions,
    digest: scaffoldDigest(files),
    adapter,
    notCarried: plan.notCarried,
    available,
    required,
    ...(Object.keys(authority).length > 0 ? { authority } : {}),
    ...(Object.keys(lookups).length > 0 ? { lookups } : {}),
    ...(Object.keys(predicateTypes).length > 0 ? { predicateTypes } : {}),
  };
}

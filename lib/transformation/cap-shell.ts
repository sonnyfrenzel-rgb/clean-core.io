/**
 * The CAP shell around the Node core (roadmap 3.0.13, "the side-by-side route becomes real CAP in two steps",
 * step 2; scaffold version 7). The core — `srv/lib/*`, `srv/steps/*`, `srv/process.ts`, `srv/simulate.ts` —
 * stays the tested unit: the engine cases, the probes and the original's demo cases run against it in the
 * sandbox, and nothing of it imports `@sap/cds`. Around it, every file here is written by the engine:
 *
 *   - `db/schema.cds` — one row type and one entity per input structure of the original (`input-lists.ts`),
 *     never a union of fields; types kept as declared (packed → `Decimal(p,s)`, `i` → `Integer`, `d` →
 *     `Date`, `n` → `String(len)`, a one-character field → `String(1)` with the values the original
 *     compares). A writing program adds one entity per customer table it writes.
 *   - `srv/service.cds` — the service. The architecture is the one the RAP route takes
 *     (`architecture.ts`): a read-only program gets an unbound action `simulate` whose parameters are the
 *     selection and the input lists and whose answer is the run; a writing program gets an action `runProcess`
 *     and its written customer tables as entities with exactly the operations the original performs. Never
 *     `run`: every `cds.Service` has a method `run`, and an action of that name shadows it (CAP warns "custom
 *     action 'run()' conflicts with method in base class" — 3.0.15 item 3, the BTP trial of 16.10.2026).
 *   - `srv/service.ts` (+ `srv/service.js`, which lets `cds-serve` load it on Node's type stripping) — the
 *     handler. It only delegates: the parameters go through the core's input contract
 *     (`simulateRequest`), a refusal answers 400 with one message per field, the run's answer is returned; an
 *     error inside a step answers 500 for that request and never takes the service down (3.0.15 item 5b).
 *   - `srv/access.ts` + `srv/external/*.cds` — one function per SAP object the original reads, writes or
 *     calls (`access-layer.ts`). A read goes to a remote service (`cds.connect.to`) only where this
 *     product's curated catalog names a released OData API for the table; a CDS view successor is not
 *     assumed to be released for remote use (C2), and everything else refuses with its reason. The remote
 *     service definitions are placeholders — the tables and the fields the original's SELECT names, with mock
 *     data for `cds watch` — until the API's own definition is imported (`cds import`).
 *   - `package.json` (`@sap/cds`, `cds-serve`, `cds watch`), `mta.yaml` and `xs-security.json` — minimal,
 *     no secrets; not built or deployed by Clean-Core.io.
 *
 * Checked by `cds compile` of the model and the service (`cds-compile.ts`, where the compiler is installed)
 * and by the type check of the package (`lib/test-sandbox/type-check.ts`). The CAP runtime itself is never
 * started by Clean-Core.io.
 *
 * Pure and deterministic: the same plan gives the same files. No network, no model.
 */

import { SAP_API_CATALOG, SAP_API_CATALOG_STAMP } from '../abap/sap-api-catalog';
import type { AbapStatement } from '../abap/statement-reader';
import { accessPointsOf, type AccessPoint } from './access-layer';
import { programArchitecture, type ProgramArchitecture } from './architecture';
import type { InputColumn, InputList } from './input-lists';
import { camelName, pascalName } from './naming';
import type { EngineFacts } from './unit-plan';
import type { ContractField, ScaffoldFile, UnitPlan } from './types';

/** The `@sap/cds` line the shell is written for, and the tools around it. */
export const CAP_VERSIONS = Object.freeze({
  '@sap/cds': '^10',
  '@sap/xssec': '^4',
  '@cap-js/hana': '^3',
  '@cap-js/sqlite': '^3',
  '@sap/cds-dk': '^10',
  '@cap-js/cds-types': '^0.20.0',
  tsx: '^4.21.0',
  typescript: '^5.9.3',
  '@types/node': '^22.0.0',
});

/** The paths of the shell (and only those): what a reader of the package sees as CAP. */
export const CAP_SHELL_PATHS = Object.freeze(['db/schema.cds', 'srv/service.cds', 'srv/service.ts', 'srv/service.js', 'srv/access.ts', 'mta.yaml', 'xs-security.json']);

/**
 * The action of the service. A writing program's is `runProcess`, never `run`: `run` is a method of every
 * `cds.Service`, and an action of that name shadows it (3.0.15 item 3).
 */
export type CapAction = 'simulate' | 'runProcess';

/** The action the architecture asks for (`architecture.ts`). */
export const capActionOf = (architecture: ProgramArchitecture): CapAction => (architecture === 'writing' ? 'runProcess' : 'simulate');

/** What the shell is, for the trace and the delivery readout. */
export interface CapShellSummary {
  architecture: ProgramArchitecture;
  service: string;
  action: CapAction;
  entities: string[];
  remote: Array<{ object: string; api: string }>;
  refused: Array<{ object: string; kind: AccessPoint['kind']; reason: string }>;
}

export interface CapShellInput {
  /** The plan with the input lists' paths (`withListPaths`). */
  plan: UnitPlan;
  facts: Pick<EngineFacts, 'statements' | 'graph'>;
  lists: readonly InputList[];
  packageName: string;
}

/** CDS words that cannot name an element unquoted. */
const CDS_RESERVED = new Set(
  'all any as asc by case cast desc distinct entity exists extend extract false from in key many new not null of on one select some type union when where with true using namespace context service view action function event aspect annotate'.split(' '),
);
const element = (name: string) => (CDS_RESERVED.has(name.toLowerCase()) ? `![${name}]` : name);
const comment = (s: string) => s.replace(/\*\//g, '* /').replace(/\s+/g, ' ').trim();
const snake = (s: string | null) => (s ?? 'program').toLowerCase().replace(/^\/[\w]+\//, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'program';

/** The CDS type of an input column. */
export function cdsTypeOfColumn(c: InputColumn): string {
  switch (c.kind) {
    case 'packed':
      return `Decimal(${c.digits}, ${c.places})`;
    case 'integer':
      return c.scalar?.type === 'int8' ? 'Integer64' : 'Integer';
    case 'digits':
      return `String(${c.length ?? c.digits ?? 1})`;
    case 'date':
      return 'Date';
    default: {
      if (c.values && c.length === 1) {
        const symbols = c.values.map((v) => (v === '' ? `initial = ''` : /^[A-Za-z]$/.test(v) ? `${v} = '${v}'` : /^\w$/.test(v) ? `value_${v} = '${v}'` : null)).filter(Boolean);
        return `String(1) enum { ${symbols.join('; ')}; }`;
      }
      return c.length ? `String(${c.length})` : 'String';
    }
  }
}

/** The CDS type of a selection field (an action parameter). */
export function cdsTypeOfField(f: ContractField): string {
  switch (f.kind) {
    case 'packed':
      return `Decimal(${f.digits ?? 15}, ${f.places})`;
    case 'integer':
      return 'Integer';
    case 'digits':
      return `String(${f.digits ?? 1})`;
    case 'date':
      return 'Date';
    case 'flag':
      return 'Boolean';
    case 'range':
      return 'many SelectionRange';
    default:
      return 'String';
  }
}

function columnNote(c: InputColumn): string {
  const dictionary = c.scalar?.dictionary ? ` — dictionary type ${c.scalar.type.toUpperCase()}: its length is in the dictionary, not in the source` : '';
  const values = c.values ? ` — the original compares it with ${c.values.map((v) => `'${v}'`).join(', ')} (not a check: the source may not show every value)` : '';
  return comment(`${c.name.toUpperCase()} — ${c.abap}, L${c.line}${dictionary}${values}.`);
}

/* ------------------------------------------------------------- db/schema.cds */

interface WrittenTable {
  table: string;
  entity: string;
  keywords: Array<'INSERT' | 'UPDATE' | 'MODIFY' | 'DELETE'>;
  lines: number[];
  fields: string[];
}

/** The customer tables a writing program writes, with the components its statements name. */
function writtenCustomerTables(facts: CapShellInput['facts']): WrittenTable[] {
  const out = new Map<string, WrittenTable>();
  for (const w of facts.graph.databaseWrites) {
    if (!/^(?:[ZY]|\/[ZY])/.test(w.table)) continue;
    const t = out.get(w.table) ?? { table: w.table, entity: pascalName(w.table), keywords: [], lines: [], fields: [] };
    if (!t.keywords.includes(w.keyword)) t.keywords.push(w.keyword);
    t.lines.push(w.lineStart);
    const fields = new Set(t.fields);
    // `VALUE #( a = … b = … )`, `SET a = …`, and `<work area>-a = …` before an INSERT … FROM <work area>.
    for (const m of w.text.matchAll(/(?:\(|\s)(\w+)\s*=(?!=)/g)) if (!/^(?:mandt|client)$/i.test(m[1])) fields.add(m[1].toLowerCase());
    const from = /\bFROM\s+(?!@?\()@?(\w+)\s*$/i.exec(w.text)?.[1];
    if (from) {
      const re = new RegExp(`^${from}-(\\w+)\\s*=`, 'i');
      for (const st of facts.statements) {
        const m = re.exec(st.text);
        if (m && !/^(?:mandt|client)$/i.test(m[1])) fields.add(m[1].toLowerCase());
      }
    }
    t.fields = [...fields].filter((f) => !/^(?:where|from|set|value)$/i.test(f)).sort();
    out.set(w.table, t);
  }
  return [...out.values()];
}

function schemaCds(input: CapShellInput, namespace: string, written: readonly WrittenTable[]): string {
  const { plan, lists } = input;
  const out: string[] = [];
  out.push(`// The data model of ${plan.program ?? 'the program'} — written by Clean-Core.io (engine) from the original's declarations.`);
  out.push('// One row type and one entity per input structure the original reads (never a union of fields), types as declared.');
  if (written.length > 0) out.push('// The customer tables the original writes follow: their columns are in the dictionary, not in the source — only the components its statements name are here.');
  out.push(`namespace ${namespace};`);
  out.push('');
  const seen = new Set<string>();
  for (const l of lists) {
    if (seen.has(l.cds.type)) continue;
    seen.add(l.cds.type);
    const tables = lists.filter((x) => x.cds.type === l.cds.type).map((x) => `${x.global.name.toUpperCase()} (${x.filledBy.join(', ')})`);
    out.push(
      l.lookup
        ? `/** ${l.lookup.table}: the rows a step of the original reads (L${l.lookup.lines.join(', L')}) — a lookup list, the columns its reads name (srv/lib/lookups.ts). */`
        : `/** ${l.structure.name.toUpperCase()}, L${l.structure.line}–${l.structure.lineEnd}: a row of ${tables.join(', ')}. */`,
    );
    out.push(`type ${l.cds.type} {`);
    for (const c of l.columns) out.push(`  ${element(c.key)} : ${cdsTypeOfColumn(c)}; // ${columnNote(c)}`);
    out.push('}');
    out.push('');
    out.push(`entity ${l.cds.entity} : ${l.cds.type} {`);
    out.push('  key ID : UUID;');
    out.push('}');
    out.push('');
  }
  for (const t of written) {
    out.push(`/** ${t.table}: the original ${t.keywords.join(', ')}s it (L${t.lines.join(', L')}). Columns: those its statements name; types and keys are in the dictionary. */`);
    out.push(`entity ${t.entity} {`);
    out.push('  key ID : UUID;');
    for (const f of t.fields) out.push(`  ${element(camelName(f))} : String; // ${f.toUpperCase()} — type in the dictionary, not in the source.`);
    out.push('}');
    out.push('');
  }
  if (lists.length === 0 && written.length === 0) {
    out.push('// The original declares no input structure of its own: its input is the selection (srv/service.cds).');
    out.push('');
  }
  return out.join('\n');
}

/* ------------------------------------------------------------ srv/service.cds */

function serviceCds(input: CapShellInput, namespace: string, service: string, architecture: ProgramArchitecture, written: readonly WrittenTable[]): string {
  const { plan, lists } = input;
  const action = capActionOf(architecture);
  const selection = plan.fields.filter((f) => f.where === 'selection');
  const legacy = plan.fields.filter((f) => f.where === 'record' && (f.path ?? '').startsWith('records[]'));
  const out: string[] = [];
  out.push(`// ${service} — written by Clean-Core.io (engine) for ${plan.program ?? 'the program'}.`);
  out.push(
    architecture === 'writing'
      ? `// The original writes ${written.map((t) => t.table).join(', ') || 'SAP tables'}: an action \`${action}\` runs the process; the customer tables it writes are entities with the operations it performs.`
      : '// The original writes no table: a read-only simulation. The action `simulate` takes the selection and the input lists and answers with the run — no entity is persisted.',
  );
  out.push('// Handlers: srv/service.ts — they delegate to the core (srv/simulate.ts); the checks are the core\'s input contract.');
  if (lists.length > 0 || written.length > 0) out.push(`using { ${namespace} as db } from '../db/schema';`);
  else out.push("using from '../db/schema';");
  out.push('');
  out.push('/** A selection range (SELECT-OPTIONS): sign I|E, option EQ, BT, CP …, low, high. */');
  out.push('type SelectionRange { sign : String(1); option : String(2); low : String; high : String; }');
  out.push('/** A message of the run (the original\'s list output or log, as the steps record it). */');
  out.push('type RunIssue { severity : String; message : String; rule : String; }');
  out.push('/** The answer of one run. `rows` and `result` are JSON: their shape is the one the written steps produce. */');
  out.push('type RunAnswer { runId : String(36); complete : Boolean; notFilled : many String; records : Integer; rows : LargeString; result : LargeString; issues : many RunIssue; }');
  if (legacy.length > 0) {
    out.push('/** Input fields the engine could not place in a structure of their own (one record list, as before scaffold version 7). */');
    out.push(`type InputRecord { ${legacy.map((f) => `${element(f.key)} : ${f.kind === 'packed' ? `Decimal(${f.digits ?? 15}, ${f.places})` : 'String'};`).join(' ')} }`);
  }
  out.push('');
  out.push(`service ${service} {`);
  const params: string[] = [];
  for (const f of selection) params.push(`    /** ${comment(`${f.original} — ${f.declaration}${f.obligatory ? ', obligatory' : ''}, L${f.line}`)} */\n    ${element(f.key)} : ${cdsTypeOfField(f)}`);
  for (const l of lists) params.push(`    /** ${comment(`${l.global.name.toUpperCase()}: rows of ${l.structure.name.toUpperCase()} (${l.filledBy.join(', ')})`)} */\n    ${element(l.key)} : many db.${l.cds.type}`);
  if (legacy.length > 0) params.push('    records : many InputRecord');
  out.push(`  /** One run of ${comment(plan.program ?? 'the program')}: the selection checks, then the steps in the original's order (srv/process.ts). */`);
  out.push(`  action ${action}(${params.length ? `\n${params.join(',\n')}\n  ` : ''}) returns RunAnswer;`);
  for (const t of written) {
    const onlyInsert = t.keywords.every((k) => k === 'INSERT');
    out.push(`  /** ${t.table}: ${t.keywords.join(', ')} by the original. */`);
    out.push(`  ${onlyInsert ? '@insertonly ' : ''}entity ${t.entity} as projection on db.${t.entity};`);
  }
  out.push('}');
  out.push('');
  return out.join('\n');
}

/* ------------------------------------------------------------- srv/service.ts */

function serviceTs(service: string, action: CapAction, program: string | null): string {
  return String.raw`/// <reference types="@cap-js/cds-types" />
/**
 * The handlers of ${service} (srv/service.cds) for ${program ?? 'the program'} - written by Clean-Core.io (engine).
 * They only delegate: the parameters go through the core's input contract (srv/lib/input-contract.ts) inside
 * simulateRequest, which runs the process (srv/process.ts); a refusal answers 400 with one message per field,
 * where the original's selection screen and checks refuse. No business logic here. An error inside a step
 * answers 500 for that request: CAP shuts the server down on an uncaught programming error (a TypeError), so
 * the handler catches it, logs it and rejects the request with a message that names no internals.
 */
import cds from '@sap/cds';
import { createRunStore } from './lib/run-store.ts';
import type { Selection } from './lib/types.ts';
import { simulateRequest, type RunResult, type SimulateAnswer } from './simulate.ts';

/** The action's parameters as the core's request: a parameter CAP hands in as null is one not given. */
function requestOf(data: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof data !== 'object' || data === null) return out;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

/** The run as srv/service.cds types it (RunAnswer). */
function answerOf(a: SimulateAnswer) {
  return {
    runId: a.runId,
    complete: a.complete,
    notFilled: a.notFilled,
    records: a.records,
    rows: JSON.stringify(a.run?.result.rows ?? []),
    result: JSON.stringify(a.run?.result.result ?? {}),
    issues: (a.run?.result.issues ?? []).map((i) => ({ severity: i.severity, message: i.message, rule: i.rule ?? null })),
  };
}

export default class ${service} extends cds.ApplicationService {
  init() {
    const store = createRunStore<Selection, RunResult>();
    this.on('${action}', (req) => {
      let a: SimulateAnswer;
      try {
        a = simulateRequest(requestOf(req.data), store);
      } catch (err) {
        console.error('${action} failed inside a step:', err);
        return req.reject(500, 'RUN: the run stopped on an unexpected error inside a step; the service keeps running. The server log has the details.');
      }
      if (!a.ok) {
        for (const e of a.errors) req.error(400, e.rule + ': ' + e.message, e.field ?? undefined);
        return undefined;
      }
      return answerOf(a);
    });
    return super.init();
  }
}
`;
}

const SERVICE_JS = `// Lets cds-serve find the handlers of srv/service.cds without a TypeScript loader: Node (>= 22.18) strips
// the types of srv/service.ts itself. Under \`cds watch\` with tsx, CAP loads srv/service.ts directly.
// Written by Clean-Core.io (engine).
export { default } from './service.ts';
`;

/* ------------------------------------------------------------- srv/access.ts */

interface Remote {
  api: string;
  kind: 'odata-v2' | 'odata';
  entities: Map<string, { fields: string[]; row: Record<string, string> }>;
}

const identifier = (s: string) => /^[a-z_]\w*$/i.test(s);

/** The fields one SELECT names for a table, and the values its WHERE compares them with. */
function selectFields(st: AbapStatement, table: string, defaults: ReadonlyMap<string, string>): { fields: string[]; row: Record<string, string> } {
  const text = st.text.replace(/\s+/g, ' ');
  const aliases = new Map<string, string>();
  for (const m of text.matchAll(/\b(?:FROM|JOIN)\s+(\/?[A-Za-z][\w/]*)(?:\s+AS\s+(\w+))?/gi)) aliases.set((m[2] ?? m[1]).toUpperCase(), m[1].toUpperCase());
  const main = /\bFROM\s+(\/?[A-Za-z][\w/]*)/i.exec(text)?.[1]?.toUpperCase() ?? '';
  const mine = (prefix: string | undefined) => (prefix ? aliases.get(prefix.toUpperCase()) === table : main === table);
  const fields: string[] = [];
  const add = (f: string) => {
    const n = f.toLowerCase();
    if (identifier(n) && !fields.includes(n) && !/^(?:single|distinct|as|from|into|table|up|to|rows|where|and|or|not|sum|count|max|min|avg|data|appending|corresponding|fields|of)$/.test(n)) fields.push(n);
  };
  const list = /^SELECT\s+(?:SINGLE\s+)?(?:DISTINCT\s+)?([\s\S]*?)\s+FROM\b/i.exec(text)?.[1] ?? '*';
  if (list.trim() !== '*') {
    for (const m of list.matchAll(/(?:(\w+)~)?(\w+)/g)) if (mine(m[1])) add(m[2]);
  }
  const row: Record<string, string> = {};
  const where = /\bWHERE\b([\s\S]*?)(?:\bINTO\b|\bUP\s+TO\b|\bORDER\s+BY\b|\bGROUP\s+BY\b|$)/i.exec(text)?.[1] ?? '';
  for (const m of where.matchAll(/(?:(\w+)~)?(\w+)\s*(?:=|EQ)\s*(@?[\w-]+|'(?:[^']|'')*')/gi)) {
    if (!mine(m[1])) continue;
    add(m[2]);
    const v = m[3];
    const literal = /^'/.test(v) ? v.slice(1, -1).replace(/''/g, "'") : defaults.get(v.replace(/^@/, '').toUpperCase());
    if (literal !== undefined) row[m[2].toLowerCase()] = literal;
  }
  return { fields, row };
}

interface AccessPlan {
  points: Array<{ point: AccessPoint; remote: string | null; reason: string | null; statements: AbapStatement[] }>;
  remotes: Remote[];
  more: string[];
}

function accessPlanOf(input: CapShellInput): AccessPlan {
  const { facts, plan } = input;
  const { points, more } = accessPointsOf(facts as Pick<EngineFacts, 'statements' | 'graph'>);
  const defaults = new Map<string, string>();
  for (const f of plan.fields) if (f.where === 'selection' && f.defaultValue) defaults.set(f.original, f.defaultValue.replace(/^'(.*)'$/, '$1'));
  const remotes = new Map<string, Remote>();
  const out: AccessPlan['points'] = [];
  for (const point of points) {
    const statements = facts.statements.filter((s) => point.lines.includes(s.lineStart));
    const entry = SAP_API_CATALOG[point.object];
    if (point.kind === 'read' && entry?.type === 'OData API') {
      const api = entry.view;
      const r = remotes.get(api) ?? { api, kind: /_SRV$/i.test(api) ? 'odata-v2' : 'odata', entities: new Map() };
      const e = r.entities.get(point.object) ?? { fields: [], row: {} };
      for (const st of statements) {
        const got = selectFields(st, point.object, defaults);
        for (const f of got.fields) if (!e.fields.includes(f)) e.fields.push(f);
        for (const [k, v] of Object.entries(got.row)) if (e.row[k] === undefined) e.row[k] = v;
      }
      if (e.fields.length === 0) e.fields.push('id');
      r.entities.set(point.object, e);
      remotes.set(api, r);
      out.push({ point, remote: api, reason: null, statements });
      continue;
    }
    let reason: string;
    if (point.kind === 'read') {
      reason = entry
        ? `${point.object}: this product's curated catalog names ${entry.view} (${entry.type}) — a ${entry.type} is not assumed to be released for remote use (C2); check its release contract before reading it from here`
        : `${point.object}: no released API is named for it in this product's curated catalog — check the SAP Cloudification Repository for a successor`;
    } else if (point.kind === 'write') {
      reason = entry
        ? `${point.object}: the original writes it (L${point.lines.join(', L')}); ${entry.view} (${entry.type}) is named for reading it, and the write is not mapped to an operation of a released API — check`
        : `${point.object}: the original writes it (L${point.lines.join(', L')}) and no released API is named for it — check`;
    } else {
      reason = `CALL FUNCTION '${point.object}' (L${point.lines.join(', L')}): not mapped to a released API here — check its release state and successor`;
    }
    out.push({ point, remote: null, reason, statements });
  }
  return { points: out, remotes: [...remotes.values()], more };
}

function accessTs(input: CapShellInput, access: AccessPlan, namespace: string, written: readonly WrittenTable[]): string {
  const lines: string[] = [];
  lines.push('/// <reference types="@cap-js/cds-types" />');
  lines.push('/**');
  lines.push(` * The access layer of ${input.plan.program ?? 'the program'} — one function per SAP object the original reads, writes or calls,`);
  lines.push(' * and one per customer table it writes. Written by Clean-Core.io (engine).');
  lines.push(' * A read goes to a remote service (cds.connect.to) only where this product\'s curated catalog names a released OData API');
  lines.push(` * for the table (${comment(SAP_API_CATALOG_STAMP)}); the service definitions in srv/external/ are placeholders until`);
  lines.push(' * the API\'s own definition is imported (cds import). Every other access refuses with its reason.');
  lines.push(' * Not called by the core: a run takes its input as the action\'s lists. Wiring a read to a list is a developer step.');
  const lookups = input.lists.filter((l) => l.lookup);
  if (lookups.length) lines.push(` * The reads inside the steps are lookup lists of the action, answered by srv/lib/lookups.ts: ${lookups.map((l) => `${l.key} ← ${l.lookup!.table}`).join(', ')}.`);
  if (access.more.length) lines.push(` * Not listed (more than the layer carries): ${access.more.join(', ')}.`);
  lines.push(' */');
  lines.push("import cds from '@sap/cds';");
  lines.push('');
  lines.push('/** An access with no released API behind it here: the reason says what to check. */');
  lines.push('export class AccessRefused extends Error {');
  lines.push('  readonly object: string;');
  lines.push('  constructor(object: string, reason: string) {');
  lines.push('    super(reason);');
  lines.push("    this.name = 'AccessRefused';");
  lines.push('    this.object = object;');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('/** A read with no filter would copy the whole table out of the SAP system: refused. */');
  lines.push('function filtered(object: string, where: Record<string, unknown>): Record<string, unknown> {');
  lines.push("  if (Object.keys(where).length === 0) throw new AccessRefused(object, object + ': a read without a filter is refused — the original reads with a WHERE.');");
  lines.push('  return where;');
  lines.push('}');
  for (const a of access.points) {
    const fn = camelName(a.point.method);
    const where = a.statements.map((s) => comment(s.text).slice(0, 160)).join(' | ');
    lines.push('');
    if (a.remote) {
      lines.push(`/** ${a.point.object}, read at L${a.point.lines.join(', L')}: ${where}. Remote: ${a.remote} (placeholder entity ${a.point.object}; map to the API's entity set). */`);
      lines.push(`export async function ${fn}(where: Record<string, unknown>): Promise<unknown> {`);
      lines.push(`  const api = await cds.connect.to('${a.remote}');`);
      lines.push(`  return api.run(SELECT.from('${a.remote}.${a.point.object}').where(filtered('${a.point.object}', where)));`);
      lines.push('}');
    } else {
      lines.push(`/** ${a.point.object}, ${a.point.kind} at L${a.point.lines.join(', L')}: refused — ${comment(a.reason ?? '')}. */`);
      lines.push(`export async function ${fn}(): Promise<never> {`);
      lines.push(`  throw new AccessRefused(${JSON.stringify(a.point.object)}, ${JSON.stringify(a.reason ?? '')});`);
      lines.push('}');
    }
  }
  for (const t of written) {
    lines.push('');
    lines.push(`/** ${t.table}: the original ${t.keywords.join(', ')}s it (L${t.lines.join(', L')}) — the package's own entity ${t.entity} (db/schema.cds). */`);
    lines.push(`export async function write${t.entity}(row: Record<string, unknown>): Promise<unknown> {`);
    lines.push("  const db = await cds.connect.to('db');");
    lines.push(`  return db.run(INSERT.into('${namespace}.${t.entity}').entries(row));`);
    lines.push('}');
  }
  lines.push('');
  return lines.join('\n');
}

function externalCds(r: Remote): string {
  const out: string[] = [];
  out.push(`// ${r.api} — a PLACEHOLDER of the released API, written by Clean-Core.io (engine). Its entities are the tables the`);
  out.push("// original reads, with the fields its SELECT names; the API's own entity sets and property names differ. Replace this");
  out.push(`// file with the API's definition (cds import <its EDMX from the SAP Business Accelerator Hub>) and map srv/access.ts to it.`);
  out.push(`// Named by ${comment(SAP_API_CATALOG_STAMP)} — check the API's release state. Mock data: srv/external/data/.`);
  out.push('@cds.external');
  out.push('@cc.placeholder');
  out.push(`service ${r.api} {`);
  for (const [table, e] of r.entities) {
    out.push(`  entity ${table} {`);
    e.fields.forEach((f, i) => out.push(`    ${i === 0 ? 'key ' : ''}${element(f)} : String;`));
    out.push('  }');
  }
  out.push('}');
  out.push('');
  return out.join('\n');
}

function mockCsv(e: { fields: string[]; row: Record<string, string> }): string {
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const row = e.fields.map((f, i) => cell(e.row[f] ?? (i === 0 ? 'MOCK-1' : '')));
  return `${e.fields.join(';')}\n${row.join(';')}\n`;
}

/* ----------------------------------------------- package.json, mta, security */

function packageJson(input: CapShellInput, access: AccessPlan, architecture: ProgramArchitecture): string {
  const requires: Record<string, unknown> = {};
  for (const r of access.remotes) {
    requires[r.api] = {
      kind: r.kind,
      model: `srv/external/${r.api}`,
      '[production]': { credentials: { destination: r.api, path: `/sap/opu/odata/sap/${r.api}` } },
    };
  }
  requires['[production]'] = { auth: 'xsuaa', ...(architecture === 'writing' ? { db: 'hana' } : {}) };
  return `${JSON.stringify(
    {
      name: input.packageName,
      version: '0.1.0',
      private: true,
      type: 'module',
      description: 'Generated by Clean-Core.io: a CAP service around an engine-written core; model-written function bodies (see TRACE.md).',
      engines: { node: '>=22.18' },
      scripts: {
        start: 'cds-serve',
        watch: 'cds watch',
        compile: 'cds compile srv --to csn',
        core: 'node srv/server.ts',
        // Node >= 21 reads test files by pattern, not from a bare directory argument.
        test: 'node --test test/*.test.mjs',
        typecheck: 'tsc -p .',
      },
      dependencies: {
        '@sap/cds': CAP_VERSIONS['@sap/cds'],
        '@sap/xssec': CAP_VERSIONS['@sap/xssec'],
        ...(architecture === 'writing' ? { '@cap-js/hana': CAP_VERSIONS['@cap-js/hana'] } : {}),
      },
      devDependencies: {
        '@cap-js/cds-types': CAP_VERSIONS['@cap-js/cds-types'],
        '@cap-js/sqlite': CAP_VERSIONS['@cap-js/sqlite'],
        '@sap/cds-dk': CAP_VERSIONS['@sap/cds-dk'],
        '@types/node': CAP_VERSIONS['@types/node'],
        tsx: CAP_VERSIONS.tsx,
        typescript: CAP_VERSIONS.typescript,
      },
      cds: { requires },
    },
    null,
    2,
  )}\n`;
}

function mtaYaml(input: CapShellInput, access: AccessPlan, architecture: ProgramArchitecture): string {
  const id = input.packageName;
  const remote = access.remotes.length > 0;
  const writing = architecture === 'writing';
  const lines = [
    '# Deployment descriptor for SAP BTP (Cloud Foundry) - minimal, written by Clean-Core.io (engine).',
    '# Not built, deployed or run by Clean-Core.io. No secrets: credentials come from the bound services.',
    "_schema-version: '3.1'",
    `ID: ${id}`,
    'version: 0.1.0',
    'parameters:',
    '  enable-parallel-deployments: true',
    'build-parameters:',
    '  before-all:',
    '    - builder: custom',
    '      commands:',
    '        - npm install',
    '        - npx cds build --production',
    'modules:',
    `  - name: ${id}-srv`,
    '    type: nodejs',
    '    path: gen/srv',
    '    parameters:',
    '      buildpack: nodejs_buildpack',
    '    build-parameters:',
    '      builder: npm',
    '    provides:',
    '      - name: srv-api',
    '        properties:',
    '          srv-url: ${default-url}',
    '    requires:',
    `      - name: ${id}-auth`,
    ...(remote ? [`      - name: ${id}-destination`] : []),
    ...(writing ? [`      - name: ${id}-db`] : []),
    ...(writing
      ? [
          `  - name: ${id}-db-deployer`,
          '    type: hdb',
          '    path: gen/db',
          '    parameters:',
          '      buildpack: nodejs_buildpack',
          '    requires:',
          `      - name: ${id}-db`,
        ]
      : []),
    'resources:',
    `  - name: ${id}-auth`,
    '    type: org.cloudfoundry.managed-service',
    '    parameters:',
    '      service: xsuaa',
    '      service-plan: application',
    '      path: ./xs-security.json',
    ...(remote
      ? [
          `  - name: ${id}-destination`,
          '    type: org.cloudfoundry.managed-service',
          '    parameters:',
          '      service: destination',
          '      service-plan: lite',
        ]
      : []),
    ...(writing ? [`  - name: ${id}-db`, '    type: com.sap.xs.hdi-container', '    parameters:', '      service: hana', '      service-plan: hdi-shared'] : []),
    '',
  ];
  return lines.join('\n');
}

function xsSecurity(input: CapShellInput): string {
  return `${JSON.stringify({ xsappname: input.packageName, 'tenant-mode': 'dedicated', scopes: [], 'role-templates': [] }, null, 2)}\n`;
}

/* ------------------------------------------------------------------ build */

/** The CDS service name of a program: `ZSD_RETURN_CREDIT_RECON` → `ZsdReturnCreditReconService`. */
export const capServiceName = (program: string | null) => `${pascalName(program ?? 'program')}Service`;

/** The CAP shell's files and package.json — see the file comment. */
export function capShellFiles(input: CapShellInput): { files: ScaffoldFile[]; packageJson: string; summary: CapShellSummary } {
  const architecture = programArchitecture(input.facts);
  const namespace = `cc.${snake(input.plan.program)}`;
  const service = capServiceName(input.plan.program);
  const action = capActionOf(architecture);
  const written = architecture === 'writing' ? writtenCustomerTables(input.facts) : [];
  const access = accessPlanOf(input);
  const files: ScaffoldFile[] = [
    { path: 'db/schema.cds', content: schemaCds(input, namespace, written), owner: 'engine' },
    { path: 'srv/service.cds', content: serviceCds(input, namespace, service, architecture, written), owner: 'engine' },
    { path: 'srv/service.ts', content: serviceTs(service, action, input.plan.program), owner: 'engine' },
    { path: 'srv/service.js', content: SERVICE_JS, owner: 'engine' },
  ];
  if (access.points.length > 0 || written.length > 0) files.push({ path: 'srv/access.ts', content: accessTs(input, access, namespace, written), owner: 'engine' });
  for (const r of access.remotes) {
    files.push({ path: `srv/external/${r.api}.cds`, content: externalCds(r), owner: 'engine' });
    for (const [table, e] of r.entities) files.push({ path: `srv/external/data/${r.api}-${table}.csv`, content: mockCsv(e), owner: 'engine' });
  }
  files.push({ path: 'mta.yaml', content: mtaYaml(input, access, architecture), owner: 'engine' });
  files.push({ path: 'xs-security.json', content: xsSecurity(input), owner: 'engine' });
  const entities = [...new Set(input.lists.map((l) => l.cds.entity)), ...written.map((t) => t.entity)];
  return {
    files,
    packageJson: packageJson(input, access, architecture),
    summary: {
      architecture,
      service,
      action,
      entities,
      remote: access.points.filter((p) => p.remote).map((p) => ({ object: p.point.object, api: p.remote! })),
      refused: access.points.filter((p) => !p.remote).map((p) => ({ object: p.point.object, kind: p.point.kind, reason: p.reason ?? '' })),
    },
  };
}

/**
 * The RAP / ABAP Cloud scaffold (design §6.3), in abapGit file layout.
 *
 * Since scaffold version 6 (3.0.13, "generated ABAP that activates", after two
 * external reviews of the SD example on 14.10.2026), the package is built
 * around a **typed contract** read from the original before any body is
 * written (`rap-contract.ts`):
 *
 *   - **the logic class `zcl_<name>_logic`** declares the original's TYPES as
 *     declared, its constants, its globals and its selection inputs as
 *     instance attributes under their original names, and one method per
 *     routine with the routine's own FORM parameters and types. Its entry
 *     `run( is_selection, is_input )` sets the selection, runs the selection
 *     checks, the process (`run_steps`, the original's event blocks) and
 *     returns every global in `ty_run_result`. The original's demo data is
 *     not carried: what its demo-data routines fill arrives as `is_input`, and
 *     `load_input( )` puts it where the original's demo routines put it.
 *     A refusal of the original (`MESSAGE … TYPE 'E'`) is
 *     `zcx_<name>_refusal`; a body is between fill markers, a stub raises
 *     `zcx_<name>_nofill`;
 *   - **every carried guard runs in the logic path.** Its predicate
 *     `when_g<line>` returns the original's condition — written by the engine
 *     (the condition as the original writes it, its local operands as typed
 *     parameters) wherever the condition reads only declared names, else a
 *     fill region. Where calling it at the method's entry is exact (an IF with
 *     nothing but the refusal or RETURN in it, reading only the method's
 *     parameters, the attributes and constants), the engine writes the call
 *     there; a check of the selection screen runs in `check_selection`, before
 *     any step; every other guard must be called by the body at the original's
 *     line (`required`, refused by `bodyGuards` when missing). A constant
 *     safety gate (`IF gc_live_probe <> 'X'. MESSAGE … TYPE 'E'.`) is therefore
 *     engine-written in the logic path, never a save validation;
 *   - **the architecture follows the program.** A program that writes no
 *     table (a report, a simulation) becomes a custom entity
 *     (`z<name>_ce`, the original's result list, the selection inputs as its
 *     parameters) with a query provider `zcl_<name>_query`
 *     (`IF_RAP_QUERY_PROVIDER`) — no table, no business object. A program that
 *     writes keeps the managed business object of the record table (scaffold
 *     version 2), its process run by a static action whose parameter is the
 *     selection (`z<name>_p`, an abstract entity), never by a determination
 *     over the saved keys;
 *   - **the access layer** (`zif_<name>_access`) has one method per SAP object
 *     the original reads, writes or calls; a function call's method carries
 *     the call's own parameters, typed from its call sites.
 *
 * Kept from versions 2 and 3 (DSAG ABAP guide review C3, B3, B4, B9; abapGit
 * package): authorization checked and denied until a developer fills it
 * (`@cc-open`), an Application Job where the original runs in the background,
 * ABAP Doc on every public method, abapGit's metadata file for every object.
 *
 * What is confirmed and what is not: the release state of every SAP object the
 * scaffold names is in SAP's Cloudification Repository as synced into
 * `lib/abap/generated/` (`IF_RAP_QUERY_PROVIDER`, `IF_APJ_DT_EXEC_OBJECT`,
 * `IF_APJ_RT_EXEC_OBJECT`, `CL_APJ_DT_CREATE_CONTENT`, `IF_OO_ADT_CLASSRUN`,
 * `CL_ABAP_BEHAVIOR_HANDLER`, `CX_STATIC_CHECK`, `CX_NO_CHECK`: released).
 * The shapes follow SAP's own samples, read through the GitHub API on
 * 13.10.2026 and cited where they are used (SAP-samples/abap-platform-refscen-flight
 * 93f76917; SAP-samples/abap-cheat-sheets d43eb13c). abaplint has neither SAP's
 * definitions nor a parser for behavior definitions, access controls and
 * service definitions; activation in ADT is the check of those.
 *
 * Deviation from the design table: the test class is the logic class's local
 * test include (`zcl_<name>_logic.clas.testclasses.abap`).
 *
 * Pure and deterministic. No network, no model.
 */

import { deriveEngineCases, type EngineCaseDerivation } from '../testing-engine-cases';
import { defuseMarkers, findRegions, regionText, scaffoldDigest } from './markers';
import { goldenMasterForScaffold } from './golden-master';
import { rangeWords, type EngineFacts } from './unit-plan';
import { requiredGuardsOf } from './scaffold-node';
import { accessPointsOf, type AccessPoint } from './access-layer';
import { sliceFor } from './abap-slice';
import { readRapContract, simpleTypeName, structureComponents, tableLineOf, typeDefinition, type RapContract, type RapParam } from './rap-contract';
import type { AuthorityCheck } from '../abap/call-graph';
import type { AbapStatement } from '../abap/statement-reader';
import { rapShortName, rapTableName } from './rap-names';
import { abapGitRepoSettingsXml, bdefXml, clasXml, dclsXml, ddlsXml, devcXml, intfXml, srvbXml, srvdXml, tablXml, type TableField } from './abapgit-files';
import { SCAFFOLD_VERSION, type AbapRegionNames, type ContractField, type PlanGuard, type RapClassContract, type RequiredGuard, type Scaffold, type ScaffoldFile, type Unit, type UnitPlan } from './types';

/**
 * Marks a place the engine wrote and a developer completes — never the model
 * (authorization, the access layer's SAP calls, the job's parameters). Not a
 * fill marker: no region, no fill unit, part of the scaffold digest.
 */
export const OPEN_MARKER = '@cc-open';

export interface RapScaffoldOptions {
  cases?: EngineCaseDerivation;
}

// rapShortName and rapTableName live in rap-names.ts (no scaffold behind them, for the client bundle); re-exported here.
export { rapShortName, rapTableName };

/** Field names a transparent table may not have (abaplint `xml_consistency`, confirmed by activation: DAY, HOUR). */
const RESERVED_TABLE_FIELDS = new Set(['zone', 'handler', 'section', 'parameter', 'day', 'hour']);

const abapField = (f: ContractField) => {
  const name = f.key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).slice(0, 30);
  return RESERVED_TABLE_FIELDS.has(name) ? `${name}_value` : name;
};

/**
 * The table field of a record field: a packed field is DEC(2L−1, d) from its
 * declaration (the declared digits are 2L−1 already) — `abap.dec(2L−1, d)` in
 * ADT's table source; a flag the data element ABAP_BOOLEAN.
 */
function tableField(f: ContractField): TableField {
  const name = abapField(f);
  switch (f.kind) {
    case 'packed':
      return { name, builtin: 'DEC', length: f.digits ?? 15, decimals: f.places };
    case 'digits':
      return { name, builtin: 'NUMC', length: f.digits ?? 10 };
    case 'integer':
      return { name, builtin: f.max === '9223372036854775807' ? 'INT8' : 'INT4' };
    case 'date':
      return { name, builtin: 'DATS' };
    case 'flag':
      return { name, dataElement: 'ABAP_BOOLEAN' };
    default:
      return { name, builtin: 'CHAR', length: 40 };
  }
}

/**
 * The table field of a record field as the original declares it (3.0.13: before, every non-packed field was
 * CHAR 40 — a date, an integer, a count). The component's own phrase in the class's types, through its aliases:
 * `TYPE i` INT4, `TYPE d` DATS, `TYPE n LENGTH 6` NUMC 6, `TYPE c LENGTH 10` CHAR 10, a DDIC element by name.
 */
function declaredTableField(f: ContractField, contract: RapContract): TableField {
  if (f.kind !== 'text') return tableField(f);
  const name = abapField(f);
  let depth = 0;
  let phrase: string | null = null;
  for (const t of contract.types) {
    if (/^TYPES BEGIN OF /i.test(t)) depth++;
    else if (/^TYPES END OF /i.test(t)) depth = Math.max(0, depth - 1);
    else if (depth > 0 && !phrase) phrase = new RegExp(`^TYPES ${escapeRe(f.original.toLowerCase())} (TYPE .+)$`, 'i').exec(t)?.[1] ?? null;
  }
  for (let i = 0; phrase && i < 6; i++) {
    const named = simpleTypeName(phrase);
    const def = named && !named.includes('-') ? typeDefinition(contract, named) : null;
    if (!def || def === 'STRUCTURE') break;
    phrase = def;
  }
  let m: RegExpExecArray | null;
  if (!phrase) return tableField(f);
  if (/^TYPE\s+(?:i|int4)$/i.test(phrase)) return { name, builtin: 'INT4' };
  if (/^TYPE\s+int8$/i.test(phrase)) return { name, builtin: 'INT8' };
  if (/^TYPE\s+(?:d|dats)$/i.test(phrase)) return { name, builtin: 'DATS' };
  if ((m = /^TYPE\s+n\s+LENGTH\s+(\d+)$/i.exec(phrase))) return { name, builtin: 'NUMC', length: Number(m[1]) };
  if ((m = /^TYPE\s+c\s+LENGTH\s+(\d+)$/i.exec(phrase))) return { name, builtin: 'CHAR', length: Math.min(Number(m[1]), 1333) };
  if ((m = /^TYPE\s+p\s+LENGTH\s+(\d+)\s+DECIMALS\s+(\d+)$/i.exec(phrase))) return { name, builtin: 'DEC', length: 2 * Number(m[1]) - 1, decimals: Number(m[2]) };
  const element = simpleTypeName(phrase);
  if (element && /^[a-z]\w*$/i.test(element) && !/^(?:string|xstring|c|n|p|x|f|t)$/i.test(element)) return { name, dataElement: element.toUpperCase() };
  return tableField(f);
}

/** The ABAP type of a contract field — for the engine cases' arithmetic in the test class. */
function abapType(f: ContractField): string {
  switch (f.kind) {
    case 'packed':
      return `p LENGTH ${Math.ceil(((f.digits ?? 15) + 1) / 2)} DECIMALS ${f.places}`;
    case 'digits':
      return `n LENGTH ${f.digits ?? 10}`;
    case 'integer':
      return f.max === '9223372036854775807' ? 'int8' : 'i';
    case 'date':
      return 'd';
    case 'flag':
      return 'abap_bool';
    case 'range':
      return 'RANGE OF string';
    default:
      return 'string';
  }
}

/** The predicate method of a guard: `G-0387` → `when_g0387`. */
export const predicateName = (g: Pick<PlanGuard, 'id'>) => `when_${g.id.replace('-', '').toLowerCase()}`;

/** The original's authority checks as one line each: `L120 AUTHORITY-CHECK OBJECT 'M_BEST_BSA' ID 'ACTVT' FIELD '03'`. */
function authorityLines(checks: readonly AuthorityCheck[]): string[] {
  return checks.map((c) => `L${c.lineStart} ${c.text.replace(/["\n\r]/g, "'").replace(/\*\//g, '* /').slice(0, 160)}`);
}

/** The objects and fields the original checks, `M_BEST_BSA (ACTVT, BSART)`, for one line of a comment. */
function authorityObjects(checks: readonly AuthorityCheck[]): string {
  const by = new Map<string, Set<string>>();
  for (const c of checks) {
    const name = (c.object ?? c.objectExpression).replace(/["']/g, '');
    const fields = by.get(name) ?? new Set<string>();
    for (const f of c.fields) fields.add(f.dummy ? `${f.id} DUMMY` : f.id);
    by.set(name, fields);
  }
  return [...by].map(([o, f]) => `${o}${f.size ? ` (${[...f].join(', ')})` : ''}`).join(', ');
}

/** The data type and length an Application Job parameter takes for a selection field, and whether that is known. */
function jobParameterType(f: ContractField): { datatype: string; length: number; decimals: number; known: boolean } {
  switch (f.kind) {
    case 'date':
      return { datatype: 'D', length: 8, decimals: 0, known: true };
    case 'digits':
      return { datatype: 'N', length: f.digits ?? 10, decimals: 0, known: f.digits !== null };
    case 'flag':
      return { datatype: 'C', length: 1, decimals: 0, known: true };
    case 'packed':
      return { datatype: 'P', length: f.digits ?? 15, decimals: f.places, known: f.digits !== null };
    case 'integer':
      return { datatype: 'I', length: 10, decimals: 0, known: false };
    default:
      return { datatype: 'C', length: 40, decimals: 0, known: false };
  }
}

/* ------------------------------------------------------------ helpers */

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const docText = (s: string) => s.replace(/\r?\n/g, ' ').replace(/"/g, "'");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/<>]/g, '\\$&');

/** One METHODS statement, a parameter per line (ABAP lines stay under 255 characters). */
function methodsStatement(name: string, params: readonly RapParam[], extra: { returning?: string; raising?: string[]; indent?: string } = {}): string[] {
  const ind = extra.indent ?? '    ';
  const importing = params.filter((p) => p.direction === 'importing');
  const changing = params.filter((p) => p.direction === 'changing');
  const lines = [`${ind}METHODS ${name}`];
  if (importing.length) lines.push(`${ind}  IMPORTING`, ...importing.map((p) => `${ind}    ${p.name} ${p.phrase}`));
  if (changing.length) lines.push(`${ind}  CHANGING`, ...changing.map((p) => `${ind}    ${p.name} ${p.phrase}`));
  if (extra.returning) {
    const [name0, ...rest] = extra.returning.split(' ');
    lines.push(`${ind}  RETURNING VALUE(${name0}) ${rest.join(' ')}`);
  }
  if (extra.raising?.length) lines.push(`${ind}  RAISING ${extra.raising.join(' ')}`);
  lines[lines.length - 1] += '.';
  return lines;
}

/** A declaration that keeps the original's DEFAULT KEY carries abaplint's pseudo comment for it (`avoid_use`). */
const keptDefaultKey = (line: string) => (/\bWITH DEFAULT KEY\.$/i.test(line) ? `${line} "#EC DEFAULT_KEY` : line);

/** The same signature on one line, for the prompt. */
const signatureLine = (stmt: readonly string[]) => stmt.map((l) => l.trim()).join(' ');

const COND_WORDS = new Set(
  'AND OR NOT IS INITIAL IN BETWEEN EQ NE GT GE LT LE CO CN CA NA CS NS CP NP ABAP_TRUE ABAP_FALSE SPACE TABLE_LINE ME INSTANCE OF MOD DIV BIT-AND BIT-OR BIT-XOR BIT-NOT BYTE-CO BYTE-CN BYTE-CA BYTE-NA BYTE-CS BYTE-NS O Z M'.split(' '),
);
/** System fields a statement sets: a predicate takes them as a parameter, its own sy-subrc says nothing. */
const STATEMENT_SY = new Set(['subrc', 'tabix', 'index', 'fdpos', 'dbcnt']);

interface Operand {
  token: string;
  base: string;
  component: string;
  start: number;
  end: number;
}

/** The data objects a condition reads, with their place in it; `unsupported` when the condition cannot move into a method as it stands. */
function conditionOperands(cond: string): { operands: Operand[]; unsupported: string | null } {
  if (/\bIS\s+(?:NOT\s+)?(?:ASSIGNED|BOUND|SUPPLIED|REQUESTED)\b/i.test(cond)) return { operands: [], unsupported: 'it asks IS ASSIGNED, BOUND, SUPPLIED or REQUESTED' };
  const out: Operand[] = [];
  const re = /'(?:[^']|'')*'|`(?:[^`]|``)*`|\|(?:[^|\\]|\\.)*\||(<?[A-Za-z_/][\w/]*>?)((?:-[\w/]+)*)/g;
  for (const m of cond.matchAll(re)) {
    if (!m[1]) continue;
    const start = m.index ?? 0;
    const before = cond.slice(0, start);
    if (/(?:->|=>|~)\s*$/.test(before)) continue;
    const after = cond.slice(start + m[0].length);
    if (/^\(\s|^\(\)/.test(after)) continue; // a function or method call: its arguments are scanned on their own
    if (COND_WORDS.has(m[1].toUpperCase()) && !m[2]) continue;
    out.push({ token: m[0], base: m[1].toLowerCase(), component: m[2], start, end: start + m[0].length });
  }
  return { operands: out, unsupported: null };
}

/** The full condition of a guard's statement (the plan's is cut at 160 characters). */
function fullCondition(statements: readonly AbapStatement[], g: PlanGuard): string {
  const st = statements.find((s) => s.lineStart === g.line && (s.keyword === 'IF' || s.keyword === 'ELSEIF' || s.keyword === 'CHECK'));
  if (!st) return g.condition;
  return st.text.replace(/^(?:ELSE)?IF\s+|^CHECK\s+/i, '').replace(/\.$/, '').trim();
}

/** The text a refusal carries: the literal of `MESSAGE 'text' TYPE 'E'`, else the statement as written. */
function refusalText(ending: string): string {
  const lit = /^MESSAGE\s+'((?:[^']|'')*)'/i.exec(ending);
  return (lit ? lit[1].replace(/''/g, "'") : ending).slice(0, 200);
}

/* ------------------------------------------------------------ CDS types */

/** The CDS type of an ABAP type phrase (`TYPE c LENGTH 10` → `abap.char( 10 )`); null for a structure, a table or what cannot be told. */
function cdsType(phrase: string, contract: RapContract, depth = 0): string | null {
  const p = phrase.trim();
  if (depth > 8) return null;
  let m: RegExpExecArray | null;
  if (/^TYPE\s+(?:i|int4)$/i.test(p)) return 'abap.int4';
  if (/^TYPE\s+int8$/i.test(p)) return 'abap.int8';
  if (/^TYPE\s+(?:int2|s)$/i.test(p)) return 'abap.int2';
  if (/^TYPE\s+(?:int1|b)$/i.test(p)) return 'abap.int1';
  if (/^TYPE\s+(?:d|dats|datum|sydatum)$/i.test(p)) return 'abap.dats';
  if (/^TYPE\s+(?:t|tims|uzeit|syuzeit)$/i.test(p)) return 'abap.tims';
  if (/^TYPE\s+string$/i.test(p)) return 'abap.string( 0 )';
  if (/^TYPE\s+xstring$/i.test(p)) return 'abap.rawstring( 0 )';
  if (/^TYPE\s+abap_bool(?:ean)?$/i.test(p)) return 'abap.char( 1 )';
  if (/^TYPE\s+f$/i.test(p)) return 'abap.fltp';
  if (/^TYPE\s+decfloat16$/i.test(p)) return 'abap.d16n';
  if (/^TYPE\s+decfloat34$/i.test(p)) return 'abap.d34n';
  if ((m = /^TYPE\s+c(?:\s+LENGTH\s+(\d+))?$/i.exec(p))) return `abap.char( ${Math.min(Number(m[1] ?? 1), 1333)} )`;
  if ((m = /^TYPE\s+n(?:\s+LENGTH\s+(\d+))?$/i.exec(p))) return `abap.numc( ${m[1] ?? 1} )`;
  if ((m = /^TYPE\s+x(?:\s+LENGTH\s+(\d+))?$/i.exec(p))) return `abap.raw( ${m[1] ?? 1} )`;
  if ((m = /^TYPE\s+p(?:\s+LENGTH\s+(\d+))?(?:\s+DECIMALS\s+(\d+))?$/i.exec(p))) return `abap.dec( ${2 * Number(m[1] ?? 8) - 1}, ${m[2] ?? 0} )`;
  const named = simpleTypeName(p);
  if (!named || named.includes('-')) return null;
  const def = typeDefinition(contract, named);
  if (def === 'STRUCTURE') return null;
  if (def) return /TABLE\s+OF|RANGE\s+OF|REF\s+TO/i.test(def) ? null : cdsType(def, contract, depth + 1);
  // Not declared in the program: a DDIC data element, which CDS takes by its name.
  return /^[a-z][\w]*$/i.test(named) ? named.toLowerCase() : null;
}

const CDS_RESERVED = new Set(['begin', 'number', 'position', 'key', 'define', 'select', 'from', 'where', 'as', 'association', 'composition', 'parameters', 'with', 'entity', 'view', 'case', 'when', 'then', 'else', 'end', 'cast', 'and', 'or', 'not', 'null', 'union', 'group', 'order', 'by', 'having', 'distinct', 'inner', 'left', 'right', 'outer', 'join', 'on', 'to', 'exact', 'one', 'many']);

/* ---------------------------------------------------- the access layer */

type AccessParam = RapParam & { optional: boolean };

interface AccessMethod {
  point: AccessPoint;
  params: AccessParam[];
}

/** The `formal = actual` pairs of a CALL FUNCTION statement, by section. */
function callFunctionPairs(text: string): Array<{ section: 'exporting' | 'importing' | 'changing' | 'tables'; formal: string; actual: string }> {
  const out: Array<{ section: 'exporting' | 'importing' | 'changing' | 'tables'; formal: string; actual: string }> = [];
  const rest = text.replace(/^CALL\s+FUNCTION\s+\S+/i, '');
  let section: 'exporting' | 'importing' | 'changing' | 'tables' | 'other' = 'other';
  const tokens = rest.match(/'(?:[^']|'')*'|`[^`]*`|\S+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toUpperCase();
    if (t === 'EXPORTING' || t === 'IMPORTING' || t === 'CHANGING' || t === 'TABLES') {
      section = t.toLowerCase() as typeof section;
      continue;
    }
    if (t === 'EXCEPTIONS' || t === 'DESTINATION' || t === 'STARTING' || t === 'IN' || t === 'PARAMETER-TABLE' || t === 'EXCEPTION-TABLE') {
      section = 'other';
      continue;
    }
    if (section !== 'other' && tokens[i + 1] === '=' && tokens[i + 2]) {
      out.push({ section, formal: tokens[i].toLowerCase(), actual: tokens[i + 2] });
      i += 2;
    }
  }
  return out;
}

/* ------------------------------------------------------------ the scaffold */

/** The RAP scaffold of a plan — see the file comment. */
export function buildRapScaffold(plan: UnitPlan, facts: EngineFacts, options: RapScaffoldOptions = {}): Scaffold {
  const s = rapShortName(plan.program);
  const cases = options.cases ?? deriveEngineCases(facts.source, facts.ruleSet.rules);
  const program = plan.program ?? 'the program';
  const table = rapTableName(s);
  const root = `z${s}_r`;
  const proj = `z${s}_c`;
  const entity = `z${s}_ce`;
  const param = `z${s}_p`;
  const logic = `zcl_${s}_logic`;
  const query = `zcl_${s}_query`;
  const pool = `zbp_${s}_r`;
  const cx = `zcx_${s}_nofill`;
  const refusal = `zcx_${s}_refusal`;
  const srvd = `z${s}_srvd`;
  const srvb = `z${s}_srvb`;
  const accessIf = `zif_${s}_access`;
  const accessCl = `zcl_${s}_access`;
  const accessCx = `zcx_${s}_access`;
  const job = `zcl_${s}_job`;
  const jobSetup = `zcl_${s}_job_setup`;
  const access = accessPointsOf(facts);
  const hasAccess = access.points.length > 0;
  const delivery = plan.abapDelivery;
  const withJob = delivery.kind !== 'ui-service';
  const withService = delivery.kind !== 'application-job';
  const checks = facts.graph.authorityChecks;
  const checkedObjects = checks.length > 0 ? authorityObjects(checks) : '';
  const record = plan.fields.filter((f) => f.where === 'record');
  const carried = plan.guards.filter((g) => g.carried);
  // Architecture (3.0.13 item 5): a business object only where the original writes a table; a report or simulation is a query.
  const writes = facts.graph.databaseWrites.length > 0;
  const architecture: RapClassContract['architecture'] = writes ? 'managed-bo' : 'custom-entity';
  const files: ScaffoldFile[] = [];
  const available: Record<string, string[]> = {};
  const head = `* Generated by Clean-Core.io (engine) for ${program}; bodies between the fill markers are model proposals.`;
  const raising = hasAccess ? [accessCx] : [];

  /* ---------------------------------------------------------- the contract */
  const unitsWithBody = plan.units.filter((u) => !plan.units.some((p) => p.part?.parent === u.id));
  const parentsOfParts = plan.units.filter((u) => plan.units.some((p) => p.part?.parent === u.id));
  const reservedNames = new Set(['run', 'run_with_state', 'run_steps', 'check_selection', 'load_input', 'constructor', 'mo_access', 'ms_input', 'mt_messages', 'ty_run_selection', 'ty_run_input', 'ty_run_result']);
  const contract = readRapContract(facts, reservedNames);
  const attributeNames = new Set([...contract.globals.map((g) => g.name), ...contract.selection.map((f) => f.name), ...contract.constantNames]);
  const takenMethod = new Set<string>([...attributeNames, 'run', 'run_with_state', 'check_selection', 'load_input', 'constructor', 'mo_access', 'ms_input', 'mt_messages']);
  const methodOf = new Map<string, string>();
  for (const u of plan.units) {
    let name = u.rapName;
    for (let i = 2; takenMethod.has(name); i++) name = `${u.rapName.slice(0, 27)}_${i}`;
    takenMethod.add(name);
    methodOf.set(u.id, name);
  }
  const unitById = new Map(plan.units.map((u) => [u.id, u]));
  const statementIndexAt = new Map<number, number>();
  facts.statements.forEach((st, i) => {
    if (!statementIndexAt.has(st.lineStart)) statementIndexAt.set(st.lineStart, i);
  });

  // ---- the routines' parameters (a split part takes its parent's, and the parent's locals as one structure)
  const paramsOf = new Map<string, RapParam[]>();
  const localTypes: string[] = [];
  for (const u of plan.units) {
    if (u.kind !== 'routine' || u.part) continue;
    paramsOf.set(u.id, u.routine ? contract.scopeOf(u.routine).params : []);
  }
  for (const parent of parentsOfParts) {
    const scope = parent.routine ? contract.scopeOf(parent.routine) : null;
    const typeName = `ty_${methodOf.get(parent.id)!.slice(0, 18)}_local`;
    const comps = scope ? [...scope.locals].filter(([n, ph]) => ph && !scope.params.some((p) => p.name === n) && !n.startsWith('<')) : [];
    if (comps.length > 0) localTypes.push(`TYPES BEGIN OF ${typeName}`, ...comps.map(([n, ph]) => `TYPES ${n} ${ph}`), `TYPES END OF ${typeName}`);
    for (const part of plan.units.filter((p) => p.part?.parent === parent.id)) {
      paramsOf.set(part.id, [
        ...(paramsOf.get(parent.id) ?? []).map((p) => ({ ...p })),
        ...(comps.length > 0 ? [{ name: 'cs_local', direction: 'changing' as const, phrase: `TYPE ${typeName}`, original: `the locals of ${parent.routine ?? parent.fn}` }] : []),
      ]);
    }
  }

  // ---- inputs: the globals the original's demo-data routines fill (they are not carried; the caller hands them in)
  const fixtureRanges = plan.notCarried.filter((n) => n.reason === 'fixture');
  const fixtureStatements = facts.statements.filter((st) => fixtureRanges.some((r) => st.lineStart >= r.lineStart && st.lineStart <= r.lineEnd));
  const filledIn = (statements: readonly AbapStatement[], name: string) => {
    const n = escapeRe(name);
    return statements.some(
      (st) =>
        new RegExp(`\\b(?:TO|INTO(?:\\s+TABLE)?)\\s+@?${n}(?![\\w-])`, 'i').test(st.text) ||
        new RegExp(`^${n}(?:-[\\w/]+)*\\s*=`, 'i').test(st.text) ||
        new RegExp(`^(?:MODIFY|DELETE|SORT|CLEAR)\\s+${n}(?![\\w-])`, 'i').test(st.text),
    );
  };
  const inputs = contract.globals.filter((g) => filledIn(fixtureStatements, g.name));
  const fixtureNames = fixtureRanges.map((r) => r.routine);

  // ---- predicates: one per carried guard, the original's condition where it reads only declared names
  interface Predicate {
    guard: PlanGuard;
    name: string;
    params: Array<{ name: string; phrase: string; arg: string }>;
    condition: string | null;
    why: string | null;
  }
  const predicates = new Map<string, Predicate>();
  const routineOfLine = (line: number) =>
    facts.blocks.containers.filter((c) => (c.kind === 'form' || c.kind === 'method') && line >= c.lineStart && line <= c.lineEnd).sort((a, b) => b.lineStart - a.lineStart)[0] ?? null;
  for (const g of carried) {
    const routine = routineOfLine(g.line);
    const scope = routine ? contract.scopeOf(routine.name) : null;
    const condition = fullCondition(facts.statements, g);
    const { operands, unsupported } = conditionOperands(condition);
    const params: Predicate['params'] = [];
    let why: string | null = unsupported;
    const replace: Array<{ start: number; end: number; text: string }> = [];
    for (const o of operands) {
      if (why) break;
      const base = o.base;
      const local = scope?.locals.get(base);
      if (base === 'sy') {
        const field = o.component.slice(1).split('-')[0].toLowerCase();
        if (STATEMENT_SY.has(field)) {
          const pname = `iv_sy_${field}`;
          if (!params.some((p) => p.name === pname)) params.push({ name: pname, phrase: 'TYPE i', arg: `sy-${field}` });
          replace.push({ start: o.start, end: o.end, text: pname });
        }
        continue;
      }
      if (base === 'text' && o.component) {
        why = 'it reads a text symbol';
        break;
      }
      if (local === undefined && (attributeNames.has(base) || contract.constantNames.has(base))) {
        const sel = contract.selection.find((f) => f.name === base);
        if (sel && sel.kind === 'range' && /^-(?:sign|option|low|high)\b/i.test(o.component)) {
          // The select-option's header line in the original: the predicate takes the row.
          const pname = `${base}_line`.slice(0, 30);
          const rangeType = contract.paramPhrase(sel.phrase, base).replace(/^TYPE\s+/i, '');
          if (!params.some((p) => p.name === pname)) params.push({ name: pname, phrase: contract.paramPhrase(`TYPE LINE OF ${rangeType}`, pname), arg: `<a row of ${base}>` });
          replace.push({ start: o.start, end: o.start + base.length, text: pname });
        }
        continue;
      }
      if (local === undefined) {
        why = `${o.token} is not declared where the original checks`;
        break;
      }
      if (!local) {
        why = `the type of ${base} is not one the class can name`;
        break;
      }
      const generic = /^TYPE\s+(?:any|data|c|n|x|p|clike|csequence|numeric|simple|(?:STANDARD\s+|ANY\s+|INDEX\s+)?TABLE)$/i.test(local);
      if (generic && o.component) {
        why = `${base} has a generic type and the condition reads its components`;
        break;
      }
      const pname = base.replace(/^<(.+)>$/, '$1').slice(0, 30);
      if (!params.some((p) => p.name === pname)) params.push({ name: pname, phrase: contract.paramPhrase(local, pname), arg: base });
      if (pname !== base) replace.push({ start: o.start, end: o.start + base.length, text: pname });
    }
    let rewritten: string | null = null;
    if (!why) {
      rewritten = condition;
      for (const r of [...replace].sort((a, b) => b.start - a.start)) rewritten = rewritten.slice(0, r.start) + r.text + rewritten.slice(r.end);
    }
    predicates.set(g.id, { guard: g, name: predicateName(g), params, condition: rewritten, why });
  }
  const callOf = (p: Predicate) => (p.params.length ? `${p.name}( ${p.params.map((x) => `${x.name} = ${x.arg}`).join(' ')} )` : `${p.name}( )`);

  // ---- who calls each guard: the engine where that is exact, else the body at the original's line
  const pureRefusal = (g: PlanGuard): boolean => {
    const i = statementIndexAt.get(g.line);
    if (i === undefined || facts.statements[i].keyword !== 'IF') return false;
    const block = facts.blocks.blocks.find((b) => b.kind === 'if' && b.openIndex === i);
    if (!block) return false;
    const depth = (facts.blocks.enclosing[i]?.length ?? 0) + 1;
    const children = facts.statements.slice(i + 1, block.closeIndex).filter((_, k) => (facts.blocks.enclosing[i + 1 + k]?.length ?? 0) === depth);
    if (children.length !== 1 || children[0].lineStart !== g.endingLine) return false;
    if ((facts.blocks.enclosing[i] ?? []).some((b) => b.kind === 'loop' || b.kind === 'do' || b.kind === 'while' || b.kind === 'select')) return false;
    return g.outcome === 'refuses' || (g.outcome === 'stops' && (g.effect === 'return' || g.effect === 'exit'));
  };
  const engineCalled = new Map<string, 'entry' | 'selection'>();
  for (const g of carried) {
    const p = predicates.get(g.id)!;
    if (p.condition === null || !pureRefusal(g)) continue;
    const u = g.unitId ? unitById.get(g.unitId) : null;
    if (!u) continue;
    if (g.placement === 'selection') {
      engineCalled.set(g.id, 'selection');
      continue;
    }
    if (g.placement !== 'entry') continue;
    // At the entry only what the method already has: its IMPORTING parameters (the attributes and constants need none).
    const routine = routineOfLine(g.line);
    if (u.kind !== 'orchestrator' && routine?.name !== u.routine) continue;
    if (u.kind === 'orchestrator' && routine) continue;
    const own = paramsOf.get(u.id) ?? [];
    if (!p.params.every((x) => own.some((o) => o.name === x.name && o.direction === 'importing') && x.arg === x.name)) continue;
    // Exactly where the original checks: nothing but declarations, and checks the engine already calls, comes before it.
    const container = routine ?? facts.blocks.containers.find((c) => c.kind === 'event' && g.line >= c.lineStart && g.line <= c.lineEnd) ?? null;
    if (!container) continue;
    const at = statementIndexAt.get(g.line)!;
    const level = facts.blocks.enclosing[at]?.length ?? 0;
    let exact = true;
    for (let k = statementIndexAt.get(container.lineStart) ?? 0; k < at && exact; k++) {
      const st = facts.statements[k];
      if (st.lineStart <= container.lineStart || (facts.blocks.enclosing[k]?.length ?? 0) !== level) continue;
      if (/^(?:DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|STATICS|ENDIF)$/i.test(st.keyword)) continue;
      const earlier = carried.find((x) => x.line === st.lineStart);
      if (earlier && engineCalled.get(earlier.id) === 'entry') continue;
      exact = false;
    }
    if (exact) engineCalled.set(g.id, 'entry');
  }
  const endingText = (g: PlanGuard) => facts.statements.find((st) => st.lineStart === g.endingLine && st.lineStart > g.line - 1 && /^(?:MESSAGE|RAISE|LEAVE|STOP)/i.test(st.keyword))?.text ?? g.ending;
  const ending = (g: PlanGuard): string =>
    g.outcome === 'refuses' ? `RAISE EXCEPTION NEW ${refusal}( guard = '${g.id}' text = ${quote(refusalText(endingText(g)))} ).` : 'RETURN.';

  // ---- check_selection: the original's AT SELECTION-SCREEN, as far as the engine can write it exactly
  const selectionEvents = facts.blocks.containers.filter((c) => c.kind === 'event' && /^AT SELECTION-SCREEN$/i.test(c.name.trim()));
  const selectionLines: string[] = [];
  const selectionLeft: string[] = [];
  for (const ev of selectionEvents) {
    const top = facts.statements.filter((st, i) => st.lineStart > ev.lineStart && st.lineStart <= ev.lineEnd && (facts.blocks.enclosing[i]?.length ?? 0) === 0);
    const lines: string[] = [];
    let skipUntil = 0;
    for (const st of top) {
      if (st.lineStart <= skipUntil) continue;
      const perform = /^PERFORM\s+([\w/-]+)\s*$/i.exec(st.text);
      if (perform) {
        const target = plan.units.find((u) => u.routine === perform[1].toUpperCase() && (paramsOf.get(u.id) ?? []).length === 0);
        if (target) {
          lines.push(`    ${methodOf.get(target.id)}( ).`);
          continue;
        }
      }
      const g = carried.find((x) => x.line === st.lineStart && engineCalled.get(x.id) === 'selection');
      if (g) {
        lines.push(`    IF ${callOf(predicates.get(g.id)!)} = abap_true.`, `      ${ending(g)}`, '    ENDIF.');
        const i = statementIndexAt.get(st.lineStart)!;
        const block = facts.blocks.blocks.find((b) => b.kind === 'if' && b.openIndex === i);
        skipUntil = block ? facts.statements[block.closeIndex].lineStart : st.lineStart;
        continue;
      }
      selectionLeft.push(`L${st.lineStart}`);
    }
    if (lines.length > 0) selectionLines.push(`    " ${ev.name} (L${ev.lineStart}): the original's checks of the selection, before any step.`, ...lines);
  }
  if (selectionLines.length > 0 && selectionLeft.length > 0) selectionLines.push(`    " Not written here, ported by run_steps: ${selectionLeft.slice(0, 12).join(', ')}.`);
  // A selection guard the engine did not write runs where run_steps ports the event.
  for (const g of carried) if (g.placement === 'selection' && !selectionLines.some((l) => l.includes(`'${g.id}'`))) engineCalled.delete(g.id);

  // ---- every guard a body must call itself
  const required: Record<string, RequiredGuard[]> = {};
  for (const u of unitsWithBody) {
    const ids = u.guards.filter((id) => carried.some((g) => g.id === id) && !engineCalled.has(id));
    if (ids.length === 0) continue;
    required[u.id] = requiredGuardsOf({ ...u, bodyCalls: ids }, plan, 'rap', facts.statements);
  }

  // ---- the access layer: a method per SAP object, a call's parameters typed from its call sites
  const typeRef = (phrase: string) => {
    const named = simpleTypeName(phrase);
    return named && contract.typeNames.has(named.toLowerCase()) ? `TYPE ${logic}=>${named}` : phrase;
  };
  const accessMethods: AccessMethod[] = access.points.map((point) => {
    if (point.kind === 'read') {
      return {
        point,
        params: [
          { name: 'is_selection', direction: 'importing', phrase: `TYPE ${logic}=>ty_run_selection`, original: "the run's selection", optional: true },
          { name: 'ct_rows', direction: 'changing', phrase: 'TYPE STANDARD TABLE', original: 'the rows read', optional: false },
        ],
      };
    }
    if (point.kind === 'write') return { point, params: [{ name: 'it_rows', direction: 'importing', phrase: 'TYPE STANDARD TABLE', original: 'the rows written', optional: false }] };
    const sites = point.lines.map((line) => facts.statements.find((st) => st.lineStart === line && /^CALL\s+FUNCTION\b/i.test(st.text))).filter((x): x is AbapStatement => !!x);
    const byFormal = new Map<string, AccessParam & { count: number }>();
    for (const st of sites) {
      const routine = routineOfLine(st.lineStart);
      const scope = routine ? contract.scopeOf(routine.name) : null;
      for (const pair of callFunctionPairs(st.text)) {
        const formal = pair.formal.replace(/[^a-z0-9_]/g, '_').slice(0, 30);
        const hit = byFormal.get(formal);
        if (hit) {
          hit.count++;
          continue;
        }
        const actual = pair.actual.replace(/^@/, '');
        const base = actual.toLowerCase().split('-')[0];
        let phrase: string | null = null;
        if (/^'/.test(actual) || /^`/.test(actual)) phrase = 'TYPE csequence';
        else if (/^-?\d+$/.test(actual)) phrase = 'TYPE i';
        else {
          const declared = scope?.locals.get(base) || contract.globalScope.get(base) || null;
          if (declared && !actual.includes('-')) phrase = contract.resolve(declared, scope?.locals);
        }
        const tableParam = pair.section === 'tables';
        const inline = phrase ? contract.paramPhrase(phrase, formal, tableParam ? 'table' : 'any') : tableParam ? 'TYPE STANDARD TABLE' : 'TYPE any';
        byFormal.set(formal, {
          name: formal,
          // What the function module returns comes back through CHANGING: the caller hands in its own variable, as at the call site.
          direction: pair.section === 'exporting' ? 'importing' : 'changing',
          phrase: typeRef(inline),
          original: `${pair.section.toUpperCase()} ${pair.formal} = ${pair.actual}`,
          optional: false,
          count: 1,
        });
      }
    }
    const params = [...byFormal.values()].map(({ count, ...p }) => ({ ...p, optional: count < sites.length }));
    return { point, params };
  });
  const accessNames = accessMethods.map((m) => m.point.method);
  const accessSignature = (m: AccessMethod) => {
    const imp = m.params.filter((p) => p.direction === 'importing');
    const chg = m.params.filter((p) => p.direction === 'changing');
    const lines = [`  METHODS ${m.point.method}`];
    if (imp.length) lines.push('    IMPORTING', ...imp.map((p) => `      ${p.name} ${p.phrase}${p.optional ? ' OPTIONAL' : ''}`));
    if (chg.length) lines.push('    CHANGING', ...chg.map((p) => `      ${p.name} ${p.phrase}${p.optional ? ' OPTIONAL' : ''}`));
    lines.push(`    RAISING ${accessCx}.`);
    return lines;
  };

  /* ------------------------------------------------------- the golden master */
  // The original's demo cases as ABAP Unit test data (golden-master.ts, 3.0.13 item 6). The test drives
  // run_with_state: the selection and the original's tables in one structure (ty_run_result), the run's globals out.
  const golden = goldenMasterForScaffold(facts.source, {
    logicClass: logic,
    runMethod: 'run_with_state',
    selectionType: 'ty_run_selection',
    stateType: 'ty_run_result',
    accessDouble: hasAccess ? 'ltd_access' : null,
    selection: contract.selection.map((f) => ({ original: f.name.toUpperCase(), component: f.name, range: f.kind === 'range' })),
    stateComponents: contract.globals.map((g) => g.name),
    program: plan.program,
  });
  const demoFlag = golden?.master.demoFlag ? contract.selection.find((f) => f.name === golden.master.demoFlag!.toLowerCase() && f.kind === 'parameter') : undefined;

  /* ------------------------------------------------------- the logic class */
  const defs: string[] = [];
  const impls: string[] = [];
  const privateDefs: string[] = [];
  const signatures: Record<string, string> = {};
  const unitDoc = (u: Unit): string[] => {
    const rules = u.rules.map((id) => `${id} (${plan.rules.find((r) => r.id === id)?.decision ?? 'open'})`);
    const own = (required[u.id] ?? []).map((r) => `${predicateName({ id: r.id })} (L${r.line})`);
    return [
      `    "! ${docText(u.title)}. ABAP: ${rangeWords(u.abap.slice(0, 1))}${u.routine ? ` (${u.kind === 'method' ? 'METHOD' : 'FORM'} ${u.routine})` : ' (the event blocks)'}${u.folded.length ? `; folded: ${u.folded.join(', ')}` : ''}.`,
      `    "! Rules: ${rules.join(', ') || 'none'}. Unit ${u.id}: frame by the engine, body a model proposal.`.slice(0, 250),
      ...(own.length > 0 ? [`    "! The body calls, where the original checks: ${own.join(', ')}.`.slice(0, 250)] : []),
    ];
  };
  defs.push(
    ...(hasAccess
      ? [
          `    "! Takes the access layer, so ABAP Unit can pass a test double; without one, ${accessCl}. No counterpart in the original.`,
          `    METHODS constructor IMPORTING io_access TYPE REF TO ${accessIf} OPTIONAL.`,
        ]
      : []),
    `    "! Runs ${docText(program)}: sets the selection, runs the selection checks and the process steps in the original's`,
    '    "! order, and returns every global of the original. No counterpart in the original as one routine.',
    ...methodsStatement(
      'run',
      [
        { name: 'is_selection', direction: 'importing', phrase: 'TYPE ty_run_selection', original: '' },
        ...(inputs.length > 0 ? [{ name: 'is_input', direction: 'importing' as const, phrase: 'TYPE ty_run_input OPTIONAL', original: '' }] : []),
      ],
      { returning: 'rs_result TYPE ty_run_result', raising },
    ),
    "    \"! The run as ABAP Unit drives it with the original's demo cases: the selection, and the original's tables in cs_st;",
    '    "! cs_st holds every global of the original afterwards. No counterpart in the original.',
    ...methodsStatement(
      'run_with_state',
      [
        { name: 'is_sel', direction: 'importing', phrase: 'TYPE ty_run_selection', original: '' },
        { name: 'cs_st', direction: 'changing', phrase: 'TYPE ty_run_result', original: '' },
      ],
      { raising },
    ),
  );
  impls.push(
    '  METHOD run_with_state.',
    '    DATA(ls_sel) = is_sel.',
    ...(demoFlag ? [`    " The test hands in the data the original's demo routines build: the run takes the original's demo path (${demoFlag.name.toUpperCase()}).`, `    ls_sel-${demoFlag.name} = 'X'.`] : []),
    `    cs_st = run( is_selection = ls_sel${inputs.length > 0 ? ' is_input = CORRESPONDING #( cs_st )' : ''} ).`,
    '  ENDMETHOD.',
    '',
  );
  impls.push(
    '  METHOD run.',
    ...contract.selection.map((f) => `    ${f.name} = is_selection-${f.name}.`),
    ...(inputs.length > 0 ? ['    ms_input = is_input.'] : []),
    '    CLEAR mt_messages.',
    ...(selectionLines.length > 0 ? ['    check_selection( ).'] : []),
    `    ${methodOf.get('U00') ?? 'run_steps'}( ).`,
    ...contract.globals.map((g) => `    rs_result-${g.name} = ${g.name}.`),
    '    rs_result-messages = mt_messages.',
    '  ENDMETHOD.',
    '',
  );
  if (selectionLines.length > 0) {
    privateDefs.push(...methodsStatement('check_selection', [], { raising }));
    impls.push('  METHOD check_selection.', ...selectionLines, '  ENDMETHOD.', '');
  }
  if (inputs.length > 0) {
    privateDefs.push('    METHODS load_input.');
    impls.push(
      '  METHOD load_input.',
      `    " Where the original runs its demo-data routines (${fixtureNames.slice(0, 6).join(', ')}): the caller's input instead.`,
      ...inputs.map((g) => `    ${g.name} = ms_input-${g.name}.`),
      '  ENDMETHOD.',
      '',
    );
  }

  const regionNames: Record<string, AbapRegionNames> = {};
  const allMethods = [
    ...new Set([
      'run',
      'run_with_state',
      ...(selectionLines.length ? ['check_selection'] : []),
      ...(inputs.length ? ['load_input'] : []),
      ...(hasAccess ? ['constructor'] : []),
      ...plan.units.map((u) => methodOf.get(u.id)!),
      ...[...predicates.values()].map((p) => p.name),
    ]),
  ];
  const attributesList = [...attributeNames, ...(hasAccess ? ['mo_access'] : []), ...(inputs.length ? ['ms_input'] : []), 'mt_messages'];

  for (const u of [...unitsWithBody, ...parentsOfParts]) {
    const name = methodOf.get(u.id)!;
    const params = paramsOf.get(u.id) ?? [];
    const stmt = methodsStatement(name, params, { raising });
    signatures[u.id] = signatureLine(stmt);
    defs.push(...unitDoc(u), ...stmt);
    impls.push(`  METHOD ${name}.`);
    // Guards the engine calls at the entry, before the body.
    for (const id of u.guards) {
      if (engineCalled.get(id) !== 'entry') continue;
      const g = carried.find((x) => x.id === id)!;
      impls.push(`    " ${g.id}${g.rule ? ` ${g.rule}` : ''} L${g.line}: the original's check, at the entry.`, `    IF ${callOf(predicates.get(id)!)} = abap_true.`, `      ${ending(g)}`, '    ENDIF.');
    }
    if (parentsOfParts.includes(u)) {
      const parts = plan.units.filter((p) => p.part?.parent === u.id).sort((a, b) => a.part!.index - b.part!.index);
      const hasLocal = (paramsOf.get(parts[0].id) ?? []).some((p) => p.name === 'cs_local');
      if (hasLocal) impls.push(`    DATA ls_local TYPE ty_${name.slice(0, 18)}_local.`);
      for (const part of parts) {
        const pp = paramsOf.get(part.id) ?? [];
        const exp = pp.filter((p) => p.direction === 'importing').map((p) => `${p.name} = ${p.name}`);
        const chg = pp.filter((p) => p.direction === 'changing').map((p) => `${p.name} = ${p.name === 'cs_local' ? 'ls_local' : p.name}`);
        impls.push(`    ${methodOf.get(part.id)}(${exp.length ? ` EXPORTING ${exp.join(' ')}` : ''}${chg.length ? ` CHANGING ${chg.join(' ')}` : ''} ).`);
      }
    } else {
      const anchor = `${name}|${u.abap.map((a) => `${a.lineStart}-${a.lineEnd}`).join(',')}|${u.rules.join(',')}|${u.guards.join(',')}`;
      impls.push(regionText('rap', u.id, anchor, '    ', `RAISE EXCEPTION NEW ${cx}( unit = '${u.id}' ).`));
      const callees = u.callees.map((id) => methodOf.get(id) ?? id);
      const preds = u.guards.filter((id) => predicates.has(id)).map((id) => predicates.get(id)!.name);
      available[u.id] = [logic, 'me', ...(hasAccess ? ['mo_access'] : []), ...callees, ...preds, ...(u.kind === 'orchestrator' && inputs.length ? ['load_input'] : []), refusal];
      regionNames[u.id] = { attributes: attributesList, params: params.map((p) => p.name), methods: allMethods, access: accessNames };
    }
    impls.push('  ENDMETHOD.', '');
  }

  // ---- predicates (private): the engine writes the original's condition; a fill region only where it cannot
  for (const p of predicates.values()) {
    const g = p.guard;
    const stmt = methodsStatement(
      p.name,
      p.params.map((x) => ({ name: x.name, direction: 'importing' as const, phrase: x.phrase, original: '' })),
      { returning: 'rv_holds TYPE abap_bool' },
    );
    privateDefs.push(`    " ${g.id} · ${g.rule ?? 'no rule'} (${g.decision}) · L${g.line}: ${docText(g.condition).slice(0, 180)}`, ...stmt);
    signatures[g.regionId ?? g.id] = signatureLine(stmt);
    impls.push(`  METHOD ${p.name}.`);
    if (p.condition !== null) {
      impls.push(`    " The original's condition at L${g.line}, as it writes it.`, `    rv_holds = xsdbool( ${p.condition} ).`);
    } else {
      impls.push(`    " Not written by the engine: ${docText(p.why ?? 'the condition reads names the class does not declare')}.`);
      impls.push(regionText('rap', g.regionId!, `${p.name}|${g.line}|${g.condition}`, '    ', `RAISE EXCEPTION NEW ${cx}( unit = '${g.regionId}' ).`));
      available[g.regionId!] = [logic, 'me'];
      regionNames[g.regionId!] = { attributes: attributesList, params: p.params.map((x) => x.name), methods: allMethods, access: [] };
    }
    impls.push('  ENDMETHOD.', '');
  }

  const typesBlock = [
    ...(contract.types.length > 0 ? [`    " The original's types, as it declares them.`] : []),
    ...contract.types.map((t) => `    ${t}.`),
    ...(contract.constants.length > 0 ? ["    \" The original's constants."] : []),
    ...contract.constants.map((c) => `    ${c}.`),
    ...(contract.namedTypes.length + localTypes.length > 0 ? ['    " Types the method parameters need, named by the engine.'] : []),
    ...contract.namedTypes.map((t) => `    ${t}.`),
    ...localTypes.map((t) => `    ${t}.`),
    "    \" The run's selection: the original's PARAMETERS and SELECT-OPTIONS under their names.",
    '    TYPES BEGIN OF ty_run_selection.',
    ...(contract.selection.length > 0 ? contract.selection.map((f) => `    TYPES ${f.name} ${f.phrase}.`) : ['    TYPES no_selection TYPE c LENGTH 1.']),
    '    TYPES END OF ty_run_selection.',
    ...(inputs.length > 0
      ? [
          `    " The run's input: what the original's demo-data routines (${fixtureNames.slice(0, 6).join(', ')}) fill - not carried; the caller hands it in.`,
          '    TYPES BEGIN OF ty_run_input.',
          ...inputs.map((g) => `    TYPES ${g.name} ${g.phrase}.`),
          '    TYPES END OF ty_run_input.',
        ]
      : []),
    "    \" The run's result: every global of the original, and the messages it showed.",
    '    TYPES BEGIN OF ty_run_result.',
    ...contract.globals.map((g) => `    TYPES ${g.name} ${g.phrase}.`),
    '    TYPES messages TYPE string_table.',
    '    TYPES END OF ty_run_result.',
  ];
  const privateData = [
    ...(hasAccess ? ['    "! The access layer: every SAP read, write and call of the original goes through it (rule 25).', `    DATA mo_access TYPE REF TO ${accessIf}.`] : []),
    ...(contract.selection.length > 0 ? ["    \" The original's selection inputs, under their names."] : []),
    ...contract.selection.map((f) => `    DATA ${f.name} ${f.phrase}.`),
    ...(contract.globals.length > 0 ? ["    \" The original's globals, under their names."] : []),
    ...contract.globals.map((g) => `    DATA ${g.name} ${g.phrase}.`),
    ...(inputs.length > 0 ? ['    DATA ms_input TYPE ty_run_input.'] : []),
    "    \" What the original showed as a message (TYPE 'I', 'S', 'W'): one line each, in order.",
    '    DATA mt_messages TYPE string_table.',
    ...(contract.skipped.length > 0 ? [`    " Not carried as a declaration (no ABAP Cloud counterpart): ${contract.skipped.slice(0, 8).map((x) => `L${x.line}`).join(', ')}.`] : []),
  ];
  const accessImpl = hasAccess ? ['  METHOD constructor.', `    mo_access = COND #( WHEN io_access IS BOUND THEN io_access ELSE NEW ${accessCl}( ) ).`, '  ENDMETHOD.', ''] : [];
  files.push({
    path: `src/${logic}.clas.abap`,
    owner: 'fill',
    content: [
      head,
      `"! The logic of ${docText(program)}: the original's routines as methods, its globals and selection inputs as attributes.`,
      `CLASS ${logic} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
      '  PUBLIC SECTION.',
      // The original's DEFAULT KEY stays (SORT and DELETE ADJACENT DUPLICATES without BY read it); the pseudo comment says it is deliberate.
      ...typesBlock.map(keptDefaultKey),
      ...defs,
      '  PRIVATE SECTION.',
      ...privateData.map(keptDefaultKey),
      ...privateDefs,
      'ENDCLASS.',
      '',
      `CLASS ${logic} IMPLEMENTATION.`,
      '',
      ...accessImpl,
      ...impls,
      'ENDCLASS.',
      '',
    ].join('\n'),
  });

  // ---- what a fill request names per unit: the declarations its body reads (3.0.13 item 3)
  const unitTypes: Record<string, string> = {};
  const mentions = (text: string, name: string) => new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w])`, 'i').test(text);
  for (const u of unitsWithBody) {
    const slice = sliceFor(u, plan, facts);
    const text = `${slice.text}\n${slice.declarations}\n${signatures[u.id] ?? ''}`;
    const wantTypes = new Set<string>();
    const addType = (name: string, depth = 0) => {
      const n = name.toLowerCase();
      if (wantTypes.has(n) || depth > 6 || !contract.typeNames.has(n)) return;
      wantTypes.add(n);
      const def = typeDefinition(contract, n);
      if (def === 'STRUCTURE') {
        for (const c of structureComponents(contract, n) ?? []) for (const t of c.phrase.match(/[\w/]+/g) ?? []) addType(t, depth + 1);
      } else if (def) for (const t of def.match(/[\w/]+/g) ?? []) addType(t, depth + 1);
    };
    for (const n of contract.typeNames) if (mentions(text, n)) addType(n);
    const attrs = [...contract.selection.map((f) => ({ name: f.name, phrase: f.phrase })), ...contract.globals].filter((a) => mentions(text, a.name));
    for (const a of attrs) for (const t of a.phrase.match(/[\w/]+/g) ?? []) addType(t);
    for (const id of u.callees) for (const p of paramsOf.get(id) ?? []) for (const t of p.phrase.match(/[\w/]+/g) ?? []) addType(t);
    for (const id of u.guards) for (const p of predicates.get(id)?.params ?? []) for (const t of p.phrase.match(/[\w/]+/g) ?? []) addType(t);
    // The class's type statements of the wanted types, a structure with its components.
    const typeLines: string[] = [];
    let inside: string | null = null;
    let depth = 0;
    for (const t of [...contract.types, ...contract.namedTypes]) {
      const begin = /^TYPES BEGIN OF ([\w/]+)$/i.exec(t);
      const end = /^TYPES END OF ([\w/]+)$/i.exec(t);
      if (inside !== null) {
        if (inside !== '-') typeLines.push(`${t}.`);
        if (begin) depth++;
        else if (end) {
          if (depth === 0) inside = null;
          else depth--;
        }
        continue;
      }
      if (begin) {
        inside = wantTypes.has(begin[1].toLowerCase()) ? begin[1].toLowerCase() : '-';
        depth = 0;
        if (inside !== '-') typeLines.push(`${t}.`);
        continue;
      }
      const own = /^TYPES ([\w/]+) /i.exec(t);
      if (own && wantTypes.has(own[1].toLowerCase())) typeLines.push(`${t}.`);
    }
    const consts = contract.constants.filter((c) => {
      const m = /^CONSTANTS (?:BEGIN OF )?([\w/]+)/i.exec(c);
      return !!m && contract.constantNames.has(m[1].toLowerCase()) && mentions(text, m[1]);
    });
    const callees = u.callees.map((id) => signatures[id]).filter(Boolean);
    const preds = u.guards
      .filter((id) => predicates.has(id))
      .map((id) => {
        const p = predicates.get(id)!;
        const by = engineCalled.has(id) ? 'the engine calls it already' : `call it where the original checks (L${p.guard.line}): IF ${callOf(p)} = abap_true. … ENDIF.`;
        return `${signatures[p.guard.regionId ?? id]} " ${id}: ${by}`;
      });
    unitTypes[u.id] = [
      `CLASS ${logic} (engine-written; your body is one METHOD of it):`,
      ...typeLines,
      ...consts.map((c) => `${c}.`),
      ...(attrs.length > 0 ? ["\" Attributes (the original's globals and selection inputs, same names):", ...attrs.map((a) => `DATA ${a.name} ${a.phrase}.`)] : []),
      "DATA mt_messages TYPE string_table. \" where the original shows a message of TYPE 'I', 'S' or 'W': APPEND its text",
      ...(u.kind === 'orchestrator' && inputs.length > 0 ? [`METHODS load_input. " call it where the original runs ${fixtureNames.slice(0, 4).join(', ')}`] : []),
      ...(callees.length > 0 ? ["\" Methods it calls (the original's PERFORMs):", ...callees] : []),
      ...(preds.length > 0 ? ["\" Guards (each returns the original's condition):", ...preds] : []),
      ...(hasAccess ? [`" SAP access, only through mo_access (INTERFACE ${accessIf}):`, ...accessMethods.map((m) => signatureLine(accessSignature(m)).replace(/^METHODS /, 'mo_access->'))] : []),
      `" Where the original refuses (MESSAGE … TYPE 'E'/'A'/'X'): RAISE EXCEPTION NEW ${refusal}( guard = '<guard id or empty>' text = '<the message text>' ).`,
    ].join('\n');
  }

  /* ---------------------------------------------------- the refusal, stubs */
  files.push({
    path: `src/${refusal}.clas.abap`,
    owner: 'engine',
    content: [
      head,
      `"! Where ${docText(program)} refuses its input (MESSAGE … TYPE 'E', 'A' or 'X'): the guard and the original's text.`,
      `CLASS ${refusal} DEFINITION PUBLIC INHERITING FROM cx_no_check FINAL CREATE PUBLIC.`,
      '  PUBLIC SECTION.',
      '    "! The guard of the original that refused (G-0506), or empty.',
      '    DATA guard TYPE string READ-ONLY.',
      "    \"! The original's message text.",
      '    DATA text TYPE string READ-ONLY.',
      "    \"! Raised where the original refuses, with the guard and the original's message. No counterpart in the original.",
      '    METHODS constructor IMPORTING guard TYPE string OPTIONAL text TYPE string OPTIONAL previous LIKE previous OPTIONAL.',
      "    \"! The original's message text.",
      '    METHODS if_message~get_text REDEFINITION.',
      'ENDCLASS.',
      '',
      `CLASS ${refusal} IMPLEMENTATION.`,
      '  METHOD constructor ##ADT_SUPPRESS_GENERATION.',
      '    super->constructor( previous = previous ).',
      '    me->guard = guard.',
      '    me->text = text.',
      '  ENDMETHOD.',
      '',
      '  METHOD if_message~get_text.',
      '    result = text.',
      '  ENDMETHOD.',
      'ENDCLASS.',
      '',
    ].join('\n'),
  });
  files.push({
    path: `src/${cx}.clas.abap`,
    owner: 'engine',
    content: [
      head,
      `CLASS ${cx} DEFINITION PUBLIC INHERITING FROM cx_no_check FINAL CREATE PUBLIC.`,
      '  PUBLIC SECTION.',
      '    "! The unit or guard the generation left as a stub.',
      '    DATA unit TYPE string READ-ONLY.',
      '    "! Raised where a body is still a stub, so an unfinished function never passes for a finished one. No counterpart in the original.',
      '    METHODS constructor IMPORTING unit TYPE string OPTIONAL previous LIKE previous OPTIONAL.',
      'ENDCLASS.',
      '',
      `CLASS ${cx} IMPLEMENTATION.`,
      '  METHOD constructor ##ADT_SUPPRESS_GENERATION.',
      '    super->constructor( previous = previous ).',
      '    me->unit = unit.',
      '  ENDMETHOD.',
      'ENDCLASS.',
      '',
    ].join('\n'),
  });

  /* ------------------------------------------------------- the access layer */
  if (hasAccess) {
    const anchor = (p: AccessPoint) => p.lines.map((l) => `L${l}`).join(', ');
    const verb = (p: AccessPoint) => (p.kind === 'read' ? 'Reads' : p.kind === 'write' ? 'Writes' : 'Calls');
    files.push({
      path: `src/${accessIf}.intf.abap`,
      owner: 'engine',
      content: [
        head,
        `"! Every SAP object ${docText(program)} reads, writes or calls, behind one interface: the logic never calls SAP itself,`,
        '"! so ABAP Unit can replace this layer with a test double, and a released API can replace the original object in one place.',
        ...(access.more.length > 0 ? [`"! Not listed (more than ${access.points.length}): ${access.more.slice(0, 20).join(', ')}.`] : []),
        `INTERFACE ${accessIf} PUBLIC.`,
        ...accessMethods.flatMap((m) => [`  "! ${verb(m.point)} ${m.point.object} where the original does, ${anchor(m.point)}; a failure raises ${accessCx} instead of a return code.`, ...accessSignature(m)]),
        'ENDINTERFACE.',
        '',
      ].join('\n'),
    });
    files.push({
      path: `src/${accessCl}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `"! The default access layer of ${docText(program)}: connect each method to an API SAP has released for ABAP Cloud.`,
        `CLASS ${accessCl} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        `    INTERFACES ${accessIf}.`,
        'ENDCLASS.',
        '',
        `CLASS ${accessCl} IMPLEMENTATION.`,
        '',
        ...accessMethods.flatMap((m) => [
          `  METHOD ${accessIf}~${m.point.method}.`,
          `    " ${OPEN_MARKER} ACCESS: the original ${verb(m.point).toLowerCase()} ${m.point.object} at ${anchor(m.point)}. Connect a released API here (Analyze names`,
          "    \" SAP's successor where its Cloudification Repository has one); until then this raises.",
          `    RAISE EXCEPTION NEW ${accessCx}( object = '${m.point.object}' ).`,
          '  ENDMETHOD.',
          '',
        ]),
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
    files.push({
      path: `src/${accessCx}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `CLASS ${accessCx} DEFINITION PUBLIC INHERITING FROM cx_static_check FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        '    "! The SAP object the access layer could not read, write or call.',
        '    DATA object TYPE string READ-ONLY.',
        '    "! A failed SAP access raises this instead of a return code nobody reads. No counterpart in the original.',
        '    METHODS constructor IMPORTING object TYPE string OPTIONAL previous LIKE previous OPTIONAL.',
        'ENDCLASS.',
        '',
        `CLASS ${accessCx} IMPLEMENTATION.`,
        '  METHOD constructor ##ADT_SUPPRESS_GENERATION.',
        '    super->constructor( previous = previous ).',
        '    me->object = object.',
        '  ENDMETHOD.',
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
  }
  /** `DATA(ls_result) = NEW logic( )->run( … )`, an access failure turned into a refusal. */
  const runCall = (selection: string, indent: string) =>
    hasAccess
      ? [
          `${indent}TRY.`,
          `${indent}    DATA(ls_result) = NEW ${logic}( )->run( is_selection = ${selection} ).`,
          `${indent}  CATCH ${accessCx} INTO DATA(lx_access).`,
          `${indent}    RAISE EXCEPTION NEW ${refusal}( text = 'SAP access failed' previous = lx_access ).`,
          `${indent}ENDTRY.`,
        ]
      : [`${indent}DATA(ls_result) = NEW ${logic}( )->run( is_selection = ${selection} ).`];

  /* --------------------------------------------- the service: query or business object */
  const authWhat =
    checks.length > 0 ? `the original checks ${checkedObjects} (${checks.map((c) => `L${c.lineStart}`).join(', ')})` : 'the original makes no AUTHORITY-CHECK - decide who may run this';
  const selectionParams = contract.selection.filter((f) => f.kind === 'parameter');
  const cdsParams = selectionParams.map((f) => ({ name: f.name, type: cdsType(f.phrase, contract) ?? 'abap.char( 255 )' }));
  let exposed = proj.toUpperCase();
  let exposedAs = 'Records';
  if (architecture === 'custom-entity') {
    // The original's result list: what it hands to the ALV, else the table it lists, else its last structured global table.
    const lineOf = (g: { phrase: string }): string | null => {
      let line = tableLineOf(g.phrase);
      if (!line) {
        const named = simpleTypeName(g.phrase);
        const def = named ? typeDefinition(contract, named) : null;
        line = def ? tableLineOf(def) : null;
      }
      return line && structureComponents(contract, line) ? line : null;
    };
    const outtab = facts.statements.map((st) => /\b(?:t_outtab|it_outtab|t_table)\s*=\s*([\w/]+)/i.exec(st.text)?.[1]?.toLowerCase()).find((n) => n && contract.globals.some((g) => g.name === n)) ?? null;
    const listed = contract.globals.filter((g) => {
      if (!lineOf(g)) return false;
      const loop = facts.statements.find((st) => new RegExp(`^LOOP\\s+AT\\s+${escapeRe(g.name)}\\b`, 'i').test(st.text));
      return !!loop && facts.statements.some((w) => w.keyword === 'WRITE' && w.lineStart > loop.lineStart && w.lineStart < loop.lineStart + 30);
    });
    const resultTable = (outtab ? contract.globals.find((g) => g.name === outtab && lineOf(g)) : undefined) ?? listed[0] ?? [...contract.globals].reverse().find((g) => lineOf(g)) ?? null;
    const comps = resultTable ? structureComponents(contract, lineOf(resultTable)!) ?? [] : [];
    const taken = new Set<string>();
    const elements = comps
      .map((c) => ({ comp: c.name, type: cdsType(c.phrase, contract) }))
      .filter((c): c is { comp: string; type: string } => c.type !== null)
      .map((c) => {
        let name = CDS_RESERVED.has(c.comp) || c.comp === 'row_no' ? `${c.comp}_value`.slice(0, 30) : c.comp;
        for (let i = 2; taken.has(name); i++) name = `${c.comp.slice(0, 26)}_${i}`;
        taken.add(name);
        return { ...c, name };
      });
    files.push({
      path: `src/${entity}.ddls.asddls`,
      owner: 'engine',
      content: [
        `@EndUserText.label: '${`Results of ${program}`.replace(/'/g, '').slice(0, 60)}'`,
        `@ObjectModel.query.implementedBy: 'ABAP:${query.toUpperCase()}'`,
        `define root custom entity ${entity.toUpperCase()}`,
        ...(cdsParams.length > 0 ? ['  with parameters', ...cdsParams.map((p, i) => `    ${p.name} : ${p.type}${i < cdsParams.length - 1 ? ',' : ''}`)] : []),
        '{',
        '  key row_no : abap.int4;',
        ...elements.map((e) => `      ${e.name} : ${e.type};`),
        '}',
        '',
      ].join('\n'),
    });
    const mapping = elements.filter((e) => e.name !== e.comp).map((e) => `${e.name} = ${e.comp}`);
    const ranges = contract.selection.filter((f) => f.kind === 'range');
    files.push({
      path: `src/${query}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `"! The query of ${docText(program)}: runs the logic over the whole input with the selection the request names, and returns`,
        `"! ${resultTable ? `the original's result list (${resultTable.name})` : 'the run'} a row each. Read-only: the original writes no table.`,
        `CLASS ${query} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        '    INTERFACES if_rap_query_provider.',
        '  PRIVATE SECTION.',
        '    METHODS is_read_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
        'ENDCLASS.',
        '',
        `CLASS ${query} IMPLEMENTATION.`,
        '',
        '  METHOD if_rap_query_provider~select.',
        `    DATA lt_data TYPE STANDARD TABLE OF ${entity} WITH EMPTY KEY.`,
        `    DATA ls_selection TYPE ${logic}=>ty_run_selection.`,
        '    IF is_read_granted( ) = abap_false.',
        `      RAISE EXCEPTION NEW ${refusal}( text = 'Not authorized' ).`,
        '    ENDIF.',
        "    \" The entity's parameters are the original's PARAMETERS, under their names.",
        '    LOOP AT io_request->get_parameters( ) INTO DATA(ls_parameter).',
        '      ASSIGN COMPONENT ls_parameter-parameter_name OF STRUCTURE ls_selection TO FIELD-SYMBOL(<lv_value>).',
        '      IF sy-subrc = 0.',
        '        <lv_value> = ls_parameter-value.',
        '      ENDIF.',
        '    ENDLOOP.',
        ...(ranges.length > 0 ? [`    " ${OPEN_MARKER} QUERY: the original's SELECT-OPTIONS ${ranges.map((r) => r.name.toUpperCase()).join(', ')} - map the request's filter (get_filter( )->get_as_ranges( )) to ls_selection.`] : []),
        ...runCall('ls_selection', '    '),
        ...(resultTable ? [`    lt_data = CORRESPONDING #( ls_result-${resultTable.name}${mapping.length ? ` MAPPING ${mapping.join(' ')}` : ''} ).`] : ['    CLEAR ls_result.']),
        '    LOOP AT lt_data ASSIGNING FIELD-SYMBOL(<ls_data>).',
        '      <ls_data>-row_no = sy-tabix.',
        '    ENDLOOP.',
        '    IF io_request->is_total_numb_of_rec_requested( ).',
        '      io_response->set_total_number_of_records( lines( lt_data ) ).',
        '    ENDIF.',
        '    IF io_request->is_data_requested( ).',
        '      DATA(lv_offset) = io_request->get_paging( )->get_offset( ).',
        '      DATA(lv_size) = io_request->get_paging( )->get_page_size( ).',
        '      DATA lt_page LIKE lt_data.',
        '      LOOP AT lt_data INTO DATA(ls_row) FROM lv_offset + 1.',
        '        IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( lt_page ) >= lv_size.',
        '          EXIT.',
        '        ENDIF.',
        '        APPEND ls_row TO lt_page.',
        '      ENDLOOP.',
        '      io_response->set_data( lt_page ).',
        '    ENDIF.',
        '  ENDMETHOD.',
        '',
        '  METHOD is_read_granted.',
        `    " ${OPEN_MARKER} AUTH: reading is denied until you check authorization here (activity '03'); ${authWhat}.`,
        "    \" Failure pattern FP-GUARD-05: a generated path without the original's authorization.",
        '    rv_granted = abap_false.',
        '  ENDMETHOD.',
        '',
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
    exposed = entity.toUpperCase();
    exposedAs = 'Results';
  } else {
    // ---- table (abapGit has no source form of a table: its XML is the whole object), views
    files.push({
      path: `src/${table}.tabl.xml`,
      owner: 'engine',
      content: tablXml(table, `Records of ${program} (Clean-Core.io)`, [
        { name: 'client', key: true, notNull: true, builtin: 'CLNT' },
        { name: 'rec_uuid', key: true, notNull: true, dataElement: 'SYSUUID_X16' },
        ...record.map((f) => declaredTableField(f, contract)),
        { name: 'local_last_changed', dataElement: 'ABP_LOCINST_LASTCHANGE_TSTMPL' },
      ]),
    });
    files.push({
      path: `src/${root}.ddls.asddls`,
      owner: 'engine',
      content: [
        `@AccessControl.authorizationCheck: #CHECK`,
        `@EndUserText.label: 'Root view of ${program}'`,
        `define root view entity ${root.toUpperCase()}`,
        `  as select from ${table}`,
        '{',
        '  key rec_uuid as RecUuid,',
        ...record.map((f) => `      ${abapField(f)}, // ${f.original} ${f.declaration}, L${f.line}`),
        '      @Semantics.systemDateTime.localInstanceLastChangedAt: true',
        '      local_last_changed',
        '}',
        '',
      ].join('\n'),
    });
    files.push({
      path: `src/${proj}.ddls.asddls`,
      owner: 'engine',
      content: [
        `@AccessControl.authorizationCheck: #CHECK`,
        `@EndUserText.label: 'Projection of ${program}'`,
        `define root view entity ${proj.toUpperCase()}`,
        `  provider contract transactional_query`,
        `  as projection on ${root.toUpperCase()}`,
        '{',
        '  key RecUuid,',
        ...record.map((f) => `      ${abapField(f)},`),
        '      local_last_changed',
        '}',
        '',
      ].join('\n'),
    });
    // The action's parameter: the original's PARAMETERS (an abstract entity carries no range).
    files.push({
      path: `src/${param}.ddls.asddls`,
      owner: 'engine',
      content: [
        `@EndUserText.label: 'Selection of ${program}'`,
        `define abstract entity ${param.toUpperCase()}`,
        '{',
        ...(cdsParams.length > 0 ? cdsParams.map((p) => `  ${p.name} : ${p.type};`) : ['  no_selection : abap.char( 1 );']),
        '}',
        '',
      ].join('\n'),
    });
    // ---- access controls: the root grants nothing until a developer writes its condition (C3, FP-GUARD-05)
    const originalChecks =
      checks.length > 0
        ? ['  // The original checks (read by the engine):', ...authorityLines(checks).map((l) => `  //   ${l}`)]
        : ['  // The original makes no AUTHORITY-CHECK: decide who may read these records before you replace the condition.'];
    // SAP sample: SAP-samples/abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#r_traveltp_cd.dcls.asdcls
    // and #dmo#c_traveltp_cd.dcls.asdcls — a mapping role per view, the projection inheriting the root's conditions.
    files.push({
      path: `src/${root}.dcls.asdcls`,
      owner: 'engine',
      content: [
        `@EndUserText.label: 'Access to the records of ${program}'`,
        '@MappingRole: true',
        `define role ${root.toUpperCase()} {`,
        `  // ${OPEN_MARKER} AUTH: fails closed - the condition below holds for no record, so nobody`,
        '  // reads a record until you replace it, for example with',
        "  //   where ( <element> ) = aspect pfcg_auth( <authorization object>, <field>, ACTVT = '03' );",
        '  // using an authorization object of your own or one SAP has released for ABAP Cloud. Failure pattern FP-GUARD-05.',
        '  // Not checked by Clean-Core.io: abaplint has no parser for access controls - activate in ADT.',
        ...originalChecks,
        `  grant select on ${root.toUpperCase()}`,
        '    where false;',
        '}',
        '',
      ].join('\n'),
    });
    files.push({
      path: `src/${proj}.dcls.asdcls`,
      owner: 'engine',
      content: [
        `@EndUserText.label: 'Access to the projection of ${program}'`,
        '@MappingRole: true',
        `define role ${proj.toUpperCase()} {`,
        `  grant select on ${proj.toUpperCase()}`,
        `    where inheriting conditions from entity ${root.toUpperCase()} default false;`,
        '}',
        '',
      ].join('\n'),
    });
    files.push({
      path: `src/${root}.bdef.asbdef`,
      owner: 'engine',
      content: [
        `managed implementation in class ${pool} unique;`,
        'strict ( 2 );',
        '',
        `define behavior for ${root.toUpperCase()} alias Rec`,
        `persistent table ${table}`,
        'lock master',
        // SAP sample: SAP-samples/abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#r_traveltp_cd.bdef.asbdef
        'authorization master ( instance, global )',
        'etag master local_last_changed',
        '{',
        '  create;',
        '  update;',
        '  delete;',
        '  field ( numbering : managed, readonly ) RecUuid;',
        "  // The original's process with its selection: its guards run in the logic class, not as save validations.",
        `  static action run_process parameter ${param.toUpperCase()};`,
        '  mapping for ' + table + ' corresponding { RecUuid = rec_uuid; }',
        '}',
        '',
      ].join('\n'),
    });
    const poolDefs = [
      `CLASS lhc_rec DEFINITION INHERITING FROM cl_abap_behavior_handler.`,
      '  PRIVATE SECTION.',
      '    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION',
      '      IMPORTING REQUEST requested_authorizations FOR Rec RESULT result.',
      '    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION',
      '      IMPORTING keys REQUEST requested_authorizations FOR Rec RESULT result.',
      '    METHODS is_create_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
      '    METHODS is_update_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
      '    METHODS is_delete_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
      '    METHODS is_run_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
      '    METHODS run_process FOR MODIFY IMPORTING keys FOR ACTION Rec~run_process.',
      'ENDCLASS.',
    ];
    // SAP sample: SAP-samples/abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#bp_r_traveltp_cd.clas.locals_imp.abap —
    // global and instance authorization answer per requested operation from is_*_granted helpers that hold the
    // AUTHORITY-CHECK; the scaffold denies until a developer writes the check (fail closed, FP-GUARD-05).
    // An instance denial says it in its result (auth-unauthorized); the global one also reports a message.
    const denied = () =>
      "        APPEND VALUE #( %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = 'Not authorized' ) %global = if_abap_behv=>mk-on ) TO reported-rec.";
    const globalOp = (field: string, granted: string) => [
      `    IF requested_authorizations-${field} = if_abap_behv=>mk-on.`,
      `      result-${field} = COND #( WHEN ${granted}( ) = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).`,
      `      IF result-${field} = if_abap_behv=>auth-unauthorized.`,
      `  ${denied()}`,
      '      ENDIF.',
      '    ENDIF.',
    ];
    const grantedHelper = (op: string, activity: string, what: string) => [
      `  METHOD is_${op}_granted.`,
      `    " ${OPEN_MARKER} AUTH: ${what} is denied until you check authorization here (activity ${activity}); ${authWhat}.`,
      "    \" Failure pattern FP-GUARD-05: a write path without the original's authorization.",
      '    rv_granted = abap_false.',
      '  ENDMETHOD.',
      '',
    ];
    const poolImpls: string[] = [
      'CLASS lhc_rec IMPLEMENTATION.',
      '',
      '  METHOD get_global_authorizations.',
      ...globalOp('%create', 'is_create_granted'),
      ...globalOp('%update', 'is_update_granted'),
      ...globalOp('%delete', 'is_delete_granted'),
      ...globalOp('%action-run_process', 'is_run_granted'),
      '  ENDMETHOD.',
      '',
      '  METHOD get_instance_authorizations.',
      '    DATA(lv_update) = COND #( WHEN requested_authorizations-%update = if_abap_behv=>mk-on AND is_update_granted( ) = abap_true',
      '                              THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).',
      '    DATA(lv_delete) = COND #( WHEN requested_authorizations-%delete = if_abap_behv=>mk-on AND is_delete_granted( ) = abap_true',
      '                              THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).',
      '    LOOP AT keys INTO DATA(key).',
      '      APPEND VALUE #( %tky = key-%tky %update = lv_update %delete = lv_delete ) TO result.',
      '    ENDLOOP.',
      '  ENDMETHOD.',
      '',
      ...grantedHelper('create', "'01'", 'create'),
      ...grantedHelper('update', "'02'", 'update'),
      ...grantedHelper('delete', "'06'", 'delete'),
      ...grantedHelper('run', "'16'", 'running the process'),
      '  METHOD run_process.',
      "    \" The original's process over its whole input, with the selection the caller names: its guards run in the logic.",
      '    LOOP AT keys INTO DATA(ls_key).',
      `      DATA(ls_selection) = CORRESPONDING ${logic}=>ty_run_selection( ls_key-%param ).`,
      '      TRY.',
      `          NEW ${logic}( )->run( is_selection = ls_selection ).`,
      `        CATCH ${refusal}${hasAccess ? ` ${accessCx}` : ''} INTO DATA(lx_failed).`,
      '          APPEND VALUE #( %cid = ls_key-%cid %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = lx_failed->get_text( ) ) ) TO reported-rec.',
      '      ENDTRY.',
      '    ENDLOOP.',
      `    " ${OPEN_MARKER} PROCESS: write what the run decides back to the records (MODIFY ENTITIES … IN LOCAL MODE) where the original writes.`,
      '  ENDMETHOD.',
      '',
      'ENDCLASS.',
    ];
    files.push({ path: `src/${pool}.clas.abap`, owner: 'engine', content: [head, `"! The behavior of ${root.toUpperCase()}.`, `CLASS ${pool} DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF ${root}.`, 'ENDCLASS.', '', `CLASS ${pool} IMPLEMENTATION.`, 'ENDCLASS.', ''].join('\n') });
    files.push({ path: `src/${pool}.clas.locals_imp.abap`, owner: 'engine', content: [head, ...poolDefs, '', ...poolImpls, ''].join('\n') });
  }

  /* ------------------------------------------------- the Application Job (B3) */
  // SAP's current sample (abap-cheat-sheets@d43eb13c 22_Released_ABAP_Classes.md) implements IF_APJ_RT_RUN; the scaffold
  // implements IF_APJ_DT_EXEC_OBJECT and IF_APJ_RT_EXEC_OBJECT, released in every Cloudification Repository release synced
  // into lib/abap/generated/ — IF_APJ_RT_RUN is missing from the Private Cloud 2023 one.
  if (withJob) {
    const selection = plan.fields.filter((f) => f.where === 'selection' && contract.selection.some((c) => c.name === f.original.toLowerCase()));
    const unknownTypes = selection.filter((f) => !jobParameterType(f).known).map((f) => f.original);
    const jobDefs = selection.map((f) => {
      const t = jobParameterType(f);
      return `      ( selname = '${f.original.slice(0, 8)}' kind = if_apj_dt_exec_object=>${f.kind === 'range' ? 'select_option' : 'parameter'} datatype = '${t.datatype}' length = ${t.length}${t.decimals ? ` decimals = ${t.decimals}` : ''} param_text = '${`${f.original} (L${f.line})`.replace(/'/g, "''")}' changeable_ind = abap_true${f.obligatory ? ' mandatory_ind = abap_true' : ''} )`;
    });
    const maps = selection.map((f) =>
      f.kind === 'range'
        ? `        WHEN '${f.original.slice(0, 8)}'.\n          APPEND VALUE #( sign = ls_par-sign option = ls_par-option low = ls_par-low high = ls_par-high ) TO ls_sel-${f.original.toLowerCase()}.`
        : `        WHEN '${f.original.slice(0, 8)}'.\n          ls_sel-${f.original.toLowerCase()} = ls_par-low.`,
    );
    const evidence = [...delivery.background, ...delivery.dialog].slice(0, 4).map((e) => `${e.what} L${e.line}`).join(', ');
    files.push({
      path: `src/${job}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `"! The Application Job of ${docText(program)}: runs the process unattended, as the original did in the background${evidence ? ` (${docText(evidence)})` : ''}.`,
        '"! IF_APJ_DT_EXEC_OBJECT and IF_APJ_RT_EXEC_OBJECT are released in SAP\'s Cloudification Repository; their method signatures are',
        '"! not checked by Clean-Core.io - activate in ADT.',
        `CLASS ${job} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        '    INTERFACES if_apj_dt_exec_object.',
        '    INTERFACES if_apj_rt_exec_object.',
        'ENDCLASS.',
        '',
        `CLASS ${job} IMPLEMENTATION.`,
        '',
        '  METHOD if_apj_dt_exec_object~get_parameters.',
        `    " The original's selection inputs, one job parameter each.${unknownTypes.length > 0 ? ` ${OPEN_MARKER} JOB: check type and length of ${unknownTypes.join(', ')} against the original's declaration.` : ''}`,
        ...(jobDefs.length > 0 ? ['    et_parameter_def = VALUE #(', ...jobDefs, '    ).'] : ['    " The original has no selection input.', '    CLEAR et_parameter_def.']),
        '  ENDMETHOD.',
        '',
        '  METHOD if_apj_rt_exec_object~execute.',
        `    DATA ls_sel TYPE ${logic}=>ty_run_selection.`,
        ...(maps.length > 0 ? ['    LOOP AT it_parameters INTO DATA(ls_par).', '      CASE ls_par-selname.', ...maps, '      ENDCASE.', '    ENDLOOP.'] : []),
        ...runCall('ls_sel', '    '),
        `    " ${OPEN_MARKER} JOB: keep what the original kept of a background run (ls_result) - in an application log (CL_BALI_LOG, released)`,
        '    " or written back where the original writes.',
        '    CLEAR ls_result.',
        '  ENDMETHOD.',
        '',
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
    // SAP sample: SAP-samples/abap-cheat-sheets@d43eb13c 22_Released_ABAP_Classes.md "Application Jobs" — typed constants of
    // CL_APJ_DT_CREATE_CONTENT, an existence check before each create, the long text of CX_APJ_DT_CONTENT.
    const catalog = `Z${s.toUpperCase()}_JOB_CAT`;
    const template = `Z${s.toUpperCase()}_JOB_TMPL`;
    const jobText = `Job of ${program}`.replace(/'/g, "''").slice(0, 60);
    files.push({
      path: `src/${jobSetup}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `"! Creates the job catalog entry ${catalog} and the job template ${template} for ${job.toUpperCase()}: run it once in ADT (F9).`,
        '"! CL_APJ_DT_CREATE_CONTENT is released in SAP\'s Cloudification Repository; its parameters are not checked by Clean-Core.io.',
        `CLASS ${jobSetup} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        '    INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        '',
        `CLASS ${jobSetup} IMPLEMENTATION.`,
        '',
        '  METHOD if_oo_adt_classrun~main.',
        `    " ${OPEN_MARKER} JOB: name your transport request and package before you run this class.`,
        `    CONSTANTS lc_catalog TYPE cl_apj_dt_create_content=>ty_catalog_name VALUE '${catalog}'.`,
        `    CONSTANTS lc_template TYPE cl_apj_dt_create_content=>ty_template_name VALUE '${template}'.`,
        `    CONSTANTS lc_class TYPE cl_apj_dt_create_content=>ty_class_name VALUE '${job.toUpperCase()}'.`,
        `    CONSTANTS lc_text TYPE cl_apj_dt_create_content=>ty_text VALUE '${jobText}'.`,
        "    CONSTANTS lc_transport TYPE cl_apj_dt_create_content=>ty_transport_request VALUE ''.",
        "    CONSTANTS lc_package TYPE cl_apj_dt_create_content=>ty_package VALUE ''.",
        '    DATA(lo_dt) = cl_apj_dt_create_content=>get_instance( ).',
        '    TRY.',
        "        IF lo_dt->exists_job_cat_entry( lc_catalog ) <> 'Y'.",
        '          lo_dt->create_job_cat_entry( iv_catalog_name       = lc_catalog',
        '                                       iv_class_name         = lc_class',
        '                                       iv_text               = lc_text',
        '                                       iv_catalog_entry_type = cl_apj_dt_create_content=>class_based',
        '                                       iv_transport_request  = lc_transport',
        '                                       iv_package            = lc_package ).',
        '        ENDIF.',
        "        IF lo_dt->exists_job_template_entry( lc_template ) <> 'Y'.",
        '          lo_dt->create_job_template_entry( iv_template_name     = lc_template',
        '                                            iv_catalog_name      = lc_catalog',
        '                                            iv_text              = lc_text',
        '                                            iv_transport_request = lc_transport',
        '                                            iv_package           = lc_package ).',
        '        ENDIF.',
        "        out->write( |Job catalog entry { lc_catalog } and template { lc_template } are there.| ).",
        '      CATCH cx_apj_dt_content INTO DATA(lx_content).',
        '        out->write( lx_content->get_longtext( ) ).',
        '    ENDTRY.',
        '  ENDMETHOD.',
        '',
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
  }

  if (withService) files.push({ path: `src/${srvd}.srvd.srvdsrv`, owner: 'engine', content: [`@EndUserText.label: 'Service of ${program}'`, `define service ${srvd.toUpperCase()} {`, `  expose ${exposed} as ${exposedAs};`, '}', ''].join('\n') });

  /* ------------------------------------------------- ABAP Unit: one test method per engine case */
  const testDefs: string[] = [];
  const testImpls: string[] = [];
  const packedByName = new Map(plan.fields.filter((f) => f.kind === 'packed').map((f) => [f.original, f]));
  for (const c of cases.cases) {
    const m = c.id.toLowerCase();
    testDefs.push(`    METHODS ${m} FOR TESTING.`);
    testImpls.push(`  METHOD ${m}.`, `    " ${c.name.replace(/"/g, "'")}`);
    let written = false;
    let variable = 0;
    for (const e of c.engineCase.examples) {
      testImpls.push(`    " given/when: ${e.input.replace(/"/g, "'").slice(0, 200)}`, `    " then: ${e.expected.replace(/"/g, "'").slice(0, 200)}`);
      const call = e.call;
      if (call?.op === 'compute' && call.compute && call.expect.kind === 'equals') {
        const f = packedByName.get(call.compute.field) ?? packedByName.get(call.compute.field.split('-').pop() ?? '');
        if (!f) continue;
        const type = abapType(f);
        const name = `lv_value_${++variable}`;
        testImpls.push(`    DATA ${name} TYPE ${type}.`);
        testImpls.push(`    ${name} = '${call.compute.start}'.`);
        for (const step of call.compute.steps) testImpls.push(`    ${name} = ${name} ${step.op} '${step.b}'.`);
        testImpls.push(`    DATA ${name}_exp TYPE ${type}.`, `    ${name}_exp = '${call.expect.value}'.`);
        testImpls.push(`    cl_abap_unit_assert=>assert_equals( act = ${name} exp = ${name}_exp ).`);
        written = true;
      }
    }
    if (!written) testImpls.push(`    cl_abap_unit_assert=>skip( msg = '${c.id}: runs through the call contract; the ABAP when-line follows the logic class' ).`);
    testImpls.push('  ENDMETHOD.', '');
  }
  files.push({
    path: `src/${logic}.clas.testclasses.abap`,
    owner: 'engine',
    content: [
      head,
      ...(hasAccess
        ? [
            `"! A test double of the access layer: pass NEW ltd_access( ) to the constructor of ${logic} and the logic runs without SAP.`,
            'CLASS ltd_access DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
            '  PUBLIC SECTION.',
            `    INTERFACES ${accessIf} PARTIALLY IMPLEMENTED.`,
            'ENDCLASS.',
            '',
            'CLASS ltd_access IMPLEMENTATION.',
            'ENDCLASS.',
            '',
          ]
        : []),
      '"! Engine cases of the original (TC_ENG_*), derived by Clean-Core.io — not by a model.',
      'CLASS ltc_engine_cases DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
      '  PRIVATE SECTION.',
      ...testDefs,
      'ENDCLASS.',
      '',
      'CLASS ltc_engine_cases IMPLEMENTATION.',
      '',
      ...testImpls,
      'ENDCLASS.',
      '',
      // 3.0.13 (6): the original's own demo cases as test data, one method per case calling the run entry (golden-master.ts).
      ...(golden?.testClass.lines ?? []),
    ].join('\n'),
  });

  /* ------------------------------------------------- abapGit metadata (abapgit-files.ts) */
  const meta: ScaffoldFile[] = [
    { path: '.abapgit.xml', owner: 'engine', content: abapGitRepoSettingsXml() },
    { path: 'src/package.devc.xml', owner: 'engine', content: devcXml(`Clean-Core.io: ${program}`) },
    { path: `src/${logic}.clas.xml`, owner: 'engine', content: clasXml({ name: logic, description: `Logic of ${program}`, withUnitTests: true }) },
    { path: `src/${cx}.clas.xml`, owner: 'engine', content: clasXml({ name: cx, description: `A stub of ${program} that is not filled yet`, category: '40' }) },
    { path: `src/${refusal}.clas.xml`, owner: 'engine', content: clasXml({ name: refusal, description: `A refusal of ${program}`, category: '40' }) },
    ...(architecture === 'custom-entity'
      ? [
          { path: `src/${entity}.ddls.xml`, owner: 'engine' as const, content: ddlsXml(entity, `Results of ${program}`, 'Q') },
          { path: `src/${query}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: query, description: `Query of ${program}` }) },
        ]
      : [
          { path: `src/${root}.ddls.xml`, owner: 'engine' as const, content: ddlsXml(root, `Root view of ${program}`, 'W') },
          { path: `src/${proj}.ddls.xml`, owner: 'engine' as const, content: ddlsXml(proj, `Projection of ${program}`, 'P') },
          { path: `src/${param}.ddls.xml`, owner: 'engine' as const, content: ddlsXml(param, `Selection of ${program}`, 'A') },
          { path: `src/${root}.dcls.xml`, owner: 'engine' as const, content: dclsXml(root, `Access to the records of ${program}`) },
          { path: `src/${proj}.dcls.xml`, owner: 'engine' as const, content: dclsXml(proj, `Access to the projection of ${program}`) },
          { path: `src/${root}.bdef.xml`, owner: 'engine' as const, content: bdefXml(root, `Behavior of the records of ${program}`) },
          { path: `src/${pool}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: pool, description: `Behavior implementation for ${root.toUpperCase()}`, category: '06', behaviorFor: root }) },
        ]),
    ...(hasAccess
      ? [
          { path: `src/${accessIf}.intf.xml`, owner: 'engine' as const, content: intfXml(accessIf, `SAP access of ${program}`) },
          { path: `src/${accessCl}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: accessCl, description: `Default SAP access of ${program}` }) },
          { path: `src/${accessCx}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: accessCx, description: `A failed SAP access of ${program}`, category: '40' }) },
        ]
      : []),
    ...(withJob
      ? [
          { path: `src/${job}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: job, description: `Application Job of ${program}` }) },
          { path: `src/${jobSetup}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: jobSetup, description: `Job catalog entry and template of ${program}` }) },
        ]
      : []),
    ...(withService
      ? [
          { path: `src/${srvd}.srvd.xml`, owner: 'engine' as const, content: srvdXml(srvd, `Service of ${program}`) },
          { path: `src/${srvb}.srvb.xml`, owner: 'engine' as const, content: srvbXml(srvb, `OData V4 UI service of ${program}`, srvd) },
        ]
      : []),
  ];
  files.push(...meta);

  for (const file of files) file.content = defuseMarkers(file.content);
  const guards: RapClassContract['guards'] = {};
  for (const p of predicates.values()) {
    guards[p.guard.id] = { predicate: p.name, call: callOf(p), calledBy: engineCalled.has(p.guard.id) ? 'engine' : 'body', written: p.condition !== null ? 'engine' : 'model' };
  }
  const rap: RapClassContract = { logicClass: logic, refusal, signatures, unitTypes, regions: regionNames, guards, architecture };
  return { track: 'rap', version: SCAFFOLD_VERSION, files, units: plan.units, regions: findRegions(files), digest: scaffoldDigest(files), adapter: null, notCarried: plan.notCarried, available, required, rap };
}

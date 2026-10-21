/**
 * The unit plan of the engine-led transformation (design §7): which functions
 * the generated package has, which ABAP lines each one stands for, which rules
 * and guards it carries, and what is not carried over and why.
 *
 *   - **A unit is a reachable routine** (`FORM`, or a `METHOD` of a local
 *     class), not a process step (§7.1 rule 1; measured: every top-level step
 *     is anchored at its one-line call site).
 *   - **Event blocks** (`START-OF-SELECTION`, `AT SELECTION-SCREEN`, …) and
 *     dialog modules become **one orchestrator unit**, `U00` (rule 2).
 *   - **Tiny helpers fold** into their caller's slice: under 12 lines, no
 *     material rule, no guard, no database write, exactly one caller (rule 3).
 *     The same test as the design's measurement (`scripts/transformation/measure.ts`).
 *   - **Unreachable routines** get no unit (rule 5).
 *   - **Demo-data routines are fixtures** (rule 6, owner 12.10.2026): named
 *     as demo, fixture, test or sample data, or reached only from such a
 *     routine. They are not model-filled; the scaffold writes a fixture loader.
 *   - **Rule decisions** (§6.4): a DROP rule's guards are not carried and its
 *     lines are masked in every slice; CHANGE carries the owner's proposal;
 *     OPEN (no answer, or `clarify`) is carried as KEEP and marked open.
 *
 * The rule-id of a guard is read the way the engine cases read it
 * (`lib/testing-engine-cases.ts`, `ruleOnLine`), so a guard case and the guard
 * function name the same rule; `tests/transformation-unit-plan.spec.ts` holds
 * the two in step.
 *
 * Pure and deterministic: no network, no model, no BPMN map. Runs in a Web
 * Worker or on the server (design §4: the page loads it with `import()`).
 */

import { sha256Hex } from '../artefact-digest';
import { abapDeliveryOf } from './abap-delivery';
import { deriveBusinessRules, type BusinessRule, type BusinessRuleSet } from '../abap/business-rule-set';
import { readCallGraphFrom, type CallGraphReport, type FormDefinition } from '../abap/call-graph';
import { containerAt, readBlocks, type BlockStructure, type Container } from '../abap/block-structure';
import { procedureLines, readGuardsFrom, readOriginalContract, type OriginalContract } from '../abap/original-contract';
import { readStatements, type AbapStatement } from '../abap/statement-reader';
import { materialRules, type MaterialRule } from '../testing-rule-trace';
import { sliceFor } from './abap-slice';
import { FILL_CONTEXT_MAX_CHARS, FILL_REQUEST_MARK, LEASED_PROMPT_MAX_CHARS, fillInstructionHeader } from './fill-prompt';
import { readGoldenMaster } from './golden-master';
import { assignBaseValues } from './base-values';
import { guardBasisReader } from './guard-basis';
import { camelName, kebab, pascalName, rapNameOf, titleOf } from './naming';

export { camelName, pascalName };
import {
  DENSE_UNITS,
  FOLD_MAX_LINES,
  HARD_SLICE_CHARS,
  HARD_SLICE_LINES,
  MAX_UNITS_REFUSE,
  PLAN_VERSION,
  PlanRefusal,
  SOFT_SLICE_CHARS,
  SOFT_SLICE_LINES,
  type AbapRange,
  type ContractField,
  type FillRequestUnit,
  type NotCarried,
  type PlanGuard,
  type PlanRule,
  type RuleDecision,
  type RuleDecisionInput,
  type Unit,
  type UnitKind,
  type UnitPlan,
} from './types';

/* ------------------------------------------------------------ the facts */

/** Everything the planner, the slicer and the scaffolds read from one source — read once. */
export interface EngineFacts {
  /** The source with line breaks normalised to `\n`. */
  source: string;
  lines: string[];
  statements: AbapStatement[];
  blocks: BlockStructure;
  graph: CallGraphReport;
  contract: OriginalContract;
  ruleSet: BusinessRuleSet;
  material: MaterialRule[];
}

export function readEngineFacts(source: string): EngineFacts {
  const text = source.replace(/\r\n?/g, '\n');
  const statements = readStatements(text);
  const blocks = readBlocks(statements);
  const graph = readCallGraphFrom(statements, blocks);
  const contract = readOriginalContract(text);
  const ruleSet = deriveBusinessRules(text);
  return { source: text, lines: text.split('\n'), statements, blocks, graph, contract, ruleSet, material: materialRules(ruleSet) };
}

/* --------------------------------------------------------------- naming */

/**
 * A demo-data routine by its name: a name part that starts with DEMO, FIXTURE or TESTDATA, or says SAMPLE
 * DATA. "Sample" alone is not demo data — in quality management it is the inspection sample, and the QM
 * acceptance program's ASSESS_SAMPLE (the routine that judges each sample) was dropped as a fixture with
 * its eight checks (scaffold 15, 16.10.2026). A part, not a substring: DEMOGRAPHIC_SPLIT is no demo either.
 */
const DEMO_NAME = /(?:^|_)[ZY]?(?:DEMO(?:S|DATA|CASE)?|FIXTURES?|TEST_?DATA|SAMPLE_?DATA)(?:_|$)/i;

/** Program-level statements that run nothing: the program head, declarations, the selection screen, class bodies. */
const NOT_RUN_AT_PROGRAM_LEVEL = new Set([
  'REPORT', 'PROGRAM', 'FUNCTION-POOL', 'CLASS-POOL', 'INTERFACE-POOL', 'TYPE-POOL', 'INCLUDE', 'TYPE-POOLS', 'TYPES', 'TYPE', 'DATA', 'CONSTANTS', 'STATICS', 'CLASS-DATA',
  'TABLES', 'NODES', 'INFOTYPES', 'RANGES', 'FIELD-SYMBOLS', 'PARAMETERS', 'PARAMETER', 'SELECT-OPTIONS', 'SELECTION-SCREEN',
  'CLASS', 'ENDCLASS', 'INTERFACE', 'ENDINTERFACE', 'DEFINE', 'END-OF-DEFINITION', 'TEXT',
]);

/**
 * The statements ABAP runs as an implicit START-OF-SELECTION: executable statements at program level, outside every
 * event block, routine, method and class (scaffold 15, 16.10.2026). A report without the keyword runs them when it is
 * started, and they were nowhere in the orchestrator's lines: the model wrote the main path from the reading-order
 * comment alone. Consecutive statements form one range; a macro's body is skipped.
 */
function implicitStartOfSelection(statements: readonly AbapStatement[], containers: Container[]): Array<{ lineStart: number; lineEnd: number; routine: string }> {
  const ranges: Array<{ lineStart: number; lineEnd: number; routine: string }> = [];
  let inMacro = false;
  let open = false;
  for (const s of statements) {
    if (s.keyword === 'DEFINE') inMacro = true;
    const runs = !inMacro && !NOT_RUN_AT_PROGRAM_LEVEL.has(s.keyword) && containerAt(containers, s.lineStart) === null;
    if (s.keyword === 'END-OF-DEFINITION') inMacro = false;
    if (!runs) {
      open = false;
      continue;
    }
    const last = ranges[ranges.length - 1];
    if (open && last) last.lineEnd = Math.max(last.lineEnd, s.lineEnd);
    else ranges.push({ lineStart: s.lineStart, lineEnd: s.lineEnd, routine: 'START-OF-SELECTION (implicit)' });
    open = true;
  }
  return ranges;
}

/** The local class a METHOD container implements (upper case), or null when it stands in none. */
export function ownerClassOf(containers: readonly Container[], method: Container): string | null {
  return containers.find((k) => k.kind === 'class' && k.lineStart <= method.lineStart && method.lineEnd <= k.lineEnd)?.name ?? null;
}

/** `LCL_INVOICE=>CALCULATE_TAX`: a method by its class, the bare name where the source shows no class. */
export const methodKey = (owner: string | null, name: string) => (owner ? `${owner}=>${name}` : name);

/** The plan's key of a FORM or METHOD container: the FORM's name, a method by its class (`methodKey`). */
export function routineKeyOf(containers: readonly Container[], c: Container): string {
  return c.kind === 'method' ? methodKey(ownerClassOf(containers, c), c.name) : c.name;
}

/**
 * The FORMs the original is called at when it has no entry point of its own (scaffold 17, 18.10.2026): no event
 * block, no module, no function module and no statement at program level. The process map then begins at every FORM
 * no PERFORM of the source names — its caller is outside this source (`formEntries`, lib/abap/process-skeleton.ts;
 * DESIGN.md §5.8) — and draws what those perform as their steps. The transformation said the same program had no
 * entry point and dropped the FORM as never reached: the order-integrity example's only process was in no package.
 * Both now say one thing — no entry point, the process begins at these FORMs, called from outside — and these FORMs
 * and the ones they perform are carried. Empty when the original has an entry point. In source order.
 */
export function calledFromOutsideOf(facts: Pick<EngineFacts, 'statements' | 'blocks' | 'graph'>): string[] {
  const { statements, blocks, graph } = facts;
  if (blocks.containers.some((c) => c.kind === 'event' || c.kind === 'module' || c.kind === 'function')) return [];
  if (implicitStartOfSelection(statements, blocks.containers).length > 0) return [];
  const forms = new Set(graph.forms.map((f) => f.name));
  const roots = graph.neverPerformed.filter((n) => forms.has(n));
  // Routines that only perform one another in a ring: the process map's own fallback, every unreached FORM.
  const beginnings = roots.length > 0 ? roots : graph.unreachable.filter((n) => forms.has(n));
  const unreached = new Set(graph.unreachable);
  const out = new Set<string>();
  const visit = (name: string) => {
    if (out.has(name) || !forms.has(name) || !unreached.has(name)) return;
    out.add(name);
    for (const e of graph.edges) if (e.from === name && e.fromKind === 'form') visit(e.to);
  };
  for (const b of beginnings) visit(b);
  return graph.forms.filter((f) => out.has(f.name)).map((f) => f.name);
}

/** The FORMs of `calledFromOutsideOf` the process begins at — those no other of them performs — with their units. */
function calledFromOutsideEntries(outside: ReadonlySet<string>, graph: CallGraphReport, unitOf: (routine: string) => Unit | null): NonNullable<UnitPlan['calledFromOutside']> {
  const performed = new Set(graph.edges.filter((e) => e.from !== null && outside.has(e.from) && e.from !== e.to).map((e) => e.to));
  const begins = graph.forms.filter((f) => outside.has(f.name) && !performed.has(f.name));
  return (begins.length > 0 ? begins : graph.forms.filter((f) => outside.has(f.name))).map((f) => ({ routine: f.name, line: f.lineStart, unitId: unitOf(f.name)?.id ?? null }));
}

/** `G-0506` — four digits, more when the line needs them. */
export const guardIdOf = (line: number) => `G-${String(line).padStart(4, '0')}`;
const guardTag = (line: number) => `G${String(line).padStart(4, '0')}`;

/* ------------------------------------------------------------ decisions */

function decisionOf(answer: RuleDecisionInput['answer'] | undefined): RuleDecision {
  if (answer === 'keep' || answer === 'change' || answer === 'drop') return answer;
  return 'open';
}

/* --------------------------------------------------------------- guards */

/**
 * The engine rule on a guard's line — the mapping of `ruleOnLine` in
 * `lib/testing-engine-cases.ts` (not exported there; kept identical, and the
 * spec compares the two on every fixture).
 */
export function ruleIdOnLine(rules: readonly BusinessRule[], line: number): string | null {
  for (const rule of rules) {
    if (rule.parameters.some((p) => p.operator.toUpperCase() !== 'VALUE' && p.lineStart <= line && line <= p.lineEnd)) return rule.id;
    if (rule.typeBasis.some((b) => b.anchors.some((a) => a.lineStart <= line && line <= a.lineEnd))) return rule.id;
  }
  return null;
}

/** Lines inside a loop (LOOP, DO, WHILE, SELECT … ENDSELECT) — the engine cases' reading. */
function loopLines(statements: readonly AbapStatement[]): Set<number> {
  const out = new Set<number>();
  let depth = 0;
  for (const st of statements) {
    const kw = st.keyword;
    if (kw === 'ENDLOOP' || kw === 'ENDDO' || kw === 'ENDWHILE' || kw === 'ENDSELECT') depth = Math.max(0, depth - 1);
    if (depth > 0) for (let l = st.lineStart; l <= st.lineEnd; l++) out.add(l);
    if (kw === 'LOOP' || kw === 'DO' || kw === 'WHILE' || (kw === 'SELECT' && !/\bSINGLE\b|\bINTO\s+TABLE\b|\bAPPENDING\s+TABLE\b/i.test(st.text))) depth++;
  }
  return out;
}

function subjectOf(condition: string): string | null {
  const c = condition.trim();
  const initial = c.match(/^([\w/~-]+)\s+IS\s+(NOT\s+)?INITIAL$/i);
  if (initial) return initial[1].toLowerCase();
  const cmp = c.match(/^([\w/~-]+)\s*(>=|<=|<>|=|>|<|\bGE\b|\bLE\b|\bNE\b|\bEQ\b|\bGT\b|\bLT\b)\s*('(?:[^']|'')*'|[\w/~.-]+)$/i);
  return cmp ? cmp[1].toLowerCase() : null;
}

/* --------------------------------------------------------------- fields */

/** Built-in types and DDIC elements with a fixed domain — the engine cases' `INPUT_TYPE_KIND`, kept identical. */
const INPUT_TYPE_KIND: Readonly<Record<string, { kind: ContractField['kind']; digits?: number; max?: string }>> = {
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
};

function selectionKey(name: string): string {
  return camelName(name.replace(/^(?:p|pa|s|so)_/i, ''));
}

/**
 * The request the input contract validates: selection inputs, the packed
 * components of the program's structures as record fields, and the working
 * decimals as internal (no request path; `compute` reaches them). The same
 * reading as `readFields` of the engine cases, so every field a case names has
 * a path or is internal on purpose.
 */
export function readContractFields(facts: EngineFacts, notCarried: readonly NotCarried[] = []): ContractField[] {
  const { statements, contract } = facts;
  const inputData = recordInputOf(facts, notCarried);
  const keywordAt = new Map<number, string>();
  const componentLines = new Set<number>();
  // Structures: components by structure, so a structure that holds a packed component lends its other components to the record.
  const structures: Array<{ name: string; components: Array<{ name: string; line: number; type: string | null }> }> = [];
  const stack: Array<(typeof structures)[number]> = [];
  for (const st of statements) {
    if (!keywordAt.has(st.lineStart)) keywordAt.set(st.lineStart, st.keyword);
    const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '');
    const begin = /^BEGIN\s+OF\s+([\w/]+)/i.exec(rest);
    if (begin) {
      const s = { name: begin[1].toLowerCase(), components: [] };
      structures.push(s);
      stack.push(s);
      continue;
    }
    if (/^END\s+OF\b/i.test(rest)) {
      stack.pop();
      continue;
    }
    if (stack.length > 0 && (st.keyword === 'TYPES' || st.keyword === 'DATA')) {
      componentLines.add(st.lineStart);
      const m = /^([\w/]+)(?:\(\d+\))?\s+(?:TYPE|LIKE)\s+([\w/-]+)/i.exec(rest);
      if (m) stack[stack.length - 1].components.push({ name: m[1].toLowerCase(), line: st.lineStart, type: m[2].toLowerCase() });
    }
  }
  const inputByName = new Map(contract.inputs.filter((i) => i.kind === 'parameter' && !i.flag).map((i) => [i.name.toLowerCase(), i]));
  const out: ContractField[] = [];
  const seen = new Set<string>();
  const usedKeys = new Set<string>();
  const uniqueKey = (base: string) => {
    let k = base;
    let n = 2;
    while (usedKeys.has(k)) k = `${base}${n++}`;
    usedKeys.add(k);
    return k;
  };
  const recordKeys = new Set<string>();
  const recordKey = (name: string) => {
    let k = camelName(name);
    let n = 2;
    while (recordKeys.has(k)) k = `${camelName(name)}${n++}`;
    recordKeys.add(k);
    return k;
  };
  usedKeys.add('records');

  // Packed decimals (constants excluded), as the engine cases read them.
  const packedComponentStructures = new Set<string>();
  for (const d of contract.decimals) {
    if (keywordAt.get(d.line) === 'CONSTANTS') continue;
    const name = d.name.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const input = inputByName.get(name);
    // A record field is a component of a structure the original takes as input data, and not one it computes.
    const owner = componentLines.has(d.line) ? structures.find((x) => x.components.some((c) => c.line === d.line)) : undefined;
    const component = Boolean(owner && inputData.structures.has(owner.name) && !inputData.computed.has(name));
    if (component && owner) packedComponentStructures.add(owner.name);
    const where: ContractField['where'] = input ? 'selection' : component ? 'record' : 'internal';
    const key = where === 'selection' ? uniqueKey(selectionKey(name)) : where === 'record' ? recordKey(name) : camelName(name);
    out.push({
      original: name.toUpperCase(),
      path: where === 'selection' ? key : where === 'record' ? `records[].${key}` : null,
      key,
      where,
      kind: 'packed',
      digits: d.digits,
      places: d.decimals,
      max: d.max,
      obligatory: input?.obligatory ?? where === 'record',
      defaultValue: input?.defaultValue ?? null,
      line: d.line,
      declaration: `P(${d.digits},${d.decimals})`,
      base: null,
    });
  }
  // Selection inputs: parameters, flags and select-options.
  for (const i of contract.inputs) {
    const name = i.name.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const typeName = (i.type ?? '').toUpperCase();
    const known = i.kind === 'parameter' && !i.flag ? INPUT_TYPE_KIND[typeName] : undefined;
    const kind: ContractField['kind'] = i.kind === 'select-option' ? 'range' : i.flag ? 'flag' : known?.kind ?? 'text';
    const key = uniqueKey(selectionKey(name));
    out.push({
      original: name.toUpperCase(),
      path: key,
      key,
      where: 'selection',
      kind,
      digits: known?.digits ?? null,
      places: 0,
      max: known?.max ?? null,
      obligatory: i.obligatory,
      defaultValue: i.defaultValue,
      line: i.line,
      declaration: i.type ? `${i.kind === 'select-option' ? 'FOR' : 'TYPE'} ${i.type.toLowerCase()}` : 'type not stated',
      base: null,
    });
  }
  // The other components of a structure that holds a packed record field: optional text on the record.
  for (const s of structures) {
    if (!packedComponentStructures.has(s.name)) continue;
    for (const c of s.components) {
      if (seen.has(c.name) || inputData.computed.has(c.name)) continue;
      seen.add(c.name);
      const key = recordKey(c.name);
      out.push({
        original: c.name.toUpperCase(),
        path: `records[].${key}`,
        key,
        where: 'record',
        kind: 'text',
        digits: null,
        places: 0,
        max: null,
        obligatory: false,
        defaultValue: null,
        line: c.line,
        declaration: c.type ? `TYPE ${c.type}` : 'type not stated',
        base: null,
      });
    }
  }
  return out;
}

const UPLOAD_CALL = /\b(?:GUI_UPLOAD|WS_UPLOAD|UPLOAD|TEXT_CONVERT_XLS_TO_SAP|ALSM_EXCEL_TO_INTERNAL_TABLE)\b/i;

export interface RecordInput {
  /** The structures whose rows are input records (lower case). */
  structures: Set<string>;
  /** Components the original computes after the input is read — results, never request fields. */
  computed: Set<string>;
  /** Components the original only recalculates from their own value (plan 2) — input data, never computed. */
  accumulated: Set<string>;
  /** The line structure of a data object (a work area, a field symbol, a table), lower case; null when unknown. */
  lineStructureOf: (dataObject: string) => string | null;
}

/**
 * What the original takes as input data (coordinator, 12.10.2026): the
 * structures it fills from a database read, an upload or file read, a SPLIT of
 * an input line, or its demo-data routines — and, among their components, the
 * ones it computes afterwards (assigned outside the demo data: `ls-calc_discount
 * = …`, `ls-total = a * b`). A computed component is a result, never a
 * request field. Since plan 2 a component the original only recalculates from
 * its own value (`ADD … TO ls-rem_num`, `ls-y = ls-y + x`) is `accumulated`:
 * input data the program builds on, so it stays a record field.
 */
export function recordInputOf(facts: EngineFacts, notCarried: readonly NotCarried[] = []): RecordInput {
  const { statements } = facts;
  const fixtures = notCarried.filter((n) => n.reason === 'fixture');
  const inFixture = (line: number) => fixtures.some((n) => line >= n.lineStart && line <= n.lineEnd);
  const lower = (s: string) => s.toLowerCase();

  // Types: table types to their line type, data objects to their type (a structure, or a table of one).
  const tableOf = new Map<string, string>();
  const typeOf = new Map<string, string>();
  for (const st of statements) {
    if (st.keyword !== 'TYPES' && st.keyword !== 'DATA' && st.keyword !== 'CLASS-DATA' && st.keyword !== 'STATICS') continue;
    const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '');
    const begin = /^BEGIN\s+OF\s+([\w/]+)/i.exec(rest);
    if (begin) {
      if (st.keyword !== 'TYPES') typeOf.set(lower(begin[1]), lower(begin[1]));
      continue;
    }
    const m = /^([\w/]+)\s+TYPE\s+(?:(?:STANDARD|SORTED|HASHED|ANY)\s+)?(?:TABLE\s+OF\s+(?:REF\s+TO\s+)?)?([\w/]+)/i.exec(rest);
    if (!m) continue;
    if (st.keyword === 'TYPES') tableOf.set(lower(m[1]), lower(m[2]));
    else typeOf.set(lower(m[1]), lower(m[2]));
  }
  const structureOf = (v: string): string | null => {
    let t = typeOf.get(lower(v)) ?? null;
    for (let i = 0; t && i < 4 && tableOf.has(t); i++) t = tableOf.get(t)!;
    return t;
  };
  // The line structure of any data object a work area can be — field symbols and `LIKE` included —
  // for `lineStructureOf` only (defect E); the record reading above keeps its own, narrower map.
  const declaredAs = new Map<string, { type: string; like: boolean }>();
  const structureNames = new Set<string>();
  for (const st of statements) {
    if (!['TYPES', 'DATA', 'CLASS-DATA', 'STATICS', 'FIELD-SYMBOLS'].includes(st.keyword)) continue;
    const rest = st.text.slice(st.keyword.length).replace(/^\s*:?\s*/, '');
    const begin = /^BEGIN\s+OF\s+([\w/]+)/i.exec(rest);
    if (begin) structureNames.add(lower(begin[1]));
    if (begin || st.keyword === 'TYPES') continue;
    const m = /^(<?[\w/]+>?)\s+(TYPE|LIKE)\s+(?:(?:STANDARD|SORTED|HASHED|ANY|INDEX)\s+)?(?:(?:TABLE|LINE)\s+OF\s+(?:REF\s+TO\s+)?)?([\w/]+)/i.exec(rest);
    if (m && !declaredAs.has(lower(m[1]))) declaredAs.set(lower(m[1]), { type: lower(m[3]), like: m[2].toUpperCase() === 'LIKE' });
  }
  const resolve = (v: string): string | null => {
    let name = lower(v);
    for (let i = 0; i < 4; i++) {
      const d = declaredAs.get(name);
      if (!d) return structureOf(name);
      if (!d.like) {
        let t: string | null = d.type;
        for (let j = 0; t && j < 4 && tableOf.has(t); j++) t = tableOf.get(t)!;
        return t;
      }
      name = d.type;
    }
    return null;
  };
  // Only a declared structure (BEGIN OF) has rows a record maps: `lv_kunnr TYPE c` is a scalar.
  const lineStructureOf = (v: string): string | null => {
    const t = resolve(v);
    return t && structureNames.has(t) ? t : null;
  };

  // Data objects the original fills from outside or from its demo data.
  const inputVars = new Set<string>();
  const base = (target: string) => lower(target.replace(/^@/, '').replace(/^DATA\(|\)$/gi, '').split('-')[0]);
  for (const st of statements) {
    const t = st.text;
    if (st.keyword === 'SELECT') {
      for (const m of t.matchAll(/\b(?:INTO|APPENDING)\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?(?:TABLE\s+)?(@?(?:DATA\()?[\w/<>]+)/gi)) inputVars.add(base(m[1]));
    } else if (st.keyword === 'READ' && /^READ\s+DATASET\b/i.test(t)) {
      const m = /\bINTO\s+([\w/<>-]+)/i.exec(t);
      if (m) inputVars.add(base(m[1]));
    } else if (st.keyword === 'SPLIT') {
      const m = /\bINTO\s+(TABLE\s+)?([\s\S]+?)(?:\s+IN\s+(?:CHARACTER|BYTE)\s+MODE)?\.?$/i.exec(t);
      if (m) for (const target of m[2].split(/\s+/)) if (/^[\w/<>-]+$/.test(target)) inputVars.add(base(target));
    } else if (UPLOAD_CALL.test(t)) {
      for (const m of t.matchAll(/\b(?:data_tab|i_tab_converted_data|intern)\s*=\s*([\w/<>-]+)/gi)) inputVars.add(base(m[1]));
    }
    if (inFixture(st.lineStart)) {
      const m = /^(?:APPEND|INSERT)\b[\s\S]*?\b(?:TO|INTO\s+TABLE|INTO)\s+([\w/<>-]+)\s*\.?$/i.exec(t);
      if (m) inputVars.add(base(m[1]));
    }
  }
  // A line of input data appended to a table makes the table input data too.
  for (let changed = true; changed; ) {
    changed = false;
    for (const st of statements) {
      const m = /^(?:APPEND|INSERT)\s+([\w/<>-]+)\s+(?:TO|INTO\s+TABLE)\s+([\w/<>-]+)/i.exec(st.text);
      if (m && inputVars.has(base(m[1])) && !inputVars.has(base(m[2]))) {
        inputVars.add(base(m[2]));
        changed = true;
      }
    }
  }
  const structures = new Set<string>();
  for (const v of inputVars) {
    const s = structureOf(v) ?? (typeOf.get(v) === v ? v : null);
    if (s) structures.add(s);
  }

  // Components the original computes after the input is read (outside its demo data).
  //
  // Plan 2 (roadmap 3.0.13, item 4): a component the original only *recalculates from its own value*
  // (`<ls>-menge = <ls>-menge + lv_add`, `ADD lv_add TO ls-menge`, `ls-menge += 1`, and the same with minus)
  // is not a result but input data that the program builds on: its existing value comes with the record.
  // Under plan 1 it was dropped from the request, so a port could never add to the existing value and
  // had to start from nothing — the failure pattern FP-MEAN-05 written into the contract itself.
  // A component that is also computed any other way stays computed.
  const computed = new Set<string>();
  const accumulated = new Set<string>();
  for (const st of statements) {
    if (inFixture(st.lineStart) || st.keyword === 'SELECT' || st.keyword === 'SPLIT' || st.keyword === 'READ') continue;
    const t = st.text.replace(/\.$/, '');
    const update = selfUpdateOf(t);
    if (update) {
      accumulated.add(update.component);
      continue;
    }
    const assign = /^<?[\w/~]+>?((?:-[\w/~]+)+)\s*((?:[-+*/]|&&)?)=(?!=)\s*([\s\S]*)$/.exec(t);
    if (assign) {
      // Computed: arithmetic, a function, an operator-assignment, or a value set by the logic (a literal, a status).
      // A plain copy of another field (`ls_drv-kostl = lv_kostl` after reading a line) is still input data.
      const rhs = assign[3].trim();
      const isComputed = Boolean(assign[2]) || /[+*/]|\s-\s|\*\*|\bDIV\b|\bMOD\b|[\w>]\(|&&|\|/i.test(rhs) || /^(?:'(?:[^']|'')*'|`[^`]*`|-?\d+(?:\.\d+)?|abap_true|abap_false|space)$/i.test(rhs);
      if (isComputed) computed.add(lower(assign[1].slice(assign[1].lastIndexOf('-') + 1)));
      continue;
    }
    const writer = /^(?:ADD|SUBTRACT)\b.*\b(?:TO|FROM)\s+<?[\w/~]+>?((?:-[\w/~]+)+)/i.exec(t) ?? /^(?:MULTIPLY|DIVIDE)\s+<?[\w/~]+>?((?:-[\w/~]+)+)/i.exec(t) ?? /^COMPUTE\s+<?[\w/~]+>?((?:-[\w/~]+)+)/i.exec(t);
    if (writer) computed.add(lower(writer[1].slice(writer[1].lastIndexOf('-') + 1)));
  }
  for (const c of computed) accumulated.delete(c);
  return { structures, computed, accumulated, lineStructureOf };
}

/**
 * Plan 2: a record field the original only recalculates from its own value starts, when nothing else
 * gives it a value, at its type's initial value — zero for a packed number, as in ABAP. The base request
 * can then carry it; the field is no longer listed as missing. Returns the missing list without them.
 */
function withInitialBase(fields: ContractField[], accumulated: ReadonlySet<string>, missing: string[]): string[] {
  const filled = new Set<string>();
  for (const f of fields) {
    if (f.where !== 'record' || f.kind !== 'packed' || f.base !== null || !accumulated.has(f.original.toLowerCase())) continue;
    f.base = { value: f.places > 0 ? `0.${'0'.repeat(f.places)}` : '0', source: 'kind' };
    filled.add(f.original);
  }
  return missing.filter((m) => !filled.has(m));
}

/** One statement that recalculates a structure component from its own value — see `recordInputOf`. */
export interface SelfUpdate {
  /** The data object as written (`<ls_item>`, `ls_item`). */
  holder: string;
  /** The component, lower case (`menge`). */
  component: string;
  /** `+` adds to the existing value, `-` takes from it. */
  sign: '+' | '-';
  /** The operand added or taken, as written (`lv_add`, `<ls_item>-delta`, `1`). */
  operand: string;
}

/**
 * `<ls>-y = <ls>-y + x`, `<ls>-y = x + <ls>-y`, `<ls>-y += x`, `ADD x TO <ls>-y` (and minus, `SUBTRACT x FROM`),
 * on one component with exactly one operand; null for anything else.
 */
export function selfUpdateOf(text: string): SelfUpdate | null {
  const t = text.trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  const target = '(<?[\\w/~]+>?)-([\\w/~]+)';
  const operand = "(<?[\\w/~]+>?(?:-[\\w/~]+)*|'-?\\d+(?:\\.\\d+)?'|-?\\d+(?:\\.\\d+)?)";
  const lowerComp = (s: string) => s.toLowerCase();
  let m = new RegExp(`^${target}\\s*=\\s*${target}\\s*([-+])\\s*${operand}$`, 'i').exec(t);
  if (m && m[1].toLowerCase() === m[3].toLowerCase() && m[2].toLowerCase() === m[4].toLowerCase()) {
    return { holder: m[1], component: lowerComp(m[2]), sign: m[5] as '+' | '-', operand: m[6] };
  }
  m = new RegExp(`^${target}\\s*=\\s*${operand}\\s*\\+\\s*${target}$`, 'i').exec(t);
  if (m && m[1].toLowerCase() === m[4].toLowerCase() && m[2].toLowerCase() === m[5].toLowerCase()) {
    return { holder: m[1], component: lowerComp(m[2]), sign: '+', operand: m[3] };
  }
  m = new RegExp(`^${target}\\s*([-+])=\\s*${operand}$`, 'i').exec(t);
  if (m) return { holder: m[1], component: lowerComp(m[2]), sign: m[3] as '+' | '-', operand: m[4] };
  m = new RegExp(`^(ADD|SUBTRACT)\\s+${operand}\\s+(?:TO|FROM)\\s+${target}$`, 'i').exec(t);
  if (m) return { holder: m[3], component: lowerComp(m[4]), sign: m[1].toUpperCase() === 'ADD' ? '+' : '-', operand: m[2] };
  return null;
}

/** The CSV delimiter a constant of the original declares (`gc_sep VALUE ';'`), else a comma. */
export function csvDelimiterOf(statements: readonly AbapStatement[]): string {
  for (const st of statements) {
    if (st.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s*:?\s*([\w/]+)\b.*\bVALUE\s+'(.)'/i.exec(st.text);
    if (m && /SEP|DELIM|TRENN/i.test(m[1]) && /^[;,|\t]$/.test(m[2])) return m[2];
    const tab = /^CONSTANTS\s*:?\s*([\w/]+)\b.*\bVALUE\s+cl_abap_char_utilities=>horizontal_tab/i.exec(st.text);
    if (tab && /SEP|DELIM|TRENN/i.test(tab[1])) return '\t';
  }
  return ',';
}

/* ----------------------------------------------------------------- plan */

export interface PlanInput {
  /** The rule decisions on record — `TransformationContextInput.rules.items` (Track A). */
  decisions?: readonly RuleDecisionInput[];
  /** Fallback when the source names no program. */
  program?: string | null;
  /**
   * Scaffold 20 (roadmap 3.0.19, owner decision 19.10.2026): the lines a key user configures in a program that
   * splits — the `replaced` anchors of the key-user steps (`KeyUserStepList.steps`). A FORM or METHOD that lies
   * wholly inside them is no unit: no function, no fill request, no model call; it is not carried, with reason
   * `key-user` (and so is a FORM reached only from such routines). Absent or empty: the plan of before.
   */
  keyUser?: { ranges: ReadonlyArray<{ lineStart: number; lineEnd: number; step: string }> } | null;
}

interface Routine {
  /**
   * The routine's key in the plan: the FORM's name, or `CLASS=>METHOD` for a method of a local class (scaffold 17,
   * 18.10.2026). Methods of different classes share names — `CALCULATE_TAX` of an invoice and of a credit note — and
   * keyed by the bare name the second replaced the first: the order-integrity example's five methods became three
   * units, and the two lost ones were in no list of what is not carried.
   */
  key: string;
  name: string;
  kind: 'form' | 'method';
  lineStart: number;
  lineEnd: number;
  parameters: FormDefinition['parameters'];
  /** For a method: the local class. */
  owner: string | null;
}

const EVENT_FOR_SELECTION = /^(AT SELECTION-SCREEN|INITIALIZATION)/i;

/** One unit per reachable routine, the orchestrator, the rules and guards placed — see the file comment. */
export function planUnits(source: string, input: PlanInput = {}, given?: EngineFacts): UnitPlan {
  const facts = given ?? readEngineFacts(source);
  const { lines, statements, blocks, graph, contract, ruleSet, material } = facts;
  const program = ruleSet.program ?? input.program ?? null;
  const decisions = new Map((input.decisions ?? []).map((d) => [d.id, d]));
  const decision = (id: string | null): RuleDecision => (id ? decisionOf(decisions.get(id)?.answer) : 'keep');

  // ---- routines: FORMs, then methods of local classes (in source order)
  const routines: Routine[] = graph.forms.map((f) => ({ key: f.name, name: f.name, kind: 'form', lineStart: f.lineStart, lineEnd: f.lineEnd, parameters: f.parameters, owner: null }));
  for (const c of blocks.containers) {
    if (c.kind !== 'method') continue;
    const owner = ownerClassOf(blocks.containers, c);
    routines.push({ key: methodKey(owner, c.name), name: c.name, kind: 'method', lineStart: c.lineStart, lineEnd: c.lineEnd, parameters: [], owner });
  }
  if (routines.length === 0 && !blocks.containers.some((c) => c.kind === 'event')) {
    throw new PlanRefusal('no-routine', 'The source holds no routine and no event block — nothing to anchor a function to.');
  }
  const byName = new Map(routines.map((r) => [r.key, r]));
  /** The key of the routine a FORM or METHOD container is (`routineKeyOf`). */
  const keyOf = (c: Container) => routineKeyOf(blocks.containers, c);
  const unreachable = new Set(graph.unreachable);
  // No entry point (scaffold 17): the FORMs the process map begins at, called from outside — carried, not unreachable.
  const outsideCalled = new Set(calledFromOutsideOf(facts));

  // ---- callers (PERFORM edges; '(program)' for event blocks and program level), as the measurement counts them
  // A caller by its key: a method's PERFORM is the call of that class's method, not of every method of its name.
  const fromKey = (e: { from: string | null; lineStart: number }): string | null => {
    const c = e.from === null ? null : containerAt(blocks.containers, e.lineStart);
    return c && (c.kind === 'form' || c.kind === 'method') && c.name === e.from ? keyOf(c) : e.from;
  };
  const callers = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!callers.has(e.to)) callers.set(e.to, new Set());
    callers.get(e.to)!.add(fromKey(e) ?? '(program)');
  }
  const within = (line: number, r: { lineStart: number; lineEnd: number }) => line >= r.lineStart && line <= r.lineEnd;
  const rulesIn = (r: Routine) => material.filter((m) => (m.routine ?? '').toUpperCase() === r.name && (r.kind === 'form' || m.ranges.some((x) => within(x.lineStart, r)))).length;
  const guardsIn = (r: Routine) => contract.guards.filter((g) => within(g.line, r)).length;
  const writesIn = (r: Routine) => graph.databaseWrites.filter((w) => within(w.lineStart, r)).length;

  const reachable = routines.filter((r) => r.kind === 'method' || !unreachable.has(r.name) || outsideCalled.has(r.name));
  const helper = new Set<string>();
  const fixture = new Set<string>();
  // The original's demo cases, read by their shape rather than their name (`golden-master.ts`): the routine
  // that builds the baseline rows from literals and the one that holds the case switch are demo data too.
  // The QM acceptance program's BUILD_BASELINE (580 lines of literal rows) went to the model in five parts,
  // and the PM program's APPLY_CASE as a unit over budget (scaffold 15, 16.10.2026).
  const demoCases = readGoldenMaster(facts.source);
  const demoByShape = new Set(demoCases ? [demoCases.baseRoutine.name, demoCases.caseRoutine.name].filter(Boolean).map((n) => n.toUpperCase()) : []);
  for (const r of reachable) {
    if (r.kind !== 'form') continue;
    const span = r.lineEnd - r.lineStart + 1;
    const nCallers = callers.get(r.name)?.size ?? 0;
    // Demo data first: a small demo routine is still demo data, not a helper of its caller.
    if (DEMO_NAME.test(r.name) || demoByShape.has(r.name)) fixture.add(r.name);
    else if (span < FOLD_MAX_LINES && rulesIn(r) === 0 && guardsIn(r) === 0 && writesIn(r) === 0 && nCallers === 1) helper.add(r.name);
  }
  // Scaffold 20 (3.0.19): a routine wholly inside the lines a key user configures is no unit (`PlanInput.keyUser`).
  const keyUserRanges = input.keyUser?.ranges ?? [];
  const configured = new Set<string>();
  for (const r of reachable) {
    if (fixture.has(r.name) || helper.has(r.name)) continue;
    if (keyUserRanges.some((k) => r.lineStart >= k.lineStart && r.lineEnd <= k.lineEnd)) configured.add(r.key);
  }
  for (let changed = configured.size > 0; changed; ) {
    changed = false;
    for (const r of reachable) {
      if (r.kind !== 'form' || configured.has(r.key) || fixture.has(r.name)) continue;
      const from = callers.get(r.name);
      if (!from || from.size === 0 || graph.callbacks.some((c) => c.to === r.name)) continue;
      if ([...from].every((c) => configured.has(c))) {
        configured.add(r.key);
        helper.delete(r.name);
        changed = true;
      }
    }
  }
  // Reached only from demo-data routines: also a fixture (§7.1 rule 6).
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of reachable) {
      if (r.kind !== 'form' || helper.has(r.name) || fixture.has(r.name)) continue;
      const from = callers.get(r.name);
      if (!from || from.size === 0 || graph.callbacks.some((c) => c.to === r.name)) continue;
      if ([...from].every((c) => fixture.has(c))) {
        fixture.add(r.name);
        changed = true;
      }
    }
  }

  // ---- reading order: depth-first from the event blocks and program level, call sites in source order
  const outgoing = new Map<string, string[]>();
  const rootCalls: Array<{ line: number; to: string }> = [];
  for (const e of [...graph.edges].sort((a, b) => a.lineStart - b.lineStart)) {
    if (e.from === null || e.fromKind === 'event' || e.fromKind === 'program' || e.fromKind === 'module') rootCalls.push({ line: e.lineStart, to: e.to });
    else {
      const from = fromKey(e)!;
      if (!outgoing.has(from)) outgoing.set(from, []);
      outgoing.get(from)!.push(e.to);
    }
  }
  for (const cb of [...graph.callbacks].sort((a, b) => a.lineStart - b.lineStart)) {
    if (cb.from === null || cb.fromKind !== 'form') rootCalls.push({ line: cb.lineStart, to: cb.to });
    else {
      const from = fromKey(cb)!;
      if (!outgoing.has(from)) outgoing.set(from, []);
      outgoing.get(from)!.push(cb.to);
    }
  }
  rootCalls.sort((a, b) => a.line - b.line);
  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name) || !byName.has(name)) return;
    visited.add(name);
    order.push(name);
    for (const next of outgoing.get(name) ?? []) visit(next);
  };
  for (const c of rootCalls) visit(c.to);
  for (const r of [...reachable].sort((a, b) => a.lineStart - b.lineStart)) visit(r.key);

  // ---- folding: a helper goes into its single caller; chains resolve to the first non-folded host
  const hostOf = (name: string, depth = 0): string | null => {
    if (!helper.has(name)) return name;
    if (depth > 64) return null;
    const from = [...(callers.get(name) ?? [])][0];
    if (!from || from === '(program)') return '(program)';
    const r = byName.get(from);
    if (!r) return '(program)'; // called from an event block or module: the orchestrator
    return hostOf(from, depth + 1);
  };

  // ---- units
  const units: Unit[] = [];
  const unitOfRoutine = new Map<string, Unit>();
  /** Unit id → the key of its routine. */
  const keyOfUnit = new Map<string, string>();
  const folded: Array<{ routine: string; into: string }> = [];
  const notCarried: NotCarried[] = [];
  const usedFns = new Set<string>(['runSteps', 'runProcess', 'checkSelection']);
  const uniqueFn = (base: string) => {
    let f = base;
    let n = 2;
    while (usedFns.has(f)) f = `${base}${n++}`;
    usedFns.add(f);
    return f;
  };
  // RAP methods share one logic class: two routines of the same name (in different classes) get distinct ones.
  const usedRap = new Set<string>(['run_steps']);
  const uniqueRap = (base: string) => {
    let r = base;
    let n = 2;
    while (usedRap.has(r)) r = `${base.slice(0, 30 - String(n).length - 1)}_${n++}`;
    usedRap.add(r);
    return r;
  };

  const orchestrator: Unit = {
    id: 'U00',
    kind: 'orchestrator',
    fn: 'runSteps',
    rapName: 'run_steps',
    file: 'srv/process.ts',
    title: 'Run the process steps in the original order',
    stepId: null,
    routine: null,
    abap: [
      ...blocks.containers
        .filter((c) => c.kind === 'event' || c.kind === 'module')
        .map((c) => ({ lineStart: c.lineStart, lineEnd: c.lineEnd, routine: c.name })),
      ...implicitStartOfSelection(statements, blocks.containers),
    ].sort((a, b) => a.lineStart - b.lineStart),
    folded: [],
    rules: [],
    guards: [],
    guardCalls: [],
    bodyCalls: [],
    callees: [],
    parameters: [],
    signature: 'export function runSteps(sel: Selection, st: RunState): StepResult',
    budget: { lines: 0, chars: 0 },
    overSoftBudget: false,
    part: null,
  };
  units.push(orchestrator);

  let n = 0;
  const nextId = () => `U${String(++n).padStart(2, '0')}`;
  const routineUnit = (r: Routine, kind: UnitKind): Unit => {
    const id = nextId();
    const fn = uniqueFn(camelName(r.owner ? `${r.owner}_${r.name}` : r.name));
    const argsType = r.parameters.length > 0 ? `, args: ${fn[0].toUpperCase()}${fn.slice(1)}Args` : '';
    return {
      id,
      kind,
      fn,
      rapName: uniqueRap(rapNameOf(r.name)),
      file: `srv/steps/${id.slice(1)}-${kebab(r.name)}.ts`,
      title: titleOf(r.name),
      stepId: null,
      routine: r.name,
      ...(r.owner ? { owner: r.owner } : {}),
      abap: [{ lineStart: r.lineStart, lineEnd: r.lineEnd, routine: r.name }],
      folded: [],
      rules: [],
      guards: [],
      guardCalls: [],
      bodyCalls: [],
      callees: [],
      parameters: r.parameters.map((p) => ({ name: p.name, direction: p.direction })),
      signature: `export function ${fn}(sel: Selection, st: RunState${argsType}): StepResult`,
      budget: { lines: 0, chars: 0 },
      overSoftBudget: false,
      part: null,
    };
  };

  for (const name of order) {
    const r = byName.get(name)!;
    if (helper.has(name) || fixture.has(name) || configured.has(name)) continue;
    const unit = routineUnit(r, r.kind === 'method' ? 'method' : 'routine');
    units.push(unit);
    unitOfRoutine.set(name, unit);
    keyOfUnit.set(unit.id, name);
  }
  for (const r of routines) {
    if (r.kind === 'form' && unreachable.has(r.name) && !outsideCalled.has(r.name)) notCarried.push({ routine: r.name, reason: 'unreachable', lineStart: r.lineStart, lineEnd: r.lineEnd });
    else if (fixture.has(r.name)) notCarried.push({ routine: r.name, reason: 'fixture', lineStart: r.lineStart, lineEnd: r.lineEnd });
    else if (configured.has(r.key)) notCarried.push({ routine: r.owner ? `${r.owner}=>${r.name}` : r.name, reason: 'key-user', lineStart: r.lineStart, lineEnd: r.lineEnd });
  }
  for (const name of order) {
    if (!helper.has(name)) continue;
    const r = byName.get(name)!;
    const host = hostOf(name);
    const into = host === '(program)' || host === null ? orchestrator : unitOfRoutine.get(host) ?? null;
    if (!into) {
      // The host is a fixture (or, scaffold 20, configured by a key user): the helper goes with it.
      notCarried.push({ routine: name, reason: host && configured.has(host) ? 'key-user' : 'fixture', lineStart: r.lineStart, lineEnd: r.lineEnd });
      continue;
    }
    into.folded.push(name);
    into.abap.push({ lineStart: r.lineStart, lineEnd: r.lineEnd, routine: name });
    folded.push({ routine: name, into: into.id });
  }
  const unitOf = (routine: string | null): Unit | null => {
    if (!routine) return null;
    const direct = unitOfRoutine.get(routine);
    if (direct) return direct;
    const f = folded.find((x) => x.routine === routine);
    return f ? units.find((u) => u.id === f.into) ?? null : null;
  };

  // ---- callees: the units a unit's lines (own and folded) perform
  for (const u of units) {
    const names = u.kind === 'orchestrator' ? null : new Set([keyOfUnit.get(u.id) ?? u.routine!, ...u.folded]);
    const targets: string[] = [];
    for (const e of graph.edges) {
      const fromHere = names ? e.from !== null && names.has(fromKey(e)!) : e.from === null || e.fromKind === 'event' || e.fromKind === 'program' || e.fromKind === 'module' || (e.from !== null && u.folded.includes(e.from));
      if (!fromHere) continue;
      const callee = unitOf(e.to);
      if (callee && callee.id !== u.id && !targets.includes(callee.id)) targets.push(callee.id);
    }
    for (const cb of graph.callbacks) {
      const fromHere = names ? cb.from !== null && names.has(fromKey(cb)!) : cb.from === null || cb.fromKind !== 'form' || u.folded.includes(cb.from);
      if (!fromHere) continue;
      const callee = unitOf(cb.to);
      if (callee && callee.id !== u.id && !targets.includes(callee.id)) targets.push(callee.id);
    }
    u.callees = targets;
  }

  // ---- rules
  const containerOf = (line: number): Container | null => containerAt(blocks.containers, line);
  const rules: PlanRule[] = material.map((m) => {
    const d = decision(m.id);
    const firstLine = m.ranges[0]?.lineStart ?? null;
    const c = firstLine !== null ? containerOf(firstLine) : null;
    let unit: Unit | null = null;
    const routine = m.routine ? m.routine.toUpperCase() : null;
    const at = c && (c.kind === 'form' || c.kind === 'method') && c.name === routine ? keyOf(c) : routine;
    if (at && byName.has(at)) unit = unitOf(at);
    else if (c && (c.kind === 'event' || c.kind === 'module')) unit = EVENT_FOR_SELECTION.test(c.name) ? null : orchestrator;
    else if (!routine) unit = orchestrator;
    return {
      id: m.id,
      type: m.type,
      decision: d,
      proposal: d === 'change' ? decisions.get(m.id)?.note ?? null : null,
      label: m.label,
      text: m.text,
      routine,
      ranges: m.ranges,
      unitId: d === 'drop' ? null : unit?.id ?? null,
    };
  });
  for (const r of rules) {
    if (!r.unitId) continue;
    const u = units.find((x) => x.id === r.unitId);
    if (u && !u.rules.includes(r.id)) u.rules.push(r.id);
  }

  // ---- guards
  const inLoop = loopLines(statements);
  const inProcedure = procedureLines(statements);
  const constants = statements.filter((st) => st.keyword === 'CONSTANTS').map((st) => /^CONSTANTSs*:?s*([w/]+)/i.exec(st.text)?.[1] ?? '').filter(Boolean);
  // A work area holds an input record when its rows are of a structure the contract maps to `record`
  // (defect E): a row of an internal table the program builds itself is a computed value.
  const recordInput = recordInputOf(facts, notCarried);
  const isInputRecord = (workArea: string, table: string | null) =>
    [workArea, table].some((n) => {
      const s = n ? recordInput.lineStructureOf(n) : null;
      return !!s && recordInput.structures.has(s);
    });
  const basisReader = guardBasisReader(statements, blocks.containers, contract.inputs.map((i) => i.name), constants, isInputRecord);
  const guards: PlanGuard[] = readGuardsFrom(statements).map((g) => {
    const rule = ruleIdOnLine(ruleSet.rules, g.line);
    const d = rule ? decision(rule) : 'keep';
    const c = containerOf(g.line);
    const tag = guardTag(g.line);
    // A CHECK skips the pass in a loop, leaves its FORM/METHOD/FUNCTION/MODULE outside one (the caller goes on), and
    // ends its event block only at event level (3.0.17 criterion 3: RATE_DEVIATION's CHECK refused the whole input).
    const outcome: PlanGuard['outcome'] =
      g.effect === 'continue' || (g.effect === 'check' && inLoop.has(g.line))
        ? 'skips'
        : g.effect === 'return' || g.effect === 'exit' || (g.effect === 'check' && inProcedure.has(g.line))
          ? 'stops'
          : 'refuses';
    const prefix = outcome === 'skips' ? 'skip' : outcome === 'stops' ? 'stop' : 'guard';
    const helperName = `${prefix}_${rule ? `${rule.replace(/-/g, '_')}_` : ''}${tag}`;
    let place: PlanGuard['place'] = 'not-carried';
    let unit: Unit | null = null;
    if (d !== 'drop') {
      if (c && (c.kind === 'form' || c.kind === 'method')) {
        unit = unitOf(keyOf(c));
        if (unit) place = unit.kind === 'orchestrator' ? 'orchestrator' : 'unit';
      } else if (c && c.kind === 'event' && EVENT_FOR_SELECTION.test(c.name)) {
        unit = orchestrator;
        place = 'selection-screen';
      } else {
        unit = orchestrator;
        place = 'orchestrator';
      }
    }
    const basis = basisReader.basisOf(g.line, g.condition);
    // A check the original makes only after it has performed a routine is no entry check: run at entry, it would
    // answer before that routine (the freight example's `gt_deliveries IS INITIAL` at L75 ran before its
    // authority check at L73, so an unauthorised run with no deliveries answered ok — owner decision 18.10.2026).
    const afterPerform = !!c && statements.some((st) => st.lineStart >= c.lineStart && st.lineStart < g.line && /^PERFORM\b/i.test(st.text));
    const placement: PlanGuard['placement'] =
      place === 'not-carried'
        ? 'none'
        : basis.basis === 'derived' || outcome === 'skips' || (afterPerform && place !== 'selection-screen')
          ? 'body'
          : place === 'selection-screen'
            ? 'selection'
            : 'entry';
    return {
      id: guardIdOf(g.line),
      line: g.line,
      endingLine: g.endingLine,
      condition: g.condition,
      effect: g.effect,
      ending: g.ending,
      rule,
      decision: d,
      carried: place !== 'not-carried',
      outcome,
      subject: subjectOf(g.condition),
      place,
      unitId: unit?.id ?? null,
      helper: helperName,
      regionId: unit ? `${unit.id}.${tag}` : null,
      basis: basis.basis,
      basisReason: basis.reason,
      operands: basis.operands,
      literals: basis.literals,
      op: basis.op,
      placement,
    };
  });
  for (const g of guards) {
    if (!g.carried || !g.unitId) continue;
    const u = units.find((x) => x.id === g.unitId)!;
    u.guards.push(g.id);
    // Raw checks: the stub calls them before the fill marker (§9.1), the selection-screen ones run in
    // `checkSelection` before any step. Derived and skipping checks: the body calls them where the original does.
    if (g.placement === 'entry') u.guardCalls.push(g.id);
    else if (g.placement === 'body') u.bodyCalls.push(g.id);
  }

  // ---- the request and its base values (from the original only; base-values.ts)
  const fields = readContractFields(facts, notCarried);
  const missingBaseValues = withInitialBase(fields, recordInputOf(facts, notCarried).accumulated, assignBaseValues(fields, facts, notCarried));

  // ---- split above the hard budget or the fill prompt's cap (§7.2, 3.0.17), then budgets from the slices
  const plan: UnitPlan = {
    version: PLAN_VERSION,
    program,
    sourceSha256: sha256Hex(facts.source),
    units,
    rules,
    guards,
    decimals: contract.decimals,
    inputs: contract.inputs,
    fields,
    missingBaseValues,
    csvDelimiter: csvDelimiterOf(statements),
    notCarried: notCarried.sort((a, b) => a.lineStart - b.lineStart),
    folded,
    ...(outsideCalled.size > 0 ? { calledFromOutside: calledFromOutsideEntries(outsideCalled, graph, unitOf) } : {}),
    abapDelivery: abapDeliveryOf(facts),
    stats: {
      routines: routines.length,
      reachable: reachable.length,
      unreachable: routines.filter((r) => r.kind === 'form' && unreachable.has(r.name) && !outsideCalled.has(r.name)).length,
      folded: folded.length,
      fixtures: notCarried.filter((x) => x.reason === 'fixture').length,
      routineUnits: 0,
      units: 0,
      overSoftBudget: [],
      split: [],
      promptOverCap: [],
      guards: { total: guards.length, inUnits: 0, programLevel: 0, notCarried: 0 },
      rules: { keep: 0, change: 0, drop: 0, open: 0 },
      unitsPerCall: 4,
    },
    digest: '',
  };
  splitOversized(plan, facts);
  for (const u of plan.units) {
    const slice = sliceFor(u, plan, facts);
    u.budget = { lines: slice.lines, chars: slice.chars };
    const own = u.abap[0];
    const ownLines = own ? own.lineEnd - own.lineStart + 1 : 0;
    const ownChars = own ? lines.slice(own.lineStart - 1, own.lineEnd).join('\n').length : 0;
    u.overSoftBudget = u.kind !== 'orchestrator' && (ownLines > SOFT_SLICE_LINES || ownChars > SOFT_SLICE_CHARS);
  }
  // A function the split could not bring within the cap (3.0.17): said here, with its reason, never left to a
  // prompt that silently exceeds it. A parent of parts has no region of its own.
  for (const u of plan.units) {
    if (plan.units.some((p) => p.part?.parent === u.id)) continue;
    const est = estimateFillPrompt(u, plan, facts);
    if (est.chars <= LEASED_PROMPT_MAX_CHARS) continue;
    u.promptOverCap = { chars: est.chars, reason: promptOverCapReason(u, est, facts) };
    plan.stats.promptOverCap.push({ unitId: u.id, chars: est.chars, reason: u.promptOverCap.reason });
  }
  const routineUnits = plan.units.filter((u) => u.kind === 'routine' || u.kind === 'method');
  if (plan.units.length > MAX_UNITS_REFUSE) {
    throw new PlanRefusal('too-many-units', `The program needs ${plan.units.length} functions; above ${MAX_UNITS_REFUSE} the engine does not scaffold it.`);
  }
  plan.stats.routineUnits = routineUnits.length;
  plan.stats.units = plan.units.length;
  plan.stats.overSoftBudget = plan.units.filter((u) => u.overSoftBudget).map((u) => u.routine ?? u.fn);
  plan.stats.guards = {
    total: guards.length,
    inUnits: guards.filter((g) => g.place === 'unit').length,
    programLevel: guards.filter((g) => g.place === 'orchestrator' || g.place === 'selection-screen').length,
    notCarried: guards.filter((g) => !g.carried).length,
  };
  for (const r of rules) plan.stats.rules[r.decision]++;
  plan.stats.unitsPerCall = plan.units.length > DENSE_UNITS ? 6 : 4;
  plan.digest = planDigest(plan);
  return plan;
}

/* ------------------------------------------------------ the fill prompt */

/**
 * What a unit's fill prompt carries beyond its own request entry, at most, on either track (owner decision
 * 17.10.2026, roadmap 3.0.17): the RAP route's `types` (the logic class around the body — its attributes, the
 * access layer, one predicate line per guard, one signature per callee) and both routes' `available` helpers
 * and guard `values`. Read off the scaffolds rather than computed from them, so the plan stays track-free and
 * builds no scaffold. Measured 17.10.2026 on the nine shipped starter examples and eight local acceptance
 * programs, both tracks, every unit: the estimate stayed above the real prompt (rules by title, a full
 * 3,000-character context) by at least 338 characters, median 6,752 — the Node route carries far less class
 * text than the RAP route, whose largest guard-free class text was 7,496 characters.
 */
export const PROMPT_CLASS_BASE_CHARS = 8_000;
export const PROMPT_CLASS_PER_GUARD_CHARS = 200;
export const PROMPT_CLASS_PER_CALLEE_CHARS = 170;
/** The JSON escapes of a platform context of `FILL_CONTEXT_MAX_CHARS` (a line break or quote costs two). */
const PROMPT_CONTEXT_ESCAPE_CHARS = 150;

export interface FillPromptEstimate {
  /**
   * The prompt of this unit alone with its whole ABAP, a whole platform context (`FILL_CONTEXT_MAX_CHARS`) and the
   * code-draft rules by title — the first thing `bundleFills` gives up before any context line. The plan splits a
   * routine so that each part stays within `LEASED_PROMPT_MAX_CHARS` by this measure.
   */
  chars: number;
  /** The same without any platform context: about the least `bundleFills` can send for this unit. */
  least: number;
}

let headerChars: number | null = null;
/** The larger of the two tracks' headers with the rules by title, and the mark before the request. */
function promptHeaderChars(): number {
  headerChars ??= Math.max(fillInstructionHeader('node', { briefRules: true }).length, fillInstructionHeader('rap', { briefRules: true }).length) + FILL_REQUEST_MARK.length;
  return headerChars;
}

/**
 * The fill prompt of one unit, estimated from the plan (owner decision 17.10.2026): the request entry
 * `prepareEngineLed` writes for it — signature, ABAP slice with declarations and call sites, rules, guards,
 * decimals, callees — serialised as `fillPrompt` serialises it, plus the header and the class text above.
 * The guards and rules a unit carries count here: a part of 290 lines with 67 checks and 51 rules had a
 * slice inside the hard budget and a prompt of 68,000 characters. `scripts/transformation/measure.ts` prints
 * it; `tests/transformation-prompt-split.spec.ts` holds it above the real prompt of every unit it plans.
 */
export function estimateFillPrompt(unit: Unit, plan: Pick<UnitPlan, 'rules' | 'units' | 'guards' | 'program' | 'decimals'>, facts: EngineFacts): FillPromptEstimate {
  const slice = sliceFor(unit, plan, facts);
  const sliceUpper = slice.text.toUpperCase();
  const byId = new Map(plan.units.map((u) => [u.id, u]));
  const entry = {
    unitId: unit.id,
    function: { name: unit.fn.length >= unit.rapName.length ? unit.fn : unit.rapName, file: unit.file, signature: unit.signature, returns: 'StepResult' },
    abap: { ranges: slice.ranges, text: slice.text, declarations: slice.declarations, callSites: slice.callSites },
    rules: unit.rules
      .map((id) => plan.rules.find((r) => r.id === id))
      .filter((r): r is PlanRule => !!r && r.decision !== 'drop')
      .map((r) => ({ id: r.id, decision: r.decision, text: r.text, ...(r.decision === 'change' && r.proposal ? { proposal: r.proposal } : {}) })),
    guards: guardEntries(plan.guards, unit.guards, unit.id),
    facts: {
      decimals: plan.decimals
        .filter((d) => sliceUpper.includes(d.name.toUpperCase()))
        .slice(0, 12)
        .map((d) => ({ name: d.name, digits: d.digits, decimals: d.decimals, type: `Dec<'${d.name.toUpperCase()}',${d.digits},${d.decimals}>` })),
    },
    available: { helpers: [], callees: unit.callees.map((id) => byId.get(id)?.signature.replace(/^export\s+/, '') ?? id) },
  };
  const request = (context: string) =>
    JSON.stringify({ schema: 'cc.fill.v1', track: 'node', program: plan.program, context, rules: 'See CODE-DRAFT RULES in the header.', units: [entry], repair: null }).length;
  const classText = PROMPT_CLASS_BASE_CHARS + PROMPT_CLASS_PER_GUARD_CHARS * unit.guards.length + PROMPT_CLASS_PER_CALLEE_CHARS * unit.callees.length;
  const least = promptHeaderChars() + request('') + classText;
  return { chars: least + FILL_CONTEXT_MAX_CHARS + PROMPT_CONTEXT_ESCAPE_CHARS, least };
}

/** A routine's lines `c` as part `index` of `of` — the unit the split writes, and the one it measures before it cuts. */
function partOf(plan: Pick<UnitPlan, 'rules' | 'guards'>, u: Unit, c: { lineStart: number; lineEnd: number }, index: number, of: number): Unit {
  return {
    ...u,
    id: `${u.id}P${index}`,
    fn: `${u.fn}Part${index}`,
    rapName: `${u.rapName.slice(0, 24)}_part${index}`,
    file: u.file.replace(/\.ts$/, `-part${index}.ts`),
    title: `${u.title} (part ${index} of ${of})`,
    abap: [{ lineStart: c.lineStart, lineEnd: c.lineEnd, routine: u.routine ?? u.fn }],
    folded: [],
    rules: u.rules.filter((id) => plan.rules.find((r) => r.id === id)?.ranges.some((rg) => rg.lineStart >= c.lineStart && rg.lineStart <= c.lineEnd)),
    guards: u.guards.filter((id) => {
      const g = plan.guards.find((x) => x.id === id)!;
      return g.line >= c.lineStart && g.line <= c.lineEnd;
    }),
    guardCalls: [],
    bodyCalls: [],
    callees: u.callees,
    signature: `export function ${u.fn}Part${index}(sel: Selection, st: RunState, local: Record<string, unknown>): StepResult`,
    part: { index, of, parent: u.id },
  };
}

/**
 * The parent routine's locals a part of a split routine reads or writes (3.0.20, the SD acceptance of 21.10.2026:
 * part 2 of a routine used the parent's `ls_effect`, `lv_code`, `ls_work`, `lv_delivered` bare and was refused): of
 * `names`, those the part's own ABAP statements name, in the order of `names`. The frame hands exactly these over, so
 * a body uses them under their own names and never reaches for the parent's state another way. A name inside a
 * literal does not count; a string template's embedded expression does (`|{ lv_code }|`).
 */
export function partLocalsOf(statements: readonly Pick<AbapStatement, 'text' | 'lineStart'>[], part: Pick<Unit, 'abap'>, names: readonly string[]): string[] {
  const range = part.abap[0];
  if (!range || names.length === 0) return [];
  const code = statements
    .filter((s) => s.lineStart >= range.lineStart && s.lineStart <= range.lineEnd)
    .map((s) => s.text.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`/g, "''"))
    .join('\n');
  return names.filter((n) => new RegExp(`(?<![\\w\\-~>/])${n.replace(/[.*+?^${}()|[\]\\/<>]/g, '\\$&')}(?![\\w/])`, 'i').test(code));
}

/**
 * The locals a routine declares with STATICS, lower case: they keep their
 * value from one call of the routine to the next, so the parent of a split routine keeps them across its calls
 * instead of starting them afresh with the others.
 */
export function staticLocalsOf(statements: readonly Pick<AbapStatement, 'text' | 'lineStart' | 'keyword'>[], unit: Pick<Unit, 'abap'>): Set<string> {
  const range = unit.abap[0];
  const out = new Set<string>();
  if (!range) return out;
  for (const s of statements) {
    if (s.keyword !== 'STATICS' || s.lineStart < range.lineStart || s.lineStart > range.lineEnd) continue;
    const m = /^STATICS\s*:?\s*(?:BEGIN\s+OF\s+)?([\w/]+)/i.exec(s.text);
    if (m && !/^END$/i.test(m[1])) out.add(m[1].toLowerCase());
  }
  return out;
}

/** Lx or Lx–Ly. */
const lineSpan = (r: { lineStart: number; lineEnd: number }) => (r.lineStart === r.lineEnd ? `L${r.lineStart}` : `L${r.lineStart}–L${r.lineEnd}`);

/**
 * Why a function's fill prompt is still estimated above `LEASED_PROMPT_MAX_CHARS` with the whole platform
 * context after the split (3.0.17) — said in the plan, never left to a prompt that silently exceeds the
 * cap. It is one statement the engine does not cut (a LOOP with its checks), or the main path, which is
 * not split. `bundleFills` then gives up the rules' text and context lines; a call still above the cap is
 * not sent, and the function stays a stub with this reason (`preflightFactsOf`).
 */
function promptOverCapReason(u: Unit, est: FillPromptEstimate, facts: EngineFacts): string {
  const what = `${u.guards.length} check${u.guards.length === 1 ? '' : 's'} and ${u.rules.length} rule${u.rules.length === 1 ? '' : 's'}`;
  const need = `its fill prompt is estimated at about ${est.chars.toLocaleString('en-US')} characters with the whole platform context (${est.least.toLocaleString('en-US')} without it), above the ${LEASED_PROMPT_MAX_CHARS.toLocaleString('en-US')} one fill call may carry`;
  const tail = 'The call gives up the rules\' text and context lines first; if it still does not fit, this function is not sent and stays a stub.';
  if (u.kind === 'orchestrator') return `The main path carries ${what}; ${need}. The main path is not split into parts. ${tail}`;
  const range = u.abap[0];
  const formLine = u.part ? range.lineStart - 1 : range.lineStart;
  const endLine = u.part ? range.lineEnd + 1 : range.lineEnd;
  const tops = topStatements(facts, formLine, endLine);
  const who = u.part ? `Part ${u.part.index} of ${u.part.of} of ${u.routine ?? u.fn}` : (u.routine ?? u.fn);
  const where =
    tops.length === 1
      ? `is one statement — ${tops[0].keyword} with its block, ${lineSpan({ lineStart: tops[0].lineStart, lineEnd: endLine - 1 })} —`
      : `(${lineSpan(range)}) has no statement boundary at its top level the engine may cut at, and`;
  return `${who} ${where} carries ${what}; ${need}. The engine splits a routine only between its top-level statements and never cuts a statement or its ABAP. ${tail}`;
}

/** The statements directly inside a routine whose own line is `formLine` and whose end is `endLine`. */
function topStatements(facts: EngineFacts, formLine: number, endLine: number): AbapStatement[] {
  return facts.statements.filter((s, i) => s.lineStart > formLine && s.lineEnd < endLine && (facts.blocks.enclosing[i]?.length ?? 0) === 1);
}

/**
 * §7.2: a routine is split at its top-level statements into `<fn>Part1…n`
 * when its ABAP is above the hard budget or, since 17.10.2026 (roadmap
 * 3.0.17), when its fill prompt is: a part grows statement by statement while
 * its lines stay within the hard budget (where the routine is above it) and
 * its estimated prompt (`estimateFillPrompt`, the guards and rules its lines
 * hold included) within `LEASED_PROMPT_MAX_CHARS`. Every part carries the
 * whole ABAP of its lines. The parent keeps its signature and calls the parts
 * in order (engine-written), sharing the run state. A single statement that
 * does not fit stays one part, and the plan says so (`promptOverCap`).
 */
function splitOversized(plan: UnitPlan, facts: EngineFacts): void {
  const out: Unit[] = [];
  for (const u of plan.units) {
    out.push(u);
    if (u.kind !== 'routine' && u.kind !== 'method') continue;
    const own = u.abap[0];
    const ownLines = own.lineEnd - own.lineStart + 1;
    const ownChars = facts.lines.slice(own.lineStart - 1, own.lineEnd).join('\n').length;
    const byHard = ownLines > HARD_SLICE_LINES || ownChars > HARD_SLICE_CHARS;
    const byPrompt = estimateFillPrompt(u, plan, facts).chars > LEASED_PROMPT_MAX_CHARS;
    if (!byHard && !byPrompt) continue;
    // Top-level statements of the routine: only the routine's own block encloses them.
    const tops = topStatements(facts, own.lineStart, own.lineEnd);
    const fits = (lineStart: number, lineEnd: number) => estimateFillPrompt(partOf(plan, u, { lineStart, lineEnd }, 1, 2), plan, facts).chars <= LEASED_PROMPT_MAX_CHARS;
    const cuts: Array<{ lineStart: number; lineEnd: number }> = [];
    let start = own.lineStart + 1;
    let chars = 0;
    for (const [i, s] of tops.entries()) {
      const len = facts.lines.slice(s.lineStart - 1, s.lineEnd).join('\n').length;
      const overHard = byHard && (s.lineEnd - start + 1 > HARD_SLICE_LINES - 20 || chars + len > HARD_SLICE_CHARS - 1_000);
      // The prompt is measured with the statement's whole block (a LOOP up to its ENDLOOP): up to the next top-level
      // statement. Only where the part already holds a statement: a cut before the first one would leave an empty part.
      const blockEnd = (tops[i + 1]?.lineStart ?? own.lineEnd) - 1;
      if (s.lineStart - 1 >= start && (overHard || (byPrompt && !fits(start, blockEnd)))) {
        cuts.push({ lineStart: start, lineEnd: s.lineStart - 1 });
        start = s.lineStart;
        chars = 0;
      }
      chars += len;
    }
    if (own.lineEnd - 1 >= start) cuts.push({ lineStart: start, lineEnd: own.lineEnd - 1 });
    if (cuts.length < 2) continue;
    plan.stats.split.push(u.routine ?? u.fn);
    const parts = cuts.map((c, i): Unit => partOf(plan, u, c, i + 1, cuts.length));
    // Guard predicates of a part are filled by that part.
    for (const p of parts) for (const id of p.guards) {
      const g = plan.guards.find((x) => x.id === id)!;
      g.unitId = p.id;
      g.regionId = `${p.id}.${id.replace('-', '')}`;
      if (g.placement === 'body') p.bodyCalls.push(id);
    }
    u.bodyCalls = u.bodyCalls.filter((id) => !parts.some((p) => p.bodyCalls.includes(id)));
    u.guards = u.guards.filter((id) => !parts.some((p) => p.guards.includes(id)));
    out.push(...parts);
  }
  plan.units = out;
}

/** sha256 over the plan's canonical form: what the scaffold is built from. */
export function planDigest(plan: Pick<UnitPlan, 'version' | 'sourceSha256' | 'units' | 'rules' | 'guards' | 'fields'>): string {
  const canonical = JSON.stringify({
    v: plan.version,
    s: plan.sourceSha256,
    u: plan.units.map((u) => [u.id, u.kind, u.fn, u.abap.map((a) => [a.lineStart, a.lineEnd]), u.rules, u.guards, u.guardCalls, u.bodyCalls, u.callees]),
    r: plan.rules.map((r) => [r.id, r.decision, r.proposal ?? '', r.unitId ?? '']),
    g: plan.guards.map((g) => [g.id, g.rule ?? '', g.carried, g.unitId ?? '', g.outcome, g.placement, g.operands.map((o) => o.key)]),
    f: plan.fields.map((f) => [f.original, f.path ?? '', f.kind, f.digits ?? '', f.places, f.obligatory, JSON.stringify(f.base?.value ?? null)]),
  });
  return sha256Hex(canonical);
}

/** The ABAP range list of a set of units as `L500–L540` words. */
export function rangeWords(ranges: readonly AbapRange[]): string {
  return ranges.map((r) => (r.lineStart === r.lineEnd ? `L${r.lineStart}` : `L${r.lineStart}–L${r.lineEnd}`)).join(', ');
}

/**
 * The guards of one unit as a fill request lists them (§8.2): where each is
 * called — at the entry by the stub, in the body at the original's line, or
 * with the selection — its predicate region, and the values a derived one
 * takes. Track C's fill prompt says from this where a body must call a guard.
 */
export function fillGuardsOf(plan: Pick<UnitPlan, 'guards' | 'units'>, unitId: string): FillRequestUnit['guards'] {
  const unit = plan.units.find((u) => u.id === unitId);
  if (!unit) return [];
  return guardEntries(plan.guards, unit.guards);
}

/** The guard entries of a fill request; `regionOf` names the unit a part measured before it exists will own them. */
function guardEntries(guards: readonly PlanGuard[], ids: readonly string[], regionOf?: string): FillRequestUnit['guards'] {
  return ids.map((id) => {
    const g = guards.find((x) => x.id === id)!;
    return {
      id: g.id,
      rule: g.rule,
      helper: g.helper,
      condition: g.condition,
      effect: g.effect,
      line: g.line,
      regionId: regionOf && g.regionId ? `${regionOf}.${g.id.replace('-', '')}` : g.regionId,
      placement: g.placement,
      basis: g.basis,
      values: g.operands.map((o) => o.key),
    };
  });
}

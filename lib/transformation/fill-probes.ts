/**
 * Probes that reach the written functions (roadmap 3.0.13, item 4; design
 * `docs/design/engine-led-transformation.md` §13.1).
 *
 * Until 3.0.13 the acceptance adapter mapped only probes whose subject is
 * engine-written code (exact decimals, CSV, run ids, the input contract); the
 * display filter, the additive recalculation and the negative write were
 * `notApplicable` — their subject is business logic the model fills write.
 * Here the engine reads, from the original, where each of the three patterns
 * stands and builds a probe for it that runs the **whole process** — the
 * written functions — through the scaffold's own entry points
 * (`test/acceptance-shims.ts`: `listOf`, `exportOf`, `recalcOf`, `writeOf`):
 *
 *   - **display filter** (FP-SCOPE-01): a SELECT-OPTION `FOR` a component of
 *     the input records that the original applies (`… IN s_matnr`). Two records
 *     that differ only in that component; the list and the export of a run with
 *     the range must hold only the matching one — or the run is refused.
 *   - **additive recalculation** (FP-MEAN-05): a record component the original
 *     recalculates from its own value (`<ls>-y = <ls>-y + x`, `ADD x TO ls-y`)
 *     with a single operand the request can set (an input or a literal). The
 *     record comes in with an existing value; the run must add to it.
 *   - **negative write** (FP-GUARD-05): the original writes a database table and
 *     refuses a negative value of a request field the write carries
 *     (`IF ls-amount < 0. MESSAGE e…`). A run with that field at −1 must be
 *     refused; a run with the field's base value must not be (the control).
 *
 * Expectations come from the pattern, never from the package. A probe whose
 * run reaches a function still left as a stub answers with nothing to judge,
 * and the probe reads *Not run* with that reason — never a pass, never a fail.
 * Each probe names the unit it reaches (`units`), so a failure goes back to
 * that written function (`mapProbeFailures` in verify.ts) — and, when the
 * original performs that routine only under a condition of its main block, to
 * the orchestrator as well, which decides whether the routine runs at all.
 * Where the original shows none of these, the probe stays `notApplicable` and
 * says why.
 *
 * Pure and deterministic. No network, no model.
 */

import type { AbapStatement } from '../abap/statement-reader';
import { contractModel, hasRecords } from './call-contract';
import { listOfPath } from './input-lists';
import { selfUpdateOf } from './unit-plan';
import type { ContractField, Unit, UnitPlan } from './types';

export type FillProbe = 'display-filter' | 'recalc-additive' | 'negative-write';
export const FILL_PROBES: readonly FillProbe[] = ['display-filter', 'recalc-additive', 'negative-write'];

/** The values the display-filter probe gives the two records. */
export const FILTER_VALUES = ['PRB-A', 'PRB-B'] as const;
/** The existing value of the recalculation probe and the increment it sets where the operand is an input. */
export const RECALC_EXISTING = 125;
export const RECALC_INCREMENT = 10;

type Config = Record<string, unknown>;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The unit whose ABAP lines hold this line — the narrowest one (a part before its parent); null when no carried unit does. */
export function unitAtLine(plan: Pick<UnitPlan, 'units'>, line: number): Unit | null {
  let best: Unit | null = null;
  let size = Infinity;
  for (const u of plan.units) {
    for (const r of u.abap) {
      if (line < r.lineStart || line > r.lineEnd) continue;
      const s = r.lineEnd - r.lineStart;
      if (s < size) {
        best = u;
        size = s;
      }
    }
  }
  return best;
}

/**
 * The units a probe through `line` reaches: the unit of the line, and the orchestrator when the main block
 * performs that unit's routine only inside an IF, CASE or loop — then the orchestrator decides whether the
 * line runs at all.
 */
export function unitsReaching(plan: Pick<UnitPlan, 'units'>, statements: readonly AbapStatement[], line: number): string[] {
  const unit = unitAtLine(plan, line);
  if (!unit) return [];
  const orch = plan.units.find((u) => u.kind === 'orchestrator');
  if (!orch || unit.id === orch.id || !unit.routine) return [unit.id];
  const routine = (unit.part ? plan.units.find((u) => u.id === unit.part!.parent)?.routine : unit.routine) ?? unit.routine;
  const inOrch = (l: number) => orch.abap.some((r) => l >= r.lineStart && l <= r.lineEnd);
  let depth = 0;
  let conditional = false;
  const call = new RegExp(`^PERFORM\\s+${escape(routine)}\\b`, 'i');
  for (const st of [...statements].sort((a, b) => a.lineStart - b.lineStart)) {
    if (!inOrch(st.lineStart)) continue;
    const k = st.keyword;
    if (k === 'IF' || k === 'CASE' || k === 'LOOP' || k === 'DO' || k === 'WHILE') depth++;
    else if (k === 'ENDIF' || k === 'ENDCASE' || k === 'ENDLOOP' || k === 'ENDDO' || k === 'ENDWHILE') depth = Math.max(0, depth - 1);
    else if (k === 'PERFORM' && call.test(st.text) && depth > 0) conditional = true;
  }
  return conditional ? [unit.id, orch.id] : [unit.id];
}

/** The field an original name stands for — itself, or a record field by its component (`<ls>-menge` → MENGE). */
function fieldNamed(plan: Pick<UnitPlan, 'fields'>, name: string): ContractField | null {
  const s = name.replace(/^@/, '').toUpperCase();
  const comp = s.includes('-') ? s.slice(s.lastIndexOf('-') + 1) : null;
  return plan.fields.find((f) => f.where !== 'internal' && f.original === s) ?? (comp ? plan.fields.find((f) => f.where === 'record' && f.original === comp) ?? null : null);
}

const numericKind = (f: ContractField) => f.kind === 'packed' || f.kind === 'integer';
const holds = (f: ContractField, value: number) => f.max === null || Number(f.max) >= Math.abs(value);

/** The base request, and the first row of a list (the record list unless named), for building probe requests. */
function baseOf(plan: UnitPlan, list = 'records'): { request: Record<string, unknown>; record: Record<string, unknown> } {
  const request = structuredClone(contractModel(plan).baseRequest);
  const records = Array.isArray(request[list]) ? (request[list] as Array<Record<string, unknown>>) : [];
  return { request, record: { ...(records[0] ?? {}) } };
}

/** Why no request can be built at all, or null. */
function noRequest(plan: UnitPlan): string | null {
  if (plan.missingBaseValues.length > 0) return `the original gives no valid value for ${plan.missingBaseValues.join(', ')}, so no request can be built`;
  return null;
}

function displayFilter(plan: UnitPlan, statements: readonly AbapStatement[]): Config {
  const blocked = noRequest(plan);
  if (blocked) return { notApplicable: blocked };
  if (!hasRecords(plan)) return { notApplicable: 'the program takes no input records a selection could filter' };
  for (const range of plan.fields.filter((f) => f.where === 'selection' && f.kind === 'range')) {
    const target = /^FOR\s+([\w/<>~-]+)$/i.exec(range.declaration)?.[1];
    if (!target || !target.includes('-')) continue;
    const comp = target.slice(target.lastIndexOf('-') + 1).toUpperCase();
    const field = plan.fields.find((f) => f.where === 'record' && f.kind === 'text' && f.original === comp);
    if (!field) continue;
    const applies = new RegExp(`\\bIN\\s+@?${escape(range.original)}\\b`, 'i');
    const lines = statements.filter((st) => applies.test(st.text) && unitAtLine(plan, st.lineStart)).map((st) => st.lineStart);
    if (lines.length === 0) continue;
    const units = [...new Set(lines.flatMap((l) => unitsReaching(plan, statements, l)))];
    const list = listOfPath(field.path) ?? 'records';
    const { request, record } = baseOf(plan, list);
    for (const f of plan.fields) if (f.where === 'selection' && f.kind === 'range') request[f.key] = [];
    request[list] = FILTER_VALUES.map((v) => ({ ...record, [field.key]: v }));
    const filtered = { ...structuredClone(request), [range.key]: [{ sign: 'I', option: 'EQ', low: FILTER_VALUES[0], high: null }] };
    return {
      call: { module: 'shims', export: 'listOf' },
      argsAll: [request],
      argsFiltered: [filtered],
      items: 'rows',
      match: { field: field.key, value: FILTER_VALUES[0] },
      refused: { path: 'refused', equals: true },
      export: { call: { module: 'shims', export: 'exportOf' }, args: [filtered], result: 'csv', delimiter: plan.csvDelimiter },
      units,
      reaches: `${range.original} on ${field.original}, applied at ${lines.map((l) => `L${l}`).join(', ')}`,
    };
  }
  return { notApplicable: 'the original applies no selection range to a field of its input records' };
}

function recalcAdditive(plan: UnitPlan, statements: readonly AbapStatement[]): Config {
  const blocked = noRequest(plan);
  if (blocked) return { notApplicable: blocked };
  const reasons: string[] = [];
  for (const st of statements) {
    const update = selfUpdateOf(st.text);
    if (!update || update.sign !== '+' || !unitAtLine(plan, st.lineStart)) continue;
    const field = plan.fields.find((f) => f.where === 'record' && f.kind === 'packed' && f.original === update.component.toUpperCase());
    if (!field || !field.path) continue;
    if (!holds(field, RECALC_EXISTING + RECALC_INCREMENT)) {
      reasons.push(`${field.original} cannot hold ${RECALC_EXISTING + RECALC_INCREMENT}`);
      continue;
    }
    const list = listOfPath(field.path) ?? 'records';
    const { request, record } = baseOf(plan, list);
    const row: Record<string, unknown> = { ...record, [field.key]: '$existing' };
    let increment: number;
    const literal = /^'?(-?\d+(?:\.\d+)?)'?$/.exec(update.operand);
    if (literal) {
      increment = Number(literal[1]);
      if (!(increment > 0)) continue;
    } else {
      const operand = fieldNamed(plan, update.operand);
      if (!operand || operand === field || !numericKind(operand) || !holds(operand, RECALC_INCREMENT)) {
        reasons.push(`the increment ${update.operand} at L${st.lineStart} is not an input the request can set`);
        continue;
      }
      increment = RECALC_INCREMENT;
      if (operand.where === 'record') row[operand.key] = String(RECALC_INCREMENT);
      else request[operand.key] = String(RECALC_INCREMENT);
    }
    return {
      call: { module: 'shims', export: 'recalcOf' },
      args: [{ ...request, [list]: '$rows' }, field.key],
      rowTemplate: row,
      value: 'value',
      existing: RECALC_EXISTING,
      increment,
      units: unitsReaching(plan, statements, st.lineStart),
      reaches: `${field.original} recalculated from its own value at L${st.lineStart}`,
    };
  }
  return { notApplicable: reasons.length > 0 ? `the original's recalculation cannot be probed: ${reasons.join('; ')}` : 'the original recalculates no input field from its own value' };
}

/** Database tables the original writes (UPDATE, INSERT … FROM/VALUES, MODIFY … FROM), with the statement. */
export function databaseWrites(plan: Pick<UnitPlan, 'units'>, statements: readonly AbapStatement[]): AbapStatement[] {
  const dataObjects = new Set<string>();
  for (const st of statements) {
    const decl = /^(?:DATA|STATICS|CLASS-DATA|FIELD-SYMBOLS)\s*:?\s*(<?[\w/]+>?)/i.exec(st.text);
    if (decl) dataObjects.add(decl[1].toLowerCase());
    for (const m of st.text.matchAll(/\bDATA\(([\w/]+)\)/gi)) dataObjects.add(m[1].toLowerCase());
  }
  return statements.filter((st) => {
    if (!unitAtLine(plan, st.lineStart)) return false;
    const t = st.text;
    if (/^UPDATE\s+[\w/]+\s+(?:SET|FROM)\b/i.test(t)) return true;
    const insert = /^INSERT\s+(?:INTO\s+)?([\w/]+)\s+(?:FROM|VALUES)\b/i.exec(t);
    if (insert) return !dataObjects.has(insert[1].toLowerCase());
    const modify = /^MODIFY\s+([\w/]+)\s+FROM\b/i.exec(t);
    if (modify) return modify[1].toUpperCase() !== 'TABLE' && !dataObjects.has(modify[1].toLowerCase());
    return false;
  });
}

function negativeWrite(plan: UnitPlan, statements: readonly AbapStatement[]): Config {
  const blocked = noRequest(plan);
  if (blocked) return { notApplicable: blocked };
  const writes = databaseWrites(plan, statements);
  if (writes.length === 0) return { notApplicable: 'the original writes no database table' };
  for (const g of plan.guards) {
    if (!g.carried || !g.unitId || g.outcome !== 'refuses' || g.basis !== 'raw' || !g.subject) continue;
    const zero = g.literals.some((l) => l.trim() !== '' && Number(l) === 0);
    const refusesNegative = g.effect === 'check' ? g.op === '>=' || g.op === '>' : g.op === '<' || g.op === '<=';
    if (!zero || !refusesNegative) continue;
    const field = fieldNamed(plan, g.subject);
    if (!field || !field.path || !numericKind(field) || !holds(field, 1) || !field.base || typeof field.base.value !== 'string') continue;
    const valid = Number(field.base.value);
    if (!(valid > 0)) continue;
    const subject = g.subject.toLowerCase();
    const holder = subject.includes('-') ? subject.slice(0, subject.indexOf('-')) : null;
    const comp = field.original.toLowerCase();
    const carries = writes.filter((w) => new RegExp(`\\b${escape(comp)}\\b`, 'i').test(w.text) || (holder ? new RegExp(`(?:^|[^\\w<])${escape(holder)}\\b`, 'i').test(w.text) : false));
    if (carries.length === 0) continue;
    const { request } = baseOf(plan);
    if (field.where === 'record') (request[listOfPath(field.path) ?? 'records'] as Array<Record<string, unknown>>)[0][field.key] = '$value';
    else request[field.key] = '$value';
    return {
      call: { module: 'shims', export: 'writeOf' },
      args: [request],
      value: -1,
      validValue: valid,
      refused: { path: 'outcome', equals: 'refused' },
      units: [...new Set([g.unitId, ...unitsReaching(plan, statements, g.line)])],
      reaches: `${g.id} (${g.condition}) before the write at ${carries.map((w) => `L${w.lineStart}`).join(', ')}`,
    };
  }
  return { notApplicable: 'the original refuses no negative value of a field it writes to the database' };
}

/** The adapter entries of the three probes that reach the written functions — see the file comment. */
export function fillProbeConfigs(plan: UnitPlan, facts: { statements: readonly AbapStatement[] }): Record<FillProbe, Config> {
  return {
    'display-filter': displayFilter(plan, facts.statements),
    'recalc-additive': recalcAdditive(plan, facts.statements),
    'negative-write': negativeWrite(plan, facts.statements),
  };
}

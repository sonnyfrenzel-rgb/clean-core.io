/**
 * The call contract and the acceptance adapter of a scaffold (design §6.2;
 * code-draft rule 24, `lib/engine-call-contract.ts`).
 *
 *   - `contractModel(plan)` — the `CONTRACT` object `srv/engine-contract.ts`
 *     exports: a base request every input check passes, and the map from the
 *     original's field names to request paths (internal decimals `null`).
 *   - `acceptanceAdapter(plan, options)` — `acceptance-adapter.json`: how the
 *     harness (`scripts/acceptance/run.mjs`) calls the package. The probes of
 *     engine-written code (rounding, decimal quantities, run ids, empty
 *     selection, lenient numbers, CSV escaping, import side effects) map to the
 *     scaffold's own exports; a probe whose subject only the fills write (a
 *     display filter, an additive recalculation, a negative write) runs the
 *     whole process where the original shows the pattern (`fill-probes.ts`,
 *     3.0.13) and is `notApplicable` with the reason where it does not.
 *   - `engineCaseScope(cases)` — which engine cases the scaffold alone can
 *     answer (input contract, exact arithmetic, run identity) and which need
 *     the business logic of the fills (guards, record counts, a check's predicate asked directly). Track C's verify
 *     maps the second group to units; the first group is the scaffold's own
 *     test (a failure there is the engine's bug, §13.2 rule 2).
 *
 * Pure and deterministic. No network, no model.
 */

import type { EngineTestCase } from '../testing-engine-cases';
import { listOfPath } from './input-lists';
import type { AcceptanceAdapter, ContractField, UnitPlan } from './types';

export interface ContractModel {
  version: 1;
  baseRequest: Record<string, unknown>;
  fields: Record<string, string | null>;
  /** Obligatory fields with no valid base value known from the original — the base request lacks them. */
  missingBaseValues: string[];
}

/**
 * The value the base request carries for a field: the one the planner read from the original
 * (`ContractField.base`, base-values.ts) — undefined when there is none.
 */
export function baseValueOf(f: ContractField): unknown {
  return f.base ? f.base.value : undefined;
}

/** True when the contract has a record list. */
export const hasRecords = (plan: Pick<UnitPlan, 'fields'>) => plan.fields.some((f) => f.where === 'record');

/**
 * The `CONTRACT` of `srv/engine-contract.ts`. `lists` are the request keys of the package's input and lookup lists
 * (`LISTS` of srv/lib/input-contract.ts): a base request with no value of its own is one of them, empty — `run: true`
 * only where the package has no field and no list, the one case its input check knows `run` (scaffold 17; until then
 * every engine case of the order-integrity example read Not run, its base request refused as an unknown option).
 */
export function contractModel(plan: Pick<UnitPlan, 'fields'> & Partial<Pick<UnitPlan, 'missingBaseValues'>>, lists: readonly string[] = []): ContractModel {
  const baseRequest: Record<string, unknown> = {};
  // One base row per list the record fields name: `records` until scaffold version 7, one list per input
  // structure since (`claims[].price`, input-lists.ts).
  const rows = new Map<string, Record<string, unknown>>();
  const fields: Record<string, string | null> = {};
  for (const f of plan.fields) {
    fields[f.original] = f.path;
    const list = f.where === 'record' ? listOfPath(f.path) ?? 'records' : null;
    if (list && !rows.has(list)) rows.set(list, {});
    const value = baseValueOf(f);
    if (value === undefined) continue;
    if (f.where === 'selection') baseRequest[f.key] = value;
    else if (list) rows.get(list)![f.key] = value;
  }
  for (const [list, row] of rows) baseRequest[list] = [row];
  if (Object.keys(baseRequest).length === 0) {
    if (lists.length > 0) baseRequest[lists[0]] = [];
    else baseRequest.run = true;
  }
  return { version: 1, baseRequest, fields, missingBaseValues: [...(plan.missingBaseValues ?? [])] };
}

export interface AdapterOptions {
  packageName: string;
  /** Modules the import probe loads (never `srv/server.ts`, the one file that listens). */
  modules: Record<string, string>;
  delimiter: string;
  /** The request keys of the package's lists, as `contractModel` takes them. */
  lists?: readonly string[];
  /** The display-filter, recalculation and negative-write entries (`fillProbeConfigs`, fill-probes.ts). */
  fill?: Partial<Record<'display-filter' | 'recalc-additive' | 'negative-write', Record<string, unknown>>>;
}

/** The field the lenient-numeric probe sets: an obligatory whole number first, then a record decimal, then an obligatory decimal input. */
function numericProbeField(plan: Pick<UnitPlan, 'fields'>): ContractField | null {
  const fs = plan.fields.filter((f) => f.base !== null);
  return (
    fs.find((f) => f.where === 'selection' && f.obligatory && (f.kind === 'digits' || f.kind === 'integer')) ??
    fs.find((f) => f.where === 'record' && f.kind === 'packed') ??
    fs.find((f) => f.where === 'selection' && f.obligatory && f.kind === 'packed') ??
    null
  );
}

/** `acceptance-adapter.json` for a Node scaffold. */
export function acceptanceAdapter(plan: Pick<UnitPlan, 'fields' | 'decimals'> & Partial<Pick<UnitPlan, 'missingBaseValues'>>, options: AdapterOptions): AcceptanceAdapter {
  const contract = contractModel(plan, options.lists);
  const probes: Record<string, unknown> = {};
  probes['rounding-commercial'] = {
    call: { module: 'shims', export: 'percentOf' },
    args: ['$amount', '$rate', 2],
    result: 'value',
    ratePercent: '7.5',
    places: 2,
    signed: true,
    maxAmount: '200.00',
  };
  probes['decimal-quantity'] = {
    call: { module: 'shims', export: 'coverage' },
    args: [{ required: '$required', withdrawn: '$withdrawn', available: '$available' }],
    result: '',
    covered: { path: 'status', equals: 'COVERED' },
  };
  // Through the call contract when the base request is complete; when the original gives no valid value for
  // an obligatory field, through the run store itself — the code that makes the ids is the engine's either way.
  probes['run-id-collision'] =
    contract.missingBaseValues.length === 0
      ? {
          create: { module: 'contract', export: 'simulate' },
          argsA: [contract.baseRequest],
          argsB: [structuredClone(contract.baseRequest)],
          id: 'runId',
          get: { module: 'contract', export: 'getRun', args: ['$id'] },
          compare: { create: 'runId', get: 'runId' },
        }
      : {
          create: { module: 'runStore', export: 'createRunStore', factory: [], method: 'create' },
          argsA: [{ selection: { probe: 'A' }, sourceRevision: 'probe', ruleRevision: 'probe', contextDigest: null, complete: false, notFilled: [], records: 0, result: { probe: 'A' } }],
          argsB: [{ selection: { probe: 'B' }, sourceRevision: 'probe', ruleRevision: 'probe', contextDigest: null, complete: false, notFilled: [], records: 0, result: { probe: 'B' } }],
          id: 'runId',
          get: { module: 'runStore', export: 'createRunStore', factory: [], method: 'get', args: ['$id'] },
          compare: { create: 'result', get: 'result' },
        };
  probes['empty-selection'] = {
    call: { module: 'contract', export: 'simulate' },
    args: [{}],
    refused: { path: 'ok', equals: false },
  };
  const numeric = numericProbeField(plan);
  if (numeric && numeric.path) {
    const request = structuredClone(contract.baseRequest);
    if (numeric.where === 'record') (request[listOfPath(numeric.path) ?? 'records'] as Array<Record<string, unknown>>)[0][numeric.key] = '$value';
    else request[numeric.key] = '$value';
    probes['lenient-numeric'] = {
      call: { module: 'contract', export: 'validate' },
      args: [request],
      valid: String(baseValueOf(numeric)),
      refused: { path: 'ok', equals: false },
      ...(numeric.kind === 'packed' ? { invalid: ['2026x', 'abc', 'NaN', 'Infinity', '', null, '1,5', '1e3'] } : {}),
    };
  } else {
    probes['lenient-numeric'] = { notApplicable: 'the original declares no obligatory numeric input and no packed record field' };
  }
  probes['csv-escaping'] = {
    call: { module: 'shims', export: 'csvRows' },
    args: ['$rows'],
    rowTemplate: { order: '4711', material: '$quoteText', text: '$newlineText', note: '$formulaText' },
    delimiter: options.delimiter,
  };
  // The probes whose subject the model fills write (3.0.13): mapped by `fillProbeConfigs` where the original
  // shows the pattern; without that reading (a caller that names none) they are not applicable, as before.
  probes['display-filter'] = options.fill?.['display-filter'] ?? { notApplicable: 'the list, its totals and its export are written by the model fills, not by the engine' };
  probes['recalc-additive'] = options.fill?.['recalc-additive'] ?? { notApplicable: 'a recalculation is business logic of the model fills; the engine writes no recalculation' };
  probes['negative-write'] = options.fill?.['negative-write'] ?? { notApplicable: 'the package writes no database table itself; a write the original performs is a port the fills implement' };
  return { package: options.packageName, modules: options.modules, probes };
}

export interface EngineCaseScope {
  /** Cases the scaffold alone answers: input contract, exact arithmetic, run identity. */
  scaffold: string[];
  /** Cases whose expectation depends on the fills: guard refusals and record counts. */
  logic: string[];
}

/** Which engine cases the scaffold answers by itself — see the file comment. */
export function engineCaseScope(cases: readonly Pick<EngineTestCase, 'id' | 'engineCase'>[]): EngineCaseScope {
  const scaffold: string[] = [];
  const logic: string[] = [];
  for (const c of cases) {
    const calls = c.engineCase.examples.map((e) => e.call).filter((x): x is NonNullable<typeof x> => Boolean(x));
    const needsLogic = calls.some(
      (call) =>
        // A check's predicate is a fill region (`when_G0061`): asked directly, it answers for the written function.
        call.op === 'check' ||
        (call.op === 'simulate' &&
        call.mode !== 'empty' &&
        (call.expect.kind === 'refused' || call.expect.kind === 'records-delta' || call.expect.kind === 'not-refused-by')),
    );
    (needsLogic ? logic : scaffold).push(c.id);
  }
  return { scaffold, logic };
}

/** The check a guard case asks about (`G-0061`), for mapping its failure to the unit that writes the predicate; null for other cases. */
export function engineCaseGuard(c: Pick<EngineTestCase, 'engineCase'>): string | null {
  for (const e of c.engineCase.examples) if (e.call?.check?.guard) return e.call.check.guard;
  return null;
}

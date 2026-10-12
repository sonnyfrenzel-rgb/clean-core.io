import type { SandboxFile } from './test-sandbox/files';
import { ENGINE_CONTRACT_MARKER, callContractPresence } from './test-sandbox/engine-suite';
import { ENGINE_CASE_PREFIX, engineCaseOf, engineCasesFile } from './testing-engine-cases';
import type { TestRunResult } from './test-verdicts';

/**
 * The engine pass of a test run, as `/api/run-tests` plans and records it
 * (owner decision of 12.10.2026, roadmap 3.0.12).
 *
 * The engine cases run inside the isolated test runner — never in the app
 * service — against the call contract the generated code exports, beside the
 * model's suite (`lib/test-sandbox/engine-suite.ts`, runner protocol 2). Their
 * verdicts are the contract's own: a case that ran there (Passed or Failed)
 * takes that verdict, whatever the model's test for the same id said; a case
 * the contract could not run (skipped, with the reason) keeps the model's
 * verdict, which stays an extra check with a model-written assertion.
 *
 * Pure: no I/O. The route and the specs call the same functions.
 */

export interface EngineRunPlan {
  /** `test/engine-cases.json` text: the engine cases of the stored case list. */
  cases: string;
  /** Where the call contract module stands among the generated files. */
  contractModule: string;
  /** Engine case ids to run; empty = all. */
  patterns: string[];
}

export type EnginePlanOutcome =
  | { kind: 'planned'; plan: EngineRunPlan }
  /** Nothing to plan: no engine cases, or none selected. */
  | { kind: 'none' }
  /** Engine cases exist, but the generated code does not export the call contract. */
  | { kind: 'no-contract'; reason: string };

/** What the engine pass of this run is, from the stored cases, the generated files and the selection. */
export function planEngineRun(
  storedCases: ReadonlyArray<Record<string, unknown>>,
  files: readonly SandboxFile[],
  selected: readonly string[] | null,
): EnginePlanOutcome {
  const engineIds = storedCases.filter((c) => engineCaseOf(c)).map((c) => String(c.id ?? ''));
  if (engineIds.length === 0) return { kind: 'none' };
  const wanted = selected === null ? [] : engineIds.filter((id) => selected.includes(id));
  if (selected !== null && wanted.length === 0) return { kind: 'none' };
  const presence = callContractPresence(files);
  if (!presence.present) {
    return {
      kind: 'no-contract',
      reason: presence.path ? `${presence.path} lacks ${presence.missing.join(', ')}` : 'no srv/engine-contract module',
    };
  }
  const cases = engineCasesFile(storedCases.filter((c) => engineIds.includes(String(c.id ?? ''))));
  if (!cases) return { kind: 'none' };
  return { kind: 'planned', plan: { cases, contractModule: presence.path!, patterns: wanted } };
}

/**
 * The run's verdicts with the engine pass folded in. `viaContract` names the
 * cases whose verdict the contract gave (no model in the loop); the receipt
 * carries it, and the assessment reads it.
 */
export function mergeEngineVerdicts(
  model: readonly TestRunResult[],
  engine: readonly TestRunResult[],
): { results: TestRunResult[]; viaContract: string[] } {
  const fromContract = new Map<string, TestRunResult>();
  for (const r of engine) {
    if (!r.id.toUpperCase().startsWith(ENGINE_CASE_PREFIX)) continue;
    if (!r.name.includes(ENGINE_CONTRACT_MARKER)) continue;
    fromContract.set(r.id, r);
  }
  const decided = new Set([...fromContract.values()].filter((r) => r.status === 'Passed' || r.status === 'Failed').map((r) => r.id));
  const modelIds = new Set(model.map((r) => r.id));
  const results: TestRunResult[] = [
    ...model.filter((r) => !decided.has(r.id)),
    ...[...fromContract.values()].filter((r) => decided.has(r.id) || !modelIds.has(r.id)),
  ];
  return { results, viaContract: [...decided].sort() };
}

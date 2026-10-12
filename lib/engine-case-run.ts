import type { SandboxFile } from './test-sandbox/files';
import { ENGINE_CONTRACT_MARKER, callContractPresence } from './test-sandbox/engine-suite';
import { ENGINE_CASE_PREFIX, engineCaseOf, engineCasesFile } from './testing-engine-cases';
import type { TestRunResult } from './test-verdicts';
// The judge half of the one engine-case runtime (its source; the runner gets the same text as ENGINE_RUNTIME_JS).
import { ENGINE_OUTCOME_MARKER, judgeEngineCase } from '../scripts/acceptance/child/engine-cases-core.mjs';

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
 * The engine pass's verdicts, judged here from its output (3.0.12, QA e1478690996c).
 *
 * The engine suite runs in the same process as the generated code, so nothing
 * in that process's output can be a verdict: the code could print a passing
 * TAP line for any case. The suite therefore prints only what the contract
 * answered — one outcome line per case (`ENGINE_OUTCOME_MARKER` +
 * `{ id, collected }`) — and the verdict is given here, by the same runtime's
 * judge (`judgeEngineCase`), against the cases the app planned itself
 * (`casesJson`, the text it sent). A case without exactly one outcome line —
 * none, or more than one because something else printed one too — is not run.
 * `patterns` are the case ids the run selected; empty for all.
 */
export function engineVerdicts(stdout: string, casesJson: string, patterns: readonly string[]): TestRunResult[] {
  let cases: Array<{ id: string; name?: unknown; examples?: unknown[] }> = [];
  try {
    const parsed = JSON.parse(casesJson) as { cases?: unknown };
    if (Array.isArray(parsed.cases)) cases = parsed.cases.filter((c): c is { id: string } => !!c && typeof (c as { id?: unknown }).id === 'string');
  } catch {
    return [];
  }
  const reported = new Map<string, unknown[]>();
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const at = line.startsWith(ENGINE_OUTCOME_MARKER) ? ENGINE_OUTCOME_MARKER.length : line.startsWith(`# ${ENGINE_OUTCOME_MARKER}`) ? ENGINE_OUTCOME_MARKER.length + 2 : -1;
    if (at < 0) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line.slice(at));
    } catch {
      continue;
    }
    const id = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined;
    if (typeof id !== 'string') continue;
    reported.set(id, [...(reported.get(id) ?? []), (entry as { collected?: unknown }).collected]);
  }
  const selected = patterns.length > 0 ? cases.filter((c) => patterns.includes(c.id)) : cases;
  return selected.map((kase) => {
    const name = `${ENGINE_CONTRACT_MARKER} ${String(kase.name ?? '').slice(0, 120)}`;
    const lines = reported.get(kase.id) ?? [];
    const notRun = (reason: string): TestRunResult => ({ id: kase.id, name, status: 'Skipped', message: `Not run through the call contract: ${reason}` });
    if (lines.length === 0) return notRun('the engine pass reported no outcome for this case');
    if (lines.length > 1) return notRun(`the engine pass reported this case ${lines.length} times — something besides the engine suite printed an outcome line, so none is judged`);
    const r = judgeEngineCase(kase, lines[0]) as { status: string; reason?: string; examples: Array<{ input: string; status: string; evidence: string }> };
    if (r.status === 'Passed') return { id: kase.id, name, status: 'Passed', message: 'Passed through the call contract' };
    if (r.status === 'Failed') {
      return {
        id: kase.id,
        name,
        status: 'Failed',
        message: r.examples.filter((e) => e.status === 'fail').map((e) => `${e.input}: ${e.evidence}`).join(' | '),
      };
    }
    return notRun(String(r.reason ?? 'not run'));
  });
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

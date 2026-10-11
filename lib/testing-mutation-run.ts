import type { SandboxFile } from './test-sandbox/files';
import { generateMutants, mutantOutcome, mutationReport, MAX_MUTANTS, type MutantExecution, type MutantResult, type MutationProbeReport } from './testing-mutation';

/**
 * Runs the mutation probe through an executor the caller hands in — the
 * isolated runner or, in an emulator build, the local sandbox (`/api/run-tests`).
 * One mutant at a time: the runner serves one run per instance, and a probe is
 * a handful of ordinary runs, not a new kind of work for it.
 *
 * A time budget bounds the whole probe: a mutant not started within it is
 * reported as not run, never as caught. Pure apart from the executor and the
 * clock, so a spec drives it with its own.
 */

/** The whole probe's budget; the route's own request must still answer in time. */
export const MUTATION_PROBE_BUDGET_MS = 100_000;
/** One mutant's runner call. The core kills a suite after 15 s; bundling and the call add to it. */
export const MUTANT_CALL_TIMEOUT_MS = 45_000;

export async function runMutationProbe(input: {
  files: SandboxFile[];
  execute(files: SandboxFile[]): Promise<MutantExecution>;
  now?: () => string;
  clock?: () => number;
  budgetMs?: number;
  max?: number;
}): Promise<MutationProbeReport> {
  const clock = input.clock ?? (() => Date.now());
  const started = clock();
  const budget = input.budgetMs ?? MUTATION_PROBE_BUDGET_MS;
  const mutants = generateMutants(input.files, input.max ?? MAX_MUTANTS);
  const results: MutantResult[] = [];
  for (const m of mutants) {
    const base = { id: m.id, operator: m.operator, file: m.file, line: m.line, description: m.description };
    if (clock() - started > budget) {
      results.push({ ...base, outcome: 'not-run' });
      continue;
    }
    let execution: MutantExecution;
    try {
      execution = await input.execute(m.files);
    } catch (err) {
      execution = { kind: 'unavailable', reason: err instanceof Error ? err.message : String(err) };
    }
    results.push({ ...base, outcome: mutantOutcome(execution) });
  }
  return mutationReport(results, (input.now ?? (() => new Date().toISOString()))());
}

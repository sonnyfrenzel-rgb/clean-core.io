import { createHash } from 'node:crypto';
import { ENGINE_RUNTIME_JS } from './engine-runtime';
import type { SandboxFile } from './files';

/**
 * The engine-case run inside the isolated test runner (roadmap 8.9; owner
 * decision of 12.10.2026, roadmap 3.0.12).
 *
 * The engine cases (`lib/testing-engine-cases.ts`) are data written by
 * Clean-Core.io from the original — input and expected outcome in machine form
 * (`call`). They run against the call contract the generated code exports
 * (`srv/engine-contract.*`: CONTRACT, validate, simulate, getRun, compute), with
 * no model-written assertion: a second suite, written here, deterministically,
 * runs every case through the shared runtime (`./engine-runtime.ts`, generated
 * from `scripts/acceptance/child/engine-cases-core.mjs`).
 *
 * The app and the runner build the same inputs from the same two values — the
 * cases JSON and the contract module path — so the app can check the runner's
 * report the way it checks the model suite's: the hash of every file (the
 * generated code, the runtime, the cases) and of the suite. The runner never
 * receives a suite for this pass; it derives it, and a report whose hashes are
 * not the ones the app derived is refused.
 *
 * Pure (node:crypto only): both sides import it; the runner image copies
 * `lib/test-sandbox/` as a whole.
 */

// The contract's shape lives import-free beside this file, so a browser page
// can read it (`./engine-contract-shape.ts`); re-exported here for the runner.
import { ENGINE_CONTRACT_MARKER } from './engine-contract-shape';
export { CALL_CONTRACT_PATHS, CALL_CONTRACT_EXPORTS, ENGINE_CONTRACT_MARKER, callContractPresence } from './engine-contract-shape';

/** The two files the engine pass adds to the generated code. */
export const ENGINE_RUNTIME_PATH = '__cc_engine/runtime.mjs';
export const ENGINE_CASES_PATH = '__cc_engine/cases.json';

/** Largest cases JSON a run may carry. */
export const MAX_ENGINE_CASES_BYTES = 512 * 1024;

const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * The suite of the engine pass. It imports the contract module statically (so
 * the bundler includes it like any generated file), the runtime and the cases,
 * and writes one `node:test` test per case: Passed, Failed with the evidence,
 * or skipped with the reason it could not run.
 */
export function engineSuiteCode(contractModule: string): string {
  const spec = `./${contractModule}`;
  return `// The engine pass — written by Clean-Core.io, not by a model (roadmap 3.0.12).
import { test } from 'node:test';
import * as contract from ${JSON.stringify(spec)};
import { createEngineState, runEngineCase } from ${JSON.stringify(`./${ENGINE_RUNTIME_PATH}`)};
import data from ${JSON.stringify(`./${ENGINE_CASES_PATH}`)};

const state = createEngineState();
for (const kase of (data as { cases: Array<{ id: string; name?: string; examples: unknown[] }> }).cases) {
  test(\`\${kase.id}: ${ENGINE_CONTRACT_MARKER} \${String(kase.name ?? '').slice(0, 120)}\`, async (t: { skip(reason: string): void }) => {
    const r = await runEngineCase(contract, kase, state);
    if (r.status === 'Not run') {
      t.skip(String(r.reason ?? 'not run'));
      return;
    }
    if (r.status === 'Failed') {
      throw new Error(r.examples.filter((e: { status: string }) => e.status === 'fail').map((e: { input: string; evidence: string }) => \`\${e.input}: \${e.evidence}\`).join(' | '));
    }
  });
}
`;
}

export interface EngineRunInputs {
  files: SandboxFile[];
  suiteCode: string;
  casesSha256: string;
}

/**
 * The inputs of the engine pass, from the generated files, the cases JSON and
 * the contract module path — identical on both sides of the wire.
 */
export function engineRunInputs(generated: readonly SandboxFile[], casesJson: string, contractModule: string): EngineRunInputs {
  const files = generated.filter((f) => f.path !== ENGINE_RUNTIME_PATH && f.path !== ENGINE_CASES_PATH);
  return {
    files: [...files, { path: ENGINE_RUNTIME_PATH, content: ENGINE_RUNTIME_JS }, { path: ENGINE_CASES_PATH, content: casesJson }],
    suiteCode: engineSuiteCode(contractModule),
    casesSha256: sha256Hex(casesJson),
  };
}

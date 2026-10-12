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
 * no model-written assertion: a driver, written here, deterministically, runs
 * the contract in a SES compartment and collects every case's answers through
 * the shared runtime (`./engine-runtime.ts`, generated from
 * `scripts/acceptance/child/engine-cases-core.mjs`), and the app judges them
 * with the same runtime outside the run (`engineVerdicts`).
 *
 * The app and the runner build the same inputs from the same two values — the
 * cases JSON and the contract module path — so the app can check the runner's
 * report the way it checks the model suite's: the hash of every file (the
 * generated code, the runtime, the cases) and of the suite. The runner never
 * receives a suite for this pass; it derives it, and a report whose hashes are
 * not the ones the app derived is refused — a runner built before the driver
 * existed derives the old suite, so its engine report is refused, never judged.
 *
 * Pure (node:crypto only): both sides import it; the runner image copies
 * `lib/test-sandbox/` as a whole.
 */

/**
 * The contract's shape lives in `./engine-contract-shape.ts`, without imports,
 * so the browser bundle can read it; it is re-exported here unchanged.
 */
export { CALL_CONTRACT_PATHS, CALL_CONTRACT_EXPORTS, ENGINE_CONTRACT_MARKER, callContractPresence } from './engine-contract-shape';

/** The two files the engine pass adds to the generated code. */
export const ENGINE_RUNTIME_PATH = '__cc_engine/runtime.mjs';
export const ENGINE_CASES_PATH = '__cc_engine/cases.json';

/**
 * What the execution core writes beside them for the engine pass, never sent
 * over the wire: the contract bundled on its own (`./core.ts`, the run's own
 * resolver plugin) and SES, the hardened-JavaScript shim the driver locks the
 * process down with (`ses`, Apache-2.0).
 */
export const ENGINE_CONTRACT_BUNDLE_PATH = '__cc_engine/contract.cjs';
export const ENGINE_SES_PATH = '__cc_engine/ses.cjs';

/** Largest cases JSON a run may carry. */
export const MAX_ENGINE_CASES_BYTES = 512 * 1024;

const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * The driver of the engine pass — the "suite" the core runs in place of a
 * test file (QA 342adaac5625, b1b316b2322a). It
 *   1. takes the stdout writer and the host capabilities it needs,
 *   2. loads SES and calls `lockdown()`: every JavaScript intrinsic is frozen,
 *   3. evaluates the contract bundle in a compartment (`createConfinement` in
 *      the runtime): no `process`, no Node module beyond hardened stand-ins,
 *      an inert `Function` constructor, the stdout writer out of reach,
 *   4. collects every selected case and prints one outcome line per case
 *      (`ENGINE_OUTCOME_MARKER` + `{ id, collected }`). It gives no verdict.
 *
 * The app judges the outcome lines against the cases it holds itself
 * (`engineVerdicts` in `lib/engine-case-run.ts`). The generated code never
 * sees a case's expectation, only the requests, and cannot write to stdout:
 * what it can still do is choose its answers, which is what is being tested.
 * A contract that needs a module or global the compartment does not provide
 * runs as Not run, with that reason.
 */
export function engineSuiteCode(contractModule: string): string {
  return `// The engine pass — written by Clean-Core.io, not by a model (roadmap 3.0.12; QA 342adaac5625).
// The call contract ${JSON.stringify(contractModule)} runs bundled as ./${ENGINE_CONTRACT_BUNDLE_PATH}, in a SES compartment.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { ENGINE_OUTCOME_MARKER, LOCKDOWN_OPTIONS, collectEngineCase, createConfinement, createEngineState } from ${JSON.stringify(`./${ENGINE_RUNTIME_PATH}`)};

// Taken before lockdown and before any generated code exists in this process.
const write = process.stdout.write.bind(process.stdout);
const exit = process.exit.bind(process);
const stringify = JSON.stringify;
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const pattern = process.env.SANDBOX_TEST_PATTERNS ? new RegExp(process.env.SANDBOX_TEST_PATTERNS) : null;
const cases = JSON.parse(read(${JSON.stringify(`./${ENGINE_CASES_PATH}`)})).cases;
const bundle = read(${JSON.stringify(`./${ENGINE_CONTRACT_BUNDLE_PATH}`)});

createRequire(import.meta.url)(${JSON.stringify(`./${ENGINE_SES_PATH}`)});
globalThis.lockdown(LOCKDOWN_OPTIONS);

const confinement = createConfinement({
  now: () => Date.now(),
  random: () => Math.random(),
  randomUUID: () => crypto.randomUUID(),
  getRandomValues: (array) => crypto.getRandomValues(array),
  structuredClone: (value) => structuredClone(value),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  nodeEnv: 'test',
  platform: process.platform,
  version: process.version,
});
const loaded = confinement.load(bundle);
const state = createEngineState(confinement.hooks);
const message = (err) => String(err && err.message ? err.message : err).split('\\n')[0].slice(0, 300);

let lines = '';
for (const kase of Array.isArray(cases) ? cases : []) {
  if (pattern && !pattern.test(String(kase.id))) continue;
  let collected;
  if (loaded.failure !== undefined) collected = { control: { loadFailure: String(loaded.failure) } };
  else {
    try {
      collected = await collectEngineCase(loaded.exports, kase, state);
    } catch (err) {
      collected = { control: { loadFailure: \`the case could not be collected: \${message(err)}\` } };
    }
  }
  lines += \`\\n\${ENGINE_OUTCOME_MARKER}\${stringify({ id: kase.id, collected })}\\n\`;
}
// One write, and the exit only once it is flushed: timers the code left behind do not hold the run open.
write(lines || '\\n', () => exit(0));
`;
}

export interface EngineRunInputs {
  files: SandboxFile[];
  suiteCode: string;
  casesSha256: string;
  /** What the core needs to run the pass as an engine pass (`SandboxRunInput.engine`). */
  engine: { contractModule: string };
}

/**
 * The inputs of the engine pass, from the generated files, the cases JSON and
 * the contract module path — identical on both sides of the wire.
 */
export function engineRunInputs(generated: readonly SandboxFile[], casesJson: string, contractModule: string): EngineRunInputs {
  const reserved = new Set([ENGINE_RUNTIME_PATH, ENGINE_CASES_PATH, ENGINE_CONTRACT_BUNDLE_PATH, ENGINE_SES_PATH]);
  const files = generated.filter((f) => !reserved.has(f.path));
  return {
    files: [...files, { path: ENGINE_RUNTIME_PATH, content: ENGINE_RUNTIME_JS }, { path: ENGINE_CASES_PATH, content: casesJson }],
    suiteCode: engineSuiteCode(contractModule),
    casesSha256: sha256Hex(casesJson),
    engine: { contractModule },
  };
}

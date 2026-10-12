// Helper for tests/acceptance-harness.spec.ts (QA 1021a63b7b6c): loads one
// module of a fixture package the way the executor does — bundled by the
// harness, evaluated after lockdown() in the confinement — and prints what the
// module exports as ESCAPE_ATTEMPTS, so the spec can read how each attempt to
// leave the compartment ended. Not product code.
//   node tests/fixtures/acceptance/confined-attempts.mjs <package-dir> <module-path>
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { bundleModules, sesFile } from '../../../scripts/acceptance/lib/sandbox.mjs';
import { LOCKDOWN_OPTIONS, createConfinement } from '../../../scripts/acceptance/child/engine-cases-core.mjs';

const [pkg, rel] = process.argv.slice(2);
const prepared = await bundleModules(path.resolve(pkg), { m: rel });
if (prepared.failure !== undefined) throw new Error(prepared.failure);
createRequire(import.meta.url)(sesFile());
globalThis.lockdown(LOCKDOWN_OPTIONS);
const confinement = createConfinement({
  now: () => Date.now(),
  random: () => Math.random(),
  randomUUID: () => crypto.randomUUID(),
  getRandomValues: (a) => crypto.getRandomValues(a),
  structuredClone: (v) => structuredClone(v),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
});
const loaded = confinement.load(prepared.bundle);
if (loaded.failure !== undefined) throw new Error(loaded.failure);
const attempts = loaded.exports[prepared.names.m].ESCAPE_ATTEMPTS;
process.stdout.write(`${JSON.stringify({ attempts: Array.from(attempts, String), keysIntact: Object.keys({ status: 1 }).join(',') })}\n`);

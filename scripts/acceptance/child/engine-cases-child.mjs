/**
 * The process that runs engine cases against a package's call contract, for
 * the acceptance harness. One package per process.
 *
 * Started by `../engine-cases.mjs` through `runChild` of `../lib/sandbox.mjs` —
 * the same sandbox as every harness probe: the permission model on, read access
 * to the package's temporary copy and this directory only, no write access, the
 * network guard preloaded, a minimal environment and a hard timeout. It receives
 * its job as JSON in `CC_ACC_JOB`, prints exactly one result line and exits.
 *
 * The cases are run and judged by `engine-cases-core.mjs` — the same runtime the
 * isolated test runner executes inside the product.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createEngineState, runEngineCase } from './engine-cases-core.mjs';

const RESULT = '@@CC-ACC-RESULT ';
// Taken before any package code runs (see probe-child.mjs).
const write = process.stdout.write.bind(process.stdout);
const exit = process.exit.bind(process);
const stringify = JSON.stringify;
let nonce = '';

function finish(payload) {
  write(`\n${RESULT}${nonce} ${stringify(payload)}\n`, () => exit(0));
}

const message = (err) => String(err && err.message ? err.message : err).split('\n')[0].slice(0, 200);

function loadFailure(err, rel) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const m = message(err);
  if (code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package '([^']+)'/.test(m)) {
    return `not runnable without its dependencies: '${rel}' imports '${m.match(/Cannot find package '([^']+)'/)[1]}', which is not installed (the harness never installs dependencies)`;
  }
  if (code === 'ERR_ACCESS_DENIED') return `'${rel}' needs a capability the sandbox denies: ${m}`;
  return `'${rel}' cannot be loaded: ${code ? `${code}: ` : ''}${m}`;
}

async function main() {
  let job;
  try {
    job = JSON.parse(process.env.CC_ACC_JOB ?? '');
  } catch {
    finish({ error: 'no job' });
    return;
  }
  delete process.env.CC_ACC_JOB;
  nonce = String(job.nonce ?? '');

  let mod;
  try {
    mod = await import(pathToFileURL(path.join(job.root, job.module)).href);
  } catch (err) {
    finish({ notRunnable: loadFailure(err, job.module) });
    return;
  }
  const state = createEngineState();
  const cases = [];
  for (const c of job.cases ?? []) cases.push({ id: c.id, ...(await runEngineCase(mod, c, state)) });
  finish({ cases });
}

main().catch((err) => finish({ notRunnable: `the run could not complete: ${message(err)}` }));

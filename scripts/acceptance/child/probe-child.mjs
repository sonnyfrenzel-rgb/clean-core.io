/**
 * The process that touches a package's code. One probe per process.
 *
 * Started by `run.mjs` with the permission model on, read access limited to the
 * package's temporary copy and this directory, no write access, the network
 * guard preloaded, a hard timeout and a minimal environment. It receives its job
 * as JSON in `CC_ACC_JOB`, prints exactly one result line and exits. Anything
 * the package prints itself is ignored by the parent.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { PROBES } from './probes.mjs';

const RESULT = '@@CC-ACC-RESULT ';
// Taken before any package code runs: the job (and with it the nonce that marks
// the genuine result line) leaves the environment before the first import, and
// the writer and exit are the originals even if a package replaces them later.
const write = process.stdout.write.bind(process.stdout);
const exit = process.exit.bind(process);
const stringify = JSON.stringify;
let nonce = '';

function finish(payload) {
  write(`\n${RESULT}${nonce} ${stringify(payload)}\n`, () => exit(0));
}

/** Classify a failure to import into "not runnable" with a reason a reader can act on. */
export function importFailure(err, moduleName) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const message = String(err && err.message ? err.message : err).split('\n')[0];
  if (code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package '([^']+)'/.test(message)) {
    const dep = message.match(/Cannot find package '([^']+)'/)[1];
    return { notRunnable: `not runnable without its dependencies: module '${moduleName}' imports '${dep}', which is not installed (the harness never installs dependencies)` };
  }
  if (code === 'ERR_ACCESS_DENIED') {
    return { notRunnable: `module '${moduleName}' needs a capability the sandbox denies: ${message}` };
  }
  return { notRunnable: `module '${moduleName}' cannot be loaded: ${code ? `${code}: ` : ''}${message}` };
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
  const loaded = {};
  const load = async (name) => {
    if (loaded[name]) return loaded[name];
    const rel = job.modules[name];
    if (!rel) throw Object.assign(new Error(`adapter names no module '${name}'`), { adapter: true });
    const url = pathToFileURL(path.join(job.root, rel)).href;
    loaded[name] = await import(url);
    return loaded[name];
  };

  if (job.probe === 'import-side-effects') {
    const imported = [];
    for (const name of Object.keys(job.modules)) {
      try {
        await load(name);
        imported.push(name);
      } catch (err) {
        finish({ imported, ...importFailure(err, name) });
        return;
      }
    }
    // Give a listener started from a microtask or a timer a moment to show itself.
    await new Promise((resolve) => setTimeout(resolve, 150));
    finish({ imported });
    return;
  }

  const probe = PROBES[job.probe];
  if (!probe) {
    finish({ error: `unknown probe '${job.probe}'` });
    return;
  }
  for (const name of Object.keys(job.modules)) {
    try {
      await load(name);
    } catch (err) {
      finish(importFailure(err, name));
      return;
    }
  }
  try {
    const outcomes = await probe(job.config ?? {}, { load });
    finish({ outcomes });
  } catch (err) {
    if (err && err.adapter) {
      finish({ notRunnable: `adapter mapping does not fit the package: ${err.message}` });
      return;
    }
    finish({ notRunnable: `probe could not run: ${String(err && err.message ? err.message : err).split('\n')[0]}` });
  }
}

main();

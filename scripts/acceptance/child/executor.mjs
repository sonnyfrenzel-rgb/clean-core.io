/**
 * The process that touches a package's code — and only executes, never judges.
 *
 * Started by `../lib/sandbox.mjs` (`startExecutor`) with the permission model
 * on, read access limited to the package's temporary copy, this directory and
 * the SES file, no write access, the network guard preloaded, a hard timeout
 * and a minimal environment that carries nothing about the job.
 *
 * The harness process drives it, one request at a time: a request arrives as a
 * JSON line on stdin, the answer leaves as one JSON line on file descriptor 3 —
 * `{ id, answer }`, the id the request carried. The probes and the engine-case
 * judge run in the harness process, which never imports the package.
 *
 * The package's code does not run as a peer of this file (QA 1021a63b7b6c).
 * Before any of it exists here, `lockdown()` freezes every JavaScript
 * intrinsic; the package then runs in a SES compartment (`createConfinement`
 * in `./engine-cases-core.mjs`) whose global object holds no `process`, no
 * `require` of Node's modules beyond hardened stand-ins, and an inert
 * `Function` constructor. The response socket, stdout, stderr and the
 * collector are reachable only from here. The harness bundles the package's
 * modules with esbuild (`bundleModules` in `../lib/sandbox.mjs`) and sends the
 * bundle with the load request: nothing is resolved from disk in this process.
 */
import crypto from 'node:crypto';
import net from 'node:net';
import { createRequire } from 'node:module';
import { LOCKDOWN_OPTIONS, collectEngineCase, createConfinement, createEngineState, createProbeExecutor } from './engine-cases-core.mjs';

// Taken before lockdown and before any package code exists in this process.
const out = new net.Socket({ fd: 3, readable: false, writable: true });
const exit = process.exit.bind(process);
const errWrite = process.stderr.write.bind(process.stderr);
const stringify = JSON.stringify;
const EVENT = '@@CC-ACC-EVENT ';

const sesFile = process.argv[2];
createRequire(import.meta.url)(sesFile);
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
  // The import probe's instrument (FP-TEST-03): the stand-in server reports listen() here, on stderr.
  emit: (event) => errWrite(`${EVENT}${stringify(event)}\n`),
  nodeEnv: process.env.NODE_ENV,
  // The original's AUTHORITY-CHECKs are granted for this test run only (CC_AUTHORITY_DEMO=grant); the service denies them.
  authorityGrant: true,
  platform: process.platform,
  version: process.version,
});

function reply(id, answer) {
  let line;
  try {
    line = stringify({ id, answer });
  } catch (err) {
    line = stringify({ id, answer: { transportError: `the answer cannot be serialised: ${message(err)}` } });
  }
  out.write(`${line}\n`);
}

const message = (err) => String(err && err.message ? err.message : err).split('\n')[0].slice(0, 300);

/* ------------------------------------------------------------- the modules */

// The probes' requests (call, call-many, clock) are answered by the shared probe executor
// (`createProbeExecutor` in ./engine-cases-core.mjs), which the runner's probe pass uses as well.
const probes = createProbeExecutor(confinement);

/** Evaluate the package's bundle in a compartment: `{ exports } | { failure }`. */
function loadBundle(source) {
  if (typeof source !== 'string' || !source) return { failure: 'the harness sent no bundle of the package' };
  return confinement.load(source);
}

/* --------------------------------------------------------------- the requests */

let engine = null;

async function handle(req) {
  switch (req.op) {
    case 'load': {
      // `names`: adapter module name → the key its namespace has in the bundle's exports.
      const names = req.names && typeof req.names === 'object' ? req.names : {};
      const loaded = loadBundle(req.bundle);
      if (loaded.failure !== undefined) return { imported: [], failure: String(loaded.failure) };
      const imported = [];
      for (const [name, key] of Object.entries(names)) {
        try {
          probes.use(name, loaded.exports[String(key)]);
        } catch (err) {
          return { imported, failure: `module '${name}' cannot be read: ${message(err)}` };
        }
        imported.push(name);
      }
      return { imported };
    }
    case 'call':
    case 'call-many':
    case 'clock':
      return probes.request(req.op, req);
    case 'engine-load': {
      const loaded = loadBundle(req.bundle);
      if (loaded.failure !== undefined) return { failure: String(loaded.failure) };
      try {
        engine = { mod: loaded.exports[String(req.key)], state: createEngineState(confinement.hooks) };
      } catch (err) {
        return { failure: `the contract module cannot be read: ${message(err)}` };
      }
      return {};
    }
    case 'engine-case':
      if (!engine) return { transportError: 'no contract module is loaded' };
      try {
        return { collected: await collectEngineCase(engine.mod, req.kase ?? {}, engine.state) };
      } catch (err) {
        return { transportError: `the case could not be collected: ${message(err)}` };
      }
    default:
      return { transportError: `unknown request '${String(req.op)}'` };
  }
}

let buffer = '';
let queue = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let at;
  while ((at = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, at);
    buffer = buffer.slice(at + 1);
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      continue;
    }
    if (req && req.op === 'exit') {
      exit(0);
      return;
    }
    queue = queue.then(async () => reply(req?.id, await handle(req ?? {})));
  }
});

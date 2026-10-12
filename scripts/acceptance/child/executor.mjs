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
import { LOCKDOWN_OPTIONS, collectEngineCase, createConfinement, createEngineState } from './engine-cases-core.mjs';

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

/**
 * A value as plain JSON data: functions and symbols dropped, a typed array read
 * as UTF-8 text, a BigInt as its digits, a cycle cut. Non-finite numbers become
 * null, as `JSON.stringify` writes them.
 */
function plain(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') return Number.isFinite(value) ? value : null;
  if (t === 'bigint') return String(value);
  if (t === 'function' || t === 'symbol') return undefined;
  if (depth > 40 || seen.has(value)) return '[cut]';
  seen.add(value);
  try {
    if (value instanceof Uint8Array) return new TextDecoder().decode(value);
    if (Array.isArray(value)) return value.map((v) => plain(v, depth + 1, seen) ?? null);
    if (value instanceof Date) return value.toISOString();
    const outObj = {};
    for (const key of Object.keys(value)) {
      const v = plain(value[key], depth + 1, seen);
      if (v !== undefined) outObj[key] = v;
    }
    return outObj;
  } catch (err) {
    return `[unreadable: ${message(err)}]`;
  } finally {
    seen.delete(value);
  }
}

/* ------------------------------------------------------------- the modules */

const modules = new Map();
const instances = new Map();

/** Evaluate the package's bundle in a compartment: `{ exports } | { failure }`. */
function loadBundle(source) {
  if (typeof source !== 'string' || !source) return { failure: 'the harness sent no bundle of the package' };
  return confinement.load(source);
}

const adapter = (text) => ({ adapter: text });

/** Errors JavaScript throws by itself: a crash, not a refusal the code decided on. */
const CRASHES = new Set(['TypeError', 'ReferenceError', 'SyntaxError']);

/** The sandbox's refusal (a module or global it does not provide), or the package's own throw. */
function thrown(err) {
  const reason = confinement.hooks.notRunnable(err);
  if (reason) return { sandbox: reason };
  let crash = false;
  try {
    crash = Boolean(err) && typeof err === 'object' && CRASHES.has(String(err.name));
  } catch {
    crash = true;
  }
  return { threw: true, error: message(err), crash };
}

/**
 * Resolve and call a callable spec: `{ module, export, method?, construct?: [...], factory?: [...] }`.
 * Instances are cached per child, so `create` and `get` of one store share it.
 */
async function invoke(spec, args) {
  if (!spec || !spec.module || !spec.export) return adapter('callable needs module and export');
  const mod = modules.get(spec.module);
  if (!mod) return adapter(`adapter names no module '${spec.module}'`);
  try {
    const exported = mod[spec.export] ?? (mod.default && mod.default[spec.export]);
    if (exported === undefined) return adapter(`module '${spec.module}' exports no '${spec.export}'`);
    let target = exported;
    let self;
    if (spec.construct || spec.factory) {
      const key = `${spec.module}|${spec.export}|${spec.construct ? 'new' : 'call'}|${stringify(spec.construct ?? spec.factory)}`;
      if (!instances.has(key)) {
        const ctorArgs = Array.isArray(spec.construct ?? spec.factory) ? spec.construct ?? spec.factory : [];
        instances.set(key, spec.construct ? new exported(...ctorArgs) : await exported(...ctorArgs));
      }
      self = instances.get(key);
      target = self;
    }
    if (spec.method) {
      const owner = self ?? exported;
      if (typeof owner[spec.method] !== 'function') return adapter(`'${spec.export}' has no method '${spec.method}'`);
      return { threw: false, value: plain(await owner[spec.method](...(Array.isArray(args) ? args : []))) };
    }
    if (typeof target !== 'function') return adapter(`'${spec.export}' is not callable`);
    return { threw: false, value: plain(await target(...(Array.isArray(args) ? args : []))) };
  } catch (err) {
    return thrown(err);
  }
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
          modules.set(name, loaded.exports[String(key)]);
        } catch (err) {
          return { imported, failure: `module '${name}' cannot be read: ${message(err)}` };
        }
        imported.push(name);
      }
      return { imported };
    }
    case 'call':
      return invoke(req.spec, req.args);
    case 'call-many': {
      const results = [];
      for (const args of Array.isArray(req.argsList) ? req.argsList : []) {
        const r = await invoke(req.spec, args);
        results.push(r);
        if (r.adapter || r.sandbox) break;
      }
      return { results };
    }
    case 'clock':
      confinement.setClock(req.clock ?? null);
      return {};
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

/**
 * The process that touches a package's code — and only executes, never judges.
 *
 * Started by `../lib/sandbox.mjs` (`startExecutor`) with the permission model
 * on, read access limited to the package's temporary copy and this directory,
 * no write access, the network guard preloaded, a hard timeout and a minimal
 * environment that carries nothing about the job.
 *
 * The harness process drives it, one request at a time: a request arrives as a
 * JSON line on stdin, the answer leaves as one JSON line on file descriptor 3 —
 * `{ id, answer }`, the id the request carried. Stdout is not read by anyone,
 * so whatever the package prints goes nowhere. The probes and the engine-case
 * judge run in the harness process, which never imports the package: what
 * comes back here is only what the package's functions answered.
 *
 * Code the package runs in this process can reach this process's channel as
 * well. It cannot make a verdict — the harness gives those — and anything on
 * the channel that is not the one answer to the one open request makes the
 * harness discard the run as not runnable (`startExecutor`).
 */
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectEngineCase, createEngineState } from './engine-cases-core.mjs';

// Taken before any package code runs.
const out = new net.Socket({ fd: 3, readable: false, writable: true });
const exit = process.exit.bind(process);
const stringify = JSON.stringify;
const realNow = Date.now;
const root = process.cwd();

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

/** Classify a failure to import into "not runnable" with a reason a reader can act on. */
function importFailure(err, moduleName) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const text = message(err);
  if (code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package '([^']+)'/.test(text)) {
    const dep = text.match(/Cannot find package '([^']+)'/)[1];
    return `not runnable without its dependencies: module '${moduleName}' imports '${dep}', which is not installed (the harness never installs dependencies)`;
  }
  if (code === 'ERR_ACCESS_DENIED') return `module '${moduleName}' needs a capability the sandbox denies: ${text}`;
  return `module '${moduleName}' cannot be loaded: ${code ? `${code}: ` : ''}${text}`;
}

/**
 * A value as plain JSON data: functions and symbols dropped, a Buffer read as
 * UTF-8 text, a BigInt as its digits, a cycle cut. Non-finite numbers become
 * null, as `JSON.stringify` writes them.
 */
function plain(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') return Number.isFinite(value) ? value : null;
  if (t === 'bigint') return String(value);
  if (t === 'function' || t === 'symbol') return undefined;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (depth > 40 || seen.has(value)) return '[cut]';
  seen.add(value);
  try {
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

async function load(name, rel) {
  if (modules.has(name)) return modules.get(name);
  const mod = await import(pathToFileURL(path.join(root, rel)).href);
  modules.set(name, mod);
  return mod;
}

const adapter = (text) => ({ adapter: text });

/**
 * Resolve and call a callable spec: `{ module, export, method?, construct?: [...], factory?: [...] }`.
 * Instances are cached per child, so `create` and `get` of one store share it.
 */
async function invoke(spec, args) {
  if (!spec || !spec.module || !spec.export) return adapter('callable needs module and export');
  const mod = modules.get(spec.module);
  if (!mod) return adapter(`adapter names no module '${spec.module}'`);
  const exported = mod[spec.export] ?? (mod.default && mod.default[spec.export]);
  if (exported === undefined) return adapter(`module '${spec.module}' exports no '${spec.export}'`);
  try {
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
    return { threw: true, error: message(err) };
  }
}

/** The clock the package sees: frozen at one value, ticking by a step per read, or the real one. */
function setClock(clock) {
  if (clock && clock.kind === 'frozen' && Number.isFinite(clock.at)) {
    Date.now = () => clock.at;
  } else if (clock && clock.kind === 'tick' && Number.isFinite(clock.start) && Number.isFinite(clock.step)) {
    let t = clock.start;
    Date.now = () => (t += clock.step);
  } else {
    Date.now = realNow;
  }
}

/* --------------------------------------------------------------- the requests */

let engine = null;

async function handle(req) {
  switch (req.op) {
    case 'load': {
      const imported = [];
      for (const [name, rel] of Object.entries(req.modules ?? {})) {
        try {
          await load(name, String(rel));
          imported.push(name);
        } catch (err) {
          return { imported, failure: importFailure(err, name) };
        }
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
        if (r.adapter) break;
      }
      return { results };
    }
    case 'clock':
      setClock(req.clock);
      return {};
    case 'engine-load':
      try {
        engine = { mod: await load('contract', String(req.module)), state: createEngineState() };
        return {};
      } catch (err) {
        return { failure: importFailure(err, String(req.module)) };
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

/**
 * How a package's code is run, and whether it may be run at all.
 *
 * A generated delivery package is third-party code. It runs only in a child
 * `node` process with:
 *   - the permission model on, read access to its temporary copy and to the
 *     harness's child directory only, no write access, no child processes, no
 *     workers, no addons;
 *   - the network guard preloaded (`child/net-guard.mjs`);
 *   - cwd in the temporary copy, a minimal environment (no tokens, no keys from
 *     the caller's shell, nothing about the job), and a hard timeout that kills
 *     the process;
 *   - nothing to decide: the child only executes (`child/executor.mjs`), and
 *     every verdict is made in this process from what it answered
 *     (`startExecutor`);
 *   - inside the child, the package's code runs in a SES compartment after
 *     `lockdown()`, apart from the channel and the collector (`bundleModules`,
 *     `createConfinement` in `child/engine-cases-core.mjs`).
 *
 * Network is the gap. Node only gained a network permission in v25; on older
 * versions the permission model leaves sockets open and the only barrier is the
 * JavaScript-level guard. That is good enough for code we wrote ourselves and
 * not good enough for code we did not, so `decideExecution` executes a package
 * only when a self-test proves the platform itself refuses a socket, or when
 * the operator states that the package is a self-written fixture.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFINED_MODULES } from './confined-modules.mjs';

export const CHILD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'child');
const EVENT = '@@CC-ACC-EVENT ';
const MAX_CAPTURE = 1_000_000;
/** Everything the executor may send back over one run (the rounding probe's answers are the largest). */
const MAX_CHANNEL = 64 * 1024 * 1024;

/** The permission flag this Node understands, or null. */
export function permissionFlag() {
  const flags = process.allowedNodeEnvironmentFlags;
  if (flags.has('--permission')) return '--permission';
  if (flags.has('--experimental-permission')) return '--experimental-permission';
  return null;
}

/** Does the platform refuse a socket under the permission model? (Node >= 25.) */
export function platformBlocksNetwork(flag) {
  if (!flag) return false;
  const probe = [
    "const net = require('node:net');",
    "let s; try { s = net.connect(9, '127.0.0.1'); } catch (e) { console.log(e.code || 'THROWN'); process.exit(0); }",
    "s.on('error', (e) => { console.log(e.code || 'ERROR'); process.exit(0); });",
    "s.on('connect', () => { console.log('CONNECTED'); process.exit(0); });",
  ].join(' ');
  const res = spawnSync(process.execPath, [flag, '-e', probe], {
    env: minimalEnv({}),
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  return /ERR_ACCESS_DENIED/.test(`${res.stdout}${res.stderr}`);
}

/**
 * `{ execute, mode, reason }`. `trustedFixture` is the operator's statement that
 * the package is self-written; it is never inferred from the package.
 */
export function decideExecution({ trustedFixture, staticOnly }) {
  const flag = permissionFlag();
  if (staticOnly) return { execute: false, mode: 'not-executed', flag, reason: 'static-only run requested' };
  if (!flag) return { execute: false, mode: 'not-executed', flag, reason: `Node ${process.version} has no permission model` };
  if (platformBlocksNetwork(flag)) {
    return { execute: true, mode: 'permission-model-with-network-denied', flag, reason: `Node ${process.version} denies network under ${flag}` };
  }
  if (trustedFixture) {
    return {
      execute: true,
      mode: 'trusted-fixture-best-effort-network-guard',
      flag,
      reason: `Node ${process.version} has no network permission; executed only because the operator marked the package as a self-written fixture`,
    };
  }
  return {
    execute: false,
    mode: 'not-executed',
    flag,
    reason: `Node ${process.version} cannot deny network access to a child process (needs a network permission, Node >= 25); third-party packages are not executed, only scanned`,
  };
}

/** Only what Node needs to start on each OS. Nothing from the caller's secrets. */
export function minimalEnv(extra) {
  const env = {};
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, ...extra };
}

/**
 * Copy a package into a fresh temp directory: no symlinks (a junction is one
 * too), no `.git`. Each skipped link is pushed to `skipped`, relative to the
 * package, so the report can say the copy is not the whole package.
 * `bundleModules` checks real paths as a second wall.
 */
export function copyToTemp(pkgDir, skipped = []) {
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-acc-')));
  fs.cpSync(pkgDir, tmp, {
    recursive: true,
    filter: (src) => {
      if (path.basename(src) === '.git') return false;
      if (fs.lstatSync(src).isSymbolicLink()) {
        skipped.push(path.relative(pkgDir, src).replace(/\\/g, '/'));
        return false;
      }
      return true;
    },
  });
  return tmp;
}

export function removeTemp(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // A file still locked on Windows: the OS cleans its temp directory later.
  }
}

/** Thrown by a request the executor could not answer: never a package's refusal. */
export class TransportError extends Error {
  constructor(message) {
    super(message);
    this.transport = true;
  }
}

/** SES (`ses/dist/ses.cjs`, Apache-2.0), which the executor loads before anything else. */
export function sesFile() {
  return createRequire(import.meta.url).resolve('ses');
}

/**
 * The package's modules as one CommonJS bundle for the executor's compartment
 * (`createConfinement` in `child/engine-cases-core.mjs`), built here with
 * esbuild — which parses and never executes. `modules` maps a name to a path
 * inside `root`; the bundle exports each module's namespace under `names[name]`.
 * Relative imports must stay inside `root`. A Node module the compartment does
 * not provide, or an npm package (the harness never installs one), makes the
 * package not runnable here, named with the module that imports it.
 *
 * Every file esbuild reads must lie inside `root` by its real path — a symlink
 * or junction that leads out is refused, whatever path led to it
 * — and outside `reserved` (paths relative to `root` the
 * package may not import: the engine cases with their expectations,
 * Resolves to `{ bundle, names } | { failure }`.
 */
export async function bundleModules(rootDir, modules, { reserved = [] } = {}) {
  const root = fs.realpathSync.native(rootDir);
  const real = (abs) => {
    try {
      return fs.realpathSync.native(abs);
    } catch {
      return abs;
    }
  };
  const reservedAbs = reserved.map((r) => path.resolve(root, r));
  const isReserved = (abs) => reservedAbs.some((r) => abs === r || abs.startsWith(r + path.sep));
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    return { failure: 'esbuild is not installed, so the package cannot be prepared for the confined executor' };
  }
  const entries = Object.entries(modules ?? {});
  const names = {};
  const byFile = new Map();
  const lines = entries.map(([name, rel], i) => {
    names[name] = `m${i}`;
    byFile.set(path.resolve(root, String(rel)), name);
    return `export * as m${i} from ${JSON.stringify(`./${String(rel).replace(/\\/g, '/')}`)};`;
  });
  const refused = [];
  const inside = (abs) => abs === root || abs.startsWith(root + path.sep);
  const plugin = {
    name: 'cc-acceptance-resolve',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        const p = args.path;
        const importer = byFile.get(args.importer) ?? byFile.get(real(args.importer || '')) ?? (args.importer ? path.relative(root, args.importer).replace(/\\/g, '/') : 'entry');
        if (p.startsWith('node:') || isBuiltin(p)) {
          const bare = p.startsWith('node:') ? p.slice(5) : p;
          if (!CONFINED_MODULES.includes(bare)) refused.push(`module '${importer}' imports '${p}', which the confined executor does not provide (it provides ${CONFINED_MODULES.join(', ')})`);
          return { path: p, external: true };
        }
        if (!p.startsWith('.') && !path.isAbsolute(p)) {
          refused.push(`not runnable without its dependencies: module '${importer}' imports '${p}', which is not installed (the harness never installs dependencies)`);
          return { path: p, external: true };
        }
        const base = path.resolve(args.resolveDir || root, p);
        if (!inside(base) || !inside(real(base))) return { errors: [{ text: `an import leaves the package (${p})` }] };
        if (isReserved(base) || isReserved(real(base))) return { errors: [{ text: `an import of a file the harness reserves (${p})` }] };
        const ts = base.replace(/\.js$/, '.ts');
        if (ts !== base && !fs.existsSync(base) && fs.existsSync(ts)) return { path: ts };
        return undefined;
      });
      // The last gate, whatever path the resolver arrived at (an index file, a package.json `main`, a link).
      build.onLoad({ filter: /.*/, namespace: 'file' }, (args) => {
        const target = real(args.path);
        if (!inside(target)) return { errors: [{ text: `a file outside the package (${path.basename(args.path)})` }] };
        if (isReserved(args.path) || isReserved(target)) return { errors: [{ text: `a file the harness reserves (${path.basename(args.path)})` }] };
        return undefined;
      });
    },
  };
  let result;
  try {
    result = await esbuild.build({
      stdin: { contents: lines.join('\n'), resolveDir: root, sourcefile: '__cc_entry.mjs', loader: 'js' },
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      logLevel: 'silent',
      legalComments: 'none',
      absWorkingDir: root,
      resolveExtensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
      loader: { '.ts': 'ts', '.tsx': 'tsx' },
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
      plugins: [plugin],
    });
  } catch (err) {
    const first = err && Array.isArray(err.errors) && err.errors[0] ? err.errors[0].text : String(err && err.message ? err.message : err);
    return { failure: `the package's modules cannot be bundled: ${String(first).split('\n')[0].slice(0, 300)}` };
  }
  if (refused.length > 0) return { failure: refused[0] };
  return { bundle: result.outputFiles[0].text, names };
}

/**
 * Start the sandboxed executor (`child/executor.mjs`) for one package copy.
 *
 * The harness process is the controller: it holds the probes, the engine-case
 * judge and every expectation, and never imports the package. The executor only
 * loads the package's bundle and calls what it is asked to call. Requests go
 * to its stdin, one JSON line each; each answer comes back as one JSON line
 * `{ id, answer }` on a pipe of its own (file descriptor 3). Its stdout is
 * discarded, and the job is never in its environment.
 *
 * The package runs inside the executor's process but in a locked-down SES
 * compartment, from which neither the pipe nor stdout, stderr or the collector
 * can be reached. The channel is still held to one answer per
 * open request, as a second wall: a line that is not JSON, carries another id,
 * arrives while nothing is asked, or overruns the size limit poisons the run,
 * and `close()` reports it so the caller discards every result of this
 * executor as not runnable.
 *
 * `request(op, payload)` resolves to the answer or rejects with a
 * `TransportError`; `close()` resolves to
 * `{ poisoned, timedOut, exitCode, events, stderrTail, durationMs }` and never rejects.
 */
export function startExecutor({ root, nodeEnv, timeoutMs, flag }) {
  const ses = sesFile();
  const args = [
    flag,
    `--allow-fs-read=${root}`,
    `--allow-fs-read=${CHILD_DIR}`,
    `--allow-fs-read=${ses}`,
    '--import',
    pathToFileURL(path.join(CHILD_DIR, 'net-guard.mjs')).href,
    path.join(CHILD_DIR, 'executor.mjs'),
    ses,
  ];
  const env = minimalEnv({});
  if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
  const started = Date.now();
  let stderr = '';
  let channel = '';
  let channelBytes = 0;
  let timedOut = false;
  let poisoned = null;
  let exited = false;
  let exitCode = null;
  let pending = null;
  let seq = 0;
  const salt = crypto.randomBytes(6).toString('hex');
  const poison = (why) => {
    if (!poisoned) poisoned = why;
    if (pending) {
      const p = pending;
      pending = null;
      p.reject(new TransportError(`the run was discarded: ${why}`));
    }
  };

  let child;
  try {
    child = spawn(process.execPath, args, { cwd: root, env, stdio: ['pipe', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (err) {
    poisoned = `could not start a child process: ${err.message}`;
    exited = true;
  }
  const done = new Promise((resolve) => {
    if (!child) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      poison(`the package did not finish within ${timeoutMs} ms`);
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_CAPTURE) stderr += d;
    });
    child.stdin.on('error', () => {});
    child.stdio[3].setEncoding('utf8');
    child.stdio[3].on('data', (d) => {
      channelBytes += d.length;
      if (channelBytes > MAX_CHANNEL) {
        poison('the executor channel carried more than the harness reads');
        child.kill('SIGKILL');
        return;
      }
      channel += d;
      let at;
      while ((at = channel.indexOf('\n')) !== -1) {
        const line = channel.slice(0, at);
        channel = channel.slice(at + 1);
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          poison('a line on the executor channel that is not JSON — something besides the executor wrote to it');
          continue;
        }
        if (!pending || !msg || typeof msg !== 'object' || msg.id !== pending.id || !('answer' in msg)) {
          poison('an answer on the executor channel that the harness did not ask for — something besides the executor wrote to it');
          continue;
        }
        const p = pending;
        pending = null;
        p.resolve(msg.answer);
      }
    });
    child.stdio[3].on('error', () => {});
    child.on('error', () => {});
    child.on('close', (code) => {
      clearTimeout(timer);
      exited = true;
      exitCode = code;
      if (channel.trim()) poison('an unfinished line on the executor channel');
      if (pending) {
        const p = pending;
        pending = null;
        p.reject(new TransportError(timedOut ? `the package did not finish within ${timeoutMs} ms` : `the executor ended without answering (exit ${code})`));
      }
      resolve();
    });
  });

  return {
    request(op, payload = {}) {
      if (poisoned) return Promise.reject(new TransportError(`the run was discarded: ${poisoned}`));
      if (exited) return Promise.reject(new TransportError(`the executor has ended (exit ${exitCode})`));
      if (pending) return Promise.reject(new TransportError('one request at a time'));
      const id = `${salt}-${++seq}`;
      return new Promise((resolve, reject) => {
        pending = { id, resolve, reject };
        child.stdin.write(`${JSON.stringify({ ...payload, id, op })}\n`);
      });
    },
    async close() {
      if (child && !exited) {
        try {
          child.stdin.write(`${JSON.stringify({ op: 'exit' })}\n`);
        } catch {
          // already gone
        }
      }
      await done;
      const events = [];
      for (const l of stderr.split(/\r?\n/)) {
        if (!l.startsWith(EVENT)) continue;
        try {
          events.push(JSON.parse(l.slice(EVENT.length)));
        } catch {
          // a malformed event line is noise
        }
      }
      const tail = stderr.split(/\r?\n/).filter((l) => l && !l.startsWith(EVENT)).slice(-3).join(' | ');
      return { poisoned, timedOut, exitCode, events, stderrTail: tail.slice(0, 400), durationMs: Date.now() - started };
    },
  };
}

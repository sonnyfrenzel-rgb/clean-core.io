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
 *     (`startExecutor`).
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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** Copy a package into a fresh temp directory: no symlinks, no `.git`. */
export function copyToTemp(pkgDir) {
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-acc-')));
  fs.cpSync(pkgDir, tmp, {
    recursive: true,
    filter: (src) => {
      if (path.basename(src) === '.git') return false;
      return !fs.lstatSync(src).isSymbolicLink();
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

/**
 * Start the sandboxed executor (`child/executor.mjs`) for one package copy.
 *
 * The harness process is the controller: it holds the probes, the engine-case
 * judge and every expectation, and never imports the package. The executor only
 * loads the package's modules and calls what it is asked to call. Requests go
 * to its stdin, one JSON line each; each answer comes back as one JSON line
 * `{ id, answer }` on a pipe of its own (file descriptor 3). Its stdout is
 * discarded, and the job is never in its environment.
 *
 * The package runs in the executor's process, so it can write to that pipe
 * too. It cannot write a verdict there — verdicts are made here, from answers —
 * and the channel is held to one answer per open request: a line that is not
 * JSON, carries another id, arrives while nothing is asked, or overruns the
 * size limit poisons the run, and `close()` reports it so the caller discards
 * every result of this executor as not runnable. A package that swallows the
 * real answer and sends its own has only chosen what its function answered.
 *
 * `request(op, payload)` resolves to the answer or rejects with a
 * `TransportError`; `close()` resolves to
 * `{ poisoned, timedOut, exitCode, events, stderrTail, durationMs }` and never rejects.
 */
export function startExecutor({ root, nodeEnv, timeoutMs, flag }) {
  const args = [
    flag,
    `--allow-fs-read=${root}`,
    `--allow-fs-read=${CHILD_DIR}`,
    '--import',
    pathToFileURL(path.join(CHILD_DIR, 'net-guard.mjs')).href,
    path.join(CHILD_DIR, 'executor.mjs'),
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

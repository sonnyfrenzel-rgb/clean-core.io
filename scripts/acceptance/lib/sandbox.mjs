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
 *     the caller's shell), and a hard timeout that kills the process.
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
const RESULT = '@@CC-ACC-RESULT ';
const EVENT = '@@CC-ACC-EVENT ';
const MAX_CAPTURE = 1_000_000;

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

/**
 * Run one probe job in a sandboxed child. Resolves to
 * `{ result, events, timedOut, exitCode, durationMs }`; never rejects.
 */
export function runChild({ root, job, nodeEnv, timeoutMs, flag }) {
  const nonce = crypto.randomBytes(12).toString('hex');
  const args = [
    flag,
    `--allow-fs-read=${root}`,
    `--allow-fs-read=${CHILD_DIR}`,
    '--import',
    pathToFileURL(path.join(CHILD_DIR, 'net-guard.mjs')).href,
    path.join(CHILD_DIR, 'probe-child.mjs'),
  ];
  const env = minimalEnv({ CC_ACC_JOB: JSON.stringify({ ...job, root, nonce }) });
  if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      resolve({ result: { notRunnable: `could not start a child process: ${err.message}` }, events: [], timedOut: false, exitCode: null, durationMs: 0 });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      if (stdout.length < MAX_CAPTURE) stdout += d;
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_CAPTURE) stderr += d;
    });
    child.on('error', () => {});
    child.on('close', (code) => {
      clearTimeout(timer);
      const marker = `${RESULT}${nonce} `;
      const line = stdout.split(/\r?\n/).reverse().find((l) => l.startsWith(marker));
      let result = null;
      if (line) {
        try {
          result = JSON.parse(line.slice(marker.length));
        } catch {
          result = null;
        }
      }
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
      resolve({ result, events, timedOut, exitCode: code, durationMs: Date.now() - started, stderrTail: tail.slice(0, 400) });
    });
  });
}

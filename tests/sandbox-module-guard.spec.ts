/**
 * The test sandbox refuses the built-ins it must not hand out — run for real,
 * in a child Node, with the very files the route writes.
 *
 * Gegenreview c5085bb, CR-09: `node:sqlite` writes past the permission model's
 * file-system fence, and Node documents that the model is no boundary against
 * malicious code. This is the defence in depth the roadmap keeps until the
 * isolated runner (8.9): the CommonJS loader refuses `require()`, the resolve
 * hook refuses a dynamic `import()` with a computed name, and the bundler
 * refuses a static import (pinned at the source below, because the bundler is
 * the route's). Run twice — plainly and under the permission model, when this
 * Node has it — so that what CI's Node 22 does is measured here, not assumed.
 */
import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { SANDBOX_DENIED_BUILTINS, SANDBOX_DENIED_MESSAGE, modGuardSource, modHooksSource, sandboxDenied } from '../lib/sandbox-module-guard';

const PROBE = `
import { createRequire } from 'node:module';
const out = {};
const tryIt = async (name, fn) => { try { await fn(); out[name] = 'loaded'; } catch (e) { out[name] = String(e && e.message || e); } };
await tryIt('dynamic', () => import('node:sqlite'));
await tryIt('computed', () => import('node:' + ['sql', 'ite'].join('')));
await tryIt('require', async () => createRequire(import.meta.url)('node:sqlite'));
await tryIt('bare', async () => createRequire(import.meta.url)('sqlite'));
await tryIt('allowed', () => import('node:test'));
process.stdout.write(JSON.stringify(out));
`;

function runProbe(extraArgs: string[]): Record<string, string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sandbox-guard-'));
  try {
    const hooks = path.join(dir, '__modhooks.mjs');
    const guard = path.join(dir, '__modguard.mjs');
    const probe = path.join(dir, 'probe.mjs');
    fs.writeFileSync(hooks, modHooksSource());
    fs.writeFileSync(guard, modGuardSource(pathToFileURL(hooks).href));
    fs.writeFileSync(probe, PROBE);
    const res = spawnSync(process.execPath, [...extraArgs, `--import=${pathToFileURL(guard).href}`, probe], {
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env },
    });
    expect(res.error, 'the probe did not start').toBeUndefined();
    expect(res.stdout, `the probe wrote nothing (stderr: ${res.stderr.slice(0, 300)})`).toMatch(/^\{/);
    return JSON.parse(res.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const refusal = (text: string) => text.includes(SANDBOX_DENIED_MESSAGE);

test('the denied list names sqlite, and the check reads node: and bare names alike', () => {
  expect(SANDBOX_DENIED_BUILTINS).toContain('sqlite');
  expect(sandboxDenied('node:sqlite')).toBe(true);
  expect(sandboxDenied('sqlite')).toBe(true);
  expect(sandboxDenied('node:test')).toBe(false);
  expect(sandboxDenied('node:assert')).toBe(false);
});

test('require() and import() of a denied built-in are refused in a child Node, node:test is not', () => {
  const out = runProbe([]);
  expect(refusal(out.require), `require: ${out.require}`).toBe(true);
  expect(refusal(out.bare), `bare require: ${out.bare}`).toBe(true);
  expect(refusal(out.dynamic), `dynamic import: ${out.dynamic}`).toBe(true);
  expect(refusal(out.computed), `computed import: ${out.computed}`).toBe(true);
  expect(out.allowed).toBe('loaded');
});

test('the same holds under the permission model, the way the route runs it', () => {
  // Measured on Node 22.22 (19.09.2026): under the permission model the resolve
  // hook cannot register (it needs a worker the model refuses), so a dynamic
  // import of node:sqlite would load — and Node's own switch is what stops it
  // there. The probe therefore carries the switch exactly as the route does,
  // on every Node that has the module; Node 20 has neither and runs the hook.
  const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
  const flag = major >= 23 ? '--permission' : '--experimental-permission';
  const sqliteSwitch = major > 22 || (major === 22 && minor >= 5) ? ['--no-experimental-sqlite'] : [];
  const out = runProbe([flag, '--allow-fs-read=*', ...sqliteSwitch]);
  expect(refusal(out.require) || /No such built-in module/.test(out.require), `require under ${flag}: ${out.require}`).toBe(true);
  expect(refusal(out.bare) || /No such built-in module/.test(out.bare), `bare require under ${flag}: ${out.bare}`).toBe(true);
  for (const key of ['dynamic', 'computed'] as const) {
    expect(out[key], `${key} import under ${flag} loaded sqlite`).not.toBe('loaded');
    expect(refusal(out[key]) || /No such built-in module/.test(out[key]), `${key} under ${flag}: ${out[key]}`).toBe(true);
  }
  expect(out.allowed).toBe('loaded');
});

/**
 * Since roadmap 8.9 the execution core lives in `lib/test-sandbox/core.ts`,
 * shared by the isolated runner (`runner/server.ts`) and the app's emulator-only
 * path. The guards below read the core, and then hold that both callers use it
 * rather than a copy of their own.
 */
const CORE = 'lib/test-sandbox/core.ts';
const readRel = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('the core switches node:sqlite off on every Node that has it', () => {
  const src = readRel(CORE);
  expect(src).toMatch(/function sqliteSwitchSupported\(\): boolean/);
  expect(src).toMatch(/major > 22 \|\| \(major === 22 && minor >= 5\)/);
  expect(src).toContain("if (sqliteSwitchSupported()) args.push('--no-experimental-sqlite');");
  // Pushed before the runner file, unconditionally of the live/mock decision.
  const push = src.indexOf("args.push('--no-experimental-sqlite')");
  const runner = src.indexOf('args.push(runnerPath)');
  expect(push).toBeGreaterThan(-1);
  expect(push).toBeLessThan(runner);
});

test('the core refuses a denied built-in at bundle time and preloads the guard', () => {
  const src = readRel(CORE);
  expect(src).toContain("from '../sandbox-module-guard'");
  const refuse = src.indexOf('sandboxDenied(p)');
  const external = src.indexOf('return { external: true }');
  expect(refuse, 'the bundler does not consult the denied list').toBeGreaterThan(-1);
  expect(refuse, 'the bundler marks a built-in external before it checks the denied list').toBeLessThan(external);
  expect(src).toContain('modGuardSource(');
  expect(src).toContain('modHooksSource(');
  expect(src).toMatch(/args\.push\(`--import=\$\{pathToFileURL\(modGuardPath\)\.href\}`\)/);
});

test('both places that execute a suite do it through the core, and neither keeps a copy', () => {
  for (const rel of ['app/api/run-tests/route.ts', 'runner/server.ts']) {
    const src = readRel(rel);
    expect(src, `${rel} does not execute through the shared core`).toMatch(/executeSandboxRun\(/);
    // A second spawn, bundler or guard writer in either file would be a copy
    // that the guards above do not read.
    expect(src, `${rel} spawns a process of its own`).not.toMatch(/from ['"](node:)?child_process['"]/);
    expect(src, `${rel} bundles on its own`).not.toMatch(/import\(['"]esbuild['"]\)/);
    expect(src, `${rel} writes a module guard of its own`).not.toContain('modGuardSource(');
  }
  // The runner never takes the unsandboxed fallback; only the app's emulator path may.
  expect(readRel('runner/server.ts')).toContain('allowUnsandboxed: false');
});

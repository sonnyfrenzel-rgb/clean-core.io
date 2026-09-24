/**
 * Roadmap 8.9 — the shared execution core, run for real without a server.
 *
 * `lib/test-sandbox/core.ts` is what the isolated runner executes and what an
 * emulator build of the app executes locally. These tests call it directly:
 * a passing suite, the stub list, the bundle boundary, the hashes it reports,
 * and the two shapes of the network guard as the child sees them. On a Node
 * without the permission model (the local Node 20) they run with the named
 * fallback; the permission flag itself is pinned in
 * `tests/sandbox-module-guard.spec.ts`.
 */
import { test, expect } from '@playwright/test';
import http from 'http';
import type { AddressInfo } from 'net';
import { executeSandboxRun, resolvePermissionFlag } from '../lib/test-sandbox/core';
import { hashRunInputs } from '../lib/test-sandbox/protocol';
import { sandboxFilesFromStoredCode, normalizeSandboxPath, sandboxPatterns } from '../lib/test-sandbox/files';
import { parseTapOutput } from '../lib/test-verdicts';

const APP = [{ path: 'app.ts', content: "import express from 'express';\nexport const sum = (a: number, b: number): number => a + b;\nexport const server = express;" }];
const SUITE = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert';",
  "import { sum } from './app';",
  "test('TC_SUM: adds', () => { assert.strictEqual(sum(2, 3), 5); });",
  "test('TC_ENV: nothing of the parent', () => { assert.strictEqual(process.env.CC_PARENT_SECRET, undefined); });",
].join('\n');

test.describe('the core executes, and says what it executed', () => {
  test.setTimeout(90_000);

  test('a passing suite, stubs named, hashes of what it was handed', async () => {
    process.env.CC_PARENT_SECRET = 'must-not-reach-the-child';
    try {
      const out = await executeSandboxRun({ files: APP, suiteCode: SUITE, patterns: [], allowUnsandboxed: true });
      expect(out.kind, JSON.stringify(out).slice(0, 600)).toBe('ran');
      if (out.kind !== 'ran') return;
      const verdicts = Object.fromEntries(parseTapOutput(out.stdout).map((r) => [r.id, r.status]));
      expect(verdicts).toMatchObject({ TC_SUM: 'Passed', TC_ENV: 'Passed' });
      expect(out.stubbedPackages).toEqual(['express']);
      const expected = hashRunInputs(APP, SUITE);
      expect(out.files).toEqual(expected.files);
      expect(out.suiteSha256).toBe(expected.suiteSha256);
    } finally {
      delete process.env.CC_PARENT_SECRET;
    }
  });

  test('the name filter runs only the selected case', async () => {
    const out = await executeSandboxRun({ files: APP, suiteCode: SUITE, patterns: ['TC_SUM'], allowUnsandboxed: true });
    expect(out.kind).toBe('ran');
    if (out.kind !== 'ran') return;
    const ids = parseTapOutput(out.stdout).filter((r) => r.status === 'Passed').map((r) => r.id);
    expect(ids).toEqual(['TC_SUM']);
  });

  test('an import outside the run directory is refused at bundle time, without echoing the path', async () => {
    const suite = "import secret from '../../../../../../etc/hosts';\nimport { test } from 'node:test';\ntest('TC_X', () => { console.log(secret); });";
    const out = await executeSandboxRun({ files: [], suiteCode: suite, patterns: [], allowUnsandboxed: true });
    expect(out.kind).toBe('build-error');
    if (out.kind !== 'build-error') return;
    expect(out.message).toContain('Path outside sandbox rejected.');
    expect(out.message).not.toMatch(/cc-tests-/);
  });

  test('a denied built-in is refused at bundle time', async () => {
    const suite = "import { DatabaseSync } from 'node:sqlite';\nimport { test } from 'node:test';\ntest('TC_Q', () => { void DatabaseSync; });";
    const out = await executeSandboxRun({ files: [], suiteCode: suite, patterns: [], allowUnsandboxed: true });
    expect(out.kind).toBe('build-error');
    if (out.kind === 'build-error') expect(out.message).toContain('is not available in the Clean-Core.io test sandbox.');
  });

  test('closed network: the suite cannot fetch; loopback: exactly the relay port answers', async () => {
    const server = http.createServer((_req, res) => res.end('relay-ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    const suite = [
      "import { test } from 'node:test';",
      "import assert from 'node:assert';",
      `test('TC_RELAY', async () => { const r = await fetch('http://127.0.0.1:${port}/sap/x'); assert.strictEqual(await r.text(), 'relay-ok'); });`,
      "test('TC_META', async () => { let refused = false; try { await fetch('http://169.254.169.254/'); } catch { refused = true; } assert.ok(refused); });",
    ].join('\n');
    try {
      const closed = await executeSandboxRun({ files: [], suiteCode: suite, patterns: [], allowUnsandboxed: true });
      expect(closed.kind).toBe('ran');
      if (closed.kind === 'ran') {
        const v = Object.fromEntries(parseTapOutput(closed.stdout).map((r) => [r.id, r.status]));
        expect(v.TC_RELAY, 'a mock run reached a local port').toBe('Failed');
        expect(v.TC_META).toBe('Passed');
      }
      const open = await executeSandboxRun({
        files: [],
        suiteCode: suite,
        patterns: [],
        allowUnsandboxed: true,
        loopback: { host: '127.0.0.1', port },
        extraEnv: { S4_TENANT_URL: `http://127.0.0.1:${port}` },
      });
      expect(open.kind).toBe('ran');
      if (open.kind === 'ran') {
        const v = Object.fromEntries(parseTapOutput(open.stdout).map((r) => [r.id, r.status]));
        expect(v, open.stdout.slice(0, 800)).toMatchObject({ TC_RELAY: 'Passed', TC_META: 'Passed' });
      }
    } finally {
      server.close();
    }
  });
});

test.describe('the fallback is named and narrow', () => {
  test('without the permission model only an explicit fallback runs; the runner never asks for it', () => {
    const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
    const hasModel = major > 22 || (major === 22 && minor >= 8);
    const strict = resolvePermissionFlag(false);
    if (hasModel) expect(strict.flag).toMatch(/permission/);
    else expect(strict.flag, 'a Node without the permission model must be a refusal on the runner').toBeNull();
    expect(resolvePermissionFlag(true).flag).not.toBeNull();
  });
});

test.describe('what the app sends', () => {
  test('stored code becomes files the way the route always wrote them', () => {
    expect(sandboxFilesFromStoredCode('')).toEqual([]);
    expect(sandboxFilesFromStoredCode('export const a = 1;')).toEqual([{ path: 'app.ts', content: 'export const a = 1;' }]);
    const modular = JSON.stringify([
      { path: 'srv/a.ts', content: 'A' },
      { path: '../../etc/x.ts', content: 'B' },
      { path: '/abs/c.ts', content: 'C' },
      { path: 'srv/a.ts', content: 'A2' },
    ]);
    expect(sandboxFilesFromStoredCode(modular)).toEqual([
      { path: 'srv/a.ts', content: 'A2' },
      { path: 'etc/x.ts', content: 'B' },
      { path: 'abs/c.ts', content: 'C' },
    ]);
    // A JSON value that is not a file list is legacy flat code.
    expect(sandboxFilesFromStoredCode('{"a":1}')).toEqual([{ path: 'app.ts', content: '{"a":1}' }]);
  });

  test('paths normalise or are dropped; patterns keep word characters only', () => {
    expect(normalizeSandboxPath('a\\b\\c.ts')).toBe('a/b/c.ts');
    expect(normalizeSandboxPath('./x/./y.ts')).toBe('x/y.ts');
    expect(normalizeSandboxPath('..')).toBeNull();
    expect(normalizeSandboxPath('a\u0000b')).toBeNull();
    expect(normalizeSandboxPath('x'.repeat(301))).toBeNull();
    expect(sandboxPatterns(['TC_01', 'TC-02; rm', 42])).toEqual(['TC_01', 'TC02rm', '42']);
    expect(sandboxPatterns(undefined)).toEqual([]);
  });
});

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
import { executeSandboxRun, resolvePermissionFlag, collectNamedImports, neutralize, scrubRunDirNames, testNamePattern } from '../lib/test-sandbox/core';
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

  test('paths normalise or are dropped; patterns are the ids themselves, or refused', () => {
    expect(normalizeSandboxPath('a\\b\\c.ts')).toBe('a/b/c.ts');
    expect(normalizeSandboxPath('./x/./y.ts')).toBe('x/y.ts');
    expect(normalizeSandboxPath('..')).toBeNull();
    expect(normalizeSandboxPath('a\u0000b')).toBeNull();
    expect(normalizeSandboxPath('x'.repeat(301))).toBeNull();
    // Codex code-runner-04: `TC-001` used to go out as `TC001`, which names no test.
    expect(sandboxPatterns(['TC_01', 'TC-001', 'TC.002', 42])).toEqual(['TC_01', 'TC-001', 'TC.002', '42']);
    expect(sandboxPatterns(['TC_01', 'TC-02; rm'])).toBeNull();
    expect(sandboxPatterns(['TC|01'])).toBeNull();
    expect(sandboxPatterns(undefined)).toEqual([]);
  });
});

// Codex code-runner-04: the filter ran `TC_010` for `TC_01` and nothing for `TC-001`.
test.describe('the name filter takes each selected id literally and whole', () => {
  test.setTimeout(90_000);

  test('the pattern matches the id at the start of a name, up to where the parser ends an id', () => {
    const re = new RegExp(testNamePattern(['TC_01', 'TC-001', 'TC.2']));
    for (const name of ['TC_01: adds', 'TC_01', 'TC_01 adds', 'TC-001: totals', 'TC.2: x']) expect(re.test(name), name).toBe(true);
    for (const name of ['TC_010: adds', 'XTC_01: adds', 'TC-0011', 'TCx2: x', 'TC_01x']) expect(re.test(name), name).toBe(false);
    expect(testNamePattern([])).toBe('');
  });

  test('an execution runs exactly the selected cases', async () => {
    const suite = [
      "import { test } from 'node:test';",
      "test('TC_01: one', () => {});",
      "test('TC_010: ten', () => {});",
      "test('TC-001: hyphen', () => {});",
    ].join('\n');
    const ran = async (patterns: string[]) => {
      const out = await executeSandboxRun({ files: [], suiteCode: suite, patterns, allowUnsandboxed: true });
      expect(out.kind).toBe('ran');
      return out.kind === 'ran' ? parseTapOutput(out.stdout).filter((r) => r.status === 'Passed').map((r) => r.id).sort() : [];
    };
    expect(await ran(['TC_01'])).toEqual(['TC_01']);
    expect(await ran(['TC-001'])).toEqual(['TC-001']);
  });
});

// Codex code-runner-05: the rewrite put `: any[]` into JavaScript files.
test.describe('server bootstrap is neutralised in JavaScript as well', () => {
  test.setTimeout(90_000);

  test('a .js app that calls app.listen bundles and runs', async () => {
    const files = [{ path: 'app.js', content: "const express = require('express');\nconst app = express();\nexports.sum = (a, b) => a + b;\nexports.server = app.listen(3000, () => {});\n" }];
    const suite = "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { sum } from './app.js';\ntest('TC_JS: adds', () => { assert.strictEqual(sum(2, 3), 5); });";
    const out = await executeSandboxRun({ files, suiteCode: suite, patterns: [], allowUnsandboxed: true });
    expect(out.kind, JSON.stringify(out).slice(0, 600)).toBe('ran');
    if (out.kind === 'ran') expect(parseTapOutput(out.stdout).map((r) => [r.id, r.status])).toEqual([['TC_JS', 'Passed']]);
  });

  test('only the app.listen call itself is rewritten', () => {
    expect(neutralize('myapp.listen(1); app.listener; app.listen(2)')).toBe('myapp.listen(1); app.listener; ((..._args) => ({ close: () => {} }))(2)');
  });
});

// codex code-runner-03
test.describe('the service-side scans are linear', () => {
  const REGEX_IMPORTS = /import[^{};]*\{([^}]*)\}/g;
  const viaRegex = (src: string) => {
    const names = new Set<string>();
    for (const m of src.matchAll(REGEX_IMPORTS)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim().replace(/^type\s+/, '');
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
    return [...names];
  };
  const viaScrubRegex = (t: string) => t.replace(/[^\s'"`:]*cc-tests-[A-Za-z0-9]+/g, '<sandbox>');

  test('the named-import scan reads what the regex read', () => {
    const samples = [
      "import { A, B as C, type D } from 'x';\nimport E, { F } from 'y';\nimport * as G from 'z';\nimport 'side';\nconst o = { a: 1 };",
      'import x; import { Y } from "y"; import {',
      'importimport { Q }',
      "export { A } from 'a'; import type { T } from 't'; import {\n  M,\n  N,\n} from 'mn';",
    ];
    for (const s of samples) expect(collectNamedImports([s]), s).toEqual(viaRegex(s));
  });

  test('the run-directory scrub replaces what the regex replaced', () => {
    const samples = [
      'Error at /tmp/cc-tests-AbC123/app.ts:3:1',
      "at '../../tmp/cc-tests-x1/a.ts' and cc-tests-  and cc-tests--cc-tests-z9",
      'x:cc-tests-q"y cc-tests-r',
      'nothing here',
    ];
    for (const s of samples) expect(scrubRunDirNames(s), s).toBe(viaScrubRegex(s));
  });

  test('long input finishes in well under a second', () => {
    const imports = 'import '.repeat(80_000); // 560 kB, inside the payload limit
    const unclosed = 'import {'.repeat(70_000);
    const stderr = 'a'.repeat(2_000_000) + 'cc-tests--'.repeat(100_000);
    const started = Date.now();
    expect(collectNamedImports([imports, unclosed])).toEqual([]);
    expect(scrubRunDirNames(stderr)).toBe(stderr);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

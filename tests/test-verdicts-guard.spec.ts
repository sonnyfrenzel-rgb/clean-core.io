import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { parseTapOutput, packageNameOf, applyRunnerVerdicts } from '../lib/test-verdicts';
import { TERMS_VERSION } from '../lib/constants';

/**
 * Passed only from an explicit, matched result — and every other outcome named
 * (roadmap E07-F01, CR-12, CR-13, CR-14).
 *
 * Measured before the fix:
 *
 *   - TAP `# SKIP` and `# TODO` both became `Not run`. Honest about the pass,
 *     silent about why.
 *   - The live ABAP path "validated" a tenant with six kinds of check —
 *     reachable, logged in, `$metadata` readable, EntitySets declared, one
 *     OData read each, CSRF — and wrote `Passed` for all of them. None ran the
 *     generated code. The CSRF one was `Passed` whenever the login worked, and
 *     no x-csrf-token request was ever made.
 *   - The runner replaced every npm package the generated code imported with an
 *     empty proxy, and nothing said which.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('the TAP reader', () => {
  const TAP = [
    'TAP version 13',
    'ok 1 - TC_01: totals add up',
    'not ok 2 - TC_02: rounding',
    '  ---',
    '  error: Expected 3 but got 4',
    '  ...',
    'ok 3 - TC_03: needs a tenant # SKIP no tenant in the sandbox',
    'ok 4 - TC_04: currency conversion # TODO',
  ].join('\n');

  test('names every outcome: passed, failed, skipped, todo', () => {
    const r = parseTapOutput(TAP);
    expect(r.map((x) => [x.id, x.status])).toEqual([
      ['TC_01', 'Passed'],
      ['TC_02', 'Failed'],
      ['TC_03', 'Skipped'],
      ['TC_04', 'Todo'],
    ]);
    expect(r[1].message).toBe('Expected 3 but got 4');
    expect(r[2].message).toMatch(/not executed: no tenant in the sandbox/);
  });

  test('a skip or todo written as `ok` is still not a pass', () => {
    const r = parseTapOutput('ok 1 - TC_09: later # skip');
    expect(r[0].status).toBe('Skipped');
    expect(r.filter((x) => x.status === 'Passed')).toEqual([]);
  });

  test('stubbed imports are named by package', () => {
    expect(packageNameOf('express')).toBe('express');
    expect(packageNameOf('express/lib/router')).toBe('express');
    expect(packageNameOf('@sap/xssec')).toBe('@sap/xssec');
    expect(packageNameOf('@sap-cloud-sdk/http-client/dist/x')).toBe('@sap-cloud-sdk/http-client');
  });
});

/**
 * One rule for what a run says about a case, written down once.
 *
 * It is applied twice — by `/api/run-tests`, which stores the verdicts beside
 * its receipt, and by the testing page, which shows the run it just watched
 * without waiting for a reload. Two copies would drift, and the drift would read
 * as a screen disagreeing with the phase contract about the same run.
 */
test.describe('a run laid over the cases it reported on', () => {
  const CASES = [{ id: 'TC_01', name: 'a' }, { id: 'TC_02', name: 'b' }, { id: 'TC_03', name: 'c' }];

  test('the runner\'s verdict where there is one, `Not run` where there is not', () => {
    const applied = applyRunnerVerdicts(
      CASES,
      [
        { id: 'TC_01', name: 'a', status: 'Passed', message: 'Passed in the Node.js test runner' },
        { id: 'TC_02', name: 'b', status: 'Failed', message: 'Expected 3 but got 4' },
      ],
      1,
    );
    expect(applied.map((c) => c.status)).toEqual(['Passed', 'Failed', 'Not run']);
    expect(applied[2].message).toBe('The run failed before this test reported a result');
    // Everything else about the case survives — a verdict is added, not a case rewritten.
    expect(applied[0].name).toBe('a');
  });

  test('a green exit code is not a verdict for a case the runner never mentioned', () => {
    // The shape of the defect: a whole file failing to load exits 0 in some
    // configurations, and every case in it was reported as verified.
    const applied = applyRunnerVerdicts(CASES, [], 0);
    expect(applied.map((c) => c.status)).toEqual(['Not run', 'Not run', 'Not run']);
    expect(applied[0].message).toBe('The runner finished without reporting on this test — no result to show');
  });

  test('SKIP and TODO arrive as themselves, so a pass count cannot absorb them', () => {
    const applied = applyRunnerVerdicts(CASES, parseTapOutput('ok 1 - TC_01: x # SKIP\nok 2 - TC_02: y # TODO\n'), 0);
    expect(applied.map((c) => c.status)).toEqual(['Skipped', 'Todo', 'Not run']);
  });
});

test.describe('the live tenant path reports connectivity, not passes', () => {
  const liveBranch = () => {
    const src = read('hooks/useTestExecution.ts');
    const start = src.indexOf('if (isLiveMode) {');
    const end = src.indexOf('// Mock mode: simulated ABAP Unit execution');
    expect(start, 'live branch not found').toBeGreaterThan(-1);
    expect(end, 'mock branch not found').toBeGreaterThan(start);
    return src.slice(start, end).replace(/^\s*\/\/.*$/gm, '');
  };

  test('no check in it writes Passed', () => {
    const live = liveBranch();
    expect(live).not.toMatch(/status:\s*'Passed'/);
    expect(live).not.toMatch(/\?\s*'Passed'/);
    expect(live).toContain("'Connectivity'");
  });

  test('the CSRF row is not asserted from the login', () => {
    const live = liveBranch();
    const csrf = live.slice(live.indexOf("id: 'TC_CSRF'"), live.indexOf('setTestResults(liveResults)'));
    expect(csrf).toContain("status: 'Not run'");
    expect(csrf).not.toContain('isFullyConnected');
  });

  test('the report says no test of the code ran', () => {
    expect(liveBranch()).toContain('No test of the generated code was executed.');
  });
});

// ── A real run through the sandbox ──────────────────────────────────────────

test.describe('the runner, end to end', () => {
  const EMAIL = `verdicts-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'Verdicts123!';
  const PROJECT_ID = `verdicts-${Date.now()}`;
  let token = '';

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Verdict', lastName: 'Guard', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Verdict fixture', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
    });
  });

  test('skip and todo come back as themselves, and the stubbed package is named', async ({ request }) => {
    test.setTimeout(90 * 1000);
    const suite = [
      "import { test } from 'node:test';",
      "import assert from 'node:assert';",
      "import express from 'express';",
      "test('TC_01: logic runs', () => { const app = express(); assert.ok(app !== undefined); });",
      "test.skip('TC_02: needs a tenant', () => {});",
      "test.todo('TC_03: not written yet');",
    ].join('\n');
    // The suite is stored on the project, not posted in the body: since the QA
    // full review of a19945ef01dc the route executes the project's own
    // artefacts, so that a result can be attributed to the project at all.
    await adminMergeDoc('projects', PROJECT_ID, { testSuite: { code: suite }, generatedCode: '' });
    const res = await request.post('/api/run-tests', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, selectedTestIds: ['TC_01', 'TC_02', 'TC_03'] },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.stubbedPackages).toEqual(['express']);
    const byId = Object.fromEntries((body.testResults as { id: string; status: string }[]).map((r) => [r.id, r.status]));
    expect(byId).toMatchObject({ TC_01: 'Passed', TC_02: 'Skipped', TC_03: 'Todo' });
  });

  // ── The sandbox file boundary (SEC-2026-025) ──────────────────────────────
  // The bundler resolves the untrusted test/app imports in the PARENT process.
  // A specifier that resolves outside `testDir` must be refused for every
  // extension and both relative and absolute forms — otherwise the default
  // resolver reads that file straight off the server filesystem and inlines it
  // into the bundle returned to the caller (service-account JSON, app source).
  // The sandbox dir the route creates lives directly under os.tmpdir(), so a
  // marker file placed there is reachable by `../` from inside the sandbox and
  // by its absolute path — the two shapes the guard has to cover.
  test.describe('imports cannot escape the sandbox dir', () => {
    const MARKER = `CC-SANDBOX-ESCAPE-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const fileName = `cc-sandbox-escape-${Date.now()}-${Math.floor(Math.random() * 1e6)}.js`;
    const absMarker = path.join(os.tmpdir(), fileName);
    // esbuild parses import specifiers as literal paths; forward slashes avoid
    // JS-string escaping of a Windows path and stay absolute (path.isAbsolute).
    const absSpec = absMarker.replace(/\\/g, '/');
    // From inside testDir (= <os.tmpdir()>/cc-tests-…) this climbs to os.tmpdir();
    // no extension, so it also exercises the case the old `.js`-only guard missed.
    const relSpec = `../${fileName.replace(/\.js$/, '')}`;

    test.beforeAll(() => {
      fs.writeFileSync(absMarker, `export const SANDBOX_ESCAPE_MARKER = ${JSON.stringify(MARKER)};\n`);
    });
    test.afterAll(() => {
      try { fs.unlinkSync(absMarker); } catch { /* best effort */ }
    });

    const exfilSuite = (spec: string) => [
      `import { SANDBOX_ESCAPE_MARKER } from '${spec}';`,
      "import { test } from 'node:test';",
      // The marker rides in the test name, so a successful read surfaces it in
      // the TAP output the route returns — that is what a leak looks like.
      "test('exfil ' + SANDBOX_ESCAPE_MARKER, () => {});",
    ].join('\n');

    for (const [shape, spec] of [['an absolute', absSpec], ['a relative-traversal', relSpec]] as const) {
      test(`${shape} import outside the sandbox is rejected, its content never returned`, async ({ request }) => {
        test.setTimeout(90 * 1000);
        await adminMergeDoc('projects', PROJECT_ID, { testSuite: { code: exfilSuite(spec) }, generatedCode: '' });
        const res = await request.post('/api/run-tests', {
          headers: { Authorization: `Bearer ${token}` },
          data: { projectId: PROJECT_ID },
        });
        expect(res.status(), await res.text()).toBe(200);
        const body = await res.json();
        // The bundle step must fail closed with the fixed, path-free message.
        expect(body.buildError, JSON.stringify(body).slice(0, 600)).toBe(true);
        expect(body.error).toContain('Path outside sandbox rejected.');
        // And nothing from the target file may reach the caller by any field.
        const whole = JSON.stringify(body);
        expect(whole).not.toContain(MARKER);
        expect(whole).not.toContain(absMarker);
      });
    }

    test('a relative import that stays inside the sandbox still compiles and runs', async ({ request }) => {
      test.setTimeout(90 * 1000);
      const suite = [
        "import { test } from 'node:test';",
        "import assert from 'node:assert';",
        "import { sum } from './app.js';", // tsx-style .js specifier → ./app.ts
        "test('TC_SUM: relative import within the sandbox works', () => { assert.strictEqual(sum(2, 3), 5); });",
      ].join('\n');
      const appFiles = JSON.stringify([{ path: 'app.ts', content: 'export const sum = (a: number, b: number): number => a + b;' }]);
      await adminMergeDoc('projects', PROJECT_ID, { testSuite: { code: suite }, generatedCode: appFiles });
      const res = await request.post('/api/run-tests', {
        headers: { Authorization: `Bearer ${token}` },
        data: { projectId: PROJECT_ID, selectedTestIds: ['TC_SUM'] },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      expect(body.buildError, JSON.stringify(body).slice(0, 600)).toBeFalsy();
      const byId = Object.fromEntries((body.testResults as { id: string; status: string }[]).map((r) => [r.id, r.status]));
      expect(byId).toMatchObject({ TC_SUM: 'Passed' });
    });
  });
});

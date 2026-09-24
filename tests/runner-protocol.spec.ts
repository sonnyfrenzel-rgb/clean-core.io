/**
 * Roadmap 8.9 — the contract between the app and the isolated runner, without
 * a server: what the runner accepts, what the app accepts back, where the app
 * sends a run, and what the receipt says about it.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  parseRunRequest,
  parseRunnerReport,
  verifyRunnerReport,
  hashRunInputs,
  MAX_RUN_INPUT_BYTES,
  type RunnerReport,
} from '../lib/test-sandbox/protocol';
import {
  resolveRunnerTarget,
  callIsolatedRunner,
  MOCK_RUNNER_UNAVAILABLE,
  type RunnerConfig,
} from '../lib/test-runner-client';
import { isTestRunReceipt, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '../lib/test-receipt';

const ROOT = path.resolve(__dirname, '..');
const FILES = [{ path: 'srv/a.ts', content: 'export const a = 1;' }, { path: 'app.ts', content: 'export const b = 2;' }];
const SUITE = "import { test } from 'node:test'; test('TC_1', () => {});";

const request = (over: Record<string, unknown> = {}) => ({ files: FILES, suite: { code: SUITE, patterns: ['TC_1'] }, mode: 'mock', ...over });

test.describe('the runner validates what it is asked to run', () => {
  test('a well-formed mock request passes', () => {
    const r = parseRunRequest(request(), { serviceMode: 'mock' });
    expect(r.ok).toBe(true);
  });

  test('refusals: shape, paths, duplicates, size, patterns, mode binding', () => {
    const cases: Array<[Record<string, unknown>, number]> = [
      [request({ mode: 'other' }), 400],
      [request({ mode: 'live' }), 403], // the mock service runs mock only
      [request({ files: 'x' }), 400],
      [request({ files: [{ path: '../etc/passwd', content: '' }] }), 400],
      [request({ files: [{ path: '/abs.ts', content: '' }] }), 400],
      [request({ files: [{ path: 'a\\b.ts', content: '' }] }), 400],
      [request({ files: [{ path: 'a.ts', content: 1 }] }), 400],
      [request({ files: [{ path: 'a.ts', content: '' }, { path: 'a.ts', content: '' }] }), 400],
      [request({ files: [{ path: 'big.ts', content: 'x'.repeat(MAX_RUN_INPUT_BYTES) }] }), 413],
      [request({ suite: { code: '' } }), 400],
      [request({ suite: { code: SUITE, patterns: ['a|b'] } }), 400],
      [request({ proxy: { baseUrl: 'https://x', capability: 'y'.repeat(30) } }), 400], // mock takes no proxy
    ];
    for (const [body, status] of cases) {
      const r = parseRunRequest(body, { serviceMode: 'mock' });
      expect(r.ok, JSON.stringify(body).slice(0, 120)).toBe(false);
      if (!r.ok) expect(r.status, JSON.stringify(body).slice(0, 120)).toBe(status);
    }
    expect(parseRunRequest(null, { serviceMode: 'mock' }).ok).toBe(false);
    expect(parseRunRequest([], { serviceMode: 'mock' }).ok).toBe(false);
  });

  test('a live request needs a plain https proxy of the pinned origin and a well-formed capability', () => {
    const live = (proxy: unknown) => parseRunRequest(request({ mode: 'live', proxy }), { serviceMode: 'live', proxyOrigin: 'https://app.example.run.app' });
    expect(live({ baseUrl: 'https://app.example.run.app/api/s4-proxy', capability: 'v1.' + 'a'.repeat(40) + '.b' }).ok).toBe(true);
    expect(live(undefined).ok).toBe(false);
    expect(live({ baseUrl: 'http://app.example.run.app/api/s4-proxy', capability: 'v1.' + 'a'.repeat(40) }).ok).toBe(false);
    expect(live({ baseUrl: 'https://evil.example/api/s4-proxy', capability: 'v1.' + 'a'.repeat(40) }).ok).toBe(false);
    expect(live({ baseUrl: 'https://u:p@app.example.run.app/api', capability: 'v1.' + 'a'.repeat(40) }).ok).toBe(false);
    expect(live({ baseUrl: 'https://app.example.run.app/api/s4-proxy', capability: '../../x' }).ok).toBe(false);
    // And the live service does not run mock requests.
    expect(parseRunRequest(request(), { serviceMode: 'live' }).ok).toBe(false);
  });
});

function reportFor(files = FILES, suite = SUITE, over: Partial<RunnerReport> = {}): RunnerReport {
  const h = hashRunInputs(files, suite);
  return { outcome: 'ran', stdout: 'TAP', stderr: '', exitCode: 0, stubbedPackages: [], files: h.files, suiteSha256: h.suiteSha256, revision: 'clean-core-runner-00007-abc', mode: 'mock', ...over };
}

test.describe('the app checks what the runner says it ran', () => {
  test('a report of exactly the sent files and suite is accepted, with the digest the receipt carries', () => {
    const v = verifyRunnerReport({ files: FILES, suiteCode: SUITE, mode: 'mock' }, reportFor());
    expect(v).toEqual({ ok: true, digest: hashRunInputs(FILES, SUITE).digest });
    // Order does not matter; the digest is over the sorted list.
    expect(hashRunInputs([...FILES].reverse(), SUITE).digest).toBe(hashRunInputs(FILES, SUITE).digest);
  });

  test('a report about anything else is refused', () => {
    const sent = { files: FILES, suiteCode: SUITE, mode: 'mock' as const };
    const altered = [{ ...FILES[0], content: 'export const a = 2;' }, FILES[1]];
    expect(verifyRunnerReport(sent, reportFor(altered)).ok, 'a changed file').toBe(false);
    expect(verifyRunnerReport(sent, reportFor([FILES[0]])).ok, 'a missing file').toBe(false);
    expect(verifyRunnerReport(sent, reportFor([...FILES, { path: 'extra.ts', content: '' }])).ok, 'an extra file').toBe(false);
    expect(verifyRunnerReport(sent, reportFor(FILES, SUITE + ' ')).ok, 'another suite').toBe(false);
    expect(verifyRunnerReport(sent, reportFor(FILES, SUITE, { mode: 'live' })).ok, 'another mode').toBe(false);
  });

  test('the report shape is checked before anything reads it', () => {
    expect(parseRunnerReport(reportFor())).not.toBeNull();
    expect(parseRunnerReport({ ...reportFor(), revision: '' })).toBeNull();
    expect(parseRunnerReport({ ...reportFor(), suiteSha256: 'nothex' })).toBeNull();
    expect(parseRunnerReport({ ...reportFor(), files: [{ path: 'a', sha256: 'x' }] })).toBeNull();
    expect(parseRunnerReport({ ...reportFor(), outcome: 'maybe' })).toBeNull();
    expect(parseRunnerReport('TAP version 13')).toBeNull();
  });
});

const CONFIG: RunnerConfig = {
  runnerUrl: '',
  runnerLiveUrl: '',
  runnerServiceAccount: '',
  proxyBaseUrl: '',
  proxyKeyPresent: true,
  emulator: false,
};

test.describe('dort oder gar nicht', () => {
  test('a deployed build without RUNNER_URL refuses; only an emulator build runs locally, and never live', () => {
    expect(resolveRunnerTarget('mock', CONFIG)).toEqual({ kind: 'unavailable', status: 503, reason: MOCK_RUNNER_UNAVAILABLE });
    expect(resolveRunnerTarget('mock', { ...CONFIG, runnerUrl: 'not a url' }).kind).toBe('unavailable');
    expect(resolveRunnerTarget('mock', { ...CONFIG, runnerUrl: 'http://runner.internal' }).kind).toBe('unavailable');
    expect(resolveRunnerTarget('mock', { ...CONFIG, emulator: true })).toEqual({ kind: 'local-emulator' });
    // A configured runner wins over the emulator: the isolated path is never bypassed when it exists.
    expect(resolveRunnerTarget('mock', { ...CONFIG, emulator: true, runnerUrl: 'https://r.example.run.app/' })).toEqual({ kind: 'isolated', url: 'https://r.example.run.app' });
    expect(resolveRunnerTarget('live', { ...CONFIG, emulator: true }).kind).toBe('unavailable');
  });

  test('the emulator flag is read literally, so a production build cannot take the local path', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/test-runner-client.ts'), 'utf8');
    expect(src).toContain("emulator: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'");
    const route = fs.readFileSync(path.join(ROOT, 'app/api/run-tests/route.ts'), 'utf8');
    // The local path is the emulator branch of the target, and nothing else starts the core.
    expect(route.match(/executeSandboxRun\(/g)?.length).toBe(1);
    const local = route.indexOf('executeSandboxRun(');
    const branch = route.lastIndexOf("if (target.kind === 'isolated')", local);
    expect(branch, 'the local execution is not the else-branch of the isolated runner').toBeGreaterThan(-1);
    expect(route).toContain('const target = resolveRunnerTarget(mode, runnerConfig);');
    expect(route.indexOf("if (target.kind === 'unavailable')")).toBeLessThan(branch);
  });
});

test.describe('calling the runner', () => {
  const ok = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

  test('it sends the app identity for the runner audience and accepts a matching report', async () => {
    let seen: { url: string; auth: string | null; body: unknown } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify(reportFor()), { status: 200 });
    }) as unknown as typeof fetch;
    const audiences: string[] = [];
    const r = await callIsolatedRunner('https://r.example.run.app', { files: FILES, suiteCode: SUITE, patterns: ['TC_1'], mode: 'mock' }, {
      idToken: async (aud) => {
        audiences.push(aud);
        return 'id-token';
      },
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(audiences).toEqual(['https://r.example.run.app']);
    expect(seen!.url).toBe('https://r.example.run.app/run');
    expect(seen!.auth).toBe('Bearer id-token');
    expect(seen!.body).toEqual({ files: FILES, suite: { code: SUITE, patterns: ['TC_1'] }, mode: 'mock' });
  });

  test('a mismatching or malformed report, a refusal and an unreachable runner record nothing', async () => {
    const input = { files: FILES, suiteCode: SUITE, patterns: [], mode: 'mock' as const };
    const deps = (fetchImpl: typeof fetch) => ({ idToken: async () => 't', fetchImpl });
    const other = reportFor([{ path: 'app.ts', content: 'something else' }]);
    expect((await callIsolatedRunner('https://r', input, deps(ok(other)))).ok).toBe(false);
    expect((await callIsolatedRunner('https://r', input, deps(ok({ stdout: 'TAP' })))).ok).toBe(false);
    expect((await callIsolatedRunner('https://r', input, deps(ok({ error: 'busy' }, 429)))).ok).toBe(false);
    const down = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect((await callIsolatedRunner('https://r', input, deps(down))).ok).toBe(false);
    const noIdentity = await callIsolatedRunner('https://r', input, {
      idToken: async () => {
        throw new Error('no metadata server');
      },
      fetchImpl: ok(reportFor()),
    });
    expect(noIdentity).toMatchObject({ ok: false, status: 503 });
  });
});

test.describe('the receipt names the runner', () => {
  const base: TestRunReceipt = {
    v: TEST_RUN_RECEIPT_VERSION,
    runId: 'run-1',
    codeDigest: 'a'.repeat(64),
    suiteDigest: 'b'.repeat(64),
    casesDigest: 'c'.repeat(64),
    environment: 'mock',
    scope: { selected: null, cases: 1 },
    stubs: [],
    executedAt: '2026-09-24T10:00:00.000Z',
    executedBy: 'uid',
    exitCode: 0,
    verdicts: [{ id: 'TC_1', status: 'Passed' }],
  };

  test('with and without provenance it is a receipt; malformed provenance is not', () => {
    expect(isTestRunReceipt(base)).toBe(true);
    const digest = hashRunInputs(FILES, SUITE).digest;
    expect(isTestRunReceipt({ ...base, runner: { kind: 'isolated', revision: 'clean-core-runner-00007-abc', filesDigest: digest } })).toBe(true);
    expect(isTestRunReceipt({ ...base, runner: { kind: 'local-emulator', revision: 'local-emulator', filesDigest: digest } })).toBe(true);
    expect(isTestRunReceipt({ ...base, runner: { kind: 'somewhere', revision: 'x', filesDigest: digest } })).toBe(false);
    expect(isTestRunReceipt({ ...base, runner: { kind: 'isolated', revision: '', filesDigest: digest } })).toBe(false);
    expect(isTestRunReceipt({ ...base, runner: { kind: 'isolated', revision: 'r', filesDigest: 'short' } })).toBe(false);
  });

  test('the route writes the runner into the receipt only after the report was checked', () => {
    const route = fs.readFileSync(path.join(ROOT, 'app/api/run-tests/route.ts'), 'utf8');
    expect(route).toContain('runner: execution.runner,');
    expect(route).toContain("runner: { kind: 'isolated', revision: call.report.revision, filesDigest: call.filesDigest }");
    // callIsolatedRunner verifies before it returns ok — the filesDigest exists only on a verified report.
    const client = fs.readFileSync(path.join(ROOT, 'lib/test-runner-client.ts'), 'utf8');
    const verify = client.indexOf('verifyRunnerReport(');
    const success = client.indexOf('return { ok: true, report, filesDigest: check.digest }');
    expect(verify).toBeGreaterThan(-1);
    expect(verify).toBeLessThan(success);
  });
});

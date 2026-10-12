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
  verifyEngineReport,
  engineDigest,
  hashRunInputs,
  MAX_RUN_INPUT_BYTES,
  RUNNER_PROTOCOL_VERSION,
  type RunnerReport,
} from '../lib/test-sandbox/protocol';
import { engineRunInputs, ENGINE_CASES_PATH, ENGINE_RUNTIME_PATH } from '../lib/test-sandbox/engine-suite';
import {
  resolveRunnerTarget,
  callIsolatedRunner,
  describeFetchFailure,
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

test.describe('there or not at all', () => {
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

  // 02.10.2026: the dev self-test said only "fetch failed" for all three probes,
  // which reads the same for a DNS failure, a refused connection and a TLS error.
  test('an unreachable runner says why: the fetch cause code reaches the reason, the token does not', async () => {
    const input = { files: FILES, suiteCode: SUITE, patterns: [], mode: 'mock' as const };
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND r.example.run.app'), { code: 'ENOTFOUND' });
    const failed = new TypeError('fetch failed', { cause: dns });
    const down = (async () => {
      throw failed;
    }) as unknown as typeof fetch;
    const r = await callIsolatedRunner('https://r.example.run.app', input, { idToken: async () => 'secret-id-token', fetchImpl: down });
    expect(r).toEqual({ ok: false, status: 502, reason: 'The test runner could not be reached (ENOTFOUND).' });
    expect(describeFetchFailure(failed)).toEqual({ code: 'ENOTFOUND', message: 'fetch failed: getaddrinfo ENOTFOUND r.example.run.app' });
    expect(JSON.stringify(describeFetchFailure(failed))).not.toContain('secret-id-token');
    // No cause: the message alone, no invented code.
    expect(describeFetchFailure(new Error('boom'))).toEqual({ code: null, message: 'boom' });
    const aborted = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(describeFetchFailure(aborted).code).toBe('ABORTED');
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

test.describe('the runner revision is described as what it is', () => {
  // The app has no independent source for K_REVISION: it checks the shape, not
  // the value. Any text saying the app checks the revision would be false.
  test('a well-shaped revision the app never deployed is still accepted — so it is self-reported', () => {
    const report = {
      outcome: 'ran', stdout: '', stderr: '', exitCode: 0, stubbedPackages: [],
      files: [], suiteSha256: hashRunInputs([], 'x').suiteSha256, revision: 'any-revision-the-runner-names', mode: 'mock',
    };
    expect(parseRunnerReport(report)?.revision).toBe('any-revision-the-runner-names');
  });

  test('SECURITY.md, the protocol and the receipt call it self-reported', () => {
    const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
    expect(read('SECURITY.md')).toContain('The revision is self-reported');
    expect(read('SECURITY.md')).not.toContain('refuses a report that does not match and writes the digest and the revision');
    expect(read('lib/test-sandbox/protocol.ts')).toContain('self-reported, shape-checked only');
    expect(read('lib/test-receipt.ts')).toContain('Self-reported');
  });
});

/* ------------------------------------------------- protocol 2: the engine pass */

test.describe('protocol 2: the engine pass (roadmap 3.0.12, owner 12.10.2026)', () => {
  const CONTRACT_FILE = { path: 'srv/engine-contract.ts', content: 'export const CONTRACT = {};' };
  const EFILES = [...FILES, CONTRACT_FILE];
  const CASES = JSON.stringify({ format: 'clean-core.engine-cases/1', cases: [{ id: 'TC_ENG_01', name: 'x', examples: [] }] });
  const ENGINE = { cases: CASES, contractModule: 'srv/engine-contract.ts', patterns: ['TC_ENG_01'] };
  const engineRequest = (over: Record<string, unknown> = {}) => request({ files: EFILES, protocol: RUNNER_PROTOCOL_VERSION, engine: ENGINE, ...over });
  const engineReportFor = (cases = CASES, contractModule = 'srv/engine-contract.ts'): RunnerReport => {
    const inputs = engineRunInputs(EFILES, cases, contractModule);
    const h = hashRunInputs(inputs.files, inputs.suiteCode);
    return {
      ...reportFor(EFILES),
      protocol: RUNNER_PROTOCOL_VERSION,
      engine: { outcome: 'ran', stdout: 'TAP', stderr: '', exitCode: 0, files: h.files, suiteSha256: h.suiteSha256, casesSha256: inputs.casesSha256, contractModule },
    };
  };

  test('a version-1 request is unchanged; an engine pass needs protocol 2, a contract path among the files and a case list', () => {
    expect(parseRunRequest(request(), { serviceMode: 'mock' }).ok).toBe(true);
    const r = parseRunRequest(engineRequest(), { serviceMode: 'mock' });
    expect(r.ok && r.value).toMatchObject({ protocol: 2, engine: ENGINE });
    const refusals: Array<[Record<string, unknown>, number]> = [
      [engineRequest({ protocol: undefined }), 400],
      [engineRequest({ protocol: 1 }), 400],
      [request({ protocol: 3 }), 400],
      [engineRequest({ engine: { ...ENGINE, contractModule: 'srv/service.ts' } }), 400],
      [engineRequest({ files: FILES }), 400], // the contract module is not among the files
      [engineRequest({ engine: { ...ENGINE, cases: 'not json' } }), 400],
      [engineRequest({ engine: { ...ENGINE, cases: '{}' } }), 400],
      [engineRequest({ engine: { ...ENGINE, patterns: ['a|b'] } }), 400],
      [engineRequest({ engine: { ...ENGINE, cases: JSON.stringify({ cases: [], pad: 'x'.repeat(600 * 1024) }) } }), 413],
    ];
    for (const [body, status] of refusals) {
      const res = parseRunRequest(body, { serviceMode: 'mock' });
      expect(res.ok, JSON.stringify(body).slice(0, 160)).toBe(false);
      if (!res.ok) expect(res.status, JSON.stringify(body).slice(0, 160)).toBe(status);
    }
  });

  test('both sides derive the same pass: the generated code, the runtime and the cases, and a suite nobody sends', () => {
    const inputs = engineRunInputs(EFILES, CASES, 'srv/engine-contract.ts');
    expect(inputs.files.map((f) => f.path)).toEqual(['srv/a.ts', 'app.ts', 'srv/engine-contract.ts', ENGINE_RUNTIME_PATH, ENGINE_CASES_PATH]);
    expect(inputs.suiteCode).toContain('import * as contract from "./srv/engine-contract.ts";');
    // a file posing as the runtime or the cases is replaced, never trusted
    const posing = engineRunInputs([...EFILES, { path: ENGINE_RUNTIME_PATH, content: 'export const runEngineCase = () => ({ status: "Passed" });' }], CASES, 'srv/engine-contract.ts');
    expect(posing.files.filter((f) => f.path === ENGINE_RUNTIME_PATH)).toHaveLength(1);
    expect(posing.files.find((f) => f.path === ENGINE_RUNTIME_PATH)!.content).not.toContain('status: "Passed"');
  });

  test('the engine report is hash-bound like the run: other cases, files, suite or module are refused; an old runner is named', () => {
    const sent = { files: EFILES, engine: ENGINE };
    const ok = verifyEngineReport(sent, engineReportFor());
    const inputs = engineRunInputs(EFILES, CASES, 'srv/engine-contract.ts');
    const h = hashRunInputs(inputs.files, inputs.suiteCode);
    expect(ok).toEqual({ ok: true, digest: engineDigest(h.files, h.suiteSha256, inputs.casesSha256) });
    expect(verifyEngineReport(sent, engineReportFor(CASES.replace('TC_ENG_01', 'TC_ENG_02')))).toMatchObject({ ok: false, missing: false, reason: 'The runner reported different engine cases.' });
    const report = engineReportFor();
    expect(verifyEngineReport(sent, { ...report, engine: { ...report.engine!, suiteSha256: 'f'.repeat(64) } })).toMatchObject({ ok: false, reason: 'The runner reported a different engine suite.' });
    expect(verifyEngineReport(sent, { ...report, engine: { ...report.engine!, files: report.engine!.files.slice(1) } })).toMatchObject({ ok: false, reason: 'The runner reported a different set of engine files.' });
    expect(verifyEngineReport(sent, { ...report, engine: { ...report.engine!, contractModule: 'engine-contract.ts' } })).toMatchObject({ ok: false, reason: 'The runner reported a different contract module.' });
    const { engine: _drop, ...older } = report;
    void _drop;
    expect(verifyEngineReport(sent, older)).toEqual({ ok: false, missing: true, reason: 'The runner did not run the engine cases (a runner revision before protocol 2).' });
    // the shape is checked first
    expect(parseRunnerReport(report)).not.toBeNull();
    expect(parseRunnerReport({ ...report, engine: { ...report.engine!, casesSha256: 'x' } })).toBeNull();
  });

  test('the client sends protocol 2 with the engine pass and keeps the main run when the engine report does not hold', async () => {
    let sentBody: Record<string, unknown> | null = null;
    const fetchWith = (answer: RunnerReport) =>
      (async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify(answer), { status: 200 });
      }) as unknown as typeof fetch;
    const input = { files: EFILES, suiteCode: SUITE, patterns: [], mode: 'mock' as const, engine: ENGINE };
    const good = await callIsolatedRunner('https://r.example.run.app', input, { idToken: async () => 't', fetchImpl: fetchWith(engineReportFor()) });
    expect(sentBody).toMatchObject({ protocol: 2, engine: ENGINE });
    expect(good.ok && good.engine).toMatchObject({ ok: true });
    const { engine: _e, ...older } = engineReportFor();
    void _e;
    const old = await callIsolatedRunner('https://r.example.run.app', input, { idToken: async () => 't', fetchImpl: fetchWith(older as RunnerReport) });
    expect(old.ok).toBe(true);
    expect(old.ok && old.engine).toEqual({ ok: false, reason: 'The runner did not run the engine cases (a runner revision before protocol 2).' });
  });

  test('the runner runs the pass through the same core with the same guards; the route records it only when verified', () => {
    const server = fs.readFileSync(path.join(ROOT, 'runner/server.ts'), 'utf8');
    expect(server).toContain('const inputs = engineRunInputs(run.files, run.engine.cases, run.engine.contractModule);');
    const pass = server.slice(server.indexOf('const inputs = engineRunInputs('));
    expect(pass.slice(0, 600)).toMatch(/executeSandboxRun\(\{\s+files: inputs\.files,\s+suiteCode: inputs\.suiteCode,\s+patterns: run\.engine\.patterns,\s+allowUnsandboxed: false,/);
    expect(server).toContain('protocol: RUNNER_PROTOCOL_VERSION,');
    const route = fs.readFileSync(path.join(ROOT, 'app/api/run-tests/route.ts'), 'utf8');
    // the digest in the receipt is the verified one, from the isolated runner or the named local path
    expect(route).toContain('call.engine?.ok && call.report.engine');
    expect(route).toContain('{ engine: { digest: execution.engine.digest, contractModule: execution.engine.contractModule, viaContract: engineMerge?.viaContract ?? [] } }');
    // the app never executes the pass itself outside the emulator path
    expect(route).toMatch(/if \(enginePlan\) \{\r?\n\s+\/\/ The same derivation the runner makes[^\r\n]*\r?\n\s+const inputs = engineRunInputs\(files, enginePlan\.cases, enginePlan\.contractModule\);\r?\n\s+const pass = await executeLocally\(target,/);
  });

  test('a receipt may carry the engine pass; a malformed one is no receipt', () => {
    const receipt: TestRunReceipt = {
      v: TEST_RUN_RECEIPT_VERSION,
      runId: 'run-1',
      codeDigest: 'a'.repeat(64),
      suiteDigest: 'b'.repeat(64),
      casesDigest: 'c'.repeat(64),
      environment: 'mock',
      scope: { selected: null, cases: 1 },
      stubs: [],
      executedAt: '2026-10-12T10:00:00.000Z',
      executedBy: 'uid',
      exitCode: 0,
      verdicts: [{ id: 'TC_ENG_01', status: 'Passed' }],
    };
    expect(isTestRunReceipt({ ...receipt, engine: { digest: 'd'.repeat(64), contractModule: 'srv/engine-contract.ts', viaContract: ['TC_ENG_01'] } })).toBe(true);
    expect(isTestRunReceipt({ ...receipt, engine: { digest: 'short', contractModule: 'srv/engine-contract.ts', viaContract: [] } })).toBe(false);
    expect(isTestRunReceipt({ ...receipt, engine: { digest: 'd'.repeat(64), contractModule: 'srv/engine-contract.ts', viaContract: [1] } })).toBe(false);
  });
});

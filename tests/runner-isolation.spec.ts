import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  RUNNER_SELFTEST_FILE,
  RUNNER_SELFTEST_SUITE,
  SELFTEST_PROBES,
  evaluateSelftest,
  evaluateNetworkProbe,
  combineSelftest,
} from '../lib/runner-selftest';
import { RUNNER_NETWORK_PROBES } from '../lib/test-sandbox/protocol';
import { executeSandboxRun } from '../lib/test-sandbox/core';

/**
 * Roadmap 8.9 — the authorized negative test of the isolated runners.
 *
 * Three layers, and only the last needs the deployment:
 *
 *   1. The verdict: a probe holds only on an explicit `ok` line with its name.
 *      A suite that did not run, a missing line or a non-zero exit is never a
 *      pass — "nothing was reported" must not read as "nothing got through".
 *   2. The suite can fail: run without the sandbox, with a secret-named variable
 *      in its environment, it goes red. A test that cannot fail proves nothing.
 *   3. Against the deployment: POST /api/admin/runner-selftest on the deployed
 *      app, as an administrator with a fresh step-up. Runs only when
 *      RUNNER_SELFTEST_APP_URL and RUNNER_SELFTEST_ADMIN_TOKEN are set (SECURITY.md
 *      §7 says how to get them); otherwise it is skipped with that reason. This
 *      is one of the reopening conditions of the live path (lib/locked-paths.ts).
 */

const tap = (lines: string[]) => ['TAP version 13', ...lines, `1..${lines.length}`].join('\n');
const allOk = SELFTEST_PROBES.map((p, i) => `ok ${i + 1} - ${p}`);

test.describe('the verdict reads only what was reported', () => {
  test('every probe reported ok and a clean exit: held', () => {
    const v = evaluateSelftest({ outcome: 'ran', stdout: tap(allOk), exitCode: 0 });
    expect(v.held).toBe(true);
    expect(v.reason).toBeNull();
    expect(v.probes.every((p) => p.held)).toBe(true);
  });

  test('a missing line is a failure, never a pass', () => {
    const v = evaluateSelftest({ outcome: 'ran', stdout: tap(allOk.slice(1)), exitCode: 0 });
    expect(v.held).toBe(false);
    expect(v.reason).toContain(SELFTEST_PROBES[0]);
  });

  test('a not-ok line is a failure', () => {
    const lines = [...allOk];
    lines[2] = `not ok 3 - ${SELFTEST_PROBES[2]}`;
    const v = evaluateSelftest({ outcome: 'ran', stdout: tap(lines), exitCode: 1 });
    expect(v.held).toBe(false);
    expect(v.probes[2].held).toBe(false);
  });

  test('a build error proves nothing', () => {
    const v = evaluateSelftest({ outcome: 'build-error', stdout: '', exitCode: 1 });
    expect(v.held).toBe(false);
    expect(v.reason).toContain('did not run');
  });

  test('ok lines with a failing exit code are not a pass', () => {
    const v = evaluateSelftest({ outcome: 'ran', stdout: tap(allOk), exitCode: 2 });
    expect(v.held).toBe(false);
  });

  test('the suite names exactly the probes the verdict looks for', () => {
    for (const p of SELFTEST_PROBES) expect(RUNNER_SELFTEST_SUITE).toContain(JSON.stringify(p));
    expect(RUNNER_SELFTEST_SUITE.match(/^test\(/gm)?.length).toBe(SELFTEST_PROBES.length);
  });

  test('the admin route takes no code from its caller', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/runner-selftest/route.ts'), 'utf8');
    expect(route).toContain('RUNNER_SELFTEST_SUITE');
    expect(route).not.toMatch(/req\.json\(\)/);
    expect(route).toContain('assertAdminStepUp');
  });
});

test.describe('the network verdict reads the whole expected probe set', () => {
  const answer = (probes: Array<{ target: string; reached: boolean }>) => ({ mode: 'mock', revision: 'r', probes });
  const allUnreached = () => RUNNER_NETWORK_PROBES.map((p) => ({ target: p.label as string, reached: false }));

  test('every expected target, explicitly unreached: held', () => {
    expect(evaluateNetworkProbe(answer(allUnreached()))).toEqual({ held: true, reason: null });
  });

  test('a missing probe is not held, even if the rest are unreached', () => {
    const v = evaluateNetworkProbe(answer(allUnreached().slice(1)));
    expect(v.held).toBe(false);
    expect(v.reason).toContain(RUNNER_NETWORK_PROBES[0].label);
  });

  test('a single unreached probe is not the set', () => {
    expect(evaluateNetworkProbe(answer([{ target: 'anything', reached: false }])).held).toBe(false);
  });

  test('an extra or repeated target is not held', () => {
    expect(evaluateNetworkProbe(answer([...allUnreached(), { target: 'other', reached: false }])).held).toBe(false);
    const rep = allUnreached();
    rep[1] = { ...rep[0] };
    expect(evaluateNetworkProbe(answer(rep)).held).toBe(false);
  });

  test('a reached probe, or one without an explicit false, is not held', () => {
    const r = allUnreached();
    r[2] = { ...r[2], reached: true };
    expect(evaluateNetworkProbe(answer(r)).held).toBe(false);
    const u = allUnreached().map((p, i) => (i === 0 ? { target: p.target } : p));
    expect(evaluateNetworkProbe({ probes: u }).held).toBe(false);
  });

  test('no probe list is not held', () => {
    expect(evaluateNetworkProbe({}).held).toBe(false);
    expect(evaluateNetworkProbe(null).held).toBe(false);
  });

  test('the runner server probes exactly the shared list', () => {
    const server = fs.readFileSync(path.join(process.cwd(), 'runner/server.ts'), 'utf8');
    expect(server).toContain('for (const p of RUNNER_NETWORK_PROBES)');
    expect(server).not.toMatch(/label:\s*'/);
    for (const p of RUNNER_NETWORK_PROBES) expect(server).not.toContain(`'${p.host}'`);
  });
});

test.describe('the overall result', () => {
  const H = { held: true };
  const N = { held: false };

  test('without the live runner the test is incomplete, never held', () => {
    expect(combineSelftest({ sandbox: H, mockNetwork: H, liveNetwork: null })).toEqual({ status: 'incomplete', held: false });
  });

  test('a failure outranks a missing runner', () => {
    expect(combineSelftest({ sandbox: N, mockNetwork: H, liveNetwork: null }).status).toBe('not-held');
  });

  test('held only when every part ran and held', () => {
    expect(combineSelftest({ sandbox: H, mockNetwork: H, liveNetwork: H })).toEqual({ status: 'held', held: true });
    expect(combineSelftest({ sandbox: H, mockNetwork: H, liveNetwork: N }).held).toBe(false);
    expect(combineSelftest({ sandbox: H, mockNetwork: N, liveNetwork: H }).held).toBe(false);
  });

  test('the admin route decides with these functions', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/runner-selftest/route.ts'), 'utf8');
    expect(route).toContain('evaluateNetworkProbe(body)');
    expect(route).toContain('combineSelftest(');
    expect(route).not.toMatch(/liveNetwork === null \|\|/);
  });
});

test.describe('the suite can fail', () => {
  test('without the sandbox and with a secret-named variable, the environment probe goes red', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-selftest-'));
    try {
      const file = path.join(dir, RUNNER_SELFTEST_FILE);
      fs.writeFileSync(file, RUNNER_SELFTEST_SUITE);
      const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
        env: { PATH: process.env.PATH ?? '', SELFTEST_FAKE_SECRET: 'not-a-real-secret' } as unknown as NodeJS.ProcessEnv,
        encoding: 'utf8',
        timeout: 60_000,
      });
      const v = evaluateSelftest({ outcome: 'ran', stdout: r.stdout ?? '', exitCode: r.status ?? 1 });
      expect(v.held).toBe(false);
      expect(v.probes.find((p) => p.probe === SELFTEST_PROBES[0])?.held).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('the local execution core holds the probes', () => {
  test('every probe holds inside the sandbox the runner uses', async () => {
    test.setTimeout(120_000);
    const outcome = await executeSandboxRun({
      files: [],
      suiteCode: RUNNER_SELFTEST_SUITE,
      patterns: [],
      allowUnsandboxed: false,
    });
    test.skip(outcome.kind === 'unavailable', 'This Node has no permission model; the runner image does.');
    expect(outcome.kind).toBe('ran');
    if (outcome.kind !== 'ran') return;
    const v = evaluateSelftest({ outcome: 'ran', stdout: outcome.stdout, exitCode: outcome.exitCode });
    expect(v.reason, outcome.stdout.slice(0, 2000)).toBeNull();
    expect(v.held).toBe(true);
  });
});

test.describe('against the deployment (authorized, operator-run)', () => {
  const appUrl = process.env.RUNNER_SELFTEST_APP_URL;
  const adminToken = process.env.RUNNER_SELFTEST_ADMIN_TOKEN;

  test('the deployed runners reach no foreign file, no secret and none of the probed destinations', async ({ request }) => {
    test.skip(!appUrl || !adminToken, 'Set RUNNER_SELFTEST_APP_URL and RUNNER_SELFTEST_ADMIN_TOKEN (SECURITY.md §7) to run against the deployment.');
    test.setTimeout(180_000);
    const res = await request.post(`${appUrl}/api/admin/runner-selftest`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = (await res.json()) as {
      held?: boolean;
      status?: string;
      sandbox?: { held: boolean; reason: string | null };
      network?: { mock: { held: boolean; detail: unknown }; live: { held: boolean; detail: unknown } | null };
    };
    expect(res.status(), JSON.stringify(body).slice(0, 2000)).toBe(200);
    expect(body.sandbox?.held, body.sandbox?.reason ?? '').toBe(true);
    expect(body.network?.mock.held, JSON.stringify(body.network?.mock.detail)).toBe(true);
    // The live runner is what the reopening condition is about: an answer
    // without its probe is incomplete, not a pass.
    expect(body.network?.live, 'The live runner was not probed (RUNNER_LIVE_URL unset on the deployment).').not.toBeNull();
    expect(body.network?.live?.held, JSON.stringify(body.network?.live?.detail)).toBe(true);
    expect(body.status).toBe('held');
    expect(body.held).toBe(true);
  });
});

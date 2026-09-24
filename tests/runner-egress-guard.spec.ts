/**
 * E08-F01-US02 — an insufficiently isolated runner can be switched off, and
 * cannot be switched back on by an environment variable alone.
 *
 * The acceptance criterion this pins, from the roadmap:
 *
 *   "Bei deaktiviertem oder nicht attestiertem Runner lehnt die API neue
 *    Ausführungen serverseitig ab. Ein Frontend-Flag oder das bloße Setzen
 *    einer Egress-Umgebungsvariable aktiviert ihn nicht."
 *
 * History: `S4_TEST_RUNNER_EGRESS_ENFORCED=true` was once the whole gate — it
 * put decrypted tenant credentials into a child process of the API service and
 * deleted `__netguard.mjs`. A probe of two addresses (`runner-egress-attestation`)
 * then stood between the variable and the credentials. Roadmap 8.9 removed both:
 * a live run executes in the isolated live runner, which never receives a
 * credential, and the variable is read by nothing. This spec holds that, and
 * runs the network guard every sandbox child still gets.
 */
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { pathToFileURL } from 'url';
import { netGuardSource } from '../lib/test-sandbox/net-guard';
import { resolveRunnerTarget, type RunnerConfig } from '../lib/test-runner-client';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!['node_modules', '.next', 'generated'].includes(e.name)) walk(rel, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const FULL: RunnerConfig = {
  runnerUrl: 'https://runner.example.run.app',
  runnerLiveUrl: 'https://runner-live.example.run.app',
  runnerServiceAccount: 'runner@example.iam.gserviceaccount.com',
  proxyBaseUrl: 'https://app.example.run.app',
  proxyKeyPresent: true,
  emulator: false,
};

test.describe('no variable opens the live path', () => {
  test('nothing in the product reads the old switch, and the probe that stood behind it is gone', () => {
    const readers = [...walk('app'), ...walk('lib'), ...walk('runner'), ...walk('hooks'), ...walk('components')].filter((f) =>
      read(f).includes('S4_TEST_RUNNER_EGRESS_ENFORCED'),
    );
    // lib/locked-paths.ts names the switch in a comment that says it is gone.
    expect(readers.filter((f) => f !== 'lib/locked-paths.ts'), 'a file reads the retired switch again').toEqual([]);
    expect(fs.existsSync(path.resolve(ROOT, 'lib/runner-egress-attestation.ts')), 'the two-address probe came back').toBe(false);
  });

  test('a live run needs the live runner and the proxy — each one missing refuses, the emulator never runs it locally', () => {
    expect(resolveRunnerTarget('live', FULL)).toEqual({ kind: 'isolated', url: 'https://runner-live.example.run.app' });
    for (const missing of ['runnerLiveUrl', 'runnerServiceAccount', 'proxyBaseUrl'] as const) {
      const t = resolveRunnerTarget('live', { ...FULL, [missing]: '' });
      expect(t.kind, `${missing} missing`).toBe('unavailable');
    }
    expect(resolveRunnerTarget('live', { ...FULL, proxyKeyPresent: false }).kind).toBe('unavailable');
    // Under the emulator too: there is no local live path at all.
    expect(resolveRunnerTarget('live', { ...FULL, runnerLiveUrl: '', emulator: true }).kind).toBe('unavailable');
    // An http URL is not a runner.
    expect(resolveRunnerTarget('live', { ...FULL, runnerLiveUrl: 'http://runner-live.example' }).kind).toBe('unavailable');
  });

  test('no decrypted credential goes into any child environment', () => {
    const route = read('app/api/run-tests/route.ts');
    for (const name of ['S4_PASSWORD', 'S4_USERNAME', '...s4Env', 'childEnv']) {
      expect(route, `the route builds a child environment with ${name} again`).not.toContain(name);
    }
    // The runner hands the child the relay address and empty credential slots.
    const server = read('runner/server.ts');
    expect(server).toContain("S4_PASSWORD: ''");
    expect(server).toContain("S4_USERNAME: ''");
    expect(server).not.toMatch(/process\.env\.(S4_|GEMINI|AUDIT|RESEND|MFA|PILOT|RATE)/);
  });
});

test.describe('the network guard is never removed', () => {
  test('the core writes and preloads it on every run', () => {
    const core = read('lib/test-sandbox/core.ts');
    expect(core).not.toContain('applyNetGuard');
    expect(core).toContain("path.join(testDir, '__netguard.mjs')");
    expect(core).toContain('netGuardSource(input.loopback ?? null)');
    // Pushed without a condition around it.
    const line = core.split(/\r?\n/).find((l) => l.includes('args.push(`--import=${pathToFileURL(netGuardPath).href}`)'));
    expect(line, 'the guard is no longer preloaded').toBeDefined();
    expect(line!.trim().startsWith('args.push'), 'the preload became conditional').toBe(true);
  });

  test('the loopback shape opens one IP literal and one port, nothing else', () => {
    expect(() => netGuardSource({ host: '127.0.0.1', port: 0 })).toThrow();
    expect(() => netGuardSource({ host: 'localhost' as '127.0.0.1', port: 8080 })).toThrow();
    const src = netGuardSource({ host: '127.0.0.1', port: 4321 });
    const body = src.match(/function allowed\(t\) \{[\s\S]*?\n\}/);
    expect(body, 'the allowed() gate was not found in the guard').not.toBeNull();
    // Lifted from the shipped text, so this measures what the child gets.
    const allowed = new Function('ALLOW', `${body![0]}\nreturn allowed;`)({ host: '127.0.0.1', port: 4321 });
    expect(allowed({ host: '127.0.0.1', port: 4321 })).toBe(true);
    for (const t of [
      { host: '127.0.0.1', port: 4322 },
      { host: 'localhost', port: 4321 },
      { host: '169.254.169.254', port: 80 },
      { host: 'metadata.google.internal', port: 80 },
      { host: '127.0.0.1.evil.example', port: 4321 },
      { host: '', port: 4321 },
    ]) {
      expect(allowed(t), JSON.stringify(t)).toBe(false);
    }
  });
});

/**
 * The guard, executed in a child Node the way the core preloads it. The probe
 * reports what each path did; the parent serves the one loopback port.
 */
const PROBE = `
import net from 'node:net';
import dns from 'node:dns';
import dgram from 'node:dgram';
const out = {};
const port = Number(process.env.ALLOWED_PORT);
const tryIt = async (name, fn) => { try { const v = await fn(); out[name] = v === undefined ? 'ok' : String(v); } catch (e) { out[name] = 'blocked: ' + String(e && e.message || e).slice(0, 80); } };
await tryIt('metadataTcp', () => new Promise((res, rej) => { const s = net.connect(80, '169.254.169.254'); s.on('connect', () => { s.destroy(); res('connected'); }); s.on('error', rej); }));
await tryIt('otherLoopbackPort', () => new Promise((res, rej) => { const s = net.connect(port + 1, '127.0.0.1'); s.on('connect', () => { s.destroy(); res('connected'); }); s.on('error', rej); }));
await tryIt('localhostName', () => new Promise((res, rej) => { const s = net.connect({ host: 'localhost', port }); s.on('connect', () => { s.destroy(); res('connected'); }); s.on('error', rej); }));
await tryIt('dnsLookup', () => new Promise((res, rej) => dns.lookup('example.com', (e, a) => e ? rej(e) : res(a))));
await tryIt('dnsPromises', () => dns.promises.resolve4('example.com'));
await tryIt('udp', () => dgram.createSocket('udp4'));
await tryIt('fetchMetadata', async () => (await fetch('http://169.254.169.254/computeMetadata/v1/')).status);
await tryIt('fetchAllowed', async () => port ? (await (await fetch('http://127.0.0.1:' + port + '/x')).text()) : 'no port');
process.stdout.write(JSON.stringify(out));
`;

function runGuarded(allowPort: number | null): Promise<Record<string, string>> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-netguard-'));
  const guard = path.join(dir, '__netguard.mjs');
  const probe = path.join(dir, 'probe.mjs');
  fs.writeFileSync(guard, netGuardSource(allowPort ? { host: '127.0.0.1', port: allowPort } : null));
  fs.writeFileSync(probe, PROBE);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`--import=${pathToFileURL(guard).href}`, probe], {
      env: { PATH: process.env.PATH || '', SYSTEMROOT: process.env.SYSTEMROOT || '', ALLOWED_PORT: String(allowPort ?? 0) } as unknown as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d));
    child.stderr.on('data', (d: Buffer) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('close', () => {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`probe wrote no JSON: ${stderr.slice(0, 400)}`));
      }
    });
  });
}

test.describe('the guard, executed', () => {
  test('closed: no TCP, no DNS, no UDP, no fetch', async () => {
    const out = await runGuarded(null);
    for (const key of ['metadataTcp', 'otherLoopbackPort', 'localhostName', 'dnsLookup', 'dnsPromises', 'udp', 'fetchMetadata']) {
      expect(out[key], `${key}: ${out[key]}`).toMatch(/^blocked/);
    }
  });

  test('loopback: the relay port answers, every other destination is still refused', async () => {
    const server = http.createServer((_req, res) => res.end('relay-ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    try {
      const out = await runGuarded(port);
      expect(out.fetchAllowed, JSON.stringify(out)).toBe('relay-ok');
      for (const key of ['metadataTcp', 'otherLoopbackPort', 'localhostName', 'dnsLookup', 'dnsPromises', 'udp', 'fetchMetadata']) {
        expect(out[key], `${key}: ${out[key]}`).toMatch(/^blocked/);
      }
    } finally {
      server.close();
    }
  });
});

test.describe('the honest limits are written down, not implied', () => {
  test('the guard says it is not the boundary, and names what is', () => {
    const src = read('lib/test-sandbox/net-guard.ts');
    expect(src).toMatch(/not: an isolation boundary|not an isolation boundary/i);
    expect(src).toMatch(/VPC without NAT/);
  });
});

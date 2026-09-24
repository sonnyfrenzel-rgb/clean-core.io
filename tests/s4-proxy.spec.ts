/**
 * Roadmap 8.9 — the credential proxy of live test runs, driven end to end with
 * a mocked `fetch` and no server: who may call it, what it forwards where, and
 * what never leaves it. Plus the Google ID-token check it relies on, against a
 * key generated here.
 */
import { test, expect } from '@playwright/test';
import { generateKeyPairSync, createSign } from 'crypto';
import fs from 'fs';
import path from 'path';
import { handleS4ProxyRequest, tenantTarget, scrubSecrets, readS4ProxyConfig, type S4ProxyDeps, type ForwardInit } from '../lib/s4-proxy';
import { mintCapability, capabilityKeyFromEnv } from '../lib/s4-proxy-capability';
import { verifyGoogleIdToken, bearerToken } from '../lib/google-id-token';
import type { S4ConfigResolved } from '../lib/s4-credentials';

const KEY = capabilityKeyFromEnv({ S4_ENCRYPTION_KEY: Buffer.alloc(32, 'proxy-spec').toString('base64') });
const HOST = 'my-tenant.s4hana.cloud.sap';
const PASSWORD = 'Tenant-Password-1234';
const CONNECTION: S4ConfigResolved = { url: `https://${HOST}`, username: 'TESTUSER', password: PASSWORD, authType: 'basic' };
const APP = 'https://clean-core-app.example.run.app';
const RUNNER_SA = 'clean-core-runner@example.iam.gserviceaccount.com';

interface Recorder {
  forwarded: Array<{ url: string; init: ForwardInit }>;
  logged: string[];
}

function setup(over: Partial<S4ProxyDeps> = {}, upstream?: () => Response) {
  const rec: Recorder = { forwarded: [], logged: [] };
  const { token, claims } = mintCapability({ pid: 'proj_1', uid: 'uidA1b2', host: HOST, run: 'run0001' }, KEY);
  const deps: S4ProxyDeps = {
    config: { audience: APP, runnerEmail: RUNNER_SA },
    verifyIdToken: async (t, expected) =>
      t === 'good-runner-token' && expected.audience === APP && expected.email === RUNNER_SA ? { ok: true, email: RUNNER_SA } : { ok: false, reason: 'no' },
    capabilityKey: () => KEY,
    admit: async (c) => (c.cid === claims.cid ? { ok: true } : { ok: false, reason: 'unknown' }),
    assertTenantAccess: async () => undefined,
    loadConnection: async () => CONNECTION,
    forward: async (url, init) => {
      rec.forwarded.push({ url, init });
      return upstream
        ? upstream()
        : new Response(`{"d":{"results":[]},"echo":"${PASSWORD}"}`, {
            status: 200,
            headers: { 'content-type': 'application/json', 'set-cookie': 'SAP_SESSIONID=abc', 'www-authenticate': 'Basic realm="x"', 'x-internal': 'y' },
          });
    },
    now: () => Date.now(),
    log: (m, f) => rec.logged.push(`${m} ${JSON.stringify(f)}`),
    ...over,
  };
  return { deps, token, claims, rec };
}

function req(pathAndQuery: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`${APP}/api/s4-proxy/CAP${pathAndQuery}`, {
    method,
    headers: { authorization: 'Bearer good-runner-token', ...headers },
  });
}

const segs = (p: string) => p.split('?')[0].split('/').filter(Boolean);

test.describe('the happy path puts the credentials on, and nothing else', () => {
  test('forwards to the capability host with the stored credentials; runner headers do not reach the tenant', async () => {
    const { deps, token, rec } = setup();
    const res = await handleS4ProxyRequest(
      req('/sap/opu/odata/sap/API_X/$metadata?$top=1&sap-client=100', {
        accept: 'application/json',
        cookie: 'stolen=1',
        'x-forwarded-for': '10.0.0.1',
        apikey: 'runner-supplied',
      }),
      { capability: token, path: ['sap', 'opu', 'odata', 'sap', 'API_X', '$metadata'] },
      deps,
    );
    expect(res.status).toBe(200);
    expect(rec.forwarded).toHaveLength(1);
    const { url, init } = rec.forwarded[0];
    expect(url).toBe(`https://${HOST}/sap/opu/odata/sap/API_X/$metadata?$top=1&sap-client=100`);
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from(`TESTUSER:${PASSWORD}`).toString('base64')}`);
    expect(init.headers.accept).toBe('application/json');
    for (const dropped of ['cookie', 'x-forwarded-for', 'apikey']) expect(init.headers[dropped], dropped).toBeUndefined();
    // The runner's own Authorization (its Google ID token) is not what reached the tenant.
    expect(init.headers.authorization).not.toContain('good-runner-token');

    // The answer: allowlisted headers, the credential scrubbed out of the body.
    expect(res.headers.get('content-type')).toBe('application/json');
    for (const h of ['set-cookie', 'www-authenticate', 'x-internal']) expect(res.headers.get(h), h).toBeNull();
    const body = await res.text();
    expect(body).not.toContain(PASSWORD);
    expect(body).toContain('[redacted]');
    // And nothing credential-shaped went to the log.
    expect(rec.logged.join('\n')).not.toMatch(new RegExp(`${PASSWORD}|Basic |TESTUSER`));
  });

  test('HEAD is forwarded without a body; an API key scheme travels as its own header', async () => {
    const { deps, token, rec } = setup({ loadConnection: async () => ({ url: `https://${HOST}`, password: 'hub-key-12345', authType: 'sap_hub' }) });
    const res = await handleS4ProxyRequest(req('/sap/opu/x', {}, 'HEAD'), { capability: token, path: ['sap', 'opu', 'x'] }, deps);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(rec.forwarded[0].init.headers.apikey).toBe('hub-key-12345');
    expect(rec.forwarded[0].init.headers.authorization).toBeUndefined();
  });
});

test.describe('who may call', () => {
  const P = ['sap', 'opu', 'x'];
  test('not configured → 503, before anything is looked at', async () => {
    const { deps, token, rec } = setup({ config: null });
    expect((await handleS4ProxyRequest(req('/sap/opu/x'), { capability: token, path: P }, deps)).status).toBe(503);
    expect(rec.forwarded).toHaveLength(0);
    expect(readS4ProxyConfig({})).toBeNull();
    expect(readS4ProxyConfig({ S4_PROXY_BASE_URL: 'http://x', RUNNER_SERVICE_ACCOUNT: RUNNER_SA })).toBeNull();
    expect(readS4ProxyConfig({ S4_PROXY_BASE_URL: `${APP}/`, RUNNER_SERVICE_ACCOUNT: RUNNER_SA })).toEqual({ audience: APP, runnerEmail: RUNNER_SA });
  });

  test('no token, a wrong token → 401; a bad or foreign capability → 403; a write → 405', async () => {
    const { deps, token, rec } = setup();
    const noAuth = new Request(`${APP}/api/s4-proxy/CAP/sap/opu/x`);
    expect((await handleS4ProxyRequest(noAuth, { capability: token, path: P }, deps)).status).toBe(401);
    expect((await handleS4ProxyRequest(req('/sap/opu/x', { authorization: 'Bearer other' }), { capability: token, path: P }, deps)).status).toBe(401);
    expect((await handleS4ProxyRequest(req('/sap/opu/x'), { capability: token.slice(0, -2) + 'xx', path: P }, deps)).status).toBe(403);
    const foreign = mintCapability({ pid: 'proj_1', uid: 'uidA1b2', host: HOST, run: 'run0001' }, KEY).token;
    expect((await handleS4ProxyRequest(req('/sap/opu/x'), { capability: foreign, path: P }, deps)).status, 'a capability of no running run').toBe(403);
    expect((await handleS4ProxyRequest(req('/sap/opu/x', {}, 'POST'), { capability: token, path: P }, deps)).status).toBe(405);
    expect(rec.forwarded).toHaveLength(0);
  });

  test('a revoked tenant approval, a missing connection, an unsupported scheme → refused, nothing forwarded', async () => {
    const P2 = { path: P };
    const revoked = setup({ assertTenantAccess: async () => { throw Object.assign(new Error('suspended'), { status: 403 }); } });
    expect((await handleS4ProxyRequest(req('/sap/opu/x'), { capability: revoked.token, ...P2 }, revoked.deps)).status).toBe(403);
    const none = setup({ loadConnection: async () => null });
    expect((await handleS4ProxyRequest(req('/sap/opu/x'), { capability: none.token, ...P2 }, none.deps)).status).toBe(403);
    const oauth = setup({ loadConnection: async () => ({ ...CONNECTION, authType: 'oauth2', tokenUrl: 'https://token.example' }) });
    expect((await handleS4ProxyRequest(req('/sap/opu/x'), { capability: oauth.token, ...P2 }, oauth.deps)).status).toBe(501);
    for (const s of [revoked, none, oauth]) expect(s.rec.forwarded).toHaveLength(0);
  });
});

test.describe('where it forwards', () => {
  test('only the capability host: a stored connection moved elsewhere is refused', async () => {
    const moved = setup({ loadConnection: async () => ({ ...CONNECTION, url: 'https://other-tenant.s4hana.cloud.sap' }) });
    expect((await handleS4ProxyRequest(req('/sap/opu/x'), { capability: moved.token, path: ['sap', 'opu', 'x'] }, moved.deps)).status).toBe(403);
    expect(moved.rec.forwarded).toHaveLength(0);
  });

  test('paths stay below /sap/ and cannot climb or smuggle a host', () => {
    const ok = tenantTarget(`https://${HOST}`, HOST, segs('/sap/opu/odata/sap/API_X/A_Entity(\'1\')'), '');
    expect(ok).toEqual({ url: `https://${HOST}/sap/opu/odata/sap/API_X/A_Entity('1')` });
    for (const p of [['sap'], ['other', 'x'], ['sap', '..', 'x'], ['sap', '.', 'x'], ['sap', 'a/b'], ['sap', 'a\\b'], ['sap', ''], ['sap', 'a\u0000']]) {
      expect('error' in tenantTarget(`https://${HOST}`, HOST, p, ''), JSON.stringify(p)).toBe(true);
    }
    // Characters that would change the authority in a hand-built URL are only path here.
    for (const p of [['sap', '@evil.example'], ['sap', '%2F%2Fevil.example'], ['sap', 'x:y@evil.example']]) {
      const t = tenantTarget(`https://${HOST}`, HOST, p, '');
      expect('url' in t && new URL(t.url).hostname, JSON.stringify(p)).toBe(HOST);
    }
    expect('error' in tenantTarget(`http://${HOST}`, HOST, ['sap', 'x'], '')).toBe(true);
    expect('error' in tenantTarget(`https://${HOST}`, HOST, ['sap', 'x'], '?a=' + 'x'.repeat(5000))).toBe(true);
  });

  test('a redirect is not followed and its location does not come back', async () => {
    const { deps, token, rec } = setup({}, () => new Response(null, { status: 302, headers: { location: 'https://attacker.example/steal' } }));
    const res = await handleS4ProxyRequest(req('/sap/opu/x'), { capability: token, path: ['sap', 'opu', 'x'] }, deps);
    expect(res.status).toBe(502);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).not.toContain('attacker.example');
    expect(rec.forwarded).toHaveLength(1);
  });

  test('an oversized answer is refused', async () => {
    const big = 'x'.repeat(9 * 1024 * 1024);
    const { deps, token } = setup({}, () => new Response(big, { status: 200, headers: { 'content-type': 'text/plain' } }));
    const res = await handleS4ProxyRequest(req('/sap/opu/x'), { capability: token, path: ['sap', 'opu', 'x'] }, deps);
    expect(res.status).toBe(502);
  });

  test('scrubbing replaces every credential value, short ones included, longest first', () => {
    expect(scrubSecrets('a SECRETX b SECRETX', ['SECRETX'])).toBe('a [redacted] b [redacted]');
    // No value is silently skipped for being short.
    expect(scrubSecrets('abc', ['ab'])).toBe('[redacted]c');
    // A value inside a longer one does not leave the longer one half-replaced.
    expect(scrubSecrets('x USERPASS y USER', ['USER', 'USERPASS'])).toBe('x [redacted] y [redacted]');
    expect(scrubSecrets('abc', ['', 'zz'])).toBe('abc');
  });

  test('the Basic-auth username is scrubbed from the answer', async () => {
    const { deps, token } = setup({}, () => new Response('{"CreatedByUser":"TESTUSER"}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = await handleS4ProxyRequest(req('/sap/opu/x'), { capability: token, path: ['sap', 'opu', 'x'] }, deps);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"CreatedByUser":"[redacted]"}');
  });

  test('a credential too short to scrub is refused before anything reaches the tenant', async () => {
    for (const conn of [
      { ...CONNECTION, password: 'abc' },
      { ...CONNECTION, username: 'SA' },
      { url: `https://${HOST}`, password: 'k1', authType: 'sap_hub' as const },
    ]) {
      const { deps, token, rec } = setup({ loadConnection: async () => conn });
      const res = await handleS4ProxyRequest(req('/sap/opu/x'), { capability: token, path: ['sap', 'opu', 'x'] }, deps);
      expect(res.status, JSON.stringify(conn)).toBe(422);
      expect(rec.forwarded).toHaveLength(0);
    }
  });

  test('the route forwards through the SSRF-safe fetch and follows no redirect', () => {
    const route = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 's4-proxy', '[capability]', '[...path]', 'route.ts'), 'utf8');
    expect(route).toContain('forward: (url, init) => safeFetch(url, init, 0)');
    expect(route).not.toMatch(/export (async )?function (POST|PUT|PATCH|DELETE)/);
  });
});

test.describe('the Google ID token check', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keys = async () => ({ kid1: pem });
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const NOW = Date.parse('2026-09-24T10:00:00Z');
  const sign = (payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'kid1' }) => {
    const input = `${b64(header)}.${b64(payload)}`;
    const sig = createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${input}.${sig}`;
  };
  const good = { iss: 'https://accounts.google.com', aud: APP, email: RUNNER_SA, email_verified: true, iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000 };
  const expected = { audience: APP, email: RUNNER_SA };
  const check = (t: string) => verifyGoogleIdToken(t, expected, { keys, now: () => NOW });

  test('a token of the runner account for the app audience passes', async () => {
    expect(await check(sign(good))).toEqual({ ok: true, email: RUNNER_SA });
  });

  test('another audience, another account, unverified, expired, foreign issuer, tampered, unknown key, alg none — all refused', async () => {
    const refusals = [
      sign({ ...good, aud: 'https://clean-core-runner.example.run.app' }),
      sign({ ...good, email: 'someone@example.com' }),
      sign({ ...good, email_verified: false }),
      sign({ ...good, exp: NOW / 1000 - 3600 }),
      sign({ ...good, iss: 'https://evil.example' }),
      sign(good, { alg: 'RS256', kid: 'kid2' }),
      `${b64({ alg: 'none', kid: 'kid1' })}.${b64(good)}.`,
    ];
    const t = sign(good).split('.');
    refusals.push(`${t[0]}.${b64({ ...good, email: 'x@example.com' })}.${t[2]}`);
    for (const token of refusals) expect((await check(token)).ok, token.slice(0, 40)).toBe(false);
    expect((await verifyGoogleIdToken(sign(good), { audience: '', email: RUNNER_SA }, { keys })).ok).toBe(false);
  });

  test('only a plain bearer header yields a token', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('Basic abc')).toBe('');
    expect(bearerToken(null)).toBe('');
  });
});

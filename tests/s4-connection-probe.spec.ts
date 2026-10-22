/**
 * Owner decision 17.10.2026 (data protection): testing the connection to a
 * user's S/4HANA system reads no business record.
 *
 * Server-free. The SAP endpoint is a mocked `fetch`: every request the
 * connection test sends is recorded, and every response body is a stream that
 * notes whether anyone pulled from it. What is held here:
 *   - the only URL built is a service's `$metadata` — never an entity set,
 *     never a query option, whatever the saved address says;
 *   - no response body is read, so entity data a misbehaving endpoint sends
 *     back cannot reach the log, Firestore or the browser;
 *   - a rejected credential and an unreachable host are reported as before;
 *   - the route sends nothing to the tenant except through this probe, and the
 *     separate record read stays a separate route.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  connectionProbeTarget,
  probeService,
  describeProbeStatus,
  DEFAULT_PROBE_SERVICE_PATH,
  type ProbeFetch,
} from '../lib/s4-connection-probe';
import { SsrfError } from '../lib/url-validation';

const ROOT = path.resolve(__dirname, '..');
const ENTITY_SENTINEL = 'SENTINEL-BusinessPartner-Name-4711';
const ENTITY_BODY = JSON.stringify({ d: { results: [{ BusinessPartner: '1000001', BusinessPartnerFullName: ENTITY_SENTINEL }] } });

interface Sent { url: string; method: string; headers: Record<string, string> }
interface Answer { status: number; body?: string }

/** A mocked SAP endpoint. Each answer's body records whether it was pulled or cancelled. */
function sapEndpoint(answers: Array<Answer | Error>) {
  const sent: Sent[] = [];
  const bodies: Array<{ pulled: boolean; cancelled: boolean }> = [];
  let i = 0;
  const fetchImpl: ProbeFetch = async (url, init) => {
    sent.push({ url, method: String(init.method), headers: { ...(init.headers as Record<string, string>) } });
    const next = answers[Math.min(i++, answers.length - 1)];
    if (next instanceof Error) throw next;
    const track = { pulled: false, cancelled: false };
    bodies.push(track);
    const payload = new TextEncoder().encode(next.body ?? ENTITY_BODY);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        track.pulled = true;
        controller.enqueue(payload);
        controller.close();
      },
      cancel() {
        track.cancelled = true;
      },
    }, { highWaterMark: 0 });
    return new Response(stream, { status: next.status, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, sent, bodies };
}

function networkError(code: string): Error {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(`connect ${code} 10.0.0.1:443`), { code }) });
}

test.describe('the connection test builds one URL: a service $metadata', () => {
  const cases: Array<[string, string]> = [
    ['https://my000000-api.s4hana.cloud.sap', `https://my000000-api.s4hana.cloud.sap${DEFAULT_PROBE_SERVICE_PATH}/$metadata`],
    ['https://my000000-api.s4hana.cloud.sap/', `https://my000000-api.s4hana.cloud.sap${DEFAULT_PROBE_SERVICE_PATH}/$metadata`],
    ['https://sandbox.api.sap.com/s4hanacloud', `https://sandbox.api.sap.com/s4hanacloud${DEFAULT_PROBE_SERVICE_PATH}/$metadata`],
    // A service URL keeps its service — and loses everything after it.
    ['https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV', 'https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_SALES_ORDER_SRV/$metadata'],
    ['https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner', 'https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata'],
    ['https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=1&$format=json', 'https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata'],
    ["https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner('1000001')/to_Address", 'https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata'],
    ['https://h.s4hana.cloud.sap/?$top=1#frag', `https://h.s4hana.cloud.sap${DEFAULT_PROBE_SERVICE_PATH}/$metadata`],
  ];
  for (const [saved, expected] of cases) {
    test(`${saved} → ${expected}`, () => {
      const t = connectionProbeTarget(saved);
      expect(t.ok).toBe(true);
      if (!t.ok) return;
      expect(t.probeUrl).toBe(expected);
      expect(t.probeUrl).not.toContain('?');
      expect(t.probeUrl).not.toMatch(/A_BusinessPartner|\$top|\$filter|\$format|\(/);
    });
  }

  test('an address it cannot reduce to a service is refused, not guessed at', () => {
    for (const saved of [
      'not a url',
      'http://h.s4hana.cloud.sap',
      'https://h.s4hana.cloud.sap/sap/opu/odata/sap',
      'https://h.s4hana.cloud.sap/sap/opu/odata4/sap/api_bp/srvd_a2x/sap/bp/0001/A_BusinessPartner',
      'https://h.s4hana.cloud.sap/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection',
      "https://h.s4hana.cloud.sap/A_BusinessPartner('1')",
      'https://h.s4hana.cloud.sap/a%2fb',
    ]) {
      expect(connectionProbeTarget(saved).ok, saved).toBe(false);
    }
  });
});

test.describe('the probe reads no body and requests no entity set', () => {
  const PROBE = `https://h.s4hana.cloud.sap${DEFAULT_PROBE_SERVICE_PATH}/$metadata`;

  test('a reachable, signed-in service: one GET on $metadata, body untouched, verdict says what was checked', async () => {
    const sap = sapEndpoint([{ status: 200 }]);
    const { httpStatus } = await probeService(PROBE, { Authorization: 'Basic eDp5', Accept: 'application/json' }, sap.fetchImpl);
    expect(httpStatus).toBe(200);
    expect(sap.sent).toHaveLength(1);
    expect(sap.sent[0].method).toBe('GET');
    expect(sap.sent[0].url).toBe(PROBE);
    expect(sap.sent[0].headers.Accept).toBe('application/xml');
    expect(sap.sent[0].headers.Authorization).toBe('Basic eDp5');
    // Owner specification: no HEAD, no CSRF-token fetch.
    expect(Object.keys(sap.sent[0].headers).map((h) => h.toLowerCase())).not.toContain('x-csrf-token');
    expect(sap.bodies[0]).toEqual({ pulled: false, cancelled: true });

    const verdict = describeProbeStatus(httpStatus, 'basic', DEFAULT_PROBE_SERVICE_PATH);
    expect(verdict.status).toBe('connected');
    expect(verdict.message).toContain('Reachable, signed in via Basic Auth, service API_BUSINESS_PARTNER found and authorised.');
    expect(verdict.message).toContain('Checked: the service description ($metadata, schema only) answered HTTP 200.');
    expect(verdict.message).toContain('No record was read.');
    expect(verdict.checked).toEqual({ reachable: true, signedIn: true, serviceFound: true, servicePath: DEFAULT_PROBE_SERVICE_PATH, recordsRead: false });
  });

  test('one request only: a refusal or a network error is not retried with another method', async () => {
    for (const first of [{ status: 405 }, { status: 501 }, networkError('ECONNRESET')]) {
      const sap = sapEndpoint([first, { status: 200 }]);
      await probeService(PROBE, {}, sap.fetchImpl).catch(() => undefined);
      expect(sap.sent.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${PROBE}`]);
    }
    expect(describeProbeStatus(405, 'basic', DEFAULT_PROBE_SERVICE_PATH).status).toBe('failed');
  });

  test('entity data an endpoint sends anyway never reaches the verdict', async () => {
    const sap = sapEndpoint([{ status: 200, body: ENTITY_BODY }]);
    const { httpStatus } = await probeService(PROBE, {}, sap.fetchImpl);
    const verdict = describeProbeStatus(httpStatus, 'sap_hub', DEFAULT_PROBE_SERVICE_PATH);
    expect(JSON.stringify(verdict)).not.toContain(ENTITY_SENTINEL);
    expect(JSON.stringify(verdict)).not.toContain('1000001');
    expect(sap.bodies.some((b) => b.pulled)).toBe(false);
  });

  test('no request of a whole connection test names an entity set, a count or a query option', async () => {
    for (const saved of [
      'https://h.s4hana.cloud.sap',
      'https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=1&$inlinecount=allpages',
      'https://h.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner/$count',
    ]) {
      const t = connectionProbeTarget(saved);
      expect(t.ok).toBe(true);
      if (!t.ok) continue;
      const sap = sapEndpoint([{ status: 200 }]);
      await probeService(t.probeUrl, {}, sap.fetchImpl);
      expect(sap.sent).toHaveLength(1);
      for (const s of sap.sent) {
        expect(s.method).toBe('GET');
        expect(new URL(s.url).pathname.endsWith('/$metadata')).toBe(true);
        expect(new URL(s.url).search).toBe('');
        expect(s.url).not.toMatch(/A_BusinessPartner|\$count|\$top/);
      }
    }
  });
});

test.describe('failures are reported as before', () => {
  const PROBE = `https://h.s4hana.cloud.sap${DEFAULT_PROBE_SERVICE_PATH}/$metadata`;

  test('a 403 is a refused access, not a rejected credential; a redirect confirms nothing (QA review of 33d378a056fd)', async () => {
    const sap = sapEndpoint([{ status: 403 }]);
    const { httpStatus } = await probeService(PROBE, { Authorization: 'Basic ok' }, sap.fetchImpl);
    const forbidden = describeProbeStatus(httpStatus, 'basic', DEFAULT_PROBE_SERVICE_PATH);
    expect(forbidden.status).toBe('failed');
    expect(forbidden.message).toContain('access to service');
    expect(forbidden.message).not.toContain('credentials were rejected');
    expect(forbidden.checked.signedIn).toBeNull();
    for (const status of [301, 302, 307]) {
      const redirect = describeProbeStatus(status, 'basic', DEFAULT_PROBE_SERVICE_PATH);
      expect(redirect.status, String(status)).toBe('failed');
      expect(redirect.checked.serviceFound).toBe(false);
    }
  });

  test('rejected credentials: reachable, credentials rejected, nothing read', async () => {
    for (const status of [401]) {
      const sap = sapEndpoint([{ status }]);
      const { httpStatus } = await probeService(PROBE, { Authorization: 'Basic bad' }, sap.fetchImpl);
      const verdict = describeProbeStatus(httpStatus, 'basic', DEFAULT_PROBE_SERVICE_PATH);
      expect(verdict.status).toBe('connected');
      expect(verdict.httpStatus).toBe(status);
      expect(verdict.message).toContain(`Endpoint reachable (HTTP ${status}) via Basic Auth. Authentication credentials were rejected — verify your credentials.`);
      expect(verdict.checked.signedIn).toBe(false);
      expect(verdict.checked.recordsRead).toBe(false);
    }
  });

  test('an unreachable host: the network code, no error text', async () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND']) {
      const sap = sapEndpoint([networkError(code)]);
      const err = await probeService(PROBE, {}, sap.fetchImpl).then(() => null, (e: Error) => e);
      expect(err?.message).toBe(`Connection failed (${code}). Verify the URL, network configuration, and firewall rules.`);
      expect(err?.message).not.toContain('10.0.0.1');
    }
  });

  test('an SSRF refusal stays a refusal and is not retried', async () => {
    const sap = sapEndpoint([new SsrfError('Cross-origin redirect refused for a request that carries credentials.')]);
    const err = await probeService(PROBE, { Authorization: 'Basic x' }, sap.fetchImpl).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(SsrfError);
    expect(sap.sent).toHaveLength(1);
  });

  test('a missing service, a server error and anything else fail, saying no record was read', () => {
    const notFound = describeProbeStatus(404, 'oauth2', DEFAULT_PROBE_SERVICE_PATH);
    expect(notFound.status).toBe('failed');
    expect(notFound.message).toContain('HTTP 404');
    expect(notFound.message).toContain(DEFAULT_PROBE_SERVICE_PATH);
    expect(describeProbeStatus(503, 'basic', DEFAULT_PROBE_SERVICE_PATH).status).toBe('failed');
    expect(describeProbeStatus(418, 'basic', DEFAULT_PROBE_SERVICE_PATH).status).toBe('failed');
    for (const s of [404, 503, 418]) {
      expect(describeProbeStatus(s, 'basic', DEFAULT_PROBE_SERVICE_PATH).message).toContain('No record was read.');
    }
  });

  test('without a credential the verdict does not claim a sign-in', () => {
    const v = describeProbeStatus(200, 'none', DEFAULT_PROBE_SERVICE_PATH);
    expect(v.status).toBe('connected');
    expect(v.message).toContain('no credential was sent');
    expect(v.checked.signedIn).toBeNull();
  });
});

test.describe('the route reaches the tenant only through the probe', () => {
  /** The file with its comments taken out, so an explanation cannot satisfy a guard. */
  const code = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('the connection route builds no OData URL of its own and reads no tenant body', () => {
    const src = code('app/api/test-s4-connection/route.ts');
    expect(src).not.toMatch(/\$top|\$inlinecount|\$format|entitySet/);
    expect(src).not.toContain('ODATA_BODY_LIMITS');
    // Both paths (direct and destination) go through the target builder and the probe.
    expect(src.match(/connectionProbeTarget\(/g) || []).toHaveLength(2);
    expect(src.match(/await probeService\(target\.probeUrl, headers\)/g) || []).toHaveLength(2);
    // The only other outbound call is the OAuth token exchange.
    expect(src.match(/safeFetch\(/g) || []).toHaveLength(1);
    expect(src).toContain('safeFetch(tokenUrl,');
  });

  test('the record read stays a separate route behind the same gates', () => {
    const src = code('app/api/test-s4-odata-read/route.ts');
    for (const gate of ['verifyRequestAuth(req)', 'assertMfaSatisfied(req, decodedToken)', 'assertS4TenantAccess(decodedToken.uid', 'assertRateLimit(`test-s4-odata-read:${decodedToken.uid}`']) {
      expect(src, gate).toContain(gate);
    }
    // What it answers: a count and field names, never the record.
    expect(src).not.toMatch(/NextResponse\.json\(\{[^}]*\bresults\b/);
    expect(src).not.toMatch(/\bdata:\s*data\b|record:\s*results\[0\]/);
  });

  test('the interfaces name the check and the read honestly', () => {
    const testing = fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/testing/page.tsx'), 'utf8');
    expect(testing).toContain('reads no record');
    expect(testing).toContain("'Check the entity set in the tenant'");
    expect(testing).not.toContain("'Read records from tenant'");
    const settings = fs.readFileSync(path.join(ROOT, 'app/(app)/settings/page.tsx'), 'utf8');
    expect(settings).toContain('It reads no record.');
  });
});

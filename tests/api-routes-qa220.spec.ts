import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readBoundedJson, readBoundedBody, ResponseLimitError } from '../lib/url-validation';

/**
 * Route-handler findings of the QA full review of v2.20.0 (fc787674705f).
 *
 * Source-level where the property is the shape of the handler (which key a
 * limiter uses, what is read before what, which branch sends a mail); the one
 * mechanism several routes now share — reading a *request* body through the
 * bounded response reader — is exercised on real requests.
 */
const ROOT = path.resolve(__dirname, '..');

/** The file with its comments taken out, so an explanation cannot satisfy a guard. */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const raw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MB = 1024 * 1024;

test.describe('a request body is read under a bound', () => {
  const asResponse = (req: Request) => new Response(req.body, { headers: req.headers });

  test('an oversized request is refused, a small one parses as req.json() would', async () => {
    const big = new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(2 * MB) }) });
    await expect(readBoundedJson(asResponse(big), { maxBytes: 32 * 1024, timeoutMs: 5_000 })).rejects.toBeInstanceOf(ResponseLimitError);

    const small = new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ name: 'A', motivation: 'B' }) });
    expect(await readBoundedJson(asResponse(small), { maxBytes: 32 * 1024, timeoutMs: 5_000 })).toEqual({ name: 'A', motivation: 'B' });
  });

  test('a declared length above the bound is refused before the body is read', async () => {
    const req = new Request('http://localhost/x', {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': String(9 * MB) },
    });
    await expect(readBoundedBody(asResponse(req), { maxBytes: 256 * 1024, timeoutMs: 5_000 })).rejects.toThrow(/9437184 bytes/);
  });

  test('the webhook text is the same string req.text() returns, BOM included', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"type":"email.sent"}')]);
    const a = new Request('http://localhost/x', { method: 'POST', body: bytes });
    const b = new Request('http://localhost/x', { method: 'POST', body: bytes });
    expect(await readBoundedBody(asResponse(a), { maxBytes: 256 * 1024, timeoutMs: 5_000 })).toBe(await b.text());
  });

  for (const [rel, marker] of [
    ['app/api/request-tenant-access/route.ts', 'body = await readBoundedJson(new Response(request.body'],
    ['app/api/run-tests/route.ts', 'runRequest = await readBoundedJson(new Response(req.body'],
    ['app/api/unsubscribe/route.ts', 'await readBoundedBody(req, BODY_LIMITS)'],
    ['app/api/webhooks/resend/route.ts', 'body = await readBoundedBody(new Response(req.body'],
  ] as const) {
    test(`${rel} reads its body through the bounded reader only`, () => {
      const src = code(rel);
      expect(src).toContain(marker);
      expect(src, `${rel} still buffers the whole request`).not.toMatch(/\b(req|request)\.(json|text)\(\)/);
    });
  }

  test('run-tests refuses more selected cases than the runner accepts', () => {
    const src = code('app/api/run-tests/route.ts');
    expect(src).toMatch(/selectedTestIds\.length > MAX_RUN_PATTERNS/);
  });
});

test.describe('request-tenant-access', () => {
  const REL = 'app/api/request-tenant-access/route.ts';

  test('the limit is per account, not per account and address', () => {
    const src = code(REL);
    const call = src.match(/assertRateLimit\(\s*`([^`]+)`/);
    expect(call).not.toBeNull();
    expect(call![1]).toContain('${decodedToken.uid}');
    expect(call![1]).not.toContain('getClientIp');
  });

  test('the fields are cut before they are escaped into the mail', () => {
    const src = code(REL);
    expect(src).toMatch(/escapeHtml\(String\(body\?\.name[^\n]*\.slice\(0, MAX_NAME_CHARS\)\)/);
    expect(src).toMatch(/escapeHtml\(String\(body\?\.motivation[^\n]*\.slice\(0, MAX_MOTIVATION_CHARS\)\)/);
  });

  test('the applicant is told "under review" only when an administrator holds the request', () => {
    const src = code(REL);
    const pending = src.indexOf('buildTenantPendingEmail(');
    expect(pending).toBeGreaterThan(-1);
    const gate = src.lastIndexOf('if (adminNotified) {', pending);
    expect(gate, 'the applicant mail is sent whether or not the administrator was notified').toBeGreaterThan(-1);
    // And the gate is the one right before the applicant block, not an earlier one.
    expect(src.slice(gate, pending)).not.toContain('api.resend.com');
  });
});

test.describe('the tenant mail routes report only what they did', () => {
  for (const rel of ['app/api/send-tenant-approval-email/route.ts', 'app/api/send-tenant-revoke-email/route.ts']) {
    test(`${rel} does not claim the access change was not applied`, () => {
      // The admin console applies the change first and then shows this error
      // after "Tenant access was changed, but ...".
      expect(raw(rel)).not.toContain('The change was not applied');
    });
  }

  test('the welcome-mail route carries no verdict about a review', () => {
    expect(raw('app/api/send-approval-email/route.ts')).not.toMatch(/Reported as `not_met`/);
  });
});

test.describe('the tenant connection check', () => {
  const REL = 'app/api/test-s4-connection/route.ts';

  test('is metered per account before the body is read', () => {
    const src = code(REL);
    const call = src.match(/assertRateLimit\(\s*`([^`]+)`\s*,\s*(\d+)/);
    expect(call).not.toBeNull();
    expect(call![1]).toContain('${decodedToken.uid}');
    expect(Number(call![2])).toBeLessThanOrEqual(60);
    expect(src.indexOf('assertRateLimit(')).toBeLessThan(src.indexOf('await req.json()'));
  });

  test('cancels every response body it does not read', () => {
    const src = code(REL);
    const fallback = src.indexOf('response.status === 405 || response.status === 501');
    const refetch = src.indexOf("method: 'GET'", fallback);
    expect(src.slice(fallback, refetch)).toContain('response.body?.cancel()');
    const ret = src.indexOf('return { httpStatus: response.status }');
    const lastCancel = src.lastIndexOf('response.body?.cancel()', ret);
    expect(lastCancel).toBeGreaterThan(refetch);
    // Cancelled while the deadline is still armed.
    expect(lastCancel).toBeLessThan(src.lastIndexOf('clearTimeout(timeout)', ret));
  });

  test('refuses a declared scheme without its credential instead of testing anonymously', () => {
    const src = code(REL);
    expect(src).not.toMatch(/authType === 'basic' && username && password/);
    expect(src).not.toMatch(/authType === 'sap_hub' && password/);
    expect(src).toMatch(/authType === 'basic'\) \{\s*if \(!username \|\| !password\)/);
    expect(src).toMatch(/authType === 'sap_hub'\) \{\s*if \(!password\)/);
    expect(src).not.toContain("authType || 'basic'");
  });
});

test.describe('the OData read', () => {
  const REL = 'app/api/test-s4-odata-read/route.ts';

  test('is metered per account before the body is read', () => {
    const src = code(REL);
    const call = src.match(/assertRateLimit\(\s*`([^`]+)`\s*,\s*(\d+)/);
    expect(call).not.toBeNull();
    expect(call![1]).toContain('${decodedToken.uid}');
    expect(Number(call![2])).toBeLessThanOrEqual(60);
    expect(src.indexOf('assertRateLimit(')).toBeLessThan(src.indexOf('await req.json()'));
  });

  test('never continues a declared scheme without its credential', () => {
    const src = code(REL);
    expect(src, 'a scheme adds its header only when the credential happens to be there').not.toMatch(/if \((user && pass|tokenData\.access_token|tokenUrl && clientId && clientSecret)\)/);
    expect(src).not.toMatch(/authType === '(basic|oauth2|sap_hub)' &&/);
    expect(src.match(/requireAccessToken\(await fetchOAuth2Token\(/g) || []).toHaveLength(2);
  });

  test('cancels the body of a refused read', () => {
    const src = code(REL);
    const notOk = src.indexOf('if (!response.ok) {', src.indexOf('safeFetch(readUrl'));
    expect(notOk).toBeGreaterThan(-1);
    const answer = src.indexOf('return NextResponse.json(', notOk);
    expect(src.slice(notOk, answer)).toContain('response.body?.cancel()');
  });
});

test.describe('the Resend webhook', () => {
  const REL = 'app/api/webhooks/resend/route.ts';

  test('does not acknowledge an event it could not store', () => {
    const src = code(REL);
    const record = src.indexOf('await recordEmailEvent(');
    const tryAt = src.lastIndexOf('try {', record);
    const handler = src.indexOf('} catch (storeErr)', record);
    expect(handler, 'a storage failure is not handled on its own').toBeGreaterThan(record);
    expect(src.slice(tryAt, record)).not.toContain('JSON.parse');
    expect(src.slice(handler, handler + 400)).toContain('{ status: 503 }');
  });

  test('keeps the recipient and the provider detail out of the log', () => {
    const src = code(REL);
    const at = src.indexOf("'email did not reach the recipient'");
    const block = src.slice(at, src.indexOf('});', at));
    expect(block).not.toMatch(/\bto\b\s*:/);
    expect(block).not.toMatch(/\bdetail\b/);
  });
});

test('the workspace switch does not report a landed write as failed', () => {
  const src = code('app/api/workspace-shell/route.ts');
  const post = src.slice(src.indexOf('export async function POST'));
  expect(post).not.toContain('...(await answerFor(uid))');
  expect(post).toMatch(/answerFor\(uid\)\.catch\(/);
});

test('the workspace switch reads its body through ?. so a JSON null is the 400, not a 500', () => {
  // Carried QA finding 8c778be1d34d. The POST is admin-only, which the emulator
  // suite cannot sign in as; the behaviour itself is covered for the same
  // shape on /api/model-stages (tests/process-naming-route.spec.ts).
  const post = code('app/api/workspace-shell/route.ts');
  expect(post).toContain('(body as { enabled?: unknown } | null)?.enabled');
  expect(post).not.toContain('(body as { enabled?: unknown }).enabled');
});

test('the mock purchase-order route is never served in production and says it is a simulation', () => {
  const src = code('app/api/v1/purchase-orders/mass-create/route.ts');
  expect(src).not.toContain('ENABLE_MOCK_PO_ROUTE');
  expect(src).toMatch(/if \(process\.env\.NODE_ENV === 'production'\) \{/);
  expect(src).not.toContain("status: 'COMPLETED'");
  expect(src).toContain('simulated: true');
});

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

  for (const [rel, marker] of [
    ['app/api/request-tenant-access/route.ts', 'body = await readBoundedJson(new Response(request.body'],
    ['app/api/run-tests/route.ts', 'runRequest = await readBoundedJson(new Response(req.body'],
    ['app/api/unsubscribe/route.ts', 'await readBoundedJson(new Response(req.body'],
    ['app/api/webhooks/resend/route.ts', 'body = await readBoundedBody(new Response(req.body'],
  ] as const) {
  }

});

test.describe('request-tenant-access', () => {
  const REL = 'app/api/request-tenant-access/route.ts';

});

test.describe('the tenant mail routes report only what they did', () => {
  for (const rel of ['app/api/send-tenant-approval-email/route.ts', 'app/api/send-tenant-revoke-email/route.ts']) {
  }

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

});

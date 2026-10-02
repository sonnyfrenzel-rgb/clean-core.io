import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readBoundedBody, ResponseLimitError } from '../lib/url-validation';

/**
 * `POST /api/runs/create` bounds its body before it parses it — external audit
 * SEC-01.
 *
 * The route used to call `await req.json()` on a body of any size and only
 * then compare the source with `MAX_ANALYSED_SOURCE_BYTES`. A request of a few
 * hundred megabytes was read and parsed into memory before anything refused it.
 * Now a declared `Content-Length` over the cap is refused first of all, and the
 * body is read through `readBoundedBody`, which cuts a chunked or understated
 * body off at the cap.
 */

const ROOT = path.resolve(__dirname, '..');
const ROUTE = 'app/api/runs/create/route.ts';

/** The route's source with comments removed, so a sentence cannot satisfy a check. */
function code(): string {
  return fs
    .readFileSync(path.join(ROOT, ROUTE), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('the declared size is checked before the key, auth, limiter, quota or engine', () => {
  const src = code();
  const check = src.indexOf("req.headers.get('content-length')");
  expect(check, 'runs/create does not read the declared body size').toBeGreaterThan(-1);
  for (const later of [
    'getAuditSigningKey()',
    'verifyRequestAuth(req)',
    'assertRateLimit(',
    'reserveRunQuota(',
    'buildAbapEvidence(',
  ]) {
    const at = src.indexOf(later);
    expect(at, `${later} is not in the route any more`).toBeGreaterThan(-1);
    expect(check, `the size check comes after ${later}`).toBeLessThan(at);
  }
});

test('the body is read under a byte cap, never with req.json()', () => {
  const src = code();
  expect(src).not.toContain('req.json(');
  expect(src).toContain('readBoundedBody(req, RUN_BODY_LIMITS)');
  const cap = src.match(/const MAX_RUN_BODY_BYTES = ([^;]+);/);
  expect(cap, 'no body cap is declared').not.toBeNull();
  // The literal is a product like `1024 * 1024`.
  const bytes = cap![1].split('*').reduce((n, f) => n * Number(f.trim()), 1);
  expect(bytes).toBeGreaterThanOrEqual(256 * 1024);
  expect(bytes, 'the cap is no longer a bound').toBeLessThanOrEqual(2 * 1024 * 1024);
  // Read before the quota: a refused body costs no unit.
  expect(src.indexOf('readBoundedBody(req')).toBeLessThan(src.indexOf('reserveRunQuota('));
  // The source cap stays, as the finer bound inside the body.
  expect(src).toContain('sourceBytes > MAX_ANALYSED_SOURCE_BYTES');
});

test('a chunked body without Content-Length is cut off at the cap', async () => {
  const chunk = new Uint8Array(64 * 1024).fill(0x20);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= 4 * 1024 * 1024) return controller.close();
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  // Node's fetch needs `duplex` for a streamed request body.
  const init = { method: 'POST', body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' };
  const req = new Request('http://localhost/api/runs/create', init);
  expect(req.headers.get('content-length')).toBeNull();
  await expect(readBoundedBody(req, { maxBytes: 1024 * 1024, timeoutMs: 10_000 })).rejects.toBeInstanceOf(
    ResponseLimitError,
  );
  // It stopped reading near the cap, not at the end of the stream.
  expect(sent).toBeLessThan(2 * 1024 * 1024);
});

test('an over-cap request is answered 413 before authentication', async ({ request }) => {
  // No token: were the body parsed or the caller verified first, this would be
  // a 401. 413 shows the size is refused before either.
  const res = await request.post('/api/runs/create', {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ projectId: 'p', legacyCode: 'x'.repeat(1024 * 1024 + 1) }),
  });
  expect(res.status()).toBe(413);
  const body = await res.json();
  expect(body.code).toBe('body-too-large');
});

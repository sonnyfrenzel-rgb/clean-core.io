import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readBoundedBody, ResponseLimitError } from '../lib/url-validation';

/**
 * A tenant's answer is read under a size limit and a deadline (QA review of
 * 4f7643df8c3e).
 *
 * The route's timeout ended with the headers, and `response.text()` then read
 * whatever the host sent for however long it took. The helper is exercised
 * with streams built here — one that grows without end, one that never ends —
 * and the route is read to make sure it is the helper doing the reading.
 */
const MB = 1024 * 1024;

function streamThat(behaviour: 'grows' | 'hangs', onCancel: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (behaviour === 'grows') {
        controller.enqueue(new Uint8Array(MB));
        return;
      }
      // One chunk, then silence: the read after it waits forever.
      controller.enqueue(new TextEncoder().encode('<edmx:Edmx>'));
      return new Promise<void>(() => {});
    },
    cancel: onCancel,
  });
}

test('a body that grows past the limit is cut off and refused', async () => {
  let cancelled = false;
  const response = new Response(streamThat('grows', () => { cancelled = true; }));
  await expect(readBoundedBody(response, { maxBytes: 3 * MB, timeoutMs: 10_000 })).rejects.toBeInstanceOf(ResponseLimitError);
  expect(cancelled, 'the stream was left open after the refusal').toBe(true);
});

test('a body that never ends is refused at the deadline', async () => {
  let cancelled = false;
  const response = new Response(streamThat('hangs', () => { cancelled = true; }));
  const started = Date.now();
  await expect(readBoundedBody(response, { maxBytes: 8 * MB, timeoutMs: 100 })).rejects.toThrow(/not complete after 100 ms/);
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(cancelled, 'the stream was left open after the deadline').toBe(true);
});

test('a declared length above the limit is refused before the body is touched', async () => {
  const response = new Response('x'.repeat(16), { headers: { 'content-length': String(9 * MB) } });
  await expect(readBoundedBody(response, { maxBytes: 8 * MB, timeoutMs: 1_000 })).rejects.toThrow(/9437184 bytes/);
  // Never locked, never read — the refusal came from the header alone.
  expect(response.bodyUsed).toBe(false);
});

test('a body within the limits is returned as text() would return it', async () => {
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('<edmx:Edmx/>')]);
  expect(await readBoundedBody(new Response(withBom), { maxBytes: 8 * MB, timeoutMs: 1_000 })).toBe('<edmx:Edmx/>');
  expect(await readBoundedBody(new Response('{"d":{"results":[]}}'), { maxBytes: 8 * MB, timeoutMs: 1_000 })).toBe('{"d":{"results":[]}}');
  expect(await readBoundedBody(new Response(null), { maxBytes: 8 * MB, timeoutMs: 1_000 })).toBe('');
});

/**
 * Every route that reads from a tenant reads through the helper.
 *
 * One of the four was fixed and the other three were not, and inside that one
 * the OData reads were bounded while its OAuth token exchange still buffered
 * whatever the token endpoint sent — the half that talks to the host the
 * caller named (QA full review of a19945ef01dc: cece3b6a9c51, 0e2d5f95821f,
 * ac4cdeea96b6, 95d0baf27ef4, 7182b3754472, 093df0feed02, 2ba9cba8e984). So
 * the guard names all four routes and asks the same question of each: is there
 * any unbounded read of a foreign response left in it.
 */
const TENANT_ROUTES = [
  'app/api/fetch-odata-metadata/route.ts',
  'app/api/fetch-s4-metadata/route.ts',
  'app/api/test-s4-connection/route.ts',
  'app/api/test-s4-odata-read/route.ts',
];

/** The file with its comments taken out — they explain the old reads by name. */
function code(rel: string): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('every route that reads from a tenant reads through the bounded helper', () => {
  for (const rel of TENANT_ROUTES) {
    const src = code(rel);

    // `safeFetch` decides where the request may go; these are what may come
    // back. A bare `.text()` or `.json()` on a response is the unbounded read.
    const unbounded = [...src.matchAll(/\b(\w+)\.(text|json)\(\)/g)]
      .filter((m) => /^(response|resp|tokenResp|res)$/i.test(m[1]))
      .map((m) => m[0]);
    expect(
      unbounded,
      `${rel} still reads a tenant response without a size limit or a deadline: ${unbounded.join(', ')}`,
    ).toEqual([]);

    expect(src, `${rel} does not read through the bounded helper at all`).toMatch(
      /readBounded(Body|Json)\(/,
    );
  }
});

test('the limits are one pair of numbers, not one per route', () => {
  const lib = fs.readFileSync(path.resolve(__dirname, '../lib/url-validation.ts'), 'utf8');
  expect(lib).toMatch(/export const ODATA_BODY_LIMITS = \{ maxBytes: 8 \* 1024 \* 1024, timeoutMs: [\d_]+ \}/);
  expect(lib).toMatch(/export const TOKEN_BODY_LIMITS = \{ maxBytes: 64 \* 1024, timeoutMs: [\d_]+ \}/);
  for (const rel of TENANT_ROUTES) {
    expect(
      code(rel).match(/maxBytes:/g),
      `${rel} declares its own byte ceiling instead of using the shared limits`,
    ).toBeNull();
  }
});

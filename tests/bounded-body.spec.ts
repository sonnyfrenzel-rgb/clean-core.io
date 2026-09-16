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

test('the metadata route reads tenant bodies through the helper', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../app/api/fetch-odata-metadata/route.ts'), 'utf8');
  // The two reads the finding named: the $metadata document and the catalog.
  expect(src).not.toMatch(/const xml = await response\.text\(\)/);
  expect(src).not.toMatch(/const body = await response\.text\(\)/);
  expect((src.match(/readBoundedBody\(response, RESPONSE_BODY_LIMITS\)/g) || []).length).toBe(2);
  expect(src).toMatch(/RESPONSE_BODY_LIMITS = \{ maxBytes: 8 \* 1024 \* 1024, timeoutMs: \d+ \}/);
});

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchMetadataIdToken } from '../lib/google-id-token';
import type { RunnerProxy } from '../lib/test-sandbox/protocol';

/**
 * The loopback relay of one live run.
 *
 * The sandbox child may open exactly one connection target: this relay on
 * 127.0.0.1 (the network guard's loopback shape). The relay forwards GET/HEAD
 * requests to the app's credential proxy, adding the two things the child must
 * never hold: the run's capability (in the path) and an ID token of the
 * runner's service account for the app's audience. The proxy decides
 * everything else — host, path, credentials. The relay only narrows further:
 * read-only methods, an allowlist of headers, a request budget, a deadline and
 * a response size limit. It lives for one run and is closed in `finally`.
 */

const MAX_REQUESTS = 200;
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const FORWARD_HEADERS = ['accept', 'accept-language', 'dataserviceversion', 'maxdataserviceversion', 'odata-version', 'odata-maxversion', 'if-none-match'];
const RETURN_HEADERS = ['content-type', 'etag', 'dataserviceversion', 'odata-version'];

/**
 * The proxy URL for a path the child asked for, or null. The capability is the
 * first path segment and stays it: a path with dot segments, encoded dots or
 * backslashes, or one whose resolved URL leaves `<baseUrl>/<capability>/` or
 * the proxy's origin, is refused before any token is fetched.
 */
export function relayTarget(baseUrl: string, capability: string, pathAndQuery: string): string | null {
  if (!pathAndQuery.startsWith('/') || pathAndQuery.startsWith('//') || pathAndQuery.length > 6_000) return null;
  const pathOnly = pathAndQuery.split('?')[0];
  if (pathOnly.includes('\\')) return null;
  const dotSegment = (s: string) => ['.', '..'].includes(s.toLowerCase().replace(/%2e/g, '.'));
  if (pathOnly.split('/').some(dotSegment)) return null;
  let target: URL;
  try {
    target = new URL(`${baseUrl}/${capability}${pathAndQuery}`);
  } catch {
    return null;
  }
  const base = new URL(`${baseUrl}/${capability}/`);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return null;
  return target.href;
}

/** The body of a response, read until `max` bytes and no further; null when it is larger. */
export async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function startRelay(proxy: RunnerProxy): Promise<{ url: string; port: number; close(): Promise<void> }> {
  const audience = new URL(proxy.baseUrl).origin;
  let used = 0;

  const server = http.createServer(async (req, res) => {
    const fail = (status: number, error: string) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error }));
    };
    const method = (req.method || '').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return fail(405, 'Only GET and HEAD reach the tenant from a test run.');
    if (++used > MAX_REQUESTS) return fail(429, 'This run has used up its tenant requests.');
    const pathAndQuery = req.url || '/';
    const target = relayTarget(proxy.baseUrl, proxy.capability, pathAndQuery);
    if (!target) return fail(400, 'Bad path.');

    const headers: Record<string, string> = {};
    for (const name of FORWARD_HEADERS) {
      const v = req.headers[name];
      if (typeof v === 'string' && v.length <= 1024) headers[name] = v;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      headers.authorization = `Bearer ${await fetchMetadataIdToken(audience)}`;
      const upstream = await fetch(target, {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      const buf = await readCapped(upstream, MAX_RESPONSE_BYTES);
      if (!buf) return fail(502, 'The tenant answer exceeded the relay limit.');
      const out: Record<string, string> = {};
      for (const name of RETURN_HEADERS) {
        const v = upstream.headers.get(name);
        if (v) out[name] = v;
      }
      res.writeHead(upstream.status >= 300 && upstream.status < 400 ? 502 : upstream.status, out);
      res.end(method === 'HEAD' ? undefined : buf);
    } catch {
      fail(502, 'The credential proxy could not be reached.');
    } finally {
      clearTimeout(timer);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

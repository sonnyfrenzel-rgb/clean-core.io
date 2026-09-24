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
    if (!pathAndQuery.startsWith('/') || pathAndQuery.startsWith('//') || pathAndQuery.length > 6_000) return fail(400, 'Bad path.');

    const headers: Record<string, string> = {};
    for (const name of FORWARD_HEADERS) {
      const v = req.headers[name];
      if (typeof v === 'string' && v.length <= 1024) headers[name] = v;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      headers.authorization = `Bearer ${await fetchMetadataIdToken(audience)}`;
      const upstream = await fetch(`${proxy.baseUrl}/${proxy.capability}${pathAndQuery}`, {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > MAX_RESPONSE_BYTES) return fail(502, 'The tenant answer exceeded the relay limit.');
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

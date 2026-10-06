import { test, expect } from '@playwright/test';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * One address (06.10.2026). www.clean-core.io answers since that day's Cloud Run domain mapping; every request
 * to it moves permanently to clean-core.io, path and query kept — sign-in is authorised there and every page
 * names it as canonical.
 */
test('every path on www moves permanently to the same path on clean-core.io, before any other redirect', async () => {
  const config = (await import(pathToFileURL(path.resolve(__dirname, '..', 'next.config.mjs')).href)).default;
  const rules = await config.redirects();
  expect(rules[0]).toEqual({
    source: '/:path*',
    has: [{ type: 'host', value: 'www.clean-core.io' }],
    destination: 'https://clean-core.io/:path*',
    permanent: true,
  });
  // Only the www host: no rule without a host condition sends the whole site elsewhere.
  for (const rule of rules.filter((r: { destination: string }) => /^https?:\/\//.test(r.destination))) {
    expect(rule.has?.[0]).toEqual({ type: 'host', value: 'www.clean-core.io' });
  }
});

test('the server answers a www request with a permanent redirect to clean-core.io', async ({ request, baseURL }) => {
  test.skip(!baseURL, 'needs the web server');
  const res = await request.get(`${baseURL}/how-to?x=1`, { headers: { host: 'www.clean-core.io' }, maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers()['location']).toBe('https://clean-core.io/how-to?x=1');
  // The canonical host itself is not redirected.
  const same = await request.get(`${baseURL}/how-to`, { maxRedirects: 0 });
  expect([301, 302, 307, 308]).not.toContain(same.status());
});

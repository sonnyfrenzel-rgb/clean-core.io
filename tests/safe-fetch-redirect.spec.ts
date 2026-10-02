import { test, expect } from '@playwright/test';
import { safeFetch, SsrfError } from '../lib/url-validation';

/**
 * What `safeFetch` sends on after a redirect.
 *
 * The upstream is replaced by a stub of the global `fetch`, so no request
 * leaves the machine; the addresses are public IP literals so the per-hop
 * check passes without a DNS lookup.
 */
type Call = { url: string; init: RequestInit };

function stubFetch(answers: Record<string, () => Response>): { calls: Call[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const answer = answers[url];
    if (!answer) throw new Error(`unexpected request to ${url}`);
    return answer();
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const redirectTo = (location: string) => () => new Response(null, { status: 302, headers: { location } });
const ok = () => new Response('ok', { status: 200 });

let savedAllowlist: string | undefined;
test.beforeEach(() => {
  savedAllowlist = process.env.S4_HOST_ALLOWLIST;
  delete process.env.S4_HOST_ALLOWLIST;
});
test.afterEach(() => {
  if (savedAllowlist === undefined) delete process.env.S4_HOST_ALLOWLIST;
  else process.env.S4_HOST_ALLOWLIST = savedAllowlist;
});

for (const [label, init] of [
  ['an Authorization header', { headers: { Authorization: 'Basic c2VjcmV0' } }],
  ['an APIKey header', { headers: { APIKey: 'k-123' } }],
  ['a body', { method: 'POST', body: 'grant_type=client_credentials' }],
] as Array<[string, RequestInit]>) {
  test(`a request with ${label} is not sent on to another origin`, async () => {
    const stub = stubFetch({
      'https://8.8.8.8/start': redirectTo('https://1.1.1.1/elsewhere'),
      'https://1.1.1.1/elsewhere': ok,
    });
    try {
      await expect(safeFetch('https://8.8.8.8/start', init)).rejects.toBeInstanceOf(SsrfError);
    } finally {
      stub.restore();
    }
    expect(stub.calls.map((c) => c.url)).toEqual(['https://8.8.8.8/start']);
  });
}

test('a request with credentials still follows a redirect on its own origin', async () => {
  const stub = stubFetch({
    'https://8.8.8.8/start': redirectTo('/next'),
    'https://8.8.8.8/next': ok,
  });
  try {
    const res = await safeFetch('https://8.8.8.8/start', { headers: { Authorization: 'Basic c2VjcmV0' } });
    expect(res.status).toBe(200);
  } finally {
    stub.restore();
  }
  expect(stub.calls.map((c) => c.url)).toEqual(['https://8.8.8.8/start', 'https://8.8.8.8/next']);
});

test('a plain request still follows a redirect to another origin', async () => {
  const stub = stubFetch({
    'https://8.8.8.8/start': redirectTo('https://1.1.1.1/elsewhere'),
    'https://1.1.1.1/elsewhere': ok,
  });
  try {
    const res = await safeFetch('https://8.8.8.8/start', { headers: { Accept: 'application/xml' } });
    expect(res.status).toBe(200);
  } finally {
    stub.restore();
  }
  expect(stub.calls.map((c) => c.url)).toEqual(['https://8.8.8.8/start', 'https://1.1.1.1/elsewhere']);
});

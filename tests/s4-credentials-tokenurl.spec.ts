import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminDocExists, adminSetDoc } from './helpers/admin-seed';

/**
 * `POST /api/s4-credentials` checks the OAuth token URL when it is saved, with
 * the validator every S/4 route applies before the token exchange (`isUrlSafe`,
 * owner decision 02.10.2026). It used to check only the tenant URL, so a token
 * URL aimed at a metadata host, a private address or plain HTTP was stored and
 * refused later, on every use.
 *
 * The token URL is checked before the tenant URL, so a refusal names it
 * whatever the server's `S4_HOST_ALLOWLIST` makes of the tenant host.
 */

const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const TENANT = 'https://example.com';

test.describe.configure({ mode: 'serial' });

let uid = '';
let token = '';

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const email = `s4-tokenurl-${Date.now()}-${Math.floor(Math.random() * 1e6)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, SIGN_IN);
  uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Token', lastName: 'Url', email, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, s4TenantAccessAllowed: true,
    createdAt: new Date(),
  });
  token = await cred.user.getIdToken(true);
});

const save = (request: import('@playwright/test').APIRequestContext, tokenUrl: unknown) =>
  request.post('/api/s4-credentials', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { url: TENANT, username: 'client', password: 'not-a-real-secret', authType: 'oauth2', tokenUrl },
  });

for (const [label, tokenUrl] of [
  ['a metadata host', 'https://metadata.google.internal/computeMetadata/v1/token'],
  ['plain HTTP', 'http://example.com/oauth/token'],
  ['credentials in the URL', 'https://user:pass@example.com/oauth/token'],
  ['a loopback address', 'https://127.0.0.1/oauth/token'],
] as const) {
  test(`a token URL at ${label} is refused when saving, and nothing is stored`, async ({ request }) => {
    const res = await save(request, tokenUrl);
    expect(res.status(), `a token URL at ${label} was saved`).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/^Token URL not allowed: /);
    expect(await adminDocExists('s4_credentials', uid), 'the refused credentials were stored anyway').toBe(false);
  });
}

test('a token URL that is not a string is refused', async ({ request }) => {
  const res = await save(request, { href: 'https://example.com/oauth/token' });
  expect(res.status()).toBe(400);
  expect(await adminDocExists('s4_credentials', uid)).toBe(false);
});

test('a public HTTPS token URL passes the token check, so the check is not a blanket refusal', async ({ request }) => {
  const res = await save(request, 'https://example.com/oauth/token');
  const body = (await res.json()) as { error?: string };
  // Where the server runs with `S4_HOST_ALLOWLIST` (a local `.env.local` may
  // set one; production does), a host outside it is refused — for the token
  // URL exactly as at use time, which is the point of using the same
  // validator. Without one (CI) the credentials are stored.
  if (res.status() === 200) {
    expect(await adminDocExists('s4_credentials', uid)).toBe(true);
    const del = await request.delete('/api/s4-credentials', { headers: { Authorization: `Bearer ${token}` } });
    expect(del.status()).toBe(200);
  } else {
    expect(res.status()).toBe(403);
    expect(body.error, 'a public HTTPS token URL was refused for a reason other than the allowlist').toBe(
      'Token URL not allowed: Host is not in the configured allowlist.',
    );
  }
});

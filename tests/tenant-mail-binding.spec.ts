/**
 * The tenant approval and revocation mails go to the account, not to an
 * address the request named.
 *
 * The admin console used to copy `email` out of the request document and
 * post it to the mail route, and the route validated only the address's shape.
 * The request document is the requester's own writing (tenant_access_requests
 * is created under the requester's uid with no field check), so a request
 * could name any address and an approval would mail it from team@clean-core.io,
 * greeting it by name. Security audit of b88c77b, SEC-2026-235 — the same rule
 * the welcome mail has followed since 3b8ca34: Auth says who the account is.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';

const STAMP = Date.now();
const ADMIN_EMAIL = `tenant-mail-admin-${STAMP}@example.com`;
const TARGET_EMAIL = `tenant-mail-target-${STAMP}@example.com`;
const SIGN_IN = 'Sign-in-Pass-1!';
const ROUTES = ['/api/send-tenant-approval-email', '/api/send-tenant-revoke-email'] as const;

let adminToken = '';
let targetUid = '';
const headers = () => ({ Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  const target = await createUserWithEmailAndPassword(auth, TARGET_EMAIL, SIGN_IN);
  targetUid = target.user.uid;
  await adminSetDoc('users', targetUid, {
    firstName: 'Target', lastName: 'Account', email: TARGET_EMAIL, tier: 'pilot', status: 'approved',
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });

  // Created last, so the client SDK is signed in as the administrator when the
  // token is minted; the admin claim is what verifyAdminRequest reads.
  const admin = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, SIGN_IN);
  await adminSetDoc('users', admin.user.uid, {
    firstName: 'Admin', lastName: 'Account', email: ADMIN_EMAIL, tier: 'pilot', status: 'approved', isAdmin: true,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  await adminSetCustomClaim(admin.user.uid, { admin: true });
  adminToken = await admin.user.getIdToken(true);
});

for (const route of ROUTES) {
  test(`${route} mails the account's own address, whatever the request said`, async ({ request }: { request: APIRequestContext }) => {
    // A body that still carries an address — the old contract — changes nothing.
    const res = await request.post(route, {
      headers: headers(),
      data: { uid: targetUid, name: 'Target', email: `someone-else-${STAMP}@evil.example` },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.to, 'the route mailed an address that is not the account\'s').toBe(TARGET_EMAIL);
  });

  test(`${route} refuses a uid that is not an account`, async ({ request }: { request: APIRequestContext }) => {
    const res = await request.post(route, {
      headers: headers(),
      data: { uid: `no-such-account-${STAMP}`, name: 'Nobody', email: TARGET_EMAIL },
    });
    expect(res.status(), await res.text()).toBe(404);
  });

  test(`${route} still needs an administrator`, async ({ request }: { request: APIRequestContext }) => {
    const res = await request.post(route, {
      headers: { 'Content-Type': 'application/json' },
      data: { uid: targetUid, name: 'Target' },
    });
    expect([401, 403]).toContain(res.status());
  });
}

test('no mail route reads the address from the request body, and the console sends the uid', () => {
  for (const route of ROUTES) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', route.slice(1), 'route.ts'), 'utf8');
    expect(src, `${route} destructures email from the body again`).not.toMatch(/const \{ email[^}]*\} = body/);
    expect(src, `${route} does not look the account up`).toMatch(/getAdminAuth\(\)\)\.getUser\(uid\)/);
  }
  const console_ = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'admin', 'page.tsx'), 'utf8');
  const call = console_.slice(console_.indexOf("'/api/send-tenant-revoke-email'"));
  const bodyStart = call.indexOf('body: JSON.stringify({');
  const bodyEnd = call.indexOf('})', bodyStart);
  const payload = call.slice(bodyStart, bodyEnd);
  expect(payload, 'the console posts the request document\'s address').not.toContain('email:');
  expect(payload).toContain('uid: targetReq.uid');
});

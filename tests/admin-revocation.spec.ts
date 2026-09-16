import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';

/**
 * Admin rights end when they are withdrawn, and only the claim grants them
 * (QA review of 569fc1c41e35 and cc5845ec545e).
 *
 * Driven over the routes, because `lib/firebase-admin.ts` cannot be called
 * from a spec: its Auth module reaches ESM-only `jose`, which Playwright's
 * CommonJS transform cannot require (the same reason `mfa-native-gate.spec.ts`
 * keeps its decision in a pure module). Inside Next the import is fine, so the
 * routes are where this is observable — and they are the place that matters
 * anyway: what is being proven is that a withdrawn administrator is refused,
 * not that a function returns null.
 *
 * `/api/admin/set-admin-claim` is called without a `uid`. An accepted
 * administrator gets 400 for the missing field; a refused one gets 403 before
 * the body is ever read. So the distinction is visible without changing any
 * account's privileges as a side effect of asking.
 */
const PASSWORD = 'Revocation-Spec-Pass-123!';
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

function clientAuth() {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, `http://${AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  } catch { /* already connected */ }
  return auth;
}

function adminDb() {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

/** The Auth emulator's own admin view of an account — no Admin SDK involved. */
async function accountRecord(uid: string): Promise<{ customAttributes?: string; validSince?: string }> {
  const res = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${firebaseConfig.projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: [uid] }),
    },
  );
  const data = await res.json();
  return data.users?.[0] ?? {};
}

/** The `auth_time` the token was minted with — the value a revocation is compared against. */
function authTimeOf(idToken: string): number {
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8'));
  return Number(payload.auth_time);
}

async function seedAccount(tag: string, profile: Record<string, unknown> = {}) {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(clientAuth(), email, PASSWORD);
  const uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Revocation', lastName: 'Spec', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    s4TenantAccessAllowed: false, isAdmin: false, createdAt: new Date(),
    ...profile,
  });
  return { uid, email, user: cred.user };
}

async function removeAccount(uid: string) {
  await adminDb().collection('users').doc(uid).delete().catch(() => {});
  await fetch(`http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${firebaseConfig.projectId}/accounts/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  }).catch(() => {});
}

/**
 * Revocation is recorded to the second and compared strictly against the
 * token's `auth_time`: a token minted in the same second as the withdrawal
 * survives it. Wait that second out so the test measures the withdrawal and
 * not the clock.
 */
async function waitPast(authTime: number) {
  while (Math.floor(Date.now() / 1000) <= authTime) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test.describe('a withdrawn administrator is refused at once', () => {
  test('the token that still carries the claim no longer opens an admin route', async ({ request }: { request: APIRequestContext }) => {
    const { uid, user } = await seedAccount('revoked-admin');
    try {
      await adminSetCustomClaim(uid, { admin: true });
      const adminToken = await user.getIdToken(true);
      const headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

      // Accepted: the route got past its admin check and complains about the body.
      const before = await request.post('/api/admin/set-admin-claim', { headers, data: {} });
      expect(before.status(), 'the granted claim did not reach the route').toBe(400);
      expect((await before.json()).error).toContain('uid');

      await waitPast(authTimeOf(adminToken));
      await adminSetCustomClaim(uid, { admin: false });

      // The token still says `admin: true` — nothing rewrites a JWT. It is the
      // server that has to refuse it, and before this it did not: the claim was
      // good until the token expired, up to an hour later.
      const after = await request.post('/api/admin/set-admin-claim', { headers, data: {} });
      expect(after.status(), 'the withdrawn administrator was still served').toBe(403);
      expect((await after.json()).error).toContain('administrator privileges required');

      const record = await accountRecord(uid);
      expect(String(record.customAttributes || ''), 'the claim itself was not withdrawn').not.toContain('"admin":true');
      expect(
        Number(record.validSince),
        'the withdrawal did not revoke the refresh tokens, so the old token stayed valid',
      ).toBeGreaterThan(authTimeOf(adminToken));
      expect((await adminDb().collection('users').doc(uid).get()).data()?.isAdmin).toBe(false);
    } finally {
      await removeAccount(uid);
    }
  });
});

test.describe('the Firestore mirror grants nothing on its own', () => {
  /**
   * A profile that claims admin with no claim behind it — what a failed mirror
   * write after a withdrawal leaves, and what an attacker who can only reach
   * Firestore would aim for. Each of the three places that used to accept it
   * is asked separately.
   */
  test('an admin route, the S/4 gate and the account gate all refuse it', async ({ request }: { request: APIRequestContext }) => {
    // Approved, but on a Terms version that is no longer current. That is the
    // one exemption `assertAccountActive` grants an admin which nothing else in
    // the request re-checks: the approval branch of the same `isAdmin` line
    // cannot be probed through a route, because `reserveRunQuota` refuses a
    // non-approved account further down with the very same message, so such a
    // test would pass with or without the fix.
    const { uid, user } = await seedAccount('mirror-only', {
      isAdmin: true,
      status: 'approved',
      termsVersionAccepted: 'v0.0.0-stale',
    });
    try {
      const headers = { Authorization: `Bearer ${await user.getIdToken(true)}`, 'Content-Type': 'application/json' };

      const adminRoute = await request.post('/api/admin/set-admin-claim', { headers, data: {} });
      expect(adminRoute.status(), 'the mirror alone passed the admin check').toBe(403);

      // assertS4TenantAccess: `data.isAdmin === true` used to stand in for the claim.
      const s4 = await request.get('/api/s4-credentials', { headers });
      expect(s4.status(), 'the mirror alone opened the S/4 tenant endpoints').toBe(403);
      expect((await s4.json()).error).toContain('restricted');

      // assertAccountActive: the same fallback waved the stale Terms through.
      const gated = await request.post('/api/gemini', { headers, data: {} });
      expect(gated.status(), 'the mirror alone exempted an account from re-accepting the Terms').toBe(403);
      expect((await gated.json()).error).toContain('Terms of Service have been updated');
    } finally {
      await removeAccount(uid);
    }
  });
});

test.describe('outside the emulator', () => {
  test('a token that claims admin is verified against the revocation time', () => {
    // The Auth emulator looks every token up whether or not the verifier asked,
    // so the branch that pays for the lookup in production cannot be observed
    // here. It is what turns the revocation above into a refusal on Cloud Run,
    // so it is pinned from the source rather than left unstated.
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/firebase-admin.ts'), 'utf8');
    expect(src).toMatch(/if \(decoded\.admin === true\) \{\s*return auth\.verifyIdToken\(idToken, true\);/);
  });
});

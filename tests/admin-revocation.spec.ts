import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  verifyAdminRequest,
  setAdminClaim,
  assertAccountActive,
  assertS4TenantAccess,
  getAdminDb,
} from '../lib/firebase-admin';

/**
 * Admin rights end when they are withdrawn, and only the claim grants them
 * (QA review of 569fc1c41e35 and cc5845ec545e).
 *
 * Against the Auth and Firestore emulators, through the same functions the
 * routes call — `playwright.config.ts` points both emulator variables at the
 * suite's emulators. Tokens are minted the way a browser mints them, through
 * the emulator's sign-in endpoint, so they carry the custom claims.
 *
 * One thing the emulator cannot show: it cannot verify a token's signature, so
 * the Admin SDK looks the account up for every token there, whether or not the
 * verifier asked for `checkRevoked`. The revocation, the mirror-first order and
 * the removed mirror fallbacks are exercised for real below; the production
 * branch that asks for the lookup is pinned by reading the source.
 */
const AUTH_EMULATOR = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;
const PASSWORD = 'Revocation-Spec-Pass-123!';

test.beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'cleancore-491216' });
});

async function createAccount(tag: string): Promise<{ uid: string; email: string }> {
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@cleancore-test.io`;
  const user = await getAuth().createUser({ email, password: PASSWORD });
  return { uid: user.uid, email };
}

async function removeAccount(uid: string): Promise<void> {
  const { db } = await getAdminDb();
  await db.collection('users').doc(uid).delete().catch(() => {});
  await getAuth().deleteUser(uid).catch(() => {});
}

/** Mints an ID token as a browser would, so it carries the account's custom claims. */
async function signIn(email: string): Promise<string> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.idToken) throw new Error(`emulator sign-in failed: ${JSON.stringify(data)}`);
  return data.idToken as string;
}

const bearer = (token: string) =>
  new Request('http://localhost/api/admin/console-action', {
    headers: { Authorization: `Bearer ${token}` },
  });

/**
 * Revocation is recorded to the second and compared strictly against the
 * token's `auth_time`, in production as in the emulator: a token minted in the
 * same second as the withdrawal survives it. Wait that second out so the test
 * measures the withdrawal and not the clock.
 */
async function waitForSecondAfter(authTime: number): Promise<void> {
  while (Math.floor(Date.now() / 1000) <= authTime) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test('a withdrawn administrator\'s existing token is refused, not honoured until it expires', async () => {
  const { uid, email } = await createAccount('revoked-admin');
  try {
    await setAdminClaim(uid, true);
    const token = await signIn(email);

    const before = await verifyAdminRequest(bearer(token));
    expect(before?.uid, 'the granted claim reaches the token').toBe(uid);

    await waitForSecondAfter(Number(before.auth_time));
    await setAdminClaim(uid, false);

    // The token still says `admin: true` — nothing rewrites a JWT. It is the
    // verifier that has to refuse it.
    expect(await verifyAdminRequest(bearer(token)), 'the withdrawn token still passed as admin').toBeNull();

    const record = await getAuth().getUser(uid);
    expect(record.customClaims?.admin).toBeUndefined();
    expect(record.tokensValidAfterTime, 'the withdrawal did not revoke the refresh tokens').toBeTruthy();

    const { db } = await getAdminDb();
    expect((await db.collection('users').doc(uid).get()).data()?.isAdmin).toBe(false);
  } finally {
    await removeAccount(uid);
  }
});

test('the Firestore mirror grants nothing on its own', async () => {
  const { uid, email } = await createAccount('mirror-only');
  try {
    // A profile that claims admin without the claim behind it — what a failed
    // mirror write after a withdrawal leaves, or a mirror written by hand.
    const { db } = await getAdminDb();
    await db.collection('users').doc(uid).set({
      email,
      status: 'pending',
      tier: 'pilot',
      isAdmin: true,
      s4TenantAccessAllowed: false,
    });
    const token = await signIn(email);

    expect(await verifyAdminRequest(bearer(token)), 'the mirror alone passed the admin check').toBeNull();
    await expect(
      assertAccountActive(uid, { requireApproved: true }),
      'the mirror alone exempted a pending account from approval',
    ).rejects.toThrow(/not active/);
    await expect(
      assertS4TenantAccess(uid),
      'the mirror alone opened the S/4 tenant endpoints',
    ).rejects.toThrow(/restricted/);

    // The claim passed in still does what it always did.
    await expect(assertAccountActive(uid, { requireApproved: true, isAdminClaim: true })).resolves.toBeUndefined();
    await expect(assertS4TenantAccess(uid, { isAdminClaim: true })).resolves.toBeUndefined();
  } finally {
    await removeAccount(uid);
  }
});

test.describe('outside the emulator', () => {
  test('a token that claims admin is verified against the revocation time', () => {
    // The emulator looks every token up regardless, so this branch only shows
    // in production — where the lookup is what turns the revocation above into
    // a refusal. Pinned here, because the behavioural test cannot tell.
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/firebase-admin.ts'), 'utf8');
    expect(src).toMatch(/if \(decoded\.admin === true\) \{\s*return auth\.verifyIdToken\(idToken, true\);/);
  });
});

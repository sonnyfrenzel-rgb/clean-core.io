import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, type User } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION, TERMS_VERSIONS_IN_FORCE } from '../lib/constants';
import { archivedTermsSha256 } from '../lib/terms-versions';
import { adminSetDoc, adminGetDoc, adminSetEmailVerified } from './helpers/admin-seed';

/**
 * Release day of 3.0, for the accounts that already exist.
 *
 * Sonny, 30.09.2026: "no mails, no census — consent to the new version is
 * simply required at login with 3.0". Every account on the platform then holds
 * v2.1.0 (`2026-09-18`) or, if it declined on 18.09., v2.0.0 (`2026-07-07`).
 * Neither is in force any more (`TERMS_VERSIONS_IN_FORCE`), so each of them has
 * to meet the blocking dialog, be refused by every route that asks for the
 * Terms, and get through by accepting — and the acceptance has to be recorded
 * by the server with the version and the digest of its wording, because a
 * consent record that names no wording is not evidence of anything.
 *
 * Written the way the day looks: accounts holding exactly the versions
 * production has served, not a made-up stale value.
 */

const STAMP = Date.now();
const PASSWORD = 'TermsThree123!';

function clientAuth() {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  return auth;
}

function adminDb() {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

async function accountOn(version: string, tag: string): Promise<{ user: User; email: string }> {
  const email = `terms-30-${tag}-${STAMP}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(clientAuth(), email, PASSWORD);
  await adminSetEmailVerified(cred.user.uid, true);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Terms', lastName: 'Three', email,
    tier: 'pilot', status: 'approved', createdAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: version,
    mfaEnabled: false,
  });
  return { user: cred.user, email };
}

test('neither version production has served is in force with 3.0', () => {
  expect(TERMS_VERSION, 'the 3.0 Terms are not a new version').not.toBe('2026-09-18');
  for (const old of ['2026-09-18', '2026-07-07']) {
    expect(TERMS_VERSIONS_IN_FORCE, `${old} is still in force — its accounts would only be asked, not required`).not.toContain(old);
  }
  // And the version they are asked to accept has its wording archived, so the
  // record of the acceptance can name it.
  expect(archivedTermsSha256(TERMS_VERSION), `${TERMS_VERSION} has no archived wording`).toMatch(/^[0-9a-f]{64}$/);
});

for (const [previous, tag] of [
  ['2026-09-18', 'v210'],
  ['2026-07-07', 'v200'],
] as const) {
  test(`an account on ${previous} is held at the gate until it accepts, and the acceptance is recorded with version and digest`, async ({ page }) => {
    test.setTimeout(240 * 1000);
    const { user, email } = await accountOn(previous, tag);

    // The server half: a route that asks for the Terms refuses, and says why.
    const knock = async () =>
      page.request.post('/api/model-stages', {
        headers: { Authorization: `Bearer ${await user.getIdToken(true)}`, 'Content-Type': 'application/json' },
        data: { stages: { design: true } },
      });
    const refused = await knock();
    expect(refused.status(), `an account on ${previous} passed a Terms-gated route`).toBe(403);
    expect((await refused.json()).error).toContain('no longer in force');

    await page.goto('/?auth=signin');
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');

    // The blocking form: no "not now", Escape inert, and the page behind it
    // cannot be operated.
    const gate = page.locator('[data-terms-gate]');
    await expect(gate, `an account on ${previous} was not stopped at sign-in`).toBeVisible({ timeout: 60000 });
    await expect(gate).toHaveAttribute('data-terms-gate-mode', 'blocking');
    await expect(gate.locator('[data-terms-gate-decline]'), 'declining was offered although the old Terms are no longer in force').toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(gate, 'Escape dismissed the gate').toBeVisible();
    const pageBehindIsInert = await page.evaluate(() => {
      const gateEl = document.querySelector('[data-terms-gate]');
      const main = document.querySelector('main');
      if (!main || !gateEl || gateEl.contains(main)) return false;
      return !!main.closest('[inert]');
    });
    expect(pageBehindIsInert, 'the page behind the gate can still be operated').toBe(true);

    // It says what changed in 3.0's version, and — for the v2.0.0 account — in
    // v2.1.0 as well, which that account was never required to accept.
    await expect(gate.locator('[data-terms-gate-change="2026-10-15"]').first()).toBeVisible();
    if (previous === '2026-07-07') {
      await expect(gate.locator('[data-terms-gate-change="2026-09-18"]').first()).toBeVisible();
    } else {
      await expect(gate.locator('[data-terms-gate-change="2026-09-18"]')).toHaveCount(0);
    }

    await gate.locator('[data-terms-gate-accept]').click();
    await expect(gate, 'the gate stayed up after accepting').toBeHidden({ timeout: 60000 });

    // Recorded by the server: the profile carries the version, and the
    // append-only consent record carries version and the digest of the wording.
    await expect
      .poll(async () => (await adminGetDoc('users', user.uid))?.termsVersionAccepted, {
        timeout: 30000,
        message: 'the acceptance did not reach the profile',
      })
      .toBe(TERMS_VERSION);
    const events = await adminDb().collection('consent_events').where('uid', '==', user.uid).get();
    expect(events.size, 'no consent record was written').toBeGreaterThan(0);
    const row = events.docs.map((d) => d.data()).find((r) => r.termsVersion === TERMS_VERSION);
    expect(row, `no consent record names ${TERMS_VERSION}`).toBeTruthy();
    expect(row!.contentSha256, 'the consent record names no wording').toBe(archivedTermsSha256(TERMS_VERSION));

    // And the route that refused answers now.
    const after = await knock();
    expect(after.status(), await after.text()).toBe(200);

    await adminDb().collection('consent_events').where('uid', '==', user.uid).get()
      .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete().catch(() => {}))));
  });
}

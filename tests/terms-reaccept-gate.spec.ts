import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminGetDoc, adminSetEmailVerified } from './helpers/admin-seed';

/**
 * The way out of the Terms gate, executed.
 *
 * `assertAccountActive(..., { requireCurrentTerms: true })` refuses every
 * protected route when the profile's accepted version is stale, and says
 * "re-accept them in the app to continue". Until 18.09.2026 the app had no such
 * place: nothing rendered the state and nothing called `POST /api/consent`.
 * Raising `TERMS_VERSION` would have locked every account out with a message
 * naming a remedy that did not exist — the same shape as the MFA lockout found
 * that morning, for everyone instead of one person.
 *
 * So the test is not "a dialog appears". It is the round trip: a stale account
 * is stopped, accepting writes a server-side record, and the account is stopped
 * no longer. The last assertion is the one that matters — the stored version,
 * read back with the Admin SDK, because a dialog that closes without recording
 * anything looks identical from the browser.
 */

const STAMP = Date.now();
const EMAIL = `terms-gate-${STAMP}@cleancore-test.io`;
const PASSWORD = 'TermsGate123!';
const STALE = '1999-01-01';

let uid = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  uid = cred.user.uid;
  await adminSetEmailVerified(uid, true);
  await adminSetDoc('users', uid, {
    firstName: 'Terms', lastName: 'Gate', email: EMAIL,
    tier: 'pilot', status: 'approved', createdAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5,
    // The whole point: an account that accepted an older version.
    termsVersionAccepted: STALE,
    mfaEnabled: false,
  });
});

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/?auth=signin');
  await page.waitForSelector('input[type="email"]', { timeout: 60000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForURL('**/dashboard', { timeout: 60000 });
}

test('a stale acceptance is stopped, and accepting is recorded on the server', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signIn(page);

  const gate = page.locator('[data-terms-gate]');
  await expect(gate, 'an account with an old accepted version was let straight through').toBeVisible({ timeout: 60000 });

  // It names what changed, and links both documents — a gate that only says
  // "accept" asks people to agree to something they have not been shown.
  await expect(gate).toContainText('Terms of Service have changed');
  await expect(gate).toContainText('personal data');
  await expect(gate.locator('[data-terms-gate-link="terms"]')).toHaveAttribute('href', '/terms');
  await expect(gate.locator('[data-terms-gate-link="privacy"]')).toHaveAttribute('href', '/datenschutz');

  // Not dismissible: Escape leaves it standing, because everything behind it
  // answers 403 and would read as breakage.
  await page.keyboard.press('Escape');
  await expect(gate, 'Escape dismissed a gate that has nothing working behind it').toBeVisible();

  const before = await adminGetDoc('users', uid);
  expect(before?.termsVersionAccepted, 'the fixture did not start stale').toBe(STALE);

  await gate.locator('[data-terms-gate-accept]').click();
  await expect(gate, 'the gate stayed up after accepting').toBeHidden({ timeout: 60000 });

  // The half a browser cannot show: the acceptance is on the profile, written by
  // the server, with the version the server knows.
  await expect.poll(async () => (await adminGetDoc('users', uid))?.termsVersionAccepted, {
    timeout: 30000,
    message: 'the dialog closed without the acceptance reaching the profile',
  }).toBe(TERMS_VERSION);
});

test('and it does not come back on the next visit', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signIn(page);
  await page.waitForTimeout(3000);
  await expect(
    page.locator('[data-terms-gate]'),
    'the gate asked again although the current version is on the profile',
  ).toBeHidden();
});

test('the gate is mounted in the shell every protected page shares', () => {
  // A gate rendered on one page is a gate somebody routes around. It belongs in
  // the layout, which is what every signed-in route goes through.
  const layout = fs.readFileSync(path.resolve(__dirname, '..', 'app', '(app)', 'layout.tsx'), 'utf8');
  expect(layout, 'the Terms gate is not in the authenticated shell').toContain('<TermsReacceptGate />');

  const gate = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'TermsReacceptGate.tsx'), 'utf8');
  // Consent is recorded through the route that derives version, address and time
  // itself. A client-side profile write would be a claim, not evidence.
  expect(gate).toContain("fetch('/api/consent'");
  expect(gate, 'the gate writes the profile from the browser instead of recording consent').not.toMatch(
    /updateProfile\s*\(|setDoc\s*\(/,
  );
  // Refusing has to be possible without deleting the account.
  expect(gate).toContain('data-terms-gate-signout');
});

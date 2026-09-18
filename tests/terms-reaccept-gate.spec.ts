import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION, TERMS_VERSIONS_IN_FORCE } from '../lib/constants';
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

/**
 * Tab stays inside.
 *
 * The first version of this gate set initial focus and stopped there, which a
 * QA review caught (38e6f079a0ba): focus could walk out of a dialog that blocks
 * everything behind it, so a keyboard user would have ended up operating
 * controls that answer 403 — the very failure the gate exists to prevent,
 * reproduced for the people least able to guess what had happened.
 */
test('the keyboard cannot leave the gate', async ({ page }) => {
  test.setTimeout(180 * 1000);

  // A second stale account, because the first one accepted above and this file
  // runs serially.
  const email = `terms-focus-${STAMP}@cleancore-test.io`;
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const cred = await createUserWithEmailAndPassword(getAuth(app), email, PASSWORD);
  await adminSetEmailVerified(cred.user.uid, true);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Terms', lastName: 'Focus', email,
    tier: 'pilot', status: 'approved', createdAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: STALE, mfaEnabled: false,
  });

  await page.goto('/?auth=signin');
  await page.waitForSelector('input[type="email"]', { timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');

  const gate = page.locator('[data-terms-gate]');
  await expect(gate).toBeVisible({ timeout: 60000 });

  const insideGate = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-terms-gate]');
      const active = document.activeElement;
      return !!root && !!active && root.contains(active);
    });

  expect(await insideGate(), 'focus did not start inside the dialog').toBe(true);

  // Forwards past the last control, and backwards past the first: both are the
  // moments a trap is missing.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await insideGate(), `Tab ${i + 1} left the dialog`).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await insideGate(), `Shift+Tab ${i + 1} left the dialog`).toBe(true);
  }
});

/**
 * A question somebody may answer with "no" must not take the page hostage.
 *
 * The first version of this gate was a full-screen modal in every case,
 * including for an account with no recorded acceptance at all — the legacy
 * account the *server* deliberately grandfathers. It therefore blocked people
 * the platform was letting in, and it intercepted pointer events in nine
 * unrelated specs whose fixtures simply never set `termsVersionAccepted`.
 *
 * Since § 10.3 the two cases are different things and look different: a banner
 * in the page flow while the accepted version is still in force, a modal once it
 * is not. This pins that, and the click at the end is the part that matters —
 * the banner must not sit on top of anything.
 */
test('an account the server grandfathers is asked, not shut out', async ({ page }) => {
  test.setTimeout(180 * 1000);

  const email = `terms-legacy-${STAMP}@cleancore-test.io`;
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const cred = await createUserWithEmailAndPassword(getAuth(app), email, PASSWORD);
  await adminSetEmailVerified(cred.user.uid, true);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Terms', lastName: 'Legacy', email,
    tier: 'pilot', status: 'approved', createdAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5,
    // No `termsVersionAccepted` at all — the legacy shape.
    mfaEnabled: false,
  });

  await page.goto('/?auth=signin');
  await page.waitForSelector('input[type="email"]', { timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForURL('**/dashboard', { timeout: 60000 });

  const gate = page.locator('[data-terms-gate]');
  await expect(gate, 'the legacy account was not asked at all').toBeVisible({ timeout: 60000 });
  await expect(
    gate,
    'a grandfathered account got the blocking form — the server lets it in, the screen must not shut it out',
  ).toHaveAttribute('data-terms-gate-mode', 'banner');

  // Declining is offered, and it is offered as declining — not as signing out.
  await expect(gate.locator('[data-terms-gate-decline]')).toBeVisible();

  // The page underneath is usable. `click` fails on an intercepted element, so
  // this assertion is the whole point of the banner form.
  await page.locator('h1, h2').first().click({ timeout: 15000 });

  await gate.locator('[data-terms-gate-decline]').click();
  await expect(gate, 'declining did not put the banner away').toBeHidden({ timeout: 15000 });
});

/**
 * Release day, for the accounts that already exist.
 *
 * Every account on the platform when `2026-09-18` ships accepted `2026-07-07` —
 * it is what production served until then. The first cut of
 * `TERMS_VERSIONS_IN_FORCE` left that version out, which would have refused all
 * 158 of them at every protected route until they clicked, on the same day the
 * Terms gained § 10.3 saying they may carry on under the version they accepted.
 * A QA review caught it (66a392dc1b6b); the owner chose "ask, do not shut out".
 *
 * This is the test that would have caught it, so it is written the way the day
 * actually looks: an account holding the version production served.
 */
test('an account on the previous published version is asked, and keeps working', async ({ page, request }) => {
  test.setTimeout(180 * 1000);

  const email = `terms-prev-${STAMP}@cleancore-test.io`;
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const cred = await createUserWithEmailAndPassword(getAuth(app), email, PASSWORD);
  await adminSetEmailVerified(cred.user.uid, true);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Terms', lastName: 'Previous', email,
    tier: 'pilot', status: 'approved', createdAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5,
    // What every existing account holds the moment the new version ships.
    termsVersionAccepted: '2026-07-07',
    mfaEnabled: false,
  });

  await page.goto('/?auth=signin');
  await page.waitForSelector('input[type="email"]', { timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForURL('**/dashboard', { timeout: 60000 });

  const gate = page.locator('[data-terms-gate]');
  await expect(gate, 'the existing account was not told the Terms changed').toBeVisible({ timeout: 60000 });
  await expect(
    gate,
    'release day would have locked out every existing account — the previous version is still in force',
  ).toHaveAttribute('data-terms-gate-mode', 'banner');
  await expect(gate.locator('[data-terms-gate-decline]')).toBeVisible();

  // And the product is usable behind it, which is what § 10.3 promises.
  await page.locator('h1, h2').first().click({ timeout: 15000 });

  // The assertion that actually decides release day: a *protected route*
  // answers. A clickable heading only shows that nothing covers the page; the
  // refusal § 10.3 forbids happens on the server, in
  // `assertAccountActive(..., { requireCurrentTerms: true })`, and this is the
  // only way to see it (QA review of 4b54de668a93).
  const token = await cred.user.getIdToken(true);
  const gated = await request.get('/api/model-stages', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(
    gated.status(),
    `a protected route refused an account on the previous, still-in-force Terms: ${await gated.text()}`,
  ).toBe(200);
});

test('the version production serves today is one the platform still honours', () => {
  // A unit-level backstop for the same fact, so it fails in milliseconds rather
  // than after a sign-in: the list must contain the version that was current
  // before the bump, or the release locks everybody out.
  expect(
    TERMS_VERSIONS_IN_FORCE,
    'the previously published Terms version is not in force — every existing account would be refused',
  ).toContain('2026-07-07');
  expect(TERMS_VERSIONS_IN_FORCE, 'the current version must always be in force').toContain(TERMS_VERSION);
});

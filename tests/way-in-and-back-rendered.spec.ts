import { test, expect, type Page } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminSetEmailVerified } from './helpers/admin-seed';
import { invitationCollectionPath, invitationLinkPath } from '../lib/invitations';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Roadmap 3.0.21 — "The way in and the way back work", in a browser: points 1,
 * 2, 3, 4, 8, 12, 13 and 15. Point 7 (one error boundary) is held in source by
 * `tests/way-in-and-back.spec.ts`, which also holds the pure halves of the
 * rest: a render error cannot be provoked in a production build without a test
 * hook in the product.
 */

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = 'WayInAndBack123!';
const OWNER = `wayin-owner-${STAMP}@cleancore-test.io`;
const READER = `wayin-reader-${STAMP}@cleancore-test.io`;
const STRANGER = `wayin-stranger-${STAMP}@cleancore-test.io`;
const SPENT = `wayin-spent-${STAMP}@cleancore-test.io`;
const PROJECT_ID = `wayin-${STAMP}`;
const INVITATION_ID = `Inv-${STAMP}`;
const uids: Record<string, string> = {};

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

async function account(email: string, firstName: string, lastName: string, extra: Record<string, unknown> = {}) {
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids[email] = cred.user.uid;
  await adminSetEmailVerified(cred.user.uid, true);
  await adminSetDoc('users', cred.user.uid, {
    firstName, lastName, email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    ...extra,
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(180 * 1000);
  await account(OWNER, 'Ada', 'Owner');
  await account(READER, 'Rita', 'Reader');
  await account(STRANGER, 'Sam', 'Stranger');
  await account(SPENT, 'Paul', 'Spent', { transformationsUsed: 5, transformationsLimit: 5 });
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Way in and back',
    userId: uids[OWNER],
    createdAt: new Date(),
    status: 'created',
    legacyCode: 'REPORT z_way_in.\n',
  });
  await adminSetDoc(invitationCollectionPath(PROJECT_ID), INVITATION_ID, {
    id: INVITATION_ID,
    projectId: PROJECT_ID,
    email: READER.toLowerCase(),
    invitedBy: { uid: uids[OWNER], name: 'Ada Owner' },
    invitedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
  });
});

async function submitSignIn(page: Page, email: string) {
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign in")');
}

test('(1, 15) a signed-out tool link goes to the neutral sign-in and comes back to the tool', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const here = `/project/${PROJECT_ID}/tco`;
  await page.goto(here, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.searchParams.get('auth') === 'signin', { timeout: 60000 });
  expect(new URL(page.url()).searchParams.get('next')).toBe(here);
  const dialog = page.locator('[data-access-dialog="signin"]');
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(dialog).toContainText('Sign in or create a free account');
  await expect(dialog).not.toContainText('Welcome Back');
  await expect(dialog.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('There is no page at this address');
  await submitSignIn(page, OWNER);
  await page.waitForURL(`**${here}`, { timeout: 60000 });
  await expect(page.locator('[data-stage-title]').first()).toBeVisible({ timeout: 60000 });
});

test('(1) a signed-in account without access reads one sentence on a tool link, too', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signInViaLanding(page, STRANGER, PASSWORD);
  await page.goto(`/project/${PROJECT_ID}/design`, { waitUntil: 'domcontentloaded' });
  const gate = page.locator('[data-project-gate="no-access"]');
  await expect(gate).toContainText('This project does not exist or is not shared with this account.', { timeout: 60000 });
  await expect(gate.getByRole('link', { name: 'Go to My workspace' })).toHaveAttribute('href', '/dashboard');
  await expect(page.locator('body')).not.toContainText('Way in and back');
});

test('(2, 3) the quota reads "runs left" everywhere, and the limit notice leads to the key card', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signInViaLanding(page, SPENT, PASSWORD);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-shell-quota]')).toHaveText('0 of 5 runs left', { timeout: 60000 });
  const link = page.locator('[data-own-key-link]').first();
  await expect(link).toHaveText('Add your own key');
  await expect(link).toHaveAttribute('href', '/settings#own-key');
  await link.click();
  await page.waitForURL('**/settings#own-key', { timeout: 60000 });
  await expect(page.locator('[data-settings-quota]')).toHaveText('0 of 5 runs left', { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Analysis runs', exact: true })).toBeVisible();
  await expect(page.getByText('Plan and usage')).toHaveCount(0);
  const card = page.locator('#own-key');
  await expect(card).toBeInViewport({ timeout: 10000 });
  await expect(card.locator('[data-own-key-mfa-link]')).toHaveAttribute('href', '#sign-in-security');
});

test('(4, 13) the invited reader sees the account, opens the project in one click, and reads one strip there and on every tool', async ({ page }) => {
  test.setTimeout(240 * 1000);
  const here = invitationLinkPath(PROJECT_ID, INVITATION_ID);
  // Signed out: sign-in and "Create an account", both coming back here.
  await page.goto(here, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-invitation-signup]')).toHaveAttribute('href', `/?auth=signup&next=${encodeURIComponent(here)}`, { timeout: 30000 });

  await signInViaLanding(page, READER, PASSWORD);
  await page.goto(here, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-invitation-account]')).toContainText(`Signed in as ${READER}`, { timeout: 60000 });
  await expect(page.locator('[data-invitation-switch]')).toHaveText('Use another account');
  await page.click('[data-invitation-accept]');
  await page.waitForURL(`**/project/${PROJECT_ID}`, { timeout: 60000 });
  const strip = page.locator('[data-reader-strip]');
  await expect(strip).toContainText('Shared with you for reading by Ada Owner — read only.', { timeout: 60000 });
  await page.goto(`/project/${PROJECT_ID}/testing`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-reader-strip]')).toHaveCount(1, { timeout: 60000 });
});

test('(8) a tab whose build the server no longer runs says so when it comes back into view, and does not reload', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signInViaLanding(page, OWNER, PASSWORD);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-shell-quota]')).toBeVisible({ timeout: 60000 });
  // From now on the server answers with a later build.
  await page.route('**/api/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', version: 'v99.0.0', commit: null }) }));
  const loads: string[] = [];
  page.on('load', () => loads.push(page.url()));
  // The once-a-minute throttle counts from the mount's question; move the clock past it.
  await page.evaluate(() => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + 120_000;
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const strip = page.locator('[data-new-version-strip]');
  await expect(strip).toContainText('Clean-Core.io was updated.', { timeout: 30000 });
  await expect(strip.getByRole('button', { name: 'Reload' })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(loads, 'the tab reloaded by itself').toEqual([]);
});

test('(12) the start names the target as one line, and the own-code footer follows the edition chosen', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signInViaLanding(page, OWNER, PASSWORD);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  const line = page.locator('[data-cc-workspace] [data-target-edition-line]');
  await expect(line).toHaveText(/Assessed against SAP Cloud ERP Private · Change/, { timeout: 90000 });

  await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
  await page.locator('[data-own-code-input]').setInputFiles([
    { name: 'Z_WAY_IN.abap', mimeType: 'text/plain', buffer: Buffer.from('REPORT z_way_in.\nWRITE / 1.\n', 'utf8') },
  ]);
  const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
  if (await ack.count()) await ack.check();
  const next = page.locator('[data-own-code-start-next]');
  await expect(next).toContainText('assessed against SAP Cloud ERP Private', { timeout: 30000 });
  await page.locator('[data-cc-own-code] [data-target-edition-change]').click();
  await page.locator('[data-cc-own-code] [data-target-edition-option="public"]').click();
  await expect(next).toContainText('assessed against SAP S/4HANA Cloud Public Edition');
  await expect(next).not.toContainText('SAP Cloud ERP Private');
});

test('(15) "already registered" offers "Sign in instead" and "Reset password"', async ({ page }) => {
  test.setTimeout(120 * 1000);
  await page.goto('/?auth=signup', { waitUntil: 'domcontentloaded' });
  const dialog = page.locator('[data-access-dialog="signup"]');
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await dialog.getByLabel('First Name').fill('Ada');
  await dialog.getByLabel('Last Name').fill('Again');
  await dialog.locator('input[type="email"]').fill(OWNER);
  const passwords = dialog.locator('input[type="password"]');
  await passwords.nth(0).fill(PASSWORD);
  await passwords.nth(1).fill(PASSWORD);
  // The two agreements are native checkboxes the library draws over.
  for (const box of await dialog.locator('input[type="checkbox"]').all()) await box.check({ force: true });
  await dialog.locator('button[type="submit"]').click();
  const error = dialog.locator('[data-auth-error="already-registered"]');
  await expect(error).toContainText('already registered', { timeout: 30000 });
  await expect(error.locator('[data-auth-reset-instead]')).toHaveText('Reset password');
  await error.locator('[data-auth-signin-instead]').click();
  await expect(page.locator('[data-access-dialog="signin"]')).toBeVisible();
  await expect(page.locator('[data-access-dialog="signin"] input[type="email"]')).toHaveValue(OWNER);
});

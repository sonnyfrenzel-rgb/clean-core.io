import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminSetEmailVerified } from './helpers/admin-seed';
import { invitationLinkPath } from '../lib/invitations';

/**
 * Roadmap 5.1 and 5.2, in a browser.
 *
 * Two of the phase's acceptance criteria are about what a person sees, and
 * neither can be proved from source:
 *
 *   * **the invitation dialog says „inklusive Quellcode" outright** — rendered,
 *     in the dialog, with nothing to hover over and nothing to unfold. A
 *     `title=` attribute or a popover would satisfy a source check and fail the
 *     criterion, because the owner is about to hand a third party a customer's
 *     ABAP and has to be told so where they decide;
 *   * **sign-in returns to the invitation link, and only to our own paths.** A
 *     `?next=` pointing anywhere else is discarded and the visitor lands on the
 *     dashboard, as they would have with no `next` at all.
 */

const STAMP = Date.now();
const EMAIL = `invitation-ui-${STAMP}@cleancore-test.io`;
const PASSWORD = 'InvitationUi123!';
const PROJECT_ID = `invitation-ui-${STAMP}`;
const INVITATION_ID = `Ab3-_${STAMP}`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  await adminSetEmailVerified(cred.user.uid, true);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Invitation', lastName: 'Ui', email: EMAIL,
    tier: 'pilot', status: 'approved', createdAt: new Date(),
    transformationsUsed: 1, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
  });
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Requisition release',
    userId: cred.user.uid,
    createdAt: new Date(),
    status: 'analyzed',
    legacyCode: 'REPORT z_invitation_ui.',
  });
});

/** The ordinary sign-in, unchanged — only the destination is under test. */
async function signIn(page: import('@playwright/test').Page, next?: string) {
  const url = next ? `/?auth=signin&next=${encodeURIComponent(next)}` : '/?auth=signin';
  await page.goto(url);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
}

test('the invitation dialog says, in the dialog, that this includes the source code', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  // The initials of the seeded profile: the shell has them only once the
  // profile has arrived, so this is the wait that makes the list meaningful.
  await expect(page.locator('[data-account-menu]')).toHaveText('IU', { timeout: 90000 });
  await page.waitForURL('**/dashboard', { timeout: 60000 });
  await page.waitForSelector('[data-invite-open]', { timeout: 60000 });

  await page.locator('[data-invite-open]').first().click();
  const dialog = page.locator('[data-invite-dialog]');
  await expect(dialog).toBeVisible();

  // Rendered text of the dialog itself. `innerText` does not include a `title`
  // attribute, a `hidden` element or anything a popover keeps in reserve — the
  // criterion is that it is read without being asked for.
  const scope = dialog.locator('[data-invite-scope]');
  await expect(scope).toBeVisible();
  const text = (await scope.innerText()).replace(/\s+/g, ' ');
  expect(text, 'the dialog does not say that the source code goes with it').toMatch(
    /including the ABAP source code/i,
  );
  // …and what it is not: reading, with the owner keeping every write.
  expect(text).toMatch(/Reading only/i);
  expect(text).toMatch(/signing and exporting stay with you/i);
  // The honest half of a withdrawal.
  expect(text).toMatch(/ends the access, not the memory/i);

  // Nothing had to be opened to read it: the dialog is one step from the list.
  expect(await dialog.locator('[data-invite-email]').count()).toBe(1);
});

test('sign-in comes back to the invitation link', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const here = invitationLinkPath(PROJECT_ID, INVITATION_ID);

  // Signed out, the page offers the ordinary sign-in with itself as the target.
  await page.goto(here);
  const link = page.locator('[data-invitation-signin]');
  await expect(link).toBeVisible({ timeout: 30000 });
  expect(await link.getAttribute('href')).toBe(`/?auth=signin&next=${encodeURIComponent(here)}`);

  await signIn(page, here);
  await page.waitForURL(`**${here}`, { timeout: 60000 });
  await expect(page.locator('[data-invitation-title]')).toBeVisible({ timeout: 30000 });
});

test('a target outside our own paths lands on the dashboard instead', async ({ page }) => {
  test.setTimeout(120 * 1000);
  await signIn(page, 'https://evil.example/harvest');
  await page.waitForURL('**/dashboard', { timeout: 60000 });
  expect(page.url()).not.toContain('evil.example');
});

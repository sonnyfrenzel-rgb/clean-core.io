import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';

/**
 * UX-015 and UX-104: the way back from a public page.
 *
 * Eleven pages inside the app shell are reachable without an account and are in
 * the sitemap, and they had four answers between them: "Back to Workspace" to
 * `/dashboard` (/how-to, /first-run), "Back to Dashboard" to the same place
 * (/verify-pack), a `router.back()` button labelled "Back" (/knowledge,
 * /how-it-works, /about, /tenant-security, /trust), and "Back to Homepage" to
 * `/` (/clean-core-explained and the three catalog explainers).
 *
 * `/dashboard` is behind the login, so a reader who arrived from a search result
 * was offered a way back to a sign-in dialog — UX-104, reported against
 * /first-run and true of three pages. `router.back()` has nowhere to go when the
 * page is the first in the history, which is the same reader; the button did
 * nothing at all. And `/` is a dead end for someone signed in.
 *
 * The decision is the one `app/(app)/layout.tsx` already applies to the shell
 * logo, and which `tests/landing-consistency-guard.spec.ts` pins there: home is
 * the workspace for someone signed in and the landing page for everyone else.
 *
 * Both halves are read from the rendered page. The signed-out half is the one
 * UX-104 is about and is checked on every page; the signed-in half is checked on
 * two of them, because it is the component that decides and not the page.
 */
const PUBLIC_PAGES = [
  '/how-to',
  '/first-run',
  '/knowledge',
  '/how-it-works',
  '/about',
  '/trust',
  '/tenant-security',
  '/verify-pack',
  '/clean-core-explained',
  '/clean-core-score',
  '/abap-custom-code-analysis',
  '/sap-clean-core-object-classification',
  '/sap-cloudification',
];

const STAMP = Date.now();
const EMAIL = `backnav-${STAMP}@cleancore-test.io`;
const PASSWORD = 'BackNavigation123!';

function emulatorAuth() {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  return auth;
}

test.describe('a reader who is not signed in', () => {
  for (const route of PUBLIC_PAGES) {
    test(`${route} offers one way back, and it is the homepage`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 200_000 });

      const back = page.locator('[data-back-link]');
      await expect(back, `${route} has exactly one back link`).toHaveCount(1);
      // Resolved href, so a relative "/dashboard" cannot hide behind a prefix.
      expect(new URL(await back.evaluate((el) => (el as HTMLAnchorElement).href)).pathname).toBe('/');
      await expect(back).toHaveText(/Back to Homepage/i);
      await expect(back).toHaveAttribute('data-back-link', 'home');

      // And nothing else on the page offers a "back" to a route behind the login.
      const strays = await page
        .locator('a[href="/dashboard"]')
        .evaluateAll((els) => els.map((el) => (el.textContent || '').trim()).filter((t) => /^back\b/i.test(t)));
      expect(strays, `${route} still has a "back" link into /dashboard`).toEqual([]);
    });
  }
});

test.describe('a reader who is signed in', () => {
  test.beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(emulatorAuth(), EMAIL, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Back',
      lastName: 'Navigation',
      email: EMAIL,
      tier: 'pilot',
      status: 'approved',
      transformationsUsed: 0,
      transformationsLimit: 5,
      createdAt: new Date(),
    });
  });

  test('the same link goes to the workspace, and says so', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/', { timeout: 200_000 });
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);

    for (const route of ['/how-to', '/knowledge']) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 200_000 });
      const back = page.locator('[data-back-link]');
      // The profile arrives after hydration, so the link settles rather than
      // being right on the first paint.
      await expect(back, `${route} sends a signed-in reader to the workspace`).toHaveAttribute(
        'data-back-link',
        'workspace',
        { timeout: 60_000 },
      );
      expect(new URL(await back.evaluate((el) => (el as HTMLAnchorElement).href)).pathname).toBe('/dashboard');
      await expect(back).toHaveText(/Back to Workspace/i);
    }
  });
});

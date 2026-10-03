import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { adminSetDoc, adminSetEmailVerified } from './helpers/admin-seed';

/**
 * The blocking Terms gate on a phone — owner report of 03.10.2026.
 *
 * With 3.0 every existing account meets the blocking gate at its next sign-in,
 * and many of them sign in on a phone. There the fixed header (title plus the
 * long explanation) and the stacked buttons left the scrolling body a few lines
 * tall, and "Read the Terms" opened a new tab. This spec holds the phone shape:
 * nothing runs off the side, both ways out are fully on screen, the body that
 * carries "What changed" is a real scrolling area, and the Terms can be read
 * without leaving the gate.
 */

const PASSWORD = 'TermsMobile123!';
const STALE = '2026-09-18';
const SHOT_DIR = process.env.TERMS_GATE_SHOT_DIR;

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

async function staleAccount(tag: string): Promise<string> {
  const email = `terms-mobile-${tag}-${Date.now()}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(clientAuth(), email, PASSWORD);
  await adminSetEmailVerified(cred.user.uid, true);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Terms', lastName: 'Mobile', email,
    tier: 'pilot', status: 'approved', createdAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: STALE,
    mfaEnabled: false,
  });
  return email;
}

async function signIn(page: Page, email: string) {
  await page.goto('/?auth=signin');
  await page.waitForSelector('input[type="email"]', { timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
}

const VIEWPORTS = [
  { name: 'small-android-360x640', width: 360, height: 640 },
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'landscape-844x390', width: 844, height: 390 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`the blocking Terms gate at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true });

    test('can be read and answered on a phone', async ({ page }) => {
      test.setTimeout(180 * 1000);
      await signIn(page, await staleAccount(vp.name));

      const gate = page.locator('[data-terms-gate]');
      await expect(gate, 'the stale account was not stopped').toBeVisible({ timeout: 60000 });
      await expect(gate).toHaveAttribute('data-terms-gate-mode', 'blocking');
      const dialog = gate.getByRole('dialog', { name: 'The Terms of Service have changed' });
      await expect(dialog).toBeVisible();
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${vp.name}.png` });

      // Nothing runs off the side — neither the page nor the dialog.
      const overflow = await page.evaluate(() => {
        const d = document.querySelector('[data-cc-dialog]') as HTMLElement;
        const offenders = Array.from(d.querySelectorAll('*'))
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .map((el) => el.tagName + (el.textContent ?? '').slice(0, 30));
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          dialog: d.scrollWidth - d.clientWidth,
          offenders,
        };
      });
      expect(overflow.page, 'the page scrolls sideways').toBeLessThanOrEqual(0);
      expect(overflow.dialog, 'the dialog scrolls sideways').toBeLessThanOrEqual(0);
      expect(overflow.offenders, 'elements of the gate run past the right edge').toEqual([]);

      // Both ways out are fully on screen, and big enough for a thumb.
      for (const selector of ['[data-terms-gate-accept]', '[data-terms-gate-signout]']) {
        const box = await gate.locator(selector).boundingBox();
        expect(box, `${selector} has no box`).not.toBeNull();
        expect(box!.x, `${selector} starts left of the screen`).toBeGreaterThanOrEqual(0);
        expect(box!.y, `${selector} starts above the screen`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${selector} runs past the right edge`).toBeLessThanOrEqual(vp.width);
        expect(box!.y + box!.height, `${selector} runs past the bottom`).toBeLessThanOrEqual(vp.height);
        expect(box!.height, `${selector} is smaller than a 44 px target`).toBeGreaterThanOrEqual(44);
      }

      // The title stays, and the body is a real scrolling area, not a slit.
      await expect(dialog.locator('h2')).toBeInViewport();
      const body = await page.evaluate(() => {
        const el = document.querySelector('[data-cc-dialog-body]') as HTMLElement;
        return { height: el.clientHeight, overflowY: getComputedStyle(el).overflowY };
      });
      expect(body.overflowY, 'the dialog body does not scroll').toBe('auto');
      expect(body.height, 'the scrolling body is too short to read in').toBeGreaterThanOrEqual(120);

      // The Terms can be reached: linked, and readable inside the gate.
      await expect(gate.locator('[data-terms-gate-link="terms"]')).toHaveAttribute('href', '/terms');
      await gate.locator('[data-terms-gate-inline] [data-cc-disclosure-trigger]').click();
      const text = gate.locator('[data-terms-gate-terms-text]');
      await expect(text, 'the Terms text did not load inside the gate').toContainText('Terms of Service', { timeout: 30000 });
      await expect(text.locator('h3, h4').first()).toBeVisible();
      await text.locator('h3, h4').first().scrollIntoViewIfNeeded();
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${vp.name}-terms-open.png` });
      // Still the gate, still answerable.
      await expect(gate.locator('[data-terms-gate-accept]')).toBeInViewport({ ratio: 1 });
      const stillNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(stillNoOverflow, 'the opened Terms text pushed the page sideways').toBeLessThanOrEqual(0);
    });
  });
}

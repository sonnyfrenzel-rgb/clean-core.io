import { test, expect } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { buildDemoShowcase } from '../lib/demo-showcase';
import {
  SHOWCASE_CONTINUE_LINE,
  SHOWCASE_STEP_COUNT,
  showcaseSteps,
} from '../lib/demo-showcase-copy';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The public demo showcase at `/demo` (roadmap 3.5.0 item 8, DEMO-1 to DEMO-3;
 * owner decisions 13.11.2026).
 *
 *   - every step has an address that opens it without an account, with the
 *     whole screen and the explained part in view (`/demo#step=N`, the end
 *     `#step=end`, a reader's emphasis `&lens=it`), and a pasted address moves
 *     an open page;
 *   - "Copy link to this step" puts that address on the clipboard;
 *   - the calls to action sign in through the landing page's dialog and return
 *     to My workspace with `?from=demo` (H2) or to the own-code start (H3);
 *   - My workspace says the one line only after the showcase (H2).
 *
 * Needs the app; the last test needs the emulators too.
 */

const data = buildDemoShowcase();
const counts = {
  ends: data.ends.reduce((a, e) => a + e.ids.length, 0),
  stops: data.ends.filter((e) => e.plane !== 'process').reduce((a, e) => a + e.ids.length, 0),
  topStop: (() => {
    const top = [...data.ends.filter((e) => e.plane !== 'process')].sort((a, b) => b.ids.length - a.ids.length)[0];
    return top ? { label: top.planeLabel, count: top.ids.length } : null;
  })(),
  changes: data.changes.length,
};
const STEPS = showcaseSteps(data.facts, counts);

test.describe('every step has an address that works without an account', () => {
  for (let n = 1; n <= SHOWCASE_STEP_COUNT; n++) {
    test(`/demo#step=${n} opens step ${n} with its part in view`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/demo#step=${n}`, { waitUntil: 'load' });
      const root = page.locator('[data-showcase]');
      await expect(root).toHaveAttribute('data-showcase-ready', 'true', { timeout: 60_000 });
      await expect(root).toHaveAttribute('data-showcase-step', String(n));
      await expect(page.locator('#showcase-step-title')).toHaveText(STEPS[n - 1].title);
      const part = page.locator('[data-showcase-target]');
      await expect(part.first()).toHaveAttribute('data-showcase-part', STEPS[n - 1].part);
      expect(await part.count()).toBe(await page.locator(`[data-showcase-part="${STEPS[n - 1].part}"]`).count());
      await expect(part.first()).toBeInViewport({ ratio: 0.2 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  }

  test('on a phone, every step’s address opens with its (first) part out from under the sheet', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    for (let n = 1; n <= SHOWCASE_STEP_COUNT; n++) {
      await page.goto(`/demo#step=${n}`, { waitUntil: 'load' });
      await expect(page.locator('[data-showcase]')).toHaveAttribute('data-showcase-step', String(n), { timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const covered = await page.evaluate(() => {
        const b = document.querySelector('[data-showcase-box]')!.getBoundingClientRect();
        let area = 0;
        for (const el of [...document.querySelectorAll('[data-showcase-target]')].slice(0, 1)) {
          const r = el.getBoundingClientRect();
          area += Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left)) * Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
        }
        return Math.round(area);
      });
      expect(covered, `step ${n}: the explained part is under the sheet`).toBe(0);
    }
  });

  test('/demo#step=end opens the end, and a lens comes with the address', async ({ page }) => {
    await page.goto('/demo#step=end&lens=it', { waitUntil: 'load' });
    await expect(page.locator('[data-showcase]')).toHaveAttribute('data-showcase-step', 'end', { timeout: 60_000 });
    await expect(page.locator('#showcase-end-title')).toHaveText('Analyze your custom code');
    await expect(page.getByRole('radio', { name: 'IT' })).toHaveAttribute('aria-checked', 'true');
  });

  test('a pasted address moves the open page, and the steps write their own', async ({ page }) => {
    await page.goto('/demo', { waitUntil: 'load' });
    const root = page.locator('[data-showcase]');
    await expect(root).toHaveAttribute('data-showcase-ready', 'true', { timeout: 60_000 });
    await expect(root).toHaveAttribute('data-showcase-step', '1');
    await page.evaluate(() => {
      window.location.hash = '#step=7';
    });
    await expect(root).toHaveAttribute('data-showcase-step', '7');
    await page.keyboard.press('ArrowRight');
    await expect(root).toHaveAttribute('data-showcase-step', '8');
    expect(new URL(page.url()).hash).toBe('#step=8');
    await page.getByRole('radio', { name: 'Management' }).click();
    expect(new URL(page.url()).hash).toBe('#step=8&lens=management');
    await page.keyboard.press('End');
    await expect(root).toHaveAttribute('data-showcase-step', 'end');
    expect(new URL(page.url()).hash).toBe('#step=end&lens=management');
  });

  test('an address it does not know opens the start', async ({ page }) => {
    for (const hash of ['#step=0', '#step=11', '#step=x', '#step=4.5']) {
      await page.goto(`/demo${hash}`, { waitUntil: 'load' });
      await expect(page.locator('[data-showcase]')).toHaveAttribute('data-showcase-step', '1', { timeout: 60_000 });
    }
  });
});

test('"Copy link to this step" copies the step\'s own address', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/demo#step=4', { waitUntil: 'load' });
  await expect(page.locator('[data-showcase]')).toHaveAttribute('data-showcase-step', '4', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Copy link to this step' }).first().click();
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/demo#step=4`);
  await expect(page.getByRole('status')).toContainText('Link copied');

  // On a phone the box's own row is hidden; the bar carries the copy button.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('radio', { name: 'IT' }).click();
  await page.locator('[data-showcase-copy="bar"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/demo#step=4&lens=it`);
});

test('the calls to action sign in through the landing dialog and return where the showcase says', async ({ page }) => {
  await page.goto('/demo#step=end', { waitUntil: 'load' });
  await expect(page.locator('[data-showcase]')).toHaveAttribute('data-showcase-step', 'end', { timeout: 60_000 });
  // Signed out, AuthLink points at the dialog on this page; signed in it would go there directly.
  await expect(page.getByTestId('showcase-cta-primary')).toHaveAttribute('href', '?auth=signin&next=/dashboard?from=demo');
  await expect(page.getByTestId('showcase-cta-own')).toHaveAttribute('href', '?auth=signin&next=/admin/new-project/upload');
  await expect(page.getByTestId('showcase-cta-own')).toHaveText('See it with your own code: 3 steps');
  await expect(page.getByTestId('showcase-signin')).toHaveAttribute('href', '?auth=signin&next=/dashboard?from=demo');
  await page.getByTestId('showcase-cta-primary').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('auth')).toBe('signin');
  expect(new URL(page.url()).searchParams.get('next')).toBe('/dashboard?from=demo');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 });

  await page.goto('/demo#step=4', { waitUntil: 'load' });
  await expect(page.getByTestId('showcase-rules-own')).toHaveAttribute('href', '?auth=signin&next=/admin/new-project/upload');
  await expect(page.getByTestId('showcase-rules-own')).toHaveText('Find the rules in your own program');
});

test('the page says own Claude keys come on 23 December 2026, and calls no model', async ({ page }) => {
  const model: string[] = [];
  await page.route('**/api/**', async (r) => {
    model.push(r.request().url());
    await r.abort();
  });
  await page.goto('/demo#step=3', { waitUntil: 'load' });
  await expect(page.locator('.why')).toContainText('Claude from 23 December 2026');
  await page.goto('/demo#step=end', { waitUntil: 'load' });
  await expect(page.locator('[data-showcase-end]')).toContainText('Gemini, and Claude from 23 December 2026');
  expect(model, 'the showcase called an API route').toEqual([]);
});

/* ------------------------------------------------- H2, needs the emulators */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(app);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
const PASSWORD = 'Showcase123!';
const EMAIL = `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;

test('My workspace says the one line after the showcase, and only then', async ({ page }) => {
  test.setTimeout(240 * 1000);
  const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Demo', lastName: 'Visitor', email: EMAIL, tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, transformationsUsed: 0, transformationsLimit: 5,
    createdAt: new Date(),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInViaLanding(page, EMAIL, PASSWORD);

  await page.goto('/dashboard?from=demo', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-home-first-view]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-home-from-demo]')).toHaveText(SHOWCASE_CONTINUE_LINE);

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-home-first-view]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-home-from-demo]')).toHaveCount(0);

  await page.goto('/dashboard?from=demox', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-home-first-view]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-home-from-demo]')).toHaveCount(0);
});

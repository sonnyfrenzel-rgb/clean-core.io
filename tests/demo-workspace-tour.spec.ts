import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { DEMO_TITLE_PREFIX } from '../lib/demo-marks';
import { TOUR_STATIONS, TOUR_STORAGE_KEY } from '../lib/demo-tour';

/**
 * The demo workspace and its tour, rendered — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * The model is proven in `tests/demo-tour.spec.ts`; this spec proves that the
 * screen does what the model says: one station at a time, at its place, "3 of
 * 12" as text, the invitation after every third and at the end with the strip's
 * link stepping back meanwhile, progress kept in this browser, "Show tips
 * again" in the help menu — and that a community account still gets a 404.
 *
 * Needs the dev server and the emulators, like every signed-in spec.
 */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ADMIN = `demo-tour-admin-${STAMP}@cleancore-test.io`;
const COMMUNITY = `demo-tour-community-${STAMP}@cleancore-test.io`;
const PASSWORD = `spec-${process.pid}-Aa1!`;

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

async function openDemo(page: Page, query = '') {
  await page.goto(`/demo/workspace${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90000 });
}

/** The one station or invitation on screen — and there is never more than one. */
async function onlyStop(page: Page) {
  const stops = page.locator('[data-demo-tour-station], [data-demo-tour-invitation]');
  await expect(stops).toHaveCount(1, { timeout: 30000 });
  return stops.first();
}

test.beforeAll(async () => {
  test.setTimeout(180 * 1000);
  const profile = {
    tier: 'pilot', status: 'approved', transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  };
  const admin = await createUserWithEmailAndPassword(auth, ADMIN, PASSWORD);
  await adminSetCustomClaim(admin.user.uid, { admin: true });
  await adminSetDoc('users', admin.user.uid, {
    ...profile, firstName: 'Demo', lastName: 'Tour', email: ADMIN, isAdmin: true, workspaceShell: true,
  });
  const community = await createUserWithEmailAndPassword(auth, COMMUNITY, PASSWORD);
  await adminSetDoc('users', community.user.uid, {
    ...profile, firstName: 'Demo', lastName: 'Community', email: COMMUNITY, isAdmin: false,
  });
});

test('a community account gets the 404 the workspace gives it', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signIn(page, COMMUNITY);
  await page.goto('/demo/workspace', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await expect(page.locator('[data-demo-workspace]')).toHaveCount(0);
  // The workspace's 404 is the root `app/not-found.tsx`: `notFound()` in the
  // client shell bubbles past the `(app)` layout, so this page carries no
  // account menu — exactly as `/project/{id}` for the same account.
  await expect(page.locator('h1')).toHaveText('404');
  await expect(page.locator('[data-account-menu]')).toHaveCount(0);
  // And no help-menu entry for tips that do not exist for it, where the menu is.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  // The initials say the shell holds this account's profile, so the menu is
  // the one it gets — not the empty shell before the profile arrives.
  await expect(page.locator('[data-account-menu]')).toHaveText('DC', { timeout: 90000 });
  await page.click('[data-account-menu]');
  await expect(page.locator('#account-menu-panel')).toBeVisible();
  await expect(page.locator('[data-show-tips-again]')).toHaveCount(0);
});

test('marked as the demo, unsigned, in all three views', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN);
  for (const view of ['business', 'it', 'management'] as const) {
    await openDemo(page, `?view=${view}`);
    await expect(page.locator(`[data-demo-workspace="${view}"]`)).toBeVisible();
    await expect(page.locator('[data-workspace-title]')).toContainText(DEMO_TITLE_PREFIX.trim());
    await expect(page.locator('[data-demo-unsigned]')).toContainText('never signed');
    // Every layer of the anchor bar is reachable, filled or saying why not.
    await expect(page.locator('[data-workspace-layer-section]')).toHaveCount(1);
  }
  // IT shows the engine's findings without asking a route for them.
  await openDemo(page, '?view=it');
  await expect(page.locator('[data-demo-tour-place="it-chain"]')).toBeVisible();
});

test('twelve stations, one at a time, with the invitation after every third and at the end', async ({ page }) => {
  test.setTimeout(300 * 1000);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN);
  await openDemo(page, '?view=business');
  await page.evaluate((key) => window.localStorage.removeItem(key), TOUR_STORAGE_KEY);
  await openDemo(page, '?view=business');

  let invitations = 0;
  for (let i = 0; i < TOUR_STATIONS.length; i += 1) {
    const station = TOUR_STATIONS[i];
    const stop = await onlyStop(page);
    await expect(stop).toHaveAttribute('data-demo-tour-station', station.place);
    await expect(stop.locator('[data-demo-tour-position]')).toHaveText(`Tour · ${i + 1} of ${TOUR_STATIONS.length}`);
    // The station stands at its place, in its view.
    await expect(page.locator(`[data-demo-workspace="${station.view}"]`)).toBeVisible();
    await expect(page.locator(`[data-demo-tour-place="${station.place}"] [data-demo-tour-station]`)).toHaveCount(1);
    await stop.locator('[data-demo-tour-next]').click();

    if ((i + 1) % 3 === 0 || i === TOUR_STATIONS.length - 1) {
      const card = await onlyStop(page);
      await expect(card).toHaveAttribute('data-demo-tour-invitation', station.place);
      await expect(card.locator('[data-demo-tour-new-project] a')).toHaveAttribute('href', '/admin/new-project');
      // At most one invitation per screen: the strip's link steps back.
      await expect(page.locator('[data-demo-invitation]')).toHaveCount(0);
      invitations += 1;
      if (i === TOUR_STATIONS.length - 1) {
        await card.locator('[data-demo-tour-end]').click();
      } else {
        await card.locator('[data-demo-tour-continue]').click();
      }
    }
  }
  expect(invitations).toBe(4);
  await expect(page.locator('[data-demo-tour-station], [data-demo-tour-invitation]')).toHaveCount(0);
  await expect(page.locator('[data-demo-tour-restart]')).toBeVisible();
});

test('progress lives in this browser: it survives a reload, pauses, and "Show tips again" starts over', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN);
  await openDemo(page, '?view=business');
  await page.evaluate((key) => window.localStorage.removeItem(key), TOUR_STORAGE_KEY);
  await openDemo(page, '?view=business');

  await (await onlyStop(page)).locator('[data-demo-tour-next]').click();
  await expect(await onlyStop(page)).toHaveAttribute('data-demo-tour-station', TOUR_STATIONS[1].place);

  await openDemo(page, '?view=business');
  await expect(await onlyStop(page)).toHaveAttribute('data-demo-tour-station', TOUR_STATIONS[1].place);
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), TOUR_STORAGE_KEY);
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ index: 1, state: 'running' });

  await (await onlyStop(page)).locator('[data-demo-tour-pause]').click();
  await expect(page.locator('[data-demo-tour-station]')).toHaveCount(0);
  await page.click('[data-demo-tour-resume]');
  await expect(await onlyStop(page)).toHaveAttribute('data-demo-tour-station', TOUR_STATIONS[1].place);

  // In another view the station waits and the header says where.
  await openDemo(page, '?view=management');
  await expect(page.locator('[data-demo-tour-station]')).toHaveCount(0);
  await expect(page.locator('[data-demo-tour-go]')).toBeVisible();

  await page.click('[data-account-menu]');
  await page.click('[data-show-tips-again]');
  await openDemo(page, '?view=business');
  await expect(await onlyStop(page)).toHaveAttribute('data-demo-tour-station', TOUR_STATIONS[0].place);
});

test('a browser that refuses storage still gets the demo and the tour', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN);
  await page.addInitScript(() => {
    const refuse = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;
    Storage.prototype.removeItem = refuse;
  });
  await openDemo(page, '?view=business');
  await expect(await onlyStop(page)).toHaveAttribute('data-demo-tour-station', TOUR_STATIONS[0].place);
});

test('confirming a rule and the route changes this browser only, and "Reset demo" throws it away', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN);
  await openDemo(page, '?view=business');
  const confirm = page.locator('[data-demo-confirm-rule]').first();
  await expect(confirm).toHaveAttribute('aria-pressed', 'false', { timeout: 60000 });
  await confirm.click();
  await expect(confirm).toHaveAttribute('aria-pressed', 'true');
  await openDemo(page, '?view=business');
  await expect(page.locator('[data-demo-confirm-rule]').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await page.click('[data-demo-reset]');
  await expect(page.locator('[data-demo-confirm-rule]').first()).toHaveAttribute('aria-pressed', 'false');
});

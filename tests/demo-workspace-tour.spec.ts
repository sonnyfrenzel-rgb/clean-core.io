import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { DEMO_TITLE_PREFIX } from '../lib/demo-marks';
import { TOUR_STATIONS, TOUR_STORAGE_KEY } from '../lib/demo-tour';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The demo workspace and its tour, rendered — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * The model is proven in `tests/demo-tour.spec.ts`; this spec proves that the
 * screen does what the model says: one station at a time, at its place, "3 of
 * 12" as text, the invitation after every third and at the end with the strip's
 * link stepping back meanwhile, progress kept in this browser, "Show tips
 * again" in the help menu — and, since roadmap 3.0.1 (ADR-061), that a
 * community account gets all of it too, while a visitor without an account is
 * sent through sign-in.
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
  await signInViaLanding(page, email, PASSWORD);
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
    ...profile, firstName: 'Demo', lastName: 'Tour', email: ADMIN, isAdmin: true,
  });
  const community = await createUserWithEmailAndPassword(auth, COMMUNITY, PASSWORD);
  await adminSetDoc('users', community.user.uid, {
    ...profile, firstName: 'Demo', lastName: 'Community', email: COMMUNITY, isAdmin: false,
  });
});

test('a community account opens the demo workspace and its tour, and has "Show tips again" (3.0.1)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signIn(page, COMMUNITY);
  await openDemo(page);
  await expect(page.locator('[data-demo-workspace]')).toHaveCount(1);
  await expect(page.locator('[data-workspace-title]')).toContainText(DEMO_TITLE_PREFIX.trim());
  // The tour starts for it as for anybody: one stop on screen.
  await page.evaluate((key) => window.localStorage.removeItem(key), TOUR_STORAGE_KEY);
  await openDemo(page);
  await onlyStop(page);
  // And the help-menu entry for the tips is there, where the menu is.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  // The initials say the shell holds this account's profile, so the menu is
  // the one it gets — not the empty shell before the profile arrives.
  await expect(page.locator('[data-account-menu]')).toHaveText('DC', { timeout: 90000 });
  await page.click('[data-account-menu]');
  await expect(page.locator('#account-menu-panel')).toBeVisible();
  await expect(page.locator('[data-show-tips-again]')).toHaveCount(1);
});

test('a visitor without an account is sent through sign-in and back, not to a 404', async ({ page }) => {
  test.setTimeout(120 * 1000);
  await page.goto('/demo/workspace', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/[?&]auth=signin&next=%2Fdemo%2Fworkspace/, { timeout: 60000 });
  await expect(page.locator('[data-demo-workspace]')).toHaveCount(0);
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
    // It opens on Need & process, and in the demo that layer is the process map (mockup s15).
    await expect(page.locator('[data-workspace-layer-section="need"] [data-demo-tour-place="process-map"], [data-workspace-layer-section="need"]').first()).toBeVisible();
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

test('answering the rules as the product asks them changes this browser only, and "Reset demo" throws it away', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signIn(page, ADMIN);
  await openDemo(page, '?view=business');
  // The product's "Decide on rules", its four answers, and its checks.
  await page.locator('[data-demo-rules-edit]').click({ timeout: 60000 });
  const cards = page.locator('[data-demo-rule-edit]');
  const first = (await cards.nth(0).getAttribute('data-demo-rule-edit'))!;
  const second = (await cards.nth(1).getAttribute('data-demo-rule-edit'))!;
  await expect(cards.nth(0).locator('[data-rule-option]')).toHaveText([/Keep/, /Change/, /Drop/, /Clarify/]);
  await cards.nth(0).locator('[data-rule-option="keep"]').click();
  await cards.nth(1).locator('[data-rule-option="clarify"]').click();
  // A Clarify without its question is not recorded.
  await page.click('[data-demo-rules-record]');
  await expect(page.locator('[data-demo-rules-editor]')).toBeVisible();
  await cards.nth(1).locator('textarea').fill('Purchasing: is plant 1000 still the central warehouse?');
  await page.click('[data-demo-rules-record]');
  const row = (id: string) => page.locator(`[data-demo-rule="${id}"]`);
  await expect(row(first)).toHaveAttribute('data-demo-rule-answer', 'keep');
  await expect(row(second)).toHaveAttribute('data-demo-rule-answer', 'clarify');
  // Kept in this browser: the answers are there after a reload.
  await openDemo(page, '?view=business');
  await expect(row(first)).toHaveAttribute('data-demo-rule-answer', 'keep', { timeout: 60000 });
  await page.click('[data-demo-reset]');
  await expect(row(first)).toHaveAttribute('data-demo-rule-answer', 'none');
});

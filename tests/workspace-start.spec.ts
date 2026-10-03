import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

/**
 * How a project starts (ADR-066). Owner, 03.10.2026 (translated): "The start
 * in the workspace after uploading a code example, or starting from an
 * example, is unsatisfying, on mobile as on desktop. … the complete process
 * map is created directly … There is also no back-to-workspace button." And:
 * "the process was reconstructed, but Need & process says something else."
 *
 * Each test starts a shipped example from "My workspace" as an ordinary
 * community account with no model stage on, and holds:
 *
 *   1. the start ends on the full map — more than the main line's two nodes —
 *      drawn from a run the start signed, without a visit to Analyze, without
 *      a model call, and for the example's free first run without a unit;
 *   2. "My workspace" is one link away on a desktop and on a phone;
 *   3. under reduced motion the end state stands at once;
 *   4. no tip stands over the first look;
 *   5. Need & process says what the map holds, with the map's own counts.
 */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'WorkspaceStart123!';
const EXAMPLE = 'Z_SALES_ORDER_CREATOR';

async function communityAccount(prefix: string): Promise<{ email: string; uid: string }> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Workspace', lastName: 'Start', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    modelStages: { analyze: false, naming: false, statements: false },
  });
  return { email, uid: cred.user.uid };
}

/** Every main-frame address the page reaches, and every model request it makes. */
function watch(page: Page) {
  const visited: string[] = [];
  const model: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  page.on('request', (req) => {
    if (req.url().includes('/api/gemini')) model.push(req.url());
  });
  return { visited, model };
}

/** Whether a tip ever stood while the first look was still building — recorded from the first paint. */
async function recordTipsDuringBuildUp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tipWhileBuilding: boolean; __sawBuilding: boolean };
    w.__tipWhileBuilding = false;
    w.__sawBuilding = false;
    new MutationObserver(() => {
      const building = !!document.querySelector('[data-first-look="building"]');
      if (building) w.__sawBuilding = true;
      if (building && document.querySelector('[data-coach-mark]')) w.__tipWhileBuilding = true;
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

async function startExample(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.stop()).catch(() => {});
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const list = page.locator('[data-cc-workspace]');
  await expect(list).toBeVisible({ timeout: 90000 });
  await page.setViewportSize(viewport);
  const start = list.locator(`[data-example-start="${EXAMPLE}"]`).first();
  if (!(await start.isVisible().catch(() => false))) {
    await list.locator('[data-examples-more] button').first().click({ timeout: 60000 });
  }
  await start.click({ timeout: 60000 });
  await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
  return new URL(page.url()).pathname.split('/')[2];
}

/** "Process with 8 steps and 1 decision." → [8, 1] */
async function mapCounts(page: Page): Promise<[number, number]> {
  const text = (await page.locator('[data-workspace-process="ready"] [data-process-map-overview]').first().textContent()) ?? '';
  const m = /(\d+) steps?.*?(\d+) decisions?/.exec(text);
  expect(m, `the map's overview says no counts: "${text}"`).not.toBeNull();
  return [Number(m![1]), Number(m![2])];
}

test.describe('a project starts on its full map (ADR-066)', () => {
  test('an example from My workspace: build-up, signed at the start, full map, Need & process agrees', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const { email, uid } = await communityAccount('ws-start');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    await recordTipsDuringBuildUp(page);
    const seen = watch(page);
    const projectId = await startExample(page, { width: 1440, height: 900 });

    // The build-up, paced: a rail of moments, the first one current.
    await expect(page.locator('[data-first-look="building"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-first-look-rail-step]')).toHaveCount(6);
    await expect(page.locator('[data-first-look="complete"]')).toBeVisible({ timeout: 60000 });

    // (1) The full map, drawn from a run the start signed.
    const map = page.locator('[data-workspace-process="ready"] [data-process-map]');
    await expect(map).toBeVisible({ timeout: 90000 });
    const [steps, decisions] = await mapCounts(page);
    expect(steps + decisions, 'the map is the two-node main line').toBeGreaterThan(2);
    const stored = await adminGetDoc('projects', projectId);
    expect(typeof stored?.activeRunId, 'the map stands without a signed run').toBe('string');
    expect(seen.visited.filter((u) => u.includes('/analyze')), 'the start went through Analyze').toEqual([]);
    expect(seen.model, 'the start called the model').toEqual([]);
    // The example's free first run, as the card said: no unit spent.
    const account = await adminGetDoc('users', uid);
    expect(account?.transformationsUsed ?? 0).toBe(0);
    expect(account?.starterExamplesUsed?.[EXAMPLE]).toBe(true);

    // (2) The way back, on a desktop.
    const back = page.locator('[data-workspace-back]');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/dashboard');

    // (4) No tip stood over the first look while it was building, and none stands over it now.
    const flags = await page.evaluate(() => {
      const w = window as unknown as { __tipWhileBuilding: boolean; __sawBuilding: boolean };
      return { __tipWhileBuilding: w.__tipWhileBuilding, __sawBuilding: w.__sawBuilding };
    });
    expect(flags.__sawBuilding, 'the recorder never saw the build-up — the tip check would be vacuous').toBe(true);
    expect(flags.__tipWhileBuilding, 'a tip stood while the first look was building').toBe(false);
    const tip = page.locator('[data-coach-mark][data-coach-form="popover"]');
    if (await tip.count()) {
      const [a, b] = await Promise.all([tip.first().boundingBox(), page.locator('[data-first-look]').boundingBox()]);
      const overlaps = !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlaps, 'the tip covers the first look').toBe(false);
    }

    // (5) Need & process says what the map holds — not "empty", not "nothing on record".
    const tab = page.locator('[data-workspace-layers] [data-workspace-layer="need"]');
    await expect(tab).toBeVisible({ timeout: 30000 });
    await expect(tab).not.toContainText('empty');
    const section = page.locator('[data-workspace-layer-section="need"]');
    await expect(section).not.toContainText('Nothing on record');
    const summary = section.locator('[data-workspace-layer-process]');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expect(summary).toHaveAttribute('data-steps', String(steps));
    await expect(summary).toHaveAttribute('data-decisions', String(decisions));
    await expect(tab).toContainText(`${steps} step`);
  });

  test('on a phone: the build-up, the full map, the way back — no horizontal scroll', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const { email } = await communityAccount('ws-start-phone');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    await startExample(page, { width: 390, height: 844 });

    await expect(page.locator('[data-first-look="complete"]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);

    // (2) The way back, on a phone: visible, a 44 px target, and it leads to the list.
    const back = page.locator('[data-workspace-back]');
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeVisible();
    const box = await back.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await back.click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  });

  test('(3) under reduced motion the end state stands at once — no build-up', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const { email } = await communityAccount('ws-start-reduced');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, email, PASSWORD);
    await recordTipsDuringBuildUp(page);
    await startExample(page, { width: 1440, height: 900 });

    await expect(page.locator('[data-first-look="end-state"]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-first-look="end-state"]')).toHaveAttribute('data-reduced-motion', 'true');
    const flags = await page.evaluate(() => ({
      __sawBuilding: (window as unknown as { __sawBuilding: boolean }).__sawBuilding,
    }));
    expect(flags.__sawBuilding, 'a build-up played under reduced motion').toBe(false);
    // The signed map still arrives.
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
  });
});

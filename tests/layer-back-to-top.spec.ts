import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../lib/coach-marks';

/**
 * "Back to top of section" goes to the top of the section (owner, 06.10.2026:
 * "'Back to top of section' doesn't work").
 *
 * It did not, because it stood where there was nowhere to go: *Need & process*
 * in Business is one sentence tall — the map and the rules it counts stand
 * above it — yet the link was offered by `layer.total`, which counts them, so
 * it sat three lines under its own heading and a click moved nothing. The link
 * now stands only under a section taller than the room below the sticky bars
 * (`components/workspace/LayerSection.tsx`), and where it stands a click brings
 * the section's heading back into view, under the bars, not behind them.
 *
 * Walked at a desktop and a phone width on a project whose run the route
 * signed, so the map, the rules and the Standard fit table are the real ones.
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const FILE = 'Z_MM_PO_APPROVAL.abap';
const PO = fs.readFileSync(path.resolve('public/starter-examples', FILE), 'utf8').replace(/\r\n/g, '\n');

async function idToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

/** Where the heading stands against the sticky bars and the bottom of the viewport. */
async function headingPlace(page: Page, key: string) {
  return page.evaluate((k) => {
    const heading = document.getElementById(`layer-title-${k}`)!.getBoundingClientRect();
    const bar = document.querySelector('[data-workspace-layers]')!.getBoundingClientRect();
    return { top: heading.top, bottom: heading.bottom, barBottom: bar.bottom, viewport: window.innerHeight };
  }, key);
}

const inView = (p: { top: number; bottom: number; barBottom: number; viewport: number }) =>
  p.top >= p.barBottom - 1 && p.bottom <= p.viewport;

test.describe('"Back to top of section" (owner 06.10.2026)', () => {
  test.describe.configure({ mode: 'serial' });
  let account: SeededProject;
  let id = '';

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    account = await seedStageProject({ prefix: 'backtop', acceptTerms: true });
    const token = await idToken(account.email, account.password);
    id = `${account.projectId}-po`;
    await adminSetDoc('projects', id, { name: 'Z_MM_PO_APPROVAL', userId: account.uid, createdAt: new Date(), status: 'created', legacyCode: PO });
    const res = await fetch(`${BASE}/api/runs/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id, s4Deployment: 'private', analysis: '', uploadedFileName: FILE }),
    });
    expect(res.ok, `the run was not signed: ${res.status}`).toBe(true);
  });

  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    test(`${vp.name}: the link stands only where it can move, and brings the heading back into view`, async ({ page }) => {
      test.setTimeout(300_000);
      // The tour moves the page on "Next"; this spec measures the page without it.
      await page.addInitScript(
        ([k, ids]) => window.localStorage.setItem(k as string, JSON.stringify(ids)),
        [COACH_MARK_STORAGE_KEY, [...COACH_MARK_IDS]] as const,
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await signInThroughForm(page, account);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/project/${id}?view=business`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 120_000 });

      // Need & process: one sentence under the map in Business — no link that cannot move.
      const need = page.locator('[data-workspace-layer-section="need"]');
      await expect(need.locator('[data-workspace-layer-above]')).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1000);
      await expect(need.locator('[data-workspace-layer-top]')).toHaveCount(0);

      // Standard fit: the table of the signed source is taller than the screen — the link stands.
      await page.locator('[data-workspace-layers] [data-workspace-layer="standard"]').click();
      const fit = page.locator('[data-workspace-layer-section="standard"]');
      await expect(fit.locator('[data-standard-fit=""]')).toBeVisible({ timeout: 90_000 });
      const top = fit.locator('[data-workspace-layer-top]');
      await expect(top, 'the Standard fit table is long enough to need the way back').toBeVisible({ timeout: 30_000 });

      await top.scrollIntoViewIfNeeded();
      const before = await headingPlace(page, 'standard');
      expect(inView(before), `the heading is already in view before the click: ${JSON.stringify(before)}`).toBe(false);

      const urlBefore = page.url();
      const historyBefore = await page.evaluate(() => history.length);
      await top.click();
      await expect
        .poll(async () => inView(await headingPlace(page, 'standard')), { timeout: 10_000 })
        .toBe(true);
      // No second history entry: the fragment is the selected section already.
      expect(page.url()).toBe(urlBefore);
      expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    });
  }
});

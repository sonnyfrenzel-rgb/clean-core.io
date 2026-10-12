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
 * signed, so the map, the rules and the evidence are the real ones.
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
    // Business has no layer bar since ADR-096: the shell bar is what covers the top.
    const bar = document.querySelector('[data-workspace-layers]')?.getBoundingClientRect() ?? { bottom: 0 };
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

      // Need & process is not a section of Business (ADR-080) — the map is the
      // process there — so nothing of it can carry a link that cannot move.
      await expect(page.locator('[data-workspace-layer-section="need"]')).toHaveCount(0);
      await expect(page.locator('[data-workspace-layers] [data-workspace-layer="need"]')).toHaveCount(0);

      // Evidence & controls, Business's one section since Standard fit moved
      // to IT (ADR-096), is a few rows tall: no link that cannot move. The
      // long section this spec clicked through was Standard fit; with it in
      // IT, no Business section on this project is taller than the screen, so
      // the click half has no section to walk (owner, 12.10.2026).
      const evidence = page.locator('[data-workspace-layer-section="evidence"]');
      await expect(evidence).toBeVisible({ timeout: 60_000 });
      const tall = await evidence.evaluate((el) => {
        const offset = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
        return el.getBoundingClientRect().height > window.innerHeight - offset;
      });
      await expect(evidence.locator('[data-workspace-layer-top]')).toHaveCount(tall ? 1 : 0);
      if (tall) {
        const before = await headingPlace(page, 'evidence');
        await evidence.locator('[data-workspace-layer-top]').scrollIntoViewIfNeeded();
        await evidence.locator('[data-workspace-layer-top]').click();
        await expect.poll(async () => inView(await headingPlace(page, 'evidence')), { timeout: 10_000 }).toBe(true);
        expect(before).toBeTruthy();
      }
    });
  }
});

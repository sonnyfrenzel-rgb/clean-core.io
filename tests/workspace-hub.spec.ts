import { expect, test, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../lib/coach-marks';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';

/**
 * "Work from this process" — the central work area under the map in the
 * Business view (ADR-072).
 *
 * Owner, 06.10.2026 (translated): "After the initial analysis, the box 'Work
 * from this process' must be much more prominent and clearly designed, so that
 * the process gets going and people think beyond the business world — today
 * this box is easy to overlook."
 *
 * After a signed run the hub carries, in this order: its title, the concrete
 * next step (the same one "Next step" at the top names — never a second
 * decision), the three views as entries that say what each audience gets from
 * this process, and the seven tools with their state. The page keeps exactly
 * one primary button: the hub's step is a secondary action, because the
 * page's main action is in "Next step" (`DESIGN.md` §1.5).
 *
 * With `HUB_SHOTS_DIR` set, the first test also writes desktop and phone
 * screenshots of the hub there, for a reader to look at.
 */

const PO = fs.readFileSync(path.resolve('public/starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.HUB_SHOTS_DIR || '';

async function idToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

async function withoutTips(page: Page) {
  await page.addInitScript(
    ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
    [COACH_MARK_STORAGE_KEY, [...COACH_MARK_IDS]] as const,
  );
}

test.describe('the work area under the map, after a signed run', () => {
  let account: Awaited<ReturnType<typeof seedStageProject>>;
  let projectId = '';

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    account = await seedStageProject({ prefix: 'hub', acceptTerms: true });
    const token = await idToken(account.email, account.password);
    projectId = `${account.projectId}-po`;
    await adminSetDoc('projects', projectId, {
      name: 'Z_MM_PO_APPROVAL',
      userId: account.uid,
      createdAt: new Date(),
      status: 'created',
      legacyCode: PO,
    });
    const res = await fetch(`${BASE}/api/runs/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, s4Deployment: 'private', analysis: '', uploadedFileName: 'Z_MM_PO_APPROVAL.abap' }),
    });
    expect(res.ok, `the run was not signed: ${res.status}`).toBe(true);
  });

  async function open(page: Page) {
    await withoutTips(page);
    await signInThroughForm(page, account);
    await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="business"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-next-step]')).toBeVisible({ timeout: 60_000 });
  }

  for (const vp of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    test(`the hub leads with the next step, the three views and the seven tools — ${vp.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await open(page);

      const hub = page.locator('[data-workspace-hub]');
      await expect(hub).toBeVisible();

      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.waitForTimeout(1500);
        await hub.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const el = document.querySelector('[data-workspace-hub]');
          if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80);
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-viewport.png`) });
        await hub.screenshot({ path: path.join(SHOTS, `${vp.name}-hub.png`) });
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-full.png`), fullPage: true });
      }

      // A landmark with its own heading.
      await expect(hub.getByRole('heading', { level: 2, name: 'Work from this process' })).toBeVisible();

      // The next step, the same one "Next step" at the top names.
      const next = hub.locator('[data-workspace-hub-next]');
      await expect(next).toBeVisible();
      const topKey = await page.locator('[data-next-step] [data-next-step-key]').getAttribute('data-next-step-key');
      await expect(next).toHaveAttribute('data-workspace-hub-next', topKey ?? 'none');
      await expect(next.locator('[data-workspace-hub-next-action]')).toBeVisible();

      // The three views, each saying what its audience gets; Business is where the reader is.
      const views = hub.locator('[data-workspace-hub-view]');
      await expect(views).toHaveCount(3);
      await expect(hub.locator('[data-workspace-hub-view="business"]')).toHaveAttribute('aria-current', 'true');
      await expect(hub.locator('[data-workspace-hub-view="it"]')).toContainText(/findings/i);
      await expect(hub.locator('[data-workspace-hub-view="management"]')).toContainText(/retire/i);

      // The seven tools, with their state from the phase contract.
      await expect(hub.locator('[data-workspace-hub-stage]')).toHaveCount(7);
      await expect(hub.locator('[data-workspace-hub-stage="analyze"]')).toHaveAttribute('data-phase-state', 'done');

      // Still exactly one primary button on the page.
      await expect(page.locator('[data-workspace-shell] [data-cc-button="primary"]:visible')).toHaveCount(1);

      // Opening IT from the hub switches the view.
      await hub.locator('[data-workspace-hub-view="it"]').click();
      await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 30_000 });
    });
  }

  /**
   * "Your analysis is ready" (ADR-090, owner 10.10.2026): with Design proposed
   * next, a first-time reader walked from Business past Analyze. Until this
   * browser has opened Analyze for the project, the hub says the analysis is
   * ready with the signed run's figures and the Analyze tool carries "Result
   * ready"; once Analyze has been opened, both are gone — and the next step
   * is the same before and after, because the phase contract never moved.
   */
  test('the analysis is pointed at until Analyze has been opened once, and the next step does not move', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);

    const hub = page.locator('[data-workspace-hub]');
    const ready = hub.locator('[data-analysis-ready]');
    await expect(ready).toBeVisible({ timeout: 30_000 });
    await expect(ready).toContainText('Your analysis is ready');
    // The figures are the run's: as many findings as the worklist holds.
    await expect(ready).toContainText(/\d+ findings? in the signed run/);
    const analyzeTool = page.locator('[data-workspace-tools="open"] [data-workspace-tool="analyze"]');
    await expect(analyzeTool).toHaveAttribute('data-phase-state', 'done');
    await expect(analyzeTool).toHaveAttribute('data-workspace-tool-unread', '');
    await expect(analyzeTool.locator('[data-workspace-tool-result-ready]')).toHaveText('Result ready');
    const nextBefore = await hub.locator('[data-workspace-hub-next]').getAttribute('data-workspace-hub-next');
    expect(nextBefore).not.toBe('analyze');
    // Still exactly one primary button: the hint's action is secondary.
    await expect(page.locator('[data-workspace-shell] [data-cc-button="primary"]:visible')).toHaveCount(1);

    // Read the analysis — Analyze opens with the signed run and marks it read.
    await ready.locator('[data-analysis-ready-action] a').click();
    await expect(page).toHaveURL(new RegExp(`/project/${projectId}/analyze`), { timeout: 60_000 });
    await expect(page.locator('[data-stage-title]')).toBeVisible({ timeout: 90_000 });
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('cc.workspace.analysis.read') ?? ''), { timeout: 60_000 })
      .toContain(projectId);

    // Back in the workspace the pointer is gone; the phase and the next step are as they were.
    await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90_000 });
    await expect(hub.locator('[data-workspace-hub-next-action]')).toBeVisible({ timeout: 60_000 });
    await expect(analyzeTool).toHaveAttribute('data-phase-state', 'done');
    await expect(hub.locator('[data-analysis-ready]')).toHaveCount(0);
    await expect(analyzeTool).not.toHaveAttribute('data-workspace-tool-unread', '');
    await expect(page.locator('[data-workspace-tool-result-ready]')).toHaveCount(0);
    await expect(hub.locator('[data-workspace-hub-next]')).toHaveAttribute('data-workspace-hub-next', nextBefore ?? 'none');
  });
});

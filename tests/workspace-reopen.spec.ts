import { expect, test, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../lib/coach-marks';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { workflowSteps } from '../lib/workflow-steps';

/**
 * A project reopened far along its way — owner, 12.10.2026 (translated):
 * "Strange how the tool presents itself when you reopen an old project."
 * His screenshot of a 2,000-line CO program showed an empty "Next step" card
 * (only its title) and "First insights" standing on "Reading <file>.".
 *
 * Measured: both waited for the first look's reading of the source, and that
 * reading — under a second — stood behind the process map's layout, some 12 s
 * on the main thread for that program, run twice (the summary and the map
 * asked for it under two process names, so the cache never hit). The page
 * now paints the reading first and lays the map out once, after it; the
 * next-step placeholder says what it is waiting for; and a reading that fails
 * says so instead of "Reading …" for ever.
 *
 * Held here, rendered:
 *   - "Next step" never shows its title alone, in any frame;
 *   - "First insights" leaves "Reading …" and lands before the map is drawn;
 *   - at 1440 and at 390 the page settles with a next step that names an action.
 *
 * `REOPEN_SOURCE` points at another program to seed (a large one shows the
 * order most clearly); `REOPEN_SHOTS_DIR` writes screenshots for a reader.
 */

const SOURCE_PATH =
  process.env.REOPEN_SOURCE || path.resolve('public/starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n');
const FILE_NAME = path.basename(SOURCE_PATH);
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.REOPEN_SHOTS_DIR || '';

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

interface ReopenWatch {
  /** Frames in which "Next step" showed only its title. */
  emptyNextStep: number;
  /** Milliseconds the page spent showing that empty card, frozen frames included. */
  emptyMs: number;
  /** When the next step first settled on an action ('open') or on nothing left ('none'). */
  nextAt: number | null;
  /** When the first look reached its end state ('end-state' / 'complete') or said it failed ('failed'). */
  firstLookAt: number | null;
  /** When the map was drawn. */
  mapAt: number | null;
  /** The longest gap between two frames — a main thread held by one task. */
  longestFrame: number;
}

/**
 * Watches the page from its first script on: every frame in which "Next step"
 * shows only its title, the moments the next step and the first look settle
 * and the map is drawn, and the longest frame. A sampler in the page, not polls
 * from the test — a state that lasts a few frames would slip between two
 * polls, and a frozen page answers no poll at all.
 */
async function watchReopen(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __reopen: ReopenWatch };
    w.__reopen = { emptyNextStep: 0, emptyMs: 0, nextAt: null, firstLookAt: null, mapAt: null, longestFrame: 0 };
    let last = performance.now();
    let wasEmpty = false;
    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      if (document.querySelector('[data-workspace-shell="business"]')) {
        w.__reopen.longestFrame = Math.max(w.__reopen.longestFrame, gap);
        if (wasEmpty) w.__reopen.emptyMs += gap;
      }
      const card = document.querySelector('[data-workspace-shell="business"] [data-coach-target="next-step"] > *');
      wasEmpty = false;
      if (card) {
        const heading = card.querySelector('h2, h3')?.textContent?.trim() ?? '';
        const all = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (all === heading) {
          w.__reopen.emptyNextStep += 1;
          wasEmpty = true;
        }
        // Settled only: an action to take ('open') or nothing left ('none').
        // The pending card carries no state, and 'running' is still under way.
        const settled = card.querySelector('[data-next-step-state="open"], [data-next-step-state="none"]');
        if (settled && (settled.textContent ?? '').trim() && w.__reopen.nextAt === null) w.__reopen.nextAt = now;
      }
      // Its end state or its failure — never 'waiting' or 'building'.
      const state = document.querySelector('[data-first-look]')?.getAttribute('data-first-look');
      if ((state === 'end-state' || state === 'complete' || state === 'failed') && w.__reopen.firstLookAt === null) {
        w.__reopen.firstLookAt = now;
      }
      if (document.querySelector('[data-workspace-process="ready"] [data-process-map]') && w.__reopen.mapAt === null) {
        w.__reopen.mapAt = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test.describe('a project reopened far along its way', () => {
  let account: Awaited<ReturnType<typeof seedStageProject>>;
  let projectId = '';

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    account = await seedStageProject({ prefix: 'reopen', acceptTerms: true });
    const token = await idToken(account.email, account.password);
    projectId = `${account.projectId}-co`;
    await adminSetDoc('projects', projectId, {
      name: 'Reopened example',
      userId: account.uid,
      createdAt: new Date(),
      status: 'created',
      legacyCode: SOURCE,
    });
    const res = await fetch(`${BASE}/api/runs/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, s4Deployment: 'private', analysis: '', uploadedFileName: FILE_NAME }),
    });
    expect(res.ok, `the run was not signed: ${res.status}`).toBe(true);
    // Far along, as the owner's project was: a design signed off, code and a
    // blueprint generated. The next step is then one of the later tools.
    await adminMergeDoc('projects', projectId, {
      solutionDesign: '# Target architecture\n\nSide-by-side on SAP BTP (CAP).\n',
      approvedByArchitect: true,
      approvedBy: account.email,
      generatedCode: 'export const ok = true;\n',
      documentation: '# Blueprint\n\nLevel 1.\n',
    });
  });

  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    test(`next step never empty, first insights not stuck on "Reading" — ${vp.name}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await withoutTips(page);
      await signInThroughForm(page, account);
      await watchReopen(page);
      await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-workspace-shell="business"]')).toBeVisible({ timeout: 90_000 });

      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        // What a reader sees first, before anything settled.
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-early.png`) });
      }

      // The first look leaves "Reading …" and stands in its end state.
      await expect(page.locator('[data-first-look="end-state"], [data-first-look="complete"], [data-first-look="failed"]')).toBeVisible({ timeout: 120_000 });
      // The next step settles on an action: a label, the reason for it, and
      // the control that starts it — not the pending sentence.
      const nextStep = page.locator('[data-workspace-shell="business"] [data-next-step]');
      const settled = nextStep.locator('[data-next-step-state="open"]');
      await expect(settled).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('[data-workspace-shell="business"] [data-next-step-pending]')).toHaveCount(0);
      await expect(settled.locator('p').first()).toHaveText(/\S/);
      await expect(settled.locator('[data-next-step-reason]')).toHaveText(/\S/);
      await expect(nextStep.locator('a[href], button').first()).toBeVisible();
      // The map is drawn.
      await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 180_000 });

      const seen = await page.evaluate(() => (window as unknown as { __reopen: ReopenWatch }).__reopen);
      test.info().annotations.push({ type: 'reopen', description: JSON.stringify(seen) });
      console.log(`[reopen ${vp.name}] ${JSON.stringify(seen)}`);
      expect.soft(seen.emptyNextStep, 'frames in which "Next step" showed only its title').toBe(0);
      expect.soft(seen.nextAt, 'the next step named something').not.toBeNull();
      expect.soft(seen.firstLookAt, 'the first look reached its end state').not.toBeNull();
      expect.soft(seen.mapAt, 'the map was drawn').not.toBeNull();
      // The cheap reading and the next step are painted before the expensive
      // map is laid out, never after it.
      expect.soft(seen.firstLookAt ?? Infinity, 'first insights landed before the map').toBeLessThanOrEqual(seen.mapAt ?? 0);
      expect.soft(seen.nextAt ?? Infinity, 'the next step settled before the map').toBeLessThanOrEqual(seen.mapAt ?? 0);

      // The first insights hold a reading, not the waiting line.
      await expect(page.locator('[data-first-look]').first()).not.toContainText(`Reading ${FILE_NAME}.`);

      if (SHOTS) {
        // Where the seven tools stand on the settled page — said for a reader.
        const toolsTop = await page.evaluate(() => {
          const el = document.querySelector('[data-workspace-hub]');
          return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
        });
        console.log(`[reopen ${vp.name}] tools hub at y=${toolsTop}, viewport height ${vp.height}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-settled.png`) });
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-settled-full.png`), fullPage: true });
      }
    });
  }

  /**
   * Re-entry (ADR-099, Sonny 12.10.2026): one fixed line under the title says
   * what the page is, and the seven tools stand in one compact row above
   * "Next step" — open from breakpoint L, a "Tools" menu below it.
   */
  test('a returning reader finds the intro line and the seven tools in the first screen — 1440', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withoutTips(page);
    await signInThroughForm(page, account);
    await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="business"]')).toBeVisible({ timeout: 90_000 });

    await expect(page.locator('[data-workspace-intro]')).toHaveText(
      'Your project’s workspace: the process from the code, and the seven tools.',
    );

    const bar = page.locator('[data-workspace-head-tools="open"]');
    await expect(bar).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-workspace-head-tools="menu"]'), 'a menu beside the open bar at L').toBeHidden();
    const box = await bar.boundingBox();
    expect(box, 'the head tool bar has a box').not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0), 'the head tool bar ends above the fold').toBeLessThanOrEqual(900);

    // Above "Next step", in the DOM and on the screen.
    const nextStep = page.locator('[data-workspace-shell="business"] [data-coach-target="next-step"]');
    await expect(nextStep).toBeVisible({ timeout: 60_000 });
    const nextBox = await nextStep.boundingBox();
    expect(box?.y ?? 0, 'the tool bar stands above Next step').toBeLessThan(nextBox?.y ?? 0);

    // The seven tools, the same marks and exactly one "Next" tag — read from the
    // phase contract, as on the full bar in the work area.
    const links = bar.locator('a[data-workspace-tool]');
    await expect(links).toHaveCount(7);
    await expect(bar.locator('a[data-workspace-tool-next]')).toHaveCount(1);
    await expect(bar.locator('[data-tools-legend="head"]')).toBeVisible();
    const keys = workflowSteps(null).map((s) => s.key);
    for (const key of keys) {
      await expect(bar.locator(`a[data-workspace-tool="${key}"]`)).toHaveAttribute(
        'href',
        new RegExp(`^/project/${projectId}/${key}\\?view=business&from=workspace-head-tools`),
      );
    }
    // The full bar's state per tool agrees with the head bar's.
    const head = await links.evaluateAll((els) => els.map((el) => `${el.getAttribute('data-workspace-tool')}:${el.getAttribute('data-phase-state')}`));
    const full = await page
      .locator('[data-workspace-tools="open"] a[data-workspace-tool]')
      .evaluateAll((els) => els.map((el) => `${el.getAttribute('data-workspace-tool')}:${el.getAttribute('data-phase-state')}`));
    expect(head).toEqual(full);

    // Keyboard: the first tool takes the focus and Enter opens its stage.
    const first = links.first();
    await first.focus();
    await expect(first).toBeFocused();
    const target = await first.getAttribute('data-workspace-tool');
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(`/project/${projectId}/${target}\\?`), { timeout: 90_000 });
  });

  test('on a phone the head carries a "Tools" menu in the first screen — 390', async ({ browser }) => {
    test.setTimeout(300_000);
    // A phone, not a narrow desktop window: the 44 px target is the coarse
    // pointer's (CcButton's pointer-coarse:min-h-11), as on business-view-clarity.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await withoutTips(page);
    await signInThroughForm(page, account);
    await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="business"]')).toBeVisible({ timeout: 90_000 });

    await expect(page.locator('[data-workspace-intro]')).toBeVisible();
    await expect(page.locator('[data-workspace-head-tools="open"]'), 'the open bar on a phone').toBeHidden();
    const button = page.locator('[data-workspace-head-tools="menu"] button[aria-expanded]');
    await expect(button).toBeVisible({ timeout: 60_000 });
    const box = await button.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0), 'the Tools button ends above the fold').toBeLessThanOrEqual(844);
    expect(box?.height ?? 0, 'a 44 px target').toBeGreaterThanOrEqual(44);

    // Keyboard: Enter opens the panel, the seven tools are in it, Escape closes
    // it and hands the focus back to the button.
    await button.focus();
    await page.keyboard.press('Enter');
    const panel = page.locator('[data-workspace-head-tools-panel]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('a[data-workspace-tool]')).toHaveCount(7);
    await expect(panel.locator('a[data-workspace-tool-next]')).toHaveCount(1);
    await expect(panel.locator('a[data-workspace-tool="testing"]')).toHaveAttribute(
      'href',
      new RegExp(`^/project/${projectId}/testing\\?view=business&from=workspace-head-tools`),
    );
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();
    await context.close();
  });
});

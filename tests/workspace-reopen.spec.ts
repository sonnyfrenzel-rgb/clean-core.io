import { expect, test, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
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
 * Since v3.1.0 a project reopens in Analyze, Business (plan AB-2, ADR-109):
 * the map is the page, the first insights and "Next step" stand below it until
 * v3.2.0, and the seven tools are the stage header's. The same promises are
 * held there. Since 3.2.0 (plan AB-4) the way on in Analyze, Business is the
 * summary's invitation, not "Next step": the watch below holds it to the same
 * two promises — never an empty frame, settled before the map.
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
  // The coach marks retired with the workspace page (3.5.0, AB-11): nothing to keep out of the way.
  void page;
}

interface ReopenWatch {
  /** Frames in which the way on (since 3.2.0 the invitation, before it "Next step") stood without its action. */
  emptyNextStep: number;
  /** Milliseconds the page spent showing that empty card, frozen frames included. */
  emptyMs: number;
  /** When the way on first stood with its action. */
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
      if (document.querySelector('[data-analyze-business="ready"]')) {
        w.__reopen.longestFrame = Math.max(w.__reopen.longestFrame, gap);
        if (wasEmpty) w.__reopen.emptyMs += gap;
      }
      // Since 3.2.0 (plan AB-4) Analyze, Business has no "Next step": the way on is the summary's invitation (or,
      // after the walk-through, its two endings). Watched the same way: never an empty frame, settled before the map.
      const card = document.querySelector(
        '[data-analyze-business="ready"] [data-analyze-invitation], [data-analyze-business="ready"] [data-analyze-walked]',
      );
      wasEmpty = false;
      if (card) {
        const all = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!all || !card.querySelector('button, a[href]')) {
          w.__reopen.emptyNextStep += 1;
          wasEmpty = true;
        } else if (w.__reopen.nextAt === null) w.__reopen.nextAt = now;
      }
      // The text around the map (3.2.0, AB-6, where the first look stood): its end state or its failure — never
      // 'reading' for good.
      const state = document.querySelector('[data-around-the-map]')?.getAttribute('data-around-the-map');
      if ((state === 'ready' || state === 'failed') && w.__reopen.firstLookAt === null) {
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
      // The old address; the project opens in Analyze, Business.
      await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 90_000 });

      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        // What a reader sees first, before anything settled.
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-early.png`) });
      }

      // The text around the map leaves its placeholders and stands in its end state.
      await expect(page.locator('[data-around-the-map="ready"], [data-around-the-map="failed"]')).toBeVisible({ timeout: 120_000 });
      // The way on settles on an action: since 3.2.0 (AB-4) the invitation "Walk me through it" — "Next step" left
      // Analyze, Business — with its button, never an empty frame.
      const invitation = page.locator('[data-analyze-invitation]');
      await expect(invitation).toBeVisible({ timeout: 60_000 });
      await expect(invitation.locator('[data-analyze-walk=""]')).toHaveText(/\S/);
      await expect(page.locator('[data-next-step]')).toHaveCount(0);
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

      // The text around the map holds a reading, not its placeholders.
      await expect(page.locator('[data-around-the-map] [data-around-waiting]')).toHaveCount(0);
      await expect(page.locator('[data-analyze-summary] [data-around-waiting]')).toHaveCount(0);

      if (SHOTS) {
        // Where the seven tools stand on the settled page — said for a reader.
        const toolsTop = await page.evaluate(() => {
          const el = document.querySelector('[data-stage-toolbar]');
          return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
        });
        console.log(`[reopen ${vp.name}] tools at y=${toolsTop}, viewport height ${vp.height}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-settled.png`) });
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-settled-full.png`), fullPage: true });
      }
    });
  }

  /**
   * Re-entry (ADR-099, Sonny 12.10.2026): the page says what it is, and the
   * seven tools stand in the first screen — open from breakpoint L, a "Tools"
   * menu below it. Since v3.1.0 the project reopens in Analyze, Business (AB-2):
   * the stage header carries both — its title and lead, and the seven tools
   * with the soft-gate note. (The workspace's own intro line and head tool row
   * went with its Business view.)
   */
  test('a returning reader finds what the page is and the seven tools in the first screen — 1440', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withoutTips(page);
    await signInThroughForm(page, account);
    await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-stage-title]')).toBeVisible();
    await expect(page.locator('[data-stage-header] p').first()).toHaveText(/\S/);

    const bar = page.locator('[data-stage-toolbar] [data-stage-tools="open"]');
    await expect(bar).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-stage-toolbar] [data-stage-tools="menu"]'), 'a menu beside the open bar at L').toBeHidden();
    const box = await bar.boundingBox();
    expect(box, 'the tool bar has a box').not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0), 'the tool bar ends above the fold').toBeLessThanOrEqual(900);
    // Above the map and above "Next step", in the DOM and on the screen.
    const mapBox = await page.locator('[data-analyze-map]').boundingBox();
    expect(box?.y ?? 0, 'the tool bar stands above the map').toBeLessThan(mapBox?.y ?? 0);

    // The seven tools, read from the phase contract, each a link to its stage.
    const links = bar.locator('a[data-workspace-tool]');
    await expect(links).toHaveCount(7);
    const keys = workflowSteps(null).map((s) => s.key);
    for (const key of keys) {
      await expect(bar.locator(`a[data-workspace-tool="${key}"]`)).toHaveAttribute('href', new RegExp(`^/project/${projectId}/${key}(\\?|$)`));
    }

    // Keyboard: a tool takes the focus and Enter opens its stage.
    const first = bar.locator('a[data-workspace-tool="design"]');
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    // Before the walk-through in this browser the soft gate holds the first plain activation for one note (ADR-118
    // (4)); nothing is locked: its "Continue to …" link opens the stage, by keyboard as well.
    const note = page.locator('[data-analyze-soft-gate]');
    await expect(note).toBeFocused();
    const go = note.locator('a[data-analyze-soft-gate-continue]');
    await go.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(`/project/${projectId}/design(\\?|$)`), { timeout: 90_000 });
  });

  test('on a phone the stage header carries the tool strip, "1 of 7", in the first screen — 390', async ({ browser }) => {
    test.setTimeout(300_000);
    // A phone, not a narrow desktop window: the 44 px target is the coarse
    // pointer's (CcButton's pointer-coarse:min-h-11), as on business-view-clarity.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await withoutTips(page);
    await signInThroughForm(page, account);
    await page.goto(`/project/${projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 90_000 });

    // The family's tool strip (ADR-140, UX review L5): the same row as on a desktop, "1 of 7" where "Tools" stands,
    // every tool with its mark, no menu.
    const strip = page.locator('[data-stage-toolbar] [data-stage-tools="open"]');
    await expect(strip).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-stage-toolbar] [data-stage-tools="menu"]')).toHaveCount(0);
    await expect(strip.locator('[data-stage-tools-position]')).toContainText('1 of 7');
    await expect(strip.locator('a[data-workspace-tool]')).toHaveCount(7);
    const current = strip.locator('a[aria-current="page"]');
    const box = await current.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0), 'the tool strip ends above the fold').toBeLessThanOrEqual(844);
    expect(box?.height ?? 0, 'a 44 px target').toBeGreaterThanOrEqual(44);
    // No sideways scroll of the page: the strip scrolls inside itself.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await context.close();
  });
});

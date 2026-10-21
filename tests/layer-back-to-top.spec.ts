import { test, expect, type Page } from './helpers/test';
import fs from 'node:fs';
import path from 'node:path';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
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
 * Walked on a project whose run the route signed, so the map, the rules and
 * the evidence are the real ones: at a desktop and a phone width, where the
 * one section Business has left (Evidence & controls, ADR-096) is shorter than
 * the screen and carries no link; and at 320 × 256 (400 % zoom), where it is
 * taller and the link is clicked.
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
    // Every row Evidence & controls can hold (signed run, source fingerprint,
    // audit pack, ATC results), so the section is as tall as it gets.
    await adminMergeDoc('projects', id, {
      auditMetadata: { auditPackExportedAt: new Date().toISOString() },
      atcReport: { findings: [], source: 'atc', importedAt: new Date().toISOString(), warnings: [] },
    });
  });

  async function openBusiness(page: Page, vp: { width: number; height: number }) {
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
    const evidence = page.locator('[data-workspace-layer-section="evidence"]');
    await expect(evidence).toBeVisible({ timeout: 60_000 });
    // All four rows are in, so the height measured below is the final one.
    await expect(evidence.locator('[data-workspace-layer-row]')).toHaveCount(4, { timeout: 60_000 });
    return evidence;
  }

  /** Whether the section is taller than the room its `scroll-margin-top` leaves — the component's own rule. */
  const tallerThanRoom = (el: Element) => {
    const offset = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
    return el.getBoundingClientRect().height > window.innerHeight - offset;
  };

  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    test(`${vp.name}: a section shorter than the screen carries no link`, async ({ page }) => {
      test.setTimeout(300_000);
      const evidence = await openBusiness(page, vp);

      // Need & process is not a section of Business (ADR-080) — the map is the
      // process there — so nothing of it can carry a link that cannot move.
      await expect(page.locator('[data-workspace-layer-section="need"]')).toHaveCount(0);
      await expect(page.locator('[data-workspace-layers] [data-workspace-layer="need"]')).toHaveCount(0);

      // Evidence & controls, Business's one section since Standard fit moved
      // to IT (ADR-096), holds at most four rows: at an ordinary screen it is
      // shorter than the room under the bars, so it offers no link that
      // cannot move (owner, 06.10.2026).
      expect(await evidence.evaluate(tallerThanRoom), 'Evidence & controls is shorter than the screen').toBe(false);
      await expect(evidence.locator('[data-workspace-layer-top]')).toHaveCount(0);
    });
  }

  /**
   * The click half. The only section that carries the link is Evidence &
   * controls (`components/workspace/LayerSection.tsx`, Business only since
   * ADR-096), and its four rows outgrow the room under the bars only on a short
   * screen — so it is walked at 320 × 256, the reflow size of WCAG 1.4.10
   * (1280 × 1024 at 400 % zoom), where a reader really does lose the heading.
   */
  test('320 x 256 (400 % zoom): the link stands under the tall section and brings its heading back into view', async ({ page }) => {
    test.setTimeout(300_000);
    const evidence = await openBusiness(page, { width: 320, height: 256 });
    const link = evidence.locator('[data-workspace-layer-top]');

    expect(await evidence.evaluate(tallerThanRoom), 'Evidence & controls is taller than the room at 400 %').toBe(true);
    await expect(link).toHaveCount(1);

    // The reader at the end of the section: the link at the bottom of the
    // screen, the heading out of sight (off the top or under a sticky bar).
    await link.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await expect.poll(() => headingSeen(page, 'evidence'), { timeout: 5_000 }).toBe(false);
    const urlBefore = page.url();
    const historyBefore = await page.evaluate(() => window.history.length);

    await link.click();
    await expect.poll(() => headingSeen(page, 'evidence'), { timeout: 10_000 }).toBe(true);
    // Under the bars, not behind them, and inside the viewport.
    expect(inView(await headingPlace(page, 'evidence'))).toBe(true);
    // A scroll, not a navigation: the address and the history stay as they were.
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);
  });
});

/**
 * Whether the reader can see the heading: inside the viewport, and the
 * topmost element at its middle is the heading itself — not a sticky bar
 * standing over it.
 */
async function headingSeen(page: Page, key: string): Promise<boolean> {
  return page.evaluate((k) => {
    const heading = document.getElementById(`layer-title-${k}`);
    if (!heading) return false;
    const r = heading.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) return false;
    const hit = document.elementFromPoint(r.left + Math.min(8, r.width / 2), (r.top + r.bottom) / 2);
    return hit !== null && heading.contains(hit);
  }, key);
}

import { test, expect, type Page } from '@playwright/test';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminGetDoc, adminMergeDoc } from './helpers/admin-seed';

/**
 * Owner, 02.10.2026, on the Design stage (translated):
 *
 *   "the buttons in design don't work properly, full screen doesn't open here,
 *   make sure everything can be navigated cleanly"
 *
 * The ⤢ under the canvas looked like full screen and was "Fit", which at a
 * column narrower than the drawing changed nothing; there was no full screen.
 * The controls sat at the foot of a tall column, far from the drawing. Now they
 * sit on the drawing's own card — zoom out, the scale, zoom in, fit, full
 * screen — and full screen is the card filling the window, left by Escape or
 * by its own button, with the focus handed back.
 *
 *   "when I press confirm target in design, a small dialog box has to open
 *   so that I confirm it, otherwise it is easy to click by mistake"
 *
 * "Confirm target" asks first. Cancel and Escape write nothing; only the box's
 * own "Confirm target" signs off, with the command it always used.
 *
 * `DESIGNCTL_SHOTS=<dir>` writes screenshots of the canvas, full screen and the
 * question at 1440 and 390 px.
 */

const SHOTS = process.env.DESIGNCTL_SHOTS;

const DESIGN_JSON = JSON.stringify({
  projectName: 'Canvas controls fixture',
  architectureOverview: {
    approachDescription: 'Side-by-side CAP service that reads sales orders through released APIs.',
    nodeFramework: 'SAP CAP (Cloud Application Programming model)',
    runtimePlatform: 'SAP BTP (Business Technology Platform)',
  },
  nodeAppBlueprint: { projectStructure: [{ path: 'srv/service.cds', purpose: 'Service' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Released API calls', description: 'Synchronous calls through the destination service.' },
  securityHardening: [],
  roadmap: [],
});

async function openDesign(page: Page, prefix: string) {
  const seeded = await seedStageProject({ prefix, acceptTerms: true, rich: true });
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('svg[data-architecture-canvas]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });
  return seeded;
}

const scale = (page: Page) => page.locator('[data-canvas-zoom]').getAttribute('data-canvas-zoom').then(Number);
const drawnWidth = (page: Page) => page.locator('svg[data-architecture-canvas]').getAttribute('width').then(Number);

/** The control is what a pointer at its centre hits — nothing lies on top of it. */
async function expectOnTop(page: Page, selector: string) {
  const hit = await page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return Boolean(top && (top === el || el.contains(top)));
  });
  expect(hit, `${selector} is covered`).toBe(true);
}

/** Where the drawing sits in its scroll box: whole, centred, and filling one side (or at the largest step). */
async function fitInBox(page: Page) {
  return page.locator('[data-canvas-scroll]').evaluate((box) => {
    const svg = box.querySelector('svg[data-architecture-canvas]')!.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const zoom = Number(box.getAttribute('data-canvas-zoom'));
    const left = svg.left - b.left;
    const right = b.right - svg.right;
    const top = svg.top - b.top;
    const bottom = b.bottom - svg.bottom;
    return {
      zoom,
      whole: box.scrollWidth <= box.clientWidth + 1 && box.scrollHeight <= box.clientHeight + 1,
      centred: Math.abs(left - right) <= 3 && Math.abs(top - bottom) <= 3,
      filled: zoom >= 1.4 - 0.001 || svg.width >= b.width * 0.95 || svg.height >= b.height * 0.95,
    };
  });
}

test('zoom changes the scale both ways, fit returns, and full screen opens and closes by Escape and by its button', async ({ page }) => {
  test.setTimeout(300_000);
  await openDesign(page, 'dctl-zoom');

  const card = page.locator('[data-canvas-card]');
  const zoomIn = card.getByRole('button', { name: 'Zoom in' });
  const zoomOut = card.getByRole('button', { name: 'Zoom out' });
  const fit = card.getByRole('button', { name: 'Fit to the width' });
  const full = card.locator('[data-canvas-fullscreen-toggle]');

  // Labelled, with a tooltip, on the drawing's own card.
  for (const [btn, name] of [[zoomIn, 'Zoom in'], [zoomOut, 'Zoom out'], [fit, 'Fit to the width']] as const) {
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('title', name);
  }
  await expect(full).toHaveAttribute('aria-label', 'Full screen');
  await expect(full).toHaveAttribute('aria-pressed', 'false');
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/design-ctl-canvas-1440.png` });

  const fitScale = await scale(page);
  const fitWidth = await drawnWidth(page);
  await expectOnTop(page, '[data-canvas-zoom-in]');
  await zoomIn.click();
  await expect.poll(() => scale(page)).toBeGreaterThan(fitScale);
  expect(await drawnWidth(page)).toBeGreaterThan(fitWidth);
  await expect(card.locator('[data-canvas-zoom-value]')).toHaveText(`${Math.round((await scale(page)) * 100)}%`);
  // Zoomed in, there is room to zoom out again.
  await expect(zoomOut).toBeEnabled();
  const zoomed = await scale(page);
  await zoomOut.click();
  await expect.poll(() => scale(page)).toBeLessThan(zoomed);

  // Up to the ceiling, where only zoom in stops.
  for (let i = 0; i < 6 && (await zoomIn.isEnabled()); i++) await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  await expect(zoomOut).toBeEnabled();
  await fit.click();
  await expect.poll(() => scale(page)).toBeCloseTo(fitScale, 2);

  // The zoomed drawing pans: wider than its column, it scrolls sideways.
  await zoomIn.click();
  await zoomIn.click();
  const scroller = page.locator('[data-canvas-scroll]');
  const room = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(room).toBeGreaterThan(0);
  await scroller.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await fit.click();
  // The reader's own zoom before full screen, to be given back after it.
  await zoomIn.click();
  const ownZoom = await scale(page);

  // Full screen: the card fills the window.
  await full.click();
  await expect(card).not.toHaveAttribute('data-canvas-fullscreen', 'false');
  await expect(full).toHaveAttribute('aria-pressed', 'true');
  await expect(full).toHaveAttribute('aria-label', 'Exit full screen');
  const box = await card.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeLessThanOrEqual(1);
  expect(box!.y).toBeLessThanOrEqual(1);
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 2);
  expect(box!.height).toBeGreaterThanOrEqual(vp.height - 2);
  // The drawing is in it, fitted to the full-screen box — width and height,
  // whole, centred — not left at the column's zoom with half the screen empty.
  await expect(card.locator('svg[data-architecture-canvas]')).toBeVisible();
  await expect
    .poll(async () => {
      const f = await fitInBox(page);
      return f.whole && f.centred && f.filled;
    }, { message: `drawing not fitted: ${JSON.stringify(await fitInBox(page))}` })
    .toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/design-ctl-fullscreen-1440.png` });
  await expectOnTop(page, '[data-canvas-fullscreen-toggle]');
  const before = await scale(page);
  await zoomIn.click();
  await expect.poll(() => scale(page)).toBeGreaterThan(before);
  // The focus stays inside while it is open.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await card.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }

  // Escape leaves, the focus is back on the toggle, and the reader's zoom is back.
  await page.keyboard.press('Escape');
  await expect(card).toHaveAttribute('data-canvas-fullscreen', 'false');
  await expect(full).toBeFocused();
  await expect.poll(() => scale(page)).toBeCloseTo(ownZoom, 2);
  await expect(full).toHaveAttribute('aria-label', 'Full screen');

  // So does the visible button.
  await full.click();
  await expect(card).not.toHaveAttribute('data-canvas-fullscreen', 'false');
  await full.click();
  await expect(card).toHaveAttribute('data-canvas-fullscreen', 'false');
  await expect(full).toBeFocused();

  // Keyboard alone: Tab reaches the controls, Enter opens, Escape closes.
  await fit.focus();
  await page.keyboard.press('Tab');
  await expect(full).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card).not.toHaveAttribute('data-canvas-fullscreen', 'false');
  await page.keyboard.press('Escape');
  await expect(card).toHaveAttribute('data-canvas-fullscreen', 'false');

  // The side panel stays usable at every width.
  for (const width of [1024, 1440, 1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const confirm = page.locator('[data-design-confirm]');
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeVisible();
    await expect(page.getByRole('button', { name: /Regenerate design/ })).toBeVisible();
    await expectOnTop(page, '[data-design-confirm]');
    const tab = page.locator('[data-design-panel]').getByRole('tab', { name: /Alternatives/ });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-design-panel]').getByRole('tab', { name: /^Decision/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `page scrolls sideways at ${width}`).toBeLessThanOrEqual(0);
    if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/design-ctl-canvas-390.png`, fullPage: true });
  }
});

test('Confirm target asks first: Cancel and Escape write nothing, the box’s Confirm target signs off', async ({ page }) => {
  test.setTimeout(300_000);
  const seeded = await openDesign(page, 'dctl-confirm');
  const label = (await page.locator('#design-answer').textContent())!.trim();
  const opener = page.locator('[data-design-confirm]');
  const box = page.locator('[data-cc-message-box]');
  const ask = page.locator('[data-design-confirm-ask]');

  // Small, named, and the full sign-off is not what opens.
  await opener.click();
  await expect(box).toBeVisible();
  await expect(box.getByRole('heading', { name: 'Confirm the target?' })).toBeVisible();
  await expect(ask).toContainText(label);
  await expect(ask).toContainText('self-declaration by the signed-in account');
  await expect(page.locator('[data-design-signoff-dialog]')).toHaveCount(0);
  expect((await box.boundingBox())!.width).toBeLessThanOrEqual(520);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/design-ctl-confirm-1440.png` });

  // Cancel: nothing written, nothing changed.
  await box.getByRole('button', { name: 'Cancel' }).click();
  await expect(box).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('[data-design-answer]')).not.toHaveAttribute('data-design-answer', 'confirmed');
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect ?? false).toBe(false);

  // Escape: the same.
  await opener.click();
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(page.locator('[data-design-answer]')).not.toHaveAttribute('data-design-answer', 'confirmed');
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect ?? false).toBe(false);

  // At phone width it is the same small box, inside the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await opener.scrollIntoViewIfNeeded();
  await opener.click();
  await expect(box).toBeVisible();
  const phone = (await box.boundingBox())!;
  expect(phone.x).toBeGreaterThanOrEqual(0);
  expect(phone.x + phone.width).toBeLessThanOrEqual(390);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/design-ctl-confirm-390.png` });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Only the box's own button confirms — with the command it always used.
  await opener.click();
  await box.getByRole('button', { name: 'Confirm target' }).click();
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(box).toHaveCount(0);
  await expect(opener).toHaveText(/Change target/);
  const stored = await adminGetDoc('projects', seeded.projectId);
  expect(stored?.approvedByArchitect).toBe(true);
  expect(stored?.architectJustifiedOverride).toBe('');
});

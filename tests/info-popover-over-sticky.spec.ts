import { test, expect, type Page } from './helpers/test';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';

/**
 * An open popover stands over the sticky bars of the page.
 *
 * Owner, 11.10.2026: on Documentation the "On this page" bar (sticky,
 * z-cc-sticky, ADR-091) cut through the open "What the tools do" panel
 * (z-cc-popover sits below sticky on the layer scale, so content popovers slide
 * under the shell bar while the page scrolls). Open, the panel's root lifts one
 * tier, as ExportMenu does. Measured where a reader looks: the topmost element
 * at points spread over the panel must belong to the panel.
 */
// The tools whose "On this page" bar starts right under the tool bar (Analyze's starts under its hero).
// Since 3.5.0 the family's tool row (ADR-140) carries no "What the tools do" panel any more — what each tool is for
// is each link's accessible description — so the panel that the bar once cut through is not on a tool page; what is
// left to hold is that the sticky bar never stands over the tool row at rest.
for (const stage of ['documentation', 'testing']) {
  test(`${stage}: the "On this page" bar stands under the tool row, and the row has no panel to cover`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-page-anchors]').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-demo-ready="true"]').first()).toBeAttached({ timeout: 120_000 });
    await expect(page.locator('[data-stage-toolbar] button[data-info-popover="tools-guide"]')).toHaveCount(0);
    const row = (await page.locator('[data-stage-toolbar]').first().boundingBox())!;
    const bar = (await page.locator('[data-page-anchors]').first().boundingBox())!;
    expect(bar.y, 'the anchor bar starts below the tool row').toBeGreaterThanOrEqual(row.y + row.height);
  });
}

/**
 * The other four popover types the fix lifted (QA review of ef3678e998a4,
 * 26792fd1dbb3): "Why?", the checks list, a glossary term and the level
 * explanation. Each is opened where it renders, then the page is scrolled until
 * the panel's middle sits on the middle of a sticky bar — a panel that opens
 * downward then has its trigger under the bar, one that opens upward has its
 * trigger just below the bar's bottom edge — so the bar must run through the
 * panel. Measured as above: the topmost element where they overlap belongs to
 * the panel, for every sticky bar of the page that crosses it.
 */
const SHELL_BAR = 'header.sticky';
const ANCHOR_BAR = '[data-page-anchors]';

/** Two frames, so a scroll's re-render (the level panel is placed from its chip) has landed. */
async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

/** Scrolls until the panel's middle stands on the bar's middle (or the page cannot scroll further). */
async function centreOnBar(page: Page, panel: string, bar: string) {
  for (let i = 0; i < 10; i++) {
    const d = await page.evaluate(
      ({ panel, bar }) => {
        const p = document.querySelector(panel)!.getBoundingClientRect();
        const b = document.querySelector(bar)!.getBoundingClientRect();
        return Math.round(p.y + p.height / 2 - (b.y + b.height / 2));
      },
      { panel, bar },
    );
    if (Math.abs(d) <= 2) return;
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate((d) => window.scrollBy(0, d), d);
    await settle(page);
    if ((await page.evaluate(() => window.scrollY)) === before) return;
  }
}

/** For each sticky bar that crosses the panel: the points where something else stands over the panel. */
async function coveredWhereBarsCross(page: Page, panel: string, bars: string[]) {
  return page.evaluate(
    ({ panel, bars }) => {
      const panelEl = document.querySelector(panel)!;
      const p = panelEl.getBoundingClientRect();
      const crossing: string[] = [];
      const covered: string[] = [];
      for (const bar of bars) {
        const barEl = document.querySelector(bar);
        if (!barEl) continue;
        const b = barEl.getBoundingClientRect();
        const top = Math.max(p.top, b.top, 0);
        const bottom = Math.min(p.bottom, b.bottom, window.innerHeight);
        const left = Math.max(p.left, b.left);
        const right = Math.min(p.right, b.right);
        if (bottom - top < 6 || right - left < 30) continue;
        crossing.push(bar);
        for (const y of [top + 2, (top + bottom) / 2, bottom - 2]) {
          for (const x of [left + 12, (left + right) / 2, right - 12]) {
            const hit = document.elementFromPoint(x, y);
            if (!hit || !panelEl.contains(hit)) {
              covered.push(`${bar} @ ${Math.round(x)},${Math.round(y)}: ${hit?.tagName.toLowerCase()}.${(hit?.getAttribute('class') || '').slice(0, 40)}`);
            }
          }
        }
      }
      return { crossing, covered };
    },
    { panel, bars },
  );
}

async function expectOverBar(page: Page, panel: string, bar: string) {
  await centreOnBar(page, panel, bar);
  await expect(page.locator(panel).first()).toBeVisible();
  const { crossing, covered } = await coveredWhereBarsCross(page, panel, [SHELL_BAR, ANCHOR_BAR]);
  // Not vacuous: the bar the panel was moved onto does run through it.
  expect(crossing, `${bar} does not cross the open panel`).toContain(bar);
  expect(covered, 'a sticky bar stands over the open panel').toEqual([]);
}

async function openDemo(page: Page, stage: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The demo's Analyze score page is its IT view since v3.1.0 (Business is the map page, AB-2, O10).
  await page.goto(stage === 'analyze' ? '/demo/analyze?view=it' : `/demo/${stage}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(SHELL_BAR).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-demo-ready="true"]').first()).toBeAttached({ timeout: 120_000 });
}

test('delivery: an open "Why?" is not covered by the shell bar', async ({ page }) => {
  test.setTimeout(180_000);
  await openDemo(page, 'delivery');
  await page.locator('button[data-cc-why]').first().click();
  await expect(page.locator('[data-cc-why-popover]')).toBeVisible();
  // Opens downward: its "?" ends up under the shell bar.
  await expectOverBar(page, '[data-cc-why-popover]', SHELL_BAR);
});

test('analyze: an open glossary term is not covered by the "On this page" bar', async ({ page }) => {
  test.setTimeout(180_000);
  await openDemo(page, 'analyze');
  const term = page.locator('button[data-glossary-term]').first();
  await term.scrollIntoViewIfNeeded();
  await term.click();
  await expect(page.locator('[data-glossary-popover]')).toBeVisible();
  // Opens upward: the term stands just below the bar's bottom edge.
  await expectOverBar(page, '[data-glossary-popover]', ANCHOR_BAR);
});

test('analyze: a pinned level explanation is not covered by the "On this page" bar', async ({ page }) => {
  test.setTimeout(180_000);
  await openDemo(page, 'analyze');
  const chip = page.locator('[data-cc-level-trigger]').first();
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  const panel = '[data-cc-level-explanation]:not([hidden])';
  await expect(page.locator(panel)).toBeVisible();
  // Fixed under its chip and moved with it on scroll: the chip ends up under the bar.
  await expectOverBar(page, panel, ANCHOR_BAR);
});

test.describe('the checks list', () => {
  let admin: GalleryAdmin;
  test.beforeAll(async () => {
    admin = await createGalleryAdmin('popsticky');
  });

  // The gallery's instance, not the rules editor's: there the popover sits in
  // the sticky footer, whose own stacking context already outranks the bars
  // above it in the page, so the lift could not show there either way.
  test('design-system gallery: the open checks list is not covered by the shell bar', async ({ page }) => {
    test.setTimeout(180_000);
    await openGallery(page, admin);
    const trigger = page.locator('[data-cc-message-popover-trigger]').first();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.locator('[data-cc-message-popover-panel]')).toBeVisible();
    // Opens upward: the button stands just below the shell bar's bottom edge.
    await expectOverBar(page, '[data-cc-message-popover-panel]', SHELL_BAR);
  });
});

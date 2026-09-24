import { test, expect, type Page } from '@playwright/test';
import { PHASES } from '../lib/workflow-steps';
import { LANDING_STAGE_TEXT } from '../lib/landing-stages';
import { PROVENANCE } from '../lib/provenance';
import { DEMO_ROUTE } from '../lib/demo-marks';

/**
 * The seven stages on the landing page as a timeline — roadmap 3.0.6
 * (Sonny, 24.09.2026). Rendered checks for what a source guard cannot see:
 *
 *   1. the timeline is a WAI-ARIA tablist — arrow keys, Home/End, roving
 *      tabindex, aria-selected and aria-controls pointing at the one visible panel;
 *   2. each panel carries the chips `lib/landing-stages.ts` names, with the
 *      words of `lib/provenance.ts`, and a real picture;
 *   3. with `prefers-reduced-motion` nothing draws and nothing fades;
 *   4. without JavaScript the first panel shows and all seven texts are in the HTML;
 *   5. on a phone the seven are disclosures;
 *   6. one way into the demo, not seven.
 */

const tabs = (page: Page) => page.locator('#workspace-tools [role="tab"]');

async function openSection(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
  const section = page.locator('#workspace-tools');
  await section.scrollIntoViewIfNeeded();
  // Hydrated once a click selects a tab.
  await expect(async () => {
    await tabs(page).nth(1).click();
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 1000 });
  }).toPass({ timeout: 90_000 });
  await tabs(page).nth(0).click();
}

async function expectSelected(page: Page, index: number) {
  const all = tabs(page);
  await expect(all.nth(index)).toHaveAttribute('aria-selected', 'true');
  await expect(all.nth(index)).toBeFocused();
  // Roving tabindex: exactly one tab in the tab order.
  expect(await all.evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')))).toEqual(
    PHASES.map((_, i) => (i === index ? '0' : '-1')),
  );
  const controls = await all.nth(index).getAttribute('aria-controls');
  await expect(page.locator(`#${controls}`)).toBeVisible();
  await expect(page.locator('#workspace-tools [role="tabpanel"]:visible')).toHaveCount(1);
}

test.describe('the seven stages as a timeline', () => {
  test('keyboard: arrows, Home and End move selection and focus', async ({ page }) => {
    test.setTimeout(240_000);
    await openSection(page);
    await expect(tabs(page)).toHaveCount(PHASES.length);
    await expect(page.locator('#workspace-tools [role="tablist"]')).toHaveCount(1);

    await tabs(page).nth(0).focus();
    await expectSelected(page, 0);
    await page.keyboard.press('ArrowRight');
    await expectSelected(page, 1);
    await page.keyboard.press('End');
    await expectSelected(page, PHASES.length - 1);
    await page.keyboard.press('ArrowRight');
    await expectSelected(page, 0); // wraps
    await page.keyboard.press('ArrowLeft');
    await expectSelected(page, PHASES.length - 1);
    await page.keyboard.press('Home');
    await expectSelected(page, 0);

    // The focused tab shows a ring (DESIGN.md §1.6), not nothing.
    const outline = await tabs(page).nth(0).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('each panel: a real picture, the named chips and the stage text', async ({ page }) => {
    test.setTimeout(240_000);
    await openSection(page);
    for (const [i, phase] of PHASES.entries()) {
      await tabs(page).nth(i).click();
      const panel = page.locator(`#stage-panel-${phase.key}`);
      await expect(panel).toBeVisible();
      const img = panel.locator('img');
      await expect(img).toHaveAttribute('src', new RegExp(`stage-${phase.key}\\.jpg`));
      expect((await img.getAttribute('alt'))!.length, `${phase.key} alt`).toBeGreaterThan(40);
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 30_000 }).toBeGreaterThan(600);

      const text = LANDING_STAGE_TEXT[phase.key];
      await expect(panel).toContainText(text.lines[0]);
      const chips = panel.locator('[data-provenance]');
      expect(await chips.evaluateAll((els) => els.map((el) => el.getAttribute('data-provenance')))).toEqual([...text.provenance]);
      expect(await panel.locator('[data-cc-provenance-label]').allInnerTexts()).toEqual(text.provenance.map((v) => PROVENANCE[v].label));
    }
  });

  test('reduced motion: the line stands drawn and the panel does not fade', async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSection(page);
    const line = page.locator('[data-timeline-line]');
    await expect(line).toHaveAttribute('data-drawn', 'true');
    const scale = await line.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(scale).toBe(1);

    await tabs(page).nth(4).click();
    // Read at once, not after a wait: a fade would still be under way.
    const opacity = await page
      .locator(`#stage-panel-${PHASES[4].key} > div`)
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe('1');
  });

  test('with motion: the line is drawn once the section is seen', async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    const line = page.locator('[data-timeline-line]');
    // Far below the fold: taken back to zero after hydration, waiting to be seen.
    await expect(line).toHaveAttribute('data-drawn', 'false', { timeout: 90_000 });
    await page.locator('#workspace-tools [role="tablist"]').scrollIntoViewIfNeeded();
    await expect(line).toHaveAttribute('data-drawn', 'true');
    await expect.poll(() => line.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a), { timeout: 5000 }).toBe(1);
  });

  test('phone: the seven stages are disclosures', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    await expect(page.locator('#workspace-tools [role="tablist"]')).toBeHidden();
    const items = page.locator('[data-landing-stage-item]');
    await expect(items).toHaveCount(PHASES.length);
    const first = items.nth(0).locator('button[aria-expanded]');
    const second = items.nth(1).locator('button[aria-expanded]');
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(second).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#stage-region-${PHASES[1].key}`)).toBeHidden();
    await expect(async () => {
      await second.click();
      await expect(second).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
    }).toPass({ timeout: 90_000 });
    const region = page.locator(`#stage-region-${PHASES[1].key}`);
    await expect(region).toBeVisible();
    await expect(region.locator('img')).toHaveAttribute('src', /stage-design\.jpg/);
    await expect(region.locator('[data-provenance]').first()).toBeVisible();
  });

  test('one way into the demo, not seven', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    const section = page.locator('#workspace-tools');
    await expect(section.getByText('See it in the demo', { exact: false })).toHaveCount(0);
    const links = section.locator('a');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText('Take the tour in the demo');
    expect(await links.first().getAttribute('href')).toContain(DEMO_ROUTE);
  });
});

test.describe('the seven stages without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the first panel shows and all seven texts are in the HTML', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    await expect(page.locator(`#stage-panel-${PHASES[0].key}`)).toBeVisible();
    for (const phase of PHASES.slice(1)) {
      await expect(page.locator(`#stage-panel-${phase.key}`)).toBeHidden();
    }
    const html = await page.locator('#workspace-tools').innerHTML();
    for (const phase of PHASES) {
      for (const line of LANDING_STAGE_TEXT[phase.key].lines) {
        // React escapes the apostrophe; compare on a stretch without one.
        expect(html, `${phase.key}`).toContain(line.slice(0, 60).replace(/&/g, '&amp;'));
      }
    }
    // The line is drawn in the server HTML.
    await expect(page.locator('[data-timeline-line]')).toHaveAttribute('data-drawn', 'true');
  });
});

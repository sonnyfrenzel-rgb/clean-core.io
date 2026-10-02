import { test, expect, type Page } from '@playwright/test';
import { wrapToWidth } from '../components/transformation/TransformationFlow';

/**
 * The Transformation Sankey's target labels stay in their column. "The project
 * route · Side-by-side on BAIP · 1" ran under the generated-file boxes and was
 * cut by them to "…on BAIF" (video run of Z_MM_PO_APPROVAL, 02.10.2026). The
 * labels now wrap to the column; on a phone the flow is a list whose cells wrap.
 */

/** Where the file column starts in the SVG's own coordinates (`FX` in the component). */
const FILE_COLUMN_X = 910;

async function openDemoFlow(page: Page) {
  await page.goto('/demo/transformation', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-transformation-flow]')).toBeVisible({ timeout: 120_000 });
}

test('a long label wraps into lines that fit, and a single long word is cut, never spilled', () => {
  const lines = wrapToWidth('The project route · Side-by-side on BAIP · 1', 13, 236);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join(' ')).toBe('The project route · Side-by-side on BAIP · 1');
  for (const l of lines) expect(l.length * 13 * 0.62).toBeLessThanOrEqual(236);
  expect(wrapToWidth('X'.repeat(80), 13, 236)[0].endsWith('…')).toBe(true);
});

test('at 1440 no target label reaches the generated-files column', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openDemoFlow(page);
  const svg = page.locator('[data-transformation-flow] svg');
  await expect(svg).toBeVisible();
  await expect(svg).toContainText('Side-by-side on BAIP');
  const rights = await svg.locator('[data-flow-target-label]').evaluateAll((els) =>
    els.map((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      return { text: el.textContent ?? '', right: b.x + b.width };
    }),
  );
  expect(rights.length).toBeGreaterThan(0);
  for (const r of rights) expect(r.right, `"${r.text}" runs into the file column`).toBeLessThan(FILE_COLUMN_X);
});

test('at 390 the flow is a list that fits the screen', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await openDemoFlow(page);
  const list = page.locator('[data-transformation-flow] ul[aria-label="Findings by kind and target"]');
  await expect(list).toBeVisible();
  await expect(list).toContainText('Side-by-side on BAIP');
  const overflow = await list.evaluate((ul) => {
    const box = ul.getBoundingClientRect();
    return Array.from(ul.querySelectorAll('span')).some((s) => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && (r.right > box.right + 1 || s.scrollWidth > s.clientWidth + 1);
    });
  });
  expect(overflow, 'a cell of the phone flow spills out of the list').toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

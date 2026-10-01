import { test, expect } from '@playwright/test';

/**
 * The public header fits the window at every desktop width (QA 05e3d386d6a6).
 *
 * The five desktop links, the logo and the sign-in control need about 1,220 px
 * with the page gutter. The desktop row used to appear at `lg` (1024 px) and
 * pushed the document to 1,185 px wide there — a horizontal scrollbar on every
 * public page from 1024 to about 1200 px. Below `xl` the compact menu stands in.
 */
for (const width of [1024, 1100, 1279, 1280, 1440]) {
  test(`no horizontal overflow at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/facts');
    await page.locator('[data-public-header]').waitFor();
    const { doc, view, desktopNav } = await page.evaluate(() => {
      const nav = document.querySelector('[data-public-header] > div > nav[aria-label="Main"]') as HTMLElement;
      return { doc: document.documentElement.scrollWidth, view: window.innerWidth, desktopNav: getComputedStyle(nav).display !== 'none' };
    });
    expect(doc, `the page is ${doc} px wide in a ${view} px window`).toBeLessThanOrEqual(view);
    // One of the two navigations is always reachable.
    if (!desktopNav) await expect(page.locator('[data-public-header] summary[aria-label="Menu"]')).toBeVisible();
  });
}

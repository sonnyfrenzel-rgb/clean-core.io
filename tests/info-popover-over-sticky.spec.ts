import { test, expect } from '@playwright/test';

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
for (const stage of ['documentation', 'testing']) {
  test(`${stage}: "What the tools do" is not covered by the "On this page" bar`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/demo/${stage}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-page-anchors]').first()).toBeVisible({ timeout: 120_000 });
    // The demo stage is hydrated (its buttons answer) once it marks itself ready;
    // a click before that is lost and the panel never opens.
    await expect(page.locator('[data-demo-ready="true"]').first()).toBeAttached({ timeout: 120_000 });

    await page.locator('button[data-info-popover="tools-guide"]').first().click();
    const panel = page.locator('[data-info-popover-panel="tools-guide"]').first();
    await expect(panel).toBeVisible();

    const box = (await panel.boundingBox())!;
    const bar = (await page.locator('[data-page-anchors]').first().boundingBox())!;
    // Not vacuous: the bar runs through the panel's height.
    expect(bar.y, 'the anchor bar starts inside the panel').toBeLessThan(box.y + box.height);
    expect(bar.y + bar.height, 'the anchor bar ends below the panel top').toBeGreaterThan(box.y);

    const covered = await page.evaluate(
      ({ box, barTop, barBottom }) => {
        const panelEl = document.querySelector('[data-info-popover-panel="tools-guide"]')!;
        const out: string[] = [];
        const ys = [barTop + 2, (barTop + barBottom) / 2, barBottom - 2, box.y + box.height / 2];
        const xs = [box.x + 12, box.x + box.width / 2, box.x + box.width - 12];
        for (const y of ys) {
          if (y <= box.y || y >= box.y + box.height) continue;
          for (const x of xs) {
            const top = document.elementFromPoint(x, y);
            if (!top || !panelEl.contains(top)) out.push(`${Math.round(x)},${Math.round(y)}: ${top?.tagName.toLowerCase()}`);
          }
        }
        return out;
      },
      { box, barTop: bar.y, barBottom: bar.y + bar.height },
    );
    expect(covered, 'something stands over the open panel').toEqual([]);
  });
}

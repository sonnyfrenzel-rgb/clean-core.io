import { test, expect } from './helpers/test';
import { signInThroughForm } from './helpers/seed-project';
import { seedLayoutProject } from './helpers/analyze-layout';

/**
 * AB-7 rendered (plan `docs/design/analyze-business-first-plan.md` §4.2; mockup
 * `docs/roadmap/analyze-business-first-mockup.html`, state 8): the two charts stand under the map of the seeded PO
 * approval project, a row press lights its elements on the map with "Showing: … · Clear", and Clear — or the row
 * again, by keyboard — takes it back. The counts themselves are held server-free by `tests/process-fact-charts.spec.ts`.
 * Needs the app and the emulators, like every rendered spec.
 */
test.describe('rendered: the charts under the map light the map', () => {
  test.describe.configure({ mode: 'serial' });

  test('Z_MM_PO_APPROVAL: 9 ends in 6 rows; a stop row lights its level; Clear and the keyboard take it back', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const seeded = await seedLayoutProject('ab7-charts');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"] [data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 120000 });

    const ends = page.locator('[data-fact-chart="ends"]');
    await expect(ends).toBeVisible({ timeout: 60000 });
    await expect(ends.locator('[data-fact-chart-sentence]')).toContainText('9 ways');
    await expect(ends.locator('[data-fact-row]')).toHaveCount(6);
    const counts = await ends.locator('[data-fact-count]').allInnerTexts();
    expect(counts.reduce((sum, n) => sum + Number(n), 0)).toBe(9);
    await expect(ends).toContainText('Reconstructed');

    // The charts stand below the map, never between the summary and it.
    const [map, charts] = await Promise.all([page.locator('[data-analyze-map]').boundingBox(), page.locator('[data-fact-charts]').boundingBox()]);
    expect(charts!.y).toBeGreaterThanOrEqual(map!.y + map!.height - 1);

    // Press the "Check requisition" stops: the map moves to that level, lights the three ends, says what it shows.
    const row = ends.locator('[data-fact-row^="stop:"]', { hasText: 'Check requisition' });
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    const showing = page.locator('[data-process-map-showing]');
    await expect(showing).toBeVisible();
    await expect(showing).toContainText('Check requisition');
    await expect(page.locator('[data-map-canvas-frame]')).not.toHaveAttribute('data-map-plane', 'top');
    await expect(page.locator('.cc-map-canvas .cc-dim').first()).toBeAttached();

    // Clear on the map: nothing lit, the row released.
    await page.locator('[data-process-map-showing-clear]').click();
    await expect(showing).toHaveCount(0);
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.cc-map-canvas .cc-dim')).toHaveCount(0);

    // By keyboard: Enter presses the row, Enter again releases it.
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-pressed', 'false');

    // What it changes: the requisition put on hold is a change the map draws.
    const data = page.locator('[data-fact-chart="data"]');
    await expect(data).toContainText('Purchase requisition');
    await expect(data.locator('[data-fact-row="change:table-write:EBAN"]')).toBeEnabled();
  });
});

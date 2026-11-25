import { test, expect } from './helpers/test';
import { signInThroughForm } from './helpers/seed-project';
import { seedLayoutProject } from './helpers/analyze-layout';

/**
 * The rendered half of `tests/first-look-naming-wait.spec.ts`, for the text around the map (AB-6, 3.2.0): a naming read
 * that never answers keeps nothing waiting. Every read of the stored naming is held for as long as the test runs; the
 * text around the map still reaches `ready`, and stays there. The source guard of the other spec says no part of it
 * reads a naming; this one shows it on the page, whatever helper a later change would wait through.
 *
 * Needs the emulators and a server (`npx playwright test` as in CI).
 */
test('rendered: a naming read that never answers — the text around the map still reaches ready', async ({ page }) => {
  test.setTimeout(300 * 1000);
  const seeded = await seedLayoutProject('around-naming-held');
  await page.setViewportSize({ width: 1440, height: 900 });

  let held = 0;
  let release!: () => void;
  const never = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/*/process-naming*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    held += 1;
    await never;
    await route.abort().catch(() => {});
  });

  try {
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 120_000 });
    // The page asks for the stored naming, and the answer never comes.
    await expect.poll(() => held, { timeout: 60_000 }).toBeGreaterThan(0);
    const around = page.locator('[data-around-the-map]');
    await expect(around).toHaveAttribute('data-around-the-map', 'ready', { timeout: 60_000 });
    // And it does not fall back to reading while the naming stays outstanding.
    await page.waitForTimeout(5_000);
    await expect(around).toHaveAttribute('data-around-the-map', 'ready');
  } finally {
    release();
  }
});

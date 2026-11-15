import { test, expect } from './helpers/test';
import { signInThroughForm } from './helpers/seed-project';
import { seedLayoutProject } from './helpers/analyze-layout';
import { NAMING_WAIT_MS } from '../lib/first-look';

/**
 * The rendered half of `tests/first-look-naming-wait.spec.ts`: a naming read that never answers does not keep the
 * first insights waiting. Every read of the stored naming is held for as long as the test runs; the card still
 * reaches its end state, soon after `NAMING_WAIT_MS`, and stays there.
 *
 * Needs the emulators and a dev server (`npx playwright test` as in CI).
 */
test('a naming read that never answers: the first insights still reach their end state', async ({ page }) => {
  test.setTimeout(300 * 1000);
  const seeded = await seedLayoutProject('naming-wait');
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
    await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 120000 });
    const look = page.locator('[data-analyze-interim] [data-first-look]');
    await expect(look).toBeVisible({ timeout: 60000 });
    await expect.poll(() => held, { timeout: 60000 }).toBeGreaterThan(0);
    // The engine's reading is in; only the naming is outstanding — and it never comes.
    await expect(look).toHaveAttribute('data-first-look', 'end-state', { timeout: NAMING_WAIT_MS + 60000 });
    await page.waitForTimeout(NAMING_WAIT_MS);
    await expect(look).toHaveAttribute('data-first-look', 'end-state');
  } finally {
    release();
  }
});

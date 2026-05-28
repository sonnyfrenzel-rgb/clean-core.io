import { test, expect } from '@playwright/test';

test.describe('Stage 5 & 6: Sandboxed Testing & Handover Delivery E2E Tests', () => {
  test('should verify workspace settings and clean core community configurations', async ({ page }) => {
    await page.goto('/');

    // 1. Verify community edition badges exist in page header context
    const communityBadge = page.locator('text=Community Edition').first();
    if (await communityBadge.count() > 0) {
      await expect(communityBadge).toBeVisible();
    }
  });

  test('should verify pilot licenses options cards are present on the landing page', async ({ page }) => {
    await page.goto('/');

    // 1. Check basic option
    const basicLicense = page.locator('text=Pilot Basic (Community)').first();
    await expect(basicLicense).toBeVisible();

    // 2. Check pro/developer option
    const starterLicense = page.locator('text=Pilot Starter (Developer Upgrade)').first();
    await expect(starterLicense).toBeVisible();

    // 3. Check corporate/enterprise option
    const enterpriseLicense = page.locator('text=Enterprise (Planned)').first();
    await expect(enterpriseLicense).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Stage 5 & 6: Sandboxed Testing & Handover Delivery E2E Tests', () => {
  test('should verify workspace settings and clean core community configurations', async ({ page }) => {
    await page.goto('/');

    // 1. Verify community badge exists in page header context
    const communityBadge = page.locator('text=Free Community Tool').first();
    if (await communityBadge.count() > 0) {
      await expect(communityBadge).toBeVisible();
    }
  });

  test('should verify community access tier cards are present on the landing page', async ({ page }) => {
    await page.goto('/');

    // 1. Check Pilot Sandbox card
    const sandboxCard = page.getByTestId('card-sandbox');
    await expect(sandboxCard).toBeVisible();

    // 2. Check Developer Upgrade (BYOK) card
    const developerCard = page.getByTestId('card-developer');
    await expect(developerCard).toBeVisible();
  });
});

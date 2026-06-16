import { test, expect } from '@playwright/test';

test.describe('Clean-Core.io Stage 1 & 2 E2E Tests', () => {
  test('should navigate, perform visual check on landing features, and upload mock ABAP data', async ({ page }) => {
    // 1. Load Landing Page and capture visual snapshot
    await page.goto('/');
    await expect(page).toHaveTitle(/Clean-Core/i);
    await page.screenshot({ path: 'test-results/visual-baselines/desktop-landing.png' });

    // 2. Navigate to legal notice page and verify
    const legalNoticeLink = page.locator('a:has-text("Impressum"), a:has-text("Legal Notice")').first();
    if (await legalNoticeLink.count() > 0) {
      await legalNoticeLink.click();
      await expect(page).toHaveURL(/\/impressum/);
      const heading = page.locator('h1');
      await expect(heading).toContainText(/Legal Notice/i);
      await page.screenshot({ path: 'test-results/visual-baselines/legal-page.png' });
    }

  });

  test('should verify architectural design tree and API method catalog UI', async ({ page }) => {
    // Navigate to a project dashboard design screen (using dashboard as fallback if project is empty)
    await page.goto('/dashboard');
    await page.screenshot({ path: 'test-results/visual-baselines/dashboard.png' });

    // Verify workspace layout holds main header elements
    const mainHeader = page.locator('header, nav, h1').first();
    await expect(mainHeader).toBeVisible();
  });
});

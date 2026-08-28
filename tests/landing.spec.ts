import { test, expect } from '@playwright/test';

test.describe('Clean-Core.io Landing Page E2E Tests', () => {
  test.beforeEach(async () => {
    test.setTimeout(90000);
  });

  test('should load the landing page successfully and verify structural components', async ({ page }) => {
    // 1. Navigate to the local home page
    await page.goto('/');

    // 2. Verify that the title contains the main platform name
    await expect(page).toHaveTitle(/Clean-Core/i);

    // 3. Verify that the primary hero heading is rendered and visible
    const heroHeading = page.locator('h1');
    await expect(heroHeading).toBeVisible();
    await expect(heroHeading).toContainText(/Clean Core Accelerator/i);

    // 4. Verify that community access cards are rendered correctly
    const sandboxCard = page.getByTestId('card-sandbox');
    const developerCard = page.getByTestId('card-developer');
    await expect(sandboxCard).toBeVisible();
    await expect(developerCard).toBeVisible();
  });

  test('should navigate to the legal notice page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check if the Legal link is present in the footer
    // Not conditional. An imprint that is not reachable from the landing page is
    // a legal defect (§ 5 DDG), so its absence has to fail this test rather than
    // skip it.
    const legalNoticeLink = page.locator('a[href="/impressum"]').last();
    await expect(legalNoticeLink).toBeVisible();
    await legalNoticeLink.click();
    await expect(page).toHaveURL(/\/impressum/, { timeout: 15000 });
    const heading = page.locator('h1');
    await expect(heading).toContainText(/Legal Notice/i, { timeout: 15000 });
  });

});

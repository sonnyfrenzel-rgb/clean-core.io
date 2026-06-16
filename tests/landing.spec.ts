import { test, expect } from '@playwright/test';

test.describe('Clean-Core.io Landing Page E2E Tests', () => {
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
    
    // Check if the Legal link is present in the footer
    const legalNoticeLink = page.locator('a').filter({ hasText: /Impressum|Legal Notice/ }).first();
    if (await legalNoticeLink.count() > 0) {
      await expect(legalNoticeLink).toBeVisible();
      // Click the link and verify navigation to /impressum
      await legalNoticeLink.click();
      await expect(page).toHaveURL(/\/impressum/);
      // Verify the page renders legal content
      const heading = page.locator('h1');
      await expect(heading).toContainText(/Legal Notice/i);
    }
  });

});

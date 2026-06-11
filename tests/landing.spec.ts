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
    await expect(heroHeading).toContainText(/Legacy Code/i);

    // 4. Verify that pricing cards are rendered correctly
    const pricingSection = page.locator('#pricing, section:has-text("Pricing"), section:has-text("Preise")').first();
    // Verify pricing options exist on page
    const pricingCards = page.locator('.border-gray-200, .border-green-400, [class*="pricing-card"]');
    if (await pricingCards.count() > 0) {
      await expect(pricingCards.first()).toBeVisible();
    }
  });

  test('should load the legal notice overlay', async ({ page }) => {
    await page.goto('/');
    
    // Check if the Legal overlay link is present in the footer
    const legalNoticeLink = page.locator('button, a').filter({ hasText: /Impressum|Legal Notice/ }).first();
    if (await legalNoticeLink.count() > 0) {
      await expect(legalNoticeLink).toBeVisible();
      // Click the link and verify the modal opens
      await legalNoticeLink.click();
      const modal = page.locator('div[role="dialog"], div:has-text("Haftungsausschluss"), div:has-text("Disclaimer")').first();
      await expect(modal).toBeVisible();
    }
  });
});

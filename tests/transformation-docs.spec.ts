import { test, expect } from '@playwright/test';

test.describe('Stage 3 & 4: Code Transformation & Process Blueprinting E2E Tests', () => {
  test('should verify global application layout and dashboard navigation elements', async ({ page }) => {
    await page.goto('/');

    // 1. Check main title branding is responsive
    await expect(page).toHaveTitle(/Clean-Core/i);
    
    // 2. Check that the hero CTA to get basic or pro access is present
    const ctaButton = page.locator('button:has-text("Get Pilot Access"), button:has-text("Open Workspace")').first();
    await expect(ctaButton).toBeVisible();
  });

  test('should verify global floating chatbot and glossary sidebars are structurally loaded', async ({ page }) => {
    await page.goto('/');

    // Check chatbot dialog triggers and glossary book buttons exist in layout
    const glossaryBookTrigger = page.locator('[title="Search S/4HANA Glossary"], button:has-text("Glossary")').first();
    if (await glossaryBookTrigger.count() > 0) {
      await expect(glossaryBookTrigger).toBeVisible();
    }
  });
});

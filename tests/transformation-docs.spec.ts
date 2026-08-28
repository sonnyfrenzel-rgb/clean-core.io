import { test, expect } from '@playwright/test';

test.describe('Stage 3 & 4: Code Transformation & Process Blueprinting E2E Tests', () => {
  test('should verify global application layout and dashboard navigation elements', async ({ page }) => {
    await page.goto('/');

    // 1. Check main title branding is responsive
    await expect(page).toHaveTitle(/Clean-Core/i);
    
    // 2. Check that the hero CTA to get basic or pro access is present
    const ctaButton = page.locator('button, a').filter({ hasText: /Get Free Access|Open Workspace/ }).first();
    await expect(ctaButton).toBeVisible();
  });

  test('should verify global floating chatbot and glossary sidebars are structurally loaded', async ({ page }) => {
    // Two reasons this never tested anything: the selector named a title that
    // exists nowhere in the codebase (the real one is "Open Clean Core Glossary
    // Guide"), and both overlays live in the authenticated shell rather than on
    // the public landing page the test was loading.
    await page.goto('/knowledge');
    await page.waitForLoadState('domcontentloaded');

    // Only the chatbot is asserted, because only the chatbot is mounted.
    // `GlossarySidebar` is imported in app/(app)/layout.tsx and never rendered —
    // dead code that this test claimed to cover. Making the assertion strict is
    // what surfaced it; it is recorded in the plan rather than papered over by
    // asserting something that is not on the page.
    await expect(page.locator('button:has-text("Ask AI")').first()).toBeVisible();
  });
});

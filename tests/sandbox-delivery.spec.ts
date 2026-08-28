import { test, expect } from '@playwright/test';

test.describe('Stage 5 & 6: Sandboxed Testing & Handover Delivery E2E Tests', () => {
  test('should verify workspace settings and clean core community configurations', async ({ page }) => {
    await page.goto('/');

    // The string this looked for — "Free Community Tool" — appears nowhere in the
    // codebase. The landing page says "Free Community Edition". So the assertion
    // never ran, and the wrong wording could never have been caught.
    const communityBadge = page.getByText('Free Community Edition').first();
    await expect(communityBadge).toBeVisible();
  });

  test('should verify community access tier cards are present on the landing page', async ({ page }) => {
    await page.goto('/');

    // 1. Check Free Community Edition card
    const sandboxCard = page.getByTestId('card-sandbox');
    await expect(sandboxCard).toBeVisible();

    // 2. Check the BYOK access card
    const developerCard = page.getByTestId('card-developer');
    await expect(developerCard).toBeVisible();
  });
});

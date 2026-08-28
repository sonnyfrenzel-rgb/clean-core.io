import { test, expect } from '@playwright/test';

test.describe('Stage 1 & 2: Analysis & Solution Design E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
  });

  test('should verify landing page features and visual compliance checkpoints', async ({ page }) => {
    await page.goto('/');
    
    // 1. Verify that all 6 main feature cards are present using stable data-testid selectors
    const extensibilityCard = page.getByTestId('feature-extensibility-routing');
    await expect(extensibilityCard).toBeVisible();

    const apiHubCard = page.getByTestId('feature-sap-api-hub-mapping');
    await expect(apiHubCard).toBeVisible();

    const dualEngineCard = page.getByTestId('feature-dual-rap-cap-engine');
    await expect(dualEngineCard).toBeVisible();

    const valueAuditCard = page.getByTestId('feature-business-value-audit-tco');
    await expect(valueAuditCard).toBeVisible();

    const adtCockpitCard = page.getByTestId('feature-adt-cockpit-simulation');
    await expect(adtCockpitCard).toBeVisible();

    const bpmnCard = page.getByTestId('feature-bpmn-2-0-business-sop');
    await expect(bpmnCard).toBeVisible();
  });

  test('should verify the global glossary overlays toggle behavior', async ({ page }) => {
    // The chatbot and the glossary live in the authenticated shell layout, not on
    // the public landing page. This test used to load `/`, find nothing, and pass
    // — for months. /knowledge is inside that shell and reachable signed-out, so
    // it is where the overlays can actually be exercised.
    await page.goto('/knowledge');
    await page.waitForLoadState('domcontentloaded');

    const chatbotTrigger = page.locator('button:has-text("Ask AI")').first();
    await expect(chatbotTrigger).toBeVisible();

    // The test is named for the toggle, so it has to toggle.
    await chatbotTrigger.click();
    await expect(page.locator('button:has-text("Close AI")').first()).toBeVisible();
    await page.locator('button:has-text("Close AI")').first().click();
    await expect(chatbotTrigger).toBeVisible();
  });
});

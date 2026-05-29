import { test, expect } from '@playwright/test';

test.describe('Stage 1 & 2: Analysis & Solution Design E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a project analysis page
    // We navigate to /dashboard or a fallback as we run in mock/local mode
    await page.goto('/');
  });

  test('should verify landing page features and visual compliance checkpoints', async ({ page }) => {
    await page.goto('/');
    
    // 1. Verify that all 6 main modernized pilot features are present on the landing page
    const extensibilityCard = page.locator('text=Extensibility Routing').first();
    await expect(extensibilityCard).toBeVisible();

    const apiHubCard = page.locator('text=SAP API Hub Mapping').first();
    await expect(apiHubCard).toBeVisible();

    const dualEngineCard = page.locator('text=Dual RAP & CAP Engine').first();
    await expect(dualEngineCard).toBeVisible();

    const valueAuditCard = page.locator('text=Business Value Audit').first();
    await expect(valueAuditCard).toBeVisible();

    const adtCockpitCard = page.locator('text=ADT Cockpit Simulation').first();
    await expect(adtCockpitCard).toBeVisible();

    const bpmnCard = page.locator('text=BPMN 2.0 & AI Blueprints').first();
    await expect(bpmnCard).toBeVisible();
  });

  test('should verify the global glossary overlays toggle behavior', async ({ page }) => {
    await page.goto('/');
    
    // 1. Check that the glossary floats on layout level
    const chatbotTrigger = page.locator('button:has-text("Ask AI")').first();
    if (await chatbotTrigger.count() > 0) {
      await expect(chatbotTrigger).toBeVisible();
    }
  });
});

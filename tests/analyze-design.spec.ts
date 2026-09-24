import { test, expect } from '@playwright/test';

test.describe('Stage 1 & 2: Analysis & Solution Design E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
  });

  test('the landing page links every feature page', async ({ page }) => {
    // The six feature cards went with the 3.0 landing page (roadmap 3.0.6); the
    // feature pages did not — they have search reach and the page links into
    // them from the sections that describe each feature.
    await page.goto('/');
    for (const slug of ['extensibility-routing', 'cloudification-catalog', 'rap-cap-engine', 'modernization-assessment', 'audit-evidence', 'process-blueprints']) {
      await expect(page.locator(`main a[href="/features/${slug}"]`).first(), `/features/${slug}`).toBeVisible();
    }
  });

  test('should verify the global glossary overlays toggle behavior', async ({ page }) => {
    // The chatbot and the glossary live in the authenticated shell layout, not on
    // the public landing page. This test used to load `/`, find nothing, and pass
    // — for months. /knowledge is inside that shell and reachable signed-out, so
    // it is where the overlays can actually be exercised.
    await page.goto('/knowledge');
    await page.waitForLoadState('domcontentloaded');

    // Located by its data attribute rather than its label since roadmap 6.8:
    // the label is a wording decision and moves without this test's consent.
    //
    // And it really does move. `/knowledge` is *outside* a project, so since
    // 23.09.2026 the trigger reads "Ask the assistant": there is no case here,
    // and the assistant answers from the product knowledge base rather than from
    // the evidence of an uploaded piece of ABAP. Inside a project the same
    // button says "Ask this case". Both halves are exercised rendered in
    // `tests/assistant-label.spec.ts`; what this test owns is the toggling.
    const chatbotTrigger = page.locator('[data-chatbot-toggle]').first();
    await expect(chatbotTrigger).toBeVisible();
    await expect(chatbotTrigger).toContainText('Ask the assistant');

    // The test is named for the toggle, so it has to toggle.
    await chatbotTrigger.click();
    await expect(chatbotTrigger).toContainText('Close');
    await chatbotTrigger.click();
    await expect(chatbotTrigger).toContainText('Ask the assistant');
  });
});

import { test, expect } from '@playwright/test';

/**
 * Smoke test of the public pages, signed out.
 *
 * Five specs from May 2026 did this between them — `landing`, `stage1-2`,
 * `analyze-design`, `transformation-docs` and `sandbox-delivery` — and three of
 * them were named after workflow stages they never opened ("Stage 3 & 4: Code
 * Transformation" loaded the landing page and looked for a button). They
 * overlapped: the page title was asserted three times, the imprint link twice,
 * the access cards twice, the assistant toggle twice. Merged here on 30.09.2026
 * (test audit, stage 1) under titles that say what is checked; every assertion
 * of the five survives, the duplicates once.
 *
 * What this file is not: a test of any workflow stage. Those are exercised
 * signed in, by the specs named after them.
 */
test.describe('public pages, signed out', () => {
  test.beforeEach(async () => {
    test.setTimeout(90000);
  });

  test('the landing page shows its title, hero, the six feature cards, both access cards, the edition badge and the call to action', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Clean-Core/i);

    const heroHeading = page.locator('h1');
    await expect(heroHeading).toBeVisible();
    await expect(heroHeading).toContainText(/Clean Core Accelerator/i);

    // The six feature cards, by their stable test ids.
    for (const id of [
      'feature-extensibility-routing',
      'feature-sap-api-hub-mapping',
      'feature-dual-rap-cap-engine',
      'feature-business-value-audit-tco',
      'feature-adt-cockpit-simulation',
      'feature-bpmn-2-0-business-sop',
    ]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }

    // The two access cards: the free community edition and bring-your-own-key.
    await expect(page.getByTestId('card-sandbox')).toBeVisible();
    await expect(page.getByTestId('card-developer')).toBeVisible();

    // The string an earlier version looked for — "Free Community Tool" — appears
    // nowhere in the codebase; the landing page says "Free Community Edition".
    await expect(page.getByText('Free Community Edition').first()).toBeVisible();

    await expect(page.locator('button, a').filter({ hasText: /Get Free Access|Open Workspace/ }).first()).toBeVisible();
  });

  test('the imprint is linked from the landing page and opens', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Not conditional. An imprint that is not reachable from the landing page is
    // a legal defect (§ 5 DDG), so its absence has to fail this test rather than
    // skip it.
    const legalNoticeLink = page.locator('a[href="/impressum"]').last();
    await expect(legalNoticeLink).toBeVisible();
    await legalNoticeLink.click();
    await expect(page).toHaveURL(/\/impressum/, { timeout: 15000 });
    await expect(page.locator('h1')).toContainText(/Legal Notice/i, { timeout: 15000 });
  });

  test('/dashboard, signed out, renders a header, a nav or a heading', async ({ page }) => {
    // All this ever checked: the route answers with a page that has one of the
    // three. It does not check where a signed-out visitor ends up.
    await page.goto('/dashboard');
    await expect(page.locator('header, nav, h1').first()).toBeVisible();
  });

  test('the assistant toggle on /knowledge is there and opens and closes', async ({ page }) => {
    // The chatbot lives in the authenticated shell layout, not on the public
    // landing page; /knowledge is inside that shell and reachable signed out.
    // Two of the May specs loaded `/`, found nothing, and passed for months.
    await page.goto('/knowledge');
    await page.waitForLoadState('domcontentloaded');

    // Located by its data attribute rather than its label since roadmap 6.8: the
    // label is a wording decision. `/knowledge` is outside a project, so it reads
    // "Ask the assistant"; inside a project the same button says "Ask this case".
    // Both labels are exercised rendered in `tests/assistant-label.spec.ts`; what
    // this test owns is that the toggle is mounted and toggles.
    //
    // At phone width: since D.8 (Sonny, 30.09.2026) the floating toggle is off
    // on desktop by default and is the one way in on a phone, so that is where
    // it is mounted and toggles. The desktop entry is the header button,
    // checked in `tests/assistant-label.spec.ts`.
    await page.setViewportSize({ width: 390, height: 844 });
    const chatbotTrigger = page.locator('[data-chatbot-toggle]').first();
    await expect(chatbotTrigger).toBeVisible();
    await expect(chatbotTrigger).toContainText('Ask the assistant');

    await chatbotTrigger.click();
    await expect(chatbotTrigger).toContainText('Close');
    await chatbotTrigger.click();
    await expect(chatbotTrigger).toContainText('Ask the assistant');
  });
});

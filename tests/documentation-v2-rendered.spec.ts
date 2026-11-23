import { test, expect } from './helpers/test';

/**
 * ADR-127 in a browser, on the public demo (`/demo/documentation`, no account): the one page in the order of the Word
 * file, Figure 1 with its steps, a step's page in place, no view switch, no input, and the length budget (UX review
 * L3: a tool at most three screens of the document at 1440 px is the target; the mock-up measured 3,916 px, the page
 * before it 10,682 px). Needs the dev or production server (playwright.config.ts).
 */

test.describe('Documentation v2 on the demo', () => {
  test('desktop: the answer, the bar, Figure 1, a step in place — one page, no switch, no input', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/demo/documentation', { waitUntil: 'domcontentloaded' });
    const onePage = page.locator('[data-documentation-one-page]');
    await expect(onePage).toBeVisible({ timeout: 90000 });

    // The head row: the note in the switch's place (ADR-126 (1)).
    await expect(page.locator('[data-one-page-note]')).toBeVisible();
    await expect(page.locator('[data-stage-head-end] [role="radiogroup"]')).toHaveCount(0);

    // The first screen: the answer with its facts and four numbers, the demo's note where the exports stand.
    await expect(page.locator('[data-doc-answer-facts]')).toBeVisible();
    await expect(page.locator('[data-answer-card] [data-facet]')).toHaveCount(4);
    const firstScreen = (await page.locator('[data-answer-card]').boundingBox())!;
    expect(firstScreen.y + firstScreen.height, 'the answer and its numbers fit the first screen').toBeLessThanOrEqual(900 + 120);

    // Chapters in the Word file's order, the bar before them, six items at most.
    const order = await page.locator('section[data-doc-chapter]').evaluateAll((els) => els.map((e) => e.getAttribute('data-doc-chapter')));
    expect(order).toEqual(['process', 'rules', 'stops', 'changes', 'systems', 'roles', 'questions']);
    expect(await page.locator('[data-doc-nav]').count()).toBeLessThanOrEqual(6);

    // Figure 1: a step on the figure opens its page in place.
    const step = page.locator('[data-doc-figure-step]').first();
    await expect(step).toBeVisible();
    await step.click();
    await expect(page.locator('[data-doc-step-page]')).toBeVisible();
    await page.getByRole('button', { name: 'Close the step' }).click();
    await expect(page.locator('[data-doc-step-page]')).toHaveCount(0);

    // No input, no map editor, no dead end.
    await expect(onePage.locator('input, textarea, select')).toHaveCount(0);
    await expect(page.locator('[data-process-map-canvas], [data-raci-edit]')).toHaveCount(0);
    await expect(page.getByText('Nothing more to write')).toHaveCount(0);

    // L3: the page body's length at 1440 px, logged for the release record.
    const height = (await onePage.boundingBox())!.height;
    console.log(`[documentation-v2] demo page body at 1440 px: ${Math.round(height)} px`);
    expect(height, 'the page body grew past the mock-up').toBeLessThanOrEqual(4500);
  });

  test('phone: the steps read as a list, no sideways scroll', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demo/documentation', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-documentation-one-page]')).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-doc-figure-phone]')).toBeVisible();
    await expect(page.locator('[data-doc-step]').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

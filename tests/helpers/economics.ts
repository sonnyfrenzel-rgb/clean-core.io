import { expect, type Page } from '@playwright/test';

/**
 * The Economics tool keeps its fields where a reader opens them (ADR-128): the shared figures in the answer card,
 * opened from the facet "Your assumptions"; each option's days in the fold "Effort in days", on its card under
 * "Enter my own figures" / "Change figures". The fields stay in the page while closed, so the specs that count them
 * still count what the page renders; these helpers open what is around a field before a spec types into it, the way a
 * reader would.
 */
export async function revealEconomicsField(page: Page, selector: string) {
  const field = page.locator(selector).first();
  await field.waitFor({ state: 'attached', timeout: 30000 });
  if (await field.isVisible()) return;
  // The shared figures: in the answer card, opened from the assumptions facet.
  const editor = page.locator('[data-economics-assumptions]').filter({ has: page.locator(selector) });
  if ((await editor.count()) > 0) {
    await page.locator('[data-facet="assumptions"]').click();
    await expect(field).toBeVisible();
    return;
  }
  // A fold of the page ("Effort in days").
  const fold = page.locator('[data-economics-fold="closed"]').filter({ has: page.locator(selector) });
  if ((await fold.count()) > 0) {
    await fold.first().locator('[data-economics-fold-toggle]').click();
    if (await field.isVisible()) return;
  }
  // An option card's fields.
  const card = page.locator('[data-cost-option]').filter({ has: page.locator(selector) });
  if ((await card.count()) > 0) await card.first().locator('[data-cost-option-edit]').click();
  await expect(field).toBeVisible();
}

/** Open what is around the field, then fill it. */
export async function fillEconomics(page: Page, selector: string, value: string) {
  await revealEconomicsField(page, selector);
  await page.fill(selector, value);
}

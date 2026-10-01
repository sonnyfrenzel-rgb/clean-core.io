import { expect, type Page } from '@playwright/test';

/**
 * The Economics tool keeps its fields under the rows they belong to (owner
 * decision 01.10.2026, proposal A): a checklist row opens its field on a click,
 * an option card its fields on "Fill in". The fields stay in the page while
 * closed, so the specs that count them (`[data-tco-cost]`) still count what the
 * page renders; these helpers open the row or card around a field before a spec
 * types into it, the way a reader would.
 */
export async function revealEconomicsField(page: Page, selector: string) {
  const field = page.locator(selector).first();
  await field.waitFor({ state: 'attached', timeout: 30000 });
  if (await field.isVisible()) return;
  const row = page.locator('[data-economics-row]').filter({ has: page.locator(selector) });
  if ((await row.count()) > 0) {
    await row.first().locator('[data-economics-row-toggle]').click();
  } else {
    const card = page.locator('[data-cost-option]').filter({ has: page.locator(selector) });
    await card.first().locator('[data-cost-option-edit]').click();
  }
  await expect(field).toBeVisible();
}

/** Open the field's row or card, then fill it. */
export async function fillEconomics(page: Page, selector: string, value: string) {
  await revealEconomicsField(page, selector);
  await page.fill(selector, value);
}

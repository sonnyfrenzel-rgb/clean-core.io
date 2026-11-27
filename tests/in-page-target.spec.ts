import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { focusInPageTarget } from '../lib/in-page-target';

/**
 * The blocked "Confirm decision…" button goes to the first place that lifts the block. When that place is on the
 * same page (`#decide`), assigning the hash the address already carries did nothing; `focusInPageTarget` scrolls to
 * it and focuses its first choice instead, and answers false for a place that is not on the page, so the caller
 * navigates. Run here in a real browser page from the function's own source, without the app server.
 */
const ROOT = path.resolve(__dirname, '..');

const PAGE = `<!doctype html><html><body style="margin:0">
  <button id="top">Confirm decision…</button>
  <div style="height:3000px">spacer</div>
  <section id="decide">
    <h2>Decide</h2>
    <p><a href="#elsewhere">help</a></p>
    <button data-option-choose="keep">Keep</button>
    <button data-option-choose="rebuild">Rebuild</button>
  </section>
  <div style="height:3000px"></div>
</body></html>`;

/** Runs the helper's own (transpiled) function in the page. */
async function run(page: Page, target: string): Promise<boolean> {
  return page.evaluate(
    ([src, p]) => (new Function(`return (${src});`)() as (path: string, doc: Document) => boolean)(p, document),
    [focusInPageTarget.toString(), target] as const,
  );
}

test('a place on this page is scrolled into view and its first choice gets the focus', async ({ page }) => {
  await page.setContent(PAGE);
  await page.focus('#top');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await run(page, '#decide')).toBe(true);
  // The first choice, not the first link or button in the section.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-option-choose'))).toBe('keep');
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('decide')!.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
});

test('without a choice the first button or link is focused; a place not on this page answers false', async ({ page }) => {
  await page.setContent(PAGE.replace(/ data-option-choose="[a-z]+"/g, ''));
  expect(await run(page, '#decide')).toBe(true);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('href'))).toBe('#elsewhere');

  // A fresh page: the smooth scroll above may still be running in the first one.
  const fresh = await page.context().newPage();
  await fresh.setContent(PAGE);
  await fresh.focus('#top');
  expect(await run(fresh, '#missing'), 'a missing target must leave the caller to navigate').toBe(false);
  expect(await run(fresh, '/project/p1/tco'), 'a path to another page is not handled here').toBe(false);
  expect(await fresh.evaluate(() => document.activeElement?.id)).toBe('top');
  expect(await fresh.evaluate(() => window.scrollY)).toBe(0);
  await fresh.close();
});

test('the decision card uses it before it navigates', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components/workspace/DecisionCard.tsx'), 'utf8');
  const call = src.indexOf('if (focusInPageTarget(first.path, document)) return;');
  expect(call).toBeGreaterThan(-1);
  expect(src.indexOf('window.location.assign(unblockHref(first.path));')).toBeGreaterThan(call);
});

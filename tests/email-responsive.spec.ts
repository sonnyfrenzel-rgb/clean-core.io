import { test, expect } from '@playwright/test';
import fs from 'fs';
import { wrapEmailDocument } from '../lib/email-layout';

/**
 * Every outgoing email must survive a phone.
 *
 * The templates are built from one design system whose fixed 40px card padding and
 * two-column header do not fit a 320px screen; `lib/email-layout.ts` undoes exactly
 * those on small viewports. This renders the real markup out of each route and fails
 * on any horizontal overflow — the symptom a recipient sees as a sideways-scrolling,
 * zoomed-out mail.
 */

const ROUTES: { file: string; label: string; vars: string[] }[] = [
  // The two registration mails are NOT in this list. They were rebuilt as fluid
  // tables that do not depend on the media query at all, so scraping their
  // markup and checking the card padding would assert nothing — the selector no
  // longer matches. `tests/registration-email-guard.spec.ts` covers them
  // properly instead: rendered three ways, including with the <style> block
  // stripped, which is what a mail client is free to do.
  //
  // The three tenant mails to users are not in it either: they moved to
  // `lib/tenant-email.ts` and the plain user-mail layout in 3.0.9, which has no
  // card for this check to measure; `tests/user-mail-layout.spec.ts` renders
  // them at phone width instead. What is left is the operator's copy of a
  // tenant request, still the original div-and-media-query design.
  { file: 'app/api/request-tenant-access/route.ts', label: 'request-tenant-access', vars: ['emailHtml'] },
];

/** Pulls a template literal out of the route source and neutralises its ${…} holes. */
function extractTemplate(source: string, varName: string): string {
  const start = source.indexOf(`const ${varName} = \``);
  if (start < 0) throw new Error(`${varName} not found`);
  const open = source.indexOf('`', start);
  let i = open + 1;
  while (i < source.length) {
    if (source[i] === '\\') { i += 2; continue; }
    if (source[i] === '`') break;
    i++;
  }
  return source
    .slice(open + 1, i)
    .replace(/\$\{[^}]*\}/g, 'sample-value')
    .replace(/\\`/g, '`');
}

const WIDTHS = [320, 375, 414];

/**
 * The document shell carries the viewport meta in both of its layouts.
 *
 * The check used to be made on the community mailer's own file, and went with
 * it (c9a2ecb). Every mail now goes through `wrapEmailDocument` — the plain
 * user-mail layout without a `<style>` block, the operator mails with it — so
 * the meta is asserted there, once per branch (QA review of 60b94e108964,
 * 26526264421b). Without it a phone renders the mail at desktop width and
 * zooms out, which the overflow checks here and in
 * `tests/user-mail-layout.spec.ts` cannot see: Playwright's desktop viewport
 * ignores the meta.
 */
test('the document shell carries the viewport meta, plain and styled', async ({ page }) => {
  const plain = wrapEmailDocument('<div data-mail-layout="plain"><p>Hello,</p></div>');
  const styled = wrapEmailDocument('<div style="border-radius: 24px; padding: 40px;">card</div>');
  expect(plain, 'the plain branch was not taken').not.toContain('<style');
  expect(styled, 'the styled branch was not taken').toContain('<style');
  for (const html of [plain, styled]) {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.setContent(html, { waitUntil: 'load' });
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

for (const route of ROUTES) {
  for (const varName of route.vars) {
    for (const width of WIDTHS) {
      const label = `${route.label}:${varName} @ ${width}px`;

      test(`renders without sideways scroll — ${label}`, async ({ page }) => {
        const source = fs.readFileSync(route.file, 'utf8');
        const html = wrapEmailDocument(extractTemplate(source, varName));

        await page.setViewportSize({ width, height: 900 });
        await page.setContent(html, { waitUntil: 'load' });

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${label} overflows by ${overflow}px`).toBeLessThanOrEqual(0);

        // The card must not still be sitting on desktop padding.
        const cardPadding = await page.evaluate(() => {
          const card = document.querySelector<HTMLElement>('div[style*="border-radius: 24px"]');
          return card ? parseInt(getComputedStyle(card).paddingLeft, 10) : -1;
        });
        expect(cardPadding, `${label} card padding`).toBeLessThanOrEqual(24);
      });
    }
  }
}

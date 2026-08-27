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
  // The three below still use the original div-and-media-query design. They are
  // the next candidates for the same rebuild.
  { file: 'app/api/send-tenant-approval-email/route.ts', label: 'send-tenant-approval-email', vars: ['emailHtml'] },
  { file: 'app/api/send-tenant-revoke-email/route.ts', label: 'send-tenant-revoke-email', vars: ['emailHtml'] },
  { file: 'app/api/request-tenant-access/route.ts', label: 'request-tenant-access', vars: ['emailHtml', 'pendingHtml'] },
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

test('the community mailer itself carries the viewport meta', async ({ page }) => {
  const html = fs
    .readFileSync('docs/emails/community-update-v2.3.html', 'utf8')
    .replace(/{{\w+}}/g, 'sample');
  await page.setViewportSize({ width: 320, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /width=device-width/,
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

import { test, expect } from '@playwright/test';
import { wrapEmailDocument } from '../lib/email-layout';
import { buildWelcomeEmail, WELCOME_EMAIL_SUBJECT } from '../lib/welcome-email';
import { buildAdminSignupEmail } from '../lib/admin-signup-email';

/**
 * The two registration mails have to survive a phone, and they may not rely on
 * the media query to do it.
 *
 * Both were originally nested `<div>`s with `padding: 40px`, laid out for 600px
 * and rescued on small screens by a media query in the document's `<style>`
 * block. That is fine in a browser and a coin flip in a mail client: many strip
 * `<style>` outright, and several ignore the viewport meta and scale a
 * 648px-wide construction down to fit — which is what "it gets cut off on
 * mobile" actually looks like from the reader's side.
 *
 * So each mail is rendered three ways at three widths: with the shell, without
 * the `<style>` block, and without the viewport meta. Nothing may extend past
 * the right edge in any of them.
 */

const MAILS = [
  {
    name: 'welcome',
    build: () => buildWelcomeEmail({ name: 'Sonny Frenzel', recipient: 'a-fairly-long-address@some-customer-domain.example.com' }),
  },
  {
    name: 'admin-signup',
    build: () =>
      buildAdminSignupEmail({
        name: 'Sonny Frenzel',
        email: 'a-fairly-long-address@some-customer-domain.example.com',
        uid: 'kJ3nQ8vXpZbR2yTfLm9cWd0aHs41',
        motivation:
          'Testing the new registration flow — we have roughly 900 custom ABAP objects to move off the core before the next upgrade.',
        authMethod: 'Email / password',
        termsVersion: '2026-07-07',
        signedUpAt: '2026-08-27 09:00:00 UTC',
      }),
  },
];

/** The three ways a mail client may hand the markup to its renderer. */
const SHELLS: { label: string; wrap: (inner: string) => string }[] = [
  { label: 'full shell', wrap: (i) => wrapEmailDocument(i) },
  {
    label: 'style block stripped',
    wrap: (i) =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;">${i}</body></html>`,
  },
  {
    label: 'no viewport meta',
    wrap: (i) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;">${i}</body></html>`,
  },
];

const WIDTHS = [320, 360, 375];

for (const mail of MAILS) {
  for (const shell of SHELLS) {
    for (const width of WIDTHS) {
      test(`${mail.name} fits ${width}px — ${shell.label}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(shell.wrap(mail.build()), { waitUntil: 'load' });

        const result = await page.evaluate((vw) => {
          const past: string[] = [];
          document.querySelectorAll<HTMLElement>('*').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > vw + 1) {
              past.push(`<${el.tagName.toLowerCase()}> reaches ${Math.round(r.right)}px`);
            }
          });
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            past: past.slice(0, 5),
          };
        }, width);

        expect(result.overflow, `page scrolls sideways by ${result.overflow}px`).toBeLessThanOrEqual(0);
        expect(result.past, `content past the right edge: ${result.past.join(', ')}`).toEqual([]);
      });
    }
  }
}

test.describe('structure, so the next edit cannot reintroduce the problem', () => {
  for (const mail of MAILS) {
    test(`${mail.name} is built from tables, not padded divs`, () => {
      const html = mail.build();
      // The outer container must be fluid. A fixed width is what gets scaled
      // down — or cut off — when the client decides the message is too wide.
      expect(html).toContain('width="100%"');
      expect(html).toMatch(/max-width:\s*600px/);
      // No div carrying desktop padding: that is the 40px that ate 80 of 375
      // pixels before the media query undid it.
      expect(html, 'a div carries padding of 32px or more').not.toMatch(
        /<div[^>]*style="[^"]*padding:\s*(3[2-9]|[4-9]\d)px/,
      );
      // A two-column header with an align-right cell is the first thing to break.
      expect(html).not.toMatch(/align="right"/);
      expect(html, 'nowrap will push content past the edge').not.toContain('white-space: nowrap');
    });
  }

  test('the welcome mail stays short', () => {
    // It was 720 words and three and a half screens on a phone. The ceiling is
    // close to the current length so the next paragraph has to be argued for.
    const text = buildWelcomeEmail({ name: 'X', recipient: 'x@y.z' })
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = text.split(' ').filter(Boolean).length;
    expect(words, `welcome mail is ${words} words`).toBeLessThan(500);
  });

  test('the welcome mail still does the whole job', () => {
    const html = buildWelcomeEmail({ name: 'X', recipient: 'x@y.z' });
    expect(WELCOME_EMAIL_SUBJECT.toLowerCase()).toContain('welcome');
    // Shorter is not allowed to mean "dropped the reason it exists".
    for (const required of ['/dashboard', '/first-run', '/trust', 'europe-west1', 'AES-256-GCM', 'HMAC-signed', 'TOTP', 'GDPR']) {
      expect(html, `the welcome mail lost ${required}`).toContain(required);
    }
    expect(html).not.toMatch(/under review|being reviewed|approval|approved/i);
  });
});

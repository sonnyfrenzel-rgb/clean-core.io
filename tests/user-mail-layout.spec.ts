import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { SEED_MAIL_TYPES, htmlLinkCount, type ProductionMail } from '../scripts/lib/mail-seed';
import { buildUserMail } from '../lib/user-mail';
import { wrapEmailDocument } from '../lib/email-layout';
import { buildTenantPendingEmail } from '../lib/tenant-email';
import { escapeHtml } from '../lib/utils';

/**
 * Roadmap 3.0.9, round 2: what the seed run of 24.09.2026 measured, held.
 *
 * web.de delivered the welcome mail to the inbox only as plain paragraphs with
 * one plain link at the end and a text part; the card-and-button HTML and a
 * text-only version both went to spam. So every mail to a user is built with
 * `lib/user-mail.ts`, and every mail — user or operator — carries a text part
 * and no emoji.
 *
 * The mails are taken from the seed catalogue (`scripts/lib/mail-seed.ts`),
 * which renders each one from its production template with the production
 * sender, subject and text part — so this checks what is sent, not a sample.
 * Pure: no server, no Firestore, no send.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}]/u;
const ctx = {
  runId: 'spec-layout',
  recipient: { label: 'layout', address: 'a-fairly-long-address@some-customer-domain.example.com' },
  now: new Date('2026-09-24T10:00:00Z'),
};
const built: { type: string; audience: 'nutzer' | 'betrieb'; mail: ProductionMail }[] = SEED_MAIL_TYPES.map((t) => ({
  type: t.type,
  audience: t.audience,
  mail: t.build(ctx),
}));
const userMails = built.filter((b) => b.audience === 'nutzer');

test('the catalogue still has every mail, and the user mails are the eight expected', () => {
  expect(built).toHaveLength(13);
  expect(userMails.map((b) => b.type).sort()).toEqual(
    ['address-confirmation', 'invitation', 'survey', 'tenant-approval', 'tenant-pending', 'tenant-revoke', 'welcome', 'welcome-approval'],
  );
});

for (const { type, mail } of built) {
  test(`${type}: a text part, and no emoji in subject, HTML or text`, () => {
    expect((mail.text ?? '').trim().length, 'no text part').toBeGreaterThan(100);
    expect(mail.subject).not.toMatch(EMOJI);
    const hit = (mail.html.match(EMOJI) || mail.text!.match(EMOJI) || [])[0];
    expect(hit, `emoji in the body: ${hit}`).toBeUndefined();
  });
}

for (const { type, mail } of userMails) {
  test(`${type}: plain layout, exactly one link shown as its URL, no button`, () => {
    expect(mail.html).toContain('data-mail-layout="plain"');
    // The survey's unsubscribe URL is the one allowed extra, in the footer.
    const expected = type === 'survey' ? 2 : 1;
    expect(htmlLinkCount(mail.html), 'number of links').toBe(expected);
    for (const m of mail.html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      expect(m[2].trim(), 'a link hides its URL behind a label').toBe(m[1]);
    }
    expect(mail.html).not.toMatch(/<table\b|<img\b|<button\b|<h1\b/i);
    expect(mail.html, 'a link styled as a button').not.toMatch(/<a\s[^>]*style="[^"]*(?:background|padding|display)/i);
    // Minimal styling: no <style> block in the document, no background colours.
    expect(mail.html).not.toMatch(/<style\b/i);
    expect(mail.html).not.toMatch(/background(?:-color)?:\s*#(?!fff)/i);
    // The link comes after the body, not in it: nothing but the sign-off and
    // the small print follows it.
    const first = mail.html.search(/<a\s/i);
    expect(mail.html.slice(first)).toMatch(/Regards,<br>The Clean-Core\.io Team|<p[^>]*>Felix<\/p>/);
  });

  test(`${type}: fits a 320px screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.setContent(mail.html, { waitUntil: 'load' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${type} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  });
}

test.describe('the shared layout', () => {
  test('refuses a second link smuggled into a paragraph', () => {
    expect(() =>
      buildUserMail({
        greeting: 'Hello,',
        paragraphs: ['See <a href="https://clean-core.io/trust">trust</a>.'],
        link: { lead: 'Open:', url: 'https://clean-core.io/dashboard' },
        footer: [],
      }),
    ).toThrow(/one, at the end/);
  });

  test('the document shell drops the responsive <style> block for it, and only for it', () => {
    const plain = wrapEmailDocument(
      buildUserMail({ greeting: 'Hi,', paragraphs: ['x'], link: { lead: 'Open:', url: 'https://clean-core.io/' }, footer: [] }),
    );
    expect(plain).not.toContain('<style');
    expect(wrapEmailDocument('<div>card</div>')).toContain('<style');
  });

  test('the link is attribute-escaped, and the text part writes it once', () => {
    const html = buildUserMail({
      greeting: 'Hi,',
      paragraphs: [],
      link: { lead: 'Open:', url: 'https://clean-core.io/a?x=1&y="2"' },
      footer: [],
    });
    expect(html).toContain('href="https://clean-core.io/a?x=1&amp;y=&quot;2&quot;"');
  });
});

test.describe('the recipient is the raw address; only the markup is escaped', () => {
  /**
   * The tenant-pending mail was sent `to: email`, where `email` was the
   * HTML-escaped copy made for the markup. An address with `&` or `'` in it —
   * both legal in a local part — was mailed as `&amp;` / `&#39;`: another
   * mailbox, or none.
   */
  const SENDERS = [
    'app/api/request-tenant-access/route.ts',
    'app/api/send-tenant-approval-email/route.ts',
    'app/api/send-tenant-revoke-email/route.ts',
    'app/api/send-approval-email/route.ts',
    'app/api/account/register/route.ts',
    'app/api/projects/[projectId]/invitations/route.ts',
    'app/api/projects/[projectId]/invitations/[invitationId]/accept/route.ts',
  ];

  for (const rel of SENDERS) {
    test(`${rel}: no \`to:\` takes a value that went through escapeHtml`, () => {
      const src = read(rel);
      const escaped = new Set([...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*escapeHtml\(/g)].map((m) => m[1]));
      const recipients = [...src.matchAll(/\bto:\s*([A-Za-z_]\w*)\b/g)].map((m) => m[1]);
      expect(recipients.length, `${rel}: no \`to:\` found — the guard no longer sees the send`).toBeGreaterThan(0);
      for (const r of recipients) expect(escaped.has(r), `${rel} sends to the HTML-escaped ${r}`).toBe(false);
      expect(src).not.toMatch(/\bto:\s*escapeHtml\(/);
    });
  }

  test('request-tenant-access sends the applicant copy to the raw address', () => {
    const src = read('app/api/request-tenant-access/route.ts');
    expect(src).toMatch(/const email = escapeHtml\(rawEmail\)/);
    expect(src).toMatch(/to: rawEmail,/);
  });

  test('an address with & and \' is escaped in the body and nowhere else', () => {
    const raw = "o'brien&co@example.com";
    const html = buildTenantPendingEmail({ name: 'X', recipient: escapeHtml(raw) });
    expect(html).toContain(escapeHtml(raw));
    expect(html).not.toContain(raw);
  });
});

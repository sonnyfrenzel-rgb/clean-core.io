import { APP_VERSION } from '@/lib/version';
import { CONTACT_EMAIL } from '@/lib/constants';

/**
 * The one layout every mail to a *user* is built with (roadmap 3.0.9, round 2).
 *
 * Measured, not guessed — seed run of 24.09.2026, SPF/DKIM/DMARC passing and
 * tracking off, so neither sender nor subject was the lever:
 *
 * - web.de put the welcome mail in the inbox only as plain, simple HTML —
 *   paragraphs, every inline URL removed, one plain link at the end, no
 *   button, no heavy styling — *with* a text part. Text-only went to spam, and
 *   so did the old card-and-button HTML.
 * - Microsoft 365 moved to the inbox once a text part was there.
 * - GMX filtered everything, which is reputation, not markup.
 *
 * So this is what a user mail is: a greeting, paragraphs, **exactly one link**
 * at the end shown as its own visible URL (nothing behind a label), a
 * signature and a small-print footer. No table scaffolding, no button, no
 * image, no badge, no emoji. The inline styles are font family, size,
 * colour, line-height and paragraph margin, plus the wrapper's layout
 * (max-width, margin, padding) and `word-break` on the one visible link, so a
 * long URL stays inside a 320px screen.
 *
 * The survey is the one mail allowed a second link: its unsubscribe URL, in
 * the footer, because a bulk mail owes the reader a way out in the body and
 * not only in a header their client may not show.
 *
 * Every string handed in is inserted verbatim: paragraphs are trusted markup
 * written in this repository (`<strong>` and entities are fine; `<a>` is not —
 * `assertNoLinks` refuses one), and any caller value inside them must already be
 * HTML-escaped. The link URL is built by the caller from `APP_BASE_URL` and is
 * attribute-escaped here.
 *
 * `wrapEmailDocument` recognises the `data-mail-layout="plain"` marker and
 * leaves out the responsive `<style>` block, which exists for the old card
 * layouts and has nothing to act on here.
 */

export const PLAIN_MAIL_MARKER = 'data-mail-layout="plain"';

const FONT = 'Arial, Helvetica, sans-serif';

/** The imprint line, as every user mail has carried it. */
export const MAIL_IMPRINT_HTML = `Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Germany, ${CONTACT_EMAIL}`;

export interface UserMailInput {
  /** Already HTML-escaped where it carries a name, e.g. `Hello Jane,`. */
  greeting: string;
  /** Body paragraphs, trusted markup without links. */
  paragraphs: string[];
  /** The one link: a sentence leading into it, and the absolute URL itself. */
  link: { lead: string; url: string };
  /** Paragraphs after the link and before the signature, e.g. "ignore this mail if…". */
  after?: string[];
  /** Defaults to "Regards,<br>The Clean-Core.io Team". */
  signature?: string;
  /** Small print: why this address got the mail, legal notes. No links. */
  footer: string[];
  /** Bulk mail only (the survey): the unsubscribe URL, shown in the footer. */
  unsubscribeUrl?: string | null;
}

function attr(value: string): string {
  return value.replace(/&(?!amp;)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function assertNoLinks(parts: string[]): void {
  for (const p of parts) {
    if (/<a[\s>]/i.test(p)) throw new Error('user mail: a paragraph carries its own link; the layout allows one, at the end');
  }
}

function paragraph(html: string, style = ''): string {
  return `<p style="margin: 0 0 16px 0;${style}">${html}</p>`;
}

function visibleLink(url: string): string {
  const u = attr(url);
  // `word-break` keeps a long token URL inside a 320px screen; nothing else.
  return `<a href="${u}" style="color: #1d4ed8; word-break: break-all;">${u}</a>`;
}

/** The HTML body of a user mail. Wrap it with `wrapEmailDocument` like every other mail. */
export function buildUserMail(input: UserMailInput): string {
  const after = input.after ?? [];
  assertNoLinks([input.greeting, ...input.paragraphs, input.link.lead, ...after, ...input.footer]);

  const small = ' font-size: 12px; color: #6b7280;';
  const footer = [...input.footer, `Imprint: ${MAIL_IMPRINT_HTML}. System version ${APP_VERSION}.`];
  if (input.unsubscribeUrl) footer.push(`Unsubscribe: ${visibleLink(input.unsubscribeUrl)}`);

  return `<div ${PLAIN_MAIL_MARKER} style="font-family: ${FONT}; font-size: 15px; line-height: 1.5; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 16px;">
${paragraph(input.greeting)}
${input.paragraphs.map((p) => paragraph(p)).join('\n')}
${paragraph(`${input.link.lead}<br>${visibleLink(input.link.url)}`)}
${after.map((p) => paragraph(p)).join('\n')}
${paragraph(input.signature ?? 'Regards,<br>The Clean-Core.io Team')}
${footer.map((p) => paragraph(p, small)).join('\n')}
</div>`;
}

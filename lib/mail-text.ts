/**
 * The plain-text part of every product mail, derived from its HTML.
 *
 * One function for all senders. There used to be two: this one in
 * `lib/transactional-mail.ts` and a private copy in the register route, and the
 * copy lacked the German entities — its catch-all turned `&szlig;` into a space,
 * so the imprint of every welcome mail read "Hellerstra e 9" in its text part.
 * Four more mails (the welcome through the admin console and the three tenant
 * mails, plus the tenant request to the operator) had no text part at all.
 *
 * Why it matters (roadmap 3.0.9, seed run 20260924-a): at Microsoft 365 the
 * welcome mail with a text part reached the inbox and the same HTML with the
 * same subject *without* one went to spam. HTML-only is a long-standing spam
 * signal; a text part generated from the same markup cannot drift from what
 * the reader sees.
 *
 * Deliberately crude — it keeps link targets, collapses the table scaffolding
 * and drops styling, the document head and comments. Entities are decoded in
 * one pass (named and numeric), so `&amp;nbsp;` stays the literal text it is.
 *
 * Pure: no imports, safe for route handlers, scripts and specs alike.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: "'",
  lsquo: "'",
  sbquo: "'",
  ldquo: '"',
  rdquo: '"',
  bdquo: '"',
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  middot: '·',
  bull: '*',
  rarr: '->',
  larr: '<-',
  sect: '§',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  times: '×',
  deg: '°',
  // German letters, because the last line of every one of these mails is an
  // imprint (found 18.09.2026 reading the invitation mail for a legal review).
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  aacute: 'á',
  agrave: 'à',
};

function decodeEntity(_match: string, body: string): string {
  if (body[0] === '#') {
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
      try {
        return String.fromCodePoint(code);
      } catch {
        return ' ';
      }
    }
    return ' ';
  }
  if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)) return NAMED_ENTITIES[body];
  const lower = body.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) return NAMED_ENTITIES[lower];
  // An entity nobody listed: a space, as before — never the raw `&name;`.
  return ' ';
}

export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head(?:\s[^>]*)?>[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Line breaks in the markup are indentation, not content — as in a browser.
    .replace(/\s+/g, ' ')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const shown = String(label).replace(/<[^>]+>/g, '').trim();
      // A link shown as its own URL (the user-mail layout) is written once, not
      // as "https://x (https://x)".
      return shown === href ? href : `${shown} (${href})`;
    })
    .replace(/<\/(p|h[1-6])\s*>/gi, '\n\n')
    .replace(/<(br|\/div|\/tr|\/li|\/ul|\/ol|\/table)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, decodeEntity)
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

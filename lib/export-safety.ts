/**
 * What may go into an exported document, and in what form.
 *
 * The analysis, design and documentation exports assemble HTML from fields the
 * model wrote, out of the customer's own ABAP, and from the project name the
 * account holder typed. A comment in that source is enough to steer a model
 * into returning markup, and the result is opened in a browser — in the case of
 * the design preview, in this application's own origin
 * (QA review of 33471220d6e9: 024ec609bc86, 06f7c0c56a6c; SEC-2026-014).
 *
 * Escaping is the general answer and lives in `escapeHtml`. A URL is the
 * exception: escaping `javascript:alert(1)` yields a perfectly well-formed
 * `javascript:` link, so a URL is not escaped but checked.
 */

/**
 * Escape a value for interpolation into an exported HTML document.
 *
 * The one escaper. It used to exist twice — here by way of `lib/utils.ts`, and
 * privately inside `lib/audit-pack.ts` — which is how two documents built from
 * the same fields came to have two answers to the same question. `lib/utils.ts`
 * re-exports this one, so the mail routes that import it from there keep
 * working, and `lib/audit-pack.ts` calls it directly.
 *
 * `unknown` rather than `string`, and `String(value ?? '')` rather than an
 * early return on anything falsy: `0` and `false` are values a report may need
 * to show, and a function that silently turned them into an empty cell would be
 * a quieter bug than the one this prevents.
 *
 * This neutralises a value for a *text* node and for a *quoted attribute*. It
 * is not sufficient for an unquoted attribute, a `style` or `href` value, or
 * anything inside a `<script>` or `<style>` element — those contexts have their
 * own grammar, and the exports avoid them by never interpolating a foreign
 * value into an attribute at all.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** SAP's API Hub, over TLS, or no link at all. */
export function sapApiHubHref(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return '';
  }
  if (url.protocol !== 'https:') return '';
  const host = url.hostname.toLowerCase();
  if (host !== 'api.sap.com' && !host.endsWith('.api.sap.com')) return '';
  return escapeHtml(url.toString());
}

/**
 * An anchor for a model-supplied API Hub URL, or the label on its own when the
 * URL is not one. A link that goes nowhere useful is worse than no link.
 */
export function sapApiHubLink(raw: unknown, label: string): string {
  const href = sapApiHubHref(raw);
  const text = escapeHtml(label);
  if (!href) return text;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

/**
 * A model-supplied URL that may be put on an `href`, or nothing.
 *
 * The same reasoning as `sapApiHubHref` without the host rule: an `href` is
 * one of the places where escaping does not help, because
 * `javascript:alert(1)` escapes to itself and React renders it (with a
 * warning in development and nothing in production). So the URL is parsed and
 * only `http:` or `https:` with a host survives; everything else — `javascript:`,
 * `data:`, `vbscript:`, a relative path, a bare word — comes back empty, and the
 * caller shows the text without a link. Written for the presentation viewer,
 * which put `row.url` straight on an anchor (security audit of b88c77b,
 * SEC-2026-152); the return value is the *parsed* URL, not the raw string, so
 * whitespace and case tricks are normalised away before they reach the DOM.
 */
export function safeHttpHref(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (!url.hostname) return '';
  return url.toString();
}

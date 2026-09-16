import { escapeHtml } from './utils';

/**
 * What may go into an exported document, and in what form.
 *
 * The design and documentation exports assemble HTML from fields the model
 * wrote, out of the customer's own ABAP. A comment in that source is enough to
 * steer a model into returning markup, and the result is opened in a browser —
 * in the case of the design preview, in this application's own origin
 * (QA review of 33471220d6e9: 024ec609bc86, 06f7c0c56a6c).
 *
 * Escaping is the general answer and lives in `escapeHtml`. A URL is the
 * exception: escaping `javascript:alert(1)` yields a perfectly well-formed
 * `javascript:` link, so a URL is not escaped but checked.
 */

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

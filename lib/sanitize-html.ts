import { marked } from 'marked';

/**
 * Sanitizer for untrusted / AI-generated markdown and HTML (audit P1 XSS).
 *
 * Use `renderMarkdownSafe()` everywhere `marked(...)` output is currently passed
 * to dangerouslySetInnerHTML or written into exported HTML, and `sanitizeHtml()`
 * for already-assembled HTML (e.g. export files, mermaid SVG).
 *
 * Requires `dompurify` (pin a current version > 3.4.10 per the audit) and, for
 * server-side rendering, `jsdom`. Add both to dependencies.
 */

let _purify: any = null;

function getPurify() {
  if (_purify) return _purify;
  // Lazy import so the bundle stays clean and SSR/CSR both work.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const createDOMPurify = require('dompurify');
  if (typeof window !== 'undefined') {
    _purify = createDOMPurify(window);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM } = require('jsdom');
    _purify = createDOMPurify(new JSDOM('').window);
  }
  return _purify;
}

const HTML_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li',
    'strong', 'em', 'code', 'pre', 'blockquote', 'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'br', 'span', 'del',
  ],
  ALLOWED_ATTR: ['href', 'title', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
  // Block javascript:, data: etc. on href/src.
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
} as const;

/** Render untrusted markdown to SANITIZED HTML — safe for dangerouslySetInnerHTML. */
export function renderMarkdownSafe(md: string): string {
  const rawHtml = marked.parse(md ?? '', { async: false }) as string;
  return getPurify().sanitize(rawHtml, HTML_CONFIG);
}

/** Sanitize already-assembled HTML (export files, etc.). */
export function sanitizeHtml(html: string): string {
  return getPurify().sanitize(html ?? '', HTML_CONFIG);
}

/** Sanitize SVG output (e.g. mermaid) using the SVG profile. */
export function sanitizeSvg(svg: string): string {
  return getPurify().sanitize(svg ?? '', { USE_PROFILES: { svg: true, svgFilters: true } });
}

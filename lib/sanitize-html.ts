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
  const createDOMPurify = require('dompurify');
  if (typeof window !== 'undefined') {
    _purify = createDOMPurify(window);
  } else {
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

/**
 * Lightweight sanitizer for OUR OWN mermaid SVG output.
 *
 * DOMPurify's SVG profile (sanitizeSvg) strips the XHTML content INSIDE
 * <foreignObject> — which is exactly where mermaid v11 renders node labels —
 * leaving empty boxes (the "Target Architecture Diagram is blank" bug). The
 * mermaid input here is deterministic and its dynamic label parts are already
 * neutralised upstream (e.g. TargetArchitectureDiagram's sanitize()), so instead
 * of dropping the labels we keep the structure and strip only active content:
 * <script>/<iframe>, inline event handlers, and javascript: URLs.
 */
export function sanitizeMermaidSvg(svg: string): string {
  if (!svg) return '';
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\1/gi, '')
    .replace(/javascript:/gi, '');
}

/** Sanitize SVG output using the strict SVG profile (drops foreignObject HTML). */
export function sanitizeSvg(svg: string): string {
  return getPurify().sanitize(svg ?? '', {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject', 'div', 'span', 'p', 'br', 'b', 'i', 'em', 'strong', 'code', 'pre', 'ul', 'li', 'a'],
    ADD_ATTR: ['dominant-baseline', 'text-anchor', 'requiredFeatures', 'transform', 'style', 'x', 'y', 'width', 'height', 'class', 'xmlns', 'xmlns:xlink', 'viewBox', 'marker-end', 'marker-start', 'font-size', 'fill', 'stroke', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points'],
  });
}

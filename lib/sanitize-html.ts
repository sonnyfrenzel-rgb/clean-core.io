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
  // Lazy import so the bundle stays clean and SSR/CSR both work. A static
  // import would pull jsdom into the client chunk for a branch it never takes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate, see above
  const createDOMPurify = require('dompurify');
  if (typeof window !== 'undefined') {
    _purify = createDOMPurify(window);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate, see above
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
 * Sanitizer for the mermaid SVG the design stage renders (SEC-2026-015).
 *
 * This was a chain of regular expressions, and its comment said why: DOMPurify
 * emptied every `<foreignObject>`, which is exactly where mermaid v11 renders
 * node labels, so the Target Architecture Diagram came out as a row of blank
 * boxes. That was true, and it is still true of `sanitizeSvg` below. Measured
 * on a real mermaid v11 flowchart rather than assumed: `USE_PROFILES: { svg,
 * svgFilters, html }` with `ADD_TAGS: ['foreignObject', 'div', 'span', …]`
 * keeps all nine `<foreignObject>` elements and not one character of their
 * contents.
 *
 * The cause is one option. DOMPurify will not let an element cross from the SVG
 * namespace into the HTML namespace except at an "HTML integration point", and
 * its default set of those is `{ 'annotation-xml': true }` — `foreignobject` is
 * not in it, so the `<div xmlns="http://www.w3.org/1999/xhtml">` mermaid puts
 * the label in is dropped with its subtree. `HTML_INTEGRATION_POINTS` is
 * configurable, and it takes a record: passed an array, DOMPurify clones the
 * array, the `['foreignobject']` lookup misses, and the labels disappear
 * exactly as before.
 *
 * With `{ foreignobject: true }` the diagram comes through byte for byte — the
 * theme `<style>` block, the markers, the filters and every label — and the
 * parser does properly what the regexes were approximating. A pattern list has
 * to guess how a browser will read markup; six of the ten shapes
 * `tests/diagram-sanitizer-guard.spec.ts` feeds it came through the old chain
 * intact, each because the text did not look the way the pattern expected. A
 * parser reads the markup the way the browser will, and answers about the tree
 * rather than about the spelling.
 *
 * This is the third layer, not the only one: `components/MermaidDiagram.tsx`
 * initialises mermaid with `securityLevel: 'strict'`, and
 * `TargetArchitectureDiagram` strips its node labels before they ever become
 * mermaid source.
 */
const MERMAID_SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ['foreignObject'],
  ADD_ATTR: ['dominant-baseline', 'text-anchor', 'requiredFeatures', 'transform', 'style', 'x', 'y', 'width', 'height', 'class', 'xmlns', 'xmlns:xlink', 'viewBox', 'marker-end', 'marker-start', 'font-size', 'fill', 'stroke', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points'],
  // Label markup may cross into the HTML namespace inside <foreignObject> and
  // nowhere else. This REPLACES DOMPurify's default set rather than extending
  // it, so 'annotation-xml' stops being one — a diagram has no MathML in it.
  HTML_INTEGRATION_POINTS: { foreignobject: true } as Record<string, boolean>,
  // Nothing mermaid emits is in this list; everything in it is a way to get
  // behaviour, navigation or an outbound request out of a picture.
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'label', 'link', 'base', 'meta', 'audio', 'video', 'source', 'track', 'canvas', 'math', 'annotation-xml', 'set', 'animate', 'animatetransform', 'animatemotion', 'handler', 'listener'],
  FORBID_ATTR: ['formaction', 'ping', 'srcdoc', 'srcset'],
} as const;

export function sanitizeMermaidSvg(svg: string): string {
  if (!svg) return '';
  return getPurify().sanitize(svg, MERMAID_SVG_CONFIG);
}

/** Sanitize SVG output using the strict SVG profile (drops foreignObject HTML). */
export function sanitizeSvg(svg: string): string {
  return getPurify().sanitize(svg ?? '', {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject', 'div', 'span', 'p', 'br', 'b', 'i', 'em', 'strong', 'code', 'pre', 'ul', 'li', 'a'],
    ADD_ATTR: ['dominant-baseline', 'text-anchor', 'requiredFeatures', 'transform', 'style', 'x', 'y', 'width', 'height', 'class', 'xmlns', 'xmlns:xlink', 'viewBox', 'marker-end', 'marker-start', 'font-size', 'fill', 'stroke', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points'],
  });
}

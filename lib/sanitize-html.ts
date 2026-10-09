import { marked } from 'marked';
import type { DOMPurify } from 'dompurify';

/**
 * DOMPurify-based sanitizing of markdown and HTML from users and models.
 *
 * `renderMarkdownSafe()` renders markdown with `marked` and passes the result
 * through DOMPurify with HTML_CONFIG; `sanitizeHtml()` applies HTML_CONFIG to
 * HTML that is already assembled; `sanitizeMermaidSvg()` applies the SVG
 * configuration further down. On the server DOMPurify runs on a `jsdom` window.
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
  addStyleHooks(_purify);
  return _purify;
}

/**
 * CSS that can reach outside the picture: a resource function other than a
 * reference to a fragment of the same SVG (`url(#marker)` is how mermaid wires
 * its arrow heads), an `@import`, or a backslash — CSS lets an escape spell any
 * of those without the letters appearing, so a backslash is refused outright.
 * Mermaid's own stylesheet and inline styles contain none of these; a diagram
 * that does was not drawn by mermaid.
 */
const OUTBOUND_CSS_PATTERN = /\\|@import|(?:image-set|image|cross-fade|src)\s*\(|url\s*\((?!\s*['"]?#)/i;

/** Checked as written and with CSS comments removed, so a comment cannot split a function name from its parenthesis. */
const OUTBOUND_CSS = {
  test: (css: string): boolean =>
    OUTBOUND_CSS_PATTERN.test(css) || OUTBOUND_CSS_PATTERN.test(css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')),
};

/**
 * DOMPurify does not read CSS. `style` survives in the diagram config because
 * mermaid's theme `<style>` block and its inline styles are what make the
 * diagram look like one — so the one thing CSS can do beyond looks, fetch or
 * navigate, is checked here. The hooks sit on the shared instance; the markdown
 * config forbids `style` elements and attributes altogether, so for it they
 * never find anything to decide.
 */
function addStyleHooks(purify: DOMPurify): void {
  purify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style' && OUTBOUND_CSS.test(node.textContent || '')) node.textContent = '';
  });
  purify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style' && OUTBOUND_CSS.test(data.attrValue || '')) data.keepAttr = false;
    // SVG presentation attributes take `url(…)` as well — `fill`, `stroke`,
    // `marker-*`, `filter`, `clip-path`, `mask`. Their values are CSS values, so
    // the same check as for `style` applies: a backslash (a CSS escape) or a
    // resource function other than a same-document fragment (`url(#arrowhead)`,
    // which mermaid draws with) removes the attribute, also when a CSS comment
    // sits between the function name and its parenthesis.
    if (URL_PRESENTATION_ATTRS.has(data.attrName) && OUTBOUND_CSS.test(data.attrValue || '')) {
      data.keepAttr = false;
    }
  });
}

const URL_PRESENTATION_ATTRS = new Set([
  'fill', 'stroke', 'marker-start', 'marker-mid', 'marker-end', 'filter', 'clip-path', 'mask', 'cursor',
]);

const HTML_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li',
    'strong', 'em', 'code', 'pre', 'blockquote', 'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'br', 'span', 'del',
  ],
  ALLOWED_ATTR: ['href', 'title', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
  // Block javascript:, data: etc. on href/src. A leading `/` means a path on
  // this site, so `//host` and `/\host` (which browsers read as `//host`) are
  // not one.
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/(?![/\\]))/i,
} as const;

/** Renders markdown to HTML and sanitizes the result with HTML_CONFIG. */
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
 * boxes. That was true of the strict SVG profile, and it is why this one is
 * configured rather than taken as it comes. Measured
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
 * initialises mermaid with `securityLevel: 'strict'`, and any component that
 * builds mermaid source from model text has to strip its node labels first
 * (the model-drawn `TargetArchitectureDiagram` that did so was removed on
 * 01.10.2026).
 */
const MERMAID_SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ['foreignObject'],
  ADD_ATTR: ['dominant-baseline', 'text-anchor', 'requiredFeatures', 'transform', 'style', 'x', 'y', 'width', 'height', 'class', 'xmlns', 'xmlns:xlink', 'viewBox', 'marker-end', 'marker-start', 'font-size', 'fill', 'stroke', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points'],
  // Label markup may cross into the HTML namespace inside <foreignObject> and
  // nowhere else. This REPLACES DOMPurify's default set rather than extending
  // it, so 'annotation-xml' stops being one — a diagram has no MathML in it.
  HTML_INTEGRATION_POINTS: { foreignobject: true } as Record<string, boolean>,
  // Nothing mermaid emits is in these lists. The tags are the ways to get
  // behaviour, navigation or an outbound request out of a picture: script and
  // its carriers, forms, media, links (`a`, `area`), and every element that
  // loads a resource by reference (`img`, `image`, `use`, `feImage`, `picture`).
  // The attributes are the references themselves, so an element not named here
  // cannot carry one either. CSS, the remaining way, is checked by the hooks
  // above.
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'label', 'link', 'base', 'meta', 'audio', 'video', 'source', 'track', 'canvas', 'math', 'annotation-xml', 'set', 'animate', 'animatetransform', 'animatemotion', 'handler', 'listener', 'a', 'area', 'map', 'img', 'image', 'picture', 'use', 'feimage'],
  FORBID_ATTR: ['formaction', 'ping', 'srcdoc', 'srcset', 'href', 'xlink:href', 'src', 'background', 'poster', 'action'],
} as const;

export function sanitizeMermaidSvg(svg: string): string {
  if (!svg) return '';
  return getPurify().sanitize(svg, MERMAID_SVG_CONFIG);
}

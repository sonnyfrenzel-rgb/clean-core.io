import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sapApiHubHref, sapApiHubLink, sapApiHubUrl, safeHttpHref, escapeHtml } from '../lib/export-safety';
import { escapeHtml as escapeHtmlFromUtils } from '../lib/utils';

/**
 * Three stages assemble an HTML document out of values the model wrote from the
 * customer's own ABAP and out of the name the account holder typed, and a
 * reviewer opens it — the design preview even opened it in this application's
 * origin (QA review of 33471220d6e9: 024ec609bc86, 06f7c0c56a6c; SEC-2026-014).
 * A comment in the uploaded source is enough to steer a model into returning
 * markup.
 *
 * What the produced documents actually contain is checked by walking the real
 * application and opening the real download (`tests/export-inertness-guard.spec.ts`).
 * The checks here are the cheap early warning beside it: they read the source and
 * fail the moment a new value is interpolated without going through the escaper,
 * or lands somewhere escaping alone would not save it.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';
const DESIGN = 'app/(app)/project/[projectId]/design/page.tsx';
const DOCS = 'app/(app)/project/[projectId]/documentation/page.tsx';

/** The interpolations of one template region, minus the ones we build ourselves. */
function modelValues(source: string, from: string, to: string): string[] {
  const seg = source.slice(source.indexOf(from), source.indexOf(to));
  const all = [...seg.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map((m) => m[1].trim());
  return all.filter((e) =>
    !e.startsWith('esc(')
    && !e.startsWith('sapApiHubLink(')
    && !e.includes('.map(')          // a sub-template, checked on its own values
    && !/^[A-Za-z]+(Rows|Cards|Phases|Section|CSS)$/.test(e)  // assembled above
    && !e.startsWith('new Date()')
    && !e.startsWith('renderMarkdownSafe(')
    && !e.includes('?')              // our own ternaries pick literal colours and class names
    && e !== 'fileName',
  );
}

test('the design export escapes every value the model wrote', () => {
  const left = modelValues(read(DESIGN), 'const structureRows', 'if (viewOnly) {');
  expect(left, `unescaped in the design export: ${left.join(', ')}`).toEqual([]);
});

test('the documentation export escapes every value the model wrote', () => {
  const left = modelValues(read(DOCS), 'const html = `', '_Confluence.html');
  expect(left, `unescaped in the documentation export: ${left.join(', ')}`).toEqual([]);
});

test('the design preview is not written into a window of our own origin', () => {
  const s = read(DESIGN);
  // `window.open('', '_blank')` inherits this origin, and `document.write` then
  // runs whatever the document contains as same-origin markup.
  expect(s).not.toContain('win.document.write');
  expect(s).toContain("window.open(url, '_blank', 'noopener,noreferrer')");
});

/**
 * A model-supplied URL reaches an anchor only as http(s). The presentation
 * viewer put `row.url` straight on `href` (security audit of b88c77b,
 * SEC-2026-152): `javascript:alert(1)` escapes to itself, and React renders it
 * with nothing more than a development warning. So the URL is parsed, not
 * escaped - the same reasoning `sapApiHubHref` states in its header, without
 * the host rule, because a document link may point anywhere on the web.
 */
test('a model-supplied document link is http(s) with a host, or it is no link at all', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/relative/path',
    'not a url',
    '',
    undefined,
    null,
    42,
  ]) {
    expect(safeHttpHref(bad), `rendered a link for ${JSON.stringify(bad)}`).toBe('');
  }
  expect(safeHttpHref('https://help.sap.com/docs/x')).toBe('https://help.sap.com/docs/x');
  expect(safeHttpHref('http://example.org/a?b=1')).toBe('http://example.org/a?b=1');
  // The parsed form, not the raw string: whitespace and case are normalised
  // before the DOM sees them.
  expect(safeHttpHref('  HTTPS://Help.SAP.com/docs/x  ')).toBe('https://help.sap.com/docs/x');
});

test('the presentation viewer puts a model URL on an anchor only through that check', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'components/PresentationViewer.tsx'), 'utf8');
  expect(src, 'row.url is rendered on an href unchecked').not.toMatch(/href=\{row\.url\}/);
  expect(src, 'the viewer no longer routes the URL through safeHttpHref').toMatch(/href=\{safeHttpHref\(row\.url\)\}/);
  // No other anchor in the file takes a value that is not one of ours.
  const hrefs = [...src.matchAll(/href=\{([^}]+)\}/g)].map((m) => m[1].trim());
  for (const h of hrefs) expect(h, `an href takes an unchecked value: ${h}`).toMatch(/^safeHttpHref\(/);
});

test('an API Hub link is an https link to SAP, or it is not a link', () => {
  expect(sapApiHubHref('https://api.sap.com/api/API_SALES_ORDER_SRV')).toBe('https://api.sap.com/api/API_SALES_ORDER_SRV');
  expect(sapApiHubHref('https://sandbox.api.sap.com/odata')).toBe('https://sandbox.api.sap.com/odata');
  // Everything a model could otherwise put in an href:
  expect(sapApiHubHref('javascript:alert(document.cookie)')).toBe('');
  expect(sapApiHubHref('http://api.sap.com/api')).toBe('');
  expect(sapApiHubHref('https://api.sap.com.evil.example/api')).toBe('');
  expect(sapApiHubHref('https://evil.example/api.sap.com')).toBe('');
  expect(sapApiHubHref('data:text/html,<script>alert(1)</script>')).toBe('');
  expect(sapApiHubHref('not a url')).toBe('');
  expect(sapApiHubHref(null)).toBe('');
  expect(sapApiHubHref(42)).toBe('');
});

test('a refused URL leaves the label as text, and the label is escaped either way', () => {
  expect(sapApiHubLink('javascript:alert(1)', 'View in API Hub')).toBe('View in API Hub');
  expect(sapApiHubLink('https://api.sap.com/x', '<img src=x onerror=alert(1)>'))
    .toBe('<a href="https://api.sap.com/x" target="_blank" rel="noopener noreferrer">&lt;img src=x onerror=alert(1)&gt;</a>');
});

test('escaping closes an attribute as well as an element', () => {
  expect(escapeHtml('</td><script>alert(1)</script>')).toBe('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
});

test('there is one escaper, and it shows a value rather than dropping it', () => {
  // `lib/utils.ts` and `lib/audit-pack.ts` each had their own copy, which is how
  // two documents built from the same fields came to have two answers.
  expect(escapeHtmlFromUtils, 'lib/utils.ts defines an escaper of its own again').toBe(escapeHtml);
  expect(read('lib/audit-pack.ts'), 'the audit pack defines an escaper of its own again')
    .not.toMatch(/function escapeHtml\s*\(/);

  // An audit pack's bytes are signed, so the entity this produces is not free to
  // change: `'` has been `&#39;` in every pack issued so far.
  expect(escapeHtml("the account holder's statement")).toBe('the account holder&#39;s statement');

  // A report may need to show a zero or a false. An escaper that returned '' for
  // anything falsy would be a quieter bug than the one it is here to prevent.
  expect(escapeHtml(0)).toBe('0');
  expect(escapeHtml(false)).toBe('false');
  expect(escapeHtml(null)).toBe('');
  expect(escapeHtml(undefined)).toBe('');
});

/** Every `${…}` of a template region, and whether it lands inside a quoted attribute. */
function interpolations(segment: string, inAttr = false, out: Array<{ expr: string; inAttr: boolean }> = []) {
  let attr = inAttr;
  let i = 0;
  while (i < segment.length) {
    if (segment[i] === '$' && segment[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < segment.length && depth > 0) {
        if (segment[j] === '{') depth += 1;
        else if (segment[j] === '}') depth -= 1;
        if (depth === 0) break;
        j += 1;
      }
      const expr = segment.slice(i + 2, j);
      out.push({ expr: expr.replace(/\s+/g, ' ').trim(), inAttr: attr });
      // Inside an interpolation we are back in JavaScript, so a template nested
      // there starts again outside any attribute.
      interpolations(expr, false, out);
      i = j + 1;
      continue;
    }
    if (segment[i] === '"') attr = !attr;
    i += 1;
  }
  return out;
}

const region = (source: string, from: string, to: string) =>
  source.slice(source.indexOf(from), source.indexOf(to));

/** A conditional that can only ever produce one of our own quoted literals. */
function yieldsOnlyOwnLiterals(expr: string): boolean {
  const skeleton = expr.replace(/'[^']*'/g, '§').replace(/\s+/g, ' ').trim();
  return /^(?:[^?:]*\?\s*§\s*:\s*)+§$/.test(skeleton);
}

test('nothing foreign is interpolated into an attribute of an exported document', () => {
  // Escaping the five HTML characters is the right answer for a text node and
  // for a quoted attribute value, and not the whole answer for `style="…"` or
  // `href="…"`, where a well-formed value can still carry a URL scheme or a
  // declaration. So the rule for attributes is stricter than escaping: an
  // attribute may interpolate a constant decided just above the template, or a
  // conditional whose every branch is a literal of ours — and nothing else.
  const regions: Array<[string, string]> = [
    [ANALYZE, 'const gapsRows'],
    [DESIGN, 'const structureRows'],
    [DOCS, 'const html = `'],
  ];
  const ends: Record<string, string> = {
    [ANALYZE]: 'const blob = new Blob',
    [DESIGN]: 'if (viewOnly) {',
    [DOCS]: '_Confluence.html',
  };

  const offenders: string[] = [];
  let checked = 0;
  for (const [file, from] of regions) {
    const seen = interpolations(region(read(file), from, ends[file])).filter((e) => e.inAttr);
    checked += seen.length;
    for (const { expr } of seen) {
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expr)) continue;
      if (yieldsOnlyOwnLiterals(expr)) continue;
      offenders.push(`${file}: ${expr}`);
    }
  }

  // If this drops to nothing the scan stopped finding the regions at all, and
  // the check above would pass for the wrong reason.
  expect(checked, 'no attribute interpolation was found — the scan lost its regions').toBeGreaterThan(15);
  expect(offenders, `a value reaches an attribute of an exported document:\n${offenders.join('\n')}`).toEqual([]);
});

/**
 * The analysis export, read expression by expression.
 *
 * Anything that reads one of the stage's data roots goes through `esc` — the
 * two below are the audited exceptions, and they have to stay present, or this
 * list is a note about code that no longer exists.
 */
const ANALYSIS_EXPORT_EXCEPTIONS: Array<[string, string]> = [
  [
    `item.isCustom ? '<span style="color:#0747a6;font-size:9px;">(Custom)</span>' : ''`,
    'a boolean chooses between our own markup and nothing; the value itself is never written',
  ],
  [
    'renderMarkdownSafe(withoutUnapprovedMoney(project.analysis))',
    'the markdown fallback, sanitized by DOMPurify rather than escaped, because it is meant to carry formatting',
  ],
];

test('the analysis export escapes every stored value it writes', () => {
  const seg = region(read(ANALYZE), 'const gapsRows', 'const blob = new Blob');
  const roots = /\b(data|project|item|g|cp|f|comparative|bizFallback)\./;
  const audited = new Set(ANALYSIS_EXPORT_EXCEPTIONS.map(([expr]) => expr));

  const all = interpolations(seg);
  expect(all.length, 'the analysis export template was not found').toBeGreaterThan(80);

  const left = all
    .map((e) => e.expr)
    .filter((expr) => roots.test(expr) && !expr.includes('esc(') && !audited.has(expr));
  expect(left, `unescaped in the analysis export: ${left.join('\n')}`).toEqual([]);

  const stale = ANALYSIS_EXPORT_EXCEPTIONS.filter(([expr]) => !all.some((e) => e.expr === expr));
  expect(stale.map(([e]) => e), 'an audited exception no longer appears in the export').toEqual([]);
});

test("sapApiHubUrl keeps only SAP's API Hub over TLS, unescaped, for a React href", () => {
  // Security audit of b88c77b, SEC-2026-236: the mapping table put the model's
  // apiHubUrl straight on an anchor, the same defect as SEC-2026-152 one panel over.
  expect(sapApiHubUrl('https://api.sap.com/api/API_BUSINESS_PARTNER/overview')).toBe('https://api.sap.com/api/API_BUSINESS_PARTNER/overview');
  expect(sapApiHubUrl('  HTTPS://API.SAP.COM/api/X?a=1&b=2 ')).toBe('https://api.sap.com/api/X?a=1&b=2');
  expect(sapApiHubUrl('https://hub.api.sap.com/x')).toBe('https://hub.api.sap.com/x');
  for (const bad of ['javascript:alert(1)', 'http://api.sap.com/x', 'https://evil.example/api.sap.com', 'https://api.sap.com.evil.example/x', 'https://notapi.sap.com/x', 'data:text/html,hi', '/relative', '', undefined, null, 42]) {
    expect(sapApiHubUrl(bad), `${String(bad)} came through`).toBe('');
  }
  // The exported-HTML form is the same decision, escaped once for an attribute.
  expect(sapApiHubHref('https://api.sap.com/api/X?a=1&b=2')).toBe('https://api.sap.com/api/X?a=1&amp;b=2');
});

test("neither the API Hub mapping table nor the markdown export puts the model's URL on a link unchecked", () => {
  const table = fs.readFileSync(path.join(__dirname, '..', 'components', 'design', 'ApiBusinessHubMapping.tsx'), 'utf8');
  expect(table, 'href={map.apiHubUrl} is back on the anchor').not.toMatch(/href=\{map\.apiHubUrl\}/);
  expect(table).toMatch(/href=\{sapApiHubUrl\(map\.apiHubUrl\)\}/);
  const md = fs.readFileSync(path.join(__dirname, '..', 'lib', 'markdownFormatter.ts'), 'utf8');
  expect(md, 'the markdown export links the raw apiHubUrl').not.toMatch(/\]\(\$\{map\.apiHubUrl\}\)/);
  expect(md).toMatch(/sapApiHubUrl\(map\.apiHubUrl\)/);
});

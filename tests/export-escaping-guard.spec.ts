import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sapApiHubHref, sapApiHubLink } from '../lib/export-safety';
import { escapeHtml } from '../lib/utils';

/**
 * Two stages assemble an HTML document out of values the model wrote from the
 * customer's own ABAP, and a reviewer opens it — the design preview even opened
 * it in this application's origin (QA review of 33471220d6e9: 024ec609bc86,
 * 06f7c0c56a6c). A comment in the uploaded source is enough to steer a model
 * into returning markup.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
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

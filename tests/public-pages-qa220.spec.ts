import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getModuleAreas } from '../lib/abap/catalog-index';
import { generateMetadata as letterMetadata } from '../app/catalog/browse/[letter]/page';
import { generateMetadata as moduleMetadata } from '../app/catalog/module/[area]/page';

/**
 * Public pages say what the product does, not more (QA full review of v2.20.0,
 * slice I). Each block names the finding it holds the line for. Source-level on
 * purpose: these are claims in copy, and the copy is the thing that drifted.
 */

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
/** The source without block or line comments, so a note about an old claim does not count as the claim. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the catalog pages claim a successor only where SAP names one', () => {
});

test.describe('the guides and reference pages', () => {
});

test.describe('the landing page and the whitepaper', () => {
  test('a generated draft is not called compliant (b3e243b68b78, a58028fda9e1)', () => {
    for (const rel of ['app/page.tsx', 'app/whitepaper/page.tsx']) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/Clean-Core-compliant/);
      expect(src, rel).not.toMatch(/first compliant draft/);
    }
  });

});

test.describe('the legal pages', () => {
});

test.describe('the error boundary and the survey page', () => {
});

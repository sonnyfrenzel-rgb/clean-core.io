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

  test('BYOK is not promised to be free of every platform limit (07188dc4d715)', () => {
    expect(code('app/page.tsx')).not.toMatch(/without any platform limits/);
  });

  test('erasure copy does not promise to purge everything (341a9ce7a451)', () => {
    const src = code('app/page.tsx');
    expect(src).not.toMatch(/purge all your uploads and data/);
    expect(src).toMatch(/backup copies age out within 30 days/);
  });

  test('the disclaimer does not attribute the deterministic score to the model (9d98a3ea6701)', () => {
    const src = code('app/page.tsx');
    expect(src).not.toMatch(/compliance scores, modular code transformations/);
    expect(src).toMatch(/Clean Core Score come from a deterministic engine/);
  });

  test('the no-training line carries the free-tier caveat (cc161722d461)', () => {
    const src = code('app/page.tsx');
    expect(src).not.toMatch(/\(not used by Google to train its models, per the Gemini API terms\)/);
    expect(src).toMatch(/not used by Google to train its models[^<]*free-tier terms differ/);
  });

  test('the whitepaper describes the route and the table access it really has (55f3dd4a7152, e6f754593747)', () => {
    const src = code('app/whitepaper/page.tsx');
    expect(src).not.toMatch(/best fits each object/);
    expect(src).not.toMatch(/writes to internal tables/);
  });
});

test.describe('the legal pages', () => {
});

test.describe('the error boundary and the survey page', () => {
});

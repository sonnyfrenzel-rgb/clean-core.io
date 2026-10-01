import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { FROM_LANDING, USP_SHORT, USP_LONG, WHITEPAPER_SECTIONS } from '../lib/whitepaper';

/**
 * The whitepaper says what the landing page says, and the PDF is the page
 * (roadmap 3.0, owner request 01.10.2026).
 *
 * Three things went wrong before: the whitepaper told the 2.x story while the
 * landing told the 3.0 one; the PDF was a second, hand-written document in
 * another look; and that PDF was older than its own template. Each test below
 * holds one of those shut.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** The landing's source as running text: entities decoded, JSX line breaks and indentation collapsed. */
function landingText(): string {
  return read('app/page.tsx')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/\{' '\}/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Every string in a nested value. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

test.describe('the whitepaper says what the landing says', () => {
  test('every sentence it takes from the landing is still on the landing', () => {
    const landing = landingText();
    const missing: string[] = [];
    for (const s of strings(FROM_LANDING)) {
      // A placeholder (`{line}`, `{objects}`, `{examples}`) stands where the landing computes a value.
      for (const part of s.split(/\{[a-z]+\}/)) {
        const p = part.trim();
        if (p.length > 3 && !landing.includes(p)) missing.push(p);
      }
    }
    expect(missing, 'change the sentence on the landing first, then in lib/whitepaper.ts').toEqual([]);
  });

  test('the short USP is the one the landing shares', () => {
    expect(landingText()).toContain(USP_SHORT);
    expect(USP_LONG.startsWith('For the person who has to decide what happens to a custom ABAP program')).toBe(true);
    expect(USP_LONG).toContain('says what it could not determine');
  });
});

test.describe('the PDF is the page', () => {
  test('the hand-written template and its scripts are gone', () => {
    for (const rel of [
      'public/linkedin-whitepaper-template.html',
      'scripts/generate-linkedin-whitepaper.js',
      'scripts/generate-whitepaper-png.js',
      'scripts/generate-whitepaper-grid.js',
    ]) {
      expect(fs.existsSync(path.resolve(ROOT, rel)), rel).toBe(false);
    }
    expect(read('package.json')).toContain('"build:whitepaper-pdf": "tsx scripts/generate-whitepaper-pdf.ts"');
  });

  test('the committed PDF was rendered from the current sources', () => {
    const script = read('scripts/generate-whitepaper-pdf.ts');
    const block = script.slice(script.indexOf('const SOURCES = ['), script.indexOf('];', script.indexOf('const SOURCES = [')));
    const sources = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(sources.length).toBeGreaterThan(3);
    const h = createHash('sha256');
    for (const rel of sources) {
      h.update(rel);
      h.update(read(rel).replace(/\r\n/g, '\n'));
    }
    const stamp = read('public/Clean-Core_S4HANA_Modernization_Whitepaper.pdf.sha256').trim();
    expect(stamp, 'the whitepaper changed since the PDF was built — run npm run build:whitepaper-pdf').toBe(h.digest('hex'));
  });
});

test.describe('the rendered whitepaper', () => {
  test.describe.configure({ timeout: 180_000 });

  for (const route of ['/whitepaper', '/whitepaper-print']) {
    test(`${route} carries the USP, the limits and every section`, async ({ page }) => {
      const res = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 150_000 });
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toContainText(USP_SHORT);
      await expect(page.locator('[data-wp-limits]')).toHaveText(FROM_LANDING.limits);
      for (const s of WHITEPAPER_SECTIONS) {
        await expect(page.locator(`#${s.id}-title`)).toHaveText(s.title);
        await expect(page.locator(`a[href="#${s.id}"]`)).toHaveCount(1);
      }
      // Five links of the chain of evidence, each with its mark.
      await expect(page.locator('[data-wp-chain] [data-chain-step]')).toHaveCount(FROM_LANDING.chain.length);
    });
  }

  test('the web page offers the PDF that exists; the paper edition stays out of the index', async ({ page, request }) => {
    await page.goto('/whitepaper', { waitUntil: 'domcontentloaded', timeout: 150_000 });
    const href = await page.getByTestId('wp-pdf').getAttribute('href');
    expect(href).toBe('/Clean-Core_S4HANA_Modernization_Whitepaper.pdf');
    expect((await request.get(href!)).status()).toBe(200);
    await page.goto('/whitepaper-print', { waitUntil: 'domcontentloaded', timeout: 150_000 });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

/**
 * The public pages that search engines send people to stay reachable through the 3.0 rebuild.
 *
 * Sonny, 15.09.2026: the catalog SEO pages "have many impressions" and must be kept. A rebuild that deletes a route,
 * renames a URL or drops a page from the sitemap loses that reach silently — nothing in the product breaks, only the
 * traffic goes. Roadmap 3.0.5 (clean-up) and 3.0.6 (new landing page) both touch this surface; this guard is the line.
 * It reads files only: no server, no emulator.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { FEATURE_SLUGS } from '../lib/features-content';

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file: string) => fs.existsSync(path.join(ROOT, file));

/**
 * URL → the route file that serves it. Route groups such as (app) do not appear in the URL.
 * The list is every page with impressions in Google Search Console, last six months to 2026-09-15: home 1,509,
 * /catalog 1,491, /knowledge 1,417, /sap-cloudification 1,371, /abap-custom-code-analysis 1,150, /clean-core-score 458,
 * /features/cloudification-catalog 417, /licenses 256, /whitepaper 243, /how-to 187 — plus about 70 object pages under
 * /catalog/[object], the A–Z and module pages, and the other /features pages.
 */
const PAGES: Record<string, string> = {
  '/features/[slug]': 'app/features/[slug]/page.tsx',
  '/how-to': 'app/(app)/how-to/page.tsx',
  '/licenses': 'app/licenses/page.tsx',
  '/about': 'app/(app)/about/page.tsx',
  '/trust': 'app/(app)/trust/page.tsx',
  '/tenant-security': 'app/(app)/tenant-security/page.tsx',
  '/catalog': 'app/catalog/page.tsx',
  '/catalog/[object]': 'app/catalog/[object]/page.tsx',
  '/catalog/browse/[letter]': 'app/catalog/browse/[letter]/page.tsx',
  '/catalog/module/[area]': 'app/catalog/module/[area]/page.tsx',
  '/catalog-sitemap.xml': 'app/catalog-sitemap.xml/route.ts',
  '/sap-clean-core-object-classification': 'app/(app)/sap-clean-core-object-classification/page.tsx',
  '/method/levels': 'app/method/levels/page.tsx',
  '/sap-cloudification': 'app/(app)/sap-cloudification/page.tsx',
  '/clean-core-explained': 'app/(app)/clean-core-explained/page.tsx',
  '/how-it-works': 'app/(app)/how-it-works/page.tsx',
  '/knowledge': 'app/(app)/knowledge/page.tsx',
  '/abap-custom-code-analysis': 'app/(app)/abap-custom-code-analysis/page.tsx',
  '/clean-core-score': 'app/(app)/clean-core-score/page.tsx',
  '/whitepaper': 'app/whitepaper/page.tsx',
  '/reference-analysis': 'app/reference-analysis/page.tsx',
};

test.describe('pages with search reach stay reachable', () => {
  test('every route still has its file', () => {
    for (const [url, file] of Object.entries(PAGES)) expect(exists(file), `${url} is served by ${file}`).toBe(true);
  });

  test('the catalog pages keep their canonical URLs, and object pages without a successor stay out of the index', () => {
    expect(read('app/catalog/page.tsx')).toContain('canonical: `${BASE}/catalog`');
    const object = read('app/catalog/[object]/page.tsx');
    expect(object).toContain('canonical: `${BASE}/catalog/${object}`');
    expect(object).toMatch(/successor \? \{\} : \{ robots: \{ index: false, follow: true \} \}/);
    expect(object).toContain('export async function generateStaticParams');
    expect(read('app/catalog/browse/[letter]/page.tsx')).toContain('canonical: `${BASE}/catalog/browse/${letter.toLowerCase()}`');
    expect(read('app/catalog/module/[area]/page.tsx')).toContain('canonical: `${BASE}/catalog/module/${meta.code.toLowerCase()}`');
  });

  test('the feature pages with impressions keep their slugs and canonical URLs', () => {
    for (const slug of ['cloudification-catalog', 'audit-evidence', 'rap-cap-engine', 'process-blueprints', 'extensibility-routing']) {
      expect(FEATURE_SLUGS, `/features/${slug}`).toContain(slug);
    }
    expect(read('app/features/[slug]/page.tsx')).toContain('const url = `https://clean-core.io/features/${f.slug}`;');
  });

  test('the sitemaps and robots.txt still point crawlers at them', () => {
    const sitemap = read('app/sitemap.ts');
    for (const url of Object.keys(PAGES).filter((u) => !u.includes('[') && u !== '/catalog-sitemap.xml')) {
      expect(sitemap, `sitemap.ts lists ${url}`).toContain(`\${baseUrl}${url}\``);
    }
    expect(sitemap).toContain('`${baseUrl}/catalog/browse/${l.toLowerCase()}`');
    expect(sitemap).toContain('`${baseUrl}/catalog/module/${a.code.toLowerCase()}`');
    expect(sitemap).toContain('url: `${baseUrl}/features/${slug}`');
    expect(read('app/robots.ts')).toContain('`${baseUrl}/catalog-sitemap.xml`');
    const catalogSitemap = read('app/catalog-sitemap.xml/route.ts');
    expect(catalogSitemap).toContain('getMappedCatalogObjectNames()');
    expect(catalogSitemap).toContain('/catalog/${objectToSlug(n)}');
  });

  test('the landing page links into the catalog and the classification page', () => {
    const landing = read('app/page.tsx');
    expect(landing).toContain('href="/sap-clean-core-object-classification"');
    expect(landing).toContain('href="/clean-core-explained"');
    expect(landing).toContain('href="/how-it-works"');
    expect(landing).toContain('href="/knowledge"');
  });
});

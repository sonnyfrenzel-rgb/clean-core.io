/**
 * The public pages that search engines send people to stay reachable through the 3.0 rebuild.
 *
 * Sonny, 15.09.2026: the catalog SEO pages "have many impressions" and must be kept. A rebuild that deletes a route,
 * renames a URL or drops a page from the sitemap loses that reach silently — nothing in the product breaks, only the
 * traffic goes. Roadmap 3.0.5 (clean-up) and 3.0.6 (new landing page) both touch this surface; this guard is the line.
 *
 * Three layers: the route files exist; the sitemap, robots and metadata functions are executed and their output is
 * checked; and the pages are requested from the running app (the Playwright web server), so a route that errors at
 * runtime or a canonical left only in a dead branch fails here.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { FEATURE_SLUGS, FEATURES, INDEXED_FEATURE_SLUGS } from '../lib/features-content';
import { getAllCatalogObjectNames, getMappedCatalogObjectNames, getModuleAreas, objectToSlug } from '../lib/abap/catalog-index';
import sitemap from '../app/sitemap';
import robots from '../app/robots';
import { GET as catalogSitemap } from '../app/catalog-sitemap.xml/route';
import { generateMetadata as objectMetadata } from '../app/catalog/[object]/page';
import { generateMetadata as letterMetadata } from '../app/catalog/browse/[letter]/page';
import { generateMetadata as moduleMetadata } from '../app/catalog/module/[area]/page';
import { generateMetadata as featureMetadata } from '../app/features/[slug]/page';

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://clean-core.io';
const exists = (file: string) => fs.existsSync(path.join(ROOT, file));

/**
 * The search-console inventory — every page with impressions, last six months to 2026-09-15 — as URL → route file.
 * Route groups such as (app) do not appear in the URL. Impressions: home 1,509, /catalog 1,491, /knowledge 1,417,
 * /sap-cloudification 1,371, /abap-custom-code-analysis 1,150, /clean-core-score 458, /features/cloudification-catalog
 * 417, /licenses 256, /whitepaper 243, /how-to 187 — plus about 70 /catalog/[object] pages, A–Z and module pages.
 */
const PAGES: Record<string, string> = {
  '/': 'app/page.tsx',
  '/catalog': 'app/catalog/page.tsx',
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
  '/how-to': 'app/(app)/how-to/page.tsx',
  '/licenses': 'app/licenses/page.tsx',
  '/about': 'app/(app)/about/page.tsx',
  '/trust': 'app/(app)/trust/page.tsx',
  '/tenant-security': 'app/(app)/tenant-security/page.tsx',
};
const DYNAMIC: Record<string, string> = {
  '/catalog/[object]': 'app/catalog/[object]/page.tsx',
  '/catalog/browse/[letter]': 'app/catalog/browse/[letter]/page.tsx',
  '/catalog/module/[area]': 'app/catalog/module/[area]/page.tsx',
  '/features/[slug]': 'app/features/[slug]/page.tsx',
  '/catalog-sitemap.xml': 'app/catalog-sitemap.xml/route.ts',
};
/** Feature pages with impressions — each must stay a published slug. */
const FEATURES_WITH_IMPRESSIONS = ['cloudification-catalog', 'audit-evidence', 'rap-cap-engine', 'process-blueprints', 'extensibility-routing'];

test.describe('pages with search reach stay reachable', () => {
  test('every route still has its file', () => {
    for (const [url, file] of Object.entries({ ...PAGES, ...DYNAMIC })) expect(exists(file), `${url} is served by ${file}`).toBe(true);
  });

  test('the sitemap lists the home page, every inventory page, every feature and the A–Z pages', () => {
    const urls = new Set(sitemap().map((e) => e.url));
    for (const url of Object.keys(PAGES)) expect(urls.has(url === '/' ? BASE : `${BASE}${url}`), `sitemap lists ${url}`).toBe(true);
    for (const slug of INDEXED_FEATURE_SLUGS) expect(urls.has(`${BASE}/features/${slug}`), `sitemap lists /features/${slug}`).toBe(true);
    // A feature page that hands over to another page (roadmap 3.0.8, item 5) stays published but leaves the
    // sitemap — a sitemap lists canonical URLs only — and the page it hands over to is listed instead.
    for (const f of FEATURES.filter((x) => x.canonicalPath)) {
      expect(urls.has(`${BASE}/features/${f.slug}`), `sitemap leaves out /features/${f.slug}`).toBe(false);
      expect(urls.has(`${BASE}${f.canonicalPath}`), `sitemap lists ${f.canonicalPath}`).toBe(true);
    }
    for (const slug of FEATURES_WITH_IMPRESSIONS) expect(FEATURE_SLUGS, `/features/${slug} is still published`).toContain(slug);
    expect(urls.has(`${BASE}/catalog/browse/a`)).toBe(true);
    expect([...urls].some((u) => u.startsWith(`${BASE}/catalog/module/`))).toBe(true);
  });

  test('robots.txt points at both sitemaps and blocks none of these pages', () => {
    const r = robots();
    const maps = ([] as string[]).concat(r.sitemap ?? []);
    expect(maps).toContain(`${BASE}/sitemap.xml`);
    expect(maps).toContain(`${BASE}/catalog-sitemap.xml`);
    const disallowed = ([] as Array<{ disallow?: string | string[] }>).concat(r.rules).flatMap((rule) => ([] as string[]).concat(rule.disallow ?? []));
    for (const url of [...Object.keys(PAGES), '/catalog/', '/features/']) {
      for (const d of disallowed) expect(url === d || (d !== '/' && url.startsWith(d)), `robots.txt blocks ${url} with ${d}`).toBe(false);
    }
  });

  test('the catalog sitemap lists the object pages that are worth indexing', async () => {
    const xml = await catalogSitemap().text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThanOrEqual(400);
    for (const loc of locs) expect(loc).toMatch(new RegExp(`^${BASE}/catalog/[a-z0-9_%-]+$`));
  });

  test('the metadata functions emit the canonical URLs, and an object without a successor stays out of the index', async () => {
    const indexed = (await catalogSitemap().text()).match(/<loc>[^<]+\/catalog\/([^<]+)<\/loc>/)![1];
    const object = await objectMetadata({ params: Promise.resolve({ object: indexed }) } as never);
    expect(object.alternates?.canonical).toBe(`${BASE}/catalog/${indexed}`);
    expect(object.robots).toBeUndefined();
    // An object with a catalog page but no mapped successor, taken from the catalog rather than typed in.
    const mapped = new Set(getMappedCatalogObjectNames());
    const withoutSuccessor = getAllCatalogObjectNames().find((n) => !mapped.has(n));
    expect(withoutSuccessor, 'the catalog has pages without a successor').toBeTruthy();
    const slug = objectToSlug(withoutSuccessor!);
    const noPath = await objectMetadata({ params: Promise.resolve({ object: slug }) } as never);
    expect(noPath.alternates?.canonical).toBe(`${BASE}/catalog/${slug}`);
    expect(noPath.robots).toMatchObject({ index: false, follow: true });
    expect((await letterMetadata({ params: Promise.resolve({ letter: 'a' }) } as never)).alternates?.canonical).toBe(`${BASE}/catalog/browse/a`);
    // Every module page, each with its own canonical (the module with impressions today is /catalog/module/pp).
    const areas = getModuleAreas().map((a) => a.code.toLowerCase());
    expect(areas).toContain('pp');
    for (const area of areas) {
      expect((await moduleMetadata({ params: Promise.resolve({ area }) })).alternates?.canonical, `/catalog/module/${area}`).toBe(`${BASE}/catalog/module/${area}`);
    }
    for (const slug of FEATURES_WITH_IMPRESSIONS) {
      const own = FEATURES.find((f) => f.slug === slug)?.canonicalPath ?? `/features/${slug}`;
      expect((await featureMetadata({ params: Promise.resolve({ slug }) })).alternates?.canonical, `/features/${slug}`).toBe(`${BASE}${own}`);
    }
    // The three cloudification pages stop competing: the feature page hands over to /sap-cloudification.
    expect((await featureMetadata({ params: Promise.resolve({ slug: 'cloudification-catalog' }) })).alternates?.canonical).toBe(`${BASE}/sap-cloudification`);
  });

  test('the running app serves the pages with their canonical link and the sitemaps', async ({ request }) => {
    test.setTimeout(240_000);
    const indexed = (await catalogSitemap().text()).match(/<loc>[^<]+\/catalog\/([^<]+)<\/loc>/)![1];
    const html: Array<[string, string]> = [
      ['/', BASE],
      ['/catalog', `${BASE}/catalog`],
      ['/catalog/module/pp', `${BASE}/catalog/module/pp`],
      ['/catalog/browse/a', `${BASE}/catalog/browse/a`],
      [`/catalog/${indexed}`, `${BASE}/catalog/${indexed}`],
      ['/sap-cloudification', `${BASE}/sap-cloudification`],
      ['/knowledge', `${BASE}/knowledge`],
      ['/abap-custom-code-analysis', `${BASE}/abap-custom-code-analysis`],
      ['/clean-core-score', `${BASE}/clean-core-score`],
      // Handed over to /sap-cloudification (roadmap 3.0.8, item 5): still served, canonical elsewhere.
      ['/features/cloudification-catalog', `${BASE}/sap-cloudification`],
    ];
    for (const [url, canonical] of html) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      const body = await res.text();
      const href = body.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect(href?.replace(/\/$/, ''), `${url} canonical`).toBe(canonical);
    }
    const { PDF_CANONICALS } = (await import('../next.config.mjs')) as unknown as { PDF_CANONICALS: Record<string, string> };
    for (const [pdf, page] of Object.entries(PDF_CANONICALS)) {
      const res = await request.head(pdf);
      expect(res.status(), pdf).toBe(200);
      expect(res.headers()['link'], `${pdf} Link header`).toBe(`<${page}>; rel="canonical"`);
    }
    for (const url of ['/sitemap.xml', '/robots.txt', '/catalog-sitemap.xml']) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
    }
    expect(await (await request.get('/robots.txt')).text()).toContain('catalog-sitemap.xml');
  });

  test('every PDF names its HTML page as canonical (roadmap 3.0.8, item 3)', async () => {
    const { PDF_CANONICALS, default: config } = (await import('../next.config.mjs')) as unknown as {
      PDF_CANONICALS: Record<string, string>;
      default: { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
    };
    const pdfs = fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => `/${f}`);
    expect(pdfs.length).toBeGreaterThan(0);
    expect(Object.keys(PDF_CANONICALS).sort(), 'every public PDF has a canonical page').toEqual(pdfs.sort());
    const headers = await config.headers();
    for (const [pdf, page] of Object.entries(PDF_CANONICALS)) {
      expect(page.startsWith(`${BASE}/`), `${pdf} → ${page}`).toBe(true);
      expect(Object.keys(PAGES), `${page} is a page with search reach`).toContain(page.slice(BASE.length));
      const entry = headers.find((h) => h.source === pdf);
      expect(entry?.headers, pdf).toContainEqual({ key: 'Link', value: `<${page}>; rel="canonical"` });
    }
  });

  test('the landing page links into the catalog and the knowledge pages', () => {
    const landing = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8');
    for (const href of ['/sap-clean-core-object-classification', '/clean-core-explained', '/how-it-works', '/knowledge']) expect(landing).toContain(`href="${href}"`);
  });
});

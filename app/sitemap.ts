import { MetadataRoute } from 'next';
import { APP_RELEASE_DATE } from '@/lib/version';
import { CATALOG_LETTERS, getModuleAreas } from '@/lib/abap/catalog-index';
import { FEATURE_SLUGS } from '@/lib/features-content';
import { contentDate } from '@/lib/content-dates';

/**
 * The sitemap, and the mistake it used to make.
 *
 * Every URL below was stamped `lastModified: new Date()` — the moment of the
 * build. The comment defending it said this gave Google "a genuine freshness
 * signal", and it was the opposite: with three releases in four days, thirty URLs
 * were announcing a daily change, including the legal pages nobody had touched
 * since July. Google recognises that pattern and answers it by discounting
 * `lastmod` across the whole domain — so the pages that had genuinely just
 * changed lost the signal along with the ones that hadn't.
 *
 * The dates now come from `lib/content-dates.ts`, which is generated from the git
 * history of the files that render each route (`npm run sync:content-dates`).
 * Twelve distinct dates spread over two months, each of them true.
 *
 * `tests/sitemap-guard.spec.ts` holds the line: no entry may carry a timestamp
 * later than the release, which is what a build-time stamp always would.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
  const releaseDate = new Date(APP_RELEASE_DATE);
  const on = (route: string) => contentDate(route, releaseDate);

  // Core, index-worthy routes.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: on('/'), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/clean-core-explained`, lastModified: on('/clean-core-explained'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/first-run`, lastModified: on('/first-run'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/how-to`, lastModified: on('/how-to'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/knowledge`, lastModified: on('/knowledge'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/abap-custom-code-analysis`, lastModified: on('/abap-custom-code-analysis'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/clean-core-score`, lastModified: on('/clean-core-score'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/sap-clean-core-object-classification`, lastModified: on('/sap-clean-core-object-classification'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/sap-cloudification`, lastModified: on('/sap-cloudification'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/how-it-works`, lastModified: on('/how-it-works'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: on('/about'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/whitepaper`, lastModified: on('/whitepaper'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/reference-analysis`, lastModified: on('/reference-analysis'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/tenant-security`, lastModified: on('/tenant-security'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/trust`, lastModified: on('/trust'), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/impressum`, lastModified: on('/impressum'), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/datenschutz`, lastModified: on('/datenschutz'), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/terms`, lastModified: on('/terms'), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/licenses`, lastModified: on('/licenses'), changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Catalog hub + A–Z browse. The ~400 individual object pages live in their own
  // /catalog-sitemap.xml (referenced from robots.txt) so this core sitemap stays small
  // and is crawled/processed fully — the thin templated object pages no longer dilute
  // the crawl budget for the core marketing/legal pages.
  const catalogRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/catalog`, lastModified: on('/catalog'), changeFrequency: 'weekly', priority: 0.8 },
    ...CATALOG_LETTERS.map((l) => ({
      url: `${baseUrl}/catalog/browse/${l.toLowerCase()}`,
      lastModified: on('/catalog/browse'),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    // Application-area hubs (SD, FI, MM, …). These carry real content — every
    // object in the area with its clean core level and successor — and are the
    // parent pages that tie the ~400 object pages into topical clusters, so they
    // belong in the core sitemap rather than the long-tail catalog one.
    ...getModuleAreas().map((a) => ({
      url: `${baseUrl}/catalog/module/${a.code.toLowerCase()}`,
      lastModified: on('/catalog/module'),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];

  // Feature detail pages (the landing "Learn more" subpages).
  const featureRoutes: MetadataRoute.Sitemap = FEATURE_SLUGS.map((slug) => ({
    url: `${baseUrl}/features/${slug}`,
    lastModified: on('/features'),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...featureRoutes, ...catalogRoutes];
}

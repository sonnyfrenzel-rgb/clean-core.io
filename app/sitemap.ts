import { MetadataRoute } from 'next';
import { APP_RELEASE_DATE } from '@/lib/version';
import { CATALOG_LETTERS } from '@/lib/abap/catalog-index';
import { FEATURE_SLUGS } from '@/lib/features-content';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
  const releaseDate = new Date(APP_RELEASE_DATE);
  // Core marketing/legal pages are edited far more often than the release date implies.
  // Stamp them with the sitemap generation (deploy) time so Google gets a genuine freshness
  // signal and re-crawls them, instead of a single static lastmod for every URL.
  const now = new Date();

  // Core, index-worthy routes — freshness-stamped at build/ISR time.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/how-to`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/knowledge`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/abap-custom-code-analysis`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/clean-core-score`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/sap-clean-core-object-classification`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/sap-cloudification`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/how-it-works`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/whitepaper`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/tenant-security`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/trust`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/impressum`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/datenschutz`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/terms`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/licenses`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Catalog hub + A–Z browse. The ~400 individual object pages live in their own
  // /catalog-sitemap.xml (referenced from robots.txt) so this core sitemap stays small
  // and is crawled/processed fully — the thin templated object pages no longer dilute
  // the crawl budget for the core marketing/legal pages.
  const catalogRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/catalog`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ...CATALOG_LETTERS.map((l) => ({
      url: `${baseUrl}/catalog/browse/${l.toLowerCase()}`,
      lastModified: releaseDate,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ];

  // Feature detail pages (the landing "Learn more" subpages).
  const featureRoutes: MetadataRoute.Sitemap = FEATURE_SLUGS.map((slug) => ({
    url: `${baseUrl}/features/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...featureRoutes, ...catalogRoutes];
}

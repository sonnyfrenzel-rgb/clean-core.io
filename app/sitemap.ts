import { MetadataRoute } from 'next';
import { APP_RELEASE_DATE } from '@/lib/version';
import { getMappedCatalogObjectNames, objectToSlug, CATALOG_LETTERS } from '@/lib/abap/catalog-index';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
  const releaseDate = new Date(APP_RELEASE_DATE);

  // Existing static routes (unchanged).
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: releaseDate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/how-to`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/knowledge`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/abap-custom-code-analysis`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/clean-core-score`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/sap-tier-2-extensions`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/how-it-works`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/changelog`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/whitepaper`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/tenant-security`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/trust`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/impressum`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/datenschutz`, lastModified: releaseDate, changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Catalog hub + A–Z browse.
  const catalogRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/catalog`, lastModified: releaseDate, changeFrequency: 'weekly', priority: 0.8 },
    ...CATALOG_LETTERS.map((l) => ({
      url: `${baseUrl}/catalog/browse/${l.toLowerCase()}`,
      lastModified: releaseDate,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ];

  // Object pages — only those with a real mapped successor (unique, index-worthy).
  // No-path pages are noindex, so they are intentionally omitted here. Well under the 50k limit.
  const objectRoutes: MetadataRoute.Sitemap = getMappedCatalogObjectNames().map((n) => ({
    url: `${baseUrl}/catalog/${objectToSlug(n)}`,
    lastModified: releaseDate,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...staticRoutes, ...catalogRoutes, ...objectRoutes];
}

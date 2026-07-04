import { getMappedCatalogObjectNames, objectToSlug } from '@/lib/abap/catalog-index';
import { APP_RELEASE_DATE } from '@/lib/version';

/**
 * Dedicated sitemap for the (large, templated) SAP Object Catalog pages.
 *
 * Kept separate from the core /sitemap.xml so the ~400 thin object pages do not dilute
 * the crawl budget for the core marketing/legal pages. Both are listed in robots.txt.
 * Only objects with a real mapped successor are index-worthy; no-path pages are noindex
 * and intentionally excluded here.
 */
export const revalidate = 86400; // refresh daily

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
  const lastmod = new Date(APP_RELEASE_DATE).toISOString();

  const urls = getMappedCatalogObjectNames()
    .map(
      (n) =>
        `  <url><loc>${baseUrl}/catalog/${objectToSlug(n)}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}

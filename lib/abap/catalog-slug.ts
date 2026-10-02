/**
 * The catalog's URL slugs — the one part of the catalog index a client
 * component needs.
 *
 * Its own module because `catalog-index.ts` reads the generated SAP artifacts
 * (~4.5 MB of JSON) at module scope: a client component that imported
 * `objectToSlug` from there took the whole catalog into the browser with it
 * (external audit PERF-01, 02.10.2026). This file imports nothing, so
 * `components/catalog/CatalogSearch.tsx` can link a result without it.
 * `catalog-index.ts` re-exports both functions for its server callers.
 */

export function objectToSlug(name: string): string {
  return name.toLowerCase();
}

export function slugToObject(slug: string): string {
  return (slug || '').toUpperCase();
}

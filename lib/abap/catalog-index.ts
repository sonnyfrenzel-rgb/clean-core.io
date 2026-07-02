/**
 * Catalog index helpers for the public /catalog pages.
 *
 * Derives lightweight, serializable views from the merged catalog
 * (lib/abap/catalog-service.ts) — WITHOUT shipping the full 23k-entry map to
 * the client. Object pages render server-side via resolveApi(); these helpers
 * only provide names, slugs and A–Z grouping for navigation.
 *
 * NOTE: MergedApiEntry carries no application component, so module grouping is
 * not available here (would need a catalog-service extension). Navigation is
 * therefore alphabetical (A–Z browse), which needs no extra data.
 */

import { MERGED_TABLE_MAP, NO_PATH_OBJECTS } from './catalog-service';

/** Only plain object names are routable as clean slugs (namespaced /NS/OBJ excluded). */
const ROUTABLE = /^[A-Z0-9_]+$/;

export function objectToSlug(name: string): string {
  return name.toLowerCase();
}
export function slugToObject(slug: string): string {
  return (slug || '').toUpperCase();
}

/** Union of mapped objects and honest no-path objects, sorted, routable only. */
export function getAllCatalogObjectNames(): string[] {
  const set = new Set<string>([...Object.keys(MERGED_TABLE_MAP), ...NO_PATH_OBJECTS]);
  return Array.from(set).filter((n) => ROUTABLE.test(n)).sort();
}

/** Objects whose name starts with a given A–Z letter (or '0' bucket for digits). */
export function getObjectsByLetter(letter: string): string[] {
  const L = (letter || '').toUpperCase();
  return getAllCatalogObjectNames().filter((n) => {
    const first = n[0];
    if (L === '0') return /[0-9]/.test(first);
    return first === L;
  });
}

export const CATALOG_LETTERS = ['0', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

/** Slim list for client-side search on the index page. Names only. */
export function getCatalogSearchIndex(): string[] {
  return getAllCatalogObjectNames();
}

/**
 * Only objects with a real mapped successor (routable). These are the unique,
 * index-worthy pages. The honest "no released-API path" pages carry near-identical
 * boilerplate, so they are kept accessible (browse + noindex,follow) but excluded
 * from the sitemap to avoid thin/duplicate-content signals.
 */
export function getMappedCatalogObjectNames(): string[] {
  return Object.keys(MERGED_TABLE_MAP).filter((n) => ROUTABLE.test(n)).sort();
}

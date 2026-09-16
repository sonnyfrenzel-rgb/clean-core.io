/**
 * When each indexable route's content last actually changed.
 *
 * GENERATED — run `npm run sync:content-dates` to refresh. Do not hand-edit;
 * the dates come from the git history of the files that render each route.
 *
 * `app/sitemap.ts` reads this instead of stamping every URL with the build time.
 * A sitemap timestamp is a claim about content, and thirty URLs claiming to have
 * changed on every deploy is a claim Google answers by ignoring `lastmod` for the
 * whole domain.
 */
export const CONTENT_LAST_MODIFIED: Record<string, string> = {
  '/': '2026-09-15',
  '/clean-core-explained': '2026-08-20',
  '/first-run': '2026-09-16',
  '/how-to': '2026-09-15',
  '/knowledge': '2026-09-15',
  '/abap-custom-code-analysis': '2026-09-16',
  '/clean-core-score': '2026-09-16',
  '/sap-clean-core-object-classification': '2026-09-09',
  '/method/levels': '2026-09-16',
  '/sap-cloudification': '2026-08-26',
  '/how-it-works': '2026-08-27',
  '/about': '2026-09-16',
  '/whitepaper': '2026-09-15',
  '/reference-analysis': '2026-08-28',
  '/tenant-security': '2026-09-15',
  '/trust': '2026-07-10',
  '/impressum': '2026-07-06',
  '/datenschutz': '2026-09-16',
  '/terms': '2026-09-16',
  '/licenses': '2026-07-10',
  '/catalog': '2026-08-26',
  '/catalog/browse': '2026-08-26',
  '/catalog/module': '2026-08-31',
  '/catalog/object': '2026-09-09',
  '/features': '2026-09-15',
};

/** Falls back to the release date for a route not in the map. */
export function contentDate(route: string, fallback: Date): Date {
  const iso = CONTENT_LAST_MODIFIED[route];
  return iso ? new Date(`${iso}T00:00:00Z`) : fallback;
}

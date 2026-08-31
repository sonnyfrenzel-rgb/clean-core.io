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
  '/': '2026-08-31',
  '/clean-core-explained': '2026-08-20',
  '/first-run': '2026-08-27',
  '/how-to': '2026-08-19',
  '/knowledge': '2026-08-26',
  '/abap-custom-code-analysis': '2026-08-27',
  '/clean-core-score': '2026-07-16',
  '/sap-clean-core-object-classification': '2026-08-26',
  '/sap-cloudification': '2026-08-26',
  '/how-it-works': '2026-08-27',
  '/about': '2026-07-07',
  '/whitepaper': '2026-08-26',
  '/reference-analysis': '2026-08-28',
  '/tenant-security': '2026-07-02',
  '/trust': '2026-07-10',
  '/impressum': '2026-07-06',
  '/datenschutz': '2026-08-28',
  '/terms': '2026-08-19',
  '/licenses': '2026-07-10',
  '/catalog': '2026-08-26',
  '/catalog/browse': '2026-08-26',
  '/catalog/module': '2026-08-28',
  '/catalog/object': '2026-08-26',
  '/features': '2026-07-15',
};

/** Falls back to the release date for a route not in the map. */
export function contentDate(route: string, fallback: Date): Date {
  const iso = CONTENT_LAST_MODIFIED[route];
  return iso ? new Date(`${iso}T00:00:00Z`) : fallback;
}

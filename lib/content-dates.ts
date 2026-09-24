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
  '/': '2026-09-24',
  '/clean-core-explained': '2026-09-24',
  '/first-run': '2026-09-24',
  '/how-to': '2026-09-24',
  '/knowledge': '2026-09-24',
  '/abap-custom-code-analysis': '2026-09-23',
  '/clean-core-score': '2026-09-17',
  '/facts': '2026-09-23',
  '/sap-clean-core-object-classification': '2026-09-23',
  '/method/levels': '2026-09-23',
  '/sap-cloudification': '2026-09-23',
  '/how-it-works': '2026-09-23',
  '/about': '2026-09-17',
  '/whitepaper': '2026-09-24',
  '/reference-analysis': '2026-09-24',
  '/tenant-security': '2026-09-24',
  '/trust': '2026-09-22',
  '/impressum': '2026-07-06',
  '/datenschutz': '2026-09-18',
  '/datenschutz/de': '2026-09-18',
  '/terms': '2026-09-18',
  '/licenses': '2026-07-10',
  '/catalog': '2026-09-23',
  '/catalog/browse': '2026-09-23',
  '/catalog/module': '2026-09-23',
  '/catalog/object': '2026-09-23',
  '/features': '2026-09-15',
};

/** Falls back to the release date for a route not in the map. */
export function contentDate(route: string, fallback: Date): Date {
  const iso = CONTENT_LAST_MODIFIED[route];
  return iso ? new Date(`${iso}T00:00:00Z`) : fallback;
}

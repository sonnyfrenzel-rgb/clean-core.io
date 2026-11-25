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
  '/': '2026-11-25',
  '/clean-core-explained': '2026-11-25',
  '/first-run': '2026-11-24',
  '/how-to': '2026-11-24',
  '/knowledge': '2026-11-24',
  '/abap-custom-code-analysis': '2026-11-24',
  '/clean-core-score': '2026-11-24',
  '/facts': '2026-10-22',
  '/sap-clean-core-object-classification': '2026-10-21',
  '/method/levels': '2026-10-21',
  '/sap-cloudification': '2026-10-21',
  '/how-it-works': '2026-10-22',
  '/about': '2026-10-10',
  '/whitepaper': '2026-11-25',
  '/reference-analysis': '2026-10-18',
  '/tenant-security': '2026-10-23',
  '/trust': '2026-10-22',
  '/impressum': '2026-10-02',
  '/datenschutz': '2026-11-13',
  '/datenschutz/de': '2026-11-13',
  '/terms': '2026-10-22',
  '/report': '2026-11-06',
  '/licenses': '2026-10-13',
  '/catalog': '2026-11-23',
  '/catalog/browse': '2026-10-21',
  '/catalog/module': '2026-10-21',
  '/catalog/object': '2026-10-21',
  '/features': '2026-11-23',
};

/** Falls back to the release date for a route not in the map. */
export function contentDate(route: string, fallback: Date): Date {
  const iso = CONTENT_LAST_MODIFIED[route];
  return iso ? new Date(`${iso}T00:00:00Z`) : fallback;
}

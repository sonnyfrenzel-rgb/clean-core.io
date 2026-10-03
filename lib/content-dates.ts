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
  '/': '2026-10-04',
  '/clean-core-explained': '2026-10-03',
  '/first-run': '2026-10-03',
  '/how-to': '2026-10-03',
  '/knowledge': '2026-10-03',
  '/abap-custom-code-analysis': '2026-10-03',
  '/clean-core-score': '2026-10-03',
  '/facts': '2026-10-03',
  '/sap-clean-core-object-classification': '2026-10-03',
  '/method/levels': '2026-10-03',
  '/sap-cloudification': '2026-10-03',
  '/how-it-works': '2026-10-03',
  '/about': '2026-10-03',
  '/whitepaper': '2026-10-04',
  '/reference-analysis': '2026-10-01',
  '/tenant-security': '2026-10-02',
  '/trust': '2026-10-02',
  '/impressum': '2026-10-02',
  '/datenschutz': '2026-10-02',
  '/datenschutz/de': '2026-10-02',
  '/terms': '2026-10-02',
  '/licenses': '2026-09-30',
  '/catalog': '2026-10-02',
  '/catalog/browse': '2026-10-02',
  '/catalog/module': '2026-10-02',
  '/catalog/object': '2026-10-02',
  '/features': '2026-10-02',
};

/** Falls back to the release date for a route not in the map. */
export function contentDate(route: string, fallback: Date): Date {
  const iso = CONTENT_LAST_MODIFIED[route];
  return iso ? new Date(`${iso}T00:00:00Z`) : fallback;
}

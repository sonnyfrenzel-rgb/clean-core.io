/**
 * Did an architect change the extensibility route the analysis recommended?
 *
 * The recommendation carries a confidence and a rationale. Printed beside a
 * route somebody switched to by hand, they read as support for the opposite
 * decision — which is what the Analyze stage did until the full review of
 * 33471220d6e9 (210bafeb4c8b). The stage asks this, and labels the card
 * accordingly.
 *
 * Deliberately conservative: an override is only claimed when both routes are
 * known. A missing recommendation or a project with no stored route is not an
 * override, because nothing was changed — the recommendation is simply the
 * only thing there is to show.
 */
export function routeWasOverridden(recommended: unknown, stored: unknown): boolean {
  if (typeof recommended !== 'string' || typeof stored !== 'string') return false;
  const a = recommended.trim();
  const b = stored.trim();
  if (a.length === 0 || b.length === 0) return false;
  return a !== b;
}

import { layerFromHash } from './workspace-model';
import { BUSINESS_MAP_ID } from './business-layers';
import { IT_SECTION_IDS } from './it-sections';
import { MANAGEMENT_IDS } from './management-sections';

/**
 * Places that belong to one view: IT's own sections (ADR-086), Management's
 * (ADR-087), the Business map and rules card.
 */
const VIEW_PLACES: ReadonlySet<string> = new Set([
  ...Object.values(IT_SECTION_IDS),
  ...Object.values(MANAGEMENT_IDS),
  BUSINESS_MAP_ID,
  'business-rules',
]);

/**
 * The `#fragment` a view switch carries over (Gegenreview c5085bb, CR-14).
 *
 * A subject — a line such as `#L42`, a selected element — stays, so the other
 * view opens on the same thing. A place of the old view — a layer
 * (`#architecture`, `#costs`), IT's sections, the Business map, the decision
 * card — does not: Business redirected IT's `#architecture` straight back to
 * IT, so the switch did nothing (Sonny, 10.10.2026).
 */
export function viewSwitchHash(hash: string): string {
  if (layerFromHash(hash) !== null || VIEW_PLACES.has(hash.replace(/^#/, ''))) return '';
  return hash;
}

/**
 * How long Analyze, Business follows `#process-map` (`components/analyze/AnalyzeBusiness.tsx`).
 *
 * The map is drawn only once the project, its run and its reading are loaded, which can take longer than
 * the hold itself. So the hold starts when the map first stands on the page, not when the address asked
 * for it; until then the follower waits, at most {@link MAP_FOLLOW_WAIT_MS}
 * (QA review of 0c6b49ec357c, 7470c349e342). A wheel, a touch, a key or a press by the reader still ends
 * it at once — that part is the component's.
 */

/** How long the map is held in view while the blocks around it settle, from the moment it is first seen. */
export const MAP_FOLLOW_HOLD_MS = 5000;
/** How long the follower waits for the map to appear at all — a slow load, a start run still being signed. */
export const MAP_FOLLOW_WAIT_MS = 120_000;

/**
 * Whether the follower goes on at `now`: `askedAt` is when the address named the map, `seenAt` when the map
 * first stood on the page (`null` while it has not). Pure: exported for the spec.
 */
export function mapFollowGoesOn(askedAt: number, seenAt: number | null, now: number): boolean {
  if (seenAt === null) return now - askedAt <= MAP_FOLLOW_WAIT_MS;
  return now - seenAt <= MAP_FOLLOW_HOLD_MS;
}

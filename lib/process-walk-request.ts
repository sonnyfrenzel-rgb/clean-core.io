/**
 * "Open the walk-through" from the top of the Business view — roadmap
 * "3.0.20 — with it", part (1): the walk-through is the leading way in, so its
 * entry stands under "Your next step", while the walk itself lives with the map
 * it selects steps on (`WorkspaceProcess`).
 *
 * The same pattern as `requestRuleEditing`: the walk may not be mounted yet
 * (the map is loaded on demand), so the request is held until the walk picks
 * it up, and announced to one that is there. It holds the project it was made
 * for, so a request left over from one project never opens another's walk.
 *
 * Nothing is stored: a request lives in this tab, for this page.
 */

/** The block the walk-through stands in — where the entry scrolls to. */
export const PROCESS_WALK_ID = 'process-walk';

/** The event the entry sends; heard by the walk. */
export const OPEN_WALK_EVENT = 'cc:open-walk';

let pending: string | null = null;

export function requestProcessWalk(projectId: string): void {
  pending = projectId;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_WALK_EVENT));
}

/** True once for a request made for this project; the request is used up. */
export function takeProcessWalkRequest(projectId: string): boolean {
  if (!projectId || pending !== projectId) return false;
  pending = null;
  return true;
}

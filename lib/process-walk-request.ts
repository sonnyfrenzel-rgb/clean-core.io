/**
 * "Walk through the process" from the top of the Business view or the First
 * insights — the way into the guided tour on the map (owner decision
 * 21.10.2026). The tour lives with the map it moves (`WorkspaceProcess`).
 *
 * The same pattern as `requestRuleEditing`: the map may not be mounted yet
 * (it is loaded on demand), so the request is held until it picks it up, and
 * announced to one that is there. It holds the project it was made for, so a
 * request left over from one project never opens another's tour.
 *
 * Nothing is stored: a request lives in this tab, for this page.
 */

/** The event the entry sends; heard by the map. */
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

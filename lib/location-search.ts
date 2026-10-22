import { useSyncExternalStore } from 'react';
import { isWorkspaceView, DEFAULT_VIEW, type WorkspaceView } from '@/lib/workspace-model';

/**
 * The address's query, read where the stage's chrome needs it — the way back,
 * the tool bar, the view switch — and kept current when the view switch of a
 * tool changes it (owner decision 22.10.2026, roadmap 3.0.21).
 *
 * Read in the browser only: the query is not part of the server render (`''`
 * there), and a statically generated demo page must not depend on it —
 * `useSearchParams` would force it to render on demand.
 *
 * The switch writes the address with the browser's own history (Next.js keeps
 * its router in step with it) and says so by `LOCATION_SEARCH_EVENT`; Back and
 * Forward say so by `popstate`. Either way every reader here reads again, and
 * the tool stays mounted: nothing it holds is read a second time.
 */
export const LOCATION_SEARCH_EVENT = 'cc:location-search';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(LOCATION_SEARCH_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(LOCATION_SEARCH_EVENT, onChange);
  };
}

const readSearch = () => window.location.search;
const serverSearch = () => '';

/** `location.search`, current after a view switch and after Back/Forward; `''` on the server. */
export function useLocationSearch(): string {
  return useSyncExternalStore(subscribe, readSearch, serverSearch);
}

/**
 * The view a tool was opened in. A view in the address is a perspective, never
 * a grant (ADR-018): an unknown or missing one reads as the view the
 * workspace opens in — the view "Back to project workspace" returns to.
 */
export function stageViewOf(search: string): WorkspaceView {
  const asked = new URLSearchParams(search).get('view');
  return isWorkspaceView(asked) ? asked : DEFAULT_VIEW;
}

/**
 * The same tool in another view: the path, every other parameter and the
 * fragment kept, only `view` set. Pure, so the rule is tested in one place.
 */
export function stageViewHref({ pathname, search, hash = '' }: { pathname: string; search: string; hash?: string }, view: WorkspaceView): string {
  const params = new URLSearchParams(search);
  params.set('view', view);
  return `${pathname}?${params.toString()}${hash}`;
}

/**
 * Switches the tool on screen to another view: the address changes in place
 * (a history entry of its own, so Back returns to the view before), and the
 * readers of `useLocationSearch` read it again. Never stored anywhere else — a
 * view is a view only (CLAUDE.md), not a property of a project or a run.
 */
export function switchStageView(view: WorkspaceView): void {
  const { pathname, search, hash } = window.location;
  const href = stageViewHref({ pathname, search, hash }, view);
  if (href === `${pathname}${search}${hash}`) return;
  window.history.pushState(null, '', href);
  window.dispatchEvent(new Event(LOCATION_SEARCH_EVENT));
}

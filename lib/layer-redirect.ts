import { layerFromHash, type WorkspaceView } from './workspace-model';
import { BUSINESS_LAYERS, BUSINESS_LAYER_ELSEWHERE, BUSINESS_MAP_ID } from './business-layers';
import { IT_LAYER_ELSEWHERE } from './it-sections';
import { MANAGEMENT_LAYER_ELSEWHERE } from './management-sections';

/**
 * Where an old layer address goes — one answer for the three views.
 *
 * Business keeps two layers (ADR-080), IT has its own sections (ADR-086) and
 * Management none (ADR-087), yet `#costs`, `#evidence`, `#changes` still
 * arrive from bookmarks, mails and the stages' way back. Each goes where that
 * content lives now: a place in the same view, a place in another view, or
 * the Economics tool. `null` when the address is not a layer, or one the view
 * still shows.
 *
 * Read from the address as it is, never from a layer held in state: that may
 * still be the last view's (QA 6ec03d013196).
 */
export type LayerRedirect = { kind: 'view'; view: WorkspaceView; hash: string } | { kind: 'economics' };

export function layerRedirect(
  view: WorkspaceView,
  hash: string,
  { hasActiveRun }: { hasActiveRun: boolean },
): LayerRedirect | null {
  const layer = layerFromHash(hash);
  if (layer === null) return null;
  if (view === 'business') {
    if (BUSINESS_LAYERS.includes(layer)) return null;
    const elsewhere = BUSINESS_LAYER_ELSEWHERE[layer];
    if (elsewhere === 'map') return { kind: 'view', view: 'business', hash: BUSINESS_MAP_ID };
    if (elsewhere === 'economics') return { kind: 'economics' };
    // Architecture and changes: where IT sends them since ADR-086 — IT's own
    // objects section, and Management's decision.
    return IT_LAYER_ELSEWHERE[layer];
  }
  if (view === 'it') return IT_LAYER_ELSEWHERE[layer];
  const home = MANAGEMENT_LAYER_ELSEWHERE[layer];
  // The Costs row stands in the decision, and without a signed run there is
  // no decision to show it in.
  if (home.kind === 'economics' || (layer === 'costs' && !hasActiveRun)) return { kind: 'economics' };
  return home;
}

/**
 * Replace the fragment of the current entry — through `history.replaceState`,
 * never `location.replace('#…')`.
 *
 * Next's App Router keeps its own copy of the address and writes it back into
 * the history on every router commit (`HistoryUpdater` in `app-router.js`).
 * It patches `history.replaceState` to learn about a change (an
 * `ACTION_RESTORE` with the new URL), but a fragment navigation through
 * `location` bypasses it: the address bar showed `#it-trust` while the router
 * still held `#evidence`, and the next commit put `#evidence` back — the
 * redirect "did not happen" (3.0.7 follow-up). The state passed is `null` on
 * purpose: Next copies its own entries in and only then hears about the URL.
 *
 * `replaceState` fires no `hashchange`, so one is sent: the page's place
 * follower, the layer state and the map's follow listen for it.
 */
export function replaceHashInPlace(hash: string): void {
  if (typeof window === 'undefined') return;
  const oldURL = window.location.href;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
}

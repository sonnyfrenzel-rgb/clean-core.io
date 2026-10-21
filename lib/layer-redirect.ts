import { layerFromHash, type WorkspaceView } from './workspace-model';
import { BUSINESS_LAYERS, BUSINESS_LAYER_ELSEWHERE, BUSINESS_MAP_ID } from './business-layers';
import { IT_LAYER_ELSEWHERE, IT_LAYERS } from './it-sections';
import { MANAGEMENT_LAYER_ELSEWHERE } from './management-sections';

/**
 * Where an old layer address goes — one answer for the three views.
 *
 * Business keeps one layer (ADR-080, ADR-096), IT has its own sections
 * (ADR-086) — *Standard fit* among them since ADR-096 — and Management none
 * (ADR-087), yet `#costs`, `#evidence`, `#changes` still
 * arrive from bookmarks, mails and the stages' way back. Each goes where that
 * content lives now: a place in the same view, a place in another view, or
 * the Economics tool. `null` when the address is not a layer, or one the view
 * still shows.
 *
 * Read from the address as it is, never from a layer held in state: that may
 * still be the last view's.
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
    // Architecture, changes and standard fit: where IT sends them — IT's own
    // objects section, Management's decision (ADR-086), IT's own Standard fit
    // (ADR-096).
    return IT_LAYER_ELSEWHERE[layer];
  }
  // A layer IT shows itself stays where it is: sending `#standard` on to
  // `#standard` would replace the address with itself on every render.
  if (view === 'it') return IT_LAYERS.includes(layer) ? null : IT_LAYER_ELSEWHERE[layer];
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

import type { User } from 'firebase/auth';

/**
 * `onAuthStateChanged` for components that only need to know who is signed in
 * and are on the first paint of a public page — the header button, the
 * landing page's calls to action.
 *
 * The Firebase app and Auth SDK are loaded here on first use, after the page
 * has hydrated, instead of in the page's first JavaScript: ~30 kB (gzip) that
 * every visitor of the start page downloaded and parsed before it was
 * interactive (docs/perf/REPORT.md). The components render their signed-out
 * (or placeholder) state on the server, as they always did, and switch once
 * the callback fires — the same as before, a few milliseconds later.
 *
 * `webpackExports` names the one export used: a plain dynamic import of the
 * namespace would mark every export of `firebase/auth` as used everywhere it
 * is bundled, and undo tree-shaking for the whole app.
 *
 * Returns the unsubscribe function; calling it before the SDK has arrived
 * cancels the subscription that would otherwise follow.
 */
export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | undefined;
  void Promise.all([
    import(/* webpackExports: ["getAuth"] */ './firebase-app'),
    import(/* webpackExports: ["onAuthStateChanged"] */ 'firebase/auth'),
  ]).then(([{ getAuth }, { onAuthStateChanged }]) => {
    if (cancelled) return;
    const auth = getAuth();
    if (!auth) return;
    unsubscribe = onAuthStateChanged(auth, callback);
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

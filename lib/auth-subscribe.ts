import type { Auth, User } from 'firebase/auth';

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
 *
 * `load` is the seam tests/auth-subscribe-guard.spec.ts uses to make the load fail; callers never pass it.
 */
export interface AuthSdk {
  getAuth: () => Auth | null;
  onAuthStateChanged: (auth: Auth, next: (user: User | null) => void) => () => void;
}

const loadAuthSdk = (): Promise<AuthSdk> =>
  Promise.all([
    import(/* webpackExports: ["getAuth"] */ './firebase-app'),
    import(/* webpackExports: ["onAuthStateChanged"] */ 'firebase/auth'),
  ]).then(([app, sdk]) => ({ getAuth: app.getAuth, onAuthStateChanged: sdk.onAuthStateChanged }));

export function subscribeToAuth(callback: (user: User | null) => void, load: () => Promise<AuthSdk> = loadAuthSdk): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | undefined;
  void load()
    .then(({ getAuth, onAuthStateChanged }) => {
      if (cancelled) return;
      const auth = getAuth();
      if (!auth) return;
      unsubscribe = onAuthStateChanged(auth, callback);
    })
    .catch(() => {
      // A chunk that does not load (a deploy replaced it, the network dropped) must not leave the header in its
      // placeholder for good: the controls fall back to signed out, whose link opens the sign-in dialog — which
      // loads the SDK again (QA review of 1503ad188710, finding afd6e6a0f91f).
      if (!cancelled) callback(null);
    });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

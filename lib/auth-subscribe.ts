import type { Auth, User } from 'firebase/auth';
import { hasSignedInHint, SIGNED_IN_HINT_EVENT, SIGNED_IN_HINT_KEY } from './auth-hint';

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
 * **Signed out, nothing is loaded at all** (privacy policy section 7, roadmap
 * 3.0.21): without the first-party signed-in hint of lib/auth-hint.ts the
 * callback hears `null` at once and the SDK stays where it is, because
 * initialising Auth contacts Google on mobile browsers and Safari even for a
 * visitor nobody ever signed in. The subscription then waits for the hint —
 * set by a sign-in in this page's dialog or in another tab — and only then
 * loads the SDK and asks Firebase. With the hint, the SDK loads as before.
 *
 * `load` and `signedInHint` are the seams tests/auth-subscribe-guard.spec.ts
 * uses; callers never pass them.
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

export function subscribeToAuth(
  callback: (user: User | null) => void,
  load: () => Promise<AuthSdk> = loadAuthSdk,
  signedInHint: () => boolean = hasSignedInHint,
): () => void {
  let cancelled = false;
  let started = false;
  let unsubscribe: (() => void) | undefined;
  const start = () => {
    if (started || cancelled) return;
    started = true;
    stopWaiting();
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
        // loads the SDK again.
        if (!cancelled) callback(null);
      });
  };
  // A sign-in on this page (the dialog) or in another tab sets the hint; only then is there anyone to ask about.
  const onHint = (event: Event) => {
    if (event.type === 'storage' && (event as StorageEvent).key !== SIGNED_IN_HINT_KEY) return;
    if (signedInHint()) start();
  };
  const listening = typeof window !== 'undefined';
  function stopWaiting() {
    if (!listening) return;
    window.removeEventListener(SIGNED_IN_HINT_EVENT, onHint);
    window.removeEventListener('storage', onHint);
  }

  if (signedInHint()) {
    start();
  } else {
    callback(null);
    if (listening) {
      window.addEventListener(SIGNED_IN_HINT_EVENT, onHint);
      window.addEventListener('storage', onHint);
    }
  }
  return () => {
    cancelled = true;
    stopWaiting();
    unsubscribe?.();
  };
}

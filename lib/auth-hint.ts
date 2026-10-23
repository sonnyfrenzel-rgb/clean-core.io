/**
 * Two first-party marks that decide whether a public page loads the Firebase
 * Auth SDK at all — privacy policy section 7: public pages contact nobody but
 * clean-core.io before sign-in (`noRequestWithoutSignIn` in
 * lib/legal/open-values.ts).
 *
 * Why a mark is needed: initialising Auth is not free of network traffic. On a
 * mobile browser or Safari, `getAuth()` loads Google's sign-in helper frame
 * (apis.google.com and the project's firebaseapp.com domain) straight away
 * (`_shouldInitProactively` in @firebase/auth); with an account persisted in
 * IndexedDB it also reloads that account from identitytoolkit.googleapis.com.
 * Reading the marks below sends nothing anywhere.
 *
 * - **Signed-in hint** (`localStorage`): "an account was signed in in this
 *   browser". Not a secret and not a credential — it holds `1`, nothing about
 *   the account. `lib/firebase-app.ts` keeps it in step with Firebase's own
 *   answer wherever the SDK runs (set on sign-in, removed on sign-out, on an
 *   expired session and on a sign-out in another tab), so a stale mark costs
 *   one SDK load that then removes it. Without it, a public header shows the
 *   signed-out state without asking Firebase (lib/auth-subscribe.ts).
 * - **Redirect pending** (`sessionStorage`): set right before a Google
 *   redirect sign-in leaves the page, removed once `getRedirectResult` has
 *   answered. The landing finishes a redirect only when it is set, instead of
 *   initialising Auth on every visit to ask whether there is one
 *   (components/LandingModals.tsx).
 *
 * No imports, so the public pages can read it without pulling in Firebase.
 * Every access is wrapped: storage can be blocked, full or absent (a private
 * window, a strict browser setting, the server).
 */

export const SIGNED_IN_HINT_KEY = 'cc.auth.signedIn';
export const REDIRECT_PENDING_KEY = 'cc.auth.redirectPending';

/** Dispatched on `window` when this page sets the signed-in hint, so a header on the same page can follow. */
export const SIGNED_IN_HINT_EVENT = 'cc-auth-hint';

function local(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Whether an account was signed in in this browser the last time Firebase was asked. */
export function hasSignedInHint(): boolean {
  try {
    return local()?.getItem(SIGNED_IN_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Follows Firebase's answer; called from lib/firebase-app.ts only. */
export function setSignedInHint(signedIn: boolean): void {
  const store = local();
  if (!store) return;
  try {
    const had = store.getItem(SIGNED_IN_HINT_KEY) === '1';
    if (signedIn) store.setItem(SIGNED_IN_HINT_KEY, '1');
    else store.removeItem(SIGNED_IN_HINT_KEY);
    if (signedIn && !had) window.dispatchEvent(new Event(SIGNED_IN_HINT_EVENT));
  } catch {
    // A blocked or full storage leaves the public header on its signed-out state; sign-in itself is unaffected.
  }
}

/** Call immediately before `signInWithRedirect`. */
export function markRedirectPending(): void {
  try {
    session()?.setItem(REDIRECT_PENDING_KEY, '1');
  } catch {
    // Without the mark the landing does not finish the redirect on its own; the app shell still sees the session.
  }
}

/** Whether a Google redirect sign-in left this tab and has not been finished yet. */
export function isRedirectPending(): boolean {
  try {
    return session()?.getItem(REDIRECT_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/** Call once `getRedirectResult` has answered, with a result or an error. */
export function clearRedirectPending(): void {
  try {
    session()?.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // Nothing to do: a mark that cannot be removed only means one more SDK load on the next visit in this tab.
  }
}

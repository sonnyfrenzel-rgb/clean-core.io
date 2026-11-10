import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { hasSignedInHint, isAuthStarted, SIGNED_IN_HINT_EVENT, SIGNED_IN_HINT_KEY } from '@/lib/auth-hint';
import { hasOwnSignedOutView, isPublicShellPath } from '@/lib/shell-routes';

/**
 * Whether this page of the signed-in shell may start the Firebase Auth SDK.
 *
 * - `true` once the first-party signed-in hint is set or this page has started
 *   Auth already (lib/auth-hint.ts) — on a public page and, since 09.11.2026,
 *   on a page that needs an account alike (`useAccountPage` below).
 * - `false` for a visitor without the hint: nobody is signed in in this
 *   browser as far as the product knows, and starting Auth would contact
 *   Google on mobile browsers and Safari (privacy policy section 7). On a
 *   public page the shell shows its signed-out state without asking Firebase;
 *   on a page that needs an account it sends the visitor to sign in.
 * - `undefined` while the page hydrates: the server cannot read the
 *   browser's storage, so the first client render must not either. A caller
 *   waits — it neither starts Auth nor reports "signed out" — until the
 *   re-render right after, which has the answer.
 *
 * It follows the hint: a sign-in in another tab (a `storage` event) or on this
 * page (`SIGNED_IN_HINT_EVENT`) turns it to `true`, and the callers then start
 * Auth and ask. A sign-out removes the hint, but Auth is started by then, so
 * the answer stays `true` and Firebase reports the sign-out itself.
 *
 * The one gate of the shell: hooks/useUserProfile.ts, components/UserOnboarding.tsx
 * and the shell's own account controls (app/(app)/layout.tsx) read it, and
 * tests/public-no-google-before-signin-guard.spec.ts holds them to it.
 */

type Known = 'yes' | 'no';

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SIGNED_IN_HINT_KEY) onChange();
  };
  window.addEventListener(SIGNED_IN_HINT_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(SIGNED_IN_HINT_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const clientSnapshot = (): Known => (hasSignedInHint() || isAuthStarted() ? 'yes' : 'no');
const serverSnapshot = (): Known | null => null;

export function useAuthWanted(): boolean | undefined {
  const known = useSyncExternalStore<Known | null>(subscribe, clientSnapshot, serverSnapshot);
  if (known === null) return undefined;
  return known === 'yes';
}

/**
 * Whether this page of the shell needs an account (lib/shell-routes.ts). Since
 * 09.11.2026 such a page follows the same gate as a public one: a visitor
 * without the signed-in hint is sent to the sign-in dialog by the shell
 * (app/(app)/layout.tsx) without the page rendering and without Auth starting
 * on the way — the network capture of 09.11.2026 found that opening
 * /dashboard signed out contacted Google on Safari (privacy policy section 7).
 * A browser that holds a session but not yet the hint finds it in the dialog
 * and comes back (components/LandingModals.tsx), once.
 */
export function useAccountPage(): boolean {
  const pathname = usePathname();
  // An invitation link shows its own signed-out state (lib/shell-routes.ts) and is not sent away.
  return !isPublicShellPath(pathname ?? '/') && !hasOwnSignedOutView(pathname ?? '/');
}

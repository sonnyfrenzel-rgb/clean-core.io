import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { hasSignedInHint, isAuthStarted, SIGNED_IN_HINT_EVENT, SIGNED_IN_HINT_KEY } from '@/lib/auth-hint';
import { isPublicShellPath } from '@/lib/shell-routes';

/**
 * Whether this page of the signed-in shell may start the Firebase Auth SDK.
 *
 * - `true` on every page that needs an account (lib/shell-routes.ts), as
 *   before; and on a public page once the first-party signed-in hint is set or
 *   this page has started Auth already (lib/auth-hint.ts).
 * - `false` on a public page for a visitor without the hint: nobody is signed
 *   in in this browser as far as the product knows, and starting Auth would
 *   contact Google on mobile browsers and Safari (privacy policy section 7).
 *   The shell shows its signed-out state without asking Firebase.
 * - `undefined` on a public page while it hydrates: the server cannot read the
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
  const pathname = usePathname();
  const known = useSyncExternalStore<Known | null>(subscribe, clientSnapshot, serverSnapshot);
  if (!isPublicShellPath(pathname ?? '/')) return true;
  if (known === null) return undefined;
  return known === 'yes';
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { subscribeToAuth } from '@/lib/auth-subscribe';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';

/**
 * `signInHref`: where the signed-out button leads. `?auth=signin` on the landing
 * page, which mounts the sign-in dialog; `/?auth=signin` from every other public
 * page, which does not (block D, D.24 — `components/PublicHeader.tsx`).
 */
export default function HeaderAuthButton({ signInHref = '?auth=signin' }: { signInHref?: string } = {}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);

  // The Auth SDK arrives after hydration (lib/auth-subscribe.ts); until it
  // has answered, the placeholder below stands, as it always did.
  useEffect(
    () =>
      subscribeToAuth((currentUser) => {
        setUser(currentUser);
        setLoading(false);
      }),
    [],
  );

  const handleGoToWorkspace = () => {
    setIsNavigating(true);
    router.push('/dashboard');
  };

  if (loading) {
    // Narrower below `sm`, because the placeholder has to fit the same space the
    // button does. At 176px flat it was 21px wider than a 320px header could
    // hold, and the whole page scrolled sideways until auth resolved. It stands
    // still: a pulsing block is motion without a state change (§1.7, §5.4).
    return <div aria-hidden={true} className="h-10 w-40 sm:w-44 rounded-cc-row bg-cc-surface-muted" />;
  }

  if (user) {
    // Busy on the button that started it (§2.8): the label stays "Go to
    // Workspace" and keeps its width; the indicator follows after 400 ms and a
    // second click is swallowed. It used to swap the label for "Loading...".
    return (
      <CcButton variant="primary" density="cozy" busy={isNavigating} onClick={handleGoToWorkspace}>
        Go to Workspace
      </CcButton>
    );
  }

  // Landing page 3.5 (owner decision O9, 13.11.2026): "Sign in" as a text link
  // and "Start free" in the secondary style, so a page's own filled button stays
  // the one primary. Both open the same, unchanged dialog — sign-in and sign-up
  // are one dialog. Together they fit a 320px header next to the mark.
  return (
    <span className="flex items-center gap-3 sm:gap-4">
      <Link href={signInHref} data-header-sign-in="" className="whitespace-nowrap py-2 text-[15px] font-bold text-cc-ink underline-offset-4 hover:underline">
        Sign in
      </Link>
      <CcLinkButton href={signInHref} variant="secondary" density="compact" data-header-start="">
        Start free
      </CcLinkButton>
    </span>
  );
}

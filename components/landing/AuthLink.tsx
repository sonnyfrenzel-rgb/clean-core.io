'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { publicButton, type PublicButtonVariant } from './public-button';

/**
 * A call to action on the landing page that knows whether the reader is signed
 * in — roadmap 3.0.6.
 *
 * Signed out, it opens the sign-in dialog and names where to go afterwards
 * (`?auth=signin&next=…`, read by `LandingModals` through `safeReturnPath`, so
 * only one of our own routes is ever a target). Signed in, it goes there
 * directly. The server renders the signed-out link, so the page works and is
 * crawlable without JavaScript; nothing about sign-in or sign-up changes.
 */
export default function AuthLink({
  to,
  variant = 'primary',
  size = 'md',
  children,
  testId,
}: {
  /** Where a signed-in reader goes, and where sign-in returns to. One of `lib/return-path.ts`. */
  to: string;
  variant?: PublicButtonVariant;
  size?: 'md' | 'sm';
  children: React.ReactNode;
  testId?: string;
}) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => setSignedIn(Boolean(user)));
  }, []);

  const href = signedIn ? to : to === '/dashboard' ? '?auth=signin' : `?auth=signin&next=${to}`;
  return (
    <Link href={href} className={publicButton(variant, size)} data-testid={testId}>
      {children}
    </Link>
  );
}

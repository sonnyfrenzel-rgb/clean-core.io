'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { publicButton } from '@/components/landing/public-button';
import { cn } from '@/lib/utils';

export default function HeaderAuthButton() {
  const auth = getAuth();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  const handleGoToWorkspace = () => {
    setIsNavigating(true);
    router.push('/dashboard');
  };

  if (loading) {
    // Narrower below `sm`, because the skeleton has to fit the same space the
    // button does. At 176px flat it was 21px wider than a 320px header could
    // hold, and the whole page scrolled sideways until auth resolved.
    return (
      <div className="h-10 w-28 sm:w-52 bg-cc-surface-muted rounded-full border border-cc-line"></div>
    );
  }

  if (user) {
    return (
      <button
        onClick={handleGoToWorkspace}
        disabled={isNavigating}
        className={`${publicButton('secondary', 'sm')} cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {isNavigating ? 'Loading...' : 'Go to Workspace'}
      </button>
    );
  }

  return (
    <Link
      href="?auth=signin"
      className={cn(publicButton('primary', 'sm'), 'px-3 sm:px-[18px]')}
    >
      {/* The full label does not fit a 320px header next to the wordmark, and it
          could not shrink, so it pushed the page sideways. Everything from `sm`
          up — every width the page has been reviewed at — is unchanged. */}
      <span className="sm:hidden">Get Free Access</span>
      <span className="hidden sm:inline">Get Free Access or Login</span>
    </Link>
  );
}

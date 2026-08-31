'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';

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
      <div className="h-10 w-32 sm:w-44 bg-gray-100 animate-pulse rounded-lg"></div>
    );
  }

  if (user) {
    return (
      <button
        onClick={handleGoToWorkspace}
        disabled={isNavigating}
        className="bg-gray-950 hover:bg-gray-800 text-white px-4 sm:px-6 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:bg-gray-900/70 disabled:cursor-not-allowed text-sm sm:text-base cursor-pointer"
      >
        {isNavigating ? 'Loading...' : 'Go to Workspace'}
      </button>
    );
  }

  return (
    <Link
      href="?auth=signin"
      className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-6 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm sm:text-base text-center inline-block whitespace-nowrap"
    >
      {/* The full label does not fit a 320px header next to the wordmark, and it
          could not shrink, so it pushed the page sideways. Everything from `sm`
          up — every width the page has been reviewed at — is unchanged. */}
      <span className="sm:hidden">Get Free Access</span>
      <span className="hidden sm:inline">Get Free Access or Login</span>
    </Link>
  );
}

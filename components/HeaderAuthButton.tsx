'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';

export default function HeaderAuthButton() {
  const auth = getAuth();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
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
    // Narrower below `sm`, because the placeholder has to fit the same space the
    // button does. At 176px flat it was 21px wider than a 320px header could
    // hold, and the whole page scrolled sideways until auth resolved. It stands
    // still: a pulsing block is motion without a state change (§1.7, §5.4).
    return <div aria-hidden={true} className="h-10 w-32 sm:w-44 rounded-cc-row bg-cc-surface-muted" />;
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

  return (
    <CcLinkButton href="?auth=signin" variant="primary" density="cozy">
      {/* The full label does not fit a 320px header next to the wordmark, and it
          could not shrink, so it pushed the page sideways. Everything from `sm`
          up — every width the page has been reviewed at — is unchanged. */}
      <span className="sm:hidden">Get Free Access</span>
      <span className="hidden sm:inline">Get Free Access or Login</span>
    </CcLinkButton>
  );
}

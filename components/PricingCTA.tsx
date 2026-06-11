'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';

interface PricingCTAProps {
  cta: string;
  highlight: boolean;
  disabled: boolean;
}

export default function PricingCTA({ cta, highlight, disabled }: PricingCTAProps) {
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

  const handleCTA = () => {
    if (user && !disabled) {
      setIsNavigating(true);
      router.push('/dashboard');
    }
  };

  if (disabled) {
    return (
      <button 
        disabled
        className="w-full py-4 rounded-2xl font-black text-sm bg-gray-200 text-gray-400 cursor-not-allowed"
      >
        {cta}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-12 bg-gray-100 animate-pulse rounded-2xl"></div>
    );
  }

  if (user) {
    return (
      <button 
        onClick={handleCTA}
        disabled={isNavigating}
        className={`w-full py-4 rounded-2xl font-black text-sm transition-all cursor-pointer ${
          highlight 
            ? 'bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-900/40' 
            : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
        }`}
      >
        {isNavigating ? 'Loading...' : 'Go to Workspace'}
      </button>
    );
  }

  return (
    <Link 
      href="?auth=signin"
      className={`w-full py-4 rounded-2xl font-black text-sm transition-all text-center block ${
        highlight 
          ? 'bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-900/40' 
          : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
      }`}
    >
      {cta}
    </Link>
  );
}

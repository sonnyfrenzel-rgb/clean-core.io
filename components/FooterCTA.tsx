'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';

export default function FooterCTA() {
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
    if (user) {
      setIsNavigating(true);
      router.push('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="h-16 w-64 bg-gray-800 animate-pulse rounded-2xl mx-auto"></div>
    );
  }

  if (user) {
    return (
      <button
        onClick={handleCTA}
        disabled={isNavigating}
        className="bg-green-600 hover:bg-green-700 text-white px-10 md:px-12 py-4 md:py-5 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-green-900/20 hover:-translate-y-1 disabled:bg-gray-700 disabled:cursor-not-allowed cursor-pointer"
      >
        {isNavigating ? 'Loading...' : 'Go to Workspace'}
      </button>
    );
  }

  return (
    <Link
      href="?auth=signin"
      className="bg-green-600 hover:bg-green-700 text-white px-10 md:px-12 py-4 md:py-5 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-green-900/20 hover:-translate-y-1 text-center inline-block"
    >
      Get Pilot Access or Login
    </Link>
  );
}

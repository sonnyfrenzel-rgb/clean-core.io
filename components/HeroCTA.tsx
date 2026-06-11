'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { ArrowRight, Download } from 'lucide-react';

export default function HeroCTA() {
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
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
        <div className="h-16 w-full sm:w-64 bg-gray-150 animate-pulse rounded-2xl"></div>
        <div className="h-16 w-full sm:w-64 bg-gray-150 animate-pulse rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
      {user ? (
        <button
          onClick={handleCTA}
          disabled={isNavigating}
          className="w-full sm:w-auto flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-12 py-5 rounded-2xl font-black text-lg transition-all shadow-lg hover:shadow-2xl hover:-translate-y-1 disabled:bg-green-500/50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isNavigating ? 'Loading...' : 'Open Workspace'} <ArrowRight className="w-5 h-5" />
        </button>
      ) : (
        <Link
          href="?auth=signin"
          className="w-full sm:w-auto flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-12 py-5 rounded-2xl font-black text-lg transition-all shadow-lg hover:shadow-2xl hover:-translate-y-1 text-center"
        >
          Get Pilot Access or Login <ArrowRight className="w-5 h-5" />
        </Link>
      )}
      <a 
        href="/Clean-Core_S4HANA_Modernization_Whitepaper.pdf"
        download="Clean-Core_S4HANA_Modernization_Whitepaper.pdf"
        className="w-full sm:w-auto flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-850 text-white px-8 py-5 rounded-2xl font-bold text-base transition-all shadow-md hover:shadow-lg hover:-translate-y-1 cursor-pointer"
      >
        <Download className="w-5 h-5 text-green-400" /> Download Whitepaper (PDF)
      </a>
    </div>
  );
}

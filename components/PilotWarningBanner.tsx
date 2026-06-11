'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

export default function PilotWarningBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const isBannerDismissed = sessionStorage.getItem('dismissPilotBanner') === 'true';
    if (!isBannerDismissed) {
      setShowBanner(true);
    }
  }, []);

  const dismissBanner = () => {
    sessionStorage.setItem('dismissPilotBanner', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="bg-amber-50/95 backdrop-blur text-amber-900 py-2 sm:py-2.5 px-4 pr-4 sm:pr-40 text-center text-[10px] sm:text-xs font-semibold border-b border-amber-200 flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 transition-all shrink-0 relative animate-in slide-in-from-top duration-300 z-50">
      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-950 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider select-none shrink-0">
        ⚡ Pilot Preview
      </span>
      <span className="leading-relaxed">
        Non-Commercial Research Platform. Powered by Generative AI. Provided without warranty.
      </span>
      <div className="flex items-center gap-2 font-black shrink-0">
        <Link href="?legal=privacy" className="underline hover:text-green-750 transition-colors outline-none cursor-pointer">
          Privacy Policy
        </Link>
        <span>•</span>
        <Link href="?legal=impressum" className="underline hover:text-green-750 transition-colors outline-none cursor-pointer">
          Legal Notice
        </Link>
        <span className="text-amber-300">|</span>
        <button 
          onClick={dismissBanner}
          className="inline-flex items-center gap-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all outline-none cursor-pointer border border-amber-300/40 hover:scale-105 active:scale-95 shadow-sm ml-1"
          title="Dismiss warning"
        >
          <X size={10} strokeWidth={3} className="shrink-0" /> Dismiss
        </button>
      </div>
    </div>
  );
}

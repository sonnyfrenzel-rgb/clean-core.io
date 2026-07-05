import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import SiteFooter from '@/components/SiteFooter';

/**
 * Feature detail pages live at the top level (like the catalog), so they carry their
 * own header + footer to stay 100% consistent with the rest of the site. The brand logo
 * returns to the landing top; each page also has a "Back" button to the feature grid.
 */
export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9ff]">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-green-600 hover:opacity-80 transition-opacity shrink-0">
            <span className="bg-green-600/10 p-2 rounded-xl">
              <RotateCw className="w-5 h-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-gray-900 leading-none">
                Clean-Core<span className="text-green-600">.io</span>
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 mt-0.5">Free Community Edition</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/how-it-works" className="hidden sm:inline text-xs font-black text-gray-600 hover:text-green-600 uppercase tracking-wider transition-colors">
              How It Works
            </Link>
            <Link href="/" className="text-xs font-black text-white bg-[#0b1c30] hover:bg-green-600 px-4 py-2 rounded-xl uppercase tracking-wider transition-colors">
              Home
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-gray-100 bg-white/60 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <SiteFooter />
        </div>
      </footer>
    </div>
  );
}

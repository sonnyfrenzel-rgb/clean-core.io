import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import SiteFooter from '@/components/SiteFooter';

/**
 * Catalog lives at the top level (outside the (app) shell), so it needs its own
 * header + footer to match the rest of the site. The brand logo returns to the
 * landing (top); the shared SiteFooter's back-to-home returns to the landing footer,
 * so a visitor always gets back in the same look & feel and lands at the same spot.
 */
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
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
            <Link href="/knowledge" className="hidden sm:inline text-xs font-black text-gray-600 hover:text-green-600 uppercase tracking-wider transition-colors">
              Knowledge Base
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

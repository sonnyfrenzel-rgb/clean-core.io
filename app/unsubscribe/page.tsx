import type { Metadata } from 'next';
import Link from 'next/link';
import UnsubscribeClient from './UnsubscribeClient';

export const metadata: Metadata = {
  title: 'Unsubscribe | Clean-Core.io',
  description: 'Stop receiving Clean-Core.io community updates.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The token is not read here. A mail links to `/unsubscribe#t=…`, and the
 * fragment never reaches the server, so the Cloud Run request log never sees
 * it (QA finding 8e25777f1339). `UnsubscribeClient` reads it in the browser —
 * and, for a mail sent before 30.09.2026, the old `?t=…` as well, which it then
 * strips from the address bar and the history.
 */
export default function UnsubscribePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <Link href="/" className="inline-block mb-8">
          <span className="text-2xl font-black text-gray-950 tracking-tight">
            Clean-Core<span className="text-green-600">.io</span>
          </span>
          <span className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mt-1">
            Free Community SAP Modernization Platform
          </span>
        </Link>

        <h1 className="text-3xl font-black text-gray-950 tracking-tight mb-3">Community updates</h1>

        <UnsubscribeClient />

        <p className="text-xs text-gray-400 mt-8 leading-relaxed">
          Clean-Core.io · Felix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany
        </p>
      </div>
    </main>
  );
}

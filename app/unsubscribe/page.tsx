import type { Metadata } from 'next';
import Link from 'next/link';
import UnsubscribeClient from './UnsubscribeClient';

export const metadata: Metadata = {
  title: 'Unsubscribe | Clean-Core.io',
  description: 'Stop receiving Clean-Core.io community updates.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

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

        <UnsubscribeClient token={t || ''} />

        <p className="text-xs text-gray-400 mt-8 leading-relaxed">
          Clean-Core.io · Felix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany
        </p>
      </div>
    </main>
  );
}

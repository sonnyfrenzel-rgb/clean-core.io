import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getObjectsByLetter,
  objectToSlug,
  CATALOG_LETTERS,
} from '@/lib/abap/catalog-index';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

export async function generateStaticParams() {
  return CATALOG_LETTERS.map((l) => ({ letter: l.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ letter: string }>;
}): Promise<Metadata> {
  const { letter } = await params;
  const L = letter.toUpperCase();
  const label = L === '0' ? '0–9' : L;
  return {
    title: `SAP objects starting with ${label} — Clean Core catalog | Clean-Core.io`,
    description: `SAP standard objects starting with ${label} and their released S/4HANA API successors.`,
    alternates: { canonical: `${BASE}/catalog/browse/${letter.toLowerCase()}` },
  };
}

export default async function CatalogBrowsePage({
  params,
}: {
  params: Promise<{ letter: string }>;
}) {
  const { letter } = await params;
  const L = letter.toUpperCase();
  if (!CATALOG_LETTERS.includes(L)) notFound();

  const objects = getObjectsByLetter(L);
  const label = L === '0' ? '0–9' : L;

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <nav className="text-sm text-slate-500 mb-6">
        <Link href="/catalog" className="hover:text-slate-700">Catalog</Link>
        <span className="mx-2">/</span>
        <span className="font-bold text-slate-700">{label}</span>
      </nav>

      <h1 className="text-3xl font-black text-gray-900 mb-6">
        SAP objects — {label}{' '}
        <span className="text-slate-400 text-lg font-bold">({objects.length})</span>
      </h1>

      <div className="flex flex-wrap gap-2 mb-10">
        {CATALOG_LETTERS.map((l) => (
          <Link
            key={l}
            href={`/catalog/browse/${l.toLowerCase()}`}
            className={`w-10 h-10 flex items-center justify-center rounded-lg border text-sm font-black transition-colors ${
              l === L
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-400'
            }`}
          >
            {l === '0' ? '0-9' : l}
          </Link>
        ))}
      </div>

      {objects.length === 0 ? (
        <p className="text-slate-500">No objects in this range.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {objects.map((n) => (
            <Link
              key={n}
              href={`/catalog/${objectToSlug(n)}`}
              className="px-3 py-2 rounded-lg border border-slate-100 bg-white font-mono text-sm font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 truncate"
            >
              {n}
            </Link>
          ))}
        </div>
      )}

      <CatalogAttribution />
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getCatalogStats, getMergedCatalogVersion } from '@/lib/abap/catalog-service';
import { getCatalogSearchIndex, CATALOG_LETTERS } from '@/lib/abap/catalog-index';
import CatalogSearch from '@/components/catalog/CatalogSearch';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

export const metadata: Metadata = {
  title: 'SAP Clean Core Object Catalog — Released API Successors | Clean-Core.io',
  description:
    'Look up any SAP standard object: its Clean Core readiness and released S/4HANA API successor. Reference data from the SAP Cloudification Repository, enriched by Clean-Core.io. Free.',
  alternates: { canonical: `${BASE}/catalog` },
};

export default function CatalogIndexPage() {
  const stats = getCatalogStats();
  const names = getCatalogSearchIndex();

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <p className="text-xs font-bold tracking-widest text-emerald-600 uppercase mb-3">
        SAP Clean Core Reference
      </p>
      <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
        SAP Object Catalog
      </h1>
      <p className="text-lg text-slate-600 leading-relaxed mb-2">
        Look up any SAP standard object to see its Clean Core readiness and its released S/4HANA API
        successor. A factual reference for architects planning custom-code modernization —{' '}
        <span className="font-semibold text-slate-800">
          what has a released successor, what needs an architect, and what has no clean path at all.
        </span>
      </p>
      {stats.classifiedObjects > 0 && (
        <p className="text-sm text-slate-500 mb-8">
          {stats.classifiedObjects.toLocaleString()} classified SAP objects ·{' '}
          {stats.mappedWithSuccessor.toLocaleString()} with a released successor · reflects the SAP
          Cloudification Repository as of {stats.syncDate || 'the latest sync'}.
        </p>
      )}

      <div className="mb-12">
        <CatalogSearch names={names} />
      </div>

      <h2 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4">
        Browse A–Z
      </h2>
      <div className="flex flex-wrap gap-2 mb-12">
        {CATALOG_LETTERS.map((l) => (
          <Link
            key={l}
            href={`/catalog/browse/${l.toLowerCase()}`}
            className="w-11 h-11 flex items-center justify-center rounded-xl border border-slate-200 bg-white font-black text-slate-700 hover:border-emerald-500 hover:text-emerald-600 transition-colors"
          >
            {l === '0' ? '0-9' : l}
          </Link>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <h2 className="font-black text-slate-900 mb-2">Analyze your own custom code</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          This catalog answers the object-level question. To see how your actual ABAP maps against it —
          per object, with evidence — run a free analysis.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm px-5 py-3 rounded-xl transition-colors"
        >
          Analyze free at clean-core.io
        </Link>
      </div>

      <CatalogAttribution />
    </main>
  );
}

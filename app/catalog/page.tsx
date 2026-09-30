import type { Metadata } from 'next';
import Link from 'next/link';
import { withTwitterCard } from '@/lib/page-metadata';
import { getCatalogStats, getMergedCatalogVersion } from '@/lib/abap/catalog-service';
import { getCatalogSearchIndex, CATALOG_LETTERS, getModuleAreas } from '@/lib/abap/catalog-index';
import CatalogSearch from '@/components/catalog/CatalogSearch';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';
import { publicButton } from '@/components/landing/public-button';
import { CATALOG_CARD, CATALOG_EYEBROW, CATALOG_LABEL, CATALOG_TITLE } from '@/components/catalog/catalog-style';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

// This is one of the highest-traffic pages on the site (1,491 impressions in the
// six months to 2026-09-15, per tests/seo-surface-guard.spec.ts) and, until
// roadmap 0.2, the one public page still missing its own `openGraph` — a share
// of this URL showed the generic domain-level card from app/layout.tsx instead
// of introducing the catalog itself, exactly the defect `withTwitterCard`'s own
// comment describes for the pages it already covers.
export const metadata: Metadata = withTwitterCard({
  title: 'SAP Cloudification Repository Viewer & Clean Core Object Catalog | Clean-Core.io',
  description:
    'Browse the SAP Cloudification Repository: look up any SAP standard object, its Clean Core readiness, and its released S/4HANA API successor. Official plus curated reference data, enriched by Clean-Core.io — free.',
  alternates: { canonical: `${BASE}/catalog` },
  openGraph: {
    title: 'SAP Object Catalog — Cloudification Repository Viewer',
    description:
      'Look up any SAP standard object, its Clean Core readiness, and its released S/4HANA API successor.',
    url: `${BASE}/catalog`,
    type: 'website',
  },
});

export default function CatalogIndexPage() {
  const stats = getCatalogStats();
  const names = getCatalogSearchIndex();
  const areas = getModuleAreas();

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <p className={`${CATALOG_EYEBROW} mb-4`}>
        SAP Clean Core Reference
      </p>
      <h1 className={`${CATALOG_TITLE} text-4xl md:text-5xl mb-4`}>
        SAP Object Catalog
      </h1>
      <p className="text-lg text-cc-ink-muted leading-relaxed mb-2">
        Look up any SAP standard object to see its Clean Core readiness and its released S/4HANA API
        successor. A factual reference for architects planning custom-code modernization —{' '}
        <span className="font-semibold text-cc-ink">
          what has a released successor, what needs an architect, and what has no clean path at all.
        </span>
      </p>
      {stats.classifiedObjects > 0 && (
        <p className="text-sm text-cc-ink-muted mb-8">
          {stats.classifiedObjects.toLocaleString('en-US')} classified SAP objects ·{' '}
          {stats.mappedWithSuccessor.toLocaleString('en-US')} with a released successor · reflects the SAP
          Cloudification Repository as of {stats.syncDate || 'the latest sync'}.
        </p>
      )}

      <div className="mb-12">
        <CatalogSearch names={names} />
      </div>

      <h2 className={`${CATALOG_LABEL} mb-4`}>
        Browse by SAP area
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
        {areas.map((a) => (
          <li key={a.code} className="rounded-2xl bg-cc-surface">
            <Link
              href={`/catalog/module/${a.code.toLowerCase()}`}
              className="group flex h-full items-start gap-3 p-4 rounded-2xl border border-cc-line hover:border-cc-field-border transition-colors"
            >
              <span className="shrink-0 inline-flex items-center justify-center min-w-[3rem] h-8 px-2 rounded-cc-row bg-cc-surface-muted border border-cc-line font-cc-mono font-bold text-sm text-cc-ink">
                {a.code}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-sm text-cc-ink underline-offset-4 group-hover:underline">
                  {a.name}
                </span>
                <span className="block text-xs text-cc-ink-muted">
                  {a.objectCount} object{a.objectCount === 1 ? '' : 's'} with a released successor
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className={`${CATALOG_LABEL} mb-4`}>
        Browse A–Z
      </h2>
      <div className="flex flex-wrap gap-2 mb-12">
        {CATALOG_LETTERS.map((l) => (
          <Link key={l} href={`/catalog/browse/${l.toLowerCase()}`} className={`${publicButton('ghost', 'sm')} min-w-11`}>
            {l === '0' ? '0-9' : l}
          </Link>
        ))}
      </div>

      <div className={`${CATALOG_CARD} p-6`}>
        <h2 className="text-lg font-extrabold text-cc-ink mb-2">Analyze your own custom code</h2>
        <p className="text-sm text-cc-ink-muted leading-relaxed mb-4">
          This catalog answers the object-level question. To see how your actual ABAP maps against it —
          per object, with evidence — run a free analysis.
        </p>
        <Link href="/" className={publicButton('primary', 'sm')}>
          Analyze free at clean-core.io
        </Link>
      </div>

      <CatalogAttribution />
    </main>
  );
}

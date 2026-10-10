import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getObjectsByLetter,
  objectToSlug,
  CATALOG_LETTERS,
} from '@/lib/abap/catalog-index';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';
import { publicButton } from '@/components/landing/public-button';
import {
  CATALOG_CRUMBS,
  CATALOG_CRUMB_LINK,
  CATALOG_TILE_ITEM,
  CATALOG_TILE_LINK,
  CATALOG_TITLE,
} from '@/components/catalog/catalog-style';

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
  const title = `SAP objects starting with ${label} · Clean Core | Clean-Core.io`;
  const description = `SAP standard objects starting with ${label}: their clean core level and, where SAP names one, their released S/4HANA API successor.`;
  const canonical = `${BASE}/catalog/browse/${letter.toLowerCase()}`;
  // Its own social card: without an `openGraph` block an A–Z page was shared
  // under the site's title and description, not its own.
  return withTwitterCard({
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
  });
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
      <nav aria-label="Breadcrumb" className={CATALOG_CRUMBS}>
        <Link href="/catalog" className={CATALOG_CRUMB_LINK}>Catalog</Link>
        <span className="mx-2">/</span>
        <span aria-current="page" className="font-semibold text-cc-ink">{label}</span>
      </nav>

      <h1 className={`${CATALOG_TITLE} text-3xl mb-6`}>
        SAP objects — {label}{' '}
        <span className="text-cc-ink-muted text-lg font-bold">({objects.length})</span>
      </h1>

      <div className="flex flex-wrap gap-2 mb-10">
        {CATALOG_LETTERS.map((l) => (
          <Link
            key={l}
            href={`/catalog/browse/${l.toLowerCase()}`}
            aria-current={l === L ? 'page' : undefined}
            className={`${publicButton(l === L ? 'secondary' : 'ghost', 'sm')} min-w-11`}
          >
            {l === '0' ? '0-9' : l}
          </Link>
        ))}
      </div>

      {objects.length === 0 ? (
        <p className="text-cc-ink-muted">No objects in this range.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {objects.map((n) => (
            <li key={n} className={CATALOG_TILE_ITEM}>
              <Link href={`/catalog/${objectToSlug(n)}`} className={CATALOG_TILE_LINK}>
                {n}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CatalogAttribution />
    </main>
  );
}

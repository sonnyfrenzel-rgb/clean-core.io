import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getModuleArea,
  getModuleAreas,
  getObjectsByModule,
  getObjectAppComponent,
  objectToSlug,
} from '@/lib/abap/catalog-index';
import { resolveApi, hasNoReleasedApiPath, gradeSapObject } from '@/lib/abap/catalog-service';
import { ABCD_META } from '@/lib/abap/abcd-classification';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';
import { jsonLdHtml } from '@/lib/json-ld';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

/**
 * Catalog hub per SAP application area (SD, FI, MM, …).
 *
 * The 387 object pages were topical islands: every one of them linked only back
 * to /catalog, so nothing tied VBAK to the rest of Sales and Distribution. These
 * hubs give each object a parent, the parent a set of siblings, and the catalog
 * a shape that matches how people actually search ("SAP SD tables released API").
 *
 * Only areas with enough objects to say something get a page — see
 * MIN_OBJECTS_PER_AREA in catalog-index.ts. Ten areas cover 345 of 357 classified
 * objects; the rest stay reachable through A–Z browse.
 */
export const revalidate = 86400;

export async function generateStaticParams() {
  return getModuleAreas().map((a) => ({ area: a.code.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  const meta = getModuleArea(area);
  if (!meta) return { title: 'Module not found | Clean-Core.io' };

  const count = getObjectsByModule(meta.code).length;
  const title = `SAP ${meta.name} (${meta.code}) objects → released S/4HANA APIs | Clean-Core.io`;
  const description = `${count} SAP ${meta.name} objects with their clean core level and released S/4HANA API successor, from SAP's official Cloudification Repository. ${meta.blurb}`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE}/catalog/module/${meta.code.toLowerCase()}` },
    openGraph: { title, description, url: `${BASE}/catalog/module/${meta.code.toLowerCase()}`, type: 'article' },
  };
}

export default async function CatalogModulePage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  const meta = getModuleArea(area);
  if (!meta) notFound();

  const objects = getObjectsByModule(meta.code);
  const slug = meta.code.toLowerCase();
  const areas = getModuleAreas();

  const rows = objects.map((name) => {
    const entry = resolveApi(name);
    const successor = entry?.successors?.[0]?.name || entry?.view || '';
    return {
      name,
      successor,
      noPath: hasNoReleasedApiPath(name),
      component: getObjectAppComponent(name),
      graded: gradeSapObject(name),
    };
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Catalog', item: `${BASE}/catalog` },
          { '@type': 'ListItem', position: 2, name: `${meta.name} (${meta.code})`, item: `${BASE}/catalog/module/${slug}` },
        ],
      },
      {
        '@type': 'ItemList',
        name: `SAP ${meta.name} (${meta.code}) objects`,
        numberOfItems: rows.length,
        itemListElement: rows.slice(0, 100).map((r, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: r.name,
          url: `${BASE}/catalog/${objectToSlug(r.name)}`,
        })),
      },
    ],
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      <nav className="text-sm text-slate-500 mb-6">
        <Link href="/catalog" className="hover:text-slate-700">Catalog</Link>
        <span className="mx-2">/</span>
        <span className="font-bold text-slate-700">{meta.code}</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight mb-3">
        SAP {meta.name}{' '}
        <span className="text-slate-400 font-bold">({meta.code})</span>
      </h1>
      <p className="text-lg text-slate-600 mb-2">{meta.blurb}</p>
      <p className="text-sm text-slate-500 mb-10">
        {rows.length} object{rows.length === 1 ? '' : 's'} in this area, {rows.filter((r) => r.successor).length} of
        them with a released S/4HANA successor. The sentence used to claim all of them did, while
        the table below marked some &ldquo;no released path&rdquo; two lines further down. Each row
        shows the clean core level derived from SAP&apos;s own published state for that object.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-10">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-black">Object</th>
              <th scope="col" className="px-4 py-3 font-black">Level</th>
              <th scope="col" className="px-4 py-3 font-black">Released successor</th>
              <th scope="col" className="px-4 py-3 font-black hidden sm:table-cell">Component</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.name} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/catalog/${objectToSlug(r.name)}`}
                    className="font-mono font-bold text-slate-800 hover:text-emerald-700 hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  {r.graded.grade !== 'Unknown' && (
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-black border ${ABCD_META[r.graded.grade].badge}`}
                      title={r.graded.state ? `SAP state: ${r.graded.state}` : 'Listed in neither SAP file — SAP-internal'}
                    >
                      {r.graded.grade}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-emerald-700">
                  {r.successor || <span className="text-slate-400 font-sans">no released path</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-500 font-mono text-xs hidden sm:table-cell">
                  {r.component || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-black text-gray-900 mb-4">Other SAP areas</h2>
      <div className="flex flex-wrap gap-2 mb-10">
        {areas.map((a) => (
          <Link
            key={a.code}
            href={`/catalog/module/${a.code.toLowerCase()}`}
            className={`px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors ${
              a.code === meta.code
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-400'
            }`}
          >
            {a.code} <span className="text-slate-400 font-normal">{a.objectCount}</span>
          </Link>
        ))}
      </div>

      <CatalogAttribution />
    </main>
  );
}

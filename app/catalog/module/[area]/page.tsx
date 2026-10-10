import type { Metadata } from 'next';
import { DESCRIPTION_MAX, TITLE_MAX, firstThatFits, withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getModuleArea,
  getModuleAreas,
  getObjectsByModule,
  getObjectAppComponent,
  objectToSlug,
} from '@/lib/abap/catalog-index';
import { primarySuccessor, hasNoReleasedApiPath, gradeSapObject, gradeSapObjectUses } from '@/lib/abap/catalog-service';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';
import CcTable from '@/components/cc/Table';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { publicButton } from '@/components/landing/public-button';
import {
  CATALOG_CARD,
  CATALOG_CRUMBS,
  CATALOG_CRUMB_LINK,
  CATALOG_H2,
  CATALOG_TITLE,
} from '@/components/catalog/catalog-style';
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
  // The fullest wording that fits a search result (roadmap 3.0.8); the long
  // area names (Sales and Distribution) drop the tag line, the short ones keep it.
  const title = firstThatFits(
    TITLE_MAX,
    `SAP ${meta.name} (${meta.code}): clean core levels | Clean-Core.io`,
    `SAP ${meta.name} (${meta.code}) objects | Clean-Core.io`,
    `SAP ${meta.code} objects: clean core levels | Clean-Core.io`,
  );
  // Every wording keeps the two qualifiers QA asked for (f55806a3b0ff): a
  // successor only "where one is known", and the curated source named.
  const description = firstThatFits(
    DESCRIPTION_MAX,
    `${count} SAP ${meta.name} objects: clean core level and, where one is known, the released S/4HANA successor (SAP's or a curated mapping, marked as such).`,
    `${count} SAP ${meta.name} objects: clean core level and, where one is known, the S/4HANA successor (SAP's or a curated mapping, marked as such).`,
    `${count} SAP ${meta.code} objects: clean core level and, where one is known, the released S/4HANA successor (SAP's or a curated mapping, marked as such).`,
  );

  return withTwitterCard({
    title,
    description,
    alternates: { canonical: `${BASE}/catalog/module/${meta.code.toLowerCase()}` },
    openGraph: { title, description, url: `${BASE}/catalog/module/${meta.code.toLowerCase()}`, type: 'article' },
  });
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
    // Who names the successor travels with it: SAP's file, or our curated layer (codex code-public-03).
    const primary = primarySuccessor(name);
    return {
      name,
      successor: primary?.name ?? '',
      curated: primary?.source === 'curated',
      noPath: hasNoReleasedApiPath(name),
      component: getObjectAppComponent(name),
      graded: gradeSapObject(name),
      byUse: gradeSapObjectUses(name),
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

      <nav aria-label="Breadcrumb" className={CATALOG_CRUMBS}>
        <Link href="/catalog" className={CATALOG_CRUMB_LINK}>Catalog</Link>
        <span className="mx-2">/</span>
        <span aria-current="page" className="font-semibold text-cc-ink">{meta.code}</span>
      </nav>

      <h1 className={`${CATALOG_TITLE} text-3xl sm:text-4xl mb-3`}>
        SAP {meta.name}{' '}
        <span className="text-cc-ink-muted font-bold">({meta.code})</span>
      </h1>
      <p className="text-lg text-cc-ink-muted mb-2">{meta.blurb}</p>
      <p className="text-sm text-cc-ink-muted mb-10">
        {rows.length} object{rows.length === 1 ? '' : 's'} in this area, {rows.filter((r) => r.successor).length} of
        them with a released S/4HANA successor; one marked (curated) comes from Clean-Core.io&apos;s own
        mapping, not from SAP. Each row shows the clean core level derived from
        SAP&apos;s own published state for that object; an SAP object neither of SAP&apos;s files
        lists is level C, which is how SAP&apos;s level concept defines an internal object.
      </p>

      <div className={`${CATALOG_CARD} px-2 pt-3 pb-1 mb-10`}>
        <CcTable
          caption={`SAP ${meta.name} (${meta.code}) objects`}
          columns={[
            { key: 'object', label: 'Object' },
            { key: 'level', label: 'Level' },
            { key: 'successor', label: 'Released successor' },
            { key: 'component', label: 'Component' },
          ]}
          // Every cell carries a key: the rows are built here, in a server
          // component, and React checks elements that arrive inside an array
          // for keys when the client table renders them.
          rows={rows.map((r) => ({
            key: r.name,
            cells: {
              object: (
                <Link key="object" href={`/catalog/${objectToSlug(r.name)}`} className="font-cc-mono font-semibold text-cc-ink underline-offset-4 hover:underline">
                  {r.name}
                </Link>
              ),
              // A table SAP will not release is one level to read and another
              // to write; the row shows both rather than the stricter one
              // alone (roadmap 2.11).
              level: r.byUse ? (
                <span key="level"
                  className="inline-flex items-center gap-1 whitespace-nowrap"
                  title={`SAP state: ${r.graded.state} · ${r.byUse.read.grade} to read directly, ${r.byUse.write.grade} to write directly`}
                >
                  <CcCleanCoreLevel value={r.byUse.read.grade} />
                  <CcCleanCoreLevel value={r.byUse.write.grade} />
                  <span className="text-xs font-semibold text-cc-ink-muted">read/write</span>
                </span>
              ) : r.graded.grade !== 'Unknown' ? (
                <span key="level" title={r.graded.state ? `SAP state: ${r.graded.state}` : 'Listed in neither SAP file — SAP-internal'}>
                  <CcCleanCoreLevel value={r.graded.grade} />
                </span>
              ) : null,
              successor: r.successor ? (
                <span key="successor" className="font-cc-mono">
                  {r.successor}
                  {r.curated && <span className="ml-1 font-sans text-xs text-cc-ink-muted" data-successor-source="curated">(curated)</span>}
                </span>
              ) : (
                <span key="successor" className="text-cc-ink-muted">no released path</span>
              ),
              component: <span key="component" className="font-cc-mono text-xs text-cc-ink-muted">{r.component || '—'}</span>,
            },
          }))}
        />
      </div>

      <h2 className={`${CATALOG_H2} text-lg mb-4`}>Other SAP areas</h2>
      <div className="flex flex-wrap gap-2 mb-10">
        {areas.map((a) => (
          <Link
            key={a.code}
            href={`/catalog/module/${a.code.toLowerCase()}`}
            aria-current={a.code === meta.code ? 'page' : undefined}
            className={publicButton(a.code === meta.code ? 'secondary' : 'ghost', 'sm')}
          >
            {a.code} <span className="text-cc-ink-muted font-normal">{a.objectCount}</span>
          </Link>
        ))}
      </div>

      <CatalogAttribution />
    </main>
  );
}

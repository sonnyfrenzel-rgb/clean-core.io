import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { resolveApi, hasNoReleasedApiPath } from '@/lib/abap/catalog-service';
import {
  slugToObject,
  objectToSlug,
  getAllCatalogObjectNames,
} from '@/lib/abap/catalog-index';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

// Prerender the most valuable pages; the long tail renders on-demand via ISR.
const MAX_PRERENDER = 3000;
export const dynamicParams = true;
export const revalidate = 86400; // 24h

export async function generateStaticParams() {
  const names = getAllCatalogObjectNames();
  return names.slice(0, MAX_PRERENDER).map((n) => ({ object: objectToSlug(n) }));
}

function facts(name: string) {
  const entry = resolveApi(name);
  const noPath = hasNoReleasedApiPath(name);
  const successor = entry?.successors?.[0]?.name || entry?.view;
  const successorType = entry?.type;
  const allSuccessors = entry?.successors?.map((s) => s.name) ?? (successor ? [successor] : []);
  return { entry, noPath, successor, successorType, allSuccessors };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ object: string }>;
}): Promise<Metadata> {
  const { object } = await params;
  const name = slugToObject(object);
  const { entry, noPath, successor } = facts(name);
  if (!entry && !noPath) return { title: 'Object not found | Clean-Core.io' };

  const title = successor
    ? `${name} → ${successor} · Released API successor | Clean-Core.io`
    : `${name} · No released API path | Clean-Core.io`;
  const description = successor
    ? `${name} maps to the released S/4HANA successor ${successor}. Clean Core readiness reference from the SAP Cloudification Repository.`
    : `${name} has no released API successor in the SAP Cloudification Repository — it requires re-architecture for a Clean Core target. Reference for SAP custom-code modernization.`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE}/catalog/${object}` },
    openGraph: { title, description, url: `${BASE}/catalog/${object}`, type: 'article' },
    // No-path pages share near-identical boilerplate → keep accessible but out of the index.
    ...(successor ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function CatalogObjectPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
  const name = slugToObject(object);
  const { entry, noPath, successor, successorType, allSuccessors } = facts(name);

  if (!entry && !noPath) notFound();

  // Structured data: DefinedTerm (object → successor) + FAQPage (the two questions people ask).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTerm',
        name,
        description: successor
          ? `Released S/4HANA API successor: ${successor}`
          : 'No released API successor — requires re-architecture for Clean Core.',
        inDefinedTermSet: `${BASE}/catalog`,
        url: `${BASE}/catalog/${object}`,
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `What replaces ${name} in SAP S/4HANA Clean Core?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: successor
                ? `${name} maps to the released successor ${successor}${successorType ? ` (${successorType})` : ''}, per the SAP Cloudification Repository.`
                : `${name} has no released API successor in the SAP Cloudification Repository and requires re-architecture rather than a direct replacement.`,
            },
          },
          {
            '@type': 'Question',
            name: `Is ${name} released for ABAP Cloud?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: noPath
                ? `${name} is not released and has no released successor path.`
                : `Use the released successor ${successor} instead of ${name} for ABAP Cloud / Clean Core compliant development.`,
            },
          },
        ],
      },
    ],
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-sm text-slate-500 mb-6">
        <Link href="/catalog" className="hover:text-slate-700">Catalog</Link>
        <span className="mx-2">/</span>
        <span className="font-mono font-bold text-slate-700">{name}</span>
      </nav>

      <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2 font-mono">{name}</h1>

      {successor ? (
        <>
          <p className="text-lg text-slate-600 mb-8">
            Released S/4HANA Clean Core successor for <span className="font-mono font-bold">{name}</span>.
          </p>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              Released successor
            </span>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-2xl font-black text-emerald-700 font-mono">{successor}</span>
              {successorType && (
                <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {successorType}
                </span>
              )}
            </div>
            {allSuccessors.length > 1 && (
              <p className="text-sm text-slate-500 mt-3">
                Additional successors: {allSuccessors.slice(1).join(', ')}
              </p>
            )}
            {entry?.releaseState && (
              <p className="text-xs text-slate-400 mt-3">Repository state: {entry.releaseState}</p>
            )}
            {entry?.confidence && (
              <p className="text-xs text-slate-400 mt-1">
                Source: {entry.confidence === 'curated' ? 'Clean-Core.io curated (field-level)' : 'SAP official (Cloudification Repository)'}
              </p>
            )}
            {entry?.conceptNote && (
              <p className="text-sm text-slate-600 mt-3">Note: {entry.conceptNote}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-lg text-slate-600 mb-8">
            <span className="font-mono font-bold">{name}</span> has{' '}
            <span className="font-bold text-amber-700">no released API successor</span> in the SAP
            Cloudification Repository.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
            <span className="text-xs font-bold tracking-widest text-amber-600 uppercase">
              No clean path
            </span>
            <p className="text-slate-700 mt-2 leading-relaxed">
              This object is not released and has no direct released replacement. Custom code using it
              cannot simply be re-pointed — it requires re-architecture (e.g. a side-by-side extension)
              rather than a drop-in successor. This is an honest limitation, not an omission.
            </p>
          </div>
        </>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-black text-slate-900 mb-2">See how your code uses {name}</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          This is the object-level answer. To see, per object, whether your actual ABAP can move to the
          successor or needs an architect — with evidence — run a free analysis.
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

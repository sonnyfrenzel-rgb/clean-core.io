import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { resolveApi, hasNoReleasedApiPath, gradeSapObject, gradeSapObjectUses, getObjectDimensions } from '@/lib/abap/catalog-service';
import { ABCD_META, CLOUD_VIEW_META, CLASSIC_VIEW_META } from '@/lib/abap/abcd-classification';
import {
  slugToObject,
  objectToSlug,
  getAllCatalogObjectNames,
  getObjectAppComponent,
  getObjectModuleArea,
  getModuleArea,
  getRelatedObjects,
} from '@/lib/abap/catalog-index';
import CatalogAttribution from '@/components/catalog/CatalogAttribution';
import { jsonLdHtml } from '@/lib/json-ld';

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
  return {
    entry,
    noPath,
    successor,
    successorType,
    allSuccessors,
    graded: gradeSapObject(name),
    // Roadmap 7.9 (CR-01): the object's two dimensions — classic release status
    // and ABAP Cloud usability — plus the successor from whichever of SAP's two
    // files names it. The letter is not re-derived from this.
    dimensions: getObjectDimensions(name),
    // Set only for a table or view whose level depends on the access (KNA1: C to
    // read, D to write). The page has no code to look at, so it shows both.
    byUse: gradeSapObjectUses(name),
  };
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
  const { graded, byUse } = facts(name);
  const statePhrase = graded.state ? ` (SAP state: ${graded.state})` : '';
  const levelPhrase = byUse
    ? ` Clean core level ${byUse.read.grade} to read directly, ${byUse.write.grade} to write directly${statePhrase}.`
    : graded.grade === 'Unknown'
      ? ''
      : ` Clean core level ${graded.grade}${statePhrase}.`;
  const description = successor
    ? `${name} maps to the released S/4HANA successor ${successor}.${levelPhrase} Clean Core readiness reference from the SAP Cloudification Repository.`
    : `${name} has no released API successor in the SAP Cloudification Repository — it requires re-architecture for a Clean Core target.${levelPhrase}`;

  return withTwitterCard({
    title,
    description,
    alternates: { canonical: `${BASE}/catalog/${object}` },
    openGraph: { title, description, url: `${BASE}/catalog/${object}`, type: 'article' },
    // No-path pages share near-identical boilerplate → keep accessible but out of the index.
    ...(successor ? {} : { robots: { index: false, follow: true } }),
  });
}

export default async function CatalogObjectPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
  const name = slugToObject(object);
  const { entry, noPath, successor, successorType, allSuccessors, graded, byUse, dimensions } = facts(name);

  if (!entry && !noPath) notFound();

  // Structured data: DefinedTerm (object → successor) + FAQPage (the two questions people ask).
  const area = getObjectModuleArea(name);
  const areaMeta = getModuleArea(area);
  const related = getRelatedObjects(name);
  const component = getObjectAppComponent(name);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Catalog', item: `${BASE}/catalog` },
          ...(areaMeta
            ? [{
                '@type': 'ListItem',
                position: 2,
                name: `${areaMeta.name} (${areaMeta.code})`,
                item: `${BASE}/catalog/module/${areaMeta.code.toLowerCase()}`,
              }]
            : []),
          {
            '@type': 'ListItem',
            position: areaMeta ? 3 : 2,
            name,
            item: `${BASE}/catalog/${object}`,
          },
        ],
      },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      <nav className="text-sm text-slate-500 mb-6">
        <Link href="/catalog" className="hover:text-slate-700">Catalog</Link>
        {areaMeta && (
          <>
            <span className="mx-2">/</span>
            <Link
              href={`/catalog/module/${areaMeta.code.toLowerCase()}`}
              className="hover:text-slate-700"
            >
              {areaMeta.name} ({areaMeta.code})
            </Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span className="font-mono font-bold text-slate-700">{name}</span>
      </nav>

      <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2 font-mono">{name}</h1>

      {/*
        The clean core level, shown with the SAP state that produced it. These
        pages carry the highest click-through on the site, and the level is the
        first thing an architect wants after the successor. It stays out of the
        signed audit pack.

        For a table or view SAP will not release, the level depends on what the
        code does with it, and this page has no code to look at — so it shows
        both answers instead of the stricter one alone. One letter here used to
        tell everyone who only reads KNA1 to replace code that is conditionally
        clean (roadmap 2.11).
      */}
      {byUse && (
        <div className="mb-6 space-y-2" data-level-by-use>
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['read directly', byUse.read.grade],
              ['written directly', byUse.write.grade],
            ] as const).map(([access, grade]) => (
              <span key={access} className="inline-flex items-center gap-2">
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black border ${ABCD_META[grade].badge}`}>
                  {grade}
                </span>
                <span className="text-sm font-bold text-slate-700">
                  {access} &mdash; {ABCD_META[grade].short}
                </span>
              </span>
            ))}
            {graded.state && (
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                SAP state: {graded.state}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            The level depends on what your code does with it. Reading an object SAP will not release
            uses an internal SAP object: level {byUse.read.grade}, with a check against SAP&apos;s
            changelog before each upgrade. Writing to it directly is level {byUse.write.grade}.
            {successor && (
              <> SAP names <span className="font-mono">{successor}</span> as its successor; that says
              where to look, not that it is a drop-in replacement.</>
            )}
          </p>
        </div>
      )}
      {!byUse && graded.grade !== 'Unknown' && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black border ${ABCD_META[graded.grade].badge}`}>
            {graded.grade}
          </span>
          <span className="text-sm font-bold text-slate-700">
            Clean core level {graded.grade} &mdash; {ABCD_META[graded.grade].short}
          </span>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
            {graded.state
              ? `SAP state: ${graded.state}`
              : 'listed in neither SAP file — SAP-internal'}
          </span>
        </div>
      )}

      {/*
        The two files behind the letter, side by side.

        SAP publishes two artifacts that answer different questions, and the level
        merges them. With only the letter on screen the merge is unreadable: two
        independent code reviews in September 2026 read this page's derivation as a
        bug and filed it as a priority-zero defect, because neither half was
        visible next to the other. Both were wrong. Showing the halves is how a
        reader checks the answer instead of reconstructing it from the source.
      */}
      {graded.cloudView && graded.classicView && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden mb-8">
          {/*
            Roadmap 7.9 (CR-01), decision §9 no. 18: the letter is the clean core
            TARGET reference, not a statement about classic usability. Said here,
            at the object, because that is where it is read — and because the two
            columns below only make sense once a reader knows the letter is not a
            summary of them.
          */}
          <p className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-800">Two questions, two answers.</span>{' '}
            The level {graded.grade} above answers the clean core target question &mdash; what this
            object is worth in an ABAP Cloud target. Whether classic ABAP may still call it is a
            separate property, and it is the right-hand column.
          </p>
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-4">
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                ABAP Cloud view
              </p>
              <p className="text-sm font-bold text-slate-800 mt-1">
                {CLOUD_VIEW_META[graded.cloudView].label}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mt-1">
                {CLOUD_VIEW_META[graded.cloudView].detail}
              </p>
              <p className="text-[10px] text-slate-400 mt-2 font-mono">objectReleaseInfo</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                Classic view
              </p>
              <p className="text-sm font-bold text-slate-800 mt-1">
                {CLASSIC_VIEW_META[graded.classicView].label}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mt-1">
                {CLASSIC_VIEW_META[graded.classicView].detail}
              </p>
              <p className="text-[10px] text-slate-400 mt-2 font-mono">objectClassifications_SAP</p>
            </div>
          </div>

          {/*
            The third fact of roadmap 7.9: the successor, named — and named with
            the file it came from. SAP puts successors in BOTH artifacts and they
            are not the same set; 225 objects that exist only in the
            classification file name one that the release-file mapping layer
            (`resolveApi`) cannot see. Printing it without its source would make
            a classic-classification pointer look like a released-API mapping.
          */}
          {dimensions.successors.length > 0 && (
            <div className="border-t border-slate-200 p-4">
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                SAP names as successor
              </p>
              <p className="text-sm font-bold text-emerald-700 font-mono mt-1">
                {dimensions.successors.map((sx) => sx.name).join(', ')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {dimensions.successorSource === 'release'
                  ? 'From objectReleaseInfo — SAP names this as the released replacement.'
                  : 'From objectClassifications_SAP — SAP points classic use here; it is not necessarily a released API.'}
              </p>
            </div>
          )}

          {/*
            Roadmap 7.9, verbatim: "`deprecated` ohne Nachfolger ist eine
            Prüfung, kein automatisches D". 183 of the 259 deprecated objects in
            the release file name no replacement. The level stays D — the rule in
            abcd-classification.ts is unchanged and deliberately strict — but a
            D that rests on a missing sentence is a thing to check, and saying so
            is the difference between a verdict and an instruction nobody can act
            on.
          */}
          {dimensions.needsCheck && (
            <div className="bg-amber-50 border-t border-amber-200 p-4">
              <p className="text-xs text-amber-900 leading-relaxed">
                <span className="font-bold">Deprecated, with no successor named &mdash; check this one.</span>{' '}
                {dimensions.checkNote}
              </p>
            </div>
          )}

          {/*
            The 22 objects where the two files disagree — CL_BCS, CL_HTTP_CLIENT
            and the rest. This is the case that reads like a bug, so it explains
            itself here rather than in a source comment nobody sees.
          */}
          {graded.classicView === 'classic-api' &&
            (graded.cloudView === 'not-usable' || graded.cloudView === 'deprecated') && (
              <div className="bg-amber-50 border-t border-amber-200 p-4">
                <p className="text-xs text-amber-900 leading-relaxed">
                  <span className="font-bold">The two files disagree here, and the release state decides.</span>{' '}
                  Level B means &ldquo;acceptable where no level A path exists&rdquo;. SAP names a
                  successor for this object, so a level A path does exist and B would be the wrong
                  answer — which is why the level is {graded.grade} and not B.{' '}
                  <Link href="/method/levels" className="font-bold underline underline-offset-2">
                    The full rule, and the objects it applies to
                  </Link>
                  .
                </p>
              </div>
            )}
        </div>
      )}

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
              {/*
                Finding 20fe6d7b4308: since this page also covers the 359 objects
                that are listed ONLY in the classification file, the wording has
                to match which file said so. "Not released" is the release file's
                sentence; `noAPI` is a stronger and different one, and printing
                the first for the second would put SAP's words in the wrong file.
              */}
              {dimensions.classificationState === 'noAPI' && !dimensions.releaseState
                ? 'SAP classifies this object as noAPI — not intended for customer use — and names no replacement. Custom code calling it cannot simply be re-pointed; it requires re-architecture (e.g. a side-by-side extension). This is an honest limitation, not an omission.'
                : 'This object is not released and has no direct released replacement. Custom code using it cannot simply be re-pointed — it requires re-architecture (e.g. a side-by-side extension) rather than a drop-in successor. This is an honest limitation, not an omission.'}
            </p>
          </div>
        </>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-black text-slate-900 mb-2">See how your code uses {name}</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          This is the object-level answer. To see, per object, whether your actual ABAP can move to the
          successor or needs an architect — with evidence — run a free{' '}
          <Link href="/abap-custom-code-analysis" className="text-emerald-700 font-bold hover:underline">ABAP static code analysis</Link>.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm px-5 py-3 rounded-xl transition-colors"
        >
          Analyze free at clean-core.io
        </Link>
      </div>

      <div className="border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-3">Related</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-bold">
          <Link href="/abap-custom-code-analysis" className="text-emerald-700 hover:underline">→ ABAP static code analysis</Link>
          <Link href="/sap-clean-core-object-classification" className="text-emerald-700 hover:underline">→ Clean Core object classification (A–D)</Link>
          <Link href="/clean-core-score" className="text-emerald-700 hover:underline">→ What is the Clean Core Score?</Link>
          <Link href="/sap-cloudification" className="text-emerald-700 hover:underline">→ SAP cloudification explained</Link>
          <Link href="/knowledge" className="text-emerald-700 hover:underline">→ Clean Core guide (RAP vs CAP)</Link>
          <Link href="/catalog" className="text-emerald-700 hover:underline">→ Browse the full catalog</Link>
        </div>
      </div>

      {(areaMeta || component) && (
        <section className="mt-14 border-t border-slate-200 pt-8">
          <h2 className="text-lg font-black text-gray-900 mb-1">
            {areaMeta ? `More from SAP ${areaMeta.name}` : 'Application component'}
          </h2>
          {component && (
            <p className="text-sm text-slate-500 mb-4">
              Application component: <span className="font-mono">{component}</span>
            </p>
          )}
          {related.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {related.map((n) => (
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
          {areaMeta && (
            <Link
              href={`/catalog/module/${areaMeta.code.toLowerCase()}`}
              className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline"
            >
              All {areaMeta.name} objects &rarr;
            </Link>
          )}
        </section>
      )}

      <CatalogAttribution />
    </main>
  );
}

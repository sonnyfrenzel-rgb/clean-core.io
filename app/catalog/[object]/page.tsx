import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { resolveApi, primarySuccessor, hasNoReleasedApiPath, gradeSapObject, gradeSapObjectUses, getObjectDimensions } from '@/lib/abap/catalog-service';
import { ABCD_META, CLOUD_VIEW_META, CLASSIC_VIEW_META } from '@/lib/abap/abcd-classification';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import CcTag from '@/components/cc/Tag';
import { publicButton } from '@/components/landing/public-button';
import {
  CATALOG_CARD,
  CATALOG_CRUMBS,
  CATALOG_CRUMB_LINK,
  CATALOG_LABEL,
  CATALOG_LINK,
  CATALOG_TILE_ITEM,
  CATALOG_TILE_LINK,
  CATALOG_TITLE,
} from '@/components/catalog/catalog-style';
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
  // The successor and who names it: SAP's release file, or our curated layer
  // (codex code-public-03). Every sentence below that names SAP as the source
  // reads `curated` first.
  const primary = primarySuccessor(name);
  const successor = primary?.name;
  const successorType = primary?.type;
  const curated = primary?.source === 'curated';
  const allSuccessors = entry?.successors?.map((s) => s.name) ?? (successor ? [successor] : []);
  return {
    entry,
    noPath,
    successor,
    successorType,
    curated,
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
  // One address per object: /catalog/VBAK and /catalog/Vbak answer with the
  // lower-case slug the sitemap and every link use, so search engines see one page.
  if (object !== objectToSlug(name)) permanentRedirect(`/catalog/${objectToSlug(name)}`);
  const { entry, noPath, successor, curated } = facts(name);
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
    ? curated
      ? `${name} maps to the released S/4HANA successor ${successor} in Clean-Core.io's curated mapping, not from SAP's Cloudification Repository.${levelPhrase}`
      : `${name} maps to the released S/4HANA successor ${successor}.${levelPhrase} Clean Core readiness reference from the SAP Cloudification Repository.`
    : `${name} has no released API successor in the SAP Cloudification Repository — it requires re-architecture for a Clean Core target.${levelPhrase}`;

  return withTwitterCard({
    title,
    description,
    alternates: { canonical: `${BASE}/catalog/${objectToSlug(name)}` },
    openGraph: { title, description, url: `${BASE}/catalog/${objectToSlug(name)}`, type: 'article' },
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
  const { entry, noPath, successor, successorType, curated, allSuccessors, graded, byUse, dimensions } = facts(name);

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
            item: `${BASE}/catalog/${objectToSlug(name)}`,
          },
        ],
      },
      {
        '@type': 'DefinedTerm',
        name,
        description: successor
          ? `Released S/4HANA API successor: ${successor}${curated ? ' (Clean-Core.io curated mapping)' : ''}`
          : 'No released API successor — requires re-architecture for Clean Core.',
        inDefinedTermSet: `${BASE}/catalog`,
        url: `${BASE}/catalog/${objectToSlug(name)}`,
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
                ? `${name} maps to the released successor ${successor}${successorType ? ` (${successorType})` : ''}, ${curated ? "per Clean-Core.io's curated mapping, not SAP's Cloudification Repository" : 'per the SAP Cloudification Repository'}.`
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

      <nav aria-label="Breadcrumb" className={CATALOG_CRUMBS}>
        <Link href="/catalog" className={CATALOG_CRUMB_LINK}>Catalog</Link>
        {areaMeta && (
          <>
            <span className="mx-2">/</span>
            <Link
              href={`/catalog/module/${areaMeta.code.toLowerCase()}`}
              className={CATALOG_CRUMB_LINK}
            >
              {areaMeta.name} ({areaMeta.code})
            </Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span aria-current="page" className="font-cc-mono font-semibold text-cc-ink">{name}</span>
      </nav>

      <h1 className={`${CATALOG_TITLE} text-4xl mb-3 font-cc-mono break-all`}>{name}</h1>

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
                <CcCleanCoreLevel value={grade} />
                <span className="text-sm font-bold text-cc-ink">
                  {access} &mdash; {ABCD_META[grade].short}
                </span>
              </span>
            ))}
            {graded.state && (
              <CcTag>SAP state: {graded.state}</CcTag>
            )}
          </div>
          <p className="text-xs text-cc-ink-muted leading-relaxed">
            The level depends on what your code does with it. Reading an object SAP will not release
            uses an internal SAP object: level {byUse.read.grade}, with a check against SAP&apos;s
            changelog before each upgrade. Writing to it directly is level {byUse.write.grade}.
            {successor && (
              curated ? (
                <> Clean-Core.io&apos;s curated mapping points to <span className="font-cc-mono">{successor}</span>;
                that is our mapping, not SAP&apos;s. It says where to look, not that it is a drop-in replacement.</>
              ) : (
                <> SAP names <span className="font-cc-mono">{successor}</span> as its successor; that says
                where to look, not that it is a drop-in replacement.</>
              )
            )}
          </p>
        </div>
      )}
      {!byUse && graded.grade !== 'Unknown' && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <CcCleanCoreLevel value={graded.grade} />
          <span className="text-sm font-bold text-cc-ink">
            Clean core level {graded.grade} &mdash; {ABCD_META[graded.grade].short}
          </span>
          <CcTag>
            {graded.state
              ? `SAP state: ${graded.state}`
              : 'listed in neither SAP file — SAP-internal'}
          </CcTag>
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
        <div className={`${CATALOG_CARD} overflow-hidden mb-8`}>
          {/*
            Roadmap 7.9 (CR-01), decision §9 no. 18: the letter is the clean core
            TARGET reference, not a statement about classic usability. Said here,
            at the object, because that is where it is read — and because the two
            columns below only make sense once a reader knows the letter is not a
            summary of them.
          */}
          <p className="bg-cc-surface-muted border-b border-cc-line px-4 py-2 text-xs text-cc-ink-muted leading-relaxed">
            <span className="font-bold text-cc-ink">Two questions, two answers.</span>{' '}
            The level {graded.grade} above answers the clean core target question &mdash; what this
            object is worth in an ABAP Cloud target. Whether classic ABAP may still call it is a
            separate property, and it is the right-hand column.
          </p>
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-cc-line">
            <div className="p-4">
              <p className={CATALOG_LABEL}>
                ABAP Cloud view
              </p>
              <p className="text-sm font-bold text-cc-ink mt-1">
                {CLOUD_VIEW_META[graded.cloudView].label}
              </p>
              <p className="text-xs text-cc-ink-muted leading-relaxed mt-1">
                {CLOUD_VIEW_META[graded.cloudView].detail}
              </p>
              <p className="text-xs text-cc-ink-muted mt-2 font-cc-mono">objectReleaseInfo</p>
            </div>
            <div className="p-4">
              <p className={CATALOG_LABEL}>
                Classic view
              </p>
              <p className="text-sm font-bold text-cc-ink mt-1">
                {CLASSIC_VIEW_META[graded.classicView].label}
              </p>
              <p className="text-xs text-cc-ink-muted leading-relaxed mt-1">
                {CLASSIC_VIEW_META[graded.classicView].detail}
              </p>
              <p className="text-xs text-cc-ink-muted mt-2 font-cc-mono">objectClassifications_SAP</p>
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
            <div className="border-t border-cc-line p-4">
              <p className={CATALOG_LABEL}>
                SAP names as successor
              </p>
              <p className="text-sm font-bold text-cc-ink font-cc-mono mt-1">
                {dimensions.successors.map((sx) => sx.name).join(', ')}
              </p>
              <p className="text-xs text-cc-ink-muted mt-1">
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
            <div className="bg-cc-warning-bg border-t border-cc-warning-border p-4">
              <p className="text-xs text-cc-ink leading-relaxed">
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
              <div className="bg-cc-warning-bg border-t border-cc-warning-border p-4">
                <p className="text-xs text-cc-ink leading-relaxed">
                  <span className="font-bold">The two files disagree here, and the release state decides.</span>{' '}
                  Level B means &ldquo;acceptable where no level A path exists&rdquo;. SAP names a
                  successor for this object, so a level A path does exist and B would be the wrong
                  answer — which is why the level is {graded.grade} and not B.{' '}
                  <Link href="/method/levels" className="font-bold underline underline-offset-2 hover:text-cc-ink-muted">
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
          <p className="text-lg text-cc-ink-muted mb-8">
            Released S/4HANA Clean Core successor for <span className="font-cc-mono font-bold text-cc-ink">{name}</span>.
          </p>
          <div className={`${CATALOG_CARD} p-6 mb-6`}>
            <span className={CATALOG_LABEL}>
              Released successor
            </span>
            <div className="flex flex-wrap items-baseline gap-3 mt-2">
              <span className="text-2xl font-extrabold text-cc-ink font-cc-mono break-all">{successor}</span>
              {successorType && (
                <CcTag>{successorType}</CcTag>
              )}
            </div>
            {allSuccessors.length > 1 && (
              <p className="text-sm text-cc-ink-muted mt-3">
                Additional successors: {allSuccessors.slice(1).join(', ')}
              </p>
            )}
            {entry?.releaseState && (
              <p className="text-xs text-cc-ink-muted mt-3">Repository state: {entry.releaseState}</p>
            )}
            <p className="text-xs text-cc-ink-muted mt-1" data-successor-source={curated ? 'curated' : 'sap'}>
              Source: {curated ? "Clean-Core.io curated (field-level), not SAP's Cloudification Repository" : 'SAP official (Cloudification Repository)'}
            </p>
            {entry?.conceptNote && (
              <p className="text-sm text-cc-ink-muted mt-3">Note: {entry.conceptNote}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-lg text-cc-ink-muted mb-8">
            <span className="font-cc-mono font-bold text-cc-ink">{name}</span> has{' '}
            <span className="font-bold text-cc-warning">no released API successor</span> in the SAP
            Cloudification Repository.
          </p>
          <div className="bg-cc-warning-bg border border-cc-warning-border rounded-2xl p-6 mb-6">
            <span className="cc-text-label text-cc-warning">
              No clean path
            </span>
            <p className="text-cc-ink mt-2 leading-relaxed">
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

      <div className="bg-cc-surface-muted border border-cc-line rounded-2xl p-6 mb-6">
        <h2 className="font-extrabold text-cc-ink mb-2">See how your code uses {name}</h2>
        <p className="text-sm text-cc-ink-muted leading-relaxed mb-4">
          This is the object-level answer. To see, per object, whether your actual ABAP can move to the
          successor or needs an architect — with evidence — run a free{' '}
          <Link href="/abap-custom-code-analysis" className={CATALOG_LINK}>ABAP static code analysis</Link>.
        </p>
        <Link href="/" className={publicButton('primary', 'sm')}>
          Analyze free at clean-core.io
        </Link>
      </div>

      <div className={`${CATALOG_CARD} p-6 mb-6`}>
        <h2 className={`${CATALOG_LABEL} mb-3`}>Related</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <Link href="/abap-custom-code-analysis" className={CATALOG_LINK}>→ ABAP static code analysis</Link>
          <Link href="/sap-clean-core-object-classification" className={CATALOG_LINK}>→ Clean Core object classification (A–D)</Link>
          <Link href="/clean-core-score" className={CATALOG_LINK}>→ What is the Clean Core Score?</Link>
          <Link href="/sap-cloudification" className={CATALOG_LINK}>→ SAP cloudification explained</Link>
          <Link href="/knowledge" className={CATALOG_LINK}>→ Clean Core guide (RAP vs CAP)</Link>
          <Link href="/catalog" className={CATALOG_LINK}>→ Browse the full catalog</Link>
        </div>
      </div>

      {(areaMeta || component) && (
        <section className="mt-14 border-t border-cc-line pt-8">
          <h2 className="text-lg font-extrabold text-cc-ink mb-1">
            {areaMeta ? `More from SAP ${areaMeta.name}` : 'Application component'}
          </h2>
          {component && (
            <p className="text-sm text-cc-ink-muted mb-4">
              Application component: <span className="font-cc-mono">{component}</span>
            </p>
          )}
          {related.length > 0 && (
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {related.map((n) => (
                <li key={n} className={CATALOG_TILE_ITEM}>
                  <Link href={`/catalog/${objectToSlug(n)}`} className={CATALOG_TILE_LINK}>
                    {n}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {areaMeta && (
            <Link
              href={`/catalog/module/${areaMeta.code.toLowerCase()}`}
              className={`inline-flex items-center gap-1 text-sm ${CATALOG_LINK}`}
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

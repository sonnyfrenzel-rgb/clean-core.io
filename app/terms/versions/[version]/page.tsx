import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  ARCHIVED_TERMS_VERSIONS,
  archivedTerms,
  parseArchivedTerms,
  type ArchivedTermsVersion,
  type TermsBlock,
} from '@/lib/terms-versions';

/**
 * One superseded version of the Terms, in full.
 *
 * **Why a sub-page and not a block at the bottom of `/terms`.** Putting the old
 * text on the same page would do the one thing the whole rewrite of 18.09.2026
 * was about: it would put clauses a German court would strike — "at its
 * discretion and without notice", "continued use … constitutes acceptance" —
 * back in front of a reader of the *current* Terms, a scroll away from the
 * clauses that replaced them. `tests/terms-consumer-law-guard.spec.ts` says so
 * in code: it asserts that none of the removed sentences is on the rendered
 * `/terms`. The archive has to be reachable from `/terms` (§ 10.5) and it must
 * not be *on* it. So `/terms` lists the versions and each one has its own page.
 *
 * **Prerendered, deliberately.** `generateStaticParams` plus `dynamicParams =
 * false` means every archived text is read off disk during `next build` and
 * baked into HTML; no request ever touches the filesystem, so the page does not
 * depend on `docs/` travelling with the server image, and a URL naming a version
 * that was never published is a 404 rather than a file read.
 *
 * **Not indexed.** A superseded contract competing with the current one in
 * search results is a way to have somebody read the wrong terms. It is
 * `follow`, so the link back to `/terms` still carries.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return ARCHIVED_TERMS_VERSIONS.map((v) => ({ version: v.version }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await params;
  const entry = archivedTerms(version);
  if (!entry) return { title: 'Archived Terms of Service | Clean-Core.io' };
  return {
    title: `Terms of Service ${entry.label} (superseded) | Clean-Core.io`,
    description: `The Terms of Service and Community Guidelines of Clean-Core.io as they stood from ${entry.effectiveOn}. This version has been superseded; the current Terms are at clean-core.io/terms.`,
    alternates: { canonical: `https://clean-core.io/terms/versions/${entry.version}` },
    robots: { index: false, follow: true },
  };
}

/** The archived text, read at build time. */
function archivedText(entry: ArchivedTermsVersion): string {
  return fs.readFileSync(path.join(process.cwd(), entry.file), 'utf8');
}

function Block({ block }: { block: TermsBlock }) {
  if (block.kind === 'heading') {
    // The archived file's `#` is the document title, which this page already
    // renders as its own `h1`, so the levels step down by one.
    if (block.level === 1) {
      return <h2 className="text-xl font-black text-gray-900 tracking-tight">{block.text}</h2>;
    }
    // No `uppercase` here, although `/terms` styles its own headings that way.
    // On the live page that is a style; on an archived text it would change what
    // the document says — "PROVIDER / OPERATOR (IMPRINT)" is shouting, and it is
    // not the heading this version carries. `scratch/extract-legal.js` made the
    // same call when it read these headings out with `textContent`.
    return <h3 className="text-lg font-black text-gray-900 tracking-tight pt-4">{block.text}</h3>;
  }
  if (block.kind === 'list') {
    return (
      <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-base">
      {block.lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

export default async function ArchivedTermsPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const entry = archivedTerms(version);
  if (!entry) notFound();

  const blocks = parseArchivedTerms(archivedText(entry));

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-green-600 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-lg tracking-tight text-gray-900">
              Clean-Core<span className="text-green-600">.io</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 md:py-24" data-archived-terms={entry.version}>
        <h1 className="text-3xl md:text-5xl font-black text-gray-950 tracking-tighter mb-4">
          Terms of Service{' '}
          <span className="text-gray-400 font-medium text-2xl md:text-3xl">{entry.label}, archived</span>
        </h1>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-10">
          <p className="text-sm text-amber-800">
            <strong>This version is no longer current.</strong> It is reproduced here unchanged because it
            was in force from {entry.effectiveOn}, and because an account that accepted it is entitled to
            see the words it accepted. The Terms in force today are at{' '}
            <Link href="/terms" className="text-green-600 hover:underline font-semibold">
              clean-core.io/terms
            </Link>
            .
          </p>
        </div>

        <dl className="mb-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 font-semibold">Version</dt>
            <dd className="text-gray-900 font-mono" data-archived-version>
              {entry.version}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 font-semibold">Effective from</dt>
            <dd className="text-gray-900" data-archived-effective>
              {entry.effectiveOn}
            </dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-gray-500 font-semibold">SHA-256 of this text</dt>
            {/* The digest a consent record carries, printed so the record and the
                words can be compared by anyone holding both. */}
            <dd className="text-gray-900 font-mono text-xs break-all" data-archived-sha256>
              {entry.sha256}
            </dd>
          </div>
        </dl>

        <article className="space-y-6 text-gray-700 leading-relaxed" data-archived-text>
          {blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </article>
      </main>
    </div>
  );
}

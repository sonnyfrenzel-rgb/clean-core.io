import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
      return <h2 className="text-2xl font-extrabold text-cc-ink tracking-tight">{block.text}</h2>;
    }
    // No `uppercase` here, although `/terms` styles its own headings that way.
    // On the live page that is a style; on an archived text it would change what
    // the document says — "PROVIDER / OPERATOR (IMPRINT)" is shouting, and it is
    // not the heading this version carries. `scratch/extract-legal.js` made the
    // same call when it read these headings out with `textContent`.
    return <h3 className="text-xl font-bold text-cc-ink tracking-tight pt-4">{block.text}</h3>;
  }
  if (block.kind === 'list') {
    return (
      <ul className="list-disc pl-5 space-y-2 text-sm text-cc-ink-muted">
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
    <main className="max-w-3xl mx-auto px-6 py-16 md:py-24" data-archived-terms={entry.version}>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-cc-ink mb-4">
          Terms of Service{' '}
          <span className="text-cc-ink-muted font-medium text-2xl md:text-3xl">{entry.label}, archived</span>
        </h1>

        <div className="p-4 bg-cc-warning-bg border border-cc-warning-border rounded-2xl mb-10">
          <p className="text-sm text-cc-warning">
            <strong>This version is no longer current.</strong> It is reproduced here unchanged because it
            was in force from {entry.effectiveOn}, and because an account that accepted it is entitled to
            see the words it accepted. The Terms in force today are at{' '}
            <Link href="/terms" className="font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline">
              clean-core.io/terms
            </Link>
            .
          </p>
        </div>

        <dl className="mb-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-cc-ink-muted font-semibold">Version</dt>
            <dd className="text-cc-ink font-cc-mono" data-archived-version>
              {entry.version}
            </dd>
          </div>
          <div>
            <dt className="text-cc-ink-muted font-semibold">Effective from</dt>
            <dd className="text-cc-ink" data-archived-effective>
              {entry.effectiveOn}
            </dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-cc-ink-muted font-semibold">SHA-256 of this text</dt>
            {/* The digest a consent record carries, printed so the record and the
                words can be compared by anyone holding both. */}
            <dd className="text-cc-ink font-cc-mono text-xs break-all" data-archived-sha256>
              {entry.sha256}
            </dd>
          </div>
        </dl>

        <article className="space-y-6 text-cc-ink leading-relaxed" data-archived-text>
          {blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </article>
      </main>
  );
}

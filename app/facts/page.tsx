import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { ArrowLeft, FileJson } from 'lucide-react';
import { getFacts } from '@/lib/facts';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { jsonLdHtml } from '@/lib/json-ld';
import { bandRange, scoreBand } from '@/lib/clean-core-score';
import { AS_OF_TITLE, AS_OF_PARAGRAPH, WHAT_CHANGED_QUESTION, WHAT_CHANGED_ANSWER } from '@/lib/release-summary';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

export const metadata: Metadata = withTwitterCard({
  title: 'Facts: Catalog, Engine and Reference Run | Clean-Core.io',
  description:
    'The catalog, engine and reference-run figures this site cites, with their source: object and successor counts, Level A–D split, file hashes, sync dates.',
  alternates: { canonical: `${BASE}/facts` },
  openGraph: {
    title: 'Facts — the source for the catalog, engine and reference-run numbers',
    description:
      'One page for the catalog, engine and reference-run figures Clean-Core.io states publicly, with the artefact, hash and date behind each one.',
    url: `${BASE}/facts`,
    type: 'article',
  },
});

export const revalidate = 300;

/** A text link in running copy — the landing page's link, in tokens (block D, D.25b). */
const LINK = 'font-semibold text-cc-ink underline underline-offset-4 decoration-cc-field-border hover:decoration-cc-ink';

/**
 * The public page for `lib/facts.ts`.
 *
 * Roadmap 0.2 (`UX-E14-F01:R0`): every other public page that states one of
 * these numbers reads it from the same module, so this page is not a fifth
 * derivation — it is the same four or five calls the other pages already make,
 * laid out for a reader who wants the provenance rather than the headline.
 */
export default function FactsPage() {
  const facts = getFacts();
  const grades: Array<keyof typeof facts.levelDistribution> = ['A', 'B', 'C', 'D', 'Unknown'];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Clean-Core.io public facts',
    description:
      'The object count, successor count, Level A–D distribution, catalog artefact provenance, engine version, rule version and reference-run figures every public Clean-Core.io page derives from.',
    creator: { '@type': 'Organization', name: 'Clean-Core.io', url: BASE },
    url: `${BASE}/facts`,
    isAccessibleForFree: true,
    distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${BASE}/facts.json` },
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-16 space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-cc-ink-muted hover:text-cc-ink hover:underline underline-offset-4">
        <ArrowLeft size={14} /> Back to homepage
      </Link>

      <header className="space-y-4">
        <p className="inline-flex items-center rounded-full border border-cc-brand-strong/25 bg-cc-brand-surface px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cc-brand-strong">
          One source, every page
        </p>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] text-cc-ink leading-[1.1] text-balance">
          Where the catalog and engine numbers come from
        </h1>
        <p className="text-lg font-medium text-cc-ink-muted leading-relaxed">
          The object count, the successor count, the A–D distribution, the engine and rule version —
          wherever this site states one of them in public, it reads from this same data. If a page ever shows a
          different number for one of these, that page is wrong, not this one.
        </p>
        <p>
          <Link
            href="/facts.json"
            className="inline-flex items-center gap-2 text-sm font-semibold text-cc-ink underline underline-offset-4 decoration-cc-field-border hover:decoration-cc-ink"
          >
            <FileJson size={14} /> Read it as JSON
          </Link>
        </p>
      </header>

      {/* The dated paragraph and the 3.0 answer (roadmap 3.0.8, item 4) — from
          lib/release-summary.ts, the same words /llms.txt and the landing FAQ use;
          version and date follow lib/version.ts. */}
      <section className="space-y-6 rounded-2xl border border-cc-line bg-cc-surface p-6" aria-labelledby="as-of-title">
        <div className="space-y-2">
          <h2 id="as-of-title" className="text-2xl font-extrabold tracking-[-0.02em] text-cc-ink">
            {AS_OF_TITLE}
          </h2>
          <p className="leading-relaxed text-cc-ink" data-as-of="">
            {AS_OF_PARAGRAPH}
          </p>
        </div>
        <div className="space-y-2 border-t border-cc-line pt-6">
          <h2 className="text-lg font-extrabold text-cc-ink">{WHAT_CHANGED_QUESTION}</h2>
          <p className="text-sm leading-relaxed text-cc-ink-muted">{WHAT_CHANGED_ANSWER}</p>
          <p className="text-sm leading-relaxed text-cc-ink-muted">
            How the chain works, step by step, and where it stops:{' '}
            <Link href="/how-it-works" className={LINK}>
              /how-it-works
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Headline facts */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { k: 'SAP objects classified', v: facts.objectCount.toLocaleString('en-US') },
          { k: 'With a released successor', v: facts.successorCount.toLocaleString('en-US') },
          { k: 'Catalog synced', v: facts.catalogSyncDate || 'unknown' },
          { k: 'Engine version', v: facts.engineVersion },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-cc-line bg-cc-surface p-5">
            <div className="text-2xl sm:text-3xl font-extrabold tabular-nums text-cc-ink">{x.v}</div>
            <div className="cc-text-label text-cc-ink-muted mt-1">{x.k}</div>
          </div>
        ))}
      </section>

      {/* A-D distribution */}
      <section className="space-y-4">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-cc-ink">Level A–D distribution</h2>
        <p className="text-sm text-cc-ink-muted leading-relaxed">
          A census of SAP&apos;s own published data — not of any customer&apos;s code. The rule that
          produces it, with its version and the two source files, is at{' '}
          <Link href="/method/levels" className={LINK}>
            /method/levels
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {grades.map((g) => (
            <div key={g} className="rounded-2xl border border-cc-line bg-cc-surface p-5 text-center">
              <div className="text-2xl font-extrabold tabular-nums text-cc-ink">
                {facts.levelDistribution[g].toLocaleString('en-US')}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                {g !== 'Unknown' && <CcCleanCoreLevel value={g} />}
                <span className="cc-text-label text-cc-ink-muted">Level {g}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog artefacts */}
      <section className="space-y-4">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-cc-ink">The two synced SAP files</h2>
        <p className="text-sm text-cc-ink-muted leading-relaxed">
          Both the object count and the A–D rule are derived from these two files SAP publishes.
          Each carries the hash of the raw file as fetched and the date it was synced, so a reader can
          check that a figure has not drifted from what SAP actually served.
        </p>
        <div className="space-y-3">
          {facts.catalogArtifacts.map((a) => (
            <div key={a.file} className="rounded-2xl border border-cc-line bg-cc-surface p-5 space-y-1">
              <div className="font-extrabold text-cc-ink">{a.file}</div>
              <div className="text-sm text-cc-ink-muted">{a.question}</div>
              <div className="text-xs font-semibold text-cc-ink-muted font-cc-mono break-all">
                sha256 {a.sha256} · synced {a.fetchedAt} · {a.entries.toLocaleString('en-US')} entries · release {a.release}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rule version */}
      <section className="rounded-2xl border border-cc-line bg-cc-surface p-6 space-y-2">
        <h2 className="text-lg font-extrabold text-cc-ink">A–D rule version</h2>
        <p className="text-sm text-cc-ink leading-relaxed font-cc-mono break-all">
          {facts.ruleVersion}
        </p>
        <p className="text-sm text-cc-ink-muted leading-relaxed">
          The fingerprint (<code className="[overflow-wrap:anywhere]">{facts.ruleFingerprint}</code>) is a hash over the rule&apos;s own
          decision table — it moves when the rule moves, not on a schedule. Old runs stay stamped with
          the rule version that produced them.
        </p>
      </section>

      {/* Reference run */}
      <section className="rounded-2xl border border-cc-line bg-cc-surface p-6 space-y-2">
        <h2 className="text-lg font-extrabold text-cc-ink">Reference run</h2>
        <p className="text-sm text-cc-ink-muted leading-relaxed">
          One reproducible run over {facts.referenceRun.linesOfCode.toLocaleString('en-US')} lines of
          legacy ABAP (<code className="[overflow-wrap:anywhere]">{facts.referenceRun.fileName}</code>): {facts.referenceRun.totalFindings}{' '}
          findings, split {facts.referenceRun.resolvedCount} settled ·{' '}
          {facts.referenceRun.decisionCount} needing a decision ·{' '}
          {facts.referenceRun.handedBackCount} handed back, Clean Core Score{' '}
          {facts.referenceRun.cleanCoreScore} ({scoreBand(facts.referenceRun.cleanCoreScore).label.toLowerCase()},{' '}
          {bandRange(scoreBand(facts.referenceRun.cleanCoreScore))} in Clean-Core.io&apos;s bands). Full breakdown and the file to reproduce it:{' '}
          <Link href="/reference-analysis" className={LINK}>
            /reference-analysis
          </Link>
          .
        </p>
      </section>

      <footer className="text-xs font-semibold text-cc-ink-muted leading-relaxed border-t border-cc-line pt-6">
        Produced by Clean-Core.io {facts.engineVersion} ({facts.engineReleaseDate}) against catalog{' '}
        <code className="[overflow-wrap:anywhere]">{facts.catalogVersion}</code>. Every figure on this page is computed from the files named
        above when the page is rendered, and the rendered page is reused for up to five minutes; none
        of them is written into the page. Clean-Core.io is not affiliated
        with, or endorsed by, SAP SE.
      </footer>
    </main>
  );
}

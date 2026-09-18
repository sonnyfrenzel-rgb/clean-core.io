import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { ArrowLeft, FileJson } from 'lucide-react';
import { getFacts } from '@/lib/facts';
import { jsonLdHtml } from '@/lib/json-ld';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

export const metadata: Metadata = withTwitterCard({
  title: 'Facts — the source for every public number | Clean-Core.io',
  description:
    'Every number this site states in public — object count, successor count, the A–D level distribution, both synced catalog files with their hash and sync date, the engine and rule version, and the reference run — in one place, and as JSON.',
  alternates: { canonical: `${BASE}/facts` },
  openGraph: {
    title: 'Facts — the source for every public number',
    description:
      'One page for every figure Clean-Core.io states publicly, with the artefact, hash and date behind each one.',
    url: `${BASE}/facts`,
    type: 'article',
  },
});

export const revalidate = 300;

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
      'The object count, successor count, A-D level distribution, catalog artefact provenance, engine version, rule version and reference-run figures every public Clean-Core.io page derives from.',
    creator: { '@type': 'Organization', name: 'Clean-Core.io', url: BASE },
    url: `${BASE}/facts`,
    isAccessibleForFree: true,
    distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${BASE}/facts.json` },
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-16 space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600">
        <ArrowLeft size={14} /> Back to homepage
      </Link>

      <header className="space-y-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
          One source, every page
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-gray-950 leading-[1.05]">
          Where every public number comes from
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed">
          The object count, the successor count, the A–D distribution, the engine and rule version —
          every figure this site states in public reads from this same data. If a page ever shows a
          different number for one of these, that page is wrong, not this one.
        </p>
        <p>
          <Link
            href="/facts.json"
            className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-800"
          >
            <FileJson size={14} /> Read it as JSON
          </Link>
        </p>
      </header>

      {/* Headline facts */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { k: 'SAP objects classified', v: facts.objectCount.toLocaleString('en-US') },
          { k: 'With a released successor', v: facts.successorCount.toLocaleString('en-US') },
          { k: 'Catalog synced', v: facts.catalogSyncDate || 'unknown' },
          { k: 'Engine version', v: facts.engineVersion },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-gray-950">{x.v}</div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1">{x.k}</div>
          </div>
        ))}
      </section>

      {/* A-D distribution */}
      <section className="space-y-4">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">A–D level distribution</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          A census of SAP&apos;s own published data — not of any customer&apos;s code. The rule that
          produces it, with its version and the two source files, is at{' '}
          <Link href="/method/levels" className="text-emerald-700 font-bold hover:underline">
            /method/levels
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {grades.map((g) => (
            <div key={g} className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
              <div className="text-2xl font-black tabular-nums text-gray-950">
                {facts.levelDistribution[g].toLocaleString('en-US')}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                Level {g}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog artefacts */}
      <section className="space-y-4">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">The two synced SAP files</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Both the object count and the A–D rule are derived from these two files SAP publishes.
          Each carries the hash of the raw file as fetched and the date it was synced, so a reader can
          check that a figure has not drifted from what SAP actually served.
        </p>
        <div className="space-y-3">
          {facts.catalogArtifacts.map((a) => (
            <div key={a.file} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-1">
              <div className="font-black text-gray-950">{a.file}</div>
              <div className="text-sm text-slate-600">{a.question}</div>
              <div className="text-xs text-slate-500 font-mono">
                sha256 {a.sha256} · synced {a.fetchedAt} · {a.entries.toLocaleString('en-US')} entries · release {a.release}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rule version */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-2">
        <h2 className="text-lg font-black text-gray-950">A–D rule version</h2>
        <p className="text-sm text-slate-600 leading-relaxed font-mono break-all">
          {facts.ruleVersion}
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          The fingerprint (<code>{facts.ruleFingerprint}</code>) is a hash over the rule&apos;s own
          decision table — it moves when the rule moves, not on a schedule. Old runs stay stamped with
          the rule version that produced them.
        </p>
      </section>

      {/* Reference run */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-2">
        <h2 className="text-lg font-black text-gray-950">Reference run</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          One reproducible run over {facts.referenceRun.linesOfCode.toLocaleString('en-US')} lines of
          legacy ABAP (<code>{facts.referenceRun.fileName}</code>): {facts.referenceRun.totalFindings}{' '}
          findings, split {facts.referenceRun.resolvedCount} settled ·{' '}
          {facts.referenceRun.decisionCount} needing a decision ·{' '}
          {facts.referenceRun.handedBackCount} handed back, Clean Core Score{' '}
          {facts.referenceRun.cleanCoreScore}. Full breakdown and the file to reproduce it:{' '}
          <Link href="/reference-analysis" className="text-emerald-700 font-bold hover:underline">
            /reference-analysis
          </Link>
          .
        </p>
      </section>

      <footer className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-6">
        Produced by Clean-Core.io {facts.engineVersion} ({facts.engineReleaseDate}) against catalog{' '}
        <code>{facts.catalogVersion}</code>. Every figure on this page is computed at request time from
        the files named above; none of them is written into the page. Clean-Core.io is not affiliated
        with, or endorsed by, SAP SE.
      </footer>
    </main>
  );
}

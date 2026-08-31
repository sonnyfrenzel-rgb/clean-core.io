import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { Download, ArrowLeft } from 'lucide-react';
import { getReferenceAnalysis, REFERENCE_FILE } from '@/lib/reference-analysis';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { jsonLdHtml } from '@/lib/json-ld';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

export const metadata: Metadata = withTwitterCard({
  title: 'Reference Analysis — what one run on real legacy ABAP produces | Clean-Core.io',
  description:
    'A complete, reproducible run: 900+ lines of legacy ABAP, every finding, and the split between what the tool settles, what needs an architect, and what stays hand work. Download the file and check the numbers yourself.',
  alternates: { canonical: `${BASE}/reference-analysis` },
  openGraph: {
    title: 'Reference Analysis — what one run on real legacy ABAP produces',
    description:
      'The whole run, published: findings, the settle / decide / hand-back split, and the source file to reproduce it.',
    url: `${BASE}/reference-analysis`,
    type: 'article',
  },
});

export const revalidate = 300;

export default function ReferenceAnalysisPage() {
  const r = getReferenceAnalysis();
  const total = Math.max(1, r.resolved.count + r.decision.count + r.handedBack.count);

  const buckets = [
    { b: r.resolved, tone: 'emerald' as const },
    { b: r.decision, tone: 'amber' as const },
    { b: r.handedBack, tone: 'rose' as const },
  ];
  const bar = { emerald: 'bg-emerald-500', amber: 'bg-amber-400', rose: 'bg-rose-500' };
  const badge = {
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    amber: 'bg-amber-100 text-amber-800 border-amber-300',
    rose: 'bg-rose-100 text-rose-800 border-rose-300',
  };

  const bySeverity = ['Critical', 'High', 'Medium', 'Low', 'Info'].map((sev) => ({
    sev,
    n: r.findings.filter((f) => f.severity === sev).length,
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Clean-Core.io reference analysis',
    description: `A published, reproducible analysis of ${r.linesOfCode} lines of legacy SAP ABAP: ${r.totalFindings} findings, split into ${r.resolved.count} resolved against released SAP APIs, ${r.decision.count} requiring an architect decision and ${r.handedBack.count} handed back as structurally untransformable.`,
    creator: { '@type': 'Organization', name: 'Clean-Core.io', url: BASE },
    url: `${BASE}/reference-analysis`,
    isAccessibleForFree: true,
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-16 space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600"
      >
        <ArrowLeft size={14} /> Back to homepage
      </Link>

      <header className="space-y-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
          Reproducible reference run
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-gray-950 leading-[1.05]">
          What one run actually produces
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed">
          Most claims about tools like this cannot be checked. This one can. Below is a complete run
          over a legacy ABAP program that ships in our repository — every finding, and the split that
          tells you how much of the work the tool takes off your desk.
        </p>
        <p className="text-slate-700 leading-relaxed font-medium">
          Download the file, run it yourself, and you should see the same numbers.
        </p>
      </header>

      {/* Headline facts */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { k: 'Lines of ABAP', v: r.linesOfCode.toLocaleString('en-US') },
          { k: 'Findings', v: String(r.totalFindings) },
          // Not among the reproducible figures. The page invites the reader to
          // run the file and "see the same numbers", and the other three are
          // deterministic — this one is a wall-clock measurement taken on
          // whichever Cloud Run instance served the request, and it differs on
          // every load. Reported as an order of magnitude, which is the honest
          // form of the claim it was making.
          { k: 'Analysis time', v: r.durationMs < 1000 ? 'under 1 s' : `${Math.round(r.durationMs / 1000)} s` },
          { k: 'Clean Core Score', v: String(r.cleanCoreScore) },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-gray-950">{x.v}</div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1">
              {x.k}
            </div>
          </div>
        ))}
      </section>

      <p className="text-sm text-slate-500 leading-relaxed -mt-6">
        The analysis itself takes milliseconds. That is not the point, and we do not claim it saves
        you days — what takes time is the decisions, and those stay with you. The point is the split
        below: it tells you which decisions you still have to make.
      </p>

      {/* The split */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">Where the work lands</h2>

        <div className="flex h-5 w-full overflow-hidden rounded-full border border-slate-200">
          {buckets.map(({ b, tone }) => (
            <div
              key={b.label}
              className={bar[tone]}
              style={{ width: `${(b.count / total) * 100}%` }}
              title={`${b.count} ${b.label}`}
            />
          ))}
        </div>

        <div className="space-y-4">
          {buckets.map(({ b, tone }) => (
            <div key={b.label} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <span
                className={`shrink-0 inline-flex items-center justify-center min-w-[3.5rem] h-12 rounded-xl border text-xl font-black tabular-nums ${badge[tone]}`}
              >
                {b.count}
              </span>
              <div>
                <h3 className="font-black text-gray-950 capitalize">{b.label}</h3>
                <p className="text-sm text-slate-600 leading-relaxed mt-1">{b.meaning}</p>
                {b.label === r.handedBack.label && r.handedBackKinds.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    In this file: {r.handedBackKinds.join(', ')}.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Severity */}
      <section className="space-y-4">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">By severity</h2>
        <div className="flex flex-wrap gap-3">
          {bySeverity.filter((x) => x.n > 0).map((x) => (
            <span
              key={x.sev}
              className="inline-flex items-baseline gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2"
            >
              <span className="text-xl font-black tabular-nums text-gray-950">{x.n}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{x.sev}</span>
            </span>
          ))}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          The engine also recommends a target route for this program:{' '}
          <strong className="text-slate-900">{r.recommendedRoute}</strong>. That recommendation is
          derived from the findings, not from the AI layer — you can see the reasoning in the product.
        </p>
      </section>

      {/* Honest limits */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3">
        <h2 className="text-lg font-black text-amber-900">What this run is not</h2>
        <ul className="space-y-2 text-sm text-amber-900/90 leading-relaxed">
          <li>
            <strong>One file, not a codebase.</strong> It is a single reference program we wrote,
            deliberately dense with legacy patterns. Your ratio will differ — read the file and judge
            for yourself how close it is to what you have.
          </li>
          <li>
            <strong>Synthetic, not a customer system.</strong> We publish it precisely because we can:
            no customer code is involved.
          </li>
          <li>
            <strong>Not a promise about your result.</strong> It is a demonstration of the method and
            of where the boundary sits — nothing more.
          </li>
        </ul>
      </section>

      {/* Download */}
      <section className="rounded-[2rem] bg-slate-900 text-white p-8 space-y-4">
        <h2 className="text-2xl font-black tracking-tight">Check it yourself</h2>
        <p className="text-slate-300 leading-relaxed text-sm">
          The exact file this run used. Load it into the free analysis and compare — that is the whole
          reason it is published.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="/reference-analysis/source"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-slate-950 font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-colors"
          >
            <Download size={14} /> Download {REFERENCE_FILE}
          </a>
          <Link
            href="/"
            className="inline-flex items-center gap-2 border border-white/20 hover:border-white/40 text-white font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-colors"
          >
            Run a free analysis
          </Link>
        </div>
      </section>

      <footer className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-6">
        Produced by Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE}) against catalog{' '}
        <code>{r.catalogVersion}</code>. Every figure on this page is computed from the file at
        request time; none of them is written into the page. Clean-Core.io is not affiliated with, or
        endorsed by, SAP SE.
      </footer>
    </main>
  );
}

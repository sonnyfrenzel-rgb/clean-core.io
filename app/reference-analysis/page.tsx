import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { Download, ArrowLeft } from 'lucide-react';
import { getReferenceAnalysis, REFERENCE_FILE } from '@/lib/reference-analysis';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { jsonLdHtml } from '@/lib/json-ld';
import { categoricalChartColor } from '@/lib/chart-colors';
import type { SeverityValue } from '@/lib/severity';
import { CcSeverity } from '@/components/cc/Identifier';
import { publicButton } from '@/components/landing/public-button';

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

const SEVERITIES: readonly SeverityValue[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];

export default function ReferenceAnalysisPage() {
  const r = getReferenceAnalysis();
  const total = Math.max(1, r.resolved.count + r.decision.count + r.handedBack.count);

  // The split is a chart of buckets, not of states (DESIGN.md §1.8): it takes
  // the categorical palette, and every segment is named by the card below it,
  // which carries the same colour as a dot beside its count.
  const buckets = [r.resolved, r.decision, r.handedBack].map((b, i) => ({ b, color: categoricalChartColor(i) }));

  const bySeverity = SEVERITIES.map((sev) => ({
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
        className="inline-flex items-center gap-2 text-sm font-semibold text-cc-ink-muted underline-offset-4 hover:text-cc-ink hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back to homepage
      </Link>

      <header className="space-y-4">
        <p className="inline-flex items-center rounded-full border border-cc-brand-strong/25 bg-cc-brand-surface px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cc-brand-strong">
          Reproducible reference run
        </p>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] text-cc-ink leading-[1.1] text-balance">
          What one run actually produces
        </h1>
        <p className="text-lg font-medium text-cc-ink-muted leading-relaxed">
          Most claims about tools like this cannot be checked. This one can. Below is a complete run
          over a legacy ABAP program that ships in our repository — every finding, and the split that
          tells you how much of the work the tool takes off your desk.
        </p>
        <p className="text-cc-ink leading-relaxed font-medium">
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
          <div key={x.k} className="rounded-2xl border border-cc-line bg-cc-surface p-5">
            <div className="text-2xl sm:text-3xl font-extrabold tabular-nums text-cc-ink">{x.v}</div>
            <div className="cc-text-label text-cc-ink-muted mt-1">{x.k}</div>
          </div>
        ))}
      </section>

      <p className="text-sm text-cc-ink-muted leading-relaxed -mt-6">
        The analysis itself takes milliseconds. That is not the point, and we do not claim it saves
        you days — what takes time is the decisions, and those stay with you. The point is the split
        below: it tells you which decisions you still have to make.
      </p>

      {/* The split */}
      <section className="space-y-6">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-cc-ink">Where the work lands</h2>

        <div className="flex h-5 w-full overflow-hidden rounded-full border border-cc-line">
          {buckets.map(({ b, color }) => (
            <div
              key={b.label}
              data-chart-segment=""
              className={color.bg}
              style={{ width: `${(b.count / total) * 100}%` }}
              title={`${b.count} ${b.label}`}
            />
          ))}
        </div>

        <div className="space-y-4">
          {buckets.map(({ b, color }) => (
            <div key={b.label} className="flex items-start gap-4 rounded-2xl border border-cc-line bg-cc-surface p-5">
              <span className="shrink-0 inline-flex items-center gap-2 min-w-[3.5rem] h-12 text-2xl font-extrabold tabular-nums text-cc-ink">
                <span aria-hidden="true" data-chart-segment="" className={`h-3 w-3 rounded-full ${color.bg}`} />
                {b.count}
              </span>
              <div>
                <h3 className="font-bold text-cc-ink capitalize">{b.label}</h3>
                <p className="text-sm text-cc-ink-muted leading-relaxed mt-1">{b.meaning}</p>
                {b.label === r.handedBack.label && r.handedBackKinds.length > 0 && (
                  <p className="text-sm text-cc-ink-muted mt-2">
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
        <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-cc-ink">By severity</h2>
        <div className="flex flex-wrap gap-3">
          {bySeverity.filter((x) => x.n > 0).map((x) => (
            <span
              key={x.sev}
              className="inline-flex items-center gap-2 rounded-xl border border-cc-line bg-cc-surface px-4 py-2"
            >
              <span className="text-xl font-extrabold tabular-nums text-cc-ink">{x.n}</span>
              <CcSeverity value={x.sev} />
            </span>
          ))}
        </div>
        <p className="text-sm text-cc-ink-muted leading-relaxed">
          The engine also recommends a target route for this program:{' '}
          <strong className="text-cc-ink">{r.recommendedRoute}</strong>. That recommendation is
          derived from the findings, not from the AI layer — you can see the reasoning in the product.
        </p>
      </section>

      {/* Honest limits */}
      <section className="rounded-2xl border border-cc-warning-border bg-cc-warning-bg p-6 space-y-3">
        <h2 className="text-lg font-extrabold text-cc-warning">What this run is not</h2>
        <ul className="space-y-2 text-sm text-cc-ink leading-relaxed">
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
      <section className="rounded-[28px] border border-cc-line bg-cc-surface p-8 space-y-4 shadow-sm">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-cc-ink">Check it yourself</h2>
        <p className="text-cc-ink-muted leading-relaxed text-sm">
          The exact file this run used. Load it into the free analysis and compare — that is the whole
          reason it is published.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a href="/reference-analysis/source" className={publicButton('primary')}>
            <Download size={16} aria-hidden="true" className="shrink-0" />
            {/* The file name is long; on a phone it wraps inside the pill instead of overflowing it. */}
            <span className="min-w-0 whitespace-normal break-all">Download {REFERENCE_FILE}</span>
          </a>
          <Link href="/" className={publicButton('secondary')}>
            Run a free analysis
          </Link>
        </div>
      </section>

      <footer className="text-xs font-semibold text-cc-ink-muted leading-relaxed border-t border-cc-line pt-6">
        Produced by Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE}) against catalog{' '}
        <code>{r.catalogVersion}</code>. Every figure on this page is computed from the file at
        request time; none of them is written into the page. Clean-Core.io is not affiliated with, or
        endorsed by, SAP SE.
      </footer>
    </main>
  );
}

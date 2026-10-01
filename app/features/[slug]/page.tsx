import Link from 'next/link';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Info, Layers, Globe, Code2, Activity, ShieldCheck, Workflow } from 'lucide-react';
import { publicButton } from '@/components/landing/public-button';
import { FEATURE_SLUGS, getFeature } from '@/lib/features-content';
import { jsonLdHtml } from '@/lib/json-ld';

export const revalidate = 300;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'extensibility-routing': Layers,
  'cloudification-catalog': Globe,
  'rap-cap-engine': Code2,
  'modernization-assessment': Activity,
  'audit-evidence': ShieldCheck,
  'process-blueprints': Workflow,
};

export function generateStaticParams() {
  return FEATURE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = getFeature(slug);
  if (!f) return { title: 'Feature — Clean-Core.io' };
  const url = `https://clean-core.io/features/${f.slug}`;
  return withTwitterCard({
    title: `${f.title} — Clean-Core.io`,
    description: f.summary,
    alternates: { canonical: url },
    openGraph: { title: `${f.title} — Clean-Core.io`, description: f.summary, url, type: 'article' },
  });
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = getFeature(slug);
  if (!f) notFound();

  const Icon = ICONS[f.slug] ?? Layers;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      {/* Back to the feature grid on the landing (same spot you came from) */}
      <Link
        href="/#features"
        className="inline-flex items-center gap-2 text-sm font-semibold text-cc-ink-muted underline-offset-4 hover:text-cc-ink hover:underline transition-colors mb-8"
      >
        <ArrowLeft size={16} /> Back to features
      </Link>

      {/* Hero */}
      <div className="mb-12">
        <div className="w-16 h-16 rounded-2xl bg-cc-brand-surface border border-cc-line shadow-sm flex items-center justify-center mb-6">
          <Icon className="w-8 h-8 text-cc-brand-strong" />
        </div>
        <span className="inline-flex items-center rounded-full border border-cc-brand-strong/25 bg-cc-brand-surface px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cc-brand-strong">{f.eyebrow}</span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-cc-ink tracking-[-0.03em] mt-4 mb-4 leading-tight text-balance">{f.title}</h1>
        <p className="text-lg text-cc-ink-muted font-medium leading-relaxed">{f.summary}</p>
        <span className="inline-flex items-center gap-2 mt-5 px-3 py-1 rounded-full bg-cc-surface border border-cc-field-border text-cc-ink text-xs font-semibold">
          {f.stage}
        </span>
      </div>

      {/* What it is */}
      <section className="mb-10">
        <h2 className="cc-text-label text-cc-ink-muted mb-4">What it is</h2>
        <div className="space-y-4">
          {f.what.map((p, i) => (
            <p key={i} className="text-cc-ink leading-relaxed">{p}</p>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="mb-10">
        <h2 className="cc-text-label text-cc-ink-muted mb-4">What’s possible</h2>
        <ul className="space-y-3">
          {f.capabilities.map((c, i) => (
            <li key={i} className="flex items-start gap-3 bg-cc-surface border border-cc-line rounded-2xl px-5 py-4 shadow-sm">
              <Check className="w-5 h-5 text-cc-ink shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-cc-ink font-medium">{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Honest limitations */}
      <section className="mb-12">
        <h2 className="cc-text-label text-cc-ink-muted mb-4">Honest scope &amp; limitations</h2>
        <ul className="space-y-3">
          {f.limitations.map((l, i) => (
            <li key={i} className="flex items-start gap-3 bg-cc-warning-bg border border-cc-warning-border rounded-2xl px-5 py-4">
              <Info className="w-5 h-5 text-cc-warning shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-cc-ink font-medium">{l}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Related */}
      {f.related.length > 0 && (
        <section className="mb-12">
          <h2 className="cc-text-label text-cc-ink-muted mb-4">Related</h2>
          <div className="flex flex-wrap gap-3">
            {f.related.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className={publicButton('secondary', 'sm')}
              >
                {r.label} <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <div className="rounded-3xl border border-cc-line bg-cc-surface shadow-sm p-8 text-center">
        <p className="text-cc-ink-muted font-medium mb-1">Free · community-built · complementary to your SAP tooling</p>
        <h3 className="text-2xl font-extrabold text-cc-ink tracking-[-0.02em] mb-6">Try it on your own code.</h3>
        <Link
          href="/#access"
          className={publicButton('primary')}
        >
          Get free access <ArrowRight size={16} />
        </Link>
      </div>

      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: f.title,
            description: f.summary,
            url: `https://clean-core.io/features/${f.slug}`,
            isPartOf: { '@type': 'WebSite', name: 'Clean-Core.io', url: 'https://clean-core.io' },
          }),
        }}
      />
    </main>
  );
}

export const dynamicParams = false;

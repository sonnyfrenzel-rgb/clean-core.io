import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Info, Layers, Globe, Cpu, Activity, ShieldCheck, Workflow } from 'lucide-react';
import { FEATURE_SLUGS, getFeature } from '@/lib/features-content';

export const revalidate = 300;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'extensibility-routing': Layers,
  'cloudification-catalog': Globe,
  'rap-cap-engine': Cpu,
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
  return {
    title: `${f.title} — Clean-Core.io`,
    description: f.summary,
    alternates: { canonical: url },
    openGraph: { title: `${f.title} — Clean-Core.io`, description: f.summary, url, type: 'article' },
  };
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
        className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-green-600 transition-colors mb-8"
      >
        <ArrowLeft size={16} /> Back to features
      </Link>

      {/* Hero */}
      <div className="mb-12">
        <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mb-6">
          <Icon className="w-8 h-8 text-green-600" />
        </div>
        <span className="text-[11px] font-black text-green-700 uppercase tracking-widest">{f.eyebrow}</span>
        <h1 className="text-3xl md:text-4xl font-black text-gray-950 tracking-tight mt-2 mb-4 leading-tight">{f.title}</h1>
        <p className="text-lg text-gray-600 font-light leading-relaxed">{f.summary}</p>
        <span className="inline-flex items-center gap-2 mt-5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-bold">
          {f.stage}
        </span>
      </div>

      {/* What it is */}
      <section className="mb-10">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">What it is</h2>
        <div className="space-y-4">
          {f.what.map((p, i) => (
            <p key={i} className="text-gray-700 leading-relaxed">{p}</p>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="mb-10">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">What’s possible</h2>
        <ul className="space-y-3">
          {f.capabilities.map((c, i) => (
            <li key={i} className="flex items-start gap-3 bg-white border border-gray-200/70 rounded-2xl px-5 py-4 shadow-sm">
              <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <span className="text-gray-800 font-medium">{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Honest limitations */}
      <section className="mb-12">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Honest scope &amp; limitations</h2>
        <ul className="space-y-3">
          {f.limitations.map((l, i) => (
            <li key={i} className="flex items-start gap-3 bg-amber-50/60 border border-amber-200/70 rounded-2xl px-5 py-4">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-amber-900 font-medium">{l}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Related */}
      {f.related.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Related</h2>
          <div className="flex flex-wrap gap-3">
            {f.related.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-100 rounded-full px-4 py-2 transition-colors"
              >
                {r.label} <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-8 text-center">
        <p className="text-gray-600 font-medium mb-1">Free · community-built · complementary to your SAP tooling</p>
        <h3 className="text-2xl font-black text-gray-950 tracking-tight mb-6">Try it on your own code.</h3>
        <Link
          href="/#access"
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-black px-8 py-4 rounded-2xl uppercase tracking-widest text-sm transition-colors"
        >
          Get free access <ArrowRight size={16} />
        </Link>
      </div>

      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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

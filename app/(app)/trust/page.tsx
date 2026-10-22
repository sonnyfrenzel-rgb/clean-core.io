import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { ShieldCheck, Lock, MapPin, Trash2, FileCheck2, Server, Network, Route, Cable, type LucideIcon } from 'lucide-react';
import BackLink from '@/components/BackLink';
import { APP_VERSION } from '@/lib/version';
import { legalBlocks, type LegalBlock } from '@/lib/legal/markup';
import { TRUST_EN, TRUST_INTRO_EN } from '@/lib/legal/texts/trust.en';
import { LegalBlockList } from '@/components/legal/LegalDocument';

/**
 * The trust page — Fassung 1.1 of the legal texts (3.0.21).
 *
 * The words are in `lib/legal/texts/trust.en.ts`, written and gated with the
 * privacy policy and the Terms (`tests/legal-texts-release-gate.spec.ts`);
 * this page draws one card per section and picks its icon by the anchor.
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Trust & Privacy — Clean-Core.io',
  description:
    'How Clean-Core.io handles your data: EU-hosted primary storage and compute, encrypted credentials, disclosed processors, GDPR rights and self-erasure.',
  alternates: { canonical: 'https://clean-core.io/trust' },
  openGraph: {
    title: 'Trust & Privacy — Clean-Core.io',
    description:
      'EU-hosted primary storage and compute, encrypted credentials, server-authoritative evidence, disclosed processors, and your GDPR rights. Transparency for individual architects, developers and decision-makers.',
    url: 'https://clean-core.io/trust',
    type: 'website',
  },
});

const ICONS: Record<string, LucideIcon> = {
  'data-residency': MapPin,
  'code-destinations': Route,
  's4-connection': Cable,
  encryption: Lock,
  evidence: FileCheck2,
  processors: Network,
  security: ShieldCheck,
  'your-rights': Trash2,
  operations: Server,
};

function sections(blocks: LegalBlock[]) {
  const out: { id: string; title: string; body: LegalBlock[] }[] = [];
  for (const b of blocks) {
    if (b.kind === 'heading' && b.level === 2) out.push({ id: b.id ?? '', title: b.text, body: [] });
    else if (out.length) out[out.length - 1].body.push(b);
  }
  return out;
}

export default function TrustPage() {
  const intro = legalBlocks(TRUST_INTRO_EN, 'en');
  return (
    <main className="max-w-3xl mx-auto px-6 py-12" data-trust-page="">
      <BackLink />
      <p className="text-xs font-bold tracking-widest text-cc-brand-strong uppercase mb-2 mt-4">Trust &amp; Privacy</p>
      <h1 className="text-3xl md:text-4xl font-extrabold text-cc-ink tracking-tight mb-3">How we handle your data</h1>
      <div className="text-cc-ink-muted leading-relaxed mb-8">
        <LegalBlockList blocks={intro} />
        <p className="text-sm">(Reflects {APP_VERSION}.)</p>
      </div>

      {sections(legalBlocks(TRUST_EN, 'en')).map((s) => {
        const Icon = ICONS[s.id] ?? ShieldCheck;
        return (
          <section
            key={s.id}
            id={s.id}
            data-trust-section={s.id}
            className="bg-cc-surface border border-cc-line rounded-2xl p-6 mb-6 scroll-mt-20"
          >
            <h2 className="flex items-center gap-3 text-lg font-extrabold text-cc-ink mb-3">
              <span className="bg-cc-brand-strong p-2 rounded-xl shrink-0">
                <Icon className="w-5 h-5 text-cc-on-dark" aria-hidden="true" />
              </span>
              {s.title}
            </h2>
            <div className="text-sm text-cc-ink-muted leading-relaxed">
              <LegalBlockList blocks={s.body} compact />
            </div>
          </section>
        );
      })}
    </main>
  );
}

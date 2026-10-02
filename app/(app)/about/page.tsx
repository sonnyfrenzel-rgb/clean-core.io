import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { Globe, ShieldCheck, Server, Users, Linkedin, Github } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import { publicButton } from '@/components/landing/public-button';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = withTwitterCard({
  title: 'About Clean-Core.io — Built by Felix Frenzel | SAP Modernization',
  description: 'Clean-Core.io is a free community-powered SAP modernization tool built by Felix Frenzel — born from first-hand experience with an S/4HANA transformation, for the SAP community.',
  alternates: {
    canonical: 'https://clean-core.io/about',
  },
  openGraph: {
    title: 'About Clean-Core.io — Built by Felix Frenzel | SAP Modernization',
    description: 'Clean-Core.io is a free community-powered SAP modernization tool built by Felix Frenzel — born from first-hand experience with an S/4HANA transformation, for the SAP community.',
    url: 'https://clean-core.io/about',
    type: 'website',
  }
});

const trustCards = [
  {
    icon: Globe,
    title: 'European Hosting',
    description: 'Hosting (Cloud Run) and the database (Firestore) run in the GCP europe-west1 (Belgium) region. The sign-in, Firebase Authentication, is a Google service not tied to a region. The Gemini API and the mail provider are separate subprocessors, listed in the privacy policy.',
  },
  {
    icon: Server,
    title: 'Workspace Isolation',
    description: 'Your code is stored in your secure project workspace and can be permanently deleted at any time.',
  },
  {
    icon: ShieldCheck,
    title: 'GDPR-aligned',
    description: 'Art. 17 GDPR erasure rights via the settings dashboard; EU-hosted storage.',
  },
  {
    icon: Users,
    title: 'Community-Driven',
    description: 'Free to use, free forever. Built for the community, by someone who needed it.',
  },
];

export default function AboutPage() {
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Felix Frenzel",
    "jobTitle": "Founder & Community Builder",
    "url": "https://clean-core.io/about",
    "sameAs": [
      "https://www.linkedin.com/in/felix-frenzel-3327741b8/",
      "https://github.com/sonnyfrenzel-rgb"
    ]
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 min-h-screen text-cc-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Hero Banner */}
      <div className="bg-cc-surface rounded-3xl p-8 sm:p-12 border border-cc-line">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-cc-brand-surface border border-cc-brand px-4 py-1 rounded-full text-xs font-bold text-cc-brand-strong tracking-wide uppercase">
            <Users size={14} aria-hidden="true" /> About the Project
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-none text-cc-ink">
            About Clean-<span className="text-cc-brand-strong">Core.io</span>
          </h1>
          <p className="text-lg text-cc-ink-muted leading-relaxed max-w-2xl font-medium">
            A free, community-powered Modernization Platform for SAP architects and developers.
          </p>
        </div>
      </div>

      {/* Section 1: The Mission */}
      <section className="space-y-4">
        <h2 className="text-3xl font-extrabold tracking-tight text-cc-ink">
          The Mission
        </h2>
        <p className="text-cc-ink-muted leading-relaxed font-medium max-w-3xl">
          Clean-Core.io exists to solve one of the hardest problems in the SAP ecosystem: transforming decades of custom ABAP code into cloud-compliant architectures. Instead of replacing the expert, we hand them something to start from — a first draft aimed at Clean Core, with the evidence behind it, for review and approval. We do not claim it saves you days: what takes time is the decisions, and those stay with you.
        </p>
      </section>

      {/* Section 2: Built by Felix Frenzel */}
      <section className="space-y-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-cc-ink">
          Built by Felix Frenzel
        </h2>
        <div className="bg-cc-surface border border-cc-line rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Avatar */}
            <div aria-hidden="true" className="w-20 h-20 rounded-2xl bg-cc-brand-strong flex items-center justify-center text-cc-on-dark text-2xl font-extrabold shrink-0">
              FF
            </div>
            {/* Info */}
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="text-xl font-extrabold text-cc-ink tracking-tight">Felix Frenzel</h3>
                <p className="text-sm font-bold text-cc-brand-strong mt-1">Founder — Clean-Core.io</p>
              </div>
              <p className="text-cc-ink-muted leading-relaxed font-medium text-sm">
                Felix is personally affected by an S/4HANA transformation and built Clean-Core.io out of that first-hand experience. What started as a tool to solve his own challenges quickly grew into a free resource for the entire SAP community — helping others navigate Clean Core compliance, legacy code modernization, and the complexity of S/4HANA migrations.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <a
                  href="https://www.linkedin.com/in/felix-frenzel-3327741b8/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={publicButton('ghost', 'sm')}
                >
                  <Linkedin size={16} aria-hidden="true" /> LinkedIn
                </a>
                <a
                  href="https://github.com/sonnyfrenzel-rgb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={publicButton('ghost', 'sm')}
                >
                  <Github size={16} aria-hidden="true" /> GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Technology & Trust */}
      <section className="space-y-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-cc-ink">
          Technology & Trust
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {trustCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="bg-cc-surface border border-cc-line rounded-3xl p-6 space-y-3"
              >
                <div className="w-12 h-12 bg-cc-brand-surface border border-cc-brand rounded-xl flex items-center justify-center text-cc-brand-strong">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <h3 className="text-lg font-extrabold text-cc-ink tracking-tight">{card.title}</h3>
                <p className="text-sm font-medium text-cc-ink-muted leading-relaxed">{card.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <div className="bg-cc-brand-surface border border-cc-line rounded-3xl p-8 sm:p-10 text-center space-y-4">
        <h2 className="text-2xl font-extrabold text-cc-ink tracking-tight">Ready to modernize your ABAP landscape?</h2>
        <p className="text-cc-ink-muted font-medium text-sm max-w-lg mx-auto">
          Join the community and start transforming legacy code into clean, cloud-ready architectures.
        </p>
        <Link
          href="/?auth=signup"
          className={publicButton('primary')}
        >
          Get Started for Free
        </Link>
      </div>

      {/* Footer Disclaimer */}
      <div className="text-center text-xs text-cc-ink-muted font-cc-mono font-bold uppercase tracking-wider pt-10 border-t border-cc-line">
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Edition
      </div>
    </div>
  );
}

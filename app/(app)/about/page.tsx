import type { Metadata } from 'next';
import { Globe, ShieldCheck, Server, Users, Linkedin, Github } from 'lucide-react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
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
};

const trustCards = [
  {
    icon: Globe,
    title: 'European Hosting',
    description: 'All infrastructure runs in the GCP europe-west1 (Belgium) region.',
  },
  {
    icon: Server,
    title: 'Stateless Processing',
    description: 'Your code is processed in-memory and never persisted on our servers.',
  },
  {
    icon: ShieldCheck,
    title: 'GDPR Compliant',
    description: 'Full Art. 17 GDPR erasure rights via the settings dashboard.',
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackButton />
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <Users size={14} /> About the Project
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            About Clean-<span className="text-green-400">Core.io</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            A free, community-powered Modernization Platform for SAP architects and developers.
          </p>
        </div>
      </div>

      {/* Section 1: The Mission */}
      <section className="space-y-4">
        <h2 className="text-3xl font-black tracking-tight text-gray-955">
          The Mission
        </h2>
        <p className="text-gray-700 leading-relaxed font-medium max-w-3xl">
          Clean-Core.io exists to solve one of the most expensive problems in the SAP ecosystem: transforming decades of custom ABAP code into cloud-compliant architectures. Instead of replacing the expert, we accelerate their work — generating the first Clean-Core-compliant draft for review and approval, saving days of manual mapping and boilerplate generation.
        </p>
      </section>

      {/* Section 2: Built by Felix Frenzel */}
      <section className="space-y-6">
        <h2 className="text-3xl font-black tracking-tight text-gray-955">
          Built by Felix Frenzel
        </h2>
        <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-green-200 shrink-0">
              FF
            </div>
            {/* Info */}
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="text-xl font-black text-gray-950 tracking-tight">Felix Frenzel</h3>
                <p className="text-sm font-bold text-green-600 mt-0.5">Founder — Clean-Core.io</p>
              </div>
              <p className="text-gray-700 leading-relaxed font-medium text-sm">
                Felix is personally affected by an S/4HANA transformation and built Clean-Core.io out of that first-hand experience. What started as a tool to solve his own challenges quickly grew into a free resource for the entire SAP community — helping others navigate Clean Core compliance, legacy code modernization, and the complexity of S/4HANA migrations.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <a
                  href="https://www.linkedin.com/in/felix-frenzel-3327741b8/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-blue-600 bg-white px-4 py-2.5 rounded-xl border border-gray-200 hover:border-blue-200 transition-all shadow-sm"
                >
                  <Linkedin size={16} /> LinkedIn
                </a>
                <a
                  href="https://github.com/sonnyfrenzel-rgb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 bg-white px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-400 transition-all shadow-sm"
                >
                  <Github size={16} /> GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Technology & Trust */}
      <section className="space-y-6">
        <h2 className="text-3xl font-black tracking-tight text-gray-955">
          Technology & Trust
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {trustCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="bg-white border border-gray-200 rounded-[2rem] p-6 space-y-3 hover:shadow-md hover:border-green-200 transition-all"
              >
                <div className="w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-black text-gray-950 tracking-tight">{card.title}</h3>
                <p className="text-sm font-medium text-gray-600 leading-relaxed">{card.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <div className="bg-slate-50 border border-gray-200 rounded-[2.5rem] p-8 sm:p-10 text-center space-y-4">
        <h2 className="text-2xl font-black text-gray-955 tracking-tight">Ready to modernize your ABAP landscape?</h2>
        <p className="text-gray-600 font-medium text-sm max-w-lg mx-auto">
          Join the community and start transforming legacy code into clean, cloud-ready architectures.
        </p>
        <Link
          href="/?auth=signup"
          className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-md transition-all text-sm"
        >
          Get Started for Free
        </Link>
      </div>

      {/* Footer Disclaimer */}
      <div className="text-center text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider pt-10 border-t border-gray-200">
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Pilot
      </div>
    </div>
  );
}

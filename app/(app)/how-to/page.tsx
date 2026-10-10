import { jsonLdHtml } from '@/lib/json-ld';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import HowToClient from '@/components/HowToClient';
import { publicButton } from '@/components/landing/public-button';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { HOW_TO_DESCRIPTION, HOW_TO_META_DESCRIPTION, howToSteps } from '@/lib/how-to-content';

// Server-side Metadata configuration for SEO & GEO Crawlers
export const metadata: Metadata = withTwitterCard({
  title: 'SAP S/4HANA Clean Core Modernization Guide | Clean-Core.io',
  description: HOW_TO_META_DESCRIPTION,
  alternates: {
    canonical: 'https://clean-core.io/how-to',
  },
  openGraph: {
    title: 'SAP S/4HANA Clean Core Modernization Guide | Clean-Core.io',
    description: HOW_TO_META_DESCRIPTION,
    url: 'https://clean-core.io/how-to',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
});

export default function HowToPage() {
  // Roadmap 0.2, UX-102. The steps used to be a list of their own here — six
  // phases in another order, promising Node.js on both tracks — and search
  // engines were handed that list as the product's workflow. Order, count and
  // titles now come from PHASES, the words from lib/how-to-content.ts, and the
  // walkthrough below reads the same module.
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "SAP S/4HANA Clean Core Modernization Guide",
    "description": HOW_TO_DESCRIPTION,
    "step": howToSteps().map((step) => ({
      "@type": "HowToStep",
      "position": step.n,
      "name": step.title,
      "text": step.summary
    }))
  };

  return (
    <div data-how-to-page className="space-y-10 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      
      {/* HowTo JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(howToSchema) }}
      />

      {/* UX-015/UX-104: this page is public and in the sitemap, so the way back
          cannot be a hard link to /dashboard. See components/BackLink.tsx. */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Header card */}
      <div className="bg-cc-surface rounded-3xl p-8 sm:p-12 border border-cc-line">
        <div className="max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 bg-cc-brand-surface border border-cc-brand px-4 py-1 rounded-full text-xs font-bold text-cc-brand-strong tracking-wide uppercase">
              <BookOpen size={14} aria-hidden="true" /> How-to Tutorials
            </div>
            <div className="inline-flex items-center gap-2 bg-cc-surface-muted border border-cc-line px-4 py-1 rounded-full text-xs font-bold text-cc-ink-muted tracking-wide uppercase">
              Version {APP_VERSION} ({APP_RELEASE_DATE})
            </div>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-none text-cc-ink">
            Clean-Core.io <span className="text-cc-brand-strong">How-to</span>
          </h1>
          <p className="text-lg text-cc-ink-muted leading-relaxed max-w-2xl font-medium">
            {HOW_TO_DESCRIPTION}
          </p>
        </div>
      </div>

      {/* This page explains what the platform is and why. Anyone who is already
          convinced and just wants to be told which button to press belongs on
          /first-run instead, so send them there before the narrated tour. */}
      <div className="bg-cc-surface rounded-3xl">
        <Link
          href="/first-run"
          className="block border border-cc-line rounded-3xl p-6 sm:p-8 hover:border-cc-brand transition-colors group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
            <div>
              <span className="cc-text-label text-cc-brand-strong">
                Just want to get started?
              </span>
              <h2 className="text-2xl font-extrabold text-cc-ink tracking-tight mt-2 mb-2">
                Your first run, click by click
              </h2>
              <p className="text-sm text-cc-ink-muted leading-relaxed max-w-2xl">
                Seven steps from signing in to a downloadable package, in about fifteen minutes. No SAP
                connection and no code of your own needed &mdash; there are ready-made examples on the
                dashboard.
              </p>
            </div>
            <span className={`${publicButton('primary')} shrink-0`}>
              Open the step-by-step guide
            </span>
          </div>
        </Link>
      </div>

      {/* Client-side Slideshow Component */}
      <HowToClient />

    </div>
  );
}

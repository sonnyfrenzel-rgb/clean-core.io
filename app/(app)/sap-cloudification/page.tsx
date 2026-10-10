import { jsonLdHtml } from '@/lib/json-ld';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { Cloud, Database, Route, ShieldCheck, Check, GitBranch, Layers } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import { getFacts } from '@/lib/facts';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { publicButton } from '@/components/landing/public-button';
import { BTP, BTP_FIRST } from '@/lib/sap-naming';

export const metadata: Metadata = withTwitterCard({
  title: 'SAP Cloudification: How to Cloudify ABAP | Clean-Core.io',
  description:
    'What it means to cloudify SAP custom ABAP: off unreleased objects, onto released APIs. SAP has its own repository viewer; ours adds level A–D.',
  alternates: {
    canonical: 'https://clean-core.io/sap-cloudification',
  },
  openGraph: {
    title: 'SAP Cloudification: How to Cloudify ABAP | Clean-Core.io',
    description:
      'Free lookup against SAP’s official Cloudification Repository — for an object it lists, the released S/4HANA successor or an honest “no released path” verdict. Plus what cloudification means for Clean Core.',
    url: 'https://clean-core.io/sap-cloudification',
    type: 'website',
  },
});

const faqs = [
  {
    question: 'What is SAP cloudification?',
    answer:
      `SAP cloudification is the process of making custom ABAP cloud-ready for S/4HANA: replacing direct access to standard tables and unreleased objects with SAP-released APIs and CDS views, and moving logic to a clean-core-compliant model — in-app ABAP Cloud (RAP) or side-by-side CAP on ${BTP_FIRST}. The goal is a decoupled extension layer, so future upgrades stay clean.`,
  },
  {
    question: 'How do you cloudify SAP custom code?',
    answer:
      `Assess each object your code touches against SAP’s released-object contract, replace unreleased calls with their released successors (OData/CDS/RAP BOs), and route the remaining logic to the right target: in-app ABAP Cloud (RAP) where it belongs on the core, or a decoupled side-by-side CAP service on ${BTP_FIRST} where it does not. Objects with no released path are re-architected, not force-fit. Clean-Core.io automates the assessment and drafts the first compliant version for an architect to review.`,
  },
  {
    question: 'Is “SAP Cloudify” an official SAP product?',
    answer:
      'No. There is no SAP product literally named “Cloudify.” “Cloudify” / “cloudification” is the informal verb for making SAP custom code cloud-ready and clean-core-compliant. The concrete reference dataset SAP publishes for it is the SAP Cloudification Repository, which maps thousands of legacy objects to their released successors and also backs the SAP ABAP Test Cockpit (ATC) clean-core checks.',
  },
  {
    question: 'What is the SAP Cloudification Repository?',
    answer:
      'The SAP Cloudification Repository is SAP’s public dataset that maps classic ABAP objects (tables, function modules, classes) to their released S/4HANA successors — the same source that backs ATC’s clean-core checks. Clean-Core.io syncs it weekly and layers curated field-level mappings on top, so an object lookup returns a released successor with its source layer and confidence.',
  },
  {
    question: 'Does cloudification mean rewriting everything?',
    answer:
      'No. Most custom code is decoupled rather than rewritten from scratch: direct table reads are re-pointed to released CDS views or OData APIs, and only genuinely coupled logic is re-implemented in RAP or moved side-by-side to CAP. Objects that truly have no released path are flagged for re-architecture — an honest limitation, surfaced as evidence, not silently ignored.',
  },
];

/**
 * The public knowledge-page look (block D, D.23a): `--cc-*` tokens instead of
 * the palette, nothing heavier than 800, nothing under 11 px, the generous
 * public radii (DESIGN.md §1.4, ADR-051). The hero is light with the landing
 * page's mesh at .18 — the dark gradient banner it replaces was a surface the
 * product does not have.
 */
const PAGE = 'mx-auto max-w-5xl space-y-12 px-4 py-10 text-cc-ink sm:px-6';
const HERO = 'relative overflow-hidden rounded-3xl border border-cc-line bg-cc-surface p-8 shadow-cc sm:p-12';
const HERO_MESH =
  'radial-gradient(38% 42% at 10% 12%,var(--cc-seq-3) 0%,transparent 70%),radial-gradient(34% 40% at 90% 10%,var(--cc-brand) 0%,transparent 70%),radial-gradient(46% 40% at 55% 62%,var(--cc-chart-3) 0%,transparent 72%)';
const EYEBROW =
  'inline-flex items-center gap-2 rounded-full border border-cc-line bg-cc-brand-surface px-4 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cc-brand-strong';
const H1 = 'text-4xl font-extrabold leading-none tracking-[-0.035em] text-cc-ink sm:text-6xl';
const H2 = 'text-3xl font-extrabold tracking-[-0.03em] text-cc-ink';
const H3 = 'text-lg font-bold text-cc-ink';
const BODY = 'font-medium leading-relaxed text-cc-ink';
const STEP_ICON =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cc-line bg-cc-brand-surface text-cc-brand-strong';
const STEP_TEXT = 'mt-1 text-sm font-medium text-cc-ink-muted';
const CHECK = 'shrink-0 text-cc-brand-strong';
const CHECK_TOP = 'mt-1 shrink-0 text-cc-brand-strong';
const SIDE_CARD = 'rounded-3xl border border-cc-line p-6';
const SIDE_TITLE = 'text-lg font-bold text-cc-ink';
const SIDE_LIST = 'space-y-3 text-sm font-semibold text-cc-ink';
const SIDE_LABEL = 'cc-text-label text-cc-ink-muted';
const LINK =
  'font-semibold text-cc-brand-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus';
const SIDE_LINK = `block ${LINK}`;
const FAQ_BOX = 'space-y-6 rounded-3xl border border-cc-line bg-cc-surface-muted p-8';
const FAQ_TITLE = 'text-2xl font-extrabold text-cc-ink';
const FOOTER_LINE =
  'border-t border-cc-line pt-10 text-center font-cc-mono text-xs font-semibold uppercase tracking-wider text-cc-ink-muted';

export default function SapCloudificationPage() {
  // Roadmap 0.2 (`UX-E14-F01:R0`): lib/facts.ts is the only source for this
  // figure now — the `23,000+` fallback that used to sit here is gone, not just
  // hidden from the markup. `objectCount` can only be zero if both generated
  // catalog artifacts were empty, which cannot happen with the files committed
  // to this repo; the fallback names the gap honestly rather than reprinting a
  // number nobody measured.
  const facts = getFacts();
  const classified = facts.objectCount > 0
    ? facts.objectCount.toLocaleString('en-US')
    : 'an unavailable count of';

  const schemaJson = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <div className={PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(schemaJson) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Hero Banner */}
      <div className={HERO}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: HERO_MESH }} />
        <div className="relative max-w-4xl space-y-6">
          <div className={EYEBROW}>
            <Cloud size={14} aria-hidden="true" /> Clean Core Transition
          </div>
          <h1 className={H1}>
            SAP <span className="text-cc-brand-strong">Cloudification</span>
          </h1>
          <p className="max-w-2xl text-lg font-medium leading-relaxed text-cc-ink-muted">
            How to cloudify custom ABAP: move legacy code off unreleased objects onto released S/4HANA
            APIs, aligned with SAP Clean Core. Grounded in SAP&apos;s official Cloudification Repository.
          </p>
        </div>
      </div>

      {/*
        Search demand for this page is a tool query -- "cloudification repository
        viewer", "sap cloudification repository". It ranked at position 8 and drew
        0.11% CTR over three months because it reads as an article. The lookup it
        promises lives at /catalog, so that entry point belongs above the fold,
        not as an inline link halfway down a three-step explanation.
      */}
      {/* The card's surface sits on a wrapper: the link is a card, not one of the four buttons of §1.5. */}
      <div className="rounded-3xl bg-cc-surface">
        <Link
          href="/catalog"
          className="group flex flex-col gap-4 rounded-3xl border-2 border-cc-brand-strong/30 p-6 shadow-cc transition-colors hover:border-cc-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus sm:flex-row sm:items-center sm:gap-6 sm:p-8"
        >
          <div className="w-fit shrink-0 rounded-2xl border border-cc-line bg-cc-brand-surface p-4 text-cc-brand-strong">
            <Database size={28} aria-hidden="true" />
          </div>
          <div className="flex-1 space-y-1">
            <h2 className="text-xl font-extrabold tracking-tight text-cc-ink sm:text-2xl">
              Look up an object in the Cloudification Repository
            </h2>
            <p className="text-sm font-medium leading-relaxed text-cc-ink-muted">
              Enter an SAP standard object &mdash; VBAK, BSEG, MARA &mdash; and, where the repository
              lists it, get its released S/4HANA successor or an honest &ldquo;no released path&rdquo; verdict.
              {facts.objectCount > 0 ? ` ${classified} classified objects.` : ''} Free, no sign-up.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-cc-brand-strong transition-all group-hover:gap-3">
            Open the viewer <Route size={16} aria-hidden="true" />
          </span>
        </Link>
      </div>

      {/* GEO Quick Answer Block */}
      <QuickAnswer
        question="What does it mean to cloudify SAP custom code?"
        answer={`Cloudifying SAP means making custom ABAP cloud-ready for S/4HANA: replacing direct access to standard tables and unreleased objects with SAP-released APIs and CDS views, and rewriting logic either in-app in ABAP Cloud (RAP) or side-by-side CAP on ${BTP_FIRST}. It follows SAP's Clean Core principle so extensions stay decoupled from the digital core and upgrades stay clean. There is no single SAP product called 'Cloudify'; the reference dataset that drives it is SAP's public Cloudification Repository, which maps legacy objects to their released successors.`}
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-8 pt-4 md:grid-cols-3">
        {/* Left 2 Columns: Text content */}
        <div className="space-y-8 md:col-span-2">
          <section className="space-y-4">
            <h2 className={H2}>
              What is SAP cloudification?
            </h2>
            <p className={BODY}>
              <strong>Cloudification</strong> is the work of making custom SAP ABAP cloud-ready — aligning
              it with SAP&apos;s <strong>Clean Core</strong> extensibility model so the digital core stays
              standard and upgradeable. In practice, it means replacing direct reads and writes on standard
              tables (VBAK, BSEG, LIKP…) and calls to unreleased objects with <strong>SAP-released APIs</strong>,
              CDS views and RAP business objects.
            </p>
            <p className={BODY}>
              Logic that legitimately belongs on the core is rebuilt <strong>in-app in ABAP Cloud (RAP)</strong>;
              logic that does not is decoupled into a <strong>side-by-side CAP service on {BTP}</strong>. The
              result is an extension layer that survives S/4HANA upgrades instead of breaking on them.
            </p>
          </section>

          {/* Honest disambiguation — good for trust and AI answer engines */}
          <div className="rounded-3xl border border-cc-line bg-cc-surface-muted p-6">
            <span className={SIDE_LABEL}>
              A note on the term
            </span>
            <p className="mt-2 font-medium leading-relaxed text-cc-ink">
              There is no SAP product literally called <strong>&ldquo;Cloudify&rdquo;</strong>. &ldquo;Cloudify SAP&rdquo;
              and &ldquo;SAP cloudification&rdquo; are informal names for making custom code cloud-ready and
              clean-core-compliant. The concrete asset SAP publishes for it is the{' '}
              <strong>SAP Cloudification Repository</strong> — the released-successor dataset that also backs
              SAP ATC’s clean-core checks. SAP publishes its own{' '}
              <a href="https://sap.github.io/abap-atc-cr-cv-s4hc/" target="_blank" rel="noopener noreferrer" className={LINK}>
                Cloudification Repository viewer
              </a>
              ; the <Link href="/catalog" className={LINK}>catalog here</Link> reads the same data and adds the clean
              core level A–D and a page for each object.
            </p>
          </div>

          <section className="space-y-4">
            <h2 className={H2}>
              How to cloudify SAP custom code
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className={STEP_ICON}>
                  <ShieldCheck size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className={H3}>1. Assess the custom code</h3>
                  <p className={STEP_TEXT}>
                    Run a deterministic{' '}
                    <Link href="/abap-custom-code-analysis" className={LINK}>
                      ABAP static code analysis
                    </Link>{' '}
                    to inventory the standard objects your code names statically and flag risky table access,
                    unreleased calls and modifications — as line-level evidence. A target computed at
                    runtime cannot be named this way; the analysis lists such dynamic calls as not assessed.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className={STEP_ICON}>
                  <Database size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className={H3}>2. Map objects to released successors</h3>
                  <p className={STEP_TEXT}>
                    Each object is resolved against SAP&apos;s{' '}
                    <Link href="/catalog" className={LINK}>
                      Cloudification Repository
                    </Link>{' '}
                    ({classified} classified objects) plus curated field-level mappings — returning the
                    released OData/CDS successor, or an honest &ldquo;no released path&rdquo; verdict.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className={STEP_ICON}>
                  <Route size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className={H3}>3. Route: in-app RAP vs side-by-side CAP</h3>
                  <p className={STEP_TEXT}>
                    Based on the degree of coupling, the router recommends rewriting the logic in-app in
                    ABAP Cloud (RAP) or decoupling it as a side-by-side service on {BTP} (Node.js CAP) —
                    a recommendation for a qualified architect to sign off.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className={STEP_ICON}>
                  <GitBranch size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className={H3}>4. Draft the target version + evidence</h3>
                  <p className={STEP_TEXT}>
                    The model drafts a RAP or CAP version aimed at Clean Core — on the RAP route with a
                    multi-file abapGit export and ABAP-Unit tests, on the CAP route with Node.js code and a
                    TypeScript test suite — plus a signed audit evidence pack. Nothing validates the draft for
                    you: it is a starting point to review, never a production-ready deliverable.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={H2}>
              What blocks cloudification
            </h2>
            <p className={BODY}>
              Not every object has a clean path. The assessment is honest about what cannot simply be
              re-pointed:
            </p>
            <ul className="space-y-2 font-medium text-cc-ink">
              <li className="flex gap-2"><Check className={CHECK_TOP} size={16} aria-hidden="true" /> <span><strong>Objects with no released successor</strong> — flagged for re-architecture (e.g. a side-by-side extension), not force-fit to a fake mapping.</span></li>
              <li className="flex gap-2"><Check className={CHECK_TOP} size={16} aria-hidden="true" /> <span><strong>Modifications, implicit enhancements and native SQL</strong> — the not-recommended patterns that break on upgrade.</span></li>
              <li className="flex gap-2"><Check className={CHECK_TOP} size={16} aria-hidden="true" /> <span><strong>Dynamic ABAP, Dynpro / classic UI and BDC flows</strong> — need manual redesign rather than an automated lift-and-shift.</span></li>
            </ul>
            <p className={BODY}>
              Clean-Core.io is a free community tool that accelerates this assessment — complementary to
              SAP ADT and ATC, which remain the authoritative checks.
            </p>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className={`${SIDE_CARD} space-y-6 bg-cc-surface-muted`}>
            <h3 className={SIDE_TITLE}>
              From the Cloudification Repository
            </h3>
            <ul className={SIDE_LIST}>
              <li className="flex items-center gap-2">
                <Layers className={CHECK} size={16} aria-hidden="true" /> {classified} classified SAP objects
              </li>
              <li className="flex items-center gap-2">
                <Check className={CHECK} size={16} aria-hidden="true" /> Released successors, source-attributed
              </li>
              <li className="flex items-center gap-2">
                <Check className={CHECK} size={16} aria-hidden="true" /> Weekly auto-synced &amp; versioned
              </li>
              <li className="flex items-center gap-2">
                <Check className={CHECK} size={16} aria-hidden="true" /> Same source that backs SAP ATC
              </li>
            </ul>
            <div className="border-t border-cc-line pt-4">
              <Link href="/?auth=signup" className={`${publicButton('primary')} w-full`}>
                Cloudify for Free
              </Link>
            </div>
          </div>

          <div className={`${SIDE_CARD} space-y-4 bg-cc-surface`}>
            <h3 className={SIDE_LABEL}>Related Topics</h3>
            <div className="space-y-2 text-sm">
              <Link href="/abap-custom-code-analysis" className={SIDE_LINK}>
                → ABAP Static Code Analysis
              </Link>
              <Link href="/sap-clean-core-object-classification" className={SIDE_LINK}>
                → Clean Core Object Classification (A–D)
              </Link>
              <Link href="/clean-core-score" className={SIDE_LINK}>
                → What is the Clean Core Score?
              </Link>
              <Link href="/knowledge" className={SIDE_LINK}>
                → SAP Clean Core guide (RAP vs CAP)
              </Link>
              <Link href="/catalog" className={SIDE_LINK}>
                → Browse the SAP object catalog
              </Link>
            </div>
          </div>

          <div className={`${SIDE_CARD} space-y-4 bg-cc-surface`}>
            <h3 className={SIDE_LABEL}>Further reading</h3>
            <a
              href="https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956"
              target="_blank"
              rel="noopener noreferrer"
              className={`${SIDE_LINK} text-sm`}
            >
              → Clean Core Levels A–D: how to classify your custom ABAP (SAP Community) ↗
            </a>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className={FAQ_BOX}>
        <h2 className={FAQ_TITLE}>Frequently Asked Questions (FAQ)</h2>
        <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2">
          {faqs.map((faq, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="font-bold text-cc-ink">{faq.question}</h3>
              <p className="font-medium leading-relaxed text-cc-ink-muted">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className={FOOTER_LINE}>
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Edition
      </div>
    </div>
  );
}

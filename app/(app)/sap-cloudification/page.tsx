import type { Metadata } from 'next';
import { ArrowLeft, Cloud, Database, Route, ShieldCheck, Check, GitBranch, Layers } from 'lucide-react';
import Link from 'next/link';
import QuickAnswer from '@/components/QuickAnswer';
import { getCatalogStats } from '@/lib/abap/catalog-service';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'SAP Cloudification: How to Cloudify Custom ABAP to Clean Core | Clean-Core.io',
  description:
    'What it means to cloudify SAP: move custom ABAP off unreleased objects onto released S/4HANA APIs (RAP) or side-by-side BTP CAP, aligned with SAP Clean Core. Map any object to its released successor via SAP’s Cloudification Repository — free.',
  alternates: {
    canonical: 'https://clean-core.io/sap-cloudification',
  },
  openGraph: {
    title: 'SAP Cloudification: How to Cloudify Custom ABAP to Clean Core | Clean-Core.io',
    description:
      'What it means to cloudify SAP custom code: replace unreleased objects with released S/4HANA APIs, aligned with SAP Clean Core. Grounded in SAP’s official Cloudification Repository.',
    url: 'https://clean-core.io/sap-cloudification',
    type: 'website',
  },
};

const faqs = [
  {
    question: 'What is SAP cloudification?',
    answer:
      'SAP cloudification is the process of making custom ABAP cloud-ready for S/4HANA: replacing direct access to standard tables and unreleased objects with SAP-released APIs and CDS views, and moving logic to a clean-core-compliant model — in-app ABAP Cloud (RAP) or side-by-side on SAP BTP (CAP). The goal is a decoupled extension layer, so future upgrades stay clean.',
  },
  {
    question: 'How do you cloudify SAP custom code?',
    answer:
      'Assess each object your code touches against SAP’s released-object contract, replace unreleased calls with their released successors (OData/CDS/RAP BOs), and route the remaining logic to the right target: in-app ABAP Cloud (RAP) where it belongs on the core, or a decoupled side-by-side CAP service on SAP BTP where it does not. Objects with no released path are re-architected, not force-fit. Clean-Core.io automates the assessment and drafts the first compliant version for an architect to review.',
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

export default function SapCloudificationPage() {
  const stats = getCatalogStats();
  const classified = stats.classifiedObjects
    ? stats.classifiedObjects.toLocaleString('en-US')
    : '23,000+';

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-slate-50 px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200"
        >
          <ArrowLeft size={14} /> Back to Homepage
        </Link>
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <Cloud size={14} /> Clean Core Transition
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            SAP <span className="text-green-400">Cloudification</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            How to cloudify custom ABAP: move legacy code off unreleased objects onto released S/4HANA
            APIs, aligned with SAP Clean Core. Grounded in SAP&apos;s official Cloudification Repository.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block */}
      <QuickAnswer
        question="What does it mean to cloudify SAP custom code?"
        answer="Cloudifying SAP means making custom ABAP cloud-ready for S/4HANA: replacing direct access to standard tables and unreleased objects with SAP-released APIs and CDS views, and rewriting logic either in-app in ABAP Cloud (RAP) or side-by-side on SAP BTP (CAP). It follows SAP's Clean Core principle so extensions stay decoupled from the digital core and upgrades stay clean. There is no single SAP product called 'Cloudify'; the reference dataset that drives it is SAP's public Cloudification Repository, which maps legacy objects to their released successors."
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              What is SAP cloudification?
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              <strong>Cloudification</strong> is the work of making custom SAP ABAP cloud-ready — aligning
              it with SAP&apos;s <strong>Clean Core</strong> extensibility model so the digital core stays
              standard and upgradeable. In practice, it means replacing direct reads and writes on standard
              tables (VBAK, BSEG, LIKP…) and calls to unreleased objects with <strong>SAP-released APIs</strong>,
              CDS views and RAP business objects.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              Logic that legitimately belongs on the core is rebuilt <strong>in-app in ABAP Cloud (RAP)</strong>;
              logic that does not is decoupled into a <strong>side-by-side service on SAP BTP (CAP)</strong>. The
              result is an extension layer that survives S/4HANA upgrades instead of breaking on them.
            </p>
          </section>

          {/* Honest disambiguation — good for trust and AI answer engines */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              A note on the term
            </span>
            <p className="text-slate-700 mt-2 leading-relaxed font-medium">
              There is no SAP product literally called <strong>&ldquo;Cloudify&rdquo;</strong>. &ldquo;Cloudify SAP&rdquo;
              and &ldquo;SAP cloudification&rdquo; are informal names for making custom code cloud-ready and
              clean-core-compliant. The concrete asset SAP publishes for it is the{' '}
              <strong>SAP Cloudification Repository</strong> — the released-successor dataset that also backs
              SAP ATC’s clean-core checks.
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              How to cloudify SAP custom code
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-955">1. Assess the custom code</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Run a deterministic{' '}
                    <Link href="/abap-custom-code-analysis" className="text-green-600 font-bold hover:underline">
                      ABAP static code analysis
                    </Link>{' '}
                    to inventory every standard object your code touches and flag risky table access,
                    unreleased calls and modifications — as line-level evidence.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-955">2. Map objects to released successors</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Each object is resolved against SAP&apos;s{' '}
                    <Link href="/catalog" className="text-green-600 font-bold hover:underline">
                      Cloudification Repository
                    </Link>{' '}
                    ({classified} classified objects) plus curated field-level mappings — returning the
                    released OData/CDS successor, or an honest &ldquo;no released path&rdquo; verdict.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <Route size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-955">3. Route: in-app RAP vs side-by-side CAP</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Based on the degree of coupling, the router recommends rewriting the logic in-app in
                    ABAP Cloud (RAP) or decoupling it as a side-by-side service on SAP BTP (Node.js CAP) —
                    a recommendation for a qualified architect to sign off.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <GitBranch size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-955">4. Draft the compliant version + evidence</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    The engine drafts the first clean-core-compliant RAP or CAP version with a multi-file
                    abapGit export and ABAP-Unit tests, plus a signed audit evidence pack — a starting point
                    to review, never a production-ready deliverable.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              What blocks cloudification
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Not every object has a clean path. The assessment is honest about what cannot simply be
              re-pointed:
            </p>
            <ul className="space-y-2 text-gray-700 font-medium">
              <li className="flex gap-2"><Check className="text-green-600 shrink-0 mt-1" size={16} /> <span><strong>Objects with no released successor</strong> — flagged for re-architecture (e.g. a side-by-side extension), not force-fit to a fake mapping.</span></li>
              <li className="flex gap-2"><Check className="text-green-600 shrink-0 mt-1" size={16} /> <span><strong>Modifications, implicit enhancements and native SQL</strong> — the not-recommended patterns that break on upgrade.</span></li>
              <li className="flex gap-2"><Check className="text-green-600 shrink-0 mt-1" size={16} /> <span><strong>Dynamic ABAP, Dynpro / classic UI and BDC flows</strong> — need manual redesign rather than an automated lift-and-shift.</span></li>
            </ul>
            <p className="text-gray-700 leading-relaxed font-medium">
              Clean-Core.io is a free community tool that accelerates this assessment — complementary to
              SAP ADT and ATC, which remain the authoritative checks.
            </p>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-955 uppercase tracking-tight">
              From the Cloudification Repository
            </h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-center">
                <Layers className="text-green-600 shrink-0" size={16} /> {classified} classified SAP objects
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Released successors, source-attributed
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Weekly auto-synced &amp; versioned
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Same source that backs SAP ATC
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link
                href="/?auth=signup"
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Cloudify for Free
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Related Topics</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/abap-custom-code-analysis" className="block text-green-600 hover:underline">
                → ABAP Static Code Analysis
              </Link>
              <Link href="/sap-clean-core-object-classification" className="block text-green-600 hover:underline">
                → Clean Core Object Classification (A–D)
              </Link>
              <Link href="/clean-core-score" className="block text-green-600 hover:underline">
                → What is the Clean Core Score?
              </Link>
              <Link href="/knowledge" className="block text-green-600 hover:underline">
                → SAP Clean Core guide (RAP vs CAP)
              </Link>
              <Link href="/catalog" className="block text-green-600 hover:underline">
                → Browse the SAP object catalog
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Further reading</h3>
            <a
              href="https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-green-600 hover:underline font-bold text-sm"
            >
              → Clean Core Levels A–D: how to classify your custom ABAP (SAP Community) ↗
            </a>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-slate-50 border border-gray-200 rounded-[2.5rem] p-8 space-y-6">
        <h2 className="text-2xl font-black text-gray-955">Frequently Asked Questions (FAQ)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-bold text-sm">
          {faqs.map((faq, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="text-gray-955 font-black">{faq.question}</h3>
              <p className="text-gray-600 font-medium leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="text-center text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider pt-10 border-t border-gray-200">
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Edition
      </div>
    </div>
  );
}

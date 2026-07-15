import type { Metadata } from 'next';
import { ArrowLeft, Layers, Check } from 'lucide-react';
import Link from 'next/link';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { ABCD_META, GRADES } from '@/lib/abap/abcd-classification';

export const metadata: Metadata = {
  title: 'SAP Clean Core Object Classification (A–D) | Clean-Core.io',
  description: 'SAP now classifies clean-core technical objects into A, B, C and D by API release status, upgrade safety and extensibility compliance — replacing the older Tier 1/2/3 wording. Learn the model and how Clean-Core.io derives it.',
  alternates: {
    canonical: 'https://clean-core.io/sap-clean-core-object-classification',
  },
  openGraph: {
    title: 'SAP Clean Core Object Classification (A–D) | Clean-Core.io',
    description: 'The A/B/C/D cloud-readiness classification for SAP clean-core technical objects, and how Clean-Core.io applies it to your custom code.',
    url: 'https://clean-core.io/sap-clean-core-object-classification',
    type: 'website',
  },
};

const faqs = [
  {
    question: 'What changed from Tier 1/2/3 to A/B/C/D?',
    answer: "SAP's Cloudification Repository governs which technical objects are clean-core ready. The classification of released/recommended objects moved from the older Tier 1/2/3 wording to a four-grade cloud-readiness scheme — A, B, C, D — driven by API release status, upgrade safety and extensibility compliance. It makes assessing custom code faster and technical-debt control clearer.",
  },
  {
    question: 'How does Clean-Core.io assign an A–D grade?',
    answer: 'As an experimental preview estimate. It is a heuristic derived from the evidence the engine already computes — access type, risk level, object type and whether the object is custom. It is a fast orientation aid, not an authoritative SAP ATC classification, and it is not part of the signed audit pack. Every grade should be verified with SAP ADT/ATC for your target release.',
  },
  {
    question: 'What should I do with grade D objects?',
    answer: 'Grade D objects (unreleased dependencies, direct writes to standard tables, kernel or dynpro usage) are the upgrade blockers. They should be replaced — mapped to a released API/CDS view, wrapped behind a clean interface, or re-architected — before the code can be considered Clean Core.',
  },
];

export default function CleanCoreClassificationPage() {
  const schemaJson = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson).replace(/</g, '\\u003c') }} />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-slate-50 px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200">
          <ArrowLeft size={14} /> Back to Homepage
        </Link>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <Layers size={14} /> Clean Core Classification
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            Object Classification <span className="text-green-400">A–D</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            SAP now grades clean-core technical objects A, B, C or D by API release status, upgrade safety and extensibility compliance — replacing the older Tier 1/2/3 wording. Here is the model, and how Clean-Core.io derives it for your custom code.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer */}
      <QuickAnswer
        question="What is the A/B/C/D Clean Core object classification?"
        answer="It is SAP's cloud-readiness classification for technical objects. A = released SAP APIs and extension points; B = classic SAP APIs, SAP-recommended; C = internal SAP APIs, conditionally clean; D = not-recommended objects and technologies, to be replaced. It maps to the ABAP Test Cockpit priorities and gives a clearer way to assess custom code and plan upgrade-safe SAP development than a binary clean/not-clean view."
      />

      {/* Main */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">From Tier 1/2/3 to A/B/C/D</h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              The Cloudification Repository is the key governance tool for SAP Clean Core analysis. It classifies technical objects by <strong>API release status, upgrade safety and extensibility compliance</strong>. The community has moved from the older Tier 1/2/3 wording to a clearer four-grade cloud-readiness scheme:
            </p>
            <div className="space-y-4 pt-2">
              {GRADES.map((g) => (
                <div key={g} className="p-5 border rounded-2xl flex items-start gap-4" style={{ borderColor: `${ABCD_META[g].color}33`, background: `${ABCD_META[g].color}0d` }}>
                  <span className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl text-lg font-black border ${ABCD_META[g].badge}`}>{g}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-gray-955 text-base">{ABCD_META[g].label}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">ATC: {ABCD_META[g].atc}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">{ABCD_META[g].description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-gray-700 leading-relaxed font-medium">
              The classification flow is simple: <strong>object identification → repository lookup → grade classification → remediation decision → Clean Core alignment.</strong>
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-3xl font-black tracking-tight text-gray-955">How Clean-Core.io applies it</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">Experimental preview</span>
            </div>
            <p className="text-gray-700 leading-relaxed font-medium">
              Clean-Core.io shows an <strong>experimental A–D readiness estimate</strong>: a heuristic derived from the evidence the engine already computes — access type, risk level, object type and whether the object is custom. It is a fast orientation aid, <strong>not</strong> an authoritative SAP ATC classification, and it is <strong>not</strong> part of the signed audit pack. Treat every grade as a draft and verify it with SAP ADT / ATC for your specific target release.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              Used that way it speeds up first-pass triage and the technical-debt conversation — a starting point for the defensible A–D remediation plan you then confirm against SAP's own tooling.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              For a hands-on walkthrough of the A–D model — how to classify each object and what to do with grade C and D code — see our SAP Community post:{' '}
              <a
                href="https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 font-bold hover:underline"
              >
                Clean Core Levels A–D: how to classify your custom ABAP ↗
              </a>.
            </p>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-955 uppercase tracking-tight">Why it matters</h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-center"><Check className="text-green-600 shrink-0" size={16} /> Faster custom-code assessment</li>
              <li className="flex gap-2 items-center"><Check className="text-green-600 shrink-0" size={16} /> Clear technical-debt control</li>
              <li className="flex gap-2 items-center"><Check className="text-green-600 shrink-0" size={16} /> Upgrade-stable development</li>
              <li className="flex gap-2 items-center"><Check className="text-green-600 shrink-0" size={16} /> Defensible A–D remediation plan</li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link href="/?auth=signup" className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm">
                Classify your code
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Related Topics</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/abap-custom-code-analysis" className="block text-green-600 hover:underline">→ ABAP Custom Code Analysis</Link>
              <Link href="/clean-core-score" className="block text-green-600 hover:underline">→ What is the Clean Core Score?</Link>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
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

      <div className="text-center text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider pt-10 border-t border-gray-200">
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Edition
      </div>
    </div>
  );
}

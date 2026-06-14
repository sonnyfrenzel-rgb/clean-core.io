import type { Metadata } from 'next';
import { BookOpen, ArrowLeft, Activity, ShieldCheck, Check, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'SAP Clean Core Score & TCO Analysis | Clean-Core.io',
  description: 'Learn how the Clean Core Score is calculated and how to reduce your upgrade efforts by up to 80% via decoupling.',
  alternates: {
    canonical: 'https://clean-core.io/clean-core-score',
  },
  openGraph: {
    title: 'SAP Clean Core Score & TCO Analysis | Clean-Core.io',
    description: 'Learn how the Clean Core Score is calculated and how to reduce your upgrade efforts by up to 80% via decoupling.',
    url: 'https://clean-core.io/clean-core-score',
    type: 'website',
  }
};

const faqs = [
  {
    question: "What does a Clean Core Score of 100% mean?",
    answer: "A score of 100% signals that all customer-specific extensions are fully compliant. This means in-app modifications only run through released key-user apps, and side-by-side BTP extensions communicate exclusively via certified interfaces. The SAP system is 100% upgrade-ready."
  },
  {
    question: "How are the Clean Core Score and TCO connected?",
    answer: "The lower the Clean Core Score, the higher the ongoing operating costs (Total Cost of Ownership, TCO). Modifications must be extensively re-tested and corrected for each SAP Support Package. A high score dramatically minimizes this testing effort."
  }
];

export default function CleanCoreScorePage() {
  const schemaJson = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
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
            <Activity size={14} /> Business Metrics
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            SAP Clean Core <span className="text-green-400">Score</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Measure the future-readiness of your SAP ERP. Calculate compliance with official SAP Clean Core guidelines and predict your TCO savings.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block */}
      <QuickAnswer 
        question="How is the SAP Clean Core Score calculated and what does it measure?"
        answer="The SAP Clean Core Score is a KPI that measures the degree of decoupling between custom code extensions and the standard ERP core. Calculated by analyzing syntax trees and data dependencies, the score weights direct database modifications, calls to unreleased APIs, and key-user extensibility. A high score (closer to 100%) indicates modular code that allows instant S/4HANA upgrades and reduces Total Cost of Ownership (TCO) by up to 50%."
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              What is the Clean Core Score?
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              The <strong>SAP Clean Core Score</strong> is the key metric (KPI) for assessing the degree of decoupling of customer-specific ABAP modifications. On a scale of 0% (fully modified legacy system) to 100% (standard ERP without modifications), it indicates how smoothly your system can be upgraded.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              By maintaining a "clean core," companies ensure that core processes remain stable, while innovations are realized side-by-side on the <strong>SAP Business Technology Platform (BTP)</strong> or in-app via released interfaces.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              The Calculation Basis of the KPI
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Our analysis algorithm evaluates uploaded custom code projects based on four key pillars:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <ShieldCheck className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">API & Interface Release</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Checks whether the SAP APIs and Data Dictionary objects used are officially released by SAP for cloud extensions.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <Activity className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">Degree of Coupling</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Measures how strongly custom tables and business processes are interwoven with SAP ERP modules.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <Sparkles className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">Modern ABAP Cloud</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Validates the usage of modern ABAP Cloud syntax (RAP Model) instead of outdated legacy ABAP reports.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <TrendingUp className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">TCO Optimization Potential</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Calculates the reduction in testing and development costs for future system upgrades.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-955 uppercase tracking-tight">Benefits at a Glance</h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Clear KPI for IT management
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Benchmarking against SAP best practices
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Identification of critical couplings
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Up to 80% savings in testing
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link 
                href="/?auth=signup" 
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Calculate Score
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Related Topics</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/abap-custom-code-analysis" className="block text-green-600 hover:underline">
                → ABAP Custom Code Analysis
              </Link>
              <Link href="/sap-tier-2-extensions" className="block text-green-600 hover:underline">
                → ABAP Cloud & Tier-2 Extensions
              </Link>
            </div>
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
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Non-Commercial Pilot Edition
      </div>
    </div>
  );
}

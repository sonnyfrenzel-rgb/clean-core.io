import type { Metadata } from 'next';
import { BookOpen, ArrowLeft, Layers, ShieldCheck, Check, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'SAP Tier-2 Extensions & Cloud Readiness | Clean-Core.io',
  description: 'Understand the ABAP Cloud 3-tier extensibility model and learn how to securely encapsulate legacy data structures.',
  alternates: {
    canonical: 'https://clean-core.io/sap-tier-2-extensions',
  },
  openGraph: {
    title: 'SAP Tier-2 Extensions & Cloud Readiness | Clean-Core.io',
    description: 'Understand the ABAP Cloud 3-tier extensibility model and learn how to securely encapsulate legacy data structures.',
    url: 'https://clean-core.io/sap-tier-2-extensions',
    type: 'website',
  }
};

const faqs = [
  {
    question: "What distinguishes Tier-1 from Tier-2 ABAP Cloud code?",
    answer: "Tier-1 (cloud-native ABAP) uses exclusively released SAP APIs and CDS views. Tier-2 (Cloud Readiness) serves as a wrapper layer to cleanly encapsulate unreleased SAP objects and make them accessible to Tier-1 via released interfaces, keeping Tier-1 clean."
  },
  {
    question: "When are Tier-2 extensions mandatory?",
    answer: "Tier-2 is necessary when legacy system tables or customer-specific custom (Z) tables must be integrated without official SAP APIs. Instead of polluting Tier-1 code with these legacy structures, an encapsulation layer is inserted in between."
  }
];

export default function SapExtensionsPage() {
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
            <Layers size={14} /> Architecture Patterns
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            Tier-2 <span className="text-green-400">Extensions</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Develop future-proof in the 3-tier extensibility model. Learn how to cleanly encapsulate legacy code and make your ERP extensions cloud-ready.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block */}
      <div className="bg-green-50/50 rounded-3xl p-6 border border-green-100 shadow-sm text-center max-w-4xl mx-auto">
        <h2 className="text-sm font-black text-green-800 uppercase tracking-widest mb-2">Quick Answer</h2>
        <h3 className="text-base font-bold text-gray-955 mb-2">What is Tier-2 ABAP Cloud extensibility and how does it work?</h3>
        <p className="text-sm text-gray-700 leading-relaxed font-medium">
          In the SAP ABAP Cloud extensibility model, Tier-2 (Cloud API Enablement) acts as the bridge for legacy custom code that cannot run directly in Tier-1 (Developer Extensibility) because it uses unreleased SAP APIs or direct table access. Tier-2 encapsulates these legacy dependencies using wrapper classes and custom CDS views, releasing them with a stable, local API. This allows Tier-1 cloud-native RAP applications to consume legacy business logic safely without breaking the Clean Core.
        </p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              The ABAP Cloud 3-Tier Extensibility Model
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              To ensure the upgradeability of S/4HANA systems, SAP introduced the <strong>3-tier extensibility model</strong>. This divides all ABAP developments into three separate layers:
            </p>
            <div className="space-y-4 pt-2">
              <div className="p-5 border border-gray-200 rounded-2xl bg-slate-50/50">
                <h3 className="font-black text-gray-955 text-base">Tier 1: Cloud-Native ABAP</h3>
                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                  The pure cloud standard. Uses exclusively released language elements (ABAP Cloud) and SAP APIs. This code is absolutely upgrade-safe and runs directly in public cloud environments.
                </p>
              </div>
              <div className="p-5 border border-green-200 rounded-2xl bg-green-50/10">
                <h3 className="font-black text-gray-955 text-base text-green-700">Tier 2: Cloud Readiness Wrapper</h3>
                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                  The encapsulation layer. If required SAP features are missing in Tier-1, a custom API is built in Tier-2 to encapsulate the legacy access and provide a clean Tier-1 interface.
                </p>
              </div>
              <div className="p-5 border border-gray-200 rounded-2xl bg-slate-50/50">
                <h3 className="font-black text-gray-955 text-base">Tier 3: Legacy ABAP</h3>
                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                  The classical development layer. Allows modifications and the usage of obsolete tables (e.g., VBAK). Tier-3 is the typical upgrade blocker and should be gradually decommissioned.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              Sensible Usage of Tier-2 Extensions
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              The goal of Clean-Core.io is to migrate your legacy ABAP code as much as possible to <strong>Tier-1</strong> or <strong>BTP CAP</strong> (Side-by-Side). Where this is not immediately possible due to missing standard APIs, our platform automatically generates the appropriate Tier-2 wrapper. 
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              Through this automated encapsulation, your main application code remains clean and future-proof. Once SAP releases an official API for the encapsulated function at a later stage, the Tier-2 wrapper can be easily replaced by the standard API without breaking business logic.
            </p>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-955 uppercase tracking-tight">Benefits at a Glance</h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Structured legacy decommissioning
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Future-proof API encapsulation
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Minimizes Tier-3 dependencies
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Upgrade-ready system architecture
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link 
                href="/?auth=signup" 
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Validate Code
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Related Topics</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/abap-custom-code-analysis" className="block text-green-600 hover:underline">
                → ABAP Custom Code Analysis
              </Link>
              <Link href="/clean-core-score" className="block text-green-600 hover:underline">
                → What is the Clean Core Score?
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

import type { Metadata } from 'next';
import { BookOpen, ArrowLeft, Cpu, Activity, ShieldCheck, Link2, Check } from 'lucide-react';
import Link from 'next/link';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'ABAP Custom Code Analysis for S/4HANA Upgrades | Clean-Core.io',
  description: 'Automated static analysis of legacy ABAP code, database table access detection, and mapping to official released standard SAP APIs.',
  alternates: {
    canonical: 'https://clean-core.io/abap-custom-code-analysis',
  },
  openGraph: {
    title: 'ABAP Custom Code Analysis for S/4HANA Upgrades | Clean-Core.io',
    description: 'Automated static analysis of legacy ABAP code, database table access detection, and mapping to official released standard SAP APIs.',
    url: 'https://clean-core.io/abap-custom-code-analysis',
    type: 'website',
  }
};

const faqs = [
  {
    question: "Why do classic S/4HANA upgrades fail?",
    answer: "Many SAP systems exhibit tight coupling between custom ABAP code and standard SAP tables. During upgrades, these underlying data structures change, leading to system errors and massive testing efforts."
  },
  {
    question: "How does automated ABAP analysis help?",
    answer: "The analysis isolates modifications in the ABAP code and automatically maps direct access to tables like VBAK, LIKP, or BSEG to released standard OData/REST APIs in the SAP API Business Hub, decoupling the system."
  }
];

export default function AbapAnalysisPage() {
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
            <Cpu size={14} /> Core Technology
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            ABAP Custom Code <span className="text-green-400">Analysis</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Decouple your legacy systems. Analyze unstructured ABAP code and automatically transform it into a future-proof side-by-side BTP architecture.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block */}
      <div className="bg-green-50/50 rounded-3xl p-6 border border-green-100 shadow-sm text-center max-w-4xl mx-auto">
        <h2 className="text-sm font-black text-green-800 uppercase tracking-widest mb-2">Quick Answer</h2>
        <h3 className="text-base font-bold text-gray-955 mb-2">Why analyze custom ABAP code before an S/4HANA upgrade?</h3>
        <p className="text-sm text-gray-700 leading-relaxed font-medium">
          Legacy SAP systems often have tight syntax coupling to standard tables (e.g. VBAK, BSEG, LIKP) or unreleased function modules. During an S/4HANA migration, database structures change, which breaks custom programs. Automated custom code analysis detects these dependencies and maps direct database reads to modern, cloud-released OData APIs and BTP CAP or RAP architectures, preventing upgrade blockages.
        </p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              The Challenge: Custom Code as an Upgrade Blocker
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              In SAP ERP systems that have grown over decades, there are often thousands of lines of custom ABAP developments. Many of these directly access standard tables or unreleased SAP function modules. During an upgrade to <strong>SAP S/4HANA</strong>, this tight coupling leads to system breakages, high modernization costs, and months of testing phases.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              Manual <strong>ABAP custom code analysis</strong> and subsequent refactoring is extremely time-consuming. This is exactly where the automated platform of Clean-Core.io comes in: Our tool reads your legacy ABAP code, parses syntax trees, and analyzes data flows to automatically isolate dependencies.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              How the Automated Pipeline Works
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-955">Static AST Parsing</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    The ABAP source code is broken down into abstract syntax trees (AST). This allows us to detect control flows, database operations (SELECT, INSERT, UPDATE), and external calls.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <Link2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-955">SAP API Hub Alignment</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Detected table accesses are matched against the official API Business Hub database. The system automatically searches for released OData or REST interfaces (e.g., Business Partner, Sales Order APIs) and suggests them as replacements.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-955">Target Architecture Routing</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Based on the determined degree of coupling, the router decides whether the code should be rewritten in-app in ABAP Cloud (RAP) or decoupled as a side-by-side service on SAP BTP (Node.js CAP).
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-955 uppercase tracking-tight">Benefits at a glance</h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> 80% faster code assessment
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Automatic OData API mapping
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> SAP Clean Core guideline compliant
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Reduces technical upgrade debt
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link 
                href="/?auth=signup" 
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Analyze for Free
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Related Topics</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/clean-core-score" className="block text-green-600 hover:underline">
                → What is the Clean Core Score?
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

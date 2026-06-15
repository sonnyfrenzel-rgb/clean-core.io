import type { Metadata } from 'next';
import { GitBranch, Database, Code2, Bot, Ruler, ChevronDown, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'How It Works — Transformation Methodology & Coverage | Clean-Core.io',
  description: 'Understand the Clean-Core.io transformation pipeline: deterministic ABAP parsing, SAP API Hub mapping, and target code generation with an honest coverage matrix.',
  alternates: {
    canonical: 'https://clean-core.io/how-it-works',
  },
  openGraph: {
    title: 'How It Works — Transformation Methodology & Coverage | Clean-Core.io',
    description: 'Understand the Clean-Core.io transformation pipeline: deterministic ABAP parsing, SAP API Hub mapping, and target code generation.',
    url: 'https://clean-core.io/how-it-works',
    type: 'website',
  }
};

const faqs = [
  {
    question: 'Which ABAP constructs are automatically transformed?',
    answer: 'Direct database reads (SELECT on standard SAP tables like VBAK, BSEG, LIKP), simple wrapper classes, and function module calls with static targets are fully supported. Complex SQL joins, BAdI implementations, and enhancement spots are partially supported with manual review flags.'
  },
  {
    question: 'What role does the LLM play in the transformation?',
    answer: 'The LLM (Google Gemini) handles semantic understanding of business logic context, generates human-readable documentation, and produces the final target code. All table-to-API mappings are deterministic rule-based lookups against the SAP API Business Hub catalog — not LLM guesses.'
  },
  {
    question: 'Can I verify the generated code yourself?',
    answer: 'Yes. Every transformation produces an importable abapGit package (src/ directory + abapgit.xml) with generated ABAP-Unit test classes. Import into your Eclipse ADT, compile, and run the tests locally.'
  }
];

const coverageRows = [
  { construct: 'Direct SELECT on standard tables', level: 'full', label: '✅ Fully Supported', notes: 'Deterministic mapping to released CDS views / APIs' },
  { construct: 'Simple wrapper classes / reports', level: 'full', label: '✅ Fully Supported', notes: 'Full AST decomposition and target generation' },
  { construct: 'Static CALL FUNCTION', level: 'full', label: '✅ Fully Supported', notes: 'Resolved to equivalent API calls' },
  { construct: 'Complex SQL Joins (3+ tables)', level: 'partial', label: '⚠️ Partial', notes: 'Generated with review flags; architect sign-off recommended' },
  { construct: 'BAdI / Enhancement Implementations', level: 'partial', label: '⚠️ Partial', notes: 'Structure detected; business logic requires manual review' },
  { construct: 'Dynamic CALL FUNCTION / PERFORM', level: 'partial', label: '⚠️ Partial', notes: 'Flagged with low-confidence warning; cannot resolve at parse time' },
  { construct: 'SAP GUI Dynpro screens (MODULE POOL)', level: 'none', label: '❌ Not Supported', notes: 'UI layer requires manual Fiori/UI5 redesign' },
  { construct: 'Kernel calls (ABAP system internals)', level: 'none', label: '❌ Not Supported', notes: 'No public API equivalent exists' },
  { construct: 'ABAP OO with deep inheritance chains', level: 'partial', label: '⚠️ Partial', notes: 'Flat hierarchies supported; deep chains flagged' },
];

const deterministicItems = [
  'Table-to-API mapping',
  'AST parsing',
  'CDS view structure',
  'abapGit packaging',
  'Compliance scoring',
];

const llmItems = [
  'Business logic interpretation',
  'Documentation generation',
  'Test scenario description',
  'Code comments and naming',
];

export default function HowItWorksPage() {
  const faqSchema = {
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

  const techArticleSchema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": "How Clean-Core.io Transforms Legacy ABAP",
    "description": "Technical deep-dive into the Clean-Core.io transformation pipeline.",
    "author": {
      "@type": "Person",
      "name": "Felix Frenzel"
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleSchema) }}
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
            <GitBranch size={14} /> Methodology
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            How It <span className="text-green-400">Works</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Three deterministic stages — from legacy ABAP to cloud-compliant architecture. Transparent coverage, honest limitations.
          </p>
        </div>
      </div>

      {/* Quick Answer */}
      <QuickAnswer
        question="How does Clean-Core.io transform legacy ABAP code?"
        answer="The pipeline uses deterministic AST parsing to extract table references and function module calls, maps them to official SAP API Business Hub entries via rule-based lookups, and generates target code in your chosen architecture (ABAP Cloud RAP or BTP CAP). The LLM handles only semantic tasks like documentation and naming — never the critical table-to-API mappings."
      />

      {/* Section A: Pipeline Overview */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight text-gray-955">
            The Transformation Pipeline
          </h2>
          <p className="text-gray-600 font-medium">
            Three deterministic stages — from legacy ABAP to cloud-compliant architecture.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1: Parse */}
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-4 relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 text-white rounded-xl flex items-center justify-center text-sm font-black">1</div>
              <h3 className="text-lg font-black text-gray-955">Parse</h3>
            </div>
            <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
              <Code2 size={20} />
            </div>
            <p className="text-gray-600 text-sm font-medium leading-relaxed">
              Legacy ABAP code is parsed into an Abstract Syntax Tree (AST). Direct database reads, function module calls, and class dependencies are extracted and classified.
            </p>
          </div>

          {/* Step 2: Map */}
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-4 relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 text-white rounded-xl flex items-center justify-center text-sm font-black">2</div>
              <h3 className="text-lg font-black text-gray-955">Map</h3>
            </div>
            <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
              <Database size={20} />
            </div>
            <p className="text-gray-600 text-sm font-medium leading-relaxed">
              Extracted table references (e.g., VBAK, BSEG, LIKP) are resolved against the SAP API Business Hub catalog using deterministic rule-based lookups. Each mapping links to the official API documentation.
            </p>
          </div>

          {/* Step 3: Generate */}
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-4 relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 text-white rounded-xl flex items-center justify-center text-sm font-black">3</div>
              <h3 className="text-lg font-black text-gray-955">Generate</h3>
            </div>
            <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
              <GitBranch size={20} />
            </div>
            <p className="text-gray-600 text-sm font-medium leading-relaxed">
              Target code is compiled in the user&apos;s selected architecture: ABAP Cloud RAP (CDS Views + Behavior Definitions) or Side-by-Side BTP CAP (Node.js services + schema definitions). ABAP-Unit test classes are generated alongside.
            </p>
          </div>
        </div>
      </section>

      {/* Section B: Deterministic vs LLM */}
      <section className="space-y-6">
        <h2 className="text-3xl font-black tracking-tight text-gray-955">
          Deterministic Rules vs. LLM Generation
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Deterministic Column */}
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                <Ruler size={20} />
              </div>
              <h3 className="text-lg font-black text-gray-955">Deterministic (Rule-Based)</h3>
            </div>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              {deterministicItems.map((item, idx) => (
                <li key={idx} className="flex gap-2 items-center">
                  <CheckCircle2 className="text-green-600 shrink-0" size={16} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* LLM Column */}
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center text-indigo-600">
                <Bot size={20} />
              </div>
              <h3 className="text-lg font-black text-gray-955">LLM-Assisted (Google Gemini)</h3>
            </div>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              {llmItems.map((item, idx) => (
                <li key={idx} className="flex gap-2 items-center">
                  <Bot className="text-indigo-500 shrink-0" size={16} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Section C: Coverage Matrix */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight text-gray-955">
            Coverage Matrix
          </h2>
          <p className="text-gray-600 font-medium">
            What works today, what needs help, and what we don&apos;t support yet.
          </p>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-2xl overflow-hidden">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-5 py-3.5 font-black text-gray-955 border-b border-gray-200">Construct</th>
                <th className="px-5 py-3.5 font-black text-gray-955 border-b border-gray-200">Support Level</th>
                <th className="px-5 py-3.5 font-black text-gray-955 border-b border-gray-200">Notes</th>
              </tr>
            </thead>
            <tbody>
              {coverageRows.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="px-5 py-3.5 font-bold text-gray-800 border-b border-gray-100">{row.construct}</td>
                  <td className={`px-5 py-3.5 font-bold border-b border-gray-100 ${
                    row.level === 'full' ? 'text-green-700' : row.level === 'partial' ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {row.label}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 font-medium border-b border-gray-100">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="md:hidden space-y-4">
          {coverageRows.map((row, idx) => (
            <div key={idx} className="bg-slate-50 border border-gray-200 rounded-2xl p-5 space-y-2">
              <h4 className="font-black text-gray-955 text-sm">{row.construct}</h4>
              <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${
                row.level === 'full'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : row.level === 'partial'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {row.level === 'full' && <CheckCircle2 size={12} />}
                {row.level === 'partial' && <AlertTriangle size={12} />}
                {row.level === 'none' && <XCircle size={12} />}
                {row.level === 'full' ? 'Fully Supported' : row.level === 'partial' ? 'Partial' : 'Not Supported'}
              </div>
              <p className="text-gray-600 text-xs font-medium leading-relaxed">{row.notes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section D: FAQ */}
      <div className="bg-slate-50 border border-gray-200 rounded-[2.5rem] p-8 space-y-6">
        <h2 className="text-2xl font-black text-gray-955">Frequently Asked Questions (FAQ)</h2>
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6 font-bold text-sm">
          {faqs.map((faq, idx) => (
            <details key={idx} className="group bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer px-6 py-4 list-none">
                <h3 className="text-gray-955 font-black pr-4">{faq.question}</h3>
                <ChevronDown size={18} className="text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-6 pb-5">
                <p className="text-gray-600 font-medium leading-relaxed">{faq.answer}</p>
              </div>
            </details>
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

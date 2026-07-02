import type { Metadata } from 'next';
import { BookOpen, Layers, Check } from 'lucide-react';
import KnowledgeClient from '@/components/KnowledgeClient';
import BackButton from '@/components/BackButton';

// Server-side Metadata configuration for SEO & GEO Crawlers
export const metadata: Metadata = {
  title: 'SAP S/4HANA Clean Core & BTP Extensibility | Clean-Core.io',
  description: 'Explore standard SAP Clean Core architectural strategies, In-App RAP vs. Side-by-Side CAP decision patterns, and BTP integration security guidelines.',
  alternates: {
    canonical: 'https://clean-core.io/knowledge',
  },
  openGraph: {
    title: 'SAP S/4HANA Clean Core & BTP Extensibility | Clean-Core.io',
    description: 'Explore standard SAP Clean Core architectural strategies, In-App RAP vs. Side-by-Side CAP decision patterns, and BTP integration security guidelines.',
    url: 'https://clean-core.io/knowledge',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
};

const faqs = [
  {
    question: "What is the SAP S/4HANA Clean Core strategy?",
    answer: "The Clean Core strategy is an architectural design principle that keeps the SAP standard ERP core software free of custom modifications. Custom extensions are developed either \"in-app\" using key-user extensibility or \"side-by-side\" on the SAP Business Technology Platform (BTP). This decoupling allows businesses to upgrade their core ERP system instantly, reduce technical debt, and ensure continuous innovation without breaking custom business logic."
  },
  {
    question: "What is the difference between In-App RAP and Side-by-Side CAP extensions?",
    answer: "In-App RAP (ABAP RESTful Application Programming Model) runs directly within the S/4HANA tenant. It is ideal for extending standard SAP business objects and UI layers using native ABAP in a cloud-compliant way. Side-by-Side CAP (Cloud Application Programming Model) runs externally on SAP BTP, typically using Node.js or Java. It is designed for standalone cloud-native applications, multi-tenant SaaS products, and integration with non-SAP systems, fully decoupling execution from the ERP core."
  },
  {
    question: "How does Clean-Core.io secure Side-by-Side BTP integration?",
    answer: "Clean-Core.io configures secure tunnels and authentication pathways on SAP BTP. It implements JSON Web Tokens (JWT) validated by the SAP XSUAA (Extended Services for User Account and Authentication) service. This allows stateless, secure API communication and enforces role-based access control (RBAC). For S/4HANA core connections, it uses SAP BTP Connectivity and Destination services, routing RFC and OData traffic securely via SAP Cloud Connector without exposing internal endpoints."
  },
  {
    question: "What is the BYOT (Bring Your Own Tenant) connectivity model?",
    answer: "The BYOT model allows enterprise customers to connect their own SAP S/4HANA and SAP BTP subaccount instances to the Clean-Core.io conversion and testing engine. Instead of hosting client data, Clean-Core.io securely runs static analysis and deploys sandbox environments directly into the customer’s verified tenants using secure credentials, designed to support compliance with corporate security, data residency, and governance rules."
  },
  {
    question: "How does Clean-Core.io automate legacy ABAP modernization?",
    answer: "The tool parses legacy custom ABAP code (classes, reports, custom tables) and maps them to modern BTP services. It uses generative AI to refactor tight coupling into OData APIs, RAP services, or CAP Node.js microservices. Additionally, it generates comprehensive test scripts and exportable BPMN 2.0 process blueprints for Signavio, reducing manual upgrade efforts by up to 80%."
  }
];

export default function KnowledgePage() {
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
    <div className="space-y-12 animate-in fade-in duration-300">
      
      {/* JSON-LD Structured Data for AI Crawlers */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackButton />
      </div>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <BookOpen size={14} /> Knowledge Hub
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            Clean Core & BTP <span className="text-green-400">Reference Hub</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Discover the technical architectures, security guidelines, and extensibility patterns aligned with SAP's published Clean Core guidelines for S/4HANA.
          </p>
        </div>
      </div>

      {/* Interactive FAQ & Glossary client component */}
      <KnowledgeClient />

      {/* Comparison Table Section (RAG-crawler-friendly) */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100 space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-gray-950 flex items-center gap-3">
            <Layers className="text-green-600" /> Extensibility Paradigm Comparison
          </h2>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            Decision framework comparing SAP RAP and BTP CAP extension routes
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-slate-900 border-b border-slate-200 font-bold">
              <tr>
                <th scope="col" className="px-6 py-4">Feature / Criteria</th>
                <th scope="col" className="px-6 py-4">In-App RAP (ABAP RESTful)</th>
                <th scope="col" className="px-6 py-4">Side-by-Side CAP (SAP BTP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-bold text-slate-900">Runtime Environment</td>
                <td className="px-6 py-4">Directly inside SAP S/4HANA (ABAP stack)</td>
                <td className="px-6 py-4">SAP BTP (Node.js, Java, Cloud Foundry/Kyma)</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-bold text-slate-900">Primary Use Case</td>
                <td className="px-6 py-4">Modifying/enhancing standard SAP business logic</td>
                <td className="px-6 py-4">Standalone apps, partner SaaS, multi-system integration</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-bold text-slate-900">Development Languages</td>
                <td className="px-6 py-4">Modern ABAP (Cloud-enabled subset)</td>
                <td className="px-6 py-4">JavaScript, TypeScript, Java</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-bold text-slate-900">Database Access</td>
                <td className="px-6 py-4">Native SQL on HANA via CDS views</td>
                <td className="px-6 py-4">OData, REST, or database targets (HANA, PG, SQLite)</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-bold text-slate-900">Core Decoupling</td>
                <td className="px-6 py-4">High logical coupling (shares SAP memory)</td>
                <td className="px-6 py-4">Complete architectural separation (connected via APIs)</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-bold text-slate-900">Upgrade Impact</td>
                <td className="px-6 py-4">Zero impact (uses officially released SAP APIs)</td>
                <td className="px-6 py-4">Zero impact (completely independent execution)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* SAP Compliance Badge Section */}
      <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-slate-800 space-y-6 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 w-96 h-96 bg-[radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.05),transparent)] pointer-events-none"></div>
        <div className="max-w-3xl space-y-3 relative z-10">
          <h3 className="text-2xl md:text-3xl font-black text-slate-100 uppercase tracking-tight">
            Clean Core Extensibility Alignment
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed font-medium">
            Clean-Core.io leverages standard SAP technologies, securing transactions according to the SAP Cloud SDK guidelines. Keep your ERP core system upgradeable while expanding functionality with cloud-native scalability.
          </p>
          <div className="inline-flex items-center gap-1.5 text-green-400 font-bold text-xs uppercase tracking-widest pt-4">
            Clean Core Aligned Strategy <Check size={14} className="stroke-[3]" />
          </div>
        </div>
      </div>

    </div>
  );
}

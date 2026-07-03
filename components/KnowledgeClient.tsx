'use client';

import { useState } from 'react';
import { 
  HelpCircle, ChevronRight, Database, Shield, Cpu, RefreshCw, Layers, Server, Check
} from 'lucide-react';

const faqs = [
  {
    question: "What is the SAP S/4HANA Clean Core strategy?",
    answer: "The Clean Core strategy is an architectural design principle that keeps the SAP standard ERP core software free of custom modifications. Custom extensions are developed either \"in-app\" using key-user extensibility or \"side-by-side\" on the SAP Business Technology Platform (BTP). This decoupling allows businesses to upgrade their core ERP system instantly, reduce technical debt, and ensure continuous innovation without breaking custom business logic.",
    icon: RefreshCw,
    tag: "Clean Core Strategy"
  },
  {
    question: "What is the difference between In-App RAP and Side-by-Side CAP extensions?",
    answer: "In-App RAP (ABAP RESTful Application Programming Model) runs directly within the S/4HANA tenant. It is ideal for extending standard SAP business objects and UI layers using native ABAP in a cloud-compliant way. Side-by-Side CAP (Cloud Application Programming Model) runs externally on SAP BTP, typically using Node.js or Java. It is designed for standalone cloud-native applications, multi-tenant SaaS products, and integration with non-SAP systems, fully decoupling execution from the ERP core.",
    icon: Layers,
    tag: "Extensibility Models"
  },
  {
    question: "How does Clean-Core.io secure Side-by-Side BTP integration?",
    answer: "Clean-Core.io configures secure tunnels and authentication pathways on SAP BTP. It implements JSON Web Tokens (JWT) validated by the SAP XSUAA (Extended Services for User Account and Authentication) service. This allows stateless, secure API communication and enforces role-based access control (RBAC). For S/4HANA core connections, it uses SAP BTP Connectivity and Destination services, routing RFC and OData traffic securely via SAP Cloud Connector without exposing internal endpoints.",
    icon: Shield,
    tag: "Security Architecture"
  },
  {
    question: "What is the BYOT (Bring Your Own Tenant) connectivity model?",
    answer: "BYOT lets a developer connect their own non-production S/4HANA sandbox so generated tests can run against a real OData service. It is read-only, credentials are encrypted at rest (AES-256-GCM) in a server-only store, production endpoints are blocked, and every connection is admin-gated (manually reviewed and approved) before activation. Clean-Core.io does not host or persist your ERP data — SAP transaction data is processed statelessly in memory. The feature is free; access is granted by an administrator, not by paying for a tier.",
    icon: Server,
    tag: "Tenant Security"
  },
  {
    question: "How does Clean-Core.io help modernize legacy ABAP?",
    answer: "A deterministic ABAP evidence engine parses the custom code first (classes, reports, function modules, custom Z-tables, SQL) and produces auditable facts — a code inventory, findings, complexity/criticality scores, and a RAP-vs-CAP routing recommendation. Google Gemini then narrates and drafts modern TypeScript/Node.js (CAP) or ABAP Cloud (RAP) on top of that evidence, and can generate draft test suites and BPMN 2.0 blueprints for Signavio. All AI output is a draft for architect review — it accelerates the assessment and complements SAP's own tooling.",
    icon: Cpu,
    tag: "Automation Engine"
  }
];

const glossaryTerms = [
  {
    term: "SAP BTP (Business Technology Platform)",
    definition: "The integration and extension platform for SAP applications. It enables the development of side-by-side extensions, data orchestration, and custom cloud-native business processes separate from the ERP core."
  },
  {
    term: "SAP Cloud Connector",
    definition: "A secure software link that runs inside the customer's on-premise or private cloud network, establishing an encrypted TLS connection to SAP BTP without requiring complex inbound firewall configurations."
  },
  {
    term: "OData (Open Data Protocol)",
    definition: "An OASIS standard protocol defining best practices for building and consuming RESTful APIs. It is the default communication standard for SAP S/4HANA business services."
  },
  {
    term: "CDS (Core Data Services)",
    definition: "The data modeling infrastructure used by SAP. CDS views define database tables, relationships, and service projections declaratively inside both the ABAP environment (RAP) and the Node.js/Java environment (CAP)."
  }
];

export default function KnowledgeClient() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* FAQ Section (2/3 width) */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-xl border border-gray-100 space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-gray-950 flex items-center gap-3">
              <HelpCircle className="text-green-600" /> Frequently Asked Questions
            </h2>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Structured architectural explanations for developers and crawler extraction
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => {
              const isActive = activeFaq === i;
              const Icon = faq.icon;
              return (
                <article 
                  key={i}
                  className={`border border-slate-100 rounded-2xl p-5 cursor-pointer transition-all duration-300 ${isActive ? 'bg-green-50/20 border-green-250 ring-1 ring-green-200 shadow-md' : 'bg-slate-50/40 hover:bg-slate-50/80 border-slate-200/50'}`}
                  onClick={() => setActiveFaq(isActive ? null : i)}
                >
                  <header className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-xl border ${isActive ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-white border-slate-200 text-slate-500'} shrink-0`}>
                      <Icon size={20} />
                    </div>
                    <div className="space-y-1 flex-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-green-600 bg-green-500/10 px-2 py-0.5 rounded">
                        {faq.tag}
                      </span>
                      <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-snug pt-1">
                        {faq.question}
                      </h3>
                    </div>
                    <ChevronRight 
                      size={18} 
                      className={`text-slate-400 shrink-0 transition-transform duration-300 mt-2 ${isActive ? 'rotate-90 text-green-650' : ''}`}
                    />
                  </header>
                  
                  {isActive && (
                    <p className="mt-4 text-sm text-slate-700 font-medium leading-relaxed border-t border-slate-200/50 pt-4 animate-in fade-in duration-200">
                      {faq.answer}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {/* Glossary / Definitions Section (1/3 width) */}
      <div className="space-y-6">
        <div className="bg-gradient-to-b from-white to-green-50/10 rounded-[2.5rem] p-8 shadow-xl border border-gray-100 space-y-6">
          <h3 className="text-xl font-black text-gray-950 flex items-center gap-2">
            <Database size={18} className="text-green-600" /> Key Terms
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed font-medium">
            A quick glossary mapping technical SAP terms to modern integration architectures:
          </p>

          <dl className="space-y-6">
            {glossaryTerms.map((term, i) => (
              <div key={i} className="space-y-1 border-l-2 border-green-500/20 pl-3 hover:border-green-500 transition-colors">
                <dt className="font-bold text-sm text-gray-900">{term.term}</dt>
                <dd className="text-xs text-gray-500 leading-relaxed">{term.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

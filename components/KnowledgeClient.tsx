'use client';

import { useState } from 'react';
import {
  HelpCircle, ChevronRight, Database, Shield, FileCode2, RefreshCw, Layers, Server
} from 'lucide-react';
import { CcTag } from '@/components/cc/Tag';
import { BAIP, BAIP_FIRST } from '@/lib/sap-naming';

const faqs = [
  {
    question: "What is the SAP S/4HANA Clean Core strategy?",
    answer: `The Clean Core strategy is an architectural design principle that keeps the SAP standard ERP core software free of custom modifications. Custom extensions are developed either \"in-app\" using key-user extensibility or \"side-by-side\" on the ${BAIP_FIRST}. This decoupling lowers upgrade risk and technical debt: extensions built on released interfaces are far less likely to break on an upgrade, though each upgrade still needs its compatibility and regression testing.`,
    icon: RefreshCw,
    tag: "Clean Core Strategy"
  },
  {
    question: "What is the difference between In-App RAP and Side-by-Side CAP extensions?",
    answer: `In-App RAP (ABAP RESTful Application Programming Model) runs directly within the S/4HANA tenant. It is ideal for extending standard SAP business objects and UI layers using native ABAP in a cloud-compliant way. Side-by-Side CAP (Cloud Application Programming Model) runs externally on ${BAIP}, typically using Node.js or Java. It is designed for standalone cloud-native applications, multi-tenant SaaS products, and integration with non-SAP systems, fully decoupling execution from the ERP core.`,
    icon: Layers,
    tag: "Extensibility Models"
  },
  {
    question: `How does Clean-Core.io secure a side-by-side integration on ${BAIP}?`,
    answer: "Clean-Core.io does not configure anything in your BAIP subaccount or S/4HANA tenant. The usual security pattern for a side-by-side extension is JSON Web Tokens (JWT) validated by the SAP XSUAA (Extended Services for User Account and Authentication) service for stateless API calls with role-based access control (RBAC), and the SAP Connectivity and Destination services routing RFC and OData traffic via SAP Cloud Connector without exposing internal endpoints. Setting that up in your tenant is your team's work; the app provides analysis, design drafts and a read-only connection check, not the deployment.",
    icon: Shield,
    tag: "Security Architecture"
  },
  {
    question: "What is the BYOT (Bring Your Own Tenant) connectivity model?",
    answer: "BYOT lets a developer connect their own non-production S/4HANA sandbox to check the connection, read OData metadata and make one read-only call against a real service. Running the generated tests against the tenant is locked until the isolated live runner has passed its review; tests run against mocks in the isolated test runner. It is read-only, credentials are encrypted at rest (AES-256-GCM) in a server-only store, production endpoints are blocked, and every connection is admin-gated (manually reviewed and approved) before activation. Clean-Core.io does not host or persist your ERP data — SAP transaction data is processed statelessly in memory. The feature is free; access is granted by an administrator, not by paying for a tier.",
    icon: Server,
    tag: "Tenant Security"
  },
  {
    question: "How does Clean-Core.io help modernize legacy ABAP?",
    answer: "A deterministic ABAP evidence engine parses the custom code first (classes, reports, function modules, custom Z-tables, SQL) and produces auditable facts — a code inventory, findings, complexity/criticality scores, and a RAP-vs-CAP routing recommendation. Google Gemini then narrates and drafts modern TypeScript/Node.js (CAP) or ABAP Cloud (RAP) on top of that evidence, and can generate draft test suites and BPMN 2.0 XML blueprints. All AI output is a draft for architect review — it accelerates the assessment; it complements SAP's own tooling and does not replace human judgment.",
    icon: FileCode2,
    tag: "Automation Engine"
  }
];

const glossaryTerms = [
  {
    term: BAIP_FIRST,
    definition: `The integration and extension platform for SAP applications. It enables the development of side-by-side extensions, data orchestration, and custom cloud-native business processes separate from the ERP core. Since SAP Sapphire 2026 it brings the platform together with SAP Business Data Cloud and SAP Business AI; the services and the product name "SAP BTP ABAP environment" continue unchanged.`
  },
  {
    term: "SAP Cloud Connector",
    definition: `A secure software link that runs inside the customer's on-premise or private cloud network, establishing an encrypted TLS connection to ${BAIP} without requiring complex inbound firewall configurations.`
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
        <div className="bg-cc-surface rounded-3xl p-6 sm:p-8 border border-cc-line space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold text-cc-ink flex items-center gap-3">
              <HelpCircle className="text-cc-brand-strong" aria-hidden="true" /> Frequently Asked Questions
            </h2>
            <p className="text-xs text-cc-ink-muted font-bold uppercase tracking-wider">
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
                  className={`border rounded-2xl p-5 transition-all duration-300 ${isActive ? 'bg-cc-brand-surface border-cc-brand ring-1 ring-cc-brand' : 'bg-cc-surface-muted hover:bg-cc-surface border-cc-line'}`}
                >
                  <h3 className="m-0">
                    <button
                      type="button"
                      id={`faq-question-${i}`}
                      aria-expanded={isActive}
                      aria-controls={`faq-answer-${i}`}
                      onClick={() => setActiveFaq(isActive ? null : i)}
                      className="flex items-start gap-4 w-full text-left cursor-pointer"
                    >
                      <div className={`p-2 rounded-xl border ${isActive ? 'bg-cc-surface border-cc-brand text-cc-brand-strong' : 'bg-cc-surface border-cc-line text-cc-ink-muted'} shrink-0`}>
                        <Icon size={20} aria-hidden="true" />
                      </div>
                      <div className="space-y-1 flex-1">
                        <CcTag>{faq.tag}</CcTag>
                        <span className="block font-bold text-cc-ink text-base sm:text-lg leading-snug pt-1">
                          {faq.question}
                        </span>
                      </div>
                      <ChevronRight
                        size={18}
                        aria-hidden="true"
                        className={`shrink-0 transition-transform duration-300 mt-2 ${isActive ? 'rotate-90 text-cc-brand-strong' : 'text-cc-ink-muted'}`}
                      />
                    </button>
                  </h3>

                  {/*
                    The answer stays in the DOM at all times and is only collapsed visually
                    (grid-rows 0fr → 1fr). Rendering it conditionally kept it out of the
                    server HTML entirely, so crawlers that do not execute JavaScript — the
                    majority of LLM crawlers — saw five headings and no substance.
                  */}
                  <div
                    id={`faq-answer-${i}`}
                    /* In the HTML for crawlers, out of the accessibility tree while
                       the button says "collapsed" (QA full review of v2.20.0). */
                    inert={!isActive}
                    role="region"
                    aria-labelledby={`faq-question-${i}`}
                    className={`grid transition-all duration-300 ease-out ${isActive ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <p className="overflow-hidden text-sm text-cc-ink font-medium leading-relaxed border-t border-cc-line pt-4">
                      {faq.answer}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {/* Glossary / Definitions Section (1/3 width) */}
      <div className="space-y-6">
        <div className="bg-cc-surface rounded-3xl p-6 sm:p-8 border border-cc-line space-y-6">
          <h2 className="text-xl font-extrabold text-cc-ink flex items-center gap-2">
            <Database size={18} className="text-cc-brand-strong" aria-hidden="true" /> Key Terms
          </h2>
          <p className="text-sm text-cc-ink-muted leading-relaxed font-medium">
            A quick glossary mapping technical SAP terms to modern integration architectures:
          </p>

          <dl className="space-y-6">
            {glossaryTerms.map((term, i) => (
              <div key={i} className="space-y-1 border-l-2 border-cc-line pl-3 hover:border-cc-brand transition-colors">
                <dt className="font-bold text-sm text-cc-ink">{term.term}</dt>
                <dd className="text-xs text-cc-ink-muted leading-relaxed">{term.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

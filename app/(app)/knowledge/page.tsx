import { jsonLdHtml } from '@/lib/json-ld';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { BookOpen, Layers, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import KnowledgeClient from '@/components/KnowledgeClient';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import CcTable from '@/components/cc/Table';
import { BTP, BTP_FIRST, BUSINESS_AI_PLATFORM_PARTS } from '@/lib/sap-naming';

// Server-side Metadata configuration for SEO & GEO Crawlers
export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Guide: RAP vs CAP & Extensibility Patterns',
  description: 'What SAP clean core is, how to assess readiness, and when to choose in-app RAP or side-by-side CAP — a plain-language guide to clean core extensibility.',
  alternates: {
    canonical: 'https://clean-core.io/knowledge',
  },
  openGraph: {
    title: 'SAP Clean Core Guide: RAP vs CAP & Extensibility Patterns',
    description: 'What SAP clean core is, how to assess readiness, and when to choose in-app RAP or side-by-side CAP — a plain-language guide to clean core extensibility.',
    url: 'https://clean-core.io/knowledge',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
});

const faqs = [
  {
    question: "What is the SAP S/4HANA Clean Core strategy?",
    answer: `The Clean Core strategy is an architectural design principle that keeps the SAP standard ERP core software free of custom modifications. Custom extensions are developed either \"in-app\" using key-user extensibility or \"side-by-side\" on ${BTP_FIRST}. This decoupling lowers upgrade risk and technical debt: extensions built on released interfaces are far less likely to break on an upgrade, though each upgrade still needs its compatibility and regression testing.`
  },
  {
    question: "What is the difference between In-App RAP and Side-by-Side CAP extensions?",
    answer: `In-App RAP (ABAP RESTful Application Programming Model) runs directly within the S/4HANA tenant. It is ideal for extending standard SAP business objects and UI layers using native ABAP in a cloud-compliant way. Side-by-Side CAP (Cloud Application Programming Model) runs externally on ${BTP}, typically using Node.js or Java. It is designed for standalone cloud-native applications, multi-tenant SaaS products, and integration with non-SAP systems, fully decoupling execution from the ERP core.`
  },
  {
    question: `How does Clean-Core.io secure a side-by-side integration on ${BTP}?`,
    answer: "Clean-Core.io does not configure anything in your SAP BTP subaccount or S/4HANA tenant. The usual security pattern for a side-by-side extension is JSON Web Tokens (JWT) validated by the SAP XSUAA (Extended Services for User Account and Authentication) service for stateless API calls with role-based access control (RBAC), and the SAP Connectivity and Destination services routing RFC and OData traffic via SAP Cloud Connector without exposing internal endpoints. Setting that up in your tenant is your team's work; the app provides analysis, design drafts and a read-only connection check, not the deployment."
  },
  {
    question: "What is the BYOT (Bring Your Own Tenant) connectivity model?",
    answer: "BYOT lets a developer connect their own non-production S/4HANA sandbox to check the connection, read OData metadata and make one read-only call against a real service. Running the generated tests against the tenant is locked until the isolated live runner has passed its review; tests run against mocks in the isolated test runner. It is read-only, credentials are encrypted at rest (AES-256-GCM) in a server-only store, production endpoints are blocked, and every connection is admin-gated (manually reviewed and approved) before activation. Clean-Core.io does not host or persist your ERP data — SAP transaction data is processed statelessly in memory. The feature is free; access is granted by an administrator, not by paying for a tier."
  },
  {
    question: "How does Clean-Core.io help modernize legacy ABAP?",
    answer: "A deterministic engine reads the custom ABAP before any language model does. It reconstructs the business process as BPMN, with a line anchor on every element or the reason it has none, lists the business rules hard-coded in the program, and grades every SAP object the code uses Level A–D from SAP's published Cloudification Repository. The Management view then asks for one decision: keep, rebuild, move to SAP standard or retire. Design, Transformation and Testing carry the same evidence to a target design, a code draft in ABAP Cloud (RAP) or CAP, and test scenarios, each marked as a Model proposal for an architect to review, and every completed analysis is stored as a signed run. It complements SAP's own tooling and does not replace human judgment."
  },
  {
    question: "What are the five dimensions of SAP Clean Core?",
    answer: "SAP frames Clean Core across five dimensions: business processes (keep competitiveness while reducing complexity), extensibility (decouple custom extensions from the standard core), data (govern data to current standards), integration (a reliable, flexible landscape), and operations (stay current with patches and upgrades). It is a set of guiding principles for continuous transformation, not a single technical configuration — so 'clean core' means more than just custom-code (technical) debt."
  },
  {
    question: "How do you run a SAP Clean Core assessment?",
    answer: "Assess maturity across all five dimensions honestly. For the extensibility dimension specifically, that means getting object-level visibility into your custom ABAP — what touches standard tables or unreleased objects — and attaching KPIs: a Clean Core Score and an A–D readiness grade — a lookup in SAP’s published object data for SAP objects, an estimate for your own Z/Y objects, so remediation is prioritised. Clean-Core.io provides a free first pass on that extensibility slice; SAP Cloud ALM, LeanIX, Signavio and ATC remain the authoritative, cross-dimension toolchain."
  }
];

const COMPARISON_COLUMNS = [
  { key: 'criterion', label: 'Feature / Criteria' },
  { key: 'rap', label: 'In-App RAP (ABAP RESTful)' },
  { key: 'cap', label: `Side-by-Side CAP (${BTP})` },
] as const;

const COMPARISON_ROWS = [
  { criterion: 'Runtime Environment', rap: 'Directly inside SAP S/4HANA (ABAP stack)', cap: `${BTP} (Node.js, Java, Cloud Foundry/Kyma)` },
  { criterion: 'Primary Use Case', rap: 'Modifying/enhancing standard SAP business logic', cap: 'Standalone apps, partner SaaS, multi-system integration' },
  { criterion: 'Development Languages', rap: 'Modern ABAP (Cloud-enabled subset)', cap: 'JavaScript, TypeScript, Java' },
  { criterion: 'Database Access', rap: 'Native SQL on HANA via CDS views', cap: 'OData, REST, or database targets (HANA, PG, SQLite)' },
  { criterion: 'Core Decoupling', rap: 'High logical coupling (shares SAP memory)', cap: 'Complete architectural separation (connected via APIs)' },
  { criterion: 'Upgrade Impact', rap: 'Low (released SAP APIs stay stable; regression tests still needed)', cap: 'Low (runs separately; the APIs it calls still need testing)' },
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
    <div className="space-y-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      
      {/* JSON-LD Structured Data for AI Crawlers */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(schemaJson) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Header Banner */}
      <div className="bg-cc-surface rounded-3xl p-8 sm:p-12 border border-cc-line">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-cc-brand-surface border border-cc-brand px-4 py-1 rounded-full text-xs font-bold text-cc-brand-strong tracking-wide uppercase">
            <BookOpen size={14} aria-hidden="true" /> Knowledge Hub
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-none text-cc-ink">
            Clean Core & Extensibility <span className="text-cc-brand-strong">Reference Hub</span>
          </h1>
          <p className="text-lg text-cc-ink-muted leading-relaxed max-w-2xl font-medium">
            Discover the technical architectures, security guidelines, and extensibility patterns aligned with SAP's published Clean Core guidelines for S/4HANA.
          </p>
          <p className="text-sm text-cc-ink-muted leading-relaxed max-w-2xl font-medium border-l-2 border-cc-brand pl-4">
            Naming note: the platform for side-by-side extensions is{' '}
            <strong className="text-cc-ink">{BTP_FIRST}</strong>. SAP presented that portfolio at Sapphire 2026;
            it bundles {BUSINESS_AI_PLATFORM_PARTS}. {BTP} keeps its name inside it, and so do the concrete
            services &mdash; SAP shipped releases under the name &ldquo;SAP BTP ABAP environment&rdquo; as
            recently as August 2026. We use SAP&apos;s own names for the services and {BTP} for the
            platform around them.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block */}
      <QuickAnswer
        question="What is the SAP Clean Core approach, and how do you assess readiness?"
        answer="SAP Clean Core is a set of guiding principles for keeping the S/4HANA core standard and upgradeable across five dimensions — business processes, extensibility (custom code), data, integration, and operations. A Clean Core assessment measures maturity across those dimensions. For the extensibility dimension specifically it means getting object-level visibility into custom ABAP (what touches standard tables or unreleased objects) and attaching KPIs — a Clean Core Score and an A–D readiness grade — a lookup in SAP’s published object data for SAP objects, an estimate for your own Z/Y objects — so the highest-risk objects are remediated first. It is complementary to SAP ADT/ATC and the SAP toolchain (Cloud ALM, LeanIX, Signavio), which remain the authoritative checks."
      />

      {/* Interactive FAQ & Glossary client component */}
      <KnowledgeClient />

      {/* Comparison Table Section (RAG-crawler-friendly) */}
      <div className="bg-cc-surface rounded-3xl p-6 sm:p-8 border border-cc-line space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-extrabold text-cc-ink flex items-center gap-3">
            <Layers className="text-cc-brand-strong" aria-hidden="true" /> Extensibility Paradigm Comparison
          </h2>
          <p className="text-xs text-cc-ink-muted font-bold uppercase tracking-wider">
            Decision framework comparing the RAP route on SAP S/4HANA and the CAP route on {BTP}
          </p>
        </div>

        <CcTable
          caption="Extensibility paradigm comparison: In-App RAP versus Side-by-Side CAP"
          columns={COMPARISON_COLUMNS}
          rows={COMPARISON_ROWS.map((r) => ({
            key: r.criterion,
            cells: { criterion: <strong className="font-bold">{r.criterion}</strong>, rap: r.rap, cap: r.cap },
          }))}
        />
      </div>

      {/* How Clean-Core.io applies this — the 3.0 chain (roadmap 3.0.8, item 2).
          It replaced a "Clean Core Aligned Strategy" badge that claimed SAP Cloud SDK
          conformance the product does not establish. */}
      <section className="bg-cc-brand-surface rounded-3xl p-8 md:p-12 border border-cc-line space-y-6" aria-labelledby="chain-title">
        <div className="max-w-3xl space-y-3">
          <h2 id="chain-title" className="text-2xl md:text-3xl font-extrabold text-cc-ink tracking-tight">
            How Clean-Core.io applies this to one ABAP program
          </h2>
          <p className="text-sm text-cc-ink-muted leading-relaxed font-medium">
            The extensibility dimension, one program at a time, on one chain of evidence:
          </p>
        </div>
        <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm font-medium leading-relaxed text-cc-ink">
          <li><strong>Process:</strong> the business process read from the code as BPMN, with a line anchor on every element or the reason it has none, and the business rules hard-coded in the program.</li>
          <li><strong>Level A–D:</strong> every SAP object the code uses, graded from SAP&apos;s published Cloudification Repository and object classification under a versioned rule — an orientation; ABAP Test Cockpit stays the authority.</li>
          <li><strong>Decision:</strong> keep, rebuild, move to SAP standard or retire, in the Management view, recorded by the signed-in account.</li>
          <li><strong>Design, code draft, tests:</strong> on the same evidence, each a Model proposal for a person to review.</li>
          <li><strong>Signature:</strong> every completed analysis is stored as an immutable run signed by the server.</li>
        </ol>
        <Link href="/how-it-works" className="inline-flex items-center gap-2 text-cc-brand-strong font-bold text-sm underline-offset-2 hover:underline">
          How it works, step by step, and where it stops <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </section>

      {/* Related tools & guides (internal linking) */}
      <div className="bg-cc-surface rounded-3xl p-6 sm:p-8 border border-cc-line space-y-4">
        <h2 className="text-xl font-extrabold text-cc-ink">Related tools &amp; guides</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-bold text-sm">
          <Link href="/clean-core-explained" className="block text-cc-brand-strong underline-offset-2 hover:underline">→ SAP Clean Core, explained from scratch</Link>
          <Link href="/abap-custom-code-analysis" className="block text-cc-brand-strong underline-offset-2 hover:underline">→ Free ABAP static code analysis</Link>
          <Link href="/clean-core-score" className="block text-cc-brand-strong underline-offset-2 hover:underline">→ What is the Clean Core Score?</Link>
          <Link href="/sap-clean-core-object-classification" className="block text-cc-brand-strong underline-offset-2 hover:underline">→ Clean Core object classification (A–D)</Link>
          <Link href="/sap-cloudification" className="block text-cc-brand-strong underline-offset-2 hover:underline">→ SAP cloudification (cloudify ABAP)</Link>
        </div>
      </div>

      {/* Further reading (SAP Community, external) */}
      <div className="bg-cc-surface rounded-3xl p-6 sm:p-8 border border-cc-line space-y-3">
        <h2 className="text-xl font-extrabold text-cc-ink">Further reading</h2>
        <a
          href="https://community.sap.com/t5/technology-blog-posts-by-members/you-can-t-clean-what-you-can-t-see-visibility-and-kpis-for-the/ba-p/14448151"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-cc-brand-strong underline-offset-2 hover:underline font-bold text-sm"
        >
          → You can&apos;t clean what you can&apos;t see: visibility &amp; KPIs for the Extensibility dimension (SAP Community) ↗
        </a>
      </div>

    </div>
  );
}

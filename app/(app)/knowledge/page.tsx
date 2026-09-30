import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { BookOpen, Layers, Check } from 'lucide-react';
import Link from 'next/link';
import KnowledgeClient from '@/components/KnowledgeClient';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import CcTable from '@/components/cc/Table';

// Server-side Metadata configuration for SEO & GEO Crawlers
export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Guide: RAP vs CAP & Extensibility Patterns',
  description: 'What SAP Clean Core is (its five dimensions), how to assess readiness, and the In-App RAP vs Side-by-Side CAP decision — a plain-language guide to clean-core extensibility patterns and upgrade-safe SAP development.',
  alternates: {
    canonical: 'https://clean-core.io/knowledge',
  },
  openGraph: {
    title: 'SAP Clean Core Guide: RAP vs CAP & Extensibility Patterns',
    description: 'What SAP Clean Core is (its five dimensions), how to assess readiness, and the In-App RAP vs Side-by-Side CAP decision — a plain-language guide to clean-core extensibility patterns and upgrade-safe SAP development.',
    url: 'https://clean-core.io/knowledge',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
});

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
    answer: "BYOT lets a developer connect their own non-production S/4HANA sandbox to check the connection, read OData metadata and make one read-only call against a real service. Running the generated tests against the tenant is locked until the isolated live runner has passed its review; tests run against mocks in the isolated test runner. It is read-only, credentials are encrypted at rest (AES-256-GCM) in a server-only store, production endpoints are blocked, and every connection is admin-gated (manually reviewed and approved) before activation. Clean-Core.io does not host or persist your ERP data — SAP transaction data is processed statelessly in memory. The feature is free; access is granted by an administrator, not by paying for a tier."
  },
  {
    question: "How does Clean-Core.io help modernize legacy ABAP?",
    answer: "A deterministic ABAP evidence engine parses the custom code first (classes, reports, function modules, custom Z-tables, SQL) and produces auditable facts — a code inventory, findings, complexity/criticality scores, and a RAP-vs-CAP routing recommendation. Google Gemini then narrates and drafts modern TypeScript/Node.js (CAP) or ABAP Cloud (RAP) on top of that evidence, and can generate draft test suites and BPMN 2.0 XML blueprints. All AI output is a draft for architect review — it accelerates the assessment; it complements SAP's own tooling and does not replace human judgment."
  },
  {
    question: "What are the five dimensions of SAP Clean Core?",
    answer: "SAP frames Clean Core across five dimensions: business processes (keep competitiveness while reducing complexity), extensibility (decouple custom extensions from the standard core), data (govern data to current standards), integration (a reliable, flexible landscape), and operations (stay current with patches and upgrades). It is a set of guiding principles for continuous transformation, not a single technical configuration — so 'clean core' means more than just custom-code (technical) debt."
  },
  {
    question: "How do you run a SAP Clean Core assessment?",
    answer: "Assess maturity across all five dimensions honestly. For the extensibility dimension specifically, that means getting object-level visibility into your custom ABAP — what touches standard tables or unreleased objects — and attaching KPIs: a Clean Core Score and an A–D readiness grade derived from SAP’s own published object data, so remediation is prioritised. Clean-Core.io provides a free first pass on that extensibility slice; SAP Cloud ALM, LeanIX, Signavio and ATC remain the authoritative, cross-dimension toolchain."
  }
];

const COMPARISON_COLUMNS = [
  { key: 'criterion', label: 'Feature / Criteria' },
  { key: 'rap', label: 'In-App RAP (ABAP RESTful)' },
  { key: 'cap', label: 'Side-by-Side CAP (SAP BTP)' },
] as const;

const COMPARISON_ROWS = [
  { criterion: 'Runtime Environment', rap: 'Directly inside SAP S/4HANA (ABAP stack)', cap: 'SAP BTP (Node.js, Java, Cloud Foundry/Kyma)' },
  { criterion: 'Primary Use Case', rap: 'Modifying/enhancing standard SAP business logic', cap: 'Standalone apps, partner SaaS, multi-system integration' },
  { criterion: 'Development Languages', rap: 'Modern ABAP (Cloud-enabled subset)', cap: 'JavaScript, TypeScript, Java' },
  { criterion: 'Database Access', rap: 'Native SQL on HANA via CDS views', cap: 'OData, REST, or database targets (HANA, PG, SQLite)' },
  { criterion: 'Core Decoupling', rap: 'High logical coupling (shares SAP memory)', cap: 'Complete architectural separation (connected via APIs)' },
  { criterion: 'Upgrade Impact', rap: 'Zero impact (uses officially released SAP APIs)', cap: 'Zero impact (completely independent execution)' },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
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
            Clean Core & BTP <span className="text-cc-brand-strong">Reference Hub</span>
          </h1>
          <p className="text-lg text-cc-ink-muted leading-relaxed max-w-2xl font-medium">
            Discover the technical architectures, security guidelines, and extensibility patterns aligned with SAP's published Clean Core guidelines for S/4HANA.
          </p>
          <p className="text-sm text-cc-ink-muted leading-relaxed max-w-2xl font-medium border-l-2 border-cc-brand pl-4">
            Naming note: since SAP Sapphire 2026, SAP BTP sits under the{' '}
            <strong className="text-cc-ink">SAP Business AI Platform (BAIP)</strong> umbrella together with
            SAP Business Data Cloud and SAP Business AI. This is a portfolio consolidation, not a retirement of
            SAP BTP &mdash; the services keep their names, and SAP shipped releases under the name &ldquo;SAP BTP
            ABAP environment&rdquo; as recently as August 2026. We use SAP BTP for the concrete services and
            SAP BAIP for the portfolio around them.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block */}
      <QuickAnswer
        question="What is the SAP Clean Core approach, and how do you assess readiness?"
        answer="SAP Clean Core is a set of guiding principles for keeping the S/4HANA core standard and upgradeable across five dimensions — business processes, extensibility (custom code), data, integration, and operations. A Clean Core assessment measures maturity across those dimensions. For the extensibility dimension specifically it means getting object-level visibility into custom ABAP (what touches standard tables or unreleased objects) and attaching KPIs — a Clean Core Score and an A–D readiness grade derived from SAP’s own published object data — so the highest-risk objects are remediated first. It is complementary to SAP ADT/ATC and the SAP toolchain (Cloud ALM, LeanIX, Signavio), which remain the authoritative checks."
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
            Decision framework comparing SAP RAP and BTP CAP extension routes
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

      {/* SAP Compliance Badge Section */}
      <div className="bg-cc-brand-surface rounded-3xl p-8 md:p-12 border border-cc-line space-y-6">
        <div className="max-w-3xl space-y-3">
          <h3 className="text-2xl md:text-3xl font-extrabold text-cc-ink tracking-tight">
            Clean Core Extensibility Alignment
          </h3>
          <p className="text-sm text-cc-ink-muted leading-relaxed font-medium">
            Clean-Core.io leverages standard SAP technologies, securing transactions according to the SAP Cloud SDK guidelines. Keep your ERP core system upgradeable while expanding functionality with cloud-native scalability.
          </p>
          <div className="inline-flex items-center gap-2 text-cc-brand-strong font-bold text-xs uppercase tracking-widest pt-4">
            Clean Core Aligned Strategy <Check size={14} className="stroke-[3]" aria-hidden="true" />
          </div>
        </div>
      </div>

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

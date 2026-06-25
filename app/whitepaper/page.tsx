import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldCheck, FileText, ArrowRight, RotateCw, CheckCircle2 } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

export const metadata: Metadata = {
  title: 'S/4HANA Modernization Whitepaper — Edition 2.0 | Clean-Core.io',
  description: 'From legacy ABAP inventory to governed target-architecture decisions. A structured path from unknown custom code to architect-reviewed modernization choices.',
  alternates: {
    canonical: 'https://clean-core.io/whitepaper',
  },
  openGraph: {
    title: 'S/4HANA Modernization Whitepaper — Edition 2.0 | Clean-Core.io',
    description: 'From legacy ABAP inventory to governed target-architecture decisions. Assessment, decision tree, compliance audit pack and security model.',
    url: 'https://clean-core.io/whitepaper',
    type: 'article',
    siteName: 'Clean-Core.io',
  },
};

/* ─── Data arrays (content-driven, as per design spec) ─── */

const deliverables = [
  'A modernization assessment before transformation starts.',
  'A custom-code and integration-risk inventory.',
  'A Clean-Core decision tree with recommended target architecture.',
  'Draft implementations for RAP, CAP or integration patterns.',
  'Test stubs and validation checklists.',
  'BPMN / SOP documentation for business review.',
  'A compliance and audit pack per project.',
];

const assessmentRows = [
  { label: 'Custom-code inventory', desc: 'Programs, classes, function modules, includes, exits, enhancements, forms, tables and generated artifacts.' },
  { label: 'Table access analysis', desc: 'Direct SELECT / UPDATE / INSERT / DELETE usage, joins on SAP standard tables, Z-table dependencies and data-ownership risks.' },
  { label: 'API & release analysis', desc: 'Released APIs, unreleased APIs, private classes, obsolete function modules and compatibility concerns.' },
  { label: 'Legacy pattern findings', desc: 'Dynpro, RFC, update task, batch input, BAPI, user exits, implicit enhancements and background jobs.' },
  { label: 'Complexity scoring', desc: 'Size, coupling, number of dependencies, critical table access, testability and modernization effort.' },
  { label: 'Business criticality', desc: 'Process area, user volume, frequency, financial impact, regulatory relevance and operational fallback.' },
  { label: 'Recommended target architecture', desc: 'Key User Extensibility, Developer Extensibility / RAP, Side-by-Side CAP, Integration Suite, Event Mesh or Retire.' },
];

const decisionTree = [
  { option: 'Key User Extensibility', use: 'Field additions, simple validations, UI adaptations and low-risk process variants via released in-app tooling.', avoid: 'Logic is complex, integration-heavy or needs custom lifecycle control.', output: 'Configuration guidance and implementation checklist.' },
  { option: 'Developer Extensibility / RAP', use: 'Logic belongs close to S/4HANA, needs transactional consistency and can use released ABAP Cloud APIs.', avoid: 'Scenario depends on unreleased objects or external channels dominate the design.', output: 'RAP BO draft, CDS / service model, ABAP Unit stubs.' },
  { option: 'Side-by-Side CAP', use: 'Process can be decoupled, needs independent release cycles, external UX or cloud-native integration.', avoid: 'Tight synchronous locking or direct core updates are required.', output: 'CAP service draft, data model, API facade and test suite.' },
  { option: 'Integration Suite', use: 'Main problem is orchestration, API mediation, mapping, routing or partner connectivity.', avoid: 'Custom business state and complex domain logic are central.', output: 'Integration-flow blueprint, mappings and monitoring controls.' },
  { option: 'Event Mesh', use: 'Benefits from asynchronous decoupling, event-driven updates and loose consumer coupling.', avoid: 'Immediate consistency and synchronous confirmation are mandatory.', output: 'Event model, topic design and subscriber contract.' },
  { option: 'Retire', use: 'No usage, duplicate functionality, or replaceable by standard SAP capability.', avoid: 'Business ownership or audit retention is unclear.', output: 'Retirement proposal, validation checklist and decommission plan.' },
];

const auditPack = [
  { title: 'Input fingerprint', desc: 'Timestamp, uploaded file hash, project ID, user / tenant context and processing configuration.' },
  { title: 'Mapping rules', desc: 'Source patterns, matched rules, confidence levels, rejected alternatives and manual override notes.' },
  { title: 'Model evidence', desc: 'Model / provider, prompt-template version, policy version, settings and generation timestamp.' },
  { title: 'Review checklist', desc: 'Architecture, security, privacy, SAP release check, test evidence and owner sign-off.' },
  { title: 'Known limitations', desc: 'Unsupported ABAP constructs, incomplete metadata, assumptions and low-confidence mappings.' },
  { title: 'Data protection & tenant notes', desc: 'Processing region, storage scope, credential handling, retention / deletion status and BYOK status.' },
];

const securityControls = [
  'Use non-production or representative code for the public pilot, unless a customer-specific agreement is in place.',
  'Keep AI-provider keys, platform secrets and tenant credentials separated by responsibility and storage boundary.',
  'Store only what the workflow requires, and define retention and deletion behavior clearly.',
  'Document which data is sent to AI providers, which region processes it, and which contractual terms apply.',
  'Make tenant connectivity read-scoped by design where possible, admin-approved and auditable.',
  'Treat generated output as draft material that requires expert review before production use.',
];

const workflowSteps = [
  'Upload a legacy ABAP package, representative extract or code sample.',
  'Generate the modernization assessment and risk inventory.',
  'Review findings by object, process area and risk category.',
  'Use the Clean-Core decision tree to choose the target pattern.',
  'Generate a draft implementation and test scaffold.',
  'Validate APIs, tenant metadata and business assumptions.',
  'Export the delivery package and compliance / audit pack.',
  'Complete expert review before productive implementation.',
];

const exampleFindings = [
  { finding: 'Direct SELECT on KNA1', risk: 'Upgrade fragility and unreleased data dependency.', path: 'Replace with released customer API / CDS view where suitable.' },
  { finding: 'Direct access to BSEG', risk: 'High financial and performance risk.', path: 'Use released journal-entry interfaces and explicit finance review.' },
  { finding: 'Batch input for transaction flow', risk: 'UI coupling and fragile automation.', path: 'Replace with released APIs, RAP behavior or integration flow.' },
  { finding: 'Update-task function module', risk: 'Hidden side effects and transaction coupling.', path: 'Redesign transaction boundary and test failure behavior.' },
  { finding: 'Unused Z report', risk: 'Maintenance cost without value.', path: 'Validate usage and retire.' },
];

const qualityCards = [
  'Unit-test stubs for generated RAP / CAP drafts.',
  'API contract checks and schema validation.',
  'Security review checklist for credentials, authorization and data flow.',
  'Business SOP and BPMN export for process owners.',
  'Clean-Core score and remediation backlog.',
  'Manual-review gates for low-confidence mappings.',
];

/* ─── Component ─── */

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-green-600 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4" />
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-gray-900 leading-none">Clean-Core<span className="text-green-600">.io</span></span>
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 mt-0.5">Whitepaper</span>
            </div>
          </Link>
          <a 
            href="/Clean-Core_S4HANA_Modernization_Whitepaper.pdf"
            download
            className="flex items-center gap-2 text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider px-4 py-2 rounded-full border border-gray-200 hover:border-green-400 bg-white/70 backdrop-blur-sm"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </a>
        </div>
      </header>

      {/* ─── Cover / Hero ─── */}
      <section className="relative py-24 md:py-36 overflow-hidden bg-slate-50/30">
        {/* Grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808006_1px,transparent_1px),linear-gradient(to_bottom,#80808006_1px,transparent_1px)] bg-[size:40px_40px] z-0" />
        {/* Gradient blobs */}
        <div className="absolute top-[15%] left-[8%] w-[340px] h-[340px] bg-emerald-300 rounded-full blur-[120px] opacity-20 z-0 pointer-events-none" />
        <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-indigo-300 rounded-full blur-[140px] opacity-15 z-0 pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs mb-8 border border-emerald-100 shadow-sm">
            <ShieldCheck className="w-4 h-4" />
            <span className="uppercase tracking-wider">Community Pilot · Edition 2.0</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-7xl font-black tracking-tighter mb-6 leading-[0.9] text-gray-950">
            S/4HANA Modernization Assessment &{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">
              Clean-Core Decision Support
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
            From legacy ABAP inventory to governed target-architecture decisions — a structured path from unknown custom code to architect-reviewed modernization choices.
          </p>

          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto text-left">
            {[
              { label: 'Author', value: 'Felix Frenzel' },
              { label: 'Platform', value: 'Clean-Core.io' },
              { label: 'Classification', value: 'Public · Community Guide' },
              { label: 'Date', value: 'June 2026' },
            ].map((m) => (
              <div key={m.label} className="bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">{m.label}</div>
                <div className="text-sm font-semibold text-gray-800">{m.value}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-6 max-w-xl mx-auto">
            Audience: SAP enterprise architects · transformation leads · security reviewers · audit teams · implementation partners
          </p>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-6 py-16 md:py-24 space-y-28">

        {/* ─── Section 01: Executive Summary ─── */}
        <section id="executive-summary">
          <SectionEyebrow number="01" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-6">
            Executive Summary
          </h2>
          <p className="text-gray-600 leading-relaxed mb-6">
            S/4HANA transformations rarely fail because teams do not understand the Clean Core principle. They fail because legacy systems contain years of custom ABAP, Z tables, direct database reads, unreleased APIs, batch inputs, update tasks, Dynpro logic, RFC dependencies and business-critical exceptions that are difficult to classify.
          </p>
          <p className="text-gray-600 leading-relaxed mb-8">
            Clean-Core.io helps teams turn this uncertainty into a structured modernization backlog. The platform analyzes legacy custom code, identifies technical and compliance risks, recommends a Clean-Core target pattern and generates reviewable implementation drafts.
          </p>

          {/* Goal callout */}
          <div className="bg-emerald-50/70 border border-emerald-200 border-l-4 border-l-green-600 rounded-xl p-6 mb-8">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-green-700 mb-2">The Goal</div>
            <p className="text-sm text-gray-700 leading-relaxed">
              Not automatic production migration — but a faster, more transparent path from unknown legacy custom code to architect-reviewed modernization decisions.
            </p>
          </div>

          {/* What it is / is not */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-2xl p-6">
              <div className="text-xs font-black uppercase tracking-wider text-green-700 mb-3">What it is</div>
              <p className="text-sm text-gray-600 leading-relaxed">
                A prototyping, assessment and governance accelerator — fast enough for exploration, structured enough for governance, honest enough for enterprise review.
              </p>
            </div>
            <div className="bg-red-50/50 border border-red-200/70 rounded-2xl p-6">
              <div className="text-xs font-black uppercase tracking-wider text-red-700 mb-3">What it is not</div>
              <p className="text-sm text-gray-600 leading-relaxed">
                A replacement for enterprise-architecture approval, SAP release checks, privacy review, penetration testing or production migration governance.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Section 02: Platform Deliverables ─── */}
        <section id="platform-deliverables">
          <SectionEyebrow number="02" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            What Clean-Core.io Produces
          </h2>
          <p className="text-gray-600 leading-relaxed mb-8">
            Clean-Core.io is an accelerator for governed modernization work. Code generation is valuable — but the decision evidence around it is what enterprise teams trust.
          </p>
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            {deliverables.map((item, i) => (
              <div key={i} className={`flex items-start gap-4 p-4 ${i !== deliverables.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xs font-black text-green-700">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed pt-1">{item}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 03: Modernization Assessment ─── */}
        <section id="modernization-assessment">
          <SectionEyebrow number="03" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            Modernization Assessment Before Transformation
          </h2>
          <p className="text-gray-600 leading-relaxed mb-8">
            Before any refactoring starts, the platform creates a project assessment report — a shared view of what exists, how risky it is, and which target architecture fits.
          </p>
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            {assessmentRows.map((row, i) => (
              <div key={i} className={`flex flex-col sm:flex-row gap-2 sm:gap-6 p-4 ${i !== assessmentRows.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex-shrink-0 sm:w-56 text-xs font-black uppercase tracking-wider text-green-700 pt-0.5">{row.label}</div>
                <p className="text-sm text-gray-600 leading-relaxed">{row.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 04: Clean-Core Decision Tree ─── */}
        <section id="decision-tree">
          <SectionEyebrow number="04" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            Clean-Core Decision Tree
          </h2>
          <p className="text-gray-600 leading-relaxed mb-8">
            A decision tree explains why a recommendation was made — and which alternatives were rejected.
          </p>

          {/* Desktop table */}
          <div className="hidden md:block border border-gray-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1.1fr_1.5fr_1.3fr_1.3fr] bg-slate-900 text-white">
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-emerald-400 border-r border-slate-700">Decision option</div>
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400 border-r border-slate-700">Use when</div>
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400 border-r border-slate-700">Avoid when</div>
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400">Typical output</div>
            </div>
            {decisionTree.map((row, i) => (
              <div key={i} className={`grid grid-cols-[1.1fr_1.5fr_1.3fr_1.3fr] ${i !== decisionTree.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="p-4 text-xs font-bold text-green-700 border-r border-gray-100">{row.option}</div>
                <div className="p-4 text-xs text-gray-600 leading-relaxed border-r border-gray-100">{row.use}</div>
                <div className="p-4 text-xs text-gray-600 leading-relaxed border-r border-gray-100">{row.avoid}</div>
                <div className="p-4 text-xs text-gray-600 leading-relaxed">{row.output}</div>
              </div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {decisionTree.map((row, i) => (
              <div key={i} className="border border-gray-200 rounded-2xl p-5 space-y-3">
                <div className="text-sm font-black text-green-700">{row.option}</div>
                <div className="space-y-2">
                  <div><span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Use when: </span><span className="text-xs text-gray-600">{row.use}</span></div>
                  <div><span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Avoid when: </span><span className="text-xs text-gray-600">{row.avoid}</span></div>
                  <div><span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Output: </span><span className="text-xs text-gray-600">{row.output}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 05: Compliance & Audit Pack ─── */}
        <section id="compliance-audit">
          <SectionEyebrow number="05" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            Compliance & Audit Pack Per Project
          </h2>
          <p className="text-gray-600 leading-relaxed mb-8">
            Enterprise customers need evidence. Every project export includes an audit pack documenting what the platform saw, what it decided, and what limitations remain.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {auditPack.map((card) => (
              <div key={card.title} className="border border-gray-200 rounded-2xl p-5">
                <div className="text-xs font-black uppercase tracking-wider text-gray-900 mb-2">{card.title}</div>
                <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 border-l-4 border-l-green-600 rounded-xl p-6">
            <p className="text-sm text-gray-700 leading-relaxed">
              Downloadable with the implementation ZIP — the bridge between prototype speed and enterprise governance.
            </p>
          </div>
        </section>

        {/* ─── Section 06: Security & Data Handling ─── */}
        <section id="security">
          <SectionEyebrow number="06" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            Security & Data Handling
          </h2>
          <p className="text-gray-600 leading-relaxed mb-8">
            The security model is described as implemented controls, intended scope and review boundaries — not as unconditional guarantees. This wording fits enterprise procurement expectations.
          </p>
          <div className="space-y-4">
            {securityControls.map((ctrl, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2.5 h-2.5 rounded-sm bg-green-600 mt-1.5" />
                <p className="text-sm text-gray-600 leading-relaxed">{ctrl}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 07: Reference Workflow ─── */}
        <section id="reference-workflow">
          <SectionEyebrow number="07" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            Reference Workflow
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workflowSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50/80 border border-gray-200/70 rounded-xl p-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xs font-black text-green-700">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed pt-1">{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 08: Example Findings ─── */}
        <section id="example-findings">
          <SectionEyebrow number="08" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            Example Findings
          </h2>

          {/* Desktop table */}
          <div className="hidden md:block border border-gray-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1.2fr_1.3fr_1.5fr] bg-slate-900 text-white">
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-emerald-400 border-r border-slate-700">Legacy finding</div>
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400 border-r border-slate-700">Risk</div>
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400">Recommended modernization path</div>
            </div>
            {exampleFindings.map((row, i) => (
              <div key={i} className={`grid grid-cols-[1.2fr_1.3fr_1.5fr] ${i !== exampleFindings.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="p-4 text-xs font-mono font-bold text-green-700 border-r border-gray-100">{row.finding}</div>
                <div className="p-4 text-xs text-red-700/80 leading-relaxed border-r border-gray-100">{row.risk}</div>
                <div className="p-4 text-xs text-gray-600 leading-relaxed">{row.path}</div>
              </div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {exampleFindings.map((row, i) => (
              <div key={i} className="border border-gray-200 rounded-2xl p-5 space-y-2">
                <div className="text-sm font-mono font-bold text-green-700">{row.finding}</div>
                <div><span className="text-[10px] font-black uppercase tracking-wider text-red-500">Risk: </span><span className="text-xs text-gray-600">{row.risk}</span></div>
                <div><span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Path: </span><span className="text-xs text-gray-600">{row.path}</span></div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 09: Quality Engineering ─── */}
        <section id="quality-engineering">
          <SectionEyebrow number="09" total="10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">
            Quality Engineering
          </h2>
          <p className="text-gray-600 leading-relaxed mb-8">
            Modernization is not complete when code compiles. The platform generates test and review evidence:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {qualityCards.map((card, i) => (
              <div key={i} className="border border-gray-200 rounded-2xl p-5 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600 leading-relaxed">{card}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section 10: Call to Action ─── */}
        <section id="get-started">
          <SectionEyebrow number="10" total="10" />
          <div className="bg-slate-900 text-white rounded-[2rem] p-8 sm:p-12 border border-slate-800 shadow-2xl relative overflow-hidden">
            {/* Ambient glows */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.06),transparent_45%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(245,158,11,0.04),transparent_40%)] pointer-events-none" />

            <div className="relative z-10 space-y-6">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-white leading-tight">
                Start with a non-production sample
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                Use Clean-Core.io to create the first modernization assessment, review the decision tree with your SAP architect and export a governed delivery package for the next implementation step.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
                Clean-Core.io is a practical accelerator for expert teams: fast enough for exploration, structured enough for governance and honest enough for enterprise review.
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-4 pt-2">
                <Link
                  href="/?auth=signin"
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-8 py-4 rounded-xl font-black text-sm transition-all shadow-lg hover:shadow-2xl hover:-translate-y-0.5"
                >
                  Get started <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="/Clean-Core_S4HANA_Modernization_Whitepaper.pdf"
                  download
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-6 py-4 rounded-xl font-bold text-sm transition-all border border-white/10"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </a>
              </div>
            </div>

            {/* Author sign-off */}
            <div className="relative z-10 mt-10 pt-8 border-t border-white/10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 font-black text-lg">
                FF
              </div>
              <div>
                <div className="text-sm font-bold text-white">Felix Frenzel</div>
                <div className="text-xs text-slate-400">Founder & Community Architect · Bamberg, Germany</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="bg-slate-900 p-1 rounded-md">
              <div className="w-2 h-2 rounded-sm bg-green-600" />
            </div>
            <span className="font-bold text-gray-600">Clean-Core<span className="text-gray-400">.io</span></span>
          </div>
          <span>Modernization Whitepaper · Edition 2.0 · v{APP_VERSION}</span>
          <Link href="/impressum" className="hover:text-green-600 transition-colors">Impressum</Link>
        </div>
      </footer>
    </div>
  );
}

/* ─── Reusable subcomponent ─── */

function SectionEyebrow({ number, total }: { number: string; total: string }) {
  return (
    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-green-600 mb-3">
      Section {number} / {total}
    </div>
  );
}

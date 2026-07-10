/**
 * Content for the six landing "Learn more" feature subpages (/features/[slug]).
 * Sourced from the existing landing copy, the chatbot knowledge base and the docs —
 * kept honest (every page states its limitations) and on-narrative for v2.0.
 */
export interface FeatureContent {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  stage: string;
  what: string[];
  capabilities: string[];
  limitations: string[];
  related: { href: string; label: string }[];
}

export const FEATURES: FeatureContent[] = [
  {
    slug: 'extensibility-routing',
    title: 'Extensibility Routing & Sign-Off',
    eyebrow: 'Architecture decision',
    summary:
      'Classify custom ABAP against SAP Clean Core guidelines, get a deterministic RAP-vs-CAP recommendation, and gate transformation behind an explicit architect sign-off.',
    stage: 'Stage 2 — Solution Design',
    what: [
      'Before any code is generated, Clean-Core.io classifies each piece of legacy custom logic against SAP’s Clean Core extensibility guidelines and routes it to the right target track: In-App Developer Extensibility (ABAP Cloud / RAP) or Side-by-Side on SAP Business Technology Platform (CAP).',
      'The recommendation is deterministic — derived from the evidence engine (data coupling, released-API usage, transaction semantics) — not guessed by a language model.',
    ],
    capabilities: [
      'Automatic In-App RAP vs Side-by-Side CAP recommendation with a confidence score and justification',
      'Explicit architect sign-off gate before transformation, with an optional override + reason captured in the audit trail',
      'The decision is recorded against the immutable, HMAC-signed analysis run',
    ],
    limitations: [
      'The routing is a recommendation for a qualified architect to review — not a binding decision.',
      'The sign-off is self-attested (recorded from your own session), not a formal organizational approval or a governed workflow.',
    ],
    related: [
      { href: '/sap-clean-core-object-classification', label: 'SAP Object Classification (A–D)' },
      { href: '/how-it-works', label: 'How it works' },
    ],
  },
  {
    slug: 'cloudification-catalog',
    title: 'SAP Cloudification Catalog',
    eyebrow: 'Released-API mapping',
    summary:
      'Map legacy objects to their released S/4HANA successors using SAP’s official Cloudification Repository — the same source behind SAP ATC — plus curated field-level mappings.',
    stage: 'Stage 1–2 — Analyze & Design',
    what: [
      'Every standard object your code touches is matched against SAP’s official Cloudification Repository — the public dataset that also backs SAP ABAP Test Cockpit (ATC) Clean Core checks — enriched with hand-curated field-level mappings to released APIs and CDS views.',
      'The catalog is weekly auto-synced, versioned and audit-traceable, and is browsable as a public reference at /catalog.',
    ],
    capabilities: [
      'Look up any SAP standard object’s Clean Core readiness and released successor',
      'Direct table reads (e.g. VBAK, BSEG) mapped to released CDS views / OData APIs',
      'Versioned & audit-traceable — every mapping is attributable to a catalog version',
    ],
    limitations: [
      'It is reference data to accelerate assessment — not a replacement for SAP ATC / ADT, which remain the authoritative checks.',
      'Objects without a released successor are flagged, not invented; unreleased APIs must be confirmed with SAP before production use.',
    ],
    related: [
      { href: '/catalog', label: 'Browse the catalog' },
      { href: '/how-it-works', label: 'How it works' },
    ],
  },
  {
    slug: 'rap-cap-engine',
    title: 'Dual RAP & CAP Engine',
    eyebrow: 'Code transformation',
    summary:
      'Generate clean In-App ABAP Cloud (RAP) handlers or decoupled BTP CAP services, with a deterministic dependency resolver that reduces structural AI hallucinations.',
    stage: 'Stage 3 — Transformation',
    what: [
      'Depending on the routing decision, the engine drafts either In-App ABAP Cloud RAP artifacts or decoupled Side-by-Side CAP (Node.js / TypeScript) services.',
      'A deterministic dependency resolver linearizes object-oriented inheritance chains (MRO), maps constructors and interface aliases, and grounds the translation in released APIs before the language model runs — reducing structural hallucinations.',
    ],
    capabilities: [
      'Dual output: In-App RAP (ABAP Cloud) or Side-by-Side CAP (Node.js / TypeScript)',
      'Deterministic OO / interface resolution before translation',
      'Full multi-file abapGit ZIP export + generated ABAP-Unit tests to compile and verify',
    ],
    limitations: [
      'Generated code is a first, compliant DRAFT for architect review — never a production-ready deliverable.',
      'Dynamic ABAP (e.g. CALL FUNCTION with variable names), Dynpro / screen flows and batch-input scenarios cannot be fully resolved automatically and need manual redesign.',
    ],
    related: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/catalog', label: 'SAP Object Catalog' },
    ],
  },
  {
    slug: 'modernization-assessment',
    title: 'Modernization Assessment',
    eyebrow: 'Pre-transformation analysis',
    summary:
      'Complexity and business-criticality scoring, a full code inventory, and data-coupling risk analysis — all deterministically, before any transformation.',
    stage: 'Stage 1 — Analyze',
    what: [
      'The deterministic evidence engine runs first and produces the auditable facts: a full code inventory (classes, reports, function modules), complexity and business-criticality scores, and a data-coupling map with standard SAP table risk analysis.',
      'This is the "deterministic, not guessed" foundation the rest of the workflow builds on.',
    ],
    capabilities: [
      'Complexity & business-criticality scoring',
      'Full code inventory + standard-table risk & data-coupling map',
      'Clean Core readiness score, computed before transformation',
    ],
    limitations: [
      'Static analysis has limits — dynamic calls and screen logic are flagged, not fully resolved.',
      'Scores are indicative decision support, not a certified rating.',
    ],
    related: [
      { href: '/clean-core-score', label: 'Clean Core Score' },
      { href: '/abap-custom-code-analysis', label: 'ABAP code analysis' },
    ],
  },
  {
    slug: 'audit-evidence',
    title: 'Compliance & Audit Evidence',
    eyebrow: 'Governance & trust',
    summary:
      'A server-generated, HMAC-signed audit evidence pack — input fingerprints, decision records, model cards and known limitations — ready for governance reviews.',
    stage: 'Stage 7 — Delivery',
    what: [
      'Every analysis is frozen as an immutable, HMAC-signed Run. From it, the server generates a signed audit evidence pack entirely server-side: executive summary, decision record, findings CSV, model card and known-limitations.',
      'The AI narrative is kept separate from the signed deterministic evidence, and verification is reported in three honest tiers: authentic → integrity-only → failed.',
    ],
    capabilities: [
      'Server-authoritative, signed evidence pack (the client never supplies content or hashes for signing)',
      'Input fingerprints, architecture decision records, model cards, known limitations',
      'Three-tier verification; deterministic evidence cleanly separated from AI narrative',
    ],
    limitations: [
      'The architect sign-off inside the pack is self-attested, not a formally governed organizational approval.',
      'The pack documents a decision aid — it is not an SAP acceptance test, a formal security audit, or SAP certification.',
    ],
    related: [
      { href: '/trust', label: 'Trust & transparency' },
      { href: '/how-it-works', label: 'How it works' },
    ],
  },
  {
    slug: 'process-blueprints',
    title: 'BPMN 2.0 & Business Standard Operating Procedures',
    eyebrow: 'Process documentation',
    summary:
      'Turn modernized processes into standard BPMN 2.0 with swimlanes, plus RACI matrices and Level 5 Standard Operating Procedure narratives.',
    stage: 'Stage 4 — Documentation',
    what: [
      'From the modernized logic, Clean-Core.io generates Business Process Model and Notation (BPMN 2.0) XML with swimlanes, importable into SAP Signavio and other BPMN-2.0 tools.',
      'A two-stage blueprint layer adds Responsible-Accountable-Consulted-Informed (RACI) matrices, Level 5 Standard Operating Procedure (SOP) narratives and internal compliance controls, exportable as a Confluence-compatible document.',
    ],
    capabilities: [
      'BPMN 2.0 XML export with swimlanes (SAP Signavio / SAP Build compatible)',
      'RACI matrices + Level 5 SOP narratives',
      'Confluence-compatible export for governance handover',
    ],
    limitations: [
      'Generated blueprints are drafts for review — business semantics need a domain expert to validate.',
      'Compatibility is designed for BPMN 2.0 tools; it is not an official SAP Signavio certification.',
    ],
    related: [
      { href: '/knowledge', label: 'Knowledge base' },
      { href: '/how-it-works', label: 'How it works' },
    ],
  },
];

export const FEATURE_SLUGS = FEATURES.map((f) => f.slug);
export const getFeature = (slug: string) => FEATURES.find((f) => f.slug === slug);

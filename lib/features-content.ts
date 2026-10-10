/**
 * Content for the six feature pages (/features/[slug]), from the 2.x landing's
 * "Learn more" links. The 3.0 landing no longer links them, but they keep their
 * search reach (tests/seo-surface-guard.spec.ts), so they speak 3.0: the seven
 * stages are tools of the workspace, the process is read from the code. Kept
 * honest — every page states its limitations. Each `summary` is the page's meta
 * description as well, so it stays within 155 characters
 * (tests/seo-snippet-length-guard.spec.ts).
 */
import { BTP_FIRST } from './sap-naming';

export interface FeatureContent {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  /**
   * Set when another page answers the same search better (roadmap 3.0.8, item 5):
   * the feature page stays reachable for every old link, names that page as its
   * canonical and leaves the sitemap, so the two stop competing for one query.
   */
  canonicalPath?: string;
  /** The name of that page, for the line that sends a reader there. */
  canonicalLabel?: string;
  /** Where it lives in the 3.0 workspace. */
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
      'Classify custom ABAP against SAP clean core guidelines, get a deterministic RAP-or-CAP recommendation, and sign off the target before any code is drafted.',
    stage: 'Workspace tool 2 of 7 — Design',
    what: [
      `Before any code is generated, Clean-Core.io classifies each piece of legacy custom logic against SAP’s Clean Core extensibility guidelines and routes it to the right target track: In-App Developer Extensibility (ABAP Cloud / RAP) or Side-by-Side (CAP) on ${BTP_FIRST}.`,
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
      'Map legacy objects to their released S/4HANA successors with SAP’s Cloudification Repository — the source behind SAP ATC — plus curated mappings, marked.',
    // The lookup and the explanation live on /sap-cloudification, the page the
    // searches for this reach; this page hands over to it instead of competing.
    canonicalPath: '/sap-cloudification',
    canonicalLabel: 'SAP Cloudification',
    stage: 'Workspace tools 1 and 2 of 7 — Analyze and Design',
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
      { href: '/sap-cloudification', label: 'SAP Cloudification: how to cloudify ABAP' },
      { href: '/catalog', label: 'Browse the catalog' },
      { href: '/how-it-works', label: 'How it works' },
    ],
  },
  {
    slug: 'rap-cap-engine',
    title: 'RAP or CAP Code Draft',
    eyebrow: 'Code transformation',
    summary:
      'Draft in-app ABAP Cloud (RAP) or side-by-side CAP code from source, analysis and design, grounded by a deterministic resolver. A draft you review.',
    stage: 'Workspace tool 3 of 7 — Transformation',
    what: [
      'Depending on the routing decision, the engine drafts either In-App ABAP Cloud RAP artifacts or decoupled Side-by-Side CAP (Node.js / TypeScript) services.',
      'A deterministic dependency resolver linearizes object-oriented inheritance chains (MRO), maps constructors and interface aliases, and grounds the translation in released APIs before the language model runs — reducing structural hallucinations.',
    ],
    capabilities: [
      'Dual output: In-App RAP (ABAP Cloud) or Side-by-Side CAP (Node.js / TypeScript)',
      'Deterministic OO / interface resolution before translation',
      'Multi-file ZIP download in abapGit layout (Delivery), plus a written ABAP Unit test class that you run in your own SAP system — nothing is compiled or run here',
    ],
    limitations: [
      'Generated code is a first DRAFT for architect review — never a production-ready deliverable.',
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
    stage: 'Workspace tool 1 of 7 — Analyze',
    what: [
      'The deterministic evidence engine runs first and produces the auditable facts: a full code inventory (classes, reports, function modules), complexity and business-criticality scores, and a data-coupling map with standard SAP table risk analysis.',
      'This is the "deterministic, not guessed" foundation the rest of the workflow builds on.',
    ],
    capabilities: [
      'Complexity and business-criticality scores (heuristic, ten-point scale)',
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
      'An audit evidence pack built and signed on the server with HMAC and Ed25519: input fingerprints, decision records, model cards and known limitations.',
    stage: 'Workspace tool 7 of 7 — Delivery',
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
    title: 'The Process as BPMN, Read from the Code',
    eyebrow: 'Process documentation',
    summary:
      'The business process reconstructed from the ABAP code as BPMN 2.0, with a line anchor on every element or the reason it has none. Leaves as BPMN 2.0 XML.',
    stage: 'Business view and workspace tool 4 of 7 — Documentation',
    what: [
      'Clean-Core.io reconstructs the business process from what the ABAP code does and draws it as Business Process Model and Notation (BPMN 2.0), with a line anchor on every element or the reason it has none. It leaves as a BPMN 2.0 XML file; import into SAP Signavio has not been verified yet, and there is no connection to a Signavio workspace.',
      'On request, a model drafts a business layer on top: Responsible-Accountable-Consulted-Informed (RACI) matrices, Standard Operating Procedure (SOP) narratives and internal compliance controls, exportable to Confluence, Markdown and Word.',
    ],
    capabilities: [
      'BPMN 2.0 reconstructed from the code, with line anchors',
      'BPMN editor with revisions; BPMN 2.0 XML export and import',
      'RACI matrix and SOPs as a model draft, written only when you ask for it',
    ],
    limitations: [
      'Generated blueprints are drafts for review — business semantics need a domain expert to validate.',
      'Import into SAP Signavio has not been tested yet, and nothing here is an official SAP Signavio certification.',
    ],
    related: [
      { href: '/knowledge', label: 'Knowledge base' },
      { href: '/how-it-works', label: 'How it works' },
    ],
  },
];

export const FEATURE_SLUGS = FEATURES.map((f) => f.slug);
/** The feature pages that are their own canonical — the ones the sitemap lists. */
export const INDEXED_FEATURE_SLUGS = FEATURES.filter((f) => !f.canonicalPath).map((f) => f.slug);
export const getFeature = (slug: string) => FEATURES.find((f) => f.slug === slug);

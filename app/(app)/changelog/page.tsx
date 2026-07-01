import type { Metadata } from 'next';
import { Tag, Rocket, Sparkles, Zap, Package, Shield } from 'lucide-react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Changelog & Release Notes | Clean-Core.io',
  description: 'Track the latest updates, improvements, and new features added to the Clean-Core.io transformation engine.',
  alternates: {
    canonical: 'https://clean-core.io/changelog',
  },
  openGraph: {
    title: 'Changelog & Release Notes | Clean-Core.io',
    description: 'Track the latest updates, improvements, and new features added to the Clean-Core.io transformation engine.',
    url: 'https://clean-core.io/changelog',
    type: 'website',
  }
};

const releases = [
  {
    version: 'v1.16.0',
    date: 'July 1, 2026',
    tag: 'Latest',
    icon: Rocket,
    changes: [
      'Phase 2: Immutable Analysis Runs & Fallback Hardening (F-01) — Completed transition to server-authoritative calculations for runs, loading inputs directly from the parent project with fallbacks for upload/re-analysis flows.',
      'Run Metadata Cleanup — Automatically clears denormalized analysis result fields on the parent project document to prevent stale data conflicts.',
      'Strict Firestore Rules Allowlist — Enforces strict client write limits on projects via a strict allowlist of interactive/draft fields, making all other results and metadata fully immutable.',
      'Workflow signing verification — Enforced pre-compilation check in deploy workflow ensuring AUDIT_SIGNING_KEY secret is defined.',
      'Cryptographic Export Manifest & Verification — Added automated manifest.json generation inside the code archive and verify-export.ps1 verification script with SHA-256 HMAC-SHA256 signature checks.',
      'Unified Downstream State Hydration — Standardized state loading using a unified resolver helper across all downstream stages.',
    ],
  },
  {
    version: 'v1.15.0',
    date: 'June 30, 2026',
    icon: Shield,
    changes: [
      'Phase 2: BYOK Server-Only Secret Store (F-01) — Migrated custom Gemini API Key storage from client-readable Firestore profiles to a server-only encrypted collection (user_secrets/{uid}/providers/gemini) using AES-256-GCM.',
      'Client Profile Security Isolation — Blocked client-side update access rules to geminiApiKey and fully prohibited client-side operations on the user_secrets collection.',
      'Client-to-Server BYOK Endpoints — Added secure API routes /api/secrets/gemini (POST/DELETE) and /api/secrets/gemini/test (POST) to test keys and handle rotations server-side, preventing raw keys in the client bundle.',
      'BYOK Endpoint Hardening (F-02) — Enforced assertMfaSatisfied() step-up gates and strict assertRateLimit() protections on all secret APIs, returning standardized status codes and neutral error messages.',
      'Admin Panel Reference Sanitization — Cleaned up name placeholders ("e.g. Sonny Frenzel") from the platform administrator and tenant approval panels.',
      'Automated E2E Test Suite — Added full Playwright E2E coverage for BYOK secure storage and Firestore rule access gating.',
    ],
  },
  {
    version: 'v1.14.0',
    date: 'June 29, 2026',
    icon: Shield,
    changes: [
      'Phase 2 & 3: Deterministic Evidence Scanner — Implemented a statement-based scanner (buildAbapEvidence) to collect static code evidence (BDC, RFC, Native SQL, DB Writes, Dynpro, ALV, GUI Downloads) and fully persist the report in Firestore.',
      'Phase 4 & 7: Extensibility Router & Score Calibration — Added extensibility-router to mathematically calculate the Clean Core score, recommendation confidence, and target architectures (In-App RAP vs Side-by-Side CAP) from scanner findings, preventing LLM score hallucinations.',
      'Phase 5 & 6: Unified Report Model & Grounding — Restructured the Gemini prompt to act purely as a narrative generator, grounded on deterministic findings instead of raw legacy code.',
      'Class Model Resolver — Integrated buildClassModel across all 5 analysis UI hooks, eliminating the temporary mockModel and enabling real static inheritance tree and missing dependency resolution.',
      'Evidence Findings Table — Added a dedicated, deduplicated evidence table to the Decision & Evidence tab, sorted Critical→Low, with severity filter buttons and occurrence count aggregation.',
      'Inline Code Viewer — Replaced external DOCS link in Gaps Worklist with an inline View Code toggle showing source code context with amber line highlighting.',
      'Confluence Export Enhanced — Evidence Findings table and Gaps Worklist now included in Confluence HTML export with full detail columns.',
      'Score Formula Recalibrated — Diminishing returns per category with 5% floor, producing realistic 12-18% scores for heavily legacy code (was 0%).',
      'Criticality Score Boosted — Added Sales/Delivery/Credit/Audit/Partner process detection, raising fulfillment code from 5/10 to 7-8/10.',
      'Prompt Hardening — Softened decommissioning language, added API confidence markers, hedged ROI claims, instructed hybrid routing.',
      'Worklist Deduplication — Grouped evidence findings by kind+objectName, aggregating line numbers into single rows with (N×) count.',
      'Sprint 1 Data Coupling — Fixed table detection, data export mapping, and added fake-table filtering (blocking keywords like MODE, RISK, SCREEN, LINE).',
      'Language Consistency — Translated remaining German UI text to English.',
      'Admin Rate-Limit Bypass — Enabled admins to run unlimited analyses on clean-core.io by skipping the hourly quota check.',
    ],
  },
  {
    version: 'v1.13.2',
    date: 'June 28, 2026',
    icon: Shield,
    changes: [
      'Google Auth Fix: CSP frame-src was blocking accounts.google.com — OAuth popup now works correctly on production',
      'F-15: Seed route hardened with 3 independent security gates (NODE_ENV + emulator flag + secret header) — returns 404 in production',
      'F-05: Email/password registration now sends Bearer token to approval API, fixing silent 401 failures',
      'F-03: Mermaid label sanitizer hardened against XSS payloads (HTML tags, JS protocol, event handlers, Mermaid control tokens)',
      'F-08: Explicit Firestore deny rule for mfa_pending collection for audit clarity',
      'CI: Deploy workflow assertion prevents accidental emulator flag in production',
    ],
  },
  {
    version: 'v1.13.1',
    date: 'June 28, 2026',
    icon: Sparkles,
    changes: [
      'Clean Core Score: redesigned formula — 60% deterministic construct coverage, 30% standard fit, 10% AI calibration for accurate migration readiness scoring',
      'Mermaid architecture diagrams: fixed empty boxes by bypassing DOMPurify for code-generated SVG content',
      'Severity consistency: Prioritization Matrix now shows Effort (complexity) matching the Worklist, eliminating contradictory labels',
      'Tab rename: "Detailed Assessment" → "Assessment & Value" to surface the Business Value Audit / ROI section',
      'Cloud Service deep dives: 5 new SAP-native entries (CDS View, IAM, LUW Manager, BAdI, RAP Service Binding) with dedicated ABAP code patterns',
      'Context-aware labels: SAP-native services show "Released SAP Objects" instead of "NPM Package Dependencies"',
    ],
  },
  {
    version: 'v1.13.0',
    date: 'June 28, 2026',
    icon: Rocket,
    changes: [
      'UX Concept Block A: Evidence Backbone — deterministic Coverage Verdict donut + Construct Findings checklist from findings-detector, replacing opaque LLM-generated coverage numbers',
      'UX Concept Block B: Progressive Output — sticky Decision-Header with route badge, Clean Core Score, deployment target, and "Continue to Design" CTA; tabbed workspace layout (Evidence, Gaps Backlog, Detailed Assessment, Modernization Strategy); sequential stage simulation logs during analysis',
      'UX Concept Block C: Interactive Gaps Worklist — sortable/filterable backlog table with per-row status management (Open → In Review → Signed Off), burndown progress bar, and Firestore-persisted WorklistItem data model',
      'UX Concept Block D: Target Architecture Diagram — auto-generated Mermaid flowchart from DesignData JSON (RAP/CAP); "Why This Routing" rationale panel binding Design back to Analyze evidence; Security Hardening ↔ Construct coupling badges',
      'UX Concept Block E: Input & Gap Guidance — Missing Dependency Prompt for ancestor classes/interfaces; Pre-Analysis Preview showing LOC, recognized constructs, object type, and estimated coverage before the full analysis run',
      'UX Concept Block F: Monolith Split — design page decomposed into 9 modular components (ArchitectureOverview, InteractiveTopology, ProjectBlueprintExplorer, ApiEndpointsCatalog, ApiBusinessHubMapping, CloudServiceIntegrations, SecurityHardeningChecklist, ModernizationRoadmap, SyncPatternCard)',
      'New components: TargetArchitectureDiagram, RoutingRationale, MissingDependencyPrompt, PreAnalysisPreview, GapsWorklist, GapsPrioritization, CoverageVerdict, ConstructFindings',
      'Version bump to v1.13.0 across all configuration files',
    ],
  },
  {
    version: 'v1.12.2',
    date: 'June 26, 2026',
    icon: Shield,
    changes: [
      'Security patch A-01: reject branch in approveUserWithToken now deletes the orphaned Firebase Auth user, preventing re-registration issues',
      'Bumped all version references from v1.12.0 to v1.12.2 across landing page, showroom, replay, sample package, and board-deck components',
      'Updated SECURITY.md to v3.6 with A-01 finding documentation',
    ],
  },
  {
    version: 'v1.12.0',
    date: 'June 25, 2026',
    icon: Rocket,
    changes: [
      'Hardened client-side onboarding by restricting default fields (tier, status, transformations limit, admin roles) in Firestore security rules to prevent privilege escalation',
      'Implemented server-side two-factor authentication (MFA) via TOTP using encrypted secrets stored in memory and hashed backup codes (Option B)',
      'Secured settings page and authentication flows to perform MFA verification and setup verification server-side',
      'Added secure, encrypted storage of MFA secrets using AES-256-GCM',
      'Built interactive Modernization Whitepaper page at /whitepaper (Edition 2.0) — 10-section enterprise guide with decision tree, audit pack, security model and quality engineering',
      'Updated hero CTA to link to new whitepaper page instead of static PDF download',
      'Hardened full-pipeline E2E test to comply with new Firestore security rules via server-side admin approval flow',
      'Updated security architecture documentation and added detailed security notes in SECURITY.md',
      'Removed all hardcoded admin email checks — admin authorization now uses Firebase custom claims exclusively',
      'Added assertAdminStepUp enforcement (recent auth + MFA) on all admin API routes',
      'Implemented Firestore-backed API rate limiting on Gemini, MFA, pilot request, and tenant request endpoints',
      'Added XSS protection (escapeHtml) on all email template name fields with length validation',
      'Enforced MFA backup code pepper minimum length (32 chars) — no more default fallback',
      'Added S/4HANA test runner egress enforcement gate for live tenant connections',
      'Removed CSP-Report-Only header (report-only, no enforcement value)',
      'Added rate_limits collection to Firestore security rules (blocked from client access)',
      'Bounced version references to v1.12.0 across the application and checked E2E Playwright tests',
    ],
  },
  {
    version: 'v1.11.0',
    date: 'June 25, 2026',
    tag: null,
    icon: Rocket,
    changes: [
      'Redesigned Board Presentation (Stage 7) to be deterministic and evidence-based, derived from project metrics and findings',
      'Added metrics, matrix (support specification table), and risk register slide types to PresentationViewer',
      'Enforced Worst-Case Rollup: overall recommendation automatically downgrades based on findings severity',
      'Unified Spec specifications from SUPPORT_MATRIX with deep links to how-it-works documentation',
      'Hardened onboarding email links with action-bound cryptographic HMAC signatures and timing-safe verify routes',
      'Secured Markdown and chat responses from HTML Injection / XSS using DOMPurify and marked sanitizers',
      'Implemented strict sandbox securityLevel for Mermaid BPMN 2.0 flowcharts',
      'Added Word document (.doc) executive summary exports in client-generated Compliance Audit Pack ZIP',
    ],
  },
  {
    version: 'v1.10.0',
    date: 'June 24, 2026',
    tag: null,
    icon: Shield,
    changes: [
      'Added Compliance Audit Pack — exportable ZIP evidence package for architecture governance and compliance reviews',
      'Audit pack includes: executive summary, SHA-256 input fingerprint, architecture decision record, findings CSV, model card, and known limitations',
      'Input fingerprint (SHA-256 hash) computed silently during analysis — only hashes code content, no secrets or PII',
      'Model card metadata (provider, model, engine version, BYOK flag) logged per project analysis for full traceability',
      'Audit Pack section added to Delivery stage as collapsible accordion — collapsed by default, accessible to all tiers',
      'Updated landing page Compliance feature card to reflect audit evidence export capability',
      'All version references bumped to v1.10.0 across engine, components, and documentation',
    ],
  },
  {
    version: 'v1.9.0',
    date: 'June 24, 2026',
    tag: null,
    icon: Shield,
    changes: [
      'Introduced Modernization Assessment engine computing complexity and business-criticality scores from uploaded ABAP code',
      'Added Code Inventory and Data Coupling analysis panels with collapsible accordion UI pattern (Stage 1)',
      'Built deterministic architecture recommendation logic (Decision Tree) based on parsed table access and code structure',
      'Implemented Architect Sign-Off gate in Solution Design (Stage 2) requiring explicit target architecture confirmation before transformation',
      'Added override flow with justification tracking and audit trail for architecture decisions',
      'Gated Stage 3 navigation behind architecture approval to prevent mismatched transformation output',
      'Created reusable CollapsibleAccordion and ArchitectSignOff UI components, fully responsive on mobile',
      'Extended Project type with assessment fields (complexityScore, criticalityScore, codeInventory, dataCoupling, targetArchitecture)',
      'Updated NavigationButtons to support gated disabled state with visual feedback',
      'All version references bumped across engine, showroom, landing page, and documentation',
    ],
  },
  {
    version: 'v1.8.0',
    date: 'June 24, 2026',
    tag: null,
    icon: Shield,
    changes: [
      'Moved GDPR account deletion orchestrations to a secure server-side transaction API, recursively purging credentials, projects, and metadata (Art. 17 compliance)',
      'Enforced cryptographic verification of onboarding email approval links via secure server-side HMAC checks',
      'Admin-gated all live S/4HANA bridge connectivity (BYOT) endpoints behind strict role and custom-claim validation checks',
      'Mitigated potential HTML injection threats by fully sanitizing pilot welcome and administrator approval email templates',
      'Stabilized SEO crawl signals by replacing dynamic site-generation dates with static constants in sitemap.xml',
      'Aligned platform documentation and copywriting regarding live credentials storage (AES-256-GCM encryption) and business data processing (stateless in-memory)',
      'Resolved security advisory warnings by bumping Next.js from v15.5.14 to v15.5.19',
      'Introduced comprehensive Playwright E2E security and compliance test suites validating authorization boundaries, token validations, and cascading account deletion processes',
    ],
  },
  {
    version: 'v1.7.4',
    date: 'June 17, 2026',
    tag: null,
    icon: Sparkles,
    changes: [
      'Introduced visual Code-Transformation Compliance Shield (Hero HUD) showing dynamic scores',
      'Added interactive Code-Integrity Minimap heatmap scrollbar for instant file inspection',
      'Designed sliding Grounded Audit Drawer panel containing CDS mappings, SQL quirk settings, and a differential sandbox query tester',
      'Created realistic ABAP OO / SQL Join test script balloon in the workspace for pilot testing',
      'Improved landing page with direct visual compliance highlights and direct links to Methodology / How It Works page',
      'Implemented admin identification via Custom Claims rather than hardcoded email addresses (patch-F-10)',
      'Configured Firestore log level to silent and handled transient stream errors cleanly at point-of-use (F-09)',
      'Updated all system version references across the showroom, replay interface, and landing pages to v1.7.4',
    ],
  },
  {
    version: 'v1.7.3',
    date: 'June 16, 2026',
    tag: null,
    icon: Sparkles,
    changes: [
      'Added standalone /impressum and /datenschutz legal route pages for SEO and compliance',
      'Fixed JSON-LD structured data: removed duplicate schema, added static dates for Google Rich Results',
      'Improved Transformation Showroom ABAP-Unit test with proper CDS Test Double pattern (Arrange/Act/Assert)',
      'Corrected Quick Answer heading hierarchy (h2 → semantic span badge)',
      'Removed Jira Integration placeholders from Solution Design page',
      'Updated footer and pilot banner links to real legal routes',
      'Added legal routes to sitemap.xml for crawler discoverability',
      'Updated E2E tests for route-based legal navigation',
      'Added mobile-optimized comparison table with stacked card layout',
      'Introduced Transformation Showroom with real E2E code examples',
      "Added '/how-it-works' page with honest coverage matrix",
      'Enhanced SAP API Hub mapping accuracy for financial tables (BSEG, BKPF)',
    ],
  },

  {
    version: 'v1.7.0',
    date: 'June 1, 2026',
    tag: null,
    icon: Rocket,
    changes: [
      'Launched BPMN 2.0 business process blueprinting',
      'Added Level 5 SOP narrative generation',
      'Introduced RACI matrix auto-generation',
      'Side-by-side code transformation view improvements',
    ],
  },
  {
    version: 'v1.6.0',
    date: 'May 15, 2026',
    tag: null,
    icon: Zap,
    changes: [
      'Live S/4HANA tenant connection (BYOT) with admin approval gate',
      'Enhanced sandbox test runner with real-time TAP output',
      'Added Confluence blueprint export format',
      'Improved abapGit ZIP packaging with proper directory structure',
    ],
  },
  {
    version: 'v1.5.0',
    date: 'April 28, 2026',
    tag: null,
    icon: Package,
    changes: [
      'Initial public pilot release',
      'Core ABAP parser and AST extraction engine',
      'SAP API Business Hub integration',
      'Dual-target code generation (RAP + CAP Node.js)',
      'ABAP-Unit test class generation',
      'Clean Core compliance scoring',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackButton />
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <Tag size={14} /> Release History
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            Change<span className="text-green-400">log</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Track every update to the Clean-Core.io transformation engine.
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative space-y-0">
        {/* Vertical timeline line */}
        <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-px bg-gray-200 hidden sm:block"></div>

        {releases.map((release, idx) => {
          const Icon = release.icon;
          const isLatest = release.tag === 'Latest';

          return (
            <div key={release.version} className="relative pl-0 sm:pl-16 pb-10 last:pb-0">
              {/* Timeline dot */}
              <div className={`hidden sm:flex absolute left-0 top-0 w-12 h-12 rounded-xl items-center justify-center z-10 shadow-md ${
                isLatest
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-400 border border-gray-200'
              }`}>
                <Icon size={20} />
              </div>

              {/* Release card */}
              <div className={`rounded-[2rem] border p-6 sm:p-8 space-y-5 transition-all ${
                isLatest
                  ? 'border-green-200 bg-green-50/30 shadow-lg shadow-green-100/40 border-l-4 border-l-green-500'
                  : 'border-gray-200 bg-white border-l-4 border-l-gray-300'
              }`}>
                {/* Header */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Mobile icon */}
                  <div className={`sm:hidden w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isLatest
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-400 border border-gray-200'
                  }`}>
                    <Icon size={18} />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-gray-950">
                    {release.version}
                  </h2>
                  <span className="text-sm font-bold text-gray-500">
                    — {release.date}
                  </span>
                  {isLatest && (
                    <span className="inline-flex items-center gap-1.5 bg-green-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                      <Sparkles size={10} /> Latest
                    </span>
                  )}
                </div>

                {/* Changes list */}
                <ul className="space-y-3">
                  {release.changes.map((change, changeIdx) => (
                    <li
                      key={changeIdx}
                      className="flex items-start gap-3 text-sm font-medium text-gray-700 leading-relaxed"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        isLatest ? 'bg-green-500' : 'bg-gray-300'
                      }`}></span>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="bg-slate-50 border border-gray-200 rounded-[2.5rem] p-8 sm:p-10 text-center space-y-4">
        <h2 className="text-2xl font-black text-gray-955 tracking-tight">Want to try the latest features?</h2>
        <p className="text-gray-600 font-medium text-sm max-w-lg mx-auto">
          Create a free account and start transforming your ABAP code today. No credit card required.
        </p>
        <Link
          href="/?auth=signup"
          className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-md transition-all text-sm"
        >
          Get Started for Free
        </Link>
      </div>

      {/* Footer Disclaimer */}
      <div className="text-center text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider pt-10 border-t border-gray-200">
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Pilot
      </div>
    </div>
  );
}

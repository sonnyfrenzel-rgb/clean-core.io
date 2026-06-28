# Changelog

All notable changes to the Clean-Core.io platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.14.0] — 2026-06-29

### Added
- **Phase 2 & 3 — Deterministic Evidence Scanner:** Implemented a statement-based static scanner (`buildAbapEvidence` in `lib/abap/evidence-model.ts`) that extracts concrete legacy patterns (BDC, RFC, Native SQL, DB Writes, Dynpro, ALV, GUI Downloads) and persists the complete report as `evidenceReport` in Firestore.
- **Phase 4 & 7 — Extensibility Router & Score Calibration:** Added `lib/abap/extensibility-router.ts` to calculate Clean Core score, recommendation confidence, decision checkpoints, and target architectures (In-App RAP vs Side-by-Side CAP) mathematically from scanner findings, eliminating LLM hallucinations.
- **Class Model Resolver:** Created `lib/abap/class-model-resolver.ts` to build topological sort linearization and missing dependency trees, replacing the mocked `ClassModel` across all 5 analysis UI hooks.
- **Inheritance Unit Tests:** Added unit tests verifying inheritance linearization and missing dependencies in `tests/abap-inheritance.spec.ts`.

### Changed
- **Phase 5 & 6 — Unified Report Model & Grounding:** Restructured the Gemini prompt to act purely as a narrative generator, grounded on deterministic findings instead of raw legacy code.
- **Sprint 1 Data Coupling:** Hardened data coupling table parser with `tokenize` statement grouping, blacklist filtering (MODE, RISK, SCREEN, LINE, ADJACENT), and correct data export mapping.

### Security
- **Admin Rate-Limit Bypass:** Enabled admins (`admin: true`) to bypass the hourly quota limits in `app/api/gemini/route.ts` to prevent "Rate limit exceeded" blockages during large modernization runs.

---

## [v1.13.2] — 2026-06-28

### Security
- **F-15 — Seed Route Defense-in-Depth:** `/api/test/seed` now requires three independent gates (NODE_ENV ≠ production, emulator flag = true, secret header match). Returns 404 instead of 403.
- **F-03 — Mermaid Label Sanitizer:** Hardened `sanitize()` in TargetArchitectureDiagram to strip HTML tags, JS protocol, event handlers, and Mermaid control tokens.
- **F-08 — mfa_pending Firestore Rule:** Added explicit `allow read, write: if false` for audit clarity (was covered by default-deny).
- **CI Assertion:** Deploy workflow now fails if `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is accidentally set to `true` in production.

### Fixed
- **Google Auth on Production:** CSP `frame-src` was blocking `accounts.google.com`, preventing the OAuth popup from opening. Added Google OAuth domains to `frame-src` and `connect-src`.
- **F-05 — Email Registration Bearer Token:** Password sign-up now sends a Bearer token to `/api/request-pilot`, matching the Google sign-in flow. Previously, the approval email silently failed with 401.
- **Google Auth UX:** Improved error messages when both popup and redirect sign-in fail.

### Changed
- **F-10 — Admin Panel:** Replaced personal example name with generic "platform administrator" text.

---

## [v1.13.1] — 2026-06-28

### Fixed
- **Clean Core Score formula:** Redesigned from stale AI-only value to a generic weighted formula (60% deterministic construct coverage, 30% standard fit, 10% AI calibration). Scores now correctly reflect migration readiness.
- **Mermaid architecture diagrams:** Fixed empty boxes caused by DOMPurify stripping foreignObject HTML children. Diagrams now render with full labels.
- **Severity consistency:** Prioritization Matrix gap items now show Effort (complexity) matching the Worklist column instead of contradictory severity labels.
- **AI recommendation contradictions:** Reconciliation logic suppresses "rewrite" recommendations when an object is marked for decommission/retirement.

### Changed
- **Tab rename:** "Detailed Assessment" → "Assessment & Value" to surface the Business Value Audit / ROI section.
- **Cloud Service Integrations:** Labels and deep dives are now context-aware — SAP-native services (CDS Views, IAM, LUW Manager) show dedicated ABAP code patterns and "Released SAP Objects" instead of generic Node.js NPM content.
- 5 new SAP-native deep dive entries: Released CDS View, IAM Business Roles, LUW Manager, BAdI Enhancement, RAP Service Binding.

### Security
- MermaidDiagram component bypasses DOMPurify for deterministically generated chart content (no user input in chart data). All other HTML sanitization remains intact.

---

## [v1.13.0] — 2026-06-28

### Added
- **UX Concept Block A — Evidence Backbone:** Deterministic Coverage Verdict donut chart + Construct Findings checklist from `findings-detector`, replacing opaque LLM-generated coverage numbers.
- **UX Concept Block B — Progressive Output:** Sticky Decision-Header with route badge, Clean Core Score, deployment target, and "Continue to Design" CTA. Tabbed workspace layout (Evidence, Gaps Backlog, Detailed Assessment, Modernization Strategy). Sequential stage simulation logs during analysis.
- **UX Concept Block C — Interactive Gaps Worklist:** Sortable/filterable backlog table with per-row status management (Open → In Review → Signed Off), burndown progress bar, and Firestore-persisted `WorklistItem` data model.
- **UX Concept Block D — Target Architecture Diagram:** Auto-generated Mermaid flowchart from DesignData JSON (RAP/CAP). "Why This Routing" rationale panel binding Design back to Analyze evidence. Security Hardening ↔ Construct coupling badges.
- **UX Concept Block E — Input & Gap Guidance:** Missing Dependency Prompt for ancestor classes/interfaces. Pre-Analysis Preview showing LOC, recognized constructs, object type, and estimated coverage before the full analysis run.
- **UX Concept Block F — Monolith Split:** Design page decomposed into 9 modular components: `ArchitectureOverview`, `InteractiveTopology`, `ProjectBlueprintExplorer`, `ApiEndpointsCatalog`, `ApiBusinessHubMapping`, `CloudServiceIntegrations`, `SecurityHardeningChecklist`, `ModernizationRoadmap`, `SyncPatternCard`.
- 27 new component files in `components/analyze/` and `components/design/`.
- GDPR consent checkboxes and AI disclaimer integrated into the signup form.
- Inline legal consent notice ("By signing in, you agree to...") on the sign-in form.
- Auto-profile creation for Google sign-in users (no separate onboarding step).
- `CHANGELOG.md` and release process documentation.

### Changed
- Auth modal now fully responsive with `max-h-[95vh]`, scroll support, and mobile-optimized padding.
- Signup form requires GDPR + Terms acceptance before the Register button enables.

### Removed
- **Pilot Registration Modal (`UserOnboarding.tsx`):** The blocking post-login onboarding modal is removed from `layout.tsx`. Profile creation is now handled inline during authentication.

---

## [v1.12.2] — 2026-06-26

### Fixed
- Security patch A-01: `approveUserWithToken` reject branch now deletes the orphaned Firebase Auth user, preventing re-registration issues.

### Changed
- Bumped all version references from v1.12.0 to v1.12.2 across landing page, showroom, replay, sample package, and board-deck components.
- Updated `SECURITY.md` to v3.6 with A-01 finding documentation.

---

## [v1.12.0] — 2026-06-25

### Added
- Server-side two-factor authentication (MFA) via TOTP using AES-256-GCM encrypted secrets and hashed backup codes.
- Interactive Modernization Whitepaper page at `/whitepaper` (Edition 2.0) — 10-section enterprise guide.
- Firestore-backed API rate limiting on Gemini, MFA, pilot request, and tenant request endpoints.
- XSS protection (`escapeHtml`) on all email template name fields with length validation.
- S/4HANA test runner egress enforcement gate for live tenant connections.
- `rate_limits` collection in Firestore security rules (blocked from client access).

### Changed
- Hardened client-side onboarding by restricting default fields in Firestore security rules to prevent privilege escalation.
- Removed all hardcoded admin email checks — admin authorization now uses Firebase Custom Claims exclusively.
- Added `assertAdminStepUp` enforcement (recent auth + MFA) on all admin API routes.
- Enforced MFA backup code pepper minimum length (32 chars).
- Removed CSP-Report-Only header (report-only, no enforcement value).
- Updated hero CTA to link to whitepaper page instead of static PDF download.

---

## [v1.11.0] — 2026-06-25

### Added
- Redesigned Board Presentation (Stage 7): deterministic, evidence-based slides derived from project metrics and findings.
- Metrics, support-specification-matrix, and risk-register slide types in `PresentationViewer`.
- Word document (.doc) executive summary exports in client-generated Compliance Audit Pack ZIP.

### Changed
- Overall recommendation automatically downgrades based on findings severity (Worst-Case Rollup).
- Unified specifications from `SUPPORT_MATRIX` with deep links to how-it-works documentation.

### Security
- Hardened onboarding email links with action-bound cryptographic HMAC signatures and timing-safe verify routes.
- Secured Markdown and chat responses from HTML Injection / XSS using DOMPurify and `marked` sanitizers.
- Implemented strict sandbox `securityLevel` for Mermaid BPMN 2.0 flowcharts.

---

## [v1.10.0] — 2026-06-24

### Added
- Compliance Audit Pack — exportable ZIP evidence package for architecture governance and compliance reviews.
- Audit pack includes: executive summary, SHA-256 input fingerprint, architecture decision record, findings CSV, model card, and known limitations.
- Input fingerprint (SHA-256 hash) computed silently during analysis — only hashes code content, no secrets or PII.
- Model card metadata (provider, model, engine version, BYOK flag) logged per project analysis for full traceability.
- Audit Pack section in Delivery stage as collapsible accordion.

---

## [v1.9.0] — 2026-06-24

### Added
- Modernization Assessment engine computing complexity and business-criticality scores from uploaded ABAP code.
- Code Inventory and Data Coupling analysis panels with collapsible accordion UI pattern (Stage 1).
- Deterministic architecture recommendation logic (Decision Tree) based on parsed table access and code structure.
- Architect Sign-Off gate in Solution Design (Stage 2) requiring explicit target architecture confirmation.
- Override flow with justification tracking and audit trail for architecture decisions.

### Changed
- Gated Stage 3 navigation behind architecture approval to prevent mismatched transformation output.
- Created reusable `CollapsibleAccordion` and `ArchitectSignOff` UI components, fully responsive on mobile.
- Extended `Project` type with assessment fields (`complexityScore`, `criticalityScore`, `codeInventory`, `dataCoupling`, `targetArchitecture`).

---

## [v1.8.0] — 2026-06-24

### Security
- Moved GDPR account deletion to server-side transaction API, recursively purging credentials, projects, and metadata (Art. 17 compliance).
- Enforced cryptographic HMAC verification of onboarding email approval links.
- Admin-gated all live S/4HANA bridge connectivity (BYOT) endpoints behind strict role and custom-claim validation.
- Sanitized pilot welcome and administrator approval email templates against HTML injection.

### Changed
- Replaced dynamic site-generation dates with static constants in `sitemap.xml` for stable SEO crawl signals.
- Aligned documentation regarding live credentials storage (AES-256-GCM) and business data processing (stateless in-memory).
- Bumped Next.js from v15.5.14 to v15.5.19 (security advisory).
- Introduced comprehensive Playwright E2E security and compliance test suites.

---

## [v1.7.4] — 2026-06-17

### Added
- Visual Code-Transformation Compliance Shield (Hero HUD) showing dynamic scores.
- Interactive Code-Integrity Minimap heatmap scrollbar.
- Sliding Grounded Audit Drawer panel with CDS mappings, SQL quirk settings, and differential sandbox query tester.
- Realistic ABAP OO / SQL Join test script balloon in workspace for pilot testing.

### Changed
- Improved landing page with visual compliance highlights and direct links to Methodology page.
- Admin identification via Custom Claims instead of hardcoded email addresses (patch-F-10).
- Firestore log level set to silent; transient stream errors handled cleanly at point-of-use (F-09).

---

## [v1.7.3] — 2026-06-16

### Added
- Standalone `/impressum` and `/datenschutz` legal route pages for SEO and GDPR compliance.
- Transformation Showroom with real end-to-end code examples.
- `/how-it-works` page with honest coverage matrix.
- Mobile-optimized comparison table with stacked card layout.

### Fixed
- JSON-LD structured data: removed duplicate schema, added static dates for Google Rich Results.
- Improved Transformation Showroom ABAP-Unit test with proper CDS Test Double pattern.
- Corrected Quick Answer heading hierarchy (h2 → semantic span badge).
- Removed Jira Integration placeholders from Solution Design page.
- Enhanced SAP API Hub mapping accuracy for financial tables (BSEG, BKPF).

---

## [v1.7.0] — 2026-06-01

### Added
- BPMN 2.0 business process blueprinting.
- Level 5 SOP narrative generation.
- RACI matrix auto-generation.
- Side-by-side code transformation view improvements.

---

## [v1.6.0] — 2026-05-15

### Added
- Live S/4HANA tenant connection (BYOT) with admin approval gate.
- Enhanced sandbox test runner with real-time TAP output.
- Confluence blueprint export format.
- Improved abapGit ZIP packaging with proper directory structure.

---

## [v1.5.0] — 2026-04-28

### Added
- **Initial public pilot release.**
- Core ABAP parser and AST extraction engine.
- SAP API Business Hub integration.
- Dual-target code generation (RAP + CAP Node.js).
- ABAP-Unit test class generation.
- Clean Core compliance scoring.

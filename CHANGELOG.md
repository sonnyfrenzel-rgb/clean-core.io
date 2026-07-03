# Changelog

All notable changes to the Clean-Core.io platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.0.0] — 2026-07-02

Special milestone release: a **security-hardened, audit-friendly trust chain and operational readiness** for the Free Community Edition, plus a **sharpened community / complementary narrative**. This is not a certified, procurement-grade enterprise platform — enterprise identity/governance features (SSO, multi-role RBAC, formal DPA/TOMs, external pentest) are intentionally in the backlog for the current audience — see `docs/ROADMAP-2.0.md`.

### Added
- **Server-authoritative audit packs** (`POST /api/audit-pack/create`): evidence files are generated, hashed and HMAC-signed entirely server-side from the immutable run — the client never supplies content or hashes for signing.
- **Complete GDPR Art. 17 erasure**: the deletion cascade now purges `runs` subcollections, encrypted BYOK keys (`user_secrets`) and `mfa_pending`; enforced by an automated test.
- **Supply-chain CI** (`.github/workflows/security-ci.yml`): gitleaks secret scan, `audit-ci` High/Critical gate, and a CycloneDX SBOM.
- **`/api/health`** liveness/readiness probe and **structured JSON logging** on critical routes (`lib/logger.ts`).
- **Public `/trust` page**, `docs/DATA-RETENTION.md`, `docs/INCIDENT-RESPONSE.md`, `docs/OPERATIONS.md`, `docs/ROADMAP-2.0.md`, and **SECURITY.md v4.0** documenting the evidence trust chain.
- **Public SAP Object Catalog** (`/catalog`) — hundreds of SEO/GEO reference pages generated from the merged Cloudification catalog.
- **Test auto-healing**: on a compilation error the AI repairs the offending module/test code and retries automatically.
- Full emulator-backed trust-chain E2E tests (audit-pack + sign endpoint negatives: foreign user, stale run, missing runHash).

### Changed
- **Narrative**: removed monetization/locked-export UI and premium signals — every feature is free (5 transformations; BYOK for unlimited); retired visible "pilot" wording in favour of "Free Community Edition" (internal tier identifiers are kept for compatibility); positioned as **complementary** to SAP tooling (ADT/ATC), not a competitor.
- The **AI narrative is excluded from the signed run payload** — signatures attest to server-computed evidence, not client free-text.
- Global **SAP non-affiliation trademark disclaimer**; removed false "certified / SAP-approved" claims; unified ROI figures; hedged absolute claims.
- Migrated Excel parsing from `xlsx` (unfixed advisory) to `exceljs`; dropped `xlsx`.

### Fixed
- **Empty Solution Design** (production): Firestore rules had never been deployed to the named production database, so the `runs` subcollection was unreadable and analysis never reached downstream pages. Rules deployed to all databases + multi-database `firebase.json` and an `npm run deploy:rules` script.
- **Blank Target Architecture diagram**: the SVG sanitizer stripped mermaid's `<foreignObject>` labels; added a mermaid-aware sanitizer that preserves labels while stripping active content.
- **False "analyzed with an older engine" banner**: run-capability detection now reads findings from `evidenceReport`.
- **Test sandbox "esbuild not installed"**: moved `esbuild` to runtime dependencies.
- `loadProjectAndHydrate` now surfaces run-load failures instead of silently rendering an empty page.

## [v1.22.1] — 2026-07-02

### Fixed
- **Usage Persistence**: Added `usageReport` to Firestore Rules project update allowlist with `is map` validation. Usage imports now persist across page reloads.
- **Usage Bucketing (Low ≠ Dormant)**: Introduced new `low` usage bucket for objects with below-average but non-zero, recent usage. Low-frequency objects (monthly closings, year-end, audit reports) are no longer misclassified as `dormant` or `retire-candidate`.
- **Retire-Candidate Guardrails**: `retire-candidate` quadrant now requires zero usage or 13+ months dormancy. Description updated to require "business owner confirmation" before retirement.
- **Call Count Locale Parsing**: Fixed number format ambiguity where `1,234` (EN) was misinterpreted as `1.234` → rounded to `1`. New locale-aware parser correctly handles DE (`1.234`), EN (`1,234`), mixed (`1.234,00` / `1,234.00`), and space-separated (`1 234`) formats.
- **Solution Design Generation**: Fixed object/string type mismatch in `prepareAnalysisContext()` where Firestore hydration returned analysis as an object instead of a string. Added comprehensive `[Design]`-prefixed debug logging.
- **Evidence Scan Visual Overhaul**: SweepVerdictBar with stronger contrast, colored top borders, scale effects. SweepCodeViewer with larger fonts, line-level severity highlighting. Minimum scan duration increased to 6 seconds.
- **Export Script P0 Fix**: Replaced all `-Path` with `-LiteralPath` in `export-source.ps1` to correctly handle Next.js dynamic routes with square brackets (`[projectId]`).

### Changed
- **Risk Matrix UI**: Added `Low Usage` row with yellow color scheme between Moderate and Dormant. Tooltips for Low, Dormant, and Unknown rows explaining classification logic.
- **package-lock.json**: Regenerated from scratch to fix Cloud Build `npm ci` sync failures (missing `js-yaml@3.15.0`, `argparse@1.0.10`).

## [v1.22.0] — 2026-07-02

### Added
- **Usage Import & Risk Prioritization**: Upload SAP usage exports (SCMON, UPL, ST03N) for usage-weighted risk analysis. Format-tolerant parser with CSV delimiter sniffing and XLSX support via SheetJS.
- **Risk/Usage Matrix**: Interactive 2D quadrant visualization (Usage × Feasibility) with drill-down object detail flyout. Quadrants: Danger Zone, Prioritize, Retire Candidate, Low Priority, Unknown.
- **"Unknown ≠ Dormant" Safeguard**: Objects without usage data always show "Unknown" status with mandatory tooltip. Never classified as unused or retire-candidate without evidence.
- **Privacy-First Import Layer**: Whitelist-based PII sanitization strips usernames, terminals, IPs before persistence. Only object × frequency stored. 90-day retention TTL.
- **UPL Aggregation**: Procedure-level Usage & Procedure Logging exports automatically aggregated to object-level for evidence engine matching.
- **Run Capabilities Extension**: Shape-based `hasUsageData` capability. Usage is optional — absence does not trigger legacy run.
- **Solution Design Rendering Patch**: All design page sections wrapped in SectionBoundary for crash isolation. LegacyRunBanner for pre-v1.14 runs. RoutingRationale/TargetArchitectureDiagram data guards.

### Changed
- `lib/run-capabilities.ts` extended with `usageReport` field and `hasUsageData` capability
- `lib/types.ts` Project interface extended with `usageReport` field

## [v1.21.0] — 2026-07-02

### Added
- **Evidence Sweep Animation (v1.21 Roadmap)**: Real-time animated overlay during analysis that replays the instant `buildAbapEvidence()` scan results. Findings appear sequentially with a glowing scan-line sweeping through the source code, replacing the previous fake loading stages.
- **SweepCodeViewer**: Monospace ABAP code viewer with syntax highlighting, line numbers, finding badges pinned to exact code lines, and auto-scroll following the scan-line position.
- **SweepVerdictBar**: Animated severity counter tiles (Critical/High/Medium/Low) that tick up as findings appear. Verdict "locks in" with glow pulse on completion.
- **EvidenceSweep Orchestrator**: Sequences finding reveals over ~3.5s minimum duration. Gemini API call runs in parallel — results are buffered until the sweep animation completes.
- **Accessibility**: `prefers-reduced-motion` skips animation entirely and shows instant end-state. `aria-live` on verdict region. All new components fully responsive (mobile-first).

### Fixed
- **Solution Design 1000+ LOC Bug**: Fixed critical bug where Solution Design generation failed for large ABAP programs (1000+ LOC). Added `prepareAnalysisContext()` that extracts only design-relevant analysis fields (capped at 15K chars) instead of dumping the full 30-50KB raw analysis JSON into the design prompt.
- **Design Error State**: Replaced silent `alert()` with persistent `designError` state and visible error UI with retry button and contextual guidance.

## [v1.20.0] — 2026-07-02

### Added
- **SAP Cloudification Repository Integration**: Analysis engine now maps against SAP's official Cloudification Repository (23,696 classified objects) — the same authoritative source SAP's own ATC compliance checks use.
- **Layered Catalog Architecture**: Curated field-level entries (Layer 1) always take precedence; SAP repository entries (Layer 2) provide broad, authoritative coverage. Each finding carries its source layer (`curated` vs. `sap-official`) for full audit traceability.
- **No-Path Verdicts**: Objects without released successors now produce a positive "no clean path" signal backed by SAP's official classification — not just absence from a curated list.
- **Auto-Sync Pipeline**: Weekly GitHub Actions workflow (`sync-catalog.yml`) syncs the repository, generates a deterministic artifact (SHA-256 verified), and opens a PR. Catalog version in every Audit Pack includes commit hash, entry count, and fetch date.
- **Dynamic Catalog Badge**: Landing page comparison section shows live classified-object count from the synced artifact.

### Changed
- **Narrative Correction**: Corrected terminology from "SAP API Business Hub" to "SAP Cloudification Repository" across all public-facing pages (landing page, how-it-works, ABAP analysis, QuickAnswer blocks).
- **T005 Mapping Upgrade**: T005 (Countries) now correctly maps to `I_COUNTRY` (SAP-official) instead of guessed `I_T005`.

## [v1.19.0] — 2026-07-02

### Trust Chain Closure (Security / P0)
- **Downstream Run Enforcement**: All 6 downstream pages (Design, Transformation, Testing, Documentation, Delivery, TCO) now enforce `activeRunId` presence via `enforceActiveRun()` guard. Projects without an immutable analysis run are redirected to the Analyze page with an informational banner.
- **Run Guard Module**: New `lib/run-guard.ts` provides `hasActiveRun()` and `enforceActiveRun()` utilities for centralized Trust Chain enforcement across the platform.
- **Audit Pack Run Gate**: Audit Pack export now throws an explicit error when no `activeRunId` exists, preventing generation of unbound packs with empty run references.
- **Server-Authoritative Run Validation**: The `/api/export/sign` endpoint now validates that the requested run is the active run for the project (HTTP 409 if stale) and that the run has a valid `runHash` (HTTP 422 if incomplete).
- **E2E Trust Chain Test**: New `tests/trust-chain-e2e.spec.ts` with 15 test cases covering run guard logic, audit pack run gate, sign endpoint validation, downstream page guards, and module completeness.

## [v1.18.1] — 2026-07-01

### Added
- **Cryptographic Run Binding**: Server-side signing endpoint is now bound to the Firestore Run document by including the project ID, run ID, run hash, engine version, and SAP API catalog version in the signature input.
- **Unsigned Suffix Alignment**: Unsigned manifest exports also compute and check the same suffix metadata context, ensuring uniform integrity verification across all platforms.
- **Signature verification hardening**: Enforced input length and hex constraints on signature verification to protect the public API endpoint.

## [v1.18.0] — 2026-07-01

### Added
- **Enterprise Non-Functional Requirements**: Dedicated Gemini-powered call in Solution Design to generate detailed guidelines across 8 categories (Data Migration, Retention, Audit Trail, Authorization, Error Handling, Monitoring, SLAs, Cutover). Rendered using a premium accordion UI.
- **Credit Management Detection**: Deterministic finding for legacy Credit Management patterns (Z_CREDIT_*, FSCM) indicating SAP standard replacement paths and tagging for architect review.
- **Verify Pack Distinction**: Visual warning states in the Audit Verification page to clearly flag unsigned integrity-only packages from authentic (cryptographically signed) exports.
- **E2E Test Coverage**: Complete regression suite (`tests/evidence-engine-v118.spec.ts`) asserting new scanner mechanics and scoring calibrations.

### Changed
- **Verified -> Catalog Match**: Global rename of confidence labels to align with professional auditing terminology. Full backward compatibility maintained for existing Firestore runs.
- **Deployment-Aware Severity**: Calibration of Standard Fit severity where Public Cloud table reads trigger Critical/High severity warnings, and Private Cloud table reads show Medium severity upgrade risks.
- **Granular API Mappings**: Matched tables like MARD to `I_MaterialStockInStorageLocation` instead of broad Product master data, adding MARDH and MCHB mappings.
- **ROI Range Estimates**: Replaced single-value dollar figures with range-based TCO projections and baseline calibration warnings.
- **Signature Input Alignment**: Uniform HMAC-SHA256 calculation over the manifest SHA-256 hash across both PowerShell and Web-based exports.

## [v1.17.0] — 2026-07-01

### Audit Pack v2 & Signed Exports
- **Cryptographic Manifest**: Every Audit Pack ZIP now contains a `manifest.json` with SHA-256 hashes for all included files, engine metadata, and SAP API Catalog version.
- **Server-Side HMAC Signing**: New API endpoint `POST /api/export/sign` computes an HMAC-SHA256 signature over the canonical manifest using the server-only `AUDIT_SIGNING_KEY`, ensuring tamper-proof audit exports without exposing the signing key to the client.
- **Public Verification Endpoint**: New `POST /api/export/verify` endpoint allows external auditors (e.g., KPMG, SAP) to verify audit pack signatures without a platform account.
- **Verification Engine** (`lib/audit-pack-verify.ts`): Client-side ZIP integrity checker that validates file hashes, manifest consistency, and cryptographic signatures via the server endpoint.
- **Verify Pack Page** (`/verify-pack`): Drag-and-drop compliance verification page with real-time integrity badges, file-by-file hash status, signature verification, and export metadata display.
- **AnalysisRun Completeness**: Extended the `AnalysisRun` interface with `dataCoupling`, `codeInventory`, `worklist`, and recommendation fields to ensure audit packs contain all assessment data from immutable run documents.
- **Graceful Fallback**: If the signing service is unavailable, audit packs are exported with an unsigned manifest and a clear warning — no data loss or export failure.
- **Catalog Version Display**: Executive Summary and Model Card now include the SAP API Catalog version for full audit traceability.

## [v1.16.0] — 2026-07-01

### Security Hardening
- **Phase 2 — Immutable Analysis Runs & Fallback Hardening (F-01)**: Fully completed the transition to server-authoritative calculations for runs in [route.ts](app/api/runs/create/route.ts). Enforced that the server loads/validates inputs (`legacyCode` & `s4Deployment`) directly from the parent project, with a fallback to body parameters for initial uploads or re-analysis.
- **Run Metadata Cleanup**: Ensured the deletion of denormalized analysis result fields on the parent project document to prevent stale data conflicts.
- **Strict Firestore Rules Allowlist**: Overhauled update rules in [firestore.rules](firestore.rules) to enforce a strict allowlist of permitted client-writable draft/interactive fields (e.g. `status`, `s4Environment`, `solutionDesign`, `targetArchitecture`), ensuring all other metadata and results remain immutable.
- **Workflows Signing Key Verification**: Configured the GitHub Actions [deploy.yml](.github/workflows/deploy.yml) workflow to assert that the `AUDIT_SIGNING_KEY` environment secret is set before triggering compilation.
- **Cryptographic Export Signing**: Upgraded the [export-source.ps1](scripts/export-source.ps1) script to dynamically read the platform version from `package.json`, generate a `manifest.json` with file hashes, and compute an HMAC-SHA256 signature using the `AUDIT_SIGNING_KEY`.
- **Export Verification Utility**: Added a new PowerShell script [verify-export.ps1](scripts/verify-export.ps1) to verify manifest integrity and authenticate signatures of exported codebase zip archives.
- **Downstream Page Hydration**: Unified downstream page state loading by replacing direct `getDoc` calls with a shared `loadProjectAndHydrate()` resolver across all stage controllers.

## [v1.15.0] — 2026-06-30

### Security Hardening
- **Phase 2 — BYOK Server-Only Secret Store (F-01)**: Migrated Gemini API Key storage from client-readable Firestore profiles (`users/{uid}`) to a server-only encrypted collection (`user_secrets/{uid}/providers/gemini`). Credentials are encrypted at rest using AES-256-GCM under the `S4_ENCRYPTION_KEY` environment variable.
- **Client Profile Security Isolation**: Restricted Firestore client-side update access rules by removing `'geminiApiKey'` from the permitted client update keys and fully blocking direct client-side read/write access to the `user_secrets` collection.
- **Client-to-Server BYOK Endpoints**: Implemented new API routes `/api/secrets/gemini` (POST to save, DELETE to delete) and `/api/secrets/gemini/test` (POST to verify connectivity using server-side decrypted credentials) to ensure client-side code never handles cleartext keys in transit or at rest.
- **Playwright E2E Security Tests**: Added automated E2E test suites in `tests/security-compliance.spec.ts` asserting secure key rotation, API key deletion, connection testing, and Firestore rules blocking client-side access.
- **Admin Panel Reference Sanitization**: Verified and ensured the removal of name placeholders ("e.g. Sonny Frenzel") from the platform administrator and tenant approval panels.

## [v1.14.0] — 2026-06-29

### Added
- **Phase 2 & 3 — Deterministic Evidence Scanner:** Implemented a statement-based static scanner (`buildAbapEvidence` in `lib/abap/evidence-model.ts`) that extracts concrete legacy patterns (BDC, RFC, Native SQL, DB Writes, Dynpro, ALV, GUI Downloads) and persists the complete report as `evidenceReport` in Firestore.
- **Phase 4 & 7 — Extensibility Router & Score Calibration:** Added `lib/abap/extensibility-router.ts` to calculate Clean Core score, recommendation confidence, decision checkpoints, and target architectures (In-App RAP vs Side-by-Side CAP) mathematically from scanner findings, eliminating LLM hallucinations.
- **Class Model Resolver:** Created `lib/abap/class-model-resolver.ts` to build topological sort linearization and missing dependency trees, replacing the mocked `ClassModel` across all 5 analysis UI hooks.
- **Evidence Findings Table:** Added a dedicated evidence findings table to the Decision & Evidence tab — deduplicated by kind+objectName, sorted Critical→Low, with severity filter buttons and occurrence count aggregation.
- **Inline Code Viewer:** Replaced the external "DOCS ↗" link in the Gaps Worklist with an inline "View Code" toggle showing source code context (±2 lines) with amber line highlighting for each occurrence.
- **Confluence Export — Evidence & Worklist:** Added Evidence Findings table and Gaps Worklist table to the Confluence HTML export with Pattern, Lines, Snippet, Severity, SAP Replacement + Confidence, Target, Status.
- **Inheritance Unit Tests:** Added unit tests verifying inheritance linearization and missing dependencies in `tests/abap-inheritance.spec.ts`.

### Changed
- **Phase 5 & 6 — Unified Report Model & Grounding:** Restructured the Gemini prompt to act purely as a narrative generator, grounded on deterministic findings instead of raw legacy code.
- **Score Formula Recalibration:** Replaced linear per-finding deductions with diminishing returns per category and a 5% floor, producing realistic 12-18% scores for heavily legacy code (was 0%).
- **Criticality Score Boost:** Added business-critical process detection (Sales/Delivery/Credit/Audit/Partner tables and keywords) raising fulfillment code from 5/10 to 7-8/10.
- **Prompt Hardening:** Softened decommissioning language ("retire after validation and business sign-off"), added API confidence markers (Verified/Candidate/Needs Validation), hedged ROI claims with ranges and assumptions, instructed hybrid routing guidance.
- **Worklist Deduplication:** Grouped evidence findings by kind+objectName in both the Gaps Worklist and fallback builder, aggregating line numbers into a single row with `(N×)` count.
- **Sprint 1 Data Coupling:** Hardened data coupling table parser with `tokenize` statement grouping, blacklist filtering (MODE, RISK, SCREEN, LINE, ADJACENT), and correct data export mapping.
- **Dynamic Version in Exports:** Confluence report footer now uses `APP_VERSION` dynamically instead of hardcoded `v1.13`.

### Fixed
- **Language Consistency:** Translated remaining German UI text ("Aktion erforderlich" block) to English for consistent language across the entire platform.

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

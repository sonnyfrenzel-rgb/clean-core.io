# Clean-Core.io — Enterprise SAP Code Modernization Platform

Clean-Core.io is a modern, high-performance, and secure web and desktop client application designed to streamline SAP ABAP legacy migrations to TypeScript/Node.js. Fully aligned with the official SAP **Clean Core Extensibility Paradigm**, it enables enterprise architects and developers to modernize custom transactional operations, verify compliance with released APIs, and compile modular side-by-side cloud architectures.

---

## 🌟 Premium Key Features

*   **Visual Code-Transformation Integrity HUD & Heatmap (English UI):**
    Provides real-time feedback on code modernization status:
    *   **Clean Core Compliance Shield (Hero HUD):** A circular glassmorphic compliance progress radar that adapts dynamically (Green/Amber/Red) and details grounding statistics.
    *   **Code-Integrity Minimap (Heatmap Scrollbar):** A vertical scroll strip containing colored markers matching translation findings (Fully Grounded, SQL Quirks, RTTI gaps) with smooth scroll-to-line navigation.
    *   **Grounded Grounding Audit Panel (Sliding Drawer):** Includes an interactive developer sign-off checklist that updates the compliance score in real-time, detailed SQL CDS matches (mapping tables to released standard views), active Open SQL quirk remediation settings, and a **Differential Sandbox Result-Set Tester** that simulates S/4HANA live query checks.
*   **Realistic OO & Complex SQL Join Test Balloon:**
    A comprehensive test script (`abap-test-files/Z_ORDER_INTEGRITY_CHECK.txt`) modeling legacy invoice processing with abstract classes, subclasses, redefinitions, and a complex 3-table SELECT query with `FOR ALL ENTRIES` and `LEFT OUTER JOIN` quirks, designed for pilot users to verify the engine's grounding behavior.
*   **S/4HANA Live Bridge (BYOT - Bring Your Own Tenant):**
    Connect your own S/4HANA Public Cloud Test/Sandbox Tenant to run E2E unit tests on live ERP destinations. Credentials are encrypted at rest (AES-256-GCM) in a server-only Firestore collection, inaccessible to client SDKs.
*   **Unified Pilot & Tenant Administration Console:**
    Comprehensive admin workbench (`/admin`) allowing administrators to instantly review, approve, or revoke pilot access requests, track tenant bridge applications, and toggle Bring-Your-Own-Tenant (BYOT) privileges with live status badges.
*   **Transactional Verification & Responsive Email Automations:**
    Fully integrated with the Resend API to deliver secure, responsive, HTML-table-formatted notifications. Sonny receives manual approval emails with cryptographic verification links, and applicants receive dynamic welcome activation emails.
*   **Legacy-to-Modern AI Transformation Engine:**
    Modular code translation from SAP ABAP to structured Node.js/TypeScript code using Google Gemini. Classifies legacy logic to automatically separate **In-App Developer Extensibility (ABAP Cloud RAP)** from **Side-by-Side Extensibility (BTP CAP)** tracks.
*   **Modernization Assessment Engine (v1.9.0):**
    Computes complexity and business-criticality scores from uploaded ABAP code. Extracts a full code inventory (classes, reports, function modules) and maps data coupling with standard SAP table risk analysis — all before transformation begins.
*   **Architect Sign-Off Gate (v1.9.0):**
    Requires explicit target architecture confirmation (RAP, CAP, Integration Suite, Event Mesh, or Retire) before code transformation. Supports override with justification and captures a full audit trail (approver email, timestamp, rationale).
*   **Compliance Audit Pack & Board Presentation (v1.12.0):**
    Exportable ZIP evidence package (including Word document executive summaries) and a deterministic, rollup-secured Board Presentation (Stage 7) mapping support levels and risks dynamically, keeping compliance in sync with the `SUPPORT_MATRIX`.
*   **Deterministic ABAP OO Inheritance Resolver & Grounding Layer:**
    Resolves complex, multi-stage class and interface hierarchies deterministically before LLM invocation. Linearizes members via MRO, maps constructors and interface aliases, and requests missing dependencies dynamically via a bundle upload UI, preventing LLM structure hallucinations.
*   **Architectural Solution Design & File Explorers:**
    Interactive visual representation of API endpoints, directory configurations (including database entity mapping and Docker containers), and direct public links to the SAP API Business Hub.
*   **ADT Cockpit & Unit Testing:**
    Provision a virtual Eclipse ADT Test Cockpit to compile and execute unit tests with process-level isolation. If S/4HANA Live Bridge is activated, only the required S/4 credentials are injected as environment variables — no other server secrets are exposed.
*   **Process Blueprinting & BPMN 2.0 Mapping:**
    Generates dynamic Level 1-4 functional blueprints and interactive BPMN process flow maps directly from modernized business logic.
*   **GDPR / DSGVO Sovereign Data Erasure:**
    Strict enforcement of Article 17 GDPR (Right to Erasure). A secure transactional deletion cascade in the settings panel recursively purges all user footprints, project workspaces, custom snippets, and authentication keys.
*   **Frosted-glass UI:**
    Visually stunning dark-mode design featuring vibrant HSL-tailored emerald mesh gradients, smooth framer-motion transitions, and polished glassmorphism aesthetics.
*   **SEO & AI-Search Engine Optimization (GEO):**
    Fully optimized for classic search engines and AI engines. Includes a custom `robots.txt` prioritizing AI crawlers (`GPTBot`, `PerplexityBot`, etc.), comprehensive JSON-LD graphs (`Organization`, `Person` for founder Felix Frenzel, `SoftwareApplication`, `FAQPage`), and dedicated high-authority landing pages. HTML assets utilize Next.js ISR (`revalidate = 300`) to guarantee fresh indexation.

---

## 📦 Technical Architecture & Stack

Clean-Core.io is engineered for ultimate performance, security, and portability:

*   **Frontend Core:** React 19, Next.js (v15.5) App Router, HSL Custom Glassmorphism Styling.
*   **Security & Database:** Firestore & Firebase Auth secured with custom rules and server-side token verification via Firebase Admin SDK.
*   **Animations:** Motion (Framer Motion) for micro-animations and physics-based sliders.
*   **Email Deliverability:** Transactional secure email templates powered by Resend API.
*   **QA Test Runner:** Authenticated TypeScript runtime executing automated unit test specifications with SSRF protection and input sanitisation.

---

## 🚀 Local Development Setup

### 📋 Prerequisites
*   Node.js (v20 or higher recommended)
*   npm (v10 or higher)

### ⚙️ Installation
1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/sonnyfrenzel-rgb/clean-core.io.git
    cd clean-core.io
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment Variables:**
    Copy the sample configuration file:
    ```bash
    cp .env.example .env.local
    ```
    Populate the variables inside `.env.local` including your `GEMINI_API_KEY`, `RESEND_API_KEY`, and standard Firebase project keys.

### 🌐 Running the Web Application
Launch the local Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the client.

---

## ⚙️ S/4HANA Public Cloud Sandbox Integration (BYOT)

Clean-Core.io bridges the gap between static code analysis and live sandbox verification. **Connections are restricted to non-production sandbox systems only — never production environments.** All communication is encrypted, read-only, and admin-gated.

### How it Works:
1.  **Request Access:** Pilot users click "Request Live Tenant Access" inside Stage 5 (Testing Sandbox).
2.  **Security Review:** Administrators receive a cryptographically signed email linking to `/admin/approve-tenant`.
3.  **Privilege Granting:** Admin grants the `s4TenantAccessAllowed` right directly in the Unified Admin Console.
4.  **Secure Connection:** The locked connection panel slides open. Users enter their S/4HANA URL and Basic/OAuth credentials.
5.  **Encrypted Credential Storage:** Credentials are sent to `POST /api/s4-credentials`, encrypted with AES-256-GCM, and stored in a server-only `s4_credentials/{uid}` collection. Only non-secret metadata (`s4Meta`) is stored in the user profile.
6.  **Server-Side Resolution:** During test execution, the server loads and decrypts credentials automatically. Credentials **never** leave the server after initial save.

---

## 🔒 Security, Sovereignty & Compliance

Clean-Core.io prioritizes data security and user privacy above all else:

*   **Server-Side Auth:** All mutating API routes require a valid Firebase ID token verified via Firebase Admin SDK.
*   **SSRF Protection:** Multi-layer defense: HTTPS-only, DNS resolution with IP re-check, host allowlist (`S4_HOST_ALLOWLIST`), credential-in-URL blocking, internal TLD blocking, cloud metadata endpoint blocking, encoded IP detection, and redirect target validation. See [`SECURITY.md`](SECURITY.md) for full details.
*   **Encrypted Credentials (AES-256-GCM):** S/4HANA credentials are encrypted at rest in a server-only Firestore collection (`s4_credentials`). Client SDKs cannot read this collection (`allow read, write: if false`). Passwords follow a write-only pattern — they are never returned to the client.
*   **Admin Gating:** All privileged routes (email sending, tenant management) require `verifyAdminRequest()` with email allowlist enforcement.
*   **Quota Enforcement:** Transformation quotas are enforced via atomic server-side Firestore transactions. Client-side counters are decorative only.
*   **RCE Prevention:** The `/api/run-tests` route is permanently disabled (HTTP 503) to prevent remote code execution.
*   **Field-Level Security:** Firestore Security Rules freeze all privileged fields (isAdmin, tier, quota counters) so only admins can modify them.
*   **Art. 17 GDPR Cascade Deletion:** Instantly purges authentication profiles, custom uploads, ABAP scripts, analysis metadata, modernized designs, blueprints, generated ZIP packages, sandbox outputs, configurations, and **encrypted S/4HANA credentials**.
*   **Full Security Documentation:** See [`SECURITY.md`](SECURITY.md) for the complete security architecture, threat model, and developer checklist.

---

## 🗺️ Roadmap to v2.0

> Prioritized based on the [Delta Report & Werteinschätzung (2026-07-01)](docs/delta-report-v117.md) and internal security review.
> Status legend: ✅ Done · 🔧 In Progress · 📋 Planned · 💡 Under Evaluation

---

### v1.19 — Trust Chain Closure *(Security / P0)*

The single most important milestone: close the server-authoritative evidence chain end-to-end.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **Analyze → Run Integration**: Analyze page calls `/api/runs/create` as mandatory step after successful Gemini analysis. No analysis persists without an immutable server-side Run. | 📋 | P0 §1 |
| 2 | **Downstream Run Enforcement**: All downstream pages (Design, Transformation, Testing, Docs, Delivery) enforce `activeRunId` presence via `loadProjectAndHydrate()`. Missing Run → redirect to Analyze. | 📋 | P0 §1 |
| 3 | **Audit Pack Run Gate**: Audit Pack export requires `activeRunId`. Packs without a bound Run are blocked or explicitly exported as `legacy-unsigned` with a visible warning badge. | 📋 | P0 §1, P1 §3 |
| 4 | **Server-Authoritative Manifest**: Sign endpoint reads Run document from Firestore and validates that `runHash` in manifest matches stored `runHash`. Client cannot forge run binding. | 📋 | P1 §2 |
| 5 | **E2E Trust Chain Test**: Playwright test: Upload ABAP → Analyze → Run created → `activeRunId` set → Audit Pack exported → Verify Pack confirms `authentic` status. | 📋 | P0 §1 |

---

### v1.20 — Audit & Verify Hardening *(Security / P1)*

Harden the signature and verification layer for external auditor credibility.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **Unsigned Pack Visual Distinction**: Verify UI shows amber "Integrity Only" status for unsigned packs instead of green success. Three-tier model: `authentic` → `integrity-only` → `failed`. | ✅ v1.18.0 | P1 §3 |
| 2 | **Verify Endpoint Input Hardening**: Enforce `signature.length === 64`, hex regex, `canonicalManifest` max 32KB, structured error codes. | ✅ v1.18.1 | P2 §2 |
| 3 | **Signature Format Unification**: Web and PowerShell exports both use `HMAC_SHA256(signingKey, manifestHash)` — single canonical format. | ✅ v1.18.0 | P1 §4 |
| 4 | **Draft vs. Final Field Separation**: Introduce `draft_` prefix convention for client-writable fields (`draftSolutionDesign`, `draftGeneratedCode`). Final artifacts only in immutable Run sub-documents. | 📋 | P1 §5 |
| 5 | **Server-Side Audit Pack Generation**: Manifest and evidence files generated server-side from Run data. Client only triggers download, never supplies file content for signing. | 📋 | P1 §2 |

---

### v1.21 — Evidence Sweep *(UX / Analyze)*

Make the deterministic scan visible: replay the instant `buildAbapEvidence()` results as a live animated overlay during the Gemini loading phase. High-impact, zero backend changes.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **SweepCodeViewer**: Monospace code viewer with line numbers and annotation slots for finding badges. Supports auto-scroll to next finding position. | 📋 | Evidence Sweep |
| 2 | **EvidenceSweep Orchestrator**: Sorts findings by `lineStart`, reveals them sequentially over ~3.5s with scan-line animation. Severity-colored badges pin to exact code lines. | 📋 | Evidence Sweep |
| 3 | **SweepVerdictBar**: Animated counter tiles (Critical/High/Medium/Low) that tick up as findings appear. Coverage verdict "locks in" with glow effect at animation end. | 📋 | Evidence Sweep |
| 4 | **Parallel Gemini Timing**: Evidence Sweep runs during the 8–15s Gemini API call. Minimum sweep duration 3s; Gemini result is buffered and shown after sweep completes. | 📋 | Evidence Sweep |
| 5 | **Accessibility**: `prefers-reduced-motion` → instant end-state. `aria-live` on verdict region. Optional timeline scrubber for replay control. | 📋 | Evidence Sweep |

---

### v1.22 — Usage Import & Risk Prioritization *(Feature / Enterprise)*

Transform the platform from static code analysis to usage-weighted risk assessment.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **SCMON / UPL Import Parser**: Upload and parse SAP Custom Code Migration Worklist (SCMON) and Usage & Procedure Logging (UPL) exports (CSV/Excel). | 📋 | Konzept §1 |
| 2 | **ST03N Workload Integration**: Parse ST03N transaction statistics to weight code objects by actual production utilization frequency. | 📋 | Konzept §1 |
| 3 | **Usage-Weighted Risk Matrix**: Combine static findings severity with usage frequency to produce a 2D risk/usage prioritization matrix. High-risk + high-usage = top priority. | 📋 | Konzept §1 |
| 4 | **Unknown ≠ Dormant Safeguard**: Objects without usage data display "Unknown" status (never "Unused"). Tooltip explains that missing data requires manual verification. | 📋 | Konzept §1 |
| 5 | **Usage Data Compliance**: Pseudonymization of user-identifiable fields, tenant-isolated storage, configurable retention period, GDPR-compliant deletion. | 📋 | Konzept §1 |

---

### v1.23 — Public API Catalog & SEO *(Feature / Marketing)*

Turn the internal SAP API mapping into a public differentiating asset.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **Public API Catalog Page**: Browsable, searchable page showing all 80+ SAP table → released API mappings with confidence levels and catalog version. | 📋 | Konzept §2 |
| 2 | **Honest Confidence Labels**: Display `Catalog Match`, `Candidate`, `Needs Validation`, `No Released API Found` — never imply SAP certification. | ✅ v1.18.0 | Konzept §2 |
| 3 | **SEO-Optimized Detail Pages**: Individual pages per SAP module (FI, SD, MM, PP, CO, PM, HR) with proper meta tags, structured data, and internal linking. | 📋 | Konzept §2 |
| 4 | **Community Feedback Loop**: "Report Missing Mapping" button per entry allowing authenticated users to suggest new table→API mappings. | 💡 | Konzept §2 |
| 5 | **Versioned Catalog Updates**: Catalog entries tagged with SAP release version (e.g. `2024.FPS02`). Changelog visible per entry. | ✅ Partial | Konzept §2 |

---

### v1.24 — Run Diff & Progress Tracking *(Feature / Enterprise)*

Enable transformation program steering through immutable run comparison.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **Run History Timeline**: Visual timeline of all analysis runs per project with date, Clean Core Score, and finding count delta. | 📋 | Konzept §4 |
| 2 | **Diff View**: Side-by-side comparison of two runs showing new findings, closed findings, changed severity, and changed recommendations. | 📋 | Konzept §4 |
| 3 | **Risk Reduction Metrics**: Dashboard widget showing cumulative risk reduction across runs (e.g., "Critical findings: 12 → 4 across 3 sprints"). | 📋 | Konzept §4 |
| 4 | **Progress Export**: PDF/Markdown export of run-over-run progress for steering committee reporting. | 📋 | Konzept §4 |

---

### v1.25 — CSP Hardening & Operational Readiness *(Security / Operations)*

Close remaining security gaps and prepare for enterprise operational requirements.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **CSP `unsafe-inline` Removal**: Migrate all inline styles to CSS modules or styled components. Document any remaining exceptions with security justification. | 📋 | Delta §CSP |
| 2 | **SBOM & SCA in CI**: Generate Software Bill of Materials on every build. Integrate dependency vulnerability scanning (e.g., `npm audit`, Snyk, or Trivy). | 📋 | Enterprise §4 |
| 3 | **Monitoring & Alerting**: Cloud Run health checks, error rate alerting, Firestore usage monitoring, and signing key rotation reminders. | 📋 | Delta §Ops |
| 4 | **Incident Response Playbook**: Documented procedure for security incidents, key compromise, and data breach notification. | 📋 | Enterprise §3 |
| 5 | **Retention & Backup Policy**: Documented data retention periods per collection, automated Firestore backup schedule, and GDPR Article 17 compliance verification. | 📋 | Enterprise §3 |

---

### v1.26 — Demo & Sales Enablement *(Product / Growth)*

Lower time-to-insight for prospects and enable self-service sales demos.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **One-Click Sample Analysis**: Pre-loaded 1000-LOC ABAP sample with instant analysis results — no upload required. Clear "Sample" badge throughout. | 📋 | Konzept §5 |
| 2 | **Shareable Verdict Links**: Public permalink to a read-only assessment summary (findings count, score, recommendation) for sharing in pre-sales conversations. | 💡 | Konzept §5 |
| 3 | **Lean Code Traceability Mapping**: Contextual "peek & jump" overlay linking modernized TypeScript/RAP statements back to their legacy ABAP syntax sources. | 💡 | Backlog |

---

### v2.0 — Enterprise Grade *(Milestone)*

The platform is enterprise-contract-ready: fully auditable, operationally hardened, and multi-tenant capable.

| # | Item | Status | Delta Ref |
|---|------|--------|-----------|
| 1 | **External Penetration Test**: Commissioned security assessment by independent firm. Remediation of all Critical/High findings before launch. | 📋 | Enterprise §1 |
| 2 | **Trust Center**: Public page documenting security architecture, compliance certifications, data residency, subprocessor list, and incident history. | 📋 | Enterprise §2 |
| 3 | **DPA / TOMs / Subprocessor Documentation**: Data Processing Agreement template, Technical & Organizational Measures document, and subprocessor registry for enterprise procurement. | 📋 | Enterprise §3 |
| 4 | **SSO / Org / RBAC**: SAML/OIDC SSO integration, organizational hierarchy support, and role-based access control (Viewer, Analyst, Architect, Admin) — at minimum as Enterprise add-on. | 📋 | Enterprise §5 |
| 5 | **Claims Matrix Review**: Legal review of all platform claims (accuracy, reliability, compliance) with documented limitations and disclaimers per feature area. | 📋 | Enterprise §Legal |
| 6 | **SECURITY.md v4.0**: Full documentation of Trust Chain, Run immutability, Audit Pack cryptographic guarantees, and all v1.19–v2.0 security improvements. | 📋 | Delta §Security |

---

### Enterprise Readiness Scorecard (Current → Target)

| Dimension | v1.18.1 | v2.0 Target |
|---|:---:|:---:|
| Fachlicher Produktwert | 8.5 | 9.0 |
| SAP Clean-Core Fit | 8.4 | 9.0 |
| UX / Journey | 8.3 | 8.8 |
| Evidence / Nachvollziehbarkeit | 8.0 | 9.2 |
| Auditierbarkeit | 7.2 | 9.0 |
| Security | 7.7 | 9.0 |
| Enterprise Betriebsreife | 6.8 | 8.5 |
| **Gesamtplattform** | **8.0** | **9.0** |

> Source: Delta Report & Werteinschätzung (2026-07-01)

---

## 📄 Open Source License

This project is licensed under the **MIT License** — completely open source, secure, and free for collaborative enterprise development.

# Clean-Core.io — Free, Community SAP Clean Core Modernization

Clean-Core.io is a free, community-built web application that helps SAP practitioners modernize custom ABAP toward TypeScript/Node.js, aligned with SAP's **Clean Core Extensibility** principles. It helps architects and developers assess custom-code Clean Core readiness, map to released APIs, and draft modular RAP/CAP designs for review — **complementary to SAP's own tooling (ADT, ATC), not a replacement**. Not affiliated with or endorsed by SAP SE.

---

## ✨ Key Capabilities

*   **Visual Code-Transformation Integrity HUD & Heatmap (English UI):**
    Provides real-time feedback on code modernization status:
    *   **Clean Core Compliance Shield (Hero HUD):** A circular glassmorphic compliance progress radar that adapts dynamically (Green/Amber/Red) and details grounding statistics.
    *   **Code-Integrity Minimap (Heatmap Scrollbar):** A vertical scroll strip containing colored markers matching translation findings (Fully Grounded, SQL Quirks, RTTI gaps) with smooth scroll-to-line navigation.
    *   **Grounded Grounding Audit Panel (Sliding Drawer):** Includes an interactive developer sign-off checklist that updates the compliance score in real-time, detailed SQL CDS matches (mapping tables to released standard views), active Open SQL quirk remediation settings, and a **Differential Sandbox Result-Set Tester** that simulates S/4HANA live query checks.
*   **Realistic OO & Complex SQL Join Test Balloon:**
    A comprehensive test script (`abap-test-files/Z_ORDER_INTEGRITY_CHECK.txt`) modeling legacy invoice processing with abstract classes, subclasses, redefinitions, and a complex 3-table SELECT query with `FOR ALL ENTRIES` and `LEFT OUTER JOIN` quirks, designed for users to verify the engine's grounding behavior.
*   **S/4HANA Live Bridge (BYOT - Bring Your Own Tenant):**
    Connect your own S/4HANA Public Cloud Test/Sandbox Tenant to run E2E unit tests on live ERP destinations. Credentials are encrypted at rest (AES-256-GCM) in a server-only Firestore collection, inaccessible to client SDKs.
*   **Unified Access & Tenant Administration Console:**
    Comprehensive admin workbench (`/admin`) allowing administrators to instantly review, approve, or revoke access requests, track tenant bridge applications, and toggle Bring-Your-Own-Tenant (BYOT) privileges with live status badges.
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
*   **GDPR / DSGVO Data Erasure:**
    Support for Article 17 GDPR (Right to Erasure). An idempotent, multi-system deletion cascade in the settings panel recursively purges user footprints, project workspaces, custom snippets, and authentication keys.
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
1.  **Request Access:** Users click "Request Live Tenant Access" inside Stage 5 (Testing Sandbox).
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
*   **Sandboxed Test Runner:** The `/api/run-tests` route executes generated unit tests in a sandboxed child process — esbuild bundling, Node's Permission Model (filesystem scoped to a temp dir; no child-process/worker/native-addon access), a minimal env with no platform secrets, and time/output/input-size limits. Note: the Node Permission Model does not restrict outbound network access, so this is defence-in-depth, not a full isolation boundary — see [`SECURITY.md`](SECURITY.md) and the roadmap for the isolated-runner track. **Live S/4HANA test execution stays disabled unless network egress is explicitly enforced at the infrastructure level (`S4_TEST_RUNNER_EGRESS_ENFORCED=true`).** See [`SECURITY.md`](SECURITY.md).
*   **Field-Level Security:** Firestore Security Rules freeze all privileged fields (isAdmin, tier, quota counters) so only admins can modify them.
*   **Art. 17 GDPR Cascade Deletion:** An idempotent cascade purges authentication profiles, custom uploads, ABAP scripts, analysis metadata, modernized designs, blueprints, generated ZIP packages, sandbox outputs, configurations, and **encrypted S/4HANA credentials**; a partial failure is surfaced rather than reported as success, and encrypted backups age out within 30 days.
*   **Full Security Documentation:** See [`SECURITY.md`](SECURITY.md) for the complete security architecture, threat model, and developer checklist.

---

## 🗺️ Status: v2.0 shipped

Clean-Core.io is at **v2.0.0** — a security-hardened **Free Community Edition** with an audit-friendly, server-generated evidence chain and operational readiness (health check, structured logging, documented runbooks), plus a sharpened, honest narrative (free · community · **complementary to SAP tooling**, not a competitor). It is not a certified, procurement-grade enterprise platform — see the deliberately deferred items below.

Highlights: server-authoritative, HMAC-signed audit packs · complete GDPR Art. 17 erasure (with an automated completeness test) · supply-chain CI (secret scanning + dependency audit + CycloneDX SBOM) · `/api/health` + structured logging · a public SAP Object Catalog · and a public [/trust](https://clean-core.io/trust) transparency page.

Full release notes: [CHANGELOG.md](CHANGELOG.md) · live at [/changelog](https://clean-core.io/changelog).

### Deliberately in the backlog

Classic enterprise identity/governance items — **SSO (SAML/OIDC), multi-role RBAC, org/project sharing, formal DPA/TOMs, run-over-run diffing, CSP nonce migration, and a commissioned external penetration test** — are intentionally deferred. Clean-Core.io targets **individual** SAP architects, developers and decision-makers (a free community tool), not multi-user enterprise procurement, so these add cost and complexity without matching current need. Full rationale: **[docs/ROADMAP-2.0.md](docs/ROADMAP-2.0.md)**.

Operations, monitoring, backups and rules deployment: **[docs/OPERATIONS.md](docs/OPERATIONS.md)** · Security architecture: **[SECURITY.md](SECURITY.md)** · Data handling: **[docs/DATA-RETENTION.md](docs/DATA-RETENTION.md)**.

---

## 📄 License & Usage

Clean-Core.io is **free to use**, built on **open standards and open data** — its object catalog is grounded in SAP's Apache-2.0-licensed [SAP Cloudification Repository](https://github.com/SAP/abap-atc-cr-cv-s4hc). The platform itself (deterministic engine, curated catalog layer, UI and branding) is **proprietary — all rights reserved** and is *not* open source. You own the output you generate.


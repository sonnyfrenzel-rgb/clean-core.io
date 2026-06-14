# Clean-Core.io — Enterprise SAP Code Modernization Platform

Clean-Core.io is a modern, high-performance, and secure web and desktop client application designed to streamline SAP ABAP legacy migrations to TypeScript/Node.js. Fully aligned with the official SAP **Clean Core Extensibility Paradigm**, it enables enterprise architects and developers to modernize custom transactional operations, verify compliance with released APIs, and compile modular side-by-side cloud architectures.

---

## 🌟 Premium Key Features

*   **S/4HANA Live Bridge (BYOT - Bring Your Own Tenant):**
    Connect your own S/4HANA Public Cloud Test/Sandbox Tenant to run E2E unit tests on live ERP destinations. Credentials are stored in your Firebase user profile, protected by Firestore Security Rules with server-side authentication.
*   **Unified Pilot & Tenant Administration Console:**
    Comprehensive admin workbench (`/admin`) allowing administrators to instantly review, approve, or revoke pilot access requests, track tenant bridge applications, and toggle Bring-Your-Own-Tenant (BYOT) privileges with live status badges.
*   **Transactional Verification & Responsive Email Automations:**
    Fully integrated with the Resend API to deliver secure, responsive, HTML-table-formatted notifications. Sonny receives manual approval emails with cryptographic verification links, and applicants receive dynamic welcome activation emails.
*   **Legacy-to-Modern AI Transformation Engine:**
    Modular code translation from SAP ABAP to structured Node.js/TypeScript code using Google Gemini. Classifies legacy logic to automatically separate **In-App Developer Extensibility (ABAP Cloud RAP)** from **Side-by-Side Extensibility (BTP CAP)** tracks.
*   **Architectural Solution Design & File Explorers:**
    Interactive visual representation of API endpoints, directory configurations (including database entity mapping and Docker containers), and direct public links to the SAP API Business Hub.
*   **ADT Cockpit & Unit Testing:**
    Provision a virtual Eclipse ADT Test Cockpit to compile and execute unit tests with process-level isolation. If S/4HANA Live Bridge is activated, only the required S/4 credentials are injected as environment variables — no other server secrets are exposed.
*   **Process Blueprinting & BPMN 2.0 Mapping:**
    Generates dynamic Level 1-4 functional blueprints and interactive BPMN process flow maps directly from modernized business logic.
*   **GDPR / DSGVO Sovereign Data Erasure:**
    Strict enforcement of Article 17 GDPR (Right to Erasure). A secure transactional deletion cascade in the settings panel recursively purges all user footprints, project workspaces, custom snippets, and authentication keys.
*   **Frosted-glass UI & Electron Desktop Wrapper:**
    Visually stunning dark-mode design featuring vibrant HSL-tailored emerald mesh gradients, smooth framer-motion transitions, and a borderless context-isolated Electron wrapper with native OS sync.
*   **SEO & AI-Search Engine Optimization (GEO):**
    Fully optimized for classic search engines and AI engines. Includes a custom `robots.txt` prioritizing AI crawlers (`GPTBot`, `PerplexityBot`, etc.), comprehensive JSON-LD graphs (`Organization`, `Person` for founder Felix Frenzel, `SoftwareApplication`, `FAQPage`), and dedicated high-authority landing pages. HTML assets utilize Next.js ISR (`revalidate = 300`) to guarantee fresh indexation.

---

## 📦 Technical Architecture & Stack

Clean-Core.io is engineered for ultimate performance, security, and portability:

*   **Frontend Core:** React 19, Next.js (v15.5) App Router, HSL Custom Glassmorphism Styling.
*   **Desktop Shell:** Electron (v30.0) with complete context isolation and secure sandboxing.
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

### 🖥️ Running the Desktop Application (Electron)
To launch the Next.js local server and Electron wrapper concurrently in development mode:
```bash
npm run electron:dev
```
To compile Next.js static files and package the Electron wrapper into a runnable local folder matching your current platform:
```bash
npm run electron:pack
```
To build production distributable installers (e.g., NSIS `.exe` on Windows, `.dmg` on macOS):
```bash
npm run electron:dist
```

---

## ⚙️ S/4HANA Public Cloud Sandbox Integration (BYOT)

Clean-Core.io bridges the gap between static code analysis and live database verification.

### How it Works:
1.  **Request Access:** Pilot users click "Request Live Tenant Access" inside Stage 5 (Testing Sandbox).
2.  **Security Review:** Administrators receive a cryptographically signed email linking to `/admin/approve-tenant`.
3.  **Privilege Zaining:** Sonny grants the `s4TenantAccessAllowed` right directly in the Unified Admin Console.
4.  **Secure Connection:** The locked connection panel slides open. Users enter their S/4HANA URL and Basic/OAuth credentials.
5.  **Credential Storage:** Configuration details are saved in the user's Firestore profile, protected by server-side authentication and field-level security rules.
6.  **Test Runner Injection:** During test execution, only the S/4 credentials are injected into the test process as:
    *   `S4_TENANT_URL`
    *   `S4_USERNAME`
    *   `S4_PASSWORD`
    This enables automated unit tests to run and verify real OData endpoints on your target public cloud system.

---

## 🔒 Security, Sovereignty & Compliance

Clean-Core.io prioritizes data security and user privacy above all else:

*   **Server-Side Auth:** All mutating API routes require a valid Firebase ID token verified via Firebase Admin SDK. SSRF protection blocks internal/private IP access.
*   **Credential Isolation:** BYOK API keys remain in the user's Firestore profile. The test runner receives only the minimum required environment variables — no server secrets are exposed.
*   **Field-Level Security:** Firestore Security Rules freeze all privileged fields (isAdmin, tier, quota counters) so only admins can modify them.
*   **Art. 17 GDPR Cascade Deletion:** Instantly purges:
    *   Authentication profiles.
    *   Custom uploads, ABAP scripts, and analysis metadata.
    *   Modernized designs, blueprints, and generated ZIP packages.
    *   Sandbox outputs, configurations, and connectivity credentials.
*   **Context Isolation:** Electron configuration maintains `nodeIntegration: false` and `contextIsolation: true` to protect users against unsafe remote script execution in desktop mode.

---

## 📄 Open Source License

This project is licensed under the **MIT License** — completely open source, secure, and free for collaborative enterprise development.

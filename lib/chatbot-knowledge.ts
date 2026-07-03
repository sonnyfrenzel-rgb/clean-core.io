/**
 * Centralized Knowledge Base for the Clean-Core.io AI Chatbot
 * 
 * This module consolidates ALL platform content into structured knowledge
 * that is injected into the chatbot's system prompt. This ensures the AI
 * can answer questions about any part of the platform accurately.
 * 
 * Sources:
 * - Knowledge Hub (/knowledge) — FAQs, glossary, RAP vs CAP comparison
 * - How-To (/how-to) — 7-phase walkthrough, narrations, hotspot Q&As
 * - Platform pages — Analysis, Design, Transformation, Testing, Documentation, Delivery, TCO
 * - Settings — BYOK, S/4HANA tenant configuration
 */

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE HUB CONTENT
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWLEDGE_HUB_FAQS = `
## KNOWLEDGE HUB — FREQUENTLY ASKED QUESTIONS

### Q: What is the SAP S/4HANA Clean Core strategy?
A: The Clean Core strategy is an architectural design principle that keeps the SAP standard ERP core software free of custom modifications. Custom extensions are developed either "in-app" using key-user extensibility or "side-by-side" on the SAP Business Technology Platform (BTP). This decoupling allows businesses to upgrade their core ERP system instantly, reduce technical debt, and ensure continuous innovation without breaking custom business logic.

### Q: What is the difference between In-App RAP and Side-by-Side CAP extensions?
A: In-App RAP (ABAP RESTful Application Programming Model) runs directly within the S/4HANA tenant. It is ideal for extending standard SAP business objects and UI layers using native ABAP in a cloud-compliant way. Side-by-Side CAP (Cloud Application Programming Model) runs externally on SAP BTP, typically using Node.js or Java. It is designed for standalone cloud-native applications, multi-tenant SaaS products, and integration with non-SAP systems, fully decoupling execution from the ERP core.

### Q: How does Clean-Core.io secure Side-by-Side BTP integration?
A: Clean-Core.io configures secure tunnels and authentication pathways on SAP BTP. It implements JSON Web Tokens (JWT) validated by the SAP XSUAA (Extended Services for User Account and Authentication) service. This allows stateless, secure API communication and enforces role-based access control (RBAC). For S/4HANA core connections, it uses SAP BTP Connectivity and Destination services, routing RFC and OData traffic securely via SAP Cloud Connector without exposing internal endpoints.

### Q: What is the BYOT (Bring Your Own Tenant) connectivity model?
A: BYOT lets a developer connect their own NON-PRODUCTION S/4HANA sandbox so generated tests can run against a real OData service. It is read-only, credentials are encrypted at rest (AES-256-GCM) in a server-only store, production endpoints are blocked, and every connection is admin-gated (manually reviewed and approved) before activation. Clean-Core.io does not host or persist your ERP data — SAP transaction data is processed statelessly in memory. The feature is free; access is granted by an administrator, not by paying for a tier.

### Q: How does Clean-Core.io help modernize legacy ABAP?
A: A deterministic ABAP evidence engine parses the custom code FIRST (classes, reports, function modules, custom Z-tables, SQL) and produces auditable facts — a code inventory, findings, complexity/criticality scores, and a RAP-vs-CAP routing recommendation. Google Gemini then narrates and drafts modern TypeScript/Node.js (CAP) or ABAP Cloud (RAP) on top of that evidence, and can generate draft test suites and BPMN 2.0 blueprints for Signavio. All AI output is a DRAFT for architect review — it accelerates the assessment; it does not replace human judgment or SAP's own upgrade tooling.
`;

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED GLOSSARY (beyond lib/glossary.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const EXTENDED_GLOSSARY = `
## EXTENDED GLOSSARY

- **SAP Cloud Connector**: A secure software link that runs inside the customer's on-premise or private cloud network, establishing an encrypted TLS connection to SAP BTP without requiring complex inbound firewall configurations.
- **CDS (Core Data Services)**: The data modeling infrastructure used by SAP. CDS views define database tables, relationships, and service projections declaratively inside both the ABAP environment (RAP) and the Node.js/Java environment (CAP).
- **XSUAA (Extended Services for User Account and Authentication)**: SAP BTP's identity and access management service. It issues and validates OAuth 2.0 tokens (JWTs) for securing microservice-to-microservice communication and enforcing user-level authorization scopes.
- **SAP Signavio**: SAP's business process management and mining suite. Clean-Core.io exports BPMN 2.0 XML diagrams compatible with Signavio for process documentation and compliance.
- **BPMN 2.0**: Business Process Model and Notation — an industry-standard graphical notation for specifying business processes. Clean-Core.io generates BPMN 2.0 XML for automated process documentation.
- **RACI Matrix**: Responsible, Accountable, Consulted, Informed — a framework for assigning roles in a process. Clean-Core.io auto-generates dynamic RACI matrices during documentation.
- **TCO (Total Cost of Ownership)**: The complete cost analysis of an SAP modernization project, including cloud hosting, development effort, maintenance, and migration costs. Clean-Core.io provides AI-powered TCO estimation.
`;

// ─────────────────────────────────────────────────────────────────────────────
// RAP vs CAP COMPARISON
// ─────────────────────────────────────────────────────────────────────────────

export const RAP_VS_CAP_COMPARISON = `
## RAP vs CAP EXTENSIBILITY COMPARISON

| Criteria | In-App RAP (ABAP RESTful) | Side-by-Side CAP (SAP BTP) |
|---|---|---|
| Runtime Environment | Directly inside SAP S/4HANA (ABAP stack) | SAP BTP (Node.js, Java, Cloud Foundry/Kyma) |
| Primary Use Case | Modifying/enhancing standard SAP business logic | Standalone apps, partner SaaS, multi-system integration |
| Development Languages | Modern ABAP (Cloud-enabled subset) | JavaScript, TypeScript, Java |
| Database Access | Native SQL on HANA via CDS views | OData, REST, or database targets (HANA, PG, SQLite) |
| Core Decoupling | High logical coupling (shares SAP memory) | Complete architectural separation (connected via APIs) |
| Upgrade Impact | Zero impact (uses officially released SAP APIs) | Zero impact (completely independent execution) |

### When to Choose RAP (In-App):
- Need to extend standard SAP business objects (e.g., Sales Order, Purchase Order)
- Logic must execute in the same SAP LUW (Logical Unit of Work) as the standard transaction
- Requires direct access to SAP database tables via released CDS views
- Using released BAdI enhancement points

### When to Choose CAP (Side-by-Side):
- Building standalone cloud-native applications
- Multi-tenant SaaS products for multiple customers
- Integration with non-SAP systems (Salesforce, ServiceNow, etc.)
- Need complete independence from ERP upgrade cycles
- Using modern JavaScript/TypeScript development workflows
`;

// ─────────────────────────────────────────────────────────────────────────────
// HOW-TO WALKTHROUGH (All 7 Phases)
// ─────────────────────────────────────────────────────────────────────────────

export const HOWTO_WALKTHROUGH = `
## HOW-TO WALKTHROUGH — COMPLETE PLATFORM GUIDE

### Introduction
Custom core modifications are one of the biggest barriers to S/4HANA upgrades. Clean-Core.io is a free, community-built assistant that helps SAP architects and developers assess custom ABAP and draft modern side-by-side cloud services (CAP) or in-app extensions (RAP), keeping the SAP core clean. It is complementary to SAP's own tools (ADT, ATC, Readiness Check, Signavio), not a replacement, and is not affiliated with or certified by SAP. Every analysis is captured as an immutable, HMAC-signed evidence Run.

### Phase 1: Technical Analytics (Upload & Analyze)
Upload custom legacy ABAP source files directly into the Technical Analytics workspace. The static analysis engine parses the legacy custom code, maps external database dependencies, and highlights hard-coded workarounds. You get a clear compliance baseline showing which parts of the legacy package violate the clean-core philosophy.
- **Which files can be uploaded?** You can upload ABAP files directly (e.g. .clas, .prog, or custom SAP transport files) containing your legacy custom code.
- **What are DB dependencies?** The parser detects external database tables, standard function modules, and custom objects that are hard-coded in the ABAP logic.
- **What is the Compliance Baseline?** A calculated rating of how upgrade-ready and clean the uploaded code is compared to S/4HANA extensibility guidelines.
- **Features**: Multi-file upload, automatic ABAP parsing, database dependency mapping, Clean Core score calculation, compliance baseline report.

### Phase 2: Solution Design (Architecture Blueprint)
Design the modern target cloud-native schema. The solution design console maps custom legacy transactions into versioned API routes and transformed side-by-side Node.js applications. It also details secure JWT/XSUAA BTP tunnels and S/4HANA BYOT destination routing.
- **What is S/4HANA BYOT Routing?** Bring Your Own Tenant allows configuring secure RFC and OData tunnels back to your specific S/4HANA instances, routing live queries safely via the SAP BTP Connectivity service.
- **How does security work?** The solution configures secure JWT/XSUAA BTP tunnels, supporting OAuth 2.0 and SAML/JWT assertion flows to safely propagate identities without exposing credentials.
- **What is the Destination Manager?** It manages secure connections and principal propagation back to your SAP S/4HANA core, routing OData and RFC queries safely.
- **Features**: Side-by-side target architecture blueprint, CDS schema generation, API route mapping, Dockerfile generation, JWT/XSUAA security configuration, BTP destination bindings.

### Phase 3: Code Transformation (ABAP → Modern Code)
Review the side-by-side conversion in detail. The scroll-sync code comparison viewer maps legacy ABAP statements directly to their modern TypeScript equivalents. Architects can audit the refactored code patterns and ensure secure database queries and BTP SDK conventions are followed.
- **Scroll-Sync Code Viewer**: Scrolling either the legacy ABAP code or the modern TypeScript code scrolls the other side in perfect synchronization.
- **Code Translation Engine**: Parses ABAP structures and database SELECTs, translating them into secure, cloud-native Node.js queries using the SAP CAP SDK.
- **Audit Capabilities**: The editor highlights potential security, performance, and best-practice remarks.
- **Features**: Dual-pane scroll-sync viewer, ABAP-to-TypeScript/ABAP Cloud transformation, code quality annotations, refactoring suggestions.

### Phase 4: Testing & Sandbox (Verify Compliance)
The platform automatically mounts the new code inside an Isolated Testing Sandbox. The system runs selective, granular unit tests and safe sandbox simulations against live connected S/4HANA tenants using BYOT access keys.
- **S/4HANA Live Sandbox**: A containerized environment simulating BTP runtimes, enabling safe read-only sandbox simulations against live connected S/4HANA tenants.
- **TAP Format**: Test Anything Protocol — a standardized text output format for logging unit test assertions, passes, and fails.
- **Test Coverage**: Generated test cases assert data models, validation rules, security checks, and service endpoint response values.
- **Mock vs Live Environment**: Users can switch between mock testing (no tenant required) and live testing (requires S/4HANA tenant connection).
- **Features**: Automated test case generation, mock sandbox execution, live S/4HANA tenant testing, TAP-formatted execution logs, real-time test results.

### Phase 5: Process Blueprint & Documentation
Automatically document both the technical and business logic with a dual-track layout.
- **Technical Blueprint**: Generates standard BPMN 2.0 exports ready for SAP Signavio and SAP Build.
- **Business SOP & Compliance**: Builds audit-ready RACI matrices, step-by-step operating procedures, and risk control checkpoints.
- **Confluence Export**: Compiles all technical specifications, RACI tables, and audit control objectives into an ISO 9001-compliant Confluence HTML document for direct import.
- **Features**: BPMN 2.0 XML export, RACI matrix generation, SOP generation, risk control tables, Confluence-compatible export.

### Phase 6: Project Delivery & Go-Live
Download the completed deployable asset. The ZIP bundle includes package.json configs, tests, markdown documentation, sprint backlog, and deployment checklists.
- **Handover ZIP contents**: A standard SAP BTP CAP project with schema definitions, OData service controllers, auto-generated unit tests, deployment configs, and README documentation.
- **Deployment**: Unzip the project, run 'npm install', run local tests, then use 'mbt build' and 'cf deploy' to push to your SAP BTP subaccount.
- **Sprint Planning**: AI-generated sprint backlog with task estimation and team assignments.
- **Go-Live Checklist**: Comprehensive readiness assessment covering security, performance, compliance, and rollback plans.
- **Features**: ZIP handover package download, sprint backlog generation, go-live readiness checklist, deployment guides.
`;

// ─────────────────────────────────────────────────────────────────────────────
// CORE ARCHITECTURE CONCEPTS
// ─────────────────────────────────────────────────────────────────────────────

export const CORE_CONCEPTS = `
## CORE ARCHITECTURE CONCEPTS

### 1. Native CAP & CDS Schemas
- **Official SAP Standard**: Built on SAP Cloud Application Programming Model (CAP), the official design pattern for cloud extensions.
- **CDS Declarative Schema**: Core Data Services (.cds) files define data structures and API service models with strict typing.
- **HANA & SQL Compatibility**: Supports automated persistence migrations for SAP HANA Cloud, SQLite, or PostgreSQL.

### 2. BTP Destination Bindings
- **Extensible Integration**: Connects extensions to SAP S/4HANA core systems securely without hardcoding server hostnames.
- **Principal Propagation**: Seamlessly forwards the logged-in cloud user's identity down to the on-premise ABAP gateway.
- **Dynamic API Routing**: Swap endpoints (sandbox, QA, production) effortlessly through BTP Cockpit destinations.

### 3. Stateless JWT & XSUAA Security
- **OAuth 2.0 Trust Setup**: Secured using SAP BTP's Extended Services for User Account and Authentication (XSUAA).
- **Stateless API Tokens**: Intercepts and validates JWT (JSON Web Tokens) at the microservice gateway layer.
- **Granular RBAC Enforcements**: Authorizes individual endpoints using scopes mapped to enterprise user roles.
`;

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM NAVIGATION & FEATURES GUIDE
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_NAVIGATION = `
## PLATFORM NAVIGATION & FEATURES

### Dashboard (/dashboard)
The central workspace showing all projects. Users can create new projects, view existing ones, and access global settings.
- **Project Cards**: Each project shows its name, description, creation date, and progress across stages.
- **Quick Actions**: Create new project, access Knowledge Hub, How-To guides, and Settings.
- **Navigation**: The sidebar provides access to all platform areas.

### Analysis Stage (/project/[id]/analyze)
Upload and analyze legacy SAP ABAP customizations. The static analysis engine provides deep insights into code quality and Clean Core compliance.
- **File Upload**: Drag-and-drop or browse to upload ABAP source files (.clas, .prog, .fugr, etc.)
- **Parsing Engine**: Automatically detects ABAP patterns (SELECT statements, MODIFY, CALL FUNCTION, custom Z-tables)
- **Clean Core Score**: A numerical compliance rating based on usage of released vs. unreleased SAP interfaces
- **Dependency Map**: Visual map of database table dependencies, function module calls, and custom object references
- **Risk Assessment**: Highlights high-risk patterns like direct table modifications, unreleased API usage, and hardcoded values

### Solution Design Stage (/project/[id]/design)
Architect the target state for your modernized application. AI generates the complete side-by-side blueprint.
- **Architecture Blueprint**: Auto-generated target architecture showing the CAP project structure
- **CDS Schema Generation**: Core Data Services schema files generated from analyzed ABAP structures
- **API Route Mapping**: Maps legacy ABAP transactions to modern OData/REST API endpoints
- **Dockerfile Generation**: Container configuration for BTP Cloud Foundry or Kyma deployment
- **Security Configuration**: JWT/XSUAA trust setup and BTP destination binding definitions

### Transformation Stage (/project/[id]/transformation)
Side-by-side code conversion from legacy ABAP to modern cloud-native code.
- **Dual-Pane Viewer**: Scroll-synchronized comparison of legacy ABAP (left) and modern TypeScript/ABAP Cloud (right)
- **AI Transformation**: Gemini-powered code transformation engine
- **Code Quality Annotations**: Inline remarks for security, performance, and best practices
- **Target Selection**: Choose between ABAP Cloud RAP (in-app) or CAP Node.js (side-by-side) transformation targets

### Testing Stage (/project/[id]/testing)
Execute automated tests and validate your modernized code.
- **Test Case Generation**: AI generates comprehensive test cases covering data models, validation rules, and API endpoints
- **Mock Environment**: Run tests without an S/4HANA tenant using containerized Express sandbox
- **Live Environment**: Connect to a real S/4HANA tenant for live OData testing (requires BYOT setup)
- **S/4HANA Live Tenant Bridge**: Configure connection to your S/4HANA system with Basic Auth, OAuth 2.0, SAP API Hub Key, or BTP Destination JSON
- **Test Results Dashboard**: TAP-formatted logs with pass/fail status, execution time, and AI-powered explanations

### Documentation Stage (/project/[id]/documentation)
Auto-generate comprehensive migration documentation.
- **Technical Documentation**: API specifications, data models, integration patterns
- **Business Process Documentation**: BPMN 2.0 process diagrams for SAP Signavio
- **RACI Matrix**: Dynamic responsibility assignment matrix
- **Standard Operating Procedures (SOPs)**: Step-by-step procedures with exception handling
- **Risk & Control Framework**: Audit-ready control objectives and risk assessments
- **Export Options**: Confluence HTML, PDF, BPMN 2.0 XML

### Delivery Stage (/project/[id]/delivery)
Prepare for go-live with sprint planning, deployment checklists, and handover packages.
- **Sprint Backlog**: AI-generated sprint tasks with story point estimation
- **Go-Live Checklist**: Comprehensive readiness assessment (security, performance, data migration, rollback)
- **Handover Package**: Downloadable ZIP with complete BTP project, tests, docs, and deployment configs
- **Deployment Guide**: Step-by-step instructions for BTP Cloud Foundry or Kyma deployment

### TCO Analysis (/project/[id]/tco)
Total Cost of Ownership estimation for your modernization project.
- **Cost Breakdown**: Cloud hosting costs, development effort, migration costs, training, maintenance
- **AI-Powered Estimation**: Gemini analyzes your project complexity to estimate costs
- **Comparison View**: Side-by-side comparison of current vs. modernized operational costs
- **ROI Calculator**: Return on investment projection over 1-5 year timeframes

### Settings (/settings)
Global platform configuration.
- **Profile**: User profile management (name, email, company)
- **Gemini API Key (BYOK)**: Bring Your Own Key — enter your personal Google Gemini API key (encrypted server-side with AES-256-GCM, used only via the backend proxy) for unlimited transformations. Without a key you get 5 free transformations on the shared platform key.
- **S/4HANA Live Tenant Integration**: Configure your S/4HANA sandbox connection for live testing (same as the Testing page configuration, but global). Read-only, non-production only, admin-gated.
- **Access & Usage**: Clean-Core.io is 100% free. Every user has the Free Community Edition with full feature access and 5 transformations; add your own Gemini key for unlimited runs. There are no paid, premium, or purchasable tiers.

### Knowledge Hub (/knowledge)
Reference library for SAP Clean Core architecture and BTP extensibility patterns.
- **FAQ Section**: Detailed answers to common architecture questions
- **Glossary**: Key SAP, BTP, and Cloud Extensibility terms with Clean Core implications
- **RAP vs CAP Comparison Table**: Decision framework for choosing the right extensibility paradigm
- **Clean Core Alignment**: How findings map to SAP's Clean Core extensibility guidance. Clean-Core.io is not affiliated with or certified by SAP — it complements SAP's own tools (ADT, ATC, Readiness Check).

### How-To Tutorials (/how-to)
Interactive walkthrough guiding users through the platform's stages (Analyze → Design → Transformation → Documentation → Testing → TCO → Delivery).
- **Slideshow Presentation**: Full-screen capable, keyboard-navigable slide deck
- **Interactive Hotspots**: Clickable question marks on screenshots revealing detailed Q&A popups
- **Speech Scripts**: Pre-written narration scripts for each phase (useful for demos/presentations)
- **Core Architecture Concepts**: Deep dives into CAP/CDS, BTP Destinations, and JWT/XSUAA Security
`;

// ─────────────────────────────────────────────────────────────────────────────
// S/4HANA LIVE TENANT BRIDGE SETUP
// ─────────────────────────────────────────────────────────────────────────────

export const S4HANA_BRIDGE_GUIDE = `
## S/4HANA LIVE TENANT BRIDGE — COMPLETE SETUP GUIDE

Clean-Core.io supports connecting non-productive S/4HANA Cloud or On-Premise tenants directly for live OData connection tests and schema validation.

### Prerequisites
- Admin-approved S/4HANA sandbox access. The live-connection feature is admin-gated — request it from the Testing page; an administrator reviews and grants it. It is free (there is no paid tier).
- Access to a non-productive S/4HANA system (Development, Quality, or Sandbox)
- A technical communication user with appropriate OData service authorizations

### Setup Steps
1. Navigate to the Testing page of your project and switch to the "Live Tenant" environment tab.
2. Provide the HTTPS endpoint of your S/4HANA system (e.g. https://my-s4.example.com:443/sap/opu/odata/sap/API_BUSINESS_PARTNER).

### Authentication Methods

#### a) Basic Authentication
Enter a technical communication user and password configured in your S/4HANA system.
- **Username**: A technical communication user (e.g. CC_INTEGRATOR, CLEANCORE_API). Create this in SAP transaction SU01.
- **Password**: The password for the technical user. Find/reset it via SU01 > User > Change Password.
- **Where to find**: SAP GUI > Transaction SU01 > Enter username > Change tab > Set password.

#### b) OAuth 2.0 Client Credentials
For systems configured with OAuth 2.0 authentication.
- **Token URL**: Your OAuth token endpoint (e.g. https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token). Find it in SAP BTP Cockpit > Security > Trust Configuration.
- **Client ID**: The OAuth client ID (e.g. sb-clone-...). Find it in BTP Cockpit > Service Instances > View Credentials.
- **Client Secret**: The OAuth client secret. Find it in BTP Cockpit > Service Instances > View Credentials.
- Clean-Core.io exchanges these for a Bearer token before calling the S/4 endpoint.

#### c) SAP API Hub Sandbox Key
For testing against SAP's public sandbox APIs at api.sap.com.
- **API Key**: Your api.sap.com API key. Get it at api.sap.com > Log In > Show API Key.
- Best for: Quick prototyping, exploring standard API schemas without a real S/4HANA system.

#### d) SAP BTP Destination Service (JSON)
Paste the full JSON export from your SAP BTP Destination configuration.
- Clean-Core.io auto-detects the auth type (BasicAuthentication, OAuth2ClientCredentials, PrincipalPropagation, NoAuthentication) and resolves credentials accordingly.
- **Where to find**: BTP Cockpit > Connectivity > Destinations > Select destination > Export as JSON.

### Connection Testing
- Click "Test Connection" to perform a live HTTP handshake that verifies:
  - Endpoint reachability (DNS resolution)
  - TLS certificate validity
  - Authentication status (credential verification)
- Click "Save Connection" to persist the configuration.

### Security
- All credentials are stored server-side in encrypted Firestore documents.
- Passwords and secrets are never exposed in client-side code or logs.
- TLS is enforced for all outbound connections.
- Production endpoints (.sap.com, .hana.ondemand.com) are blocked — only non-productive systems are supported.
`;

// ─────────────────────────────────────────────────────────────────────────────
// FREE COMMUNITY MODEL — ACCESS, PRICING & POSITIONING
// ─────────────────────────────────────────────────────────────────────────────

export const FREE_COMMUNITY_MODEL = `
## FREE COMMUNITY MODEL — ACCESS, PRICING & POSITIONING

Clean-Core.io is a **free, community-built** SAP Clean Core modernization assistant. There are no paid, premium, or purchasable tiers — do not describe or imply any.

### Who it is for
Individual SAP architects, developers, and modernization decision-makers. It is a community tool, not a multi-user enterprise procurement product (SSO/SAML, org/role management, DPA/TOMs and a commissioned external pentest are deliberately on the backlog).

### What every user gets (Free Community Edition)
- The FULL 7-stage workflow and every feature — nothing is locked behind a paywall: analysis, solution design, code transformation, documentation (BPMN/Confluence), testing, TCO, delivery (ZIP bundle), and the server-signed audit evidence pack.
- 5 free transformations on the shared platform Gemini key.

### BYOK (Bring Your Own Key) — unlimited, still free
- Add your own Google Gemini API key in Settings for UNLIMITED transformations. Your key is encrypted at rest (AES-256-GCM) in a server-only store and used exclusively via the secure backend proxy — it is never returned to the client. Usage is billed by Google to your key; Clean-Core.io charges no platform fee.

### Live S/4HANA sandbox (developer, admin-gated)
- Connecting a real, NON-PRODUCTION S/4HANA sandbox for live OData tests is opt-in, read-only, encrypted, and admin-gated (manually approved). It is free — approval is granted by an administrator, not purchased.

### Positioning (state honestly)
- COMPLEMENTARY to SAP's own tools (ADT, ATC, Readiness Check, Signavio) — it does not replace them.
- NOT affiliated with, endorsed by, or certified by SAP SE. Never claim "SAP-approved", "SAP-certified", or "enterprise-grade platform" without qualification.
- Best described as a decision-support / evidence assistant, not automated certification.
`;

// ─────────────────────────────────────────────────────────────────────────────
// TRUST CHAIN & AUDIT EVIDENCE (the platform's core differentiator)
// ─────────────────────────────────────────────────────────────────────────────

export const TRUST_CHAIN_AND_EVIDENCE = `
## TRUST CHAIN & AUDIT EVIDENCE

The platform is **deterministic-first, AI-second**: a static ABAP evidence engine produces the auditable facts, and Gemini only narrates/transforms on top of them. This is what makes the output trustworthy and reviewable.

### Deterministic evidence engine
- Runs before any AI call. It builds a code inventory (classes, reports, function modules), detects findings (SQL quirks, direct table access, unreleased APIs, RTTI gaps), scores complexity and business-criticality, resolves OO inheritance (MRO) to prevent structure hallucination, and routes RAP (in-app) vs CAP (side-by-side).
- The server RECOMPUTES this evidence; it does not trust client-supplied scores.

### Immutable, signed Runs
- Each successful analysis is frozen as an immutable **Run** at projects/{id}/runs/{runId}. A canonical (key-sorted) JSON of the run is hashed (SHA-256 → runHash) and signed (HMAC-SHA256 with a server-only key). Runs are read-only to clients — only the server writes them.
- The AI narrative is NOT part of the signed payload; it is referenced separately (responseHash) and stored unsigned, so deterministic evidence and free-text narrative stay cleanly separated.

### Server-authoritative audit evidence pack
- The audit pack (executive summary, decision record, findings CSV, model card, known-limitations) is generated, hashed, and HMAC-signed entirely SERVER-SIDE from the active run. The client never supplies file content or hashes for signing, so a valid signature attests to server-generated content.
- Verification is reported in three honest tiers: authentic (valid signature) → integrity-only (unsigned but hash-consistent) → failed.

### Architect sign-off = self-attestation
- The target-architecture sign-off is a SELF-ATTESTATION recorded from the signed-in user's own session — a decision record, not a formally governed organizational approval. The audit pack labels it as self-attested.
`;

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY & PRIVACY
// ─────────────────────────────────────────────────────────────────────────────

export const SECURITY_AND_PRIVACY = `
## SECURITY & PRIVACY

- **AI keys never client-side**: all Gemini calls proxy through the server. BYOK keys are AES-256-GCM encrypted in a server-only store and never returned to the client.
- **Auth**: mutating API routes require a verified Firebase ID token; admin routes add an email-allowlist check. Sensitive MFA/credential collections are server-only (clients cannot read them).
- **S/4HANA SSRF defense**: HTTPS-only, DNS/IP re-checks, host allowlist, private/metadata-IP blocking, redirect validation, IP pinning. Production endpoints are blocked — sandbox only.
- **Sandboxed test runner**: generated tests run in an isolated Node process (esbuild bundle + Node Permission Model — filesystem scoped to a temp dir, no child-process/worker/native access, no platform secrets). Live S/4 egress stays off unless explicitly enforced at the infra level.
- **GDPR Art. 17 erasure**: account deletion recursively purges projects (incl. immutable runs), encrypted BYOK keys, and MFA data; completeness is covered by an automated test. Data is stored in Firestore in the EU (europe-west1).
- **Transparency**: a public /trust page and /changelog document the security posture and release history.
`;

// ─────────────────────────────────────────────────────────────────────────────
// HONEST LIMITATIONS & DISCLAIMERS
// ─────────────────────────────────────────────────────────────────────────────

export const HONEST_LIMITATIONS = `
## HONEST LIMITATIONS & DISCLAIMERS (always be candid about these)

- **AI output is a draft**: transformed code, narratives, TCO and effort estimates are drafts for review by qualified architects — never production-ready deliverables and never formal SAP, legal, or security advice.
- **Static analysis has limits**: dynamic ABAP (e.g. CALL FUNCTION with variable names), Dynpro/screen flows, and batch-input scenarios cannot be fully resolved automatically and need manual redesign. Unreleased APIs must be confirmed with SAP before production use.
- **Not a certification**: Clean-Core.io does not issue SAP certification and is not an SAP acceptance test or a formal security/data-protection audit.
- **Estimates, not measurements**: test coverage and TCO figures are estimates; ABAP-Unit / Node.js tests must be executed in a real sandbox to be authoritative.
- **Sandbox only**: live S/4HANA connections are restricted to non-production systems and are admin-gated.
- If you are unsure or the knowledge base does not cover something, say so plainly rather than inventing an answer.
`;

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED KNOWLEDGE BASE EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the complete, combined knowledge base string for injection
 * into the chatbot's system prompt.
 */
export function buildKnowledgeBase(): string {
  return [
    FREE_COMMUNITY_MODEL,
    TRUST_CHAIN_AND_EVIDENCE,
    KNOWLEDGE_HUB_FAQS,
    EXTENDED_GLOSSARY,
    RAP_VS_CAP_COMPARISON,
    HOWTO_WALKTHROUGH,
    CORE_CONCEPTS,
    PLATFORM_NAVIGATION,
    S4HANA_BRIDGE_GUIDE,
    SECURITY_AND_PRIVACY,
    HONEST_LIMITATIONS,
  ].join('\n');
}

/**
 * Centralized Knowledge Base for the Clean-Core.io AI Chatbot
 * 
 * This module consolidates ALL platform content into structured knowledge
 * that is injected into the chatbot's system prompt. This ensures the AI
 * can answer questions about any part of the platform accurately.
 * 
 * Sources:
 * - Knowledge Hub (/knowledge) — FAQs, glossary, RAP vs CAP comparison
 * - How-To (/how-to) — the seven-phase walkthrough, read from `lib/how-to-content.ts`
 * - Platform pages — Analyze, Design, Transformation, Documentation, Testing, Economics, Delivery
 * - Settings — BYOK, S/4HANA tenant configuration
 *
 * Roadmap 0.2, UX-102 (the follow-up in the knowledge base). This file described
 * a /how-to that stopped existing on 17.09.2026 — "Interactive Hotspots",
 * "Speech Scripts" and three "Core Architecture Concepts" cards (CAP/CDS, BTP
 * destinations, JWT/XSUAA), all removed with the phase rebuild — and carried its
 * own copy of the walkthrough with six phases in the wrong order, no Economics,
 * and the claims that copy was removed for. A chatbot that is told about features
 * the product does not have will offer them to the reader in its own words.
 *
 * So the walkthrough below is not written here any more: it is `howToSteps()`,
 * the same module `/how-to` renders. A phase added, reordered or reworded there
 * reaches the model in the same release, and the two cannot disagree.
 */

import { howToSteps } from './how-to-content';
import { LIVE_TEST_EXECUTION } from './locked-paths';

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
A: BYOT lets a developer connect their own NON-PRODUCTION S/4HANA sandbox to check the connection, read OData metadata and make one read-only call against a real service. ${LIVE_TEST_EXECUTION.userNotice} It is read-only, credentials are encrypted at rest (AES-256-GCM) in a server-only store, production endpoints are blocked, and every connection is admin-gated (manually reviewed and approved) before activation. Clean-Core.io does not host or persist your ERP data — SAP transaction data is processed statelessly in memory. The feature is free; access is granted by an administrator, not by paying for a tier.

### Q: How does Clean-Core.io help modernize legacy ABAP?
A: A deterministic ABAP evidence engine parses the custom code FIRST (classes, reports, function modules, custom Z-tables, SQL) and produces auditable facts — a code inventory, findings, complexity/criticality scores, and a RAP-vs-CAP routing recommendation. Google Gemini then narrates and drafts modern TypeScript/Node.js (CAP) or ABAP Cloud (RAP) on top of that evidence, and can generate draft test suites and BPMN 2.0 XML blueprints. All AI output is a DRAFT for architect review — it accelerates the assessment; it does not replace human judgment or SAP's own upgrade tooling.
`;

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED GLOSSARY (beyond lib/glossary.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const EXTENDED_GLOSSARY = `
## EXTENDED GLOSSARY

- **SAP BAIP (SAP Business AI Platform)**: The umbrella SAP announced at Sapphire 2026, consolidating SAP BTP, SAP Business Data Cloud and SAP Business AI into one governed environment. It is not a retirement of SAP BTP: the BTP services keep their names, and SAP was still shipping releases under the name "SAP BTP ABAP environment" in August 2026. Use SAP BTP for the concrete services and SAP BAIP for the portfolio around them.
- **SAP Cloud Connector**: A secure software link that runs inside the customer's on-premise or private cloud network, establishing an encrypted TLS connection to SAP BTP without requiring complex inbound firewall configurations.
- **CDS (Core Data Services)**: The data modeling infrastructure used by SAP. CDS views define database tables, relationships, and service projections declaratively inside both the ABAP environment (RAP) and the Node.js/Java environment (CAP).
- **XSUAA (Extended Services for User Account and Authentication)**: SAP BTP's identity and access management service. It issues and validates OAuth 2.0 tokens (JWTs) for securing microservice-to-microservice communication and enforcing user-level authorization scopes.
- **SAP Signavio**: SAP's business process management and mining suite. Clean-Core.io exports BPMN 2.0 XML diagrams for process documentation; import into SAP Signavio has not been verified yet.
- **BPMN 2.0**: Business Process Model and Notation — an industry-standard graphical notation for specifying business processes. Clean-Core.io generates BPMN 2.0 XML for automated process documentation.
- **RACI Matrix**: Responsible, Accountable, Consulted, Informed — a framework for assigning roles in a process. Clean-Core.io auto-generates dynamic RACI matrices during documentation.
- **TCO (Total Cost of Ownership)**: The complete cost analysis of an SAP modernization project, including cloud hosting, development effort, maintenance, and migration costs. Clean-Core.io offers a TCO demonstration model priced only with the figures you enter — no model estimates a cost.
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

const HOW_TO_STEPS = howToSteps();

export const HOWTO_WALKTHROUGH = `
## HOW-TO WALKTHROUGH — THE PHASES OF A PROJECT (/how-to)

### Introduction
Custom core modifications are one of the biggest barriers to S/4HANA upgrades. Clean-Core.io is a free, community-built assistant that helps SAP architects and developers assess custom ABAP and draft an in-app extension on the RAP track or a side-by-side service on the CAP track, keeping the SAP core clean. It is complementary to SAP's own tools (ADT, ATC, Readiness Check, Signavio), not a replacement, and is not affiliated with or certified by SAP. Every analysis is captured as an immutable, signed evidence Run.

The phases below are the phases the product has, in the order it shows them, in the words /how-to uses. There is no other walkthrough: never describe a phase this list does not name, and never reorder them.
${HOW_TO_STEPS
  .map((step) =>
    [
      `### Phase ${step.n} of ${HOW_TO_STEPS.length}: ${step.title} (/project/{id}/${step.key})`,
      step.summary,
      ...step.details.map((detail) => `- ${detail}`),
      ...step.questions.map((q) => `- **${q.question}** ${q.answer}`),
    ].join('\n'),
  )
  .join('\n\n')}
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
- **Clean Core Score**: A 0-100 grade of how far custom code is decoupled from the standard core, computed deterministically from released vs. unreleased SAP interfaces. **Higher is better.** It is not SAP's "Technical Debt Score" in the RISE with SAP methodology dashboard (SAP Cloud ALM), where a higher value means *more* technical debt — the two point in opposite directions, and SAP has no metric of this name.
- **Dependency Map**: Visual map of database table dependencies, function module calls, and custom object references
- **Risk Assessment**: Highlights high-risk patterns like direct table modifications, unreleased API usage, and hardcoded values

### Solution Design Stage (/project/[id]/design)
A model drafts the target architecture for the route on the project, and the user records which target they accept. The draft follows the track: on the RAP track a RAP design inside SAP S/4HANA, on the CAP track a SAP CAP design on SAP BTP. Never describe the CAP draft as if it were the product's only output.
- **Architecture Blueprint**: project structure, service endpoints, data consistency, security requirements and a phased roadmap
- **CAP track only**: the drafted layout names CDS schema files, service handlers and a Dockerfile, and the security requirements are written in BTP terms (XSUAA/JWT). These are words in a model-written draft — the product does not create a BTP destination, a trust configuration or an XSUAA binding for anyone, and it never connects to BTP.
- **Accepting a target** records the target, the account and the time on the server: a self-declaration, not an organisational approval
- **Stale drafts**: a design or an acceptance given for a previous source is marked stale, and code is not generated from it

### Transformation Stage (/project/[id]/transformation)
Side-by-side code conversion from legacy ABAP to modern cloud-native code.
- **Dual-Pane Viewer**: Scroll-synchronized comparison of legacy ABAP (left) and modern TypeScript/ABAP Cloud (right)
- **AI Transformation**: Gemini-powered code transformation engine
- **Code Quality Annotations**: Inline remarks for security, performance, and best practices
- **Target Selection**: Choose between ABAP Cloud RAP (in-app) or CAP Node.js (side-by-side) transformation targets

### Testing Stage (/project/[id]/testing)
Execute automated tests and validate your modernized code.
- **Test Case Generation**: AI generates comprehensive test cases covering data models, validation rules, and API endpoints
- **Mock Environment**: Run tests without an S/4HANA tenant, against mocks in a restricted Node process
- **Tenant Environment**: Connect a real S/4HANA sandbox to check the connection and read OData metadata (requires BYOT setup). Running tests against it is locked.
- **S/4HANA Live Tenant Bridge**: Configure connection to your S/4HANA system with Basic Auth, OAuth 2.0, SAP API Hub Key, or BTP Destination JSON
- **Test Results Dashboard**: TAP-formatted logs with pass/fail status, execution time, and model-written explanations

### Documentation Stage (/project/[id]/documentation)
Auto-generate comprehensive migration documentation.
- **Technical Documentation**: API specifications, data models, integration patterns
- **Business Process Documentation**: BPMN 2.0 process diagrams as XML (import into SAP Signavio has not been verified yet)
- **RACI Matrix**: Dynamic responsibility assignment matrix
- **Standard Operating Procedures (SOPs)**: Step-by-step procedures with exception handling
- **Risk & Control Framework**: Audit-ready control objectives and risk assessments
- **Export Options**: BPMN 2.0 XML and Confluence HTML, and nothing else — the page offers no PDF export

### Delivery Stage (/project/[id]/delivery)
What is on record for handover, and the downloads that follow from it. The page has six cards and no others — there is no sprint backlog, no go-live checklist and no deployment guide on it; never offer one.
- **Delivery Bundle**: a ZIP with the generated files, the test suite and the documentation
- **Stakeholder briefing** and **Board Presentation**: a slide summary of findings and architecture, without a savings figure
- **SOP & Compliance** and **Developer Guide**: the business layer and the technical guidelines, when they were generated
- **Integrity Report**: what exists and what it is worth — generated code is reported as not compiled or tested, never as ready to deploy
- **Audit evidence pack**: signed by the server over the signed run; blocked while anything was built for a previous source, and checkable afterwards on the Verify Pack page

### TCO Analysis (/project/[id]/tco)
A cost model for your modernization project — priced only with figures you enter.
- **Your figures first**: developer rate, key-user rate and one-time investment start empty; nothing is computed until all three are entered
- **Assumptions named**: effort coefficients, the test effect and the target score are assumptions, not observed effort
- **Comparison View**: legacy vs. modernized annual effort cost, from your figures
- **No money elsewhere**: the analysis itself puts no cost, savings or ROI figure on the code

### Settings (/settings)
Global platform configuration.
- **Profile**: User profile management (name, email, company)
- **Gemini API Key (BYOK)**: Bring Your Own Key — enter your personal Google Gemini API key (encrypted server-side with AES-256-GCM, used only via the backend proxy) for unlimited transformations. Without a key you get 5 free transformations on the shared platform key.
- **S/4HANA Live Tenant Integration**: Configure your S/4HANA sandbox connection for connection checks and metadata reads (same as the Testing page configuration, but global). Read-only, non-production only, admin-gated. Running tests against the tenant is locked.
- **Access & Usage**: Clean-Core.io is 100% free. Every user has the Free Community Edition with full feature access and 5 transformations; add your own Gemini key for unlimited runs. There are no paid, premium, or purchasable tiers.

### Knowledge Hub (/knowledge)
Reference library for SAP Clean Core architecture and BTP extensibility patterns.
- **FAQ Section**: Detailed answers to common architecture questions
- **Glossary**: Key SAP, BTP, and Cloud Extensibility terms with Clean Core implications
- **RAP vs CAP Comparison Table**: Decision framework for choosing the right extensibility paradigm
- **Clean Core Alignment**: How findings map to SAP's Clean Core extensibility guidance. Clean-Core.io is not affiliated with or certified by SAP — it complements SAP's own tools (ADT, ATC, Readiness Check).

### How-To Tutorials (/how-to)
A walkthrough of the seven phases in the product's order (${HOW_TO_STEPS.map((s) => s.title).join(' → ')}), readable without an account.
- **One slide per phase**: what the phase does, what it does not do, and the questions a reader has at that point — the text in the HOW-TO WALKTHROUGH section above, word for word
- **A phase index** beside the deck, and arrow keys while the deck has focus; it can be shown fullscreen
- **A link into the demo project** from every slide, so the reader sees the phase in the product instead of a picture of it
- **No screenshots, no narration scripts and no architecture cards**: the pictures showed a workflow the product no longer has, and the three "Core Architecture Concepts" cards (CAP/CDS, BTP destinations, JWT/XSUAA) described configuration this product never performs. All of it was removed on 17.09.2026 — do not offer any of it.
- **Getting started instead**: /first-run is the click-by-click guide from signing in to a downloadable package.
`;

// ─────────────────────────────────────────────────────────────────────────────
// S/4HANA LIVE TENANT BRIDGE SETUP
// ─────────────────────────────────────────────────────────────────────────────

export const S4HANA_BRIDGE_GUIDE = `
## S/4HANA LIVE TENANT BRIDGE — COMPLETE SETUP GUIDE

Clean-Core.io supports connecting non-productive S/4HANA Cloud or On-Premise tenants for OData connection checks and metadata reads. ${LIVE_TEST_EXECUTION.userNotice}

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
- Connecting a real, NON-PRODUCTION S/4HANA sandbox for OData connection checks is opt-in, read-only, encrypted, and admin-gated (manually approved). Running tests against it is locked. It is free — approval is granted by an administrator, not purchased.

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
- **Sandboxed test runner**: generated tests run in a restricted Node process (esbuild bundle + Node Permission Model — filesystem scoped to a temp dir, no child-process/worker/native access, no platform secrets). Test execution against a live S/4HANA tenant is locked (gate ${LIVE_TEST_EXECUTION.id}): the runner is defense in depth, not an isolation boundary, and it reopens only with its own isolated service.
- **GDPR Art. 17 erasure**: account deletion recursively purges projects (incl. immutable runs), encrypted BYOK keys, and MFA data; completeness is covered by an automated test. Data is stored in Firestore in the EU (europe-west1).
- **Transparency**: a public /trust page documents the security posture.
`;

// ─────────────────────────────────────────────────────────────────────────────
// THE CLEAN CORE SCORE AND SAP'S OWN FIGURES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roadmap 0.3, UX-088.
 *
 * The names in this field are close enough to be mistaken for one another, and
 * one of them runs backwards. A reader who meets "Clean Core Score" here and
 * "Technical Debt Score" in SAP Cloud ALM in the same week, and is told neither
 * of them apart, will read one of the two the wrong way round — and a chatbot
 * that has not been told the difference will cheerfully confirm the mistake.
 *
 * So the distinction is stated in the knowledge base, on /clean-core-score and
 * in /llms.txt, in the same words.
 */
export const SCORE_NAMING_AND_SAP_FIGURES = `
## THE CLEAN CORE SCORE AND SAP'S OWN FIGURES (never conflate these)

**Our figure.** The **Clean Core Score** is published by Clean-Core.io, runs 0–100, and **higher is better**. It measures how far the analysed custom ABAP is decoupled from the SAP standard core, computed deterministically before any AI runs. It is a measure of code structure — no cost, saving or ROI figure is derived from it anywhere in the product.

**SAP publishes no Clean Core Score.** SAP has no metric of that name. If a user says SAP gave them a Clean Core Score, they are most likely looking at one of SAP's three figures below. Ask which.

### SAP's figures, and which way each one points
- **Technical Debt Score** (SAP — RISE with SAP methodology dashboard in SAP Cloud ALM): **higher is worse**. SAP's own wording is "a higher score indicating greater technical debt". This is the one that runs opposite to ours; it is the mistake worth catching.
- **Clean Core Share** (SAP — SAP Cloud ALM): higher is better. How much of the landscape already follows the clean core approach. Different unit, different scope: it is not our score.
- **Clean Core Level A–D** (SAP — Cloudification Repository, per object): A is best, D is worst. This one we DO reproduce: Clean-Core.io derives the A–D level per object from SAP's published files. The precedence rule and its rule version are published at /method/levels.

### Rules for answering
- Never imply SAP endorses, certifies, publishes or has reviewed the Clean Core Score. Clean-Core.io is independent and community-built.
- If someone compares a high Clean Core Score with a high Technical Debt Score, say plainly that the two point in opposite directions before answering anything else.
- The full comparison is on /clean-core-score; point there.
`;

// ─────────────────────────────────────────────────────────────────────────────
// HONEST LIMITATIONS & DISCLAIMERS
// ─────────────────────────────────────────────────────────────────────────────

export const HONEST_LIMITATIONS = `
## HONEST LIMITATIONS & DISCLAIMERS (always be candid about these)

- **AI output is a draft**: transformed code, narratives and effort estimates are drafts for review by qualified architects — never production-ready deliverables and never formal SAP, legal, or security advice.
- **Static analysis has limits**: dynamic ABAP (e.g. CALL FUNCTION with variable names), Dynpro/screen flows, and batch-input scenarios cannot be fully resolved automatically and need manual redesign. Unreleased APIs must be confirmed with SAP before production use.
- **Not a certification**: Clean-Core.io does not issue SAP certification and is not an SAP acceptance test or a formal security/data-protection audit.
- **Estimates, not measurements**: test coverage is an estimate, and TCO figures are a demonstration model on your own figures; ABAP-Unit / Node.js tests must be executed in a real sandbox to be authoritative.
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
    SCORE_NAMING_AND_SAP_FIGURES,
    KNOWLEDGE_HUB_FAQS,
    EXTENDED_GLOSSARY,
    RAP_VS_CAP_COMPARISON,
    HOWTO_WALKTHROUGH,
    // CORE_CONCEPTS stood here: the three /how-to cards on CAP/CDS, BTP
    // destinations and XSUAA. They went with the page (UX-102) because they
    // described the CAP track as if it were the product and configuration the
    // product never performs. The glossary above still defines CDS and XSUAA for
    // a reader who asks what they are.
    PLATFORM_NAVIGATION,
    S4HANA_BRIDGE_GUIDE,
    SECURITY_AND_PRIVACY,
    HONEST_LIMITATIONS,
  ].join('\n');
}

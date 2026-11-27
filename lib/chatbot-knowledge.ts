/**
 * Centralized Knowledge Base for the Clean-Core.io AI Chatbot
 *
 * **Outside a project only — roadmap 6.8, owner decision of 15.09.2026.**
 * There is one assistant (`components/GlossaryChatbot.tsx`) and it has two
 * sources, never both at once: out here, everything below; inside a project,
 * nothing but that project's own anchored evidence (`lib/case-answer.ts`).
 * Handing this file to a question asked about somebody's ABAP is precisely the
 * failure that step exists to prevent — a confident SAP generality standing
 * where a line number should be. The assistant's pipeline
 * (`lib/assistant-answer.ts`) therefore never builds this inside a project, on
 * the answer path or on any failure path, and `tests/ask-pipeline.spec.ts`
 * walks every one of them.
 *
 * This module consolidates the platform content into structured knowledge
 * that is injected into the assistant's prompt outside a project. A product
 * answer is read back against it (`guardProductAnswer`): a place, figure or
 * offer it does not carry is removed before the reader sees it.
 *
 * Sources:
 * - The product's layout in 3.5 — My workspace, Analyze with its three views,
 *   the seven tools in the tool bar's order, Re-design, sharing and Settings —
 *   read from the modules that draw it (`PRODUCT_LAYOUT` below)
 * - Knowledge (/knowledge) — FAQs, glossary, RAP vs CAP comparison
 * - How-To (/how-to) — the walkthrough of the seven tools, read from `lib/how-to-content.ts`
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
import {
  BTP,
  BTP_FIRST,
  BUSINESS_AI_PLATFORM,
  BUSINESS_AI_PLATFORM_PARTS,
  CLOUD_ERP,
  CLOUD_ERP_PRIVATE,
  CLOUD_ERP_PRIVATE_FIRST,
  PUBLIC_EDITION,
  PUBLIC_EDITION_FIRST,
  SAP_BTP_COCKPIT,
} from './sap-naming';
import { SCORE_BANDS_SOURCE, scoreBandsProse, scoreDeductionsProse } from './clean-core-score';
import { PHASES, PHASE_PURPOSE } from './workflow-steps';
import { WORKSPACE_VIEWS, VIEW_LABELS, VIEW_QUESTIONS } from './workspace-model';
import { REDESIGN_LABEL, REDESIGN_SEGMENT } from './redesign';
import { DECISION_OPTION_LABELS } from './decision-options';
import { INVITATION_DEFAULT_DAYS, INVITATION_MAX_DAYS } from './invitations';
import { COMMUNITY_QUOTA_FALLBACK } from './run-quota-rule';
import { ANTHROPIC_OWN_KEY_OFFERED, ANTHROPIC_OWN_KEY_STATUS } from './model-providers';

/** The four options of the program decision, in their order: "Keep, Rebuild, Move to SAP standard or Retire". */
const DECISION_OPTIONS_LINE = (() => {
  const labels = Object.values(DECISION_OPTION_LABELS);
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
})();

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE PAGE CONTENT (/knowledge)
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWLEDGE_HUB_FAQS = `
## KNOWLEDGE PAGE (/knowledge) — FREQUENTLY ASKED QUESTIONS

### Q: What is the SAP S/4HANA Clean Core strategy?
A: The Clean Core strategy is an architectural design principle that keeps the SAP standard ERP core software free of custom modifications. Custom extensions are developed either "in-app" using key-user extensibility or "side-by-side" on ${BTP_FIRST}. This decoupling lowers upgrade risk and technical debt: extensions built on released interfaces are far less likely to break on an upgrade, though each upgrade still needs its compatibility and regression testing.

### Q: What is the difference between In-App RAP and Side-by-Side CAP extensions?
A: In-App RAP (ABAP RESTful Application Programming Model) runs directly within the S/4HANA tenant. It is ideal for extending standard SAP business objects and UI layers using native ABAP in a cloud-compliant way. Side-by-Side CAP (Cloud Application Programming Model) runs externally on ${BTP}, typically using Node.js or Java. It is designed for standalone cloud-native applications, multi-tenant SaaS products, and integration with non-SAP systems, fully decoupling execution from the ERP core.

### Q: How does Clean-Core.io secure a side-by-side integration on ${BTP}?
A: Clean-Core.io does not configure anything in your SAP BTP subaccount or S/4HANA tenant. The usual security pattern for a side-by-side extension is JSON Web Tokens (JWT) validated by the SAP XSUAA (Extended Services for User Account and Authentication) service for stateless API calls with role-based access control (RBAC), and the SAP Connectivity and Destination services routing RFC and OData traffic via SAP Cloud Connector without exposing internal endpoints. Setting that up in your tenant is your team's work; the app provides analysis, design drafts and a read-only connection check, not the deployment.

### Q: What is the BYOT (Bring Your Own Tenant) connectivity model?
A: BYOT lets a developer connect their own NON-PRODUCTION S/4HANA sandbox, in Settings under "Your SAP test system", to check the connection and read the OData metadata of one service ($metadata, schema only). ${LIVE_TEST_EXECUTION.userNotice} It is read-only, credentials are encrypted at rest (AES-256-GCM) in a server-only store, production endpoints are blocked, and every connection is admin-gated (manually reviewed and approved) before activation. Clean-Core.io does not host or persist your ERP data — SAP transaction data is processed statelessly in memory. The feature is free; access is granted by an administrator, not by paying for a tier.

### Q: How does Clean-Core.io help modernize legacy ABAP?
A: A deterministic ABAP evidence engine parses the custom code FIRST (classes, reports, function modules, custom Z-tables, SQL) and produces auditable facts — a code inventory, findings, complexity/criticality scores, and a RAP-vs-CAP routing recommendation. On the Transformation tool the engine then writes the target package's skeleton itself — types, guards, the input contract and one function stub per routine with its ABAP lines — and Google Gemini writes only the business logic inside each function: ABAP Cloud artefacts on the RAP track, a Node.js (TypeScript) project on the CAP track. The process documentation and its BPMN 2.0 XML are reconstructed from the code by the engine, with no model; a draft test suite is generated for the code. All AI output is a DRAFT for architect review — it accelerates the assessment; it does not replace human judgment or SAP's own upgrade tooling.
`;

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED GLOSSARY (beyond lib/glossary.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const EXTENDED_GLOSSARY = `
## EXTENDED GLOSSARY

- **${BTP}**: SAP's platform for side-by-side extensions, part of the ${BUSINESS_AI_PLATFORM} — the portfolio SAP presented at Sapphire 2026, which bundles ${BUSINESS_AI_PLATFORM_PARTS}. SAP BTP keeps its name inside it, and so do the services: SAP was still shipping releases under the name "SAP BTP ABAP environment" in August 2026. Call the platform "${BTP_FIRST}" at its first mention and "${BTP}" after that; never call SAP BTP "SAP Business AI Platform" on its own; use SAP's own names for the concrete services.
- **${CLOUD_ERP}**: SAP's ERP product. Its two cloud editions: **${CLOUD_ERP_PRIVATE}** — call it "${CLOUD_ERP_PRIVATE_FIRST}" at its first mention and "${CLOUD_ERP_PRIVATE}" after that, never by the retired short forms — a dedicated system that still allows classic extensions (clean core levels A–D); and **${PUBLIC_EDITION}** — "${PUBLIC_EDITION_FIRST}" at its first mention — the shared SaaS system with released APIs only (level A). On-premise SAP S/4HANA keeps its name.
- **SAP Cloud Connector**: A secure software link that runs inside the customer's on-premise or private cloud network, establishing an encrypted TLS connection to ${BTP} without requiring complex inbound firewall configurations.
- **CDS (Core Data Services)**: The data modeling infrastructure used by SAP. CDS views define database tables, relationships, and service projections declaratively inside both the ABAP environment (RAP) and the Node.js/Java environment (CAP).
- **XSUAA (Extended Services for User Account and Authentication)**: the identity and access management service on ${BTP}. It issues and validates OAuth 2.0 tokens (JWTs) for securing microservice-to-microservice communication and enforcing user-level authorization scopes.
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

| Criteria | In-App RAP (ABAP RESTful) | Side-by-Side CAP (${BTP}) |
|---|---|---|
| Runtime Environment | Directly inside SAP S/4HANA (ABAP stack) | ${BTP} (Node.js, Java, Cloud Foundry/Kyma) |
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
## HOW-TO WALKTHROUGH — THE SEVEN TOOLS OF A PROJECT (/how-to)

### Introduction
Custom core modifications are one of the biggest barriers to S/4HANA upgrades. Clean-Core.io is a free, community-built assistant that helps SAP architects and developers assess custom ABAP and draft an in-app extension on the RAP track or a side-by-side service on the CAP track, keeping the SAP core clean. It is complementary to SAP's own tools (ADT, ATC, Readiness Check, Signavio), not a replacement, and is not affiliated with or certified by SAP. Every analysis is captured as an immutable, signed evidence Run.

The tools below are the tools the product has, in the order of the tool bar, in the words /how-to uses. There is no other walkthrough: never describe a tool this list does not name, and never reorder them.
${HOW_TO_STEPS
  .map((step) =>
    [
      `### Tool ${step.n} of ${HOW_TO_STEPS.length}: ${step.title} (/project/{id}/${step.key})`,
      step.summary,
      ...step.details.map((detail) => `- ${detail}`),
      ...step.questions.map((q) => `- **${q.question}** ${q.answer}`),
    ].join('\n'),
  )
  .join('\n\n')}
`;

// ─────────────────────────────────────────────────────────────────────────────
// HOW THE PRODUCT IS LAID OUT (3.5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shape of the product, read from the modules that draw it: the tool order
 * and each tool's sentence from `lib/workflow-steps.ts` (`PHASES`,
 * `PHASE_PURPOSE` — the tool bar uses the same words), the three views from
 * `lib/workspace-model.ts`, Re-design and its four options from `lib/redesign.ts`
 * and `lib/decision-options.ts`, the invitation terms from `lib/invitations.ts`,
 * the free runs from `lib/run-quota-rule.ts` and the Claude key's state from
 * `lib/model-providers.ts`. A tool renamed or moved there reaches the assistant
 * in the same release.
 */
export const PRODUCT_LAYOUT = `
## HOW THE PRODUCT IS LAID OUT

### My workspace (/dashboard)
The list of the account's projects: create a project, open one, invite a reader to one. There is no sidebar: the shell bar at the top carries help (this assistant among it) and the account menu with Settings.

### Every project opens in Analyze (/project/{id}/analyze)
Analyze is one tool with three views of the same program, switched at the top of the page. A view is a perspective, never a permission, and it is never stored:
${WORKSPACE_VIEWS.map((v) => `- **${VIEW_LABELS[v]}** (${v === 'business' ? 'the default view' : `?view=${v}`}): ${VIEW_QUESTIONS[v]}`).join('\n')}
The Business view leads: the process reconstructed from the ABAP code as a BPMN map, every element with the source lines it stands on, editable, and exchanged with SAP Signavio as BPMN 2.0 XML files (there is no Signavio API connection). The IT view puts the code first. The Management view carries the risk and shows the program decision. The old workspace address /project/{id} opens Analyze.

### The seven tools, in the tool bar's order
${PHASES.map((p) => `${p.n}. **${p.label}** (/project/{id}/${p.key}): ${PHASE_PURPOSE[p.key]}`).join('\n')}
The order is orientation, not a waterfall: any tool can be opened at any time from the tool bar. Never name a tool this list does not have, and never reorder them.

### ${REDESIGN_LABEL} (/project/{id}/${REDESIGN_SEGMENT})
The way on from Analyze into the six other tools: every "go on" link of Analyze leads here. It lists the steps in the tool order, each state read from the project, with one primary action — the next step. Its step 2, after Economics has priced the options and before Design, is the program decision: ${DECISION_OPTIONS_LINE}. The decision is recorded by the signed-in account as a self-declaration, not an organisational approval; Analyze's Management view shows it read-only.

### Sharing — read access by invitation
The project's owner invites a reader with "Invite to view" (in the header of every tool, and in My workspace). An invitation is a link bound to one confirmed e-mail address; the reader signs in with an account of that address. It gives read access only — source code included — and nothing else: no editing rights, no roles, no guest access. It expires (${INVITATION_DEFAULT_DAYS} days unless the owner chooses otherwise, at most ${INVITATION_MAX_DAYS}) and the owner can revoke it at any time.

### Settings (/settings)
- **AI model**: which key pays for the AI steps, and which steps may call a model. The findings, the extensibility route and the Clean Core Score never use a model.
- **Your own model key (BYOK)**: a Google Gemini API key of your own. With it the limit of ${COMMUNITY_QUOTA_FALLBACK} free analysis runs no longer applies, and every model call of the account runs on your key and your contract with Google. The key is stored encrypted on the server, used only there, and never returned to the browser. ${ANTHROPIC_OWN_KEY_OFFERED ? 'An own Anthropic Claude key can be stored there as well.' : `An own Anthropic Claude key: ${ANTHROPIC_OWN_KEY_STATUS}`}
- **All automatic AI steps**: one switch. With it off, the product calls no model for the account by itself, and this assistant answers only what needs no model (glossary terms, and inside a project the answers read straight from the code).
- **Your SAP test system**: the tenant connection — a non-productive S/4HANA Cloud or on-premise system, for a connection check and the OData metadata of one service. Read-only, non-production only, granted by an administrator on request. The Testing tool points here; it has no tenant tab of its own.
- **Mail and assistant**: community mail consent, and whether the floating assistant button shows on a desktop.

### Portfolio (/portfolio)
Many programs analysed in one read-only batch and read together (score bands, levels, buckets, what recurs). Open only to an account whose own model key is stored and tested. Every program stays its own project with its own signed run; nothing aggregated is signed.

### Knowledge (/knowledge) and the How-to guide (/how-to)
The knowledge pages: FAQ, glossary and the RAP vs CAP comparison. The How-to guide walks the seven tools in the order above, readable without an account, with a link into the demo from every slide. /first-run is the click-by-click guide from signing in to a downloadable package.

### This assistant
Outside a project it answers from this knowledge base. Inside a project ("Ask this case") it answers only from that project's evidence, every sentence with the source line it rests on, or says that the evidence does not answer. An explicit "What is …?" about a glossary term is answered from the glossary entry, without a model.
`;

// ─────────────────────────────────────────────────────────────────────────────
// WHAT EACH TOOL SHOWS
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_NAVIGATION = `
## WHAT EACH TOOL SHOWS

### Analyze (/project/{id}/analyze)
Custom ABAP is brought in, and the deterministic engine reads it before any model runs.
- **Clean Core Score**: a 5–100 grade of how far custom code is decoupled from the standard core, computed deterministically from released vs. unreleased SAP interfaces. **Higher is better.** It is not SAP's "Technical Debt Score" in the RISE with SAP methodology dashboard (SAP Cloud ALM), where a higher value means *more* technical debt — the two point in opposite directions, and SAP has no metric of this name.
- **Findings and the extensibility route**: what stands between the program and a clean core, each finding with its lines, and the route the engine recommends.
- **The signed run**: each analysis is frozen as an immutable, server-signed run; every other figure in the product starts from it.

### Economics (/project/{id}/tco)
A cost model for the options — priced only with figures you enter.
- **Your figures first**: developer rate, key-user rate and one-time investment start empty; nothing is computed until all three are entered
- **Assumptions named**: effort coefficients, the test effect and the target score are assumptions, not observed effort
- **Comparison View**: legacy vs. modernized annual effort cost, from your figures
- **No money elsewhere**: the analysis itself puts no cost, savings or ROI figure on the code

### Design (/project/{id}/design)
A model drafts the target architecture for the route on the project, and the user records which target they accept. The draft follows the track: on the RAP track a RAP design inside SAP S/4HANA, on the CAP track a SAP CAP design on ${BTP}. Never describe the CAP draft as if it were the product's only output.
- **Business questions first**, then the solution design, written with the model on your click
- **CAP track only**: the drafted layout names CDS schema files, service handlers and a Dockerfile, and the security requirements are written in ${BTP} terms (XSUAA/JWT). These are words in a model-written draft — the product does not create a destination, a trust configuration or an XSUAA binding for anyone, and it never connects to ${BTP}.
- **Accepting a target** records the target, the account and the time on the server: a self-declaration, not an organisational approval
- **Stale drafts**: a design or an acceptance given for a previous source is marked stale, and code is not generated from it
- **Requirements specification** (/project/{id}/design/requirements): one module of the Design tool with a workspace of its own. On request the engine drafts the functional requirements ("The system shall …", with Given/When/Then criteria, Must · Should · Could and the code lines) and the non-functional requirements (each with a target value and how it is measured) from the signed source — no model call. What the code cannot answer (service levels, retention, roles, cutover, business rules marked Clarify or Change) becomes a decision with suggested answers; suggested answers are not read from the code. The owner edits, decides and exports it (Word, Markdown, Confluence, print); invited readers read it. It is not evidence and not part of the signed audit pack

### Transformation (/project/{id}/transformation)
The target code, written for the accepted design.
- **Engine first**: the engine writes the target package's skeleton — types, guards, the input contract and one function stub per routine with its ABAP lines — and the model writes only the business logic inside each function: ABAP Cloud artefacts on the RAP track, a Node.js (TypeScript) project on the CAP track
- Generated code is a draft for review: it is reported as not compiled or tested until a check says otherwise

### Documentation (/project/{id}/documentation)
Process documentation read out of the whole analyzed source by the engine, with no model involved.
- **Process Documentation**: a process description written from the code when the tool opens - a one-page summary first (what it does, key figures, the rules and risks to know, the main path), then how the process works (how a run starts, the steps and who acts at each), decision points and rules, exceptions, what it changes, systems and data (data read, integrations, controls), open questions - with the element-by-element details and evidence as an appendix, every statement with its line numbers; owner, KPIs and duration are open questions because the code does not contain them
- **Business Process Documentation**: BPMN 2.0 process diagrams as XML (import into SAP Signavio has not been verified yet)
- **RACI Matrix** and **Standard Operating Procedures** (model-written business layer, on request)
- **Export Options**: BPMN 2.0 XML, and the process description as Confluence HTML, Markdown or Word, and nothing else — the page offers no PDF export

### Testing (/project/{id}/testing)
Test scenarios for the generated code, and the result that is on record for them.
- **Test Case Generation**: the model drafts test cases covering data models, validation rules and API endpoints
- **Here** (CAP track): the generated JavaScript/TypeScript tests run against SAP mocks in the product's own restricted test runner
- **Your SAP system** (ABAP Cloud / RAP track): nothing here runs ABAP Unit. Upload the ABAP Unit result (JUnit XML or the ADT run result), marked Imported, or confirm the result without a file, marked Confirmed as a self-declaration — never Proven
- **Your tenant, from here**: locked. The connection check lives in Settings, "Your SAP test system"; the Testing tool has no tenant tab

### Delivery (/project/{id}/delivery)
What is on record for handover, and the downloads that follow from it. The page shows the next step, the evidence chain, what a real handover still needs and the artefacts below, and nothing else — there is no sprint backlog, no go-live checklist, no deployment guide and no separate board presentation on it; never offer one.
- **Audit evidence pack**: the page's main download, signed by the server over the signed run, with no model call; blocked while anything was built for a previous source, and checkable afterwards on the Verify Pack page (/verify-pack)
- **Evidence chain**: requirement → decision → receipt → artefact, link by link — generated code is reported as not compiled or tested, never as ready to deploy, and test coverage as an estimate
- **Delivery Bundle**: a ZIP with the generated code, the test suite and the documentation, with STATUS.md and a manifest that say what is decided, tested and only proposed; a review version, not signed
- **Requirements specification**: the one drafted in the Design tool, opened from here
- **Stakeholder briefing**: seven slides from the signed run and the engine's findings — no model wrote them, and they carry no savings figure
- **Business documentation** and **Developer guide**: the operating procedures, roles and controls the model wrote in the Documentation tool, when they were generated, and the rules for the chosen route with the SAP standard tables the program uses, read from the engine's findings
- **Process as BPMN 2.0 XML** and **Test scenarios**: the process reconstructed from the code the signed run read, every element with its lines, and the generated test scenarios
`;

// ─────────────────────────────────────────────────────────────────────────────
// THE TENANT CONNECTION (SETTINGS, "YOUR SAP TEST SYSTEM")
// ─────────────────────────────────────────────────────────────────────────────

export const S4HANA_BRIDGE_GUIDE = `
## THE TENANT CONNECTION — SETTINGS, "YOUR SAP TEST SYSTEM"

Clean-Core.io can connect a non-productive S/4HANA Cloud or on-premise system for an OData connection check and a metadata read. ${LIVE_TEST_EXECUTION.userNotice} The connection lives in Settings under "Your SAP test system" (/settings#sap-test-system). No tool has a tenant tab of its own.

### Prerequisites
- Access granted by an administrator: request it in Settings, "Your SAP test system"; an administrator reviews and grants it. It is free (there is no paid tier).
- A non-productive S/4HANA system (Development, Quality, or Sandbox)
- A technical communication user with the OData service authorizations needed

### Setting it up
1. Open Settings and go to "Your SAP test system".
2. Provide the HTTPS endpoint of the OData service (e.g. https://my-s4.example.com:443/sap/opu/odata/sap/API_BUSINESS_PARTNER).
3. Choose one of the authentication methods below and enter its values.

### Authentication Methods

#### a) Basic Authentication
Enter a technical communication user and password configured in your S/4HANA system.
- **Username**: A technical communication user (e.g. CC_INTEGRATOR, CLEANCORE_API). Create this in SAP transaction SU01.
- **Password**: The password for the technical user. Find/reset it via SU01 > User > Change Password.

#### b) OAuth 2.0 Client Credentials
For systems configured with OAuth 2.0 authentication.
- **Token URL**: Your OAuth token endpoint (e.g. https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token). Find it in the ${SAP_BTP_COCKPIT} > Security > Trust Configuration.
- **Client ID** and **Client Secret**: Find them in the ${SAP_BTP_COCKPIT} > Service Instances > View Credentials.
- Clean-Core.io exchanges these for a Bearer token before calling the S/4 endpoint.

#### c) SAP API Hub Sandbox Key
For testing against SAP's public sandbox APIs at api.sap.com.
- **API Key**: Your api.sap.com API key. Get it at api.sap.com > Log In > Show API Key.

#### d) SAP Destination service (JSON)
Paste the full JSON export of your destination from the ${SAP_BTP_COCKPIT}.
- Clean-Core.io auto-detects the auth type (BasicAuthentication, OAuth2ClientCredentials, PrincipalPropagation, NoAuthentication) and resolves credentials accordingly.
- **Where to find**: ${SAP_BTP_COCKPIT} > Connectivity > Destinations > Select destination > Export as JSON.

### Connection Testing
- "Test the connection" in Settings asks only for one OData service's description ($metadata) and verifies endpoint reachability (DNS, TLS certificate), the credentials, and that the OData service exists.
- The connection check reads no business record, only the service metadata.

### Security
- All credentials are stored server-side, encrypted.
- Passwords and secrets are never exposed in client-side code or logs.
- TLS is enforced for all outbound connections.
- Production endpoints are blocked — only non-productive systems are supported.
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
- All seven tools and every feature — nothing is locked behind a paywall: Analyze, Economics, Design, Transformation, Documentation (BPMN/Confluence), Testing, Delivery (ZIP bundle), and the server-signed audit evidence pack.
- ${COMMUNITY_QUOTA_FALLBACK} free analysis runs on the shared platform Gemini key. Only the analysis is counted; the six tools after it are included.

### BYOK (Bring Your Own Key) — unlimited, still free
- Add your own Google Gemini API key in Settings (AI model, "Your own model key") for UNLIMITED analysis runs. Your key is encrypted at rest (AES-256-GCM) in a server-only store and used exclusively via the secure backend proxy — it is never returned to the client. Usage is billed by Google to your key; Clean-Core.io charges no platform fee.
- ${ANTHROPIC_OWN_KEY_OFFERED ? 'An own Anthropic Claude key can be stored in the same place.' : `An own Anthropic Claude key: ${ANTHROPIC_OWN_KEY_STATUS}`}

### S/4HANA sandbox connection (developer, admin-gated)
- Connecting a NON-PRODUCTION S/4HANA sandbox for OData connection checks (Settings, "Your SAP test system") is opt-in, read-only, encrypted, and admin-gated (manually approved). Running tests against it is locked. It is free — approval is granted by an administrator, not purchased.

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
- **Sandboxed test runner**: generated tests do not run inside the application service. They run in a separate runner service (a service account without roles, no platform secrets, no open network egress), inside a restricted Node process there (esbuild bundle + Node Permission Model — filesystem scoped to a temp dir, no child-process/worker/native access). Test execution against a live S/4HANA tenant is locked (gate ${LIVE_TEST_EXECUTION.id}): the live runner never receives tenant credentials, and the path reopens only after its review.
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

**Our figure.** The **Clean Core Score** is published by Clean-Core.io, runs 5–100, and **higher is better**. It measures how far the analyzed custom ABAP is decoupled from the SAP standard core, computed deterministically before any AI runs. It is a measure of code structure — no cost, saving or ROI figure is derived from it anywhere in the product.

**What a score means** (${SCORE_BANDS_SOURCE}; a grade, not a compliance percentage, and not an SAP measure): ${scoreBandsProse()} How it is computed: ${scoreDeductionsProse()}

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
    PRODUCT_LAYOUT,
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

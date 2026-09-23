/**
 * Central Glossary Repository for Clean-Core.io
 * Defines key SAP, BTP, and Cloud Extensibility terms with down-to-earth technical explanations.
 *
 * **Two kinds of term, and only one of them can have an outside source**
 * (`DESIGN.md` §6.1, ADR-034, roadmap 6.6). Group A is SAP's vocabulary —
 * *Released API*, *Scope item*, *ABAP Cloud* — and for those §6.1 asks for the
 * source. Group B is this product's own vocabulary — *Line anchor*,
 * *Not determined*, *The four buckets* — which nobody can look up anywhere
 * else, and for which a citation to SAP would be a fabrication rather than a
 * source.
 *
 * **A term with no source says so.** The vocabulary is `lib/first-look.ts`'s:
 * `origin: 'absent'` with an `absentReason`, the same words the product uses
 * everywhere else for a figure it does not have. The alternative — a
 * plausible-looking SAP Help URL typed from memory — is the exact failure the
 * source requirement exists to prevent, and it is worse than an empty field
 * because it reads as evidence.
 */

/** Where a term's definition comes from — `origin` and `absentReason` after `lib/first-look.ts`. */
export type GlossarySourceOrigin =
  /** SAP's own published catalog, the copy this repository syncs and can point at. */
  | 'sap-catalog'
  /** This product's own term: it is defined here, and there is nowhere else to cite. */
  | 'product'
  /** An SAP or industry term for which no publication is recorded here. Never guessed. */
  | 'absent';

export interface GlossarySource {
  origin: GlossarySourceOrigin;
  /** The citation, set for every origin except `absent`. */
  label?: string;
  url?: string;
  /** Set only when `origin` is `absent` — why there is none. */
  absentReason?: string;
}

/**
 * The one SAP source this repository can actually point at: the release-info
 * and classification files of SAP's ATC cloud-readiness repository, synced
 * into `lib/abap/generated/` by `npm run sync:catalog` and read by
 * `lib/abap/cloudification-repo.ts`. Deliberately without a date: the date of
 * the last sync lives in those files' own `meta.fetchedAt` and belongs to
 * whatever screen reads them, never hard-coded in prose (`DESIGN.md` §6.1.1:
 * "Stand des letzten Abgleichs aus dem Katalog, nie fest im Text").
 */
export const SAP_CATALOG_SOURCE: GlossarySource = {
  origin: 'sap-catalog',
  label: 'SAP, abap-atc-cr-cv-s4hc — the release-state and classification files this product syncs',
  url: 'https://github.com/SAP/abap-atc-cr-cv-s4hc',
};

const PRODUCT_SOURCE: GlossarySource = {
  origin: 'product',
  label: 'Clean-Core.io — this product defines the term; there is no outside publication to cite',
};

const noSource = (absentReason: string): GlossarySource => ({ origin: 'absent', absentReason });

/** The reason nearly every SAP term below carries: nobody recorded one yet. */
const NOT_CITED = 'no SAP publication is recorded for this entry';

export interface GlossaryItem {
  term: string;
  shortName: string;
  category: 'ERP Core' | 'BTP Extension' | 'Architecture' | 'Integration' | 'Product';
  definition: string;
  cleanCoreImplication: string;
  /**
   * `sap` — SAP's or the industry's vocabulary, where §6.1 asks for a source.
   * `product` — this product's own vocabulary (`DESIGN.md` §6.1 group B).
   */
  kind: 'sap' | 'product';
  /** Always present. `origin: 'absent'` where no publication is recorded. */
  sourceRef: GlossarySource;
  /**
   * The plain citation string, derived from `sourceRef` and **left undefined
   * for an unsourced entry** so that every surface printing it falls back to
   * its own "not recorded" wording instead of printing a sentence that looks
   * like a source. Never written by hand — see `withSources` below.
   */
  source?: string;
}

/** The two-sentence popover text `DESIGN.md` §6.1 asks for, plus where it comes from. */
export function glossarySourceText(item: GlossaryItem): string {
  if (item.sourceRef.origin === 'absent') {
    return `Source not recorded — ${item.sourceRef.absentReason ?? 'no reason given'}`;
  }
  return `Source: ${item.sourceRef.label ?? 'unnamed'}`;
}

type GlossaryEntry = Omit<GlossaryItem, 'source'>;

/** Derives `source` from `sourceRef`, so the two can never drift apart. */
function withSources(entries: Record<string, GlossaryEntry>): Record<string, GlossaryItem> {
  const out: Record<string, GlossaryItem> = {};
  for (const [key, entry] of Object.entries(entries)) {
    out[key] =
      entry.sourceRef.origin === 'absent'
        ? { ...entry }
        : { ...entry, source: entry.sourceRef.label };
  }
  return out;
}

const ENTRIES: Record<string, GlossaryEntry> = {
  RAP: {
    term: 'ABAP RESTful Application Programming Model',
    shortName: 'RAP',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'SAP\'s modern development model for building optimized, transactional, and cloud-ready enterprise services directly on the S/4HANA database engine. It defines data models using CDS views and implements business logic via ABAP classes.',
    cleanCoreImplication: 'RAP is the standard for Developer (In-App) Extensibility, ensuring custom logic is built using only released, upgrade-safe standard interfaces.'
  },
  CAP: {
    term: 'Cloud Application Programming Model',
    shortName: 'CAP',
    category: 'BTP Extension',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'An open and opinionated framework of languages, libraries, and tools for building enterprise-grade cloud services and microservices on SAP BTP. It supports both Node.js (TypeScript) and Java.',
    cleanCoreImplication: 'CAP is the ideal framework for BTP Side-by-Side Extensibility, keeping custom extensions completely separate from the S/4HANA core systems.'
  },
  'SAP LUW': {
    term: 'SAP Logical Unit of Work',
    shortName: 'SAP LUW',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'An SAP-specific transactional boundary that groups multiple database updates. All database updates in an SAP LUW are bundled and executed as a single, consistent database transaction (All-or-Nothing transactional integrity).',
    cleanCoreImplication: 'If custom logic must block or run in the same synchronous database thread as the standard transaction, it must execute within the standard SAP LUW (requiring In-App ABAP Cloud).'
  },
  'Clean Core': {
    term: 'Clean Core Guideline',
    shortName: 'Clean Core',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'SAP\'s standard architectural policy designed to separate standard ERP systems from custom software modifications. Extensions must interact only via stable, public standard APIs and extension points.',
    cleanCoreImplication: 'Adhering to a Clean Core ensures that S/4HANA upgrades, cloud migrations, and standard system patches can be applied seamlessly without breaking custom features.'
  },
  BAdI: {
    term: 'Business Add-In',
    shortName: 'BAdI',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'A standard, object-oriented enhancement point provided by SAP that allows developers to insert custom business rules or validations inside standard SAP application flows without modifying standard code.',
    cleanCoreImplication: 'BAdIs are the recommended in-app enhancement mechanism, provided they are officially released by SAP as stable developer extension points.'
  },
  'CDS View': {
    term: 'Core Data Services View',
    shortName: 'CDS View',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'An advanced data modeling technology used to define semantically rich, SQL-based data definitions and projections directly at the database level, allowing fast push-down queries.',
    cleanCoreImplication: 'Custom solutions should read S/4HANA database tables exclusively through officially released standard CDS views, shielding applications from underlying table structural changes.'
  },
  OData: {
    term: 'Open Data Protocol',
    shortName: 'OData',
    category: 'Integration',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'An open standard, REST-based protocol for building and consuming APIs. SAP standard interfaces, RAP business objects, and CAP applications expose services primarily as OData v2 or v4 feeds.',
    cleanCoreImplication: 'Standardizing integrations on OData ensures seamless connectivity between SAP core, SAP BTP extensions, and external third-party portals.'
  },
  abapGit: {
    term: 'abapGit Client',
    shortName: 'abapGit',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: noSource('abapGit is a community open-source project, not an SAP publication; no reference is recorded here'),
    definition: 'An open-source Git client developed in ABAP, used to manage version control, import/export packages, and synchronize ABAP Cloud repository items (such as classes, DDIC, and services) with external Git repositories.',
    cleanCoreImplication: 'abapGit enables modern GitOps delivery cycles for ABAP Cloud development, making custom packages portable and easy to deploy across ERP landscapes.'
  },
  'Event Mesh': {
    term: 'SAP Integration Suite, Event Mesh',
    shortName: 'Event Mesh',
    category: 'BTP Extension',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'A fully managed, event-driven messaging service on SAP BTP. It allows applications to communicate asynchronously via lightweight events (e.g. document created) using message queues.',
    cleanCoreImplication: 'Using an Event Mesh enables absolute side-by-side decoupling, notifying BTP extensions of core ERP updates asynchronously without blocking ERP user threads.'
  },
  Destination: {
    term: 'SAP BTP Destination Service',
    shortName: 'Destination',
    category: 'Integration',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'A secure cloud registry on SAP BTP used to define connection credentials, authentication certificates, and URLs to target systems (e.g. standard ERP, external SaaS APIs).',
    cleanCoreImplication: 'Destinations externalize connection endpoints from extension source code, shielding BTP microservices from specific ERP landscape adjustments.'
  },
  'Released Interface': {
    term: 'Released Stable SAP Interface',
    shortName: 'Released Interface',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: SAP_CATALOG_SOURCE,
    definition: 'An official SAP object (CDS view, BAPI, class, or service) that has been explicitly certified by SAP as stable and released for customer custom extensions.',
    cleanCoreImplication: 'Using only released stable interfaces protects custom extensions from breaking during automatic cloud system upgrades, as SAP guarantees their backward compatibility.'
  },
  BTP: {
    term: 'SAP Business Technology Platform',
    shortName: 'BTP',
    category: 'BTP Extension',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'SAP\'s unified cloud platform bringing together application development, data and analytics, integration, automation, and AI capabilities in a single environment.',
    cleanCoreImplication: 'SAP BTP is the designated environment for hosting Side-by-Side extensions, keeping the digital ERP core system clean and stable.'
  },
  'SAP BTP': {
    term: 'SAP Business Technology Platform',
    shortName: 'SAP BTP',
    category: 'BTP Extension',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'SAP\'s unified cloud platform bringing together application development, data and analytics, integration, automation, and AI capabilities in a single environment.',
    cleanCoreImplication: 'SAP BTP is the designated environment for hosting Side-by-Side extensions, keeping the digital ERP core system clean and stable.'
  },

  /* ------------------------------------- A . SAP and Clean Core (DESIGN.md 6.1) */

  'Released API': {
    term: 'Released SAP API',
    shortName: 'Released API',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: SAP_CATALOG_SOURCE,
    definition: 'An SAP object that SAP has marked as released for customer use, which means SAP keeps it compatible across upgrades.',
    cleanCoreImplication: 'A custom extension that calls only released APIs is the one kind SAP undertakes not to break on the next upgrade.',
  },
  'Classic API': {
    term: 'Classic SAP API',
    shortName: 'Classic API',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: SAP_CATALOG_SOURCE,
    definition: 'An older SAP interface - a BAPI or a remote-enabled function module - that is usable but is not part of the ABAP Cloud contract.',
    cleanCoreImplication: 'Classic APIs keep working in Private Edition and on-stack, and are the usual reason a system cannot move to Public Edition unchanged.',
  },
  'Cloudification Repository': {
    term: 'SAP ABAP Cloudification Repository',
    shortName: 'Cloudification Repository',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: SAP_CATALOG_SOURCE,
    definition: 'The public SAP repository that lists, per SAP object, its release state and - where SAP names one - the successor to use instead.',
    cleanCoreImplication: 'It is the evidence behind every release state and successor this product shows; where it has no entry for an object, the product says so instead of guessing.',
  },
  Successor: {
    term: 'Successor object',
    shortName: 'Successor',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: SAP_CATALOG_SOURCE,
    definition: 'The object SAP names as the replacement for one that is not released for ABAP Cloud, for example CL_WEB_HTTP_UTILITY for CL_HTTP_UTILITY.',
    cleanCoreImplication: 'A successor turns "this will not work" into a concrete next step; without one named by SAP, the object is a check task, not an automatic rewrite.',
  },
  'Clean core levels': {
    term: 'Clean core levels A to D',
    shortName: 'Clean core levels',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'A four-step reading of how close a used object is to the clean core: A released SAP APIs and extension points, B classic SAP APIs, C internal SAP objects, D not recommended such as modifications and writes to SAP tables.',
    cleanCoreImplication: 'The level is this product\'s reading of SAP\'s published data - an orientation to confirm with ABAP Test Cockpit, and never part of a signed audit pack.',
  },
  'ABAP Cloud': {
    term: 'ABAP Cloud development model',
    shortName: 'ABAP Cloud',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'SAP\'s restricted ABAP language version and development model, in which only released objects may be used.',
    cleanCoreImplication: 'It is the on-stack way to stay clean core: the compiler, not a review, refuses anything outside the released set.',
  },
  'Key user extensibility': {
    term: 'Key user extensibility',
    shortName: 'Key user extensibility',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'In-app, upgrade-safe changes a business key user can make without ABAP - custom fields, custom logic in released BAdIs, adapted forms and apps.',
    cleanCoreImplication: 'Where a requirement fits key user extensibility, custom ABAP is usually the more expensive answer to the same question.',
  },
  'Developer extensibility': {
    term: 'Developer extensibility (on-stack)',
    shortName: 'Developer extensibility',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'Writing ABAP Cloud code inside the S/4HANA system, in customer namespaces, using only released APIs and extension points.',
    cleanCoreImplication: 'It is the clean-core route for logic that must run inside the standard transaction and cannot wait for an asynchronous call.',
  },
  'Side-by-side extensibility': {
    term: 'Side-by-side extensibility (SAP BTP)',
    shortName: 'Side-by-side extensibility',
    category: 'BTP Extension',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'Running the extension outside the ERP system, on SAP BTP, and reaching the core only through released APIs and events.',
    cleanCoreImplication: 'It keeps the core untouched entirely, at the price of a network hop - so it does not suit logic that must block the standard transaction.',
  },
  Modification: {
    term: 'Modification of SAP standard',
    shortName: 'Modification',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'A change to SAP\'s own repository objects, as opposed to an extension made through an interface SAP provided for the purpose.',
    cleanCoreImplication: 'A modification is the clearest break with clean core: every upgrade may have to be reconciled against it by hand.',
  },
  Customizing: {
    term: 'Customizing',
    shortName: 'Customizing',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'Configuring standard SAP behaviour through settings SAP ships for the purpose, without writing code.',
    cleanCoreImplication: 'Customizing is not an extension and carries no upgrade debt - a requirement met by customizing needs no custom object at all.',
  },
  'Scope item': {
    term: 'Scope item',
    shortName: 'Scope item',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'An SAP-delivered, pre-configured end-to-end business process in SAP Best Practices, identified by a short code such as J45.',
    cleanCoreImplication: 'This product treats a scope item as an ID to be checked, never as proof that the standard covers a requirement.',
  },
  'Fit-to-standard': {
    term: 'Fit-to-standard',
    shortName: 'Fit-to-standard',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'The workshop method of comparing a required process against the SAP standard process and deciding, step by step, what really has to differ.',
    cleanCoreImplication: 'Every custom object that survives a fit-to-standard discussion has an argument behind it; the ones that do not are the cheapest to retire.',
  },
  'Public and Private Edition': {
    term: 'S/4HANA Cloud Public Edition and Private Edition',
    shortName: 'Public and Private Edition',
    category: 'Architecture',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'Two operating models: Public Edition is a shared, standardised SaaS system with key user and developer extensibility only; Private Edition is a dedicated system that still allows classic extensions and modifications.',
    cleanCoreImplication: 'The same custom object can be impossible in Public Edition and merely expensive in Private Edition - the target edition decides, so it is an input, not a conclusion.',
  },
  ATC: {
    term: 'ABAP Test Cockpit',
    shortName: 'ATC',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'SAP\'s static-analysis framework inside the ABAP system, including the checks for ABAP Cloud readiness.',
    cleanCoreImplication: 'ATC results run in the real system against the real release; this product reads code outside it, so where the two disagree, ATC wins.',
  },
  'Usage data': {
    term: 'Usage data (SCMON, SUSG)',
    shortName: 'Usage data',
    category: 'ERP Core',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'Recorded evidence of which ABAP objects actually ran in a system over a period, collected by ABAP Call Monitor (SCMON) and its aggregation (SUSG).',
    cleanCoreImplication: 'Usage data is the only honest basis for retiring an object - and a window too short to contain a year-end close proves nothing about it.',
  },
  BPMN: {
    term: 'Business Process Model and Notation 2.0',
    shortName: 'BPMN',
    category: 'Integration',
    kind: 'sap',
    sourceRef: noSource('BPMN 2.0 is an OMG standard, not an SAP publication; no specification reference is recorded here'),
    definition: 'The standard notation for drawing business processes as tasks, gateways and events, exchangeable between tools as XML.',
    cleanCoreImplication: 'It is how this product hands a reconstructed process to SAP Signavio and back - as a file, with a line anchor on every element.',
  },
  'SAP Signavio': {
    term: 'SAP Signavio Process Transformation Suite',
    shortName: 'SAP Signavio',
    category: 'Integration',
    kind: 'sap',
    sourceRef: noSource(NOT_CITED),
    definition: 'SAP\'s process management tooling, where organisations model, mine and govern their business processes.',
    cleanCoreImplication: 'This product exchanges BPMN 2.0 files with it and connects to no Signavio API - the exchange is a file a person moves.',
  },

  /* ---------------------- B . This product's own terms (DESIGN.md 6.1, group B) */

  'Line anchor': {
    term: 'Line anchor',
    shortName: 'Line anchor',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'The reference to the line or line range of your own ABAP that a statement rests on, written L231 or L225-234.',
    cleanCoreImplication: 'A statement without a line anchor is an opinion; this product would rather say "not determined" than print one.',
  },
  Traceability: {
    term: 'Traceability',
    shortName: 'Traceability',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'The unbroken chain from a requirement through a line anchor and a finding to the target design and the decision.',
    cleanCoreImplication: 'It is what makes a decision defensible months later, when everyone has forgotten why the object was kept.',
  },
  'Signed run': {
    term: 'Run and signed run',
    shortName: 'Signed run',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'A run is one immutable analysis of one code state; a signed run additionally carries a server-side signature over its inputs and results.',
    cleanCoreImplication: 'A signature binds the answer to the exact code it was computed from, so a later edit cannot quietly inherit an old approval.',
  },
  Provenance: {
    term: 'Provenance',
    shortName: 'Provenance',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'The label on every statement saying where it came from: the deterministic engine, SAP\'s published data, something you imported, or a model proposal.',
    cleanCoreImplication: 'It lets a reader weigh a sentence without reading the code behind it - and makes a model proposal impossible to mistake for a measurement.',
  },
  'Not determined': {
    term: 'Not determined',
    shortName: 'Not determined',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'The answer this product gives for a question it cannot settle from evidence, shown as its own result rather than hidden as a zero or an empty row.',
    cleanCoreImplication: '"Not determined" is a check task waiting for a person; a silent blank would be a claim that there is nothing to check.',
  },
  'Evidence level': {
    term: 'Evidence level E0 to E4',
    shortName: 'Evidence level',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'How strongly a standard-coverage claim is backed, from E0 (nothing) up to E4 (verified in a system) - a catalog link alone is at most E1.',
    cleanCoreImplication: 'It stops a plausible catalog hit from being read as proof that the standard covers the requirement.',
  },
  Readiness: {
    term: 'Readiness',
    shortName: 'Readiness',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'A grade for how close a piece of custom code is to the clean core, not a percentage of compliance with anything.',
    cleanCoreImplication: 'Nobody passes or fails a readiness grade; it orders the work, and the evidence behind it is what a reviewer actually reads.',
  },
  'The four buckets': {
    term: 'The four buckets',
    shortName: 'The four buckets',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'Every object lands in exactly one of Retire, Keep, Rebuild, or No catalogued path - the fourth meaning SAP names neither a released API nor a successor.',
    cleanCoreImplication: 'The fourth bucket separates your own homework from SAP\'s roadmap, so a blocked object is not counted as a task you could have done.',
  },
  Simulation: {
    term: 'Simulation',
    shortName: 'Simulation',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'A result computed from assumptions rather than measured in a system, labelled as such wherever it appears.',
    cleanCoreImplication: 'A simulated figure never counts as a passed check, and a cost built on one is a comparison, not a price.',
  },
  'Hard-coded rule': {
    term: 'Hard-coded rule',
    shortName: 'Hard-coded rule',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'A business decision written into the program text - a threshold, a company code, a list of vendors - rather than kept in configuration.',
    cleanCoreImplication: 'Each one is a business rule that only a developer can currently change, which is usually the cheapest thing to move into the standard.',
  },
  'Check task': {
    term: 'Check task',
    shortName: 'Check task',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'A named open question the product hands to a person instead of answering - a missing include, a dynamic call, a usage window that is too short.',
    cleanCoreImplication: 'Turning an unknown into a task is how the product avoids the alternative: an assumption printed as a fact.',
  },
  Confirmed: {
    term: 'Confirmed',
    shortName: 'Confirmed',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'A statement a signed-in person has explicitly accepted, recorded as a self-declaration by that account.',
    cleanCoreImplication: 'It is accountability, not an organisational mandate: the product records who said yes, and never that they were entitled to.',
  },
  'Unreached code': {
    term: 'Unreached code',
    shortName: 'Unreached code',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'Code the reconstruction could find no path to from any entry point in what you supplied.',
    cleanCoreImplication: 'Unreached is not the same as unused: a missing include or a dynamic call can hide the path, which is why it becomes a check task.',
  },
  'Sub-process level': {
    term: 'Sub-process level',
    shortName: 'Sub-process level',
    category: 'Product',
    kind: 'product',
    sourceRef: PRODUCT_SOURCE,
    definition: 'How deep the reconstructed process is nested - a called routine drawn as its own process rather than flattened into the caller.',
    cleanCoreImplication: 'Keeping the levels apart is what lets a business reader see one process at a time instead of a thousand-line diagram.',
  },
};

export const GLOSSARY_ITEMS: Record<string, GlossaryItem> = withSources(ENTRIES);

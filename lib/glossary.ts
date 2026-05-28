/**
 * Central Glossary Repository for Clean-Core.io
 * Defines key SAP, BTP, and Cloud Extensibility terms with down-to-earth technical explanations.
 */

export interface GlossaryItem {
  term: string;
  shortName: string;
  category: 'ERP Core' | 'BTP Extension' | 'Architecture' | 'Integration';
  definition: string;
  cleanCoreImplication: string;
}

export const GLOSSARY_ITEMS: Record<string, GlossaryItem> = {
  RAP: {
    term: 'ABAP RESTful Application Programming Model',
    shortName: 'RAP',
    category: 'ERP Core',
    definition: 'SAP\'s modern development model for building optimized, transactional, and cloud-ready enterprise services directly on the S/4HANA database engine. It defines data models using CDS views and implements business logic via ABAP classes.',
    cleanCoreImplication: 'RAP is the standard for Developer (In-App) Extensibility, ensuring custom logic is built using only released, upgrade-safe standard interfaces.'
  },
  CAP: {
    term: 'Cloud Application Programming Model',
    shortName: 'CAP',
    category: 'BTP Extension',
    definition: 'An open and opinionated framework of languages, libraries, and tools for building enterprise-grade cloud services and microservices on SAP BTP. It supports both Node.js (TypeScript) and Java.',
    cleanCoreImplication: 'CAP is the ideal framework for BTP Side-by-Side Extensibility, keeping custom extensions completely separate from the S/4HANA core systems.'
  },
  'SAP LUW': {
    term: 'SAP Logical Unit of Work',
    shortName: 'SAP LUW',
    category: 'ERP Core',
    definition: 'An SAP-specific transactional boundary that groups multiple database updates. All database updates in an SAP LUW are bundled and executed as a single, consistent database transaction (All-or-Nothing transactional integrity).',
    cleanCoreImplication: 'If custom logic must block or run in the same synchronous database thread as the standard transaction, it must execute within the standard SAP LUW (requiring In-App ABAP Cloud).'
  },
  'Clean Core': {
    term: 'Clean Core Guideline',
    shortName: 'Clean Core',
    category: 'Architecture',
    definition: 'SAP\'s standard architectural policy designed to separate standard ERP systems from custom software modifications. Extensions must interact only via stable, public standard APIs and extension points.',
    cleanCoreImplication: 'Adhering to a Clean Core ensures that S/4HANA upgrades, cloud migrations, and standard system patches can be applied seamlessly without breaking custom features.'
  },
  BAdI: {
    term: 'Business Add-In',
    shortName: 'BAdI',
    category: 'ERP Core',
    definition: 'A standard, object-oriented enhancement point provided by SAP that allows developers to insert custom business rules or validations inside standard SAP application flows without modifying standard code.',
    cleanCoreImplication: 'BAdIs are the recommended in-app enhancement mechanism, provided they are officially released by SAP as stable developer extension points.'
  },
  'CDS View': {
    term: 'Core Data Services View',
    shortName: 'CDS View',
    category: 'ERP Core',
    definition: 'An advanced data modeling technology used to define semantically rich, SQL-based data definitions and projections directly at the database level, allowing fast push-down queries.',
    cleanCoreImplication: 'Custom solutions should read S/4HANA database tables exclusively through officially released standard CDS views, shielding applications from underlying table structural changes.'
  },
  OData: {
    term: 'Open Data Protocol',
    shortName: 'OData',
    category: 'Integration',
    definition: 'An open standard, REST-based protocol for building and consuming APIs. SAP standard interfaces, RAP business objects, and CAP applications expose services primarily as OData v2 or v4 feeds.',
    cleanCoreImplication: 'Standardizing integrations on OData ensures seamless connectivity between SAP core, SAP BTP extensions, and external third-party portals.'
  },
  abapGit: {
    term: 'abapGit Client',
    shortName: 'abapGit',
    category: 'Architecture',
    definition: 'An open-source Git client developed in ABAP, used to manage version control, import/export packages, and synchronize ABAP Cloud repository items (such as classes, DDIC, and services) with external Git repositories.',
    cleanCoreImplication: 'abapGit enables modern GitOps delivery cycles for ABAP Cloud development, making custom packages portable and easy to deploy across ERP landscapes.'
  },
  'Event Mesh': {
    term: 'SAP Integration Suite, Event Mesh',
    shortName: 'Event Mesh',
    category: 'BTP Extension',
    definition: 'A fully managed, event-driven messaging service on SAP BTP. It allows applications to communicate asynchronously via lightweight events (e.g. document created) using message queues.',
    cleanCoreImplication: 'Using an Event Mesh enables absolute side-by-side decoupling, notifying BTP extensions of core ERP updates asynchronously without blocking ERP user threads.'
  },
  Destination: {
    term: 'SAP BTP Destination Service',
    shortName: 'Destination',
    category: 'Integration',
    definition: 'A secure cloud registry on SAP BTP used to define connection credentials, authentication certificates, and URLs to target systems (e.g. standard ERP, external SaaS APIs).',
    cleanCoreImplication: 'Destinations externalize connection endpoints from extension source code, shielding BTP microservices from specific ERP landscape adjustments.'
  },
  'Released Interface': {
    term: 'Released Stable SAP Interface',
    shortName: 'Released Interface',
    category: 'Architecture',
    definition: 'An official SAP object (CDS view, BAPI, class, or service) that has been explicitly certified by SAP as stable and released for customer custom extensions.',
    cleanCoreImplication: 'Using only released stable interfaces protects custom extensions from breaking during automatic cloud system upgrades, as SAP guarantees their backward compatibility.'
  },
  BTP: {
    term: 'SAP Business Technology Platform',
    shortName: 'BTP',
    category: 'BTP Extension',
    definition: 'SAP\'s unified cloud platform bringing together application development, data and analytics, integration, automation, and AI capabilities in a single environment.',
    cleanCoreImplication: 'SAP BTP is the designated environment for hosting Side-by-Side extensions, keeping the digital ERP core system clean and stable.'
  },
  'SAP BTP': {
    term: 'SAP Business Technology Platform',
    shortName: 'SAP BTP',
    category: 'BTP Extension',
    definition: 'SAP\'s unified cloud platform bringing together application development, data and analytics, integration, automation, and AI capabilities in a single environment.',
    cleanCoreImplication: 'SAP BTP is the designated environment for hosting Side-by-Side extensions, keeping the digital ERP core system clean and stable.'
  }
};

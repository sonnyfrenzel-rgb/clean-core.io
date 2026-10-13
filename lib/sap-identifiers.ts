/**
 * SAP identifiers with SAP's own title, protocol and release — each read from a
 * public SAP page that states it (roadmap 3.0.12; the PP, CO, FI and SD
 * review of v3.0.10, 12.10.2026).
 *
 * Why it exists: in all four reviews a model named an SAP identifier for
 * something it is not — F2358 and F2234 for apps they are not, F1814 as
 * "Manage Sales Orders" (SAP: "Sales Order"; Manage Sales Orders is F1873),
 * F3965 for an app SAP does not list, SAP_COM_0093 for credit management, 1EG
 * for cost center accounting, an OData V4 pattern for a V2 API, F3338 and
 * F3338A without their releases. A name-only hit in our own catalog was
 * printed "verified". This list lets the check say what SAP says.
 *
 * Two layers, the curated one winning:
 *
 *   1. `CURATED_SAP_IDENTIFIERS` below — hand-checked on 12.10.2026, one public
 *      SAP page per entry (SAP Help Portal, or the SAP Fiori apps reference
 *      library where the help page does not print the app ID). Only the ID,
 *      SAP's title as the page writes it, the protocol and the release that
 *      page states. An ID that could not be confirmed on a public page is not
 *      here (F3965, I_MaintenanceOrder, I_ManufacturingOrderComponent) and
 *      stays "not verified". Never from the Signavio process archive.
 *   2. `lib/abap/generated/sap-identifiers.json`, written weekly by
 *      `scripts/sync-sap-identifiers.ts` (`npm run sync:identifiers`) from the
 *      public sources whose terms allow it, with source and fetch date per
 *      entry: communication scenarios from SAP's documentation sources on
 *      GitHub (SAP-docs, CC BY 4.0 — each entry with its product, commit and
 *      attribution), and the names of SAP's released CDS views from the SAP
 *      Cloudification Repository this repository already syncs.
 *
 * Read at build time only — nothing is fetched at run time.
 */

import {
  EMPTY_SAP_IDENTIFIER_FILE,
  readIdentifierFile,
  sapDocsAttribution,
  type SapIdentifierFile,
  type SapNameList,
  type SapNameListKey,
} from './sap-identifier-sync';
import { sapNamesForDisplay } from './sap-naming';

export type SapIdentifierKind =
  | 'fiori-app'
  | 'scope-item'
  | 'communication-scenario'
  | 'api'
  | 'cds-view'
  | 'function-module'
  | 'transaction';

export type SapProtocol = 'V2' | 'V4' | 'REST' | 'SOAP';

/** An on-premise / private edition release, as a number: 1909, 2020, 2025. */
export interface ReleaseSpan {
  /** First release that has it. */
  from?: number;
  /** Last release that has it. */
  until?: number;
}

export interface SapIdentifierEntry {
  id: string;
  kind: SapIdentifierKind;
  /** SAP's title as the source page writes it; null when the technical name is the name. */
  title: string | null;
  protocol?: SapProtocol;
  /** What the source states about release or edition, in words. */
  release?: string;
  /** The same, as a span of on-premise releases, where the source states one. */
  onPremise?: ReleaseSpan;
  /** The ID SAP lists as this one's successor or predecessor, where it does. */
  related?: string;
  source: { label: string; url: string };
  /** When the fact was read from the source. */
  checked: string;
  /** The product the source documents, where it is not S/4HANA itself or not obvious (synced entries). */
  product?: string;
  /** Read by the weekly sync from a licensed source (SAP-docs on GitHub), not curated by hand. */
  synced?: true;
  /** The source names the ID without a title: a name found in a list, nothing more. */
  listedOnly?: boolean;
  /** The attribution the source's licence asks for (CC BY 4.0), shown wherever the entry is. */
  attribution?: string;
  /** A different title another SAP source gives (a conflict, flagged and never written over this one). */
  otherTitle?: { title: string; product: string; source: { label: string; url: string }; attribution?: string };
}

export const SAP_IDENTIFIERS_CHECKED = '2026-10-12';

const HELP = 'https://help.sap.com/docs';
const FAL = 'https://fioriappslibrary.hana.ondemand.com/sap/fix/externalViewer/index.html?appId=';
const VDM = `${HELP}/SAP_S4HANA_ON-PREMISE/ee6ff9b281d8448f96b4fe6c89f2bdc8`;

const help = (label: string, path: string) => ({ label: `SAP Help, ${label}`, url: `${HELP}/${path}` });
const fal = (id: string) => ({ label: `SAP Fiori apps reference library, ${id}`, url: `${FAL}${id}` });
const vdm = (label: string, topic: string) => ({ label: `SAP Help, ${label} (CDS view), 2025 FPS02`, url: `${VDM}/${topic}.html?version=2025.002` });

const C = SAP_IDENTIFIERS_CHECKED;

/**
 * The curated list. Capped on purpose: the IDs the four reviews named, their
 * closest neighbours, and the successors the engine's catalog proposes most.
 * Extend it the same way — ID, SAP's title as the page writes it, protocol and
 * release where the page states them, the page, the day.
 */
export const CURATED_SAP_IDENTIFIERS: readonly SapIdentifierEntry[] = Object.freeze([
  // ── Fiori apps ─────────────────────────────────────────────────────────
  { id: 'F2234', kind: 'fiori-app', title: 'Supplier Evaluation by Questionnaire', release: 'S/4HANA up to 2020; successor F2234A', onPremise: { until: 2020 }, related: 'F2234A', source: help('App Implementation: Supplier Evaluation by Questionnaire, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/af9ef57f504840d2b81be8667206d485/be7bcd574b6ab40ce10000000a441470.html?version=2025.002'), checked: C },
  { id: 'F0247', kind: 'fiori-app', title: 'Monitor Material Coverage - Net Segments', release: 'obsolete; S/4HANA up to 2020; successor F0247A', onPremise: { until: 2020 }, related: 'F0247A', source: fal('F0247'), checked: C },
  { id: 'F0247A', kind: 'fiori-app', title: 'Monitor Material Coverage (Version 2)', release: 'S/4HANA 1809 onwards, Public Edition 2602/2608', onPremise: { from: 1809 }, related: 'F0247', source: fal('F0247A'), checked: C },
  { id: 'F2336', kind: 'fiori-app', title: 'Manage Production Orders', release: 'S/4HANA 1709 onwards, Public Edition 2602/2608', onPremise: { from: 1709 }, source: fal('F2336'), checked: C },
  { id: 'F0273', kind: 'fiori-app', title: 'Manage Production Orders or Process Orders', source: help('Manage Production Orders or Process Orders, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/34de0103497c4b80a7c7fbf6952ff971/e2ce15560e1c792de10000000a44538d.html?version=2025.002'), checked: C },
  { id: 'F1814', kind: 'fiori-app', title: 'Sales Order', release: 'S/4HANA 1610 onwards; displays one sales order', onPremise: { from: 1610 }, source: help('Sales Order (App ID F1814), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/43336e5621eb9d24e10000000a44147b.html?version=2025.002'), checked: C },
  { id: 'F1873', kind: 'fiori-app', title: 'Manage Sales Orders', release: 'S/4HANA 1610 onwards; newer version F3893', onPremise: { from: 1610 }, related: 'F3893', source: help('Manage Sales Orders (App ID F1873), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/ce158e56ba281e5ee10000000a4450e5.html?version=2025.002'), checked: C },
  { id: 'F3893', kind: 'fiori-app', title: 'Manage Sales Orders - Version 2', release: 'S/4HANA 2021 onwards', onPremise: { from: 2021 }, related: 'F1873', source: help('Manage Sales Orders - Version 2 (App ID F3893), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/ae4138d6a804446faa0a249f3a7e18d8.html?version=2025.002'), checked: C },
  { id: 'F0804', kind: 'fiori-app', title: 'Manage Sales Orders - Services', release: 'Public Edition 2602/2608 only', source: fal('F0804'), checked: C },
  { id: 'F3338', kind: 'fiori-app', title: 'Manage Allocations', release: 'S/4HANA 1909 onwards; "Old Version" from 2025, beside F3338A', onPremise: { from: 1909 }, related: 'F3338A', source: fal('F3338'), checked: C },
  { id: 'F3338A', kind: 'fiori-app', title: 'Manage Allocations (New version)', release: 'S/4HANA 2025 onwards (SAP Cloud ERP Private 2025, Public Edition 2602/2608); before 2025 only F3338', onPremise: { from: 2025 }, related: 'F3338', source: fal('F3338A'), checked: C },
  { id: 'F2358', kind: 'fiori-app', title: 'Monitor Purchase Order Items', release: 'S/4HANA 1709 onwards', onPremise: { from: 1709 }, source: help('Monitor Purchase Order Items (App ID F2358), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/af9ef57f504840d2b81be8667206d485/e069cb1c9d624a4aad48631d9920a024.html?version=2025.002'), checked: C },
  { id: 'F0380', kind: 'fiori-app', title: 'Process Collections Worklist', release: 'S/4HANA 1511 onwards', onPremise: { from: 1511 }, source: fal('F0380'), checked: C },
  { id: 'F0842A', kind: 'fiori-app', title: 'Manage Purchase Orders (Version 2)', source: fal('F0842A'), checked: C },
  { id: 'F2217', kind: 'fiori-app', title: 'Display Line Items in General Ledger', source: help('Display Line Items in General Ledger (App ID F2217), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/651d8af3ea974ad1a4d74449122c620e/bd874158706b9144e10000000a4450e5.html?version=2025.002'), checked: C },
  { id: 'F0717', kind: 'fiori-app', title: 'Manage Journal Entries', release: 'coexists with F0717A (new version)', related: 'F0717A', source: help('Manage Journal Entries (App ID F0717), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/26b08c9979fa435faafcf6033ca0cf93/d2d78154f9a7033de10000000a441470.html?version=2025.002'), checked: C },
  { id: 'F1077', kind: 'fiori-app', title: 'Material Documents Overview', source: help('Material Documents Overview (App ID F1077), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/91b21005dded4984bcccf4a69ae1300c/7cc07e548af58e4ce10000000a4450e5.html?version=2025.002'), checked: C },
  { id: 'F1076', kind: 'fiori-app', title: 'Stock - Single Material', source: help('Stock - Single Material (App ID F1076), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/91b21005dded4984bcccf4a69ae1300c/59bf7e548af58e4ce10000000a4450e5.html?version=2025.002'), checked: C },
  { id: 'F1443A', kind: 'fiori-app', title: 'Manage Cost Centers (Version 2)', source: fal('F1443A'), checked: C },
  { id: 'F1604', kind: 'fiori-app', title: 'Manage Internal Orders', source: fal('F1604'), checked: C },

  // ── APIs (SAP Help, SAP S/4HANA Cloud Public Edition 2608, unless named) ─
  { id: 'API_PRODUCTION_ORDER_2_SRV', kind: 'api', title: 'Production Order (Version 2)', protocol: 'V2', release: 'Public Edition 2608; S/4HANA 2020, 2022, 2023; communication scenarios SAP_COM_0104, SAP_COM_0522', source: help('Production Order (Version 2) (OData V2), 2608', 'SAP_S4HANA_CLOUD/d35113ee62644d3abee1aaec148291d9/0a4262096d2e43258df27c594bdd1468.html'), checked: C },
  { id: 'API_SALES_ORDER_SRV', kind: 'api', title: 'Sales Order (A2X, OData V2)', protocol: 'V2', release: 'Public Edition 2608; communication scenario SAP_COM_0109; the OData V4 service is API_SalesOrder (service SalesOrder 0001)', source: help('Sales Order (A2X, OData V2), 2608', 'SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/00d244581efca007e10000000a441470.html'), checked: C },
  { id: 'API_PRODUCT_SRV', kind: 'api', title: 'Product Master (A2X)', protocol: 'V2', release: 'Public Edition 2608', source: help('APIs for Product Master, 2608', 'SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/ccf66cce781c4a9a988d2553da64ffa5.html'), checked: C },
  { id: 'API_PURCHASEORDER_PROCESS_SRV', kind: 'api', title: 'Purchase Order (OData V2) - (Deprecated)', protocol: 'V2', release: 'Public Edition 2608: deprecated; successor API_PURCHASEORDER_2 (OData V4)', source: help('APIs in Sourcing and Procurement, 2608', 'SAP_S4HANA_CLOUD/bb9f1469daf04bd894ab2167f8132a1a/acd2da57df6cc525e10000000a4450e5.html'), checked: C },
  { id: 'API_PURCHASEREQ_PROCESS_SRV', kind: 'api', title: 'Purchase Requisition - OData V2 (Deprecated)', protocol: 'V2', release: 'Public Edition: deprecated with 2402; successor API_PURCHASEREQUISITION_2', source: help('Purchase Requisition - OData V2 (Deprecated), 2608', 'SAP_S4HANA_CLOUD/bb9f1469daf04bd894ab2167f8132a1a/43c43f584eff2160e10000000a44147b.html'), checked: C },
  { id: 'API_BUSINESS_PARTNER', kind: 'api', title: 'Business Partner (A2X)', release: 'Public Edition 2608; communication scenario SAP_COM_0008', source: help('Business Partner (A2X) – OData API, 2608', 'SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/85043858ea0f9244e10000000a4450e5.html'), checked: C },
  { id: 'API_OUTBOUND_DELIVERY_SRV', kind: 'api', title: 'Outbound Delivery (A2X) Deprecated', release: 'Public Edition 2608: deprecated, SAP names a successor API', source: help('Outbound Delivery (A2X) Deprecated, 2608', 'SAP_S4HANA_CLOUD/588780cab2774a7ab9fffca3a7f919fe/b1b123d381bb4ad6b9cbaafaaa87aa24.html'), checked: C },
  { id: 'API_BILLING_DOCUMENT_SRV', kind: 'api', title: 'Billing Document - Read, Cancel, GetPDF', release: 'Public Edition 2608; communication scenario SAP_COM_0120', source: help('Billing Document - Read, Cancel, GetPDF, 2608', 'SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/fe6f3eda2f914d81b512493fd79e9769.html'), checked: C },
  { id: 'API_COSTCENTER_SRV', kind: 'api', title: 'Cost Center - Read (A2X)', release: 'Public Edition 2608; OData V4 successor API_COST_CENTER', source: help('Cost Center - Read (A2X), 2608', 'SAP_S4HANA_CLOUD/1e3c2c0366834d1fb76461f439248880/37310ccbc01943d98e7d84dff3802537.html'), checked: C },
  { id: 'API_PRODUCTION_ROUTING', kind: 'api', title: 'Production Routing (Deprecated)', release: 'Public Edition 2608: deprecated', source: help('Production Routing (Deprecated), 2608', 'SAP_S4HANA_CLOUD/d35113ee62644d3abee1aaec148291d9/2dd233df3bc947d6b402d246ed887b5a.html'), checked: C },
  ...availIf([
    ['API_INTERNALORDER_SRV', 'Internal Order - Read'],
    ['API_MATERIAL_DOCUMENT_SRV', 'Material Documents - Read, Create'],
    ['API_MATERIAL_STOCK_SRV', 'Material Stock - Read'],
    ['API_BILL_OF_MATERIAL_SRV', 'Bills of Material'],
  ]),

  // ── Communication scenarios ────────────────────────────────────────────
  ...comm('SAP Help, Migrating On-Premise Connectivity from Neo to Cloud Foundry, 2608', 'SAP_S4HANA_CLOUD/0f69f8fb28ac4bf48d2b57b9637e81fa/8a3937c740274decb6fbe977bcab3a18.html', [
    ['SAP_COM_0109', 'Sales Order Integration'], ['SAP_COM_0104', 'Production Planning Integration'],
    ['SAP_COM_0120', 'Billing Integration'], ['SAP_COM_0108', 'Material Document Integration'],
  ]),
  ...comm('SAP Help, APIs in Finance, 2608', 'SAP_S4HANA_CLOUD/6b39bd1d0e5e4099a5b65d835c29c696/5792333ddf3c47eaad4314b071dfd684.html', [
    ['SAP_COM_0002', 'Finance - Posting Integration'], ['SAP_COM_0087', 'SAP Analytics Cloud for Planning Integration'],
  ]),
  ...comm('SAP Help, Enabling Inbound Processes for Data Replication Using SOAP, 2608', 'SAP_S4HANA_CLOUD/f86dc2eb1f8b48c880a7607213104b27/6be35ec182cd434bac53289719f2c0ad.html', [
    ['SAP_COM_0008', 'Business Partner, Customer and Supplier Integration'],
  ]),
  ...comm('SAP Help, Purchase Order – Receive Notifications for Item History Updates, 2608', 'SAP_S4HANA_CLOUD/bb9f1469daf04bd894ab2167f8132a1a/225b8717e7094685b96e54a037df8083.html', [
    ['SAP_COM_0102', 'Purchase Requisition Integration'],
  ]),
  ...comm('SAP Help, Best Practices 2608, Communication Arrangement', 'SAP_S4HANA_BEST_PRACTICES/0a041be90ead00e09ea88b7fa41a8af6/66dd18385a024bbb9723d52f79518280.html', [
    ['SAP_COM_0053', 'Purchase Order Integration'],
  ]),
  ...comm('SAP Help, Best Practices 2608, Configuration in SAP S/4HANA Cloud Public Edition', 'SAP_S4HANA_BEST_PRACTICES/37f44029280f91e8a0782108f349698f/ff047bfb91404449a28a533224042918.html', [
    ['SAP_COM_0106', 'Delivery Processing Integration'],
  ]),
  ...comm('SAP Help, Best Practices 2608, Create Communication Arrangement SAP_COM_0164', 'SAP_S4HANA_BEST_PRACTICES/ad71d375b37b4d968fb029384cbc7413/673e1dc1b6f444229963e76de719d7b4.html', [
    ['SAP_COM_0164', 'Material Stock Integration'],
  ]),
  ...comm('SAP Help, Best Practices 2608, Master Data Integration', 'SAP_S4HANA_BEST_PRACTICES/84a745f7b8ab8e2ad6dd37ecd8209b65/19f023ec843649f7b523089ddaebc993.html', [
    ['SAP_COM_0105', 'Product Lifecycle Management - Master Data Integration'],
  ]),

  // ── CDS views (SAP Help, Virtual Data Model and CDS Views, 2025 FPS02) ─
  { id: 'I_Order', kind: 'cds-view', title: 'Order Header', source: vdm('Order Header', '3020ef4c2c014c058867e2c10ffd3577'), checked: C },
  { id: 'I_ManufacturingOrder', kind: 'cds-view', title: 'Manufacturing Order', source: vdm('Manufacturing Order', '6dec12675da54f29a9283ace7994ca8c'), checked: C },
  { id: 'I_ProductionOrder', kind: 'cds-view', title: 'Production Order Header', source: vdm('Production Order Header', 'c6c3a06854a44d9383b32946f008b1b8'), checked: C },
  { id: 'I_ManufacturingOrderItem', kind: 'cds-view', title: 'Manufacturing Order Item', source: vdm('Manufacturing Order Item', '9ecb6ea8a220445aa21a0435fafca571'), checked: C },
  { id: 'I_InternalOrder', kind: 'cds-view', title: 'Internal Order', source: vdm('Internal Order', '21e34024ab7a43e391cf0e83ee957641'), checked: C },
  { id: 'I_SalesOrder', kind: 'cds-view', title: 'Sales Order', source: vdm('Sales Order', '955a323799624bd79221780675ada090'), checked: C },
  { id: 'I_SalesOrderItem', kind: 'cds-view', title: 'Sales Order Item', source: vdm('Sales Order Item', '4cb98651bcae44c3a2924681ca194988'), checked: C },
  { id: 'I_Customer', kind: 'cds-view', title: 'Customer', source: vdm('Customer', 'a11849401368469fb9e7dfb34f44e9c7'), checked: C },
  { id: 'I_Product', kind: 'cds-view', title: 'Product', source: vdm('Product', 'af5c379f422e495c825802fcb9b0731f'), checked: C },
  { id: 'I_ProductDescription', kind: 'cds-view', title: 'Product Descriptions', source: vdm('Product Descriptions', 'f96b3d9e8aa34c4d95ef67f20aca4696'), checked: C },
  { id: 'I_Supplier', kind: 'cds-view', title: 'Supplier', source: vdm('Supplier', '91c2229c60064cc1bfc621b879435174'), checked: C },
  { id: 'I_PurchaseOrderAPI01', kind: 'cds-view', title: 'Purchase Order', source: vdm('Purchase Order', 'ae766bee9c7b4e938098c935f5962814'), checked: C },
  { id: 'I_PurchaseOrderItemAPI01', kind: 'cds-view', title: 'Purchase Order Item', source: vdm('Purchase Order Item', '33192c1211354eed9e40fac66e55fcc1'), checked: C },
  { id: 'I_JournalEntryItem', kind: 'cds-view', title: 'Journal Entry Item', source: vdm('Journal Entry Item', '47dce95760521070e10000000a44147b'), checked: C },
  { id: 'I_JournalEntry', kind: 'cds-view', title: 'Journal Entry', source: vdm('Journal Entry', 'bc3ccd578b90a856e10000000a44147b'), checked: C },
  { id: 'I_GLAccountLineItem', kind: 'cds-view', title: 'G/L Account Line Item', source: vdm('G/L Account Line Item', '1debe35757c11070e10000000a44147b'), checked: C },
  { id: 'I_CostCenter', kind: 'cds-view', title: 'Cost Center', source: vdm('Cost Center', 'cb3a14ed7ec6416e9310616ed7515f89'), checked: C },
  { id: 'I_ProfitCenter', kind: 'cds-view', title: 'Profit Center', source: vdm('Profit Center', '6f85bb3caab5472380190a047dc87d8b'), checked: C },
  { id: 'I_Plant', kind: 'cds-view', title: 'Plant', source: vdm('Plant', '315568578fa58467e10000000a4450e5'), checked: C },
  { id: 'I_MaterialDocumentItem_2', kind: 'cds-view', title: 'Material Document Item', release: 'successor view for I_MaterialDocumentItem', source: vdm('Material Document Item', '14305f6e8cb842bbb1647ffd5a30ca31'), checked: C },
  { id: 'I_BillOfMaterial', kind: 'cds-view', title: 'Bill of Material', source: vdm('Bill of Material', 'e46cc75700eebc38e10000000a44147b'), checked: C },
  {
    id: 'I_OperationalAcctgDocItem', kind: 'cds-view', title: 'Accounting Document Item: Operational View', release: 'available as of S/4HANA 1909', onPremise: { from: 1909 },
    source: help('CDS Views for SAP BW/4HANA Extraction in General Ledger Accounting, 1909', 'SAP_S4HANA_ON-PREMISE/e296651f454c4284ade361292c633d69/2e187e89ccd04a05933f8aa865f1e759.html?version=1909.000'), checked: C,
  },

  // ── Transactions ───────────────────────────────────────────────────────
  ...tx('SAP Help, Variant Configuration: Complete Maintenance, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/69c3a05bb8d44f02bdd2abe5e822da8e/6d76b6535fe6b74ce10000000a174cb4.html?version=2025.002', [
    ['VA01', 'Create sales order'], ['VA02', 'Change sales order'], ['VA03', 'Display sales order'],
  ]),
  ...tx('SAP Help, Characteristic Value Conversion in Planned and Production Orders, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/9905622a5c1f49ba84e9076fc83a9c2c/f216fb55cdbc7b43e10000000a4450e5.html?version=2025.002', [
    ['CO01', 'Create Production Order'], ['CO02', 'Change Production Order'], ['CO03', 'Display Production Order'],
  ]),
  ...tx('SAP Help, Transaction Codes in Cost Object Controlling, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/5e23dc8fe9be4fd496f8ab556667ea05/ebc64252eaa43507e10000000a441470.html?version=2025.002', [
    ['KO01', 'Create internal order with revenue'], ['KO02', 'Change internal order with revenue'], ['KO03', 'Display internal order with revenue'],
  ]),
  ...tx('SAP Help, Creating Purchase Orders, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/1975ab970cee4897b52e94c18247466e/bb7dd0531d8b4208e10000000a174cb4.html?version=2025.002', [
    ['ME21N', 'Create Purchase Order'], ['ME22N', 'Change Purchase Order'], ['ME23N', 'Display Purchase Order'],
  ]),
  ...tx('SAP Help, Transactions Prepared for the Use of QR-Bills, 2023', 'SAP_S4HANA_ON-PREMISE/74742d945db64478beba8da532dd9291/beaba92fa06e48bca62b0fb393318f2a.html?version=2023.latest', [
    ['FB01', 'Post Document'], ['FB03', 'Display Document'],
  ]),
  ...tx('SAP Help, Additional Functions (Cost Center), 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/b4e911a8e3504d24876c4bfcb42c4704/25cfcc5340487214e10000000a174cb4.html?version=2025.002', [
    ['KS01', 'Create Cost Center'], ['KS02', 'Change Cost Center'], ['KS03', 'Display Cost Center'],
  ]),
  ...tx('SAP Help, Materials in Projects, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/69c3a05bb8d44f02bdd2abe5e822da8e/ff05b753128eb44ce10000000a174cb4.html?version=2025.002', [
    ['MM01', 'Create Material'], ['MM02', 'Change Material'], ['MM03', 'Display Material'],
  ]),
  ...tx('SAP Help, Posting Changes from Sales Order Stock to Customer Stock, 2025', 'SAP_S4HANA_ON-PREMISE/f5d3e1005efd4e86acf9a65abf428082/d90079a9b9ec431ab1858abdce611b90.html?version=2025.000', [
    ['MIGO', 'Post Goods Movement'],
  ]),

  // ── BAPIs and function modules ─────────────────────────────────────────
  ...fm('SAP Help, Extensibility for Sales BAPIs', 'SAP_S4HANA_ON-PREMISE/4c6c3c99e6e94a92a626f424add61cba/35ca09c767dd449aabf0845bb59a37d7.html?version=100', [
    ['BAPI_SALESORDER_CREATEFROMDAT2', 'Create Sales Order'], ['BAPI_SALESORDER_CHANGE', 'Change Sales Order'],
  ]),
  ...fm('SAP Help, Communication of Goods Movements from Inventory Management to EWM, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/9832125c23154a179bfa1784cdc9577a/8a532e4e6aaf4f4b97fd2f014f9837e0.html?version=2025.002', [
    ['BAPI_GOODSMVT_CREATE', null],
  ]),
  ...fm('SAP Help, Document Entry, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/651d8af3ea974ad1a4d74449122c620e/d5b6e9c22275409ca63435eea41abab6.html?version=2025.002', [
    ['BAPI_ACC_DOCUMENT_POST', 'Accounting: Posting'],
  ]),
  ...fm('SAP Help, Extensibility Support for Purchase Orders, 2021', 'SAP_S4HANA_ON-PREMISE/e296651f454c4284ade361292c633d69/0fbc805785a0403d9f56beacf89c0ef4.html?version=2021.000', [
    ['BAPI_PO_CREATE1', null],
  ]),
  ...fm('SAP Help, Creating a CIAP Record Using the CIAP BAPI, 2025 FPS02', 'SAP_S4HANA_ON-PREMISE/c5e66d2df826499d9b8c76b8355601c3/076b205537c53e6ae10000000a44176d.html?version=2025.002', [
    ['BAPI_TRANSACTION_COMMIT', null],
  ]),
  ...fm('SAP Help, GUI_DOWNLOAD, AS ABAP 7.52', 'SAP_NETWEAVER_AS_ABAP_752/5a005e044eef436f8b27bbd3f73a3cfc/c75ab8ec178c44a8aacd1dcac3460db8.html?version=7.52.latest', [
    ['GUI_DOWNLOAD', null],
  ]),
  ...fm('SAP Help, Evaluation of the Concepts of the ALV Flavors, AS ABAP 7.50', 'SAP_NETWEAVER_750/b1c834a22d05483b8a75710743b5ff26/f01df4a12b0c41c59fc72d007915ea43.html?version=7.5.29', [
    ['REUSE_ALV_GRID_DISPLAY', null],
  ]),
] as SapIdentifierEntry[]);

/** SAP Best Practices, "Available Interfaces for Your Selected Scope" (Public Interfaces for Scope Items), 2608. */
function availIf(rows: Array<[string, string]>): SapIdentifierEntry[] {
  const source = {
    label: 'SAP Help, Best Practices 2608, Available Interfaces for Your Selected Scope',
    url: `${HELP}/SAP_S4HANA_BEST_PRACTICES/7c85a9907ecf4b039f4cf574cc299d93/5d55fc2d126844039fc4084ef3e945c9.html`,
  };
  return rows.map(([id, title]) => ({ id, kind: 'api' as const, title, release: 'Public Edition 2608', source, checked: C }));
}

function comm(label: string, path: string, rows: Array<[string, string]>): SapIdentifierEntry[] {
  const source = { label, url: `${HELP}/${path}` };
  return rows.map(([id, title]) => ({ id, kind: 'communication-scenario' as const, title, source, checked: C }));
}

function tx(label: string, path: string, rows: Array<[string, string]>): SapIdentifierEntry[] {
  const source = { label, url: `${HELP}/${path}` };
  return rows.map(([id, title]) => ({ id, kind: 'transaction' as const, title, source, checked: C }));
}

function fm(label: string, path: string, rows: Array<[string, string | null]>): SapIdentifierEntry[] {
  const source = { label, url: `${HELP}/${path}` };
  return rows.map(([id, title]) => ({ id, kind: 'function-module' as const, title, source, checked: C }));
}

/* ------------------------------------------------ the synced layer */

/**
 * The synced file is ~0.5 MB of names. It never travels with a page's own code
 * (tests/client-catalog-boundary.spec.ts, PERF-01): it is fetched as a chunk of
 * its own the first time something asks for it (`loadSapNameLists`). Until it
 * has arrived, the check works on the curated list and this product's catalog
 * alone, and the sources note says the lists were not consulted; every export
 * awaits the load before it writes.
 */
let synced: SapIdentifierFile = EMPTY_SAP_IDENTIFIER_FILE;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** Loads the synced lists once; later calls return the same promise. A failed load leaves the curated layer standing. */
export function loadSapNameLists(): Promise<void> {
  if (!loading) {
    loading = import('./sap-identifier-lists')
      .then((mod) => {
        // A bundler hands the JSON over as the default export; Node's CommonJS interop wraps it once more.
        let raw: unknown = mod.default;
        if (raw && typeof raw === 'object' && !('format' in raw) && 'default' in raw) raw = (raw as { default: unknown }).default;
        setSyncedSapIdentifiers(readIdentifierFile(raw));
      })
      .catch(() => {
        loading = null;
      });
  }
  return loading ?? Promise.resolve();
}

/** Whether the synced lists have arrived. */
export function sapNameListsLoaded(): boolean {
  return synced !== EMPTY_SAP_IDENTIFIER_FILE;
}

/** Sets the synced layer directly — the loader's own step, and the specs' way to hand in a fixture. */
export function setSyncedSapIdentifiers(file: SapIdentifierFile): void {
  synced = file;
  // Emptied: the next load reads the file again.
  if (file === EMPTY_SAP_IDENTIFIER_FILE) loading = null;
  index = null;
  version++;
  for (const l of listeners) l();
}

/** Called after the synced lists change; returns the unsubscribe. */
export function onSapNameListsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever the synced layer does — for a component that re-renders on it. */
export function sapNameListsVersion(): number {
  return version;
}

export function syncedSapIdentifiers(): SapIdentifierFile {
  return synced;
}

/** A synced entry as a curated-shaped one, carrying its product context and the attribution its licence asks for. */
function fromSynced(e: SapIdentifierFile['entries'][number]): SapIdentifierEntry {
  const day = e.observedAt.slice(0, 10);
  return {
    id: e.id,
    kind: e.kind,
    title: e.title,
    ...(e.protocol ? { protocol: e.protocol } : {}),
    ...(e.availableInRelease ? { release: e.availableInRelease } : {}),
    product: e.product,
    synced: true,
    listedOnly: e.title === null,
    source: { label: `SAP documentation on GitHub (${e.source.repo}), read ${day}`, url: e.source.url },
    attribution: e.license === 'CC-BY-4.0' ? sapDocsAttribution(e.source.url) : `${e.license} — source: ${e.source.url}`,
    checked: day,
  };
}

let index: Map<string, SapIdentifierEntry> | null = null;

/** S/4HANA context first: a scenario SAP documents for S/4HANA Cloud stands before the same ID documented for another product. */
const productRank = (e: SapIdentifierFile['entries'][number]) => (/S\/4HANA/.test(e.product) ? 0 : 1) + (e.title ? 0 : 2);

/**
 * Every identifier with a public source, by upper-case ID. The curated entry
 * wins where both exist (it is the more specific); a synced title that differs
 * is kept beside it as a conflict, never written over it.
 */
export function sapIdentifierIndex(): ReadonlyMap<string, SapIdentifierEntry> {
  if (!index) {
    index = new Map<string, SapIdentifierEntry>();
    const synceds = [...synced.entries].sort((a, b) => productRank(b) - productRank(a));
    for (const e of synceds) index.set(e.id.toUpperCase(), fromSynced(e));
    for (const e of CURATED_SAP_IDENTIFIERS) {
      const other = index.get(e.id.toUpperCase());
      const conflict = synced.conflicts.find((c) => c.id.toUpperCase() === e.id.toUpperCase());
      index.set(e.id.toUpperCase(), {
        ...e,
        ...(conflict && other ? { otherTitle: { title: conflict.syncedTitle, product: conflict.product, source: other.source, attribution: other.attribution } } : {}),
      });
    }
  }
  return index;
}

/** The attribution lines of the synced sources (CC BY 4.0 and the others), as the generated file states them. */
export function syncedNotice(): string[] {
  return synced.notice;
}

const list = (key: SapNameListKey): SapNameList | undefined => synced.lists.find((l) => l.key === key);

let nameSets: { file: SapIdentifierFile; sets: Map<SapNameListKey, Set<string>> } | null = null;
function inList(key: SapNameListKey, name: string): boolean {
  if (!nameSets || nameSets.file !== synced) {
    nameSets = { file: synced, sets: new Map(synced.lists.map((l) => [l.key, new Set(l.names)])) };
  }
  return nameSets.sets.get(key)?.has(name.toUpperCase()) ?? false;
}

/** The words beside a hit in one synced list: whose list, which release, from when. */
export function nameListStamp(key: SapNameListKey): string {
  const l = list(key);
  if (!l) return 'SAP Cloudification Repository (list not loaded)';
  return `SAP Cloudification Repository, ${l.label} (${sapNamesForDisplay(l.release)})${l.fetchedAt ? `, fetched ${l.fetchedAt.slice(0, 10)}` : ''}`;
}

/** The list a released CDS view was found in — the public edition's first — or null. */
export function releasedCdsList(name: string): SapNameListKey | null {
  for (const k of ['cds-public', 'cds-private'] as const) if (inList(k, name)) return k;
  return null;
}

/** Whether SAP classifies a BAPI as a classic API. */
export function isClassicBapi(name: string): boolean {
  return inList('bapi-classic', name);
}

export const SAP_RELEASED_LIST_URL = 'https://github.com/SAP/abap-atc-cr-cv-s4hc';

/** The stamp for the released lists together, said under a list of checked identifiers. */
export function releasedListsStamp(): string {
  const dates = synced.lists.map((l) => l.fetchedAt).filter(Boolean).sort() as string[];
  return dates.length
    ? `SAP Cloudification Repository name lists (released CDS views, SAP S/4HANA Cloud Public Edition and SAP Cloud ERP Private; classic BAPIs), fetched ${dates[0].slice(0, 10)}`
    : "SAP Cloudification Repository name lists not consulted here";
}

/** When the synced file was written, or null. */
export function identifierSyncDate(): string | null {
  return synced.syncedAt ? synced.syncedAt.slice(0, 10) : null;
}

/** Every curated and synced scope item ID — the check finds them wherever they stand. */
export function knownScopeItemIds(): string[] {
  return [...sapIdentifierIndex().values()].filter((e) => e.kind === 'scope-item').map((e) => e.id);
}

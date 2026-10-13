/**
 * SAP API Catalog — Versioned mapping of SAP Standard Tables to their
 * released S/4HANA Cloud replacements (CDS Views, OData APIs, BAPIs, etc.)
 *
 * This catalog is used by the Evidence Scanner to map legacy table accesses
 * to their Clean Core compliant replacements. The version is included in
 * the Audit Pack metadata for traceability.
 *
 * Source: SAP API Business Hub, SAP Note 2811791, SAP S/4HANA Cloud
 *         Release Notes 2024 FPS02
 *
 * Stamp (3.0.12, SD review CC-R29): this hand-written layer was compiled
 * against 2024 FPS02 and is not refreshed by any sync. What is refreshed is
 * SAP's own release data underneath it — the SAP Cloudification Repository
 * (`scripts/sync-cloudification-repo.ts`, weekly, `npm run sync:catalog`) —
 * and the identifier list `lib/abap/generated/sap-identifiers.json`
 * (`npm run sync:identifiers`). Wherever a hit in this layer is shown, its
 * release is shown with it (`SAP_API_CATALOG_STAMP`), so a 2024 mapping never
 * reads as current.
 */

export const SAP_API_CATALOG_VERSION = '2024.FPS02';

/** The day the entries below were last reviewed by hand (not a sync date). */
export const SAP_API_CATALOG_REVIEWED = '2026-10-12';

/** The words shown beside a hit in this layer. */
export const SAP_API_CATALOG_STAMP = `this product's curated SAP API catalog, compiled for ${SAP_API_CATALOG_VERSION}, reviewed ${SAP_API_CATALOG_REVIEWED}; not synced from SAP`;

export type SapApiObjectType = 'CDS View' | 'OData API' | 'BAPI' | 'Fiori App' | 'Business Event' | 'Unknown';

export interface SapApiEntry {
  view: string;
  type: SapApiObjectType;
}

export const SAP_API_CATALOG: Record<string, SapApiEntry> = {
  // ── Finance (FI) ──────────────────────────────────────────────────────
  'BSEG':  { view: 'I_JournalEntryItem',       type: 'CDS View' },
  'BKPF':  { view: 'I_JournalEntry',           type: 'CDS View' },
  'BSID':  { view: 'I_OperationalAcctgDocItem', type: 'CDS View' },
  'BSAD':  { view: 'I_OperationalAcctgDocItem', type: 'CDS View' },
  'BSIK':  { view: 'I_OperationalAcctgDocItem', type: 'CDS View' },
  'BSAK':  { view: 'I_OperationalAcctgDocItem', type: 'CDS View' },
  'SKA1':  { view: 'I_GLAccountInChartOfAccounts', type: 'CDS View' },
  'SKAT':  { view: 'I_GLAccountText',           type: 'CDS View' },
  'FAGLFLEXA': { view: 'I_GLAccountLineItem',   type: 'CDS View' },
  'FAGLFLEXT': { view: 'I_GLAccountBalance',    type: 'CDS View' },
  'T001':  { view: 'I_CompanyCode',             type: 'CDS View' },
  'T003':  { view: 'I_DocumentType',            type: 'CDS View' },
  'T042':  { view: 'I_PaymentMethod',           type: 'CDS View' },
  'KONV':  { view: 'I_PricingElement',          type: 'CDS View' },
  'KONP':  { view: 'I_PricingConditionRecord',  type: 'CDS View' },

  // ── Sales & Distribution (SD) ─────────────────────────────────────────
  'VBAK':  { view: 'API_SALES_ORDER_SRV',       type: 'OData API' },
  'VBAP':  { view: 'API_SALES_ORDER_SRV',       type: 'OData API' },
  'VBEP':  { view: 'I_SalesOrderScheduleLine',  type: 'CDS View' },
  // VBKD is sales-document *business* data — payment terms, incoterms, the
  // customer purchase order reference. It was mapped to
  // I_SalesOrderItemPartner, which is the partner assignment: a different
  // entity with different fields, so a transformation built on it cannot
  // preserve what the legacy code read (QA review of 33471220d6e9,
  // 778c72a5cde2). No mapping until a released, field-compatible successor
  // is verified against SAP's own documentation \u2014 "no released equivalent
  // found" is a true answer, and a wrong one can be carried into signed
  // evidence as a recommendation.
  'LIKP':  { view: 'API_OUTBOUND_DELIVERY_SRV', type: 'OData API' },
  'LIPS':  { view: 'API_OUTBOUND_DELIVERY_SRV', type: 'OData API' },
  'VBRK':  { view: 'API_BILLING_DOCUMENT_SRV',  type: 'OData API' },
  'VBRP':  { view: 'API_BILLING_DOCUMENT_SRV',  type: 'OData API' },
  'VBFA':  { view: 'I_SalesDocumentFlow',        type: 'CDS View' },

  // ── Materials Management (MM) ─────────────────────────────────────────
  'EKKO':  { view: 'API_PURCHASEORDER_PROCESS_SRV', type: 'OData API' },
  'EKPO':  { view: 'API_PURCHASEORDER_PROCESS_SRV', type: 'OData API' },
  'EBAN':  { view: 'API_PURCHASEREQUISITION_SRV',   type: 'OData API' },
  'EBKN':  { view: 'I_PurchaseRequisitionItem',     type: 'CDS View' },
  'MARA':  { view: 'API_PRODUCT_SRV',           type: 'OData API' },
  'MARC':  { view: 'I_ProductPlant',             type: 'CDS View' },
  'MARD':  { view: 'I_MaterialStockInStorageLocation', type: 'CDS View' },
  'MARDH': { view: 'I_MaterialStockHistory',         type: 'CDS View' },
  'MCHB':  { view: 'I_MaterialStockByBatch',         type: 'CDS View' },
  'MAKT':  { view: 'I_ProductDescription',       type: 'CDS View' },
  'MSEG':  { view: 'I_MaterialDocumentItem',     type: 'CDS View' },
  'MKPF':  { view: 'I_MaterialDocument',         type: 'CDS View' },
  'MARM':  { view: 'I_ProductUnitsOfMeasure',    type: 'CDS View' },
  'MBEW':  { view: 'I_ProductValuation',         type: 'CDS View' },
  'EINE':  { view: 'I_PurchasingInfoRecord',     type: 'CDS View' },
  'EINA':  { view: 'I_PurchasingInfoRecord',     type: 'CDS View' },
  'NAST':  { view: 'I_OutputManagement',         type: 'CDS View' },
  'EKET':  { view: 'I_PurchaseOrderScheduleLine', type: 'CDS View' },

  // ── Business Partner / Customer / Vendor ──────────────────────────────
  'KNA1':  { view: 'API_BUSINESS_PARTNER',       type: 'OData API' },
  'LFA1':  { view: 'API_BUSINESS_PARTNER',       type: 'OData API' },
  'BUT000': { view: 'API_BUSINESS_PARTNER',      type: 'OData API' },
  'KNVV':  { view: 'I_CustomerSalesArea',        type: 'CDS View' },
  'KNB1':  { view: 'I_CustomerCompany',          type: 'CDS View' },
  'LFB1':  { view: 'I_SupplierCompany',          type: 'CDS View' },
  'ADRC':  { view: 'I_Address',                  type: 'CDS View' },
  'ADR6':  { view: 'I_AddressEmailAddress',      type: 'CDS View' },

  // ── Production Planning (PP) ──────────────────────────────────────────
  'AFKO':  { view: 'I_ProductionOrder',          type: 'CDS View' },
  'AFPO':  { view: 'I_ProductionOrderItem',      type: 'CDS View' },
  'AFVC':  { view: 'I_ProductionOrderOperation', type: 'CDS View' },
  'STKO':  { view: 'I_BillOfMaterial',           type: 'CDS View' },
  'STPO':  { view: 'I_BillOfMaterialItem',       type: 'CDS View' },
  'PLKO':  { view: 'I_ProductionRoutingHeader',  type: 'CDS View' },
  'PLPO':  { view: 'I_ProductionRoutingOperation', type: 'CDS View' },
  'RESB':  { view: 'I_ProductionOrderComponent', type: 'CDS View' },

  // ── Controlling (CO) ──────────────────────────────────────────────────
  'AUFK':  { view: 'I_InternalOrder',            type: 'CDS View' },
  'COBK':  { view: 'I_CostCenterActualData',     type: 'CDS View' },
  'COEP':  { view: 'I_CostLineItem',             type: 'CDS View' },
  'CSKS':  { view: 'I_CostCenter',               type: 'CDS View' },
  'CSKA':  { view: 'I_CostElement',              type: 'CDS View' },
  'CEPC':  { view: 'I_ProfitCenter',             type: 'CDS View' },

  // ── Warehouse / Inventory ─────────────────────────────────────────────
  // LQUA is the warehouse *quant* \u2014 stock at a place, with quantity and
  // batch. It was mapped to I_WarehouseStorageBin, which is storage-bin
  // master data: the place itself, without any stock on it. Same reason as
  // VBKD above (778c72a5cde2); LAGP below is the bin and stays.
  'LAGP':  { view: 'I_WarehouseStorageBin',      type: 'CDS View' },
  'T001W': { view: 'I_Plant',                    type: 'CDS View' },
  'T001L': { view: 'I_StorageLocation',          type: 'CDS View' },

  // ── Plant Maintenance (PM) ────────────────────────────────────────────
  'EQUI':  { view: 'I_Equipment',                type: 'CDS View' },
  'ILOA':  { view: 'I_MaintenanceFunctionalLoc', type: 'CDS View' },
  'QMEL':  { view: 'I_QualityNotification',      type: 'CDS View' },

  // ── Change Documents ──────────────────────────────────────────────────
  'CDHDR': { view: 'I_ChangeDocument',            type: 'CDS View' },
  'CDPOS': { view: 'I_ChangeDocumentItem',        type: 'CDS View' },

  // ── Human Resources (HR) ──────────────────────────────────────────────
  'PA0001': { view: 'I_HRMasterDataOrganization', type: 'CDS View' },
  'PA0002': { view: 'I_HRMasterDataPersonal',     type: 'CDS View' },

  // ── Cross-Module ──────────────────────────────────────────────────────
  'TSTC':  { view: 'I_TransactionCode',           type: 'CDS View' },
  'USR02': { view: 'I_UserAccount',               type: 'CDS View' },
  'TVARV': { view: 'I_VariantVariable',           type: 'CDS View' },
  'DD03L': { view: 'I_TableField',                type: 'CDS View' },
};

/**
 * Successors that depend on what else the program reads (PP review, 12.10.2026).
 *
 * AUFK is the order master of every order category: internal orders,
 * production orders, maintenance orders. Mapped unconditionally to
 * I_InternalOrder, a production planning program that reads AUFK beside AFKO,
 * AFPO and RESB was told to use the internal order view. When the program reads
 * the production order tables, the successor is the one SAP's own release data
 * names for the production order header (AFKO → I_MANUFACTURINGORDER in the
 * SAP Cloudification Repository, synced 2026-10-01; released, PP-VDM). RESB
 * outside a production order context is a reservation: SAP's release data
 * names I_RESERVATIONDOCUMENTITEM for it, not the order component view.
 *
 * The first rule whose `when` tables the program reads wins; `unless` keeps a
 * rule off when one of those tables is read.
 */
export interface ContextualSuccessor {
  table: string;
  /** The rule applies when the program reads any of these. */
  when?: readonly string[];
  /** The rule applies only when the program reads none of these. */
  unless?: readonly string[];
  entry: SapApiEntry;
  /** Said with the successor: what the context is and why. */
  context: string;
}

// RESB is not among them: a reservation is just as much a maintenance order's
// component or a manual reservation, so AUFK beside RESB alone establishes no
// production order (QA review of 03501b79fb3d, e6a7787ff3d0).
const PRODUCTION_ORDER_TABLES = ['AFKO', 'AFPO', 'AFVC', 'AFRU'] as const;

export const CONTEXT_SUCCESSORS: readonly ContextualSuccessor[] = Object.freeze([
  {
    table: 'AUFK',
    when: PRODUCTION_ORDER_TABLES,
    entry: { view: 'I_ManufacturingOrder', type: 'CDS View' },
    context: 'production order context: the program also reads the production order tables',
  },
  {
    table: 'RESB',
    unless: ['AFKO', 'AFPO', 'AFVC', 'AUFK'],
    entry: { view: 'I_ReservationDocumentItem', type: 'CDS View' },
    context: 'reservation context: the program reads no production order table',
  },
]);

/**
 * The successor of a table in the context of the program that reads it, or
 * null when no context rule applies (the plain catalog entry then stands).
 */
export function successorInContext(
  table: string,
  tablesInProgram: Iterable<string>,
): { entry: SapApiEntry; context: string; readHere: string[] } | null {
  const key = (table || '').trim().toUpperCase();
  const read = new Set([...tablesInProgram].map((t) => String(t).toUpperCase()));
  for (const rule of CONTEXT_SUCCESSORS) {
    if (rule.table !== key) continue;
    const hits = (rule.when ?? []).filter((t) => read.has(t));
    if (rule.when && hits.length === 0) continue;
    if (rule.unless && rule.unless.some((t) => read.has(t))) continue;
    return { entry: rule.entry, context: rule.context, readHere: hits };
  }
  return null;
}

/** Total number of SAP standard table entries in the catalog */
export const SAP_API_CATALOG_SIZE = Object.keys(SAP_API_CATALOG).length;

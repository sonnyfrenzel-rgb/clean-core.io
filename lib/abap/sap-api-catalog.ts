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
 */

export const SAP_API_CATALOG_VERSION = '2024.FPS02';

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
  'VBKD':  { view: 'I_SalesOrderItemPartner',   type: 'CDS View' },
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
  'LQUA':  { view: 'I_WarehouseStorageBin',      type: 'CDS View' },
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

/** Total number of SAP standard table entries in the catalog */
export const SAP_API_CATALOG_SIZE = Object.keys(SAP_API_CATALOG).length;

/**
 * ABAP Code Assessment Engine (v1.9.0)
 *
 * Extracts code inventory items, database table coupling, and computes
 * complexity / business-criticality scores from raw ABAP source code.
 */

import type { CodeInventoryItem, DataCouplingEntry } from '@/lib/types';

// Well-known SAP standard tables and their recommended API/CDS replacements
const STANDARD_TABLE_MAP: Record<string, string> = {
  'BSEG': 'Use CDS View I_JournalEntryItem',
  'BKPF': 'Use CDS View I_JournalEntry',
  'VBAK': 'Use API_SALES_ORDER_SRV or CDS I_SalesOrder',
  'VBAP': 'Use API_SALES_ORDER_SRV or CDS I_SalesOrderItem',
  'EKKO': 'Use API_PURCHASEORDER_PROCESS_SRV',
  'EKPO': 'Use API_PURCHASEORDER_PROCESS_SRV',
  'MARA': 'Use API_PRODUCT_SRV or CDS I_Product',
  'MARC': 'Use CDS I_ProductPlant',
  'MARD': 'Use CDS I_MaterialStock',
  'KNA1': 'Use API_BUSINESS_PARTNER or CDS I_Customer',
  'LFA1': 'Use API_BUSINESS_PARTNER or CDS I_Supplier',
  'LIKP': 'Use API_OUTBOUND_DELIVERY_SRV',
  'LIPS': 'Use API_OUTBOUND_DELIVERY_SRV',
  'AFKO': 'Use CDS I_ProductionOrder',
  'AUFK': 'Use CDS I_InternalOrder',
  'CDHDR': 'Use CDS I_ChangeDocument',
  'CDPOS': 'Use CDS I_ChangeDocumentItem',
  'T001': 'Use CDS I_CompanyCode',
  'T001W': 'Use CDS I_Plant',
  'MAKT': 'Use CDS I_ProductDescription',
  'ADRC': 'Use CDS I_Address',
  'BUT000': 'Use API_BUSINESS_PARTNER',
  'KONV': 'Use CDS I_PricingElement',
  'MSEG': 'Use CDS I_MaterialDocumentItem',
  'MKPF': 'Use CDS I_MaterialDocument',
};

/**
 * Extract ABAP object inventory from source code.
 */
export function extractCodeInventory(code: string): CodeInventoryItem[] {
  const items: CodeInventoryItem[] = [];
  const lines = code.split(/\r?\n/);

  // Track already-added names to avoid duplicates
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();

    // CLASS ... DEFINITION | IMPLEMENTATION
    const classMatch = trimmed.match(/^CLASS\s+([\w]+)\s+(DEFINITION|IMPLEMENTATION)/);
    if (classMatch && !seen.has(classMatch[1])) {
      seen.add(classMatch[1]);
      items.push({
        objectName: classMatch[1],
        type: 'Class',
        module: inferModule(classMatch[1]),
        criticality: classMatch[1].startsWith('Z') || classMatch[1].startsWith('Y') ? 'High' : 'Medium',
      });
    }

    // REPORT
    const reportMatch = trimmed.match(/^REPORT\s+([\w]+)/);
    if (reportMatch && !seen.has(reportMatch[1])) {
      seen.add(reportMatch[1]);
      items.push({
        objectName: reportMatch[1],
        type: 'Report',
        module: inferModule(reportMatch[1]),
        criticality: 'Medium',
      });
    }

    // FUNCTION-POOL or FUNCTION
    const funcMatch = trimmed.match(/^FUNCTION\s+([\w]+)/);
    if (funcMatch && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      items.push({
        objectName: funcMatch[1],
        type: 'Function Module',
        module: inferModule(funcMatch[1]),
        criticality: funcMatch[1].startsWith('Z') || funcMatch[1].startsWith('Y') ? 'High' : 'Low',
      });
    }

    // FORM ... ENDFORM
    const formMatch = trimmed.match(/^FORM\s+([\w]+)/);
    if (formMatch && !seen.has(formMatch[1])) {
      seen.add(formMatch[1]);
      items.push({
        objectName: formMatch[1],
        type: 'Form Routine',
        module: inferModule(formMatch[1]),
        criticality: 'Low',
      });
    }

    // INTERFACE ... DEFINITION
    const ifaceMatch = trimmed.match(/^INTERFACE\s+([\w]+)\s+/);
    if (ifaceMatch && !seen.has(ifaceMatch[1])) {
      seen.add(ifaceMatch[1]);
      items.push({
        objectName: ifaceMatch[1],
        type: 'Interface',
        module: inferModule(ifaceMatch[1]),
        criticality: 'Medium',
      });
    }

    // INCLUDE
    const includeMatch = trimmed.match(/^INCLUDE\s+([\w]+)/);
    if (includeMatch && !seen.has(includeMatch[1])) {
      seen.add(includeMatch[1]);
      items.push({
        objectName: includeMatch[1],
        type: 'Include',
        module: inferModule(includeMatch[1]),
        criticality: 'Low',
      });
    }
  }

  return items;
}

/**
 * Extract database table coupling from ABAP source code.
 */
export function extractDataCoupling(code: string): DataCouplingEntry[] {
  const entries: DataCouplingEntry[] = [];
  const tableAccessMap = new Map<string, Set<string>>();

  const upper = code.toUpperCase();

  // SELECT ... FROM <table>
  const selectRegex = /\bSELECT\b[\s\S]*?\bFROM\s+([\w]+)/gi;
  let match;
  while ((match = selectRegex.exec(upper)) !== null) {
    const table = match[1].trim();
    if (!table || table === 'TABLE' || table.length < 2) continue;
    if (!tableAccessMap.has(table)) tableAccessMap.set(table, new Set());
    tableAccessMap.get(table)!.add('Read');
  }

  // INSERT INTO <table>
  const insertRegex = /\bINSERT\s+(?:INTO\s+)?([\w]+)/gi;
  while ((match = insertRegex.exec(upper)) !== null) {
    const table = match[1].trim();
    if (!table || table === 'INTO' || table.length < 2) continue;
    if (!tableAccessMap.has(table)) tableAccessMap.set(table, new Set());
    tableAccessMap.get(table)!.add('Write');
  }

  // UPDATE <table>
  const updateRegex = /\bUPDATE\s+([\w]+)/gi;
  while ((match = updateRegex.exec(upper)) !== null) {
    const table = match[1].trim();
    if (!table || table.length < 2) continue;
    if (!tableAccessMap.has(table)) tableAccessMap.set(table, new Set());
    tableAccessMap.get(table)!.add('Write');
  }

  // MODIFY <table>
  const modifyRegex = /\bMODIFY\s+([\w]+)/gi;
  while ((match = modifyRegex.exec(upper)) !== null) {
    const table = match[1].trim();
    if (!table || table === 'SCREEN' || table === 'LINE' || table === 'TABLE' || table.length < 2) continue;
    if (!tableAccessMap.has(table)) tableAccessMap.set(table, new Set());
    tableAccessMap.get(table)!.add('Write');
  }

  // DELETE FROM <table>
  const deleteRegex = /\bDELETE\s+(?:FROM\s+)?([\w]+)/gi;
  while ((match = deleteRegex.exec(upper)) !== null) {
    const table = match[1].trim();
    if (!table || table === 'FROM' || table === 'TABLE' || table === 'ADJACENT' || table.length < 2) continue;
    if (!tableAccessMap.has(table)) tableAccessMap.set(table, new Set());
    tableAccessMap.get(table)!.add('Write');
  }

  // Convert map to entries
  for (const [tableName, ops] of tableAccessMap) {
    const hasRead = ops.has('Read');
    const hasWrite = ops.has('Write');
    const isCustom = tableName.startsWith('Z') || tableName.startsWith('Y');
    const isStandard = STANDARD_TABLE_MAP[tableName] !== undefined;

    let accessType: 'Read' | 'Write' | 'Read/Write' = 'Read';
    if (hasRead && hasWrite) accessType = 'Read/Write';
    else if (hasWrite) accessType = 'Write';

    let riskLevel: 'High' | 'Medium' | 'Low' = 'Low';
    if (hasWrite && isStandard) riskLevel = 'High';
    else if (hasWrite && isCustom) riskLevel = 'High';
    else if (hasWrite) riskLevel = 'Medium';
    else if (isStandard) riskLevel = 'Medium';

    let recommendation = '';
    if (isStandard && STANDARD_TABLE_MAP[tableName]) {
      recommendation = STANDARD_TABLE_MAP[tableName];
    } else if (isCustom && hasWrite) {
      recommendation = 'Requires Side-by-Side model (custom persistence)';
    } else if (isCustom) {
      recommendation = 'Custom table — evaluate migration or retirement';
    } else {
      recommendation = 'Verify API availability in SAP API Hub';
    }

    entries.push({ tableName, accessType, isCustom, riskLevel, recommendation });
  }

  // Sort: High risk first, then custom tables, then alphabetical
  entries.sort((a, b) => {
    const riskOrder = { High: 0, Medium: 1, Low: 2 };
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
    return a.tableName.localeCompare(b.tableName);
  });

  return entries;
}

/**
 * Compute a complexity score (0-100) based on code structure.
 */
export function computeComplexityScore(code: string): number {
  const lines = code.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const loc = lines.length;
  const upper = code.toUpperCase();

  // Nesting depth approximation (IF/LOOP/DO/CASE/TRY blocks)
  let maxNesting = 0;
  let currentNesting = 0;
  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();
    if (/^(IF|LOOP|DO|CASE|TRY|WHILE)\b/.test(trimmed)) currentNesting++;
    if (/^(ENDIF|ENDLOOP|ENDDO|ENDCASE|ENDTRY|ENDWHILE)\.?\s*$/.test(trimmed)) currentNesting = Math.max(0, currentNesting - 1);
    maxNesting = Math.max(maxNesting, currentNesting);
  }

  // External API calls (CALL FUNCTION, HTTP, RFC)
  const externalCalls = (upper.match(/\bCALL\s+FUNCTION\b/g) || []).length +
    (upper.match(/\bCALL\s+METHOD\b/g) || []).length +
    (upper.match(/\bHTTP_CLIENT/g) || []).length;

  // DB write operations
  const dbWrites = (upper.match(/\b(INSERT|UPDATE|MODIFY|DELETE)\s+/g) || []).length;

  // Calculate score
  let score = 0;
  score += Math.min(30, (loc / 20)); // LOC: up to 30 points
  score += Math.min(25, maxNesting * 5); // Nesting: up to 25 points
  score += Math.min(20, externalCalls * 4); // External calls: up to 20 points
  score += Math.min(25, dbWrites * 5); // DB writes: up to 25 points

  return Math.min(100, Math.round(score));
}

/**
 * Compute a business-criticality score (0-100) based on module heuristics and write tasks.
 */
export function computeCriticalityScore(code: string): number {
  const upper = code.toUpperCase();

  // Module heuristics
  const criticalModules = ['FI', 'CO', 'MM', 'SD', 'HR', 'PP', 'PM', 'QM'];
  let moduleFactor = 0;
  for (const mod of criticalModules) {
    // Check for module-related keywords in the code
    if (upper.includes(`_${mod}_`) || upper.includes(`${mod}_`) || upper.includes(`MODULE ${mod}`)) {
      moduleFactor += 8;
    }
  }

  // Financial table access (high criticality)
  const financialTables = ['BSEG', 'BKPF', 'ACDOCA', 'FAGLFLEXT', 'BSID', 'BSAD', 'BSIK', 'BSAK'];
  let financeFactor = 0;
  for (const t of financialTables) {
    if (upper.includes(t)) financeFactor += 10;
  }

  // Write-intensity (MODIFY, INSERT, UPDATE, DELETE)
  const writes = (upper.match(/\b(INSERT|UPDATE|MODIFY|DELETE)\s+/g) || []).length;
  const writeFactor = Math.min(30, writes * 6);

  // Authority checks (indicates business-critical processes)
  const authChecks = (upper.match(/\bAUTHORITY-CHECK\b/g) || []).length;
  const authFactor = Math.min(15, authChecks * 5);

  let score = Math.min(100, moduleFactor + financeFactor + writeFactor + authFactor);
  return Math.max(10, Math.round(score)); // Minimum 10 if code exists
}

/**
 * Determine target architecture recommendation based on code analysis.
 */
export function recommendArchitecture(
  code: string,
  codeInventory: CodeInventoryItem[],
  dataCoupling: DataCouplingEntry[],
  extensibilityRoute?: string
): { architecture: 'rap' | 'cap' | 'integration' | 'event' | 'retire'; confidence: number; justification: string } {
  const upper = code.toUpperCase();

  // Scoring factors
  const customTableWrites = dataCoupling.filter((d) => d.isCustom && d.accessType !== 'Read').length;
  const standardTableReads = dataCoupling.filter((d) => !d.isCustom && d.accessType === 'Read').length;
  const hasRfcIdoc = /\b(CALL\s+FUNCTION\s+'RFC|IDOC|BAPI_)\b/i.test(upper);
  const hasEventPattern = /\b(EVENT\s+RAISED|RAISE\s+EVENT|PUBLISH)\b/i.test(upper);
  const loc = code.split(/\r?\n/).filter((l) => l.trim().length > 0).length;

  // If the existing route already suggests BTP or In-App, use it as a tiebreaker
  const existingRouteIsBTP = extensibilityRoute?.includes('BTP');

  // Decision logic
  if (customTableWrites > 0) {
    return {
      architecture: 'cap',
      confidence: Math.min(95, 70 + customTableWrites * 5),
      justification: `${customTableWrites} custom table write operation(s) detected. Custom persistence requires decoupled Side-by-Side model.`,
    };
  }

  if (hasRfcIdoc) {
    return {
      architecture: 'integration',
      confidence: 80,
      justification: 'RFC/IDoc integration patterns detected. SAP Integration Suite replaces legacy middleware with cloud integration flows.',
    };
  }

  if (hasEventPattern) {
    return {
      architecture: 'event',
      confidence: 75,
      justification: 'Event-driven patterns detected. SAP Event Mesh enables asynchronous, decoupled orchestration.',
    };
  }

  if (loc < 30 && codeInventory.every((i) => i.criticality === 'Low')) {
    return {
      architecture: 'retire',
      confidence: 65,
      justification: 'Small, low-criticality code with no custom business logic. Candidate for retirement if standard Fiori app covers the capability.',
    };
  }

  if (standardTableReads > 0 && !existingRouteIsBTP) {
    return {
      architecture: 'rap',
      confidence: Math.min(90, 60 + standardTableReads * 5),
      justification: `${standardTableReads} standard table read(s) detected with no custom writes. On-Stack RAP extensibility is the recommended path.`,
    };
  }

  // Default: follow existing route
  return {
    architecture: existingRouteIsBTP ? 'cap' : 'rap',
    confidence: 60,
    justification: existingRouteIsBTP
      ? 'General analysis suggests Side-by-Side extensibility based on the project\'s deployment target.'
      : 'General analysis suggests On-Stack RAP extensibility based on standard table access patterns.',
  };
}

/**
 * Infer SAP module from object name conventions.
 */
function inferModule(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('FI_') || upper.includes('_FI') || upper.includes('BSEG') || upper.includes('BKPF')) return 'FI';
  if (upper.includes('SD_') || upper.includes('_SD') || upper.includes('VBAK') || upper.includes('VBAP')) return 'SD';
  if (upper.includes('MM_') || upper.includes('_MM') || upper.includes('EKKO') || upper.includes('MARA')) return 'MM';
  if (upper.includes('HR_') || upper.includes('_HR') || upper.includes('PA_')) return 'HR';
  if (upper.includes('PP_') || upper.includes('_PP') || upper.includes('AFKO')) return 'PP';
  if (upper.includes('CO_') || upper.includes('_CO') || upper.includes('AUFK')) return 'CO';
  if (upper.includes('PM_') || upper.includes('_PM')) return 'PM';
  if (upper.includes('QM_') || upper.includes('_QM')) return 'QM';
  return 'Custom';
}

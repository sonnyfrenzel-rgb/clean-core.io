/**
 * ABAP Code Assessment Engine (v1.9.0)
 *
 * Extracts code inventory items, database table coupling, and computes
 * complexity / business-criticality scores from raw ABAP source code.
 */

import type { CodeInventoryItem, DataCouplingEntry } from '@/lib/types';
import { tokenize } from './declaration-parser';

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
  const statements = tokenize(code);

  const FAKE_TABLES = new Set([
    'MODE', 'TASK', 'RISK', 'SCREEN', 'LINE', 'TABLE', 'INTO', 'FROM',
    'CORRESPONDING', 'DATA', 'ADJACENT', 'RESULT', 'CONNECTION', 'TYPE',
    'INDEX', 'UP', 'TO', 'ROWS', 'WHERE', 'AND', 'OR', 'NOT', 'NULL',
    'IS', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'OUTER', 'INNER',
    'FULL', 'CROSS', 'USING', 'CLIENT', 'SPECIFIED', 'SYSTEM', 'VALUES',
    'SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'FOR', 'ALL',
    'ENTRIES', 'BY', 'ORDER', 'GROUP', 'HAVING'
  ]);

  interface TableStats {
    tableName: string;
    reads: number;
    writes: number;
    lineNumbers: number[];
    snippets: string[];
  }

  const statsMap = new Map<string, TableStats>();

  const getOrCreate = (table: string): TableStats => {
    const normTable = table.toUpperCase().trim();
    if (!statsMap.has(normTable)) {
      statsMap.set(normTable, {
        tableName: normTable,
        reads: 0,
        writes: 0,
        lineNumbers: [],
        snippets: []
      });
    }
    return statsMap.get(normTable)!;
  };

  const addStat = (table: string, isWrite: boolean, line: number, snippet: string) => {
    if (!table || table.length < 2 || FAKE_TABLES.has(table.toUpperCase()) || /^\d/.test(table)) return;
    const stats = getOrCreate(table);
    if (isWrite) stats.writes++;
    else stats.reads++;
    if (!stats.lineNumbers.includes(line)) {
      stats.lineNumbers.push(line);
      stats.snippets.push(snippet);
    }
  };

  for (const stmt of statements) {
    const text = stmt.text.trim();
    if (!text) continue;
    const upper = text.toUpperCase();

    // 1. SELECT Statement (with Join parsing support)
    if (/^SELECT\b/i.test(text)) {
      // Extract from FROM part until any terminating SQL clause
      const fromMatch = text.match(/\bFROM\s+([\s\S]+?)(?:\b(INTO|WHERE|ORDER|GROUP|UP|HAVING|UNION|FOR)\b|$)/i);
      if (fromMatch) {
        const tableArea = fromMatch[1].trim();
        // Split by JOIN keywords to find all participating tables
        const parts = tableArea.split(/\b(?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN\b/i);
        for (const part of parts) {
          const words = part.trim().split(/\s+/);
          const tableName = words[0]?.replace(/[~,]/g, '').trim(); // strip alias markers or commas
          if (tableName) {
            addStat(tableName, false, stmt.line, text);
          }
        }
      }
    }

    // 2. INSERT Statement
    const insertMatch = text.match(/^INSERT\s+(?:INTO\s+)?([\w\/]+)/i);
    if (insertMatch) {
      addStat(insertMatch[1], true, stmt.line, text);
    }

    // 3. UPDATE Statement
    const updateMatch = text.match(/^UPDATE\s+([\w\/]+)/i);
    if (updateMatch) {
      addStat(updateMatch[1], true, stmt.line, text);
    }

    // 4. MODIFY Statement
    const modifyMatch = text.match(/^MODIFY\s+([\w\/]+)/i);
    if (modifyMatch) {
      const target = modifyMatch[1].toUpperCase();
      if (target !== 'SCREEN' && target !== 'LINE' && target !== 'TABLE') {
        addStat(modifyMatch[1], true, stmt.line, text);
      }
    }

    // 5. DELETE Statement
    const deleteMatch = text.match(/^DELETE\s+(?:FROM\s+)?([\w\/]+)/i);
    if (deleteMatch) {
      const target = deleteMatch[1].toUpperCase();
      if (target !== 'FROM' && target !== 'TABLE' && target !== 'ADJACENT') {
        addStat(deleteMatch[1], true, stmt.line, text);
      }
    }
  }

  // Convert map to entries
  for (const [tableName, stats] of statsMap) {
    const hasRead = stats.reads > 0;
    const hasWrite = stats.writes > 0;
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
    let replacementConfidence: 'Catalog Match' | 'Verified' | 'Candidate' | 'Needs Validation' = 'Needs Validation';
    if (isStandard && STANDARD_TABLE_MAP[tableName]) {
      recommendation = STANDARD_TABLE_MAP[tableName];
      replacementConfidence = 'Catalog Match';
    } else if (isStandard) {
      recommendation = 'Verify API availability in SAP API Hub';
      replacementConfidence = 'Candidate';
    } else if (isCustom && hasWrite) {
      recommendation = 'Requires Side-by-Side model (custom persistence)';
      replacementConfidence = 'Needs Validation';
    } else if (isCustom) {
      recommendation = 'Custom table — evaluate migration or retirement';
      replacementConfidence = 'Needs Validation';
    } else {
      recommendation = 'Verify API availability in SAP API Hub';
      replacementConfidence = 'Needs Validation';
    }

    entries.push({
      tableName,
      accessType,
      isCustom,
      riskLevel,
      recommendation,
      occurrences: stats.reads + stats.writes,
      readCount: stats.reads,
      writeCount: stats.writes,
      lineNumbers: stats.lineNumbers,
      snippets: stats.snippets,
      replacementConfidence
    });
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
 * Compute a complexity score (1-10) based on code structure.
 * Scale: 1 = trivial, 5 = moderate, 10 = highly complex
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

  // Calculate raw score 0-100
  let raw = 0;
  raw += Math.min(30, (loc / 20)); // LOC: up to 30 points
  raw += Math.min(25, maxNesting * 5); // Nesting: up to 25 points
  raw += Math.min(20, externalCalls * 4); // External calls: up to 20 points
  raw += Math.min(25, dbWrites * 5); // DB writes: up to 25 points

  // Normalize to 1-10 scale
  const normalized = Math.max(1, Math.min(10, Math.round(raw / 10)));
  return normalized;
}

/**
 * Compute a business-criticality score (1-10) based on module heuristics and data sensitivity.
 * Scale: 1 = low impact (simple read-only utility), 5 = important, 10 = mission-critical
 */
export function computeCriticalityScore(code: string): number {
  const upper = code.toUpperCase();

  // Module heuristics — check if code touches critical SAP modules
  const criticalModules = ['FI', 'CO', 'MM', 'SD', 'HR', 'PP', 'PM', 'QM'];
  let moduleFactor = 0;
  for (const mod of criticalModules) {
    if (upper.includes(`_${mod}_`) || upper.includes(`${mod}_`) || upper.includes(`MODULE ${mod}`)) {
      moduleFactor += 1; // Each module match = +1
    }
  }
  moduleFactor = Math.min(3, moduleFactor); // Cap at 3

  // Financial table access (high criticality)
  const financialTables = ['BSEG', 'BKPF', 'ACDOCA', 'FAGLFLEXT', 'BSID', 'BSAD', 'BSIK', 'BSAK'];
  let financeFactor = 0;
  for (const t of financialTables) {
    if (upper.includes(t)) financeFactor += 1;
  }
  financeFactor = Math.min(3, financeFactor); // Cap at 3

  // Business-critical process detection (Sales, Delivery, Credit, Audit, Partner)
  const criticalProcessTables = ['VBAK', 'VBAP', 'LIKP', 'LIPS', 'KNA1', 'KNB1', 'EKKO', 'EKPO'];
  let processFactor = 0;
  for (const t of criticalProcessTables) {
    if (upper.includes(t)) processFactor += 1;
  }
  const criticalKeywords = ['CREDIT', 'DELIVERY', 'AUDIT', 'FULFILLMENT', 'INVOICE', 'BILLING', 'DUNNING'];
  for (const kw of criticalKeywords) {
    if (upper.includes(kw)) processFactor += 1;
  }
  processFactor = Math.min(3, processFactor); // Cap at 3

  // Write-intensity (MODIFY, INSERT, UPDATE, DELETE)
  const writes = (upper.match(/\b(INSERT|UPDATE|MODIFY|DELETE)\s+/g) || []).length;
  const writeFactor = Math.min(2, writes); // 0-2 points

  // Authority checks (indicates business-critical processes)
  const authChecks = (upper.match(/\bAUTHORITY-CHECK\b/g) || []).length;
  const authFactor = Math.min(2, authChecks); // 0-2 points

  // Sum: max possible = 3 + 3 + 3 + 2 + 2 = 13, clamped to 10
  const score = moduleFactor + financeFactor + processFactor + writeFactor + authFactor;
  
  // Minimum 1 (code exists), maximum 10
  return Math.max(1, Math.min(10, score));
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

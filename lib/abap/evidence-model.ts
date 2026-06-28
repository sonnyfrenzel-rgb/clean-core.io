import { tokenize } from './declaration-parser';

export type EvidenceKind =
  | 'table-access'
  | 'custom-table-write'
  | 'standard-table-read'
  | 'standard-table-write'
  | 'rfc-call'
  | 'bdc'
  | 'dynpro'
  | 'classic-alv'
  | 'gui-download'
  | 'native-sql'
  | 'update-task'
  | 'commit-work'
  | 'submit'
  | 'authority-check'
  | 'hardcoded-value'
  | 'unreleased-api'
  | 'batch-input'
  | 'business-rule';

export interface EvidenceFinding {
  id: string;
  kind: EvidenceKind;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  confidence: 'High' | 'Medium' | 'Low';
  objectName?: string;
  objectType?: string;
  lineStart: number;
  lineEnd?: number;
  snippet: string;
  technicalDetail: string;
  cleanCoreImpact: string;
  recommendation: string;
  targetOptions: Array<'Key User Extensibility' | 'Developer Extensibility / RAP' | 'Side-by-Side CAP' | 'Integration Suite' | 'Event Mesh' | 'Retire'>;
  sapReplacement?: {
    objectName: string;
    objectType: 'CDS View' | 'OData API' | 'BAPI' | 'Fiori App' | 'Business Event' | 'Unknown';
    confidence: 'Verified' | 'Candidate' | 'Needs Validation';
  };
}

export interface AbapEvidenceReport {
  findings: EvidenceFinding[];
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
}

// Map for standard SAP tables and their replacements (from code-assessment)
const STANDARD_TABLE_MAP: Record<string, { view: string; type: 'CDS View' | 'OData API' | 'BAPI' | 'Fiori App' | 'Business Event' | 'Unknown' }> = {
  'BSEG': { view: 'I_JournalEntryItem', type: 'CDS View' },
  'BKPF': { view: 'I_JournalEntry', type: 'CDS View' },
  'VBAK': { view: 'API_SALES_ORDER_SRV', type: 'OData API' },
  'VBAP': { view: 'API_SALES_ORDER_SRV', type: 'OData API' },
  'EKKO': { view: 'API_PURCHASEORDER_PROCESS_SRV', type: 'OData API' },
  'EKPO': { view: 'API_PURCHASEORDER_PROCESS_SRV', type: 'OData API' },
  'MARA': { view: 'API_PRODUCT_SRV', type: 'OData API' },
  'MARC': { view: 'I_ProductPlant', type: 'CDS View' },
  'MARD': { view: 'I_MaterialStock', type: 'CDS View' },
  'KNA1': { view: 'API_BUSINESS_PARTNER', type: 'OData API' },
  'LFA1': { view: 'API_BUSINESS_PARTNER', type: 'OData API' },
  'LIKP': { view: 'API_OUTBOUND_DELIVERY_SRV', type: 'OData API' },
  'LIPS': { view: 'API_OUTBOUND_DELIVERY_SRV', type: 'OData API' },
  'AFKO': { view: 'I_ProductionOrder', type: 'CDS View' },
  'AUFK': { view: 'I_InternalOrder', type: 'CDS View' },
  'CDHDR': { view: 'I_ChangeDocument', type: 'CDS View' },
  'CDPOS': { view: 'I_ChangeDocumentItem', type: 'CDS View' },
  'T001': { view: 'I_CompanyCode', type: 'CDS View' },
  'T001W': { view: 'I_Plant', type: 'CDS View' },
  'MAKT': { view: 'I_ProductDescription', type: 'CDS View' },
  'ADRC': { view: 'I_Address', type: 'CDS View' },
  'BUT000': { view: 'API_BUSINESS_PARTNER', type: 'OData API' },
  'KONV': { view: 'I_PricingElement', type: 'CDS View' },
  'MSEG': { view: 'I_MaterialDocumentItem', type: 'CDS View' },
  'MKPF': { view: 'I_MaterialDocument', type: 'CDS View' },
};

export function buildAbapEvidence(code: string, fileName: string): AbapEvidenceReport {
  const findings: EvidenceFinding[] = [];
  const statements = tokenize(code);
  let idCounter = 1;

  const FAKE_TABLES = new Set([
    'MODE', 'TASK', 'RISK', 'SCREEN', 'LINE', 'TABLE', 'INTO', 'FROM',
    'CORRESPONDING', 'DATA', 'ADJACENT', 'RESULT', 'CONNECTION', 'TYPE',
    'INDEX', 'UP', 'TO', 'ROWS', 'WHERE', 'AND', 'OR', 'NOT', 'NULL',
    'IS', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'OUTER', 'INNER',
    'FULL', 'CROSS', 'USING', 'CLIENT', 'SPECIFIED', 'SYSTEM', 'VALUES',
    'SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'FOR', 'ALL',
    'ENTRIES', 'BY', 'ORDER', 'GROUP', 'HAVING'
  ]);

  const addFinding = (finding: Omit<EvidenceFinding, 'id'>) => {
    findings.push({
      ...finding,
      id: `CC-${String(idCounter++).padStart(3, '0')}`
    });
  };

  const processTableAccess = (tableName: string, isWrite: boolean, line: number, text: string) => {
    const table = tableName.toUpperCase().trim();
    if (!table || table.length < 2 || FAKE_TABLES.has(table) || /^\d/.test(table)) return;

    const isCustom = table.startsWith('Z') || table.startsWith('Y');
    const hasReplacement = STANDARD_TABLE_MAP[table] !== undefined;

    if (isCustom) {
      if (isWrite) {
        addFinding({
          kind: 'custom-table-write',
          title: `Direct Write to Custom Table ${table}`,
          severity: 'High',
          confidence: 'High',
          objectName: table,
          objectType: 'Database Table',
          lineStart: line,
          snippet: text,
          technicalDetail: `Direct modification statement (INSERT/UPDATE/MODIFY/DELETE) on custom table ${table}.`,
          cleanCoreImpact: 'Direct DB access bypasses the application layer and encapsulation, violating clean core rules.',
          recommendation: `Expose custom tables via RAP Business Objects (Developer Extensibility) or use Side-by-Side persistence in BTP (CAP).`,
          targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
        });
      } else {
        addFinding({
          kind: 'table-access',
          title: `Direct Read from Custom Table ${table}`,
          severity: 'Low',
          confidence: 'High',
          objectName: table,
          objectType: 'Database Table',
          lineStart: line,
          snippet: text,
          technicalDetail: `SELECT statement reading from custom table ${table}.`,
          cleanCoreImpact: 'Reading from custom tables directly is acceptable if wrapped in Tier-2 or CDS views, but should be checked for proper API usage.',
          recommendation: `Expose custom table via CDS view and wrap it in a RAP service layer.`,
          targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility']
        });
      }
    } else {
      // Standard table
      if (isWrite) {
        addFinding({
          kind: 'standard-table-write',
          title: `CRITICAL: Direct Write to SAP Standard Table ${table}`,
          severity: 'Critical',
          confidence: 'High',
          objectName: table,
          objectType: 'Database Table',
          lineStart: line,
          snippet: text,
          technicalDetail: `Direct modification statement on standard SAP table ${table}.`,
          cleanCoreImpact: 'Directly modifying standard SAP tables destroys system integrity, invalidates SAP guarantees, and blocks upgrades completely.',
          recommendation: `REPLACE IMMEDIATELY with official SAP released APIs (OData APIs, BAPIs) or RAP actions. Do NOT perform direct writes in S/4HANA.`,
          targetOptions: ['Developer Extensibility / RAP', 'Integration Suite'],
          sapReplacement: hasReplacement ? {
            objectName: STANDARD_TABLE_MAP[table].view,
            objectType: STANDARD_TABLE_MAP[table].type,
            confidence: 'Verified'
          } : undefined
        });
      } else {
        addFinding({
          kind: 'standard-table-read',
          title: `Direct Read from SAP Standard Table ${table}`,
          severity: 'Medium',
          confidence: 'High',
          objectName: table,
          objectType: 'Database Table',
          lineStart: line,
          snippet: text,
          technicalDetail: `Direct SELECT statement on standard SAP table ${table}.`,
          cleanCoreImpact: 'Direct read access to standard SAP tables couples custom code directly to SAP data models, creating upgrade dependencies.',
          recommendation: `Replace with released CDS views (e.g. I_ views) or official APIs.`,
          targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility'],
          sapReplacement: hasReplacement ? {
            objectName: STANDARD_TABLE_MAP[table].view,
            objectType: STANDARD_TABLE_MAP[table].type,
            confidence: 'Verified'
          } : {
            objectName: `I_${table}`,
            objectType: 'CDS View',
            confidence: 'Candidate'
          }
        });
      }
    }
  };

  for (const stmt of statements) {
    const text = stmt.text.trim();
    if (!text) continue;
    const upper = text.toUpperCase();

    // -- 1. Table Accesses --
    if (/^SELECT\b/i.test(text)) {
      const fromMatch = text.match(/\bFROM\s+([\s\S]+?)(?:\b(INTO|WHERE|ORDER|GROUP|UP|HAVING|UNION|FOR)\b|$)/i);
      if (fromMatch) {
        const tableArea = fromMatch[1].trim();
        const parts = tableArea.split(/\b(?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN\b/i);
        for (const part of parts) {
          const words = part.trim().split(/\s+/);
          const tableName = words[0]?.replace(/[~,]/g, '').trim();
          if (tableName) {
            processTableAccess(tableName, false, stmt.line, text);
          }
        }
      }
    }

    // INSERT
    const insertMatch = text.match(/^INSERT\s+(?:INTO\s+)?([\w\/]+)/i);
    if (insertMatch) processTableAccess(insertMatch[1], true, stmt.line, text);

    // UPDATE
    const updateMatch = text.match(/^UPDATE\s+([\w\/]+)/i);
    if (updateMatch) processTableAccess(updateMatch[1], true, stmt.line, text);

    // MODIFY
    const modifyMatch = text.match(/^MODIFY\s+([\w\/]+)/i);
    if (modifyMatch && !['SCREEN', 'LINE', 'TABLE'].includes(modifyMatch[1].toUpperCase())) {
      processTableAccess(modifyMatch[1], true, stmt.line, text);
    }

    // DELETE
    const deleteMatch = text.match(/^DELETE\s+(?:FROM\s+)?([\w\/]+)/i);
    if (deleteMatch && !['FROM', 'TABLE', 'ADJACENT'].includes(deleteMatch[1].toUpperCase())) {
      processTableAccess(deleteMatch[1], true, stmt.line, text);
    }

    // -- 2. Legacy Pattern Detections --

    // Batch Data Communication (BDC)
    if (/\bCALL\s+TRANSACTION\b/i.test(text)) {
      const tcodeMatch = text.match(/\bCALL\s+TRANSACTION\s+'?([\w\/]+)'?/i);
      const tcode = tcodeMatch ? tcodeMatch[1].toUpperCase() : 'UNKNOWN';
      addFinding({
        kind: 'bdc',
        title: `Legacy Batch Data Communication (BDC) to TCode ${tcode}`,
        severity: 'High',
        confidence: 'High',
        objectName: tcode,
        objectType: 'Transaction Code',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `CALL TRANSACTION statement to drive SAP screens programmatically.`,
        cleanCoreImpact: 'BDC relies on traditional SAP GUI screen flows. These are highly unstable, prone to breaking during upgrades, and do not work in SAP Fiori or Cloud environments.',
        recommendation: `Replace BDC with official SAP APIs (e.g. Sales Order API instead of VA01/VA02 BDC) or wrap in OData API via RAP.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP', 'Integration Suite']
      });
    }

    // Remote Function Calls (RFC)
    if (/\bCALL\s+FUNCTION\b[\s\S]+?\bDESTINATION\b/i.test(text)) {
      const fmMatch = text.match(/\bCALL\s+FUNCTION\s+'?([\w\/]+)'?/i);
      const fmName = fmMatch ? fmMatch[1].toUpperCase() : 'UNKNOWN';
      addFinding({
        kind: 'rfc-call',
        title: `Remote Function Call (RFC) to FM ${fmName}`,
        severity: 'High',
        confidence: 'High',
        objectName: fmName,
        objectType: 'Function Module',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `CALL FUNCTION DESTINATION call to external SAP or non-SAP system.`,
        cleanCoreImpact: 'Sync RFC calls block worker processes, introduce tight coupling, and violate the cloud integration model.',
        recommendation: `Migrate RFC to HTTP REST APIs, SAP Integration Suite (Cloud Integration), or use asynchronous Event-driven communication (Event Mesh).`,
        targetOptions: ['Integration Suite', 'Event Mesh', 'Side-by-Side CAP']
      });
    }

    // Classic Dynpro UI
    if (/\bCALL\s+SCREEN\b/i.test(text) || /\bMODULE\s+[\w\/]+\s+(?:OUTPUT|INPUT)\b/i.test(text)) {
      addFinding({
        kind: 'dynpro',
        title: 'Legacy Screen Painter (Dynpro) UI Pattern',
        severity: 'Medium',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Legacy Dynpro CALL SCREEN or MODULE statement.`,
        cleanCoreImpact: 'Dynpro screens only work in SAP GUI. Modern web-based Fiori architectures require decoupled REST/OData APIs and UI5 frontend elements.',
        recommendation: `Rewrite UI as a Fiori Elements app on SAP BTP or S/4HANA, backed by a RAP OData service.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
      });
    }

    // Classic ALV Grid
    if (/REUSE_ALV_GRID_DISPLAY/i.test(text) || /REUSE_ALV_LIST_DISPLAY/i.test(text)) {
      addFinding({
        kind: 'classic-alv',
        title: 'Legacy ALV Grid Display',
        severity: 'Medium',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Usage of REUSE_ALV function modules.`,
        cleanCoreImpact: 'ALV displays render in SAP GUI and cannot be accessed via web browsers or Fiori Launchpad natively.',
        recommendation: `Replace with a modern Fiori Elements List Report backed by OData API (RAP).`,
        targetOptions: ['Developer Extensibility / RAP']
      });
    }

    // GUI Download / Local File access
    if (/GUI_DOWNLOAD/i.test(text) || /GUI_UPLOAD/i.test(text) || /CL_GUI_FRONTEND_SERVICES/i.test(text)) {
      addFinding({
        kind: 'gui-download',
        title: 'Legacy Frontend File Upload/Download',
        severity: 'Medium',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Usage of GUI_DOWNLOAD, GUI_UPLOAD, or cl_gui_frontend_services to interact with the local client file system.`,
        cleanCoreImpact: 'Frontend services require SAP GUI connection and client-side integration. Web browsers block direct local file system access for security.',
        recommendation: `Replace with modern UI5 file upload elements, or persist files in SAP BTP Document Service / Cloud Storage.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
      });
    }

    // Native SQL
    if (/EXEC\s+SQL/i.test(text)) {
      addFinding({
        kind: 'native-sql',
        title: 'Legacy Native SQL (EXEC SQL)',
        severity: 'Critical',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `EXEC SQL block detected. Direct database bypass.`,
        cleanCoreImpact: 'Native SQL bypasses database abstraction, creates hard database vendor locks, and fails completely in SAP S/4HANA Cloud (Public Edition).',
        recommendation: `Rewrite database queries using standard Open SQL (ABAP SQL) or CDS views.`,
        targetOptions: ['Developer Extensibility / RAP']
      });
    }

    // Update Task / Asynchronous V2 Updates
    if (/\bIN\s+UPDATE\s+TASK\b/i.test(text)) {
      addFinding({
        kind: 'update-task',
        title: 'Asynchronous Update Task (IN UPDATE TASK)',
        severity: 'High',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `CALL FUNCTION ... IN UPDATE TASK.`,
        cleanCoreImpact: 'Traditional SAP LUW V2 updates are incompatible with strict Cloud transactional models and block side-by-side transition.',
        recommendation: `Refactor to modern RAP Behavior Definition (draft handling) or use event-driven background processing.`,
        targetOptions: ['Developer Extensibility / RAP', 'Event Mesh']
      });
    }

    // Program coupling (SUBMIT)
    if (/\bSUBMIT\b[\s\S]+?\bAND\s+RETURN\b/i.test(text) || /^\s*SUBMIT\b/i.test(text)) {
      addFinding({
        kind: 'submit',
        title: 'Legacy Program Coupling via SUBMIT',
        severity: 'Medium',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `SUBMIT statement calling another report dynamically.`,
        cleanCoreImpact: 'SUBMIT couples separate programs tightly in runtime memory, making modularization and test coverage highly difficult.',
        recommendation: `Refactor the called logic into reusable helper classes or release it as a background job via Application Jobs.`,
        targetOptions: ['Developer Extensibility / RAP']
      });
    }

    // Authority Checks
    if (/\bAUTHORITY-CHECK\b/i.test(text)) {
      addFinding({
        kind: 'authority-check',
        title: 'Authorization Check (AUTHORITY-CHECK)',
        severity: 'Info',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `AUTHORITY-CHECK statement.`,
        cleanCoreImpact: 'Security logic to preserve. Security configuration needs to be mapped to the new authorization concept (IAM business roles in cloud).',
        recommendation: `Retain check, but map the authorization object to a corresponding IAM app descriptor in S/4HANA Cloud.`,
        targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility']
      });
    }

    // Transaction boundaries (COMMIT WORK)
    if (/\bCOMMIT\s+WORK\b/i.test(text)) {
      addFinding({
        kind: 'commit-work',
        title: 'Explicit Transaction Boundary (COMMIT WORK)',
        severity: 'Medium',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `COMMIT WORK statement.`,
        cleanCoreImpact: 'Explicit commits break the transactional safety of modern frameworks like RAP (which handles commits orchestrally).',
        recommendation: `Remove explicit COMMIT WORK and let the framework (RAP save sequence) or BTP API broker handle the transaction boundary.`,
        targetOptions: ['Developer Extensibility / RAP']
      });
    }

    // Hardcoded environmental values
    if (/(?:['"](?:C:\\|PRD|CLNT|SYS|HTTP:\/\/|HTTPS:\/\/))/i.test(text) && !/AIzaSy/i.test(text)) {
      addFinding({
        kind: 'hardcoded-value',
        title: 'Hardcoded Environmental Parameter',
        severity: 'High',
        confidence: 'Medium',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Hardcoded file paths, system IDs, or URLs detected.`,
        cleanCoreImpact: 'Hardcoding system configuration makes applications non-portable and forces code changes when deploying across stages (Dev/Stg/Prd).',
        recommendation: `Externalize configurations using SAP Destination Service, BTP Environment Variables, or Custom Configuration Tables.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP', 'Integration Suite']
      });
    }

    // SAPOffice legacy mailing
    if (/SO_NEW_DOCUMENT_SEND_API1/i.test(text)) {
      addFinding({
        kind: 'unreleased-api',
        title: 'Legacy Mail Service (SO_NEW_DOCUMENT_SEND_API1)',
        severity: 'Medium',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Usage of legacy SAPOffice mail API.`,
        cleanCoreImpact: 'Classic SAPOffice APIs are unreleased and deprecated in S/4HANA Cloud.',
        recommendation: `Migrate to modern BCS (Business Communication Services) APIs, SAP Alert Notification Service, or BTP Email Broker.`,
        targetOptions: ['Developer Extensibility / RAP', 'Integration Suite']
      });
    }
  }

  // Calculate counts for summary
  const summary = {
    criticalCount: findings.filter(f => f.severity === 'Critical').length,
    highCount: findings.filter(f => f.severity === 'High').length,
    mediumCount: findings.filter(f => f.severity === 'Medium').length,
    lowCount: findings.filter(f => f.severity === 'Low').length,
    infoCount: findings.filter(f => f.severity === 'Info').length,
  };

  return { findings, summary };
}

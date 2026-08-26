import { tokenize } from './declaration-parser';
import { SAP_API_CATALOG_VERSION } from './sap-api-catalog';
import { MERGED_TABLE_MAP, getMergedCatalogVersion, hasNoReleasedApiPath } from './catalog-service';

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
  | 'legacy-mail'
  | 'credit-management'
  | 'batch-input'
  | 'business-rule'
  | 'enhancement'
  | 'modification';

export type EvidenceSource = 'static-parser' | 'catalog-match' | 'llm-narrative';

export interface EvidenceFinding {
  id: string;
  kind: EvidenceKind;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  confidence: 'High' | 'Medium' | 'Low';
  source: EvidenceSource;
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
    confidence: 'Catalog Match' | 'Verified' | 'Candidate' | 'Needs Validation';
    catalogVersion?: string;
  };
  /** Set when a finding requires explicit business/architect decision */
  needsBusinessDecision?: boolean;
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

// Layered catalog: curated entries win, SAP Cloudification Repository underneath.
const STANDARD_TABLE_MAP = MERGED_TABLE_MAP;

/**
 * Resolves ABAP CONSTANTS declarations to their literal values.
 * e.g. `CONSTANTS c_tcode_va02 VALUE 'VA02'` → { 'C_TCODE_VA02': 'VA02' }
 */
function resolveConstants(code: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /CONSTANTS\s+(\w+).*?VALUE\s+'([^']+)'/gi;
  let m;
  while ((m = re.exec(code)) !== null) {
    map[m[1].toUpperCase()] = m[2];
  }
  return map;
}

export function buildAbapEvidence(code: string, fileName: string, deployment?: 'public' | 'private'): AbapEvidenceReport {
  const findings: EvidenceFinding[] = [];
  const statements = tokenize(code);
  let idCounter = 1;
  const constantsMap = resolveConstants(code);
  const isPublicCloud = deployment === 'public';

  const FAKE_TABLES = new Set([
    'MODE', 'TASK', 'RISK', 'SCREEN', 'LINE', 'TABLE', 'INTO', 'FROM',
    'CORRESPONDING', 'DATA', 'ADJACENT', 'RESULT', 'CONNECTION', 'TYPE',
    'INDEX', 'UP', 'TO', 'ROWS', 'WHERE', 'AND', 'OR', 'NOT', 'NULL',
    'IS', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'OUTER', 'INNER',
    'FULL', 'CROSS', 'USING', 'CLIENT', 'SPECIFIED', 'SYSTEM', 'VALUES',
    'SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'FOR', 'ALL',
    'ENTRIES', 'BY', 'ORDER', 'GROUP', 'HAVING'
  ]);

  const addFinding = (finding: Omit<EvidenceFinding, 'id' | 'source'> & { source?: EvidenceSource }) => {
    findings.push({
      ...finding,
      id: `CC-${String(idCounter++).padStart(3, '0')}`,
      // Default source: 'static-parser' for all scanner findings.
      // Upgraded to 'catalog-match' when a sapReplacement is present.
      source: finding.source || (finding.sapReplacement ? 'catalog-match' : 'static-parser'),
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
            confidence: 'Catalog Match',
            catalogVersion: getMergedCatalogVersion()
          } : undefined
        });
      } else {
        addFinding({
          kind: 'standard-table-read',
          title: `Direct Read from SAP Standard Table ${table}`,
          severity: isPublicCloud ? 'High' : 'Medium',
          confidence: 'High',
          objectName: table,
          objectType: 'Database Table',
          lineStart: line,
          snippet: text,
          technicalDetail: `Direct SELECT statement on standard SAP table ${table}.${isPublicCloud ? ' In Public Cloud this is a hard break — no direct table access allowed.' : ' In Private Cloud this creates upgrade risk that can be mitigated with Tier 2 wrappers.'}`,
          cleanCoreImpact: isPublicCloud
            ? 'In SAP S/4HANA Public Cloud, direct reads on standard tables are strictly forbidden. The system will reject custom code accessing unreleased objects.'
            : 'Direct read access to standard SAP tables couples custom code to SAP data models, creating upgrade dependencies. In Private Cloud, Tier 2 wrappers can mitigate this.',
          recommendation: `Replace with released CDS views (e.g. I_ views) or official APIs.`,
          targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility'],
          sapReplacement: hasReplacement ? {
            objectName: STANDARD_TABLE_MAP[table].view,
            objectType: STANDARD_TABLE_MAP[table].type,
            confidence: 'Catalog Match',
            catalogVersion: getMergedCatalogVersion()
          } : {
            objectName: `I_${table}`,
            objectType: 'CDS View',
            confidence: 'Candidate',
            catalogVersion: getMergedCatalogVersion()
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
        kind: 'legacy-mail',
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

    // Credit Management custom logic
    if (/Z_CREDIT|CREDIT.*EXPOSURE|CREDIT.*RISK|FSCM/i.test(text) && /CALL\s+FUNCTION/i.test(text)) {
      addFinding({
        kind: 'credit-management',
        title: `Credit Management Custom Logic`,
        severity: 'High',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Custom credit management function module detected. Evaluate if SAP FSCM / Advanced Credit Management (F1007) can replace this custom risk engine.`,
        cleanCoreImpact: 'Custom credit/risk engines duplicate functionality that SAP Financial Supply Chain Management (FSCM) provides as standard. Maintaining custom logic increases TCO and blocks cloud migration.',
        recommendation: `Evaluate if SAP FSCM / Advanced Credit Management (F1007) covers this use case. If standard coverage is insufficient, implement remaining gap as a Side-by-Side microservice on SAP BTP.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP'],
        needsBusinessDecision: true
      });
    }

    // -- 3. Enhancement & modification technologies --
    // SAP's clean core level concept turns on WHICH extension technology was
    // used, and the ATC check "Allowed Enhancement Technologies" is built on
    // that. Enhancement implementations and enhancement points are
    // not-recommended technologies (level D); BAdIs are SAP-provided classic
    // extension points and stay usable (level B).

    // Enhancement implementation: ENHANCEMENT <n> <name>. ... ENDENHANCEMENT.
    const enhImpl = text.match(/^ENHANCEMENT\s+(?:\d+\s+)?([\w\/]+)/i);
    if (enhImpl && !/^ENHANCEMENT-(POINT|SECTION)/i.test(text)) {
      addFinding({
        kind: 'enhancement',
        title: `Enhancement implementation ${enhImpl[1].toUpperCase()}`,
        severity: 'High',
        confidence: 'High',
        objectName: enhImpl[1].toUpperCase(),
        objectType: 'Enhancement Implementation',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `ENHANCEMENT block injecting custom code into an SAP object via the Enhancement Framework.`,
        cleanCoreImpact: 'Enhancement implementations run inside SAP code and are a not-recommended technology under the clean core level concept (level D). SAP can change the enhanced code at any upgrade, and ABAP Cloud does not allow them.',
        recommendation: `Replace with a released SAP extension point: a BAdI where SAP provides one, otherwise a released API called from an ABAP Cloud (RAP) or side-by-side (CAP) extension.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
      });
    }

    // Explicit and implicit enhancement points / sections
    const enhPoint = text.match(/^ENHANCEMENT-(POINT|SECTION)\s+([\w\/]+)/i);
    if (enhPoint) {
      const kindWord = enhPoint[1].toLowerCase();
      addFinding({
        kind: 'enhancement',
        title: `Enhancement ${kindWord} ${enhPoint[2].toUpperCase()}`,
        severity: 'High',
        confidence: 'High',
        objectName: enhPoint[2].toUpperCase(),
        objectType: kindWord === 'point' ? 'Enhancement Point' : 'Enhancement Section',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `ENHANCEMENT-${enhPoint[1].toUpperCase()} declaration — an anchor for custom code inside SAP's own program flow.`,
        cleanCoreImpact: 'Enhancement points and sections tie custom logic to SAP internals that carry no stability contract. They are a not-recommended technology under the clean core level concept (level D).',
        recommendation: `Check whether SAP offers a released BAdI or extension point for this scenario; if not, move the logic out to a released-API-based extension.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
      });
    }

    // BAdI usage — SAP's own classic extension point. Reportable, not a blocker.
    const badi = text.match(/\b(GET|CALL)\s+BADI\s+([\w\/]+)/i);
    if (badi) {
      addFinding({
        kind: 'enhancement',
        title: `BAdI usage ${badi[2].toUpperCase()}`,
        severity: 'Low',
        confidence: 'High',
        objectName: badi[2].toUpperCase(),
        objectType: 'BAdI',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Business Add-In accessed via ${badi[1].toUpperCase()} BADI.`,
        cleanCoreImpact: 'BAdIs are SAP-provided classic extension points. Under the clean core level concept they qualify as level B — acceptable where no released ABAP Cloud alternative exists, but they do not reach level A.',
        recommendation: `Keep the BAdI, and check whether SAP has since published a released ABAP Cloud extension point or API for the same scenario — that would move the extension from level B to level A.`,
        targetOptions: ['Developer Extensibility / RAP']
      });
    }

    // Classic exit handler — the pre-Enhancement-Framework way into SAP code.
    if (/\bCL_EXITHANDLER\s*=>\s*GET_INSTANCE\b/i.test(text)) {
      addFinding({
        kind: 'enhancement',
        title: 'Classic exit handler (CL_EXITHANDLER=>GET_INSTANCE)',
        severity: 'Medium',
        confidence: 'High',
        objectName: 'CL_EXITHANDLER',
        objectType: 'Classic BAdI Handler',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Classic BAdI instantiation through CL_EXITHANDLER=>GET_INSTANCE.`,
        cleanCoreImpact: 'The classic exit handler predates the Enhancement Framework and is not available in ABAP Cloud. It signals an older extension that needs re-pointing.',
        recommendation: `Migrate to the new BAdI (GET BADI / enhancement spot) or, where SAP provides one, to a released API.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
      });
    }
  }

  // -- 4. Core modifications --
  // Modification markers are full-line comments, which tokenize() drops by
  // design (see declaration-parser.ts). They are therefore scanned against the
  // raw source rather than the statement stream — without this pass the single
  // most severe clean core violation would be invisible to the engine.
  const rawLines = code.split(/\r?\n/);
  const MOD_MARKER = /^\s*[*"]\{\s*(INSERT|REPLACE|DELETE)\b(.*)$/i;
  const seenModifications = new Set<string>();
  for (let i = 0; i < rawLines.length; i++) {
    const m = rawLines[i].match(MOD_MARKER);
    if (!m) continue;
    const action = m[1].toUpperCase();
    // The marker carries the transport request that registered the modification.
    const requestMatch = m[2].match(/([A-Z0-9]{3}K\d{6})/i);
    const request = requestMatch ? requestMatch[1].toUpperCase() : '';
    // One finding per modification, not one per marker line (each block has an
    // opening and a closing marker carrying the same request).
    const dedupKey = request ? `${action}:${request}` : `${action}:${i}`;
    if (seenModifications.has(dedupKey)) continue;
    seenModifications.add(dedupKey);

    addFinding({
      kind: 'modification',
      title: `Core modification (${action}${request ? ` · ${request}` : ''})`,
      severity: 'Critical',
      confidence: 'High',
      objectName: request || fileName,
      objectType: 'Modification',
      lineStart: i + 1,
      snippet: rawLines[i].trim(),
      technicalDetail: `Modification marker — SAP standard code was changed under a repair/modification transport${request ? ` (${request})` : ''}.`,
      cleanCoreImpact: 'A core modification is the most severe clean core violation: level D. It has to be adjusted manually in SPAU at every upgrade, and it is impossible in SAP S/4HANA Cloud.',
      recommendation: `Remove the modification and reimplement the requirement through a released extension point or API. Reset the object to SAP standard via SPAU once the replacement is live.`,
      targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP', 'Retire'],
      needsBusinessDecision: true
    });
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

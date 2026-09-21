import { tokenize } from './declaration-parser';
import { SAP_API_CATALOG_VERSION } from './sap-api-catalog';
import { MERGED_TABLE_MAP, getMergedCatalogVersion, hasNoReleasedApiPath, getSapObjectStates } from './catalog-service';

import { assessCoverage, type CoverageReport } from './coverage';
import { readTableDependencies, type DependencyRoute, type TableDependency } from './table-dependencies';
import { maskLiterals } from './statement-reader';

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
  /**
   * What the detectors did not judge. Sits beside `findings` rather than inside
   * it: an unassessed construct is a limit of the question, not a defect in the
   * answer. Without it an empty `findings` array is indistinguishable from a
   * clean program, which is how two starter examples came to be presented as
   * spotless while calling BAPIs and writing files.
   */
  coverage: CoverageReport;
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
 * Where a successor name came from, said out loud rather than flattened.
 *
 * `MERGED_TABLE_MAP` is two layers. The repository layer is SAP's own published
 * release data and knows the successor it names; the curated layer in
 * `sap-api-catalog.ts` is field-level knowledge written by hand, and
 * `buildMerged()` lets it win. Both are useful. Only one of them is a lookup.
 *
 * This used to stamp every replacement `'Catalog Match'` and hang SAP's catalog
 * version next to it, which turned a hand-written pairing into something that
 * read as a citation — `VBAK -> API_SALES_ORDER_SRV` presented as SAP's answer
 * when SAP's answer is `I_SALESDOCUMENT`. A test even pinned the behaviour
 * ("should produce Catalog Match instead of Verified"), so it was a decision
 * rather than an oversight; it was the wrong one.
 *
 * `'Verified'` is not a downgrade in usefulness — a curated OData mapping is
 * often the more practical target. It is only a downgrade in provenance, and the
 * catalog version goes with it, because that version identifies SAP's data and
 * nothing else.
 */
function replacementProvenance(entry: { confidence?: string } | undefined): {
  confidence: 'Catalog Match' | 'Verified';
  catalogVersion?: string;
} {
  const fromSapData = entry?.confidence === 'sap-official';
  return fromSapData
    ? { confidence: 'Catalog Match', catalogVersion: getMergedCatalogVersion() }
    : { confidence: 'Verified' };
}

/**
 * Conventional ABAP prefixes for local/global data objects and parameters.
 * Used only in combination with "not present in either SAP artifact" — 103 real
 * SAP objects (CS_BOM_EXPL_MAT_V2, RS_*, CT_*) share these prefixes and must
 * stay detectable.
 */
const LOCAL_NAME_PREFIX = /^(?:L[TSVORXD]_|G[TSVOR]_|[EIC][TSV]_|R[TSV]_|ME_|MO_|MT_|MS_|MV_)/;

/**
 * One sentence on how the table was reached, where it was not written in an
 * ABAP SQL statement. The finding is the same finding — a direct read is a
 * direct read whether a macro, a constant or a logical database carries it
 * (R02: "der Schreibweg ändert den Effekt nicht") — but a reader looking for
 * `SELECT … FROM kna1` in the quoted line would not find it without this.
 */
const ROUTE_NOTE: Partial<Record<DependencyRoute, string>> = {
  'dynamic-sql': ' The table is named in a dynamic token whose value is a constant in this source.',
  macro: ' The statement stands in a macro body; this is the call site that expands it.',
  adbc: ' The table is named in SQL text executed through ADBC (CL_SQL_STATEMENT), which bypasses ABAP SQL.',
  'logical-database': ' The rows are read by a logical database (GET); the SELECT runs there, not in this source.',
};

export function buildAbapEvidence(code: string, fileName: string, deployment?: 'public' | 'private'): AbapEvidenceReport {
  const findings: EvidenceFinding[] = [];
  const statements = tokenize(code);
  let idCounter = 1;
  const isPublicCloud = deployment === 'public';

  // Which tables each statement reads or writes — one reading, shared with the
  // data coupling (`table-dependencies.ts`). A type reference is a dependency
  // but no access, and a possible target of an unresolved dynamic name is not
  // an access either (R26): neither becomes a finding here.
  const dependencies = readTableDependencies(code);
  const accessesAt = new Map<number, TableDependency[]>();
  for (const dependency of dependencies.dependencies) {
    if (dependency.access === 'reference' || dependency.possibleTargetOf) continue;
    accessesAt.set(dependency.statement, [...(accessesAt.get(dependency.statement) ?? []), dependency]);
  }
  const adbcAt = new Set(dependencies.adbc.map((execution) => execution.statement));

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

  const processTableAccess = (tableName: string, isWrite: boolean, line: number, text: string, route: DependencyRoute) => {
    const table = tableName.toUpperCase().trim();
    if (!table || table.length < 2 || FAKE_TABLES.has(table) || /^\d/.test(table)) return;
    // A name declared in this source is a variable, not a database table —
    // `readTableDependencies` has already asked the declarations, the same ones
    // the data coupling asks.
    const routeNote = ROUTE_NOTE[route] ?? '';

    const sapStates = getSapObjectStates(table);
    const knownToSap = Boolean(sapStates.releaseState || sapStates.classificationState);
    // Conventional ABAP local-data prefix AND unknown to SAP → a variable whose
    // declaration this upload does not contain (a common case with partial code).
    if (!knownToSap && LOCAL_NAME_PREFIX.test(table)) return;

    // An object SAP has released is the target state, not a violation. Reporting
    // `SELECT FROM i_salesorder` as an illegal standard-table read told architects
    // that the correct ABAP Cloud pattern was a finding.
    //
    // The exemption is the *read*, because that is the use the release contract
    // covers. SAP releases a data object to be selected from; no release state
    // says a customer may modify SAP's rows directly. Applied to writes as well,
    // this line deleted the Critical finding for a direct mutation of an SAP
    // table — the most severe access the engine reports — on the strength of a
    // permission for a different operation (QA review of b88c77b, ac5a65eb53ff /
    // 79705bbe66be).
    if (!isWrite && sapStates.releaseState === 'released') return;

    // A reserved-namespace table SAP does not list is of unknown provenance —
    // more likely a partner or customer object than SAP standard. Calling it a
    // standard SAP table produced a Critical finding on someone else's table.
    const isCustom =
      table.startsWith('Z') ||
      table.startsWith('Y') ||
      (!knownToSap && /^\/[^/]+\//.test(table));
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
          technicalDetail: `Direct modification statement (INSERT/UPDATE/MODIFY/DELETE) on custom table ${table}.${routeNote}`,
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
          technicalDetail: `SELECT statement reading from custom table ${table}.${routeNote}`,
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
          technicalDetail: `Direct modification statement on standard SAP table ${table}.${routeNote}${sapStates.releaseState === 'released' ? ' SAP has released this object — for use, which is the read. The release carries no permission to write its rows directly.' : ''}`,
          cleanCoreImpact: 'Directly modifying standard SAP tables destroys system integrity, invalidates SAP guarantees, and blocks upgrades completely.',
          recommendation: `REPLACE IMMEDIATELY with official SAP released APIs (OData APIs, BAPIs) or RAP actions. Do NOT perform direct writes in S/4HANA.`,
          targetOptions: ['Developer Extensibility / RAP', 'Integration Suite'],
          sapReplacement: hasReplacement ? {
            objectName: STANDARD_TABLE_MAP[table].view,
            objectType: STANDARD_TABLE_MAP[table].type,
            ...replacementProvenance(STANDARD_TABLE_MAP[table]),
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
          technicalDetail: `Direct SELECT statement on standard SAP table ${table}.${routeNote}${isPublicCloud ? ' In Public Cloud this is a hard break — no direct table access allowed.' : ' In Private Cloud this creates upgrade risk that can be mitigated with Tier 2 wrappers.'}`,
          cleanCoreImpact: isPublicCloud
            ? 'In SAP S/4HANA Public Cloud, direct reads on standard tables are strictly forbidden. The system will reject custom code accessing unreleased objects.'
            : 'Direct read access to standard SAP tables couples custom code to SAP data models, creating upgrade dependencies. In Private Cloud, Tier 2 wrappers can mitigate this.',
          recommendation: `Replace with released CDS views (e.g. I_ views) or official APIs.`,
          targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility'],
          sapReplacement: hasReplacement ? {
            objectName: STANDARD_TABLE_MAP[table].view,
            objectType: STANDARD_TABLE_MAP[table].type,
            ...replacementProvenance(STANDARD_TABLE_MAP[table]),
          } : undefined // never guess a successor name: `I_${table}` invented objects that do not exist
        });
      }
    }
  };

  statements.forEach((stmt, statementIndex) => {
    const text = stmt.text.trim();
    if (!text) return;
    /**
     * The same statement with the inside of every literal blanked — what it
     * *executes*, as opposed to what it says.
     *
     * `tokenize` drops comments and keeps literals, so until now
     * `DATA message TYPE string VALUE 'CALL TRANSACTION VA01'.` produced a High
     * BDC finding and `DATA(m) = |EXEC SQL …|` a Critical native-SQL one, on
     * programs that call no transaction and execute no native SQL (QA review of
     * b88c77b, 18e7f9c0a67e / 42f234fcae8d / 8dcf89e31a32 / 9b1698637a1d). The
     * rule is the one `statement-reader.ts` already states: a literal is text,
     * not code.
     *
     * **Which detectors may not use it.** The exception that module documents
     * applies here too — the name in `CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'`
     * is the call target and lives in a literal, and the hardcoded-value
     * detector exists to look inside one. Those keep `text`, and say so at the
     * line where they do it. Operands are read from `text` for the same reason:
     * the transaction code and the function-module name are literal contents.
     */
    const codeText = maskLiterals(text);

    // -- 1. Table Accesses --
    // Read by `readTableDependencies`, the one reader of `SELECT … FROM`, the
    // DML statements, dynamic targets a constant closes, macro call sites, ADBC
    // SQL text and logical-database reads. The internal-table forms of INSERT,
    // MODIFY and DELETE are told apart there (`open-sql-discrimination.ts`).
    for (const access of accessesAt.get(statementIndex) ?? []) {
      processTableAccess(access.table, access.access === 'write', access.line, access.snippet, access.route);
    }

    // -- 2. Legacy Pattern Detections --

    // Batch Data Communication (BDC)
    if (/\bCALL\s+TRANSACTION\b/i.test(codeText)) {
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
    if (/\bCALL\s+FUNCTION\b[\s\S]+?\bDESTINATION\b/i.test(codeText)) {
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
    if (/\bCALL\s+SCREEN\b/i.test(codeText) || /\bMODULE\s+[\w\/]+\s+(?:OUTPUT|INPUT)\b/i.test(codeText)) {
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

    // Classic ALV Grid. The name of a called function module stands in a
    // literal and is the call target, not prose about one — the exception
    // `statement-reader.ts` documents. So this reads `text`, not `codeText`.
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

    // GUI Download / Local File access. Function-module names again (`text`,
    // for the reason above); `CL_GUI_FRONTEND_SERVICES` is the class form.
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
    if (/EXEC\s+SQL/i.test(codeText)) {
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
    } else if (adbcAt.has(statementIndex)) {
      // ADBC is native SQL without the keyword: `lo_stmt->execute_update( lv_sql )`
      // hands its text to the database as it stands (R13b, role a). The pattern
      // above looked for `EXEC SQL` and nothing else, so a program writing KNA1
      // through CL_SQL_STATEMENT produced one finding — its COMMIT WORK (CC-034).
      addFinding({
        kind: 'native-sql',
        title: 'Native SQL through ADBC (CL_SQL_STATEMENT)',
        severity: 'Critical',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `ADBC call that executes SQL text on the database connection. The text is interpreted SQL, not ABAP SQL: no table buffering, no automatic client handling, no syntax check at compile time.`,
        cleanCoreImpact: 'Native SQL bypasses database abstraction, creates hard database vendor locks, and fails completely in SAP S/4HANA Cloud (Public Edition).',
        recommendation: `Rewrite the statement in ABAP SQL against released CDS views, or call a released API for the write.`,
        targetOptions: ['Developer Extensibility / RAP']
      });
    }

    // Update Task / Asynchronous V2 Updates
    if (/\bIN\s+UPDATE\s+TASK\b/i.test(codeText)) {
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
    if (/\bSUBMIT\b[\s\S]+?\bAND\s+RETURN\b/i.test(codeText) || /^\s*SUBMIT\b/i.test(codeText)) {
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
    if (/\bAUTHORITY-CHECK\b/i.test(codeText)) {
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
    if (/\bCOMMIT\s+WORK\b/i.test(codeText)) {
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

    // A credential in the source, reported as one.
    //
    // The detector below used to carry `&& !/AIzaSy/i.test(text)` — an exclusion
    // for the prefix of a Google API key. A statement holding a hardcoded Google
    // key and a hardcoded path therefore produced *no* finding at all: the one
    // literal that is unambiguously a secret was the one that silenced the
    // detector (security audit of b88c77b, SEC-b88c77b-148's neighbour
    // SEC-b88c77b-36, verified at the line on 21.09.2026). A key in ABAP source
    // is worse than a hostname in ABAP source, so it gets its own finding and
    // the higher severity, and the hardcoded-value detector below no longer
    // looks away.
    if (/\bAIzaSy[0-9A-Za-z_-]{20,}/.test(text)) {
      addFinding({
        kind: 'hardcoded-value',
        title: 'Hardcoded API key in the source',
        severity: 'Critical',
        confidence: 'High',
        objectName: fileName,
        objectType: 'Credential',
        lineStart: stmt.line,
        // The key itself is never echoed: the anchor says where to look, and a
        // report that quotes a secret spreads it to everyone the report reaches.
        snippet: 'A Google API key literal is present at this line. Its value is deliberately not reproduced here.',
        technicalDetail: 'The statement contains a literal in the shape of a Google API key (AIzaSy…).',
        cleanCoreImpact: 'A credential in transportable source travels with every copy of the program, every export and every backup. It cannot be rotated by changing a system setting, and it is readable by anyone who can read the code.',
        recommendation: 'Remove the key from the source and treat it as compromised: rotate it, then read it at runtime from a secure store rather than from a literal.',
        targetOptions: ['Developer Extensibility / RAP'],
      });
    }

    // Hardcoded environmental values — the one detector whose subject *is* the
    // content of a literal, so it reads `text` on purpose.
    if (/(?:['"](?:C:\\|PRD|CLNT|SYS|HTTP:\/\/|HTTPS:\/\/))/i.test(text)) {
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

    // SAPOffice legacy mailing — a function-module name, read from `text`.
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

    // Credit Management custom logic — the module name is a literal, so `text`.
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
    const enhImpl = codeText.match(/^ENHANCEMENT\s+(?:\d+\s+)?([\w\/]+)/i);
    if (enhImpl && !/^ENHANCEMENT-(POINT|SECTION)/i.test(codeText)) {
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
    const enhPoint = codeText.match(/^ENHANCEMENT-(POINT|SECTION)\s+([\w\/]+)/i);
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
    const badi = codeText.match(/\b(GET|CALL)\s+BADI\s+([\w\/]+)/i);
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
    if (/\bCL_EXITHANDLER\s*=>\s*GET_INSTANCE\b/i.test(codeText)) {
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
  });

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

  return { findings, coverage: assessCoverage(code), summary };
}

/**
 * ABAP Code Assessment Engine (v1.9.0)
 *
 * Extracts code inventory items, database table coupling, and computes
 * complexity / business-criticality scores from raw ABAP source code.
 */

import type { CodeInventoryItem, DataCouplingEntry } from '@/lib/types';
import { readTableDependencies, type DependencyRoute } from './table-dependencies';
import { maskComments, maskNonCode } from './statement-reader';

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

    // INCLUDE — the program include. `INCLUDE STRUCTURE kna1` and `INCLUDE TYPE`
    // are dictionary statements inside a TYPES block, and reading them here put
    // an object called STRUCTURE in the inventory (R29: not v1-R16's missing
    // include). The dependency they carry is a table dependency and is read by
    // `table-dependencies.ts`.
    const includeMatch = trimmed.match(/^INCLUDE\s+(?!STRUCTURE\b|TYPE\b)([\w]+)/);
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
 *
 * Which tables, and how, is read by `readTableDependencies` — the reader the
 * evidence engine uses too, so the two surfaces cannot disagree about whether
 * `gt_bp_data` is a table (it is a variable declared in the source) or whether
 * `FROM (lc_tab)` reads KNA1 (it does, `lc_tab` is a constant). This function
 * only aggregates: one entry per table, with its reads, writes and references.
 *
 * Two kinds of entry are new with 2.11 and both say what they are:
 *
 *   - `accessType: 'Reference'` — a dependency on the table's definition
 *     without a row read or written here (`TABLES`, `TYPE`, `INCLUDE
 *     STRUCTURE`, a logical-database node, another program's global field).
 *   - `possibleTargetOf` — the name is only a value a dynamic target may take
 *     (a DEFAULT), never the resolved dependency (R26). The dynamic statement
 *     itself is reported where an unresolved question belongs: as an unassessed
 *     construct in the coverage.
 */
export function extractDataCoupling(code: string): DataCouplingEntry[] {
  const entries: DataCouplingEntry[] = [];

  interface TableStats {
    tableName: string;
    reads: number;
    writes: number;
    references: number;
    /** Occurrences that are the table itself rather than a possible target. */
    known: number;
    possibleTargetOf: Set<string>;
    routes: Set<DependencyRoute>;
    programs: Set<string>;
    lineNumbers: number[];
    snippets: string[];
  }

  const statsMap = new Map<string, TableStats>();

  for (const dependency of readTableDependencies(code).dependencies) {
    let stats = statsMap.get(dependency.table);
    if (!stats) {
      stats = {
        tableName: dependency.table,
        reads: 0,
        writes: 0,
        references: 0,
        known: 0,
        possibleTargetOf: new Set(),
        routes: new Set(),
        programs: new Set(),
        lineNumbers: [],
        snippets: [],
      };
      statsMap.set(dependency.table, stats);
    }
    if (dependency.access === 'write') stats.writes++;
    else if (dependency.access === 'read') stats.reads++;
    else stats.references++;
    if (dependency.possibleTargetOf) stats.possibleTargetOf.add(dependency.possibleTargetOf);
    else stats.known++;
    stats.routes.add(dependency.route);
    if (dependency.program) stats.programs.add(dependency.program);
    if (!stats.lineNumbers.includes(dependency.line)) {
      stats.lineNumbers.push(dependency.line);
      stats.snippets.push(dependency.snippet);
    }
  }

  // Convert map to entries
  for (const [tableName, stats] of statsMap) {
    const hasRead = stats.reads > 0;
    const hasWrite = stats.writes > 0;
    const isCustom = tableName.startsWith('Z') || tableName.startsWith('Y');
    /**
     * Who owns the table, asked separately from whether this file happens to
     * carry replacement guidance for it.
     *
     * `isStandard` used to mean "is in `STANDARD_TABLE_MAP`", which made the
     * risk of a write depend on whether someone had typed a successor into a
     * 25-entry map: `UPDATE acdoca` — a write straight into the S/4HANA
     * universal journal — came back Medium, one step below the same write to
     * VBAK, and the `isStandard` recommendation branch below it was
     * unreachable (QA review of b88c77b, 92e75580c745 / 4862a73a2121 /
     * da845198acc9 / 451f13d1c004).
     *
     * Three answers, not two. A reserved-namespace name (`/ACME/T_ORDER`) can
     * belong to SAP, to a partner or to the customer, and the name alone does
     * not say which — the rule `evidence-model.ts` and
     * `abcd-classification.ts` already apply. It is therefore neither custom
     * nor standard here, and nothing downstream may read it as either
     * (e955a181ba42). The catalog would answer it, and cannot be asked: this
     * module is imported by `analyze/page.tsx`, a client component, and
     * `catalog-service.ts` carries four megabytes of generated JSON.
     */
    const isNamespaced = /^\/[^/]+\//.test(tableName);
    const isStandard = !isCustom && !isNamespaced;
    const hasReplacement = STANDARD_TABLE_MAP[tableName] !== undefined;
    const referenceOnly = !hasRead && !hasWrite;
    const possibleOnly = stats.known === 0;

    let accessType: DataCouplingEntry['accessType'] = 'Reference';
    if (hasRead && hasWrite) accessType = 'Read/Write';
    else if (hasWrite) accessType = 'Write';
    else if (hasRead) accessType = 'Read';

    let riskLevel: 'High' | 'Medium' | 'Low' = 'Low';
    if (hasWrite && isStandard) riskLevel = 'High';
    else if (hasWrite && isCustom) riskLevel = 'High';
    else if (hasWrite) riskLevel = 'Medium';
    else if (hasRead && isStandard) riskLevel = 'Medium';

    let recommendation = '';
    let replacementConfidence: 'Catalog Match' | 'Verified' | 'Candidate' | 'Needs Validation' = 'Needs Validation';
    if (referenceOnly) {
      recommendation = referenceRecommendation(tableName, stats.routes, stats.programs);
    } else if (isStandard && hasReplacement) {
      recommendation = STANDARD_TABLE_MAP[tableName];
      // Hand-written guidance in this file, not a lookup in SAP's release data.
      replacementConfidence = 'Verified';
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
    if (!referenceOnly) {
      if (stats.routes.has('logical-database')) {
        recommendation += '. Read through a logical database (GET): the SELECT runs in the logical database, and a CDS view does not replace the binding';
      }
      if (stats.routes.has('adbc')) {
        recommendation += '. Accessed in native SQL through ADBC (CL_SQL_STATEMENT)';
      }
    }
    if (possibleOnly) {
      const names = [...stats.possibleTargetOf].sort().join(', ');
      recommendation =
        `Possible target only: ${names} names the ${stats.routes.has('type-reference') ? 'type' : 'table'} at runtime, and the source shows this value for it (a DEFAULT or an assignment), which does not close what it can be. ` +
        recommendation;
      replacementConfidence = 'Needs Validation';
    }

    const via = [...stats.routes].sort();
    entries.push({
      tableName,
      accessType,
      isCustom,
      // The third answer, carried instead of left to be re-derived. A reader
      // that only has `isCustom` has no way to tell a standard table from a
      // reserved-namespace one, and `recommendArchitecture` read the
      // difference away (QA full review, 45a8a7cf4a0c).
      isStandard,
      riskLevel,
      recommendation,
      occurrences: stats.reads + stats.writes + stats.references,
      readCount: stats.reads,
      writeCount: stats.writes,
      lineNumbers: stats.lineNumbers,
      snippets: stats.snippets,
      replacementConfidence,
      ...(via.some((route) => route !== 'open-sql') ? { via } : {}),
      ...(possibleOnly ? { possibleTargetOf: [...stats.possibleTargetOf].sort() } : {}),
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

/** What a dependency without a row access asks of a migration. */
function referenceRecommendation(tableName: string, routes: Set<DependencyRoute>, programs: Set<string>): string {
  if (routes.has('program-global')) {
    const program = [...programs].sort().join(', ') || 'another program';
    return `Global data object ${tableName} of program ${program}, reached through a dynamic ASSIGN — a dependency on SAP program internals, not a database access. SAP publishes no released path into another program's memory`;
  }
  if (routes.has('logical-database') && !routes.has('type-reference')) {
    return 'Logical database node bound by NODES — rows reach the program through the logical database, not through a statement in this source';
  }
  return 'Type reference only (TABLES, TYPE, INCLUDE STRUCTURE) — no database access. A successor is at structure level (a released structure or data element), not a CDS read view';
}

/**
 * Compute a complexity score (1-10) based on code structure.
 * Scale: 1 = trivial, 5 = moderate, 10 = highly complex
 */
export function computeComplexityScore(code: string): number {
  const lines = code.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const loc = lines.length;
  const upper = code.toUpperCase();

  // Nesting depth approximation (IF/LOOP/DO/CASE/TRY blocks).
  //
  // The two sides have to read the same way round. The opener matched on a word
  // boundary, so `IF lv_x > 5. " check` counted; the closer had to be the whole
  // line, so `ENDIF. " done` did not — and the counter never came back down.
  // On the 1000-line starter example, with an inline comment on every line, the
  // deepest nesting then read 99 instead of 3 and the complexity score 10
  // instead of 9: a program scored more complex for being commented. Found by
  // the comment property in `tests/abap-metamorphic.spec.ts`, which adds an
  // inline comment to every line and asserts that nothing moves.
  let maxNesting = 0;
  let currentNesting = 0;
  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();
    if (/^(IF|LOOP|DO|CASE|TRY|WHILE)\b/.test(trimmed)) currentNesting++;
    if (/^(ENDIF|ENDLOOP|ENDDO|ENDCASE|ENDTRY|ENDWHILE)\b/.test(trimmed)) currentNesting = Math.max(0, currentNesting - 1);
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
 * The function modules a source calls by name, upper-cased.
 *
 * A function module's name stands in a literal, and that literal is the call
 * target rather than prose — the same exception `table-dependencies.ts` makes
 * for the SQL text of an ADBC call. So this reader takes the comment-free form,
 * which still carries its literals, rather than the fully masked one: a
 * commented-out call is not a call, but `CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'`
 * is an IDoc call and not a sentence about one.
 */
function calledFunctionModules(code: string): string[] {
  const source = maskComments(code).toUpperCase();
  return [...source.matchAll(/\bCALL\s+FUNCTION\s+'([\w/]+)'/g)].map((m) => m[1]);
}

/**
 * Is this function module an RFC or IDoc one, by its name?
 *
 * `RFC_READ_TABLE` and `IDOC_INPUT_ORDERS` are the two families the routing
 * below has always meant. It could never see either: the pattern was
 * `/\b(CALL\s+FUNCTION\s+'RFC|IDOC|BAPI_)\b/`, and the closing `\b` sits after
 * `RFC` and after the underscore of `BAPI_`, where the next character of a real
 * module name is a word character and no boundary exists (full review of
 * a19945ef01dc, 359639c30d77). The only alternative that ever matched was the
 * bare word `IDOC`, and the place a bare `IDOC` actually occurs is a comment.
 *
 * **`BAPI_` is deliberately not repaired into a match.** A local BAPI call is
 * not remote communication, and this engine says so where it says anything:
 * `coverage.ts` records "Only CALL FUNCTION with DESTINATION is assessed, as an
 * RFC. A local call — a BAPI among them — is not looked at." Making every
 * program that calls a BAPI locally route to Integration Suite would be a new
 * claim about those programs, decided in a regex. It belongs on the roadmap with
 * an argument, not here.
 */
function isRfcOrIdocModule(name: string): boolean {
  return /^RFC_/.test(name) || /(?:^|_)IDOC(?:_|$)/.test(name);
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
  // The architecture is decided from what the program *executes*, so comments
  // and literal contents are blanked first. `IDOC` written in a comment — a
  // developer's note about the interface a report replaced — matched the raw
  // source and routed the whole analysis to Integration with 80 % confidence
  // (full review of a19945ef01dc, 359639c30d77).
  const upper = maskNonCode(code).toUpperCase();

  // Scoring factors
  // A type reference is no write, and a possible target of an unresolved
  // dynamic name is not a table this program is known to touch (R26): neither
  // may decide the architecture.
  const known = dataCoupling.filter((d) => !d.possibleTargetOf?.length);
  //
  // Ownership has three answers (`extractDataCoupling` :219-231), and this read
  // `!d.isCustom` as "standard" — so `/ACME/T_ORDER`, a name that may belong to
  // SAP, to a partner or to the customer, counted as an SAP standard table.
  // `UPDATE /ACME/T_ORDER` therefore produced no custom-table write, skipped the
  // CAP branch, and came back as RAP "based on standard table access patterns"
  // (QA full review, 45a8a7cf4a0c). Only what is explicitly standard counts as
  // standard now; an entry stored before 2.16 has no `isStandard` and keeps the
  // old reading, which is the only answer its data supports.
  const isWrite = (d: DataCouplingEntry) => d.accessType === 'Write' || d.accessType === 'Read/Write';
  const isStandardTable = (d: DataCouplingEntry) => d.isStandard ?? !d.isCustom;
  const customTableWrites = known.filter((d) => d.isCustom && isWrite(d)).length;
  const standardTableReads = known.filter((d) => isStandardTable(d) && d.accessType === 'Read').length;
  const standardTableWrites = known.filter((d) => isStandardTable(d) && isWrite(d)).length;
  // Neither custom nor standard: a write into an object whose owner the name
  // does not name. It may not decide an architecture, but it may not be
  // proposed for deletion either — the retirement branch below asks what the
  // code writes, and "nothing standard, nothing custom" is not "nothing".
  const unownedTableWrites = known.filter((d) => !d.isCustom && !isStandardTable(d) && isWrite(d)).length;
  // Both signals are about what the program *does*, so both are read from calls
  // and statements and not from a word that happens to occur.
  //
  // `\bIDOC\b` on the masked source and `\bPUBLISH\b` inside the event pattern
  // were two free-word scans, and masking comments only moved the false
  // positive one step: `DATA idoc TYPE string.` still returned an Integration
  // Suite recommendation at 80 % confidence and `DATA publish TYPE abap_bool.`
  // an Event Mesh one at 75 %, from a declaration that calls nothing and raises
  // nothing (QA review of b88c77b, d27e02241df3 / 9a4739b73b26 / 423e06020a0e /
  // 24a2ea35802c / 9a05d24b9cf0). The IDoc families the routing has always
  // meant are the function modules, which `isRfcOrIdocModule` already names;
  // the word added nothing but the declarations.
  const hasRfcIdoc = calledFunctionModules(code).some(isRfcOrIdocModule);
  const hasEventPattern = /\b(EVENT\s+RAISED|RAISE\s+EVENT)\b/i.test(upper);
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

  // Retirement is the one recommendation that says "this can go", so it may not
  // be reached by an argument that is empty. Two ways it was:
  //
  //   - **`every` on an empty array is true.** A snippet with no REPORT, no
  //     class and no FORM produces no inventory at all, and "no custom business
  //     logic" was then concluded from *having recognised nothing* rather than
  //     from having looked and found nothing.
  //   - **Nothing asked what the code writes.** `UPDATE vbak` on its own, well
  //     under thirty lines, came back as "Small, low-criticality code with no
  //     custom business logic. Candidate for retirement" — a destructive write
  //     to an SAP standard table, proposed for deletion (full review of
  //     a19945ef01dc, 052d2fe8f51c). A custom-table write already returns above;
  //     a standard one fell through to here.
  if (
    loc < 30 &&
    codeInventory.length > 0 &&
    standardTableWrites === 0 &&
    // …and a reserved-namespace write is a write too (45a8a7cf4a0c).
    unownedTableWrites === 0 &&
    codeInventory.every((i) => i.criticality === 'Low')
  ) {
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

  // Default: follow existing route. Where the only write goes to a
  // reserved-namespace object, the default is still the route — but it may not
  // be explained by "standard table access patterns", because nobody has
  // established that the target is standard (45a8a7cf4a0c).
  return {
    architecture: existingRouteIsBTP ? 'cap' : 'rap',
    confidence: 60,
    justification: existingRouteIsBTP
      ? 'General analysis suggests Side-by-Side extensibility based on the project\'s deployment target.'
      : unownedTableWrites > 0
        ? `${unownedTableWrites} write(s) to a reserved-namespace object (/…/), whose owner the name alone does not `
          + 'establish — SAP, partner or customer. The route needs that ownership confirmed before it can be called '
          + 'On-Stack or Side-by-Side.'
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

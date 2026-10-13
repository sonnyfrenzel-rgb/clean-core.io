import { tokenize } from './declaration-parser';
import { SAP_API_CATALOG_VERSION, successorInContext } from './sap-api-catalog';
import { MERGED_TABLE_MAP, getMergedCatalogVersion, hasNoReleasedApiPath, getSapObjectStates, functionModuleCatalogAnswer, isSapDatabaseTable } from './catalog-service';
import { readBatchInput, writesOf, type BatchInputCall, type BatchInputWrite } from './batch-input';
import { assessAuthority } from './authority-assessment';
import { tableTerm, termFor } from './business-glossary';

import { assessCoverage, type CoverageReport } from './coverage';
import { readTableDependencies, type DependencyRoute, type TableDependency } from './table-dependencies';
import { maskLiterals, readStatements } from './statement-reader';
import { BTP } from '../sap-naming';
import { APP_VERSION } from '../version';
import { guidelineChecksApply } from './guideline-checks-gate';
import { readSecurityReviewTasksFrom } from './security-review';
import { readSapCodeCopySignals } from './sap-code-copy';
import { readLegacyTechnology } from './legacy-technology';

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
  | 'modification'
  // From engine 3.0.12 (`GUIDELINE_CHECKS_FROM`): review tasks and classic
  // programming models, from the review of the DSAG ABAP guideline.
  | 'security-review'
  | 'sap-code-copy'
  | 'bopf'
  | 'gateway-classic-service'
  | 'ddic-cds-view'
  // From engine 3.0.12: asynchronous RFC on this system (`STARTING NEW TASK`
  // with no destination, `DESTINATION 'NONE'` or `DESTINATION IN GROUP`).
  | 'parallel-processing';

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
 * Does this statement call the function module `pattern` names — or declare the
 * constant a dynamic call would name it by? The name stands in a literal, so
 * the literal is read; but only a literal in one of those two places. Anywhere
 * else — a log message, a value assigned to a text field — it is a word.
 */
function namesModule(text: string, pattern: string): boolean {
  if (new RegExp(`^\\s*CALL\\s+FUNCTION\\s+['\`](?:${pattern})['\`]`, 'i').test(text)) return true;
  return /^\s*CONSTANTS\b/i.test(text) && new RegExp(`['\`](?:${pattern})['\`]`, 'i').test(text);
}

/**
 * The function module `pattern` matched, upper-cased — the name `namesModule`
 * finds — or null. A finding caused by a call records the module it calls as
 * its `objectName`, the way a table read records the table, so the clean core
 * level is looked up for that module (owner, 11.10.2026: "levels are missing
 * here" — the ALV and GUI file-transfer rows named no object and showed "?").
 */
function calledModule(text: string, pattern: string): string | null {
  const call = new RegExp(`^\\s*CALL\\s+FUNCTION\\s+['\`](${pattern})['\`]`, 'i').exec(text);
  if (call) return call[1].toUpperCase();
  if (!/^\s*CONSTANTS\b/i.test(text)) return null;
  const constant = new RegExp(`['\`](${pattern})['\`]`, 'i').exec(text);
  return constant ? constant[1].toUpperCase() : null;
}

/** The module a static `CALL FUNCTION 'X'` names, or null — a name held in a variable is not read. */
/**
 * The `DESTINATION` addition of a `CALL FUNCTION`, read as the statement's own
 * addition — from 3.0.12 (`GUIDELINE_CHECKS_FROM`).
 *
 * The rule before read the word anywhere in the call, so
 * `CALL FUNCTION 'RFC_CONNECTION_CLOSE' EXPORTING destination = lv_dest`
 * — a parameter that happens to be called `destination` — was reported as a
 * remote call (benchmark case BM-056). The addition stands before the
 * parameter list; a word after `EXPORTING`, `IMPORTING`, `TABLES`, `CHANGING`
 * or `EXCEPTIONS` is a parameter name.
 *
 * - `null`: no addition — a local call.
 * - `local`: `DESTINATION 'NONE'` (this system, in a new session) or
 *   `DESTINATION IN GROUP` (parallel processing on this system's servers).
 *   Neither leaves the system; the router reads both as local as well.
 * - `remote`: any other destination, a literal or a variable.
 */
export function rfcDestinationOf(text: string): 'remote' | 'local' | null {
  const masked = maskLiterals(text);
  if (!/^\s*CALL\s+FUNCTION\b/i.test(masked)) return null;
  const end = masked.search(/\b(?:EXPORTING|IMPORTING|TABLES|CHANGING|EXCEPTIONS|PARAMETER-TABLE|EXCEPTION-TABLE)\b/i);
  const head = end < 0 ? masked : masked.slice(0, end);
  const at = /\bDESTINATION\s+(?!=)/i.exec(head);
  if (!at) return null;
  // `maskLiterals` keeps offsets, so the original text at the same place
  // holds the literal the mask blanked.
  const operand = text.slice(at.index + at[0].length);
  if (/^IN\s+GROUP\b/i.test(operand)) return 'local';
  if (/^'NONE'/i.test(operand)) return 'local';
  return 'remote';
}

function staticCallTarget(text: string): string | null {
  const m = /\bCALL\s+FUNCTION\s+['`]([\w/]+)['`]/i.exec(text);
  return m ? m[1].toUpperCase() : null;
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
 * (R02: "the way it is written does not change the effect") — but a reader looking for
 * `SELECT … FROM kna1` in the quoted line would not find it without this.
 */
const ROUTE_NOTE: Partial<Record<DependencyRoute, string>> = {
  'dynamic-sql': ' The table is named in a dynamic token whose value is a constant in this source.',
  macro: ' The statement stands in a macro body; this is the call site that expands it.',
  adbc: ' The table is named in SQL text executed through ADBC (CL_SQL_STATEMENT), which bypasses ABAP SQL.',
  'logical-database': ' The rows are read by a logical database (GET); the SELECT runs there, not in this source.',
};

/**
 * Credential-shaped literals, removed from anything a report prints.
 *
 * A finding's snippet is the line it found, and the line may be the one holding
 * a key. A report that quotes a secret carries it to everyone the report
 * reaches — the audit pack, the export, the model prompt, the screen — which is
 * a wider audience than the source ever had. The anchor still says where to
 * look, and the reader who may see the key has the file.
 *
 * Shapes, not entropy: a guess based on how random a string looks would redact
 * ABAP identifiers and miss a short token. These are the prefixes that are
 * unambiguous, and the list is meant to grow rather than to be complete — the
 * detector that reports the key is the safety net, this is the muzzle.
 */
export function redactCredentials(snippet: string | undefined): string {
  if (!snippet) return snippet ?? '';
  return snippet
    // A private key block, whole — or from its header to the end of the text
    // when the source splits it over several literals.
    .replace(/-----BEGIN ([A-Z ]*)PRIVATE KEY-----[\s\S]*?(?:-----END \1PRIVATE KEY-----|$)/g, '-----BEGIN $1PRIVATE KEY-----…<redacted>')
    // Google API keys (AIzaSy…), the shape the credential detector reports.
    // Case-blind: a key that became a transaction code was upper-cased on the way.
    .replace(/\bAIzaSy[0-9A-Za-z_\-]{10,}/gi, 'AIzaSy…<redacted>')
    // Bearer-ish and generic long secrets behind an obvious key word.
    .replace(/\b(sk-|sk_live_|rk_live_|ghp_|gho_|ghs_|github_pat_|xox[abprs]-|glpat-)[0-9A-Za-z_\-]{10,}/g, '$1…<redacted>')
    // AWS access key ids.
    .replace(/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '$1…<redacted>')
    // A JSON Web Token: three base64url parts, the first a JSON header.
    .replace(/\beyJ[0-9A-Za-z_\-]{8,}\.[0-9A-Za-z_\-]{8,}\.[0-9A-Za-z_\-]{8,}/g, 'eyJ…<redacted>')
    // A password inside a connection string or URL.
    .replace(/\b(password|passwd|pwd)=([^;&'"\s]+)/gi, '$1=…<redacted>')
    .replace(/(\/\/[^\s/:@'"]+):([^\s/@'"]+)@/g, '$1:…<redacted>@')
    // A token, key or signature passed as a parameter inside a URL, form body or
    // connection string (`?access_token=…`, `&sig=…`, `;apikey=…`). ABAP puts
    // spaces around its own `=`, so `name=value` without them is literal text;
    // `=>` is a class component, `{` an embedded expression, neither a value.
    .replace(/(^|[^\w-])([\w-]*?(?:token|secret|apikey|api_key|api-key|key|sig|signature|password|passwd|pwd))=(?![>={])([^&#;'"\s|`]+)/gi,
      (_m, lead, name) => `${lead}${name}=…<redacted>`)
    // An Authorization header value written into a literal. The value must hold
    // a digit or a lower-to-upper case change, as base64 and random tokens do,
    // so prose such as "Bearer authentication" stays readable.
    // Case-sensitive on purpose: the case change is the signal.
    .replace(/\b([Bb]earer|[Bb]asic|BEARER|BASIC)(\s+)(?=[\w\-.~+/]*?(?:\d|[a-z][A-Z]))[\w\-.~+/]{6,}=*/g, '$1$2…<redacted>')
    // In an explicit authorization context the composition is no signal: a
    // token of letters only (`'Bearer abcdefghijklmnop'`) is still a token
    // (QA c65a238c3cd2). The context is the scheme word opening a literal, or
    // following `Authorization:`. Prose about the scheme ("Bearer
    // authentication") is left alone by the words it is written in.
    // After `Authorization:` the header is named outright, so a value of any
    // length is the credential — the eight-character floor below exists only
    // for a bare scheme word opening a literal (`'Basic mode'`) (QA f72a50faa489).
    .replace(/(\bAuthorization\s*:\s*)([Bb]earer|[Bb]asic|BEARER|BASIC)(\s+)(?!(?:authentication|authorization|auth|token|tokens|scheme|header|credentials?)\b)(?!…<redacted>)[\w\-.~+/]+=*/gi,
      (_m, lead, scheme, gap) => `${lead}${scheme}${gap}…<redacted>`)
    .replace(/((?:['`|]|\bAuthorization\s*:)\s*)([Bb]earer|[Bb]asic|BEARER|BASIC)(\s+)(?!(?:authentication|authorization|auth|token|tokens|scheme|header|credentials?)\b)(?!…<redacted>)[\w\-.~+/]{8,}=*/gi,
      (_m, lead, scheme, gap) => `${lead}${scheme}${gap}…<redacted>`)
    // A password or token assigned to a literal in ABAP — of any length: a short
    // secret is still a secret. The name may carry a prefix (`lv_password`,
    // `gv_api_key`): `_` is a word character, so a bare `\bPASSWORD` never
    // matched inside one (QA slice review of 953575fcc9bf, 21933f60c24d).
    .replace(/\b([\w/]*?(?:PASSWORD|PASSWD|SECRET|TOKEN|APIKEY|API_KEY))\b(\s*(?:=|TYPE\s+\w+\s+VALUE)\s*)'([^']+)'/gi,
      (_m, word, mid) => `${word}${mid}'…<redacted>'`);
}

/** `the purchase order schedule line (EKET)`, or `EKET` where the glossary has no word for it. */
function tablePhrase(table: string): string {
  const term = tableTerm(table);
  return term ? `the ${term.singular} (${table})` : table;
}

/**
 * What a batch input changes, in words where the glossary has them (roadmap
 * 3.0.7): "the delivery date (EKET-EEIND) of the purchase order schedule line
 * (EKET)". A component or table the glossary does not know stands as the
 * source writes it.
 */
export function batchInputEffect(write: BatchInputWrite): string {
  const fields = write.components.map((component) => {
    const term = termFor(component);
    return term.singular.toUpperCase() !== component.toUpperCase()
      ? `the ${term.singular} (${write.table}-${component})`
      : `${write.table}-${component}`;
  });
  // A posting fills a dozen header fields; the title names three and counts
  // the rest, the detail lists every one of them.
  const shown = fields.length > 3 ? [...fields.slice(0, 3), `${fields.length - 3} more field${fields.length - 3 > 1 ? 's' : ''}`] : fields;
  const list = shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  const term = tableTerm(write.table);
  return term ? `${list} of the ${term.singular} (${write.table})` : `${list} in ${write.table}`;
}

/** The screens and fields of a batch-input call, appended to the BDC finding's detail. */
function batchInputDetail(call: BatchInputCall | undefined, writes: BatchInputWrite[], tcode: string): string {
  if (!call || (!call.screens.length && !call.fields.length)) return '';
  const programs = [...new Set(call.screens.map((s) => s.program))].join(', ');
  const screens = call.screens.length
    ? ` It runs ${call.screens.length} screen${call.screens.length > 1 ? 's' : ''} of ${programs} (${call.screens.map((s) => s.screen).join(', ')})`
    : ' It';
  const fields = call.fields.length ? ` and fills ${call.fields.map((f) => f.raw).join(', ')}` : '';
  const changes = writes.length
    ? ` Through ${tcode} it changes ${writes.map(batchInputEffect).join('; ')}.`
    : ' None of the filled fields names a database table SAP lists, so what it changes is not determined from the code.';
  return `${screens}${fields}.${changes}`;
}

/**
 * `catalogSnapshot` (roadmap 7.10): the release file SAP object states are read
 * from — `pce-2023-3` for a Private Edition 2023 FPS03 target, say. Omitted, the
 * default file. A snapshot that is not shipped throws rather than being
 * answered from another one (`CatalogSnapshotNotShipped`). The successor
 * mapping (`MERGED_TABLE_MAP`) stays the shared mapping layer.
 *
 * `engineVersion` is the engine the evidence is (or was) made with. Omitted, it
 * is this engine (`APP_VERSION`). Whatever rebuilds the evidence of a signed
 * run passes that run's version (`signedEngineVersionOf`), so the run keeps the
 * findings it was signed with: the checks of 3.0.12 (`GUIDELINE_CHECKS_FROM`)
 * appear only for a run of that engine or later.
 */
export function buildAbapEvidence(
  code: string,
  fileName: string,
  deployment?: 'public' | 'private',
  catalogSnapshot?: string,
  engineVersion?: string | null,
): AbapEvidenceReport {
  const guideline = guidelineChecksApply(engineVersion === undefined ? APP_VERSION : engineVersion);
  /**
   * Is this object on SAP's list of classic APIs (the classification file,
   * `classicAPI`)? SAP Note 3578329 counts SAP GUI, Dynpro and the ALV grid as
   * level B where they are used through documented classic APIs or released
   * extension points — the list is what documents them (owner check of the
   * note, 13.10.2026). A use outside the list is not level B by that rule.
   */
  const listedClassicApi = (name: string): boolean => getSapObjectStates(name, catalogSnapshot).classificationState === 'classicAPI';
  /** The level B sentence of SAP Note 3578329, for a UI technology used through the list. */
  const LEVEL_B_UI = 'SAP Note 3578329 counts SAP GUI, Dynpro and the ALV grid as clean core level B where they are used through documented classic APIs: they may stay while the users work in SAP GUI (on-premise or Private Edition).';
  const REPLACE_WHEN = 'Replace it when the UI has to run in a browser or the SAP Fiori launchpad, or when the target is S/4HANA Cloud Public Edition: then with a Fiori Elements app on a RAP service.';
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

  // Some successors depend on what else the program reads: AUFK beside AFKO,
  // AFPO or RESB is a production order, not an internal order (PP review,
  // 12.10.2026; `successorInContext`). A context successor is our curated
  // mapping, labelled as such, never SAP's catalog answer.
  const tablesHere = new Set(
    dependencies.dependencies.filter((d) => d.access !== 'reference' && !d.possibleTargetOf).map((d) => d.table),
  );
  const successorOf = (table: string): (typeof STANDARD_TABLE_MAP)[string] | undefined => {
    const base = STANDARD_TABLE_MAP[table];
    if (!base) return undefined;
    const inContext = successorInContext(table, tablesHere);
    return inContext ? { view: inContext.entry.view, type: inContext.entry.type, confidence: 'curated' } : base;
  };

  // Roadmap 3.0.7 — batch input read field by field (`batch-input.ts`). The
  // screen fields a call fills name the table it changes where their structure
  // is a database table SAP lists; the dialog structures of the transaction
  // (`RM06E`, `RV45A`) are not. Keyed by the line the call starts on, in
  // statement order: two calls written on one line each take their own, not
  // the last one's transaction and fields (QA review, 9a6689897a0f).
  const batchAt = new Map<number, BatchInputCall[]>();
  for (const call of readBatchInput(code)) batchAt.set(call.line, [...(batchAt.get(call.line) ?? []), call]);
  const takeBatch = (line: number, via: BatchInputCall['via']): BatchInputCall | undefined => {
    const calls = batchAt.get(line);
    const index = calls ? calls.findIndex((c) => c.via === via) : -1;
    return index >= 0 ? calls!.splice(index, 1)[0] : undefined;
  };
  const batchWrites = (call: BatchInputCall | undefined): BatchInputWrite[] =>
    call ? writesOf(call, isSapDatabaseTable) : [];
  // Roadmap 3.0.7 — the authorization checks assessed, by line.
  const authority = assessAuthority(code);

  const FAKE_TABLES = new Set([
    'MODE', 'TASK', 'RISK', 'SCREEN', 'LINE', 'TABLE', 'INTO', 'FROM',
    'CORRESPONDING', 'DATA', 'ADJACENT', 'RESULT', 'CONNECTION', 'TYPE',
    'INDEX', 'UP', 'TO', 'ROWS', 'WHERE', 'AND', 'OR', 'NOT', 'NULL',
    'IS', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'OUTER', 'INNER',
    'FULL', 'CROSS', 'USING', 'CLIENT', 'SPECIFIED', 'SYSTEM', 'VALUES',
    'SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'FOR', 'ALL',
    'ENTRIES', 'BY', 'ORDER', 'GROUP', 'HAVING'
  ]);

  const addFinding = (raw: Omit<EvidenceFinding, 'id' | 'source'> & { source?: EvidenceSource }) => {
    // An optional field the detector left `undefined` is left out instead. The
    // findings go into the signed run through the Admin SDK, which refuses an
    // `undefined` value outright: a standard table with no mapped successor
    // (`sapReplacement: undefined`, ELBK in the shipped example) made every
    // such run a 500. Absent and undefined read the same everywhere else, JSON
    // and the run signature included.
    const finding = Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== undefined),
    ) as typeof raw;
    findings.push({
      ...finding,
      // Every snippet passes through the redaction, here rather than at the
      // twenty-five places that set one. The credential detector redacts its own
      // snippet, and that was not enough: when a key and a hardcoded path share
      // one statement, the *environmental* detector below reports the same
      // statement as `snippet: text` and prints the key after all (QA review of
      // 9d7721972a67 — and the test that was supposed to hold this used two
      // statements, so it never saw the case). One gate means a detector added
      // next year is covered without anyone remembering this paragraph.
      snippet: redactCredentials(finding.snippet),
      // The snippet is not the only field that quotes the source: a title names
      // the transaction or function a literal called, and the object name can
      // be the file name. Same gate, same reason.
      title: redactCredentials(finding.title),
      ...(finding.objectName !== undefined ? { objectName: redactCredentials(finding.objectName) } : {}),
      technicalDetail: redactCredentials(finding.technicalDetail),
      id: `CC-${String(idCounter++).padStart(3, '0')}`,
      // Default source: 'static-parser' for all scanner findings. Upgraded to
      // 'catalog-match' only when the replacement came out of SAP's release
      // data; a curated pairing (`'Verified'`, see `replacementProvenance`) is
      // this file's knowledge, and calling it a catalog match would cite SAP
      // for it.
      source: finding.source || (finding.sapReplacement?.confidence === 'Catalog Match' ? 'catalog-match' : 'static-parser'),
    });
  };

  /**
   * Roadmap 3.0.7 — what a batch input changes, as a finding on the table: a
   * write to that table through the transaction's screens, graded as a write
   * (`public-cloud-fit-resolver.ts`, `USE_OF_KIND`) and carrying the successor
   * SAP lists for the table. Kind `batch-input`: it costs no score points of
   * its own — the `bdc` finding on the call already does — and it is no direct
   * write, so it never counts as a `standard-table-write`.
   */
  // `queued`: the rows go into a batch-input session (`BDC_INSERT`) that SM35
  // runs later; this program does not run the transaction, so the finding says
  // the session queues the change rather than that it is made (QA review of
  // d939fb5b056b, 11d2bd848df5).
  const addBatchInputWrite = (write: BatchInputWrite, tcode: string, line: number, text: string, queued = false) => {
    const entry = successorOf(write.table);
    // Anchored where the table is named — the statement that fills the first
    // of its fields — so the anchor carries what the finding claims; the call
    // is in the detail. The statement's first line, as every finding here: a
    // range that followed the literal inside a re-wrapped statement would move
    // with formatting (tests/abap-metamorphic.spec.ts, P2).
    const fillLine = write.firstFill.lineStart;
    const fill = statements.find((s) => s.line === write.firstFill.lineStart);
    addFinding({
      kind: 'batch-input',
      title: queued
        ? `Batch input session queues a change to ${batchInputEffect(write)} via ${tcode}`
        : `Batch input changes ${batchInputEffect(write)} via ${tcode}`,
      severity: 'High',
      confidence: 'High',
      objectName: write.table,
      objectType: 'Database Table',
      lineStart: fillLine,
      snippet: fill ? fill.text.trim() : text,
      technicalDetail: queued
        ? `The batch-input session for ${tcode} (BDC_INSERT, line ${line}) fills ${write.raw.join(', ')} (line${write.lines.length > 1 ? 's' : ''} ${write.lines.join(', ')}). This program only queues the session; the change to ${write.table} is made when the session is processed (SM35), and this program writes nothing to it directly.`
        : `The batch input to ${tcode} (line ${line}) fills ${write.raw.join(', ')} (line${write.lines.length > 1 ? 's' : ''} ${write.lines.join(', ')}). The transaction writes the change to ${write.table}; this program writes nothing to it directly.`,
      cleanCoreImpact: `The change to ${write.table} rests on the SAP GUI screens of ${tcode}. They carry no stability contract and do not run in ABAP Cloud.`,
      recommendation: entry
        ? `Make the change through the released API for ${tablePhrase(write.table)}: SAP names ${entry.view} as the successor of ${write.table}.`
        : `Make the change through a released SAP API for ${tablePhrase(write.table)}; the catalogue names no successor for ${write.table}.`,
      targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP', 'Integration Suite'],
      sapReplacement: entry ? {
        objectName: entry.view,
        objectType: entry.type,
        ...replacementProvenance(entry),
      } : undefined,
    });
  };

  const processTableAccess = (tableName: string, isWrite: boolean, line: number, text: string, route: DependencyRoute) => {
    const table = tableName.toUpperCase().trim();
    if (!table || table.length < 2 || FAKE_TABLES.has(table) || /^\d/.test(table)) return;
    // A name declared in this source is a variable, not a database table —
    // `readTableDependencies` has already asked the declarations, the same ones
    // the data coupling asks.
    const routeNote = ROUTE_NOTE[route] ?? '';

    const sapStates = getSapObjectStates(table, catalogSnapshot);
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

    // A `/NS/` name SAP does not list is not SAP standard, but the namespace
    // alone does not say whose it is — a partner's or the customer's. The
    // finding is written for "not SAP's", and says no more than that.
    const unownedNamespace = !table.startsWith('Z') && !table.startsWith('Y');
    if (isCustom) {
      if (isWrite) {
        addFinding({
          kind: 'custom-table-write',
          title: unownedNamespace
            ? `Direct Write to Namespaced Table ${table}`
            : `Direct Write to Custom Table ${table}`,
          severity: 'High',
          confidence: 'High',
          objectName: table,
          objectType: 'Database Table',
          lineStart: line,
          snippet: text,
          technicalDetail: unownedNamespace
            ? `Direct modification statement (INSERT/UPDATE/MODIFY/DELETE) on ${table}, a reserved-namespace table SAP does not list — a partner's or the customer's; the name does not say which.${routeNote}`
            : `Direct modification statement (INSERT/UPDATE/MODIFY/DELETE) on custom table ${table}.${routeNote}`,
          // Writing to a table that is not SAP's is not itself a clean core
          // violation (`extensibility-router.ts` says so for Private Edition);
          // what the write costs is the missing application layer.
          cleanCoreImpact: 'Direct DB access bypasses the application layer and encapsulation: no business object guards the rows it changes. Writing to a table that is not SAP\'s is not itself a clean core violation, but ABAP Cloud needs the table exposed through a RAP business object or moved side-by-side.',
          recommendation: `Expose custom tables via RAP Business Objects (Developer Extensibility) or use Side-by-Side persistence on ${BTP} (CAP).`,
          targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
        });
      } else {
        addFinding({
          kind: 'table-access',
          title: unownedNamespace
            ? `Direct Read from Namespaced Table ${table}`
            : `Direct Read from Custom Table ${table}`,
          severity: 'Low',
          confidence: 'High',
          objectName: table,
          objectType: 'Database Table',
          lineStart: line,
          snippet: text,
          technicalDetail: unownedNamespace
            ? `SELECT statement reading from ${table}, a reserved-namespace table SAP does not list — a partner's or the customer's; the name does not say which.${routeNote}`
            : `SELECT statement reading from custom table ${table}.${routeNote}`,
          // From 3.0.12 (`GUIDELINE_CHECKS_FROM`): the clean core level concept,
          // the wording of the clean core level concept (owner rule 13.10.2026).
          cleanCoreImpact: guideline
            ? 'Reading the customer\'s own table directly is classic ABAP. In ABAP Cloud the access goes through a CDS view entity over the table, which is also what a RAP service is built on.'
            : 'Reading from custom tables directly is acceptable if wrapped in Tier-2 or CDS views, but should be checked for proper API usage.',
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
            objectName: successorOf(table)!.view,
            objectType: successorOf(table)!.type,
            ...replacementProvenance(successorOf(table)),
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
          technicalDetail: `Direct SELECT statement on standard SAP table ${table}.${routeNote}${isPublicCloud
            ? ' In Public Cloud this is a hard break — no direct table access allowed.'
            : guideline
              // From 3.0.12 (`GUIDELINE_CHECKS_FROM`): the level concept wording.
              ? ' In Private Cloud the read works, but ties the code to SAP\'s table design; its clean core level is the one SAP\'s data gives the table.'
              : ' In Private Cloud this creates upgrade risk that can be mitigated with Tier 2 wrappers.'}`,
          cleanCoreImpact: isPublicCloud
            ? 'In SAP S/4HANA Public Cloud, direct reads on standard tables are strictly forbidden. The system will reject custom code accessing unreleased objects.'
            : guideline
              ? 'Direct read access to standard SAP tables couples custom code to SAP data models, creating upgrade dependencies. Where no released CDS view covers the data, a wrapper around the read together with an influence request to SAP for a released successor keeps the dependency in one place; the wrapper does not make the read itself upgrade-stable.'
              : 'Direct read access to standard SAP tables couples custom code to SAP data models, creating upgrade dependencies. In Private Cloud, Tier 2 wrappers can mitigate this.',
          recommendation: `Replace with released CDS views (e.g. I_ views) or official APIs.`,
          targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility'],
          sapReplacement: hasReplacement ? {
            objectName: successorOf(table)!.view,
            objectType: successorOf(table)!.type,
            ...replacementProvenance(successorOf(table)),
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

    // Batch Data Communication (BDC) — and SAP GUI navigation, which is not.
    //
    // Only `CALL TRANSACTION … USING <bdcdata>` fills the transaction's screens
    // from the program; that is batch input. Without `USING` the statement
    // opens the transaction for the person in front of the screen (often with
    // `SET PARAMETER ID` and `AND SKIP FIRST SCREEN`): nothing is posted by
    // this code, whatever the user then does in the transaction is their own
    // dialog. Reading both as BDC cost ten points instead of five, made the
    // router send a display list side by side, and told the reader the program
    // "drives" a transaction it only opens (ZMM_BESTELLUEBERSICHT review,
    // roadmap 3.0.7). The navigation is a classic-UI dependency — the SAP GUI
    // screens of the called transaction — and is reported as one, with its
    // transaction code, so the level of the object is still graded.
    // `call-graph.ts` (`batchInput`) and `isDbWrite` in `business-statement.ts`
    // make the same distinction with the same test.
    if (/\bCALL\s+TRANSACTION\b/i.test(codeText) && !/\bUSING\b/i.test(codeText)) {
      const tcodeMatch = text.match(/\bCALL\s+TRANSACTION\s+'?([\w\/]+)'?/i);
      const tcode = tcodeMatch ? tcodeMatch[1].toUpperCase() : 'UNKNOWN';
      addFinding({
        kind: 'dynpro',
        title: `SAP GUI navigation to transaction ${tcode}`,
        severity: 'Medium',
        confidence: 'High',
        objectName: tcode,
        objectType: 'Transaction Code',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `CALL TRANSACTION without USING opens the transaction's screens for the user; the program passes no screen data and posts nothing through it.`,
        // From 3.0.12 (`GUIDELINE_CHECKS_FROM`): SAP GUI is level B per SAP Note 3578329.
        cleanCoreImpact: guideline
          ? `The call depends on the SAP GUI screens of the called transaction. ${LEVEL_B_UI} ABAP Cloud has no CALL TRANSACTION, and a Fiori UI navigates to an app instead of a transaction code.`
          : 'The call depends on the SAP GUI screens of the called transaction. ABAP Cloud has no CALL TRANSACTION, and a Fiori UI navigates to an app instead of a transaction code.',
        recommendation: guideline
          ? 'The navigation may stay while the program runs in SAP GUI. When the UI moves to a browser or the Fiori launchpad, or the target is S/4HANA Cloud Public Edition, replace it with navigation to the SAP Fiori app for the same business object (intent-based navigation).'
          : `Replace the call with navigation to the SAP Fiori app for the same business object (intent-based navigation) from a Fiori UI built on a RAP service.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
      });
    } else if (/\bCALL\s+TRANSACTION\b/i.test(codeText)) {
      const tcodeMatch = text.match(/\bCALL\s+TRANSACTION\s+'?([\w\/]+)'?/i);
      const call = takeBatch(stmt.line, 'call-transaction');
      // A code held in a constant is the constant's value, not its name (3.0.7).
      const tcode = call?.transaction ?? (tcodeMatch ? tcodeMatch[1].toUpperCase() : 'UNKNOWN');
      const writes = batchWrites(call);
      // The successor of the first table the batch input changes is the
      // domain's own API; the generic sentence named nothing a reader could
      // look up (roadmap 3.0.7).
      const successor = writes.map((w) => w.table).find((t) => STANDARD_TABLE_MAP[t] !== undefined);
      addFinding({
        kind: 'bdc',
        title: `Legacy Batch Data Communication (BDC) to TCode ${tcode}`,
        severity: 'High',
        confidence: 'High',
        objectName: tcode,
        objectType: 'Transaction Code',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `CALL TRANSACTION statement to drive SAP screens programmatically.${batchInputDetail(call, writes, tcode)}`,
        cleanCoreImpact: 'BDC relies on traditional SAP GUI screen flows. These are highly unstable, prone to breaking during upgrades, and do not work in SAP Fiori or Cloud environments.',
        // Domain-neutral: the example named the sales order API for every
        // transaction, purchase orders included (ZMM_BESTELLUEBERSICHT review).
        // Where the filled fields name the table, the successor SAP lists for
        // it is the domain-specific one, and the sentence names it (3.0.7).
        recommendation: successor
          ? `Replace this screen automation with the released SAP API for ${tablePhrase(successor)}: SAP names ${successorOf(successor)!.view} as the successor of ${successor}. Change the data through that API or the RAP business object behind it, not through the screens.`
          : `Replace this screen automation with the released SAP API for the same business object, or wrap it in an OData service via RAP.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP', 'Integration Suite'],
        sapReplacement: successor ? {
          objectName: successorOf(successor)!.view,
          objectType: successorOf(successor)!.type,
          ...replacementProvenance(successorOf(successor)),
        } : undefined,
      });
      for (const write of writes) addBatchInputWrite(write, tcode, stmt.line, text);
    } else if (/^\s*CALL\s+FUNCTION\s+'BDC_INSERT'/i.test(text)) {
      // A batch-input session row: the same screens, run later from SM35. The
      // call itself costs nothing here (it never did); what its rows change is
      // graded like the direct call's.
      const call = takeBatch(stmt.line, 'session');
      for (const write of batchWrites(call)) addBatchInputWrite(write, call?.transaction ?? 'UNKNOWN', stmt.line, text, true);
    }

    // Remote Function Calls (RFC). From 3.0.12 only the statement's own
    // DESTINATION addition to another system counts (`rfcDestinationOf`).
    if (guideline
      ? rfcDestinationOf(text) === 'remote'
      : /\bCALL\s+FUNCTION\b[\s\S]+?\bDESTINATION\b/i.test(codeText)) {
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
      addFinding(guideline
        // From 3.0.12 (`GUIDELINE_CHECKS_FROM`): a classic screen is level B
        // per SAP Note 3578329 (owner check, 13.10.2026) — it may stay.
        // DSAG ABAP guideline: clean-core/solution-approach.md § Level Concept
        ? {
          kind: 'dynpro',
          title: 'Classic screen (Dynpro)',
          severity: 'Low',
          confidence: 'High',
          lineStart: stmt.line,
          snippet: text,
          technicalDetail: `CALL SCREEN or a screen MODULE: the program has its own classic screens.`,
          cleanCoreImpact: `Dynpro screens run in SAP GUI only, and ABAP Cloud has none. ${LEVEL_B_UI}`,
          recommendation: `The screens may stay while the program runs in SAP GUI. ${REPLACE_WHEN}`,
          targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
        }
        : {
          kind: 'dynpro',
          title: 'Legacy Screen Painter (Dynpro) UI Pattern',
          severity: 'Medium',
          confidence: 'High',
          lineStart: stmt.line,
          snippet: text,
          technicalDetail: `Legacy Dynpro CALL SCREEN or MODULE statement.`,
          cleanCoreImpact: 'Dynpro screens only work in SAP GUI. Modern web-based Fiori architectures require decoupled REST/OData APIs and UI5 frontend elements.',
          recommendation: `Rewrite UI as a Fiori Elements app on ${BTP} or S/4HANA, backed by a RAP OData service.`,
          targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP']
        });
    }

    // Classic ALV Grid. The name of a called function module stands in a
    // literal and is the call target, not prose about one — the exception
    // `statement-reader.ts` documents. So this reads `text`, not `codeText` —
    // but only the literal a `CALL FUNCTION` (or a constant) names: in
    // `PERFORM add_log USING 'GUI_DOWNLOAD'` the name is a message.
    const alvModule = calledModule(text, 'REUSE_ALV_(?:GRID|LIST)_DISPLAY');
    if (alvModule && guideline) {
      // From 3.0.12 (`GUIDELINE_CHECKS_FROM`): an ALV list is classic
      // technology, not a defect to replace on sight.
      // DSAG ABAP guideline: clean-core/solution-approach.md § Level Concept
      // SAP Note 3578329 (owner check, 13.10.2026) counts the ALV grid as
      // level B where it is used through documented classic APIs. SAP's
      // classification file lists CL_SALV_TABLE and CL_GUI_ALV_GRID as
      // classicAPI and does not list the REUSE_ALV function modules, so a
      // REUSE_ALV call is not level B by that rule: it stays a Medium finding
      // whose level is what the catalog answers for the module, and the
      // sentence points at the listed class first.
      const listed = listedClassicApi(alvModule);
      addFinding({
        kind: 'classic-alv',
        title: 'Classic ALV list (SAP GUI)',
        severity: listed ? 'Low' : 'Medium',
        confidence: 'High',
        objectName: alvModule,
        objectType: 'Function Module',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Call of ${alvModule}: the list is displayed in SAP GUI.`,
        cleanCoreImpact: listed
          ? `The list runs in SAP GUI only, and ABAP Cloud has no ALV. ${LEVEL_B_UI}`
          : `The list runs in SAP GUI only, and ABAP Cloud has no ALV. SAP Note 3578329 counts the ALV grid as clean core level B only where it is used through documented classic APIs; SAP's list of classic APIs names CL_SALV_TABLE and CL_GUI_ALV_GRID, not ${alvModule}.`,
        recommendation: listed
          ? `The list may stay while its users work in SAP GUI. ${REPLACE_WHEN}`
          : `While the list stays in SAP GUI (on-premise or Private Edition), move it to CL_SALV_TABLE, the ALV interface on SAP's classic-API list. ${REPLACE_WHEN}`,
        targetOptions: ['Developer Extensibility / RAP']
      });
    } else if (alvModule) {
      addFinding({
        kind: 'classic-alv',
        title: 'Legacy ALV Grid Display',
        severity: 'Medium',
        confidence: 'High',
        objectName: alvModule,
        objectType: 'Function Module',
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
    // The finding names what the statement calls: the module, or the class.
    // `WS_DOWNLOAD` / `WS_UPLOAD` are the obsolete forms of the same transfer
    // and are read as it (SD review R12, 12.10.2026). Upload and download are
    // said apart: a download is a list export, an upload a file the target
    // has to take — neither forces a side-by-side split on its own
    // (`GUI_FILE_NO_ROUTE_DRIVER_FROM` in the router).
    const guiModule = calledModule(text, '(?:GUI|WS)_(?:DOWNLOAD|UPLOAD)');
    if (guiModule || /\bCL_GUI_FRONTEND_SERVICES\b/i.test(codeText)) {
      const direction = guiModule
        ? (/UPLOAD/.test(guiModule) ? 'upload' : 'download')
        : /\b(?:GUI_UPLOAD|FILE_OPEN_DIALOG)\b/i.test(codeText) && !/\b(?:GUI_DOWNLOAD|FILE_SAVE_DIALOG)\b/i.test(codeText)
          ? 'upload'
          : /\b(?:GUI_DOWNLOAD|FILE_SAVE_DIALOG)\b/i.test(codeText) && !/\b(?:GUI_UPLOAD|FILE_OPEN_DIALOG)\b/i.test(codeText)
            ? 'download'
            : 'unknown';
      addFinding({
        kind: 'gui-download',
        title: 'Legacy Frontend File Upload/Download',
        severity: 'Medium',
        confidence: 'High',
        objectName: guiModule ?? 'CL_GUI_FRONTEND_SERVICES',
        objectType: guiModule ? 'Function Module' : 'Class',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: direction === 'upload'
          ? 'Reads a file from the user\'s PC through the SAP GUI frontend services (GUI_UPLOAD, WS_UPLOAD or cl_gui_frontend_services).'
          : direction === 'download'
            ? 'Writes a file to the user\'s PC through the SAP GUI frontend services (GUI_DOWNLOAD, WS_DOWNLOAD or cl_gui_frontend_services).'
            : `Usage of GUI_DOWNLOAD, GUI_UPLOAD, WS_DOWNLOAD, WS_UPLOAD or cl_gui_frontend_services to interact with the local client file system.`,
        // From 3.0.12 (`GUIDELINE_CHECKS_FROM`): SAP Note 3578329 — level B
        // through a listed classic API; WS_DOWNLOAD / WS_UPLOAD are not listed.
        cleanCoreImpact: guideline
          ? (listedClassicApi(guiModule ?? 'CL_GUI_FRONTEND_SERVICES')
            ? `Frontend services require an SAP GUI connection; a browser does not allow this access to the local file system. SAP lists ${guiModule ?? 'CL_GUI_FRONTEND_SERVICES'} as a classic API, and SAP Note 3578329 counts SAP GUI technology used through classic APIs as clean core level B: the transfer may stay while the users work in SAP GUI.`
            : `Frontend services require an SAP GUI connection; a browser does not allow this access to the local file system. ${guiModule} is not on SAP's list of classic APIs (GUI_UPLOAD, GUI_DOWNLOAD and CL_GUI_FRONTEND_SERVICES are), so it is not level B under SAP Note 3578329.`)
          : 'Frontend services require SAP GUI connection and client-side integration. Web browsers block direct local file system access for security.',
        recommendation: direction === 'download'
          ? 'Replace the download with the export of a Fiori Elements list report backed by a RAP service — on-stack; no separate runtime is needed for it.'
          : direction === 'upload'
            ? 'Replace the upload with a RAP large object (attachment) field and a Fiori upload control (S/4HANA 2022 or later) — on-stack. A side-by-side service only where a requirement the code does not show calls for one (external users, files from several systems).'
            : 'Replace downloads with a Fiori list report export and uploads with a RAP large object field (S/4HANA 2022 or later) — both on-stack.',
        targetOptions: direction === 'download' ? ['Developer Extensibility / RAP'] : ['Developer Extensibility / RAP', 'Side-by-Side CAP']
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
      // The update module, where the call names it in a literal.
      const updateModule = staticCallTarget(text);
      addFinding({
        kind: 'update-task',
        title: 'Asynchronous Update Task (IN UPDATE TASK)',
        severity: 'High',
        confidence: 'High',
        ...(updateModule ? { objectName: updateModule, objectType: 'Function Module' } : {}),
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
      // The program, where it is written as a name; `SUBMIT (lv_prog)` names none.
      const submitted = /^\s*SUBMIT\s+([A-Z_/][\w/]*)/i.exec(codeText);
      const program = submitted && !/^(?:VIA|USING|WITH|AND|TO|EXPORTING)$/i.test(submitted[1]) ? submitted[1].toUpperCase() : null;
      addFinding({
        kind: 'submit',
        title: 'Legacy Program Coupling via SUBMIT',
        severity: 'Medium',
        confidence: 'High',
        ...(program ? { objectName: program, objectType: 'Program' } : {}),
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
      // Roadmap 3.0.7: the check is assessed (`authority-assessment.ts`). A
      // check that tests only the LOW value of a range, or only the display
      // activity in a program that writes, is reported as what it is; a check
      // that holds stays the Info it was.
      const issues = authority.issues.filter((issue) => issue.line === stmt.line && issue.kind !== 'write-without-check');
      const titles: Record<string, string> = {
        'low-value-only': 'checks only the LOW value of a selection range',
        'display-activity-while-writing': 'checks display (ACTVT 03) while the program changes data',
      };
      addFinding({
        kind: 'authority-check',
        title: issues.length
          ? `Authorization check${issues[0].object ? ` on ${issues[0].object}` : ''} ${[...new Set(issues.map((issue) => titles[issue.kind]))].join(' and ')}`
          : 'Authorization Check (AUTHORITY-CHECK)',
        severity: issues.length ? 'Medium' : 'Info',
        confidence: 'High',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: issues.length ? `AUTHORITY-CHECK statement. ${issues.map((issue) => issue.detail).join(' ')}` : `AUTHORITY-CHECK statement.`,
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
        recommendation: `Remove explicit COMMIT WORK and let the framework (RAP save sequence) or an ${BTP} API broker handle the transaction boundary.`,
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
        recommendation: `Externalize configurations using SAP Destination service, ${BTP} environment variables, or custom configuration tables.`,
        targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP', 'Integration Suite']
      });
    }

    // SAPOffice legacy mailing — a function-module name, read from `text`.
    if (namesModule(text, 'SO_NEW_DOCUMENT_SEND_API1')) {
      addFinding({
        kind: 'legacy-mail',
        title: 'Legacy Mail Service (SO_NEW_DOCUMENT_SEND_API1)',
        severity: 'Medium',
        confidence: 'High',
        objectName: 'SO_NEW_DOCUMENT_SEND_API1',
        objectType: 'Function Module',
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Usage of legacy SAPOffice mail API.`,
        cleanCoreImpact: 'Classic SAPOffice APIs are unreleased and deprecated in S/4HANA Cloud.',
        recommendation: `Migrate to modern BCS (Business Communication Services) APIs, SAP Alert Notification service, or an ${BTP} mail service.`,
        targetOptions: ['Developer Extensibility / RAP', 'Integration Suite']
      });
    }

    // A local call of a function module SAP's files say is no API for customer
    // code (`noAPI`, or `notToBeReleased`) — roadmap 3.0.6. The call used to
    // be "not assessed" while the catalog already said what it was. A
    // `classicAPI` module is answered in the coverage report and raises no
    // finding: classic ABAP may call it. The finding cites SAP's state, never
    // the A–D letter, because findings go into the signed run.
    {
      const local = /^\s*CALL\s+FUNCTION\s+'([^']+)'/i.exec(text);
      if (local && (guideline ? rfcDestinationOf(text) !== 'remote' : !/\bDESTINATION\b/i.test(codeText))) {
        const fm = local[1].toUpperCase();
        const answer = functionModuleCatalogAnswer(fm, catalogSnapshot);
        // Only an earlier finding of this kind stands in for it: the update-task
        // and mail findings name their module too since 11.10.2026, and they
        // say something else about the same call.
        if (answer?.notAnApi && !findings.some((f) => f.kind === 'unreleased-api' && f.lineStart === stmt.line && f.objectName === fm)) {
          addFinding({
            kind: 'unreleased-api',
            title: `Call of function module ${fm}, which SAP lists as ${answer.state}`,
            severity: 'High',
            confidence: 'High',
            objectName: fm,
            objectType: 'Function Module',
            lineStart: stmt.line,
            snippet: text,
            technicalDetail: answer.answer,
            cleanCoreImpact: 'SAP does not offer this function module as an API for customer code, so the call depends on SAP internals that carry no stability contract and is not available in ABAP Cloud.',
            recommendation: 'Replace the call with a released API for the same business object, or wrap the need behind a released interface; check the SAP catalog page of the module for a named successor.',
            targetOptions: ['Developer Extensibility / RAP', 'Side-by-Side CAP'],
            source: 'catalog-match',
          });
        }
      }
    }

    // Credit Management custom logic — the module name is a literal, so `text`.
    if (/Z_CREDIT|CREDIT.*EXPOSURE|CREDIT.*RISK|FSCM/i.test(text) && /CALL\s+FUNCTION/i.test(text)) {
      const creditModule = staticCallTarget(text);
      addFinding({
        kind: 'credit-management',
        title: `Credit Management Custom Logic`,
        severity: 'High',
        confidence: 'High',
        ...(creditModule ? { objectName: creditModule, objectType: 'Function Module' } : {}),
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `Custom credit management function module detected. Evaluate if SAP FSCM / Advanced Credit Management (F1007) can replace this custom risk engine.`,
        cleanCoreImpact: 'Custom credit/risk engines duplicate functionality that SAP Financial Supply Chain Management (FSCM) provides as standard. Maintaining custom logic increases TCO and blocks cloud migration.',
        recommendation: `Evaluate if SAP FSCM / Advanced Credit Management (F1007) covers this use case. If standard coverage is insufficient, implement remaining gap as a Side-by-Side microservice on ${BTP}.`,
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

  // Roadmap 3.0.7 — a program that changes data and checks no authorization
  // at all. Anchored at the first change; kind `authority-check`, so it costs
  // no score points, and Medium, because it is a question for the owners of the
  // authorization concept and not a clean core violation.
  for (const issue of authority.issues.filter((i) => i.kind === 'write-without-check')) {
    addFinding({
      kind: 'authority-check',
      title: 'Data is changed without an authorization check',
      severity: 'Medium',
      confidence: 'High',
      lineStart: issue.line,
      snippet: statements.find((s) => s.line === issue.line)?.text.trim() ?? '',
      technicalDetail: issue.detail,
      cleanCoreImpact: 'Who may run the change is decided only by who may start the program. In ABAP Cloud a RAP business object checks authorization in its own handler; the rule has to be written there.',
      recommendation: 'Decide with the owners of the authorization concept which object and activity guard this change, and check it before the change — in a RAP business object, in its authorization handler.',
      targetOptions: ['Developer Extensibility / RAP', 'Key User Extensibility'],
    });
  }

  // -- 4. Core modifications --
  // Modification markers are full-line comments, which tokenize() drops by
  // design (see declaration-parser.ts). They are therefore scanned against the
  // raw source rather than the statement stream — without this pass the single
  // most severe clean core violation would be invisible to the engine.
  const rawLines = code.split(/\r?\n/);
  const MOD_MARKER = /^\s*[*"]\{\s*(INSERT|REPLACE|DELETE)\b(.*)$/i;
  for (let i = 0; i < rawLines.length; i++) {
    // One finding per modification: only the opening marker `*{` matches, the
    // closing `*}` does not, so each region is counted once. Two regions in the
    // same include under the same transport request are two modifications —
    // they were once merged by request, and the count came out one short.
    const m = rawLines[i].match(MOD_MARKER);
    if (!m) continue;
    const action = m[1].toUpperCase();
    // The marker carries the transport request that registered the modification.
    const requestMatch = m[2].match(/([A-Z0-9]{3}K\d{6})/i);
    const request = requestMatch ? requestMatch[1].toUpperCase() : '';

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

  if (guideline) {
    // The new findings stand where their lines are: each goes in front of the
    // first finding anchored below it, and the ids are counted again in that
    // order. Appended at the end, a program's tasks came after every finding
    // of a program concatenated behind it, and the order of one file's
    // findings depended on what else was in the file (tests/abap-metamorphic,
    // "concatenation is union").
    const before = findings.length;
    addGuidelineFindings();
    const added = findings.splice(before);
    for (const finding of added) {
      const at = findings.findIndex((f) => f.lineStart > finding.lineStart);
      findings.splice(at < 0 ? findings.length : at, 0, finding);
    }
    findings.forEach((finding, index) => { finding.id = `CC-${String(index + 1).padStart(3, '0')}`; });
  }

  /**
   * From 3.0.12 (`GUIDELINE_CHECKS_FROM`) — the checks taken over from the
   * review of the DSAG ABAP guideline (owner decision 13.10.2026), placed by
   * line above. None of these kinds costs score points or drives the route; they
   * are review tasks and successor notes, anchored at their lines.
   */
  function addGuidelineFindings(): void {
    const NOT_A_LEVEL = 'Not a clean core level question: a security review task for the people who own the code. It changes neither the score nor the route.';
    const adbcLines = dependencies.adbc.map((execution) => execution.line);
    // One reading of the statements for the three detectors.
    const read = readStatements(code);
    for (const task of readSecurityReviewTasksFrom(code, read, { adbcLines })) {
      addFinding({
        kind: 'security-review',
        title: `Security review: ${task.title}`,
        severity: task.severity,
        confidence: 'Medium',
        lineStart: task.lineStart,
        snippet: task.text,
        technicalDetail: task.detail,
        cleanCoreImpact: NOT_A_LEVEL,
        recommendation: task.check,
        targetOptions: [],
      });
    }

    // DSAG ABAP guideline: clean-core/what-is-clean-core.md § “NIEMALS SAP CODE KOPIEREN”
    for (const signal of readSapCodeCopySignals(code, fileName, read)) {
      const own = signal.name ? ` ${signal.name}` : '';
      addFinding({
        kind: 'sap-code-copy',
        title: signal.via === 'name'
          ? `Possible copy of SAP code: ${signal.name} repeats SAP's ${signal.sapName}`
          : `Possible copy of SAP code: the header says it is a copy${signal.sapName ? ` of ${signal.sapName}` : ''}`,
        severity: 'Medium',
        confidence: 'Low',
        lineStart: signal.lineStart,
        snippet: signal.via === 'header-comment' ? (signal.comment ?? '') : (statements.find((s) => s.line === signal.lineStart)?.text.trim() ?? signal.name),
        technicalDetail: signal.via === 'name'
          ? `The customer object${own} carries the name of SAP's ${signal.sapName} behind the customer prefix. A name is not proof: the object may be a wrapper, a subclass or an unrelated program.`
          : `A comment in the header of${own || ' the source'} says the code was copied${signal.sapName ? ` from ${signal.sapName}` : ' from SAP standard'}: "${signal.comment ?? ''}".`,
        cleanCoreImpact: 'A copy of SAP code keeps SAP\'s logic without SAP\'s maintenance: corrections and upgrades no longer reach it, and it keeps calling the internals the original called, released or not.',
        recommendation: `Check whether${own || ' the code'} is a copy of SAP code. If it is, compare it with the current SAP original, keep only what differs, and build that difference on a released API or a released extension point (a BAdI where SAP offers one) instead of the copy.`,
        targetOptions: ['Developer Extensibility / RAP'],
      });
    }

    // Parallel processing through asynchronous RFC on this system. Since
    // 3.0.12 a local destination is no `rfc-call` (it never leaves the system);
    // what is left to say is that ABAP Cloud has no asynchronous RFC, and what
    // it offers instead. A call to another system stays an `rfc-call`.
    const parallelClass = getSapObjectStates('CL_ABAP_PARALLEL', catalogSnapshot).releaseState === 'released' ? 'CL_ABAP_PARALLEL' : null;
    for (const stmt of statements) {
      const text = stmt.text.trim();
      if (!/^CALL\s+FUNCTION\b[\s\S]*?\bSTARTING\s+NEW\s+TASK\b/i.test(maskLiterals(text))) continue;
      if (rfcDestinationOf(text) === 'remote') continue;
      const fmName = /^CALL\s+FUNCTION\s+'([\w/]+)'/i.exec(text)?.[1]?.toUpperCase();
      const where = /\bIN\s+GROUP\b/i.test(maskLiterals(text)) ? 'on the application servers of a server group (DESTINATION IN GROUP)' : 'in a new session on this system';
      addFinding({
        kind: 'parallel-processing',
        title: `Parallel processing with asynchronous RFC${fmName ? ` (${fmName})` : ''}`,
        severity: 'Low',
        confidence: 'High',
        ...(fmName ? { objectName: fmName, objectType: 'Function Module' } : {}),
        lineStart: stmt.line,
        snippet: text,
        technicalDetail: `CALL FUNCTION … STARTING NEW TASK runs the function module asynchronously ${where}. The call does not leave the system, so it is no remote call.`,
        cleanCoreImpact: 'Asynchronous RFC is classic ABAP: it may stay on-premise and in SAP Cloud ERP Private, but ABAP Cloud does not offer STARTING NEW TASK. It costs no score points and does not change the route.',
        recommendation: parallelClass
          ? `Keep it while the program runs on-premise or in SAP Cloud ERP Private. For ABAP Cloud, run the parallel work through the released class ${parallelClass} instead.`
          : 'Keep it while the program runs on-premise or in SAP Cloud ERP Private. For ABAP Cloud, run the parallel work through a released parallel-processing API instead.',
        targetOptions: ['Developer Extensibility / RAP'],
      });
    }

    for (const use of readLegacyTechnology(code, read)) {
      const more = use.lines.length > 1 ? ` It is used on ${use.lines.length} lines (${use.lines.slice(0, 8).join(', ')}${use.lines.length > 8 ? ', …' : ''}).` : '';
      if (use.kind === 'bopf') {
        addFinding({
          kind: 'bopf',
          title: use.sapObject ? `BOPF business object framework (${use.objects?.length ?? 1} object${(use.objects?.length ?? 1) > 1 ? 's' : ''})` : `BOPF business object generated from CDS${use.customObject ? ` (${use.customObject})` : ''}`,
          severity: 'Medium',
          confidence: 'High',
          ...(use.sapObject ? { objectName: use.sapObject, objectType: use.objectType ?? 'BOPF object' } : {}),
          lineStart: use.lineStart,
          snippet: use.text,
          technicalDetail: (use.sapObject
            ? `The code uses the Business Object Processing Framework (BOPF): ${(use.objects ?? [use.sapObject]).join(', ')}.`
            : 'The CDS annotations @ObjectModel.transactionalProcessingEnabled / writeActivePersistence generate a BOPF business object from the view.') + more,
          cleanCoreImpact: 'BOPF is a classic programming model. SAP lists its framework classes and interfaces as classic APIs (clean core level B): usable from classic ABAP, not available in ABAP Cloud.',
          recommendation: 'For new development and for a move to ABAP Cloud, model the business object in the ABAP RESTful Application Programming Model (RAP), SAP\'s successor to BOPF; the BOPF object can stay where it runs on-premise or in Private Edition until then.',
          targetOptions: ['Developer Extensibility / RAP'],
        });
      } else if (use.kind === 'gateway-classic-service') {
        addFinding({
          kind: 'gateway-classic-service',
          title: use.customObject
            ? `Classic SAP Gateway service (SEGW): ${use.customObject}`
            : `Classic SAP Gateway service framework: ${use.sapObject}`,
          severity: 'Medium',
          confidence: 'High',
          ...(use.sapObject ? { objectName: use.sapObject, objectType: use.objectType ?? 'Class' } : {}),
          lineStart: use.lineStart,
          snippet: use.text,
          technicalDetail: (use.customObject
            ? `${use.customObject} is a data or model provider class of an OData service built in transaction SEGW.`
            : `The code uses the classic SAP Gateway framework that SEGW services are built on: ${(use.objects ?? [use.sapObject]).join(', ')}.`) + more,
          cleanCoreImpact: 'A SEGW service is classic technology: SAP lists the Gateway framework classes as classic APIs (clean core level B), and ABAP Cloud does not offer them.',
          recommendation: 'Build new OData services in RAP: a service definition with an OData V4 service binding on a RAP business object or a CDS view entity. Rebuild an existing SEGW service that way when it moves to ABAP Cloud or needs substantial change; until then it can stay.',
          targetOptions: ['Developer Extensibility / RAP'],
        });
      } else {
        const append = /sqlViewAppendName/i.test(use.text);
        addFinding({
          kind: 'ddic-cds-view',
          title: `DDIC-based CDS view${use.customObject ? ` ${use.customObject}` : ''} (${append ? 'sqlViewAppendName' : 'sqlViewName'} ${use.sqlViewName})`,
          severity: 'Medium',
          confidence: 'High',
          lineStart: use.lineStart,
          snippet: use.text,
          technicalDetail: `The annotation @AbapCatalog.sqlView${append ? 'Append' : ''}Name generates the DDIC view ${use.sqlViewName} next to the CDS entity: a DDIC-based CDS view.`,
          cleanCoreImpact: 'SAP\'s ABAP language documentation marks DDIC-based CDS views as obsolete. They are not available in ABAP Cloud.',
          recommendation: append
            ? 'Rewrite the extension as a CDS view entity extension (EXTEND VIEW ENTITY) once the extended view is a view entity.'
            : 'Migrate the view to a CDS view entity (DEFINE VIEW ENTITY, no sqlViewName annotation), and point every consumer of the DDIC view at the entity.',
          targetOptions: ['Developer Extensibility / RAP'],
        });
      }
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

  // The catalog answers the local function-module calls it lists (roadmap
  // 3.0.6); the rest stay not assessed.
  const coverage = assessCoverage(code, { answerCall: (name) => functionModuleCatalogAnswer(name, catalogSnapshot) });
  return { findings, coverage, summary };
}

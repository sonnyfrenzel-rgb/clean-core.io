/**
 * ATC Import Parser (roadmap 7.1)
 *
 * Format-tolerant parser for ABAP Test Cockpit (ATC) worklist exports: the
 * CSV/TSV a "Local File" export from the SAP GUI ALV grid produces, or the
 * XLSX/CSV an ADT "Export" produces. Same shape of problem as the usage
 * import (`usage-parser.ts`, v1.22) and deliberately built the same way:
 * column names vary by system, language and export path, so headers are
 * matched by synonym rather than by position, and a row that cannot be read
 * honestly is quarantined with its reason rather than guessed at.
 *
 * Contract: `parseAtc(file) → AtcReport`
 * - Unknown/ambiguous columns → warnings[], never guessed
 * - Missing mandatory column (object name, finding text) → hard, clear error
 * - A row with no object name or no finding text is quarantined, not dropped silently
 * - Personal-data columns (author, reviewer, last changed by) are dropped
 *   before this function returns — see `atc-privacy.ts`
 */

import type { AtcFinding, AtcPriority, AtcQuarantineEntry, AtcReport } from './atc-model';
import { sanitizeAtcFindings } from './atc-privacy';
import { MAX_TABULAR_IMPORT_BYTES, parseTabularRows } from './tabular-import';
import { looksLikeXml, parseAtcXmlText } from './atc-xml';

/**
 * The most findings one import keeps — `ATC_REPORT_MAX_FINDINGS` in
 * `lib/project-commands.ts`, which refuses more; said here first, with the
 * reason, rather than as a refused save (`tests/atc-import-3021.spec.ts` holds
 * the two together).
 */
export const ATC_MAX_FINDINGS = 20000;

// ── Column synonym map (language/version tolerant) ─────────────────

const COLUMN_SYNONYMS: Record<string, string[]> = {
  objectName: ['OBJECT_NAME', 'OBJECT', 'OBJ_NAME', 'OBJEKTNAME', 'PROGRAM', 'PROGNAME', 'INCLUDE', 'CLASS', 'MAIN PROGRAM'],
  objectType: ['OBJECT_TYPE', 'OBJTYPE', 'TYPE', 'TYP', 'OBJEKTTYP'],
  checkId: ['CHECK_ID', 'CHECKID', 'CHECK', 'TEST', 'TEST_ID', 'RULE', 'RULE_ID', 'PRUEFUNG'],
  checkTitle: ['CHECK_TITLE', 'TEST_TITLE', 'CATEGORY', 'KATEGORIE'],
  message: ['MESSAGE', 'MESSAGE_TEXT', 'FINDING', 'TEXT', 'DESCRIPTION', 'MELDUNG', 'MELDUNGSTEXT', 'BESCHREIBUNG'],
  priority: ['PRIORITY', 'PRIO', 'SEVERITY', 'PRIORITAET', 'PRIORITÄT'],
  line: ['LINE', 'ROW', 'LINE_NUMBER', 'POSITION', 'ZEILE'],
  exempted: ['EXEMPTION', 'EXEMPTION_APPROVAL', 'EXEMPTION_STATUS', 'EXEMPTED', 'APPROVAL_STATUS', 'FREISTELLUNG'],
};

const PRIORITY_MAP: Record<string, AtcPriority> = {
  '1': 'error', ERROR: 'error', FEHLER: 'error',
  '2': 'warning', WARNING: 'warning', WARNUNG: 'warning',
  '3': 'info', INFO: 'info', INFORMATION: 'info', NOTE: 'info', NOTIZ: 'info', HINWEIS: 'info',
};

const EXEMPTED_TRUE = new Set(['X', 'TRUE', 'YES', 'JA', 'APPROVED', 'GENEHMIGT', 'EXEMPTED', 'FREIGESTELLT']);
const EXEMPTED_FALSE = new Set(['', 'FALSE', 'NO', 'NEIN', 'NOT APPROVED', 'NICHT GENEHMIGT', 'OPEN', 'OFFEN']);

// ── Public API ─────────────────────────────────────────────────────

/**
 * Parse an ATC worklist export (CSV or XLSX) into an `AtcReport`.
 *
 * @param file - Browser File object from the upload
 */
export async function parseAtc(file: File): Promise<AtcReport> {
  if (/\.xml$/i.test(file.name) || (file.type && /xml/i.test(file.type))) return parseAtcXmlFile(file);
  const rawRows = await parseTabularRows(file);
  if (rawRows.length === 0) {
    throw new Error('The uploaded file contains no data rows. Please check the file format.');
  }

  const headers = Object.keys(rawRows[0]);
  const mapping = resolveColumnMapping(headers);
  const warnings: string[] = [];

  const mappedHeaders = new Set(Object.values(mapping));
  const unmapped = headers.filter((h) => !mappedHeaders.has(h));
  if (unmapped.length > 0) {
    warnings.push(`Unmapped columns ignored: ${unmapped.join(', ')}`);
  }

  if (!mapping.objectName) {
    throw new Error(
      `Could not find an object name column. Expected one of: ${COLUMN_SYNONYMS.objectName.join(', ')}. ` +
      `Found columns: ${headers.join(', ')}`,
    );
  }
  if (!mapping.message) {
    throw new Error(
      `Could not find a finding-text column. Expected one of: ${COLUMN_SYNONYMS.message.join(', ')}. ` +
      `Found columns: ${headers.join(', ')}`,
    );
  }

  // An export with no recognised priority column still names real findings —
  // it just cannot say how severe ATC considered each one. Every finding gets
  // 'unknown', never 'info': an unknown priority is not thereby a minor one
  // (mirrors `usage-parser.ts`'s callCount `null`, never `0`).
  if (!mapping.priority) {
    warnings.push(
      `No priority column recognised (looked for: ${COLUMN_SYNONYMS.priority.join(', ')}). ` +
      `Every imported finding is kept as priority "unknown" rather than assumed to be minor.`,
    );
  }

  const findings: AtcFinding[] = [];
  const quarantined: AtcQuarantineEntry[] = [];
  let unreadablePriorities = 0;

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const objectName = normalizeObjectName(String(row[mapping.objectName!] || ''));
    const reject = (reason: string) => quarantined.push({ row: rowNumber, objectName: objectName || '—', reason });

    if (!objectName) {
      reject('no object name');
      return;
    }

    const message = String(row[mapping.message!] || '').trim();
    if (!message) {
      reject('no finding text');
      return;
    }

    let priority: AtcPriority = 'unknown';
    if (mapping.priority) {
      const raw = String(row[mapping.priority] || '').trim().toUpperCase();
      const mapped = raw ? PRIORITY_MAP[raw] : undefined;
      if (mapped) {
        priority = mapped;
      } else if (raw) {
        unreadablePriorities++;
      }
    }

    const objectType = mapping.objectType ? String(row[mapping.objectType] || '').toUpperCase().trim() : undefined;
    const checkId = mapping.checkId ? String(row[mapping.checkId] || '').trim() : undefined;
    const checkTitle = mapping.checkTitle ? String(row[mapping.checkTitle] || '').trim() : undefined;

    let line: number | undefined;
    if (mapping.line) {
      line = readLineNumber(String(row[mapping.line] || ''));
    }

    let exempted: boolean | undefined;
    if (mapping.exempted) {
      const raw = String(row[mapping.exempted] || '').trim().toUpperCase();
      if (EXEMPTED_TRUE.has(raw)) exempted = true;
      else if (EXEMPTED_FALSE.has(raw)) exempted = false;
      // Anything else (an export's own unrecognised vocabulary) is left
      // undefined rather than guessed toward either answer.
    }

    findings.push({
      objectName,
      objectType: objectType || undefined,
      checkId: checkId || undefined,
      checkTitle: checkTitle || undefined,
      message,
      priority,
      line,
      exempted,
    });
  });

  if (findings.length > ATC_MAX_FINDINGS) {
    throw new Error(`This ATC export holds ${findings.length} findings; one import keeps at most ${ATC_MAX_FINDINGS}. Export only the programs this project covers.`);
  }
  if (quarantined.length > 0) {
    warnings.push(`${quarantined.length} row${quarantined.length === 1 ? '' : 's'} not taken over — see the list of rejected rows.`);
  }
  if (unreadablePriorities > 0) {
    warnings.push(
      `${unreadablePriorities} priorit${unreadablePriorities === 1 ? 'y value' : 'y values'} not recognised and ` +
      `kept as "unknown" — not assumed to be a minor finding.`,
    );
  }

  // Privacy: strip anything beyond the whitelisted fields before this ever
  // leaves the parser (defense in depth — nothing else was ever read into
  // `AtcFinding` above, but this is the same discipline `parseUsage` keeps).
  const sanitized = sanitizeAtcFindings(findings);

  const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  return withoutUndefined({
    findings: sanitized,
    source: 'atc',
    format: 'table',
    quarantined,
    importedAt: new Date().toISOString(),
    warnings,
    retentionExpiresAt,
  });
}

/**
 * An ATC result exported as XML — the ADT worklist or checkstyle
 * (`atc-xml.ts`). Same contract as the table: a row that cannot be read is
 * quarantined with its reason, personal data never reaches a finding, and the
 * file's size is asked before a byte is read.
 */
async function parseAtcXmlFile(file: File): Promise<AtcReport> {
  if (file.size > MAX_TABULAR_IMPORT_BYTES) {
    throw new Error(
      `This file is ${Math.round(file.size / 1024 / 1024)} MB; an import reads at most ${MAX_TABULAR_IMPORT_BYTES / 1024 / 1024} MB. Export only the programs this project covers and upload that file.`,
    );
  }
  const text = await file.text();
  if (!looksLikeXml(text)) throw new Error('This file is named .xml but does not hold XML.');
  const read = parseAtcXmlText(text);
  if (read.findings.length === 0 && read.quarantined.length === 0) {
    throw new Error('This ATC export holds no findings, so there is nothing to compare.');
  }
  if (read.findings.length > ATC_MAX_FINDINGS) {
    throw new Error(`This ATC export holds ${read.findings.length} findings; one import keeps at most ${ATC_MAX_FINDINGS}. Export only the programs this project covers.`);
  }
  const warnings = [...read.warnings];
  if (read.quarantined.length > 0) {
    warnings.push(`${read.quarantined.length} finding${read.quarantined.length === 1 ? '' : 's'} not taken over — see the list of rejected rows.`);
  }
  return withoutUndefined({
    findings: sanitizeAtcFindings(read.findings),
    source: 'atc',
    format: read.format,
    quarantined: read.quarantined,
    importedAt: new Date().toISOString(),
    warnings,
    retentionExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    ...(read.runAt ? { runAt: read.runAt, runAtSource: 'file' as const } : {}),
  });
}

/**
 * The run date a person enters for a file that names none — `YYYY-MM-DD`, not
 * in the future. Returns the report with the date, or the report unchanged when
 * the file already named one (the file wins) or the date is not a real day.
 */
export function withDeclaredRunDate(report: AtcReport, day: string): AtcReport {
  if (report.runAtSource === 'file') return report;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return report;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (at.getUTCDate() !== Number(m[3]) || at.getTime() > Date.now()) return report;
  return { ...report, runAt: at.toISOString(), runAtSource: 'declared' };
}

/** Drop `undefined` at every depth; keep `null`, which is a value. Firestore refuses `undefined`. */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, withoutUndefined(v)]),
    ) as T;
  }
  return value;
}

interface ColumnMapping {
  objectName?: string;
  objectType?: string;
  checkId?: string;
  checkTitle?: string;
  message?: string;
  priority?: string;
  line?: string;
  exempted?: string;
}

function resolveColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const upperHeaders = headers.map((h) => h.toUpperCase().trim());

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const synonym of synonyms) {
      const idx = upperHeaders.indexOf(synonym.toUpperCase());
      if (idx !== -1 && !(field in mapping)) {
        (mapping as Record<string, string>)[field] = headers[idx];
        break;
      }
    }
  }

  return mapping;
}

/**
 * One line number, as a spreadsheet writes it: `412`, or `1.234` / `1,234` /
 * `1 234` with a thousands separator. Anything else — a range `12-14`, a
 * `line 12, column 4` — is not one number, and stripping its non-digits would
 * glue two numbers into a line ATC never reported (`1214`, `124`). It stays
 * unset instead.
 */
function readLineNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!/^\d+$/.test(text) && !/^\d{1,3}(?:([.,'  ])\d{3})(?:\1\d{3})*$/.test(text)) return undefined;
  const parsed = Number(text.replace(/\D/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeObjectName(name: string): string {
  return name.toUpperCase().trim();
}

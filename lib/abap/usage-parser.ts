/**
 * Usage Export Parser (v1.22)
 *
 * Format-tolerant parser for SAP usage exports: SCMON, UPL, ST03N.
 * Supports CSV (with delimiter sniffing: ; , Tab) and XLSX via SheetJS.
 *
 * Contract: `parseUsage(file, hintedSource?) → UsageReport`
 * - Unknown/ambiguous columns → warnings[], never guessed
 * - Missing mandatory column → hard, clear error with example header
 *
 * See §3 of the v1.22 concept.
 */

import {
  RETIREMENT_WINDOW_DAYS,
  type UsageDateLocale,
  type UsageQuarantineEntry,
  type UsageRecord,
  type UsageReport,
  type UsageSource,
} from './usage-model';
import { sanitizeUsageRecords } from './usage-privacy';

/**
 * What the person importing declares (roadmap E03-F02). None of it is inferred
 * from the data: the date format decides how `05.04.2026` is read, and the
 * window decides whether a zero count can mean anything.
 */
export interface UsageImportOptions {
  source?: UsageSource;
  /** Undeclared: dates other than ISO and SAP-internal are quarantined, not guessed. */
  dateLocale?: UsageDateLocale;
  /** The monitoring window, as ISO dates (`YYYY-MM-DD`). */
  window?: { from: string; to: string };
  /** The day of the import, ISO. For tests; defaults to today (UTC). */
  today?: string;
}

// ── Column synonym map (language/version tolerant) ─────────────────

const COLUMN_SYNONYMS: Record<string, string[]> = {
  objectName: ['OBJECT_NAME', 'OBJ_NAME', 'PROGRAM', 'PROGNAME', 'ENTITY', 'OBJEKTNAME', 'REPORT', 'INCLUDE', 'CLASS', 'FUNCTION_MODULE'],
  callCount:  ['CALLS', 'EXECUTIONS', 'COUNT', 'EXEC_COUNT', 'AUFRUFE', 'ANZAHL', 'EXECUTION_COUNT', 'CALL_COUNT', 'FREQUENCY'],
  lastUsed:   ['LAST_USED', 'LAST_EXECUTION', 'LAST_EXEC_DATE', 'LETZTE_AUSFUEHRUNG', 'LETZTE AUSFÜHRUNG', 'LAST_CALL_DATE'],
  objectType: ['OBJECT_TYPE', 'TYPE', 'TADIR', 'TYP', 'OBJ_TYPE', 'SUBC'],
};

// ── Public API ─────────────────────────────────────────────────────

/**
 * Parse a usage export file (CSV or XLSX) into a UsageReport.
 *
 * @param file - Browser File object from the upload
 * @param options - What the importer declared; a bare `UsageSource` is still
 *   accepted for the old call shape
 * @returns Parsed and sanitized UsageReport, free of `undefined` so Firestore
 *   will store it
 */
export async function parseUsage(file: File, options: UsageImportOptions | UsageSource = {}): Promise<UsageReport> {
  const opts: UsageImportOptions = typeof options === 'string' ? { source: options } : options;
  const today = opts.today ?? new Date().toISOString().split('T')[0];
  const window = opts.window ? validateWindow(opts.window, today) : undefined;

  const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const rawRows = isXlsx ? await parseXlsx(file) : await parseCsv(file);

  if (rawRows.length === 0) {
    throw new Error('The uploaded file contains no data rows. Please check the file format.');
  }

  const headers = Object.keys(rawRows[0]);
  const mapping = resolveColumnMapping(headers);
  const warnings: string[] = [];

  // Report unmapped columns
  const mappedHeaders = new Set(Object.values(mapping));
  const unmapped = headers.filter(h => !mappedHeaders.has(h));
  if (unmapped.length > 0) {
    warnings.push(`Unmapped columns ignored: ${unmapped.join(', ')}`);
  }

  // An export with no recognised call-count column is still usable — it carries
  // object names and often last-used dates — but every object in it comes out
  // with unknown usage, and the person who uploaded it has to be told that
  // rather than left to read a matrix full of "unknown" and guess why.
  if (!mapping.callCount) {
    warnings.push(
      `No call-count column recognised (looked for: ${COLUMN_SYNONYMS.callCount.join(', ')}). ` +
      `Usage intensity stays unknown for every object; nothing will be classified as dormant ` +
      `or as a retirement candidate on the strength of missing data.`,
    );
  }

  // Validate mandatory column
  if (!mapping.objectName) {
    throw new Error(
      `Could not find an object name column. Expected one of: ${COLUMN_SYNONYMS.objectName.join(', ')}. ` +
      `Found columns: ${headers.join(', ')}`
    );
  }

  // Detect source if not hinted
  const source = opts.source || detectSource(headers, rawRows);

  // Parse records. A row that cannot be read honestly is quarantined with its
  // reason, never taken over with a guess (E03-F02-US02).
  let records: UsageRecord[] = [];
  const quarantined: UsageQuarantineEntry[] = [];
  let unreadableCounts = 0;

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const objectName = normalizeObjectName(String(row[mapping.objectName!] || ''));
    const reject = (reason: string) => quarantined.push({ row: rowNumber, objectName: objectName || '—', reason });

    if (!objectName) {
      reject('no object name');
      return;
    }

    const callCountRaw = mapping.callCount ? row[mapping.callCount] : undefined;
    const callCount = parseCallCount(callCountRaw);
    if (callCount !== undefined && callCount < 0) {
      reject(`negative call count (${String(callCountRaw).trim()})`);
      return;
    }
    if (callCount === undefined && callCountRaw !== undefined && String(callCountRaw).trim() !== '') {
      unreadableCounts++;
    }

    let lastUsed: string | undefined;
    if (mapping.lastUsed) {
      const date = parseUsageDate(row[mapping.lastUsed], opts.dateLocale);
      if (date && !date.ok) {
        reject(date.reason);
        return;
      }
      lastUsed = date?.value;
      if (lastUsed && lastUsed > today) {
        reject(`last use ${lastUsed} lies after the import date`);
        return;
      }
      if (lastUsed && window && lastUsed > window.to) {
        reject(`last use ${lastUsed} lies after the declared window end ${window.to}`);
        return;
      }
    }

    const objectType = mapping.objectType ? String(row[mapping.objectType] || '').toUpperCase().trim() : undefined;

    records.push({
      objectName,
      objectType: objectType || undefined,
      // Never `?? 0`. See UsageRecord.callCount — absence of a measurement is
      // not a measurement of zero, and downstream it is the difference between
      // "unknown" and "retire this object".
      callCount: callCount ?? null,
      lastUsed,
      source,
    });
  });

  if (quarantined.length > 0) {
    warnings.push(`${quarantined.length} row${quarantined.length === 1 ? '' : 's'} not taken over — see the list of rejected rows.`);
  }
  if (unreadableCounts > 0) {
    warnings.push(
      `${unreadableCounts} call count${unreadableCounts === 1 ? '' : 's'} could not be read and ` +
      `${unreadableCounts === 1 ? 'is' : 'are'} kept as unknown — not as zero.`,
    );
  }

  // UPL: aggregate to object level (class, not method)
  if (source === 'upl') {
    const procedureRows = records.length;
    records = aggregateToObjectLevel(records);
    if (records.length < procedureRows) {
      warnings.push(`UPL data aggregated from ${procedureRows} procedure-level rows to ${records.length} object-level records.`);
    }
  }

  // The span the executions show — reported as observed, never as the window.
  const { observedSpanDays, observedFrom, observedTo } = detectPeriod(records);

  // Apply period to records
  records = records.map(r => ({ ...r, observedSpanDays }));

  // Whether a zero can mean disuse is a question about the declared window.
  if (!window) {
    warnings.push(
      'No monitoring window was declared. Without one, a count of zero says nothing about how long ' +
      'nobody called the object — no object is classified as dormant on a zero count.',
    );
  } else if (window.days < RETIREMENT_WINDOW_DAYS) {
    const coversYearEnd = window.from.slice(0, 4) < window.to.slice(0, 4);
    warnings.push(
      `The declared monitoring window covers ${window.days} days — less than 13 months` +
      `${coversYearEnd ? '' : ', and no year-end'}. Month-end, quarter-end and year-end programs may simply ` +
      'not have run in it: a zero count is not treated as evidence of disuse, and nothing is proposed ' +
      'for retirement on it.',
    );
  }

  // Privacy: sanitize before returning
  const sanitized = sanitizeUsageRecords(records);

  // Compute retention expiry (90 days default)
  const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  // Firestore refuses `undefined` anywhere in a document unless the client is
  // configured to drop it, and ours is not. Every record from an export without
  // a type column carried `objectType: undefined`, so the save on the analyze
  // page threw — and was only logged. The report existed in one browser tab.
  return withoutUndefined({
    records: sanitized,
    source,
    observedSpanDays,
    observedFrom,
    observedTo,
    window,
    dateLocale: opts.dateLocale,
    quarantined,
    importedAt: new Date().toISOString(),
    warnings,
    retentionExpiresAt,
  });
}

/** Drop `undefined` at every depth; keep `null`, which is a value. */
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

/** Days from `from` to `to`, both included. */
function inclusiveDays(from: string, to: string): number {
  const ms = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
    Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * A declared window that cannot be true is refused before anything is read —
 * "unplausible periods are not taken over" (E03-F02). The importer corrects it;
 * nothing is silently clipped.
 */
function validateWindow(w: { from: string; to: string }, today: string): { from: string; to: string; days: number } {
  const from = parseUsageDate(w.from, 'iso');
  const to = parseUsageDate(w.to, 'iso');
  if (!from?.ok || !to?.ok) {
    throw new Error('The monitoring window needs a start and an end date (YYYY-MM-DD).');
  }
  if (from.value > to.value) {
    throw new Error(`The monitoring window ends (${to.value}) before it starts (${from.value}).`);
  }
  if (to.value > today) {
    throw new Error(`The monitoring window ends in the future (${to.value}); an export cannot cover days that have not happened.`);
  }
  return { from: from.value, to: to.value, days: inclusiveDays(from.value, to.value) };
}

// ── CSV Parser with delimiter sniffing ─────────────────────────────

async function parseCsv(file: File): Promise<Record<string, string>[]> {
  const text = await file.text();
  const delimiter = sniffDelimiter(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0], delimiter).map(h => h.trim().toUpperCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  if (tabCount > semiCount && tabCount > commaCount) return '\t';
  if (semiCount > commaCount) return ';';
  return ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ── XLSX Parser ────────────────────────────────────────────────────

/** Coerce an ExcelJS cell value (which may be a Date, formula, hyperlink or rich-text object) to a flat string. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text?: string }>).map(r => r.text ?? '').join('');
    if ('result' in o) return String(o.result ?? '');          // formula → computed result
    if (typeof o.text === 'string') return o.text;               // hyperlink
    return '';
  }
  return String(v);
}

async function parseXlsx(file: File): Promise<Record<string, string>[]> {
  // Migrated from SheetJS (xlsx) to ExcelJS to drop the unfixed xlsx advisory
  // (prototype pollution + ReDoS). Dynamic import keeps exceljs out of the main
  // bundle, matching the testing page's export flow.
  const buffer = await file.arrayBuffer();
  const mod = await import('exceljs');
  // Interop: the browser bundle exposes `.Workbook` directly; CJS/node under `.default`.
  const ExcelJS = ((mod as unknown as { default?: typeof import('exceljs') }).default ?? mod);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('XLSX file contains no worksheets.');

  // First row = headers (uppercased); ExcelJS columns are 1-indexed.
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellToString(cell.value).toUpperCase().trim();
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header row
    const record: Record<string, string> = {};
    let hasValue = false;
    for (let col = 1; col < headers.length; col++) {
      const key = headers[col];
      if (!key) continue;
      const value = cellToString(row.getCell(col).value);
      record[key] = value; // keep empty cells as '' (parity with previous defval:'')
      if (value !== '') hasValue = true;
    }
    if (hasValue) rows.push(record);
  });

  return rows;
}

// ── Column mapping resolution ──────────────────────────────────────

interface ColumnMapping {
  objectName?: string;
  callCount?: string;
  lastUsed?: string;
  objectType?: string;
}

function resolveColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const upperHeaders = headers.map(h => h.toUpperCase().trim());

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

// ── Source detection ───────────────────────────────────────────────

function detectSource(headers: string[], _rows: Record<string, string>[]): UsageSource {
  const joined = headers.join(' ').toUpperCase();

  // SCMON markers: usually has PROGRAM + CALLS or similar
  if (joined.includes('SCMON') || joined.includes('CALL_MONITOR')) return 'scmon';

  // UPL markers: usually has procedure-level detail
  if (joined.includes('UPL') || joined.includes('PROCEDURE') || joined.includes('METHOD')) return 'upl';

  // ST03N markers: transaction-level workload
  if (joined.includes('ST03') || joined.includes('TCODE') || joined.includes('TRANSACTION') || joined.includes('WORKLOAD')) return 'st03n';

  // Fallback: if has call count → generic SCMON-like
  if (joined.includes('CALLS') || joined.includes('EXECUTIONS') || joined.includes('COUNT')) return 'scmon';

  return 'manual';
}

// ── Helper functions ──────────────────────────────────────────────

function normalizeObjectName(name: string): string {
  // Strip leading namespace (e.g., /NAMESPACE/ZPROGRAM → ZPROGRAM for matching)
  // but keep the full name for display
  return name.toUpperCase().trim();
}

/**
 * Parse a call count from SAP usage data.
 * Call counts are ALWAYS integers — decimal results are rounded.
 *
 * Handles locale-ambiguous separators:
 *   - "1.234"   → 1234 (DE thousand sep: dot followed by 3 digits)
 *   - "1,234"   → 1234 (EN thousand sep: comma followed by 3 digits)
 *   - "1234"    → 1234
 *   - "1 234"   → 1234 (space thousand sep)
 *   - "1.234,00" → 1234 (DE decimal format)
 *   - "1,234.00" → 1234 (EN decimal format)
 */
function parseCallCount(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  let str = String(raw).trim().replace(/\s/g, '');

  // Detect DE format: "1.234,56" → dots are thousands, comma is decimal
  if (/\.\d{3},/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  // Detect EN format: "1,234.56" → commas are thousands, dot is decimal
  else if (/,\d{3}\./.test(str)) {
    str = str.replace(/,/g, '');
  }
  // Detect standalone thousand separator: "1.234" or "1,234" (exactly 3 digits after separator)
  else if (/^[\d]+[.,]\d{3}$/.test(str)) {
    str = str.replace(/[.,]/g, '');
  }
  // Detect DE decimal only: "1,5" → treat comma as decimal
  else if (/,/.test(str)) {
    str = str.replace(',', '.');
  }
  // Dot as decimal: "1.5" → keep as-is (will be rounded below)

  const num = Number(str);
  return isNaN(num) ? undefined : Math.round(num);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A calendar date that exists, as ISO — or null. Built from its parts: no Date parsing, no time zone. */
function isoFromParts(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const FORMAT_LABEL: Record<UsageDateLocale, string> = {
  'de-DE': 'DD.MM.YYYY',
  'en-GB': 'DD/MM/YYYY',
  'en-US': 'MM/DD/YYYY',
  iso: 'YYYY-MM-DD',
};

export type UsageDateResult = { ok: true; value: string } | { ok: false; reason: string };

/**
 * Read one date from a usage export, as the importer declared its format.
 * Returns null for an empty cell.
 *
 * This replaces `new Date(text)`, which read `05.04.2026` as 4 May — the
 * engine's own month-first rule — and then `toISOString()` moved it back a day
 * in every time zone east of UTC. A German export's 5 April was stored as
 * 3 May (CR-24). Two forms are unambiguous and always accepted: ISO
 * (`2026-04-05`, optionally with a time) and SAP internal (`20260405`).
 * Everything else is read by the declared order or refused with a reason.
 */
export function parseUsageDate(raw: unknown, locale?: UsageDateLocale): UsageDateResult | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (str === '') return null;

  const fail = (reason: string): UsageDateResult => ({ ok: false, reason });
  const ok = (y: number, m: number, d: number): UsageDateResult => {
    const iso = isoFromParts(y, m, d);
    return iso ? { ok: true, value: iso } : fail(`date '${str}' does not exist`);
  };

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (iso) return ok(+iso[1], +iso[2], +iso[3]);

  const sap = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (sap) return ok(+sap[1], +sap[2], +sap[3]);

  const separated = str.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{2,4})$/);
  if (separated) {
    if (separated[4].length !== 4) return fail(`date '${str}' has a two-digit year`);
    if (!locale) return fail(`date '${str}' is ambiguous — declare the export's date format`);
    if (locale === 'iso') return fail(`date '${str}' is not ${FORMAT_LABEL.iso}, the declared format`);
    const [a, b, y] = [+separated[1], +separated[3], +separated[4]];
    const result = locale === 'en-US' ? ok(y, a, b) : ok(y, b, a);
    return result.ok ? result : fail(`date '${str}' is not a valid ${FORMAT_LABEL[locale]} date`);
  }

  return fail(`date '${str}' is not a recognised date`);
}

/**
 * UPL exports are procedure-level (class.method). Aggregate to object level
 * by summing call counts and taking the latest lastUsed per object.
 */
function aggregateToObjectLevel(records: UsageRecord[]): UsageRecord[] {
  const map = new Map<string, UsageRecord>();

  for (const r of records) {
    // Extract object name: CLASS=>METHOD → CLASS, FUNC_GROUP~FUNC → FUNC_GROUP
    const objName = r.objectName.split(/[=>~.]/)[0].trim().toUpperCase();
    if (!objName) continue;

    const existing = map.get(objName);
    if (existing) {
      // A method with no count contributes nothing; it must not contribute a
      // zero, which would read as a measurement.
      if (r.callCount !== null) {
        existing.callCount = (existing.callCount ?? 0) + r.callCount;
      }
      if (r.lastUsed && (!existing.lastUsed || r.lastUsed > existing.lastUsed)) {
        existing.lastUsed = r.lastUsed;
      }
    } else {
      map.set(objName, { ...r, objectName: objName });
    }
  }

  return Array.from(map.values());
}

/**
 * The span the export actually shows, not the window it was taken over.
 *
 * `observedFrom`/`observedTo` are the first and last execution dates present.
 * When no window was declared, `observedTo` stands in for the window end in the
 * join's "last used 13 months ago" rule — the safe direction: the last execution
 * seen is never later than the true export end, so objects come out less
 * dormant, not more.
 *
 * The window itself is declared by the importer (E03-F02). Nothing in an SCMON
 * or UPL export says how long the monitoring ran, and deriving it from the
 * executions reported "two days" for a year of data.
 */
function detectPeriod(records: UsageRecord[]): { observedSpanDays?: number; observedFrom?: string; observedTo?: string } {
  const dates = records
    .map(r => r.lastUsed)
    .filter((d): d is string => !!d)
    .sort();

  if (dates.length < 2) return {};

  const from = dates[0];
  const to = dates[dates.length - 1];
  const observedSpanDays = Math.max(1, inclusiveDays(from, to) - 1);

  return { observedSpanDays, observedFrom: from, observedTo: to };
}

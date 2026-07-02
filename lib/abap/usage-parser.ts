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

import * as XLSX from 'xlsx';
import type { UsageRecord, UsageReport, UsageSource } from './usage-model';
import { sanitizeUsageRecords } from './usage-privacy';

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
 * @param hintedSource - Optional: user-selected source (scmon/upl/st03n); auto-detected if omitted
 * @returns Parsed and sanitized UsageReport
 */
export async function parseUsage(file: File, hintedSource?: UsageSource): Promise<UsageReport> {
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

  // Validate mandatory column
  if (!mapping.objectName) {
    throw new Error(
      `Could not find an object name column. Expected one of: ${COLUMN_SYNONYMS.objectName.join(', ')}. ` +
      `Found columns: ${headers.join(', ')}`
    );
  }

  // Detect source if not hinted
  const source = hintedSource || detectSource(headers, rawRows);

  // Parse records
  let records: UsageRecord[] = [];

  for (const row of rawRows) {
    const objectName = normalizeObjectName(String(row[mapping.objectName] || ''));
    if (!objectName) continue;

    const callCountRaw = mapping.callCount ? row[mapping.callCount] : undefined;
    const callCount = parseCallCount(callCountRaw);
    const lastUsed = mapping.lastUsed ? parseDate(row[mapping.lastUsed]) : undefined;
    const objectType = mapping.objectType ? String(row[mapping.objectType] || '').toUpperCase().trim() : undefined;

    records.push({
      objectName,
      objectType: objectType || undefined,
      callCount: callCount ?? 0,
      lastUsed,
      source,
    });
  }

  // UPL: aggregate to object level (class, not method)
  if (source === 'upl') {
    records = aggregateToObjectLevel(records);
    if (records.length < rawRows.length) {
      warnings.push(`UPL data aggregated from ${rawRows.length} procedure-level rows to ${records.length} object-level records.`);
    }
  }

  // Detect measurement period from data
  const { periodDays, measuredFrom, measuredTo } = detectPeriod(records);

  // Apply period to records
  records = records.map(r => ({ ...r, periodDays }));

  // Privacy: sanitize before returning
  const sanitized = sanitizeUsageRecords(records);

  // Compute retention expiry (90 days default)
  const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  return {
    records: sanitized,
    source,
    periodDays,
    measuredFrom,
    measuredTo,
    importedAt: new Date().toISOString(),
    warnings,
    retentionExpiresAt,
  };
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

async function parseXlsx(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('XLSX file contains no worksheets.');

  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  // Normalize all keys to uppercase
  return jsonData.map(row => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.toUpperCase().trim()] = String(value ?? '');
    }
    return normalized;
  });
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

function parseDate(raw: unknown): string | undefined {
  if (!raw || String(raw).trim() === '') return undefined;
  const str = String(raw).trim();

  // Try ISO format first
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate.toISOString().split('T')[0];

  // Try DD.MM.YYYY (German/SAP format)
  const deMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) {
    const d = new Date(`${deMatch[3]}-${deMatch[2].padStart(2, '0')}-${deMatch[1].padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  // Try YYYYMMDD (SAP internal format)
  const sapMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (sapMatch) {
    const d = new Date(`${sapMatch[1]}-${sapMatch[2]}-${sapMatch[3]}`);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  return undefined;
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
      existing.callCount += r.callCount;
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
 * Detect measurement period from the data (lastUsed dates).
 */
function detectPeriod(records: UsageRecord[]): { periodDays?: number; measuredFrom?: string; measuredTo?: string } {
  const dates = records
    .map(r => r.lastUsed)
    .filter((d): d is string => !!d)
    .sort();

  if (dates.length < 2) return {};

  const from = dates[0];
  const to = dates[dates.length - 1];
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  const periodDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return { periodDays, measuredFrom: from, measuredTo: to };
}

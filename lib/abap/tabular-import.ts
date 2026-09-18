/**
 * Shared tabular file reading — CSV (delimiter-sniffed) and XLSX — for the
 * format-tolerant importers (`usage-parser.ts` since v1.22, `atc-parser.ts`
 * since roadmap 7.1).
 *
 * Extracted out of `usage-parser.ts` rather than duplicated a second time: the
 * two importers read the same two file shapes for the same reason (a
 * spreadsheet is a compressed archive, a delimiter is not declared by any SAP
 * export), and a second private copy of this would be exactly the kind of
 * drift `lib/abap/usage-privacy.ts`'s `isPiiColumn` comment already warns
 * against for a different pair of modules.
 *
 * This module only turns a file into rows of `Record<uppercaseHeader, string>`
 * — headers upper-cased, empty cells kept as `''`. Column mapping, mandatory
 * fields and everything else domain-specific stays in each importer.
 */

/** Coerce an ExcelJS cell value (which may be a Date, formula, hyperlink or rich-text object) to a flat string. */
export function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
    if ('result' in o) return String(o.result ?? '');          // formula → computed result
    if (typeof o.text === 'string') return o.text;               // hyperlink
    return '';
  }
  return String(v);
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

/** CSV/TSV text, delimiter sniffed from the header line, headers upper-cased. */
export async function parseCsvRows(file: File): Promise<Record<string, string>[]> {
  const text = await file.text();
  const delimiter = sniffDelimiter(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim().toUpperCase());
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

/** XLSX, first sheet, first row as headers (upper-cased). Loaded via a dynamic `exceljs` import so it stays out of the main bundle. */
export async function parseXlsxRows(file: File): Promise<Record<string, string>[]> {
  // Migrated from SheetJS (xlsx) to ExcelJS to drop the unfixed xlsx advisory
  // (prototype pollution + ReDoS) — see usage-parser.ts's original comment.
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

/** `.xlsx`/`.xls` by extension; everything else is read as delimited text. */
export function isXlsxFile(name: string): boolean {
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

/** Read any supported tabular file (CSV/TSV or XLSX) into uppercase-keyed rows. */
export async function parseTabularRows(file: File): Promise<Record<string, string>[]> {
  return isXlsxFile(file.name) ? parseXlsxRows(file) : parseCsvRows(file);
}

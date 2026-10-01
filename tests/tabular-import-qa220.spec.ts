/**
 * The tabular reader keeps quoted line breaks and sorts spreadsheets by content.
 *
 * QA full review of v2.20.0 (fc787674705f): 82ca0fe444ab, 88143a36e400.
 *
 * Serverless: File objects in memory.
 */
import { test, expect } from '@playwright/test';
import { parseTabularRows, isXlsxFile } from '../lib/abap/tabular-import';

test('82ca0fe444ab — a quoted field with a line break stays one record', async () => {
  const csv = 'OBJECT_NAME,DESCRIPTION,CALLS\r\nZPROG_A,"first line\r\nsecond line",5\r\nZPROG_B,"say ""hi""",7\r\n';
  const rows = await parseTabularRows(new File([csv], 'usage.csv'));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toEqual({ OBJECT_NAME: 'ZPROG_A', DESCRIPTION: 'first line\r\nsecond line', CALLS: '5' });
  expect(rows[1]).toEqual({ OBJECT_NAME: 'ZPROG_B', DESCRIPTION: 'say "hi"', CALLS: '7' });
});

test('88143a36e400 — an upper-case .XLSX is read as a workbook', async () => {
  expect(isXlsxFile('EXPORT.XLSX')).toBe(true);
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof import('exceljs') }).default ?? mod);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('usage');
  sheet.addRow(['OBJECT_NAME', 'CALLS']);
  sheet.addRow(['ZPROG_A', 5]);
  const buffer = await workbook.xlsx.writeBuffer();
  const rows = await parseTabularRows(new File([buffer as ArrayBuffer], 'EXPORT.XLSX'));
  expect(rows).toEqual([{ OBJECT_NAME: 'ZPROG_A', CALLS: '5' }]);
});

test('88143a36e400 — a binary .xls is refused with a sentence, a text .xls is read as text', async () => {
  const biff = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await expect(parseTabularRows(new File([biff], 'old.xls'))).rejects.toThrow(/legacy Excel workbook.*\.xlsx or as CSV/);
  // SAP GUI's "spreadsheet" download: tab-delimited text under an .xls name.
  const rows = await parseTabularRows(new File(['OBJECT_NAME\tCALLS\nZPROG_A\t5\n'], 'sapgui.XLS'));
  expect(rows).toEqual([{ OBJECT_NAME: 'ZPROG_A', CALLS: '5' }]);
});

/**
 * The overview as files — roadmap 3.0.21 (3): CSV and XLSX.
 *
 * Built in the browser from the overview the server answered, so an export is
 * exactly what the screen shows; nothing is computed here that the view did
 * not compute. Every file says what it is (`PORTFOLIO_EXPORT_NOTE`): read-only,
 * not signed, not an audit pack, no portfolio score.
 *
 * Only libraries already in `package.json`: the CSV is text with
 * `lib/csv-formula.ts`'s formula guard on every cell; the workbook is written
 * with `exceljs`, which the caller loads on the click (`import('exceljs')`) and
 * hands in, so it never joins the page's bundle.
 */

import { csvCell, startsLikeFormula } from '../csv-formula';
import { bucketCountsOf, levelCountsOf, type PortfolioView, type ProgramFacts } from './aggregate';
import { scoreBand } from '../clean-core-score';
import {
  PORTFOLIO_EXPORT_NOTE,
  portfolioBucketLabel,
  portfolioCoverage,
  portfolioNotDeterminedLabel,
} from '../messages/portfolio';

export const PROGRAM_COLUMNS = [
  'Program',
  'Project id',
  'Analysed',
  'Score',
  'Score band',
  'Level A',
  'Level B',
  'Level C',
  'Level D',
  'Level unknown',
  'Retire',
  'Keep',
  'Rebuild',
  'No catalogued path',
  'Not assigned',
  'Includes not read',
  'Findings',
] as const;

/** One program as a row of plain values, in `PROGRAM_COLUMNS` order. */
export function programRow(p: ProgramFacts): (string | number)[] {
  const levels = levelCountsOf(p);
  const buckets = bucketCountsOf(p);
  return [
    p.name,
    p.projectId,
    p.analysed ? 'yes' : 'no',
    typeof p.score === 'number' ? p.score : '',
    typeof p.score === 'number' ? scoreBand(p.score).label : '',
    levels.A,
    levels.B,
    levels.C,
    levels.D,
    levels.Unknown,
    buckets.retire,
    buckets.keep,
    buckets.rebuild,
    buckets['no-catalogued-path'],
    buckets['not-assigned'],
    p.includesNotRead.join(' '),
    p.kinds.reduce((n, k) => n + k.count, 0),
  ];
}

/** The programs table as RFC 4180 CSV, every cell formula-guarded, CRLF line ends. */
export function portfolioCsv(view: PortfolioView): string {
  const lines = [PROGRAM_COLUMNS.map(csvCell).join(','), ...view.programs.map((p) => programRow(p).map(csvCell).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

/** The parts of `exceljs` the workbook uses — the caller passes the loaded module. */
interface ExcelLike {
  Workbook: new () => {
    description: string;
    addWorksheet(name: string): {
      columns: { header: string; key?: string; width?: number }[];
      addRow(values: (string | number)[]): unknown;
    };
    xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array> };
  };
}

/** A text cell a spreadsheet would run as a formula is written as text. */
function safe(value: string | number): string | number {
  if (typeof value === 'number') return value;
  return startsLikeFormula(value) ? `'${value}` : value;
}

/** The workbook: overview, programs, recurring SAP objects, kinds of finding, not determined. */
export async function portfolioWorkbook(ExcelJS: ExcelLike, view: PortfolioView, title: string): Promise<ArrayBuffer | Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.description = PORTFOLIO_EXPORT_NOTE;

  const overview = wb.addWorksheet('Overview');
  overview.columns = [
    { header: 'Figure', width: 48 },
    { header: 'Count', width: 12 },
    { header: 'Programs', width: 12 },
  ];
  overview.addRow([safe(title), '', '']);
  overview.addRow([safe(portfolioCoverage(view.coverage)), '', '']);
  overview.addRow([PORTFOLIO_EXPORT_NOTE, '', '']);
  overview.addRow(['', '', '']);
  for (const b of view.bands) overview.addRow([`Score band ${b.range} · ${b.label}`, b.programs.length, b.programs.length]);
  for (const l of view.levels) overview.addRow([`Level ${l.grade === 'Unknown' ? 'unknown' : l.grade} (object uses)`, l.uses, l.programs.length]);
  for (const b of view.buckets) overview.addRow([`${portfolioBucketLabel(b.bucket)} (objects)`, b.objects, b.programs.length]);

  const programs = wb.addWorksheet('Programs');
  programs.columns = PROGRAM_COLUMNS.map((header) => ({ header, width: header === 'Program' ? 32 : 14 }));
  for (const p of view.programs) programs.addRow(programRow(p).map(safe));

  const recurring = wb.addWorksheet('Recurring SAP objects');
  recurring.columns = [
    { header: 'SAP object', width: 28 },
    { header: 'Use', width: 10 },
    { header: 'Programs', width: 10 },
    { header: 'Program names', width: 80 },
  ];
  for (const r of view.recurring) recurring.addRow([safe(r.object), r.use, r.programs.length, safe(r.programs.map((p) => p.name).join(', '))]);

  const kinds = wb.addWorksheet('Kinds of finding');
  kinds.columns = [
    { header: 'Kind of finding', width: 40 },
    { header: 'Findings', width: 10 },
    { header: 'Programs', width: 10 },
    { header: 'Program names', width: 80 },
  ];
  for (const k of view.kinds) kinds.addRow([safe(k.label), k.findings, k.programs.length, safe(k.programs.map((p) => p.name).join(', '))]);

  const nd = wb.addWorksheet('Not determined');
  nd.columns = [
    { header: 'What is not determined', width: 70 },
    { header: 'Programs', width: 10 },
    { header: 'Objects', width: 10 },
    { header: 'Program names', width: 80 },
  ];
  for (const f of view.notDetermined) {
    nd.addRow([portfolioNotDeterminedLabel(f.key), f.programs.length, f.objects ?? '', safe(f.programs.map((p) => p.name).join(', '))]);
  }

  return wb.xlsx.writeBuffer();
}

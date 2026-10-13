import { test, expect } from '@playwright/test';
import { csvCell, startsLikeFormula } from '../lib/csv-formula';
import { ruleCsvField } from '../lib/rule-register';
import { generateFindingsCsv } from '../lib/audit-pack';
import type { Project } from '../lib/types';

/** SEC-2026-803: a spreadsheet skips leading spaces before a formula sign. */
test('a formula after leading spaces is neutralised, in every CSV the app writes', () => {
  for (const v of ['=1+1', '  =HYPERLINK("http://x","y")', ' +A1', ' -2+3', ' @SUM(A1)', '\t1', '\r=1', '\n=1']) {
    expect(startsLikeFormula(v), JSON.stringify(v)).toBe(true);
    expect(csvCell(v).startsWith(`"'`), JSON.stringify(v)).toBe(true);
    expect(ruleCsvField(v)).toBe(csvCell(v));
  }
});

test('plain data stays as it is: numbers, text, inner signs', () => {
  for (const v of ['-12.5', '+3', '42', 'Plant 1000', 'a=b', 'net - gross', '']) {
    expect(startsLikeFormula(v), JSON.stringify(v)).toBe(false);
  }
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
});

/*
 * QA 66ac45d0f884: the audit pack's 03-findings.csv itself, not only the cell
 * helper — every column a finding or a coupling row fills, each with a formula
 * behind leading spaces. A field the exporter wrote past `csvCell` would reach
 * the file as `"  =…"` and fail here.
 */
test('the audit pack\'s findings CSV neutralises a formula after leading spaces in every column', () => {
  const f = (col: string) => `  =HYPERLINK("http://x","${col}")`;
  const project = {
    worklist: [
      { id: 'w1', title: f('title'), category: 'Finding', severity: f('severity'), location: f('location'), recommendation: f('recommendation'), status: 'open', effort: 'Low' },
    ],
    dataCoupling: [
      { tableName: f('table'), riskLevel: ' +A1', accessType: ' @SUM(A1)', isCustom: true, recommendation: '\t-2+3' },
    ],
  } as unknown as Project;
  const csv = generateFindingsCsv(project);
  for (const v of [f('title'), f('severity'), f('location'), f('recommendation'), f('table'), ' +A1', ' @SUM(A1)', '\t-2+3']) {
    expect(csv, JSON.stringify(v)).toContain(`,${csvCell(v)}`);
    expect(csvCell(v).startsWith(`"'`), JSON.stringify(v)).toBe(true);
    // The unguarded cell — the value quoted but not prefixed — is nowhere in the file.
    expect(csv, JSON.stringify(v)).not.toContain(`,"${v.replace(/"/g, '""')}"`);
  }
});

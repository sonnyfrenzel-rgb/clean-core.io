import { test, expect } from '@playwright/test';
import { csvCell, startsLikeFormula } from '../lib/csv-formula';
import { ruleCsvField } from '../lib/rule-register';

/** SEC-2026-803: a spreadsheet skips leading spaces before a formula sign. */
test('a formula after leading spaces is neutralised, in every CSV the app writes', () => {
  for (const v of ['=1+1', '  =HYPERLINK("http://x","y")', ' +A1', ' -2+3', ' @SUM(A1)', '\t1', '\r=1', '\n=1']) {
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

import { test, expect } from '@playwright/test';
import { caseUse, usedIn } from './prozess-benchmark/dictionary-review';

/**
 * The dictionary review list (`tests/prozess-benchmark/dictionary-review.ts`) counts a domain value only in the
 * cases that write that value for the field, not in every case that names the field. Server-free; reads no case.
 */
test('two values of one field are counted apart: only the value the source writes counts', () => {
  const cases = [
    caseUse("REPORT z1.\nSELECT SINGLE * FROM vbuk INTO @DATA(ls) WHERE gbstk = 'A'.\n"),
    caseUse("REPORT z2.\nIF ls_vbuk-gbstk = 'C'.\n  WRITE 'done'.\nENDIF.\n"),
    caseUse("REPORT z3.\nDATA lv_gbstk TYPE gbstk.\n"),
    caseUse("REPORT z4.\nWRITE 'A'.\n"),
  ];
  expect(usedIn(cases, 'gbstk')).toBe(3);
  expect(usedIn(cases, 'gbstk', 'A')).toBe(1);
  expect(usedIn(cases, 'gbstk', 'C')).toBe(1);
  expect(usedIn(cases, 'gbstk', 'B')).toBe(0);
});

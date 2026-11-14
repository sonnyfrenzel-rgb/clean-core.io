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

test('a literal elsewhere in the case does not count as a value of the field', () => {
  const cases = [
    caseUse("REPORT z5.\nIF ls_vbuk-gbstk = 'A'.\n  lv_mode = 'B'.\nENDIF.\n"),
    caseUse("REPORT z6.\nlv_gbstk = 'C'.\nIF 'B' EQ ls_vbuk-gbstk.\nENDIF.\n"),
  ];
  expect(usedIn(cases, 'gbstk')).toBe(2);
  expect(usedIn(cases, 'gbstk', 'A')).toBe(1);
  // z5 writes 'B' to another field; z6 compares 'B' with the field, value first.
  expect(usedIn(cases, 'gbstk', 'B')).toBe(1);
  expect(usedIn(cases, 'gbstk', 'C')).toBe(1);
});

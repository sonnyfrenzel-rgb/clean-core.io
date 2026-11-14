import { test, expect } from '@playwright/test';
import { caseUse, usedIn } from './prozess-benchmark/dictionary-review';

/**
 * The dictionary review list (`tests/prozess-benchmark/dictionary-review.ts`) counts a domain value only in the
 * cases whose source names the field and spells that value as a literal — read, compared or assigned alike: the list
 * says how often a code occurs in the learn cases, not how often it is set. A case that names the field without the
 * value, or the value without the field, does not count it. Server-free; reads no case.
 */
test('two values of one field are counted apart: a value counts where the source names the field and spells the value', () => {
  const cases = [
    caseUse("REPORT z1.\nSELECT SINGLE * FROM vbuk INTO @DATA(ls) WHERE gbstk = 'A'.\n"),
    caseUse("REPORT z2.\nIF ls_vbuk-gbstk = 'C'.\n  WRITE 'done'.\nENDIF.\n"),
    caseUse("REPORT z3.\nDATA lv_gbstk TYPE gbstk.\n"),
    caseUse("REPORT z4.\nWRITE 'A'.\n"),
    caseUse("REPORT z5.\nDATA ls_vbuk TYPE vbuk.\nls_vbuk-gbstk = 'B'.\n"),
  ];
  expect(usedIn(cases, 'gbstk')).toBe(4);
  expect(usedIn(cases, 'gbstk', 'A')).toBe(1);
  expect(usedIn(cases, 'gbstk', 'C')).toBe(1);
  expect(usedIn(cases, 'gbstk', 'B')).toBe(1);
  expect(usedIn(cases, 'gbstk', 'D')).toBe(0);
});

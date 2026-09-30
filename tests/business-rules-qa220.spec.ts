import { test, expect } from '@playwright/test';
import { readBusinessRules } from '../lib/abap/business-rules';

/**
 * QA full review of v2.20.0, slice A (db335c817937): in `land1 NOT IN ( … )` and
 * `amount NOT BETWEEN … AND …` the word before the operator is `NOT`, and the
 * rule candidate was named after the keyword instead of the field. The negation
 * is kept in the operator.
 */

const candidates = (code: string) => readBusinessRules(code).candidates;

test('NOT IN names the field, and says NOT IN', () => {
  const found = candidates([
    'REPORT zqa.',
    "IF ls_customer-land1 NOT IN ( 'DE', 'AT' ).",
    '  RETURN.',
    'ENDIF.',
  ].join('\n'));
  const rule = found.find((c) => c.values.includes('DE'));
  expect(rule, 'the list is read as a rule candidate').toBeTruthy();
  expect(rule!.subject).toBe('ls_customer-land1');
  expect(rule!.operator).toBe('NOT IN');
});

test('NOT BETWEEN names the field, and says NOT BETWEEN', () => {
  const found = candidates([
    'REPORT zqa.',
    'IF ls_order-netwr NOT BETWEEN 1000 AND 5000.',
    '  RETURN.',
    'ENDIF.',
  ].join('\n'));
  const rule = found.find((c) => c.values.includes('1000'));
  expect(rule, 'the range is read as a rule candidate').toBeTruthy();
  expect(rule!.subject).toBe('ls_order-netwr');
  expect(rule!.operator).toBe('NOT BETWEEN');
});

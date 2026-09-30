/**
 * A screen number held in a variable is not a named screen.
 *
 * QA full review of v2.20.0 (fc787674705f), 3001cbbf16e1.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { deriveUserChange } from '../lib/abap/user-change';

const screenRecords = (statement: string) =>
  deriveUserChange(['REPORT zt.', 'START-OF-SELECTION.', `  ${statement}`].join('\n')).records.filter(
    (r) => r.carrier === 'screen',
  );

test('3001cbbf16e1 — CALL SCREEN lv_dynnr leaves the screen not determined', () => {
  const [record] = screenRecords('CALL SCREEN lv_dynnr.');
  expect(record, 'the call is still a carrier').toBeDefined();
  expect(record.carrierToday.statement ?? '').not.toMatch(/screen LV_DYNNR/i);
  expect(record.carrierToday.provenance).toBe('not-determined');
  expect(record.carrierToday.notDetermined?.detail).toMatch(/lv_dynnr/);
});

test('3001cbbf16e1 — CALL SCREEN 9000 still names the screen', () => {
  const [record] = screenRecords('CALL SCREEN 9000.');
  expect(record.carrierToday.statement).toMatch(/calls screen 9000/);
});

import { test, expect } from '@playwright/test';
import {
  computeComplexityScore,
  computeCriticalityScore,
  extractCodeInventory,
  extractDataCoupling,
} from '../lib/abap/code-assessment';

/**
 * QA full review of v2.20.0, slice A — the code assessment.
 *
 *   cd912f8a3342  `CLASS /ACME/CL_ORDER DEFINITION` was missing from the inventory.
 *   79feb913cfec  `FUNCTION-POOL zfg_orders.` was never inventoried.
 *   ca3b46a76794  a hand-written replacement in this file was labelled 'Verified'.
 *   ac1073840c50  comments and literals moved the complexity and criticality scores.
 */

const src = (...lines: string[]) => lines.join('\n');

test('comments and literals do not move the scores', () => {
  const code = src(
    'REPORT zqa.',
    'DATA lv_x TYPE i.',
    'IF lv_x > 1.',
    '  lv_x = 2.',
    'ENDIF.',
  );
  const noisy = src(
    'REPORT zqa.',
    '* UPDATE bseg, CREDIT, AUDIT, INVOICE, BILLING, DUNNING - a note, nothing runs',
    ...Array.from({ length: 200 }, (_, i) => `* comment line ${i} about BKPF and VBAK`),
    "DATA lv_x TYPE i. \" DELETE FROM bseg",
    "DATA lv_msg TYPE string VALUE 'UPDATE BSEG CREDIT AUDIT'.",
    'IF lv_x > 1.',
    '  lv_x = 2.',
    'ENDIF.',
  );
  expect(computeComplexityScore(noisy)).toBe(computeComplexityScore(code));
  expect(computeCriticalityScore(noisy)).toBe(computeCriticalityScore(code));
});

test('a called function module name still counts for criticality', () => {
  const plain = src('REPORT zqa.', 'CALL FUNCTION lv_fm.');
  const credit = src('REPORT zqa.', "CALL FUNCTION 'Z_CREDIT_AUDIT_INVOICE_READ'.");
  expect(computeCriticalityScore(credit)).toBeGreaterThan(computeCriticalityScore(plain));
});

import { test, expect } from '@playwright/test';
import { readSource } from '../lib/first-look';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { readDemoSwitches } from '../lib/abap/demo-switches';
import { deriveCounterCheckScenarios } from '../lib/abap/counter-check';
import { readProgramDomain } from '../lib/abap/program-domain';
import { readSecurityReviewTasks } from '../lib/abap/security-review';
import { readAbapProxies } from '../lib/abap/engine-rules';
import { readStatements } from '../lib/abap/statement-reader';

/**
 * QA review of ee72ca2218e1 (3.0.20 engine). Server-free.
 */

test.describe('a "no limit" cap in the baskets is read for the run\'s engine', () => {
  const SOURCE = [
    'REPORT zsd_qty_check.',
    'DATA ls_order TYPE vbap.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM vbap INTO ls_order.',
    '  IF ls_order-kwmeng > 999999.',
    "    MESSAGE 'Quantity too large' TYPE 'E'.",
    '  ENDIF.',
    '',
  ].join('\n');

  const basketOf = (engineVersion: string) => {
    const reading = readSource(SOURCE, engineVersion);
    const ex = explainBusinessRules(SOURCE, reading.ruleSet, buildProcessFacts(SOURCE), engineVersion);
    const rule = reading.ruleSet.rules.find((r) => /999999/.test(r.label));
    expect(rule, 'no rule on the cap').toBeTruthy();
    return ex.rules.find((r) => r.id === rule!.id)!.basket;
  };

  test('engine 3.0.20 reads it as a technical cap; a 3.0.19 run keeps the rule out of that basket', () => {
    expect(basketOf('v3.0.20').reason.text).toMatch(/no limit/);
    const old = basketOf('v3.0.19');
    expect(old.reason.text).not.toMatch(/no limit/);
  });
});

test.describe('a test data switch by shape counts only rows the arms fill themselves', () => {
  const arm = (n: number, row: string) => [`    WHEN ${n}.`, ...row.split('\n').map((l) => `      ${l}`)].join('\n');
  const program = (fill: (n: number) => string) => [
    'REPORT zsd_order_list.',
    'PARAMETERS p_case TYPE i.',
    'DATA ls_order TYPE vbak.',
    'DATA lt_orders TYPE STANDARD TABLE OF vbak.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM vbak INTO ls_order.',
    '  CASE p_case.',
    ...[1, 2, 3, 4, 5].map((n) => arm(n, fill(n))),
    '  ENDCASE.',
    '',
  ].join('\n');

  test('one field set from a literal does not make a row read from the database test data', () => {
    const partly = program((n) => `ls_order-auart = 'T${n}'.\nAPPEND ls_order TO lt_orders.`);
    expect(readDemoSwitches(partly, 'v3.0.20')).toBeNull();
  });

  test('a row the arm clears and then fills from literals still counts', () => {
    const whole = program((n) => `CLEAR ls_order.\nls_order-auart = 'T${n}'.\nAPPEND ls_order TO lt_orders.`);
    expect(readDemoSwitches(whole, 'v3.0.20')?.flag.name).toBe('P_CASE');
  });
});

test.describe('counter-check scenarios are derived for the engine a run was made with', () => {
  // Without a demo flag, a CASE whose five arms only append rows of literals is a test data switch from 3.0.20 on.
  const SWITCH = [
    'REPORT zsd_order_list.',
    'PARAMETERS p_case TYPE i.',
    'DATA lt_orders TYPE STANDARD TABLE OF vbak.',
    'START-OF-SELECTION.',
    '  CASE p_case.',
    ...[1, 2, 3, 4, 5].map((n) => `    WHEN ${n}.\n      APPEND VALUE #( auart = 'T${n}' ) TO lt_orders.`),
    '  ENDCASE.',
    '',
  ].join('\n');

  test('a 3.0.19 run keeps the arms as rules; 3.0.20 sets them apart', () => {
    const before = deriveCounterCheckScenarios(SWITCH, 'v3.0.19');
    const after = deriveCounterCheckScenarios(SWITCH, 'v3.0.20');
    expect(before.counts.rules).toBeGreaterThan(after.counts.rules);
    expect(deriveCounterCheckScenarios(SWITCH).counts.rules).toBe(after.counts.rules);
  });
});

test.describe('a tolerance is applied only when a business value is compared with it', () => {
  const declared = 'REPORT zmm_invoice_check.\nPARAMETERS p_tol TYPE p DECIMALS 2 DEFAULT 5.\nDATA gv_invoice TYPE belnr_d.\nSELECT SINGLE belnr FROM rbkp INTO gv_invoice.\n';

  test('a check of the entry against a fixed value is not the tolerance applied', () => {
    const entry = `${declared}IF p_tol > 0.\n  MESSAGE 'Tolerance set' TYPE 'I'.\nENDIF.\nIF 100 < p_tol.\n  MESSAGE 'Too large' TYPE 'E'.\nENDIF.\n`;
    expect(readProgramDomain(entry)?.text ?? '').not.toMatch(/tolerance/);
  });

  test('a business value compared with it still is', () => {
    const applied = `${declared}IF p_tol > 0 AND gv_invoice > p_tol.\n  WRITE / gv_invoice.\nENDIF.\n`;
    expect(readProgramDomain(applied)?.text ?? '').toMatch(/, within a tolerance\.$/);
  });
});

// QA 0dfaf629e946: an ENDSELECT read as a loop close can only make the CHECK cover less, never more —
// the access after the enclosing ENDDO stays a task.
test.describe('security review: a SELECT with PACKAGE SIZE nested in the CHECK loop', () => {
  const VALIDATE = `REPORT z.
PARAMETERS p_file TYPE string.
DATA lt_c TYPE STANDARD TABLE OF scarr.
START-OF-SELECTION.
  DO 1 TIMES.
  CALL FUNCTION 'FILE_VALIDATE_NAME'
    EXPORTING
      logical_filename = 'ZFILE'
    CHANGING
      physical_filename = p_file
    EXCEPTIONS
      validation_failed = 1
      OTHERS = 2.
  CHECK sy-subrc = 0.
  SELECT * FROM scarr INTO TABLE lt_c PACKAGE SIZE 100.
  ENDSELECT.
  ENDDO.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.`;

  test('does not suppress the task for the access after ENDDO', () => {
    const kinds = readSecurityReviewTasks(VALIDATE, { precisionFixes: true, engineReads: true }).map((t) => t.kind);
    expect(kinds).toContain('file-path-from-input');
  });
});

test.describe('proxy fault handling elsewhere makes no CO_ class a proxy (current engine)', () => {
  test('an ordinary ZCL_CO_ class beside an unrelated fault handler is no consumer proxy', () => {
    const source = [
      'REPORT z.',
      'DATA lo_report TYPE REF TO zcl_co_report.',
      'START-OF-SELECTION.',
      '  CREATE OBJECT lo_report.',
      '  TRY.',
      '    PERFORM other_work.',
      '  CATCH cx_ai_system_fault.',
      '  ENDTRY.',
      '',
    ].join('\n');
    expect(readAbapProxies(readStatements(source), { engineReads: true })).toEqual([]);
  });
});

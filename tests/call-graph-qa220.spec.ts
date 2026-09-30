import { test, expect } from '@playwright/test';
import { readCallGraph } from '../lib/abap/call-graph';

/**
 * QA full review of v2.20.0, slice A — the call graph.
 *
 *   469a60181df2  `CALL FUNCTION c_fm` with a constant declared here was reported dynamic, no name.
 *   3faea07d4f61  a backtick transaction literal produced no transaction call at all.
 *   c06eafbcd74b  one constant name declared twice with different values resolved to the last one.
 *   555bbac41ab8  `PERFORM foo IN PROGRAM z_other` hid the local FOO from `neverPerformed`.
 */

const src = (...lines: string[]) => lines.join('\n');

test('a function module named by a constant declared here is resolved', () => {
  const report = readCallGraph(src(
    'REPORT zqa.',
    "CONSTANTS c_fm TYPE rs38l_fnam VALUE 'BAPI_SALESORDER_GETLIST'.",
    'CALL FUNCTION c_fm.',
  ));
  const [call] = report.functionModules;
  expect(call.name).toBe('BAPI_SALESORDER_GETLIST');
  expect(call.dynamic).toBe(false);
  expect(call.bapi).toBe(true);
});

test('a function module named by a variable stays dynamic', () => {
  const [call] = readCallGraph(src('REPORT zqa.', 'CALL FUNCTION lv_fm.')).functionModules;
  expect(call.name).toBeUndefined();
  expect(call.dynamic).toBe(true);
});

test('a backtick transaction literal is a transaction call', () => {
  const report = readCallGraph(src('REPORT zqa.', 'CALL TRANSACTION `VA02` AND SKIP FIRST SCREEN.'));
  expect(report.transactions).toHaveLength(1);
  expect(report.transactions[0].code).toBe('VA02');
  expect(report.transactions[0].dynamic).toBe(false);
});

test('a constant declared twice with different values resolves to neither', () => {
  const report = readCallGraph(src(
    'REPORT zqa.',
    'CLASS lcl DEFINITION.',
    '  PUBLIC SECTION.',
    '    METHODS: a, b.',
    'ENDCLASS.',
    'CLASS lcl IMPLEMENTATION.',
    '  METHOD a.',
    "    CONSTANTS c_tcode TYPE tcode VALUE 'VA01'.",
    '    CALL TRANSACTION c_tcode.',
    '  ENDMETHOD.',
    '  METHOD b.',
    "    CONSTANTS c_tcode TYPE tcode VALUE 'VA02'.",
    '    CALL TRANSACTION c_tcode.',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ));
  expect(report.transactions).toHaveLength(2);
  for (const call of report.transactions) {
    expect(call.code, 'neither VA01 nor VA02 is known to be this call').toBeUndefined();
    expect(call.dynamic).toBe(true);
  }
});

test('an external PERFORM does not count as performing the local routine of the same name', () => {
  const report = readCallGraph(src(
    'REPORT zqa.',
    'START-OF-SELECTION.',
    '  PERFORM foo IN PROGRAM z_other.',
    'FORM foo.',
    'ENDFORM.',
  ));
  expect(report.neverPerformed).toContain('FOO');
});

test('PERFORM … IN PROGRAM sy-repid is this program and still counts', () => {
  const report = readCallGraph(src(
    'REPORT zqa.',
    'START-OF-SELECTION.',
    '  PERFORM foo IN PROGRAM sy-repid.',
    'FORM foo.',
    'ENDFORM.',
  ));
  expect(report.neverPerformed).not.toContain('FOO');
});

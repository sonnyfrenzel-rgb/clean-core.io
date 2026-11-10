import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { FINDING_ORDER, allCodeFindings, codeGivesAway, type CodeFinding } from '../lib/first-look-findings';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { EXAMPLE_SNIPPETS } from '../lib/example-snippets';
import { DEMO_SOURCE_FILE } from '../lib/demo-marks';
import { readProcess } from '../lib/first-look';
import { processStory } from '../lib/process-story';
import { APP_VERSION } from '../lib/version';
import type { AuthorClaim } from '../lib/program-summary-check';

/**
 * "What the code gives away" — the First-insights block of roadmap 3.0.21
 * (owner decisions 22.10.2026). The owner's acceptance asks for a guard that
 * every line carries an anchor and its reader; it runs here over every starter
 * example, every snippet and the demo source. The honest limits are pinned
 * too: no unreachable code while an include is missing or reachability is
 * uncertain, and an empty block for a program with nothing to give away —
 * empty, with seven signs checked, never "clean".
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');

const SOURCES: Array<[string, string]> = [
  ...STARTER_EXAMPLES.map((e) => [e.file, read(`public/starter-examples/${e.file}`)] as [string, string]),
  ...EXAMPLE_SNIPPETS.map((s) => [`snippet ${s.id}`, s.code] as [string, string]),
  [`demo ${DEMO_SOURCE_FILE}`, read(`public/starter-examples/${DEMO_SOURCE_FILE}`)],
];

const ANCHOR = /^L\d+(-\d+)?$/;
/** A table or object of the customer namespace — never in a sentence a business reader gets. */
const CUSTOMER_NAME = /\b[ZY][A-Z0-9_]{3,}\b/;
/** A field or variable as the code writes it: `p_bukrs`, `gs_x-y`, `lv_date`. */
const CODE_NAME = /\b[a-z]{1,3}_[a-z0-9_]+\b|\b\w+-\w+\b(?<!\bend-to-end)/i;

function lineOf(f: CodeFinding): number {
  return Number(/^L(\d+)/.exec(f.anchor)![1]);
}

function expectWellFormed(name: string, findings: CodeFinding[]): void {
  for (const f of findings) {
    expect(FINDING_ORDER, `${name}: reader of ${f.anchor}`).toContain(f.reader);
    expect(f.anchor, `${name}: anchor of ${f.reader}`).toMatch(ANCHOR);
    expect(['it', 'users', 'business'], `${name}: who to ask`).toContain(f.ask);
    expect(f.text.trim().endsWith('?'), `${name}: "${f.text}" ends in a question`).toBe(true);
    expect(f.text.split(/\s+/).length, `${name}: "${f.text}" is short`).toBeLessThanOrEqual(26);
    expect(f.text, `${name}: no customer table name`).not.toMatch(CUSTOMER_NAME);
    expect(f.text, `${name}: no field name`).not.toMatch(CODE_NAME);
    expect(f.text.toLowerCase(), `${name}: never "clean"`).not.toContain('clean');
  }
  const ranks = findings.map((f) => FINDING_ORDER.indexOf(f.reader));
  expect(ranks, `${name}: fixed order`).toEqual([...ranks].sort((a, b) => a - b));
  for (let i = 1; i < findings.length; i++) {
    if (findings[i].reader === findings[i - 1].reader) expect(lineOf(findings[i])).toBeGreaterThanOrEqual(lineOf(findings[i - 1]));
  }
}

test.describe('what the code gives away', () => {
  test('the seven signs stand in the fixed order', () => {
    expect([...FINDING_ORDER]).toEqual([
      'unreachable-code',
      'ignored-input',
      'test-switch',
      'fixed-scope',
      'header-contradiction',
      'sap-table-write',
      'authority',
    ]);
  });

  test('every line carries an anchor and its reader — every starter example, snippet and the demo', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(8);
    for (const [name, source] of SOURCES) {
      for (const withPage of [false, true]) {
        const page = withPage ? readProcess(source) : null;
        const input = page
          ? { source, engineVersion: APP_VERSION, skeleton: page.skeleton, testData: processStory(page.skeleton, source, null, APP_VERSION).testData }
          : { source, engineVersion: APP_VERSION };
        const block = codeGivesAway(input);
        const all = allCodeFindings(input).findings;
        expect(block.checked).toBe(7);
        expect(block.findings.length).toBeLessThanOrEqual(3);
        expect(block.findings).toEqual(all.slice(0, 3));
        expect(block.more).toBe(Math.max(0, all.length - 3));
        expectWellFormed(name, all);
        // One finding per sign.
        expect(new Set(all.map((f) => f.reader)).size).toBe(all.length);
        if (block.testSwitch?.anchor) expect(block.testSwitch.anchor).toMatch(ANCHOR);
      }
    }
  });

  test('a trivial program gives nothing away — empty, seven signs checked, no test switch', () => {
    const source = `REPORT z_hello.\nSTART-OF-SELECTION.\n  WRITE / 'Hello'.\n`;
    expect(codeGivesAway({ source, engineVersion: APP_VERSION })).toEqual({ findings: [], more: 0, checked: 7, testSwitch: null });
    expect(codeGivesAway({ source: '', engineVersion: APP_VERSION })).toEqual({ findings: [], more: 0, checked: 7, testSwitch: null });
  });

  // Five signs in one program: three shown, two counted.
  const MANY = [
    'REPORT z_many.',
    'DATA lt_orders TYPE STANDARD TABLE OF vbak.',
    "CONSTANTS gc_live TYPE c LENGTH 1 VALUE ' '.",
    'PARAMETERS p_unused TYPE c LENGTH 1.',
    'START-OF-SELECTION.',
    '  PERFORM run.',
    'FORM run.',
    "  IF gc_live = 'X'.",
    "    WRITE / 'live'.",
    "    WRITE / 'path'.",
    '  ENDIF.',
    "  SELECT * FROM vbak INTO TABLE lt_orders WHERE auart = 'TA'.",
    "  UPDATE vbak SET lifsk = '01' WHERE auart = 'TA'.",
    'ENDFORM.',
    '',
  ].join('\n');

  test('at most three findings, in the fixed order, and the rest counted', () => {
    const block = codeGivesAway({ source: MANY, engineVersion: APP_VERSION });
    expect(block.findings.map((f) => f.reader)).toEqual(['unreachable-code', 'ignored-input', 'fixed-scope']);
    expect(block.more).toBe(2);
    expect(allCodeFindings({ source: MANY, engineVersion: APP_VERSION }).findings.map((f) => f.reader)).toEqual([
      'unreachable-code',
      'ignored-input',
      'fixed-scope',
      'sap-table-write',
      'authority',
    ]);
    const [dead, input, scope] = block.findings;
    expect(dead).toMatchObject({ anchor: 'L8', ask: 'it' });
    expect(dead.text).toContain('2 lines of code never run');
    expect(input).toMatchObject({ anchor: 'L4', ask: 'users' });
    expect(input.text).toContain('nothing in the code uses it');
    expect(scope).toMatchObject({ anchor: 'L12', ask: 'business' });
    expect(scope.text).toContain('sales orders only for order type TA');
  });

  test('code no run reaches is not said while an include is missing', () => {
    const withInclude = MANY.replace('REPORT z_many.', 'REPORT z_many.\nINCLUDE z_many_top.');
    const readers = allCodeFindings({ source: withInclude, engineVersion: APP_VERSION }).findings.map((f) => f.reader);
    expect(readers).not.toContain('unreachable-code');
    // The include may read the entry and hold the check: those two wait as well.
    expect(readers).not.toContain('ignored-input');
    expect(readers).not.toContain('authority');
    expect(readers).toEqual(['fixed-scope', 'sap-table-write']);
    // The skeleton's own note counts the same way.
    const page = readProcess(withInclude);
    expect(page.skeleton.notes.some((n) => n.reason === 'include-not-read')).toBe(true);
    expect(allCodeFindings({ source: MANY, engineVersion: APP_VERSION, skeleton: page.skeleton }).findings.map((f) => f.reader)).not.toContain(
      'unreachable-code',
    );
  });

  const UNCALLED = [
    'REPORT z_uncalled.',
    'START-OF-SELECTION.',
    '  PERFORM used.',
    'FORM used.',
    "  WRITE / 'used'.",
    'ENDFORM.',
    'FORM obsolete.',
    "  WRITE / 'not used any more'.",
    'ENDFORM.',
    '',
  ].join('\n');

  test('routines nothing calls are said only where reachability is certain', () => {
    const certain = allCodeFindings({ source: UNCALLED, engineVersion: APP_VERSION }).findings;
    expect(certain).toEqual([
      expect.objectContaining({ reader: 'unreachable-code', anchor: 'L7-9', ask: 'it' }),
    ]);
    expect(certain[0].text).toBe('One routine of 3 lines is never called from anywhere in this program. Is it still needed?');
    // One computed PERFORM and nothing is certain.
    const computed = UNCALLED.replace("  PERFORM used.", "  PERFORM used.\n  DATA lv_form TYPE string VALUE 'USED'.\n  PERFORM (lv_form) IN PROGRAM z_uncalled.");
    expect(allCodeFindings({ source: computed, engineVersion: APP_VERSION }).findings).toEqual([]);
    // A subroutine pool or an include is called from outside.
    expect(allCodeFindings({ source: UNCALLED.replace('REPORT z_uncalled.', ''), engineVersion: APP_VERSION }).findings).toEqual([]);
    // An engine older than 3.0.18 did not read reachability this carefully.
    expect(allCodeFindings({ source: UNCALLED, engineVersion: '3.0.17' }).findings).toEqual([]);
    expect(allCodeFindings({ source: UNCALLED, engineVersion: null }).findings).toEqual([]);
  });

  test('the test switch becomes one line, from the story when the page has it', () => {
    const source = read('tests/fixtures/sd-locked-probe-demo.abap');
    const own = codeGivesAway({ source, engineVersion: APP_VERSION });
    expect(own.testSwitch).not.toBeNull();
    expect(own.testSwitch!.anchor).toMatch(ANCHOR);
    expect(own.testSwitch!.sentence).toMatch(/test cases?, switched on from its start screen\. Should that stay in production code\?$/);
    expect(own.findings.find((f) => f.reader === 'test-switch')).toEqual({
      reader: 'test-switch',
      text: own.testSwitch!.sentence,
      anchor: own.testSwitch!.anchor,
      ask: 'it',
    });
    const fromStory = codeGivesAway({ source, engineVersion: APP_VERSION, testData: { anchor: 'L69–78', flag: 'P_DEMO', cases: 31 } });
    expect(fromStory.testSwitch).toEqual({
      anchor: 'L69-78',
      sentence: 'The program carries its own 31 test cases, switched on from its start screen. Should that stay in production code?',
    });
  });

  test('a header comment the code contradicts — and not one only unread for its language', () => {
    const contradicted = (problems: string[]): AuthorClaim => ({ state: 'contradicted', heading: 'Purpose', problems, lineStart: 2, lineEnd: 4, note: '' });
    const source = `REPORT z_header.\nSTART-OF-SELECTION.\n  WRITE / 'x'.\n`;
    const posting = allCodeFindings({ source, engineVersion: APP_VERSION, authorClaim: contradicted(['claims a posting or a data change; the code changes no data']) });
    expect(posting.findings).toEqual([
      {
        reader: 'header-contradiction',
        text: 'The header comment says the program changes data, but the code changes none. Which one is right?',
        anchor: 'L2-4',
        ask: 'it',
      },
    ]);
    expect(allCodeFindings({ source, engineVersion: APP_VERSION, authorClaim: contradicted(['is in a language the check does not read']) }).findings).toEqual([]);
    expect(allCodeFindings({ source, engineVersion: APP_VERSION, authorClaim: null }).findings).toEqual([]);
  });

  test('read from the source: a header that claims a posting the code never makes', () => {
    const source = [
      'REPORT z_claim.',
      '* Purpose: posts the open items of the vendor account and clears them.',
      'DATA lt_items TYPE STANDARD TABLE OF bsik.',
      'START-OF-SELECTION.',
      '  SELECT * FROM bsik INTO TABLE lt_items UP TO 10 ROWS.',
      '',
    ].join('\n');
    const header = allCodeFindings({ source, engineVersion: APP_VERSION }).findings.find((f) => f.reader === 'header-contradiction');
    expect(header?.anchor).toBe('L2');
  });

  test('what is not a sign: a radio group, a log table, a RAP entity, a lookup by a fixed key', () => {
    const radio = [
      'REPORT z_radio.',
      'PARAMETERS: p_list RADIOBUTTON GROUP g1 DEFAULT \'X\',',
      '            p_file RADIOBUTTON GROUP g1.',
      'START-OF-SELECTION.',
      '  IF p_list = abap_true.',
      "    WRITE / 'list'.",
      '  ENDIF.',
      '',
    ].join('\n');
    expect(allCodeFindings({ source: radio, engineVersion: APP_VERSION }).findings).toEqual([]);

    const log = [
      'REPORT z_log.',
      'DATA ls_log TYPE zsd_run_log.',
      'START-OF-SELECTION.',
      "  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'ACTVT' FIELD '03'.",
      '  INSERT zsd_run_log FROM ls_log.',
      '',
    ].join('\n');
    expect(allCodeFindings({ source: log, engineVersion: APP_VERSION }).findings.map((f) => f.reader)).not.toContain('authority');

    const eml = [
      'CLASS lhc_claim IMPLEMENTATION.',
      '  METHOD set_status.',
      '    MODIFY ENTITIES OF zi_claim IN LOCAL MODE',
      '      ENTITY claim UPDATE FIELDS ( status ) WITH VALUE #( ( %tky = ls_key-%tky status = 2 ) ).',
      '  ENDMETHOD.',
      'ENDCLASS.',
      '',
    ].join('\n');
    const emlReaders = allCodeFindings({ source: eml, engineVersion: APP_VERSION }).findings.map((f) => f.reader);
    expect(emlReaders).not.toContain('sap-table-write');
    expect(emlReaders).not.toContain('authority');

    const lookup = [
      'REPORT z_lookup.',
      'DATA lv_low TYPE tvarvc-low.',
      'DATA lv_count TYPE i.',
      'START-OF-SELECTION.',
      "  SELECT SINGLE low FROM tvarvc INTO lv_low WHERE name = 'Z_MAX_AMOUNT'.",
      "  SELECT COUNT(*) FROM vbak INTO lv_count WHERE auart = 'TA'.",
      '  WRITE / lv_low.',
      '',
    ].join('\n');
    expect(allCodeFindings({ source: lookup, engineVersion: APP_VERSION }).findings).toEqual([]);
  });

  test('the authority sign: a display check while the program changes data is a question for IT', () => {
    const source = [
      'REPORT z_auth.',
      'START-OF-SELECTION.',
      "  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'VKORG' FIELD '1000' ID 'ACTVT' FIELD '03'.",
      "  UPDATE zsd_order_risk SET risk = 'H' WHERE vbeln = '1'.",
      '',
    ].join('\n');
    const authority = allCodeFindings({ source, engineVersion: APP_VERSION }).findings.find((f) => f.reader === 'authority');
    expect(authority).toEqual({
      reader: 'authority',
      text: 'The code checks only whether the user may display, yet it changes data. Is the change permission checked elsewhere?',
      anchor: 'L3',
      ask: 'it',
    });
  });
});

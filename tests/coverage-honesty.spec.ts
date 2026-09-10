/**
 * CR-06 / E03-F04 — unsupported syntax must not read as "100% clean".
 *
 * The roadmap's immediate measure for release 2.9 (section 3.4) is not the
 * missing detectors, which are 2.10 work. It is this: "Ungedeckte Syntax darf
 * nicht als '100% clean' wirken", and from E03-F04-US02, "Die UI zeigt den
 * begrenzten Prüfumfang; kein numerischer Score darf ihn als vollständig geprüft
 * überdecken."
 *
 * Reproduced before writing any of it: of the seven starter examples,
 * Z_SALES_ORDER_CREATOR returned 0 findings while making three local
 * CALL FUNCTION calls, Z_EMPLOYEE_EXPENSE_VAL returned 0 findings while being a
 * classic WRITE list report, and Z_INVOICE_EXTRACTOR returned 2 findings without
 * either of its OPEN DATASET writes among them.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { assessCoverage, coverageCaveat } from '../lib/abap/coverage';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { STARTER_EXAMPLES } from '../lib/starter-examples';

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'public/starter-examples');

function source(file: string): string {
  return fs.readFileSync(path.join(EXAMPLES, file), 'utf8');
}

test.describe('the named gaps are recorded', () => {
  test('Z_SALES_ORDER_CREATOR reports its local function-module calls', () => {
    const report = assessCoverage(source('Z_SALES_ORDER_CREATOR.txt'));
    const local = report.gaps.find((g) => g.gap === 'local-function-call');

    expect(local, 'the three local CALL FUNCTION calls must be recorded').toBeTruthy();
    expect(local!.count).toBe(3);
  });

  test('Z_INVOICE_EXTRACTOR reports its file access', () => {
    const report = assessCoverage(source('Z_INVOICE_EXTRACTOR.txt'));
    const io = report.gaps.find((g) => g.gap === 'file-io');

    expect(io, 'OPEN DATASET / TRANSFER must be recorded').toBeTruthy();
    expect(io!.count).toBeGreaterThan(0);
  });

  test('every unassessed construct carries a line anchor and a reason', () => {
    const report = assessCoverage(source('Z_SALES_ORDER_CREATOR.txt'));
    expect(report.unassessed.length).toBeGreaterThan(0);

    for (const u of report.unassessed) {
      expect(u.line, 'a claim about source must point at source').toBeGreaterThan(0);
      expect(u.why.length, 'an unexplained gap teaches nobody anything').toBeGreaterThan(20);
      expect(u.snippet.length).toBeGreaterThan(0);
    }
  });
});

test.describe('no example is silently clean', () => {
  for (const ex of STARTER_EXAMPLES) {
    test(`${ex.name} either has findings or says what it did not check`, () => {
      const code = source(ex.file);
      const evidence = buildAbapEvidence(code, ex.file);
      const coverage = assessCoverage(code);

      // This is the whole point of the release. A legacy example may legitimately
      // produce no findings — but then it must not also be silent about scope,
      // because "we found nothing" and "there is nothing" are different claims.
      if (evidence.findings.length === 0) {
        expect(
          coverage.complete,
          `${ex.name} reports no findings and no limits, which reads as a clean bill of health`,
        ).toBe(false);
        expect(coverageCaveat(coverage)).toBeTruthy();
      }
    });
  }
});

test.describe('the false positives the roadmap names do not appear', () => {
  test('a construct inside a comment is not a hit', () => {
    const code = [
      'REPORT z_comment_only.',
      '* OPEN DATASET lv_file FOR OUTPUT IN TEXT MODE.',
      'DATA lv_x TYPE i.  " CALL FUNCTION \'BAPI_SOMETHING\'',
      'lv_x = 1.',
    ].join('\n');

    expect(assessCoverage(code).unassessed).toHaveLength(0);
  });

  test('a construct inside a string literal is not a hit', () => {
    const code = [
      'REPORT z_string_only.',
      "DATA lv_msg TYPE string.",
      "lv_msg = 'OPEN DATASET is mentioned here but not used'.",
      "lv_msg = `CALL FUNCTION 'BAPI_X'`.",
    ].join('\n');

    expect(assessCoverage(code).unassessed).toHaveLength(0);
  });

  test('INSERT into an internal table is not read as generated code', () => {
    const code = [
      'REPORT z_itab.',
      'DATA lt_tab TYPE TABLE OF string.',
      'INSERT `a` INTO TABLE lt_tab.',
      'INSERT LINES OF lt_tab INTO TABLE lt_tab.',
    ].join('\n');

    const gaps = assessCoverage(code).gaps.map((g) => g.gap);
    expect(gaps).not.toContain('generated-code');
  });

  test('WRITE ... TO ... is formatting, not list output', () => {
    const code = [
      'REPORT z_write_to.',
      'DATA lv_out TYPE c LENGTH 20.',
      'WRITE sy-datum TO lv_out.',
    ].join('\n');

    const gaps = assessCoverage(code).gaps.map((g) => g.gap);
    expect(gaps).not.toContain('classic-list-output');
  });

  test('CALL FUNCTION with DESTINATION stays with the RFC detector', () => {
    const code = [
      'REPORT z_rfc.',
      "CALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'.",
    ].join('\n');

    const gaps = assessCoverage(code).gaps.map((g) => g.gap);
    expect(
      gaps,
      'an RFC is assessed as a finding; recording it as unassessed too would double-count it',
    ).not.toContain('local-function-call');
  });
});

test.describe('the caveat says the honest thing', () => {
  test('complete coverage produces no reassurance', () => {
    const code = ['REPORT z_plain.', 'DATA lv_x TYPE i.', 'lv_x = 1.'].join('\n');
    const report = assessCoverage(code);

    expect(report.complete).toBe(true);
    // Deliberately null rather than "everything was checked" — that is a claim
    // with its own burden of proof, and this engine cannot carry it.
    expect(coverageCaveat(report)).toBeNull();
  });

  test('an incomplete result names what was skipped and how often', () => {
    const caveat = coverageCaveat(assessCoverage(source('Z_SALES_ORDER_CREATOR.txt')));
    expect(caveat).toContain('Not assessed');
    expect(caveat).toContain('local function-module call');
    expect(caveat).toContain('not the whole program');
  });
});

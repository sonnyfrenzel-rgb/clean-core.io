import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { tokenize } from '../lib/abap/declaration-parser';
import { extractSelects } from '../lib/abap/select-parser';
import { isAbapCommentLine } from '../lib/abap/statement-reader';

const ROOT = path.resolve(__dirname, '..');
const example = (name: string) => fs.readFileSync(path.join(ROOT, 'public/starter-examples', name), 'utf8');

/**
 * An indented asterisk is multiplication or a comment, and which one depends on
 * whether a statement is open.
 *
 * `declaration-parser.ts` and `select-parser.ts` dropped every line matching
 * `^\s*\*`. In `Z_MM_PO_APPROVAL.abap` that is the second line of
 *
 *     lv_dev_pct = ( lv_price - lv_ref )
 *                * 100 / lv_ref.
 *
 * so the assignment never found its period and swallowed the statement below it
 * — `IF lv_dev_pct > 5.`, the price-tolerance check. The engine lost a branch of
 * a file this product ships as a starter example, silently, and every reader of
 * that evidence was told nothing was there.
 *
 * The opposite mistake costs as much: `Z_SALES_ORDER_CREATOR.txt` has an
 * indented `*` used as a comment directly above a BAPI call, and treating it as
 * code loses the call.
 *
 * The rule lives once, in `statement-reader.ts`, and all three parsers read it.
 * Measured on the eight shipped examples, this changes exactly one number:
 * `Z_MM_PO_APPROVAL.abap` goes from 387 statements and 39 `IF` to 388 and 40.
 * Nothing else moves.
 */
test.describe('an indented asterisk is read by what stands above it', () => {
  test('the rule itself: open statement continues, closed statement comments', () => {
    expect(isAbapCommentLine('* a real comment', false), 'column 1 is always a comment').toBe(true);
    expect(isAbapCommentLine('* a real comment', true), 'column 1 is a comment even mid-statement').toBe(true);
    expect(isAbapCommentLine('   * 100 / lv_ref.', true), 'a continuation was read as a comment').toBe(false);
    expect(isAbapCommentLine('   * prose', false), 'an indented comment was read as code').toBe(true);
    expect(isAbapCommentLine('  lv_a = 1.', false)).toBe(false);
  });

  test('a multi-line expression keeps the statement that follows it', () => {
    const source = [
      'REPORT z_probe.',
      'START-OF-SELECTION.',
      '  lv_dev_pct = ( lv_price - lv_ref )',
      '             * 100 / lv_ref.',
      '',
      '  IF lv_dev_pct > 5.',
      '    PERFORM hold_for_buyer.',
      '  ENDIF.',
    ].join('\n');

    const statements = tokenize(source);
    const ifs = statements.filter((s) => /^IF\b/i.test(s.text));
    expect(ifs.length, 'the IF after a continued expression was swallowed').toBe(1);
    expect(ifs[0].line, 'the IF lost its line').toBe(6);
  });

  test('an indented comment where nothing is open stays a comment', () => {
    const source = [
      'FORM create_order.',
      'ENDFORM.',
      '  * Call BAPI Function Module Simulation',
      'FORM next_one.',
      'ENDFORM.',
    ].join('\n');

    const text = tokenize(source).map((s) => s.text).join(' | ');
    expect(text, 'an indented comment was read as code').not.toMatch(/Simulation/);
    expect(tokenize(source).filter((s) => /^FORM\b/i.test(s.text)).length).toBe(2);
  });

  test('the shipped example gets its price-tolerance check back', () => {
    // The number, not a proxy for it: this is the statement that was lost.
    const statements = tokenize(example('Z_MM_PO_APPROVAL.abap'));
    expect(statements.length, 'the swallowed statement is missing again').toBe(388);
    expect(statements.filter((s) => /^IF\b/i.test(s.text)).length).toBe(40);
    expect(
      statements.some((s) => /lv_dev_pct\s*>\s*5/i.test(s.text)),
      'the price-tolerance branch is not in the statements',
    ).toBe(true);
  });

  test('the other seven shipped examples are unchanged by the rule', () => {
    // A correctness fix that quietly moves every other number would be a
    // different change than the one that was approved.
    const expected: Record<string, number> = {
      'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap': 698,
      'Z_BUSINESS_PARTNER_SYNC.txt': 56,
      'Z_EMPLOYEE_EXPENSE_VAL.txt': 55,
      'Z_INVOICE_EXTRACTOR.txt': 31,
      'Z_MATERIAL_STOCK_CALC.txt': 45,
      'Z_ORDER_INTEGRITY_CHECK.txt': 53,
      'Z_SALES_ORDER_CREATOR.txt': 38,
    };
    for (const [name, count] of Object.entries(expected)) {
      expect(tokenize(example(name)).length, `${name} moved`).toBe(count);
    }
  });

  test('a SELECT continued over an asterisk line is still one query', () => {
    const source = [
      'SELECT carrid connid',
      '  FROM sflight',
      '  INTO TABLE lt_flights',
      '  WHERE price > lv_base',
      '      * 2.',
      'WRITE / lines( lt_flights ).',
    ].join('\n');

    const selects = extractSelects(source);
    expect(selects.length, 'the query was cut at the asterisk line').toBe(1);
    expect(selects[0].text, 'the multiplication fell out of the WHERE clause').toMatch(/\* 2/);
  });
});

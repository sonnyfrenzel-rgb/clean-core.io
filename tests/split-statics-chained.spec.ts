/**
 * QA 02b96f083c65 said a chained `STATICS:` declaration gave `staticLocalsOf`
 * only its first local. The statement reader splits a chain into one statement
 * per declarator (`STATICS lv_first …`, `STATICS lv_second …`), so every one
 * is found; this pins it.
 */
import { test, expect } from '@playwright/test';
import { readStatements } from '../lib/abap/statement-reader';
import { staticLocalsOf } from '../lib/transformation/unit-plan';

test('every local of a chained STATICS is a static local of the routine', () => {
  const source = [
    'FORM f.',
    '  STATICS: lv_first TYPE i VALUE 5,',
    '           lv_second TYPE i VALUE 9.',
    '  STATICS lv_third TYPE i.',
    '  DATA lv_plain TYPE i.',
    '  lv_first = lv_first + lv_second + lv_third.',
    'ENDFORM.',
  ].join('\n');
  const statements = readStatements(source);
  expect(statements.filter((s) => s.keyword === 'STATICS').map((s) => s.text)).toEqual([
    'STATICS lv_first TYPE i VALUE 5',
    'STATICS lv_second TYPE i VALUE 9',
    'STATICS lv_third TYPE i',
  ]);
  expect([...staticLocalsOf(statements, { abap: [{ lineStart: 1, lineEnd: 7, routine: 'F' }] })]).toEqual(['lv_first', 'lv_second', 'lv_third']);
});

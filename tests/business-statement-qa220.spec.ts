import { test, expect } from '@playwright/test';
import { buildBusinessStatements, resolveValue } from '../lib/abap/business-statement';
import { readStatements } from '../lib/abap/statement-reader';

/**
 * QA full review of v2.20.0, slice A — the business sentences.
 *
 *   e9ac1acc9b3c  the ELSE of `>= 100` read "smaller or equal", the ELSE of `< 100` "greater":
 *                 the boundary went to the wrong side.
 *   cc61d82d62a0  one literal assignment inside an IF was reported as *the* value after the IF.
 *   439f9e28056b  any earlier SELECT made an empty table "Ohne Treffer", a CLEAR in between too.
 *   ec43713038fc  a call result in one method labelled a same-named variable in another.
 */

const texts = (code: string) => buildBusinessStatements(code).map((s) => s.text);
const src = (...lines: string[]) => lines.join('\n');

test.describe('the ELSE of a comparison keeps the boundary on the right side', () => {
  const elseOf = (operator: string) =>
    texts(src(
      'REPORT zqa.',
      'PARAMETERS p_amount TYPE p.',
      `IF p_amount ${operator} 100.`,
      "  lv_route = 'A'.",
      "  PERFORM route_a.",
      'ELSE.',
      "  lv_route = 'B'.",
      "  PERFORM route_b.",
      'ENDIF.',
    )).join(' ');

  test('ELSE of >= 100 is the smaller amounts, without 100', () => {
    const all = elseOf('>=');
    expect(all).toMatch(/(?<!equal or )smaller amounts/i);
    expect(all).not.toMatch(/equal or smaller amounts/i);
  });

  test('ELSE of < 100 is the greater or equal amounts', () => {
    expect(elseOf('<')).toMatch(/equal or greater amounts/i);
  });

  test('ELSE of > 100 is the smaller or equal amounts', () => {
    expect(elseOf('>')).toMatch(/equal or smaller amounts/i);
  });
});

test.describe('a literal assignment is the value only where it runs on every path', () => {
  const at = (code: string) => {
    const statements = readStatements(code);
    const use = statements.find((s) => /^SELECT\b/i.test(s.text));
    return resolveValue('lv_table', statements, use!.index);
  };

  test('an assignment inside an IF does not fix the value after the IF', () => {
    const resolved = at(src(
      'REPORT zqa.',
      'DATA lv_table TYPE tabname.',
      "IF p_flag = 'X'.",
      "  lv_table = 'KNA1'.",
      'ENDIF.',
      'SELECT * FROM (lv_table) INTO TABLE lt_rows.',
    ));
    expect(resolved.value).toBeNull();
    expect(resolved.from).toBe('unresolved');
  });

  test('an unconditional assignment still does', () => {
    const resolved = at(src(
      'REPORT zqa.',
      'DATA lv_table TYPE tabname.',
      "lv_table = 'KNA1'.",
      "IF p_flag = 'X'.",
      '  SELECT * FROM (lv_table) INTO TABLE lt_rows.',
      'ENDIF.',
    ));
    expect(resolved.value).toBe('KNA1');
  });
});

test('a table cleared after its SELECT is empty, not "without hits"', () => {
  const cleared = texts(src(
    'REPORT zqa.',
    'DATA lt_items TYPE STANDARD TABLE OF kna1.',
    'SELECT * FROM kna1 INTO TABLE lt_items.',
    'CLEAR lt_items.',
    'IF lt_items IS INITIAL.',
    "  WRITE / 'leer'.",
    'ENDIF.',
  )).join(' ');
  expect(cleared).not.toMatch(/Without a hit/);

  const read = texts(src(
    'REPORT zqa.',
    'DATA lt_items TYPE STANDARD TABLE OF kna1.',
    'SELECT * FROM kna1 INTO TABLE lt_items.',
    'IF lt_items IS INITIAL.',
    "  WRITE / 'leer'.",
    'ENDIF.',
  )).join(' ');
  expect(read, 'the control: straight after the SELECT it is a missing hit').toMatch(/Without a hit/);
});

test('a call result labels its own output only, not a same-named variable elsewhere', () => {
  const FROM_FUNCTION = /field returned by the function module/;
  const other = texts(src(
    'REPORT zqa.',
    'FORM a.',
    "  CALL FUNCTION 'Z_GET' IMPORTING ev_x = lv_x.",
    'ENDFORM.',
    'FORM b.',
    '  WRITE / lv_x.',
    'ENDFORM.',
  )).join(' ');
  expect(other).not.toMatch(FROM_FUNCTION);

  const overwritten = texts(src(
    'REPORT zqa.',
    "CALL FUNCTION 'Z_GET' IMPORTING ev_x = lv_x.",
    'lv_x = sy-uname.',
    'WRITE / lv_x.',
  )).join(' ');
  expect(overwritten).not.toMatch(FROM_FUNCTION);

  const same = texts(src(
    'REPORT zqa.',
    "CALL FUNCTION 'Z_GET' IMPORTING ev_x = lv_x.",
    'WRITE / lv_x.',
  )).join(' ');
  expect(same, 'the control: straight after the call it is the returned field').toMatch(FROM_FUNCTION);
});

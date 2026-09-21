import { test, expect } from '@playwright/test';
import { extractSelects } from '../lib/abap/select-parser';
import { startsSelectStatement } from '../lib/abap/select-parser';

/**
 * `WRITE 'SELECT data FROM cache.'.` is not a query.
 *
 * The parser entered SELECT mode whenever a line contained the word, buffered
 * everything up to the next period, and handed the sentence on as deterministic
 * SQL metadata — which the transformation prompt then presented as a fact about
 * the code (QA review of 33471220d6e9, 14d4000c4586). Roadmap 0.18.
 */

test.describe('a SELECT inside a literal is not a statement', () => {
  test('the word in a text literal opens nothing', () => {
    expect(startsSelectStatement("WRITE 'SELECT data FROM cache.'.")).toBe(false);
    expect(startsSelectStatement("lv_msg = 'Please SELECT an entry'.")).toBe(false);
    expect(startsSelectStatement('lv_sql = `SELECT * FROM somewhere`.')).toBe(false);
    expect(startsSelectStatement("APPEND 'SELECT' TO lt_words.")).toBe(false);
  });

  test('a real statement still opens one', () => {
    expect(startsSelectStatement('SELECT * FROM vbak INTO TABLE @lt.')).toBe(true);
    expect(startsSelectStatement('  SELECT SINGLE matnr FROM mara INTO @lv.')).toBe(true);
    // After a statement end on the same line, and in a chain.
    expect(startsSelectStatement('IF sy-subrc = 0. SELECT * FROM vbap INTO TABLE @lt2.')).toBe(true);
  });

  test('a doubled quote inside a literal does not reopen it', () => {
    expect(startsSelectStatement("WRITE 'it''s a SELECT in prose'.")).toBe(false);
  });

  test('the extractor returns the query and not the prose', () => {
    const code = [
      'REPORT z_mixed.',
      "WRITE 'SELECT data FROM cache.'.",
      'SELECT * FROM vbak INTO TABLE @DATA(lt_orders).',
      "MESSAGE 'Nothing to SELECT here' TYPE 'I'.",
    ].join('\n');
    const found = extractSelects(code);
    expect(found).toHaveLength(1);
    expect(found[0].text).toContain('FROM vbak');
    expect(found[0].text, 'the prose is not in it').not.toContain('cache');
  });
});

/* ----------------------------------- b88c77b4b5d1 — more than one on a line */

test.describe('a line may carry more than one statement (1947c1826a39)', () => {
  test('the second SELECT on a line is read as well as the first', () => {
    // The parser emitted at the first terminator and moved to the next source
    // line, so everything behind that period was dropped. The query that was
    // dropped here is the three-table one, which is the one that earns a
    // partial-support finding and an architect's sign-off.
    const code = [
      'REPORT z_two.',
      'START-OF-SELECTION.',
      '  SELECT * FROM mara INTO TABLE @DATA(a). SELECT * FROM vbak'
        + ' INNER JOIN vbap ON vbap~vbeln = vbak~vbeln INTO TABLE @DATA(b).',
    ].join('\n');
    const found = extractSelects(code);
    expect(found.map((f) => f.line)).toEqual([3, 3]);
    expect(found[0].text).toBe('SELECT * FROM mara INTO TABLE @DATA(a)');
    expect(found[1].text, 'the join is not lost with it').toContain('INNER JOIN vbap');
  });

  test('a statement that ends on a shared line still starts a new one there', () => {
    const code = [
      'REPORT z_two.',
      'START-OF-SELECTION.',
      '  SELECT * FROM mara',
      '    INTO TABLE @DATA(a). SELECT * FROM vbak INTO TABLE @DATA(b). WRITE 1.',
    ].join('\n');
    const found = extractSelects(code);
    expect(found.map((f) => [f.line, f.text])).toEqual([
      [3, 'SELECT * FROM mara INTO TABLE @DATA(a)'],
      [4, 'SELECT * FROM vbak INTO TABLE @DATA(b)'],
    ]);
  });
});

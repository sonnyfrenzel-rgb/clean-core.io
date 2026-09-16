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

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { databaseWriteIn, isInternalTableOperation } from '../lib/abap/open-sql-discrimination';
import { extractDataCoupling } from '../lib/abap/code-assessment';

/**
 * ABAP writes to an internal table with the same words it writes to a database.
 * Read as Open SQL, `INSERT ls_item INTO TABLE lt_items` names the work area as
 * the table — a dependency on a database object called LS_ITEM, on ordinary
 * code (QA review of 33471220d6e9, eac6118f1eac). Roadmap 0.18.
 */

test.describe('what is a database write', () => {
  test('the internal-table forms are not', () => {
    for (const statement of [
      'INSERT ls_item INTO TABLE lt_items',
      'INSERT ls_wa INTO lt_items INDEX 1',
      'INSERT LINES OF lt_source INTO TABLE lt_target',
      'MODIFY TABLE lt_items FROM ls_item',
      'MODIFY lt_items FROM ls_item INDEX sy-tabix',
      'MODIFY lt_items FROM ls_item TRANSPORTING status',
      'DELETE lt_items WHERE status = 1',
      'DELETE ADJACENT DUPLICATES FROM lt_items',
      'DELETE lt_items INDEX 3',
      'MODIFY SCREEN',
    ]) {
      expect(databaseWriteIn(statement), statement).toBeNull();
    }
  });

  test('the database forms still are', () => {
    expect(databaseWriteIn('INSERT zcustom_table FROM ls_row')).toEqual({ table: 'zcustom_table', keyword: 'INSERT' });
    expect(databaseWriteIn('INSERT INTO vbak VALUES ls_row')).toEqual({ table: 'vbak', keyword: 'INSERT' });
    expect(databaseWriteIn('UPDATE mara SET matnr = @lv_matnr WHERE matnr = @lv_old')).toEqual({ table: 'mara', keyword: 'UPDATE' });
    expect(databaseWriteIn('MODIFY zorder_head FROM TABLE lt_rows')).toEqual({ table: 'zorder_head', keyword: 'MODIFY' });
    expect(databaseWriteIn('DELETE FROM zlog WHERE created < @lv_date')).toEqual({ table: 'zlog', keyword: 'DELETE' });
    expect(databaseWriteIn('DELETE zlog FROM TABLE lt_rows')).toEqual({ table: 'zlog', keyword: 'DELETE' });
  });

  test('an unknown name is still treated as a table — the guard removes noise, not coverage', () => {
    // Over-reporting is the safe direction: a real write must never be missed.
    expect(databaseWriteIn('INSERT something_unfamiliar FROM ls_row')).toEqual({ table: 'something_unfamiliar', keyword: 'INSERT' });
    expect(isInternalTableOperation('INSERT something_unfamiliar FROM ls_row')).toBe(false);
  });
});

test.describe('the coupling report of the assessment engine', () => {
  const coupling = (code: string) => extractDataCoupling(code);

  test('ordinary internal-table work produces no data coupling', () => {
    const code = [
      'REPORT z_items.',
      'DATA: lt_items TYPE STANDARD TABLE OF ty_item,',
      '      ls_item  TYPE ty_item.',
      'START-OF-SELECTION.',
      '  INSERT ls_item INTO TABLE lt_items.',
      '  MODIFY lt_items FROM ls_item INDEX 1.',
      '  DELETE lt_items WHERE status = 1.',
      '  DELETE ADJACENT DUPLICATES FROM lt_items COMPARING id.',
    ].join('\n');
    expect(coupling(code), 'no table was touched, so none is reported').toEqual([]);
  });

  test('a real write is still reported, from the same source', () => {
    const code = [
      'REPORT z_items.',
      'DATA: lt_items TYPE STANDARD TABLE OF ty_item.',
      'START-OF-SELECTION.',
      '  INSERT ls_item INTO TABLE lt_items.',
      '  UPDATE zorder_head SET status = @lv_status WHERE id = @lv_id.',
    ].join('\n');
    const entries = coupling(code);
    expect(entries.map((e) => e.tableName.toUpperCase())).toContain('ZORDER_HEAD');
    expect(entries.map((e) => e.tableName.toUpperCase()), 'the work area is not a table').not.toContain('LS_ITEM');
  });
});

test('both engines read the same rule', () => {
  const assessment = readFileSync(join(process.cwd(), 'lib/abap/code-assessment.ts'), 'utf8');
  expect(assessment).toContain("from './open-sql-discrimination'");
  // The private copies of the detectors are gone.
  expect(assessment).not.toMatch(/const insertMatch = text\.match/);
  expect(assessment).not.toMatch(/const modifyMatch = text\.match/);
  expect(assessment).not.toMatch(/const deleteMatch = text\.match/);
});

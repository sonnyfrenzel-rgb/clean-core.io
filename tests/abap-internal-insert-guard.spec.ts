import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';

/**
 * `INSERT <wa> INTO <itab>` is internal-table ABAP, not a database write.
 *
 * The detector recognised internal-table operations by their distinctive clauses
 * — `INTO TABLE`, `LINES OF`, `ASSIGNING`, `TRANSPORTING`, `INDEX`. The plain
 * `INSERT wa INTO itab` form carries none of them, so it fell through to the
 * database branch and reported the *work area* as an SAP standard table: a
 * Critical finding on a local variable.
 *
 * Two guards stood behind it — a name declared in the same source, and the
 * `LS_`/`GS_`/`LT_` naming convention — and neither holds for the partial
 * snippets people actually paste into the analyser, which is the case this
 * matters in. The discriminator now used is where `INTO` sits: after a name it
 * is the internal form, immediately after `INSERT` it is Open SQL.
 */
const findingsFor = (code: string) =>
  buildAbapEvidence(code, 'test.abap', 'private').findings;

const writesReported = (code: string) =>
  findingsFor(code).filter((f) =>
    /standard-table-write|custom-table-write|direct-table/i.test(f.kind || ''),
  );

test.describe('the internal-table form', () => {
  test('a work area inserted into an internal table is not a database write', () => {
    // No declarations: exactly the partial-snippet case the guards cannot help
    // with, and the one the analyser is used for.
    const writes = writesReported('INSERT workarea INTO items.');
    expect(
      writes.map((f) => `${f.kind}: ${f.objectName ?? ''}`),
      'a local work area was reported as an SAP table write',
    ).toEqual([]);
  });

  test('neither is the hyphenated component form', () => {
    expect(writesReported('INSERT ls_order-item INTO lt_items.')).toEqual([]);
  });

  test('and the clause-bearing forms still stay clear', () => {
    expect(writesReported('INSERT wa INTO TABLE items.')).toEqual([]);
    expect(writesReported('INSERT INITIAL LINE INTO items INDEX 1.')).toEqual([]);
  });
});

/**
 * Found while testing the fix above, reported by neither review pass.
 *
 * `collectLocalDataObjects` treats the name after any `INTO` as a local data
 * object — right for `LOOP AT it INTO wa` and `SELECT … INTO lt_x`, and wrong for
 * `INSERT INTO <dbtab>`, which is the standard Open SQL insert. The table was
 * registered as a variable, `processTableAccess` returned before looking at it,
 * and a direct write into an SAP standard table in the most common syntax there
 * is produced no finding at all.
 *
 * The two defects share the keyword and nothing else, which is why testing one
 * exposed the other.
 */
test.describe('the Open SQL insert is visible at all', () => {
  test('INSERT INTO a standard table is a Critical write', () => {
    const writes = writesReported('INSERT INTO vbak VALUES @ls_order.');
    expect(writes.length, 'a direct write to VBAK went entirely unreported').toBeGreaterThan(0);
    expect(writes.some((f) => (f.objectName || '').toUpperCase() === 'VBAK')).toBe(true);
  });

  test('INSERT INTO a custom table is reported too', () => {
    const writes = writesReported('INSERT INTO zcust_tab VALUES @ls_x.');
    expect(writes.some((f) => (f.objectName || '').toUpperCase() === 'ZCUST_TAB')).toBe(true);
  });

  test('the bare form without VALUES is not a hiding place either', () => {
    expect(writesReported('INSERT INTO vbak.').length).toBeGreaterThan(0);
  });

  test('and a LOOP target is still recognised as local', () => {
    // The heuristic this fix narrows must keep doing its actual job.
    expect(
      writesReported('LOOP AT lt_items INTO ls_item. INSERT ls_item INTO lt_out. ENDLOOP.'),
    ).toEqual([]);
  });
});

test.describe('the database forms still report', () => {
  test('INSERT INTO <dbtab> VALUES is Open SQL', () => {
    const writes = writesReported('INSERT INTO vbak VALUES @ls_order.');
    expect(writes.length, 'a real Open SQL insert went unreported').toBeGreaterThan(0);
    expect(writes.some((f) => (f.objectName || '').toUpperCase() === 'VBAK')).toBe(true);
  });

  test('INSERT <dbtab> FROM <wa> is Open SQL', () => {
    const writes = writesReported('INSERT vbap FROM @ls_item.');
    expect(writes.length, 'a real Open SQL insert went unreported').toBeGreaterThan(0);
    expect(writes.some((f) => (f.objectName || '').toUpperCase() === 'VBAP')).toBe(true);
  });

  test('UPDATE has no internal form and is untouched by this change', () => {
    const writes = writesReported("UPDATE vbap SET netwr = 100 WHERE vbeln = '123'.");
    expect(writes.length).toBeGreaterThan(0);
  });
});

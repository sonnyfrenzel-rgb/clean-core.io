/**
 * Codex code-engine-05, end to end: a direct write to an SAP object is level D.
 *
 * `tests/abcd-classification.spec.ts` holds the rule as a function. This spec
 * holds it where a reader meets it — from ABAP source, through the data
 * coupling the Analyze panel grades and the IT findings rows, to the letter —
 * because the rule is only as good as what reaches it as a `write`:
 *
 *   - every form of a direct database write (INSERT, UPDATE, MODIFY, DELETE,
 *     `FROM TABLE`, `INSERT INTO … VALUES`, a dynamic name the source resolves)
 *     on an SAP table is D, with the object's own grade kept beside it;
 *   - a write through SAP's own path — EML on a business object, a BAPI — is no
 *     direct write and must not become one: EML used to be read as a write to a
 *     table called ENTITIES, which this rule would have turned into a D;
 *   - reads, the customer's own tables and possible-only dynamic targets keep
 *     the answer they had.
 *
 * Pure functions over text; no server, no emulator.
 */
import { test, expect } from '@playwright/test';
import { extractDataCoupling } from '../lib/abap/code-assessment';
import { couplingUse, objectUseFromAccess } from '../lib/abap/abcd-classification';
import { gradeSapObjectUse } from '../lib/abap/catalog-service';
import { findingsOf } from '../lib/it-findings-build';

/** The grade the Analyze panel looks up for each data-coupling row. */
function couplingGrades(source: string) {
  return Object.fromEntries(
    extractDataCoupling(source).map((entry) => {
      const graded = gradeSapObjectUse(entry.tableName, objectUseFromAccess(entry.accessType));
      return [entry.tableName, { access: entry.accessType, grade: graded.grade, objectGrade: graded.objectGrade }];
    }),
  );
}

const program = (body: string) => `REPORT zcc_direct_write.\nDATA lv_name TYPE xubname.\nDATA ls_usr TYPE usr02.\nDATA lt_usr TYPE STANDARD TABLE OF usr02.\n${body}\n`;

test.describe('a direct database write to an SAP table is D (code-engine-05)', () => {
  const forms: [string, string][] = [
    ['DELETE FROM … WHERE', 'DELETE FROM usr02 WHERE bname = lv_name.'],
    ['DELETE … FROM wa', 'DELETE usr02 FROM ls_usr.'],
    ['UPDATE … SET', "UPDATE usr02 SET uflag = 64 WHERE bname = lv_name."],
    ['UPDATE … FROM wa', 'UPDATE usr02 FROM ls_usr.'],
    ['INSERT … FROM wa', 'INSERT usr02 FROM ls_usr.'],
    ['INSERT INTO … VALUES', 'INSERT INTO usr02 VALUES ls_usr.'],
    ['MODIFY … FROM wa', 'MODIFY usr02 FROM ls_usr.'],
    ['MODIFY … FROM TABLE', 'MODIFY usr02 FROM TABLE lt_usr.'],
    ['INSERT … FROM TABLE', 'INSERT usr02 FROM TABLE lt_usr ACCEPTING DUPLICATE KEYS.'],
    ['dynamic, resolved constant', "CONSTANTS lc_tab TYPE tabname VALUE 'USR02'.\nDELETE FROM (lc_tab) WHERE bname = lv_name."],
  ];

  for (const [label, statement] of forms) {
    test(`${label}: USR02 written directly is D, its own grade C kept`, () => {
      const grades = couplingGrades(program(statement));
      expect(grades.USR02, `no data coupling for ${statement}`).toBeDefined();
      expect(grades.USR02).toEqual({ access: 'Write', grade: 'D', objectGrade: 'C' });
    });
  }

  test('a released SAP object written directly is D, its own A kept', () => {
    // Open SQL cannot write a CDS view, so the statement fails to activate; the
    // engine reads source as written, and a reader who submits it must not be
    // told the write is level A.
    expect(couplingGrades(program('UPDATE i_product SET producttype = lv_name.')).I_PRODUCT).toEqual({
      access: 'Write',
      grade: 'D',
      objectGrade: 'A',
    });
  });

  test('a table SAP will not release, written directly, stays D', () => {
    expect(couplingGrades(program('UPDATE kna1 SET loevm = abap_true WHERE kunnr = lv_name.')).KNA1).toMatchObject({
      access: 'Write',
      grade: 'D',
    });
  });

  test('the IT findings row says D for the write and C for the read of the same table', () => {
    const source = program('SELECT SINGLE * FROM usr02 INTO @ls_usr WHERE bname = @lv_name.\nDELETE FROM usr02 WHERE bname = lv_name.');
    const rows = findingsOf(source, 'zcc_direct_write.abap').rows.filter((row) => row.objectName === 'USR02');
    const write = rows.find((row) => row.kind === 'standard-table-write');
    const read = rows.find((row) => row.kind === 'standard-table-read');
    expect(write, 'the delete is no standard-table-write finding').toBeDefined();
    expect(write!.severity).toBe('Critical');
    expect(write!.level, 'a Critical direct write printed beside a level that is not D').toBe('D');
    expect(write!.objectLevel, "the object's own level is not kept beside the D").toBe('C');
    expect(read!.level).toBe('C');
    expect(read!.objectLevel).toBeNull();
  });
});

test.describe('a write through SAP\'s own path keeps its grade', () => {
  test('EML on a released business object is not a write to a table', () => {
    const source = [
      'REPORT zcc_eml.',
      'MODIFY ENTITIES OF i_producttp_2',
      '  ENTITY product',
      "  UPDATE FIELDS ( producttype ) WITH VALUE #( ( product = 'P1' producttype = 'FERT' ) )",
      '  FAILED DATA(failed) REPORTED DATA(reported).',
      'MODIFY ENTITY i_producttp_2 UPDATE FIELDS ( producttype ) WITH VALUE #( ).',
      'COMMIT ENTITIES.',
    ].join('\n');
    const coupling = extractDataCoupling(source);
    // Before: a "table" ENTITIES (and ENTITY), written — residual C, and D under the new rule.
    expect(coupling.map((entry) => entry.tableName)).toEqual([]);
    const rows = findingsOf(source, 'zcc_eml.abap').rows;
    expect(rows.filter((row) => row.kind === 'standard-table-write')).toEqual([]);
    expect(rows.some((row) => row.level === 'D')).toBe(false);
    // The business object itself is graded by name: released, A.
    expect(gradeSapObjectUse('I_PRODUCTTP_2', null).grade).toBe('A');
  });

  test('DELETE DATASET removes a file, not rows of a table called DATASET', () => {
    const source = [
      'REPORT zcc_file.',
      'PARAMETERS p_file TYPE string.',
      'OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.',
      'CLOSE DATASET p_file.',
      'DELETE DATASET p_file.',
    ].join('\n');
    expect(extractDataCoupling(source).map((entry) => entry.tableName)).toEqual([]);
    expect(findingsOf(source, 'zcc_file.abap').rows.filter((row) => row.objectName === 'DATASET')).toEqual([]);
  });

  test('a BAPI that changes data is a call, not a write', () => {
    const source = [
      'REPORT zcc_bapi.',
      'DATA lt_return TYPE STANDARD TABLE OF bapiret2.',
      "CALL FUNCTION 'BAPI_SALESORDER_CHANGE' EXPORTING salesdocument = '1' TABLES return = lt_return.",
      "CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'.",
    ].join('\n');
    expect(extractDataCoupling(source).filter((entry) => entry.accessType === 'Write' || entry.accessType === 'Read/Write')).toEqual([]);
    expect(gradeSapObjectUse('BAPI_SALESORDER_CHANGE', null).grade).toBe('B');
  });
});

test.describe('what the direct-write rule does not touch', () => {
  test('a read of the same SAP tables keeps its grade', () => {
    const grades = couplingGrades(program([
      'SELECT SINGLE * FROM usr02 INTO @ls_usr WHERE bname = @lv_name.',
      'SELECT SINGLE * FROM i_product INTO @DATA(ls_product).',
      'SELECT SINGLE * FROM kna1 INTO @DATA(ls_kna1).',
    ].join('\n')));
    expect(grades.USR02).toMatchObject({ access: 'Read', grade: 'C' });
    expect(grades.I_PRODUCT).toMatchObject({ access: 'Read', grade: 'A' });
    expect(grades.KNA1).toMatchObject({ access: 'Read', grade: 'C' });
  });

  test("the customer's own table written directly stays B", () => {
    const grades = couplingGrades(program('DATA ls_log TYPE zcc_log.\nMODIFY zcc_log FROM ls_log.\nDELETE FROM zcc_log WHERE id = lv_name.'));
    expect(grades.ZCC_LOG).toMatchObject({ access: 'Write', grade: 'B' });
  });

  test('a possible-only dynamic target is not a resolved write', () => {
    // A DEFAULT is a value the name may take (R26), not the target. The data
    // coupling says so, and the panel grades such a row by the object's name.
    const source = "REPORT zcc_dyn.\nPARAMETERS p_tab TYPE tabname DEFAULT 'USR02'.\nDELETE FROM (p_tab) WHERE bname = 'X'.";
    const entry = extractDataCoupling(source).find((e) => e.tableName === 'USR02');
    expect(entry?.possibleTargetOf, 'the DEFAULT is read as the resolved target').toBeDefined();
    expect(couplingUse(entry!)).toBeNull();
    expect(gradeSapObjectUse('USR02', couplingUse(entry!)).grade).toBe('C');
    // A resolved dynamic write is still a write.
    expect(couplingUse({ accessType: 'Write' })).toBe('write');
    expect(couplingUse({ accessType: 'Read', possibleTargetOf: ['P_TAB'] })).toBe('read');
  });
});

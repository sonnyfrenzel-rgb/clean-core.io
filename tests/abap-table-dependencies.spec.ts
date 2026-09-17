import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractDataCoupling, extractCodeInventory, recommendArchitecture } from '../lib/abap/code-assessment';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readTableDependencies } from '../lib/abap/table-dependencies';
import { createLiteralScanner } from '../lib/abap/statement-reader';
import type { DataCouplingEntry } from '../lib/types';

/**
 * The dependencies the engine could not see, and the ones it invented — roadmap
 * 2.11, defect family (c).
 *
 * Measured against the reference corpus on 17.09.2026: nine cases where the
 * engine reported nothing or the wrong thing. The sources below are the shapes
 * of those cases (CC-020, CC-034, CC-036, CC-037, CC-038, CC-040, CC-042,
 * CC-045, CC-047) plus the local-table over-report the metamorphic properties
 * found in `Z_BUSINESS_PARTNER_SYNC`. They are written out here rather than
 * read from `tests/korpus/`: this spec says what the engine must do, the corpus
 * says what the answer is, and the two are allowed to be checked separately.
 *
 * The line the answer is anchored at is part of every assertion. R27 puts the
 * primary anchor on the statement that takes effect — for a macro, the call
 * site, not the definition.
 */

const coupling = (code: string) => extractDataCoupling(code);
const tables = (code: string) => coupling(code).map((e) => e.tableName);
const entry = (code: string, name: string): DataCouplingEntry | undefined =>
  coupling(code).find((e) => e.tableName === name);
const findings = (code: string) => buildAbapEvidence(code, 'source.abap', 'private').findings;
const gaps = (code: string) => buildAbapEvidence(code, 'source.abap', 'private').coverage.unassessed;

/* ------------------------------------------------------------------ ADBC */

const ADBC = [
  'REPORT zcc_adbc.',
  'PARAMETERS p_name TYPE c LENGTH 35 LOWER CASE.',
  'DATA lv_sql TYPE string.',
  'DATA lv_rows TYPE i.',
  'START-OF-SELECTION.',
  "  lv_sql = |UPDATE KNA1 SET NAME1 = '{ p_name }' | &&",
  "           |WHERE MANDT = '{ sy-mandt }'|.",
  '  DATA(lo_stmt) = NEW cl_sql_statement( ).',
  '  lv_rows = lo_stmt->execute_update( lv_sql ).',
  '  COMMIT WORK.',
].join('\n');

test.describe('ADBC: the string template is the SQL statement (R13b a, CC-034)', () => {
  test('the table written by the executed text is the dependency, at the call', () => {
    const kna1 = entry(ADBC, 'KNA1');
    expect(kna1, 'KNA1 is written by the text this program executes').toBeTruthy();
    expect(kna1!.accessType).toBe('Write');
    expect(kna1!.via).toContain('adbc');
    expect(kna1!.lineNumbers).toEqual([9]);
    expect(tables(ADBC), 'the variable holding the text is not a table').not.toContain('LV_SQL');
  });

  test('the evidence engine calls it native SQL and reports the write', () => {
    const at9 = findings(ADBC).filter((f) => f.lineStart === 9);
    expect(at9.map((f) => f.kind).sort()).toEqual(['native-sql', 'standard-table-write']);
    expect(at9.find((f) => f.kind === 'standard-table-write')!.objectName).toBe('KNA1');
  });

  test('a table name that only exists in an embedded expression is not read out of it', () => {
    const code = [
      'REPORT zcc_adbc2.',
      'PARAMETERS p_tab TYPE c LENGTH 30 DEFAULT \'KNA1\'.',
      'DATA lv_sql TYPE string.',
      'START-OF-SELECTION.',
      '  lv_sql = |SELECT * FROM { p_tab }|.',
      '  DATA(lo_stmt) = NEW cl_sql_statement( ).',
      '  DATA(lo_res) = lo_stmt->execute_query( lv_sql ).',
    ].join('\n');
    // The name of the table stands in an embedded expression, which is ABAP and
    // not part of the text (R13a). Nothing is resolved, and nothing is invented.
    expect(tables(code)).not.toContain('P_TAB');
    expect(gaps(code).map((g) => `${g.line} ${g.gap}`)).toContain('7 dynamic-target');
    expect(findings(code).filter((f) => f.lineStart === 7).map((f) => f.kind)).toEqual(['native-sql']);
  });

  test('SQL in a literal is prose until something executes it (R13a, CC-016)', () => {
    const code = [
      'REPORT zcc_text.',
      'DATA lv_sql TYPE string.',
      'START-OF-SELECTION.',
      '  DATA(lo_stmt) = NEW cl_sql_statement( ).',
      "  WRITE / 'lo_stmt->execute_update( lv_sql )'.",
      "  lv_sql = |UPDATE KNA1 SET NAME1 = 'X'|.",
    ].join('\n');
    // The program builds the text and prints a sentence about executing it. The
    // sentence is a literal, not a call, and an unexecuted text is no statement.
    expect(coupling(code)).toEqual([]);
    expect(findings(code).map((f) => f.kind)).not.toContain('native-sql');
  });
});

/* ----------------------------------------------------------------- macro */

const MACRO = [
  'REPORT zcc_macro.',
  'DATA lv_count TYPE i.',
  'DEFINE count_rows.',
  '  SELECT COUNT(*) FROM &1 INTO @lv_count.',
  'END-OF-DEFINITION.',
  'START-OF-SELECTION.',
  '  count_rows kna1.',
  '  count_rows knb1.',
].join('\n');

test.describe('macros: the effect is at the call site (R27, CC-042)', () => {
  test('the placeholder is never an object, and both call sites are', () => {
    expect(tables(MACRO).sort()).toEqual(['KNA1', 'KNB1']);
    expect(entry(MACRO, 'KNA1')!.lineNumbers).toEqual([7]);
    expect(entry(MACRO, 'KNB1')!.lineNumbers).toEqual([8]);
    expect(entry(MACRO, 'KNA1')!.via).toContain('macro');
  });

  test('the evidence engine anchors the read at the call, not at the definition', () => {
    const reads = findings(MACRO).filter((f) => f.kind === 'standard-table-read');
    expect(reads.map((f) => `${f.objectName}@${f.lineStart}`)).toEqual(['KNA1@7', 'KNB1@8']);
  });

  test('a macro that is never called reports nothing', () => {
    const code = ['REPORT zcc_macro2.', 'DEFINE read_it.', '  SELECT * FROM kna1 INTO TABLE @lt.', 'END-OF-DEFINITION.'].join('\n');
    expect(coupling(code)).toEqual([]);
  });
});

/* ------------------------------------------------------- dynamic targets */

const CONSTANT_TARGET = [
  'REPORT zcc_const.',
  "CONSTANTS lc_tab TYPE c LENGTH 30 VALUE 'KNA1'.",
  'START-OF-SELECTION.',
  '  SELECT kunnr, name1',
  '    FROM (lc_tab)',
  '    INTO TABLE @DATA(lt_rows).',
].join('\n');

const INPUT_TARGET = [
  'REPORT zcc_input.',
  "PARAMETERS p_tab TYPE c LENGTH 30 DEFAULT 'KNA1'.",
  'DATA lv_count TYPE i.',
  'START-OF-SELECTION.',
  '  SELECT COUNT(*)',
  '    FROM (p_tab)',
  '    INTO @lv_count.',
].join('\n');

const DYNAMIC_WRITE = [
  'REPORT zcc_dynwrite.',
  "PARAMETERS p_tab TYPE c LENGTH 30 DEFAULT 'ZCC_LOG_A'.",
  'PARAMETERS p_key TYPE c LENGTH 10.',
  'DATA ls_row TYPE zcc_log_row.',
  'START-OF-SELECTION.',
  '  ls_row-log_key = p_key.',
  '  MODIFY (p_tab) FROM @ls_row.',
].join('\n');

test.describe('dynamic targets: resolved, or said to be open (R07/R26)', () => {
  test('a constant closes the target set (CC-036)', () => {
    expect(tables(CONSTANT_TARGET)).toEqual(['KNA1']);
    expect(tables(CONSTANT_TARGET), 'the parenthesised name is no table').not.toContain('(LC_TAB)');
    expect(entry(CONSTANT_TARGET, 'KNA1')!.accessType).toBe('Read');
    expect(entry(CONSTANT_TARGET, 'KNA1')!.possibleTargetOf).toBeUndefined();
    expect(findings(CONSTANT_TARGET).map((f) => `${f.kind}/${f.objectName}@${f.lineStart}`)).toEqual([
      'standard-table-read/KNA1@4',
    ]);
    expect(gaps(CONSTANT_TARGET).map((g) => g.gap), 'a closed target is not an open question').not.toContain('dynamic-target');
  });

  test('an input does not: the default is a possible target, not the target (CC-037)', () => {
    expect(tables(INPUT_TARGET), 'a parenthesised parameter is no table').not.toContain('(P_TAB)');
    const kna1 = entry(INPUT_TARGET, 'KNA1');
    expect(kna1!.possibleTargetOf).toEqual(['P_TAB']);
    expect(kna1!.recommendation).toContain('Possible target only');
    expect(findings(INPUT_TARGET), 'a possible target is no finding').toEqual([]);
    expect(gaps(INPUT_TARGET).map((g) => `${g.line} ${g.gap}`)).toEqual(['5 dynamic-target']);
    const unresolved = readTableDependencies(INPUT_TARGET).unresolved;
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({ expression: 'p_tab', access: 'read', origin: 'selection-screen', line: 5 });
  });

  test('a dynamic write reports its possible target and its type (CC-038)', () => {
    const log = entry(DYNAMIC_WRITE, 'ZCC_LOG_A');
    expect(log!.accessType).toBe('Write');
    expect(log!.possibleTargetOf).toEqual(['P_TAB']);
    expect(entry(DYNAMIC_WRITE, 'ZCC_LOG_ROW')!.accessType).toBe('Reference');
    expect(readTableDependencies(DYNAMIC_WRITE).unresolved[0]).toMatchObject({ access: 'write', line: 7 });
  });

  test('a possible target does not decide the architecture', () => {
    const route = recommendArchitecture(DYNAMIC_WRITE, extractCodeInventory(DYNAMIC_WRITE), coupling(DYNAMIC_WRITE));
    expect(route.justification, 'a custom table nobody proved is written must not read as one').not.toContain('custom table write');
  });

  test('a dynamic type keeps the value the source shows, as a possible one (CC-020)', () => {
    const code = [
      'REPORT zcc_dyntype.',
      "PARAMETERS p_type TYPE c LENGTH 30 DEFAULT 'ZCCR_PAYLOAD'.",
      'DATA lr_payload TYPE REF TO data.',
      'START-OF-SELECTION.',
      '  CREATE DATA lr_payload TYPE (p_type).',
    ].join('\n');
    const payload = entry(code, 'ZCCR_PAYLOAD');
    expect(payload!.accessType).toBe('Reference');
    expect(payload!.possibleTargetOf).toEqual(['P_TYPE']);
    expect(gaps(code).map((g) => `${g.line} ${g.gap}`)).toContain('5 dynamic-target');
  });
});

/* --------------------------------------------------------- type references */

const TYPE_REFERENCES = [
  'REPORT zcc_types.',
  'TABLES: kna1.',
  'SELECT-OPTIONS s_kunnr FOR kna1-kunnr.',
  'TYPES: BEGIN OF ty_cust.',
  '        INCLUDE STRUCTURE kna1.',
  'TYPES:  flag TYPE c LENGTH 1,',
  '      END OF ty_cust.',
  'DATA ls_kna1 TYPE kna1.',
  'START-OF-SELECTION.',
  "  ls_kna1-kunnr = '0000001000'.",
].join('\n');

test.describe('type references are a dependency and no access (R29, CC-045)', () => {
  test('TABLES, FOR, INCLUDE STRUCTURE and TYPE all name the table', () => {
    const kna1 = entry(TYPE_REFERENCES, 'KNA1');
    expect(kna1, 'a program that types itself from KNA1 depends on KNA1').toBeTruthy();
    expect(kna1!.accessType).toBe('Reference');
    expect(kna1!.readCount).toBe(0);
    expect(kna1!.writeCount).toBe(0);
    expect(kna1!.lineNumbers).toEqual([2, 3, 5, 8]);
    expect(kna1!.recommendation).toContain('Type reference only');
    expect(findings(TYPE_REFERENCES), 'a type reference reads no row, so it is no finding').toEqual([]);
  });

  test('`INCLUDE STRUCTURE` is no program include', () => {
    expect(extractCodeInventory(TYPE_REFERENCES).map((i) => i.objectName)).not.toContain('STRUCTURE');
  });

  test('a type without a structure behind it is not a table', () => {
    const code = [
      'REPORT zcc_elem.',
      'TYPE-POOLS: slis.',
      'DATA lv_kunnr TYPE kunnr.',
      'DATA gt_fcat TYPE slis_t_fieldcat_alv.',
      'DATA ls_fcat TYPE slis_fieldcat_alv.',
      'START-OF-SELECTION.',
      "  lv_kunnr = '1'.",
      "  ls_fcat-fieldname = 'KUNNR'.",
    ].join('\n');
    // A data element has no components, and a type of a type group is not a
    // dictionary table however many components it has.
    expect(tables(code)).toEqual([]);
  });

  test('a hyphenated keyword is not a component of a field of the same name', () => {
    const code = [
      'REPORT zcc_msg MESSAGE-ID zsd_legacy.',
      'TYPES: BEGIN OF ty_log,',
      '         message TYPE char255,',
      '       END OF ty_log.',
      'DATA gs_log TYPE ty_log.',
      'DATA message TYPE bapiret2.',
    ].join('\n');
    expect(tables(code), 'MESSAGE-ID selects no component of a data object called message').toEqual([]);
  });
});

/* ----------------------------------------------------- logical database */

const LDB = [
  'REPORT zcc_ldb.',
  'NODES: kna1.',
  'DATA gv_count TYPE i.',
  'START-OF-SELECTION.',
  '  GET RUN TIME FIELD gv_count.',
  'GET kna1.',
  '  WRITE: / kna1-kunnr.',
].join('\n');

test.describe('logical database: read without a SELECT (R33, CC-047)', () => {
  test('NODES binds and GET reads, and GET RUN TIME does neither', () => {
    const kna1 = entry(LDB, 'KNA1');
    expect(kna1!.accessType).toBe('Read');
    expect(kna1!.via).toContain('logical-database');
    expect(kna1!.lineNumbers).toEqual([2, 6]);
    expect(kna1!.recommendation).toContain('logical database');
    expect(tables(LDB), 'GET RUN TIME names no table').not.toContain('RUN');
    expect(findings(LDB).map((f) => `${f.kind}/${f.objectName}@${f.lineStart}`)).toEqual(['standard-table-read/KNA1@6']);
  });
});

/* ------------------------------------------------------- program globals */

const PROGRAM_GLOBAL = [
  'REPORT zcc_assign.',
  'FIELD-SYMBOLS <lv_vbeln> TYPE any.',
  'DATA lv_name TYPE c LENGTH 40.',
  'START-OF-SELECTION.',
  "  ASSIGN ('(SAPMV45A)VBAK-VBELN') TO <lv_vbeln>.",
  '  ASSIGN (lv_name) TO <lv_vbeln>.',
].join('\n');

test.describe("another program's global field, named in a literal (R13b b, CC-040)", () => {
  test('the literal names the dependency; an unresolved one names nothing', () => {
    const vbak = entry(PROGRAM_GLOBAL, 'VBAK');
    expect(vbak, 'the field belongs to VBAK in SAPMV45A').toBeTruthy();
    expect(vbak!.accessType).toBe('Reference');
    expect(vbak!.via).toContain('program-global');
    expect(vbak!.recommendation).toContain('SAPMV45A');
    expect(vbak!.lineNumbers).toEqual([5]);
    expect(tables(PROGRAM_GLOBAL), 'the variable of the second ASSIGN is no table').toEqual(['VBAK']);
  });
});

/* ------------------------------------------------------------ local names */

test.describe('a name declared in the source is a variable (Fallbuch §8)', () => {
  test('MODIFY on a local internal table is no database write', () => {
    const code = [
      'REPORT zcc_local.',
      'TYPES: BEGIN OF ty_bp, name1 TYPE c LENGTH 35, END OF ty_bp.',
      'DATA: gt_bp_data TYPE TABLE OF ty_bp,',
      '      gs_bp_data TYPE ty_bp.',
      'START-OF-SELECTION.',
      '  LOOP AT gt_bp_data INTO gs_bp_data.',
      '    MODIFY gt_bp_data FROM gs_bp_data.',
      '  ENDLOOP.',
    ].join('\n');
    expect(tables(code)).toEqual([]);
  });

  test('the shipped example says the same thing', () => {
    const source = readFileSync(join(process.cwd(), 'public/starter-examples/Z_BUSINESS_PARTNER_SYNC.txt'), 'utf8');
    const names = tables(source);
    expect(names, 'GT_BP_DATA is declared on line 20 of that file').not.toContain('GT_BP_DATA');
    expect(names, 'the tables it really reads are still there').toEqual(expect.arrayContaining(['BUT000', 'ADRC']));
  });
});

/* --------------------------------------------------------- the literal rule */

test('the literal scanner says where an embedded expression is, and nothing else changes', () => {
  const read = (text: string) => {
    const scan = createLiteralScanner();
    return [...text].map((ch) => (scan(ch) ? 'c' : scan.embedded() ? 'e' : '.')).join('');
  };
  // `a = ` is code, `|UP` is template text, `{ x ` is the embedded expression,
  // and `}|` closes both; the period after it ends the statement.
  expect(read('a = |UP{ x }|.')).toBe('cccc...eeee..c');
  expect(read("WRITE 'a'.")).toBe('cccccc...c');
});

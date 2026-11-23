import { test, expect } from '@playwright/test';
import { readSource } from '../lib/engine4/index';
import { references, type Reference } from '../lib/engine4/references';
import { runReferenceShadow } from '../scripts/engine4/shadow-references';
import { shadowCorpus } from '../scripts/engine4/shadow';

/**
 * Engine 4.0, L4 first step: the reference table (docs/design/engine4.md,
 * "L4: references"). On the product path from engine 3.4.0: the class gap reads
 * its static references (`lib/abap/sap-class-references.ts`, ADR-141; QA
 * 88ca06da5ca3). The
 * shadow against today's evidence runs over the starter examples and the
 * benchmark learn halves, never the holdout. Server-free.
 */
const SOURCE = `REPORT zr MESSAGE-ID zmsg.
TYPE-POOLS slis.
TABLES vbak.
CONSTANTS gc_fm TYPE rs38l_fnam VALUE 'Z_CONST_FM'.
DATA go_alv TYPE REF TO cl_gui_alv_grid.
DATA go_salv TYPE REF TO cl_salv_table.
DATA lv_fm TYPE rs38l_fnam.
DATA lv_tab TYPE tabname VALUE 'MARA'.
DATA lt_vbap TYPE STANDARD TABLE OF vbap WITH DEFAULT KEY.
DATA ls_k TYPE vbak-vbeln.
CLASS lcl DEFINITION INHERITING FROM cl_abap_unit_assert.
  PUBLIC SECTION.
    INTERFACES if_serializable_object.
    METHODS run RAISING cx_static_check zcx_mine.
ENDCLASS.
START-OF-SELECTION.
  CREATE OBJECT go_alv EXPORTING i_parent = cl_gui_container=>screen0.
  cl_salv_table=>factory( IMPORTING r_salv_table = go_salv ).
  lv_fm = 'Z_ASSIGNED_FM'.
  CALL FUNCTION lv_fm.
  CALL FUNCTION gc_fm DESTINATION 'NONE'.
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'.
  SELECT * FROM (lv_tab) INTO TABLE @DATA(lt_x).
  SELECT * FROM vbak AS a INNER JOIN vbap AS b ON a~vbeln = b~vbeln INTO TABLE @DATA(lt_j).
  UPDATE zorders SET status = 'X' WHERE id = 1.
  MODIFY lt_vbap FROM ls_k INDEX 1.
  TRY.
    DATA(lo) = NEW zcl_worker( ).
  CATCH cx_sy_zerodivide cx_root INTO DATA(lx).
  ENDTRY.
  MESSAGE e001(zother) WITH 'x'.
  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'ACTVT' FIELD '03'.
  CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.
  SUBMIT zother_report AND RETURN.
  IF sy-subrc = 0. lv_fm = 'Z_BRANCH'. ENDIF.
  CALL FUNCTION lv_fm.
  RAISE EXCEPTION TYPE zcx_mine.
`;

const table = () => {
  const read = readSource(SOURCE);
  return references(read.statements, read.tree);
};
const key = (r: Reference) => `${r.row} ${r.kind} ${r.name ?? '?'} ${r.use} ${r.resolution}`;

test('every kind of SAP reference, with its line, use and how it was found', () => {
  expect(table().references.map(key)).toEqual([
    '1 messageClass ZMSG message static',
    '2 typePool SLIS typePool static',
    '3 table VBAK declare static',
    '4 type RS38L_FNAM type static',
    '5 classOrInterface CL_GUI_ALV_GRID typeRef static',
    '6 classOrInterface CL_SALV_TABLE typeRef static',
    '7 type RS38L_FNAM type static',
    '8 type TABNAME type static',
    '9 type VBAP type static',
    '10 type VBAK type static',
    '11 class CL_ABAP_UNIT_ASSERT inherit static',
    '13 interface IF_SERIALIZABLE_OBJECT implement static',
    '14 exception CX_STATIC_CHECK raising static',
    '14 exception ZCX_MINE raising static',
    '17 class CL_GUI_ALV_GRID instantiation declaredType',
    '17 classOrInterface CL_GUI_CONTAINER staticAccess static',
    '18 classOrInterface CL_SALV_TABLE staticAccess static',
    '20 functionModule Z_ASSIGNED_FM call assigned',
    '21 functionModule Z_CONST_FM callRemote constant',
    '22 functionModule BAPI_TRANSACTION_COMMIT call literal',
    '23 table MARA read value',
    '24 table VBAK read static',
    '24 table VBAP read static',
    '25 table ZORDERS write static',
    '28 class ZCL_WORKER instantiation static',
    '29 exception CX_SY_ZERODIVIDE catch static',
    '29 exception CX_ROOT catch static',
    '31 messageClass ZOTHER message static',
    '32 authorizationObject V_VBAK_VKO authorityCheck literal',
    '33 transaction VA03 callTransaction literal',
    '34 program ZOTHER_REPORT submit static',
    '36 functionModule ? call dynamic',
    '37 exception ZCX_MINE raise static',
  ]);
});

test('a dynamic name set on a branch stays open and lists every literal the source writes', () => {
  const open = table().references.find((r) => r.row === 36)!;
  expect(open.candidates).toEqual(['Z_ASSIGNED_FM', 'Z_BRANCH']);
  expect(open.via).toEqual({ variable: 'LV_FM', row: null });
  const assigned = table().references.find((r) => r.row === 20)!;
  expect(assigned.via).toEqual({ variable: 'LV_FM', row: 19 });
});

test('names the source defines itself are marked and not counted; an internal table is no database table', () => {
  const t = table();
  expect(t.definitions.classes).toEqual(['LCL']);
  expect(t.references.some((r) => r.name === 'LT_VBAP')).toBe(false);
  expect(t.counts.functionModule).toBe(4);
  const local = readSource('CLASS lcl DEFINITION. ENDCLASS.\nDATA go TYPE REF TO lcl.\nTYPES ty_x TYPE i.\nDATA lv TYPE ty_x.\n');
  const refs = references(local.statements, local.tree).references;
  expect(refs.filter((r) => !r.defined)).toEqual([]);
});

test('shadow against today\'s evidence: every reference counted, the class and exception gap measured', () => {
  test.setTimeout(600_000);
  const r = runReferenceShadow(shadowCorpus());
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.failures).toBe(0);
  const k = (kind: string) => r.byKind[kind];
  // Floors of 22.11.2026 (docs/design/engine4.md): the table finds at least this much.
  expect(k('table').total).toBeGreaterThanOrEqual(680);
  expect(k('functionModule').total).toBeGreaterThanOrEqual(450);
  expect(k('classOrInterface').total + k('class').total + k('interface').total + k('exception').total).toBeGreaterThanOrEqual(900);
  // Every table and function module today's evidence names is one the table finds.
  expect(k('table').reportedAnywhere).toBeGreaterThanOrEqual(600);
  expect(k('functionModule').reportedAnywhere).toBeGreaterThanOrEqual(230);
  // What today names and the table does not hold, explained in engine4.md: logical-database nodes (PERAS), names
  // read out of native SQL and AMDP bodies, enhancement and transport names, one CDS call with parameters.
  expect(Object.keys(r.missed).sort()).toEqual(['enhancement', 'modification', 'standard-table-read', 'table-access']);
  expect(Object.values(r.missed).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(11);
});

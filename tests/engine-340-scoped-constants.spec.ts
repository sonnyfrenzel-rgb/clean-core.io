import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readTableDependencies } from '../lib/abap/table-dependencies';

/**
 * Engine 3.4.0, B1 of the engine review of 22.11.2026 (gated by `ENGINE_READS_340_FROM`): a constant closes a
 * dynamic target only in the scope ABAP lets the statement see it in. The constant reader looked the name up in the
 * whole source, so `CONSTANTS lv_other … VALUE 'VBAK'` in one FORM made `DELETE FROM (lv_other)` in another FORM a
 * CRITICAL write to VBAK. The program below is the review's probe `p01_dynflow.abap`. Server-free.
 */
const OLD = 'v3.3.0';
const NEW = 'v3.4.0';

const PROBE = `REPORT zprobe_dynflow.
DATA lv_fm TYPE funcname.
DATA lv_tab TYPE tabname.
CONSTANTS gc_tab TYPE tabname VALUE 'KNA1'.

START-OF-SELECTION.
  lv_fm = 'BAPI_SALESORDER_CREATEFROMDAT2'.
  PERFORM call_it.
  lv_fm = 'Z_DELETE_EVERYTHING'.
  PERFORM call_it.

  lv_tab = 'MARA'.
  DO 2 TIMES.
    SELECT COUNT(*) FROM (lv_tab).
    lv_tab = 'BSEG'.
  ENDDO.

FORM call_it.
  CALL FUNCTION lv_fm.
ENDFORM.

FORM shadow.
  CONSTANTS lv_other TYPE tabname VALUE 'VBAK'.
  DATA lt TYPE TABLE OF vbak.
  SELECT * FROM (lv_other) INTO TABLE lt.
ENDFORM.

FORM other_scope.
  DATA lv_other TYPE tabname.
  lv_other = p_tab.
  DELETE FROM (lv_other).
ENDFORM.
`;

const vbak = (engine: string) =>
  buildAbapEvidence(PROBE, 'p01_dynflow.abap', 'private', undefined, engine).findings
    .filter((f) => /VBAK/.test(f.title))
    .map((f) => ({ severity: f.severity, kind: f.kind, line: f.lineStart }));

test('a constant of another FORM no longer closes DELETE FROM (name): no CRITICAL write to VBAK from 3.4.0', () => {
  expect(vbak(OLD)).toEqual([
    { severity: 'Medium', kind: 'standard-table-read', line: 25 },
    { severity: 'Critical', kind: 'standard-table-write', line: 31 },
  ]);
  expect(vbak(NEW)).toEqual([{ severity: 'Medium', kind: 'standard-table-read', line: 25 }]);
});

test('the DELETE is a dynamic-target gap from 3.4.0, so the coverage says what it did not read', () => {
  const lines = (engine: string) =>
    buildAbapEvidence(PROBE, 'p01_dynflow.abap', 'private', undefined, engine).coverage.unassessed.map((u) => u.line);
  expect(lines(OLD)).not.toContain(31);
  expect(lines(NEW)).toContain(31);
});

test('scope rules: own routine first, global unless the routine declares the name, event blocks are global', () => {
  const code = `REPORT zscope.
CONSTANTS gc_tab TYPE tabname VALUE 'KNA1'.
START-OF-SELECTION.
  CONSTANTS gc_evt TYPE tabname VALUE 'LFA1'.
  SELECT * FROM (gc_tab) INTO TABLE @DATA(a).
FORM own.
  CONSTANTS gc_tab TYPE tabname VALUE 'MARA'.
  SELECT * FROM (gc_tab) INTO TABLE @DATA(b).
ENDFORM.
FORM hides USING gc_tab TYPE tabname.
  SELECT * FROM (gc_tab) INTO TABLE @DATA(c).
ENDFORM.
FORM hides_data.
  DATA gc_tab TYPE tabname.
  SELECT * FROM (gc_tab) INTO TABLE @DATA(d).
ENDFORM.
FORM sees_global.
  SELECT * FROM (gc_tab) INTO TABLE @DATA(e).
  SELECT * FROM (gc_evt) INTO TABLE @DATA(f).
ENDFORM.
`;
  const read = (scopedConstants: boolean) => {
    const r = readTableDependencies(code, { multiLineTemplates: true, scopedConstants });
    return {
      tables: r.dependencies.filter((d) => d.access === 'read' && !d.possibleTargetOf).map((d) => `${d.line}:${d.table}`),
      open: r.unresolved.map((u) => u.line),
    };
  };
  expect(read(true)).toEqual({ tables: ['5:KNA1', '8:MARA', '18:KNA1', '19:LFA1'], open: [11, 15] });
  // Before 3.4.0: the name was looked up in the whole source; declared twice, it closed nothing anywhere.
  expect(read(false).tables).toEqual(['19:LFA1']);
});

test('a source without routine-local constants reads the same in both modes', () => {
  const code = `REPORT zsame.
CONSTANTS lc_tab TYPE tabname VALUE 'KNA1'.
FORM f.
  SELECT * FROM (lc_tab) INTO TABLE @DATA(a).
  DELETE FROM (lc_tab).
ENDFORM.
`;
  expect(readTableDependencies(code, { scopedConstants: true })).toEqual(readTableDependencies(code));
});

test('a method parameter hides a global constant of the same name (QA 7db68ed0ee64)', () => {
  // The parameter stands in the class definition, not in METHOD … ENDMETHOD; it hides the global constant as
  // much as a FORM parameter does. Before the fix the DELETE in `purge` was a CRITICAL write to VBAK.
  const code = `REPORT zmethod_param.
CONSTANTS lv_tab TYPE tabname VALUE 'VBAK'.
CLASS lcl DEFINITION.
  PUBLIC SECTION.
    METHODS purge IMPORTING lv_tab TYPE tabname.
    METHODS: keep IMPORTING iv_other TYPE tabname,
      wipe IMPORTING VALUE(lv_tab) TYPE tabname.
    CLASS-METHODS sees.
ENDCLASS.
CLASS lcl IMPLEMENTATION.
  METHOD purge.
    DELETE FROM (lv_tab).
  ENDMETHOD.
  METHOD keep.
    DELETE FROM (lv_tab).
  ENDMETHOD.
  METHOD wipe.
    DELETE FROM (lv_tab).
  ENDMETHOD.
  METHOD sees.
    DELETE FROM (lv_tab).
  ENDMETHOD.
ENDCLASS.
`;
  const read = (scopedConstants: boolean) => {
    const r = readTableDependencies(code, { multiLineTemplates: true, scopedConstants });
    return {
      writes: r.dependencies.filter((d) => d.access !== 'read' && !d.possibleTargetOf).map((d) => `${d.line}:${d.table}`),
      open: r.unresolved.map((u) => u.line),
    };
  };
  expect(read(true)).toEqual({ writes: ['15:VBAK', '21:VBAK'], open: [12, 18] });
  // Before 3.4.0 (the whole-source lookup) every DELETE closed on the global constant, as it signed.
  expect(read(false)).toEqual({ writes: ['12:VBAK', '15:VBAK', '18:VBAK', '21:VBAK'], open: [] });
});

test('a hidden name is not closed by an assignment in another FORM (QA 9fdd7c97ca76)', () => {
  // FORM a's parameter hides the global constant; FORM b assigns its own lv_tab = 'MARA'. The DELETE in FORM a stays
  // an open target: MARA is only a possible value (`possibleTargetOf`), never a closed write, and no write finding.
  const code = `REPORT zhidden_assign.
CONSTANTS lv_tab TYPE tabname VALUE 'KNA1'.
FORM a USING lv_tab TYPE tabname.
  DELETE FROM (lv_tab).
ENDFORM.
FORM b.
  DATA lv_tab TYPE tabname.
  lv_tab = 'MARA'.
ENDFORM.
`;
  const r = readTableDependencies(code, { multiLineTemplates: true, scopedConstants: true });
  expect(r.dependencies.filter((d) => !d.possibleTargetOf).map((d) => `${d.line}:${d.table}`)).toEqual([]);
  expect(r.unresolved.map((u) => `${u.line}:${u.expression}`)).toEqual(['4:lv_tab']);
  const writes = (engine: string) =>
    buildAbapEvidence(code, 'hidden.abap', 'private', undefined, engine).findings
      .filter((f) => f.kind === 'standard-table-write')
      .map((f) => f.title);
  expect(writes(NEW)).toEqual([]);
  expect(writes(OLD)).toEqual(['CRITICAL: Direct Write to SAP Standard Table KNA1']);
});

test('an inline FINAL( ) declaration hides a global constant as DATA( ) does', () => {
  const code = `REPORT zfinal.
CONSTANTS lv_tab TYPE tabname VALUE 'VBAK'.
FORM a.
  FINAL(lv_tab) = get_tabname( ).
  DELETE FROM (lv_tab).
ENDFORM.
`;
  const r = readTableDependencies(code, { multiLineTemplates: true, scopedConstants: true });
  expect(r.dependencies.filter((d) => !d.possibleTargetOf && d.access !== 'read').map((d) => `${d.line}:${d.table}`)).toEqual([]);
  expect(r.unresolved.map((u) => u.line)).toEqual([5]);
  const writes = buildAbapEvidence(code, 'final.abap', 'private', undefined, NEW).findings.filter((f) => f.kind === 'standard-table-write');
  expect(writes).toEqual([]);
});

test('a class constant is seen in its own class only and hides a global one there', () => {
  // The global gc_tab is MARA, the class's own gc_tab is VBAK. The FORM sees the global constant only; the method of
  // the declaring class sees its class's constant; another class sees the global one again.
  const code = `REPORT zclass_const.
CONSTANTS gc_tab TYPE tabname VALUE 'MARA'.
CLASS lcl DEFINITION.
  PUBLIC SECTION.
    CONSTANTS gc_tab TYPE tabname VALUE 'VBAK'.
    METHODS run.
ENDCLASS.
CLASS lcl IMPLEMENTATION.
  METHOD run.
    DELETE FROM (gc_tab).
  ENDMETHOD.
ENDCLASS.
CLASS lcl_other DEFINITION.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS lcl_other IMPLEMENTATION.
  METHOD run.
    DELETE FROM (gc_tab).
  ENDMETHOD.
ENDCLASS.
FORM purge.
  DELETE FROM (gc_tab).
ENDFORM.
`;
  const r = readTableDependencies(code, { multiLineTemplates: true, scopedConstants: true });
  expect(r.dependencies.filter((d) => d.access !== 'read' && !d.possibleTargetOf).map((d) => `${d.line}:${d.table}`))
    .toEqual(['10:VBAK', '19:MARA', '23:MARA']);
  expect(r.unresolved.map((u) => u.line)).toEqual([]);
});

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

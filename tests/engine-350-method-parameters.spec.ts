import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readTableDependencies } from '../lib/abap/table-dependencies';

/**
 * Engine 3.5.0 (gated by `ENGINE_READS_350_FROM`, option `declaringDefinition` of `readTableDependencies`): whether a
 * method's formal parameter hides a global constant used as a dynamic table name is read in the definition that
 * declares the method: the interface an implementation `zif~m` names, or the superclass that declares a method the
 * class redefines or inherits. Before, those two fell back to every `METHODS m` of the source, so a same-named
 * parameter of an unrelated class hid the constant and a CRITICAL write went unreported. Server-free.
 */
const OLD = 'v3.4.0';
const NEW = 'v3.5.0';

const read = (code: string, declaringDefinition: boolean) => {
  const r = readTableDependencies(code, { multiLineTemplates: true, scopedConstants: true, declaringDefinition });
  return {
    writes: r.dependencies.filter((d) => d.access !== 'read' && !d.possibleTargetOf).map((d) => `${d.line}:${d.table}`),
    open: r.unresolved.map((u) => u.line),
  };
};

const writeFindings = (code: string, engine: string) =>
  buildAbapEvidence(code, 'zparams.abap', 'private', undefined, engine).findings
    .filter((f) => f.kind === 'standard-table-write')
    .map((f) => `${f.lineStart}:${f.title}`);

test('an interface method reads its own interface, not a same-named method of another class', () => {
  const code = `REPORT zintf_param.
CONSTANTS lv_tab TYPE tabname VALUE 'VBAK'.
INTERFACE lif_purge.
  METHODS run.
ENDINTERFACE.
CLASS lcl_other DEFINITION.
  PUBLIC SECTION.
    METHODS run IMPORTING lv_tab TYPE tabname.
ENDCLASS.
CLASS lcl_purge DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_purge.
ENDCLASS.
CLASS lcl_purge IMPLEMENTATION.
  METHOD lif_purge~run.
    DELETE FROM (lv_tab).
  ENDMETHOD.
ENDCLASS.
CLASS lcl_other IMPLEMENTATION.
  METHOD run.
    DELETE FROM (lv_tab).
  ENDMETHOD.
ENDCLASS.
`;
  // 3.5.0: lif_purge~run has no parameter lv_tab, so the global constant closes its DELETE (line 16); lcl_other's
  // run declares lv_tab itself and stays open (line 21).
  expect(read(code, true)).toEqual({ writes: ['16:VBAK'], open: [21] });
  // 3.4.0 looked `run` up across every class: lcl_other's parameter hid the constant in lif_purge~run too.
  expect(read(code, false)).toEqual({ writes: [], open: [16, 21] });
  expect(writeFindings(code, NEW)).toEqual(['16:CRITICAL: Direct Write to SAP Standard Table VBAK']);
  expect(writeFindings(code, OLD)).toEqual([]);
});

test('a redefinition reads the superclass that declares the method', () => {
  const code = `REPORT zredef_param.
CONSTANTS lv_tab TYPE tabname VALUE 'VBAK'.
CLASS lcl_base DEFINITION.
  PUBLIC SECTION.
    METHODS run.
ENDCLASS.
CLASS lcl_child DEFINITION INHERITING FROM lcl_base.
  PUBLIC SECTION.
    METHODS run REDEFINITION.
ENDCLASS.
CLASS lcl_unrelated DEFINITION.
  PUBLIC SECTION.
    METHODS run IMPORTING lv_tab TYPE tabname.
ENDCLASS.
CLASS lcl_base IMPLEMENTATION.
  METHOD run.
  ENDMETHOD.
ENDCLASS.
CLASS lcl_child IMPLEMENTATION.
  METHOD run.
    DELETE FROM (lv_tab).
  ENDMETHOD.
ENDCLASS.
CLASS lcl_unrelated IMPLEMENTATION.
  METHOD run.
    DELETE FROM (lv_tab).
  ENDMETHOD.
ENDCLASS.
`;
  expect(read(code, true)).toEqual({ writes: ['21:VBAK'], open: [26] });
  expect(read(code, false)).toEqual({ writes: [], open: [21, 26] });
});

test('a parameter the declaring interface does give still hides the constant at every engine', () => {
  const code = `REPORT zintf_own.
CONSTANTS lv_tab TYPE tabname VALUE 'VBAK'.
INTERFACE lif_purge.
  METHODS run IMPORTING lv_tab TYPE tabname.
ENDINTERFACE.
CLASS lcl_purge DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_purge.
ENDCLASS.
CLASS lcl_purge IMPLEMENTATION.
  METHOD lif_purge~run.
    DELETE FROM (lv_tab).
  ENDMETHOD.
ENDCLASS.
`;
  expect(read(code, true)).toEqual({ writes: [], open: [12] });
  expect(read(code, false)).toEqual({ writes: [], open: [12] });
});

test('an interface whose definition is not in the source keeps the lookup of the engines before', () => {
  const code = `REPORT zintf_missing.
CONSTANTS lv_tab TYPE tabname VALUE 'VBAK'.
CLASS lcl_purge DEFINITION.
  PUBLIC SECTION.
    INTERFACES zif_purge.
ENDCLASS.
CLASS lcl_purge IMPLEMENTATION.
  METHOD zif_purge~run.
    DELETE FROM (lv_tab).
  ENDMETHOD.
ENDCLASS.
`;
  expect(read(code, true)).toEqual(read(code, false));
});

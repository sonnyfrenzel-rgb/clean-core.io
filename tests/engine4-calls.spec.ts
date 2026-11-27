import { test, expect } from '@playwright/test';
import { readSource } from '../lib/engine4/index';
import { callGraph, type CallGraph } from '../lib/engine4/calls';
import { runCallShadow } from '../scripts/engine4/shadow-calls';
import { shadowCorpus } from '../scripts/engine4/shadow';

/**
 * Engine 4.0, L5 first step: the call graph (`lib/engine4/calls.ts`). Inert. Dispatch over subclasses and
 * interface implementers, FINAL pruning, `super->` without dispatch, dynamic PERFORM through the value reading,
 * constructors and events; the shadow against today's PERFORM edges and unreachable FORMs. Server-free.
 */
const graph = (src: string) => {
  const r = readSource(src);
  return callGraph(r.statements, r.tree);
};
const edgesAt = (g: CallGraph, row: number) => g.edges.filter((e) => e.row === row).map((e) => `${e.how} ${e.to ?? e.external}`).sort();

const OO = `CLASS lcl_base DEFINITION.
  PUBLIC SECTION.
    METHODS run.
    METHODS fixed FINAL.
ENDCLASS.
CLASS lcl_a DEFINITION INHERITING FROM lcl_base.
  PUBLIC SECTION.
    METHODS run REDEFINITION.
ENDCLASS.
CLASS lcl_b DEFINITION INHERITING FROM lcl_base FINAL.
  PUBLIC SECTION.
    METHODS run REDEFINITION.
ENDCLASS.
INTERFACE lif_step.
  METHODS go.
ENDINTERFACE.
CLASS lcl_s1 DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_step.
    EVENTS done.
    METHODS on_done FOR EVENT done OF lcl_s1.
ENDCLASS.
CLASS lcl_s2 DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_step.
ENDCLASS.
CLASS lcl_base IMPLEMENTATION.
  METHOD run. ENDMETHOD.
  METHOD fixed. ENDMETHOD.
ENDCLASS.
CLASS lcl_a IMPLEMENTATION.
  METHOD run. super->run( ). ENDMETHOD.
ENDCLASS.
CLASS lcl_b IMPLEMENTATION.
  METHOD run. ENDMETHOD.
ENDCLASS.
CLASS lcl_s1 IMPLEMENTATION.
  METHOD lif_step~go. RAISE EVENT done. ENDMETHOD.
  METHOD on_done. ENDMETHOD.
ENDCLASS.
CLASS lcl_s2 IMPLEMENTATION.
  METHOD lif_step~go. ENDMETHOD.
ENDCLASS.
START-OF-SELECTION.
  DATA lo_base TYPE REF TO lcl_base.
  DATA lo_b TYPE REF TO lcl_b.
  DATA lo_step TYPE REF TO lif_step.
  lo_base->run( ).
  lo_b->run( ).
  lo_base->fixed( ).
  lo_step->go( ).
  CREATE OBJECT lo_base TYPE lcl_a.
  cl_salv_table=>factory( ).
  lo_unknown->x( ).
`;

test('dispatch: subclasses that redefine, interface implementers; FINAL prunes; super does not dispatch', () => {
  const g = graph(OO);
  const row = (text: string) => OO.split('\n').findIndex((l) => l.includes(text)) + 1;
  expect(edgesAt(g, row('lo_base->run( )'))).toEqual(['dispatch METHOD LCL_A=>RUN', 'dispatch METHOD LCL_B=>RUN', 'dispatch METHOD LCL_BASE=>RUN']);
  expect(edgesAt(g, row('lo_b->run( )'))).toEqual(['static METHOD LCL_B=>RUN']);
  expect(edgesAt(g, row('lo_base->fixed( )'))).toEqual(['static METHOD LCL_BASE=>FIXED']);
  expect(edgesAt(g, row('lo_step->go( )'))).toEqual(['dispatch METHOD LCL_S1=>LIF_STEP~GO', 'dispatch METHOD LCL_S2=>LIF_STEP~GO']);
  expect(edgesAt(g, row('super->run( )'))).toEqual(['static METHOD LCL_BASE=>RUN']);
  expect(edgesAt(g, row('RAISE EVENT done'))).toEqual(['dispatch METHOD LCL_S1=>ON_DONE']);
  expect(edgesAt(g, row('cl_salv_table=>factory'))).toEqual(['external CL_SALV_TABLE=>FACTORY']);
  expect(edgesAt(g, row('lo_unknown->x'))).toEqual(['unresolved LO_UNKNOWN->X']);
  expect(g.certain).toBe(false);
});

test('PERFORM: static, dynamic through the value reading, external; unreachable FORMs', () => {
  const src = [
    'REPORT z.', 'DATA lv_form TYPE string.', 'START-OF-SELECTION.', "  lv_form = 'B'.", '  PERFORM a.', '  PERFORM (lv_form) IN PROGRAM sy-repid.',
    '  PERFORM x IN PROGRAM zother.', 'FORM a.', '  PERFORM c.', 'ENDFORM.', 'FORM b.', 'ENDFORM.', 'FORM c.', 'ENDFORM.', 'FORM dead.', 'ENDFORM.',
  ].join('\n');
  const g = graph(src);
  expect(edgesAt(g, 5)).toEqual(['static FORM A']);
  // PERFORM a stands between the write and the use and may change a global: B is a candidate, not proven.
  expect(edgesAt(g, 6)).toEqual(['dynamic FORM B', 'dynamic PERFORM (LV_FORM)']);
  expect(edgesAt(g, 7)).toEqual(['external PROGRAM ZOTHER FORM X']);
  expect(g.unreachable).toEqual(['FORM DEAD']);
});

test('shadow against today\'s call graph: PERFORM edges and unreachable FORMs agree', () => {
  test.setTimeout(300_000);
  const r = runCallShadow(shadowCorpus());
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.performEdges.agree).toBe(r.performEdges.old);
  expect(r.performEdges.new).toBe(r.performEdges.old);
  expect(r.unreachableForms.agree).toBe(r.unreachableForms.old);
  expect(Object.keys(r.categories).filter((k) => k.endsWith(':unexplained'))).toEqual([]);
});

test('PERFORM (name) fixed to a FORM this source lacks is unresolved, so reachability is not certain (QA 365a3f83ed04)', () => {
  const src = ['REPORT z.', "CONSTANTS lc_form TYPE string VALUE 'MISSING'.", 'START-OF-SELECTION.', '  PERFORM (lc_form).', 'FORM a.', 'ENDFORM.'].join('\n');
  const g = graph(src);
  expect(edgesAt(g, 4)).toEqual(['unresolved FORM MISSING']);
  expect(g.certain).toBe(false);
});

test('a receiver resolves by the scope of the call: same name, different REF TO types in two methods', () => {
  const src = [
    'CLASS zcl_a DEFINITION.', '  PUBLIC SECTION.', '    METHODS run.', 'ENDCLASS.',
    'CLASS zcl_b DEFINITION.', '  PUBLIC SECTION.', '    METHODS run.', 'ENDCLASS.',
    'CLASS lcl_main DEFINITION.', '  PUBLIC SECTION.', '    METHODS one.', '    METHODS two.', 'ENDCLASS.',
    'CLASS zcl_a IMPLEMENTATION.', '  METHOD run.', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS zcl_b IMPLEMENTATION.', '  METHOD run.', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS lcl_main IMPLEMENTATION.',
    '  METHOD one.', '    DATA lo TYPE REF TO zcl_a.', '    lo->run( ).', '  ENDMETHOD.',
    '  METHOD two.', '    DATA lo TYPE REF TO zcl_b.', '    lo->run( ).', '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
  const g = graph(src);
  expect(edgesAt(g, 25)).toEqual(['static METHOD ZCL_A=>RUN']);
  expect(edgesAt(g, 29)).toEqual(['static METHOD ZCL_B=>RUN']);
});

test('a receiver that is a class attribute resolves to its own class\'s attribute type', () => {
  const src = [
    'CLASS zcl_x DEFINITION.', '  PUBLIC SECTION.', '    METHODS run.', 'ENDCLASS.',
    'CLASS zcl_y DEFINITION.', '  PUBLIC SECTION.', '    METHODS run.', 'ENDCLASS.',
    'CLASS lcl_one DEFINITION.', '  PUBLIC SECTION.', '    METHODS go.', '  PRIVATE SECTION.', '    DATA lo TYPE REF TO zcl_x.', 'ENDCLASS.',
    'CLASS lcl_two DEFINITION.', '  PUBLIC SECTION.', '    METHODS go.', '  PRIVATE SECTION.', '    DATA lo TYPE REF TO zcl_y.', 'ENDCLASS.',
    'CLASS zcl_x IMPLEMENTATION.', '  METHOD run.', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS zcl_y IMPLEMENTATION.', '  METHOD run.', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS lcl_one IMPLEMENTATION.', '  METHOD go.', '    lo->run( ).', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS lcl_two IMPLEMENTATION.', '  METHOD go.', '    lo->run( ).', '  ENDMETHOD.', 'ENDCLASS.',
  ].join('\n');
  const g = graph(src);
  expect(edgesAt(g, 31)).toEqual(['static METHOD ZCL_X=>RUN']);
  expect(edgesAt(g, 36)).toEqual(['static METHOD ZCL_Y=>RUN']);
});

test('an inherited attribute types the receiver before an unrelated class\'s attribute of the same name', () => {
  const src = [
    'CLASS zcl_t DEFINITION.', '  PUBLIC SECTION.', '    METHODS go.', 'ENDCLASS.',
    'CLASS zcl_u DEFINITION.', '  PUBLIC SECTION.', '    METHODS go.', 'ENDCLASS.',
    'CLASS lcl_other DEFINITION.', '  PUBLIC SECTION.', '    DATA mo TYPE REF TO zcl_u.', 'ENDCLASS.',
    'CLASS lcl_parent DEFINITION.', '  PROTECTED SECTION.', '    DATA mo TYPE REF TO zcl_t.', 'ENDCLASS.',
    'CLASS lcl_child DEFINITION INHERITING FROM lcl_parent.', '  PUBLIC SECTION.', '    METHODS run.', 'ENDCLASS.',
    'CLASS zcl_t IMPLEMENTATION.', '  METHOD go.', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS zcl_u IMPLEMENTATION.', '  METHOD go.', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS lcl_child IMPLEMENTATION.', '  METHOD run.', '    mo->go( ).', '  ENDMETHOD.', 'ENDCLASS.',
  ].join('\n');
  expect(edgesAt(graph(src), 31)).toEqual(['static METHOD ZCL_T=>GO']);
  // A private attribute of the superclass is not the subclass's: the receiver falls back as before.
  const priv = src.replace('  PROTECTED SECTION.\n    DATA mo TYPE REF TO zcl_t.', '  PRIVATE SECTION.\n    DATA mo TYPE REF TO zcl_t.');
  expect(priv).not.toBe(src);
  expect(edgesAt(graph(priv), 31)).toEqual(['static METHOD ZCL_U=>GO']);
});

test('cyclic inheritance does not hang the call graph', () => {
  const src = [
    'CLASS lcl_x DEFINITION INHERITING FROM lcl_y.', '  PUBLIC SECTION.', '    METHODS run.', 'ENDCLASS.',
    'CLASS lcl_y DEFINITION INHERITING FROM lcl_x.', '  PUBLIC SECTION.', 'ENDCLASS.',
    'CLASS lcl_main DEFINITION.', '  PUBLIC SECTION.', '    METHODS go.', 'ENDCLASS.',
    'CLASS lcl_main IMPLEMENTATION.', '  METHOD go.', '    DATA lo TYPE REF TO lcl_y.', '    lo->stop( ).', '    lo->run( ).', '  ENDMETHOD.', 'ENDCLASS.',
    'CLASS lcl_x IMPLEMENTATION.', '  METHOD run.', '  ENDMETHOD.', 'ENDCLASS.',
  ].join('\n');
  const g = graph(src);
  expect(edgesAt(g, 15)).toHaveLength(1);
  expect(edgesAt(g, 16).length).toBeGreaterThan(0);
});

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

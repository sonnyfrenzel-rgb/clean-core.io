import { test, expect } from '@playwright/test';
import type { Project } from '../lib/types';
import { workflowSteps } from '../lib/workflow-steps';
import { abapCheck } from '../lib/transformation/abap-check';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { localObjectTypes } from '../lib/transformation/rap-contract';
import { candidateFiles, prepareEngineLed } from '../lib/transformation/engine-led';
import { readEngineFacts } from '../lib/transformation';

/**
 * Hotfix 3.0.22 (docs/design/analyze-business-first-plan.md §4.0, HF-a to HF-e), from a full run of owner example A
 * on 06.11.2026. The owner's program stays outside the repository; the fixtures here are written for this spec and
 * only share its shape (a local interface, a service class holding a reference to it, a local exception class).
 * Server-free: library code only.
 */

/** A small object-oriented report: a store interface, an in-memory store, a service that holds `REF TO` the interface. */
export const OO_SHAPE = [
  'REPORT zccio_oo_shape.',
  'TYPES: BEGIN OF ty_item,',
  '         id    TYPE i,',
  '         state TYPE string,',
  '       END OF ty_item.',
  'TYPES tt_items TYPE STANDARD TABLE OF ty_item WITH EMPTY KEY.',
  'CLASS lcx_refused DEFINITION INHERITING FROM cx_static_check FINAL.',
  '  PUBLIC SECTION.',
  '    DATA code TYPE string.',
  'ENDCLASS.',
  'CLASS lcx_refused IMPLEMENTATION.',
  'ENDCLASS.',
  'INTERFACE lif_items.',
  '  METHODS read IMPORTING iv_id TYPE i RETURNING VALUE(rs_item) TYPE ty_item.',
  '  METHODS save IMPORTING is_item TYPE ty_item.',
  'ENDINTERFACE.',
  'CLASS lcl_items DEFINITION FINAL.',
  '  PUBLIC SECTION.',
  '    INTERFACES lif_items.',
  '  PRIVATE SECTION.',
  '    DATA mt_items TYPE tt_items.',
  'ENDCLASS.',
  'CLASS lcl_items IMPLEMENTATION.',
  '  METHOD lif_items~read.',
  '    READ TABLE mt_items INTO rs_item WITH KEY id = iv_id.',
  '  ENDMETHOD.',
  '  METHOD lif_items~save.',
  '    APPEND is_item TO mt_items.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'CLASS lcl_service DEFINITION FINAL.',
  '  PUBLIC SECTION.',
  '    METHODS constructor IMPORTING io_items TYPE REF TO lif_items.',
  '    METHODS submit IMPORTING iv_id TYPE i.',
  '  PRIVATE SECTION.',
  '    DATA mo_items TYPE REF TO lif_items.',
  'ENDCLASS.',
  'CLASS lcl_service IMPLEMENTATION.',
  '  METHOD constructor.',
  '    mo_items = io_items.',
  '  ENDMETHOD.',
  '  METHOD submit.',
  '    DATA ls_item TYPE ty_item.',
  '    ls_item = mo_items->read( iv_id ).',
  "    IF ls_item-state <> 'DRAFT'.",
  '      RETURN.',
  '    ENDIF.',
  "    ls_item-state = 'SUBMITTED'.",
  '    mo_items->save( ls_item ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'CLASS lcl_batch DEFINITION FINAL.',
  '  PUBLIC SECTION.',
  '    CLASS-METHODS run IMPORTING io_service TYPE REF TO lcl_service.',
  'ENDCLASS.',
  'CLASS lcl_batch IMPLEMENTATION.',
  '  METHOD run.',
  '    io_service->submit( 1 ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'START-OF-SELECTION.',
  '  DATA lo_items TYPE REF TO lif_items.',
  '  lo_items = NEW lcl_items( ).',
  '  lcl_batch=>run( NEW lcl_service( lo_items ) ).',
].join('\n');

const ooPrep = () => {
  const prep = prepareEngineLed({ source: OO_SHAPE, track: 'rap', program: null, decisions: [], contextText: '' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
};

test.describe('HF-a: the frame of an object-oriented program names only types the package has', () => {
  test('the original’s own classes and interfaces are read, a local exception class maps to its global ancestor', () => {
    const types = localObjectTypes(readEngineFacts(OO_SHAPE).statements);
    expect(Object.fromEntries(types)).toEqual({ lif_items: null, lcx_refused: 'cx_static_check', lcl_items: null, lcl_service: null, lcl_batch: null });
  });

  test('no declaration of the logic class names a local type of the original; the stubs activate', () => {
    const prep = ooPrep();
    const logic = prep.scaffold.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!;
    const frame = logic.content.split('\n').filter((l) => !/^\s*"/.test(l));
    expect(frame.filter((l) => /\bREF\s+TO\s+(?:lif_|lcl_|lcx_)/i.test(l))).toEqual([]);
    expect(logic.content).toMatch(/io_items TYPE REF TO zcl_\w+_logic/);
    const r = abapCheck(prep.scaffold.files);
    if (!r.ran) throw new Error(r.reason);
    expect(r.findings.filter((f) => f.kind === 'parser' || f.kind === 'syntax')).toEqual([]);
    expect(r.activation.activatable).toBe(true);
  });

  test('the tool bar never says "done" while the stored activation check fails', () => {
    const prep = ooPrep();
    const bodies = new Map<string, string>(prep.fillUnits.map((u) => [u.unitId, 'RETURN.']));
    const project = (broken: boolean) => {
      if (broken) bodies.set(prep.fillUnits[0].unitId, 'me->no_such_method( ).');
      else bodies.set(prep.fillUnits[0].unitId, 'RETURN.');
      const files = candidateFiles(prep, bodies);
      return {
        id: 'p-oo',
        userId: 'u',
        legacyCode: OO_SHAPE,
        activeRunId: 'run-1',
        analysis: JSON.stringify({ cleanCoreScore: 90 }),
        solutionDesign: '# RAP',
        approvedByArchitect: true,
        generatedCode: JSON.stringify(files),
        generationBinding: { path: 'engine-led', engine: { status: 'complete', units: prep.fillUnits.length, notWritten: [] }, abaplint: abaplintPackageCheck(files) },
      } as unknown as Project;
    };
    const step = (p: Project) => workflowSteps(p).find((s) => s.key === 'transformation')!;
    const broken = step(project(true));
    expect(broken.state).toBe('partial');
    expect(broken.badge).toBe('Generated · not activatable');
    expect(broken.detail).toMatch(/not activatable/);
    expect(step(project(false)).state).toBe('done');
  });
});

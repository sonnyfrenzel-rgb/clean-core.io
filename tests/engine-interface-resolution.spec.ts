/**
 * AB-15b (engine 3.2.0, `ENGINE_READS_320_FROM`): an interface call is resolved to the implementations the program
 * itself defines (`lib/abap/class-hierarchy.ts`), and a call with several of them is drawn as its alternatives — a
 * gateway named as the call, one call activity per implementation — never as a guess at one. A run of an older engine
 * keeps its map. Every source here is written for this spec; none is a benchmark case.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { buildProcessSkeleton, type ProcessSkeleton, type SkeletonNode } from '../lib/abap/process-skeleton';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { candidatesForCall, readClassHierarchy } from '../lib/abap/class-hierarchy';
import { readReferenceTypes, type MethodTarget } from '../lib/abap/method-resolution';
import { ENGINE_READS_320_FROM } from '../lib/abap/engine-reads-320-gate';

const NEW = { engineVersion: ENGINE_READS_320_FROM };
const OLD = { engineVersion: '3.1.0' };

const nodesAt = (skeleton: ProcessSkeleton, line: number) => skeleton.nodes.filter((n) => n.anchor?.lineStart === line);
const alternativesAt = (skeleton: ProcessSkeleton, line: number) =>
  nodesAt(skeleton, line).find((n) => n.kind === 'gateway' && typeof n.detail?.alternatives === 'number');
const armsOf = (skeleton: ProcessSkeleton, gateway: SkeletonNode) =>
  skeleton.edges
    .filter((e) => e.from === gateway.id)
    .map((e) => ({ condition: e.condition, node: skeleton.nodes.find((n) => n.id === e.to)! }));

/** A factory hands out one of two strategies behind an interface; the caller never names a class. */
const FACTORY = [
  'REPORT zfactory.', //                                                        1
  'INTERFACE lif_route.', //                                                    2
  '  METHODS ship IMPORTING iv_vbeln TYPE vbeln.', //                           3
  'ENDINTERFACE.', //                                                           4
  'CLASS lcl_road DEFINITION.', //                                              5
  '  PUBLIC SECTION. INTERFACES lif_route.', //                                 6
  'ENDCLASS.', //                                                               7
  'CLASS lcl_road IMPLEMENTATION.', //                                          8
  '  METHOD lif_route~ship.', //                                                9
  '    UPDATE zship SET mode = 1 WHERE vbeln = iv_vbeln.', //                   10
  '  ENDMETHOD.', //                                                            11
  'ENDCLASS.', //                                                               12
  'CLASS lcl_rail DEFINITION.', //                                              13
  '  PUBLIC SECTION. INTERFACES lif_route.', //                                 14
  'ENDCLASS.', //                                                               15
  'CLASS lcl_rail IMPLEMENTATION.', //                                          16
  '  METHOD lif_route~ship.', //                                                17
  '    INSERT zrail FROM @( VALUE #( vbeln = iv_vbeln ) ).', //                 18
  '  ENDMETHOD.', //                                                            19
  'ENDCLASS.', //                                                               20
  'CLASS lcl_factory DEFINITION.', //                                           21
  '  PUBLIC SECTION.', //                                                       22
  '    CLASS-METHODS create IMPORTING iv_kind TYPE c RETURNING VALUE(ro) TYPE REF TO lif_route.', // 23
  'ENDCLASS.', //                                                               24
  'CLASS lcl_factory IMPLEMENTATION.', //                                       25
  '  METHOD create.', //                                                        26
  "    IF iv_kind = 'R'.", //                                                   27
  '      ro = NEW lcl_rail( ).', //                                             28
  '    ELSE.', //                                                               29
  '      ro = NEW lcl_road( ).', //                                             30
  '    ENDIF.', //                                                              31
  '  ENDMETHOD.', //                                                            32
  'ENDCLASS.', //                                                               33
  'START-OF-SELECTION.', //                                                     34
  '  DATA(lo_route) = lcl_factory=>create( p_kind ).', //                       35
  '  lo_route->ship( p_vbeln ).', //                                            36
  '  WRITE / p_vbeln.', //                                                      37
].join('\n');

test.describe('1. a call with several implementations is drawn as its alternatives', () => {
  test('3.2.0: the factory\'s return type types the reference; the call is a gateway with one call activity per class', () => {
    const skeleton = buildProcessSkeleton(FACTORY, NEW);
    const gateway = alternativesAt(skeleton, 36)!;
    expect(gateway.label).toBe('LO_ROUTE->SHIP');
    expect(gateway.detail).toMatchObject({ method: true, ambiguous: true, alternatives: 2, candidates: ['LCL_ROAD=>LIF_ROUTE~SHIP', 'LCL_RAIL=>LIF_ROUTE~SHIP'] });
    // No opaque call: the reader sees which implementations can run, never one picked for them.
    expect(nodesAt(skeleton, 36).some((n) => n.kind === 'call-opaque')).toBe(false);
    const arms = armsOf(skeleton, gateway);
    expect(arms.map((a) => a.condition)).toEqual(['LCL_ROAD', 'LCL_RAIL']);
    for (const arm of arms) {
      expect(arm.node.kind).toBe('call-activity');
      expect(arm.node.detail).toMatchObject({ method: true, alternativeOf: 'LO_ROUTE->SHIP' });
      // The arm points at the implementation's own lines as its second anchor.
      expect(arm.node.anchor?.secondary?.reason).toBe('routine-definition');
    }
    expect(arms[0].node.anchor?.secondary).toMatchObject({ lineStart: 9, lineEnd: 11 });
    expect(arms[1].node.anchor?.secondary).toMatchObject({ lineStart: 17, lineEnd: 19 });
    // The arms meet again: the list output after the call follows both.
    const write = nodesAt(skeleton, 37).find((n) => n.kind === 'output')!;
    const into = skeleton.edges.filter((e) => e.to === write.id).map((e) => e.from).sort();
    expect(into).toEqual(arms.map((a) => a.node.id).sort());
    // Each implementation stays drawn as a beginning of its own, with its steps.
    expect(nodesAt(skeleton, 10).map((n) => n.kind)).toContain('write');
    expect(nodesAt(skeleton, 18).map((n) => n.kind)).toContain('write');
  });

  test('3.1.0 keeps its map: no gateway, no call activity, and the implementations are not drawn', () => {
    const skeleton = buildProcessSkeleton(FACTORY, OLD);
    expect(alternativesAt(skeleton, 36)).toBeUndefined();
    expect(skeleton.nodes.some((n) => n.kind === 'call-activity')).toBe(false);
    expect(nodesAt(skeleton, 10)).toEqual([]);
    expect(nodesAt(skeleton, 18)).toEqual([]);
  });

  test('one implementation behind the factory type is the target, though another class has a method of that name', () => {
    // LCL_RAIL no longer implements the interface; it only has a method `ship` of its own.
    const source = FACTORY
      .replace('CLASS lcl_rail DEFINITION.\n  PUBLIC SECTION. INTERFACES lif_route.', 'CLASS lcl_rail DEFINITION.\n  PUBLIC SECTION. METHODS ship IMPORTING iv_vbeln TYPE vbeln.')
      .replace('CLASS lcl_rail IMPLEMENTATION.\n  METHOD lif_route~ship.', 'CLASS lcl_rail IMPLEMENTATION.\n  METHOD ship.')
      .replace('      ro = NEW lcl_rail( ).', '      ro = NEW lcl_road( ).');
    const resolved = buildProcessSkeleton(source, NEW);
    const step = nodesAt(resolved, 36);
    expect(step.some((n) => n.kind === 'call-opaque' || n.kind === 'gateway')).toBe(false);
    expect(step.find((n) => n.detail?.method === true)?.detail).toMatchObject({ class: 'LCL_ROAD' });
    // 3.1.0: the name alone fits two methods, and the call stays opaque.
    const old = buildProcessSkeleton(source, OLD);
    expect(nodesAt(old, 36).find((n) => n.kind === 'call-opaque')?.detail).toMatchObject({ ambiguous: true });
  });
});

/** Steps in a table of references, a variable declared twice in two routines, and an abstract base. */
const PIPELINE = [
  'REPORT zpipeline.', //                                                       1
  'INTERFACE lif_step.', //                                                     2
  '  METHODS run.', //                                                          3
  'ENDINTERFACE.', //                                                           4
  'CLASS lcl_check DEFINITION.', //                                             5
  '  PUBLIC SECTION. INTERFACES lif_step.', //                                  6
  'ENDCLASS.', //                                                               7
  'CLASS lcl_check IMPLEMENTATION.', //                                         8
  '  METHOD lif_step~run.', //                                                  9
  "    MESSAGE e001(zp).", //                                                   10
  '  ENDMETHOD.', //                                                            11
  'ENDCLASS.', //                                                               12
  'CLASS lcl_post DEFINITION.', //                                              13
  '  PUBLIC SECTION. INTERFACES lif_step.', //                                  14
  'ENDCLASS.', //                                                               15
  'CLASS lcl_post IMPLEMENTATION.', //                                          16
  '  METHOD lif_step~run.', //                                                  17
  '    UPDATE zpost SET done = abap_true.', //                                  18
  '  ENDMETHOD.', //                                                            19
  'ENDCLASS.', //                                                               20
  'CLASS lcl_doc DEFINITION ABSTRACT.', //                                      21
  '  PUBLIC SECTION. METHODS print.', //                                        22
  'ENDCLASS.', //                                                               23
  'CLASS lcl_doc IMPLEMENTATION.', //                                           24
  '  METHOD print.', //                                                         25
  '    WRITE / sy-datum.', //                                                   26
  '  ENDMETHOD.', //                                                            27
  'ENDCLASS.', //                                                               28
  'CLASS lcl_invoice DEFINITION INHERITING FROM lcl_doc.', //                   29
  '  PUBLIC SECTION. METHODS print REDEFINITION.', //                           30
  'ENDCLASS.', //                                                               31
  'CLASS lcl_invoice IMPLEMENTATION.', //                                       32
  '  METHOD print.', //                                                         33
  "    SUBMIT zinvoice_print AND RETURN.", //                                   34
  '  ENDMETHOD.', //                                                            35
  'ENDCLASS.', //                                                               36
  'CLASS lcl_note DEFINITION INHERITING FROM lcl_doc.', //                      37
  '  PUBLIC SECTION. METHODS print REDEFINITION.', //                           38
  'ENDCLASS.', //                                                               39
  'CLASS lcl_note IMPLEMENTATION.', //                                          40
  '  METHOD print.', //                                                         41
  "    SUBMIT znote_print AND RETURN.", //                                      42
  '  ENDMETHOD.', //                                                            43
  'ENDCLASS.', //                                                               44
  'CLASS lcl_app DEFINITION.', //                                               45
  '  PUBLIC SECTION.', //                                                       46
  '    DATA mt_steps TYPE STANDARD TABLE OF REF TO lif_step WITH EMPTY KEY.', // 47
  '    METHODS: process, finish.', //                                          48
  'ENDCLASS.', //                                                               49
  'CLASS lcl_app IMPLEMENTATION.', //                                           50
  '  METHOD process.', //                                                       51
  '    mt_steps = VALUE #( ( NEW lcl_check( ) ) ( NEW lcl_post( ) ) ).', //     52
  '    LOOP AT mt_steps INTO DATA(lo_x).', //                                   53
  '      lo_x->run( ).', //                                                     54
  '    ENDLOOP.', //                                                            55
  '  ENDMETHOD.', //                                                            56
  '  METHOD finish.', //                                                        57
  '    DATA lo_x TYPE REF TO lcl_doc.', //                                      58
  '    lo_x = NEW lcl_invoice( ).', //                                          59
  '    lo_x->print( ).', //                                                     60
  '  ENDMETHOD.', //                                                            61
  'ENDCLASS.', //                                                               62
  'START-OF-SELECTION.', //                                                     63
  '  DATA(go_app) = NEW lcl_app( ).', //                                        64
  '  go_app->process( ).', //                                                   65
  '  go_app->finish( ).', //                                                    66
].join('\n');

test.describe('2. the static type is read where the program writes it', () => {
  test('3.2.0: a loop over a table of interface references draws the implementations as alternatives', () => {
    const skeleton = buildProcessSkeleton(PIPELINE, NEW);
    const gateway = alternativesAt(skeleton, 54)!;
    expect(gateway.detail).toMatchObject({ alternatives: 2, candidates: ['LCL_CHECK=>LIF_STEP~RUN', 'LCL_POST=>LIF_STEP~RUN'] });
  });

  test('3.2.0: the routine\'s own declaration types `lo_x` there, though another routine declares it otherwise', () => {
    const skeleton = buildProcessSkeleton(PIPELINE, NEW);
    // `lo_x TYPE REF TO lcl_doc`: an abstract class is never the object, so its own `print` is no candidate —
    // only the two redefinitions are.
    const gateway = alternativesAt(skeleton, 60)!;
    expect(gateway.detail).toMatchObject({ alternatives: 2, candidates: ['LCL_INVOICE=>PRINT', 'LCL_NOTE=>PRINT'] });
    expect(armsOf(skeleton, gateway).map((a) => a.condition)).toEqual(['LCL_INVOICE', 'LCL_NOTE']);
  });

  test('3.1.0 keeps its map: neither call is drawn as alternatives', () => {
    const skeleton = buildProcessSkeleton(PIPELINE, OLD);
    expect(alternativesAt(skeleton, 54)).toBeUndefined();
    expect(alternativesAt(skeleton, 60)).toBeUndefined();
    expect(skeleton.nodes.some((n) => n.kind === 'call-activity' && n.detail?.alternativeOf)).toBe(false);
  });
});

test.describe('3. never a guess, never a flood', () => {
  test('a reference the program does not type keeps the opaque call, even with two methods of that name', () => {
    // `lo_any` comes from a function module: its class is nowhere in the words.
    const source = FACTORY.replace('  DATA(lo_route) = lcl_factory=>create( p_kind ).', "  CALL FUNCTION 'Z_GET_ROUTE' IMPORTING eo_route = lo_route.");
    const skeleton = buildProcessSkeleton(source, NEW);
    expect(alternativesAt(skeleton, 36)).toBeUndefined();
    const call = nodesAt(skeleton, 36).find((n) => n.kind === 'call-opaque')!;
    expect(call.detail?.ambiguous).toBe(true);
  });

  test('a call that can reach more than four implementations stays the opaque call naming all of them', () => {
    const lines = FACTORY.split('\n');
    const extra: string[] = [];
    for (const name of ['lcl_air', 'lcl_sea', 'lcl_pipe']) {
      extra.push(
        `CLASS ${name} DEFINITION.`,
        '  PUBLIC SECTION. INTERFACES lif_route.',
        'ENDCLASS.',
        `CLASS ${name} IMPLEMENTATION.`,
        '  METHOD lif_route~ship.',
        `    UPDATE z${name.slice(4)} SET mode = 1 WHERE vbeln = iv_vbeln.`,
        '  ENDMETHOD.',
        'ENDCLASS.',
      );
    }
    const source = [...lines.slice(0, 20), ...extra, ...lines.slice(20)].join('\n');
    const skeleton = buildProcessSkeleton(source, NEW);
    const at = 36 + extra.length;
    expect(alternativesAt(skeleton, at)).toBeUndefined();
    const call = nodesAt(skeleton, at).find((n) => n.kind === 'call-opaque')!;
    expect(call.detail).toMatchObject({ ambiguous: true });
    expect((call.detail?.candidates as string[]).length).toBe(5);
  });
});

test.describe('4. the hierarchy, read on its own', () => {
  const read = (source: string) => {
    const { statements, structure } = buildProcessFacts(source);
    const impls: MethodTarget[] = [];
    for (const block of structure.blocks) {
      if (block.kind !== 'method') continue;
      const cls = (structure.enclosing[block.openIndex] ?? []).filter((b) => b.kind === 'class').pop();
      const owner = cls ? /^CLASS\s+([\w/]+)/i.exec(statements[cls.openIndex].text)![1].toUpperCase() : '';
      const name = /^METHOD\s+([\w/~]+)/i.exec(statements[block.openIndex].text)![1].toUpperCase();
      impls.push({ key: `${owner}=>${name}`, cls: owner, name, short: name.slice(name.lastIndexOf('~') + 1) });
    }
    const hierarchy = readClassHierarchy(statements);
    const model = { impls, superOf: hierarchy.superOf, refTypes: readReferenceTypes(statements) };
    const at = (line: number) => statements.find((s) => s.lineStart === line)!.index;
    return { statements, structure, hierarchy, model, at };
  };

  test('an interface that includes another: the class that lists the outer one implements the inner one', () => {
    const source = [
      'INTERFACE lif_inner.', //                                1
      '  METHODS go.', //                                       2
      'ENDINTERFACE.', //                                       3
      'INTERFACE lif_outer.', //                                4
      '  INTERFACES lif_inner.', //                             5
      'ENDINTERFACE.', //                                       6
      'CLASS lcl_both DEFINITION.', //                          7
      '  PUBLIC SECTION. INTERFACES lif_outer.', //             8
      'ENDCLASS.', //                                           9
      'CLASS lcl_both IMPLEMENTATION.', //                      10
      '  METHOD lif_inner~go.', //                              11
      '  ENDMETHOD.', //                                        12
      'ENDCLASS.', //                                           13
      'FORM run.', //                                           14
      '  DATA lo TYPE REF TO lif_inner.', //                    15
      '  lo->go( ).', //                                        16
      'ENDFORM.', //                                            17
    ].join('\n');
    const { statements, structure, hierarchy, model, at } = read(source);
    const set = candidatesForCall(hierarchy, model, { statementIndex: at(16), qualifier: 'lo', op: '->', name: 'GO', ownClass: null }, statements, structure);
    expect(set).toMatchObject({ candidates: ['LCL_BOTH=>LIF_INNER~GO'], type: 'LIF_INNER' });
  });

  test('a subclass that does not redefine runs the inherited implementation, counted once', () => {
    const source = [
      'INTERFACE lif_x.', //                                    1
      '  METHODS go.', //                                       2
      'ENDINTERFACE.', //                                       3
      'CLASS lcl_a DEFINITION.', //                             4
      '  PUBLIC SECTION. INTERFACES lif_x.', //                 5
      'ENDCLASS.', //                                           6
      'CLASS lcl_a IMPLEMENTATION.', //                         7
      '  METHOD lif_x~go.', //                                  8
      '  ENDMETHOD.', //                                        9
      'ENDCLASS.', //                                           10
      'CLASS lcl_b DEFINITION INHERITING FROM lcl_a.', //       11
      'ENDCLASS.', //                                           12
      'FORM run.', //                                           13
      '  DATA lo TYPE REF TO lif_x.', //                        14
      '  lo->go( ).', //                                        15
      'ENDFORM.', //                                            16
    ].join('\n');
    const { statements, structure, hierarchy, model, at } = read(source);
    const set = candidatesForCall(hierarchy, model, { statementIndex: at(15), qualifier: 'lo', op: '->', name: 'GO', ownClass: null }, statements, structure);
    expect(set.candidates).toEqual(['LCL_A=>LIF_X~GO']);
  });

  test('a type this source does not define, a static call and `super->` have no candidates', () => {
    const source = [
      'CLASS lcl_a DEFINITION.', //                             1
      '  PUBLIC SECTION. METHODS go.', //                       2
      'ENDCLASS.', //                                           3
      'CLASS lcl_a IMPLEMENTATION.', //                         4
      '  METHOD go.', //                                        5
      '  ENDMETHOD.', //                                        6
      'ENDCLASS.', //                                           7
      'FORM run.', //                                           8
      '  DATA lo TYPE REF TO if_foreign.', //                   9
      '  lo->go( ).', //                                        10
      '  lcl_a=>go( ).', //                                     11
      'ENDFORM.', //                                            12
    ].join('\n');
    const { statements, structure, hierarchy, model, at } = read(source);
    const open = (statementIndex: number, qualifier: string, op: '->' | '=>') =>
      candidatesForCall(hierarchy, model, { statementIndex, qualifier, op, name: 'GO', ownClass: null }, statements, structure).candidates;
    expect(open(at(10), 'lo', '->')).toEqual([]);
    expect(open(at(11), 'lcl_a', '=>')).toEqual([]);
    expect(open(at(10), 'super', '->')).toEqual([]);
  });
});

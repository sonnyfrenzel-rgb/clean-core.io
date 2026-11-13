/**
 * The readings of engine 3.2.0 (`ENGINE_READS_320_FROM`), each behind the version gate: a run of an older engine
 * (3.1.0, and every 3.0.x hotfix) draws exactly the map it drew before. Every source here is written for this spec;
 * none is a benchmark case.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { buildProcessSkeleton, skeletonReadFor, type ProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { ENGINE_READS_320_FROM, engineReads320Apply } from '../lib/abap/engine-reads-320-gate';
import { resolveMethodTarget, type ClassModel, type MethodTarget } from '../lib/abap/method-resolution';

const NEW = { engineVersion: ENGINE_READS_320_FROM };
/** The release before: the rebuild's first release keeps its map. */
const OLD = { engineVersion: '3.1.0' };

const entriesOf = (skeleton: ProcessSkeleton) => skeleton.regions.filter((r) => r.kind === 'entry').map((r) => r.anchor?.lineStart);
const nodesAt = (skeleton: ProcessSkeleton, line: number) => skeleton.nodes.filter((n) => n.anchor?.lineStart === line);
const startAt = (skeleton: ProcessSkeleton, line: number) => nodesAt(skeleton, line).find((n) => n.kind === 'start');

test.describe('the gate', () => {
  test('3.2.0 and later carry the readings; 3.1.0, a 3.0.x hotfix, or no version, does not', () => {
    expect(ENGINE_READS_320_FROM).toBe('3.2.0');
    expect(engineReads320Apply('v3.2.0')).toBe(true);
    expect(engineReads320Apply('3.5.0')).toBe(true);
    expect(engineReads320Apply('v3.1.0')).toBe(false);
    expect(engineReads320Apply('3.0.23')).toBe(false);
    expect(engineReads320Apply(null)).toBe(false);
    expect(engineReads320Apply(undefined)).toBe(false);
  });
});

/** A strategy chosen at run time: three classes implement one interface, the report calls through the interface. */
const STRATEGY = [
  'REPORT zstrategy.', //                                                       1
  'INTERFACE lif_fee.', //                                                      2
  '  METHODS charge IMPORTING iv_amount TYPE p RETURNING VALUE(rv_fee) TYPE p.', // 3
  'ENDINTERFACE.', //                                                           4
  'CLASS lcl_flat DEFINITION.', //                                              5
  '  PUBLIC SECTION. INTERFACES lif_fee.', //                                   6
  'ENDCLASS.', //                                                               7
  'CLASS lcl_flat IMPLEMENTATION.', //                                          8
  '  METHOD lif_fee~charge.', //                                                9
  '    SELECT SINGLE fee FROM zfee_flat INTO rv_fee WHERE land = sy-langu.', // 10
  '    IF sy-subrc <> 0.', //                                                   11
  "      MESSAGE e001(zfee).", //                                               12
  '    ENDIF.', //                                                              13
  '  ENDMETHOD.', //                                                            14
  'ENDCLASS.', //                                                               15
  'CLASS lcl_percent DEFINITION.', //                                           16
  '  PUBLIC SECTION. INTERFACES lif_fee.', //                                   17
  'ENDCLASS.', //                                                               18
  'CLASS lcl_percent IMPLEMENTATION.', //                                       19
  '  METHOD lif_fee~charge.', //                                                20
  '    SELECT SINGLE pct FROM zfee_pct INTO @DATA(lv_pct) WHERE kunnr = @gv_kunnr.', // 21
  '    rv_fee = iv_amount * lv_pct / 100.', //                                  22
  '    UPDATE zfee_log SET last = sy-datum WHERE kunnr = gv_kunnr.', //         23
  '  ENDMETHOD.', //                                                            24
  'ENDCLASS.', //                                                               25
  'CLASS lcl_free DEFINITION.', //                                              26
  '  PUBLIC SECTION. INTERFACES lif_fee.', //                                   27
  'ENDCLASS.', //                                                               28
  'CLASS lcl_free IMPLEMENTATION.', //                                          29
  '  METHOD lif_fee~charge.', //                                                30
  '    rv_fee = 0.', //                                                         31
  '  ENDMETHOD.', //                                                            32
  'ENDCLASS.', //                                                               33
  'DATA go_fee TYPE REF TO lif_fee.', //                                        34
  'START-OF-SELECTION.', //                                                     35
  '  CASE p_kind.', //                                                          36
  "    WHEN 'F'. go_fee = NEW lcl_flat( ).", //                                 37
  "    WHEN 'P'. go_fee = NEW lcl_percent( ).", //                              38
  '    WHEN OTHERS. go_fee = NEW lcl_free( ).', //                              39
  '  ENDCASE.', //                                                              40
  '  gv_fee = go_fee->charge( p_amount ).', //                                  41
  '  go_fee->charge( p_amount ).', //                                           42
  '  WRITE / gv_fee.', //                                                       43
].join('\n');

test.describe('1. the candidate implementations of a call the source cannot resolve are drawn', () => {
  test('3.2.0: each implementation behind an interface reference is a beginning of its own, with the call as its trigger', () => {
    const skeleton = buildProcessSkeleton(STRATEGY, NEW);
    // The call stays what D2 made it — opaque, ambiguous — and now says which implementations it can reach.
    const call = nodesAt(skeleton, 42).find((n) => n.kind === 'call-opaque')!;
    expect(call.detail).toMatchObject({ ambiguous: true, candidates: ['LCL_FLAT=>LIF_FEE~CHARGE', 'LCL_PERCENT=>LIF_FEE~CHARGE', 'LCL_FREE=>LIF_FEE~CHARGE'] });
    // Three beginnings beside the report's own, in source order; nothing else is one.
    expect(entriesOf(skeleton)).toEqual([35, 9, 20, 30]);
    for (const line of [9, 20, 30]) {
      const start = startAt(skeleton, line)!;
      // The trigger names the first call that can reach it: the operand call on line 41.
      expect(start.detail).toMatchObject({ origin: 'method', trigger: 'candidate of GO_FEE->CHARGE@41 (1 of 3)' });
    }
    // The steps inside them are drawn: the read, the error end, the read, the write.
    expect(nodesAt(skeleton, 10).map((n) => n.kind)).toContain('read');
    expect(nodesAt(skeleton, 12).map((n) => n.kind)).toContain('end-error');
    expect(nodesAt(skeleton, 21).map((n) => n.kind)).toContain('read');
    expect(nodesAt(skeleton, 23).map((n) => n.kind)).toContain('write');
    // The note says why the beginning may be drawn and what is not decided.
    const note = skeleton.notes.find((n) => n.lineStart === 9 && n.reason === 'entry-trigger-not-determined')!;
    expect(note.detail).toContain('the call GO_FEE->CHARGE@41 can reach it as one of 3 implementations');
    expect(note.detail).toContain('decided at run time');
    // The candidates are neither "not reached" nor helpers.
    expect(skeleton.notDrawn.unreached).toEqual([]);
  });

  test('3.1.0 keeps its map: the call is opaque, the implementations are not drawn and carry no candidates', () => {
    const skeleton = buildProcessSkeleton(STRATEGY, OLD);
    const call = nodesAt(skeleton, 42).find((n) => n.kind === 'call-opaque')!;
    expect(call.detail?.ambiguous).toBe(true);
    expect(call.detail?.candidates).toBeUndefined();
    expect(entriesOf(skeleton)).toEqual([35]);
    for (const line of [10, 12, 21, 23]) expect(nodesAt(skeleton, line)).toEqual([]);
  });

  test('a candidate that another call reaches for certain is drawn there, not as a beginning', () => {
    const source = STRATEGY
      .replace('DATA go_fee TYPE REF TO lif_fee.', 'DATA: go_fee TYPE REF TO lif_fee, go_free TYPE REF TO lcl_free.')
      .replace('  WRITE / gv_fee.', '  go_free->lif_fee~charge( 0 ).\n  WRITE / gv_fee.');
    const skeleton = buildProcessSkeleton(source, NEW);
    // `lcl_free` is called on a reference of its own class on line 43 — a step of the report (here a routine without
    // an effect of its own, folded into its caller), so not a second beginning and not an opaque call.
    expect(entriesOf(skeleton)).toEqual([35, 9, 20]);
    expect(nodesAt(skeleton, 43).every((n) => n.kind !== 'call-opaque')).toBe(true);
  });

  test('the beginnings the source names keep their place: a bare FORM stays the entry beside the candidates', () => {
    const source = [
      'FORM frm_price USING is_komp TYPE komp CHANGING cv_price TYPE p.', // 1
      '  DATA lo TYPE REF TO lif_calc.', //                                  2
      '  lo = lcl_factory=>get( is_komp-matnr ).', //                       3
      '  cv_price = lo->calc( is_komp ).', //                               4
      '  lo->calc( is_komp ).', //                                          5
      'ENDFORM.', //                                                        6
      'INTERFACE lif_calc.', //                                             7
      '  METHODS calc IMPORTING is_komp TYPE komp RETURNING VALUE(rv) TYPE p.', // 8
      'ENDINTERFACE.', //                                                   9
      'CLASS lcl_a DEFINITION. PUBLIC SECTION. INTERFACES lif_calc. ENDCLASS.', // 10
      'CLASS lcl_a IMPLEMENTATION.', //                                     11
      '  METHOD lif_calc~calc.', //                                         12
      '    SELECT SINGLE kbetr FROM konp INTO rv WHERE knumh = is_komp-knumh.', // 13
      '  ENDMETHOD.', //                                                    14
      'ENDCLASS.', //                                                       15
      'CLASS lcl_b DEFINITION. PUBLIC SECTION. INTERFACES lif_calc. ENDCLASS.', // 16
      'CLASS lcl_b IMPLEMENTATION.', //                                     17
      '  METHOD lif_calc~calc.', //                                         18
      '    SELECT SINGLE preis FROM zpreis INTO rv WHERE matnr = is_komp-matnr.', // 19
      '  ENDMETHOD.', //                                                    20
      'ENDCLASS.', //                                                       21
    ].join('\n');
    const skeleton = buildProcessSkeleton(source, NEW);
    // The pricing formula no PERFORM reaches is the beginning, as before; the two strategies come beside it.
    expect(entriesOf(skeleton)).toEqual([1, 12, 18]);
    expect(skeleton.notDrawn.unreached).toEqual([]);
    expect(entriesOf(buildProcessSkeleton(source, OLD))).toEqual([1]);
  });
});

/** A template method: the base class calls `me->` on a step a subclass redefines; the report uses the subclass. */
const TEMPLATE = [
  'REPORT ztemplate.', //                                                       1
  'CLASS lcl_base DEFINITION.', //                                              2
  '  PUBLIC SECTION.', //                                                       3
  '    METHODS run.', //                                                        4
  '  PROTECTED SECTION.', //                                                    5
  '    METHODS discount IMPORTING iv_net TYPE p RETURNING VALUE(rv) TYPE p.', // 6
  'ENDCLASS.', //                                                               7
  'CLASS lcl_base IMPLEMENTATION.', //                                          8
  '  METHOD run.', //                                                           9
  '    SELECT SINGLE netwr FROM vbak INTO @DATA(lv_net) WHERE vbeln = @p_vbeln.', // 10
  '    gv_net = me->discount( lv_net ).', //                                    11
  '    me->discount( lv_net ).', //                                             12
  '  ENDMETHOD.', //                                                            13
  '  METHOD discount.', //                                                      14
  '    SELECT SINGLE pct FROM zdisc INTO @DATA(lv_pct) WHERE kunnr = @gv_kunnr.', // 15
  '    rv = iv_net - iv_net * lv_pct / 100.', //                                16
  '  ENDMETHOD.', //                                                            17
  'ENDCLASS.', //                                                               18
  'CLASS lcl_retail DEFINITION INHERITING FROM lcl_base.', //                   19
  '  PROTECTED SECTION.', //                                                    20
  '    METHODS discount REDEFINITION.', //                                      21
  'ENDCLASS.', //                                                               22
  'CLASS lcl_retail IMPLEMENTATION.', //                                        23
  '  METHOD discount.', //                                                      24
  '    SELECT SINGLE pct FROM zcampaign INTO @DATA(lv_pct) WHERE matnr = @gv_matnr.', // 25
  '    IF sy-subrc <> 0.', //                                                   26
  '      rv = super->discount( iv_net ).', //                                   27
  '      RETURN.', //                                                           28
  '    ENDIF.', //                                                              29
  '    rv = iv_net - iv_net * lv_pct / 100.', //                                30
  '  ENDMETHOD.', //                                                            31
  'ENDCLASS.', //                                                               32
  'START-OF-SELECTION.', //                                                     33
  '  NEW lcl_retail( )->run( ).', //                                            34
].join('\n');

test.describe('2. `me->m( )` dispatches at run time when a subclass redefines `m`', () => {
  test('3.2.0: the call in the base class is ambiguous between the base implementation and the redefinition, and both are drawn', () => {
    const skeleton = buildProcessSkeleton(TEMPLATE, NEW);
    const call = nodesAt(skeleton, 12).find((n) => n.kind === 'call-opaque')!;
    expect(call.detail).toMatchObject({ ambiguous: true, candidates: ['LCL_BASE=>DISCOUNT', 'LCL_RETAIL=>DISCOUNT'] });
    // The redefinition is a beginning of its own; the base implementation is reached for certain by its
    // `super->discount( )` and is drawn there (a step inside the redefinition), so it is no beginning.
    expect(entriesOf(skeleton)).toEqual([33, 24]);
    // The trigger names the first call that can reach it — the operand call on line 11 comes before the statement call.
    expect(startAt(skeleton, 24)!.detail).toMatchObject({ trigger: 'candidate of ME->DISCOUNT@11 (1 of 2)' });
    expect(nodesAt(skeleton, 25).map((n) => n.kind)).toContain('read');
    const superCall = nodesAt(skeleton, 27);
    expect(superCall.length).toBeGreaterThan(0);
    expect(superCall.every((n) => n.kind !== 'call-opaque')).toBe(true);
  });

  test('3.1.0 keeps its map: `me->discount( )` is the base implementation, the redefinition is not drawn', () => {
    const skeleton = buildProcessSkeleton(TEMPLATE, OLD);
    const atCall = nodesAt(skeleton, 12);
    expect(atCall.some((n) => n.kind === 'call-opaque')).toBe(false);
    expect(atCall.length).toBeGreaterThan(0);
    expect(entriesOf(skeleton)).toEqual([33]);
    expect(nodesAt(skeleton, 25)).toEqual([]);
  });

  test('a static call and a `super->` call never dispatch', () => {
    const impl = (cls: string, name: string): MethodTarget => ({ key: `${cls}=>${name}`, cls, name, short: name });
    const model: ClassModel = {
      impls: [impl('LCL_BASE', 'STEP'), impl('LCL_SUB', 'STEP')],
      superOf: new Map([['LCL_SUB', 'LCL_BASE']]),
      refTypes: new Map(),
    };
    const dispatching = { byNameAlone: true, dynamicDispatch: true };
    expect(resolveMethodTarget(model, 'lcl_base', '=>', 'step', 'LCL_SUB', dispatching)).toMatchObject({ key: 'LCL_BASE=>STEP', ambiguous: false, candidates: [] });
    expect(resolveMethodTarget(model, 'super', '->', 'step', 'LCL_SUB', dispatching)).toMatchObject({ key: 'LCL_BASE=>STEP', ambiguous: false });
    // `me->step( )` in the base: both; in the subclass (nothing below it): its own.
    expect(resolveMethodTarget(model, 'me', '->', 'step', 'LCL_BASE', dispatching)).toMatchObject({ key: null, ambiguous: true, candidates: ['LCL_BASE=>STEP', 'LCL_SUB=>STEP'] });
    expect(resolveMethodTarget(model, null, null, 'step', 'LCL_SUB', dispatching)).toMatchObject({ key: 'LCL_SUB=>STEP', ambiguous: false });
    // Without the option — every reading before 3.2.0 — the own class's implementation is taken.
    expect(resolveMethodTarget(model, 'me', '->', 'step', 'LCL_BASE', { byNameAlone: true })).toMatchObject({ key: 'LCL_BASE=>STEP', ambiguous: false, candidates: [] });
    // An abstract base: only the redefinitions are candidates.
    const abstract: ClassModel = { ...model, impls: [impl('LCL_SUB', 'STEP'), impl('LCL_OTHER', 'STEP')], superOf: new Map([['LCL_SUB', 'LCL_BASE'], ['LCL_OTHER', 'LCL_BASE']]) };
    expect(resolveMethodTarget(abstract, 'me', '->', 'step', 'LCL_BASE', dispatching)).toMatchObject({ key: null, ambiguous: true, candidates: ['LCL_SUB=>STEP', 'LCL_OTHER=>STEP'] });
  });
});

/** A handler registered before the ambiguous call: the candidate's `RAISE EVENT` runs it. */
const HANDLED = [
  'REPORT zhandled.', //                                                        1
  'INTERFACE lif_step.', //                                                     2
  '  METHODS act.', //                                                          3
  'ENDINTERFACE.', //                                                           4
  'CLASS lcl_ctx DEFINITION.', //                                               5
  '  PUBLIC SECTION.', //                                                       6
  '    EVENTS done.', //                                                        7
  '    METHODS finish.', //                                                     8
  'ENDCLASS.', //                                                               9
  'CLASS lcl_ctx IMPLEMENTATION.', //                                           10
  '  METHOD finish.', //                                                        11
  '    RAISE EVENT done.', //                                                   12
  '  ENDMETHOD.', //                                                            13
  'ENDCLASS.', //                                                               14
  'CLASS lcl_log DEFINITION.', //                                               15
  '  PUBLIC SECTION.', //                                                       16
  '    METHODS on_done FOR EVENT done OF lcl_ctx.', //                          17
  'ENDCLASS.', //                                                               18
  'CLASS lcl_log IMPLEMENTATION.', //                                           19
  '  METHOD on_done.', //                                                       20
  '    INSERT zlog FROM gs_log.', //                                            21
  '  ENDMETHOD.', //                                                            22
  'ENDCLASS.', //                                                               23
  'CLASS lcl_a DEFINITION. PUBLIC SECTION. INTERFACES lif_step. ENDCLASS.', //  24
  'CLASS lcl_a IMPLEMENTATION.', //                                             25
  '  METHOD lif_step~act.', //                                                  26
  '    UPDATE zstate SET st = \'A\' WHERE id = gv_id.', //                      27
  '    go_ctx->finish( ).', //                                                  28
  '  ENDMETHOD.', //                                                            29
  'ENDCLASS.', //                                                               30
  'CLASS lcl_b DEFINITION. PUBLIC SECTION. INTERFACES lif_step. ENDCLASS.', //  31
  'CLASS lcl_b IMPLEMENTATION.', //                                             32
  '  METHOD lif_step~act.', //                                                  33
  '    DELETE FROM zstate WHERE id = gv_id.', //                                34
  '  ENDMETHOD.', //                                                            35
  'ENDCLASS.', //                                                               36
  'DATA: go_ctx TYPE REF TO lcl_ctx, go_log TYPE REF TO lcl_log, go_step TYPE REF TO lif_step.', // 37
  'START-OF-SELECTION.', //                                                     38
  '  go_ctx = NEW lcl_ctx( ).', //                                              39
  '  go_log = NEW lcl_log( ).', //                                              40
  '  SET HANDLER go_log->on_done FOR go_ctx.', //                               41
  "  go_step = COND #( WHEN p_del = abap_true THEN NEW lcl_b( ) ELSE NEW lcl_a( ) ).", // 42
  '  go_step->act( ).', //                                                      43
].join('\n');

test.describe('3. a candidate runs inside the call that reaches it: the handlers registered there are registered in it', () => {
  test('3.2.0: the `RAISE EVENT` inside the candidate runs the handler the report bound before the call', () => {
    const skeleton = buildProcessSkeleton(HANDLED, NEW);
    expect(entriesOf(skeleton)).toEqual([38, 26, 33]);
    // Inside `lcl_a`'s step the context's `finish` is drawn, and its `RAISE EVENT done` runs `on_done`:
    // the handler's write is in the map, and the event is no opaque call.
    expect(nodesAt(skeleton, 21).map((n) => n.kind)).toContain('write');
    expect(nodesAt(skeleton, 12).every((n) => n.kind !== 'call-opaque')).toBe(true);
  });

  test('3.1.0 keeps its map: neither candidate nor handler is drawn', () => {
    const skeleton = buildProcessSkeleton(HANDLED, OLD);
    expect(entriesOf(skeleton)).toEqual([38]);
    expect(nodesAt(skeleton, 21)).toEqual([]);
    expect(nodesAt(skeleton, 27)).toEqual([]);
  });
});

/** A report registers a handler, then shows a screen; the PAI module raises the event. */
const DIALOG = [
  'REPORT zdialog.', //                                                         1
  'CLASS lcl_order DEFINITION.', //                                             2
  '  PUBLIC SECTION.', //                                                       3
  '    EVENTS released.', //                                                    4
  '    METHODS release.', //                                                    5
  'ENDCLASS.', //                                                               6
  'CLASS lcl_order IMPLEMENTATION.', //                                         7
  '  METHOD release.', //                                                       8
  "    UPDATE vbak SET lifsk = ' ' WHERE vbeln = gv_vbeln.", //                 9
  '    RAISE EVENT released.', //                                               10
  '  ENDMETHOD.', //                                                            11
  'ENDCLASS.', //                                                               12
  'CLASS lcl_log DEFINITION.', //                                               13
  '  PUBLIC SECTION.', //                                                       14
  '    CLASS-METHODS on_released FOR EVENT released OF lcl_order.', //          15
  'ENDCLASS.', //                                                               16
  'CLASS lcl_log IMPLEMENTATION.', //                                           17
  '  METHOD on_released.', //                                                   18
  '    INSERT zrel_log FROM gs_log.', //                                        19
  '  ENDMETHOD.', //                                                            20
  'ENDCLASS.', //                                                              21
  'DATA go_order TYPE REF TO lcl_order.', //                                    22
  'START-OF-SELECTION.', //                                                     23
  '  go_order = NEW lcl_order( ).', //                                          24
  '  SET HANDLER lcl_log=>on_released FOR go_order.', //                        25
  '  CALL SCREEN 0100.', //                                                     26
  'MODULE user_command_0100 INPUT.', //                                         27
  '  CASE ok_code.', //                                                         28
  "    WHEN 'REL'.", //                                                         29
  '      go_order->release( ).', //                                             30
  "    WHEN 'BACK'.", //                                                        31
  '      LEAVE TO SCREEN 0.', //                                                32
  '  ENDCASE.', //                                                              33
  'ENDMODULE.', //                                                              34
].join('\n');

test.describe('4. a screen module runs inside the report\'s run: the handlers registered before CALL SCREEN are registered in it', () => {
  test('3.2.0: the `RAISE EVENT` reached from the PAI module runs the handler the report bound before the screen', () => {
    const skeleton = buildProcessSkeleton(DIALOG, NEW);
    expect(entriesOf(skeleton)).toEqual([23, 27]);
    expect(nodesAt(skeleton, 19).map((n) => n.kind)).toContain('write');
    expect(nodesAt(skeleton, 10).every((n) => n.kind !== 'call-opaque')).toBe(true);
  });

  test('3.1.0 keeps its map: the event stays an opaque call and the handler is not drawn', () => {
    const skeleton = buildProcessSkeleton(DIALOG, OLD);
    expect(entriesOf(skeleton)).toEqual([23, 27]);
    expect(nodesAt(skeleton, 19)).toEqual([]);
    expect(nodesAt(skeleton, 10).some((n) => n.kind === 'call-opaque')).toBe(true);
  });
});

test.describe('5. MESSAGE and TYPE are read in any case', () => {
  const upper = [
    'REPORT zcase.', //                                                         1
    'START-OF-SELECTION.', //                                                   2
    '  PERFORM check_limit.', //                                                3
    "  CALL FUNCTION 'Z_BOOK'.", //                                             4
    'FORM check_limit.', //                                                     5
    '  IF p_amount > 1000.', //                                                 6
    '    MESSAGE e001(zz) WITH p_amount.', //                                   7
    '  ENDIF.', //                                                              8
    "  MESSAGE 'Limit checked' TYPE 'I'.", //                                   9
    'ENDFORM.', //                                                              10
  ].join('\n');
  const lower = upper.replace(/MESSAGE/g, 'message').replace(/TYPE/g, 'type').replace(/\bIF\b/g, 'if').replace('ENDIF', 'endif');

  test('3.2.0: a program written in lower case keeps its error end and its popup', () => {
    const skeleton = buildProcessSkeleton(lower, NEW);
    expect(nodesAt(skeleton, 7).map((n) => n.kind)).toEqual(['end-error']);
    expect(nodesAt(skeleton, 9).map((n) => n.kind)).toEqual(['user-task']);
    // Exactly the map the same program in upper case gets.
    const same = buildProcessSkeleton(upper, NEW);
    expect(skeleton.nodes.map((n) => `${n.kind}@${n.anchor?.lineStart}`)).toEqual(same.nodes.map((n) => `${n.kind}@${n.anchor?.lineStart}`));
  });

  test('3.1.0 keeps its map: in lower case the error end and the popup are not drawn, and the routine loses its effect', () => {
    const skeleton = buildProcessSkeleton(lower, OLD);
    expect(nodesAt(skeleton, 7)).toEqual([]);
    expect(nodesAt(skeleton, 9)).toEqual([]);
    expect(buildProcessSkeleton(upper, OLD).nodes.map((n) => n.kind)).toContain('end-error');
  });
});

test.describe('6. a BAdI call and a customer-function call are calls into an enhancement outside this source', () => {
  const source = [
    'REPORT zexit.', //                                                         1
    'DATA lo_check TYPE REF TO zbadi_order_check.', //                          2
    'START-OF-SELECTION.', //                                                   3
    '  GET BADI lo_check.', //                                                  4
    '  CALL BADI lo_check->check_order', //                                     5
    '    EXPORTING is_order = gs_order', //                                     6
    '    CHANGING  cv_ok    = gv_ok.', //                                       7
    "  CALL CUSTOMER-FUNCTION '001'", //                                        8
    '    EXPORTING i_order = gs_order', //                                      9
    '    EXCEPTIONS not_allowed = 1 OTHERS = 2.', //                            10
    '  IF sy-subrc <> 0.', //                                                   11
    "    MESSAGE e010(zz).", //                                                 12
    '  ENDIF.', //                                                              13
    "  CALL FUNCTION 'Z_POST'.", //                                             14
  ].join('\n');

  test('3.2.0: both are service tasks that return, as a CALL FUNCTION of a module not in the slice is; the EXCEPTIONS with a sy-subrc check hang the error boundary on the customer function', () => {
    const skeleton = buildProcessSkeleton(source, NEW);
    const badi = nodesAt(skeleton, 5);
    expect(badi.map((n) => n.kind)).toEqual(['service-task']);
    expect(badi[0].label).toBe('LO_CHECK->CHECK_ORDER');
    expect(badi[0].detail).toMatchObject({ enhancement: 'badi', method: true, returns: true });
    const exit = nodesAt(skeleton, 8);
    expect(exit.map((n) => n.kind).sort()).toEqual(['error-boundary', 'service-task']);
    expect(exit.find((n) => n.kind === 'service-task')!.label).toBe('CUSTOMER-FUNCTION 001');
    expect(exit.find((n) => n.kind === 'service-task')!.detail).toMatchObject({ enhancement: 'customer-function', returns: true });
    expect(exit.find((n) => n.kind === 'error-boundary')!.detail).toMatchObject({ exceptions: ['NOT_ALLOWED', 'OTHERS'] });
    // The flow runs on: BAdI → customer function → the posting.
    const ids = [badi[0].id, exit.find((n) => n.kind === 'service-task')!.id, nodesAt(skeleton, 14)[0].id];
    expect(skeleton.edges.some((e) => e.from === ids[0] && e.to === ids[1])).toBe(true);
    // A routine whose only effect is the enhancement call is a step, not a technical helper.
    const routine = source.replace("  CALL BADI lo_check->check_order\n    EXPORTING is_order = gs_order\n    CHANGING  cv_ok    = gv_ok.", '  PERFORM check.')
      + "\nFORM check.\n  CALL BADI lo_check->check_order EXPORTING is_order = gs_order CHANGING cv_ok = gv_ok.\nENDFORM.";
    const withForm = buildProcessSkeleton(routine, NEW);
    expect(withForm.notDrawn.technicalHelpers).toEqual([]);
    expect(nodesAt(withForm, 5).length).toBeGreaterThan(0);
  });

  test('3.1.0 keeps its map: neither call draws a node', () => {
    const skeleton = buildProcessSkeleton(source, OLD);
    expect(nodesAt(skeleton, 5)).toEqual([]);
    expect(nodesAt(skeleton, 8)).toEqual([]);
    expect(nodesAt(skeleton, 14).map((n) => n.kind)).toContain('service-task');
  });
});

test.describe('the readings travel with the skeleton', () => {
  test('a skeleton read for 3.1.0 is rebuilt when asked for 3.2.0, and kept when asked for 3.1.0 or a 3.0.x hotfix', () => {
    const facts = buildProcessFacts(STRATEGY);
    const old = buildProcessSkeleton(STRATEGY, OLD);
    expect(skeletonReadFor(old, facts, '3.1.0')).toBe(old);
    expect(skeletonReadFor(old, facts, '3.1.2')).toBe(old);
    const rebuilt = skeletonReadFor(old, facts, '3.2.0');
    expect(rebuilt).not.toBe(old);
    expect(entriesOf(rebuilt)).toEqual([35, 9, 20, 30]);
    // And back: a 3.2.0 skeleton asked for 3.1.0 is the old map again; for 3.0.23 (no 3.1.0 readings either) too.
    expect(entriesOf(skeletonReadFor(rebuilt, facts, '3.1.0'))).toEqual([35]);
    expect(skeletonReadFor(rebuilt, facts, '3.2.0')).toBe(rebuilt);
    expect(entriesOf(skeletonReadFor(rebuilt, facts, '3.0.23'))).toEqual([35]);
  });
});

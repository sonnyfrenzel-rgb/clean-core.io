/**
 * Framework entry points by SAP convention (ADR-066).
 *
 * Routines that no PERFORM of the source names, but that SAP calls by a
 * documented convention, are entries of their own rather than "not reached".
 * Every source here is written for this spec; none is a benchmark case.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';

const starts = (source: string) =>
  buildProcessSkeleton(source).nodes
    .filter((n) => n.kind === 'start')
    .map((n) => [n.label, n.anchor?.lineStart, n.detail?.origin, n.detail?.trigger]);

test.describe('ALV callbacks named by literal', () => {
  const alv = (program: string) => [
    'REPORT zalv_callbacks.', //                                                  1
    'START-OF-SELECTION.', //                                                     2
    "  ls_event-name = 'TOP_OF_PAGE'.", //                                        3
    "  ls_event-form = 'PAGE_HEADER'.", //                                        4
    '  APPEND ls_event TO lt_events.', //                                         5
    "  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'", //                                6
    '    EXPORTING', //                                                           7
    `      i_callback_program       = ${program}`, //                             8
    "      i_callback_pf_status_set = 'SET_PF'", //                               9
    "      i_callback_user_command  = 'HANDLE_UCOMM'", //                         10
    '      it_events                = lt_events', //                              11
    '    TABLES', //                                                              12
    '      t_outtab                 = gt_out.', //                                13
    'FORM set_pf USING rt_extab TYPE slis_t_extab.', //                           14
    "  SET PF-STATUS 'MAIN'.", //                                                 15
    'ENDFORM.', //                                                                16
    'FORM handle_ucomm USING r_ucomm LIKE sy-ucomm rs_sel TYPE slis_selfield.', // 17
    "  IF r_ucomm = 'SAVE'.", //                                                  18
    '    UPDATE zorder SET done = abap_true WHERE id = 1.', //                    19
    '  ENDIF.', //                                                                20
    'ENDFORM.', //                                                                21
    'FORM page_header.', //                                                       22
    "  WRITE / 'Orders'.", //                                                     23
    'ENDFORM.', //                                                                24
  ].join('\n');

  test('a FORM named in I_CALLBACK_* or in the event table is an entry with the ALV parameter as trigger', () => {
    const source = alv('sy-repid');
    expect(starts(source)).toEqual([
      ['START-OF-SELECTION', 2, 'event', undefined],
      ['SET_PF', 14, 'callback', 'ALV I_CALLBACK_PF_STATUS_SET'],
      ['HANDLE_UCOMM', 17, 'callback', 'ALV I_CALLBACK_USER_COMMAND'],
      ['PAGE_HEADER', 22, 'callback', 'ALV IT_EVENTS'],
    ]);
    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.notDrawn.unreached).toEqual([]);
    // The callback's own steps are drawn in its region.
    const region = skeleton.regions.find((r) => r.anchor?.lineStart === 17);
    expect(skeleton.nodes.filter((n) => n.region === region?.key).map((n) => [n.kind, n.anchor?.lineStart]))
      .toEqual(expect.arrayContaining([['gateway', 18], ['write', 19]]));
    // The trigger is written down, so it is not "not determined".
    expect(skeleton.notes.filter((n) => n.reason === 'entry-trigger-not-determined')).toEqual([]);
  });

  test('the callback program named by literal as another program: its FORMs are not this source', () => {
    const skeleton = buildProcessSkeleton(alv("'ZOTHER_PROGRAM'"));
    expect(skeleton.nodes.filter((n) => n.kind === 'start').map((n) => n.label)).toEqual(['START-OF-SELECTION']);
    expect(skeleton.notDrawn.unreached.map((u) => u.name)).toEqual(['SET_PF', 'HANDLE_UCOMM', 'PAGE_HEADER']);
  });
});

test.describe('output control processing routines (NAST, table TNAPR)', () => {
  const source = [
    'REPORT zprint_delivery.', //                                                 1
    'INITIALIZATION.', //                                                         2
    '  gv_init = abap_true.', //                                                  3
    'FORM print_note USING return_code TYPE i us_screen TYPE c.', //              4
    '  PERFORM read_data.', //                                                    5
    '  IF gv_rc <> 0.', //                                                        6
    '    return_code = gv_rc.', //                                                7
    '  ENDIF.', //                                                                8
    'ENDFORM.', //                                                                9
    'FORM read_data.', //                                                         10
    '  SELECT SINGLE * FROM likp INTO gs_likp WHERE vbeln = nast-objky.', //      11
    'ENDFORM.', //                                                                12
    'FORM mail_note USING ent_retco ent_screen.', //                              13
    "  CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'.", //                            14
    'ENDFORM.', //                                                                15
    'FORM not_a_print_routine USING iv_a iv_b.', //                               16
    '  DELETE FROM zlog WHERE id = iv_a.', //                                     17
    'ENDFORM.', //                                                                18
  ].join('\n');

  test('a FORM with the output-control interface is an entry beside the event blocks', () => {
    expect(starts(source)).toEqual([
      ['INITIALIZATION', 2, 'event', undefined],
      ['print_note', 4, 'form', 'output control'],
      ['mail_note', 13, 'form', 'output control'],
    ]);
    const skeleton = buildProcessSkeleton(source);
    // What it performs is reached through it; a FORM with another interface is not an entry.
    expect(skeleton.notDrawn.unreached.map((u) => u.name)).toEqual(['NOT_A_PRINT_ROUTINE']);
    // Which output type runs it is configuration outside the source: noted, not guessed.
    const notes = skeleton.notes.filter((n) => n.reason === 'entry-trigger-not-determined');
    expect(notes.map((n) => n.lineStart)).toEqual([4, 13]);
    expect(notes[0].detail).toContain('output control');
  });
});

test.describe('form-based user exits (USEREXIT_*)', () => {
  test('a USEREXIT_ FORM beside a function module is an entry of its own, noted as a user exit', () => {
    const source = [
      'FUNCTION z_credit_log.', //                                                1
      '  INSERT zcredit_log FROM is_log.', //                                     2
      'ENDFUNCTION.', //                                                          3
      'FORM userexit_save_document_prepare.', //                                  4
      "  IF vbak-auart = 'ZOR'.", //                                              5
      '    PERFORM check_limit.', //                                            6
      '  ENDIF.', //                                                            7
      'ENDFORM.', //                                                              8
      'FORM check_limit.', //                                                     9
      '  SELECT SINGLE klimk FROM knkk INTO gv_limit WHERE kunnr = vbak-kunnr.', // 10
      'ENDFORM.', //                                                              11
      'FORM unused_helper.', //                                                   12
      '  UPDATE zcredit_log SET done = abap_true.', //                            13
      'ENDFORM.', //                                                              14
    ].join('\n');
    expect(starts(source)).toEqual([
      ['z_credit_log', 1, 'function', undefined],
      ['userexit_save_document_prepare', 4, 'form', 'user exit'],
    ]);
    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.notDrawn.unreached.map((u) => u.name)).toEqual(['UNUSED_HELPER']);
    const note = skeleton.notes.find((n) => n.reason === 'entry-trigger-not-determined' && n.lineStart === 4);
    expect(note?.detail).toContain('user-exit convention');
  });
});

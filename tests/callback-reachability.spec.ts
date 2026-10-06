import { test, expect } from '@playwright/test';
import { readCallGraph } from '../lib/abap/call-graph';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';

/**
 * A FORM the ALV calls back is reached, in the call graph as in the skeleton.
 *
 * Review of a purchase-order overview report (06.10.2026): the map drew
 * `USER_COMMAND` as an entry with `trigger="ALV I_CALLBACK_USER_COMMAND"`,
 * while the call graph — following `PERFORM` only — listed it and everything
 * it performs as unreachable. The process description then marked the
 * report's whole interactive half "not reached by any entry point", asked
 * whether those routines were still needed, and dropped their custom-table
 * write and batch input from effects and integrations.
 *
 * Synthetic fixture: the same shape, none of that report's code.
 */
const report = (program = 'zdemo_alv_cb') => `REPORT ${program}.
DATA gv_repid TYPE sy-repid.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
START-OF-SELECTION.
  gv_repid = sy-repid.
  PERFORM show_list.
FORM show_list.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program       = gv_repid
      i_callback_pf_status_set = 'SET_STATUS'
      i_callback_user_command  = 'HANDLE_COMMAND'
    TABLES
      t_outtab                 = gt_rows.
ENDFORM.
FORM set_status USING rt_extab TYPE slis_t_extab.
  SET PF-STATUS 'ZMAIN' EXCLUDING rt_extab.
ENDFORM.
FORM handle_command USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.
  CASE r_ucomm.
    WHEN 'DONE'.
      PERFORM mark_done.
  ENDCASE.
ENDFORM.
FORM mark_done.
  UPDATE zdemo_status SET done = 'X' WHERE id = '1'.
ENDFORM.
FORM never_used.
  PERFORM helper.
ENDFORM.
FORM helper.
ENDFORM.
`;

test.describe('ALV callbacks in the call graph', () => {
  test('callback FORMs and what they perform are reachable; dead code stays dead', () => {
    const calls = readCallGraph(report());
    expect(calls.callbacks.map((c) => `${c.to} ${c.trigger} from ${c.from}`)).toEqual([
      'SET_STATUS ALV I_CALLBACK_PF_STATUS_SET from SHOW_LIST',
      'HANDLE_COMMAND ALV I_CALLBACK_USER_COMMAND from SHOW_LIST',
    ]);
    expect(calls.unreachable).toEqual(['NEVER_USED', 'HELPER']);
    // A registration is not a PERFORM: the callbacks stay never performed.
    expect(calls.neverPerformed).toEqual(expect.arrayContaining(['SET_STATUS', 'HANDLE_COMMAND', 'NEVER_USED']));
    expect(calls.edges.some((e) => e.to === 'HANDLE_COMMAND')).toBe(false);
  });

  test('the call graph and the skeleton agree on what is not reached', () => {
    const source = report();
    const calls = readCallGraph(source);
    const skeleton = buildProcessSkeleton(source);
    const callbackStarts = skeleton.nodes
      .filter((n) => n.kind === 'start' && n.detail?.origin === 'callback')
      .map((n) => `${n.container} ${n.detail?.trigger}`);
    expect(callbackStarts).toEqual(['SET_STATUS ALV I_CALLBACK_PF_STATUS_SET', 'HANDLE_COMMAND ALV I_CALLBACK_USER_COMMAND']);
    for (const name of ['SET_STATUS', 'HANDLE_COMMAND', 'MARK_DONE']) expect(calls.unreachable).not.toContain(name);
  });

  test('a callback registered from unreached code is not reached either', () => {
    const source = report().replace('  PERFORM show_list.\n', '');
    const calls = readCallGraph(source);
    expect(calls.unreachable).toEqual(expect.arrayContaining(['SHOW_LIST', 'SET_STATUS', 'HANDLE_COMMAND', 'MARK_DONE']));
  });

  test('a literal I_CALLBACK_PROGRAM naming another program registers nothing here', () => {
    const source = report().replace('i_callback_program       = gv_repid', "i_callback_program       = 'ZOTHER'");
    expect(readCallGraph(source).callbacks).toEqual([]);
  });

  test('a variable not filled from sy-repid may name another program: it registers nothing', () => {
    // QA review of 1c402c400e05: any variable used to count as "this program".
    const source = report().replace('  gv_repid = sy-repid.\n', "  gv_repid = 'ZOTHER'.\n");
    expect(readCallGraph(source).callbacks).toEqual([]);
    const skeleton = buildProcessSkeleton(source);
    expect(skeleton.nodes.some((n) => n.kind === 'start' && n.detail?.origin === 'callback')).toBe(false);
    // sy-repid written directly still names this program.
    const direct = report().replace('i_callback_program       = gv_repid', 'i_callback_program       = sy-repid');
    expect(readCallGraph(direct).callbacks).toHaveLength(2);
  });

  test('the same FORM registered from unreached code and from the program level is reached', () => {
    // QA review of 1c402c400e05: callbacks were de-duplicated by target alone,
    // so the first (unreached) registration hid the reachable one.
    const alv = `  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = sy-repid
      i_callback_user_command = 'HANDLE_COMMAND'
    TABLES
      t_outtab                = gt_rows.
`;
    const source = `REPORT zdemo_twice.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
FORM old_list.
${alv}ENDFORM.
START-OF-SELECTION.
${alv}FORM handle_command USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.
ENDFORM.
`;
    const calls = readCallGraph(source);
    expect(calls.callbacks.map((c) => c.from)).toHaveLength(2);
    expect(calls.unreachable).toEqual(['OLD_LIST']);
  });

  test('PERFORMING … ON END OF TASK is a callback too', () => {
    const source = `REPORT zdemo_task.
START-OF-SELECTION.
  CALL FUNCTION 'Z_DEMO_ASYNC' STARTING NEW TASK 'T1' DESTINATION 'NONE'
    PERFORMING collect ON END OF TASK.
FORM collect USING p_task TYPE clike.
  RECEIVE RESULTS FROM FUNCTION 'Z_DEMO_ASYNC'.
ENDFORM.
`;
    const calls = readCallGraph(source);
    expect(calls.callbacks.map((c) => c.trigger)).toEqual(['ON END OF TASK']);
    expect(calls.unreachable).toEqual([]);
  });
});

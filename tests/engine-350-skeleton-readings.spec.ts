import { test, expect } from '@playwright/test';
import { buildProcessSkeleton, type ProcessSkeleton } from '../lib/abap/process-skeleton';
import { conditionAsserts } from '../lib/abap/skeleton/technical-gateways';
import { buildReadingExports } from '../lib/bpmn/export';

/**
 * Engine 3.5.0 (gated by `ENGINE_READS_350_FROM`, `lib/abap/engine-reads-350-gate.ts`): the skeleton readings of the
 * roadmap row "3.5.0 — with it: engine and benchmark", item (3). Each case is a repro: the map engine 3.4.0 draws
 * (what a signed run of that engine keeps) and the map engine 3.5.0 draws. Server-free.
 */
const OLD = 'v3.4.0';
const NEW = 'v3.5.0';

const skeleton = (source: string, engineVersion: string): ProcessSkeleton => buildProcessSkeleton(source, { engineVersion });
const nodesOf = (s: ProcessSkeleton, kind: string) => s.nodes.filter((n) => n.kind === kind);

test.describe('sy-tabix is read with its own polarity in the technical-gateway fold', () => {
  test('the condition reader: sy-tabix = 0 found no row from 3.5.0, sy-subrc keeps its reading', () => {
    expect(conditionAsserts('sy-tabix = 0')).toBe('success');
    expect(conditionAsserts('sy-tabix = 0', true)).toBe('failure');
    expect(conditionAsserts('sy-tabix > 0')).toBe('failure');
    expect(conditionAsserts('sy-tabix > 0', true)).toBe('success');
    expect(conditionAsserts('sy-tabix IS INITIAL', true)).toBe('failure');
    expect(conditionAsserts('NOT ( sy-tabix > 0 )', true)).toBe('failure');
    for (const reads350 of [false, true]) {
      expect(conditionAsserts('sy-subrc <> 0', reads350)).toBe('failure');
      expect(conditionAsserts('sy-subrc = 0', reads350)).toBe('success');
    }
  });

  test('the arm that found a row is no longer hung on the boundary event as the failure', () => {
    const source = `REPORT ztabix.
START-OF-SELECTION.
  SELECT * FROM vbak INTO TABLE @DATA(lt_vbak).
  IF sy-tabix > 0.
    MESSAGE 'Orders found' TYPE 'S'.
  ELSE.
    MESSAGE 'No orders' TYPE 'E'.
  ENDIF.
`;
    const failureCondition = (s: ProcessSkeleton) => {
      const boundary = s.nodes.find((n) => n.kind === 'error-boundary');
      return boundary ? s.edges.find((e) => e.from === boundary.id)?.condition ?? null : null;
    };
    expect(failureCondition(skeleton(source, OLD))).toBe('sy-tabix > 0');
    expect(failureCondition(skeleton(source, NEW))).not.toBe('sy-tabix > 0');
  });
});

test.describe('WAIT UNTIL joins only the tasks whose callbacks its condition reads', () => {
  const program = (until: string) => `REPORT zwait.
DATA gv_one TYPE abap_bool.
DATA gv_two TYPE abap_bool.
START-OF-SELECTION.
  CALL FUNCTION 'Z_ONE' STARTING NEW TASK 'T1' PERFORMING done_one ON END OF TASK.
  CALL FUNCTION 'Z_TWO' STARTING NEW TASK 'T2' PERFORMING done_two ON END OF TASK.
  WAIT UNTIL ${until}.
  WRITE / 'done'.

FORM done_one USING p_task TYPE clike.
  RECEIVE RESULTS FROM FUNCTION 'Z_ONE'.
  gv_one = abap_true.
ENDFORM.

FORM done_two USING p_task TYPE clike.
  RECEIVE RESULTS FROM FUNCTION 'Z_TWO'.
  gv_two = abap_true.
ENDFORM.
`;
  const joins = (s: ProcessSkeleton) => nodesOf(s, 'parallel-gateway').filter((n) => n.detail?.direction === 'converging').length;

  test('a condition that reads one callback\'s field is no join of both tasks from 3.5.0', () => {
    const source = program('gv_one = abap_true');
    expect(joins(skeleton(source, OLD))).toBe(1);
    expect(joins(skeleton(source, NEW))).toBe(0);
    // The fork itself stays: each task names a callback that receives its result.
    expect(nodesOf(skeleton(source, NEW), 'parallel-gateway').length).toBeGreaterThan(0);
  });

  test('a condition that reads every callback\'s field is the join at every engine', () => {
    const source = program('gv_one = abap_true AND gv_two = abap_true');
    expect(joins(skeleton(source, OLD))).toBe(1);
    expect(joins(skeleton(source, NEW))).toBe(1);
  });
});

test.describe('an ALV IT_EVENTS row filled only after the call is not its callback', () => {
  const program = (order: 'before' | 'after') => `REPORT zalv.
TYPE-POOLS slis.
DATA gt_events TYPE slis_t_event.
DATA gs_event TYPE slis_alv_event.
DATA gt_out TYPE TABLE OF vbak.
START-OF-SELECTION.
${order === 'before' ? '  PERFORM build_events.\n' : ''}  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      it_events          = gt_events
    TABLES
      t_outtab           = gt_out.
${order === 'after' ? '  PERFORM build_events.\n' : ''}
FORM build_events.
  gs_event-name = 'TOP_OF_PAGE'.
  gs_event-form = 'TOP_OF_PAGE'.
  APPEND gs_event TO gt_events.
ENDFORM.

FORM top_of_page.
  WRITE / 'Header'.
ENDFORM.
`;
  const callbackEntry = (s: ProcessSkeleton) => s.regions.some((r) => r.kind === 'entry' && /TOP_OF_PAGE/i.test(r.label));

  test('filled in a FORM written below the call and performed before it: the callback at every engine', () => {
    expect(callbackEntry(skeleton(program('before'), OLD))).toBe(true);
    expect(callbackEntry(skeleton(program('before'), NEW))).toBe(true);
  });

  test('filled in a FORM performed after the call: a callback before 3.5.0, none from 3.5.0', () => {
    expect(callbackEntry(skeleton(program('after'), OLD))).toBe(true);
    expect(callbackEntry(skeleton(program('after'), NEW))).toBe(false);
  });
});

test.describe('PERFORM … ON COMMIT runs at the COMMIT WORK', () => {
  const source = `REPORT zcommit.
START-OF-SELECTION.
  PERFORM post_log ON COMMIT.
  UPDATE zorders SET status = 'P' WHERE id = 1.
  COMMIT WORK.

FORM post_log.
  INSERT zlog FROM @( VALUE #( id = 1 ) ).
ENDFORM.
`;
  const order = (s: ProcessSkeleton) => {
    const write = s.nodes.find((n) => n.kind === 'write' && n.label.toUpperCase() === 'ZORDERS');
    // A small form is collapsed into the one step it does (a write of ZLOG), labelled by the form.
    const form = s.nodes.find((n) => n.label.toUpperCase() === 'POST_LOG' && n.region.startsWith('entry:'));
    return { write, form };
  };

  test('before 3.5.0 the form is drawn first, as an immediate step before the update', () => {
    const s = skeleton(source, OLD);
    const { write, form } = order(s);
    expect(write && form).toBeTruthy();
    expect(s.edges.some((e) => e.from === form!.id && e.to === write!.id)).toBe(true);
  });

  test('from 3.5.0 the form is drawn after the update, where COMMIT WORK runs it, anchored at its PERFORM', () => {
    const s = skeleton(source, NEW);
    const { write, form } = order(s);
    expect(write && form).toBeTruthy();
    expect(s.edges.some((e) => e.from === write!.id && e.to === form!.id)).toBe(true);
    expect(form!.detail?.runsAt).toBe('commit');
    expect(form!.anchor?.lineStart).toBe(3);
  });

  test('a registration no COMMIT WORK of the source runs is a note, not a step', () => {
    const open = source.replace('  COMMIT WORK.\n', '');
    const s = skeleton(open, NEW);
    expect(s.nodes.some((n) => /POST_LOG/i.test(n.label))).toBe(false);
    expect(s.notes.some((n) => n.reason === 'commit-boundary' && /POST_LOG/.test(n.detail))).toBe(true);
  });

  test('ON ROLLBACK runs only at ROLLBACK WORK, and a commit discards it', () => {
    const rollback = `REPORT zrollback.
START-OF-SELECTION.
  PERFORM undo ON ROLLBACK.
  UPDATE zorders SET status = 'P' WHERE id = 1.
  COMMIT WORK.

FORM undo.
  DELETE FROM zlog WHERE id = 1.
ENDFORM.
`;
    expect(skeleton(rollback, NEW).nodes.some((n) => /UNDO/i.test(n.label) && n.region.startsWith('entry:'))).toBe(false);
    expect(skeleton(rollback, OLD).nodes.some((n) => /UNDO/i.test(n.label))).toBe(true);
    const rolled = skeleton(rollback.replace('COMMIT WORK', 'ROLLBACK WORK'), NEW);
    expect(rolled.nodes.find((n) => /UNDO/i.test(n.label) && n.region.startsWith('entry:'))?.detail?.runsAt).toBe('rollback');
  });
});

test.describe('LEAVE PROGRAM is a normal end', () => {
  const source = `REPORT zleave.
PARAMETERS p_quit TYPE abap_bool.
START-OF-SELECTION.
  IF p_quit = abap_true.
    LEAVE PROGRAM.
  ENDIF.
  SELECT * FROM vbak INTO TABLE @DATA(lt_vbak).
`;
  test('an error end before 3.5.0, an end of the run from 3.5.0', () => {
    const old = skeleton(source, OLD);
    expect(nodesOf(old, 'end-error').map((n) => n.anchor?.lineStart)).toContain(5);
    const now = skeleton(source, NEW);
    expect(nodesOf(now, 'end-error')).toHaveLength(0);
    const end = now.nodes.find((n) => n.kind === 'end' && n.label === 'LEAVE PROGRAM');
    expect(end?.detail?.leaveProgram).toBe(true);
    expect(end?.anchor?.lineStart).toBe(5);
    // It hands over to nothing: the run ends there.
    expect(now.edges.some((e) => e.from === end!.id)).toBe(false);
    // The business reading names it as the end of the program, as it named the error end before.
    const named = (engine: string) => buildReadingExports(source, { processName: 'P', sourceFileName: 'zleave.abap', exporterVersion: engine })
      .bpmn.xml.match(/<bpmn:endEvent id="[^"]+" name="([^"]+)"/g) ?? [];
    expect(named(NEW).some((e) => e.includes('name="Program ends"'))).toBe(true);
    expect(named(OLD).some((e) => e.includes('name="Program ends"'))).toBe(true);
  });
});

test.describe('CALL SCREEN names the modules of its screen', () => {
  const source = `REPORT zscreen.
START-OF-SELECTION.
  CALL SCREEN 100.

MODULE status_0100 OUTPUT.
  SET PF-STATUS 'MAIN'.
  SELECT * FROM vbak INTO TABLE @DATA(lt_vbak).
ENDMODULE.

MODULE user_command_0100 INPUT.
  UPDATE vbak SET netwr = 0 WHERE vbeln = '1'.
ENDMODULE.

MODULE status_0200 OUTPUT.
  SELECT * FROM vbap INTO TABLE @DATA(lt_vbap).
ENDMODULE.
`;
  const screenTask = (s: ProcessSkeleton) => s.nodes.find((n) => n.kind === 'user-task' && n.label === '100');

  test('no link before 3.5.0', () => {
    expect(screenTask(skeleton(source, OLD))?.detail?.screenModules).toBeUndefined();
  });

  test('from 3.5.0 the user task lists the PBO and PAI modules of screen 100 and nothing of screen 200', () => {
    const s = skeleton(source, NEW);
    const linked = screenTask(s)?.detail?.screenModules as string[] | undefined;
    expect(linked).toBeDefined();
    const labels = linked!.map((k) => s.regions.find((r) => r.key === k)?.label.toUpperCase());
    expect(labels).toEqual(['STATUS_0100 OUTPUT', 'USER_COMMAND_0100 INPUT']);
    const starts = s.nodes.filter((n) => n.kind === 'start' && linked!.includes(n.region));
    expect(starts.every((n) => n.detail?.screen === '100')).toBe(true);
  });
});

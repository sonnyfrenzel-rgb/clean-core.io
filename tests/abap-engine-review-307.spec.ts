import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { readCallGraph } from '../lib/abap/call-graph';
import { buildProcessSkeleton, type ProcessSkeleton } from '../lib/abap/process-skeleton';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';

/**
 * Roadmap 3.0.7 — "Engine: what the ZMM_BESTELLUEBERSICHT review showed",
 * the bounded slice (a)–(d). Server-free: every test is a pure function of a
 * source written here, none of that report's code.
 */

const label = (skeleton: ProcessSkeleton, id: string) => {
  const node = skeleton.nodes.find((n) => n.id === id);
  return node ? `${node.kind}:${node.label}` : `?${id}`;
};
const flows = (skeleton: ProcessSkeleton, reason: string) =>
  skeleton.edges.filter((e) => e.reason === reason).map((e) => `${label(skeleton, e.from)} -> ${label(skeleton, e.to)}`);

/* ------------------------------------------------------------------ (a) */

test.describe('(a) CALL TRANSACTION without USING is SAP GUI navigation, not batch input', () => {
  const navigation = `REPORT znav_demo.
PARAMETERS p_ebeln TYPE ebeln.
START-OF-SELECTION.
  SET PARAMETER ID 'BES' FIELD p_ebeln.
  CALL TRANSACTION 'ME23N' AND SKIP FIRST SCREEN.
`;
  const batchInput = `REPORT zbdc_demo.
DATA gt_bdc TYPE STANDARD TABLE OF bdcdata.
START-OF-SELECTION.
  CALL TRANSACTION 'ME22' USING gt_bdc MODE 'N' UPDATE 'S'.
`;

  test('navigation is a classic-UI finding with its transaction code; USING stays batch input', () => {
    const nav = buildAbapEvidence(navigation, 'znav.abap').findings;
    expect(nav.filter((f) => f.kind === 'bdc')).toEqual([]);
    const gui = nav.filter((f) => f.kind === 'dynpro');
    expect(gui).toHaveLength(1);
    expect(gui[0].title).toBe('SAP GUI navigation to transaction ME23N');
    expect(gui[0].objectName).toBe('ME23N');
    expect(gui[0].objectType).toBe('Transaction Code');
    expect(gui[0].severity).toBe('Medium');

    const bdc = buildAbapEvidence(batchInput, 'zbdc.abap').findings;
    expect(bdc.filter((f) => f.kind === 'bdc').map((f) => f.objectName)).toEqual(['ME22']);
    expect(bdc.filter((f) => f.kind === 'dynpro')).toEqual([]);
  });

  test('navigation alone does not route side by side and costs the classic-screen points, not the BDC ones', () => {
    for (const deployment of ['private', 'public'] as const) {
      const nav = routeExtensibility(buildAbapEvidence(navigation, 'znav.abap', deployment), deployment);
      expect(nav.recommendedRoute, deployment).toMatch(/In-App/);
      const bdc = routeExtensibility(buildAbapEvidence(batchInput, 'zbdc.abap', deployment), deployment);
      expect(bdc.recommendedRoute, deployment).toMatch(/Side-by-Side/);
      expect(nav.cleanCoreScore, deployment).toBeGreaterThan(bdc.cleanCoreScore);
    }
  });

  test('the call graph and the skeleton keep telling the two apart', () => {
    expect(readCallGraph(navigation).transactions.map((t) => t.batchInput)).toEqual([false]);
    expect(readCallGraph(batchInput).transactions.map((t) => t.batchInput)).toEqual([true]);
    const node = buildProcessSkeleton(navigation).nodes.find((n) => n.kind === 'transaction');
    expect(node?.detail?.batchInput).toBe(false);
  });
});

/* ------------------------------------------------------------------ (b) */

test.describe('(b) I_CALLBACK_PROGRAM is the value the run reaches the call with', () => {
  const alv = `  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = gv_repid
      i_callback_user_command = 'HANDLE_COMMAND'
    TABLES
      t_outtab                = gt_rows.
`;
  const tail = `FORM handle_command USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.
  CASE r_ucomm.
    WHEN 'DONE'.
      UPDATE zdemo_status SET done = 'X' WHERE id = '1'.
  ENDCASE.
ENDFORM.
`;
  const head = `REPORT zdemo_value.
DATA gv_repid TYPE sy-repid.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
START-OF-SELECTION.
  PERFORM init.
  PERFORM show_list.
`;
  const registered = (source: string) => ({
    calls: readCallGraph(source).callbacks.map((c) => c.to),
    skeleton: buildProcessSkeleton(source).nodes
      .filter((n) => n.kind === 'start' && n.detail?.origin === 'callback').map((n) => n.container),
  });

  test('a routine written higher up that never runs does not decide; the fill performed before the call does', () => {
    // FORM reset stands above FORM init and is never performed. Read by line,
    // its 'ZOTHER' was the last write before the call and the callback was lost.
    const source = `${head}FORM reset.
  gv_repid = 'ZOTHER'.
ENDFORM.
FORM show_list.
${alv}ENDFORM.
FORM init.
  gv_repid = sy-repid.
ENDFORM.
${tail}`;
    expect(registered(source)).toEqual({ calls: ['HANDLE_COMMAND'], skeleton: ['HANDLE_COMMAND'] });
  });

  test('a routine performed before the call that names another program does decide', () => {
    const source = `${head}FORM init.
  gv_repid = sy-repid.
  PERFORM retarget.
ENDFORM.
FORM retarget.
  MOVE 'ZOTHER' TO gv_repid.
ENDFORM.
FORM show_list.
${alv}ENDFORM.
${tail}`;
    expect(registered(source)).toEqual({ calls: [], skeleton: [] });
  });

  test('every place that performs the call must hand it this program', () => {
    const twoCallers = `REPORT zdemo_two.
DATA gv_repid TYPE sy-repid.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
START-OF-SELECTION.
  gv_repid = sy-repid.
  PERFORM show_list.
END-OF-SELECTION.
  gv_repid = 'ZOTHER'.
  PERFORM show_list.
FORM show_list.
${alv}ENDFORM.
${tail}`;
    expect(registered(twoCallers).calls).toEqual([]);
    expect(registered(twoCallers.replace("  gv_repid = 'ZOTHER'.\n", '')).calls).toEqual(['HANDLE_COMMAND']);
  });
});

/* ------------------------------------------------------------------ (c) */

test.describe('(c) only an early end ends the run; a normal block end goes on with the next reporting event', () => {
  const report = (sos: string) => `REPORT zdemo_run.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
INITIALIZATION.
  CLEAR gt_rows.
AT SELECTION-SCREEN.
  IF sy-ucomm = 'ONLI'.
    RETURN.
  ENDIF.
  MESSAGE 'checked' TYPE 'S'.
START-OF-SELECTION.
  SELECT * FROM zdemo_row INTO TABLE gt_rows.
${sos}
END-OF-SELECTION.
  WRITE / 'done'.
TOP-OF-PAGE.
  WRITE / 'header'.
`;

  test('the blocks run one after the other; the list event is not chained', () => {
    const skeleton = buildProcessSkeleton(report(''));
    expect(flows(skeleton, 'runtime-order')).toEqual([
      'end:INITIALIZATION -> start:AT SELECTION-SCREEN',
      // RETURN leaves AT SELECTION-SCREEN early and the run goes on all the same.
      'end:AT SELECTION-SCREEN -> start:START-OF-SELECTION',
      'end:RETURN -> start:START-OF-SELECTION',
      'end:START-OF-SELECTION -> start:END-OF-SELECTION',
    ]);
  });

  test('EXIT in START-OF-SELECTION ends the run — no flow on, and it stays an early end even as its last statement', () => {
    const conditional = buildProcessSkeleton(report(`  IF gt_rows IS INITIAL.
    MESSAGE 'nothing found' TYPE 'S'.
    EXIT.
  ENDIF.`));
    const exit = conditional.nodes.find((n) => n.kind === 'end' && n.detail?.exit === 'EXIT');
    expect(exit?.detail?.early).toBe(true);
    expect(conditional.edges.filter((e) => e.from === exit?.id)).toEqual([]);
    expect(flows(conditional, 'runtime-order')).toContain('end:START-OF-SELECTION -> start:END-OF-SELECTION');

    // Nothing drawn after it in the block — still not the normal end: END-OF-SELECTION is skipped.
    const last = buildProcessSkeleton(report('  EXIT.'));
    expect(last.nodes.some((n) => n.kind === 'end' && n.detail?.early === true && n.detail?.exit === 'EXIT')).toBe(true);
  });

  test('STOP goes on with END-OF-SELECTION', () => {
    const skeleton = buildProcessSkeleton(report(`  IF gt_rows IS INITIAL.
    STOP.
  ENDIF.
  WRITE / 'rows'.`));
    expect(skeleton.edges.filter((e) => e.reason === 'stop' && label(skeleton, e.to) === 'start:END-OF-SELECTION')
      .map((e) => label(skeleton, e.from))).toEqual(['end:STOP']);
  });

  test('a SUBMIT that does not return hands over nothing', () => {
    const skeleton = buildProcessSkeleton(report('  SUBMIT zother_report.'));
    expect(flows(skeleton, 'runtime-order')).not.toContain('end:START-OF-SELECTION -> start:END-OF-SELECTION');
  });

  test('a single event block draws no run-order flow', () => {
    const skeleton = buildProcessSkeleton('REPORT zone.\nSTART-OF-SELECTION.\n  WRITE / 1.\n');
    expect(flows(skeleton, 'runtime-order')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ (d) */

test.describe('(d) CASE arms are rows of their own; user actions are alternatives', () => {
  const list = `REPORT zdemo_actions.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
START-OF-SELECTION.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = sy-repid
      i_callback_user_command = 'USER_COMMAND'
    TABLES
      t_outtab                = gt_rows.
FORM user_command USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.
  CASE r_ucomm.
    WHEN '&IC1'.
      CALL TRANSACTION 'ME23N' AND SKIP FIRST SCREEN.
    WHEN 'DONE'.
      PERFORM mark_done.
    WHEN 'DATE'.
      PERFORM change_date.
  ENDCASE.
ENDFORM.
FORM mark_done.
  UPDATE zdemo_status SET done = 'X' WHERE id = '1'.
ENDFORM.
FORM change_date.
  UPDATE zdemo_status SET datum = sy-datum WHERE id = '1'.
ENDFORM.
`;

  test('a CASE on the function code of a list callback is marked as the user choosing', () => {
    const skeleton = buildProcessSkeleton(list);
    const gateways = skeleton.nodes.filter((n) => n.kind === 'gateway');
    expect(gateways.map((g) => `${g.label} ${g.detail?.userAction === true}`)).toEqual(['r_ucomm true']);
  });

  test('sy-ucomm is a user choice anywhere; another selector is not', () => {
    const source = `REPORT zdemo_ucomm.
START-OF-SELECTION.
  WRITE / 'list'.
AT USER-COMMAND.
  CASE sy-ucomm.
    WHEN 'A'. WRITE / 'a'.
    WHEN 'B'. WRITE / 'b'.
  ENDCASE.
  CASE sy-lsind.
    WHEN 1. WRITE / 'one'.
    WHEN 2. WRITE / 'two'.
  ENDCASE.
`;
    const gateways = buildProcessSkeleton(source).nodes.filter((n) => n.kind === 'gateway');
    expect(gateways.map((g) => `${g.label} ${g.detail?.userAction === true}`)).toEqual(['sy-ucomm true', 'sy-lsind false']);
  });

  test('three function codes are three rules, each tied to its own step', () => {
    const rules = deriveBusinessRules(list).rules.filter((r) => r.label.startsWith('CASE r_ucomm'));
    expect(rules.map((r) => r.label)).toEqual(["CASE r_ucomm: '&IC1'", "CASE r_ucomm: 'DONE'", "CASE r_ucomm: 'DATE'"]);
    expect(rules.map((r) => r.processElements.filter((e) => e.relation === 'branch').map((e) => e.label)))
      .toEqual([['ME23N'], ['MARK_DONE'], ['CHANGE_DATE']]);
    expect(rules[1].sentences[0].text).toBe("In USER_COMMAND, CASE r_ucomm has 3 branches; this one is for 'DONE'.");
  });
});

/* ------------------------------------------------------------------ (e) */

test.describe('(e) a chain that only sets one field is a decision table', () => {
  const lights = (arm2 = '      gs_row-ampel = c_gelb.') => `REPORT zdemo_lights.
CONSTANTS: c_rot   TYPE c VALUE '1',
           c_gelb  TYPE c VALUE '2',
           c_gruen TYPE c VALUE '3'.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
DATA gs_row TYPE zdemo_row.
START-OF-SELECTION.
  LOOP AT gt_rows INTO gs_row.
    IF gs_row-eindt < sy-datum AND gs_row-offen > 0.
      gs_row-ampel = c_rot.
    ELSEIF gs_row-eindt < sy-datum + 7.
${arm2}
    ELSE.
      gs_row-ampel = c_gruen.
    ENDIF.
    MODIFY gt_rows FROM gs_row.
  ENDLOOP.
`;

  test('one row per arm, verbatim, and the constants on the right are used', () => {
    const set = deriveBusinessRules(lights());
    expect(set.decisionTables?.map((t) => ({
      id: t.id, field: t.field, rows: t.rows.map((r) => `${r.condition ?? 'otherwise'} => ${r.value}`), ruleIds: t.ruleIds,
    }))).toEqual([{
      id: 'DT-001',
      field: 'gs_row-ampel',
      rows: ['gs_row-eindt < sy-datum AND gs_row-offen > 0 => c_rot', 'gs_row-eindt < sy-datum + 7 => c_gelb', 'otherwise => c_gruen'],
      ruleIds: ['BR-001', 'BR-002', 'BR-003'],
    }]);
    const red = set.rules.find((r) => r.label === "c_rot VALUE '1'");
    expect(red?.withoutProcessElement).toBeUndefined();
    expect(red?.processElements.map((e) => `${e.relation} ${e.kind}`)).toEqual(['value gateway']);
    expect(red?.sentences.map((s) => s.key)).toEqual(['declaration', 'decision-value']);
    expect(red?.sentences[1].text)
      .toBe('gs_row-ampel is set to c_rot where gs_row-eindt < sy-datum AND gs_row-offen > 0 holds (decision table DT-001).');
  });

  test('the skeleton keeps the gateway and names the field it decides', () => {
    const gateway = buildProcessSkeleton(lights()).nodes.find((n) => n.kind === 'gateway');
    expect(gateway?.detail?.decisionTable).toBe('gs_row-ampel');
    expect(gateway?.detail?.arms).toBe(3);
  });

  test('an arm that does something besides setting the field is no table', () => {
    for (const arm2 of ['      gs_row-ampel = c_gelb.\n      PERFORM notify.', '      gs_row-status = c_gelb.']) {
      const source = `${lights(arm2)}FORM notify.\n  WRITE / 'x'.\nENDFORM.\n`;
      expect(deriveBusinessRules(source).decisionTables, arm2).toBeUndefined();
      const gateway = buildProcessSkeleton(source).nodes.find((n) => n.kind === 'gateway');
      expect(gateway?.detail?.decisionTable, arm2).toBeUndefined();
      // And the constants nobody tests or assigns as a table value stay declaration-only.
      expect(deriveBusinessRules(source).rules.find((r) => r.label === "c_rot VALUE '1'")?.withoutProcessElement?.reason)
        .toBe('declaration-only');
    }
  });

  test('a plain IF … ELSE is no table', () => {
    const source = `REPORT zdemo_flag.
DATA lv_flag TYPE c.
START-OF-SELECTION.
  IF sy-datum > '20260101'.
    lv_flag = 'X'.
  ELSE.
    lv_flag = ' '.
  ENDIF.
`;
    expect(deriveBusinessRules(source).decisionTables).toBeUndefined();
  });
});

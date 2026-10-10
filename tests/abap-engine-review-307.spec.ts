import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { readCallGraph } from '../lib/abap/call-graph';
import { buildProcessSkeleton, type ProcessSkeleton } from '../lib/abap/process-skeleton';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { readBatchInput, writesOf } from '../lib/abap/batch-input';
import { buildBusinessStatements } from '../lib/abap/business-statement';
import { collectObjectFacts } from '../lib/abap/public-cloud-fit-resolver';
import { scoreFromFindings } from '../lib/clean-core-score';
import { readInputUse } from '../lib/abap/input-use';
import { assessAuthority } from '../lib/abap/authority-assessment';
import { readDataScope } from '../lib/abap/data-scope';

/**
 * Roadmap 3.0.7 — "Engine: what the ZMM_BESTELLUEBERSICHT review showed",
 * the bounded slice (a)–(e), and the rest of the item (f)–(k). Server-free: every test is a pure function of a
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

  test('a later IF/ELSEIF row says the earlier rows did not hold (first match, QA 975b5ad60247)', () => {
    const source = `REPORT zdemo_overlap.
CONSTANTS: c_low  TYPE c VALUE 'L',
           c_high TYPE c VALUE 'H',
           c_none TYPE c VALUE 'N'.
DATA gs_row TYPE zdemo_row.
START-OF-SELECTION.
  IF gs_row-menge > 0.
    gs_row-klasse = c_low.
  ELSEIF gs_row-menge > 10.
    gs_row-klasse = c_high.
  ELSE.
    gs_row-klasse = c_none.
  ENDIF.
`;
    const set = deriveBusinessRules(source);
    const sentence = (name: string) => set.rules.find((r) => r.label.startsWith(name))?.sentences
      .find((s) => s.key === 'decision-value')?.text;
    expect(sentence('c_low')).toBe('gs_row-klasse is set to c_low where gs_row-menge > 0 holds (decision table DT-001).');
    expect(sentence('c_high'))
      .toBe('gs_row-klasse is set to c_high where no earlier row holds and gs_row-menge > 10 holds (decision table DT-001).');
    expect(sentence('c_none')).toBe('gs_row-klasse is set to c_none where no earlier row holds (decision table DT-001).');
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

/* ------------------------------------------------------------------ (f) */

const BDC_REPORT = `REPORT zdemo_bdc.
TABLES eket.
CONSTANTS c_x TYPE c VALUE 'X'.
DATA: it_bdc LIKE bdcdata OCCURS 0 WITH HEADER LINE,
      gt_po  TYPE STANDARD TABLE OF ekpo,
      gs_po  TYPE ekpo,
      l_datum(10) TYPE c.
START-OF-SELECTION.
  SELECT * FROM ekpo INTO TABLE gt_po WHERE loekz = space.
  PERFORM change_dates.
FORM change_dates.
  LOOP AT gt_po INTO gs_po.
    REFRESH it_bdc.
    PERFORM bdc_dynpro USING 'SAPMM06E' '0105'.
    PERFORM bdc_field  USING 'RM06E-BSTNR' gs_po-ebeln.
    PERFORM bdc_field  USING 'BDC_OKCODE'  '/00'.
    PERFORM bdc_dynpro USING 'SAPMM06E' '1117'.
    PERFORM bdc_field  USING 'EKET-EEIND(01)' l_datum.
    PERFORM bdc_field  USING 'BDC_OKCODE'  '=BU'.
    CALL TRANSACTION 'ME22' USING it_bdc MODE 'N' UPDATE 'S'.
  ENDLOOP.
ENDFORM.
FORM bdc_dynpro USING program dynpro.
  CLEAR it_bdc.
  it_bdc-program  = program.
  it_bdc-dynpro   = dynpro.
  it_bdc-dynbegin = c_x.
  APPEND it_bdc.
ENDFORM.
FORM bdc_field USING fnam fval.
  CLEAR it_bdc.
  it_bdc-fnam = fnam.
  it_bdc-fval = fval.
  APPEND it_bdc.
ENDFORM.
`;

test.describe('(f) batch input read field by field', () => {
  test('screens and fields are read through the helper routines, in order, without the control fields', () => {
    const [call] = readBatchInput(BDC_REPORT);
    expect(call.transaction).toBe('ME22');
    expect(call.table).toBe('IT_BDC');
    expect(call.screens.map((s) => `${s.program} ${s.screen}`)).toEqual(['SAPMM06E 0105', 'SAPMM06E 1117']);
    expect(call.fields.map((f) => `${f.raw}@${f.screen?.screen} ${f.key}`))
      .toEqual(['RM06E-BSTNR@0105 true', 'EKET-EEIND(01)@1117 false']);
    expect(call.okCodes).toEqual(['/00', '=BU']);
  });

  test('macros and rows written in place are read the same way', () => {
    const macro = `REPORT zdemo_macro.
DATA: gt_bdc TYPE STANDARD TABLE OF bdcdata, gs_bdc TYPE bdcdata.
DEFINE bdc_d.
  APPEND VALUE #( program = &1 dynpro = &2 dynbegin = 'X' ) TO gt_bdc.
END-OF-DEFINITION.
DEFINE bdc_f.
  CLEAR gs_bdc.
  gs_bdc-fnam = &1.
  gs_bdc-fval = &2.
  APPEND gs_bdc TO gt_bdc.
END-OF-DEFINITION.
START-OF-SELECTION.
  bdc_d 'SAPMV45A' '0102'.
  bdc_f 'VBAK-VBELN' lv_vbeln.
  bdc_d 'SAPMV45A' '4002'.
  bdc_f 'VBAK-LIFSK' '01'.
  gs_bdc-fnam = 'VBAP-ABGRU(01)'.
  gs_bdc-fval = '02'.
  APPEND gs_bdc TO gt_bdc.
  CALL TRANSACTION 'VA02' USING gt_bdc MODE 'N'.
`;
    const [call] = readBatchInput(macro);
    expect(call.screens.map((s) => s.screen)).toEqual(['0102', '4002']);
    expect(call.fields.map((f) => f.field)).toEqual(['VBAK-VBELN', 'VBAK-LIFSK', 'VBAP-ABGRU']);
    // The document number names the order to open; the two others change it.
    expect(writesOf(call, () => true).map((w) => `${w.table}:${w.components.join(',')}`)).toEqual(['VBAK:LIFSK', 'VBAP:ABGRU']);
  });

  test('the effect is a write to the table, with the domain successor; a screen structure is no table', () => {
    const findings = buildAbapEvidence(BDC_REPORT, 'zbdc.abap', 'private').findings;
    const write = findings.filter((f) => f.kind === 'batch-input');
    expect(write.map((f) => f.objectName)).toEqual(['EKET']); // RM06E is the dialog structure of ME22
    expect(write[0].title)
      .toBe('Batch input changes the delivery date (EKET-EEIND) of the purchase order schedule line (EKET) via ME22');
    expect(write[0].sapReplacement?.objectName).toBeTruthy();
    const bdc = findings.find((f) => f.kind === 'bdc');
    expect(bdc?.recommendation).toContain(`successor of EKET`);
    expect(bdc?.sapReplacement?.objectName).toBe(write[0].sapReplacement?.objectName);
    expect(bdc?.technicalDetail).toContain('SAPMM06E (0105, 1117)');
    // Graded as a write; no direct write (that would force a rebuild, ADR-033).
    const facts = collectObjectFacts(findings).get('EKET');
    expect(facts?.use).toBe('write');
    expect(facts?.hasOwnWriteAccess).toBe(false);
    // And it costs no points of its own: the score is the BDC's.
    const without = findings.filter((f) => f.kind !== 'batch-input');
    expect(scoreFromFindings(findings)).toBe(scoreFromFindings(without));
  });

  test('the skeleton carries the screens and fields on the transaction node; the sentence names the change', () => {
    const node = buildProcessSkeleton(BDC_REPORT).nodes.find((n) => n.kind === 'transaction');
    expect(node?.detail?.batchInputScreens).toEqual(['SAPMM06E 0105', 'SAPMM06E 1117']);
    expect(node?.detail?.batchInputFields).toEqual(['RM06E-BSTNR', 'EKET-EEIND(01)']);
    const sentence = buildBusinessStatements(BDC_REPORT).find((s) => s.text.startsWith('Transaction ME22'));
    expect(sentence?.text).toContain('it changes the delivery date of the purchase order schedule line (EKET-EEIND) and fills RM06E-BSTNR');
  });

  test('navigation without USING reads no fields', () => {
    expect(readBatchInput("REPORT z.\nSTART-OF-SELECTION.\n  CALL TRANSACTION 'ME23N' AND SKIP FIRST SCREEN.\n")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ (g) */

test.describe('(g) user input read and then ignored; dialog parameters of the wrong type', () => {
  const popup = `REPORT zdemo_popup.
DATA: it_bdc LIKE bdcdata OCCURS 0 WITH HEADER LINE,
      g_answer(1) TYPE c,
      g_datum TYPE sy-datum.
PARAMETERS: p_used AS CHECKBOX, p_unused AS CHECKBOX DEFAULT 'X'.
START-OF-SELECTION.
  IF p_used = 'X'.
    CALL FUNCTION 'POPUP_GET_VALUES'
      EXPORTING popup_title = 'New date'
      IMPORTING returncode = g_answer
      TABLES fields = it_bdc.
    g_datum = sy-datum + 14.
    REFRESH it_bdc.
    LOOP AT it_bdc.
      WRITE / it_bdc-fval.
    ENDLOOP.
  ENDIF.
`;

  test('the three shapes, each at its line', () => {
    const issues = readInputUse(popup);
    expect(issues.map((i) => `${i.kind} ${i.name}${i.overwrittenAt ? ` @${i.overwrittenAt}` : ''}`)).toEqual([
      'selection-never-read p_unused',
      'dialog-output-ignored g_answer',
      'dialog-parameter-type it_bdc',
      'dialog-output-ignored it_bdc @13',
    ]);
    expect(issues.find((i) => i.kind === 'dialog-parameter-type')?.detail)
      .toBe('POPUP_GET_VALUES takes a table of SVAL in FIELDS; it_bdc is declared as a table of BDCDATA. The fields the dialog shows and the values it returns are not the ones the program means.');
  });

  test('an answer that is read, and a table of the right type, are not flagged', () => {
    const fine = popup
      .replace('it_bdc LIKE bdcdata OCCURS 0 WITH HEADER LINE', 'it_bdc TYPE STANDARD TABLE OF sval WITH HEADER LINE')
      .replace("    g_datum = sy-datum + 14.\n    REFRESH it_bdc.\n", "    CHECK g_answer <> 'A'.\n")
      .replace(', p_unused AS CHECKBOX DEFAULT \'X\'', '');
    expect(readInputUse(fine)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ (h) */

test.describe('(h) the authorization check is assessed', () => {
  const checked = (actvt: string, field = 's_bukrs-low') => `REPORT zdemo_auth.
TABLES ekko.
SELECT-OPTIONS s_bukrs FOR ekko-bukrs.
AT SELECTION-SCREEN.
  AUTHORITY-CHECK OBJECT 'M_BEST_BUK' ID 'BUKRS' FIELD ${field} ID 'ACTVT' FIELD '${actvt}'.
START-OF-SELECTION.
  UPDATE zdemo_stat SET done = 'X' WHERE bukrs IN s_bukrs.
`;

  test('only the LOW value, and display while the program writes', () => {
    const { issues } = assessAuthority(checked('03'));
    expect(issues.map((i) => `${i.kind} ${i.object}`)).toEqual([
      'low-value-only M_BEST_BUK',
      'display-activity-while-writing M_BEST_BUK',
    ]);
    const finding = buildAbapEvidence(checked('03'), 'z.abap').findings.find((f) => f.kind === 'authority-check');
    expect(finding?.severity).toBe('Medium');
    expect(finding?.title)
      .toBe('Authorization check on M_BEST_BUK checks only the LOW value of a selection range and checks display (ACTVT 03) while the program changes data');
  });

  test('a change activity on a single value is a check that holds', () => {
    expect(assessAuthority(checked('02', 'p_bukrs')).issues).toEqual([]);
    const finding = buildAbapEvidence(checked('02', 'p_bukrs'), 'z.abap').findings.find((f) => f.kind === 'authority-check');
    expect(finding?.severity).toBe('Info');
  });

  test('writes without any check are reported at the first write', () => {
    const source = 'REPORT z.\nSTART-OF-SELECTION.\n  UPDATE zdemo_stat SET done = \'X\' WHERE id = 1.\n';
    expect(assessAuthority(source).issues.map((i) => `${i.kind} L${i.line}`)).toEqual(['write-without-check L3']);
    const finding = buildAbapEvidence(source, 'z.abap').findings.find((f) => f.kind === 'authority-check');
    expect(finding?.title).toBe('Data is changed without an authorization check');
    expect(finding?.lineStart).toBe(3);
    // A change to an internal table is no change of data.
    expect(assessAuthority('REPORT z.\nDATA gt TYPE STANDARD TABLE OF i.\nSTART-OF-SELECTION.\n  DELETE gt INDEX 1.\n').issues).toEqual([]);
  });

  // QA review of 7fecaa0102eb: a batch input that only names the order and
  // presses Enter opens it for display — it is no change of data.
  test('a batch input that only opens a document is no write', () => {
    const bdc = (tcode: string, extra: string) => `REPORT zdemo_open.
PARAMETERS p_vbeln TYPE vbak-vbeln.
DATA it_bdc TYPE STANDARD TABLE OF bdcdata.
DATA ls_bdc TYPE bdcdata.
START-OF-SELECTION.
  ls_bdc-program = 'SAPMV45A'.
  ls_bdc-dynpro = '0102'.
  ls_bdc-dynbegin = 'X'.
  APPEND ls_bdc TO it_bdc.
  CLEAR ls_bdc.
  ls_bdc-fnam = 'VBAK-VBELN'.
  ls_bdc-fval = p_vbeln.
  APPEND ls_bdc TO it_bdc.
${extra}  ls_bdc-fnam = 'BDC_OKCODE'.
  ls_bdc-fval = '/00'.
  APPEND ls_bdc TO it_bdc.
  CALL TRANSACTION '${tcode}' USING it_bdc MODE 'E'.
`;
    const display = assessAuthority(bdc('VA03', ''));
    expect(display.writes).toEqual([]);
    expect(display.issues).toEqual([]);
    const change = assessAuthority(bdc('VA02', "  ls_bdc-fnam = 'VBAK-LIFSK'.\n  ls_bdc-fval = '01'.\n  APPEND ls_bdc TO it_bdc.\n"));
    expect(change.writes.map((w) => `${w.via} ${w.target}`)).toEqual(['batch-input VA02']);
    expect(change.issues.map((i) => i.kind)).toEqual(['write-without-check']);
  });
});

/* ------------------------------------------------------------------ (i) */

test.describe('(i) the run lane is named for its role', () => {
  test('User from a dialog, System from an update task; the token stays the evidence', () => {
    const user = buildProcessSkeleton("REPORT z.\nDATA gt TYPE STANDARD TABLE OF i.\nSTART-OF-SELECTION.\n  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' TABLES t_outtab = gt.\n");
    expect(user.lanes[0]).toMatchObject({ kind: 'human', name: 'User' });
    expect(user.lanes[0].evidence.map((e) => e.token)).toEqual(['REUSE_ALV_GRID_DISPLAY']);
    const system = buildProcessSkeleton("REPORT z.\nSTART-OF-SELECTION.\n  CALL FUNCTION 'Z_POST' IN UPDATE TASK.\n  COMMIT WORK.\n");
    expect(system.lanes[0]).toMatchObject({ kind: 'system', name: 'System' });
    const bare = buildProcessSkeleton('REPORT zbare.\nSTART-OF-SELECTION.\n  WRITE / 1.\n');
    expect(bare.lanes[0]).toMatchObject({ kind: 'program', name: 'ZBARE' });
  });
});

/* ------------------------------------------------------------------ (j) */

test.describe('(j) a change to an internal table is a plain step', () => {
  const calc = `REPORT zdemo_calc.
DATA: BEGIN OF it_out OCCURS 0,
        menge TYPE i,
        wert  TYPE i,
      END OF it_out.
DATA gt_fieldcat TYPE slis_t_fieldcat_alv.
DATA gs_fieldcat TYPE slis_fieldcat_alv.
START-OF-SELECTION.
  PERFORM calculate.
  PERFORM catalogue.
  UPDATE zdemo_stat SET done = 'X' WHERE id = 1.
FORM calculate.
  LOOP AT it_out.
    it_out-wert = it_out-menge * 2.
    MODIFY it_out.
  ENDLOOP.
ENDFORM.
FORM catalogue.
  LOOP AT gt_fieldcat INTO gs_fieldcat.
    MODIFY gt_fieldcat FROM gs_fieldcat.
  ENDLOOP.
ENDFORM.
`;

  test('a task, no data store; the database write stays a write', () => {
    const skeleton = buildProcessSkeleton(calc);
    expect(skeleton.nodes.filter((n) => n.detail?.internalTable === true).map((n) => `${n.kind}:${n.label}`))
      .toEqual(['task:IT_OUT', 'task:GT_FIELDCAT']);
    expect(skeleton.nodes.filter((n) => n.kind === 'write').map((n) => n.label)).toEqual(['ZDEMO_STAT']);
  });

  test('the calculation routines stay steps — the effect is compute, not write, and nothing is folded', () => {
    const skeleton = buildProcessSkeleton(calc);
    expect(skeleton.notDrawn.technicalHelpers.map((h) => h.name)).toEqual([]);
    const effects = Object.fromEntries(skeleton.regions.filter((r) => r.kind === 'sub-process' && !r.multiInstance)
      .map((r) => [r.label.toUpperCase(), r.effects]));
    expect(effects).toEqual({ CALCULATE: ['compute'], CATALOGUE: ['compute'] });
  });
});

/* ------------------------------------------------------------------ (k) */

test.describe('(k) data scope, derived values and selection defaults', () => {
  const report = `REPORT zdemo_scope.
TABLES ekko.
CONSTANTS c_nb TYPE ekko-bsart VALUE 'NB'.
SELECT-OPTIONS: s_bukrs FOR ekko-bukrs OBLIGATORY DEFAULT '1000',
                s_bedat FOR ekko-bedat.
PARAMETERS p_offen AS CHECKBOX DEFAULT 'X'.
DATA: gt_ekko TYPE STANDARD TABLE OF ekko,
      gt_ekpo TYPE STANDARD TABLE OF ekpo,
      gv_offen TYPE p,
      gv_sum TYPE p.
INITIALIZATION.
  s_bedat-low = sy-datum - 365.
  APPEND s_bedat.
START-OF-SELECTION.
  SELECT * FROM ekko INTO TABLE gt_ekko WHERE bukrs IN s_bukrs AND loekz = space AND bsart = c_nb.
  SELECT * FROM ekpo INTO TABLE gt_ekpo FOR ALL ENTRIES IN gt_ekko WHERE ebeln = gt_ekko-ebeln AND elikz = space.
  gv_offen = gv_sum - 1.
  gv_sum = gv_sum + gv_offen.
  CHECK p_offen = 'X'.
`;

  test('every read with the source of its filters', () => {
    const { reads } = readDataScope(report);
    expect(reads.map((r) => r.sentence)).toEqual([
      'EKKO is read only where loekz = space and bsart = c_nb (fixed in the code); restricted by the selection screen: bukrs IN s_bukrs.',
      'EKPO is read only where elikz = space (fixed in the code); for the entries of gt_ekko.',
    ]);
    expect(reads[1].filters.map((f) => f.origin)).toEqual(['previous-read', 'fixed']);
  });

  test('derived values, running totals marked', () => {
    const { derived } = readDataScope(report);
    expect(derived.map((d) => `${d.target} ${d.accumulates}`)).toEqual(['s_bedat-low false', 'gv_offen false', 'gv_sum true']);
  });

  test('defaults from the declaration and from INITIALIZATION', () => {
    const { defaults } = readDataScope(report);
    expect(defaults.map((d) => `${d.name} ${d.part} ${d.value} ${d.from} ${d.obligatory}`)).toEqual([
      "s_bukrs LOW '1000' declaration true",
      "p_offen value 'X' declaration false",
      's_bedat LOW sy-datum - 365 initialization false',
    ]);
  });

  // QA review of 7fecaa0102eb: a checkbox without DEFAULT starts unchecked,
  // and that is a starting state the reader is told, obligatory or not.
  test('a checkbox without DEFAULT is listed as starting empty', () => {
    const { defaults } = readDataScope('REPORT z.\nPARAMETERS p_test AS CHECKBOX.\nPARAMETERS p_name TYPE c LENGTH 10.\n');
    expect(defaults.map((d) => `${d.name} ${d.part} [${d.value}] ${d.obligatory}`)).toEqual(['p_test value [] false']);
  });
});

/**
 * QA review of d939fb5b056b. Three engine claims that said more than the code:
 * a batch-input *session* reported as a change already made (11d2bd848df5), an
 * UPDATE whose table name a local data object shared drawn as an internal-table
 * step (84d858bc959b), and a batch input with a computed field name read as
 * Enter alone (8c5604755697).
 */
test.describe('QA review of d939fb5b056b — what the engine claims about writes', () => {
  test('a BDC_INSERT session queues the change; it does not say the change is made', () => {
    const session = BDC_REPORT.replace(
      "CALL TRANSACTION 'ME22' USING it_bdc MODE 'N' UPDATE 'S'.",
      "CALL FUNCTION 'BDC_INSERT' EXPORTING tcode = 'ME22' TABLES dynprotab = it_bdc.",
    );
    const write = buildAbapEvidence(session, 'zbdc.abap', 'private').findings.filter((f) => f.kind === 'batch-input');
    expect(write.map((f) => f.objectName)).toEqual(['EKET']);
    expect(write[0].title).toBe('Batch input session queues a change to the delivery date (EKET-EEIND) of the purchase order schedule line (EKET) via ME22');
    expect(write[0].technicalDetail).toContain('only queues the session');
    expect(write[0].technicalDetail).not.toContain('The transaction writes the change');
    // The direct call keeps its wording.
    const direct = buildAbapEvidence(BDC_REPORT, 'zbdc.abap', 'private').findings.find((f) => f.kind === 'batch-input');
    expect(direct?.technicalDetail).toContain('The transaction writes the change to EKET');
  });

  test('UPDATE names a database table even when a local data object shares its name', () => {
    const src = `REPORT zx.
DATA mara TYPE mara.
START-OF-SELECTION.
  UPDATE mara SET mtart = 'FERT' WHERE matnr = '1'.
`;
    const nodes = buildProcessSkeleton(src).nodes;
    expect(nodes.filter((n) => n.kind === 'write').map((n) => n.label.toUpperCase())).toContain('MARA');
    expect(nodes.some((n) => n.detail?.internalTable)).toBe(false);
    expect(buildAbapEvidence(src, 'zx.abap', 'private').findings.some((f) => f.kind === 'standard-table-write' && f.objectName === 'MARA')).toBe(true);
    expect(readCallGraph(src).databaseWrites.map((w) => w.table.toUpperCase())).toContain('MARA');
    // An internal table of the same name changed by MODIFY stays a step of the program.
    const itab = `REPORT zx.
DATA gt_fieldcat TYPE slis_t_fieldcat_alv.
DATA gs_fieldcat TYPE slis_fieldcat_alv.
START-OF-SELECTION.
  MODIFY gt_fieldcat FROM gs_fieldcat.
`;
    expect(buildProcessSkeleton(itab).nodes.some((n) => n.kind === 'write')).toBe(false);
  });

  test('a batch input whose field name is computed is a possible write, Enter or not', () => {
    const src = `REPORT zx.
DATA: gt_bdc TYPE STANDARD TABLE OF bdcdata, gs_bdc TYPE bdcdata, lv_field TYPE fnam_____4.
START-OF-SELECTION.
  lv_field = 'VBAK-LIFSK'.
  CLEAR gs_bdc.
  gs_bdc-fnam = lv_field.
  gs_bdc-fval = '01'.
  APPEND gs_bdc TO gt_bdc.
  CLEAR gs_bdc.
  gs_bdc-fnam = 'BDC_OKCODE'.
  gs_bdc-fval = '/00'.
  APPEND gs_bdc TO gt_bdc.
  CALL TRANSACTION 'VA02' USING gt_bdc MODE 'N'.
`;
    const [call] = readBatchInput(src);
    expect(call.fields).toEqual([]);
    expect(call.okCodes).toEqual(['/00']);
    expect(call.unreadRows).toBe(true);
    expect(assessAuthority(src).writes.map((w) => `${w.via}:${w.target}`)).toEqual(['batch-input:VA02']);
    // Every row read and only the number and Enter: still a display, not a write.
    const display = src.replace('gs_bdc-fnam = lv_field.', "gs_bdc-fnam = 'VBAK-VBELN'.");
    expect(readBatchInput(display)[0].unreadRows).toBeUndefined();
    expect(assessAuthority(display).writes).toEqual([]);
  });
});

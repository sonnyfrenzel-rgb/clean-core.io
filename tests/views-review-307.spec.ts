import { test, expect } from '@playwright/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { buildBpmnExportFromSource, buildReadingExports } from '../lib/bpmn/export';
import { buildExportModel } from '../lib/bpmn/model';
import { plainLabels } from '../lib/abap/plain-language';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocument } from '../lib/process-document-build';
import { documentOutline, gateLine, pathLine, processDocumentBlocks } from '../lib/process-document-outline';
import { sectionTitle, stepRef, type PdGate, type PdStep } from '../lib/process-document';
import { blocksMarkdown } from '../lib/requirements-export';
import { preAnsweredQuestion } from '../lib/ask-this-case';
import { decisionTableViews } from '../lib/decision-tables';

/**
 * Roadmap 3.0.7 — "Engine: what the ZMM_BESTELLUEBERSICHT review showed", the
 * views half: the engine slice (`tests/abap-engine-review-307.spec.ts`)
 * recorded the run order, user actions and decision tables; here the BPMN, the
 * process description and "Ask this case" read them. Server-free: every test
 * is a pure function of a source written here, none of that report's code.
 */

const REPORT = `REPORT zdemo_orders.
CONSTANTS: c_rot   TYPE c VALUE '1',
           c_gelb  TYPE c VALUE '2',
           c_gruen TYPE c VALUE '3'.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
DATA gs_row TYPE zdemo_row.
PARAMETERS p_max TYPE i DEFAULT 10.
INITIALIZATION.
  CLEAR gt_rows.
AT SELECTION-SCREEN.
  IF p_max < 0.
    RETURN.
  ENDIF.
  MESSAGE 'checked' TYPE 'S'.
START-OF-SELECTION.
  SELECT * FROM ekko INTO TABLE gt_rows UP TO p_max ROWS.
  IF gt_rows IS INITIAL.
    STOP.
  ENDIF.
  PERFORM set_lights.
END-OF-SELECTION.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = sy-repid
      i_callback_user_command = 'USER_COMMAND'
    TABLES
      t_outtab                = gt_rows.
FORM set_lights.
  LOOP AT gt_rows INTO gs_row.
    IF gs_row-eindt < sy-datum AND gs_row-offen > 0.
      gs_row-ampel = c_rot.
    ELSEIF gs_row-eindt < sy-datum + 7.
      gs_row-ampel = c_gelb.
    ELSE.
      gs_row-ampel = c_gruen.
    ENDIF.
    MODIFY gt_rows FROM gs_row.
  ENDLOOP.
ENDFORM.
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

/** The same report with the classification straight in START-OF-SELECTION, so it stands on the main path. */
const ON_THE_PATH = `REPORT zdemo_light.
CONSTANTS: c_rot   TYPE c VALUE '1',
           c_gelb  TYPE c VALUE '2',
           c_gruen TYPE c VALUE '3'.
DATA gs_row TYPE zdemo_row.
PARAMETERS p_ebeln TYPE ebeln.
START-OF-SELECTION.
  SELECT SINGLE * FROM ekko INTO gs_row WHERE ebeln = p_ebeln.
  IF gs_row-eindt < sy-datum AND gs_row-offen > 0.
    gs_row-ampel = c_rot.
  ELSEIF gs_row-eindt < sy-datum + 7.
    gs_row-ampel = c_gelb.
  ELSE.
    gs_row-ampel = c_gruen.
  ENDIF.
  MODIFY zdemo_light FROM gs_row.
`;

function documentOf(source: string) {
  const { bpmn, technical } = buildReadingExports(source, { processName: 'Orders', sourceFileName: 'z.abap' });
  const named = applyNaming(namingContextOf(source), null, 'no-key');
  const map = buildProcessMapModel({ bpmn, technical, named, fileName: 'z.abap' });
  return buildProcessDocument({ source, map });
}

/* ------------------------------------------------------------------ (1) */

test.describe('(1) the run order reaches the BPMN, beside a callback', () => {
  test('the report events are one flow; the callback keeps a band of its own', () => {
    const skeleton = buildProcessSkeleton(REPORT);
    const model = buildExportModel(skeleton, { labels: plainLabels(skeleton, REPORT) });
    expect(model.root.bands).toHaveLength(2);
    expect(model.root.bands[0].key).toContain('START-OF-SELECTION');
    expect(model.root.bands[1].key).toContain('USER_COMMAND');
    expect(model.droppedEdges).toBe(0);

    const byId = new Map(model.root.nodes.map((n) => [n.id, n]));
    // Every block of the run is reached from the one before: no start event of
    // the run stands alone, except the first.
    const runStarts = model.root.bands[0].nodeIds.map((id) => byId.get(id)).filter((n) => n?.tag === 'startEvent');
    expect(runStarts).toHaveLength(1);
    expect(model.root.flows.filter((f) => f.runtimeOrder).length).toBeGreaterThan(0);
  });

  test('STOP and RETURN in AT SELECTION-SCREEN go on: an event on their own line, never an end with a flow out', () => {
    const skeleton = buildProcessSkeleton(REPORT);
    const model = buildExportModel(skeleton, { labels: plainLabels(skeleton, REPORT) });
    const byId = new Map(model.root.nodes.map((n) => [n.id, n]));
    for (const node of model.root.nodes) {
      if (node.tag === 'endEvent') expect(node.outgoing, `${node.id} is an end with a flow out`).toEqual([]);
      if (node.tag === 'startEvent') expect(node.incoming, `${node.id} is a start with a flow in`).toEqual([]);
    }
    const stop = model.root.nodes.find((n) => n.source.detail?.exit === 'STOP');
    expect(stop?.tag).toBe('intermediateThrowEvent');
    expect(stop?.source.anchor?.lineStart).toBe(18);
    const on = model.root.flows.find((f) => f.sourceId === stop?.id);
    expect(on?.edge.reason).toBe('stop');
    expect(byId.get(on?.targetId ?? '')?.source.label).toBe('END-OF-SELECTION');
    const back = model.root.nodes.find((n) => n.source.detail?.exit === 'RETURN');
    expect(back?.tag).toBe('intermediateThrowEvent');
  });

  test('the file carries the run order as such, and the technical file keeps its bands', async () => {
    const plain = buildBpmnExportFromSource(REPORT, { processName: 'Orders', sourceFileName: 'z.abap', names: 'plain' });
    // Read back by a real BPMN parser, as tests/bpmn-export.spec.ts reads every file.
    const loaded = (await import('bpmn-moddle')) as unknown as {
      BpmnModdle: new () => { fromXML(xml: string): Promise<{ warnings: Array<{ message: string }> }> };
    };
    const parsed = await new loaded.BpmnModdle().fromXML(plain.xml);
    expect(parsed.warnings.map((w) => w.message)).toEqual([]);
    expect(plain.xml).toContain('reason="runtime-order"');
    expect(plain.xml).toContain('reason="stop"');
    const technical = buildBpmnExportFromSource(REPORT, { processName: 'Orders', sourceFileName: 'z.abap' });
    expect(technical.xml).not.toContain('reason="runtime-order"');
  });

  test('EXIT in START-OF-SELECTION still ends the run', () => {
    const source = REPORT.replace('    STOP.', '    EXIT.');
    const skeleton = buildProcessSkeleton(source);
    const model = buildExportModel(skeleton, { labels: plainLabels(skeleton, source) });
    const exit = model.root.nodes.find((n) => n.source.detail?.exit === 'EXIT');
    expect(exit?.tag).toBe('endEvent');
    expect(exit?.outgoing).toEqual([]);
  });
});

/* ------------------------------------------------------------------ (2) */

test.describe('(2) Ask this case: STOP skips the block, not the run', () => {
  const stopping = (eos: boolean) => `REPORT zdemo_run.
DATA gt_rows TYPE STANDARD TABLE OF zdemo_row.
START-OF-SELECTION.
  SELECT * FROM zdemo_row INTO TABLE gt_rows.
  IF gt_rows IS INITIAL.
    STOP.
  ENDIF.
  WRITE / 'rows'.
${eos ? "END-OF-SELECTION.\n  WRITE / 'done'.\n" : ''}`;

  test('with END-OF-SELECTION the STOP branch goes on with it', () => {
    const source = stopping(true);
    const answer = preAnsweredQuestion(buildProcessSkeleton(source), deriveBusinessRules(source), source);
    expect(answer.kind).toBe('answered');
    if (answer.kind !== 'answered') return;
    const stop = answer.branches.find((b) => b.target === 'STOP');
    expect(stop?.endsFlow).toBe(false);
    expect(stop?.continuesWith).toBe('END-OF-SELECTION');
    expect(stop?.plain).toMatch(/the rest of this block is skipped, and the run goes on/);
    expect(stop?.plain).not.toMatch(/run ends/);
  });

  test('without one, STOP still ends the run', () => {
    const source = stopping(false);
    const answer = preAnsweredQuestion(buildProcessSkeleton(source), deriveBusinessRules(source), source);
    if (answer.kind !== 'answered') throw new Error('no question');
    const stop = answer.branches.find((b) => b.target === 'STOP');
    expect(stop?.endsFlow).toBe(true);
    expect(stop?.continuesWith).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ (3) */

test.describe('(3) the arms of a user action are alternatives, not a sequence', () => {
  test('the description lists them side by side under one place', () => {
    const doc = documentOf(REPORT);
    const steps = doc.overview.path.filter((e): e is PdStep => e.kind === 'step');
    const choices = steps.filter((s) => s.choice);
    expect(choices.map((s) => s.technicalName)).toEqual(['ME23N', 'MARK_DONE', 'CHANGE_DATE']);
    const slot = stepRef(choices[0]).replace(/[a-z]$/, '');
    expect(choices.map(stepRef)).toEqual([`${slot}a`, `${slot}b`, `${slot}c`]);
    // The sequence goes on counting where it was: no number is spent per alternative.
    expect(steps.filter((s) => !s.choice).map(stepRef)).toEqual(steps.filter((s) => !s.choice).map((_, i) => String(i + 1)));
    expect(new Set(steps.map((s) => s.number)).size).toBe(steps.length);

    const gate = doc.overview.path.find((e): e is PdGate => e.kind === 'gate' && !!e.choice);
    expect(gateLine(gate as PdGate)).toMatch(/^The user chooses one, as often and in any order: /);
    expect(pathLine(doc.overview.path)).toContain(`${slot} one of `);

    const outline = documentOutline(doc);
    // ADR-084: the step table says who acts (column 3) before what happens (column 4) —
    // here the code proves it (the ALV list is a dialogue), so the column stands.
    expect(outline.whoActs).toBe(true);
    expect(outline.tables.steps.head).toEqual(['No.', 'Step', 'Who acts', 'What happens']);
    const alternatives = outline.tables.steps.rows.filter((r) => /^\d+[a-z]$/.test(r.cells[0]));
    expect(alternatives.map((r) => r.cells[3].split(' — ')[0]))
      .toEqual(['User choice Double-click (&IC1)', 'User choice DONE', 'User choice DATE']);
    // The user chooses each of them; the program's own steps of this dialogue run are the system's.
    expect(alternatives.map((r) => r.cells[2])).toEqual(['User', 'User', 'User']);
  });

  test('a CASE on another selector stays a sequence', () => {
    const doc = documentOf(REPORT.replace('CASE r_ucomm.', 'CASE rs_selfield-fieldname.'));
    expect(doc.overview.path.some((e) => (e.kind === 'step' ? !!e.choice : !!e.choice))).toBe(false);
  });
});

/* ------------------------------------------------------------------ (4) */

test.describe('(4) a decision table is one business rule task with its table', () => {
  test('the rule set reads as one view with every row anchored', () => {
    const [table] = decisionTableViews(deriveBusinessRules(REPORT));
    expect(table.id).toBe('DT-001');
    expect(table.where).toBe('SET_LIGHTS');
    expect(table.rows.map((r) => `${r.condition ?? 'otherwise'} => ${r.value} @L${r.anchor.lineStart}`)).toEqual([
      'gs_row-eindt < sy-datum AND gs_row-offen > 0 => c_rot @L31',
      'gs_row-eindt < sy-datum + 7 => c_gelb @L33',
      'otherwise => c_gruen @L35',
    ]);
  });

  test('the rules section prints it in every rendering', () => {
    const doc = documentOf(REPORT);
    expect(doc.decisionTables?.map((d) => d.id)).toEqual(['DT-001']);
    const outline = documentOutline(doc);
    expect(outline.leads.rules).toMatch(/1 decision table\.$/);
    expect(outline.decisionTables[0].caption).toBe('DT-001 · Business rule task: determines gs_row-ampel (SET_LIGHTS)');
    expect(outline.decisionTables[0].rows.map((r) => [...r.cells, r.anchors[0].lineStart])).toEqual([
      ['gs_row-eindt < sy-datum AND gs_row-offen > 0', 'c_rot', 31],
      ['gs_row-eindt < sy-datum + 7', 'c_gelb', 33],
      ['Otherwise', 'c_gruen', 35],
    ]);
    const md = blocksMarkdown(processDocumentBlocks(doc, { projectName: doc.program }));
    // Sections by title, never by number (ADR-084).
    const rules = md.slice(md.indexOf(`## ${sectionTitle('rules')}`), md.indexOf(`## ${sectionTitle('exceptions')}`));
    expect(rules).toContain('DT-001 · Business rule task: determines gs_row-ampel');
    expect(rules).toContain('| Otherwise | c_gruen | c_gruen · L35 |');
    // ADR-084 (A3): the table says how it is read — first match, and its Otherwise row.
    expect(outline.decisionTables[0].note).toBe('The first matching row wins; the rows below it are not checked. Otherwise applies when no other row matches.');
    expect(rules).toContain(outline.decisionTables[0].note);
  });

  test('on the main path the decision reads as the task, not as arms', () => {
    const doc = documentOf(ON_THE_PATH);
    const gate = doc.overview.path.find((e): e is PdGate => e.kind === 'gate' && !!e.decisionTable);
    expect(gate?.decisionTable).toEqual({ id: 'DT-001', field: 'gs_row-ampel', selector: null, rows: 3 });
    expect(gateLine(gate as PdGate)).toBe('Business rule task: determines gs_row-ampel — decision table DT-001, 3 rows');
    expect(gate?.anchor?.lineStart).toBe(9);
  });

  test('a source without one adds nothing', () => {
    const doc = documentOf(REPORT.replace('      gs_row-ampel = c_gelb.', '      gs_row-status = c_gelb.'));
    expect(doc.decisionTables).toBeUndefined();
    expect(documentOutline(doc).decisionTables).toEqual([]);
  });
});

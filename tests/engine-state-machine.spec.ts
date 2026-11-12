import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel } from '../lib/bpmn/model';
import { businessLevelOf } from '../lib/bpmn/export';
import { readStateMachine, stateWords } from '../lib/abap/state-machine';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';

/**
 * AB-15a (roadmap 3.1.0, owner decision 06.11.2026): a status workflow read out of the code
 * (`lib/abap/state-machine.ts`) and surfaced as the process on the first level of the Business view, each move
 * with its line. Minimal programs written for this spec, one per pattern — none from the process benchmark, none
 * from an owner program. Each also shows that an engine before 3.1.0 keeps its picture.
 */

const NEW = ENGINE_READS_310_FROM;
const OLD = '3.0.23';

/** A class-based status workflow: an interface for the store, a rules class, role checks, and a `show` method. */
const WORKFLOW = [
  'REPORT zt_change_flow.',
  "PARAMETERS: p_id TYPE char10, p_act TYPE char10 DEFAULT 'SUBMIT'.",
  "CONSTANTS: gc_draft TYPE char10 VALUE 'DRAFT',",
  "           gc_submitted TYPE char10 VALUE 'SUBMITTED',",
  "           gc_approved TYPE char10 VALUE 'APPROVED',",
  "           gc_rejected TYPE char10 VALUE 'REJECTED'.",
  'TYPES: BEGIN OF ty_req, id TYPE char10, status TYPE char10, amount TYPE p LENGTH 13 DECIMALS 2, END OF ty_req.',
  'INTERFACE lif_store.',
  '  METHODS row IMPORTING iv_id TYPE char10 RETURNING VALUE(rs_req) TYPE ty_req.',
  '  METHODS save IMPORTING is_req TYPE ty_req.',
  'ENDINTERFACE.',
  'CLASS lcl_db DEFINITION.',
  '  PUBLIC SECTION.',
  '    INTERFACES lif_store.',
  'ENDCLASS.',
  'CLASS lcl_db IMPLEMENTATION.',
  '  METHOD lif_store~row.',
  '    SELECT SINGLE * FROM zt_request INTO CORRESPONDING FIELDS OF rs_req WHERE id = iv_id.',
  '  ENDMETHOD.',
  '  METHOD lif_store~save.',
  '    UPDATE zt_request SET status = is_req-status WHERE id = is_req-id.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'CLASS lcl_flow DEFINITION.',
  '  PUBLIC SECTION.',
  '    METHODS constructor IMPORTING io_store TYPE REF TO lif_store.',
  '    METHODS execute IMPORTING iv_id TYPE char10 iv_action TYPE char10.',
  '    METHODS show.',
  '  PRIVATE SECTION.',
  '    DATA mo_store TYPE REF TO lif_store.',
  '    DATA ms_req TYPE ty_req.',
  '    METHODS submit.',
  '    METHODS approve.',
  '    METHODS reject.',
  '    METHODS get_status RETURNING VALUE(rv_status) TYPE char10.',
  'ENDCLASS.',
  'CLASS lcl_flow IMPLEMENTATION.',
  '  METHOD constructor.',
  '    mo_store = io_store.',
  '  ENDMETHOD.',
  '  METHOD execute.',
  '    ms_req = mo_store->row( iv_id ).',
  '    IF ms_req IS INITIAL.',
  "      MESSAGE 'Request not found' TYPE 'E'.",
  '    ENDIF.',
  '    CASE iv_action.',
  "      WHEN 'SUBMIT'.",
  '        submit( ).',
  "      WHEN 'APPROVE'.",
  '        approve( ).',
  "      WHEN 'REJECT'.",
  '        reject( ).',
  '    ENDCASE.',
  '  ENDMETHOD.',
  '  METHOD submit.',
  '    IF get_status( ) <> gc_draft.',
  "      MESSAGE 'Only a draft can be submitted' TYPE 'E'.",
  '    ENDIF.',
  '    IF ms_req-amount <= 0.',
  "      MESSAGE 'The amount is missing' TYPE 'E'.",
  '    ENDIF.',
  '    ms_req-status = gc_submitted.',
  '    mo_store->save( ms_req ).',
  '  ENDMETHOD.',
  '  METHOD approve.',
  '    IF get_status( ) <> gc_submitted.',
  "      MESSAGE 'Only a submitted request can be approved' TYPE 'E'.",
  '    ENDIF.',
  "    AUTHORITY-CHECK OBJECT 'Z_APPROVE' ID 'ACTVT' FIELD '16'.",
  '    IF sy-subrc <> 0.',
  "      MESSAGE 'No authorization to approve' TYPE 'E'.",
  '    ENDIF.',
  '    ms_req-status = gc_approved.',
  '    mo_store->save( ms_req ).',
  '  ENDMETHOD.',
  '  METHOD reject.',
  '    CHECK ms_req-status = gc_submitted.',
  '    ms_req-status = gc_rejected.',
  '    mo_store->save( ms_req ).',
  '  ENDMETHOD.',
  '  METHOD get_status.',
  '    rv_status = ms_req-status.',
  '  ENDMETHOD.',
  '  METHOD show.',
  '    WRITE: / ms_req-id, ms_req-status.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'START-OF-SELECTION.',
  '  DATA(lo_flow) = NEW lcl_flow( NEW lcl_db( ) ).',
  '  lo_flow->execute( iv_id = p_id iv_action = p_act ).',
  '  lo_flow->show( ).',
].join('\n');

const lineOf = (source: string, text: string) => source.split('\n').findIndex((l) => l.includes(text)) + 1;

function business(source: string, engine: string) {
  const skeleton = buildProcessSkeleton(source, { engineVersion: engine });
  const model = buildExportModel(skeleton, businessLevelOf(skeleton, source, engine));
  const top = model.root.nodes.filter((n) => /Task$|^task$|callActivity|subProcess/.test(n.tag));
  const all = model.containers.flatMap((c) => c.nodes);
  return { model, top, all };
}

test('the workflow is read: the status field, each move with its line, where it comes from, and its role check', () => {
  const machine = readStateMachine(WORKFLOW);
  expect(machine).not.toBeNull();
  expect(machine!.field).toBe('status');
  const moves = machine!.transitions.map((t) => ({ routine: t.routine, from: t.from, to: t.to, line: t.line }));
  expect(moves).toEqual([
    { routine: 'LCL_FLOW=>SUBMIT', from: ['DRAFT'], to: 'SUBMITTED', line: lineOf(WORKFLOW, 'ms_req-status = gc_submitted') },
    { routine: 'LCL_FLOW=>APPROVE', from: ['SUBMITTED'], to: 'APPROVED', line: lineOf(WORKFLOW, 'ms_req-status = gc_approved') },
    { routine: 'LCL_FLOW=>REJECT', from: ['SUBMITTED'], to: 'REJECTED', line: lineOf(WORKFLOW, 'ms_req-status = gc_rejected') },
  ]);
  const approve = machine!.transitions[1];
  expect(approve.roles).toEqual([{ object: 'Z_APPROVE', line: lineOf(WORKFLOW, "AUTHORITY-CHECK OBJECT 'Z_APPROVE'") }]);
  expect(approve.statusChecks).toEqual([lineOf(WORKFLOW, 'IF get_status( ) <> gc_submitted')]);
  // The amount check guards the submit move, and is not a status check.
  expect(machine!.transitions[0].checks).toEqual([lineOf(WORKFLOW, 'IF ms_req-amount <= 0')]);
  expect(machine!.states.map((s) => s.value)).toEqual(['SUBMITTED', 'APPROVED', 'REJECTED', 'DRAFT']);
});

test('the Business view shows the workflow on the first level, in business words, with the moves\' lines — no method name as a step', () => {
  const { top } = business(WORKFLOW, NEW);
  const names = top.map((n) => n.name);
  expect(names).toEqual(expect.arrayContaining([
    'Submit (Draft → Submitted)',
    'Approve (Submitted → Approved)',
    'Reject (Submitted → Rejected)',
    'Show the result list',
  ]));
  // Nothing on the first level is called after a method or an interface: no Execute, Constructor, Show, "~".
  for (const n of names) expect(n, names.join(' | ')).not.toMatch(/^(?:Execute|Constructor|Show|Row|Save)$|~/i);
  // Each move keeps its call's line; the method the program only calls keeps its line on the element that opens it.
  const submit = top.find((n) => n.name.startsWith('Submit'))!;
  expect(submit.source.anchor?.lineStart).toBe(lineOf(WORKFLOW, '        submit( ).'));
  const opener = top.find((n) => (n.folded ?? []).some((f) => f.technicalName === 'EXECUTE'));
  expect(opener, 'the lifted method keeps its line').toBeTruthy();
  expect(opener!.folded!.find((f) => f.technicalName === 'EXECUTE')!.anchor).toBe(`L${lineOf(WORKFLOW, 'lo_flow->execute(')}`);
});

test('an engine before 3.1.0 keeps its picture: the method names, one level down', () => {
  const { top, all } = business(WORKFLOW, OLD);
  expect(top.map((n) => n.name)).toEqual(expect.arrayContaining(['Execute']));
  expect(all.some((n) => /→/.test(n.name))).toBe(false);
});

test('a FORM-based workflow: the move takes its from-value from the caller\'s arm, and a flag step says the state', () => {
  const src = [
    'REPORT zt_claim.',
    'PARAMETERS p_claim TYPE char12.',
    "CONSTANTS: gc_open TYPE char8 VALUE 'OPEN', gc_review TYPE char8 VALUE 'REVIEW',",
    "           gc_paid TYPE char8 VALUE 'PAID', gc_declined TYPE char8 VALUE 'DECLINED'.",
    'DATA gs_claim TYPE zt_claim.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM zt_claim INTO gs_claim WHERE claim_id = p_claim.',
    '  IF gs_claim-status = gc_open.',
    '    PERFORM start_review.',
    '  ELSEIF gs_claim-status = gc_review.',
    '    PERFORM settle.',
    '  ENDIF.',
    'FORM start_review.',
    '  gs_claim-status = gc_review.',
    '  UPDATE zt_claim FROM gs_claim.',
    'ENDFORM.',
    'FORM settle.',
    '  IF gs_claim-amount > 10000.',
    '    gs_claim-status = gc_declined.',
    '  ELSE.',
    '    gs_claim-status = gc_paid.',
    '  ENDIF.',
    '  UPDATE zt_claim FROM gs_claim.',
    'ENDFORM.',
  ].join('\n');
  const machine = readStateMachine(src);
  expect(machine?.transitions.map((t) => `${t.routine}:${t.from.join('/')}>${t.to}`)).toEqual([
    'START_REVIEW:OPEN>REVIEW', 'SETTLE:REVIEW>DECLINED', 'SETTLE:REVIEW>PAID',
  ]);
  const { all } = business(src, NEW);
  const names = all.map((n) => n.name);
  expect(names).toContain('Start review (Open → Review)');
  expect(names).toContain('Settle (Review → Declined or Paid)');
  expect(names).toContain('Set status to Declined');
});

test('a status setter is the move it makes: "Set status to Approved", never what the setter does besides', () => {
  const src = [
    'REPORT zt_setter.',
    "CONSTANTS: BEGIN OF gc_st, new TYPE c LENGTH 1 VALUE 'N', approved TYPE c LENGTH 1 VALUE 'A', rejected TYPE c LENGTH 1 VALUE 'R', END OF gc_st.",
    'CLASS lcl_req DEFINITION.',
    '  PUBLIC SECTION.',
    '    EVENTS changed.',
    '    DATA mv_status TYPE c LENGTH 1.',
    '    METHODS decide IMPORTING iv_ok TYPE abap_bool.',
    '    METHODS set_status IMPORTING iv_status TYPE c.',
    'ENDCLASS.',
    'CLASS lcl_req IMPLEMENTATION.',
    '  METHOD decide.',
    '    IF mv_status <> gc_st-new.',
    '      RETURN.',
    '    ENDIF.',
    '    IF iv_ok = abap_true.',
    '      set_status( gc_st-approved ).',
    '    ELSE.',
    '      set_status( gc_st-rejected ).',
    '    ENDIF.',
    '  ENDMETHOD.',
    '  METHOD set_status.',
    '    mv_status = iv_status.',
    '    UPDATE zt_req SET status = mv_status.',
    '    RAISE EVENT changed.',
    '  ENDMETHOD.',
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  DATA(lo) = NEW lcl_req( ).',
    '  lo->decide( abap_true ).',
  ].join('\n');
  const machine = readStateMachine(src);
  expect(machine?.transitions.map((t) => `${t.from.join('/')}>${t.to}`)).toEqual(['N>A', 'N>R']);
  expect(stateWords('A', 'gc_st-approved')).toBe('Approved');
  const names = business(src, NEW).all.map((n) => n.name);
  expect(names).toEqual(expect.arrayContaining(['Set status to Approved', 'Set status to Rejected']));
  expect(names.some((n) => /^Changed$/i.test(n)), names.join(' | ')).toBe(false);
});

test('no workflow where the code shows none: a status set from a result is a classification, a field never read is a log', () => {
  const light = [
    'REPORT zt_light.',
    'DATA: BEGIN OF gs_row, labst TYPE p, status TYPE c LENGTH 1, END OF gs_row, gt_rows LIKE TABLE OF gs_row.',
    'START-OF-SELECTION.',
    '  LOOP AT gt_rows INTO gs_row.',
    '    IF gs_row-labst <= 0.',
    "      gs_row-status = 'R'.",
    '    ELSE.',
    "      gs_row-status = 'G'.",
    '    ENDIF.',
    '    MODIFY gt_rows FROM gs_row.',
    '  ENDLOOP.',
    "  LOOP AT gt_rows INTO gs_row WHERE status = 'R'.",
    '    WRITE / gs_row-labst.',
    '  ENDLOOP.',
  ].join('\n');
  expect(readStateMachine(light)).toBeNull();
  const written = [
    'REPORT zt_log.',
    'DATA gs_log TYPE zt_log.',
    'START-OF-SELECTION.',
    "  gs_log-status = 'S'.",
    '  INSERT zt_log FROM gs_log.',
    "  gs_log-status = 'E'.",
    '  INSERT zt_log FROM gs_log.',
  ].join('\n');
  expect(readStateMachine(written)).toBeNull();
  // Without a workflow, no label carries a move.
  expect(business(light, NEW).all.some((n) => /→/.test(n.name))).toBe(false);
});

test('signed artefacts stay out of it: the skeleton, the runs and the audit pack never read the workflow', () => {
  const root = path.join(__dirname, '..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
  for (const file of ['lib/abap/process-skeleton.ts', 'app/api/runs/create/route.ts', 'lib/audit-pack.ts', 'lib/abap/business-rule-set.ts']) {
    expect(read(file), file).not.toMatch(/state-machine|technical-methods/);
  }
});

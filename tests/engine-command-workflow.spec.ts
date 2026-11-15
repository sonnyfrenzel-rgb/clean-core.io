import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel, type ExportContainer, type ExportNode } from '../lib/bpmn/model';
import { businessLevelOf, buildBpmnExportFromSource } from '../lib/bpmn/export';
import { readStateMachine } from '../lib/abap/state-machine';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';

/**
 * AB-15a, round 2 (roadmap 3.1.0): a status workflow that one method runs as a decision over a command — a `CASE` or
 * an `IF` chain over an action parameter whose arms move the status — is the process on the first level: each arm one
 * step named as the move, its guards one level down; a demo driver that only plays test commands through it is not
 * the process. Minimal programs written for this spec, several sizes and the shapes that must stay as they are — none
 * from the process benchmark, none from an owner program.
 */

const NEW = ENGINE_READS_310_FROM;
const OLD = '3.0.23';

const STEP = /Task$|^task$|callActivity|subProcess/;

function business(source: string, engine: string) {
  const skeleton = buildProcessSkeleton(source, { engineVersion: engine });
  const model = buildExportModel(skeleton, businessLevelOf(skeleton, source, engine));
  const top = model.root.nodes.filter((n) => STEP.test(n.tag));
  const all = model.containers.flatMap((c) => c.nodes);
  return { model, top, all };
}

const lineOf = (source: string, text: string) => source.split('\n').findIndex((l) => l.includes(text)) + 1;

/** Every flow joins two elements of its own plane, every id is unique, every plane is reachable from the top. */
function wellFormed(model: { root: ExportContainer; containers: ExportContainer[] }): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const reachable = new Set<string>();
  const walk = (c: ExportContainer) => { reachable.add(c.id); for (const n of c.nodes) if (n.inner) walk(n.inner); };
  walk(model.root);
  for (const c of model.containers) {
    if (!reachable.has(c.id)) problems.push(`plane ${c.id} is not reachable`);
    const here = new Set(c.nodes.map((n) => n.id));
    for (const n of c.nodes) {
      if (ids.has(n.id)) problems.push(`duplicate id ${n.id}`);
      ids.add(n.id);
      const incoming = c.flows.filter((f) => f.targetId === n.id).map((f) => f.id).sort().join();
      if (incoming !== [...n.incoming].sort().join()) problems.push(`incoming of ${n.id}`);
    }
    for (const f of c.flows) if (!here.has(f.sourceId) || !here.has(f.targetId)) problems.push(`flow ${f.id} leaves ${c.id}`);
    for (const b of c.bands) for (const id of b.nodeIds) if (!here.has(id)) problems.push(`band of ${c.id} names ${id}`);
  }
  return problems;
}

/**
 * Medium: a service class whose `handle` method decides over the order's verb — `OPEN` in an `IF`, the rest in a
 * `CASE` under its `ELSE` — with status guards, a four-eyes check and a permission check of the program's own; a
 * wrapper with TRY/CATCH; and a scenario class whose `play` sends three literal orders, simulates an edit and prints
 * each answer. The report's only statement starts the scenario.
 */
const DESK = [
  'REPORT zt_claim_desk.',
  'TYPES: BEGIN OF ty_ctx, user TYPE string, END OF ty_ctx.',
  'TYPES: BEGIN OF ty_order, verb TYPE string, claim TYPE string, amount TYPE i, END OF ty_order.',
  'TYPES: BEGIN OF ty_claim, id TYPE string, owner TYPE string, amount TYPE i, state TYPE string, reviewer TYPE string, END OF ty_claim.',
  'TYPES: BEGIN OF ty_answer, ok TYPE abap_bool, state TYPE string, END OF ty_answer.',
  'CLASS lcx_refused DEFINITION INHERITING FROM cx_static_check.',
  'ENDCLASS.',
  'INTERFACE lif_vault.',
  '  METHODS claim IMPORTING iv_id TYPE string RETURNING VALUE(rs_claim) TYPE ty_claim RAISING lcx_refused.',
  '  METHODS assert_permission IMPORTING is_ctx TYPE ty_ctx iv_perm TYPE string RAISING lcx_refused.',
  '  METHODS commit IMPORTING is_claim TYPE ty_claim RAISING lcx_refused.',
  'ENDINTERFACE.',
  'CLASS lcl_vault DEFINITION.',
  '  PUBLIC SECTION.',
  '    INTERFACES lif_vault.',
  '    METHODS simulate_edit IMPORTING iv_id TYPE string.',
  '  PRIVATE SECTION.',
  '    DATA mt_claims TYPE STANDARD TABLE OF ty_claim WITH EMPTY KEY.',
  'ENDCLASS.',
  'CLASS lcl_vault IMPLEMENTATION.',
  '  METHOD lif_vault~claim.',
  '    READ TABLE mt_claims INTO rs_claim WITH KEY id = iv_id.',
  '    IF sy-subrc <> 0.',
  '      RAISE EXCEPTION TYPE lcx_refused.',
  '    ENDIF.',
  '  ENDMETHOD.',
  '  METHOD lif_vault~assert_permission.',
  '    IF is_ctx-user IS INITIAL.',
  '      RAISE EXCEPTION TYPE lcx_refused.',
  '    ENDIF.',
  '  ENDMETHOD.',
  '  METHOD lif_vault~commit.',
  '    MODIFY zt_claim FROM is_claim.',
  '  ENDMETHOD.',
  '  METHOD simulate_edit.',
  '    UPDATE zt_claim SET amount = amount + 1 WHERE id = iv_id.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'CLASS lcl_desk DEFINITION.',
  '  PUBLIC SECTION.',
  '    METHODS constructor IMPORTING io_vault TYPE REF TO lif_vault.',
  '    METHODS run_order IMPORTING is_ctx TYPE ty_ctx is_order TYPE ty_order RETURNING VALUE(rs_answer) TYPE ty_answer.',
  '  PRIVATE SECTION.',
  '    DATA mo_vault TYPE REF TO lif_vault.',
  '    METHODS handle IMPORTING is_ctx TYPE ty_ctx is_order TYPE ty_order RETURNING VALUE(rs_answer) TYPE ty_answer RAISING lcx_refused.',
  'ENDCLASS.',
  'CLASS lcl_desk IMPLEMENTATION.',
  '  METHOD constructor.',
  '    mo_vault = io_vault.',
  '  ENDMETHOD.',
  '  METHOD run_order.',
  '    TRY.',
  '        rs_answer = handle( is_ctx = is_ctx is_order = is_order ).',
  '      CATCH lcx_refused.',
  '        rs_answer-ok = abap_false.',
  '    ENDTRY.',
  '  ENDMETHOD.',
  '  METHOD handle.',
  '    DATA ls_claim TYPE ty_claim.',
  "    IF is_order-verb = 'OPEN'.",
  "      mo_vault->assert_permission( is_ctx = is_ctx iv_perm = 'FILE' ).",
  '      IF is_order-amount <= 0.',
  '        RAISE EXCEPTION TYPE lcx_refused.',
  '      ENDIF.',
  '      ls_claim-id = is_order-claim.',
  '      ls_claim-owner = is_ctx-user.',
  "      ls_claim-state = 'DRAFT'.",
  '    ELSE.',
  '      ls_claim = mo_vault->claim( is_order-claim ).',
  '      CASE is_order-verb.',
  "        WHEN 'SEND'.",
  "          IF ls_claim-state <> 'DRAFT'.",
  '            RAISE EXCEPTION TYPE lcx_refused.',
  '          ENDIF.',
  '          IF ls_claim-amount <= 0.',
  '            RAISE EXCEPTION TYPE lcx_refused.',
  '          ENDIF.',
  "          ls_claim-state = 'SENT'.",
  "        WHEN 'ACCEPT'.",
  "          IF ls_claim-state <> 'SENT'.",
  '            RAISE EXCEPTION TYPE lcx_refused.',
  '          ENDIF.',
  '          IF ls_claim-owner = is_ctx-user.',
  '            RAISE EXCEPTION TYPE lcx_refused.',
  '          ENDIF.',
  "          mo_vault->assert_permission( is_ctx = is_ctx iv_perm = 'ACCEPT' ).",
  '          ls_claim-reviewer = is_ctx-user.',
  "          ls_claim-state = 'ACCEPTED'.",
  "        WHEN 'DECLINE'.",
  "          IF ls_claim-state <> 'SENT'.",
  '            RAISE EXCEPTION TYPE lcx_refused.',
  '          ENDIF.',
  "          ls_claim-state = 'DECLINED'.",
  '      ENDCASE.',
  '    ENDIF.',
  '    mo_vault->commit( ls_claim ).',
  '    rs_answer-ok = abap_true.',
  '    rs_answer-state = ls_claim-state.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'CLASS lcl_scenario DEFINITION.',
  '  PUBLIC SECTION.',
  '    CLASS-METHODS play.',
  '  PRIVATE SECTION.',
  '    CLASS-METHODS print_answer IMPORTING iv_verb TYPE string is_answer TYPE ty_answer.',
  'ENDCLASS.',
  'CLASS lcl_scenario IMPLEMENTATION.',
  '  METHOD print_answer.',
  '    WRITE: / iv_verb, is_answer-state.',
  '  ENDMETHOD.',
  '  METHOD play.',
  '    DATA lo_vault TYPE REF TO lcl_vault.',
  '    DATA lo_desk TYPE REF TO lcl_desk.',
  '    DATA ls_ctx TYPE ty_ctx.',
  '    DATA ls_order TYPE ty_order.',
  '    DATA ls_answer TYPE ty_answer.',
  '    CREATE OBJECT lo_vault.',
  '    CREATE OBJECT lo_desk EXPORTING io_vault = lo_vault.',
  "    ls_ctx-user = 'CLERK'.",
  "    ls_order = VALUE #( verb = 'OPEN' claim = 'C1' amount = 50 ).",
  '    ls_answer = lo_desk->run_order( is_ctx = ls_ctx is_order = ls_order ).',
  '    print_answer( iv_verb = ls_order-verb is_answer = ls_answer ).',
  "    ls_order = VALUE #( verb = 'SEND' claim = 'C1' ).",
  '    ls_answer = lo_desk->run_order( is_ctx = ls_ctx is_order = ls_order ).',
  '    print_answer( iv_verb = ls_order-verb is_answer = ls_answer ).',
  "    lo_vault->simulate_edit( 'C1' ).",
  "    ls_ctx-user = 'CHECKER'.",
  "    ls_order = VALUE #( verb = 'ACCEPT' claim = 'C1' ).",
  '    ls_answer = lo_desk->run_order( is_ctx = ls_ctx is_order = ls_order ).',
  '    print_answer( iv_verb = ls_order-verb is_answer = ls_answer ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'START-OF-SELECTION.',
  '  lcl_scenario=>play( ).',
].join('\n');

/** Small: a FORM whose `IF`/`ELSEIF` chain over a selection parameter moves a ticket, one arm with an authority check. */
const TICKET = [
  'REPORT zt_ticket_cmd.',
  'PARAMETERS: p_id TYPE char10, p_cmd TYPE char10.',
  'DATA gs_ticket TYPE zt_ticket.',
  'START-OF-SELECTION.',
  '  PERFORM run_command.',
  'FORM run_command.',
  '  SELECT SINGLE * FROM zt_ticket INTO gs_ticket WHERE id = p_id.',
  "  IF p_cmd = 'ASSIGN'.",
  "    IF gs_ticket-status <> 'NEW'.",
  "      MESSAGE 'Only a new ticket can be assigned' TYPE 'E'.",
  '    ENDIF.',
  '    gs_ticket-agent = sy-uname.',
  "    gs_ticket-status = 'ASSIGNED'.",
  "  ELSEIF p_cmd = 'RESOLVE'.",
  "    IF gs_ticket-status <> 'ASSIGNED'.",
  "      MESSAGE 'Only an assigned ticket can be resolved' TYPE 'E'.",
  '    ENDIF.',
  "    AUTHORITY-CHECK OBJECT 'Z_TICKET' ID 'ACTVT' FIELD '02'.",
  '    IF sy-subrc <> 0.',
  "      MESSAGE 'No authorization to resolve' TYPE 'E'.",
  '    ENDIF.',
  "    gs_ticket-status = 'RESOLVED'.",
  '  ENDIF.',
  '  UPDATE zt_ticket FROM gs_ticket.',
  'ENDFORM.',
].join('\n');

/**
 * Large: constants for the commands and the states, five commands in a `CASE` over `iv_action` of a class method,
 * checks only for one command before the `CASE`, a role step that decides nothing, and a driver that plays every
 * command with constants written as literals in the order structure.
 */
const PERMIT = [
  'REPORT zt_permit_flow.',
  "CONSTANTS: gc_new TYPE char12 VALUE 'NEW', gc_filed TYPE char12 VALUE 'FILED', gc_granted TYPE char12 VALUE 'GRANTED',",
  "           gc_refused TYPE char12 VALUE 'REFUSED', gc_revoked TYPE char12 VALUE 'REVOKED'.",
  'TYPES: BEGIN OF ty_permit, id TYPE char10, status TYPE char12, applicant TYPE char12, fee TYPE i, END OF ty_permit.',
  'TYPES: BEGIN OF ty_req, action TYPE char12, id TYPE char10, fee TYPE i, END OF ty_req.',
  'CLASS lcl_office DEFINITION.',
  '  PUBLIC SECTION.',
  '    METHODS process IMPORTING is_req TYPE ty_req.',
  '    METHODS show_permit IMPORTING iv_id TYPE char10.',
  '  PRIVATE SECTION.',
  '    DATA ms_permit TYPE ty_permit.',
  '    DATA mv_role TYPE char12.',
  'ENDCLASS.',
  'CLASS lcl_office IMPLEMENTATION.',
  '  METHOD process.',
  '    SELECT SINGLE * FROM zt_permit INTO ms_permit WHERE id = is_req-id.',
  '    CASE is_req-action.',
  "      WHEN 'GRANT'. mv_role = 'OFFICER'.",
  "      WHEN 'REVOKE'. mv_role = 'OFFICER'.",
  "      WHEN OTHERS. mv_role = 'CLERK'.",
  '    ENDCASE.',
  "    IF is_req-action = 'GRANT'.",
  '      IF is_req-fee < 0.',
  "        MESSAGE 'The fee is negative' TYPE 'E'.",
  '      ENDIF.',
  '      IF ms_permit-fee <> is_req-fee.',
  "        MESSAGE 'The fee was not paid' TYPE 'E'.",
  '      ENDIF.',
  '    ENDIF.',
  '    CASE is_req-action.',
  "      WHEN 'CREATE'.",
  '        ms_permit-applicant = sy-uname.',
  '        ms_permit-status = gc_new.',
  "      WHEN 'FILE'.",
  '        IF ms_permit-status <> gc_new.',
  "          MESSAGE 'Only a new permit can be filed' TYPE 'E'.",
  '        ENDIF.',
  '        ms_permit-status = gc_filed.',
  "      WHEN 'GRANT'.",
  '        IF ms_permit-status <> gc_filed.',
  "          MESSAGE 'Only a filed permit can be granted' TYPE 'E'.",
  '        ENDIF.',
  "        AUTHORITY-CHECK OBJECT 'Z_PERMIT' ID 'ACTVT' FIELD '16'.",
  '        IF sy-subrc <> 0.',
  "          MESSAGE 'No authorization to grant' TYPE 'E'.",
  '        ENDIF.',
  '        ms_permit-status = gc_granted.',
  "      WHEN 'REFUSE'.",
  '        IF ms_permit-status <> gc_filed.',
  "          MESSAGE 'Only a filed permit can be refused' TYPE 'E'.",
  '        ENDIF.',
  '        ms_permit-status = gc_refused.',
  "      WHEN 'REVOKE'.",
  '        IF ms_permit-status <> gc_granted.',
  "          MESSAGE 'Only a granted permit can be revoked' TYPE 'E'.",
  '        ENDIF.',
  '        ms_permit-status = gc_revoked.',
  '    ENDCASE.',
  '    MODIFY zt_permit FROM ms_permit.',
  '  ENDMETHOD.',
  '  METHOD show_permit.',
  '    WRITE: / iv_id.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'START-OF-SELECTION.',
  '  DATA(lo_office) = NEW lcl_office( ).',
  '  DATA ls_req TYPE ty_req.',
  "  ls_req = VALUE #( action = 'CREATE' id = 'P1' ).",
  '  lo_office->process( ls_req ).',
  "  ls_req = VALUE #( action = 'FILE' id = 'P1' ).",
  '  lo_office->process( ls_req ).',
  "  ls_req = VALUE #( action = 'GRANT' id = 'P1' fee = 20 ).",
  '  lo_office->process( ls_req ).',
  "  lo_office->show_permit( 'P1' ).",
].join('\n');

test('the workflow is read from the decision over the command: each arm, its lines and its moves, and the driver', () => {
  const machine = readStateMachine(DESK);
  expect(machine?.field).toBe('state');
  const flow = machine!.workflow!;
  expect(flow.routine).toBe('LCL_DESK=>HANDLE');
  expect(flow.operand).toBe('is_order-verb');
  expect(flow.arms.map((a) => ({ values: a.values, from: a.transitions.flatMap((t) => t.from), to: a.transitions.map((t) => t.to) }))).toEqual([
    { values: ['OPEN'], from: [], to: ['DRAFT'] },
    { values: ['SEND'], from: ['DRAFT'], to: ['SENT'] },
    { values: ['ACCEPT'], from: ['SENT'], to: ['ACCEPTED'] },
    { values: ['DECLINE'], from: ['SENT'], to: ['DECLINED'] },
  ]);
  const accept = flow.arms[2];
  expect(accept.lineStart).toBe(lineOf(DESK, "WHEN 'ACCEPT'"));
  expect(accept.lineEnd).toBe(lineOf(DESK, "ls_claim-state = 'ACCEPTED'"));
  // The guards inside the arm guard its move: the four-eyes check is a check, the permission a role.
  expect(accept.transitions[0].checks).toContain(lineOf(DESK, 'IF ls_claim-owner = is_ctx-user'));
  expect(accept.transitions[0].roles.map((r) => r.object)).toEqual(['ACCEPT']);
  expect(machine!.driver).toEqual({
    routine: 'LCL_SCENARIO=>PLAY',
    lineStart: lineOf(DESK, '  METHOD play.'),
    lineEnd: DESK.split('\n').lastIndexOf('  ENDMETHOD.') + 1,
    calls: { method: 'RUN_ORDER', lines: [lineOf(DESK, "VALUE #( verb = 'OPEN'") + 1, lineOf(DESK, "VALUE #( verb = 'SEND'") + 1, lineOf(DESK, "VALUE #( verb = 'ACCEPT'") + 1] },
  });
});

test('the first level is the workflow: each arm one step named as the move, the driver folded onto the start', () => {
  const { model, top } = business(DESK, NEW);
  expect(wellFormed(model)).toEqual([]);
  const names = top.map((n) => n.name);
  expect(names).toEqual(expect.arrayContaining([
    'Open (to Draft)',
    'Send (Draft → Sent)',
    'Accept (Sent → Accepted)',
    'Decline (Sent → Declined)',
  ]));
  // No method of the driver, no test helper, no wrapper on the first level.
  for (const n of names) expect(n, names.join(' | ')).not.toMatch(/^(?:Play|Run order|Handle|Print answer|Simulate edit|Execute)$/i);
  // Each step carries the arm's lines; its guards are one level down, with their own lines.
  const accept = top.find((n) => n.name.startsWith('Accept'))!;
  expect(accept.anchorLabel).toBe(`L${lineOf(DESK, "WHEN 'ACCEPT'")}–${lineOf(DESK, "ls_claim-state = 'ACCEPTED'")}`);
  const inside = accept.inner!.nodes;
  expect(inside.some((n) => n.source.anchor?.lineStart === lineOf(DESK, 'IF ls_claim-owner = is_ctx-user')
    || (n.anchorLabel ?? '').includes(`L${lineOf(DESK, 'IF ls_claim-owner = is_ctx-user')}`))).toBe(true);
  expect(inside.some((n) => n.tag === 'endEvent' && n.source.kind !== 'end')).toBe(true);
  // The driver's steps are on the start, each with its line: the scenario, not the process.
  const start = model.root.nodes.find((n) => n.tag === 'startEvent')!;
  const folded = (start.folded ?? []).map((f) => f.anchor ?? '').join(', ');
  expect(folded).toContain(`L${lineOf(DESK, "lo_vault->simulate_edit( 'C1' )")}`);
  expect(folded).toContain(`L${lineOf(DESK, "VALUE #( verb = 'SEND'") + 1}`);
  expect(start.detail).toMatch(/demo driver/);
  // The arms leave from the decisions the code takes, and come together where the code goes on: the store's commit.
  const commit = top.find((n) => n.technicalName.toUpperCase().includes('COMMIT'))!;
  expect(commit, top.map((n) => n.technicalName).join(' | ')).toBeTruthy();
  for (const step of top.filter((n) => /→|\(to /.test(n.name) && n.name !== 'Open (to Draft)')) {
    const out = model.root.flows.filter((f) => f.sourceId === step.id);
    expect(out.map((f) => f.targetId), step.name).toEqual([commit.id]);
  }
});

test('the plain BPMN file of the workflow is written, and an older engine keeps its picture', () => {
  const file = buildBpmnExportFromSource(DESK, { processName: 'Desk', sourceFileName: 'desk.abap', names: 'plain', source: DESK, exporterVersion: NEW });
  expect(file.xml).toContain('Accept (Sent → Accepted)');
  const { top, all } = business(DESK, OLD);
  expect(all.some((n) => /→/.test(n.name))).toBe(false);
  expect(top.map((n) => n.name).join(' | ')).not.toContain('Open (to Draft)');
});

test('small: an IF/ELSEIF chain over a parameter in a FORM — each branch the move, its checks inside', () => {
  const machine = readStateMachine(TICKET);
  expect(machine?.workflow?.arms.map((a) => a.values)).toEqual([['ASSIGN'], ['RESOLVE']]);
  expect(machine?.driver).toBeNull();
  const { model, all } = business(TICKET, NEW);
  expect(wellFormed(model)).toEqual([]);
  const names = all.map((n) => n.name);
  expect(names).toEqual(expect.arrayContaining(['Assign (New → Assigned)', 'Resolve (Assigned → Resolved)']));
  const resolve = all.find((n) => n.name.startsWith('Resolve'))!;
  expect(resolve.inner, 'the authority check is inside the step it guards').toBeTruthy();
});

test('large: constants, five commands, checks for one command first, a role step that decides nothing, a driver', () => {
  const machine = readStateMachine(PERMIT);
  expect(machine?.workflow?.arms.map((a) => a.values[0])).toEqual(['CREATE', 'FILE', 'GRANT', 'REFUSE', 'REVOKE']);
  expect(machine?.workflow?.checks.map((a) => a.values[0])).toEqual(['GRANT', 'REVOKE', 'GRANT']);
  expect(machine?.driver?.calls.method).toBe('PROCESS');
  const { model, top } = business(PERMIT, NEW);
  expect(wellFormed(model)).toEqual([]);
  const names = top.map((n) => n.name);
  expect(names).toEqual(expect.arrayContaining([
    'Create (to New)', 'File (New → Filed)', 'Grant (Filed → Granted)', 'Refuse (Filed → Refused)', 'Revoke (Granted → Revoked)',
    'Checks for grant',
  ]));
  // The CASE that only sets a role decides nothing on the map: it is folded into the step after it, its line kept.
  const roleCase = lineOf(PERMIT, '    CASE is_req-action.');
  expect(model.root.nodes.some((n) => n.tag === 'exclusiveGateway' && n.source.anchor?.lineStart === roleCase)).toBe(false);
  expect(model.root.nodes.some((n) => (n.folded ?? []).some((f) => f.anchor === `L${roleCase}`))).toBe(true);
  for (const n of names) expect(n, names.join(' | ')).not.toMatch(/^(?:Process|Show permit)$/i);
});

test('stays as today: moves made in the routines the arms call, a single moving arm, a code as command', () => {
  // The arms call routines that move the status: part 1 names the calls; no command workflow is read.
  const called = [
    'REPORT zt_called.',
    'PARAMETERS p_act TYPE char10.',
    'DATA gs_doc TYPE zt_doc.',
    'START-OF-SELECTION.',
    '  CASE p_act.',
    "    WHEN 'POST'. PERFORM post.",
    "    WHEN 'VOID'. PERFORM void.",
    '  ENDCASE.',
    'FORM post.',
    "  CHECK gs_doc-status = 'OPEN'.",
    "  gs_doc-status = 'POSTED'.",
    'ENDFORM.',
    'FORM void.',
    "  CHECK gs_doc-status = 'POSTED'.",
    "  gs_doc-status = 'VOID'.",
    'ENDFORM.',
  ].join('\n');
  const m1 = readStateMachine(called);
  expect(m1).not.toBeNull();
  expect(m1!.workflow).toBeNull();
  // One arm moves the status, the other only reads: no workflow over the command.
  const single = [
    'REPORT zt_single.',
    'PARAMETERS p_act TYPE char10.',
    'DATA gs_doc TYPE zt_doc.',
    'START-OF-SELECTION.',
    "  IF gs_doc-status = 'OPEN'.",
    "    gs_doc-status = 'HELD'.",
    '  ENDIF.',
    '  CASE p_act.',
    "    WHEN 'RELEASE'.",
    "      IF gs_doc-status <> 'HELD'.",
    "        MESSAGE 'Not held' TYPE 'E'.",
    '      ENDIF.',
    "      gs_doc-status = 'OPEN'.",
    "    WHEN 'SHOW'.",
    '      WRITE / gs_doc-status.',
    '  ENDCASE.',
  ].join('\n');
  expect(readStateMachine(single)?.workflow ?? null).toBeNull();
  // A command that is a code: the workflow is read, but no step is named "Command 'A'" and no arm is wrapped.
  const code = [
    'REPORT zt_code.',
    'PARAMETERS p_dec TYPE char1.',
    'DATA gs_doc TYPE zt_doc.',
    'START-OF-SELECTION.',
    '  SELECT SINGLE * FROM zt_doc INTO gs_doc.',
    "  IF gs_doc-status <> 'PENDING'.",
    "    MESSAGE 'Not pending' TYPE 'E'.",
    '  ENDIF.',
    '  CASE p_dec.',
    "    WHEN 'A'.",
    "      gs_doc-status = 'APPROVED'.",
    '      UPDATE zt_doc FROM gs_doc.',
    "    WHEN 'R'.",
    "      gs_doc-status = 'REJECTED'.",
    '      UPDATE zt_doc FROM gs_doc.',
    '  ENDCASE.',
  ].join('\n');
  expect(readStateMachine(code)?.workflow?.arms.length).toBe(2);
  const { all } = business(code, NEW);
  expect(all.some((n) => /Command '/.test(n.name))).toBe(false);
  expect(all.some((n) => /__arm-/.test(n.id))).toBe(false);
});

test('stays as today: no driver where the run reads the selection, or decides something of its own', () => {
  const lines = DESK.split('\n');
  const at = lines.findIndex((l) => l.includes('  METHOD play.'));
  // The orders come from the selection screen, not from literals.
  const fromScreen = [
    ...lines.slice(0, 1), 'PARAMETERS: p_verb TYPE string, p_claim TYPE string.', ...lines.slice(1, at + 1),
    '    DATA lo_desk TYPE REF TO lcl_desk.',
    '    DATA ls_ctx TYPE ty_ctx.',
    '    DATA ls_order TYPE ty_order.',
    '    DATA ls_answer TYPE ty_answer.',
    '    CREATE OBJECT lo_desk EXPORTING io_vault = NEW lcl_vault( ).',
    '    ls_order = VALUE #( verb = p_verb claim = p_claim ).',
    '    ls_answer = lo_desk->run_order( is_ctx = ls_ctx is_order = ls_order ).',
    '    print_answer( iv_verb = ls_order-verb is_answer = ls_answer ).',
    '    ls_answer = lo_desk->run_order( is_ctx = ls_ctx is_order = ls_order ).',
    '  ENDMETHOD.',
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  lcl_scenario=>play( ).',
  ].join('\n');
  const screen = readStateMachine(fromScreen);
  expect(screen?.workflow).not.toBeNull();
  expect(screen?.driver).toBeNull();
  // The scenario decides on an answer: a program with a decision of its own is not a demo driver.
  const deciding = DESK.replace("    lo_vault->simulate_edit( 'C1' ).", "    IF ls_answer-ok = abap_true.\n      lo_vault->simulate_edit( 'C1' ).\n    ENDIF.");
  expect(readStateMachine(deciding)?.driver).toBeNull();
  // Without a driver, the first level keeps the program's own run; the arms are still the moves, one level down.
  const { model, top, all } = business(deciding, NEW);
  expect(wellFormed(model)).toEqual([]);
  expect(top.some((n) => /→/.test(n.name))).toBe(false);
  expect(all.some((n: ExportNode) => n.name === 'Accept (Sent → Accepted)')).toBe(true);
});

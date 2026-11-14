import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel, type ExportNode } from '../lib/bpmn/model';
import { businessLevelOf } from '../lib/bpmn/export';
import { isTechnicalMethodName, ownMethodName, interfaceOfMethod } from '../lib/abap/technical-methods';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';

/**
 * AB-15a (roadmap 3.1.0): technical methods — constructor, getters and setters, show/display — are technique, not
 * process; an entry that only calls one method has that method's content as its first level; an interface method
 * is not named after its interface. Minimal programs written for this spec, one per pattern.
 */

const NEW = ENGINE_READS_310_FROM;
const OLD = '3.0.23';

function business(source: string, engine: string) {
  const skeleton = buildProcessSkeleton(source, { engineVersion: engine });
  const model = buildExportModel(skeleton, businessLevelOf(skeleton, source, engine));
  const steps = (nodes: ExportNode[]) => nodes.filter((n) => /Task$|^task$|callActivity|subProcess/.test(n.tag));
  return { model, top: steps(model.root.nodes), all: steps(model.containers.flatMap((c) => c.nodes)) };
}

const lineOf = (source: string, text: string) => source.split('\n').findIndex((l) => l.includes(text)) + 1;

/** `main` → `run`: a report whose only statement calls one static method that creates the object and runs it. */
const CLUSTER = [
  'REPORT zt_cluster.',
  'PARAMETERS p_vkorg TYPE vkorg.',
  'CLASS lcl_app DEFINITION.',
  '  PUBLIC SECTION.',
  '    CLASS-METHODS main.',
  '    METHODS constructor.',
  '    METHODS run.',
  '  PRIVATE SECTION.',
  '    DATA mt_orders TYPE STANDARD TABLE OF vbak.',
  '    DATA mv_limit TYPE p LENGTH 13 DECIMALS 2.',
  '    METHODS get_limit RETURNING VALUE(rv_limit) TYPE netwr.',
  '    METHODS set_limit IMPORTING iv_limit TYPE netwr.',
  '    METHODS block_order IMPORTING is_order TYPE vbak.',
  '    METHODS display.',
  'ENDCLASS.',
  'CLASS lcl_app IMPLEMENTATION.',
  '  METHOD main.',
  '    NEW lcl_app( )->run( ).',
  '  ENDMETHOD.',
  '  METHOD constructor.',
  '    SELECT SINGLE limit FROM zt_limits INTO mv_limit WHERE vkorg = p_vkorg.',
  '  ENDMETHOD.',
  '  METHOD run.',
  '    SELECT * FROM vbak INTO TABLE mt_orders WHERE vkorg = p_vkorg.',
  '    IF mt_orders IS INITIAL.',
  "      MESSAGE 'No orders' TYPE 'S'.",
  '      RETURN.',
  '    ENDIF.',
  '    set_limit( 1000 ).',
  '    LOOP AT mt_orders INTO DATA(ls_order).',
  '      IF ls_order-netwr > get_limit( ).',
  '        block_order( ls_order ).',
  '      ENDIF.',
  '    ENDLOOP.',
  '    display( ).',
  '  ENDMETHOD.',
  '  METHOD get_limit.',
  '    rv_limit = mv_limit.',
  '  ENDMETHOD.',
  '  METHOD set_limit.',
  '    mv_limit = iv_limit.',
  '  ENDMETHOD.',
  '  METHOD block_order.',
  "    UPDATE vbak SET lifsk = '01' WHERE vbeln = is_order-vbeln.",
  "    MESSAGE 'Order blocked' TYPE 'S'.",
  '  ENDMETHOD.',
  '  METHOD display.',
  "    cl_demo_output=>display( mt_orders ).",
  '  ENDMETHOD.',
  'ENDCLASS.',
  'START-OF-SELECTION.',
  '  lcl_app=>main( ).',
].join('\n');

test('the names: constructor, getters, setters and show/display are technical; an interface method is its own name', () => {
  for (const name of ['CONSTRUCTOR', 'class_constructor', 'GET_LIMIT', 'set_limit', 'show', 'DISPLAY', 'display_summary', 'lo_app->show( )', 'refresh', 'REFRESH_ALV'])
    expect(isTechnicalMethodName(name), name).toBe(true);
  for (const name of ['RUN', 'approve', 'block_order', 'getaway', 'LIF_STORE~ROW', 'settle', 'refresh_credit_limit'])
    expect(isTechnicalMethodName(name), name).toBe(false);
  expect(ownMethodName('LIF_STORE~ROW')).toBe('ROW');
  expect(ownMethodName('LCL_APP=>RUN')).toBe('RUN');
  expect(interfaceOfMethod('LIF_STORE~ROW')).toBe('LIF_STORE');
  expect(interfaceOfMethod('RUN')).toBeNull();
});

test('an entry that only calls one method has that method\'s content as its first level — twice over for main → run', () => {
  const { top, model } = business(CLUSTER, NEW);
  const names = top.map((n) => n.name);
  expect(names, names.join(' | ')).not.toContain('Main');
  expect(names, names.join(' | ')).not.toContain('Run');
  // The process is on the first level: the read of the orders and the loop over them.
  expect(top.some((n) => n.reads.includes('VBAK') || /order/i.test(n.name)), names.join(' | ')).toBe(true);
  // No plane is left that stands for the wrappers.
  expect(model.containers.some((c) => c.id !== model.root.id && /MAIN|RUN/.test(model.root.nodes.find((n) => n.inner === c)?.technicalName ?? ''))).toBe(false);
  // Their lines stay readable on the element that now opens the content.
  const folded = top.flatMap((n) => n.folded ?? []);
  expect(folded.find((f) => f.technicalName === 'MAIN')?.anchor).toBe(`L${lineOf(CLUSTER, 'lcl_app=>main( ).')}`);
});

test('technical methods are not steps: no "Constructor", "Get limit" or "Set limit" at the business level, every line kept', () => {
  const { all } = business(CLUSTER, NEW);
  const names = all.map((n) => n.name);
  for (const n of names) expect(n, names.join(' | ')).not.toMatch(/^(?:Constructor|Get limit|Set limit|Main|Run)$/);
  // The constructor's read is folded into the read of the orders beside it — its line stays on that element.
  const read = all.find((n) => n.reads.includes('VBAK'))!;
  expect(read.anchorLabel, read.name).toContain(`L${lineOf(CLUSTER, 'NEW lcl_app( )->run( ).')}`);
});

test('a routine that calls a phase of its own is not one step: main is not folded onto the read of its constructor', () => {
  const skeleton = buildProcessSkeleton(CLUSTER, { engineVersion: NEW });
  const call = skeleton.nodes.find((n) => n.expandsTo === 'method:LCL_APP=>MAIN')!;
  expect(call.kind).toBe('sub-process');
  expect(call.collapsed ?? false).toBe(false);
  // 3.0.23 folded it onto the read, and the process hid behind one box.
  const before = buildProcessSkeleton(CLUSTER, { engineVersion: OLD }).nodes.find((n) => n.expandsTo === 'method:LCL_APP=>MAIN')!;
  expect(before.kind).toBe('read');
});

test('an engine before 3.1.0 keeps its picture: the wrapper method is the first level', () => {
  const { top } = business(CLUSTER, OLD);
  expect(top.map((n) => n.name)).toContain('Main');
});

test('an interface method folded onto one statement is named by it; one with a plane by its own name, never "Lif x~y"', () => {
  const src = [
    'REPORT zt_iface.',
    'PARAMETERS p_matnr TYPE matnr.',
    'INTERFACE lif_repo.',
    '  METHODS load IMPORTING iv_matnr TYPE matnr RETURNING VALUE(rs_mara) TYPE mara.',
    'ENDINTERFACE.',
    'INTERFACE lif_step.',
    '  METHODS process IMPORTING is_mara TYPE mara.',
    'ENDINTERFACE.',
    'CLASS lcl_repo DEFINITION.',
    '  PUBLIC SECTION.',
    '    INTERFACES lif_repo.',
    'ENDCLASS.',
    'CLASS lcl_repo IMPLEMENTATION.',
    '  METHOD lif_repo~load.',
    '    SELECT SINGLE * FROM mara INTO rs_mara WHERE matnr = iv_matnr.',
    '  ENDMETHOD.',
    'ENDCLASS.',
    'CLASS lcl_step DEFINITION.',
    '  PUBLIC SECTION.',
    '    INTERFACES lif_step.',
    'ENDCLASS.',
    'CLASS lcl_step IMPLEMENTATION.',
    '  METHOD lif_step~process.',
    '    IF is_mara-lvorm = abap_true.',
    "      MESSAGE 'Material is flagged for deletion' TYPE 'E'.",
    '    ENDIF.',
    "    UPDATE mara SET mstae = '01' WHERE matnr = is_mara-matnr.",
    "    WRITE / 'blocked'.",
    '  ENDMETHOD.',
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  DATA lo_repo TYPE REF TO lif_repo.',
    '  DATA lo_step TYPE REF TO lif_step.',
    '  lo_repo = NEW lcl_repo( ).',
    '  lo_step = NEW lcl_step( ).',
    '  DATA(ls_mara) = lo_repo->load( p_matnr ).',
    '  lo_step->process( ls_mara ).',
  ].join('\n');
  const now = business(src, NEW).all.map((n) => n.name);
  expect(now.some((n) => /~/.test(n)), now.join(' | ')).toBe(false);
  expect(now.some((n) => /^Lif\b/i.test(n)), now.join(' | ')).toBe(false);
  const old = business(src, OLD).all.map((n) => n.name);
  expect(old.some((n) => /~/.test(n)), old.join(' | ')).toBe(true);
});

test('a handler registered on an object created in place (`SET HANDLER NEW lcl_x( )->on_y`) runs where the event is raised', () => {
  const src = [
    'REPORT zt_event.',
    'CLASS lcl_order DEFINITION.',
    '  PUBLIC SECTION.',
    '    EVENTS released.',
    '    METHODS release.',
    'ENDCLASS.',
    'CLASS lcl_mailer DEFINITION.',
    '  PUBLIC SECTION.',
    '    METHODS on_released FOR EVENT released OF lcl_order.',
    'ENDCLASS.',
    'CLASS lcl_order IMPLEMENTATION.',
    '  METHOD release.',
    "    UPDATE zt_order SET status = 'R'.",
    '    RAISE EVENT released.',
    '  ENDMETHOD.',
    'ENDCLASS.',
    'CLASS lcl_mailer IMPLEMENTATION.',
    '  METHOD on_released.',
    "    CALL FUNCTION 'Z_SEND_RELEASE_MAIL'.",
    '  ENDMETHOD.',
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  DATA(lo_order) = NEW lcl_order( ).',
    '  SET HANDLER NEW lcl_mailer( )->on_released FOR lo_order.',
    '  lo_order->release( ).',
  ].join('\n');
  const now = business(src, NEW);
  const old = business(src, OLD);
  const handled = (engine: string) => buildProcessSkeleton(src, { engineVersion: engine }).nodes
    .some((n) => n.expandsTo === 'method:LCL_MAILER=>ON_RELEASED');
  expect(handled(NEW)).toBe(true);
  // Where it runs: at the `RAISE EVENT` line inside `release`, after the update and before the method ends —
  // one handler step, not a detached step of its own.
  const skeleton = buildProcessSkeleton(src, { engineVersion: NEW });
  const handlers = skeleton.nodes.filter((n) => n.expandsTo === 'method:LCL_MAILER=>ON_RELEASED');
  expect(handlers).toHaveLength(1);
  const handler = handlers[0];
  expect(handler.anchor?.lineStart, 'the handler is not placed at the RAISE EVENT line').toBe(14);
  expect(handler.region).toBe('method:LCL_ORDER=>RELEASE');
  const update = skeleton.nodes.find((n) => n.kind === 'write' && n.label === 'ZT_ORDER')!;
  const end = skeleton.nodes.find((n) => n.kind === 'end' && n.region === 'method:LCL_ORDER=>RELEASE')!;
  expect(skeleton.edges.some((e) => e.from === update.id && e.to === handler.id), 'the update does not lead to the handler').toBe(true);
  expect(skeleton.edges.some((e) => e.from === handler.id && e.to === end.id), 'the handler does not lead on to the end of release').toBe(true);
  // 3.0.23 did not read the registration and kept the raise opaque.
  expect(handled(OLD)).toBe(false);
  expect(now.all.length).toBeGreaterThan(0);
  expect(old.all.length).toBeGreaterThan(0);
});

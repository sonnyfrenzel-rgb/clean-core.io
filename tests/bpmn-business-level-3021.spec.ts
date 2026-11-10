import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource, buildReadingExports } from '../lib/bpmn/export';
import { buildExportModel, GUARD_CHAIN_MIN } from '../lib/bpmn/model';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { readStatements } from '../lib/abap/statement-reader';
import { parseBpmn } from '../lib/process-map';

/**
 * Roadmap 3.0.21 — the reconstruction stays at the business level for class-based code (owner report of 22.10.2026:
 * a 937-line program with a rules class, about 496 executable statements, became 3.3 MB of BPMN — 1,680 shapes, 670
 * gateways — while the 1,000-line starter example gives about 100 shapes). Reproduced on a synthetic program written
 * here: a local class with 20 validation methods, each reading a table and checking 5–10 guards that log and leave,
 * called from several places. Two causes, both in `lib/bpmn/model.ts`: every guard IF with its RETURN became a gateway
 * and an end event, and every routine was copied in full at each of its call sites. From engine 3.0.21 a routine is
 * drawn once and a run of guards is one step. Server-free.
 */

function rulesSource(): string {
  const l: string[] = [
    'REPORT zfx_rules_class.',
    'TYPES: BEGIN OF ty_doc, id TYPE c LENGTH 10, amount TYPE p LENGTH 15 DECIMALS 2, kind TYPE c LENGTH 2, status TYPE c LENGTH 1, vendor TYPE c LENGTH 10, END OF ty_doc.',
    'TYPES: BEGIN OF ty_err, id TYPE c LENGTH 10, code TYPE c LENGTH 4, END OF ty_err.',
    'DATA: gt_docs TYPE STANDARD TABLE OF ty_doc WITH DEFAULT KEY, gs_doc TYPE ty_doc.',
    'CLASS lcl_rules DEFINITION.',
    '  PUBLIC SECTION.',
    '    DATA mt_errors TYPE STANDARD TABLE OF ty_err WITH DEFAULT KEY.',
  ];
  for (let m = 1; m <= 20; m++) l.push(`    METHODS check_${m} IMPORTING is_doc TYPE ty_doc.`);
  l.push('    METHODS validate_all IMPORTING is_doc TYPE ty_doc.', '    METHODS log_error IMPORTING iv_id TYPE c iv_code TYPE c.', 'ENDCLASS.');
  l.push('CLASS lcl_app DEFINITION.', '  PUBLIC SECTION.', '    CLASS-METHODS main.', '    CLASS-METHODS process_doc IMPORTING io_rules TYPE REF TO lcl_rules CHANGING cs_doc TYPE ty_doc.', 'ENDCLASS.');
  l.push('CLASS lcl_rules IMPLEMENTATION.');
  for (let m = 1; m <= 20; m++) {
    l.push(`  METHOD check_${m}.`, `    SELECT SINGLE status FROM zvendor_${m} INTO @DATA(lv_status) WHERE vendor = @is_doc-vendor.`);
    for (let g = 0; g < 5 + (m % 6); g++) {
      l.push(`    IF is_doc-amount > ${m * 100 + g} AND is_doc-kind = 'K${g}'.`, `      log_error( iv_id = is_doc-id iv_code = 'E${String(m).padStart(2, '0')}${g}' ).`, '      RETURN.', '    ENDIF.');
    }
    l.push('    IF is_doc-vendor IS INITIAL.', "      MESSAGE 'Vendor missing' TYPE 'W'.", '    ENDIF.', '  ENDMETHOD.');
  }
  l.push('  METHOD validate_all.');
  for (let m = 1; m <= 20; m++) l.push(`    check_${m}( is_doc ).`);
  l.push('  ENDMETHOD.', '  METHOD log_error.', '    APPEND VALUE #( id = iv_id code = iv_code ) TO mt_errors.', '  ENDMETHOD.', 'ENDCLASS.');
  l.push('CLASS lcl_app IMPLEMENTATION.', '  METHOD main.', '    DATA(lo_rules) = NEW lcl_rules( ).', '    SELECT * FROM zdocs INTO TABLE @gt_docs.', '    LOOP AT gt_docs INTO gs_doc.', '      process_doc( EXPORTING io_rules = lo_rules CHANGING cs_doc = gs_doc ).', '    ENDLOOP.', '    LOOP AT gt_docs INTO gs_doc.');
  for (const m of [2, 6, 10]) l.push(`      lo_rules->check_${m}( gs_doc ).`);
  l.push('    ENDLOOP.', '  ENDMETHOD.', '  METHOD process_doc.', '    io_rules->validate_all( cs_doc ).');
  for (const m of [1, 5, 9, 13]) l.push(`    io_rules->check_${m}( cs_doc ).`);
  l.push('    IF io_rules->mt_errors IS INITIAL.', "      cs_doc-status = 'A'.", '      MODIFY zdocs FROM cs_doc.', '    ENDIF.', '  ENDMETHOD.', 'ENDCLASS.', 'START-OF-SELECTION.', '  lcl_app=>main( ).');
  return l.join('\n');
}

const LEGACY = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter-examples-3.0.17', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'), 'utf8');

/** Statements that run: no declaration, no class or routine frame. */
function executable(source: string): number {
  return readStatements(source).filter((s) => !/^(?:REPORT|PROGRAM|DATA|TYPES|CONSTANTS|CLASS|ENDCLASS|METHODS|CLASS-METHODS|PUBLIC|PRIVATE|PROTECTED|METHOD|ENDMETHOD|FORM|ENDFORM|TABLES|PARAMETERS|SELECT-OPTIONS|SELECTION-SCREEN|FIELD-SYMBOLS|STATICS|INCLUDE)$/i.test(s.keyword)).length;
}

function shapesOf(source: string, engine: string) {
  const ex = buildBpmnExportFromSource(source, { processName: 'P', sourceFileName: 'P.abap', exporterVersion: engine });
  const count = (re: RegExp) => (ex.xml.match(re) ?? []).length;
  return { xml: ex.xml, shapes: count(/<bpmndi:BPMNShape /g), gateways: count(/<bpmn:exclusiveGateway /g), bytes: ex.xml.length, stats: ex.stats };
}

/** At the business level a map holds at most this many shapes per executable statement. */
const SHAPES_PER_STATEMENT = 0.35;

test('the class-based program explodes before 3.0.21 — the reproduction of the owner report', () => {
  const before = shapesOf(rulesSource(), '3.0.20');
  expect(before.shapes / executable(rulesSource())).toBeGreaterThan(0.7);
  expect(before.gateways).toBeGreaterThan(200);
});

test('from 3.0.21 the class-based program stays within the business-level bound, as the 1,000-line example does', () => {
  const src = rulesSource();
  const now = shapesOf(src, '3.0.21');
  const before = shapesOf(src, '3.0.20');
  expect(now.shapes / executable(src), `${now.shapes} shapes for ${executable(src)} statements`).toBeLessThanOrEqual(SHAPES_PER_STATEMENT);
  expect(now.gateways).toBeLessThan(before.gateways / 4);
  expect(now.bytes).toBeLessThan(before.bytes / 2);
  const legacy = shapesOf(LEGACY, '3.0.21');
  expect(legacy.shapes / executable(LEGACY)).toBeLessThanOrEqual(SHAPES_PER_STATEMENT);
  // The example has neither a run of guards nor a routine called twice that the business level collapses differently.
  expect(legacy.shapes).toBe(shapesOf(LEGACY, '3.0.20').shapes);
});

test('a run of guards is one business-rule task with every guard line, a decision and one early end', () => {
  const src = rulesSource();
  const model = buildExportModel(buildProcessSkeleton(src), { businessLevel: true });
  const plane = model.containers.find((c) => c.nodes.some((n) => n.technicalName.startsWith('SELECT ZVENDOR_3')))!;
  const task = plane.nodes.find((n) => n.tag === 'businessRuleTask' && n.source.detail?.collapsedGuards)!;
  // check_3: 5 + 3 % 6 = 8 guards; the last IF (a warning, no early exit) stays a decision of its own.
  expect(task.source.detail?.collapsedGuards).toBe(8);
  const lines = src.split('\n');
  for (const l of (task.source.detail?.guardLines as string[]).map(Number)) expect(lines[l - 1].trim()).toMatch(/^IF is_doc-amount > /);
  expect(task.anchorLabel).toMatch(/^L\d+(, L\d+){7}$/);
  const join = plane.nodes.find((n) => n.id === `${task.id.replace(/__checks$/, '')}__passed`)!;
  expect(join.tag).toBe('exclusiveGateway');
  const outs = plane.flows.filter((f) => f.sourceId === join.id);
  expect(outs).toHaveLength(2);
  const ends = plane.nodes.filter((n) => n.tag === 'endEvent' && n.source.detail?.early === true);
  expect(ends).toHaveLength(1);
  expect(outs.some((f) => f.targetId === ends[0].id && /is_doc-amount > 300/.test(f.condition))).toBe(true);
  // Every flow joins two nodes of the plane, and every node but the start is reached.
  const ids = new Set(plane.nodes.map((n) => n.id));
  for (const f of plane.flows) expect(ids.has(f.sourceId) && ids.has(f.targetId), f.id).toBe(true);
  for (const n of plane.nodes) if (n.tag !== 'startEvent') expect(n.incoming.length, n.id).toBeGreaterThan(0);
  expect(GUARD_CHAIN_MIN).toBe(2);
});

test('a routine called from several places is drawn once; its other call sites are calls to it', () => {
  const model = buildExportModel(buildProcessSkeleton(rulesSource()), { businessLevel: true });
  const all = model.containers.flatMap((c) => c.nodes);
  const planesOfCheck2 = all.filter((n) => n.inner && /CHECK_2$/.test(n.technicalName));
  expect(planesOfCheck2).toHaveLength(1);
  expect(all.filter((n) => n.fallback === 'drawn-once' && /CHECK_2$/.test(n.technicalName)).length).toBeGreaterThan(0);
  const copies = buildExportModel(buildProcessSkeleton(rulesSource()), {}).containers.flatMap((c) => c.nodes).filter((n) => n.inner && /CHECK_2$/.test(n.technicalName));
  expect(copies.length).toBeGreaterThan(1);
});

test('the business-level file is read back by the process map, plain names included', () => {
  const { bpmn, technical } = buildReadingExports(rulesSource(), { processName: 'Rules', sourceFileName: 'Z.abap', exporterVersion: '3.0.21' });
  for (const xml of [bpmn.xml, technical.xml]) {
    const parsed = parseBpmn(xml);
    expect(parsed.processName).toBe('Rules');
  }
  expect(bpmn.xml).toContain('name="8 checks"');
  expect(bpmn.xml).toContain('name="All checks passed?"');
});

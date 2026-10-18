import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as abaplint from '@abaplint/core';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readExampleAsOf3017 } from './helpers/starter-example-files';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { plainContext, stepName } from '../lib/abap/plain-language';
import { scoreBreakdown } from '../lib/clean-core-score';
import { scoreHeroModel } from '../lib/score-hero';
import { scoreRuleFor } from '../lib/score-rule';
import { accessPointsOf } from '../lib/transformation/access-layer';
import { abaplintConfig } from '../lib/transformation/abaplint-config';
import { prepareEngineLed, guardContextOf } from '../lib/transformation/engine-led';
import { bodyGuards } from '../lib/transformation/markers';
import { SAP_STUBS } from './helpers/abaplint-sap-stubs';
import { planOf } from './helpers/transformation-scaffold';

/**
 * Release 3.0.18 — the end-to-end check of every starter example (18.10.2026), engine defects E5–E9.
 *
 *   E5  Node: the lookup row of `SELECT SINGLE * FROM eban INTO gs_eban` held only the components the reading routine
 *       names; the program reads MATNR, WERKS, FLIEF, KOSTL, AFNAM and FRGKZ of the global work area elsewhere, and a
 *       request that sent them was refused as "not a component of EBAN" (scaffold version 17).
 *   E6  A BAPI SAP lists as a classic API, not released for ABAP Cloud, raised no finding: the sales-order example came
 *       out "No legacy pattern was detected" on an ABAP Cloud route (engine 3.0.18).
 *   E7  OPEN/READ/TRANSFER/CLOSE DATASET had no detector — a coverage gap only — and the RAP package could not
 *       activate (engine 3.0.18; the access layer's file method, scaffold version 17).
 *   E8  Findings inside FORMs nothing calls stood unmarked: 19 of the 1,000-line example's 45 (engine 3.0.18).
 *   E9  `MODIFY gt_stock FROM gs_stock` read "Gt stock" in the Business view.
 *
 * The engine changes are gated: a run of engine 3.0.17 rebuilds to what it signed. Server-free.
 */

const ROOT = path.join(__dirname, '..');
const example = (name: string) =>
  fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', name), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const NEW = 'v3.0.18';
const OLD = 'v3.0.17';

test.describe('E6: a classic API on the ABAP Cloud route', () => {
  const src = "REPORT z_so.\nDATA lv TYPE c LENGTH 10.\nSTART-OF-SELECTION.\n  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'\n    EXPORTING order_header_in = lv\n    IMPORTING salesdocument = lv.\n";

  test('is a finding from engine 3.0.18, and the route no longer says no legacy pattern was found', () => {
    const e = buildAbapEvidence(src, 'z_so.abap', 'private', undefined, NEW);
    const f = e.findings.filter((x) => x.kind === 'classic-api');
    expect(f.map((x) => `${x.objectName}@${x.lineStart}`)).toEqual(['BAPI_SALESORDER_CREATEFROMDAT2@4']);
    expect(f[0].technicalDetail).toContain('classicAPI');
    const r = routeExtensibility(e, 'private', NEW);
    expect(r.rationale).not.toContain('No legacy pattern was detected');
    expect(r.rationale).toContain('BAPI_SALESORDER_CREATEFROMDAT2 is a classic API SAP does not release for ABAP Cloud');
    // Level B (SAP Note 3578329): no score points.
    expect(r.cleanCoreScore).toBe(routeExtensibility(buildAbapEvidence(src, 'z_so.abap', 'private', undefined, OLD), 'private', OLD).cleanCoreScore);
  });

  test('the sales-order starter example carries it', () => {
    const e = buildAbapEvidence(example('Z_SALES_ORDER_CREATOR.txt'), 'Z_SALES_ORDER_CREATOR.txt', 'private', undefined, NEW);
    expect(e.findings.map((f) => `${f.kind}:${f.objectName}`)).toContain('classic-api:BAPI_SALESORDER_CREATEFROMDAT2');
  });

  test('a call another finding of the line names is not said twice', () => {
    const gui = "REPORT z_up.\nDATA lt TYPE string_table.\nSTART-OF-SELECTION.\n  CALL FUNCTION 'GUI_UPLOAD'\n    EXPORTING filename = 'c'\n    TABLES data_tab = lt.\n";
    const e = buildAbapEvidence(gui, 'z_up.abap', 'private', undefined, NEW);
    expect(e.findings.filter((f) => f.lineStart === 4).map((f) => f.kind)).toEqual(['gui-download']);
  });

  test('a run of engine 3.0.17 keeps what it signed', () => {
    const e = buildAbapEvidence(src, 'z_so.abap', 'private', undefined, OLD);
    expect(e.findings).toEqual([]);
    expect(routeExtensibility(e, 'private', OLD).rationale).toContain('No legacy pattern was detected');
  });
});

test.describe('E7: a file on the application server', () => {
  const src = example('Z_INVOICE_EXTRACTOR.txt');

  test('is a finding from engine 3.0.18, costs points, and the coverage gap is gone', () => {
    const e = buildAbapEvidence(src, 'Z_INVOICE_EXTRACTOR.txt', 'private', undefined, NEW);
    const files = e.findings.filter((f) => f.kind === 'dataset-io');
    expect(files.map((f) => f.lineStart)).toEqual([58, 64, 82]);
    expect(files[0].technicalDetail).toContain('(P_FILE)');
    // The file operand is the program's data object, not an SAP object a level could grade.
    expect(files.every((f) => f.objectName === undefined)).toBe(true);
    expect(e.coverage?.unassessed.some((u) => u.gap === 'file-io')).toBe(false);
    const r = routeExtensibility(e, 'private', NEW);
    expect(r.rationale).toContain("ABAP Cloud has no access to the application server's file system");
    const b = scoreBreakdown(e.findings, e.coverage?.gaps.length ?? 0, scoreRuleFor('private', NEW));
    expect(b.lines.find((l) => l.kind === 'dataset-io')).toMatchObject({ count: 3, points: 9 });
    expect(r.cleanCoreScore).toBe(83);
  });

  test('a run of engine 3.0.17 keeps the gap and its score', () => {
    const e = buildAbapEvidence(src, 'Z_INVOICE_EXTRACTOR.txt', 'private', undefined, OLD);
    expect(e.findings.some((f) => (f.kind as string) === 'dataset-io')).toBe(false);
    expect(e.coverage?.unassessed.filter((u) => u.gap === 'file-io').map((u) => u.line)).toEqual([58, 64, 82, 85]);
    expect(routeExtensibility(e, 'private', OLD).cleanCoreScore).toBe(87);
  });

  test('RAP: the access layer has a method for the file, and it activates', () => {
    const prep = prepareEngineLed({ source: src, track: 'rap', program: 'Z_INVOICE_EXTRACTOR', decisions: [], contextText: '' });
    if (!prep.ok) throw new Error(prep.reason);
    const points = accessPointsOf(planOf(src).facts, { customerWrites: true, files: true }).points.filter((p) => p.kind === 'file');
    expect(points.map((p) => `${p.method}:${p.file}:${p.lines.join(',')}`)).toEqual(['write_file_p_file:write:58,64,82,85']);
    const intf = prep.scaffold.files.find((f) => f.path.endsWith('_access.intf.abap'))!.content;
    expect(intf).toMatch(/METHODS write_file_p_file\n\s+IMPORTING\n\s+it_lines TYPE string_table\n\s+RAISING/);
    const config = abaplintConfig();
    const registry = new abaplint.Registry(new abaplint.Config(JSON.stringify({ ...config, rules: { ...config.rules, check_syntax: true } })));
    registry.addDependencies(Object.entries(SAP_STUBS).map(([name, content]) => new abaplint.MemoryFile(name, content)));
    for (const f of prep.scaffold.files) if (f.path.startsWith('src/')) registry.addFile(new abaplint.MemoryFile(f.path.slice(4), f.content));
    registry.parse();
    const issues = registry.findIssues().filter((i) => /_access\./.test(i.getFilename()) && (i.getKey() === 'parser_error' || i.getKey() === 'check_syntax'));
    expect(issues.map((i) => `${i.getFilename()}:${i.getStart().getRow()} ${i.getMessage()}`)).toEqual([]);
  });

  test('RAP: a body with a DATASET statement is refused, naming the method', () => {
    const prep = prepareEngineLed({ source: src, track: 'rap', program: 'Z_INVOICE_EXTRACTOR', decisions: [], contextText: '' });
    if (!prep.ok) throw new Error(prep.reason);
    const unit = prep.plan.units.find((u) => u.abap.some((r) => r.lineStart <= 58 && r.lineEnd >= 58) && u.kind === 'routine')!;
    const refusals = bodyGuards('OPEN DATASET p_file FOR OUTPUT IN TEXT MODE ENCODING DEFAULT.\nTRANSFER gv_csv_line TO p_file.\nCLOSE DATASET p_file.', guardContextOf(prep, unit.id));
    const file = refusals.find((r) => r.code === 'cloud-statement' && /application server files/.test(r.message));
    expect(file?.message).toContain('write_file_');
  });
});

test.describe('E8: findings inside routines nothing calls', () => {
  const src = [
    'REPORT z_dead.',
    'DATA lv TYPE i.',
    'START-OF-SELECTION.',
    '  PERFORM live.',
    'FORM live.',
    '  SELECT SINGLE vbeln FROM vbak INTO @DATA(lv_v) WHERE vbeln = @space.',
    'ENDFORM.',
    'FORM dead.',
    '  EXEC SQL.',
    '    DELETE FROM zlog',
    '  ENDEXEC.',
    '  SELECT SINGLE matnr FROM mara INTO @DATA(lv_m) WHERE matnr = @space.',
    'ENDFORM.',
    '',
  ].join('\n');

  test('are marked from engine 3.0.18, and still charged', () => {
    const e = buildAbapEvidence(src, 'z_dead.abap', 'private', undefined, NEW);
    const marked = e.findings.filter((f) => f.uncalled).map((f) => `${f.kind}@${f.lineStart}:${f.uncalled!.routine}`);
    expect(marked).toEqual(expect.arrayContaining(['native-sql@9:DEAD', 'standard-table-read@12:DEAD']));
    expect(e.findings.find((f) => f.lineStart === 6)?.uncalled).toBeUndefined();
    const old = buildAbapEvidence(src, 'z_dead.abap', 'private', undefined, OLD);
    expect(old.findings.some((f) => 'uncalled' in f)).toBe(false);
    // Charged all the same (SD review CR-A6), and the score table says why no run reaches them.
    expect(routeExtensibility(e, 'private', NEW).cleanCoreScore).toBe(routeExtensibility(old, 'private', OLD).cleanCoreScore);
    const rule = scoreRuleFor('private', NEW);
    const hero = scoreHeroModel(scoreBreakdown(e.findings, 0, rule), e.findings, [], rule);
    expect(hero.deductions.find((d) => d.kind === 'native-sql')?.unreachable).toEqual({ lines: [9], gates: [], routines: ['DEAD'] });
    expect(hero.deductions.find((d) => d.kind === 'standard-table-read')?.unreachable?.lines).toEqual([12]);
  });

  test('a computed PERFORM leaves reachability unproven: nothing is marked', () => {
    const dynamic = src.replace('  PERFORM live.', "  PERFORM live.\n  PERFORM (lv_name) IN PROGRAM z_dead.");
    const e = buildAbapEvidence(dynamic, 'z_dead.abap', 'private', undefined, NEW);
    expect(e.findings.filter((f) => f.uncalled)).toEqual([]);
  });

  test('the 1,000-line example: the uncalled FORMs are named, the dialog modules are not guessed at', () => {
    // The 3.0.17 copy: 3.0.18 took the example's dead routines out (tests/helpers/starter-example-files.ts).
    const e = buildAbapEvidence(readExampleAsOf3017('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap').replace(/^﻿/, '').replace(/\r\n/g, '\n'), 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'private', undefined, NEW);
    const marked = e.findings.filter((f) => f.uncalled);
    expect(marked.length).toBe(19);
    expect(new Set(marked.map((f) => f.uncalled!.routine))).toContain('LEGACY_NATIVE_SQL_EXAMPLE');
    // The MODULEs a screen's flow logic calls are not in the source: not marked.
    expect(e.findings.filter((f) => f.kind === 'dynpro' && !f.uncalled).map((f) => f.lineStart)).toEqual([673, 678]);
  });
});

test.describe('E9: a change to an internal table in the Business view', () => {
  test('reads as a change of the list, not as the table name', () => {
    const src = example('Z_MATERIAL_STOCK_CALC.txt');
    const sk = buildProcessSkeleton(src);
    const node = sk.nodes.find((n) => n.detail?.internalTable === true && n.label === 'GT_STOCK')!;
    expect(stepName(node, plainContext(src))).toBe('Update the stock in the list');
    const del = { ...node, detail: { ...node.detail, operation: 'DELETE' } };
    expect(stepName(del, plainContext(src))).toBe('Remove the stock from the list');
  });
});

test.describe('E5: the lookup row of a global work area (Node)', () => {
  const src = [
    'REPORT z_wa.',
    'PARAMETERS p_banfn TYPE eban-banfn.',
    'DATA gs_eban TYPE eban.',
    'START-OF-SELECTION.',
    '  PERFORM read_req.',
    '  PERFORM check_req.',
    '  PERFORM other.',
    '  PERFORM elsewhere.',
    'FORM read_req.',
    '  SELECT SINGLE * FROM eban INTO gs_eban WHERE banfn = p_banfn.',
    '  IF gs_eban-menge > 0.',
    '    WRITE gs_eban-menge.',
    '  ENDIF.',
    'ENDFORM.',
    'FORM check_req.',
    '  DATA ls_local TYPE eban.',
    '  IF gs_eban-matnr IS INITIAL OR gs_eban-werks = space.',
    "    MESSAGE 'no material' TYPE 'E'.",
    '  ENDIF.',
    'ENDFORM.',
    'FORM other.',
    '  DATA ls_row TYPE mara.',
    '  SELECT SINGLE * FROM mara INTO ls_row WHERE matnr = p_banfn.',
    '  IF ls_row-mtart = space.',
    '    RETURN.',
    '  ENDIF.',
    'ENDFORM.',
    'FORM elsewhere.',
    '  DATA ls_row TYPE mara.',
    '  IF ls_row-matkl = space.',
    '    RETURN.',
    '  ENDIF.',
    'ENDFORM.',
    '',
  ].join('\n');

  const columnsOf = (contract: string, table: string) => {
    const at = contract.indexOf(`original: "${table}", table: "${table}"`);
    expect(at, table).toBeGreaterThan(-1);
    const block = contract.slice(at, contract.indexOf(']', at));
    return [...block.matchAll(/\{ original: "(\w+)"/g)].map((m) => m[1]);
  };

  test('every component the program reads from it is a column; a local work area keeps its routine', () => {
    const prep = prepareEngineLed({ source: src, track: 'node', program: 'Z_WA', decisions: [], contextText: '' });
    if (!prep.ok) throw new Error(prep.reason);
    const contract = prep.scaffold.files.find((f) => f.path.endsWith('input-contract.ts'))!.content;
    expect(columnsOf(contract, 'EBAN')).toEqual(expect.arrayContaining(['BANFN', 'MENGE', 'MATNR', 'WERKS']));
    const mara = columnsOf(contract, 'MARA');
    expect(mara).toEqual(expect.arrayContaining(['MATNR', 'MTART']));
    expect(mara).not.toContain('MATKL');
  });

  test('the purchase-requisition starter example: EBAN carries what check_requisition reads', () => {
    test.setTimeout(120_000);
    const prep = prepareEngineLed({ source: example('Z_MM_PO_APPROVAL.abap'), track: 'node', program: 'Z_MM_PO_APPROVAL', decisions: [], contextText: '' });
    if (!prep.ok) throw new Error(prep.reason);
    const contract = prep.scaffold.files.find((f) => f.path.endsWith('input-contract.ts'))!.content;
    expect(columnsOf(contract, 'EBAN')).toEqual(expect.arrayContaining(['MATNR', 'WERKS', 'FLIEF', 'KOSTL', 'AFNAM', 'FRGKZ']));
  });
});

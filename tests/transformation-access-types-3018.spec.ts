import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildRapScaffold } from '../lib/transformation';
import { abapCheck } from '../lib/transformation/abap-check';
import { ABAPLINT_RULES } from '../lib/transformation/abaplint-config';
import { hoistAccessTypes } from '../lib/transformation/access-types';
import { fixture, planOf, poDemo, ROOT } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.18 item 13, the PM trial of 18.10.2026: the types the access interface needs live in the interface,
 * so interface and logic class form no activation cycle. Before, the interface typed its parameters by the logic
 * class (`data_tab TYPE zcl_x_logic=>tt_csv`, `is_selection TYPE zcl_x_logic=>ty_run_selection`) while the logic
 * class held `mo_access TYPE REF TO zif_x_access` — abaplint's `cyclic_oo` named that cycle on the SD, PM and QM
 * packages of the 3.0.17 acceptance. Server-free.
 */

/** The PM shape (not the program): a CSV table type of its own handed to GUI_DOWNLOAD, a read with the selection. */
const PM_SHAPE = [
  'REPORT zpm_slot_shape.',
  'TYPES tt_csv TYPE STANDARD TABLE OF string WITH DEFAULT KEY.',
  'TYPES: BEGIN OF ty_slot,',
  '         aufnr TYPE c LENGTH 12,',
  '         hours TYPE p LENGTH 8 DECIMALS 2,',
  '       END OF ty_slot.',
  'DATA: gt_csv   TYPE tt_csv,',
  '      gt_slots TYPE STANDARD TABLE OF ty_slot.',
  "PARAMETERS: p_werks TYPE c LENGTH 4 DEFAULT '1000',",
  "            p_file  TYPE string DEFAULT 'slots.csv'.",
  'START-OF-SELECTION.',
  '  PERFORM read_slots.',
  '  PERFORM build_csv.',
  '  PERFORM download.',
  'FORM read_slots.',
  '  SELECT aufnr FROM aufk INTO CORRESPONDING FIELDS OF TABLE gt_slots WHERE werks = p_werks.',
  'ENDFORM.',
  'FORM build_csv.',
  '  DATA ls_slot TYPE ty_slot.',
  '  LOOP AT gt_slots INTO ls_slot.',
  '    APPEND |{ ls_slot-aufnr };{ ls_slot-hours }| TO gt_csv.',
  '  ENDLOOP.',
  'ENDFORM.',
  'FORM download.',
  "  CALL FUNCTION 'GUI_DOWNLOAD'",
  '    EXPORTING',
  '      filename = p_file',
  "      filetype = 'ASC'",
  '    TABLES',
  '      data_tab = gt_csv',
  '    EXCEPTIONS',
  '      OTHERS   = 1.',
  '  IF sy-subrc <> 0.',
  "    MESSAGE 'Download failed' TYPE 'E'.",
  '  ENDIF.',
  'ENDFORM.',
  '',
].join('\n');

const scaffoldOf = (source: string) => {
  const { facts, plan } = planOf(source);
  return buildRapScaffold(plan, facts);
};
const cyclesOf = (files: ReadonlyArray<{ path: string; content: string }>) => {
  const r = abapCheck(files);
  if (!r.ran) throw new Error(r.reason);
  return r.findings.filter((f) => f.rule === 'cyclic_oo');
};

test('the shipped abaplint configuration names a cycle between global classes and interfaces', () => {
  expect(ABAPLINT_RULES.cyclic_oo).toBe(true);
});

test('PM shape: the interface declares the CSV type and the selection it takes; the logic class aliases them, no cycle', () => {
  const s = scaffoldOf(PM_SHAPE);
  const intf = s.files.find((f) => f.path.endsWith('_access.intf.abap'))!;
  const logic = s.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!;
  expect(intf, 'the shape has an access layer').toBeTruthy();
  const logicName = path.basename(logic.path).split('.')[0];
  const intfName = path.basename(intf.path).split('.')[0];
  // The interface names nothing of the logic class.
  expect(intf.content).not.toMatch(new RegExp(`${logicName}=>`, 'i'));
  expect(intf.content).toMatch(/^\s+TYPES tt_csv TYPE STANDARD TABLE OF string WITH DEFAULT KEY\./im);
  expect(intf.content).toMatch(/^\s+TYPES BEGIN OF ty_run_selection\./im);
  expect(intf.content).toMatch(new RegExp(`data_tab TYPE ${intfName}=>tt_csv`, 'i'));
  // The logic class keeps the names: every body, test and caller reads the same types.
  expect(logic.content).toMatch(new RegExp(`TYPES tt_csv TYPE ${intfName}=>tt_csv\\.`, 'i'));
  expect(logic.content).toMatch(new RegExp(`TYPES ty_run_selection TYPE ${intfName}=>ty_run_selection\\.`, 'i'));
  expect(logic.content).not.toMatch(/TYPES BEGIN OF ty_run_selection/i);
  // abaplint with the shipped rules: no cycle, and still activatable.
  expect(cyclesOf(s.files)).toEqual([]);
  const r = abapCheck(s.files);
  expect(r.ran && r.activation.activatable, JSON.stringify(r.ran && r.activation.findings.filter((f) => f.kind !== 'lint').slice(0, 5))).toBe(true);
});

test('without the hoist the same shape is a cycle (the reproduction)', () => {
  const s = scaffoldOf(PM_SHAPE);
  const intf = s.files.find((f) => f.path.endsWith('_access.intf.abap'))!;
  const logic = s.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!;
  const logicName = path.basename(logic.path).split('.')[0];
  const intfName = path.basename(intf.path).split('.')[0];
  // Put the 3.0.17 interface back: the parameter types by the logic class, no types of its own.
  const old = intf.content
    .split('\n')
    .filter((l) => !/^\s+(?:TYPES|")/.test(l))
    .join('\n')
    .replace(new RegExp(`${intfName}=>`, 'gi'), `${logicName}=>`);
  const files = s.files.map((f) => (f === intf ? { ...f, content: old } : f));
  expect(cyclesOf(files).map((f) => f.message).join(' ')).toMatch(/Cyclic definition\/usage/);
});

test('a moved type takes what it reads; a constant it reads is copied, not moved', () => {
  const block = [
    "    \" The original's types, as it declares them.",
    '    TYPES ty_len TYPE i.',
    '    TYPES BEGIN OF ty_row.',
    '    TYPES qty TYPE ty_len.',
    '    TYPES code TYPE c LENGTH 4.',
    '    TYPES END OF ty_row.',
    '    TYPES tt_rows TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.',
    '    TYPES ty_other TYPE string.',
    "    \" The original's constants.",
    "    CONSTANTS gc_max TYPE ty_len VALUE 9.",
    '    TYPES BEGIN OF ty_run_selection.',
    '    TYPES p_max TYPE ty_len.',
    '    TYPES END OF ty_run_selection.',
  ];
  const h = hoistAccessTypes(block, ['tt_rows', 'ty_run_selection', 'nothing_like_it'], 'zif_x_access');
  expect(h.moved).toEqual(['ty_len', 'ty_row', 'tt_rows', 'ty_run_selection']);
  expect(h.classTypes).toContain('    TYPES ty_other TYPE string.');
  expect(h.classTypes).toContain('    TYPES ty_row TYPE zif_x_access=>ty_row.');
  expect(h.classTypes.join('\n')).not.toMatch(/TYPES qty|BEGIN OF ty_row/);
  expect(h.classTypes).toContain("    CONSTANTS gc_max TYPE ty_len VALUE 9.");
  expect(h.interfaceTypes.slice(2)).toEqual([
    '  TYPES ty_len TYPE i.',
    '  TYPES BEGIN OF ty_row.',
    '  TYPES qty TYPE ty_len.',
    '  TYPES code TYPE c LENGTH 4.',
    '  TYPES END OF ty_row.',
    '  TYPES tt_rows TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.',
    '  TYPES BEGIN OF ty_run_selection.',
    '  TYPES p_max TYPE ty_len.',
    '  TYPES END OF ty_run_selection.',
  ]);
  // Nothing needed: nothing moves.
  expect(hoistAccessTypes(block, [], 'zif_x_access')).toEqual({ classTypes: block, interfaceTypes: [], moved: [] });
  // A constant a moved type reads travels with it as a copy.
  const withConst = hoistAccessTypes(['    CONSTANTS gc_len TYPE i VALUE 4.', '    TYPES ty_code TYPE c LENGTH gc_len.'], ['ty_code'], 'zif_x_access');
  expect(withConst.interfaceTypes.slice(2)).toEqual(['  CONSTANTS gc_len TYPE i VALUE 4.', '  TYPES ty_code TYPE c LENGTH gc_len.']);
  expect(withConst.classTypes).toContain('    CONSTANTS gc_len TYPE i VALUE 4.');
});

test('no shipped starter example and no fixture shape has a cycle between interface and logic class', () => {
  const starters = fs
    .readdirSync(path.join(ROOT, 'public', 'starter-examples'))
    .filter((f) => /\.(?:abap|txt)$/i.test(f))
    .map((f) => [f, fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', f), 'utf8')] as const);
  const shapes = (['co-shape', 'pp-shape', 'sd-shape'] as const).map((n) => [n, fixture(n)] as const);
  let withAccess = 0;
  for (const [name, source] of [...starters, ...shapes, ['po', poDemo()] as const, ['pm-shape', PM_SHAPE] as const]) {
    const s = scaffoldOf(source);
    const intf = s.files.find((f) => f.path.endsWith('_access.intf.abap'));
    if (!intf) continue;
    withAccess++;
    const logic = s.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!;
    expect(intf.content, name).not.toMatch(new RegExp(`${path.basename(logic.path).split('.')[0]}=>`, 'i'));
    expect(cyclesOf(s.files), name).toEqual([]);
  }
  expect(withAccess).toBeGreaterThan(3);
});

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readSource } from '../lib/engine4/index';
import { references } from '../lib/engine4/references';
import { gradeReferences } from '../lib/engine4/graded';
import { CLOUDIFICATION_META, SAP_TYPE_GROUPS, isSapFunctionModule, sapFacts, typeGroupOf } from '../lib/knowledge/index';
import { runKnowledgeShadow } from '../scripts/engine4/shadow-knowledge';
import { shadowCorpus } from '../scripts/engine4/shadow';

/**
 * The knowledge tree (`lib/knowledge/`, ADR-133 (2)) and the graded reference table (`lib/engine4/graded.ts`).
 * Facts only — no A–D letter enters either. Server-free.
 */
test('the knowledge tree carries the meta of every file it reads', () => {
  expect(CLOUDIFICATION_META.map((m) => m.release)).toEqual(['latest', 'classifications-sap']);
  for (const m of CLOUDIFICATION_META) expect(m.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
});

test('facts: release state before classification, customer and namespaced names', () => {
  const salv = sapFacts('cl_salv_table');
  expect(salv.listed).toBe(true);
  expect(sapFacts('ZCL_MINE')).toMatchObject({ listed: false, isCustomerObject: true, isSapObject: false });
  expect(sapFacts('/ACME/NOTHING')).toMatchObject({ listed: false, isCustomerObject: false, isSapObject: false });
  expect(sapFacts('CL_SURELY_NOT_IN_ANY_FILE_X')).toMatchObject({ listed: false, isSapObject: true });
  expect(isSapFunctionModule('BAPI_PO_CREATE1')).toBe(true);
  expect(isSapFunctionModule('BAPI_TRANSACTION_COMMIT')).toBe(false); // not on SAP's classic-BAPI list
  expect(typeGroupOf('slis_fieldcat_alv')).toBe('SLIS');
});

test('the type groups are the shipping engine\'s list, name for name', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'lib', 'abap', 'table-dependencies.ts'), 'utf8');
  const m = /const KNOWN_TYPE_GROUPS = \[([\s\S]*?)\]/.exec(text);
  expect(m).not.toBeNull();
  expect([...m![1].matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1])).toEqual([...SAP_TYPE_GROUPS]);
});

test('graded references: standing from the facts, defined names left out, open names unknown', () => {
  const src = [
    'REPORT z.', 'DATA go TYPE REF TO cl_gui_alv_grid.', 'DATA lo TYPE REF TO zcl_mine.', 'DATA lv TYPE funcname.',
    "CALL FUNCTION 'BAPI_PO_CREATE1'.", 'CALL FUNCTION lv.', 'CLASS lcl DEFINITION. ENDCLASS.', 'DATA lc TYPE REF TO lcl.',
  ].join('\n');
  const r = readSource(src);
  const graded = gradeReferences(references(r.statements, r.tree));
  const by = (row: number) => graded.filter((g) => g.row === row).map((g) => `${g.name ?? '?'} ${g.standing}`);
  expect(by(3)).toEqual(['ZCL_MINE customer']);
  expect(by(5)).toEqual(['BAPI_PO_CREATE1 classicApi']);
  expect(by(6)).toEqual(['? unknown']);
  expect(by(8)).toEqual([]);
});

test('shadow: the knowledge tree reads the facts today\'s catalog reads, for every reference of the corpus', () => {
  test.setTimeout(300_000);
  const r = runKnowledgeShadow(shadowCorpus());
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.factsCompared).toBeGreaterThanOrEqual(4800);
  expect(r.mismatches).toEqual([]);
  expect(r.factsIdentical).toBe(r.factsCompared);
  // Each standing maps to one level of today's rule (deprecated with a successor is C, without one D).
  expect(Object.keys(r.standingByLevel.released ?? {})).toEqual(['A']);
  expect(Object.keys(r.standingByLevel.classicApi ?? {})).toEqual(['B']);
  expect(Object.keys(r.standingByLevel.unlisted ?? {})).toEqual(['C']);
  expect(Object.keys(r.standingByLevel.customer ?? {})).toEqual(['Unknown']);
});

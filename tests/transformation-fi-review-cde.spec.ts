import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards } from '../lib/transformation/markers';
import { buildRapScaffold } from '../lib/transformation';
import { traceMarkdown, traceOf } from '../lib/transformation/trace';
import { ABAP_UNIT_EVIDENCE_LINE, abapTestEvidence, abapTestEvidenceSentences, placeModelTestClasses } from '../lib/testing-abap-unit';
import { planOf } from './helpers/transformation-scaffold';

/**
 * FI holdout review of 18.10.2026, C–E, and the owner decision of the same day on the testing model's class (roadmap
 * 3.0.17), reproduced on synthetic programs — the holdout is not in the repository. Server-free.
 */

const GM_FIXTURE = path.join(__dirname, 'fixtures', 'golden-master', 'three-cases.abap');

function prep(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'rap', program: 'Z_TEST', decisions: [], contextText: '' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

/** A routine long enough to be split into parts, with two locals every part shares. */
function longRoutine(): string {
  const lines = [
    'REPORT zfx_split.',
    'TYPES: BEGIN OF ty_co, bukrs TYPE c LENGTH 4, currency TYPE c LENGTH 5, END OF ty_co.',
    'TYPES: BEGIN OF ty_po, high_limit TYPE p LENGTH 8 DECIMALS 2, END OF ty_po.',
    'DATA: gv_total TYPE p LENGTH 12 DECIMALS 2.',
    "PARAMETERS: p_bukrs TYPE c LENGTH 4 DEFAULT '1000'.",
    'START-OF-SELECTION.',
    '  PERFORM evaluate.',
    'FORM evaluate.',
    '  DATA: ls_c TYPE ty_co,',
    '        ls_p TYPE ty_po.',
    '  ls_c-bukrs = p_bukrs.',
  ];
  for (let i = 0; i < 900; i++) {
    lines.push(`  IF ls_c-bukrs = '${String(1000 + i)}'.`, `    ls_p-high_limit = ls_p-high_limit + ${i}.`, `    gv_total = gv_total + ls_p-high_limit.`, '  ENDIF.');
  }
  lines.push('ENDFORM.');
  return lines.join('\n');
}

test('C: a part of a split routine uses the parent locals it is handed under their names — an invented name is refused with the valid ones', () => {
  const p = prep(longRoutine());
  const parts = p.plan.units.filter((u) => u.part);
  expect(parts.length, 'the routine is split into parts').toBeGreaterThan(1);
  const ctx = guardContextOf(p, parts[1].id);
  expect(ctx.abap?.localComponents).toEqual(['ls_c', 'ls_p']);
  // Since scaffold version 21 (3.0.20) the frame hands them over as CHANGING parameters under their own names.
  expect(ctx.abap?.handedLocals).toEqual(['ls_c', 'ls_p']);
  const invented = bodyGuards("cs_local-ls_company-currency = 'EUR'.\nIF cs_local-ls_policy-high_limit > 0.\n  gv_total = 1.\nENDIF.", ctx);
  const refusal = invented.find((r) => r.message.startsWith('names cs_local, which this method does not have'));
  expect(refusal, JSON.stringify(invented)).toBeDefined();
  expect(refusal!.message).toContain('cs_local-ls_company, cs_local-ls_policy');
  expect(refusal!.message).toContain('under their own names: ls_c, ls_p');
  const right = bodyGuards("ls_c-currency = 'EUR'.\nls_p-high_limit = 1.", ctx);
  expect(right.filter((r) => /parent routine|cs_local/.test(r.message))).toEqual([]);
  // A body that declares a handed local again would shadow the parent's: refused.
  expect(bodyGuards("DATA ls_c TYPE string.\nls_c = 'x'.", ctx).some((r) => r.message.startsWith("declares the parent routine's locals again: ls_c"))).toBe(true);
});

test('D: the main path loads the run\'s input once, where the original runs its demo data; no other body calls load_input', () => {
  const p = prep(fs.readFileSync(GM_FIXTURE, 'utf8'));
  const main = p.plan.units.find((u) => u.kind === 'orchestrator')!;
  const ctx = guardContextOf(p, main.id);
  expect(ctx.abap?.loadInput).toBe('once');
  const twice = bodyGuards("load_input( ).\ngv_sealed = 'X'.\nload_input( ).\ncredit( ).", ctx);
  expect(twice.map((r) => r.message)).toContainEqual(expect.stringContaining('calls load_input( ) 2 times — call it once'));
  expect(bodyGuards('credit( ).', ctx).map((r) => r.message)).toContainEqual(expect.stringContaining('does not call load_input( )'));
  expect(bodyGuards("gv_sealed = 'X'.\nload_input( ).\ncredit( ).", ctx).filter((r) => /load_input/.test(r.message))).toEqual([]);
  // A routine of its own (credit, long enough not to be folded into the main path) may not load the input.
  const p2 = prep(fs.readFileSync(GM_FIXTURE, 'utf8').replace(/(\r?\n  DATA lv_amount TYPE p LENGTH 8 DECIMALS 2\.)/, `$1${'\n  lv_amount = lv_amount + 1.'.repeat(14)}`));
  const routine = p2.plan.units.find((u) => u.kind !== 'orchestrator' && u.kind !== 'fixture' && !!guardContextOf(p2, u.id).abap)!;
  expect(routine, JSON.stringify(p2.plan.units.map((u) => [u.id, u.kind, u.routine]))).toBeDefined();
  const rctx = guardContextOf(p2, routine.id);
  expect(rctx.abap?.loadInput).toBe('never');
  expect(bodyGuards('load_input( ).', rctx).map((r) => r.message)).toContainEqual(expect.stringContaining("only the main path loads the run's input"));
  // The fill prompt says the same.
  expect(fs.readFileSync(path.join(__dirname, '..', 'lib', 'transformation', 'fill-prompt.ts'), 'utf8')).toContain('call load_input( ) once if the class lists it');
});

test('E: run( ) starts every run from the initial state — every attribute the run returns is cleared first', () => {
  const { facts, plan } = planOf(fs.readFileSync(GM_FIXTURE, 'utf8'));
  const scaffold = buildRapScaffold(plan, facts);
  const logic = scaffold.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!.content;
  const run = /METHOD run\.([\s\S]*?)ENDMETHOD\./.exec(logic)![1];
  const returned = [...run.matchAll(/rs_result-(\w+) = \1\./g)].map((m) => m[1]);
  expect(returned.length).toBeGreaterThan(2);
  const cleared = [...run.matchAll(/CLEAR: ([\w, ]+)\./g)].flatMap((m) => m[1].split(/,\s*/));
  for (const g of returned) expect(cleared, g).toContain(g);
  expect(run.indexOf('CLEAR: ')).toBeLessThan(run.indexOf('TRY.'));
});

test('owner 18.10.2026: the testing model\'s class is a proposal, counted apart from the engine\'s classes in STATUS, TRACE and its header', () => {
  const { facts, plan } = planOf(fs.readFileSync(GM_FIXTURE, 'utf8'));
  const scaffold = buildRapScaffold(plan, facts);
  const logic = /CLASS (zcl_\w+_logic) DEFINITION/.exec(scaffold.files.map((f) => f.content).join('\n'))![1];
  const model = [
    'CLASS ltcl_test DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
    '  PRIVATE SECTION.',
    '    METHODS tc_eng_09_state_stopped FOR TESTING.',
    'ENDCLASS.',
    'CLASS ltcl_test IMPLEMENTATION.',
    '  METHOD tc_eng_09_state_stopped.',
    `    DATA(lo_cut) = NEW ${logic}( io_access = NEW ltd_access( ) ).`,
    `    DATA ls_sel TYPE ${logic}=>ty_run_selection.`,
    `    DATA(ls_res) = lo_cut->run( is_selection = ls_sel is_input = VALUE #( ) ).`,
    "    cl_abap_unit_assert=>assert_equals( act = ls_res-gv_sealed exp = 'X' ).",
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');
  const e = abapTestEvidence(scaffold.files, model)!;
  expect(e.model).toMatchObject({ methods: 1, tests: 1, classes: ['ltcl_test'] });
  expect(e.engine!.methods).toBe(e.counts.methods - 1);
  const sentences = abapTestEvidenceSentences(e);
  expect(sentences[0]).toMatch(/^ABAP Unit, the engine's classes \(ltc_engine_cases, ltc_golden_master, ltc_counterparts — what the acceptance counts\): \d+ of \d+ /);
  expect(sentences[sentences.length - 1]).toBe(
    "ABAP Unit, the testing model's class ltcl_test — a proposal, not evidence: 1 of 1 ABAP Unit test method calls the code under test. A green or red method there says nothing about the logic until a reviewer confirms its preconditions and expected result.",
  );
  const placed = placeModelTestClasses(scaffold.files, model)!;
  expect(placed.content).toContain('"! Written by the testing model - a proposal, not evidence:');
  for (const line of placed.content.split('\n')) expect(line.length).toBeLessThanOrEqual(255);
  const md = traceMarkdown(traceOf(plan, scaffold, []));
  expect(md).toContain(`- ${ABAP_UNIT_EVIDENCE_LINE}`);
});

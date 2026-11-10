import { test, expect } from '@playwright/test';
import fs from 'fs';
import { guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards, spliceBodies } from '../lib/transformation/markers';
import { abapCheck } from '../lib/transformation/abap-check';
import { methodReturnsValue } from '../lib/transformation/unit-plan';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { fileUrl, runInPackage, typecheck, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.21, scaffold version 23. Reproduced on synthetic programs written here; the acceptance programs are not
 * in the repository. Server-free.
 *
 *   - "A split part on the Node track gets its parent routine's parameters" (the SD acceptance run of 3.0.20): the
 *     Node wrapper of a split routine received the routine's USING/CHANGING parameters as `args` but called each part
 *     as `(sel, st, local)`, so a part never saw them. Every part now takes `args` after `local`, typed by the parent's
 *     interface, and the parent hands its own `args` over — as RAP has always done. Stop flag and locals hand-over stay.
 *   - "A large method of a local class is split like a large FORM" (owner decision 22.10.2026): a METHOD inside
 *     `CLASS … IMPLEMENTATION` was never cut, however large. It is split at the same top-level statement boundaries,
 *     with the same hand-over of the locals its parts read or write; a method with RETURNING is kept whole.
 */

/** A FORM of about 490 lines with a USING and a CHANGING parameter — split into parts — whose parts read both. */
function paramSource(): string {
  const lines = [
    'REPORT zfx_split_params.',
    'TYPES: BEGIN OF ty_row, claim TYPE c LENGTH 1, total TYPE i, END OF ty_row.',
    'DATA: gs_row TYPE ty_row.',
    'START-OF-SELECTION.',
    "  PERFORM evaluate USING 'X' CHANGING gs_row.",
    'FORM evaluate USING iv_claim TYPE c CHANGING cs_row TYPE ty_row.',
    '  DATA: lv_count TYPE i.',
    "  IF iv_claim = 'X'.",
    '    cs_row-claim = iv_claim.',
    '  ENDIF.',
  ];
  for (let i = 0; i < 120; i++) lines.push(`  IF cs_row-total = ${i}.`, `    lv_count = lv_count + ${i}.`, '    cs_row-total = cs_row-total + 1.', '  ENDIF.');
  lines.push("  IF iv_claim = 'X'.", '    cs_row-total = cs_row-total + lv_count.', '  ENDIF.', 'ENDFORM.');
  return lines.join('\n');
}

/** A METHOD of a local class of about 530 lines, with an IMPORTING parameter; `returning` makes it return a value. */
function methodSource(returning = false): string {
  const lines = [
    'REPORT zfx_split_method.',
    'DATA: gv_total TYPE i.',
    'CLASS lcl_calc DEFINITION.',
    '  PUBLIC SECTION.',
    `    METHODS run IMPORTING iv_code TYPE i${returning ? ' RETURNING VALUE(rv_sum) TYPE i' : ''}.`,
    'ENDCLASS.',
    'CLASS lcl_calc IMPLEMENTATION.',
    '  METHOD run.',
    '    DATA: lv_count TYPE i.',
  ];
  for (let i = 0; i < 130; i++) lines.push(`    IF iv_code = ${i}.`, `      lv_count = lv_count + ${i}.`, '      gv_total = gv_total + lv_count.', '    ENDIF.');
  if (returning) lines.push('    rv_sum = lv_count.');
  lines.push('  ENDMETHOD.', 'ENDCLASS.', 'START-OF-SELECTION.', returning ? '  gv_total = NEW lcl_calc( )->run( iv_code = 1 ).' : '  NEW lcl_calc( )->run( iv_code = 1 ).');
  return lines.join('\n');
}

function prep(track: 'rap' | 'node', source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: 'Z_TEST', decisions: [], contextText: '' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const partsOf = (p: EngineLedPrepared) => p.plan.units.filter((u) => u.part).sort((a, b) => a.part!.index - b.part!.index);
const messages = (p: EngineLedPrepared, regionId: string, body: string) => bodyGuards(body, guardContextOf(p, regionId)).map((r) => r.message);

test('the parameters of a split part and the split of a method come with scaffold version 23', () => {
  expect(SCAFFOLD_VERSION).toBe(23);
});

/* ------------------------------------------------------- the parameters */

test('Node: every part takes the parent routine\'s args after local, and the parent hands them over', () => {
  const p = prep('node', paramSource());
  const parts = partsOf(p);
  expect(parts.length, 'the routine is split into parts').toBeGreaterThan(1);
  for (const u of parts) expect(u.signature).toBe(`export function ${u.fn}(sel: Selection, st: RunState, local: Record<string, unknown>, args: EvaluateArgs): StepResult`);
  const parentUnit = p.plan.units.find((u) => u.id === parts[0].part!.parent)!;
  expect(parentUnit.signature).toBe('export function evaluate(sel: Selection, st: RunState, args: EvaluateArgs): StepResult');
  const parent = p.scaffold.files.find((f) => f.path === parentUnit.file)!.content;
  expect(parent).toContain('export interface EvaluateArgs {');
  for (const u of parts) expect(parent).toContain(`  const r${u.part!.index} = ${u.fn}(sel, st, local, args);`);
  // The stop flag and the locals hand-over stay as they were.
  expect(parent).toContain('ccRoutineEnded: false');
  expect(parent).toContain('  if (local.ccRoutineEnded) return;');
  const file = p.scaffold.files.find((f) => f.path === parts[0].file)!.content;
  expect(file).toContain(`import type { EvaluateArgs } from './${parentUnit.file.split('/').pop()}';`);
  expect(file).toContain('  let lvCount = local.lvCount as number;');
  // The fill request lists the interface's fields, so the model reads its input from args, not from a local guess.
  const req = p.fillUnits.find((u) => u.unitId === parts[0].id)!;
  expect(req.function.signature).toContain('args: EvaluateArgs');
  expect(req.types).toMatch(/EvaluateArgs/);
  expect(req.types).toMatch(/ivClaim/);
  expect(req.types).toMatch(/csRow/);
});

test('Node: part bodies that read args as the original reads its parameters pass the guards, compile and run', () => {
  const p = prep('node', paramSource());
  const parts = partsOf(p);
  const parentUnit = p.plan.units.find((u) => u.id === parts[0].part!.parent)!;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const bodies = [
    { regionId: first.id, body: "if (args.ivClaim === 'X') args.csRow.value.claim = args.ivClaim;\nlvCount = lvCount + 2;" },
    ...parts.slice(1, -1).map((u) => ({ regionId: u.id, body: 'lvCount = lvCount + 1;' })),
    { regionId: last.id, body: "if (args.ivClaim === 'X') args.csRow.value.total = args.csRow.value.total + lvCount;" },
  ];
  for (const b of bodies) expect(messages(p, b.regionId, b.body)).toEqual([]);
  const spliced = spliceBodies(p.scaffold, bodies, () => null);
  expect(spliced.ok, spliced.reason ?? '').toBe(true);
  const dir = writePackage(spliced.files, 'cc-split-args-');
  try {
    const tc = typecheck(dir);
    expect(tc.output.split('\n').filter((l) => /evaluate/.test(l)), tc.output.slice(0, 2000)).toEqual([]);
    const got = runInPackage<{ claim: string; total: number }>(
      dir,
      `const m = await import(${JSON.stringify(fileUrl(dir, parentUnit.file))});
       const st = { local: {}, messages: [], trace: [] };
       const row = { value: { claim: '', total: 10 } };
       m.${parentUnit.fn}({}, st, { ivClaim: 'X', csRow: row });
       console.log(JSON.stringify(row.value));`,
    );
    // Part 1 sets the claim from the USING parameter; the last part adds the handed-over count to the CHANGING row.
    expect(got).toEqual({ claim: 'X', total: 10 + 2 + (parts.length - 2) });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Node: a routine without parameters keeps its parts\' signature (sel, st, local)', () => {
  const p = prep('node', methodSource());
  for (const u of partsOf(p)) expect(u.signature).toBe(`export function ${u.fn}(sel: Selection, st: RunState, local: Record<string, unknown>): StepResult`);
});

test('RAP: the parts of a split FORM still take its parameters, unchanged', () => {
  const p = prep('rap', paramSource());
  const parts = partsOf(p);
  expect(parts.length).toBeGreaterThan(1);
  for (const u of parts) expect(p.scaffold.rap!.signatures[u.id]).toMatch(/IMPORTING iv_claim .*CHANGING cs_row /);
});

/* ---------------------------------------------------- a method is split */

test('a large method of a local class is split at its top-level statements on both tracks', () => {
  for (const track of ['node', 'rap'] as const) {
    const p = prep(track, methodSource());
    const parts = partsOf(p);
    expect(parts.length, track).toBeGreaterThan(1);
    expect(p.plan.stats.split).toEqual(['RUN']);
    const parent = p.plan.units.find((u) => u.id === parts[0].part!.parent)!;
    expect(parent.kind).toBe('method');
    // Parts are cut between top-level statements: each starts at an IF and ends at an ENDIF of the method's own level.
    const lines = source(methodSource());
    for (const u of parts) {
      expect(lines[u.abap[0].lineStart - 1].trim(), `${track} ${u.id} start`).toMatch(/^(DATA:|IF )/);
      expect(lines[u.abap[0].lineEnd - 1].trim(), `${track} ${u.id} end`).toBe('ENDIF.');
    }
    // The parts cover the method's body without a gap.
    expect(parts[0].abap[0].lineStart).toBe(parent.abap[0].lineStart + 1);
    expect(parts[parts.length - 1].abap[0].lineEnd).toBe(parent.abap[0].lineEnd - 1);
    for (let i = 1; i < parts.length; i++) expect(parts[i].abap[0].lineStart).toBe(parts[i - 1].abap[0].lineEnd + 1);
  }
});

function source(text: string): string[] {
  return text.split('\n');
}

test('Node: the parts of a split method get the method\'s locals handed over, and their bodies compile', () => {
  const p = prep('node', methodSource());
  const parts = partsOf(p);
  expect(p.scaffold.partLocals?.[parts[0].id]).toEqual(['lvCount']);
  const bodies = parts.map((u) => ({ regionId: u.id, body: 'lvCount = lvCount + 1;\nst.local.gvTotal = lvCount;' }));
  for (const b of bodies) expect(messages(p, b.regionId, b.body)).toEqual([]);
  const spliced = spliceBodies(p.scaffold, bodies, () => null);
  expect(spliced.ok, spliced.reason ?? '').toBe(true);
  const dir = writePackage(spliced.files, 'cc-split-method-');
  try {
    const tc = typecheck(dir);
    expect(tc.output.split('\n').filter((l) => /lclCalcRun/i.test(l)), tc.output.slice(0, 2000)).toEqual([]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RAP: the parts of a split method take its parameter and handed locals, and the class activates', () => {
  const p = prep('rap', methodSource());
  const parts = partsOf(p);
  const sig = p.scaffold.rap!.signatures[parts[0].id];
  expect(sig).toMatch(/IMPORTING iv_code TYPE i/);
  expect(sig).toMatch(/CHANGING lv_count TYPE ty_\w+_local-lv_count cc_routine_ended TYPE abap_bool\./);
  const bodies = parts.map((u) => ({ regionId: u.id, body: 'IF iv_code = 1.\n  lv_count = lv_count + 1.\nENDIF.\ngv_total = gv_total + lv_count.' }));
  for (const b of bodies) expect(messages(p, b.regionId, b.body)).toEqual([]);
  const spliced = spliceBodies(p.scaffold, bodies, () => null);
  expect(spliced.ok, spliced.reason ?? '').toBe(true);
  const r = abapCheck(spliced.files);
  if (!r.ran) throw new Error(r.reason);
  expect(r.activation.activatable, JSON.stringify(r.activation.findings.filter((f) => f.kind !== 'lint').slice(0, 5))).toBe(true);
});

test('a method with RETURNING is kept whole, however large', () => {
  expect(methodReturnsValue([{ keyword: 'METHODS', text: 'METHODS run IMPORTING iv_code TYPE i RETURNING VALUE(rv_sum) TYPE i' }], 'RUN')).toBe(true);
  expect(methodReturnsValue([{ keyword: 'METHODS', text: 'METHODS run IMPORTING iv_code TYPE i' }], 'RUN')).toBe(false);
  expect(methodReturnsValue([{ keyword: 'METHODS', text: 'METHODS zif_calc~run RETURNING VALUE(rv) TYPE i' }], 'ZIF_CALC~RUN')).toBe(true);
  for (const track of ['node', 'rap'] as const) {
    const p = prep(track, methodSource(true));
    expect(partsOf(p), track).toEqual([]);
    expect(p.plan.stats.split).toEqual([]);
  }
});

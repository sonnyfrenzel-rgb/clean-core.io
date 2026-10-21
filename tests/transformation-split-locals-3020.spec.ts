import { test, expect } from '@playwright/test';
import fs from 'fs';
import { guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards, spliceBodies } from '../lib/transformation/markers';
import { abapCheck } from '../lib/transformation/abap-check';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { typecheck, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.20 — quality, "a split part gets what it needs from its parent" (the SD acceptance of 21.10.2026: part
 * U10P2 was refused in two of three runs for using the parent routine's locals ls_effect, lv_code, ls_work and
 * lv_delivered bare). Since scaffold version 21 the frame hands a part every parent local its lines read or write,
 * under its own name, so a body written as the original reads compiles and shares the parent's state. Reproduced on a
 * synthetic program: the acceptance program is not in the repository. Server-free.
 */

/** A routine of about 480 lines — split into parts — whose locals the parts read and write; lv_code only the first. */
function splitSource(): string {
  const lines = [
    'REPORT zfx_split_locals.',
    'TYPES: BEGIN OF ty_co, bukrs TYPE c LENGTH 4, currency TYPE c LENGTH 5, END OF ty_co.',
    'DATA: gv_total TYPE i.',
    "PARAMETERS: p_bukrs TYPE c LENGTH 4 DEFAULT '1000'.",
    'START-OF-SELECTION.',
    '  PERFORM evaluate.',
    'FORM evaluate.',
    '  DATA: ls_c TYPE ty_co,',
    "        lv_code TYPE c LENGTH 2 VALUE 'A1',",
    '        lv_count TYPE i.',
    '  ls_c-bukrs = p_bukrs.',
    "  IF lv_code = 'A1'.",
    '    gv_total = 1.',
    '  ENDIF.',
  ];
  for (let i = 0; i < 120; i++) lines.push(`  IF ls_c-bukrs = '${String(1000 + i)}'.`, `    lv_count = lv_count + ${i}.`, '    gv_total = gv_total + lv_count.', '  ENDIF.');
  lines.push('ENDFORM.');
  return lines.join('\n');
}

function prep(track: 'rap' | 'node'): EngineLedPrepared {
  const p = prepareEngineLed({ source: splitSource(), track, program: 'Z_TEST', decisions: [], contextText: '' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const partsOf = (p: EngineLedPrepared) => p.plan.units.filter((u) => u.part).sort((a, b) => a.part!.index - b.part!.index);

test('scaffold version 21 carries the hand-over', () => {
  expect(SCAFFOLD_VERSION).toBe(21);
});

test('RAP: each part takes the parent locals its lines read or write as CHANGING parameters under their own names', () => {
  const p = prep('rap');
  const parts = partsOf(p);
  expect(parts.length, 'the routine is split into parts').toBeGreaterThan(1);
  const logic = p.scaffold.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!.content;
  // No cs_local: the parent's structure is handed over component by component.
  expect(logic).not.toMatch(/cs_local/i);
  const [one, two] = parts.slice(0, 2).map((u) => p.scaffold.rap!.signatures[u.id]);
  expect(one).toMatch(/CHANGING ls_c TYPE ty_\w+_local-ls_c lv_code TYPE ty_\w+_local-lv_code lv_count TYPE ty_\w+_local-lv_count\./);
  // Part 2's lines never name lv_code: it is not handed over.
  expect(two).toMatch(/CHANGING ls_c TYPE ty_\w+_local-ls_c lv_count TYPE ty_\w+_local-lv_count\./);
  expect(two).not.toMatch(/lv_code/);
  // The parent gives the local its start value (a structure component takes no VALUE) and passes each component.
  expect(logic).toMatch(/ls_local-lv_code = 'A1'\./);
  expect(logic).toMatch(/evaluate_part2\( CHANGING ls_c = ls_local-ls_c lv_count = ls_local-lv_count \)\./);
  // The fill request says so.
  const req = p.fillUnits.find((u) => u.unitId === parts[1].id)!;
  expect(req.types).toContain("The parent routine's locals these lines read or write are this method's CHANGING parameters under their own names, handed over by the frame: ls_c, lv_count.");
});

test('RAP: a body that reads and writes the parent locals bare, as the original does, passes the guards and activates', () => {
  const p = prep('rap');
  const [one, two] = partsOf(p);
  const bodies = [
    { regionId: one.id, body: "ls_c-bukrs = p_bukrs.\nIF lv_code = 'A1'.\n  gv_total = 1.\nENDIF.\nlv_count = lv_count + 1." },
    { regionId: two.id, body: "IF ls_c-bukrs = '1100'.\n  lv_count = lv_count + 100.\n  gv_total = gv_total + lv_count.\nENDIF." },
  ];
  for (const b of bodies) expect(bodyGuards(b.body, guardContextOf(p, b.regionId)).map((r) => r.message)).toEqual([]);
  const spliced = spliceBodies(p.scaffold, bodies, () => null);
  expect(spliced.ok, spliced.reason ?? '').toBe(true);
  expect(spliced.applied.length).toBe(bodies.length);
  const r = abapCheck(spliced.files);
  if (!r.ran) throw new Error(r.reason);
  expect(r.activation.activatable, JSON.stringify(r.activation.findings.filter((f) => f.kind !== 'lint').slice(0, 5))).toBe(true);
});

test('RAP: cs_local, a handed local declared again, or a parent local the lines do not touch is refused', () => {
  const p = prep('rap');
  const ctx = guardContextOf(p, partsOf(p)[1].id);
  expect(ctx.abap?.handedLocals).toEqual(['ls_c', 'lv_count']);
  const via = bodyGuards("cs_local-ls_c-bukrs = 'X'.", ctx).map((r) => r.message);
  expect(via.some((m) => m.startsWith('names cs_local, which this method does not have: cs_local-ls_c') && m.includes('ls_c, lv_count'))).toBe(true);
  const again = bodyGuards('DATA lv_count TYPE i.\nlv_count = 1.', ctx).map((r) => r.message);
  expect(again.some((m) => m.startsWith("declares the parent routine's locals again: lv_count"))).toBe(true);
  const untouched = bodyGuards("lv_code = 'B2'.", ctx).map((r) => r.message);
  expect(untouched.some((m) => m.startsWith("uses the parent routine's locals these lines do not read or write: lv_code"))).toBe(true);
});

test('Node: the parent starts local with the start values, each part declares its handed locals and writes them back', () => {
  const p = prep('node');
  const [one, two] = partsOf(p);
  const parent = p.scaffold.files.find((f) => f.path === p.plan.units.find((u) => u.id === one.part!.parent)!.file)!.content;
  expect(parent).toContain("const local: Record<string, unknown> = { lsC: { bukrs: '', currency: '' }, lvCode: \"A1\", lvCount: 0 };");
  const file = p.scaffold.files.find((f) => f.path === two.file)!.content;
  expect(file).toContain('  let lsC = local.lsC as TyCo;\n  let lvCount = local.lvCount as number;\n  try {');
  expect(file).toMatch(/\} finally \{\n {4}local\.lsC = lsC;\n {4}local\.lvCount = lvCount;\n {2}\}/);
  expect(p.scaffold.partLocals?.[two.id]).toEqual(['lsC', 'lvCount']);
  const req = p.fillUnits.find((u) => u.unitId === two.id)!;
  expect(req.types).toContain("are declared by the frame before your body, typed as the original declares them, and written back after it: lsC, lvCount.");
  // Declared again, the body's copy would never reach the next part.
  const again = bodyGuards('let lvCount = 0;\nlvCount += 1;\nreturn;', guardContextOf(p, two.id)).map((r) => r.message);
  expect(again.some((m) => m.startsWith("declares the parent routine's locals again: lvCount"))).toBe(true);
});

test('Node: bodies that use the handed locals bare, as the original names them, compile', () => {
  const p = prep('node');
  const [one, two] = partsOf(p);
  const bodies = [
    { regionId: one.id, body: "lsC.bukrs = '1100';\nif (lvCode === 'A1') lvCount = 7;\nreturn;" },
    { regionId: two.id, body: "if (lsC.bukrs === '1100') lvCount = lvCount + 100;\nst.local.gvTotal = lvCount;\nreturn;" },
  ];
  for (const b of bodies) expect(bodyGuards(b.body, guardContextOf(p, b.regionId)).map((r) => r.message)).toEqual([]);
  const spliced = spliceBodies(p.scaffold, bodies, () => null);
  expect(spliced.ok, spliced.reason ?? '').toBe(true);
  expect(spliced.applied.length).toBe(bodies.length);
  const dir = writePackage(spliced.files, 'cc-split-locals-');
  try {
    const tc = typecheck(dir);
    const ours = tc.output.split('\n').filter((l) => /evaluate/.test(l));
    expect(ours, tc.output.slice(0, 2000)).toEqual([]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

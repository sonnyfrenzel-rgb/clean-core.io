import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import { guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards, spliceBodies } from '../lib/transformation/markers';
import { abapCheck } from '../lib/transformation/abap-check';
import { traceMarkdown, traceOf } from '../lib/transformation/trace';
import { rapUnresolvedTypesIn } from '../lib/transformation/rap-save';
import { QUERY_FILTER_AND_SORT } from '../lib/transformation/scaffold-rap';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { fileUrl, runInPackage, typecheck, writePackage } from './helpers/transformation-scaffold';

/**
 * Owner decisions of 22.10.2026 from an external review of a generated package (an MM invoice check), scaffold
 * version 22. Reproduced on synthetic programs written here; the reviewed program is not in the repository.
 * Server-free.
 *
 *   - A split routine's parts share a stop flag: a part that leaves the routine (RETURN, a CHECK or EXIT outside a
 *     loop) sets it first, and the parent calls the next part only while it is not set. Before, part 2 ran after
 *     part 1's RETURN and overwrote the rejection code with 'LINE_ACCEPTABLE'. The fill check refuses a part body
 *     whose routine-level exit does not set the flag right before it.
 *   - An empty CATCH (RAP) or catch (Node) is refused: the error would vanish silently.
 *   - A result field whose type the engine cannot resolve (`status TYPE c LENGTH ode`) stays in the custom entity as
 *     text, named in TRACE.md, instead of leaving it silently.
 */

/** A FORM of about 490 lines — split into two parts — that rejects in part 1 with a RETURN and accepts at the end of part 2. */
function splitSource(): string {
  const lines = [
    'REPORT zfx_split_stop.',
    'DATA: gv_result TYPE c LENGTH 20,',
    '      gv_total TYPE i.',
    'START-OF-SELECTION.',
    '  PERFORM evaluate_line.',
    'FORM evaluate_line.',
    '  DATA: lv_code TYPE c LENGTH 20,',
    '        lv_count TYPE i.',
    '  lv_count = gv_total * 2.',
    '  IF lv_count > 100.',
    "    lv_code = 'AMOUNT_TOO_HIGH'.",
    '    gv_result = lv_code.',
    '    RETURN.',
    '  ENDIF.',
  ];
  for (let i = 0; i < 120; i++) lines.push(`  IF gv_total = ${i}.`, `    lv_count = lv_count + ${i}.`, '    gv_total = gv_total + 1.', '  ENDIF.');
  lines.push("  lv_code = 'LINE_ACCEPTABLE'.", '  gv_result = lv_code.', 'ENDFORM.');
  return lines.join('\n');
}

/** A short program — nothing is split — with a RETURN, a CHECK in a loop and a TRY whose CATCH reports. */
function smallSource(): string {
  return [
    'REPORT zfx_small_route.',
    'TYPES: BEGIN OF ty_line, id TYPE c LENGTH 4, qty TYPE i, END OF ty_line.',
    'DATA: gt_lines TYPE STANDARD TABLE OF ty_line WITH DEFAULT KEY,',
    '      gv_sum TYPE i.',
    "PARAMETERS: p_limit TYPE i DEFAULT 10.",
    'START-OF-SELECTION.',
    '  PERFORM sum_lines.',
    'FORM sum_lines.',
    '  DATA ls_line TYPE ty_line.',
    '  IF p_limit <= 0.',
    "    MESSAGE 'Limit must be positive' TYPE 'E'.",
    '  ENDIF.',
    '  LOOP AT gt_lines INTO ls_line.',
    '    CHECK ls_line-qty > 0.',
    '    gv_sum = gv_sum + ls_line-qty.',
    '    IF gv_sum > p_limit.',
    '      EXIT.',
    '    ENDIF.',
    '  ENDLOOP.',
    '  IF gv_sum = 0.',
    '    RETURN.',
    '  ENDIF.',
    '  gv_sum = gv_sum * 2.',
    'ENDFORM.',
  ].join('\n');
}

function prep(track: 'rap' | 'node', source = splitSource()): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: 'Z_TEST', decisions: [], contextText: '' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const partsOf = (p: EngineLedPrepared) => p.plan.units.filter((u) => u.part).sort((a, b) => a.part!.index - b.part!.index);
const messages = (p: EngineLedPrepared, regionId: string, body: string) => bodyGuards(body, guardContextOf(p, regionId)).map((r) => r.message);

test('the stop flag, the empty-catch refusal and the unresolved-type note come with scaffold version 22', () => {
  expect(SCAFFOLD_VERSION).toBeGreaterThanOrEqual(22);
});

/* ------------------------------------------------------------------ RAP */

test('RAP: the parent calls part 2 only while the routine has not ended', () => {
  const p = prep('rap');
  const parts = partsOf(p);
  expect(parts.length, 'the routine is split into two parts').toBe(2);
  expect(p.scaffold.stopFlags?.[parts[0].id]).toBe('cc_routine_ended');
  const logic = p.scaffold.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!.content;
  const at = logic.indexOf('  METHOD evaluate_line.');
  expect(logic.slice(at, logic.indexOf('ENDMETHOD.', at) + 'ENDMETHOD.'.length)).toBe(
    [
      '  METHOD evaluate_line.',
      "    \" The routine's locals, shared by its parts: each part gets those its lines read or write (3.0.20),",
      '    " and cc_routine_ended, which a part sets before it leaves the routine: no further part runs then.',
      '    DATA ls_local TYPE ty_evaluate_line_local.',
      '    evaluate_line_part1( CHANGING lv_code = ls_local-lv_code lv_count = ls_local-lv_count cc_routine_ended = ls_local-cc_routine_ended ).',
      '    IF ls_local-cc_routine_ended = abap_true.',
      '      RETURN.',
      '    ENDIF.',
      '    evaluate_line_part2( CHANGING lv_code = ls_local-lv_code lv_count = ls_local-lv_count cc_routine_ended = ls_local-cc_routine_ended ).',
      '  ENDMETHOD.',
    ].join('\n'),
  );
  // The flag is a component of the shared structure and a CHANGING parameter of every part.
  expect(logic).toMatch(/TYPES cc_routine_ended TYPE abap_bool\.\n\s+TYPES END OF ty_evaluate_line_local\./);
  for (const u of parts) expect(p.scaffold.rap!.signatures[u.id]).toMatch(/cc_routine_ended TYPE abap_bool\.$/);
  // The fill request of a part names the rule.
  const req = p.fillUnits.find((u) => u.unitId === parts[0].id)!;
  expect(req.types).toContain('write cc_routine_ended = abap_true. directly before RETURN');
});

test('RAP: bodies that set the flag before the RETURN pass the checks and the class activates', () => {
  const p = prep('rap');
  const [one, two] = partsOf(p);
  const call = p.scaffold.rap!.guards['G-0010'].call;
  const bodies = [
    {
      regionId: one.id,
      body: `lv_count = gv_total * 2.\nIF ${call} = abap_true.\n  lv_code = 'AMOUNT_TOO_HIGH'.\n  gv_result = lv_code.\n  cc_routine_ended = abap_true.\n  RETURN.\nENDIF.`,
    },
    { regionId: two.id, body: "lv_code = 'LINE_ACCEPTABLE'.\ngv_result = lv_code." },
  ];
  for (const b of bodies) expect(messages(p, b.regionId, b.body)).toEqual([]);
  const spliced = spliceBodies(p.scaffold, bodies, () => null);
  expect(spliced.ok, spliced.reason ?? '').toBe(true);
  expect(spliced.applied.length).toBe(bodies.length);
  const r = abapCheck(spliced.files);
  if (!r.ran) throw new Error(r.reason);
  expect(r.activation.activatable, JSON.stringify(r.activation.findings.filter((f) => f.kind !== 'lint').slice(0, 5))).toBe(true);
  // Not even a lint finding of the shipped abaplint rules stands in the parent's wrapper.
  const logic = spliced.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!;
  const lines = logic.content.split('\n');
  const from = lines.findIndex((l) => l === '  METHOD evaluate_line.') + 1;
  const to = lines.findIndex((l, i) => i >= from && l === '  ENDMETHOD.') + 1;
  expect(r.findings.filter((f) => f.path === logic.path && f.line >= from && f.line <= to)).toEqual([]);
});

test('RAP: a routine-level RETURN, EXIT or CHECK without the flag is refused; inside a loop and at the end it is not', () => {
  const p = prep('rap');
  const [one] = partsOf(p);
  const call = p.scaffold.rap!.guards['G-0010'].call;
  const refusedReturn = messages(p, one.id, `IF ${call} = abap_true.\n  lv_code = 'AMOUNT_TOO_HIGH'.\n  RETURN.\nENDIF.\nlv_count = 1.`);
  expect(refusedReturn.some((m) => m.startsWith('leaves the routine without setting cc_routine_ended right before it (body line 3: RETURN)'))).toBe(true);
  const refusedExit = messages(p, one.id, `IF ${call} = abap_true.\n  EXIT.\nENDIF.\nlv_count = 1.`);
  expect(refusedExit.some((m) => m.includes('(body line 2: EXIT)'))).toBe(true);
  const refusedCheck = messages(p, one.id, `CHECK ${call} = abap_false.\nlv_count = 1.`);
  expect(refusedCheck.some((m) => m.startsWith('a CHECK outside a loop leaves the routine (body line 1:') && m.includes('IF NOT ( <condition> ). cc_routine_ended = abap_true. RETURN. ENDIF.'))).toBe(true);
  // The flag set right before: accepted.
  expect(messages(p, one.id, `IF ${call} = abap_true.\n  cc_routine_ended = abap_true.\n  RETURN.\nENDIF.\nlv_count = 1.`).filter((m) => /cc_routine_ended|CHECK outside/.test(m))).toEqual([]);
  // A CHECK or EXIT inside a loop ends the pass or the loop, not the routine; a last RETURN is no early exit.
  const loop = `DO 3 TIMES.\n  CHECK lv_count > 0.\n  IF lv_count > 5.\n    EXIT.\n  ENDIF.\n  lv_count = lv_count + 1.\nENDDO.\nIF ${call} = abap_true.\n  cc_routine_ended = abap_true.\n  RETURN.\nENDIF.\nRETURN.`;
  expect(messages(p, one.id, loop)).toEqual([]);
});

test('RAP: a routine that is not split has no flag and no flag rule', () => {
  const p = prep('rap', smallSource());
  expect(partsOf(p)).toEqual([]);
  expect(p.scaffold.stopFlags).toBeUndefined();
  const unit = p.plan.units.find((u) => u.routine?.toUpperCase() === 'SUM_LINES')!;
  expect(guardContextOf(p, unit.id).stopFlag).toBeUndefined();
  expect(messages(p, unit.id, 'IF gv_sum = 0.\n  RETURN.\nENDIF.\ngv_sum = gv_sum * 2.').filter((m) => /routine/.test(m))).toEqual([]);
});

/* ----------------------------------------------------------------- Node */

test('Node: the parent stops after a part that ended the routine, and part 2 runs only otherwise', () => {
  const p = prep('node');
  const [one, two] = partsOf(p);
  const parentUnit = p.plan.units.find((u) => u.id === one.part!.parent)!;
  const parent = p.scaffold.files.find((f) => f.path === parentUnit.file)!.content;
  expect(parent.slice(parent.indexOf('export function evaluateLine('))).toBe(
    [
      'export function evaluateLine(sel: Selection, st: RunState): StepResult {',
      "  const local: Record<string, unknown> = { lvCode: '', lvCount: 0, ccRoutineEnded: false };",
      '  const r1 = evaluateLinePart1(sel, st, local);',
      '  if (r1) return r1;',
      '  if (local.ccRoutineEnded) return;',
      '  const r2 = evaluateLinePart2(sel, st, local);',
      '  if (r2) return r2;',
      '}',
      '',
    ].join('\n'),
  );
  expect(p.scaffold.stopFlags?.[two.id]).toBe('ccRoutineEnded');
  const req = p.fillUnits.find((u) => u.unitId === one.id)!;
  expect(req.types).toContain('write local.ccRoutineEnded = true; directly before the return');
  const bodies = [
    {
      regionId: one.id,
      body: "lvCount = st.local.gvTotal * 2;\nif (checked(st, () => stop_G0010(sel, st, null, { lvCount }))) {\n  lvCode = 'AMOUNT_TOO_HIGH';\n  st.local.gvResult = lvCode;\n  local.ccRoutineEnded = true;\n  return;\n}",
    },
    { regionId: two.id, body: "lvCode = 'LINE_ACCEPTABLE';\nst.local.gvResult = lvCode;" },
    { regionId: p.plan.guards.find((g) => g.id === 'G-0010')!.regionId!, body: 'return values.lvCount > 100;' },
  ];
  for (const b of bodies) expect(messages(p, b.regionId, b.body)).toEqual([]);
  const spliced = spliceBodies(p.scaffold, bodies, () => null);
  expect(spliced.ok, spliced.reason ?? '').toBe(true);
  const dir = writePackage(spliced.files, 'cc-split-stop-');
  try {
    const tc = typecheck(dir);
    expect(tc.output.split('\n').filter((l) => /evaluate/.test(l)), tc.output.slice(0, 2000)).toEqual([]);
    const got = runInPackage<string[]>(
      dir,
      `const m = await import(${JSON.stringify(fileUrl(dir, parentUnit.file))});
       const run = (total) => { const st = { local: { gvTotal: total, gvResult: '' }, messages: [], trace: [] }; m.${parentUnit.fn}({}, st); return st.local.gvResult; };
       console.log(JSON.stringify([run(60), run(10)]));`,
    );
    // 60 → lv_count 120 > 100: rejected in part 1, part 2 does not run; 10 → part 2 accepts.
    expect(got).toEqual(['AMOUNT_TOO_HIGH', 'LINE_ACCEPTABLE']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Node: a bare return that leaves early without the flag is refused; a callback, a loop and a last return are not', () => {
  const p = prep('node');
  const [one] = partsOf(p);
  const refused = messages(p, one.id, "if (lvCount > 100) {\n  lvCode = 'X';\n  return;\n}\nlvCount = 1;");
  expect(refused.some((m) => m.startsWith('returns without setting local.ccRoutineEnded = true; right before it (body line 3)'))).toBe(true);
  expect(messages(p, one.id, "if (lvCount > 100) return;\nlvCount = 1;").some((m) => m.includes('(body line 1)'))).toBe(true);
  // The body's other refusals (it does not call the check stop_G0010) are not what this test is about.
  const flagRule = (body: string) => messages(p, one.id, body).filter((m) => m.includes('ccRoutineEnded'));
  expect(flagRule("if (lvCount > 100) {\n  local.ccRoutineEnded = true;\n  return;\n}\nlvCount = 1;")).toEqual([]);
  const local = "const xs = [1, 2, 3];\nxs.forEach((x) => {\n  if (x > 1) return;\n  lvCount += x;\n});\nfor (const x of xs) {\n  if (x === 2) continue;\n  if (x === 3) break;\n}\nreturn;";
  expect(flagRule(local)).toEqual([]);
});

/* ---------------------------------------------------------- empty catch */

test('RAP and Node: an empty CATCH is refused, one that reports or raises again passes', () => {
  const rap = prep('rap', smallSource());
  const rapUnit = rap.plan.units.find((u) => u.routine?.toUpperCase() === 'SUM_LINES')!;
  const empty = messages(rap, rapUnit.id, 'TRY.\n  gv_sum = gv_sum * 2.\n  CATCH cx_sy_arithmetic_overflow.\n  " nothing\nENDTRY.');
  expect(empty).toContain(
    'an empty CATCH block (body line 3: CATCH cx_sy_arithmetic_overflow) — the error would vanish silently: inside the CATCH, report what the original reports there (a message of TYPE E/A/X as the refusal exception, of TYPE I/S/W a line in mt_messages) or raise the exception again (RAISE EXCEPTION with previous = the caught one)',
  );
  expect(messages(rap, rapUnit.id, "TRY.\n  gv_sum = gv_sum * 2.\n  CATCH cx_sy_arithmetic_overflow.\n  CLEAR gv_sum.\n  CLEANUP.\nENDTRY.").filter((m) => m.startsWith('an empty CATCH'))).toEqual([]);
  expect(messages(rap, rapUnit.id, "TRY.\n  gv_sum = gv_sum * 2.\n  CATCH cx_sy_arithmetic_overflow.\n  CATCH cx_sy_zerodivide.\n  CLEAR gv_sum.\nENDTRY.").some((m) => m.includes('(body line 3: CATCH cx_sy_arithmetic_overflow)'))).toBe(true);

  const node = prep('node', smallSource());
  const nodeUnit = node.plan.units.find((u) => u.routine?.toUpperCase() === 'SUM_LINES')!;
  const nodeEmpty = messages(node, nodeUnit.id, 'try {\n  st.local.gvSum = st.local.gvSum * 2;\n} catch (e) {\n  // nothing\n}\nreturn;');
  expect(nodeEmpty).toContain(
    'an empty catch block (body line 3) — the error would vanish silently: inside the catch, report what the original reports there (return a Refusal where it refuses) or throw the error again',
  );
  expect(messages(node, nodeUnit.id, 'try {\n  st.local.gvSum = st.local.gvSum * 2;\n} catch {}\nreturn;').some((m) => m.startsWith('an empty catch block (body line 3)'))).toBe(true);
  expect(messages(node, nodeUnit.id, 'try {\n  st.local.gvSum = st.local.gvSum * 2;\n} catch (e) {\n  throw e;\n}\nreturn;').filter((m) => m.startsWith('an empty catch'))).toEqual([]);
});

/* ------------------------------------------------- unresolved field type */

test('RAP: a result field whose type is not resolved stays in the custom entity as text, named in TRACE.md', () => {
  const source = [
    'REPORT zfx_inv_check.',
    'TYPES: BEGIN OF ty_result,',
    '         belnr TYPE c LENGTH 10,',
    '         status TYPE c LENGTH ode,',
    '         reason TYPE c LENGTH ode,',
    '         amount TYPE p LENGTH 8 DECIMALS 2,',
    '       END OF ty_result.',
    'DATA: gt_result TYPE STANDARD TABLE OF ty_result WITH DEFAULT KEY,',
    '      gs_result TYPE ty_result.',
    'START-OF-SELECTION.',
    '  PERFORM check_lines.',
    '  LOOP AT gt_result INTO gs_result.',
    '    WRITE: / gs_result-belnr, gs_result-status, gs_result-reason.',
    '  ENDLOOP.',
    'FORM check_lines.',
    "  gs_result-belnr = '1'.",
    "  gs_result-status = 'BLOCKED'.",
    "  gs_result-reason = 'PRICE_VARIANCE'.",
    '  APPEND gs_result TO gt_result.',
    'ENDFORM.',
  ].join('\n');
  const p = prep('rap', source);
  const entity = p.scaffold.files.find((f) => f.path.endsWith('_ce.ddls.asddls'))!.content;
  expect(entity).toContain(
    [
      '      belnr : abap.char( 10 );',
      '      // @cc-type-unresolved status: type not resolved from the original (line 4): TYPES status TYPE c LENGTH ode - carried as abap.char( 255 )',
      '      status : abap.char( 255 );',
      '      // @cc-type-unresolved reason: type not resolved from the original (line 5): TYPES reason TYPE c LENGTH ode - carried as abap.char( 255 )',
      '      reason : abap.char( 255 );',
      '      amount : abap.dec( 15, 2 );',
    ].join('\n'),
  );
  const notes = rapUnresolvedTypesIn(p.scaffold.files);
  expect(notes).toEqual([
    'status: type not resolved from the original (line 4): TYPES status TYPE c LENGTH ode - carried as abap.char( 255 )',
    'reason: type not resolved from the original (line 5): TYPES reason TYPE c LENGTH ode - carried as abap.char( 255 )',
  ]);
  const trace = traceOf(p.plan, p.scaffold, []);
  expect(trace.unresolvedTypes).toEqual(notes);
  expect(traceMarkdown(trace)).toContain(`Fields of the service entity whose type the engine could not resolve from the original — carried as text so their values stay visible, to be typed by hand: ${notes.join('; ')}.`);
});

/* ------------------------------------------------------- unchanged paths */

/** The scaffold files as one digest, the lines naming the app version left out (they change with every release). */
const digestOf = (p: EngineLedPrepared) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(p.scaffold.files.map((f) => [f.path, f.content.split('\n').filter((l) => !/\d+\.\d+\.\d+/.test(l)).join('\n')])))
    .digest('hex');

test('a program that is not split generates exactly as before the stop flag, on both tracks', () => {
  // Pinned from the scaffold the engine wrote before the stop flag existed: nothing of a non-split routine changes.
  // Scaffold version 23 (3.0.21, the external MM review, point 1) adds the request's filter and sort order to every
  // query provider; with exactly those lines taken out, the RAP scaffold is still the pinned one.
  const rap = prep('rap', smallSource());
  const block = QUERY_FILTER_AND_SORT.join('\n');
  expect(rap.scaffold.files.filter((f) => f.content.includes(block))).toHaveLength(1);
  for (const f of rap.scaffold.files) f.content = f.content.replace(`${block}\n`, '');
  expect(digestOf(rap)).toBe('6304fc02c0493fa5a23fe44414debc917be15816462873a11daebda573088902');
  expect(digestOf(prep('node', smallSource()))).toBe('f146362ac8b94346d66fc5bdc80502851dd5fbdb21c2e1b6916520fce04f863a');
});

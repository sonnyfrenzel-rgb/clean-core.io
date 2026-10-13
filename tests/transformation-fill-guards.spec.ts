import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { prepareEngineLed, guardBodyOf, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { fillInstructionHeader, parseFillAnswer } from '../lib/transformation/fill-prompt';

/**
 * Three defects of the engine-led fill calls, found in a real A/B on 13.10.2026
 * (a 1,848-line SD program, gemini-3.8-flash). Server-free; the fixture is
 * hand-written in that program's shape.
 *
 *   A — a derived check whose literal the routine also uses (`WHEN 'SHIP'` before
 *       `IF ls_parent-kind = 'SHIP' AND lv_qty > …`): every faithful body was refused
 *       as "writes the condition itself", and the header never said how to call a guard.
 *   B — a derived check's predicate reads `values` (`when_G0024(sel, st, record, values)`),
 *       but a member call on it was refused as a foreign call, and the header never gave
 *       the predicate's signature (the model wrote bare `lvCode.trim()`).
 *   C — `refused` with a non-empty reason stays a refusal.
 */

const source = fs.readFileSync(path.join(__dirname, 'fixtures', 'transformation', 'conservation-shape.abap'), 'utf8');

function prepared(): EngineLedPrepared {
  const prep = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
}

const unitOf = (prep: EngineLedPrepared, fn: string) => prep.plan.units.find((u) => u.fn === fn)!;
const guardOf = (prep: EngineLedPrepared, unitId: string) => prep.plan.guards.find((g) => g.unitId === unitId && g.placement === 'body')!;

test('A: a literal the routine also uses outside the check is no evidence of an inlined check', () => {
  const prep = prepared();
  const u = unitOf(prep, 'checkConservation');
  const g = guardOf(prep, u.id);
  expect(g.literals).toEqual(['SHIP']);
  // The plan keeps the literal; the required guard drops it, because WHEN 'SHIP' is the routine's own logic.
  expect(prep.scaffold.required[u.id]).toEqual([{ id: g.id, helper: g.helper, line: g.line, op: null, literals: [] }]);
  const faithful = [
    'let code = \'\';',
    'for (const parent of st.local.effects as Array<{ eid: string; kind: string; qty: string }>) {',
    "  let lvQty = '0';",
    '  for (const child of st.local.effects as Array<{ reference: string; kind: string; qty: string }>) {',
    '    if (child.reference !== parent.eid) continue;',
    "    if (parent.kind === 'SHIP' && child.kind === 'RECEIPT') lvQty = dec.add(lvQty, child.qty);",
    '  }',
    `  if (${g.helper}(sel, st, null, { lsParentKind: parent.kind, lvQty, lsParentQty: parent.qty })) {`,
    "    args.cvCode.value = 'RETURNS_EXCEED_SHIPMENT';",
    '    return;',
    '  }',
    '}',
    'args.cvCode.value = code;',
  ].join('\n');
  expect(guardBodyOf(prep)(u.id, faithful, [])).toBeNull();
  // Not calling the guard is still refused.
  expect(guardBodyOf(prep)(u.id, faithful.replace(`${g.helper}(sel, st, null, { lsParentKind: parent.kind, lvQty, lsParentQty: parent.qty })`, "parent.kind === 'SHIP' && dec.compare(lvQty, parent.qty) > 0"), [])).toContain(`does not call ${g.helper}`);
});

test('B: a derived predicate reads its values through member calls; names it is not given stay refused', () => {
  const prep = prepared();
  const u = unitOf(prep, 'validateSelection');
  const g = guardOf(prep, u.id);
  expect(g.basis).toBe('derived');
  expect(g.operands.map((o) => o.key)).toEqual(['lvCode']);
  const guard = guardBodyOf(prep);
  expect(guard(g.regionId!, "return (values.lvCode ?? '').toString().trim() !== '';", [])).toBeNull();
  expect(guard(g.regionId!, "return values.lvCode?.toString().trim() !== '';", [])).toBeNull();
  // A bare `lvCode` is not a parameter of when_G…(sel, st, record, values): refused, as in the A/B.
  expect(guard(g.regionId!, "return lvCode.trim() !== '';", [])).toContain('lvCode.trim');
  // A unit body has no `values` parameter: a member call on it stays foreign there.
  expect(guard(u.id, "if (values.lvCode.trim()) return;", [])).toContain('values.lvCode.trim');
  // The predicate of the other derived check reads its own values.
  const conservation = guardOf(prep, unitOf(prep, 'checkConservation').id);
  expect(guard(conservation.regionId!, "return dec.compare(values.lvQty?.toString() ?? '0', '0') > 0;", [])).toBeNull();
});

test('A and B: the header says how a body calls a guard and what a predicate reads', () => {
  const node = fillInstructionHeader('node');
  expect(node).toContain('helper and predicate take (sel, st, record, values)');
  expect(node).toContain('`const r = guard_G0345(sel, st, null, { lvCode }); if (r) return r;`');
  expect(node).toContain('when_<id without "-">(sel, st, record, values): boolean');
  expect(node).toContain('values.<key>');
  const rap = fillInstructionHeader('rap');
  expect(rap).toContain('IF when_g0345( is_sel = is_sel iv_lv_code = lv_code ) = abap_true.');
  expect(rap).toContain('reading only is_sel, is_rec and its iv_ parameters');
  // The schema types "refused" as an object, so the model cannot answer null: the header asks to leave it out.
  expect(node).toContain('"refused" only on a unit you refuse');
  expect(node).not.toContain('"refused": null');
});

test('C: a refused object with a reason is a refusal, whatever the reason says; without one it is not', () => {
  // TRANSFORMATION_FILL_SCHEMA: `refused` is optional and "absent (or without a reason) reads as not refused".
  // A reason the model writes is taken at its word, "none" included — a body is never spliced on a guess.
  const asked = ['U01', 'U02', 'U03'];
  const r = parseFillAnswer(
    JSON.stringify({
      units: [
        { unitId: 'U01', body: 'return;', refused: { reason: 'none' } },
        { unitId: 'U02', body: 'return;', refused: { reason: '' } },
        { unitId: 'U03', body: 'return;', refused: {} },
      ],
    }),
    asked,
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.units.map((u) => [u.unitId, u.refused, u.body])).toEqual([
    ['U01', { reason: 'none' }, ''],
    ['U02', null, 'return;'],
    ['U03', null, 'return;'],
  ]);
});

/**
 * E (A/B 13.10.2026, SD program, U16): `LOOP AT gt_effects INTO ls_parent` did not count as a write of
 * `ls_parent`, so `ls_parent-kind` read as raw input and the predicate had to take it from `record: Rec` —
 * a type `ty_effect` is no part of. A work area filled from an internal table the program builds itself is
 * a computed value and goes in through `values`; a row of the program's input stays raw.
 */
const workAreas = fs.readFileSync(path.join(__dirname, 'fixtures', 'transformation', 'work-area-shape.abap'), 'utf8');

function preparedFrom(src: string): EngineLedPrepared {
  const prep = prepareEngineLed({ source: src, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
}

test('E: a row of an internal table the program builds is a computed value; the predicate reads it from values', () => {
  const prep = prepared();
  const g = guardOf(prep, unitOf(prep, 'checkConservation').id);
  expect(g.basis).toBe('derived');
  expect(g.operands.map((o) => o.key)).toEqual(['lsParentKind', 'lvQty', 'lsParentQty']);
  expect(g.basisReason).toBe('ls_parent is a row of the internal table gt_effects, filled at L38 in CHECK_CONSERVATION');
  // The fill request names every value the body hands in.
  const unit = prep.fillUnits.find((u) => u.unitId === unitOf(prep, 'checkConservation').id)!;
  expect(unit.guards.find((x) => x.id === g.id)!.values).toEqual(['lsParentKind', 'lvQty', 'lsParentQty']);
  // The predicate is written from values alone — `Rec` has no field of ty_effect.
  const guard = guardBodyOf(prep);
  expect(guard(g.regionId!, "return values.lsParentKind === 'SHIP' && dec.compare(String(values.lvQty), String(values.lsParentQty)) > 0;", [])).toBeNull();
  expect(prep.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content).toMatch(/lsParentKind: GuardValue;[\s\S]*lsParentQty: GuardValue;/);
});

test('E: LOOP, ASSIGNING, READ TABLE and SELECT fill a work area; a row of the input stays raw', () => {
  const prep = preparedFrom(workAreas);
  const at = (condition: string) => prep.plan.guards.find((g) => g.condition === condition)!;
  // A row of the input (gt_orders, read from the database): raw, checked at the step's entry from `record`.
  const order = at('ls_order-netwr > 1000');
  expect([order.basis, order.placement, order.operands]).toEqual(['raw', 'entry', []]);
  // Rows of gt_totals, which the program computes: derived, called in the body with the value.
  const total = at('<ls_total>-sum > 5000');
  expect([total.basis, total.placement, total.operands.map((o) => o.key)]).toEqual(['derived', 'body', ['lsTotalSum']]);
  const first = at('ls_first-sum > 9000');
  expect([first.basis, first.placement, first.operands.map((o) => o.key)]).toEqual(['derived', 'body', ['lsFirstSum']]);
  expect(first.basisReason).toContain('a row of the internal table gt_totals');
  // A field read into a variable by SELECT SINGLE is no record field: derived, handed in.
  const customer = at("lv_kunnr = 'BLOCKED'");
  expect([customer.basis, customer.placement, customer.operands.map((o) => o.key)]).toEqual(['derived', 'body', ['lvKunnr']]);
});

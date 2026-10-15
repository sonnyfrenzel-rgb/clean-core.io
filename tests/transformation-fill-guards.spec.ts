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
  // Since scaffold version 7 every helper and predicate has all four parameters; values is {} when a check reads none.
  expect(node).toContain('every helper and predicate takes (sel, st, record, values)');
  expect(node).toContain('{} when there are none');
  expect(node).not.toContain('left out when none');
  expect(node).toContain('`const r = guard_G0345(sel, st, null, { lvCode }); if (r) return r;`');
  expect(node).toContain('when_<id without "-">(sel, st, record, values): boolean');
  expect(node).toContain('values.<key>');
  // RAP since scaffold version 6: the predicate takes the original's own operands as typed parameters, and "types" shows the call.
  const rap = fillInstructionHeader('rap');
  expect(rap).toContain('IF when_g0387( iv_stamp = iv_stamp ) = abap_true. <the original\'s statements inside that IF> ENDIF.');
  expect(rap).toContain('"types" lists its signature and the exact call');
  expect(rap).not.toContain('is_sel = is_sel');
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
  // Typed as the original declares them (scaffold version 7): ls_parent is a ty_effect row, its kind text; its qty
  // and lv_qty are TYPE i — whole numbers, numbers since 3.0.14 (item 1).
  expect(prep.scaffold.files.find((f) => f.path === 'srv/lib/guards.ts')!.content).toMatch(/lsParentKind: string;\n {2}\/\*\* lv_qty \*\/\n {2}lvQty: number;\n {2}\/\*\* ls_parent-qty \*\/\n {2}lsParentQty: number;/);
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

/**
 * F (A/B 13.10.2026): U10, U02, U14 and a U01 predicate were refused for Number() on whole numbers
 * (`priority`, `bps`, `caseStep`, date digits). The refusal is right — a TYPE i record component reaches a
 * body as unvalidated text, and `Number('1x')` is NaN, which passes `priority < 1 || priority > 99` — but
 * neither the header nor the refusal said what to write instead, and the header's "on a decimal value"
 * read as permission for whole numbers.
 */
test('F: Number() stays refused on whole numbers too, and the refusal names what to write instead', () => {
  const prep = prepared();
  const guard = guardBodyOf(prep);
  const u = unitOf(prep, 'checkConservation');
  const refused = guard(u.id, "if (Number(args.cvCode.value) > 99) return;", []);
  expect(refused).toContain('whole numbers (TYPE i) included');
  expect(refused).toContain('a text that is no number becomes NaN, which passes every range check');
  expect(refused).toContain("dec.compare(a, b) (< 0, === 0, > 0; exact, throws on a text that is no number), e.g. dec.compare(text ?? '0', '99') > 0");
  expect(refused).toContain('dec.add / dec.sub / dec.mul / dec.div(a, b, places)');
  expect(refused).toContain('check digits with /^\\d+$/.test(text)');
  expect(refused).toContain('new Date(`${y}-${m}-${d}T00:00:00Z`).toJSON()?.slice(0, 10) === `${y}-${m}-${d}`');
  // What the refusal says to write passes the same guards (in the predicate, which has no guard of its own to call).
  const g = guardOf(prep, u.id);
  const instead = [
    "const text = String(values.lvQty ?? '');",
    'if (!/^\\d+$/.test(text)) return false;',
    'const y = text.slice(0, 4); const m = text.slice(4, 6); const d = text.slice(6, 8);',
    'if (new Date(`${y}-${m}-${d}T00:00:00Z`).toJSON()?.slice(0, 10) !== `${y}-${m}-${d}`) return false;',
    "return dec.compare(text, '99') > 0 && !dec.isZero(dec.add(text, '1', 0));",
  ].join('\n');
  expect(guard(g.regionId!, instead, [])).toBeNull();
  // The date check it names is safe on a text that is no date: toJSON is null there, where toISOString throws.
  const isDate = (y: string, m: string, d: string) => new Date(`${y}-${m}-${d}T00:00:00Z`).toJSON()?.slice(0, 10) === `${y}-${m}-${d}`;
  expect([isDate('2024', '02', '29'), isDate('2026', '02', '30'), isDate('2026', '13', '01'), isDate('20a6', '01', '01')]).toEqual([true, false, false, false]);
  // A predicate is held to the same rule.
  expect(guard(g.regionId!, 'return Number(values.lvQty) > Number(values.lsParentQty);', [])).toContain('whole numbers (TYPE i) included');
});

test('F: the Node header says decimals arrive as text, whole numbers as numbers, forbids Number() on any value and names the helpers', () => {
  const node = fillInstructionHeader('node');
  // 3.0.14 item 1: whole numbers are numbers in the scaffold's types, as the header's type line already said of counts.
  expect(node).toContain('- Decimals and digits reach a body as text; whole numbers (TYPE i, counts) are numbers. Never Number(), parseFloat() or parseInt() on any value — NaN passes every range check — nor arithmetic operators on a decimal.');
  expect(node).toContain('- Use dec.compare(a, b) (exact; throws on a non-number), dec.add/sub/mul/div(a, b, places), dec.isZero(a); digits: /^\\d+$/.test(x); a date: new Date(`${y}-${m}-${d}T00:00:00Z`).toJSON()?.slice(0, 10) === `${y}-${m}-${d}`.');
  // The old line ("… on a decimal value") read as permission for Number() on a whole number.
  expect(node).not.toContain('never Number(), parseFloat(), parseInt() or arithmetic operators on a decimal value');
  // RAP has no Number() and no dec.* helpers (scaffold version 6): numbers keep the types the class declares.
  expect(fillInstructionHeader('rap')).toContain('- Numbers keep the types the class declares (packed with its DECIMALS, i, n, d): compute and compare them as the original does, never through text and never TYPE f.');
  expect(fillInstructionHeader('rap')).not.toContain('dec.*');
});

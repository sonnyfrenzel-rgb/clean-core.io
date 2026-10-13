import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { prepareEngineLed, guardBodyOf, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bundleFills, fillInstructionHeader } from '../lib/transformation/fill-prompt';
import { parameterShapes, parametersOf, regionSignature, typeDeclarations, typesText } from '../lib/transformation/type-shapes';

/**
 * Defect D (A/B 13.10.2026): the fill prompt named the types of a signature but
 * never their fields. Claude Haiku declined 14 of 14 fills for that reason;
 * Gemini guessed (`st.gt_effects`, `args.iv_cid`, `sel.p_eff`), and nothing
 * caught it. Now the request carries the shapes, read from the scaffold the
 * body is spliced into, and the body guards refuse a field a parameter's type
 * does not have. Server-free; the fixture is hand-written in the SD program's
 * shape, the refused bodies are cut from the real answers of that A/B.
 */

const source = fs.readFileSync(path.join(__dirname, 'fixtures', 'transformation', 'conservation-shape.abap'), 'utf8');

function prepared(): EngineLedPrepared {
  const prep = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
}

const unitOf = (prep: EngineLedPrepared, fn: string) => prep.plan.units.find((u) => u.fn === fn)!;

test('the declarations come from the scaffold itself: interfaces with their fields, aliases, a class constructor', () => {
  const prep = prepared();
  const decls = typeDeclarations(prep.scaffold.files);
  expect(decls.get('Selection')!.fields).toEqual(['stamp']);
  expect(decls.get('RunState')!.fields).toEqual(['selection', 'records', 'rows', 'result', 'issues', 'notFilled', 'local']);
  expect(decls.get('CheckConservationArgs')!.fields).toEqual(['cvCode']);
  expect(decls.get('StepResult')!.text).toBe('type StepResult = Refusal | void;');
  expect(decls.get('Refusal')!.text).toBe('class Refusal { constructor(errors: RefusalError[]) }');
  // The original's name is kept where the field does not spell it (P_STAMP → stamp).
  expect(decls.get('Selection')!.text).toContain('stamp: string | null; // P_STAMP');
  expect(parametersOf('export function f(sel: Selection, st: RunState, record: Rec | null = null, values: G0024Values): boolean')).toEqual([
    { name: 'sel', type: 'Selection' },
    { name: 'st', type: 'RunState' },
    { name: 'record', type: 'Rec | null' },
    { name: 'values', type: 'G0024Values' },
  ]);
});

test('every fill request carries the types its signature and callees name, down to the last one they name', () => {
  const prep = prepared();
  const u = prep.fillUnits.find((x) => x.unitId === unitOf(prep, 'checkConservation').id)!;
  expect(u.types).toBeDefined();
  for (const decl of ['interface Selection {', 'interface RunState {', 'interface CheckConservationArgs {', 'type StepResult = Refusal | void;', 'class Refusal {', 'interface RefusalError {', 'interface Rec {']) {
    expect(u.types!, decl).toContain(decl);
  }
  expect(u.types!).toContain('cvCode: { value: unknown }; // CV_CODE (CHANGING)');
  // A caller sees its callee's Args: the main path calls checkConservation.
  const caller = prep.fillUnits.find((x) => x.unitId === unitOf(prep, 'runSteps').id)!;
  expect(caller.available.callees.join('\n')).toContain('args: CheckConservationArgs');
  expect(caller.types!).toContain('interface CheckConservationArgs {');
  // The prompt carries it, and the header says what it is for.
  const [b] = bundleFills([u], { track: 'node', program: prep.plan.program, context: 'x' });
  expect(b.prompt).toContain('"types":"interface Selection {');
  expect(fillInstructionHeader('node')).toContain('"types" of a unit declares every type its signature and callees name: read and write only those fields.');
  expect(fillInstructionHeader('rap')).not.toContain('"types"');
  // The same text the scaffold's declarations give — one source of truth.
  expect(u.types).toBe(typesText(typeDeclarations(prep.scaffold.files), [unitOf(prep, 'checkConservation').signature, ...u.available.callees], ['Dec']));
});

test('a body that reads a field its parameter types do not have is refused — the invented names of the A/B', () => {
  const prep = prepared();
  const guard = guardBodyOf(prep);
  const u = unitOf(prep, 'checkConservation');
  const g = prep.plan.guards.find((x) => x.unitId === u.id)!;
  expect(parameterShapes(typeDeclarations(prep.scaffold.files), regionSignature(prep.scaffold.files, u.id)!)).toEqual({
    sel: ['stamp'],
    st: ['selection', 'records', 'rows', 'result', 'issues', 'notFilled', 'local'],
    args: ['cvCode'],
  });
  const call = `  if (${g.helper}(sel, st, null, { lvQty })) { args.cvCode.value = 'RETURNS_EXCEED_SHIPMENT'; return; }`;
  const body = (effects: string, code: string) => [`const effects = ${effects} as Array<{ eid: string; kind: string; qty: string }>;`, 'for (const parent of effects) {', "  const lvQty = '0';", call, '}', code].join('\n');
  // From the A/B answers: st.gt_effects, args.iv_cid / args.cid, sel.p_eff.
  const invented = guard(u.id, body('st.gt_effects', "args.cv_code = sel.p_eff ?? '';"), []);
  expect(invented).toContain("reads fields its parameters' types do not have:");
  for (const name of ['st.gt_effects', 'args.cv_code', 'sel.p_eff']) expect(invented, name).toContain(name);
  expect(invented).toContain('st: selection, records, rows, result, issues, notFilled, local');
  // The fields that exist pass; a field of a field (st.local.gtEffects) is the owner type's business.
  expect(guard(u.id, body('st.local.gtEffects', "args.cvCode.value = sel.stamp ?? '';"), [])).toBeNull();
  // A name the body declares itself is not the parameter.
  expect(guard(u.id, body('st.local.gtEffects', "{ const sel = { p_eff: 1 }; st.local.x = sel.p_eff; }"), [])).toBeNull();
  // The predicate: values has exactly the keys the check reads; record is Rec.
  const pred = g.regionId!;
  expect(guard(pred, "return dec.compare(String(values.lvQty ?? '0'), '0') > 0;", [])).toBeNull();
  expect(guard(pred, "return dec.compare(String(values.lv_qty ?? '0'), '0') > 0;", [])).toContain('values.lv_qty');
  expect(guard(pred, "return record?.nope === 'SHIP';", [])).toContain('record.nope');
});

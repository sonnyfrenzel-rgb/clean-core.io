import { test, expect } from '@playwright/test';
import { SLICE_DECLARATION_CHARS, sliceFor } from '../lib/transformation';
import { fixture, planOf, poDemo } from './helpers/transformation-scaffold';

/**
 * The ABAP slice of a unit (docs/design/engine-led-transformation.md §8.1): its own lines,
 * folded helpers, the declarations it reads (≤ 1,500 characters), up to three call sites,
 * dropped rules masked — never another routine's body. Server-free.
 */

const lineNumbers = (text: string) => text.split('\n').map((l) => Number(l.slice(0, 4)));

test('a slice holds the routine and its folded helper, numbered as in the original, and nothing of other routines', () => {
  const { facts, plan } = planOf(fixture('co-shape'));
  const allocate = plan.units.find((u) => u.routine === 'ALLOCATE')!;
  const slice = sliceFor(allocate, plan, facts);
  const own = allocate.abap[0];
  const helper = allocate.abap[1];
  const numbers = lineNumbers(slice.text);
  expect(numbers[0]).toBe(own.lineStart);
  expect(numbers).toContain(helper.lineStart);
  expect(slice.text).toContain('FORM allocate.');
  expect(slice.text).toContain('FORM round_cents CHANGING cv_value TYPE p.');
  expect(slice.text).not.toContain('FORM validate_policy');
  expect(slice.text).not.toContain('FORM export_csv');
  // Every line comes from one of the unit's ranges.
  for (const n of numbers) expect(allocate.abap.some((a) => n >= a.lineStart && n <= a.lineEnd)).toBe(true);
  expect(slice.lines).toBe(allocate.abap.reduce((s, a) => s + a.lineEnd - a.lineStart + 1, 0));
});

test('declarations the lines read are included — one level of types followed — within the budget', () => {
  const { facts, plan } = planOf(fixture('co-shape'));
  const validate = plan.units.find((u) => u.routine === 'VALIDATE_POLICY')!;
  const slice = sliceFor(validate, plan, facts);
  expect(slice.declarations).toContain('DATA gt_rcv TYPE ty_rcv_tab.');
  expect(slice.declarations).toContain('TYPES ty_rcv_tab TYPE STANDARD TABLE OF ty_rcv WITH EMPTY KEY.');
  expect(slice.declarations).not.toContain('gv_csv');
  expect(slice.declarations).not.toContain('PARAMETERS');
  expect(slice.declarations.length).toBeLessThanOrEqual(SLICE_DECLARATION_CHARS + 120);

  const many = Array.from({ length: 80 }, (_, i) => `DATA gv_field_number_${i} TYPE c LENGTH 40.`).join('\n');
  const reads = Array.from({ length: 80 }, (_, i) => `  gv_field_number_${i} = 'X'.`).join('\n');
  const big = planOf(`REPORT zfx_decl.\n${many}\nSTART-OF-SELECTION.\n  PERFORM fill_all.\nFORM fill_all.\n${reads}\nENDFORM.\n`);
  const s = sliceFor(big.plan.units[1], big.plan, big.facts);
  expect(s.declarationsCut).toBeGreaterThan(0);
  expect(s.declarations).toContain(`more declarations not shown (budget ${SLICE_DECLARATION_CHARS} characters)`);
  const shown = s.declarations.split('\n').filter((l) => !l.startsWith('*')).join('\n');
  expect(shown.length).toBeLessThanOrEqual(SLICE_DECLARATION_CHARS);
});

test('up to three call sites with their actual parameters', () => {
  const { facts, plan } = planOf(fixture('co-shape'));
  const cell = plan.units.find((u) => u.routine === 'CSV_CELL')!;
  const slice = sliceFor(cell, plan, facts);
  expect(slice.callSites).toHaveLength(3);
  expect(slice.callSites[0].text).toBe("PERFORM csv_cell USING 'Cost center' CHANGING lv_cell");
  expect(slice.callSites.map((c) => c.caller)).toEqual(['EXPORT_CSV', 'EXPORT_CSV', 'WRITE_TOTAL']);
});

test("a dropped rule's lines are masked; the other lines stay", () => {
  const { facts, plan } = planOf(fixture('co-shape'), { decisions: [{ id: 'BR-003', answer: 'drop', note: 'no longer a policy' }] });
  const validate = plan.units.find((u) => u.routine === 'VALIDATE_POLICY')!;
  const slice = sliceFor(validate, plan, facts);
  const rule = plan.rules.find((r) => r.id === 'BR-003')!;
  expect(slice.masked.map((m) => m.line)).toEqual(expect.arrayContaining([rule.ranges[0].lineStart]));
  expect(slice.text).toContain('* [BR-003 dropped by the owner — not carried over]');
  expect(slice.text).not.toContain('IF ls_rcv-quota > 100.');
  expect(slice.text).toContain('IF ls_rcv-kostl = p_sender.');
  const open = planOf(fixture('co-shape'));
  expect(sliceFor(open.plan.units.find((u) => u.routine === 'VALIDATE_POLICY')!, open.plan, open.facts).masked).toEqual([]);
});

test('a comment block is kept as its first line; the orchestrator slice is the event blocks', () => {
  const { facts, plan } = planOf(poDemo());
  for (const u of plan.units) {
    const slice = sliceFor(u, plan, facts);
    const lines = slice.text.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1].slice(5);
      const cur = lines[i].slice(5);
      expect(/^\s*\*/.test(prev) && /^\s*\*/.test(cur) && !cur.includes('dropped by the owner')).toBe(false);
    }
  }
  const orch = sliceFor(plan.units[0], plan, facts);
  expect(orch.text).toContain('START-OF-SELECTION.');
  expect(orch.text).not.toMatch(/^d+ FORM read_requisition./m);
});

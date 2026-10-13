import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { deriveEngineCasesOf } from '../lib/engine-case-provenance';
import { engineCaseGuard, engineCaseScope } from '../lib/transformation/call-contract';
import { candidateFiles } from '../lib/transformation/engine-led';
import { guardUnits, mapEngineFailures } from '../lib/transformation/verify';
import { caseTable, measureReach, prepared, referenceBodies, runChecks, stubBodies } from '../scripts/transformation/reach';
import { reachSources } from '../scripts/transformation/measure-reach';
import { FIXTURES, fixture, poDemo } from './helpers/transformation-scaffold';

/**
 * Owner, 13.10.2026: the engine-led checks must reach the functions the model
 * writes. Measured by mutation (scripts/transformation/reach.ts): a fill region
 * is reached when replacing it alone by a throwing or a wrong-answer mutant
 * changes the verdict of an engine case or probe. Server-free; the engine and
 * probe passes run in the local sandbox (SES), as the verify route runs them.
 *
 * What made the difference, each pinned below:
 *   - a check's predicate is asked directly (`check` in the scaffold's call
 *     contract, op `check` / the `check` fallback of a guard example) where a
 *     request cannot carry the value — SY-SUBRC, a computed decimal, the
 *     record table — and for a RETURN, which no request outcome shows;
 *   - a field symbol's component (`<ls_rcv>-quota > 0`) is a subject a case
 *     can set; a value a skipping check drops is a skipped record, not a
 *     refusal; a RETURN is not expected as a refusal;
 *   - a failing case traced by its line goes back to the unit that writes the
 *     predicate, not to the engine as "ours".
 */

test.describe.configure({ timeout: 300_000 });

const REF = path.join(FIXTURES, 'reference-fills');
const caseOf = (source: string, id: string) => deriveEngineCasesOf(source)!.cases.find((c) => c.id === id)!;

test.describe('the cases ask the predicates the request cannot reach', () => {
  test('CO: SY-SUBRC, the record table and a computed sum are asked of their predicates; the stub predicate fails them', async () => {
    const source = fixture('co-shape');
    const prep = prepared(source);
    const run = await runChecks(prep, source, stubBodies(prep));
    const byId = new Map(run.cases.map((c) => [c.id, c]));
    // TC_ENG_03 sy-subrc <> 0 (G-0047), TC_ENG_05 gt_rcv IS INITIAL (G-0054), TC_ENG_11 lv_sum > 100 (G-0066):
    // "the contract maps no request field" / "internal" before; now the stub's `return false` fails each.
    for (const [id, guard] of [['TC_ENG_03', 'G-0047'], ['TC_ENG_05', 'G-0054'], ['TC_ENG_11', 'G-0066']] as const) {
      expect(byId.get(id)?.status, id).toBe('Failed');
      expect(byId.get(id)?.reason).toContain(`the predicate of ${guard} does not hold; the original's condition holds`);
      expect(byId.get(id)?.scope).toBe('fills');
    }
  });

  test('CO: the reference fills pass every case of the written functions that can run', async () => {
    const source = fixture('co-shape');
    const prep = prepared(source);
    const run = await runChecks(prep, source, referenceBodies(path.join(REF, 'co-shape.json'), prep));
    const t = caseTable(run);
    expect(t.fills.failed).toBe(0);
    expect(t.fills.passed).toBeGreaterThanOrEqual(14);
    expect(t['engine-code'].failed).toBe(0);
  });

  test('a RETURN is asked of its predicate, never expected as a refusal; a field symbol is a subject', () => {
    const pp = fixture('pp-shape');
    const stop = caseOf(pp, 'TC_ENG_01');
    expect(stop.name).toMatch(/is stopped$/);
    expect(stop.engineCase.examples[0].call).toMatchObject({ op: 'check', check: { guard: 'G-0039', holds: true } });
    // `<ls_comp>-bdmng <= 0` (L53): before, no subject and no machine form ("not expressible")
    const skip = deriveEngineCasesOf(pp)!.cases.find((c) => c.engineCase.trace.lines[0]?.start === 53 && c.engineCase.kind === 'guard-breaks-one')!;
    expect(skip.engineCase.examples[0].call).toMatchObject({ op: 'simulate', mode: 'append', set: [{ field: '<LS_COMP>-BDMNG' }], expect: { kind: 'records-delta', delta: 0 } });
    // A value the skipping check drops is a skipped record (CO QUOTA = -99999.99 fails `<ls_rcv>-quota > 0`), not a refusal.
    const co = fixture('co-shape');
    const quotaMax = deriveEngineCasesOf(co)!.cases.find((c) => c.engineCase.kind === 'precision-max' && c.engineCase.trace.field === 'quota')!;
    expect(quotaMax.engineCase.examples[1].call).toMatchObject({ op: 'simulate', mode: 'append', expect: { kind: 'records-delta', delta: 0 } });
    expect(engineCaseScope([stop]).logic).toEqual([stop.id]);
  });

  test('a failing case traced by its line goes back to the unit that writes the predicate', () => {
    const source = fixture('co-shape');
    const prep = prepared(source);
    const files = candidateFiles(prep, new Map());
    const kase = caseOf(source, 'TC_ENG_03');
    expect(engineCaseGuard(kase)).toBe('G-0047');
    const failures = mapEngineFailures(
      [{ id: 'TC_ENG_03', status: 'Failed', message: 'the predicate of G-0047 does not hold' }],
      [{ id: 'TC_ENG_03', ruleId: null, guard: 'G-0047' }],
      prep.fillUnits.map((u) => ({ unitId: u.unitId, rules: u.rules.map((r) => r.id) })),
      guardUnits(files),
    );
    expect(failures.map((f) => f.unitId)).toEqual(['U01']);
  });
});

test.describe('reach of the written functions (mutation)', () => {
  test('CO and PP (with a P_WERKS default in memory): reference fills are reached at 60 % or more; the stub predicate is caught', async () => {
    const sources = reachSources(true);
    for (const key of ['co', 'pp+default']) {
      const s = sources.find((x) => x.key === key)!;
      const prep = prepared(s.source);
      const r = await measureReach(s.label, s.source, 'reference', referenceBodies(s.reference!, prep), { prep });
      expect(r.reached / r.regions, `${key}: ${r.reached}/${r.regions}`).toBeGreaterThanOrEqual(0.6);
      expect(r.valueReached / r.regions, `${key} value: ${r.valueReached}/${r.regions}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  test('the PO demo: without a value for P_BANFN nothing runs; with one in memory the predicates are asked', async () => {
    const po = poDemo();
    const without = await runChecks(prepared(po), po, new Map());
    expect(without.cases.every((c) => c.status === 'Not run')).toBe(true);
    const withDefault = reachSources(true).find((s) => s.key === 'po+default')!;
    const prep = prepared(withDefault.source);
    const run = await runChecks(prep, withDefault.source, stubBodies(prep));
    const failedOnPredicates = run.cases.filter((c) => c.status === 'Failed' && /the predicate of G-\d{4}/.test(c.reason ?? ''));
    expect(failedOnPredicates.length).toBeGreaterThanOrEqual(6);
    expect(fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8')).toBe(po);
  });
});

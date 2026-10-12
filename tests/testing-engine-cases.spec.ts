import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import {
  ENGINE_CASE_PREFIX,
  ENGINE_CASES_FILE,
  countEngineCases,
  deriveEngineCases,
  divRound,
  engineCaseCountsSentence,
  engineCaseOf,
  engineCasePromptSection,
  engineCasesFile,
  roundCommercial,
  withEngineCases,
  type EngineTestCase,
} from '../lib/testing-engine-cases';
import { CASE_ASSESSMENT_WORD, assessCase, assessmentSummary, countAssessments } from '../lib/testing-rule-trace';
import { testFactsOf } from '../lib/delivery-facts';
import { createDeliveryBundle } from '../lib/delivery-package';

/**
 * Roadmap 3.0.12, part C — boundary cases the engine derives from the
 * ORIGINAL's declared types and checks, written by the product, not the model
 * (CO review F04–F09, PP review TC_01/TC_10 and 0.3 kg, SD review). Server-free:
 * hand-written fixtures, no browser, no emulator.
 */

/* ------------------------------------------------------------- fixtures */

/** CO-shaped allocation: a quota of six places, amounts of two, three policy checks. */
const CO = `REPORT zco_allocation.
TYPES: BEGIN OF ty_receiver,
         kostl TYPE kostl,
         quota TYPE p LENGTH 7 DECIMALS 6,
         amount TYPE p LENGTH 8 DECIMALS 2,
       END OF ty_receiver.
DATA: gt_receivers TYPE STANDARD TABLE OF ty_receiver,
      gs_receiver  TYPE ty_receiver,
      gv_total     TYPE p LENGTH 8 DECIMALS 2,
      gv_quota_sum TYPE p LENGTH 7 DECIMALS 6,
      gv_count     TYPE i.
PARAMETERS: p_kokrs TYPE kokrs OBLIGATORY,
            p_gjahr TYPE gjahr,
            p_sender TYPE kostl,
            p_amount TYPE p LENGTH 8 DECIMALS 2.

START-OF-SELECTION.
  IF gt_receivers IS INITIAL.
    MESSAGE e001(zco) WITH 'No receivers'.
    RETURN.
  ENDIF.
  LOOP AT gt_receivers INTO gs_receiver.
    gv_quota_sum = gv_quota_sum + gs_receiver-quota.
  ENDLOOP.
  IF gv_quota_sum > 100.
    MESSAGE e002(zco) WITH 'Quota over 100 %'.
    RETURN.
  ENDIF.
  LOOP AT gt_receivers INTO gs_receiver.
    CHECK gs_receiver-kostl <> p_sender.
    gs_receiver-amount = p_amount * gs_receiver-quota / 100.
    gv_total = gv_total + gs_receiver-amount.
    gv_count = gv_count + 1.
  ENDLOOP.
  WRITE: / gv_total, gv_count.
`;

/** PP-shaped component check: quantities of three places (LENGTH 8 → 15 digits), a plant filter, an upper bound. */
const PP = `REPORT zpp_component_check.
DATA: BEGIN OF gs_comp,
        matnr TYPE matnr,
        werks TYPE werks_d,
        bdmng TYPE p LENGTH 8 DECIMALS 3,
        enmng TYPE menge_d,
      END OF gs_comp.
DATA gt_comp LIKE STANDARD TABLE OF gs_comp.
DATA gv_open(7) TYPE p DECIMALS 3.
DATA gv_status TYPE c LENGTH 4.
PARAMETERS p_budat TYPE budat.

LOOP AT gt_comp INTO gs_comp.
  CHECK gs_comp-werks = '1000'.
  IF gs_comp-bdmng > 99999.
    CONTINUE.
  ENDIF.
  gv_open = gs_comp-bdmng - gs_comp-enmng.
  IF gv_open > '0.300'.
    gv_status = 'OPEN'.
  ELSE.
    gv_status = 'DONE'.
  ENDIF.
ENDLOOP.
`;

/** SD-shaped discount: a rate of two places capped by a constant, a refusal of negative rates. */
const SD = `REPORT zsd_discount.
CONSTANTS gc_max_discount TYPE p LENGTH 3 DECIMALS 2 VALUE '30.00'.
DATA: lv_netwr    TYPE netwr,
      lv_discount TYPE p LENGTH 5 DECIMALS 2,
      lv_rate     TYPE p LENGTH 3 DECIMALS 2,
      lv_qty      TYPE int4.
PARAMETERS: p_vbeln TYPE vbeln_va OBLIGATORY,
            p_rate  TYPE p LENGTH 3 DECIMALS 2.

START-OF-SELECTION.
  IF p_rate > gc_max_discount.
    MESSAGE e010(zsd).
    LEAVE PROGRAM.
  ENDIF.
  IF p_rate < 0.
    MESSAGE e011(zsd).
    RETURN.
  ENDIF.
  lv_rate = p_rate.
  lv_discount = lv_netwr * lv_rate / 100.
`;

const derive = (src: string) => deriveEngineCases(src, deriveBusinessRules(src).rules).cases;
const lineOf = (src: string, n: number) => src.split('\n')[n - 1].trim();
const byKind = (cases: EngineTestCase[], kind: string, field?: string) =>
  cases.filter((c) => c.engineCase.kind === kind && (field === undefined || c.engineCase.trace.field === field));
const one = (cases: EngineTestCase[], kind: string, field?: string) => {
  const hits = byKind(cases, kind, field);
  expect(hits, `${kind} ${field ?? ''}`).toHaveLength(1);
  return hits[0];
};
const expectedFor = (c: EngineTestCase, input: string) => {
  const ex = c.engineCase.examples.find((e) => e.input === input);
  expect(ex, `example "${input}" in ${c.id}`).toBeTruthy();
  return ex!.expected;
};

/** Every value a case holds is Firestore-safe: no `undefined`, no array directly inside an array. */
function firestoreProblems(value: unknown, path = '$', inArray = false): string[] {
  if (value === undefined) return [`${path} is undefined`];
  if (Array.isArray(value)) {
    if (inArray) return [`${path} is an array inside an array`];
    return value.flatMap((v, i) => firestoreProblems(v, `${path}[${i}]`, true));
  }
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => firestoreProblems(v, `${path}.${k}`, false));
  return [];
}

/* -------------------------------------------------------------- decimals */

test.describe('exact decimals', () => {
  test('commercial rounding, half away from zero for both signs, never "-0"', () => {
    expect(roundCommercial('0.005', 2)).toBe('0.01');
    expect(roundCommercial('-0.005', 2)).toBe('-0.01');
    expect(roundCommercial('0.004', 2)).toBe('0.00');
    expect(roundCommercial('-0.004', 2)).toBe('0.00');
    expect(roundCommercial('1.005', 2)).toBe('1.01'); // (1.005).toFixed(2) === '1.00'
    expect(roundCommercial('2.5', 0)).toBe('3'); // banker's rounding would give 2
    expect(roundCommercial('-2.5', 0)).toBe('-3');
    expect(divRound(BigInt(2_000_000), BigInt(3))).toBe(BigInt(666_667));
    expect(divRound(BigInt(-200), BigInt(3))).toBe(BigInt(-67));
  });
});

/* -------------------------------------------------------------------- CO */

test.describe('CO-shaped allocation (P DECIMALS 2 and 6)', () => {
  const cases = derive(CO);

  test('precision: bounds the ABAP way (n bytes hold 2n - 1 digits), rounding, exact sums', () => {
    // quota: LENGTH 7 DECIMALS 6 → 13 digits, 6 after the point.
    expect(expectedFor(one(cases, 'precision-max', 'quota'), 'QUOTA = 9999999.999999')).toBe('accepted; kept exactly as 9999999.999999');
    expect(expectedFor(one(cases, 'precision-overflow', 'quota'), 'QUOTA = 10000000.000000')).toMatch(/^refused as too large for P\(13,6\)/);
    const qArith = one(cases, 'precision-exact-arithmetic', 'quota');
    expect(expectedFor(qArith, 'QUOTA = 2 / 3')).toBe('exactly 0.666667');
    expect(expectedFor(qArith, 'QUOTA = 0.1 + 0.2')).toBe('exactly 0.300000');
    const qRound = one(cases, 'precision-rounding', 'quota');
    expect(expectedFor(qRound, 'QUOTA = -0.0000005')).toBe('kept as -0.000001');

    // amount: LENGTH 8 DECIMALS 2 → 15 digits.
    expect(expectedFor(one(cases, 'precision-max', 'amount'), 'AMOUNT = 9999999999999.99')).toBe('accepted; kept exactly as 9999999999999.99');
    expect(expectedFor(one(cases, 'precision-overflow', 'amount'), 'AMOUNT = 10000000000000.00')).toMatch(/^refused/);
    const aRound = one(cases, 'precision-rounding', 'amount');
    expect(expectedFor(aRound, 'AMOUNT = 0.005')).toBe('kept as 0.01');
    expect(expectedFor(aRound, 'AMOUNT = -0.005')).toBe('kept as -0.01');
    expect(expectedFor(aRound, 'AMOUNT = -0.004')).toBe('kept as 0.00');
    const aArith = one(cases, 'precision-exact-arithmetic', 'amount');
    expect(expectedFor(aArith, 'AMOUNT = 0.1 + 0.2')).toBe('exactly 0.30');
    expect(expectedFor(aArith, 'AMOUNT = 0.4 - 0.1')).toBe('exactly 0.30');
    expect(expectedFor(aArith, 'AMOUNT = 0.3 - 0.2')).toBe('exactly 0.10');

    // the declaration line is the trace
    const t = one(cases, 'precision-max', 'quota').engineCase.trace;
    expect(t.basis).toBe('declared-type');
    expect(t.declaration).toBe('P(13,6)');
    expect(lineOf(CO, t.lines[0].start)).toContain('quota TYPE p LENGTH 7 DECIMALS 6');

    // a constant gets no case; a parameter of type p does
    expect(byKind(cases, 'precision-max', 'p_amount')).toHaveLength(1);
  });

  test('guards: every check that refuses or skips — including the ones without a business rule — gets a negative and an exclusion case', () => {
    const negatives = byKind(cases, 'guard-breaks-one');
    expect(negatives.map((c) => c.engineCase.trace.lines[0].start)).toEqual([18, 25, 30]);

    // BR-001: quota over 100 — the subject's six places decide the boundary
    const quota = negatives.find((c) => c.engineCase.trace.ruleId === 'BR-001')!;
    expect(quota.engineCase.examples[0].input).toMatch(/^GV_QUOTA_SUM = 100\.000001; every other guard satisfied: /);
    expect(quota.engineCase.examples[0].input).toContain('the check at L18 (GT_RECEIVERS filled (not initial))');
    expect(quota.engineCase.examples[0].input).toContain('the check at L30 (GS_RECEIVER-KOSTL different from P_SENDER)');
    expect(quota.engineCase.examples[0].expected).toMatch(/^refused by BR-001 — and by no other check/);
    expect(quota.derivedFrom).toEqual({ kind: 'rule', ref: 'BR-001', lines: [{ start: 25, end: 25 }], quote: 'IF gv_quota_sum > 100.' });

    // no receivers: no business rule (no value in the code), traced by its line
    const empty = negatives.find((c) => c.engineCase.trace.lines[0].start === 18)!;
    expect(empty.engineCase.trace.ruleId).toBeUndefined();
    expect(empty.engineCase.trace.quote).toBe('IF gt_receivers IS INITIAL.');
    expect(empty.engineCase.examples[0].input).toMatch(/^GT_RECEIVERS empty/);
    expect(empty.derivedFrom).toBeUndefined();

    // sender as its own receiver: a CHECK in a loop skips
    const sender = negatives.find((c) => c.engineCase.trace.lines[0].start === 30)!;
    expect(sender.name).toMatch(/is skipped$/);
    expect(sender.engineCase.examples[0].input).toMatch(/^GS_RECEIVER-KOSTL equal to P_SENDER;/);

    // TC_10: the excluded record is necessary to the result
    const exclusion = byKind(cases, 'guard-exclusion-necessary').find((c) => c.engineCase.trace.lines[0].start === 30)!;
    expect(exclusion.engineCase.examples.map((e) => e.expected)).toEqual([
      'A is in the result: one record more than without it',
      'B is excluded: no record more than without it. With B included the count would be one higher — the case fails if the exclusion is lost',
    ]);
    const refusal = byKind(cases, 'guard-exclusion-necessary').find((c) => c.engineCase.trace.ruleId === 'BR-001')!;
    expect(refusal.engineCase.examples.map((e) => e.input)).toEqual([
      expect.stringMatching(/^request R1: GV_QUOTA_SUM = 100\.000001;/),
      'request R2: R1 with GV_QUOTA_SUM = 100.000000 only',
    ]);
    expect(refusal.engineCase.examples[1].expected).toBe('not refused by BR-001: processing goes past L25');
  });

  test('input contract and run identity', () => {
    const empty = one(cases, 'contract-empty-request');
    expect(empty.description).toContain('P_KOKRS (OBLIGATORY, L12)');
    expect(empty.engineCase.trace.lines).toEqual([{ start: 12, end: 12 }]);
    const ints = one(cases, 'contract-integer');
    expect(expectedFor(ints, 'P_GJAHR = "2026x"')).toMatch(/^refused; .* never read as 2026$/);
    expect(expectedFor(ints, 'P_GJAHR = "1.9"')).toMatch(/^refused/);
    expect(expectedFor(ints, 'P_GJAHR = 99999')).toBe('refused: more than 4 digits');
    const nonFinite = one(cases, 'contract-non-finite');
    // record components and inputs — not the working variables gv_total / gv_quota_sum
    expect(nonFinite.engineCase.trace.field).toBe('quota, amount, p_amount');
    expect(expectedFor(nonFinite, 'P_AMOUNT = NaN')).toMatch(/^refused/);
    const nullCase = one(cases, 'contract-null-not-zero');
    expect(expectedFor(nullCase, 'P_AMOUNT missing (null)')).toBe('reported as missing — never computed as 0');
    expect(expectedFor(nullCase, 'P_AMOUNT = 0')).toBe('accepted as the value zero — not as missing');
    const run = one(cases, 'run-identity');
    expect(run.engineCase.examples[0].expected).toBe('two different run ids');
    expect(run.engineCase.trace).toEqual({ basis: 'run-identity', lines: [] });
  });

  test('every case is the engine\'s, traced, uniquely numbered and Firestore-safe', () => {
    expect(cases.map((c) => c.id)).toEqual(cases.map((_, i) => `${ENGINE_CASE_PREFIX}${String(i + 1).padStart(2, '0')}`));
    for (const c of cases) {
      expect(c.origin).toBe('engine');
      expect(c.description).toMatch(/^Derived by Clean-Core\.io from the original, not by the testing model\./);
      expect(engineCaseOf(c as unknown as Record<string, unknown>)).not.toBeNull();
      expect(c.engineCase.examples.length).toBeGreaterThan(0);
      if (c.engineCase.family !== 'run-identity') expect(c.engineCase.trace.lines.length, c.id).toBeGreaterThan(0);
      if (c.engineCase.family === 'guard' || c.engineCase.family === 'precision') expect(c.engineCase.trace.quote, c.id).toBeTruthy();
      expect(JSON.parse(c.testData)).toEqual(c.engineCase.examples);
      expect(firestoreProblems(c)).toEqual([]);
    }
    // deterministic
    expect(derive(CO)).toEqual(cases);
  });
});

/* -------------------------------------------------------------------- PP */

test.describe('PP-shaped quantities (P LENGTH 8 DECIMALS 3)', () => {
  const cases = derive(PP);

  test('LENGTH 8 DECIMALS 3 holds 15 digits: 999999999999.999, not 999999999.999', () => {
    // the bound fits the declaration; the original's upper bound (BR-002, > 99999) then skips the record
    expect(expectedFor(one(cases, 'precision-max', 'bdmng'), 'BDMNG = 999999999999.999')).toBe(
      'fits P(15,3) exactly (999999999999.999), then skipped by BR-002 (gs_comp-bdmng > 99999) as in the original',
    );
    expect(expectedFor(one(cases, 'precision-overflow', 'bdmng'), 'BDMNG = 1000000000000.000')).toMatch(/^refused as too large for P\(15,3\)/);
    // the old form name(7) TYPE p DECIMALS 3: 13 digits
    expect(expectedFor(one(cases, 'precision-max', 'gv_open'), 'GV_OPEN = 9999999999.999')).toBe('accepted; kept exactly as 9999999999.999');
    // 0.3 kg: exact at three places
    const arith = one(cases, 'precision-exact-arithmetic', 'gv_open');
    expect(expectedFor(arith, 'GV_OPEN = 0.1 + 0.2')).toBe('exactly 0.300');
    expect(expectedFor(arith, 'GV_OPEN = 0.4 - 0.1')).toBe('exactly 0.300');
    expect(expectedFor(one(cases, 'precision-rounding', 'bdmng'), 'BDMNG = -0.0005')).toBe('kept as -0.001');
    // a DDIC element (MENGE_D) has places the source does not hold: no precision case, not guessed
    expect(byKind(cases, 'precision-max', 'enmng')).toHaveLength(0);
  });

  test('a plant filter and an upper bound that skip records are isolated one at a time', () => {
    const negatives = byKind(cases, 'guard-breaks-one');
    expect(negatives.map((c) => [c.engineCase.trace.ruleId, c.engineCase.trace.lines[0].start])).toEqual([
      ['BR-001', 14],
      ['BR-002', 15],
    ]);
    const plant = negatives[0];
    expect(plant.engineCase.examples[0].input).toBe("GS_COMP-WERKS = 1001; every other guard satisfied: BR-002 (GS_COMP-BDMNG = 99999.000)");
    expect(plant.engineCase.examples[0].expected).toMatch(/^skipped by BR-001 — and by no other check/);
    const bound = negatives[1];
    // the bound is read at the field's three places: one unit over is 99999.001
    expect(bound.engineCase.examples[0].input).toBe('GS_COMP-BDMNG = 99999.001; every other guard satisfied: BR-001 (GS_COMP-WERKS = 1000)');
    expect(bound.name).toMatch(/is skipped$/);
    const exclusion = byKind(cases, 'guard-exclusion-necessary').find((c) => c.engineCase.trace.ruleId === 'BR-002')!;
    expect(exclusion.engineCase.examples[0].input).toMatch(/^record A appended to a request that passes every check: GS_COMP-BDMNG = 99999\.000;/);
    expect(exclusion.engineCase.examples[1].input).toBe('record B appended instead: identical to A except GS_COMP-BDMNG = 99999.001');
    // in machine form: A appended (+1 record), B appended (skipped, +0)
    expect(exclusion.engineCase.examples.map((e) => e.call)).toEqual([
      { op: 'simulate', mode: 'append', set: [{ field: 'GS_COMP-BDMNG', to: { value: '99999.000' } }], expect: { kind: 'records-delta', delta: 1 } },
      { op: 'simulate', mode: 'append', set: [{ field: 'GS_COMP-BDMNG', to: { value: '99999.001' } }], expect: { kind: 'records-delta', delta: 0 } },
    ]);
  });

  test('an invalid date is refused', () => {
    const dates = one(cases, 'contract-date');
    expect(dates.engineCase.trace.field).toBe('p_budat');
    expect(expectedFor(dates, 'P_BUDAT = 20260230')).toMatch(/^refused: 30 February does not exist/);
    expect(expectedFor(dates, 'P_BUDAT = 20240229')).toMatch(/^accepted/);
  });
});

/* -------------------------------------------------------------------- SD */

test.describe('SD-shaped discount', () => {
  const cases = derive(SD);

  test('a cap read through a constant is a guard with the constant\'s value', () => {
    const negatives = byKind(cases, 'guard-breaks-one');
    const capCase = negatives.find((c) => c.engineCase.trace.ruleId === 'BR-001')!;
    expect(capCase.engineCase.examples[0].input).toBe('P_RATE = 30.01; every other guard satisfied: the check at L15 (P_RATE = 0.00)');
    const negative = negatives.find((c) => c.engineCase.trace.lines[0].start === 15)!;
    expect(negative.engineCase.trace.ruleId).toBeUndefined();
    expect(negative.engineCase.examples[0].input).toBe('P_RATE = -0.01; every other guard satisfied: BR-001 (P_RATE = 30.00)');
    const r2 = byKind(cases, 'guard-exclusion-necessary').find((c) => c.engineCase.trace.ruleId === 'BR-001')!;
    expect(r2.engineCase.examples[1]).toMatchObject({ input: 'request R2: R1 with P_RATE = 30.00 only', expected: 'not refused by BR-001: processing goes past L11' });
  });

  test('a value that fits the declaration but breaks a check is expected to be refused by that check', () => {
    const max = one(cases, 'precision-max', 'p_rate');
    expect(expectedFor(max, 'P_RATE = 999.99')).toBe('fits P(5,2) exactly (999.99), then refused by BR-001 (p_rate > gc_max_discount) as in the original');
    expect(expectedFor(max, 'P_RATE = -999.99')).toBe('fits P(5,2) exactly (-999.99), then refused by the check at L15 (p_rate < 0) as in the original');
    const round = one(cases, 'precision-rounding', 'p_rate');
    expect(expectedFor(round, 'P_RATE = 0.005')).toBe('kept as 0.01');
    expect(expectedFor(round, 'P_RATE = -0.005')).toBe('kept as -0.01, then refused by the check at L15 (p_rate < 0) as in the original');
    // the working variable without a check keeps the plain expectation
    expect(expectedFor(one(cases, 'precision-max', 'lv_discount'), 'LV_DISCOUNT = 9999999.99')).toBe('accepted; kept exactly as 9999999.99');
    // the constant itself gets no case
    expect(cases.some((c) => c.engineCase.trace.field === 'gc_max_discount')).toBe(false);
  });
});

/* ------------------------------------------------- suite, prompt, export */

test.describe('the generated suite carries the engine cases', () => {
  const engine = derive(CO);
  const model = [
    { id: 'TC_01', name: 'model case', category: 'Functional', description: 'x', priority: 'High' },
    { id: 'TC_ENG_01', name: 'a model case under an engine id', category: 'Functional', description: 'x', priority: 'High' },
  ];

  test('withEngineCases drops a model case under an engine id, appends the engine cases, and is idempotent', () => {
    const merged = withEngineCases(model, engine);
    expect(merged.map((c) => String(c.id))).toEqual(['TC_01', ...engine.map((c) => c.id)]);
    expect(merged.find((c) => c.id === 'TC_ENG_01')).toBe(engine[0]);
    expect(withEngineCases(merged, engine).map((c) => String(c.id))).toEqual(merged.map((c) => String(c.id)));
  });

  test('model and engine cases are counted apart', () => {
    const counts = countEngineCases(withEngineCases(model, engine) as Array<Record<string, unknown>>);
    expect(counts.model).toBe(1);
    expect(counts.engine).toBe(engine.length);
    expect(counts.byFamily).toEqual({ precision: 20, guard: 6, contract: 4, 'run-identity': 1 });
    expect(engineCaseCountsSentence(counts)).toBe(
      `1 case written by the testing model · ${engine.length} derived by Clean-Core.io from the original (20 precision, 6 guard, 4 input contract, 1 run identity)`,
    );
  });

  test('the prompt asks for the test code under each engine id and forbids listing the cases', () => {
    const node = engineCasePromptSection(engine, 'node');
    for (const c of engine) expect(node).toContain(`  ${c.id} — ${c.name}`);
    expect(node).toContain("test('TC_ENG_01: …', …)");
    expect(node).toContain('Do NOT list these cases under "testCases"');
    expect(node).toContain('never compare binary floats');
    expect(engineCasePromptSection(engine, 'abap-unit')).toContain('methods tc_eng_01_');
    expect(engineCasePromptSection([], 'node')).toBe('');
  });

  test('the export file holds the engine cases as data, the model cases not at all', () => {
    const merged = withEngineCases(model, engine) as Array<Record<string, unknown>>;
    const text = engineCasesFile(merged)!;
    const file = JSON.parse(text);
    expect(file.format).toBe('clean-core.engine-cases/1');
    expect(file.cases.map((c: { id: string }) => c.id)).toEqual(engine.map((c) => c.id));
    const quota = file.cases.find((c: { kind: string; trace: { field?: string } }) => c.kind === 'precision-max' && c.trace.field === 'quota');
    expect(quota.examples[0]).toMatchObject({ input: 'QUOTA = 9999999.999999', expected: 'accepted; kept exactly as 9999999.999999' });
    expect(quota.trace.lines).toEqual([{ start: 4, end: 4 }]);
    expect(engineCasesFile(model)).toBeNull();
  });

  test('the delivery package ships test/engine-cases.json as an engine file and STATUS counts the cases apart', () => {
    const merged = withEngineCases(model, engine) as Array<Record<string, unknown>>;
    const bundle = createDeliveryBundle();
    bundle.file(ENGINE_CASES_FILE, engineCasesFile(merged)!, 'engine');
    expect(bundle.entries.find((e) => e.path === 'test/engine-cases.json')?.origin).toBe('engine');

    const facts = testFactsOf({ testCases: merged } as unknown as Parameters<typeof testFactsOf>[0], []);
    expect(facts.detail).toContain(`Scenarios: 1 case written by the testing model · ${engine.length} derived by Clean-Core.io from the original (20 precision, 6 guard, 4 input contract, 1 run identity).`);

    const page = readFileSync(join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'delivery', 'page.tsx'), 'utf8');
    expect(page).toMatch(/bundle\.file\(ENGINE_CASES_FILE, engineCasesJson, 'engine'\)/);
  });

  test('the generation hook derives the engine cases from the signed source and adds them to the stored list', () => {
    const hook = readFileSync(join(__dirname, '..', 'hooks', 'useTestGeneration.ts'), 'utf8');
    expect(hook).toContain('deriveEngineCases(signed.source, set.rules)');
    expect(hook.match(/\$\{engineAsk\}/g)).toHaveLength(2); // both routes: Node.js and ABAP Unit
    expect(hook).toMatch(/withEngineCases\(\s*modelCases,/);
  });
});

/* ------------------------------------------------------------ assessment */

test.describe('old against new for an engine case', () => {
  const viaModel = { ruleId: 'BR-001', expected: 'GV_QUOTA_SUM = 100.000001 → refused by BR-001', via: 'model-assertion' as const };
  const viaContract = { ...viaModel, via: 'contract' as const };

  test('through the suite the model wrote: a pass is never "unchanged", a failure is red but not a confirmed defect', () => {
    const passed = assessCase({ trace: null, verdict: 'Passed', engine: viaModel });
    expect(passed.value).toBe('passed-model-stated');
    expect(passed.sentence).toContain('not checked against it');
    const failed = assessCase({ trace: null, verdict: 'Failed', engine: viaModel });
    expect(failed.value).toBe('failed-assertion-model-written');
    expect(CASE_ASSESSMENT_WORD[failed.value]).toBe('Failed · assertion model-written');
    expect(failed.sentence).toContain('not a confirmed defect');
    const counts = countAssessments([failed.value, 'defect']);
    expect(counts.failedAssertionModelWritten).toBe(1);
    expect(counts.defect).toBe(1);
    expect(assessmentSummary(counts)).toContain('1 failed with a model-written assertion, not confirmed');
  });

  test('through the call contract: a failure is a defect, a pass is unchanged', () => {
    expect(assessCase({ trace: null, verdict: 'Failed', engine: viaContract }).value).toBe('defect');
    expect(assessCase({ trace: null, verdict: 'Passed', engine: viaContract }).value).toBe('unchanged');
  });

  test('a rule the owner marked to change, and no run', () => {
    expect(assessCase({ trace: null, verdict: 'Failed', engine: viaContract, ruleState: 'change' }).value).toBe('failed-rule-changing');
    expect(assessCase({ trace: null, verdict: 'Failed', engine: { ...viaContract, ruleId: null }, ruleState: 'change' }).value).toBe('defect');
    expect(assessCase({ trace: null, verdict: 'Not run', engine: viaModel }).value).toBe('not-assessable');
  });
});

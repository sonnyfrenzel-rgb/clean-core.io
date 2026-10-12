import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import {
  MAX_GUARD_CASES,
  MAX_PRECISION_CASES,
  deriveEngineCases,
  engineCasesFile,
  engineCasesNotCovered,
  type EngineTestCase,
} from '../lib/testing-engine-cases';
import { CALL_CONTRACT_EXPORTS, CALL_CONTRACT_PATHS, NOT_RUN_NO_CONTRACT, callContractPresence } from '../lib/engine-call-contract';
import { ENGINE_RUNTIME_JS } from '../lib/test-sandbox/engine-runtime';
import { ENGINE_CONTRACT_MARKER, engineRunInputs } from '../lib/test-sandbox/engine-suite';
import { executeSandboxRun } from '../lib/test-sandbox/core';
import { parseTapOutput } from '../lib/test-verdicts';
import { engineVerdicts, mergeEngineVerdicts, planEngineRun } from '../lib/engine-case-run';
import { ENGINE_OUTCOME_MARKER, collectEngineCase, judgeEngineCase, runEngineCase } from '../scripts/acceptance/child/engine-cases-core.mjs';
import { CODE_DRAFT_BUSINESS_RULES } from '../lib/code-draft-rules';
import { testFactsOf } from '../lib/delivery-facts';

/**
 * Owner decisions of 12.10.2026 on the engine cases (roadmap 3.0.12):
 *   1. the generated code exports a fixed call contract (`srv/engine-contract.*`:
 *      CONTRACT, validate, simulate, getRun) and the engine cases run against it
 *      without a model-written assertion — in the acceptance harness's sandbox;
 *   2. (assessment, in testing-engine-cases.spec.ts);
 *   3. caps: 20 precision + 20 guard cases, prioritised; the rest counted in STATUS.
 *
 * Server-free. The packages the runner executes are hand-written fixtures under
 * tests/fixtures/engine-cases/ (ours, hence `--trusted-fixture`); a generated
 * package never gets that flag, and one test shows what happens without it.
 */

const ROOT = path.join(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'acceptance', 'engine-cases.mjs');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'engine-cases');

/** The CO-shaped allocation of testing-engine-cases.spec.ts. */
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

/** A wide program: 9 packed fields (3 of them inputs) and 14 checks (8 with a value in the code). */
const WIDE = [
  'REPORT zwide.',
  'DATA: gv_a TYPE p LENGTH 8 DECIMALS 2,',
  '      gv_b TYPE p LENGTH 8 DECIMALS 2,',
  '      gv_c TYPE p LENGTH 8 DECIMALS 2,',
  '      gv_d TYPE p LENGTH 8 DECIMALS 2,',
  '      gv_e TYPE p LENGTH 8 DECIMALS 2,',
  '      gv_f TYPE p LENGTH 8 DECIMALS 2,',
  '      gt_tab TYPE STANDARD TABLE OF i.',
  'PARAMETERS: p_x TYPE p LENGTH 8 DECIMALS 2,',
  '            p_y TYPE p LENGTH 8 DECIMALS 2,',
  '            p_z TYPE p LENGTH 8 DECIMALS 2.',
  'START-OF-SELECTION.',
  ...Array.from({ length: 6 }, (_, i) => [`  IF gt_tab IS INITIAL.`, `    MESSAGE e00${i}(zw).`, '    RETURN.', '  ENDIF.']).flat(),
  ...Array.from({ length: 8 }, (_, i) => [`  IF p_x > ${100 + i}.`, `    MESSAGE e01${i}(zw).`, '    RETURN.', '  ENDIF.']).flat(),
  '  gv_a = p_x + p_y + p_z.',
].join('\n');

const derive = (src: string) => deriveEngineCases(src, deriveBusinessRules(src).rules);

function runRunner(pkg: string, casesFile: string, extra: string[] = []) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-eng-spec-'));
  try {
    execFileSync(process.execPath, [RUNNER, path.join(FIXTURES, pkg), '--cases', casesFile, '--out', out, '--timeout', '15000', ...extra], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(fs.readFileSync(path.join(out, 'engine-cases-report.json'), 'utf8')) as {
      contract: { path: string | null; present: boolean };
      sandbox: { executed: boolean; mode: string; reason: string };
      summary: { passed: number; failed: number; notRun: number };
      cases: Array<{ id: string; status: string; reason?: string; examples: Array<{ input: string; status: string; evidence: string }> }>;
    };
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ caps */

test.describe('caps: 20 precision and 20 guard cases, prioritised, the rest counted', () => {
  const r = derive(WIDE);
  const guards = r.cases.filter((c) => c.engineCase.family === 'guard');
  const precision = r.cases.filter((c) => c.engineCase.family === 'precision');

  test('at most 20 of each; checks with a business-rule id and selection inputs first', () => {
    expect(MAX_PRECISION_CASES).toBe(20);
    expect(MAX_GUARD_CASES).toBe(20);
    expect(guards).toHaveLength(20);
    expect(precision).toHaveLength(20);
    // 8 checks carry a value in the code (BR ids): all 8 are in, then 2 of the 6 without
    const withId = guards.filter((c) => c.engineCase.trace.ruleId);
    expect(withId).toHaveLength(16);
    expect(new Set(withId.map((c) => c.engineCase.trace.ruleId)).size).toBe(8);
    // the three selection inputs come first, then two working variables
    expect([...new Set(precision.map((c) => c.engineCase.trace.field))]).toEqual(['p_x', 'p_y', 'p_z', 'gv_a', 'gv_b']);
  });

  test('the rest is counted, said in the limits and in STATUS', () => {
    expect(r.notCovered).toEqual({ precision: 16, guard: 8 });
    expect(engineCasesNotCovered(WIDE)).toEqual({ precision: 16, guard: 8 });
    expect(r.limits.join(' ')).toContain('16 precision cases past the first 20 are not covered: gv_c, gv_d, gv_e, gv_f.');
    expect(r.limits.join(' ')).toMatch(/8 guard cases past the first 20 are not covered: the check at L\d+/);
    const facts = testFactsOf({ testCases: r.cases, legacyCode: WIDE } as unknown as Parameters<typeof testFactsOf>[0], []);
    expect(facts.detail).toContain('Engine cases past the caps (20 precision, 20 guard): 24 more not covered — 16 precision, 8 guard.');
  });
});

/* ---------------------------------------------------- calls on the cases */

test.describe('every runnable example carries its machine form', () => {
  const cases = derive(CO).cases;
  const find = (kind: string, pred: (c: EngineTestCase) => boolean = () => true) => cases.find((c) => c.engineCase.kind === kind && pred(c))!;

  test('guards: a refusal names its rule or line and no other rule; a skip is measured by the record count', () => {
    const noReceivers = find('guard-breaks-one', (c) => c.engineCase.trace.lines[0].start === 18);
    expect(noReceivers.engineCase.examples[0].call).toEqual({
      op: 'simulate',
      set: [{ field: 'GT_RECEIVERS', to: { special: 'empty' } }],
      expect: { kind: 'refused', rule: 'L18', field: 'GT_RECEIVERS', notRules: ['BR-001'] },
    });
    const sender = find('guard-breaks-one', (c) => c.engineCase.trace.lines[0].start === 30);
    expect(sender.engineCase.examples[0].call).toEqual({
      op: 'simulate',
      mode: 'append',
      set: [{ field: 'GS_RECEIVER-KOSTL', to: { sameAs: 'P_SENDER' } }],
      expect: { kind: 'records-delta', delta: 0 },
    });
    const quotaR2 = find('guard-exclusion-necessary', (c) => c.engineCase.trace.ruleId === 'BR-001');
    expect(quotaR2.engineCase.examples[1].call).toEqual({
      op: 'simulate',
      set: [{ field: 'GV_QUOTA_SUM', to: { value: '100.000000' } }],
      expect: { kind: 'not-refused-by', rule: 'BR-001', field: 'GV_QUOTA_SUM' },
    });
  });

  test('precision and contract: values as strings, exact normalized values, refusals naming the field', () => {
    const rounding = find('precision-rounding', (c) => c.engineCase.trace.field === 'p_amount');
    expect(rounding.engineCase.examples[1].call).toEqual({
      op: 'validate',
      set: [{ field: 'P_AMOUNT', to: { value: '-0.005' } }],
      expect: { kind: 'accepted', field: 'P_AMOUNT', normalized: '-0.01' },
    });
    const overflow = find('precision-overflow', (c) => c.engineCase.trace.field === 'quota');
    expect(overflow.engineCase.examples[0].call).toEqual({ op: 'validate', set: [{ field: 'QUOTA', to: { value: '10000000.000000' } }], expect: { kind: 'refused', field: 'QUOTA' } });
    // exact arithmetic runs through compute(field, a, op, b), folded over the steps
    const arith = find('precision-exact-arithmetic', (c) => c.engineCase.trace.field === 'quota').engineCase.examples;
    expect(arith[0].call).toEqual({ op: 'compute', compute: { field: 'QUOTA', start: '0.1', steps: [{ op: '+', b: '0.2' }] }, set: [], expect: { kind: 'equals', value: '0.300000' } });
    expect(arith[3].call?.compute?.steps).toHaveLength(9);
    expect(arith[4].call).toMatchObject({ compute: { start: '2', steps: [{ op: '/', b: '3' }] }, expect: { kind: 'equals', value: '0.666667' } });
    // a working variable is no part of a request: its places and bound go through compute too
    const total = find('precision-overflow', (c) => c.engineCase.trace.field === 'gv_total').engineCase.examples[0].call;
    expect(total).toEqual({ op: 'compute', compute: { field: 'GV_TOTAL', start: '10000000000000.00', steps: [{ op: '+', b: '0' }] }, set: [], expect: { kind: 'refused' } });
    expect(find('contract-empty-request').engineCase.examples[0].call).toEqual({ op: 'simulate', mode: 'empty', set: [], expect: { kind: 'not-success' } });
    expect(find('contract-integer').engineCase.examples[2].call).toEqual({ op: 'validate', set: [{ field: 'P_GJAHR', to: { special: 'NaN' } }], expect: { kind: 'refused', field: 'P_GJAHR' } });
    expect(find('contract-null-not-zero').engineCase.examples.find((e) => e.input === 'P_AMOUNT missing (null)')?.call?.expect).toEqual({ kind: 'not-zero', field: 'P_AMOUNT' });
    expect(find('run-identity').engineCase.examples.map((e) => e.call)).toEqual([
      { op: 'run-identity', set: [], expect: { kind: 'distinct-runs' } },
      { op: 'run-identity', set: [], expect: { kind: 'distinct-runs' } },
    ]);
  });
});

/* ------------------------------------------------- the contract and rule 24 */

test.describe('the call contract', () => {
  test('rule 24 asks for it in the code-draft prompt, within the size budget', () => {
    const r = CODE_DRAFT_BUSINESS_RULES;
    expect(r).toContain('24. CALL CONTRACT: also write srv/engine-contract.ts (no server, no I/O on import)');
    for (const part of [
      'CONTRACT = { version: 1, baseRequest',
      'still valid with a copy of its first record appended',
      'validate(request) → { ok, errors: [{ field, rule, message }], normalized }',
      'simulate(request) → { ok, runId, records, errors }',
      'getRun(runId)',
      'compute(field, a, op, b) (+ - * / on decimal strings for every decimal field of FACTS, internal ones too, rounded commercially to its places)',
      'decimals as strings at their places',
    ]) {
      expect(r).toContain(part);
    }
    expect(r.length).toBeLessThan(6_000);
  });

  test('presence is read from the generated files, never by running them', () => {
    const contract = fs.readFileSync(path.join(FIXTURES, 'sound', 'srv', 'engine-contract.mjs'), 'utf8');
    expect(callContractPresence([{ path: 'srv/engine-contract.mjs', content: contract }])).toEqual({ present: true, path: 'srv/engine-contract.mjs', missing: [] });
    expect(callContractPresence([{ path: './srv/engine-contract.ts', content: 'export const CONTRACT = {};\nexport function validate() {}\nexport function simulate() {}' }])).toEqual({
      present: false,
      path: 'srv/engine-contract.ts',
      missing: ['getRun', 'compute'],
    });
    expect(callContractPresence([{ path: 'srv/service.ts', content: 'export function validate() {}' }]).present).toBe(false);
    expect(NOT_RUN_NO_CONTRACT).toBe('Not run — the code does not export the call contract');
  });

  test('one runtime: the runner gets exactly the harness\'s engine-case runtime, and both agree on the contract', () => {
    const core = fs.readFileSync(path.join(ROOT, 'scripts', 'acceptance', 'child', 'engine-cases-core.mjs'), 'utf8').replace(/\r\n/g, '\n');
    // lib/test-sandbox/engine-runtime.ts is generated from it: `node scripts/acceptance/sync-engine-runtime.mjs`
    expect(ENGINE_RUNTIME_JS, 'run node scripts/acceptance/sync-engine-runtime.mjs').toBe(core);
    const list = core.match(/export const CALL_CONTRACT_PATHS = \[([\s\S]*?)\];/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(list).toEqual([...CALL_CONTRACT_PATHS]);
    const exportsList = core.match(/export const CONTRACT_EXPORTS = \[([^\]]*)\];/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(exportsList).toEqual([...CALL_CONTRACT_EXPORTS]);
    expect(core).toContain(`export const NOT_RUN_NO_CONTRACT = '${NOT_RUN_NO_CONTRACT}';`);
    // no imports: it is shipped as one file into the runner's sandbox
    expect(core).not.toMatch(/^\s*import\s/m);
  });
});

/* ------------------------------------------------------------- the judge */

test.describe('the judge: only a structured answer is a verdict', () => {
  const BASE = { amount: '1.00', year: '2026' };
  const FIELDS = { P_AMOUNT: 'amount', P_GJAHR: 'year' };
  type Answer = Record<string, unknown> | (() => never);
  /** A contract whose validate/simulate answers are given per call; the base request always passes. */
  const contract = (opts: { validate?: (r: Record<string, unknown>) => Answer; simulate?: (r: Record<string, unknown>) => Answer; compute?: () => unknown } = {}) => {
    const isBase = (r: Record<string, unknown>) => JSON.stringify(r) === JSON.stringify(BASE);
    const answer = (fn: ((r: Record<string, unknown>) => Answer) | undefined, r: Record<string, unknown>, ok: Record<string, unknown>) => {
      if (isBase(r) || !fn) return ok;
      const a = fn(r);
      return typeof a === 'function' ? a() : a;
    };
    return {
      CONTRACT: { version: 1, baseRequest: BASE, fields: FIELDS },
      validate: (r: Record<string, unknown>) => answer(opts.validate, r, { ok: true, errors: [], normalized: r }),
      simulate: (r: Record<string, unknown>) => answer(opts.simulate, r, { ok: true, runId: 'R1', records: 1, errors: [] }),
      getRun: () => null,
      compute: opts.compute ?? (() => '0'),
    };
  };
  const kase = (call: Record<string, unknown>, more: Array<Record<string, unknown>> = []) => ({ id: 'TC_ENG_01', examples: [{ input: 'x', call }, ...more] });
  const refuseYear = { op: 'validate', set: [{ field: 'P_GJAHR', to: { value: '2026x' } }], expect: { kind: 'refused', field: 'P_GJAHR' } };
  const crash = () => () => {
    throw new TypeError("Cannot read properties of undefined (reading 'trim')");
  };

  test('a throw is a crash, never a refusal (QA 6700520b5295)', async () => {
    const r = await runEngineCase(contract({ validate: crash() }), kase(refuseYear));
    expect(r.status).toBe('Failed');
    expect(r.examples[0].evidence).toContain('threw instead of answering { ok, errors }');
    // a refusal that does not name the expected field is no pass either, and a named one is
    expect((await runEngineCase(contract({ validate: () => ({ ok: false, errors: [{ field: 'amount' }] }) }), kase(refuseYear))).status).toBe('Failed');
    expect((await runEngineCase(contract({ validate: () => ({ ok: false, errors: [{ field: 'year' }] }) }), kase(refuseYear))).status).toBe('Passed');
    // the empty request: a crash is not "not a success"
    const empty = kase({ op: 'simulate', mode: 'empty', set: [], expect: { kind: 'not-success' } });
    expect((await runEngineCase(contract({ simulate: crash() }), empty)).status).toBe('Failed');
    expect((await runEngineCase(contract({ simulate: () => ({ ok: false, errors: [] }) }), empty)).status).toBe('Passed');
  });

  test('compute refuses by throwing an Error; a TypeError is a crash (QA 6700520b5295)', async () => {
    const overflow = kase({ op: 'compute', compute: { field: 'P_AMOUNT', start: '9', steps: [{ op: '+', b: '1' }] }, set: [], expect: { kind: 'refused' } });
    const refusing = await runEngineCase(contract({ compute: () => { throw new Error('P_AMOUNT overflows'); } }), overflow);
    expect(refusing.status).toBe('Passed');
    const crashing = await runEngineCase(contract({ compute: () => { throw new TypeError('x is undefined'); } }), overflow);
    expect(crashing.status).toBe('Failed');
    expect(crashing.examples[0].evidence).toContain('compute crashed');
  });

  test('an accepted case needs ok: true; an answer without ok is not the contract\'s (QA e996eb7b1be9)', async () => {
    const accept = kase({ op: 'validate', set: [{ field: 'P_GJAHR', to: { value: '2024' } }], expect: { kind: 'accepted', field: 'P_GJAHR' } });
    expect((await runEngineCase(contract({ validate: () => ({ errors: [] }) }), accept)).status).toBe('Failed');
    expect((await runEngineCase(contract({ validate: () => ({ ok: 'yes', errors: [] }) }), accept)).status).toBe('Failed');
    expect((await runEngineCase(contract({ validate: crash() }), accept)).status).toBe('Failed');
    expect((await runEngineCase(contract({ validate: (r) => ({ ok: true, errors: [], normalized: r }) }), accept)).status).toBe('Passed');
    // nor is "not refused by" a pass on an answer without ok
    const passing = kase({ op: 'simulate', set: [{ field: 'P_AMOUNT', to: { value: '2.00' } }], expect: { kind: 'not-refused-by', field: 'P_AMOUNT' } });
    expect((await runEngineCase(contract({ simulate: () => ({ runId: 'R2' }) }), passing)).status).toBe('Failed');
  });

  test('the positive control needs simulate to answer ok: true (QA e996eb7b1be9)', async () => {
    const c = contract();
    const shapeless = { ...c, simulate: () => ({ runId: 'R1', records: 1 }) };
    const r = await runEngineCase(shapeless, kase(refuseYear));
    expect(r).toMatchObject({ status: 'Not run' });
    expect(r.reason).toContain("simulate does not answer the contract's baseRequest with ok: true");
  });

  test('a case passes only when every example ran and passed (QA 4596770c4aa0)', async () => {
    const r = await runEngineCase(contract({ validate: () => ({ ok: false, errors: [{ field: 'year' }] }) }), kase(refuseYear, [{ input: 'CSV with only a header', expected: 'refused' }]));
    expect(r.status).toBe('Not run');
    expect(r.reason).toMatch(/^ran in part — 1 of 2 examples passed through the call contract; 1 could not run: not expressible/);
  });

  test('a missing value held as missing must not run as 0 either (QA b6c141d88ccf)', async () => {
    const nullAmount = kase({ op: 'validate', set: [{ field: 'P_AMOUNT', to: { value: null } }], expect: { kind: 'not-zero', field: 'P_AMOUNT' } });
    const keeps = { validate: (r: Record<string, unknown>) => ({ ok: true, errors: [], normalized: r }) };
    // validate keeps null, simulate runs it as if it were 0 — the defect of the fixture before this fix
    const silent = await runEngineCase(contract({ ...keeps, simulate: () => ({ ok: true, runId: 'R2', records: 1, errors: [] }) }), nullAmount);
    expect(silent.status).toBe('Failed');
    expect(silent.examples[0].evidence).toContain('simulate on the same request answered ok: true without naming P_AMOUNT');
    expect((await runEngineCase(contract({ ...keeps, simulate: () => ({ ok: false, errors: [{ field: 'amount', rule: 'missing' }] }) }), nullAmount)).status).toBe('Passed');
    expect((await runEngineCase(contract({ ...keeps, simulate: () => ({ ok: true, runId: 'R2', records: 1, errors: [{ field: 'amount', rule: 'missing' }] }) }), nullAmount)).status).toBe('Passed');
    expect((await runEngineCase(contract({ ...keeps, simulate: crash() }), nullAmount)).status).toBe('Failed');
  });

  test('collected answers are data: the judge keeps only typed fields and its own expectations', async () => {
    const collected = await collectEngineCase(contract(), kase(refuseYear));
    // a forged "pass" in the collected data is not read; only ok/errors are
    const forged = { ...collected, examples: [{ status: 'pass', evidence: 'forged', ok: true }] };
    expect(judgeEngineCase(kase(refuseYear), forged).status).toBe('Failed');
    expect(judgeEngineCase(kase(refuseYear), null)).toMatchObject({ status: 'Not run', reason: 'no positive control was reported' });
  });
});

/* ----------------------------------------------------------- the runner */

test.describe('the runner executes engine cases in the harness sandbox', () => {
  let casesFile = '';
  let dir = '';
  test.beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-eng-cases-'));
    casesFile = path.join(dir, 'engine-cases.json');
    fs.writeFileSync(casesFile, engineCasesFile(derive(CO).cases as unknown as Array<Record<string, unknown>>)!);
  });
  test.afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const status = (r: ReturnType<typeof runRunner>, id: string) => r.cases.find((c) => c.id === id)!;
  const byKind = (kind: string, pred: (c: EngineTestCase) => boolean = () => true) => derive(CO).cases.filter((c) => c.engineCase.kind === kind && pred(c)).map((c) => c.id);

  test('a package that keeps the contract passes every case it can express; the rest say why they did not run', () => {
    const r = runRunner('sound', casesFile, ['--trusted-fixture']);
    expect(r.sandbox).toMatchObject({ executed: true });
    expect(r.contract).toEqual({ path: 'srv/engine-contract.mjs', present: true });
    expect(r.summary.failed).toBe(0);
    for (const id of [
      ...byKind('guard-breaks-one', (c) => !c.engineCase.trace.ruleId),
      ...byKind('guard-exclusion-necessary', (c) => !c.engineCase.trace.ruleId),
      ...byKind('precision-max'),
      ...byKind('precision-overflow'),
      ...byKind('precision-rounding'),
      ...byKind('precision-exact-arithmetic'),
      ...byKind('contract-integer'),
      ...byKind('contract-non-finite'),
      ...byKind('contract-null-not-zero'),
      ...byKind('run-identity'),
    ]) {
      expect(status(r, id).status, id).toBe('Passed');
    }
    // BR-001 reads the quota sum, which is internal to the original: not part of a request
    for (const id of byKind('guard-breaks-one', (c) => c.engineCase.trace.ruleId === 'BR-001')) {
      expect(status(r, id)).toMatchObject({ status: 'Not run', reason: 'the contract marks GV_QUOTA_SUM as internal (not part of a request)' });
    }
    // QA 4596770c4aa0: the JSON example passes, the CSV example has no machine form — the case ran in part, so it is not Passed
    const empty = status(r, byKind('contract-empty-request')[0]);
    expect(empty.status).toBe('Not run');
    expect(empty.reason).toBe(
      "ran in part — 1 of 2 examples passed through the call contract; 1 could not run: not expressible through the call contract — asserted by the model's test only",
    );
    expect(empty.examples.map((e) => e.status)).toEqual(['pass', 'not-runnable']);
    // QA b6c141d88ccf: a missing value is held as missing and the run on it refuses — not computed as 0
    const nulls = status(r, byKind('contract-null-not-zero')[0]).examples.filter((e) => e.input.endsWith('missing (null)'));
    expect(nulls.length).toBeGreaterThan(0);
    for (const e of nulls) expect(e.evidence, e.input).toMatch(/; simulate refuses the request/);
  });

  test('a package that tries to print its way past its failures gets its own verdicts — the harness reads no stdout (QA e1478690996c)', () => {
    const r = runRunner('hostile', casesFile, ['--trusted-fixture']);
    expect(r.sandbox).toMatchObject({ executed: true });
    // it rewrites every "Failed" it sees on stdout into "Passed"; the verdicts are given in the harness process
    expect(status(r, byKind('run-identity')[0]).status).toBe('Failed');
    expect(status(r, byKind('contract-empty-request')[0]).status).toBe('Failed');
    expect(status(r, byKind('precision-overflow', (c) => c.engineCase.trace.field === 'quota')[0]).status).toBe('Failed');
    expect(JSON.stringify(r.cases)).not.toContain('forged');
  });

  test('a package with the reviews\' defects fails them — without a single model-written assertion', () => {
    const r = runRunner('flawed', casesFile, ['--trusted-fixture']);
    expect(r.contract.present).toBe(true);
    const failed = (id: string) => {
      const c = status(r, id);
      expect(c.status, id).toBe('Failed');
      return c.examples.filter((e) => e.status === 'fail').map((e) => e.evidence);
    };
    // no receivers accepted; the sender kept as its own receiver
    expect(failed(byKind('guard-breaks-one', (c) => c.engineCase.trace.lines[0].start === 18)[0])).toEqual(['accepted, expected refused (ok: true; errors: [])']);
    expect(failed(byKind('guard-breaks-one', (c) => c.engineCase.trace.lines[0].start === 30)[0])).toEqual(['3 records, expected 2 (base 2)']);
    // Math.round on a binary float: -0.005 → 0, 1.005 → 1
    const rounding = failed(byKind('precision-rounding', (c) => c.engineCase.trace.field === 'p_amount')[0]);
    expect(rounding).toContain('accepted and held as 0, expected exactly -0.01');
    expect(rounding).toContain('accepted and held as 1, expected exactly 1.01');
    // no bound; parseInt("2026x") === 2026; the empty request a success; a clock-based run id
    expect(failed(byKind('precision-overflow', (c) => c.engineCase.trace.field === 'quota')[0])[0]).toBe('accepted, expected refused (ok: true; errors: [])');
    expect(failed(byKind('contract-integer')[0])).toHaveLength(5);
    expect(failed(byKind('contract-empty-request')[0])).toEqual(['an empty request was answered ok: true (records: 0)']);
    expect(failed(byKind('run-identity')[0])[0]).toMatch(/^two runs in the same millisecond got the same id RUN-\d+$/);
    // binary floating point in compute: 0.1 + 0.2 is not 0.30
    expect(failed(byKind('precision-exact-arithmetic', (c) => c.engineCase.trace.field === 'p_amount')[0])).toContain('0.30000000000000004, expected exactly 0.30');
  });

  test('code without the call contract: every case reads "Not run — the code does not export the call contract"', () => {
    const r = runRunner('no-contract', casesFile, ['--trusted-fixture']);
    expect(r.contract).toEqual({ path: null, present: false });
    expect(r.summary).toEqual({ passed: 0, failed: 0, notRun: r.cases.length });
    for (const c of r.cases) expect(c.reason).toMatch(/^Not run — the code does not export the call contract \(none of srv\/engine-contract\.ts/);
  });

  test('a generated package is not executed where the platform cannot deny network access', () => {
    const r = runRunner('sound', casesFile);
    if (r.sandbox.mode === 'permission-model-with-network-denied') {
      // Node >= 25: the platform itself refuses sockets, so the package may run on the runner's own judgement.
      expect(r.sandbox.executed).toBe(true);
      return;
    }
    expect(r.sandbox.executed).toBe(false);
    expect(r.summary.notRun).toBe(r.cases.length);
    for (const c of r.cases) expect(c.reason).toBe(`Not run — ${r.sandbox.reason}`);
    expect(r.sandbox.reason).toContain('third-party packages are not executed');
  });
});

/* ------------------------------------- the engine pass in the execution core */

test.describe('the engine pass runs through the execution core the isolated runner uses', () => {
  // The core is the same code the runner bundles (lib/test-sandbox/core.ts). Here it runs in this
  // process's child with `allowUnsandboxed` — the emulator path; in a deployment only the runner runs it.
  const cases = derive(CO).cases as unknown as Array<Record<string, unknown>>;
  const filesOf = (fixture: string) => [
    { path: 'srv/engine-contract.mjs', content: fs.readFileSync(path.join(FIXTURES, fixture, 'srv', 'engine-contract.mjs'), 'utf8') },
  ];
  const run = async (fixture: string) => {
    const plan = planEngineRun(cases, filesOf(fixture), null);
    expect(plan.kind).toBe('planned');
    if (plan.kind !== 'planned') throw new Error('no plan');
    const inputs = engineRunInputs(filesOf(fixture), plan.plan.cases, plan.plan.contractModule);
    expect(inputs.files.map((f) => f.path).sort()).toEqual(['__cc_engine/cases.json', '__cc_engine/runtime.mjs', 'srv/engine-contract.mjs']);
    const out = await executeSandboxRun({ files: inputs.files, suiteCode: inputs.suiteCode, patterns: [], allowUnsandboxed: true });
    if (out.kind !== 'ran') throw new Error(`the engine pass did not run: ${JSON.stringify(out).slice(0, 300)}`);
    // judged here, as the route judges it — never read from the run's TAP
    return { stdout: out.stdout, results: engineVerdicts(out.stdout, plan.plan.cases, []) };
  };
  const pass = async (fixture: string) => (await run(fixture)).results;

  test('the sound package: every case passes through the contract, except a check on a value internal to the original', async () => {
    test.setTimeout(120_000);
    const results = await pass('sound');
    const ids = derive(CO).cases.map((c) => c.id);
    expect(results.map((r) => r.id).sort()).toEqual([...ids].sort());
    for (const r of results) expect(r.name, r.id).toContain(ENGINE_CONTRACT_MARKER);
    const skipped = results.filter((r) => r.status !== 'Passed');
    const partial = derive(CO).cases.filter((c) => c.engineCase.kind === 'contract-empty-request').map((c) => c.id);
    expect(skipped.map((r) => [r.id, r.status])).toEqual(
      derive(CO).cases.filter((c) => c.engineCase.trace.ruleId === 'BR-001' || partial.includes(c.id)).map((c) => [c.id, 'Skipped']),
    );
    expect(skipped.find((r) => !partial.includes(r.id))!.message).toContain('the contract marks GV_QUOTA_SUM as internal (not part of a request)');
    expect(skipped.find((r) => partial.includes(r.id))!.message).toContain('ran in part — 1 of 2 examples passed');
  });

  test('code that rewrites its TAP and prints outcome lines of its own does not pass: the outcome lines are judged here (QA e1478690996c)', async () => {
    test.setTimeout(120_000);
    const { stdout, results } = await run('hostile');
    const identity = derive(CO).cases.find((c) => c.engineCase.kind === 'run-identity')!.id;
    const empty = derive(CO).cases.find((c) => c.engineCase.kind === 'contract-empty-request')!.id;
    // the attack works on the TAP: read as before, the clock-based run id "passes"
    expect(parseTapOutput(stdout).find((r) => r.id === identity)?.status).toBe('Passed');
    // judged from the outcome lines it fails, and the case it printed a passing line for is not judged at all
    expect(results.find((r) => r.id === identity)?.status).toBe('Failed');
    expect(results.find((r) => r.id === empty)).toMatchObject({ status: 'Skipped' });
    expect(results.find((r) => r.id === empty)?.message).toContain('reported this case 2 times');
    expect(results.filter((r) => r.status === 'Passed').map((r) => r.id)).not.toContain(empty);
  });

  test('the judge reads only outcome lines, once per case, for the cases the app planned', () => {
    const json = engineCasesFile(cases)!;
    const planned = JSON.parse(json).cases as Array<{ id: string }>;
    const id = planned[0].id;
    const line = (collected: unknown) => `${ENGINE_OUTCOME_MARKER}${JSON.stringify({ id, collected })}`;
    // TAP saying "ok" is no verdict; nothing reported is Not run
    expect(engineVerdicts(`ok 1 - ${id}: ${ENGINE_CONTRACT_MARKER} x\n`, json, [id])).toEqual([
      expect.objectContaining({ id, status: 'Skipped', message: 'Not run through the call contract: the engine pass reported no outcome for this case' }),
    ]);
    // an outcome for a case nobody planned is ignored; a selection limits the verdicts
    expect(engineVerdicts(`${ENGINE_OUTCOME_MARKER}${JSON.stringify({ id: 'TC_ENG_999', collected: {} })}\n`, json, [id]).map((r) => r.id)).toEqual([id]);
    // a control without ok: true is no positive control
    const r = engineVerdicts(`${line({ control: { validate: { ok: true, errors: [] }, simulate: { errors: [], records: 2 } }, examples: [] })}\n`, json, [id]);
    expect(r[0]).toMatchObject({ status: 'Skipped' });
    expect(r[0].message).toContain('does not answer the contract\'s baseRequest with ok: true');
  });

  test('the flawed package fails through the contract, and the contract\'s verdict wins over the model\'s test', async () => {
    test.setTimeout(120_000);
    const results = await pass('flawed');
    const empty = derive(CO).cases.find((c) => c.engineCase.kind === 'contract-empty-request')!.id;
    expect(results.find((r) => r.id === empty)?.status).toBe('Failed');
    // a model test that "passed" the same id is overruled; a model test for a case the contract skipped stays
    const skippedId = results.find((r) => r.status === 'Skipped')!.id;
    const merged = mergeEngineVerdicts(
      [
        { id: empty, name: 'model test', status: 'Passed' },
        { id: skippedId, name: 'model test', status: 'Passed' },
        { id: 'TC_01', name: 'model case', status: 'Passed' },
      ],
      results,
    );
    expect(merged.results.find((r) => r.id === empty)?.status).toBe('Failed');
    expect(merged.results.find((r) => r.id === skippedId)).toMatchObject({ status: 'Passed', name: 'model test' });
    expect(merged.results.find((r) => r.id === 'TC_01')?.status).toBe('Passed');
    expect(merged.viaContract).toContain(empty);
    expect(merged.viaContract).not.toContain(skippedId);
  });

  test('planning: nothing without engine cases or outside the selection; "no contract" when the code lacks it', () => {
    expect(planEngineRun([{ id: 'TC_01' }], filesOf('sound'), null)).toEqual({ kind: 'none' });
    expect(planEngineRun(cases, filesOf('sound'), ['TC_01'])).toEqual({ kind: 'none' });
    const some = planEngineRun(cases, filesOf('sound'), ['TC_01', 'TC_ENG_02']);
    expect(some.kind === 'planned' && some.plan.patterns).toEqual(['TC_ENG_02']);
    expect(planEngineRun(cases, [{ path: 'srv/service.ts', content: '' }], null)).toEqual({ kind: 'no-contract', reason: 'no srv/engine-contract module' });
  });
});

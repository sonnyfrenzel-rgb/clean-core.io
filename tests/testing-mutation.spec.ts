import { test, expect } from '@playwright/test';
import { executeSandboxRun } from '../lib/test-sandbox/core';
import { sandboxFilesFromStoredCode, type SandboxFile } from '../lib/test-sandbox/files';
import { parseTapOutput } from '../lib/test-verdicts';
import { withInvariants } from '../lib/testing-invariants';
import {
  generateMutants,
  isMutationProbeReport,
  mutantOutcome,
  mutationReport,
  probeBasis,
  type MutantExecution,
  type MutantResult,
} from '../lib/testing-mutation';
import { runMutationProbe } from '../lib/testing-mutation-run';
import { isTestRunReceipt, TEST_RUN_RECEIPT_VERSION } from '../lib/test-receipt';
import { FIXED_SERVICE, REVIEWED_SERVICE, RULE_TRACED_SUITE, SELF_CONSISTENT_SUITE, packageOf } from './helpers/fi-worklist-fixture';

/**
 * 3.0.10 (owner 11.10.2026, external review F-05): would a wrong reference or
 * a dropped filter turn a test red? After a passing run the suite runs again
 * against a few deterministic mutants of the code; the report says "the suite
 * catches k of n mutants", names the survivors, and flags a suite that
 * catches none.
 */

test.describe.configure({ timeout: 180_000 });

const reviewedFiles = sandboxFilesFromStoredCode(packageOf(REVIEWED_SERVICE));
const fixedFiles = sandboxFilesFromStoredCode(packageOf(FIXED_SERVICE));

test.describe('mutant generation', () => {
  test('deterministic: the same files give the same mutants, each one change in the code under test', () => {
    const a = generateMutants(reviewedFiles);
    const b = generateMutants(reviewedFiles);
    expect(a.map((m) => [m.id, m.operator, m.line, m.description])).toEqual(b.map((m) => [m.id, m.operator, m.line, m.description]));
    expect(a.length).toBe(6);
    for (const m of a) {
      const changed = m.files.filter((f, i) => f.content !== reviewedFiles[i].content);
      expect(changed.map((f) => f.path)).toEqual(['srv/service.ts']);
    }
  });

  test('the review’s two defect classes are among them: the customer filter read from the request is dropped (F-02), the reference lookup is fixed (F-01)', () => {
    const mutants = generateMutants(reviewedFiles);
    const param = mutants.find((m) => m.operator === 'ignore-request-param' && m.description.includes('kunnr'))!;
    expect(param.description).toBe('the request parameter kunnr is ignored (req.query.kunnr → undefined, 2 places)');
    expect(param.files[0].content).not.toContain('req.query.kunnr');
    const lookup = mutants.find((m) => m.operator === 'constant-lookup')!;
    expect(lookup.description).toContain(".find(i => i.belnr === '1900000001') → [0]");
    expect(lookup.files[0].content).toContain('const referenceItem01 = out[0];');
  });

  test('strings, comments and tests are never mutated', () => {
    const files: SandboxFile[] = [
      { path: 'srv/a.ts', content: "// if (a <= b) continue;\nconst s = 'x <= y';\nexport const f = (a: number) => a;\n" },
      { path: 'test.ts', content: 'if (a <= b) continue;' },
      { path: 'srv/a.test.ts', content: 'if (a <= b) continue;' },
    ];
    expect(generateMutants(files)).toEqual([]);
  });

  test('a fixed number of mutants, spread over the operators', () => {
    const many = Array.from({ length: 20 }, (_, i) => `  if (x${i} <= ${i}) continue;`).join('\n');
    const mutants = generateMutants([{ path: 'srv/a.ts', content: `export function f(xs) {\n  for (const x of xs) {\n${many}\n  }\n}` }], 4);
    expect(mutants.map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(new Set(mutants.map((m) => m.operator))).toEqual(new Set(['drop-guard', 'flip-comparison']));
  });
});

test.describe('the k-of-n report', () => {
  const r = (id: string, outcome: MutantResult['outcome']): MutantResult => ({
    id,
    operator: 'drop-guard',
    file: 'srv/service.ts',
    line: 10,
    description: `mutant ${id}`,
    outcome,
  });

  test('outcomes: failing suite = killed, passing = survived, no compile = invalid, no runner = not run', () => {
    const cases: Array<[MutantExecution, string]> = [
      [{ kind: 'ran', exitCode: 1, failedCases: 1 }, 'killed'],
      [{ kind: 'ran', exitCode: 0, failedCases: 0 }, 'survived'],
      [{ kind: 'build-error' }, 'invalid'],
      [{ kind: 'unavailable', reason: 'x' }, 'not-run'],
    ];
    for (const [execution, outcome] of cases) expect(mutantOutcome(execution)).toBe(outcome);
  });

  test('k of n with the survivors named; invalid and not-run mutants count for nothing', () => {
    const report = mutationReport([r('M1', 'killed'), r('M2', 'survived'), r('M3', 'invalid'), r('M4', 'killed')], '2026-10-11T12:00:00.000Z');
    expect(report).toMatchObject({ v: 1, viable: 3, killed: 2, verdict: 'partly' });
    expect(report.sentence).toBe(
      'The suite catches 2 of 3 mutants of the generated code (1 did not compile and count for nothing). Surviving: M2 — mutant M2 (srv/service.ts:10).',
    );
    expect(isMutationProbeReport(report)).toBe(true);
  });

  test('a suite that catches none is flagged: the tests do not constrain the behaviour', () => {
    const report = mutationReport([r('M1', 'survived'), r('M2', 'survived')], '2026-10-11T12:00:00.000Z');
    expect(report.verdict).toBe('does-not-constrain');
    expect(report.sentence).toContain('the tests do not constrain the behaviour');
    expect(mutationReport([], 'x').verdict).toBe('no-mutants');
    expect(mutationReport([r('M1', 'not-run')], 'x').verdict).toBe('not-run');
    expect(mutationReport([r('M1', 'killed')], 'x').verdict).toBe('constrains');
  });

  test('the probe runs only on a passing run of the whole suite', () => {
    const passing = { exitCode: 0, verdicts: [{ id: 'TC_01', status: 'Passed' }], scope: { selected: null } };
    expect(probeBasis(passing, ['TC_01'])).toEqual({ ok: true });
    expect(probeBasis(null, ['TC_01']).ok).toBe(false);
    expect(probeBasis({ ...passing, exitCode: 1 }, ['TC_01']).ok).toBe(false);
    expect(probeBasis({ ...passing, verdicts: [{ id: 'TC_01', status: 'Failed' }] }, ['TC_01']).ok).toBe(false);
    expect(probeBasis({ ...passing, scope: { selected: ['TC_01'] } }, ['TC_01', 'TC_02'])).toEqual({
      ok: false,
      reason: 'The recorded run covered only some of the cases. Run the whole suite, then probe it.',
    });
    expect(probeBasis({ ...passing, scope: { selected: ['TC_01', 'TC_02'] } }, ['TC_01', 'TC_02'])).toEqual({ ok: true });
  });

  test('the receipt carries the report additively; a malformed one makes the receipt unreadable', () => {
    const receipt = {
      v: TEST_RUN_RECEIPT_VERSION,
      runId: 'r',
      codeDigest: 'c',
      suiteDigest: 's',
      casesDigest: 'k',
      environment: 'mock',
      scope: { selected: null, cases: 1 },
      stubs: [],
      executedAt: '2026-10-11T12:00:00.000Z',
      executedBy: 'u',
      exitCode: 0,
      verdicts: [{ id: 'TC_01', status: 'Passed' }],
    };
    expect(isTestRunReceipt(receipt)).toBe(true);
    expect(isTestRunReceipt({ ...receipt, mutation: mutationReport([r('M1', 'killed')], 'x') })).toBe(true);
    expect(isTestRunReceipt({ ...receipt, mutation: { v: 1, verdict: 'great' } })).toBe(false);
  });

  test('the budget: a mutant not started in time is not run, never caught', async () => {
    let now = 0;
    const report = await runMutationProbe({
      files: reviewedFiles,
      execute: async () => {
        now += 60_000;
        return { kind: 'ran', exitCode: 1, failedCases: 1 };
      },
      clock: () => now,
      budgetMs: 100_000,
      now: () => 'T',
    });
    expect(report.mutants.map((m) => m.outcome)).toEqual(['killed', 'killed', 'not-run', 'not-run', 'not-run', 'not-run']);
    expect(report.sentence).toBe('The suite catches 2 of 2 mutants of the generated code (4 could not be run).');
  });
});

/** The probe as the route runs it, with the sandbox core as the executor. */
async function probe(files: SandboxFile[], suite: string) {
  return runMutationProbe({
    files,
    now: () => '2026-10-11T12:00:00.000Z',
    execute: async (mutated) => {
      const o = await executeSandboxRun({ files: mutated, suiteCode: suite, patterns: [], allowUnsandboxed: true });
      if (o.kind === 'unavailable') return { kind: 'unavailable', reason: o.reason };
      if (o.kind === 'build-error') return { kind: 'build-error' };
      return { kind: 'ran', exitCode: o.exitCode, failedCases: parseTapOutput(o.stdout).filter((v) => v.status === 'Failed').length };
    },
  });
}

test.describe('executed in the sandbox core', () => {
  test('the self-consistency suite of the reviewed kind catches none of the mutants of the fixed service: flagged', async () => {
    const report = await probe(fixedFiles, SELF_CONSISTENT_SUITE);
    expect(report.viable).toBe(6);
    expect(report.killed).toBe(0);
    expect(report.verdict).toBe('does-not-constrain');
    expect(report.sentence).toMatch(/^The suite catches none of the 6 mutants of the generated code: the tests do not constrain the behaviour\. Surviving: M1 — /);
  });

  test('with a rule-traced case and the invariant the same service’s suite catches some, and the survivors are named', async () => {
    const suite = withInvariants(RULE_TRACED_SUITE, [], packageOf(FIXED_SERVICE)).suiteCode;
    const report = await probe(fixedFiles, suite);
    expect(report.killed).toBeGreaterThan(0);
    expect(report.verdict === 'partly' || report.verdict === 'constrains').toBe(true);
    // The dropped customer filter is caught — by the invariant.
    const customerGuard = report.mutants.find((m) => m.operator === 'drop-guard' && m.description.includes('sel.customers'));
    expect(customerGuard?.outcome).toBe('killed');
    for (const m of report.mutants.filter((x) => x.outcome === 'survived')) expect(report.sentence).toContain(`${m.id} — ${m.description}`);
  });
});

import { test, expect } from '@playwright/test';
import { prepareEngineLed, candidateFiles, assembleEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { createRunnerVerifier, type RunnerResult, type VerifyRunAnswer } from '../lib/transformation/verify';
import { engineCaseScope } from '../lib/transformation/call-contract';
import { checkPhrase, checkStateOf, ENGINE_CODE_NOTE, type CheckLike } from '../lib/transformation/check-words';
import type { GenerationRunResult } from '../lib/transformation/orchestrator';
import { deriveEngineCasesOf, engineCaseProvenance } from '../lib/engine-case-provenance';
import { engineVerdicts, planEngineRun } from '../lib/engine-case-run';
import { engineRunInputs } from '../lib/test-sandbox/engine-suite';
import { probeRunInputs, probeVerdicts } from '../lib/test-sandbox/probe-suite';
import { executeSandboxRun } from '../lib/test-sandbox/core';
import { generationRecordOf, storedGenerationRecord, type GenerationRecord } from '../lib/transformation/generation-record';
import { howBuiltLines } from '../lib/delivery-package';
import { judgeControl } from '../scripts/acceptance/child/engine-cases-core.mjs';
import { fixture, poDemo, poDemoWithoutDefault } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.12, step E — the checks of an engine-led generation are counted
 * honestly (server-free):
 *
 *   - three outcomes: passed, failed, not run. On the PO demo without its
 *     P_BANFN DEFAULT (the demo source until 13.10.2026) every engine case is
 *     not run (no valid base value known for P_BANFN); it used to read
 *     "26 run, 0 failed" in green;
 *   - who decides: the probes and the input-contract, decimal and run-identity
 *     cases test engine-written code, and are never said to test the written
 *     functions;
 *   - a base request that throws inside the written functions is their
 *     failure, not "the mapping does not fit the code" — a package whose every
 *     function throws never reads "0 failed".
 *
 * The engine and probe passes run for real here, in the local sandbox, against
 * the scaffold the generation builds — the same derivation the verify route
 * makes (`verifyCandidateResponse`), minus the HTTP.
 */

test.describe.configure({ timeout: 180_000 });

function prepared(source: string): EngineLedPrepared {
  const prep = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
}

/** The verify route's answer for these candidate files, built the way the route builds it. */
async function verifyAnswer(source: string, files: Array<{ path: string; content: string }>): Promise<VerifyRunAnswer> {
  const derivation = deriveEngineCasesOf(source);
  if (!derivation) throw new Error('no derivation');
  const verified = engineCaseProvenance(derivation.cases as unknown as Array<Record<string, unknown>>, derivation).verified;
  const fills = new Set(engineCaseScope(verified).logic);
  const cases = verified.map((c) => ({ id: c.id, ruleId: c.engineCase.trace.ruleId ?? null, scope: fills.has(c.id) ? ('fills' as const) : ('engine-code' as const) }));
  const plan = planEngineRun(verified, files, null);
  if (plan.kind !== 'planned') throw new Error(`no engine plan: ${plan.kind}`);
  const inputs = engineRunInputs(files, plan.plan.cases, plan.plan.contractModule);
  const eng = await executeSandboxRun({ files: inputs.files, suiteCode: inputs.suiteCode, patterns: [], allowUnsandboxed: true, engine: inputs.engine });
  if (eng.kind !== 'ran') throw new Error(`engine pass: ${eng.kind} ${'message' in eng ? eng.message : ''}`);
  const engineResults: RunnerResult[] = engineVerdicts(eng.stdout, plan.plan.cases, plan.plan.patterns).map((r) => ({ id: r.id, status: r.status, message: r.message, ...(r.cause ? { cause: r.cause } : {}) }));
  const probe = probeRunInputs(files);
  let probes: VerifyRunAnswer['probes'] = { ran: false, reason: probe.ok ? 'not run' : probe.reason };
  if (probe.ok) {
    const out = await executeSandboxRun({ files: probe.files, suiteCode: probe.suiteCode, patterns: [], allowUnsandboxed: true, probe: probe.probe });
    if (out.kind === 'ran') probes = { ran: true, results: probeVerdicts(out.stdout, probe.probes), skipped: probe.skipped };
  }
  return { mode: 'verify', buildError: null, engine: { ran: true, results: engineResults, cases }, probes };
}

async function verifyOnce(prep: EngineLedPrepared, source: string, bodies: Map<string, string>) {
  const answer = await verifyAnswer(source, candidateFiles(prep, bodies));
  const verify = createRunnerVerifier({
    candidate: (b) => candidateFiles(prep, b),
    units: prep.fillUnits.map((u) => ({ unitId: u.unitId, rules: u.rules.map((r) => r.id), kind: prep.plan.units.find((p) => p.id === u.unitId)?.kind })),
    runOnRunner: async () => answer,
  });
  const outcome = await verify(bodies, { round: 0, signal: new AbortController().signal });
  return { answer, outcome };
}

const ofKind = (checks: readonly CheckLike[], kind: string): CheckLike[] => checks.filter((c) => c.kind === kind);

test.describe('the PO demo without its P_BANFN DEFAULT: every engine case not run is never "run, 0 failed"', () => {
  test('the gate names the missing base value, the count says not run, and nothing is green', async () => {
    const prep = prepared(poDemoWithoutDefault());
    const { answer, outcome } = await verifyOnce(prep, poDemoWithoutDefault(), new Map());
    expect(answer.engine.ran).toBe(true);
    if (!answer.engine.ran) return;
    const results = answer.engine.results;
    expect(results.length).toBeGreaterThan(5);
    expect(results.every((r) => r.status !== 'Passed' && r.status !== 'Failed')).toBe(true);

    const cases = ofKind(outcome.checks, 'cases');
    expect(cases.map((c) => c.scope).sort()).toEqual(['engine-code', 'fills']);
    for (const c of cases) {
      expect(c.passed).toBe(0);
      expect(c.failed).toBe(0);
      expect(c.notRun).toBe(c.total);
    }
    expect(cases.reduce((n, c) => n + c.total, 0)).toBe(results.length);
    expect(cases.find((c) => c.total > 0)?.notRunReason).toBe('no valid base value known for P_BANFN');
    expect(checkStateOf(cases)).toBe('warning');
    const words = cases.map(checkPhrase).join(' · ');
    expect(words).toContain('not run — no valid base value known for P_BANFN');
    expect(words).not.toMatch(/\d+ run, 0 failed/);
  });

  test('the probes that ran test the engine\'s own code, and are said to', async () => {
    const prep = prepared(poDemoWithoutDefault());
    const { outcome } = await verifyOnce(prep, poDemoWithoutDefault(), new Map());
    const probes = ofKind(outcome.checks, 'probes');
    const engine = probes.find((c) => c.scope === 'engine-code')!;
    const fills = probes.find((c) => c.scope === 'fills')!;
    expect(engine.total).toBeGreaterThan(0);
    expect(engine.passed).toBe(engine.total);
    expect(fills.total).toBe(0);
    expect(checkPhrase(engine)).toBe(`${engine.total} probes of the engine's decimal, CSV and run-store code passed`);
    expect(checkPhrase(fills)).toBe('probes of the written functions: 0 run');
    // All passed, yet nothing of the written functions was tested: not green.
    expect(checkStateOf(probes)).toBe('warning');
  });
});

test.describe('a candidate whose every function throws', () => {
  test('the base request throws in the written functions: counted against them, never "0 failed"', async () => {
    const source = fixture('co-shape');
    const prep = prepared(source);
    const bodies = new Map<string, string>();
    for (const r of prep.scaffold.regions) bodies.set(r.regionId, "throw new Error('written body failed');");
    const { answer, outcome } = await verifyOnce(prep, source, bodies);
    expect(answer.engine.ran).toBe(true);
    if (!answer.engine.ran) return;
    // The judge's own distinction: validate accepted the base request, simulate threw.
    expect(answer.engine.results.some((r) => r.cause === 'base-threw')).toBe(true);
    expect(answer.engine.results.every((r) => !/mapping does not fit/.test(r.message ?? ''))).toBe(true);

    const cases = ofKind(outcome.checks, 'cases');
    const fills = cases.find((c) => c.scope === 'fills')!;
    expect(fills.baseThrew).toContain('written body failed');
    expect(checkStateOf(cases)).toBe('failed');
    expect(cases.map(checkPhrase).join(' · ')).toContain('the base request threw in the written functions (');
    // A failure goes back to a written function, never to the engine as "ours".
    expect(outcome.failures.filter((f) => f.check === 'cases').length).toBeGreaterThan(0);
    expect(outcome.failures.filter((f) => f.check === 'cases').every((f) => f.unitId !== null)).toBe(true);
  });

  test('the gate: missing base value, a throw after an accepted base request, and a refusal are three different reasons', () => {
    expect(judgeControl({ validate: { threw: 'Not run — no valid base value known for P_BANFN' } })).toEqual({ ok: false, reason: 'no valid base value known for P_BANFN' });
    expect(judgeControl({ validate: { ok: true, errors: [] }, simulate: { threw: 'boom' } })).toMatchObject({ ok: false, cause: 'base-threw' });
    const refused = judgeControl({ validate: { ok: true, errors: [] }, simulate: { ok: false, errors: [] } }) as { ok: boolean; reason: string; cause?: string };
    expect(refused.cause).toBeUndefined();
    expect(refused.reason).toMatch(/mapping does not fit the code/);
    // A throw in validate is still the mapping: validate is the engine's input contract.
    expect(judgeControl({ validate: { threw: 'TypeError: x' } })).not.toHaveProperty('cause');
  });
});

test.describe('the record, STATUS.md and TRACE.md say who decided', () => {
  const engineCheck = { kind: 'probes' as const, scope: 'engine-code' as const, total: 5, passed: 5, failed: 0, notRun: 0 };
  const fillsProbe = { kind: 'probes' as const, scope: 'fills' as const, total: 0, passed: 0, failed: 0, notRun: 0 };
  const casesEngine = { kind: 'cases' as const, scope: 'engine-code' as const, total: 20, passed: 0, failed: 0, notRun: 20, notRunReason: 'no valid base value known for P_BANFN' };
  const casesFills = { kind: 'cases' as const, scope: 'fills' as const, total: 6, passed: 0, failed: 0, notRun: 6, notRunReason: 'no valid base value known for P_BANFN' };

  function packageWith(checks: Parameters<typeof assembleEngineLed>[2]['checks']) {
    const prep = prepared(poDemo());
    const result: GenerationRunResult = {
      status: 'partial',
      units: prep.fillUnits.map((u) => ({ unitId: u.unitId, state: 'not-written', body: null, filledBy: 'not-filled', reason: 'not written — test', failures: [], predicates: {} })),
      callsUsed: 0,
      rounds: 0,
      stop: 'passed',
      scaffoldFindings: [],
      checksNotRun: [],
      maxInFlightSeen: 0,
    };
    return assembleEngineLed(prep, result, { checks, budget: 22 });
  }

  test('the split survives the store, and STATUS.md and TRACE.md word it', () => {
    const pkg = packageWith([casesFills, casesEngine, fillsProbe, engineCheck]);
    const record = generationRecordOf({ path: 'engine-led', engine: pkg.summary, basis: [] }) as GenerationRecord;
    expect(record.engine!.checks).toEqual([casesFills, casesEngine, fillsProbe, engineCheck]);
    const stored = storedGenerationRecord({ path: 'engine-led', engine: JSON.parse(JSON.stringify(pkg.summary)) });
    expect(stored!.engine!.checks[0]).toEqual(casesFills);

    const status = howBuiltLines({ ...record, contextDigest: null }).join('\n');
    expect(status).toContain("- Check before saving — 6 engine cases of the written functions not run — no valid base value known for P_BANFN.");
    expect(status).toContain("- Check before saving — 20 engine cases of the engine's input-contract, decimal and run-store code not run — no valid base value known for P_BANFN.");
    expect(status).toContain("- Check before saving — probes of the written functions: 0 run.");
    expect(status).toContain("- Check before saving — 5 probes of the engine's decimal, CSV and run-store code passed.");
    expect(status).toContain(ENGINE_CODE_NOTE);
    expect(status).not.toMatch(/\d+ run, \d+ failed/);

    const trace = pkg.files.find((f) => f.path === 'TRACE.md')!.content;
    expect(trace).toContain("- Check before saving — 5 probes of the engine's decimal, CSV and run-store code passed.");
    expect(trace).toContain('- Check before saving — probes of the written functions: 0 run.');
    expect(trace).toContain(ENGINE_CODE_NOTE);
    expect(trace).not.toMatch(/\d+ run, \d+ failed/);
    const json = JSON.parse(pkg.files.find((f) => f.path === 'traceability.json')!.content) as { generation: { checks: unknown[] } };
    expect(json.generation.checks).toEqual([casesFills, casesEngine, fillsProbe, engineCheck]);
  });

  test('a record stored before the split still renders, and its total is "reported", never "run"', () => {
    const pkg = packageWith([]);
    const old = { ...JSON.parse(JSON.stringify(pkg.summary)), checks: [{ kind: 'cases', total: 26, failed: 0 }, { kind: 'probes', total: 5, failed: 0 }] };
    const stored = storedGenerationRecord({ path: 'engine-led', engine: old });
    expect(stored).not.toBeNull();
    expect(stored!.engine!.checks).toEqual([{ kind: 'cases', total: 26, failed: 0 }, { kind: 'probes', total: 5, failed: 0 }]);
    const status = howBuiltLines(stored).join('\n');
    expect(status).toContain('- Check before saving — engine cases: 26 reported, 0 failed (passed and not run were not counted apart).');
    expect(checkStateOf(stored!.engine!.checks.filter((c) => c.kind === 'cases'))).toBe('warning');
  });
});

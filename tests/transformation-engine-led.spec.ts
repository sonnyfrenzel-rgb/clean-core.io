import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { prepareEngineLed, guardBodyOf, candidateFiles, assembleEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { runGeneration, type FillModel } from '../lib/transformation/orchestrator';
import { createRunnerVerifier } from '../lib/transformation/verify';
import { generatedCodeLints } from '../lib/generated-code-lints';
import { geminiTestStubFillText, GEMINI_TEST_STUB_DECLINE } from '../lib/gemini-test-stub';
import { parseFillAnswer } from '../lib/transformation/fill-prompt';
import { verifyScaffoldDigest } from '../lib/transformation/markers';
import { poDemo, fixture } from './helpers/transformation-scaffold';
import { generationRecordOf, storedGenerationRecord, traceMatchesRecord, type GenerationRecord } from '../lib/transformation/generation-record';
import { generationLine, howBuiltLines } from '../lib/delivery-package';
import { workflowSteps } from '../lib/workflow-steps';

/**
 * Roadmap 3.0.12, step E (server-free): the engine-led generation end to end
 * without a server — plan and scaffold, the fills answered by the Gemini test
 * stub, the body guards, the lints, the final splice and the trace. The
 * rendered half is `tests/transformation-engine-led-rendered.spec.ts`.
 */

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const stubModel: FillModel = async (prompt) => geminiTestStubFillText(prompt);

function prepared(source: string, track: 'node' | 'rap' = 'node'): EngineLedPrepared {
  const prep = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
}

async function generate(prep: EngineLedPrepared, model: FillModel = stubModel, signal?: AbortSignal) {
  const verify = createRunnerVerifier({
    candidate: (bodies) => candidateFiles(prep, bodies),
    units: prep.fillUnits.map((u) => ({ unitId: u.unitId, rules: u.rules.map((r) => r.id) })),
    lint: (files) => generatedCodeLints(files, {}).map((f) => ({ path: f.file, line: f.line, message: f.message })),
  });
  return runGeneration({
    units: prep.fillUnits,
    plan: prep.plan.units,
    bundleOptions: { track: prep.scaffold.track, program: prep.plan.program, context: 'PLATFORM KNOWLEDGE (test)' },
    model,
    guardBody: guardBodyOf(prep),
    verify,
    budget: 48,
    signal,
    sleep: async () => {},
  });
}

test.describe('the engine-led generation, server-free', () => {
  test('the PO demo: a plan, a scaffold, one fill request per function, a lease for the first wave', () => {
    const prep = prepared(poDemo());
    expect(prep.fillUnits.length).toBeGreaterThan(5);
    expect(prep.fillUnits.length).toBe(prep.rows.length);
    expect(prep.plannedCalls).toBeGreaterThanOrEqual(Math.ceil(prep.fillUnits.length / 6));
    expect(prep.plannedCalls).toBeLessThanOrEqual(40);
    expect(prep.facts.units).toBe(prep.fillUnits.length);
    expect(prep.facts.cases).toBeGreaterThan(0);
    for (const u of prep.fillUnits) {
      expect(u.function.signature.length).toBeGreaterThan(0);
      expect(u.abap.text.length).toBeGreaterThan(0);
    }
    // Every row names its lines; the orchestrator says it is the main path.
    expect(prep.rows.every((r) => r.lines.length > 0)).toBe(true);
    expect(prep.rows.some((r) => r.lines === 'main path')).toBe(true);
  });

  test('a source the planner refuses is the fallback reason, never a throw', () => {
    const prep = prepareEngineLed({ source: "REPORT zempty.\nWRITE 'x'.\n", track: 'node', program: null, decisions: [], contextText: '' });
    expect(prep.ok).toBe(false);
    if (!prep.ok) expect(prep.reason.length).toBeGreaterThan(5);
  });

  test('the stub writes every function and every predicate; the package keeps every engine character and carries the trace', async () => {
    const prep = prepared(poDemo());
    const result = await generate(prep);
    expect(result.status).not.toBe('cancelled');
    expect(result.units.every((u) => u.state === 'written')).toBe(true);
    expect(result.maxInFlightSeen).toBeLessThanOrEqual(4);
    const lintChecks = { kind: 'lint' as const, total: 0, failed: 0 };
    const pkg = assembleEngineLed(prep, result, { contextDigest: 'abc', runId: 'run-1', checks: [lintChecks], budget: 48 });
    const paths = pkg.files.map((f) => f.path);
    expect(paths).toContain('traceability.json');
    expect(paths).toContain('TRACE.md');
    expect(paths).toContain('package.json');
    expect(paths).toContain('srv/engine-contract.ts');
    // Nothing outside the fill regions moved.
    const scaffoldFiles = pkg.files.filter((f) => prep.scaffold.files.some((s) => s.path === f.path)).map((f) => ({ ...f, owner: 'engine' as const }));
    expect(verifyScaffoldDigest(scaffoldFiles, prep.scaffold.digest)).toBe(true);
    const trace = JSON.parse(pkg.files.find((f) => f.path === 'traceability.json')!.content);
    expect(trace.contextDigest).toBe('abc');
    expect(trace.runId).toBe('run-1');
    expect(trace.generation.units).toBe(prep.fillUnits.length);
    expect(trace.units.filter((u: { filledBy: string }) => u.filledBy === 'not-filled')).toEqual([]);
    expect(pkg.suite.spec).toContain('node:test');
    expect(pkg.summary.notWritten).toEqual([]);
    expect(pkg.summary.scaffoldDigest).toBe(prep.scaffold.digest);
  });

  test('a declined function stays a stub with the model’s reason, and the generation reads partial (Q4)', async () => {
    const source = poDemo();
    const prep0 = prepared(source);
    // Mark one routine of the demo for the stub to decline.
    const target = prep0.fillUnits.find((u) => u.abap.ranges.length > 0 && u.function.name !== 'runSteps')!;
    const line = target.abap.ranges[0].lineStart;
    const lines = source.split('\n');
    lines.splice(line, 0, `  " ${GEMINI_TEST_STUB_DECLINE}`);
    const prep = prepared(lines.join('\n'));
    const declined = prep.fillUnits.filter((u) => u.abap.text.includes(GEMINI_TEST_STUB_DECLINE));
    expect(declined.length).toBeGreaterThan(0);
    const result = await generate(prep);
    expect(result.status).toBe('partial');
    const pkg = assembleEngineLed(prep, result, { checks: [], budget: 48 });
    expect(pkg.summary.status).toBe('partial');
    expect(pkg.summary.notWritten.map((n) => n.unitId)).toEqual(declined.map((u) => u.unitId));
    expect(pkg.summary.notWritten[0].reason).toMatch(/the model declined/);
    const trace = JSON.parse(pkg.files.find((f) => f.path === 'traceability.json')!.content);
    expect(trace.units.find((u: { unitId: string }) => u.unitId === declined[0].unitId).filledBy).toBe('not-filled');
    expect(pkg.files.find((f) => f.path === 'TRACE.md')!.content).toContain(`Not written: ${declined[0].unitId}`);
    // The stub of the declined function is still the engine's NotImplementedFill.
    const file = pkg.files.find((f) => f.path === declined[0].function.file)!;
    expect(file.content).toContain(`NotImplementedFill('${declined[0].unitId}'`);
  });

  test('cancel aborts the calls in flight and nothing is assembled', async () => {
    const prep = prepared(poDemo());
    const ctrl = new AbortController();
    let calls = 0;
    const slow: FillModel = (prompt, signal) =>
      new Promise((resolve, reject) => {
        calls++;
        if (calls === 2) ctrl.abort();
        const t = setTimeout(() => resolve(geminiTestStubFillText(prompt)), 50);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    const result = await generate(prep, slow, ctrl.signal);
    expect(result.status).toBe('cancelled');
    expect(calls).toBeLessThanOrEqual(4);
  });

  test('the predicates of a unit are asked for, parsed and spliced into their own regions', () => {
    const prep = prepared(fixture('co-shape'));
    const withGuards = prep.fillUnits.find((u) => u.guards.some((g) => g.regionId));
    expect(withGuards, 'the CO-shaped fixture has a unit with a predicate region').toBeTruthy();
    const answer = parseFillAnswer(
      JSON.stringify({ units: [{ unitId: withGuards!.unitId, body: 'return undefined as never;', guards: withGuards!.guards.map((g) => ({ id: g.id, body: 'return false;' })), needs: [] }] }),
      [withGuards!.unitId],
    );
    expect(answer.ok).toBe(true);
    if (answer.ok) expect(Object.keys(answer.units[0].guards ?? {}).length).toBe(withGuards!.guards.filter((g) => g.regionId).length);
  });

  test('the RAP track prepares as well', () => {
    const prep = prepared(poDemo(), 'rap');
    expect(prep.scaffold.track).toBe('rap');
    expect(prep.fillUnits.length).toBeGreaterThan(0);
  });
});

test.describe('STATUS.md says how the code was built (step E)', () => {
  test('engine-led: counts, the stubs with their reasons, the checks; the single call: its note; before 3.0.12: nothing', async () => {
    const prep = prepared(poDemo());
    const result = await generate(prep);
    const pkg = assembleEngineLed(prep, result, { checks: [{ kind: 'lint', total: 2, failed: 2 }], budget: 22 });
    const record = generationRecordOf({ path: 'engine-led', engine: { ...pkg.summary, notWritten: [{ unitId: 'U07', title: 'Upload attachment', reason: 'the model declined: no file API' }], status: 'partial' }, basis: [] });
    expect(record && !('error' in record)).toBe(true);
    const g = { ...(record as GenerationRecord), contextDigest: null };
    expect(generationLine(g)).toContain(`of ${pkg.summary.units} functions written`);
    const lines = howBuiltLines(g).join('\n');
    expect(lines).toContain('## How this code was built');
    expect(lines).toContain('Not written: `U07` Upload attachment — the model declined: no file API');
    expect(lines).toContain('Check before saving — lint checks: 2 findings.');
    expect(lines).not.toMatch(/\d+ run, \d+ failed/);
    expect(lines).toContain('**partial**');
    const single = generationRecordOf({ path: 'single-call', fallbackReason: 'The source holds no routine.' }) as GenerationRecord;
    expect(howBuiltLines({ ...single, contextDigest: null }).join('\n')).toContain('In one model call — the engine could not build a scaffold for this program (The source holds no routine.)');
    expect(howBuiltLines(null)).toEqual([]);
    expect(storedGenerationRecord({ contractId: 'AC-1' })).toBeNull();
    // A record that names no scaffold digests is refused at the store.
    expect(generationRecordOf({ path: 'engine-led', engine: { units: 3 } })).toMatchObject({ error: expect.any(String) });
    // The package's own trace must name the scaffold the record names.
    expect(traceMatchesRecord(pkg.files, record as GenerationRecord)).toBeNull();
    expect(traceMatchesRecord(pkg.files.filter((f) => f.path !== 'traceability.json'), record as GenerationRecord)).toMatch(/no traceability\.json/);
  });

  test('the Transformation phase reads partial when functions stayed stubs (Q4)', () => {
    const base = { legacyCode: 'REPORT z.', generatedCode: JSON.stringify([{ path: 'srv/a.ts', content: 'x' }]), status: 'transformed', solutionDesign: 'd', activeRunId: 'r' };
    const stub = { path: 'engine-led', engine: { status: 'partial', units: 20, notWritten: [{ unitId: 'U07' }] } };
    const t = workflowSteps({ ...base, generationBinding: stub } as never).find((p) => p.key === 'transformation')!;
    expect(t.state === 'partial' || t.state === 'stale').toBe(true);
    if (t.state === 'partial') expect(t.detail).toContain('1 of 20 functions not written');
  });
});

test.describe('the page uses the engine-led path in its order (source)', () => {
  const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
  test('contract → scaffold (worker) → lease → orchestrator → verify → store, with the single call as the fallback', () => {
    const at = (s: string) => {
      const i = page.indexOf(s);
      expect(i, `page.tsx calls ${s}`).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at('fetchGenerationDecision('),
      at('prepareScaffold('),
      at('requestGenerationLease('),
      at('runGeneration('),
      at('assembleEngineLed('),
      at('await store(pkg.files'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).toContain('runSingleCall(');
    expect(page).toContain('createRunnerVerifier(');
    expect(page).toContain('runnerOverHttp(');
    expect(page).toContain('leasedFillModel(');
  });
  test('the scaffold is built off the page’s thread, never with the BPMN map', () => {
    const worker = read('lib/transformation/scaffold.worker.ts');
    expect(worker).toContain('handleScaffoldRequest');
    const job = read('lib/transformation/scaffold-job.ts');
    for (const src of [worker, job, read('lib/transformation/engine-led.ts')]) {
      expect(src).not.toMatch(/from ['"][^'"]*bpmn/);
      expect(src).not.toMatch(/process-documentation(?!-path)/);
    }
  });
  test('cancel really aborts: one AbortController is handed to the orchestrator and the button aborts it', () => {
    expect(page).toMatch(/new AbortController\(\)/);
    expect(page).toMatch(/signal: (?:abort|ctrl|controller)[\w.]*signal/);
    const screen = read('components/transformation/GenerationChain.tsx');
    expect(screen).toContain('onCancel');
    expect(screen).toContain('data-generation-cancel');
  });
});

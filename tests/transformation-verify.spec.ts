import { test, expect } from '@playwright/test';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import {
  PROBE_TEST_PREFIX,
  createRunnerVerifier,
  mapEngineFailures,
  mapLintFindings,
  mapProbeFailures,
  markerSpans,
  runnerOverHttp,
  unitAt,
  type VerifyRunAnswer,
} from '../lib/transformation/verify';
import { PROBE_RUNTIME_JS } from '../lib/test-sandbox/probe-runtime';
import { PROBE_RUNTIME_PATH, PROBE_TEST_PREFIX as SUITE_PREFIX, SANDBOX_PROBES, probeRunInputs } from '../lib/test-sandbox/probe-suite';
import { executeSandboxRun } from '../lib/test-sandbox/core';
import { parseTapOutput } from '../lib/test-verdicts';
import {
  GENERATION_DRAFT_MAX_BYTES,
  REPAIR_DRAFT_VERSION,
  buildGenerationDraft,
  buildRepairDraft,
  computeDraftDigest,
  decideAdoption,
  isIntactRepairDraft,
  type RepairDraft,
} from '../lib/repair-draft';
import { loadDraftForRun, proposeRepairDraft } from '../lib/repair-draft-store';

/**
 * Verify a generation candidate (design §13.1, Track C): failures mapped to
 * functions, the probe pass the runner executes, the generation target of the
 * repair drafts, and verify mode of /api/run-tests. Server-free; the store
 * half runs on the Firestore emulator and skips itself without one.
 */

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'acceptance');
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const STEP = [
  "import { guard_BR_009_G0506 } from '../lib/guards';",
  '/** ABAP L500–L540, BR-009 */',
  'export function validatePolicy(sel, st) {',
  '  const g = guard_BR_009_G0506(sel, st);',
  '  if (g) return g;',
  '  // @cc-fill BEGIN U02 9f2c41d0',
  '  const total = dec.add(a, b);',
  '  return { ok: true, total };',
  '  // @cc-fill END U02',
  '}',
].join('\n');
const FILES = [
  { path: 'srv/steps/02-validate-policy.ts', content: STEP },
  { path: 'srv/lib/decimal.ts', content: 'export const add = (a, b) => a + b;' },
];

test.describe('failures find their function', () => {
  test('a line between a unit\'s markers is that unit\'s; the stub\'s guard lines and the engine files are not', () => {
    const spans = markerSpans(FILES);
    expect(spans).toEqual([{ unitId: 'U02', path: 'srv/steps/02-validate-policy.ts', beginLine: 6, endLine: 9 }]);
    expect(unitAt(spans, 'srv/steps/02-validate-policy.ts', 7)).toBe('U02');
    expect(unitAt(spans, './srv/steps/02-validate-policy.ts', 8)).toBe('U02');
    expect(unitAt(spans, 'srv/steps/02-validate-policy.ts', 4)).toBeNull();
    expect(unitAt(spans, 'srv/steps/02-validate-policy.ts', 6)).toBeNull();
    expect(unitAt(spans, 'srv/lib/decimal.ts', 1)).toBeNull();
    expect(mapLintFindings([{ path: 'srv/steps/02-validate-policy.ts', line: 7, message: 'binary decimals' }, { path: 'srv/lib/decimal.ts', line: 1, message: 'binary decimals' }], spans).map((f) => f.unitId)).toEqual(['U02', null]);
  });

  test('a failing engine case goes to the units that carry its rule; one without a rule is the engine\'s', () => {
    const failures = mapEngineFailures(
      [
        { id: 'TC_ENG_01', status: 'Failed', message: 'expected refusal' },
        { id: 'TC_ENG_02', status: 'Passed' },
        { id: 'TC_ENG_03', status: 'Failed' },
        { id: 'TC_ENG_04', status: 'Failed' },
      ],
      [{ id: 'TC_ENG_01', ruleId: 'BR-009' }, { id: 'TC_ENG_02', ruleId: 'BR-009' }, { id: 'TC_ENG_03', ruleId: null }, { id: 'TC_ENG_04', ruleId: 'BR-077' }],
      [{ unitId: 'U02', rules: ['BR-009', 'BR-010'] }, { unitId: 'U05', rules: ['BR-009'] }],
    );
    expect(failures.map((f) => [f.unitId, f.failure.split(' ')[0]])).toEqual([
      ['U02', 'TC_ENG_01'],
      ['U05', 'TC_ENG_01'],
      [null, 'TC_ENG_03'],
      [null, 'TC_ENG_04'],
    ]);
    expect(failures[0].failure).toBe('TC_ENG_01 (BR-009) failed through the call contract: expected refusal');
  });

  test('a failing probe goes to the unit the adapter names, else to the units filled in the modules it calls', () => {
    const adapter = {
      modules: { steps: 'srv/steps/02-validate-policy.ts', lib: 'srv/lib/decimal.ts' },
      probes: {
        'rounding-commercial': { call: { module: 'steps', export: 'validatePolicy' } },
        'csv-escaping': { call: { module: 'lib', export: 'add' } },
        'display-filter': { unit: 'U07', call: { module: 'lib', export: 'add' } },
      },
    };
    const spans = markerSpans(FILES);
    const out = mapProbeFailures(
      [
        { id: 'PRB_rounding-commercial', status: 'Failed', message: 'got 112.49' },
        { id: 'PRB_csv-escaping', status: 'Failed' },
        { id: 'PRB_display-filter', status: 'Failed' },
        { id: 'PRB_lenient-numeric', status: 'Passed' },
      ],
      adapter,
      spans,
    );
    expect(out.map((f) => f.unitId)).toEqual(['U02', null, 'U07']);
    expect(PROBE_TEST_PREFIX).toBe(SUITE_PREFIX);
  });
});

test.describe('the verifier', () => {
  const units = [{ unitId: 'U02', rules: ['BR-009'] }];
  const candidate = () => FILES;

  test('lints every round, runner failures mapped; an unreachable runner is "not run", never a pass', async () => {
    const answer: VerifyRunAnswer = {
      mode: 'verify',
      buildError: null,
      engine: { ran: true, results: [{ id: 'TC_ENG_01', status: 'Failed' }], cases: [{ id: 'TC_ENG_01', ruleId: 'BR-009' }] },
      probes: { ran: false, reason: 'Failure-pattern probes not run: the candidate has no acceptance-adapter.json.' },
    };
    const verify = createRunnerVerifier({
      candidate,
      units,
      lint: () => [{ path: 'srv/steps/02-validate-policy.ts', line: 7, message: 'binary decimals' }],
      runOnRunner: async () => answer,
    });
    const signal = new AbortController().signal;
    const out = await verify(new Map(), { round: 0, signal });
    expect(out.failures.map((f) => [f.check, f.unitId])).toEqual([['lint', 'U02'], ['cases', 'U02']]);
    expect(out.notRun).toEqual([{ kind: 'probes', reason: answer.probes.ran ? '' : answer.probes.reason }]);

    const down = createRunnerVerifier({ candidate, units, lint: () => [], runOnRunner: async () => { throw new Error('HTTP 503'); } });
    const out2 = await down(new Map(), { round: 0, signal });
    expect(out2.failures).toEqual([]);
    expect(out2.notRun.map((n) => n.kind)).toEqual(['cases', 'probes']);
    expect(out2.notRun[0].reason).toContain('the test runner is not reachable (HTTP 503)');
  });

  test('a candidate that does not compile is one failure, on the unit whose lines the compiler names', async () => {
    const verify = createRunnerVerifier({
      candidate,
      units,
      lint: () => [],
      runOnRunner: async () => ({
        mode: 'verify',
        buildError: 'srv/steps/02-validate-policy.ts:7:9: ERROR: Unexpected ")"',
        engine: { ran: false, reason: 'x' },
        probes: { ran: false, reason: 'y' },
      }),
    });
    const out = await verify(new Map(), { round: 0, signal: new AbortController().signal });
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0]).toMatchObject({ unitId: 'U02', check: 'cases' });
  });

  test('over HTTP: propose the candidate as a generation draft, then run it in verify mode', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const run = runnerOverHttp('P1', async (url, body) => {
      calls.push({ url, body: body as Record<string, unknown> });
      if (url.endsWith('/repair-drafts')) return { status: 200, body: { ok: true, draftId: 'D1' } };
      return { status: 200, body: { mode: 'verify', engine: { ran: false, reason: 'r' }, probes: { ran: false, reason: 'p' } } };
    });
    const answer = await run(FILES, new AbortController().signal);
    expect(answer.mode).toBe('verify');
    expect(calls.map((c) => c.url)).toEqual(['/api/projects/P1/repair-drafts', '/api/run-tests']);
    expect(calls[0].body).toMatchObject({ action: 'propose', target: { kind: 'generation' }, suiteCode: '' });
    expect(JSON.parse(String(calls[0].body.generatedCode))).toEqual(FILES);
    expect(calls[1].body).toEqual({ projectId: 'P1', mode: 'verify', draftId: 'D1' });
  });
});

/* ------------------------------------------------------- the probe pass */

const readPackage = (dir: string) => {
  const out: Array<{ path: string; content: string }> = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push({ path: path.relative(dir, full).replace(/\\/g, '/'), content: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out;
};

test.describe('the probe pass the runner executes', () => {
  test('the probes the runner gets are the acceptance harness\'s probes, word for word', () => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts', 'acceptance', 'lib', 'probes.mjs'), 'utf8').replace(/\r\n/g, '\n');
    expect(PROBE_RUNTIME_JS, 'run node scripts/transformation/sync-probe-runtime.mjs').toBe(source);
    expect(PROBE_RUNTIME_JS).not.toMatch(/^import /m);
  });

  test('the suite imports only the candidate\'s own files, adds the probes, and says what it does not run', () => {
    const files = readPackage(path.join(FIXTURES, 'sound-package'));
    const inputs = probeRunInputs(files);
    expect(inputs.ok).toBe(true);
    if (!inputs.ok) return;
    expect(inputs.probes).toEqual([...SANDBOX_PROBES]);
    expect(inputs.files.map((f) => f.path)).toContain(PROBE_RUNTIME_PATH);
    expect(inputs.suiteCode).toContain('import * as m0 from "./srv/engine.mjs";');
    expect(inputs.skipped.map((s) => s.probe)).toEqual(['import-side-effects']);

    expect(probeRunInputs(files.filter((f) => f.path !== 'acceptance-adapter.json'))).toMatchObject({ ok: false });
    const escaping = files.map((f) =>
      f.path === 'acceptance-adapter.json' ? { ...f, content: JSON.stringify({ modules: { engine: '../../etc/passwd.js' }, probes: { 'rounding-commercial': { call: { module: 'engine', export: 'x' } } } }) } : f,
    );
    expect(probeRunInputs(escaping)).toMatchObject({ ok: false });
  });

  test('in the execution core: the sound package passes every probe, the flawed one fails every probe', async () => {
    test.setTimeout(180_000);
    const run = async (fixture: string) => {
      const inputs = probeRunInputs(readPackage(path.join(FIXTURES, fixture)));
      if (!inputs.ok) throw new Error(inputs.reason);
      const out = await executeSandboxRun({ files: inputs.files, suiteCode: inputs.suiteCode, patterns: [], allowUnsandboxed: true });
      if (out.kind !== 'ran') throw new Error(`the probe pass did not run: ${JSON.stringify(out).slice(0, 400)}`);
      return parseTapOutput(out.stdout).filter((r) => r.id.startsWith(SUITE_PREFIX));
    };
    const sound = await run('sound-package');
    expect(sound.map((r) => [r.id, r.status])).toEqual(SANDBOX_PROBES.map((p) => [`${SUITE_PREFIX}${p}`, 'Passed']));
    const flawed = await run('flawed-package');
    expect(flawed.map((r) => [r.id, r.status])).toEqual(SANDBOX_PROBES.map((p) => [`${SUITE_PREFIX}${p}`, 'Failed']));
  });
});

/* -------------------------------------------- the generation target of drafts */

const PKG = JSON.stringify([
  { path: 'srv/process.ts', content: 'export const run = () => 1;' },
  { path: 'acceptance-adapter.json', content: '{"modules":{}}' },
]);
const project = (over: Record<string, unknown> = {}) => ({ userId: 'owner', activeRunId: 'run-1', generatedCode: 'old', testSuite: { code: 'x' }, ...over });
const actor = { uid: 'owner', now: '2026-10-12T10:00:00.000Z', projectId: 'P1' };

test.describe('a generation candidate as a draft', () => {
  test('cut whole, descending from no stand, intact, version 2', () => {
    const built = buildGenerationDraft({ target: { kind: 'generation' }, generatedCode: PKG, suiteCode: '' }, project(), actor);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const d = { ...built.draft, draftId: 'D1' } as RepairDraft;
    expect(d).toMatchObject({ v: REPAIR_DRAFT_VERSION, target: { kind: 'generation' }, parentDraftId: null, depth: 0 });
    expect(d.parent).toEqual({ runId: 'run-1', codeDigest: null, suiteDigest: null, casesDigest: null });
    expect(isIntactRepairDraft(d)).toBe(true);
    expect(isIntactRepairDraft({ ...d, generatedCode: PKG.replace('1', '2') })).toBe(false);
    // A version-1 generation draft cannot exist.
    expect(isIntactRepairDraft({ ...d, v: 1, draftDigest: computeDraftDigest(d, 1) })).toBe(false);
  });

  test('a version-1 repair draft already on record stays intact; new drafts are version 2', () => {
    const parent = { runId: 'run-1', codeDigest: null, suiteDigest: null, casesDigest: null };
    const built = buildRepairDraft(
      { target: { kind: 'test' }, content: 'test()', expectedCodeDigest: null, expectedSuiteDigest: null },
      { code: '', suite: '', parent, parentDraftId: null, depth: 0 },
      actor,
    );
    if (!built.ok) throw new Error(built.error);
    const v2 = { ...built.draft, draftId: 'D0' };
    expect(v2.v).toBe(2);
    expect(isIntactRepairDraft(v2)).toBe(true);
    // The same draft as version 1 wrote it: its own version in its digest.
    const v1 = { ...v2, v: 1, draftDigest: computeDraftDigest(v2, 1) };
    expect(v1.draftDigest).not.toBe(v2.draftDigest);
    expect(isIntactRepairDraft(v1)).toBe(true);
    // A version it does not know is not read.
    expect(isIntactRepairDraft({ ...v2, v: 3, draftDigest: computeDraftDigest(v2, 3) })).toBe(false);
  });

  test('refused: not a package, empty, too large, or proposed as a repair', () => {
    expect(buildGenerationDraft({ generatedCode: 'export const x = 1;' }, project(), actor)).toMatchObject({ ok: false, code: 'not-a-package' });
    expect(buildGenerationDraft({ generatedCode: ' ' }, project(), actor)).toMatchObject({ ok: false, code: 'empty-candidate' });
    const big = JSON.stringify([{ path: 'a.ts', content: 'x'.repeat(GENERATION_DRAFT_MAX_BYTES) }]);
    expect(buildGenerationDraft({ generatedCode: big }, project(), actor)).toMatchObject({ ok: false, status: 413 });
    const asRepair = buildRepairDraft(
      { target: { kind: 'generation' }, content: PKG, expectedCodeDigest: null, expectedSuiteDigest: null },
      { code: '', suite: '', parent: { runId: null, codeDigest: null, suiteDigest: null, casesDigest: null }, parentDraftId: null, depth: 0 },
      actor,
    );
    expect(asRepair).toMatchObject({ ok: false, code: 'malformed-target' });
  });

  test('never adopted', () => {
    const built = buildGenerationDraft({ generatedCode: PKG }, project(), actor);
    if (!built.ok) throw new Error('x');
    const d = { ...built.draft, draftId: 'D1' };
    const decision = decideAdoption({ draftId: 'D1', expectedDraftDigest: d.draftDigest }, project(), { draft: d, execution: null, adoptedAt: null });
    expect(decision).toMatchObject({ ok: false, status: 409, code: 'generation-not-adoptable' });
  });
});

test.describe('verify mode of /api/run-tests', () => {
  const src = code('app/api/run-tests/route.ts');
  const fn = src.slice(src.indexOf('async function verifyCandidateResponse'));

  test('only a generation candidate, and a candidate only in verify mode', () => {
    expect(src).toMatch(/runRequest\?\.mode === 'verify'[\s\S]{0,120}!draft \|\| !isGenerationDraft\(draft\)/);
    expect(src).toMatch(/if \(draft && isGenerationDraft\(draft\)\) \{[\s\S]{0,200}generation-draft-verify-only/);
    // Verify answers before the project's own run is even prepared.
    expect(src.indexOf("runRequest?.mode === 'verify'")).toBeLessThan(src.indexOf('const storedSuite = projectData.testSuite'));
  });

  test('the cases come from the project\'s source on the server, and nothing is written', () => {
    // QA round 3: planned from the signed source through the provenance brand, as a recorded run is.
    expect(fn).toContain('deriveEngineCasesOf(signedSource)');
    expect(fn).toContain('engineCaseProvenance(');
    expect(fn).toContain('planEngineRun(verified, files, null)');
    expect(fn).toContain('engineVerdicts(engineStdout');
    expect(fn).toContain('signedSourceOf(projectData');
    for (const write of ['recordDraftExecution(', 'recordRunFailure(', 'runTransaction(', 'tx.set(', '.set(', '.update(']) {
      expect(fn, `verify mode writes: ${write}`).not.toContain(write);
    }
    expect(fn).toContain('probeRunInputs(files)');
    expect(fn).toContain("mode: 'mock'");
  });
});

/* -------------------------------------------------- the store, on the emulator */

async function emulatorUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: 8080 });
    s.setTimeout(1000);
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
    s.once('timeout', () => (s.destroy(), resolve(false)));
  });
}
const db = (): Firestore => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

test.describe('generation drafts in the store, against the Firestore emulator', () => {
  test.beforeAll(async () => {
    test.skip(!(await emulatorUp()), 'The Firestore emulator does not answer on 127.0.0.1:8080.');
  });

  test('the owner cuts one and the runner may load it; another account reaches neither', async () => {
    const projectId = `gen-draft-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await db().collection('projects').doc(projectId).set(project());
    const body = { action: 'propose', target: { kind: 'generation' }, generatedCode: PKG, suiteCode: '' };
    const stranger = await proposeRepairDraft(db(), { projectId, uid: 'stranger', body, now: actor.now });
    expect(stranger).toMatchObject({ status: 404 });
    const proposed = await proposeRepairDraft(db(), { projectId, uid: 'owner', body, now: actor.now });
    expect(proposed.status).toBe(200);
    if (!('draft' in proposed)) return;
    expect(proposed.draft.target).toEqual({ kind: 'generation' });
    const loaded = await loadDraftForRun(db(), { projectId, uid: 'owner', draftId: proposed.draft.draftId });
    expect(loaded).toMatchObject({ status: 200, draft: { draftId: proposed.draft.draftId } });
    expect(await loadDraftForRun(db(), { projectId, uid: 'stranger', draftId: proposed.draft.draftId })).toMatchObject({ status: 404 });
    // The project is untouched.
    expect((await db().collection('projects').doc(projectId).get()).data()?.generatedCode).toBe('old');
  });
});

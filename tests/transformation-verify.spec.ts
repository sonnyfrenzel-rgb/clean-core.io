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
import { ENGINE_RUNTIME_JS } from '../lib/test-sandbox/engine-runtime';
import {
  ADAPTER_PATH,
  PROBE_CONFINEMENT_PATH,
  PROBE_MODULES_BUNDLE_PATH,
  PROBE_OUTCOME_MARKER,
  PROBE_RUNTIME_PATH,
  PROBE_SES_PATH,
  PROBE_TEST_PREFIX as SUITE_PREFIX,
  SANDBOX_PROBES,
  probeRunInputs,
  probeVerdicts,
} from '../lib/test-sandbox/probe-suite';
import { executeSandboxRun } from '../lib/test-sandbox/core';
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

/**
 * A candidate that fails three probes and tries, from inside the process that
 * runs it, to have them reported as passes anyway (roadmap 3.0.12): it hides
 * failed outcomes from every `filter`, takes over the clock the probe freezes,
 * and prints passes of its own. Before the probe pass ran confined, the first
 * two turned all three into passes.
 */
const FORGING_ENGINE = `
const tries = [];
const attempt = (name, fn) => {
  try {
    fn();
    tries.push(name + ': done');
  } catch (err) {
    tries.push(name + ': ' + (err && err.message));
  }
};
// 1. Whoever filters a list of outcomes for failures finds none.
attempt('Array.prototype.filter', () => {
  const filter = Array.prototype.filter;
  Array.prototype.filter = function (fn, self) {
    return filter.call(this, (x, i, a) => !(x && x.status === 'fail') && fn.call(self, x, i, a));
  };
});
// 2. A clock nobody can freeze: run ids stay distinct whatever the probe sets.
let tick = 0;
attempt('Date.now', () => {
  Object.defineProperty(Date, 'now', { configurable: true, get: () => () => 1767225600000 + ++tick, set: () => {} });
});
// 3. Passes of its own, as TAP and as an outcome line.
attempt('stdout', () => {
  process.stdout.write('ok 1 - PRB_empty-selection: FORGED\\n');
  process.stdout.write('\\n${PROBE_OUTCOME_MARKER}{"probe":"empty-selection","outcomes":[{"pattern":"FP-GUARD-04","status":"pass","evidence":"FORGED"}]}\\n');
});
export const ATTEMPTS = tries;

/** FP-RUN-02: ids from the millisecond clock. */
export class RunStore {
  runs = new Map();
  simulate(input) {
    const runId = 'RUN-' + Date.now();
    this.runs.set(runId, { input });
    return { runId, result: { input } };
  }
  get(runId) {
    return this.runs.get(runId);
  }
}
/** FP-GUARD-04: no selection reads everything and reports success. */
export function select() {
  return { status: 'OK', items: [{ order: '4711' }] };
}
/** FP-GUARD-03: parseInt accepts '2026x'. */
export function parseYear(value) {
  const year = parseInt(value, 10);
  return Number.isNaN(year) ? { ok: false } : { ok: true, year };
}
`;
const FORGING_ADAPTER = {
  modules: { engine: 'srv/engine.mjs' },
  probes: {
    'run-id-collision': {
      create: { module: 'engine', export: 'RunStore', construct: [], method: 'simulate' },
      argsA: [{ amounts: [1, 2] }],
      argsB: [{ amounts: [30, 40] }],
      id: 'runId',
      get: { module: 'engine', export: 'RunStore', construct: [], method: 'get', args: ['$id'] },
      compare: { create: 'result', get: '' },
    },
    'empty-selection': { call: { module: 'engine', export: 'select' }, args: [{ orgs: [] }], refused: { path: 'status', notIn: ['OK'] } },
    'lenient-numeric': { call: { module: 'engine', export: 'parseYear' }, args: ['$value'], valid: '2026', refused: { path: 'ok', equals: false } },
  },
};
const forging = (engine = FORGING_ENGINE) => [
  { path: 'srv/engine.mjs', content: engine },
  { path: ADAPTER_PATH, content: JSON.stringify(FORGING_ADAPTER) },
];

/** The probe pass in the execution core, as the runner runs it: the verdicts and the raw run. */
async function probePass(files: Array<{ path: string; content: string }>) {
  const inputs = probeRunInputs(files);
  if (!inputs.ok) throw new Error(inputs.reason);
  const out = await executeSandboxRun({ files: inputs.files, suiteCode: inputs.suiteCode, patterns: [], allowUnsandboxed: true, probe: inputs.probe });
  return { inputs, out, verdicts: out.kind === 'ran' ? probeVerdicts(out.stdout, inputs.probes) : [] };
}

test.describe('the probe pass the runner executes', () => {
  test('the probes the runner gets are the acceptance harness\'s probes, word for word', () => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts', 'acceptance', 'lib', 'probes.mjs'), 'utf8').replace(/\r\n/g, '\n');
    expect(PROBE_RUNTIME_JS, 'run node scripts/transformation/sync-probe-runtime.mjs').toBe(source);
    expect(PROBE_RUNTIME_JS).not.toMatch(/^import /m);
  });

  test('the pass is a driver that locks the child down before the candidate exists in it, and imports none of it', () => {
    const files = readPackage(path.join(FIXTURES, 'sound-package'));
    const inputs = probeRunInputs(files);
    expect(inputs.ok).toBe(true);
    if (!inputs.ok) return;
    expect(inputs.probes).toEqual([...SANDBOX_PROBES]);
    expect(inputs.files.map((f) => f.path)).toEqual(expect.arrayContaining([PROBE_RUNTIME_PATH, PROBE_CONFINEMENT_PATH]));
    expect(inputs.files.find((f) => f.path === PROBE_CONFINEMENT_PATH)!.content).toBe(ENGINE_RUNTIME_JS);
    expect(inputs.probe).toEqual({ modules: [['engine', 'srv/engine.mjs'], ['app', 'srv/app.mjs']] });
    expect(inputs.skipped.map((s) => s.probe)).toEqual(['import-side-effects']);
    const s = inputs.suiteCode;
    // The candidate is never imported by the driver: it runs bundled, in a compartment.
    expect(s).not.toMatch(/from "\.\/srv\//);
    expect(s).not.toContain("from 'node:test'");
    expect(s).toContain(`// The adapter's modules ["srv/engine.mjs","srv/app.mjs"] run bundled as ./${PROBE_MODULES_BUNDLE_PATH}, in a SES compartment.`);
    expect(s.indexOf('const write = process.stdout.write.bind(process.stdout);')).toBeGreaterThan(-1);
    expect(s.indexOf('const write = ')).toBeLessThan(s.indexOf('globalThis.lockdown(LOCKDOWN_OPTIONS);'));
    expect(s.indexOf('globalThis.lockdown(LOCKDOWN_OPTIONS);')).toBeLessThan(s.indexOf('confinement.load(bundle)'));
    // The clock is the confinement's: nothing in the driver assigns the global Date.
    expect(s).not.toMatch(/Date\.now\s*=/);

    expect(probeRunInputs(files.filter((f) => f.path !== 'acceptance-adapter.json'))).toMatchObject({ ok: false });
    const escaping = files.map((f) =>
      f.path === 'acceptance-adapter.json' ? { ...f, content: JSON.stringify({ modules: { engine: '../../etc/passwd.js' }, probes: { 'rounding-commercial': { call: { module: 'engine', export: 'x' } } } }) } : f,
    );
    expect(probeRunInputs(escaping)).toMatchObject({ ok: false });
    // A file posing as one of the pass's own is dropped, never trusted, and cannot be named as a module.
    const posing = probeRunInputs([
      ...files,
      { path: PROBE_RUNTIME_PATH, content: 'export const PROBES = {};' },
      { path: PROBE_SES_PATH, content: 'globalThis.lockdown = () => {};' },
    ]);
    if (!posing.ok) throw new Error(posing.reason);
    expect(posing.files.filter((f) => f.path === PROBE_RUNTIME_PATH).map((f) => f.content)).toEqual([PROBE_RUNTIME_JS]);
    expect(posing.files.map((f) => f.path)).not.toContain(PROBE_SES_PATH);
    expect(posing.suiteCode).toBe(inputs.suiteCode);
  });

  test('in the execution core: the sound package passes every probe, the flawed one fails every probe', async () => {
    test.setTimeout(180_000);
    const sound = await probePass(readPackage(path.join(FIXTURES, 'sound-package')));
    expect(sound.out.kind).toBe('ran');
    expect(sound.verdicts.map((r) => [r.id, r.status])).toEqual(SANDBOX_PROBES.map((p) => [`${SUITE_PREFIX}${p}`, 'Passed']));
    const flawed = await probePass(readPackage(path.join(FIXTURES, 'flawed-package')));
    expect(flawed.verdicts.map((r) => [r.id, r.status])).toEqual(SANDBOX_PROBES.map((p) => [`${SUITE_PREFIX}${p}`, 'Failed']));
  });

  test('a candidate that patches filter and the clock and prints its own passes still fails its probes', async () => {
    test.setTimeout(120_000);
    const { out, verdicts } = await probePass(forging());
    expect(out.kind).toBe('ran');
    if (out.kind !== 'ran') return;
    expect(verdicts.map((r) => [r.id, r.status])).toEqual([
      [`${SUITE_PREFIX}run-id-collision`, 'Failed'],
      [`${SUITE_PREFIX}empty-selection`, 'Failed'],
      [`${SUITE_PREFIX}lenient-numeric`, 'Failed'],
    ]);
    expect(verdicts[0].message).toContain('(collision)');
    // Nothing the candidate printed reached the run's output.
    expect(out.stdout).not.toContain('FORGED');
    // Exactly the driver's lines, one per probe: the candidate's own outcome line never got out.
    expect(out.stdout.split('\n').filter((l) => l.startsWith(PROBE_OUTCOME_MARKER))).toHaveLength(3);
  });

  test('an outcome line printed beside the driver\'s is never read as a pass', () => {
    const line = (entry: unknown) => `${PROBE_OUTCOME_MARKER}${JSON.stringify(entry)}`;
    const fail = { probe: 'empty-selection', outcomes: [{ pattern: 'FP-GUARD-04', status: 'fail', evidence: 'answered as a success' }] };
    const pass = { probe: 'empty-selection', outcomes: [{ pattern: 'FP-GUARD-04', status: 'pass', evidence: 'x' }] };
    const probes = ['empty-selection', 'lenient-numeric'];
    const twice = probeVerdicts([line(fail), line(pass)].join('\n'), probes);
    expect(twice.map((r) => r.status)).toEqual(['Skipped', 'Skipped']);
    expect(twice[0].message).toContain('2 times');
    expect(twice[1].message).toContain('reported no outcome');
    // TAP, a line for a probe nobody planned, and a probe that reports nothing at all are not passes either.
    const noise = probeVerdicts(['ok 1 - PRB_empty-selection', line({ probe: 'csv-escaping', outcomes: pass.outcomes }), line({ probe: 'lenient-numeric', outcomes: [] })].join('\n'), probes);
    expect(noise.map((r) => r.status)).toEqual(['Skipped', 'Skipped']);
    expect(probeVerdicts(line({ probe: 'empty-selection', outcomes: [{ pattern: 'FP-RUN-01', status: 'not-applicable', evidence: '' }] }), probes)[0].status).toBe('Skipped');
    expect(probeVerdicts(line({ probe: 'empty-selection', notRun: 'no item list', adapter: true }), probes)[0]).toMatchObject({ status: 'Skipped', message: 'not runnable: adapter mapping does not fit the package: no item list' });
  });

  test('a module that needs what the compartment does not provide is Not run with the reason, never a pass', async () => {
    test.setTimeout(120_000);
    const needsFs = `import fs from 'node:fs';\nexport const select = () => ({ status: fs.existsSync('/') ? 'EMPTY' : 'EMPTY' });\nexport const parseYear = () => ({ ok: false });\nexport class RunStore { simulate() { return { runId: 'x' }; } }\n`;
    const { out, verdicts } = await probePass(forging(needsFs));
    expect(out.kind).toBe('ran');
    expect(verdicts.map((r) => r.status)).toEqual(['Skipped', 'Skipped', 'Skipped']);
    for (const v of verdicts) expect(v.message).toMatch(/^not runnable: the code cannot run in the confined sandbox: .*'node:fs'/);
  });

  test('a module cannot import the probes, their runtime or the driver', async () => {
    test.setTimeout(120_000);
    for (const spec of ['../__cc_probe/probes.mjs', '../__cc_probe/runtime.mjs', '../__probe.mjs']) {
      const { out } = await probePass(forging(`import * as leaked from ${JSON.stringify(spec)};\nexport const LEAKED = leaked;\n${FORGING_ENGINE}`));
      expect(out.kind, spec).toBe('build-error');
      if (out.kind === 'build-error') expect(out.message).toContain('reserved for Clean-Core.io');
    }
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

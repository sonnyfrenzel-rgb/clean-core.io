import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  parseArgs,
  median,
  judgeScenarios,
  diffRows,
  loadPrograms,
  loadSource,
  main,
  harnessNode,
  localVerifyRoute,
  type ProgramEntry,
  type Row,
  type RunRecord,
  type ScenarioFile,
  type SuiteReport,
} from '../scripts/acceptance/suite';

/**
 * The pre-release acceptance suite (scripts/acceptance/suite.ts, roadmap 3.0.13).
 * Server-free: the end-to-end case runs in dry mode on the stub model and the
 * public demo source; nothing here calls a model or needs a key.
 */

const ROOT = path.resolve(__dirname, '..');
const NO_PROBES: RunRecord['probes'] = { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: null, byPattern: {} };

test.describe('acceptance suite', () => {
  test('a real run does not start without token prices, and runs three times by default', () => {
    expect(() => parseArgs(['--mode', 'real'], {})).toThrow(/--price-in and --price-out/);
    const real = parseArgs(['--mode', 'real', '--price-in', '1', '--price-out', '2'], {});
    expect(real.runs).toBe(3);
    expect(real.capUsd).toBe(10);
    expect(parseArgs([], {}).runs).toBe(1);
    expect(parseArgs([], {}).mode).toBe('dry');
    expect(() => parseArgs(['--tracks', 'cap'], {})).toThrow();
  });

  test('median of an odd and an even number of runs', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([])).toBe(0);
  });

  test('a scenario is matched only by an executed check, never by a value in the text', () => {
    const file: ScenarioFile = {
      program: 'x',
      scenarios: [
        { id: 'P1', group: 'probe', title: 't', expectedForm: 'machine', harnessProbe: 'rounding-commercial' },
        { id: 'P2', group: 'probe', title: 't', expectedForm: 'machine', harnessProbe: 'negative-write' },
        { id: 'R1', group: 'reference', title: 't', expectedForm: 'prose' },
        { id: 'R2', group: 'reference', title: 't', expectedForm: 'machine' },
        { id: 'R3', group: 'reference', title: 't', expectedForm: 'machine' },
      ],
    };
    const patterns = { 'rounding-commercial': ['FP-PREC-02'], 'negative-write': ['FP-GUARD-05'] };
    const probes = { ...NO_PROBES, executed: true, byPattern: { 'FP-PREC-02': 'pass', 'FP-GUARD-05': 'fail' } };
    const node = judgeScenarios(file, null, 'node', probes, patterns, { R3: 'pass' });
    expect(node.verdicts).toMatchObject({ P1: 'pass', P2: 'fail', R3: 'pass' });
    expect(node.verdicts.R1).toMatch(/^not-run: prose/);
    expect(node.verdicts.R2).toMatch(/^not-run/);
    expect([node.matched, node.failed, node.notJudged, node.total, node.machine]).toEqual([2, 1, 2, 5, 4]);
    // On the ABAP route a machine scenario needs ABAP Unit in an SAP system: never a pass here.
    const rap = judgeScenarios(file, null, 'rap', probes, patterns);
    expect(rap.matched).toBe(0);
    expect(rap.verdicts.P1).toMatch(/ABAP Unit/);
    // No scenario file: nothing to judge, with the reason.
    expect(judgeScenarios(null, 'holdout: no tuned expectations', 'node', NO_PROBES, patterns)).toMatchObject({ total: 0, note: 'holdout: no tuned expectations' });
  });

  test('the diff against the previous run names a regression as worse', () => {
    const row = (over: Partial<Row>): Row => ({
      program: 'p', track: 'rap', holdout: false, runs: 3, gatePassed: 3,
      gate: { parserErrors: 0, syntaxErrors: 0, typeErrors: null, state: 'passed' },
      functions: { total: 10, written: 10, notWritten: 0 },
      scenarios: { total: 5, matched: 2, failed: 0, notJudged: 3 },
      engineCases: { derived: 4, passed: 4, failed: 0, notRun: 0 },
      durationMs: 100_000, calls: 12, usd: 0.1, statuses: ['complete'], ...over,
    });
    expect(diffRows([row({})], null)).toBeNull();
    expect(diffRows([row({})], [row({})])).toEqual([]);
    const d = diffRows([row({ gatePassed: 1, functions: { total: 10, written: 8, notWritten: 2 } })], [row({})])!;
    expect(d[0].changes.join('; ')).toContain('gate passed 3 → 1 (worse)');
    expect(d[0].changes.join('; ')).toContain('functions written 10 → 8 (worse)');
    expect(diffRows([], [row({})])![0].changes).toEqual(['not in this run']);
  });

  test('the run list: every program pinned by fingerprint, PM a holdout without expectations, scenarios only sealed', async () => {
    const programs = loadPrograms();
    expect(programs.map((p) => p.id)).toEqual(
      expect.arrayContaining(['sd-return-credit-recon', 'co-cc-close-simulation', 'pp-material-kit-readiness', 'fi-ar-collection-worklist', 'sd-order-cockpit', 'po-mm-po-approval', 'pm-shutdown-slot-plan']),
    );
    for (const p of programs) {
      expect(p.source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(p.source.repo ?? p.source.file).toBeTruthy();
      if (p.scenarios.sealed) expect(fs.existsSync(path.join(ROOT, 'scripts', 'acceptance', p.scenarios.sealed)), p.id).toBe(true);
    }
    const pm = programs.find((p) => p.id === 'pm-shutdown-slot-plan')!;
    expect(pm.holdout).toBe(true);
    expect(pm.scenarios.sealed).toBeNull();
    // The reviewers' data is never committed in plaintext.
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'acceptance', 'scenarios'))) {
      expect(f).toMatch(/\.enc\.json$/);
      const env = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'acceptance', 'scenarios', f), 'utf8'));
      expect(Object.keys(env).sort()).toEqual(['alg', 'data', 'iv', 'tag', 'v']);
    }
    // A source in the repository matches its pin; a wrong pin is refused.
    const po = programs.find((p) => p.id === 'po-mm-po-approval')!;
    expect((await loadSource(po, ROOT)).length).toBeGreaterThan(1000);
    const wrong: ProgramEntry = { ...po, source: { ...po.source, sha256: crypto.createHash('sha256').update('x').digest('hex') } };
    await expect(loadSource(wrong, ROOT)).rejects.toThrow(/does not match its fingerprint/);
  });

  test('a plaintext scenario file is checked before it is sealed', async () => {
    const mod = (await import(pathToFileURL(path.join(ROOT, 'scripts', 'acceptance', 'scenarios.mjs')).href)) as {
      validateScenarioFile: (doc: unknown, ids: string[]) => string[];
    };
    const ok = {
      schema: 1,
      program: 'po-mm-po-approval',
      provenance: [{ id: 'r', kind: 'external-review', document: 'd' }],
      scenarios: [{ id: 'E01', group: 'probe', title: 't', input: 'i', expected: { a: 1 }, expectedForm: 'machine', source: { ref: 'r', where: 'L1' } }],
    };
    expect(mod.validateScenarioFile(ok, ['po-mm-po-approval'])).toEqual([]);
    const noPlace = { ...ok, scenarios: [{ ...ok.scenarios[0], source: { ref: 'r' } }] };
    expect(mod.validateScenarioFile(noPlace, ['po-mm-po-approval']).join()).toMatch(/source\.where/);
    const proseAsMachine = { ...ok, scenarios: [{ ...ok.scenarios[0], expected: 'the total stays' }] };
    expect(mod.validateScenarioFile(proseAsMachine, ['po-mm-po-approval']).join()).toMatch(/machine expectation must be an object/);
  });

  test('the harness step stays on this Node only when told to, and says so', () => {
    const self = harnessNode({ ACCEPTANCE_HARNESS_NODE: 'self' });
    if (Number(process.versions.node.split('.')[0]) >= 25) expect(self).toEqual({ binary: null, version: process.version, reason: null });
    else expect(self).toMatchObject({ binary: null, version: process.version, reason: expect.stringMatching(/ACCEPTANCE_HARNESS_NODE=self/) });
  });

  test("the loop asks the route's own checks: abapCheck for an ABAP candidate, typeCheckCandidate for a Node one", async () => {
    const route = localVerifyRoute();
    const signal = new AbortController().signal;
    const abap = await route([{ path: 'src/zcl_x.clas.abap', content: 'CLASS zcl_x DEFINITION PUBLIC.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n' }], signal);
    expect(abap.abap).toBeDefined();
    expect(abap.types).toBeUndefined();
    const node = await route([{ path: 'src/a.ts', content: 'export const a: number = "x";\n' }], signal);
    expect(node.abap).toBeUndefined();
    expect(node.types).toBeDefined();
    expect(node.engine.ran).toBe(false);
  });

  test('dry run end to end on the public demo: both tracks, a report, and a diff on the second run', async () => {
    // The harness step may first fetch a Node 25 (npx, cached afterwards) when this Node is older.
    test.setTimeout(420_000);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-acceptance-'));
    try {
      const args = ['--programs', 'po-mm-po-approval', '--out', out];
      expect(await main(args)).toBe(0);
      expect(await main(args)).toBe(0);
      const runs = fs.readdirSync(out).sort();
      expect(runs).toHaveLength(2);
      const second = JSON.parse(fs.readFileSync(path.join(out, runs[1], 'suite-report.json'), 'utf8')) as SuiteReport;
      expect(second.mode).toBe('dry');
      expect(second.rows.map((r) => r.track).sort()).toEqual(['node', 'rap']);
      for (const r of second.rows) {
        expect(r.functions.total).toBeGreaterThan(0);
        expect(r.calls).toBeGreaterThan(0);
        expect(r.usd).toBe(0);
      }
      const rap = second.rows.find((r) => r.track === 'rap')!;
      expect(rap.gate.state).not.toBe('not-run');
      expect(second.previous).toBe(runs[0]);
      expect(Array.isArray(second.diff)).toBe(true);
      expect(fs.readFileSync(path.join(out, runs[1], 'suite-report.md'), 'utf8')).toContain('| po-mm-po-approval | rap |');
      // The unpacked packages are not left behind.
      expect(fs.existsSync(path.join(out, runs[1], 'packages'))).toBe(false);
      // The loop runs the page's gate checks: the activation check on RAP, the type check on Node, every round.
      const byTrack = (t: string) => second.runs.find((r) => r.track === t)!;
      expect(byTrack('rap').loop.length).toBeGreaterThan(0);
      expect(byTrack('rap').loop.every((l) => l.gate === 'abap')).toBe(true);
      expect(byTrack('node').loop.every((l) => l.gate === 'types')).toBe(true);
      // The stub's Node bodies do not compile: those errors are repair reasons of the units that hold them.
      expect(byTrack('node').loop[0].gateToUnits.length).toBeGreaterThan(0);
      expect(byTrack('node').checks.some((c) => c.kind === 'types')).toBe(true);
      expect(byTrack('node').status).toBe('not-runnable');
      // Raw gate findings per run, beside the report.
      const findings = JSON.parse(fs.readFileSync(path.join(out, runs[1], 'gate-findings.json'), 'utf8')) as {
        runs: Array<{ track: string; errors: Array<{ path: string; line: number; unit: string | null }>; lastRoundRepairReasons: Array<{ unitId: string | null; check: string }> }>;
      };
      const nodeFindings = findings.runs.find((r) => r.track === 'node')!;
      expect(nodeFindings.errors.length).toBeGreaterThan(0);
      expect(nodeFindings.errors[0]).toMatchObject({ path: expect.any(String), line: expect.any(Number) });
      expect(nodeFindings.errors.some((e) => e.unit)).toBe(true);
      expect(nodeFindings.lastRoundRepairReasons.some((r) => r.check === 'types' && r.unitId)).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

import { test, expect } from '@playwright/test';
import { skipWithoutReference } from './helpers/reference-sources';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { candidateFiles, guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { typeCheckCandidate } from '../lib/test-sandbox/type-check';
import { mapTypeFindings, markerSpans } from '../lib/transformation/verify';
import { bodyGuards, isReleasedSapClass, isReleasedSapInterface } from '../lib/transformation/markers';
import { deriveReleasedInterfaces, RELEASED_INTERFACES_FILE } from '../lib/abap/cloudification-repo';
import { FILL_REPAIR_PREVIOUS_MAX_CHARS, FILL_REQUEST_MARK, GATE_REPAIR_ABAP_NOTE, LEASED_PROMPT_MAX_CHARS, bundleFills, isGateRepairPrompt } from '../lib/transformation/fill-prompt';
import { runGeneration, type FillModel, type Verify } from '../lib/transformation/orchestrator';
import { LEASE_GATE_REPAIR_CALLS, LEASE_MAX_CALLS } from '../lib/transformation/lease';
import type { FillRequest, FillRequestUnit } from '../lib/transformation/types';
import { judgeScenarios, loadPrograms, loadSource, packageDemoOf } from '../scripts/acceptance/suite';
import { canon, compareScenario, demoCaseVerdicts, scenarioCases, type CaseScenario, type DemoCaseRuns, type DemoCaseSummary, type PackageDemo } from '../scripts/acceptance/scenario-cases';
import { pathToFileURL } from 'node:url';
import { writePackage } from './helpers/transformation-scaffold';

const NO_PROBES = { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: null, byPattern: {} };
import { poDemo } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.14, "Transformation, next step", items (1)–(4) — the generation pipeline (owner decision 15.10.2026:
 * "es muss zuerst die Transformation sehr gut funktionieren für RAP und CAP"). Server-free: pure functions, the
 * scaffold and the orchestrator against a fake model; no model call, no network.
 */

function prep(source: string, track: 'rap' | 'node'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: 'Z_TEST', decisions: [], contextText: '' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

/* ------------------------------------------------------------------ 1 */

/**
 * The shape of the acceptance runs' most frequent Node type errors (15.10.2026, SD U05 and CO U11/U16): a count
 * declared `TYPE i`, compared with a number in a check and assigned from `lines( … )` in the step. The scaffold typed
 * it `string` while the prompt called counts numbers — `values.lvCount > 5000` (TS2365) and `lvCount: rows.length`
 * (TS2322) in every run; and the repair named the predicate's error as "body line 1" of the unit, so the round
 * rewrote the step and the predicate's error stayed.
 */
const COUNTS = `REPORT zcc_counts.
TYPES: BEGIN OF ty_raw,
         cid  TYPE c LENGTH 10,
         pos  TYPE i,
       END OF ty_raw.
DATA: gt_raw    TYPE STANDARD TABLE OF ty_raw WITH DEFAULT KEY,
      gv_rows   TYPE i VALUE 7,
      gv_big    TYPE int8.
PARAMETERS p_max TYPE i DEFAULT 5000.

START-OF-SELECTION.
  PERFORM limit_scope.

FORM limit_scope.
  DATA: lv_index TYPE sy-tabix,
        lv_count TYPE i.
  lv_count = lines( gt_raw ).
  lv_index = lv_count.
  IF lv_count > 5000.
    MESSAGE 'Snapshot exceeds the processing limit' TYPE 'E'.
  ENDIF.
  lv_index = 1.
  gv_rows = lv_count.
ENDFORM.
`;

test.describe('1 — a whole number is a number in the Node package, and a predicate\'s error is repaired in the predicate', () => {
  const p = prep(COUNTS, 'node');
  const file = (suffix: string) => p.scaffold.files.find((f) => f.path.endsWith(suffix))!.content;

  test('TYPE i and sy-tabix are numbers starting at 0 (or their VALUE); int8 and the rest stay text', () => {
    const types = file('srv/lib/types.ts');
    expect(types).toMatch(/\n {2}pos: number;/);
    expect(types).toMatch(/\n {2}gvRows: number;/);
    expect(types).toMatch(/\n {2}gvBig: string;/);
    expect(types).toMatch(/\n {2}cid: string;/);
    expect(types).toContain('gvRows: 7,');
    expect(types).toMatch(/\n {2}maxValue: number \| null;|\n {2}max: number \| null;/);
    const guards = file('srv/lib/guards.ts');
    const g = p.plan.guards.find((x) => x.condition === 'lv_count > 5000')!;
    expect(guards).toContain(`export interface ${g.id.replace('-', '')}Values {\n  /** lv_count */\n  lvCount: number;\n}`);
    // The input contract holds a whole number as one; int8 keeps exact text.
    expect(file('srv/lib/input-contract.ts')).toContain('return spec.max !== null && spec.max.length <= 10 ? Number(v) : v.toString();');
  });

  test('the faithful bodies of the runs compile now: a count compared with a number, handed in from lines()', () => {
    const g = p.plan.guards.find((x) => x.condition === 'lv_count > 5000')!;
    const unit = p.plan.units.find((u) => u.fn === 'limitScope')!;
    const helper = g.helper;
    const body = [
      'let lvIndex = 0;',
      'const lvCount = st.local.gtRaw.length;',
      `const r = ${helper}(sel, st, null, { lvCount });`,
      'if (r) return r;',
      'lvIndex = 1;',
      'void lvIndex;',
      'st.local.gvRows = lvCount;',
    ].join('\n');
    const r = typeCheckCandidate(candidateFiles(p, new Map([[unit.id, body], [g.regionId!, 'return values.lvCount > 5000;']])));
    expect(r.ran).toBe(true);
    expect(r.ran && r.findings.map((f) => `${f.path}:${f.code} ${f.message}`)).toEqual([]);
  });

  test('an error in a predicate is named by its check, and the repair round carries the predicate it names', async () => {
    const g = p.plan.guards.find((x) => x.condition === 'lv_count > 5000')!;
    const unit = p.plan.units.find((u) => u.fn === 'limitScope')!;
    const files = candidateFiles(p, new Map([[unit.id, 'return;'], [g.regionId!, "return values.lvCount > '5000';"]]));
    const r = typeCheckCandidate(files);
    expect(r.ran && r.findings.length).toBeGreaterThan(0);
    if (!r.ran) return;
    const [failure] = mapTypeFindings(r.findings, markerSpans(files));
    expect(failure.unitId).toBe(unit.id);
    // Before: "body line 1 — TS2365 …", read as the step's first line.
    expect(failure.failure).toContain(`predicate ${g.id} line 1 — TS2365`);
    expect(failure.failure).toContain('answer the fixed predicate under "guards"');

    // The orchestrator hands the predicate's previous body to the repair, by its check.
    const seen: FillRequest[] = [];
    let round = 0;
    const model: FillModel = async (prompt) => {
      const req = requestIn(prompt);
      seen.push(req);
      return JSON.stringify({ units: req.units.map((u) => ({ unitId: u.unitId, body: 'return;', guards: [{ id: g.id, body: req.repair ? 'return values.lvCount > 5000;' : "return values.lvCount > '5000';" }], needs: [] })) });
    };
    const verify: Verify = async () => ({ checks: [], failures: round++ === 0 ? [{ unitId: unit.id, check: 'types', failure: failure.failure }] : [], notRun: [] });
    const fill = p.fillUnits.filter((u) => u.unitId === unit.id);
    const result = await runGeneration({ units: fill, bundleOptions: { track: 'node', program: 'ZCC', context: '' }, model, guardBody: () => null, verify, budget: LEASE_MAX_CALLS, gateRepairBudget: LEASE_GATE_REPAIR_CALLS, sleep: async () => {}, now: () => 0 });
    const repair = seen.find((q) => q.repair)!.repair![0];
    expect(repair.previousGuards).toEqual({ [g.id]: "return values.lvCount > '5000';" });
    expect(result.units[0].predicates[g.regionId!]).toBe('return values.lvCount > 5000;');
  });
});

/* ------------------------------------------------------------------ 2 */

/** A unit whose ABAP slice alone nearly fills a leased call (230 lines, ~22,000 characters). */
function largeUnit(id = 'U01'): FillRequestUnit {
  const abap = Array.from({ length: 230 }, (_, i) => `${String(i + 1).padStart(4, '0')}   ${'x'.repeat(90)}`).join('\n');
  return {
    unitId: id,
    function: { name: 'load', file: `srv/steps/${id}.ts`, signature: 'export function load(sel: Selection, st: RunState): StepResult', returns: 'StepResult' },
    abap: { ranges: [{ lineStart: 1, lineEnd: 230, routine: 'LOAD' }], text: abap },
    rules: [{ id: 'BR-001', decision: 'keep', text: 'r'.repeat(900) }],
    guards: [],
    facts: { decimals: [] },
    available: { helpers: [], callees: [] },
    types: 'interface Selection { org: string; }',
  };
}
const CONTEXT = Array.from({ length: 40 }, (_, i) => `- platform fact ${i}: ${'k'.repeat(50)}`).join('\n');
const requestIn = (prompt: string): FillRequest => JSON.parse(prompt.slice(prompt.indexOf(FILL_REQUEST_MARK) + FILL_REQUEST_MARK.length));

test.describe('2 — a gate repair of the largest units fits the leased call: the failing body and its errors, not the package', () => {
  const body = Array.from({ length: 120 }, (_, i) => `  const v${i} = dec.add(st.local.gvTotal, '${i}', 2); // line ${i}`).join('\n');
  const failure = "types: the TypeScript compiler (the package's own tsconfig.json) does not accept this body — 1 type error: body line 1 — TS2365 Operator '>' cannot be applied to types 'string' and 'number'.";
  const repair = new Map([['U01', { unitId: 'U01', round: 1 as const, failure, previousBody: body }]]);

  test('the repair as a fill carries it goes past the cap; as a gate repair it fits, with the whole body', () => {
    const u = largeUnit();
    expect(body.length).toBeGreaterThan(FILL_REPAIR_PREVIOUS_MAX_CHARS);
    // Before 3.0.14: the whole slice and context again, the body cut at 4,000 — past the cap, so never sent.
    const [asFill] = bundleFills([u], { track: 'node', program: 'ZX', context: CONTEXT, repair });
    expect(asFill.prompt.length).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
    // The gate repair: the body whole, its errors, the signature and declarations; no slice, no context pack.
    const [gate] = bundleFills([u], { track: 'node', program: 'ZX', context: CONTEXT, repair, gateRepair: true });
    expect(gate.prompt.length).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
    const req = requestIn(gate.prompt);
    expect(req.repair).toEqual([{ unitId: 'U01', round: 1, failure, previousBody: body }]);
    expect(req.units[0].abap).toEqual({ ranges: u.abap.ranges, text: GATE_REPAIR_ABAP_NOTE });
    expect(req.units[0].function).toEqual(u.function);
    expect(req.units[0].types).toBe(u.types);
    expect(req.units[0].rules[0]).toMatchObject({ id: 'BR-001', decision: 'keep' });
    expect(req.context).toBe('');
    expect(gate.briefRules).toBe(true);
    expect(isGateRepairPrompt(gate.prompt)).toBe(true);
  });

  test('the orchestrator sends the gate repair of a large unit, marked, under the cap — it used to stay unsent', async () => {
    const prompts: Array<{ gate: boolean; length: number; repaired: boolean }> = [];
    let round = 0;
    const model: FillModel = async (prompt, _signal, meta) => {
      const req = requestIn(prompt);
      prompts.push({ gate: meta?.gateRepair === true, length: prompt.length, repaired: req.repair !== null });
      return JSON.stringify({ units: req.units.map((x) => ({ unitId: x.unitId, body: req.repair ? 'return;' : body, needs: [] })) });
    };
    const verify: Verify = async () => {
      round++;
      return { checks: [], failures: round === 1 ? [{ unitId: 'U01', check: 'types', failure: "body line 1 — TS2365 Operator '>' cannot be applied to types 'string' and 'number'." }] : [], notRun: [] };
    };
    const result = await runGeneration({
      units: [largeUnit()],
      bundleOptions: { track: 'node', program: 'ZX', context: CONTEXT },
      model,
      guardBody: () => null,
      verify,
      budget: LEASE_MAX_CALLS,
      gateRepairBudget: LEASE_GATE_REPAIR_CALLS,
      sleep: async () => {},
      now: () => 0,
    });
    const repairs = prompts.filter((p) => p.repaired);
    expect(repairs).toHaveLength(1);
    expect(repairs[0].gate).toBe(true);
    expect(repairs[0].length).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
    expect(result.units[0].filledBy).toBe('model-repair-1');
    expect(result.stop).toBe('passed');
  });

  test('the acceptance programs, measured: every unit\'s gate repair fits with a body 1.2 times its slice (local sources)', async () => {
    test.setTimeout(180_000);
    const SOURCES = 'C:/Users/felix/OneDrive/Desktop';
    // The holdout is left out: no figure is tuned on it (programs.json).
    const programs = loadPrograms().filter((p) => !p.holdout);
    const missing = programs.filter((p) => !p.source.repo && !fs.existsSync(path.join(SOURCES, p.source.file ?? '')));
    skipWithoutReference(missing.length > 0, `the owner's sources are not on this machine (${missing.map((p) => p.source.file).join(', ')})`);
    const before: string[] = [];
    const over: string[] = [];
    for (const p of programs) {
      const source = await loadSource(p, SOURCES);
      for (const track of ['rap', 'node'] as const) {
        const q = prep(source, track);
        for (const u of q.fillUnits) {
          // Measured 15.10.2026 with a 2,000-character failure: the largest gate repair is SD's RAP U10 at 27,272.
          const r = new Map([[u.unitId, { unitId: u.unitId, round: 1 as const, failure: `types: ${'e'.repeat(1993)}`, previousBody: 'x'.repeat(Math.min(20_000, Math.round(u.abap.text.length * 1.2))) }]]);
          const opts = { track, program: q.plan.program, context: CONTEXT, repair: r };
          if (bundleFills([u], opts).some((b) => b.prompt.length > LEASED_PROMPT_MAX_CHARS)) before.push(`${p.id}/${track} ${u.unitId}`);
          for (const b of bundleFills([u], { ...opts, gateRepair: true })) {
            if (b.prompt.length > LEASED_PROMPT_MAX_CHARS) over.push(`${p.id}/${track} ${u.unitId} ${b.prompt.length}`);
            expect(requestIn(b.prompt).repair?.[0]?.previousBody?.endsWith('…'), `${p.id}/${track} ${u.unitId}: the body is whole`).toBe(false);
          }
        }
      }
    }
    // As a fill carries a repair, SD (RAP and Node), CO and PP RAP units went past the cap — the repair was not sent.
    expect(before.length).toBeGreaterThan(0);
    expect(over).toEqual([]);
  });
});

/* ------------------------------------------------------------------ 3 */

test.describe("3 — a Node scenario is judged by the package's own case of its ID", () => {
  const demo: PackageDemo = { switch: { parameter: 'P_CASE' }, cases: [{ number: 0 }, { number: 1 }, { number: 7 }] };
  const scen = (id: string, over: Partial<CaseScenario> = {}): CaseScenario => ({ id, group: 'reference', expectedForm: 'machine', ...over });

  test('a scenario names its case by the case switch in its input, or by its ID; a case the package lacks is not matched', () => {
    const m = scenarioCases(
      [
        scen('CASE-07', { input: { p_demo: 'X', p_case: 7 } }),
        scen('case_01'),
        scen('0', { expectedForm: 'prose' }),
        scen('E01', { group: 'probe', input: { amount: '1' } }),
        scen('CASE-09', { input: { p_case: 9 } }),
        scen('7', { group: 'probe' }),
      ],
      demo,
    );
    expect([...m.entries()]).toEqual([
      ['CASE-07', 7],
      ['case_01', 1],
      ['0', 0],
    ]);
    expect(scenarioCases([scen('CASE-07', { input: { p_case: 7 } })], null).size).toBe(0);
    // QA 958d07e8b2ff: a null, empty or boolean case switch is no case 0 — `Number(null)` is 0. A probe has no ID to
    // fall back on, so nothing is matched; digits as text still name their case.
    const probe = (id: string, p_case: unknown) => scen(id, { group: 'probe', input: { p_case } });
    const odd = scenarioCases([probe('N', null), probe('E', ''), probe('B', false), probe('W', '  '), probe('S', ' 7 '), probe('F', 1.5)], demo);
    expect([...odd.entries()]).toEqual([['S', 7]]);
  });

  const ran = (over: Partial<Extract<DemoCaseSummary, { state: 'ran' }>> = {}): Extract<DemoCaseSummary, { state: 'ran' }> => ({
    state: 'ran',
    complete: true,
    notFilled: [],
    refused: false,
    rows: [],
    result: {},
    issues: [],
    local: {},
    ...over,
  });

  test('pass only when every expected value is found and equal — rows by the global table of their shape, scalars by name', () => {
    const expected = { status: 'OK', retries: 1, rows: [{ cid: 'C1', balance: 10.5 }, { cid: 'C2', balance: 0 }], issues: ['Claim C2 deferred'] };
    const out = ran({
      issues: ['Claim C2 deferred'],
      local: { gvStatus: 'OK', gvRetries: 1, gtDisplay: [{ cid: 'C1', balance: '10.50', other: 'x' }, { cid: 'C2', balance: '0.00' }], gtRaw: [{ id: 'r' }] },
    });
    // status, retries; the number of rows and four cells; the number of issues and the one message.
    expect(compareScenario(expected, out)).toEqual({ verdict: 'pass', located: 9, total: 9, differ: 0 });
    // One value off: a fail, counted, never shown.
    const off = ran({ ...out, local: { ...out.local, gtDisplay: [{ cid: 'C1', balance: '10.49' }, { cid: 'C2', balance: '0.00' }] } });
    expect(compareScenario(expected, off)).toMatchObject({ verdict: 'fail', differ: 1 });
    // Another number of rows: a fail.
    expect(compareScenario({ rows: [{ cid: 'C1' }] }, ran({ rows: [{ cid: 'C1' }, { cid: 'C2' }] })).verdict).toBe('fail');
    // A value the output does not hold: not judged — never a pass.
    expect(compareScenario({ status: 'OK', hidden_known: 3 }, ran({ local: { gvStatus: 'OK' } }))).toEqual({ verdict: 'not-judged', located: 1, total: 2, differ: 0 });
    // QA of ec243fb63dd7: a message matches only as itself, an identifier keeps its zeros, null is not empty text.
    expect(compareScenario({ issues: ['failed'] }, ran({ issues: ['not failed'] })).verdict).toBe('fail');
    expect(compareScenario({ issues: ['Failed '] }, ran({ issues: ['failed'] })).verdict).toBe('pass');
    expect(canon('001')).not.toBe(canon(1));
    expect(canon('1.50')).toBe(canon(1.5));
    expect(canon(null)).not.toBe(canon(''));
    expect(compareScenario({}, ran()).verdict).toBe('not-judged');
    // QA d791179ee1b0: each expected message takes one of the run's — two "A" are not met by "A" and "B".
    expect(compareScenario({ issues: ['A', 'A'] }, ran({ issues: ['A', 'B'] })).verdict).toBe('fail');
    expect(compareScenario({ issues: ['A', 'B'] }, ran({ issues: ['B', 'a'] })).verdict).toBe('pass');
    // QA 1c24cdfb94f8: an empty list is compared — with the run's rows, or with the output's list of that name — and a
    // list of plain values element by element.
    expect(compareScenario({ rows: [] }, ran())).toEqual({ verdict: 'pass', located: 1, total: 1, differ: 0 });
    expect(compareScenario({ rows: [] }, ran({ rows: [{ cid: 'C1' }] })).verdict).toBe('fail');
    expect(compareScenario({ gt_out: [] }, ran({ local: { gtOut: [] } })).verdict).toBe('pass');
    expect(compareScenario({ gt_out: [] }, ran()).verdict).toBe('not-judged');
    expect(compareScenario({ codes: ['A', '01'] }, ran({ local: { gtCodes: ['A', '01'] } }))).toEqual({ verdict: 'pass', located: 3, total: 3, differ: 0 });
    expect(compareScenario({ codes: ['A', '01'] }, ran({ local: { gtCodes: ['A', '1'] } })).verdict).toBe('fail');
    // The first real SD run (15.10.2026): the rows under other names, a few scalars found and off — not a fail on 5 of
    // 115 values, but not judged, with the counts.
    const rowsElsewhere = { status: 'OK', retries: 1, rows: [{ cid: 'C1', balance: 1 }, { cid: 'C2', balance: 2 }] };
    expect(compareScenario(rowsElsewhere, ran({ local: { gvStatus: 'NO', gvRetries: 0, gtOut: [{ k: 1 }] } }))).toEqual({ verdict: 'not-judged', located: 2, total: 6, differ: 2 });
  });

  test('the verdicts: a case that threw fails, a stub is not run, prose ran for a reviewer, no harness run says why', () => {
    const scenarios = [scen('CASE-00', { expected: { status: 'OK' } }), scen('CASE-01', { expected: { status: 'OK' } }), scen('CASE-07', { expectedForm: 'prose' })];
    const cases = new Map([['CASE-00', 0], ['CASE-01', 1], ['CASE-07', 7]]);
    const runs: DemoCaseRuns = {
      executed: true,
      reason: null,
      byNumber: { '0': ran({ local: { gvStatus: 'OK' } }), '1': { state: 'threw', message: 'x is undefined' }, '7': ran() },
    };
    expect(demoCaseVerdicts(scenarios, cases, runs)).toEqual({
      'CASE-00': { ran: true, verdict: 'pass', detail: '0 of 1 found values differ, 1 of 1 found' },
      'CASE-01': { ran: true, verdict: 'fail', detail: 'the package threw on the case' },
      'CASE-07': { ran: true, verdict: 'ran: demo case 7 — a prose expectation, judged by a reviewer' },
    });
    const stub = demoCaseVerdicts(scenarios.slice(0, 1), cases, { ...runs, byNumber: { '0': ran({ complete: false, notFilled: ['U03'] }) } });
    expect(stub['CASE-00']).toEqual({ ran: false, verdict: 'not-run: demo case 0 reached 1 function(s) still left as stubs' });
    const none = demoCaseVerdicts(scenarios.slice(0, 1), cases, { executed: false, reason: 'not executed: no Node >= 25', byNumber: {} });
    expect(none['CASE-00']).toEqual({ ran: false, verdict: 'not-run: demo case 0 — not executed: no Node >= 25' });
    // A reason the package wrote is package output and stays out of the report (QA 32ab392208dd).
    const own = demoCaseVerdicts(scenarios.slice(0, 1), cases, { ...runs, byNumber: { '0': { state: 'not-run', reason: 'balance 4711.00 EUR' } } });
    expect(own['CASE-00']).toEqual({ ran: false, verdict: 'not-run: demo case 0 — the package reported it not run' });

    // The suite counts them: ran, matched, failed — and a RAP track never runs them here.
    const file = { program: 'x', scenarios: scenarios.map((s) => ({ ...s, title: 't' })) };
    const tally = judgeScenarios(file, null, 'node', NO_PROBES, {}, demoCaseVerdicts(scenarios, cases, runs));
    expect([tally.ran, tally.matched, tally.failed, tally.notJudged, tally.total]).toEqual([3, 1, 1, 1, 3]);
    expect(judgeScenarios(file, null, 'rap', NO_PROBES, {}).ran).toBe(0);
  });

  test("the package's case module reads no file, so the confined executor can load it; the case data is the JSON beside the test", async () => {
    const p = prep(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-master', 'three-cases.abap'), 'utf8'), 'node');
    const fixtures = p.scaffold.files.find((f) => f.path === 'srv/fixtures.ts')!.content;
    expect(fixtures).not.toMatch(/from 'node:fs'|from 'fs'/);
    expect(p.scaffold.files.find((f) => f.path === 'test/original-demo.test.mjs')!.content).toContain("readFileSync(new URL('./fixtures/original-demo.json', import.meta.url)");
    const demoOf = packageDemoOf(p.scaffold.files);
    expect(demoOf?.cases.map((c) => c.number)).toEqual([0, 1, 2]);
    // Bundled as the harness step bundles it: no module the confined executor refuses.
    const dir = writePackage(candidateFiles(p, new Map()), 'cc-3014-demo-');
    try {
      const { bundleModules } = (await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'acceptance', 'lib', 'sandbox.mjs')).href)) as { bundleModules: (root: string, modules: Record<string, string>, o?: { reserved?: string[] }) => Promise<{ failure?: string }> };
      const bundled = await bundleModules(dir, { fixtures: 'srv/fixtures.ts' }, { reserved: ['test'] });
      expect(bundled.failure).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------ 4 */

test.describe('4 — a released interface may be read like a released class', () => {
  const p = prep(poDemo(), 'rap');
  const unit = p.plan.units.find((u) => u.routine === 'LOG_APPROVAL')!;
  const ctx = guardContextOf(p, unit.id);

  test('if_abap_behv=> passes the body guard; an unreleased or invented interface is still refused', () => {
    // Before 3.0.14 the guard read the class list only: both were "calls outside the logic class".
    expect(isReleasedSapInterface('IF_ABAP_BEHV')).toBe(true);
    expect(isReleasedSapInterface('if_oo_adt_classrun')).toBe(true);
    expect(isReleasedSapClass('if_abap_behv')).toBe(false);
    for (const body of ['DATA(lv_on) = if_abap_behv=>mk-on.', 'DATA(lv_cause) = if_abap_behv=>cause-unspecific.']) {
      expect(bodyGuards(body, ctx).map((r) => r.code), body).not.toContain('foreign-call');
    }
    const invented = bodyGuards('DATA(lv_x) = zif_invented_helper=>co_x.', ctx).find((r) => r.code === 'foreign-call');
    expect(invented?.message).toContain('zif_invented_helper=>');
    expect(isReleasedSapInterface('if_mm_internal_po')).toBe(false);
  });

  test('the released-interface list is the synced one: names only, derived from the committed catalog, and small', () => {
    const generated = path.join(__dirname, '..', 'lib', 'abap', 'generated');
    const file = path.join(generated, RELEASED_INTERFACES_FILE);
    const latest = JSON.parse(fs.readFileSync(path.join(generated, 'cloudification-repo.latest.json'), 'utf8'));
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A sync that changes the catalog changes this list (scripts/sync-cloudification-repo.ts).
    expect(list).toEqual(deriveReleasedInterfaces(latest));
    expect(Object.keys(list).sort()).toEqual(['interfaces', 'meta']);
    expect(list.interfaces.length).toBe(list.meta.count);
    expect(list.interfaces.length).toBeGreaterThan(1000);
    // Names only: no state, no successor, no catalog field travels with the engine chunk.
    for (const n of list.interfaces) expect(n).toMatch(/^[a-z0-9_/]+$/);
    // Measured 15.10.2026: 94.5 kB raw, 20.1 kB gzip — the engine chunk is fetched on Generate only.
    expect(fs.statSync(file).size).toBeLessThan(128 * 1024);
    expect(zlib.gzipSync(fs.readFileSync(file)).length).toBeLessThan(24 * 1024);
  });
});

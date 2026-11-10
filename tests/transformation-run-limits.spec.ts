import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TRANSFORMATION_CODES, explainCode, isKnownCode, serverCountedCall } from '../lib/transformation/error-codes';
import {
  FILL_CALL_P50_MS,
  FILL_CALL_P90_MS,
  expectedFillDuration,
  expectedWords,
  fillWaves,
  minutesWords,
  perCallEstimate,
  remainingFillEstimate,
  remainingWords,
} from '../lib/transformation/duration-estimate';
import { preflight, type Preflight } from '../lib/transformation/preflight';
import { LEASE_CODES, LEASE_GATE_REPAIR_CALLS, LEASE_MAX_CALLS, LEASE_MAX_CALLS_PER_GENERATION, LEASE_MAX_IN_FLIGHT, LEASES_PER_WINDOW, leaseBudget, leaseTtlMs } from '../lib/transformation/lease';
import { LEASED_PROMPT_MAX_CHARS } from '../lib/transformation/fill-prompt';
import { MODEL_CALL_DEADLINE_MS, MODEL_TIMEOUT_CODE } from '../lib/model-deadline';
import { MODEL_INCOMPLETE_CODE } from '../lib/model-completion';
import { NO_KEY_CODE, STAGE_DISABLED_CODE } from '../lib/model-stages';
import { BYOK_KEY_UNAVAILABLE_CODE, BYOK_KEY_UNREADABLE_CODE } from '../lib/byok-key';
import { PROJECT_TOO_LARGE_CODE } from '../lib/firestore-doc-size';
import { thinkingConfigFor } from '../lib/model-thinking';
import { enterStage, generationStages, unitBoard, type UnitBoard } from '../lib/transformation-chain';

/**
 * The Transformation's run, said up front and while it runs (owner,
 * 13.10.2026): every code explained from one table, the expected and the
 * remaining duration as an estimate, the plan's limits and the pre-flight
 * check, thinking LOW on fill calls — and the screen that shows them.
 *
 * Server-free: pure modules, route and page sources, and two components
 * rendered to static markup.
 */

const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) =>
  fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
/** The literal `code: '…'` values a source answers with. */
const literalCodes = (src: string) => [...src.matchAll(/code: '([a-z0-9-]+)'/g)].map((m) => m[1]);

/* ------------------------------------------------------------ the codes */

test.describe('one table explains every code of this flow', () => {
  test('every code the lease route, /api/gemini, the contract/store route and the orchestrator can return has an entry', () => {
    const fromRoutes = [
      ...literalCodes(code('app/api/transformation/lease/route.ts')),
      ...literalCodes(code('app/api/gemini/route.ts')),
      ...literalCodes(code('app/api/projects/[projectId]/contract/route.ts')),
      ...literalCodes(code('lib/transformation/orchestrator.ts')),
    ];
    expect(fromRoutes.length).toBeGreaterThan(10);
    const constants = [
      ...Object.values(LEASE_CODES),
      MODEL_TIMEOUT_CODE,
      MODEL_INCOMPLETE_CODE,
      STAGE_DISABLED_CODE,
      NO_KEY_CODE,
      BYOK_KEY_UNAVAILABLE_CODE,
      BYOK_KEY_UNREADABLE_CODE,
      PROJECT_TOO_LARGE_CODE,
      // contractOfProject's and generationDirection's refusals (`built.code`, `decision.code`).
      'no-source',
      'off-track',
      'no-contract',
      'contract-blocked',
      'decision-off-track',
    ];
    for (const c of [...new Set([...fromRoutes, ...constants])]) {
      expect(isKnownCode(c), `${c} has no entry in lib/transformation/error-codes.ts`).toBe(true);
    }
  });

  test('each entry says what happened and what to do, in a sentence each', () => {
    for (const [c, e] of Object.entries(TRANSFORMATION_CODES)) {
      expect(e.title.length, c).toBeGreaterThan(3);
      expect(e.explain, c).toMatch(/^[A-Z0-9].*\.$/);
      expect(e.action, c).toMatch(/^[A-Z].*\.$/);
    }
    expect(TRANSFORMATION_CODES['model-timeout'].explain).toContain(`${MODEL_CALL_DEADLINE_MS / 1000} seconds`);
    expect(TRANSFORMATION_CODES['lease-hourly-limit'].explain).toContain(String(LEASES_PER_WINDOW));
  });

  test('shown as "code · status"; an unknown code falls back to "unexpected error · status"', () => {
    expect(explainCode('lease-busy', 429).label).toBe('lease-busy · 429');
    expect(explainCode('model-timeout', 504).label).toBe('model-timeout · 504');
    expect(explainCode('lease-expired', 403).label).toBe('lease-expired · 403');
    expect(explainCode('lease-prompt-too-large', 413).label).toBe('lease-prompt-too-large · 413');
    expect(explainCode('answer-unusable').label).toBe('answer-unusable');
    const unknown = explainCode('something-new', 418);
    expect(unknown).toMatchObject({ label: 'unexpected error · 418', title: 'unexpected error' });
    expect(unknown.explain).toContain('something-new');
    expect(explainCode(null, 500).label).toBe('unexpected error · 500');
  });

  test('a refusal before the lease counts the call is not counted; a timeout, an unknown code and a plain failure are', () => {
    // Every code /api/gemini refuses a leased call with (the hourly limit is the lease route's, not a call's).
    for (const c of Object.values(LEASE_CODES).filter((c) => c !== LEASE_CODES.hourly)) expect(serverCountedCall(c, 429), c).toBe(false);
    for (const c of ['too-large', STAGE_DISABLED_CODE, NO_KEY_CODE, BYOK_KEY_UNREADABLE_CODE]) expect(serverCountedCall(c, 403), c).toBe(false);
    expect(serverCountedCall(MODEL_TIMEOUT_CODE, 504)).toBe(true);
    expect(serverCountedCall(MODEL_INCOMPLETE_CODE, 502)).toBe(true);
    expect(serverCountedCall(null, 500)).toBe(true);
    expect(serverCountedCall('never-heard-of', 400)).toBe(true);
    expect(serverCountedCall(null, 401)).toBe(false);
  });
});

/* ------------------------------------------------------------ the estimate */

test.describe('the expected and the remaining duration — an estimate, said as a range', () => {
  test('waves of four, waves × p50 … waves × p90', () => {
    expect(fillWaves(0)).toBe(0);
    expect(fillWaves(1)).toBe(1);
    expect(fillWaves(4)).toBe(1);
    expect(fillWaves(5)).toBe(2);
    expect(fillWaves(30)).toBe(8);
    expect(fillWaves(30, 2)).toBe(15);
    expect(expectedFillDuration(30)).toEqual({ waves: 8, lowMs: 8 * FILL_CALL_P50_MS, highMs: 8 * FILL_CALL_P90_MS });
    expect(LEASE_MAX_IN_FLIGHT).toBe(4);
  });

  test('the constants are the measured LOW numbers with a margin: 30 calls read "about 1–3 minutes"', () => {
    // A/B 13.10.2026, thinking LOW: p50 5.4 s, p90 9.7 s over 39 calls.
    expect(FILL_CALL_P50_MS).toBeGreaterThanOrEqual(5_400);
    expect(FILL_CALL_P90_MS).toBeGreaterThanOrEqual(9_700);
    expect(minutesWords(expectedFillDuration(30))).toBe('about 1–3 minutes');
    expect(expectedWords(30, 30)).toBe('about 1–3 minutes to write 30 functions in 8 rounds of up to 4 calls (estimate; checks and repairs come after)');
  });

  test('whole minutes, never seconds, never a countdown', () => {
    expect(minutesWords({ lowMs: 10_000, highMs: 50_000 })).toBe('less than a minute');
    expect(minutesWords({ lowMs: 60_000, highMs: 60_000 })).toBe('about 1 minute');
    expect(minutesWords({ lowMs: 21 * 60_000, highMs: 27.2 * 60_000 })).toBe('about 21–28 minutes');
    expect(remainingWords({ lowMs: 5 * 60_000, highMs: 9 * 60_000 })).toBe('estimate: about 5–9 minutes left');
    expect(remainingWords({ lowMs: 1_000, highMs: 30_000 })).toBe('estimate: less than a minute left');
  });

  test('the calls that finished replace the assumption: slow calls raise the estimate, fast ones lower it', () => {
    const none = perCallEstimate([]);
    expect(none).toMatchObject({ lowMs: FILL_CALL_P50_MS, measured: 0 });
    const slow = perCallEstimate([170_000, 180_000, 190_000, 175_000, 165_000, 185_000]);
    expect(slow.lowMs).toBeGreaterThan(100_000);
    expect(slow.highMs).toBeGreaterThanOrEqual(190_000);
    expect(slow.highMs).toBeLessThanOrEqual(MODEL_CALL_DEADLINE_MS);
    const fast = perCallEstimate([2_000, 2_500, 3_000, 2_000, 2_200, 2_400]);
    expect(fast.lowMs).toBeLessThan(FILL_CALL_P50_MS);
  });

  test('remaining: the running calls and the ones to come on four slots; refusals the server did not count take no time', () => {
    const t = 1_000_000;
    // 12 planned, 4 finished at 100 s each, 4 running for 50 s, 4 to come.
    const calls = [
      ...Array.from({ length: 4 }, () => ({ start: t, end: t + 100_000, admitted: true })),
      ...Array.from({ length: 4 }, () => ({ start: t + 100_000 })),
      // A lease-busy refusal: not a call that took time, and not one of the plan.
      { start: t + 100_000, end: t + 100_100, admitted: false },
    ];
    const r = remainingFillEstimate({ plannedCalls: 12, calls, now: t + 150_000 })!;
    const per = perCallEstimate(Array(4).fill(100_000));
    expect(r.measured).toBe(4);
    expect(r.lowMs).toBeCloseTo(Math.max(0, per.lowMs - 50_000) + per.lowMs, -1);
    expect(r.highMs).toBeGreaterThanOrEqual(r.lowMs);
    // Later, with everything started and finished but one, only that one is left.
    const done = [...Array.from({ length: 11 }, () => ({ start: t, end: t + 100_000, admitted: true })), { start: t + 200_000 }];
    const end = remainingFillEstimate({ plannedCalls: 12, calls: done, now: t + 210_000 })!;
    expect(end.lowMs).toBeLessThan(r.lowMs);
    expect(remainingFillEstimate({ plannedCalls: 0, calls: [], now: t })).toBeNull();
  });
});

/* ------------------------------------------------------------ the pre-flight check */

const window = (used: number, nextFreeInSeconds: number | null = null) => ({ used, limit: LEASES_PER_WINDOW, nextFreeInSeconds });

test.describe('before the click: the plan, its limits, and whether it can succeed', () => {
  test('a plan that fits says every limit with the numbers the server enforces', () => {
    const p = preflight({ functions: 30, fillCalls: 30, oversize: [], window: window(1) });
    expect(p.blocked).toBeNull();
    expect(p.notWritten).toEqual([]);
    expect(p.budget).toBe(leaseBudget(30));
    const v = Object.fromEntries(p.limits.map((l) => [l.key, l.value]));
    expect(v.functions).toBe('30 functions in 30 fill calls');
    expect(v.budget).toBe(
      `${LEASE_MAX_CALLS} model calls — 30 for the plan, 18 for retries and repairs (at most ${LEASE_MAX_CALLS}); ${LEASE_GATE_REPAIR_CALLS} more only to repair activation or type-check errors (at most ${LEASE_MAX_CALLS_PER_GENERATION} per generation)`,
    );
    expect(v.parallel).toBe('at most 4 calls');
    expect(v.deadline).toBe(`at most ${MODEL_CALL_DEADLINE_MS / 1000} seconds`);
    expect(v['time-limit']).toBe(`${Math.round(leaseTtlMs(p.budget) / 60_000)} minutes for the whole generation`);
    expect(v.prompt).toBe(`at most ${LEASED_PROMPT_MAX_CHARS.toLocaleString('en-US')} characters — every function fits`);
    expect(v.hourly).toBe('1 of 3 used');
    expect(v.duration).toContain('about 1–3 minutes');
    expect(v.duration).toContain('estimate');
  });

  test('more fill calls than one generation may make: it does not start, and says why and what to do', () => {
    const p = preflight({ functions: 60, fillCalls: LEASE_MAX_CALLS + 1, oversize: [], window: null });
    expect(p.blocked).toMatchObject({ code: 'plan-too-large', label: 'plan-too-large' });
    expect(p.blocked!.detail).toContain(`${LEASE_MAX_CALLS + 1} fill calls`);
    expect(p.blocked!.action).toMatch(/split the program/i);
  });

  test('the hour\'s generations used up: it does not start, and says when the next one is free', () => {
    const p = preflight({ functions: 5, fillCalls: 2, oversize: [], window: window(3, 1_250) });
    expect(p.blocked).toMatchObject({ code: 'lease-hourly-limit', label: 'lease-hourly-limit · 429' });
    expect(p.blocked!.detail).toContain('about 21 minutes');
    expect(p.limits.find((l) => l.key === 'hourly')).toMatchObject({ value: '3 of 3 used', attention: true });
  });

  test('some functions over the prompt cap: it starts, and names them up front; all of them: it does not start', () => {
    const some = preflight({ functions: 3, fillCalls: 3, oversize: [{ unitIds: ['U02'], chars: 31_000 }], window: window(0) });
    expect(some.blocked).toBeNull();
    expect(some.notWritten).toHaveLength(1);
    expect(some.notWritten[0]).toMatchObject({ unitId: 'U02', issue: { code: 'lease-prompt-too-large' } });
    expect(some.notWritten[0].issue.detail).toContain('31,000');
    expect(some.limits.find((l) => l.key === 'prompt')).toMatchObject({ attention: true });
    const all = preflight({ functions: 1, fillCalls: 1, oversize: [{ unitIds: ['U01'], chars: 31_000 }], window: null });
    expect(all.blocked).toMatchObject({ code: 'plan-unit-too-large' });
  });

  test('the generations of the hour unknown: the limit is still said, nothing is blocked on a guess', () => {
    const p = preflight({ functions: 4, fillCalls: 1, oversize: [], window: null });
    expect(p.blocked).toBeNull();
    expect(p.limits.find((l) => l.key === 'hourly')?.value).toBe('at most 3');
  });
});

/* ------------------------------------------------------------ thinking LOW */

test.describe('fill and repair calls think LOW; nothing else changes', () => {
  test('the config per shape', () => {
    expect(thinkingConfigFor('transformation-fill')).toEqual({ thinkingLevel: 'LOW' });
    for (const other of [undefined, 'transformation', 'analysis', 'design', 'documentation']) expect(thinkingConfigFor(other)).toBeUndefined();
  });

  test('the route sends it on both config branches, and repairs share the fill shape', () => {
    const src = code('app/api/gemini/route.ts');
    expect(src).toContain('const thinkingConfig = thinkingConfigFor(shape);');
    const call = src.slice(src.indexOf('ai!.models.generateContent({'), src.indexOf('ai!.models.generateContent({') + 900);
    expect(call.match(/\.\.\.\(thinkingConfig \? \{ thinkingConfig \} : \{\}\)/g)).toHaveLength(2);
    // Since 3.0.21 (SEC-01) every call carries its stage's output bound, on both branches, and nothing else changed.
    expect(call.match(/maxOutputTokens,/g)).toHaveLength(2);
    // One rate limiter, as before.
    expect(src.match(/assertRateLimit\(/g)).toHaveLength(1);
    // The orchestrator's repairs go through the same leased fill model.
    expect(code('lib/transformation/lease-client.ts')).toContain("responseShape: 'transformation-fill'");
  });

  test('a leased call frees exactly the slot it took', () => {
    const src = code('app/api/gemini/route.ts');
    expect(src).toContain('heldLease = { ...lease, slotAt: counted.slotAt };');
    expect(src).toContain('releaseLeaseCall(db, heldLease)');
  });
});

/* ------------------------------------------------------------ the screen */

const ROWS = [
  { unitId: 'U01', title: 'Read the items', lines: 'L10–20', rules: [] },
  { unitId: 'U02', title: 'Check the quota', lines: 'L30–40', rules: ['BR-001'] },
  { unitId: 'U03', title: 'Post', lines: 'L50–60', rules: [] },
  { unitId: 'U00', title: 'Run', lines: 'main path', rules: [] },
];

test.describe('every unit row says what is going on, and every failure its code', () => {
  test('waiting, writing, waiting for a slot, asked again, not written — in plain words, with the code', () => {
    const board = unitBoard(
      ROWS,
      [
        { t: 'fill', unitId: 'U01', state: 'writing' },
        { t: 'fill', unitId: 'U02', state: 'writing' },
        { t: 'fill', unitId: 'U02', state: 'waiting-slot', code: 'lease-busy', status: 429 },
        { t: 'fill', unitId: 'U03', state: 'writing' },
        { t: 'fill', unitId: 'U03', state: 'unusable', reason: 'the model call failed: no answer', code: 'model-timeout', status: 504 },
      ],
      [],
    );
    const by = Object.fromEntries(board.rows.map((r) => [r.unitId, r]));
    expect(by.U00.word).toBe(`waiting for a free slot (${LEASE_MAX_IN_FLIGHT} calls run at once)`);
    expect(by.U00.code).toBeNull();
    expect(by.U01.word).toMatch(/^writing — the model is working \(usually \d+–\d+ seconds\)$/);
    expect(by.U02.code).toBe('lease-busy · 429');
    expect(by.U02.hint).toContain('waits');
    expect(by.U03.word).toBe('asked again: the first answer could not be used (the model call failed: no answer)');
    expect(by.U03.code).toBe('model-timeout · 504');

    const done = unitBoard(ROWS, [], [
      { unitId: 'U01', state: 'not-written', reason: "not written — the generation's 40 model calls are used up", code: 'call-budget-used', status: null },
      { unitId: 'U02', state: 'not-written', reason: 'the lease ended', code: 'lease-expired', status: 403 },
      { unitId: 'U03', state: 'not-written', reason: 'something odd', code: 'brand-new-code', status: 500 },
    ]);
    const d = Object.fromEntries(done.rows.map((r) => [r.unitId, r]));
    // Never "not written — not written — …".
    expect(d.U01.word).toBe("not written — the generation's 40 model calls are used up");
    expect(d.U01.code).toBe('call-budget-used');
    expect(d.U02.code).toBe('lease-expired · 403');
    expect(d.U02.hint).toMatch(/Start the generation again/);
    expect(d.U03.code).toBe('unexpected error · 500');
  });
});

const OUT = path.resolve(ROOT, 'tmp', 'transformation-run-limits', String(process.pid));
type Chain = (props: Record<string, unknown>) => React.ReactElement;
let GenerationChain: Chain;
let GenerationPlan: Chain;

test.describe('rendered', () => {
  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, rel] of [
      ['GenerationChain', 'components/transformation/GenerationChain.tsx'],
      ['GenerationPlan', 'components/transformation/GenerationPlan.tsx'],
    ] as const) {
      await build({
        entryPoints: [path.resolve(ROOT, rel)],
        outfile: path.join(OUT, `${name}.cjs`),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        jsx: 'automatic',
        external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/*'],
        alias: { '@': ROOT },
        logLevel: 'silent',
      });
    }
    GenerationChain = require(path.join(OUT, 'GenerationChain.cjs')).default as Chain;
    GenerationPlan = require(path.join(OUT, 'GenerationPlan.cjs')).default as Chain;
  });

  test('the header shows the remaining estimate beside the elapsed time; each row shows its code and what it means', () => {
    const units: UnitBoard = unitBoard(ROWS, [{ t: 'fill', unitId: 'U02', state: 'waiting-slot', code: 'lease-busy', status: 429 }], []);
    const html = renderToStaticMarkup(
      React.createElement(GenerationChain, {
        program: 'Z_SD_CASE',
        slots: [],
        lit: true,
        stages: generationStages(enterStage(enterStage({}, 'scaffold', 0), 'fills', 1_000)),
        startedAt: 0,
        now: 65_000,
        phaseKey: 'model',
        units,
        remaining: 'estimate: about 2–4 minutes left',
      }),
    );
    const elapsed = html.indexOf('data-generation-elapsed-total');
    const remaining = html.indexOf('data-generation-remaining=""');
    expect(html).toMatch(/data-generation-remaining=""[^>]*>estimate: about 2–4 minutes left<\/span>/);
    expect(elapsed).toBeGreaterThan(-1);
    // Beside the elapsed time, in the header — before the caption under it.
    expect(remaining).toBeGreaterThan(elapsed);
    expect(remaining).toBeLessThan(html.indexOf('data-generation-caption'));
    expect(html).toContain('data-unit-code="lease-busy · 429"');
    expect(html).toContain(TRANSFORMATION_CODES['lease-busy'].action);
    // No estimate known: nothing is said rather than a guess.
    const quiet = renderToStaticMarkup(React.createElement(GenerationChain, { program: 'Z', slots: [], lit: false, stages: [], startedAt: 0, now: 1_000, phaseKey: 'contract' }));
    expect(quiet).not.toContain('data-generation-remaining');
  });

  test('the start screen shows the plan, its limits and, when it cannot start, the code, the reason and what to do', () => {
    const blocked: Preflight = preflight({ functions: 5, fillCalls: 2, oversize: [], window: window(3, 600) });
    const html = renderToStaticMarkup(React.createElement(GenerationPlan, { plan: { state: 'ready', preflight: blocked } }));
    expect(html).toContain('data-generation-blocked="lease-hourly-limit"');
    expect(html).toContain('lease-hourly-limit · 429');
    expect(html).toContain('about 10 minutes');
    for (const key of ['functions', 'budget', 'parallel', 'deadline', 'time-limit', 'prompt', 'hourly', 'duration']) expect(html).toContain(`data-plan-limit="${key}"`);
    const partial = preflight({ functions: 3, fillCalls: 3, oversize: [{ unitIds: ['U02'], chars: 31_000 }], window: window(0) });
    const partialHtml = renderToStaticMarkup(React.createElement(GenerationPlan, { plan: { state: 'ready', preflight: partial } }));
    expect(partialHtml).toContain('data-plan-unit="U02"');
    expect(partialHtml).not.toContain('data-generation-blocked');
  });

  test('the page wires it: the estimate from the observed calls into the header, the plan into the start card, and the button off when blocked', () => {
    const page = code('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(page).toContain('remainingFillEstimate({ plannedCalls: plannedFillCalls, calls: callLog, now })');
    expect(page).toMatch(/<GenerationChain[\s\S]*?remaining=\{fillsRemaining\}/);
    expect(page).toMatch(/<QualityTips[\s\S]*?canGenerate=\{canStart\}[\s\S]*?plan=\{planView === undefined \? \(planWanted \? \{ state: 'reading' \} : null\) : planView\}/);
    expect(page).toMatch(/disabled=\{!canStart\}/);
    expect(page).toContain('const check = preflight({ ...facts, window: null });');
    expect(code('components/transformation/QualityTips.tsx')).toContain('<GenerationPlan plan={plan} />');
  });
});

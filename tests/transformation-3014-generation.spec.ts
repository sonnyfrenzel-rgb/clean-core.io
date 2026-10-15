import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards, isReleasedSapClass, isReleasedSapInterface } from '../lib/transformation/markers';
import { deriveReleasedInterfaces, RELEASED_INTERFACES_FILE } from '../lib/abap/cloudification-repo';
import { FILL_REPAIR_PREVIOUS_MAX_CHARS, FILL_REQUEST_MARK, GATE_REPAIR_ABAP_NOTE, LEASED_PROMPT_MAX_CHARS, bundleFills, isGateRepairPrompt } from '../lib/transformation/fill-prompt';
import { runGeneration, type FillModel, type Verify } from '../lib/transformation/orchestrator';
import { LEASE_GATE_REPAIR_CALLS, LEASE_MAX_CALLS } from '../lib/transformation/lease';
import type { FillRequest, FillRequestUnit } from '../lib/transformation/types';
import { loadPrograms, loadSource } from '../scripts/acceptance/suite';
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
    test.skip(missing.length > 0, `the owner's sources are not on this machine (${missing.map((p) => p.source.file).join(', ')})`);
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

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  FILL_BRIEF_RULES_NOTE,
  FILL_RULE_NUMBERS,
  LEASED_PROMPT_MAX_CHARS,
  bundleFills,
  fillInstructionHeader,
  fillPrompt,
  fillRulesText,
  isGateFailureLine,
  isGateRepairPrompt,
} from '../lib/transformation/fill-prompt';
import { runGeneration, type FillModel, type OrchestratorInput, type Verify } from '../lib/transformation/orchestrator';
import { GENERATION_GATE_REPAIR_ROUND, GENERATION_REPAIR_MAX_ROUNDS, decideGenerationRepair } from '../lib/repair-draft';
import { LEASE_GATE_REPAIR_CALLS, LEASE_MAX_CALLS, LEASE_MAX_CALLS_PER_GENERATION } from '../lib/transformation/lease';
import { prepareEngineLed } from '../lib/transformation/engine-led';
import { loadPrograms, loadSource } from '../scripts/acceptance/suite';
import type { FillRequest, FillRequestUnit, GenerationEvent } from '../lib/transformation/types';

/**
 * Owner decision 14.10.2026 (quality over cost, ≈ $0.005 a call), from the third real acceptance run:
 *
 *   1. the fill prompt names the recurring gate errors of three real runs — Node: numbers vs text, Scaled | null,
 *      arities, `args`/`values`; RAP: the access-layer call syntax and WRITE … TO — and stays small enough that the
 *      largest units of the seven acceptance programs still travel with their whole ABAP under the leased cap;
 *   2. a lease holds 16 calls that only repairs of gate errors may spend (lease spec, route), and
 *   3. a third repair round for units that fail the gate only.
 *
 * Server-free: pure functions, the orchestrator against a fake model, and — when the owner's sources are on this
 * machine — the seven acceptance programs measured as the suite prepares them.
 */

/* ------------------------------------------------------------- 1. prompt */

test.describe('the fill prompt names the recurring gate errors (14.10.2026)', () => {
  test('Node: numbers vs text, Scaled | null, arities, args and values', () => {
    const node = fillInstructionHeader('node');
    expect(node).toContain("a number field (sy-subrc, sy-tabix, counts) takes and compares numbers (values.sySubrc !== 0), never text like '0'");
    expect(node).toContain("a flag in st.local or a structure is 'X' or ''");
    expect(node).toContain('dec.parse returns Scaled | null: null-check it or use dec.must');
    expect(node).toContain('store dec.format(x, places), never a Scaled, in a string');
    expect(node).toContain('Call helpers, guards and callees with exactly the arguments declared, in order (sel, st, …)');
    expect(node).toContain('`args` exists only where the signature declares it, `values` only in a predicate. Never cast with `as`.');
    // None of it is RAP's: ABAP has no dec.* and no `as`.
    const rap = fillInstructionHeader('rap');
    expect(rap).not.toContain('Scaled');
    expect(rap).not.toContain('values.sySubrc');
  });

  test('RAP: the exact access-layer call, and WRITE … TO as a string template — both measured with abaplint', () => {
    const rap = fillInstructionHeader('rap');
    expect(rap).toContain('parameter groups in the order EXPORTING, IMPORTING, CHANGING, RECEIVING, no commas, and nothing after its ")" but "."');
    expect(rap).toContain('mo_access->read_x( EXPORTING iv_key = lv_key IMPORTING es_row = ls_row ). (no INTO, WHERE or TO behind it)');
    expect(rap).toContain('WRITE x TO y becomes y = |{ x }|, its options inside the braces: |{ x DECIMALS = 2 }|, |{ x CURRENCY = lv_waers }|, |{ x DATE = USER }|');
    expect(fillInstructionHeader('node')).not.toContain('mo_access');
  });

  test('the examples the prompt gives parse under ABAP Cloud; the shapes of the run\'s parser errors do not', async () => {
    // The rule's own examples must be valid, and the two parser errors of the acceptance run ("mo_access",
    // "lv_buffer") must be what the rule forbids.
    const abaplint = await import('@abaplint/core');
    const parses = (stmt: string) => {
      const src = `CLASS zcl_x DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    METHODS m.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\n  METHOD m.\n    ${stmt}\n  ENDMETHOD.\nENDCLASS.\n`;
      const reg = new abaplint.Registry(abaplint.Config.getDefault(abaplint.Version.Cloud)).addFile(new abaplint.MemoryFile('zcl_x.clas.abap', src)).parse();
      return reg.findIssues().filter((i) => i.getKey() === 'parser_error').length === 0;
    };
    for (const ok of [
      'mo_access->read_x( EXPORTING iv_key = lv_key IMPORTING es_row = ls_row ).',
      'lv_buffer = |{ lv_amt DECIMALS = 2 }|.',
      'lv_buffer = |{ lv_amt CURRENCY = lv_waers }|.',
      'lv_buffer = |{ lv_date DATE = USER }|.',
    ]) expect(parses(ok), ok).toBe(true);
    for (const bad of [
      'mo_access->read_x( IMPORTING es_row = ls_row EXPORTING iv_key = lv_key ).',
      'mo_access->read_x( EXPORTING iv_key = lv_key, iv_other = lv_other ).',
      'mo_access->read_x( EXPORTING iv_key = lv_key ) INTO TABLE lt_rows.',
      'lv_buffer = lv_amt DECIMALS 2.',
      'WRITE lv_amt TO lv_buffer.',
    ]) expect(parses(bad), bad).toBe(false);
  });

  test('the header stays within its budget: rule 13 (endpoints) is the scaffold\'s, not a body\'s', () => {
    // Measured 14.10.2026 on the seven acceptance programs (see the size test below): the Node header at 6,363 and
    // the RAP header at 7,551 characters leave the largest SD Node unit 218 characters under the cap with a full
    // context pack. A new line has to be paid for elsewhere.
    // 17.10.2026 (3.0.17): the authority and lookup lines take the Node header to about 7,100. Since e3108973 the
    // split no longer relies on this margin — estimateFillPrompt counts the header's real length, so a part is cut
    // to fit the cap whatever the header costs (asserted below); the budget now only bounds growth.
    expect(fillInstructionHeader('node').length).toBeLessThanOrEqual(7_200);
    expect(fs.readFileSync(path.join(__dirname, '..', 'lib', 'transformation', 'unit-plan.ts'), 'utf8')).toMatch(
      /headerChars \?\?= Math\.max\(fillInstructionHeader\('node', \{ briefRules: true \}\)\.length, fillInstructionHeader\('rap', \{ briefRules: true \}\)\.length\)/,
    );
    expect(fillInstructionHeader('rap').length).toBeLessThanOrEqual(7_600);
    expect(FILL_RULE_NUMBERS).not.toContain(13);
    expect(fillRulesText('node')).not.toMatch(/^13\. /m);
  });

  test('a single unit past the cap gives up the rules\' text first — titles stay, its ABAP and context travel whole', () => {
    const abap = Array.from({ length: 230 }, (_, i) => `${String(i + 1).padStart(4, '0')}   ${'x'.repeat(90)}`).join('\n');
    const unit: FillRequestUnit = {
      unitId: 'U01',
      function: { name: 'load', file: 'srv/steps/01-load.ts', signature: 'export function load(sel: Selection, st: RunState): StepResult', returns: 'StepResult' },
      abap: { ranges: [{ lineStart: 1, lineEnd: 230, routine: 'LOAD' }], text: abap },
      rules: [],
      guards: [],
      facts: { decimals: [] },
      available: { helpers: [], callees: [] },
    };
    const context = Array.from({ length: 20 }, (_, i) => `- platform fact ${i}`).join('\n');
    const opts = { track: 'node' as const, program: 'ZX', context };
    const full = fillPrompt({ schema: 'cc.fill.v1', track: 'node', program: 'ZX', context, rules: 'See CODE-DRAFT RULES in the header.', units: [unit], repair: null });
    // Over the cap with the full header, under it with the rules by title.
    expect(full.length).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
    const [b] = bundleFills([unit], opts);
    expect(b.prompt.length).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
    expect(b.briefRules).toBe(true);
    expect(b.trimmed.map((t) => t.what)).toEqual(['rules']);
    expect(b.prompt).toContain(FILL_BRIEF_RULES_NOTE);
    expect(b.prompt).toMatch(/^15\. GUARDS FIRST$/m);
    expect(b.request.units[0].abap.text).toBe(abap);
    expect(b.request.context).toBe(context);
    expect(b.prompt).toBe(fillPrompt(b.request, { briefRules: true }));
  });
});

/* -------------------------------------- the seven acceptance programs, measured */

const SOURCES = 'C:/Users/felix/OneDrive/Desktop';
const PLATFORM = Array.from({ length: 40 }, (_, i) => `- platform fact ${i}: ${'k'.repeat(50)}`).join('\n');

test.describe('the largest units of the seven acceptance programs, measured (local sources)', () => {
  test('every unit that fit before still travels with its whole ABAP; SD\'s largest RAP unit now fits', async () => {
    test.setTimeout(180_000);
    const programs = loadPrograms();
    const missing = programs.filter((p) => !p.source.repo && !fs.existsSync(path.join(SOURCES, p.source.file ?? '')));
    test.skip(missing.length > 0, `the owner's sources are not on this machine (${missing.map((p) => p.source.file).join(', ')})`);
    const over: string[] = [];
    for (const p of programs) {
      const source = await loadSource(p, SOURCES);
      for (const track of ['rap', 'node'] as const) {
        const prep = prepareEngineLed({ source, track, program: p.id.toUpperCase(), decisions: [], contextText: '' });
        if (!prep.ok) throw new Error(`${p.id}/${track}: ${prep.reason}`);
        for (const b of bundleFills(prep.fillUnits, { track, program: prep.plan.program, context: PLATFORM })) {
          for (const u of b.request.units) expect(u.abap.text, `${p.id}/${track} ${u.unitId}`).toBe(prep.fillUnits.find((x) => x.unitId === u.unitId)!.abap.text);
          if (b.prompt.length > LEASED_PROMPT_MAX_CHARS) over.push(`${p.id}/${track} ${b.unitIds.join(',')}`);
          // The Node route of SD keeps every line of its platform knowledge as well (node-gate spec, 13.10.2026).
          if (p.id === 'sd-return-credit-recon' && track === 'node') expect(b.trimmed, b.unitIds.join(',')).toEqual([]);
        }
      }
    }
    // None (owner decision 17.10.2026, roadmap 3.0.17: a fill prompt must fit the cap). The holdout's VALIDATE_ORDER on
    // the RAP route (U05: 5,433 characters of ABAP, 24 checks, 9 rules) was the last one over it: the split counted only
    // its ABAP, now it counts the checks and rules a part carries too, and VALIDATE_ORDER goes in parts. Before scaffold
    // 15 its APPLY_CASE (then U09, 30,843 characters of ABAP, on both routes) was over the cap too: the case switch of
    // the original's demo cases, now demo data and never filled by a model. Before 14.10.2026 SD's RAP U10 (30,398) was.
    expect(over.sort()).toEqual([]);
  });
});

/* ------------------------------------------------ 2. what a gate repair is */

const REQUEST = (units: string[], repair: Array<{ unitId: string; failure: string }> | null): string =>
  fillPrompt({
    schema: 'cc.fill.v1',
    track: 'node',
    program: 'ZX',
    context: '',
    rules: 'See CODE-DRAFT RULES in the header.',
    units: units.map((unitId) => ({
      unitId,
      function: { name: unitId, file: 'srv/x.ts', signature: 'export function x(): void', returns: 'void' },
      abap: { ranges: [], text: '' },
      rules: [],
      guards: [],
      facts: { decimals: [] },
      available: { helpers: [], callees: [] },
    })),
    repair: repair ? repair.map((r) => ({ ...r, round: 1 as const, previousBody: 'return;' })) : null,
  });

test.describe('a gate repair is a repair of gate errors, and nothing else', () => {
  test('the gate checks: activation (abap) and type check (types)', () => {
    expect(isGateFailureLine('abap: abaplint … cannot activate this body')).toBe(true);
    expect(isGateFailureLine('types: the TypeScript compiler … does not accept this body')).toBe(true);
    for (const other of ['lint: binary decimals', 'cases: TC_ENG_03 failed', 'probes: x', 'formats: y', 'body guards: z']) expect(isGateFailureLine(other), other).toBe(false);
  });

  test('every unit of the call carries a gate failure — else it is not one', () => {
    expect(isGateRepairPrompt(REQUEST(['U01'], [{ unitId: 'U01', failure: 'types: TS2322 …' }]))).toBe(true);
    expect(isGateRepairPrompt(REQUEST(['U01'], [{ unitId: 'U01', failure: 'lint: x\nabap: parser error …' }]))).toBe(true);
    // A fresh fill, a repair of another check, a call with one unit not failing the gate, anything else.
    expect(isGateRepairPrompt(REQUEST(['U01'], null))).toBe(false);
    expect(isGateRepairPrompt(REQUEST(['U01'], [{ unitId: 'U01', failure: 'cases: TC_ENG_03 failed' }]))).toBe(false);
    expect(isGateRepairPrompt(REQUEST(['U01', 'U02'], [{ unitId: 'U01', failure: 'types: TS2322 …' }]))).toBe(false);
    expect(isGateRepairPrompt(REQUEST(['U01', 'U02'], [{ unitId: 'U01', failure: 'types: a' }, { unitId: 'U02', failure: 'lint: b' }]))).toBe(false);
    for (const junk of ['hello', '', null, 42, 'x\n\nREQUEST (JSON):\n{not json', 'x\n\nREQUEST (JSON):\n{"schema":"cc.fill.v1","units":[],"repair":[]}']) {
      expect(isGateRepairPrompt(junk), String(junk)).toBe(false);
    }
  });
});

/* -------------------------------------------------- 3. the repair decision */

test.describe('the decision: the gate gets more, nothing else does', () => {
  const gate = (callsLeft: number) => ({ isGate: isGateFailureLine, callsLeft });
  const failing = [
    { unitId: 'U01', failures: ['lint: binary decimals', 'types: TS2322 Type string is not assignable to type number'] },
    { unitId: 'U02', failures: ['lint: binary decimals'] },
  ];
  const d = (o: Partial<Parameters<typeof decideGenerationRepair>[0]>) =>
    decideGenerationRepair({ roundsDone: 0, failing, previousSignature: null, callsLeft: 10, leaseEnded: false, ...o });

  test('rounds 1 and 2 as before; the gate unit is marked and its gate reason leads', () => {
    const r = d({ gate: gate(16) });
    expect(r).toMatchObject({ kind: 'repair', round: 1 });
    if (r.kind !== 'repair') return;
    expect(r.units.map((u) => [u.unitId, u.gate === true])).toEqual([['U01', true], ['U02', false]]);
    expect(r.units[0].failure.split('\n')[0]).toMatch(/^types: /);
  });

  test('a third round only for units failing the gate, with the gate\'s reasons only', () => {
    expect(GENERATION_GATE_REPAIR_ROUND).toBe(GENERATION_REPAIR_MAX_ROUNDS + 1);
    const r = d({ roundsDone: 2, previousSignature: 'other', gate: gate(16) });
    expect(r).toMatchObject({ kind: 'repair', round: 3, units: [{ unitId: 'U01', failure: 'types: TS2322 Type string is not assignable to type number', gate: true }] });
    // Without the gate's calls, or without a unit failing the gate: the round limit, as before.
    expect(d({ roundsDone: 2, previousSignature: 'other' })).toMatchObject({ kind: 'stop', reason: 'round-limit' });
    expect(d({ roundsDone: 2, previousSignature: 'other', failing: [failing[1]], gate: gate(16) })).toMatchObject({ kind: 'stop', reason: 'round-limit' });
    // Never a fourth.
    expect(d({ roundsDone: 3, previousSignature: 'other', gate: gate(16) })).toMatchObject({ kind: 'stop', reason: 'round-limit' });
  });

  test('the budget used: only the gate goes on, on the gate-repair calls; with none left it stops on the budget', () => {
    expect(d({ callsLeft: 0, gate: gate(5) })).toMatchObject({ kind: 'repair', round: 1, units: [{ unitId: 'U01', gate: true }] });
    expect(d({ callsLeft: 0, gate: gate(0) })).toMatchObject({ kind: 'stop', reason: 'budget' });
    expect(d({ callsLeft: 0 })).toMatchObject({ kind: 'stop', reason: 'budget' });
    expect(d({ callsLeft: 0, failing: [failing[1]], gate: gate(16) })).toMatchObject({ kind: 'stop', reason: 'budget' });
    // The other stops keep their order.
    expect(d({ leaseEnded: true, gate: gate(16) })).toMatchObject({ kind: 'stop', reason: 'lease' });
    expect(d({ failing: [], gate: gate(16) })).toMatchObject({ kind: 'stop', reason: 'passed' });
  });
});

/* ------------------------------------------------------ 4. the orchestrator */

const unit = (n: number): FillRequestUnit => {
  const id = `U${String(n).padStart(2, '0')}`;
  return {
    unitId: id,
    function: { name: `step${n}`, file: `srv/steps/${id}.ts`, signature: `export function step${n}(): void`, returns: 'void' },
    abap: { ranges: [{ lineStart: n * 10, lineEnd: n * 10 + 5, routine: `R${n}` }], text: `${n * 10} FORM r${n}.` },
    rules: [],
    guards: [],
    facts: { decimals: [] },
    available: { helpers: [], callees: [] },
  };
};
const units = (count: number) => Array.from({ length: count }, (_, i) => unit(i + 1));
const requestOf = (prompt: string): FillRequest => JSON.parse(prompt.slice(prompt.indexOf('REQUEST (JSON):\n') + 'REQUEST (JSON):\n'.length));
const answer = (prompt: string) => JSON.stringify({ units: requestOf(prompt).units.map((u) => ({ unitId: u.unitId, body: `return '${u.unitId}';`, needs: [] })) });

/** A model that records every call and whether it was marked a gate repair — and checks the mark as the route does. */
function recordingModel() {
  const calls: Array<{ gate: boolean; units: string[]; round: number | null }> = [];
  const model: FillModel = async (prompt, _signal, meta) => {
    const gate = meta?.gateRepair === true;
    // The route refuses a marked call whose prompt is not a repair of gate errors; the orchestrator never sends one.
    if (gate) expect(isGateRepairPrompt(prompt), 'a call marked gate repair is one').toBe(true);
    const req = requestOf(prompt);
    calls.push({ gate, units: req.units.map((u) => u.unitId), round: req.repair?.[0]?.round ?? null });
    return answer(prompt);
  };
  return { calls, model };
}

function base(over: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    units: units(2),
    bundleOptions: { track: 'node', program: 'ZTEST', context: '' },
    model: async (prompt) => answer(prompt),
    guardBody: () => null,
    verify: async () => ({ checks: [], failures: [], notRun: [] }),
    budget: LEASE_MAX_CALLS,
    sleep: async () => {},
    now: () => 0,
    ...over,
  };
}

test.describe('the orchestrator: a third round, and the gate-repair calls, only for the gate', () => {
  /** Every round: U01 fails the type check, U02 a lint — each time with a new message, so no round is "no progress". */
  const alwaysFailing = (): Verify => {
    let n = 0;
    return async () => {
      n++;
      return {
        checks: [],
        failures: [
          { unitId: 'U01', check: 'types', failure: `body line 1 — TS2367 number vs string (${n})` },
          { unitId: 'U02', check: 'lint', failure: `binary decimals (${n})` },
        ],
        notRun: [],
      };
    };
  };

  test('a third round runs for the unit failing the gate, and for it alone — marked a gate repair', async () => {
    const { calls, model } = recordingModel();
    const events: GenerationEvent[] = [];
    const result = await runGeneration(base({ model, verify: alwaysFailing(), gateRepairBudget: LEASE_GATE_REPAIR_CALLS, onEvent: (e) => events.push(e) }));
    expect(result.rounds).toBe(3);
    const starts = events.filter((e): e is Extract<GenerationEvent, { t: 'repair' }> => e.t === 'repair' && e.state === 'start');
    expect(starts.map((e) => [e.round, [...e.unitIds].sort()])).toEqual([
      [1, ['U01', 'U02']],
      [2, ['U01', 'U02']],
      [3, ['U01']],
    ]);
    // Round 3: one call, for U01, marked; the rounds before: U01 in a marked call of its own, U02 in an unmarked one.
    const round3 = calls.filter((c) => c.round === 3);
    expect(round3).toEqual([{ gate: true, units: ['U01'], round: 3 }]);
    for (const c of calls.filter((x) => x.round === 1 || x.round === 2)) expect(c.gate).toBe(c.units.includes('U01'));
    expect(result.units.find((u) => u.unitId === 'U01')!.filledBy).toBe('model-repair-3');
    expect(result.units.find((u) => u.unitId === 'U02')!.filledBy).toBe('model-repair-2');
    expect(result.stop).toBe('round-limit');
    // Within the budget: no gate-repair call was spent beyond it.
    expect(result.gateRepairCallsUsed).toBe(0);
  });

  test('without gate-repair calls on the lease: two rounds, no mark — as before', async () => {
    const { calls, model } = recordingModel();
    const result = await runGeneration(base({ model, verify: alwaysFailing() }));
    expect(result.rounds).toBe(GENERATION_REPAIR_MAX_ROUNDS);
    expect(calls.every((c) => !c.gate)).toBe(true);
    expect(result.gateRepairCallsUsed).toBeUndefined();
  });

  test('past the budget only marked gate repairs are sent, on the gate-repair calls', async () => {
    const { calls, model } = recordingModel();
    // One call fills both units (one bundle) and uses the whole budget.
    const result = await runGeneration(base({ model, verify: alwaysFailing(), budget: 1, gateRepairBudget: LEASE_GATE_REPAIR_CALLS }));
    expect(calls[0]).toEqual({ gate: false, units: ['U01', 'U02'], round: null });
    const after = calls.slice(1);
    expect(after.length).toBe(3);
    for (const c of after) expect(c).toMatchObject({ gate: true, units: ['U01'] });
    expect(result.callsUsed).toBe(4);
    expect(result.gateRepairCallsUsed).toBe(3);
    // U02 (a lint failure) never went back: the budget ended it, and the stop says so.
    expect(result.units.find((u) => u.unitId === 'U02')!.filledBy).toBe('model');
    expect(result.stop).toBe('budget');
    expect(result.status).toBe('partial');
  });

  test(`never more than ${LEASE_MAX_CALLS_PER_GENERATION} calls; when they are used the generation ends on the budget and says so`, async () => {
    const { calls, model } = recordingModel();
    let n = 0;
    const many = units(40);
    const verify: Verify = async () => {
      n++;
      return { checks: [], failures: many.map((u) => ({ unitId: u.unitId, check: 'types' as const, failure: `TS2322 (${n})` })), notRun: [] };
    };
    // Each unit alone in its call: 40 fills, then repairs of 40 gate-failing units — 8 on the budget, 16 beyond it.
    const result = await runGeneration(base({ units: many, model, verify, bundleOptions: { track: 'node', program: 'ZTEST', context: '', maxChars: 1 }, gateRepairBudget: LEASE_GATE_REPAIR_CALLS }));
    expect(calls).toHaveLength(LEASE_MAX_CALLS_PER_GENERATION);
    expect(result.callsUsed).toBe(LEASE_MAX_CALLS_PER_GENERATION);
    expect(result.gateRepairCallsUsed).toBe(LEASE_GATE_REPAIR_CALLS);
    expect(calls.filter((c) => !c.gate)).toHaveLength(40);
    expect(result.stop).toBe('budget');
    expect(result.status).toBe('partial');
    // Every unit not repaired keeps its body and its failure — nothing is reported fixed that was not.
    const unrepaired = result.units.filter((u) => u.filledBy === 'model');
    expect(unrepaired.length).toBe(40 - 24);
    for (const u of unrepaired) expect(u.failures.length).toBeGreaterThan(0);
  });

  test('a lint-only generation stops at the budget: the gate-repair calls are no general raise', async () => {
    const { calls, model } = recordingModel();
    let n = 0;
    const many = units(40);
    const verify: Verify = async () => {
      n++;
      return { checks: [], failures: many.map((u) => ({ unitId: u.unitId, check: 'lint' as const, failure: `binary decimals (${n})` })), notRun: [] };
    };
    const result = await runGeneration(base({ units: many, model, verify, bundleOptions: { track: 'node', program: 'ZTEST', context: '', maxChars: 1 }, gateRepairBudget: LEASE_GATE_REPAIR_CALLS }));
    expect(calls).toHaveLength(LEASE_MAX_CALLS);
    expect(calls.every((c) => !c.gate)).toBe(true);
    expect(result.gateRepairCallsUsed).toBe(0);
    expect(result.stop).toBe('budget');
  });
});

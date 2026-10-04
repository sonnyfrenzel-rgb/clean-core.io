import { test, expect } from '@playwright/test';
import {
  ECONOMICS_LIMITS,
  ECONOMICS_RECORD_FORMAT,
  ECONOMICS_START_INPUTS,
  economicsProgress,
  readEconomicsRecord,
  recordProgress,
  restoreAssumptions,
  serializeEconomics,
  validateEconomicsPayload,
  type EconomicsPayload,
  type EconomicsRecord,
} from '../lib/economics-record';
import { costAssumptionsFingerprint, costAssumptionsRevision, type CostAssumptions } from '../lib/cost-assumptions';
import { initialCostAssumptions } from '../components/tco/OptionComparison';
import { toolOnRecord, workflowSteps } from '../lib/workflow-steps';
import { toolMark, workspaceLayers } from '../lib/workspace-model';
import { buildHandoverChain } from '../lib/handover';
import { costsFromDecision, storedCostsOf } from '../lib/management-executive';
import type { Project } from '../lib/types';

/**
 * The Economics figures as a stored record (owner report 03.10.2026: "4 of 4
 * done, but no green check; and if you go to another tool and back to
 * Economics, the values are gone"). Pure: the check every stored figure
 * passes, the wire form, the four steps, and what the phase contract and the
 * views that read it make of a stored record.
 */

const LOC = 668;
const SOURCE = Array.from({ length: LOC }, (_, i) => `WRITE: / 'line ${i}'.`).join('\n');

function complete(): EconomicsPayload {
  const seed = initialCostAssumptions();
  const assumptions: CostAssumptions = {
    ...seed,
    currency: 'EUR',
    devDayRate: 820,
    testDayRate: 640,
    horizonYears: 5,
    releaseCadence: { perYear: 2, confirmed: true },
    options: seed.options.map((o) => ({
      ...o,
      oneOff: { low: { devDays: 1, testDays: 0.5 }, high: { devDays: 3, testDays: 1 } },
      perRelease: { devDays: 1.7, testDays: 1.2 },
      maintenanceBaselinePerYear: o.kind === 'standard' ? null : { devDays: 3, testDays: 1 },
      upgradeDelay: o.kind === 'do-nothing' ? { state: 'stated' as const, value: { releasesDeferred: 2 } } : null,
      effortSource: 'proposal-confirmed' as const,
      ...(o.kind === 'standard' ? {} : { baselineSource: 'proposal-confirmed' as const }),
    })),
  };
  return { assumptions, inputs: { ...ECONOMICS_START_INPUTS, oneTimeBudget: 40000 } };
}

function record(payload: EconomicsPayload, score: number | null = 62): EconomicsRecord {
  const checked = validateEconomicsPayload(JSON.parse(serializeEconomics(payload)));
  if (!checked.ok) throw new Error(checked.error);
  return {
    formatVersion: ECONOMICS_RECORD_FORMAT,
    ...checked.value,
    revision: costAssumptionsRevision(checked.value.assumptions),
    basis: { runId: 'run-1', score },
    savedAt: '2026-10-03T12:00:00.000Z',
  };
}

function project(economics: EconomicsRecord | null | undefined, score = 62): Project {
  return {
    name: 'Economics record',
    legacyCode: SOURCE,
    activeRunId: 'run-1',
    cleanCoreScore: score,
    ...(economics === undefined ? {} : { _economics: economics }),
  } as Project;
}

const tco = (p: Project) => workflowSteps(p).find((s) => s.key === 'tco')!;

test.describe('the check every stored figure passes', () => {
  test('a complete payload passes and comes back as it went', () => {
    const checked = validateEconomicsPayload(JSON.parse(serializeEconomics(complete())));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.assumptions.currency).toBe('EUR');
    expect(checked.value.assumptions.options).toHaveLength(3);
    expect(checked.value.inputs.oneTimeBudget).toBe(40000);
  });

  test('garbage, NaN, Infinity and out-of-bounds figures are refused, by field', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a body shaped by hand, field by field
    const refused = (mutate: (b: Record<string, any>) => void) => {
      const body = JSON.parse(serializeEconomics(complete()));
      mutate(body);
      const r = validateEconomicsPayload(body);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.field;
    };
    expect(validateEconomicsPayload(null).ok).toBe(false);
    expect(validateEconomicsPayload('garbage').ok).toBe(false);
    expect(validateEconomicsPayload([]).ok).toBe(false);
    expect(refused((b) => { b.assumptions.devDayRate = NaN; })).toBe('devDayRate');
    expect(refused((b) => { b.assumptions.devDayRate = Infinity; })).toBe('devDayRate');
    expect(refused((b) => { b.assumptions.devDayRate = '820'; })).toBe('devDayRate');
    expect(refused((b) => { b.assumptions.testDayRate = -1; })).toBe('testDayRate');
    expect(refused((b) => { b.assumptions.testDayRate = ECONOMICS_LIMITS.maxRate + 1; })).toBe('testDayRate');
    expect(refused((b) => { b.assumptions.currency = 'EURO-DOLLAR'; })).toBe('currency');
    expect(refused((b) => { b.assumptions.currency = '<b>'; })).toBe('currency');
    expect(refused((b) => { b.assumptions.horizonYears = 1e9; })).toBe('horizonYears');
    expect(refused((b) => { b.assumptions.releaseCadence.confirmed = 'yes'; })).toBe('releaseCadence.confirmed');
    expect(refused((b) => { b.assumptions.options[0].kind = 'cheapest'; })).toBe('options[0].kind');
    expect(refused((b) => { b.assumptions.options[0].id = '../x'; })).toBe('options[0].id');
    expect(refused((b) => { b.assumptions.options[0].label = 'x'.repeat(81); })).toBe('options[0].label');
    expect(refused((b) => { b.assumptions.options[1].perRelease.devDays = 'lots'; })).toBe('options[1].perRelease.devDays');
    expect(refused((b) => { b.assumptions.options.push(...Array.from({ length: 10 }, (_, i) => ({ ...b.assumptions.options[0], id: `x${i}` }))); })).toBe('options');
    expect(refused((b) => { b.assumptions.options[1].id = b.assumptions.options[0].id; })).toBe('options');
    expect(refused((b) => { b.assumptions.extra = 1; })).toBe('assumptions.extra');
    expect(refused((b) => { b.inputs.upgradesPerYear = 1.5; })).toBe('inputs.upgradesPerYear');
    expect(refused((b) => { b.inputs.loc = 0; })).toBe('inputs.loc');
    expect(refused((b) => { b.inputs.oneTimeBudget = -5; })).toBe('inputs.oneTimeBudget');
    expect(refused((b) => { b.inputs.upgradesStated = 1; })).toBe('inputs.upgradesStated');
    expect(refused((b) => { b.assumptions.version = 99; })).toBe('assumptions.version');
  });

  test('a refusal reads as a sentence, not a field path', () => {
    const body = JSON.parse(serializeEconomics(complete()));
    body.assumptions.devDayRate = -3;
    const r = validateEconomicsPayload(body);
    expect(r.ok ? '' : r.error).toBe('the developer day rate must lie between 0 and 10,000,000.');
  });
});

test.describe('the wire form', () => {
  test('a half-entered effort travels as null and comes back as NaN, with the same revision', () => {
    const payload = complete();
    const half = {
      ...payload,
      assumptions: {
        ...payload.assumptions,
        options: payload.assumptions.options.map((o, i) =>
          i === 0 ? { ...o, perRelease: { devDays: 2, testDays: NaN }, oneOff: { low: { devDays: NaN, testDays: NaN }, high: { devDays: 4, testDays: NaN } } } : o,
        ),
      },
    };
    const wire = serializeEconomics(half);
    expect(wire).not.toContain('NaN');
    const checked = validateEconomicsPayload(JSON.parse(wire));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const back = restoreAssumptions(checked.value.assumptions);
    expect(Number.isNaN(back.options[0].perRelease!.testDays)).toBe(true);
    expect(back.options[0].oneOff!.high.devDays).toBe(4);
    expect(costAssumptionsFingerprint(back)).toBe(costAssumptionsFingerprint(half.assumptions));
    // Both halves empty is no figure at all, not zero days.
    const empty = JSON.parse(wire);
    empty.assumptions.options[0].perRelease = { devDays: null, testDays: null };
    const e = validateEconomicsPayload(empty);
    expect(e.ok && e.value.assumptions.options[0].perRelease).toBeNull();
  });

  test('a record that is not one reads as nothing', () => {
    expect(readEconomicsRecord(null)).toBeNull();
    expect(readEconomicsRecord({ formatVersion: 2 })).toBeNull();
    expect(readEconomicsRecord({ ...record(complete()), inputs: { loc: 'many' } })).toBeNull();
    expect(readEconomicsRecord(JSON.parse(JSON.stringify(record(complete()))))).toEqual(record(complete()));
  });
});

test.describe('the four steps, decided once', () => {
  test('a complete payload completes all four; a missing budget leaves step 4 open', () => {
    const p = complete();
    const ctx = { sourceLoc: LOC, score: 62, sourceChanged: false };
    expect(recordProgress(record(p), ctx)).toMatchObject({ codebase: true, rates: true, effort: true, result: true, doneCount: 4, complete: true });
    const noBudget = record({ ...p, inputs: { ...p.inputs, oneTimeBudget: null } });
    expect(recordProgress(noBudget, ctx)).toMatchObject({ compared: true, result: false, doneCount: 3, complete: false });
    // No forecast is possible above the target score, so step 4 needs only the comparison.
    expect(recordProgress(noBudget, { ...ctx, score: 97 })).toMatchObject({ forecastPossible: false, result: true, complete: true });
  });

  test('an unconfirmed cadence keeps step 2 open', () => {
    const p = complete();
    p.assumptions.releaseCadence = { perYear: 2, confirmed: false };
    const r = economicsProgress({
      assumptions: p.assumptions, loc: LOC, sourceLoc: LOC, upgradesPerYear: 1, upgradesStated: false,
      featurePacksPerYear: 2, featurePacksStated: false, oneTimeBudget: 40000, score: 62, sourceChanged: false,
    });
    expect(r.rates).toBe(false);
    expect(r.complete).toBe(false);
  });
});

test.describe('what the phase contract makes of a stored record', () => {
  test('nothing stored: the baseline, partial, and no check', () => {
    for (const p of [project(undefined), project(null)]) {
      const step = tco(p);
      expect(step).toMatchObject({ state: 'partial', badge: 'Model estimate', proven: false });
      expect(toolOnRecord(step)).toBe(false);
      expect(toolMark(step).kind).toBe('none');
    }
  });

  test('all four steps stored: done, never proven, and the tool carries its check', () => {
    const step = tco(project(record(complete())));
    expect(step).toMatchObject({ state: 'done', done: true, proven: false, badge: 'Scenario priced' });
    expect(step.detail).toMatch(/not a quote/);
    expect(toolOnRecord(step)).toBe(true);
    // A check means done (ADR-060 as amended 03.10.2026) — and done is still not proven.
    expect(toolMark(step)).toMatchObject({ kind: 'check', meaning: 'done', words: 'tools.mark.done' });
  });

  test('figures started: partial, and no check — an incomplete set prices nothing', () => {
    const p = complete();
    const started = record({ ...p, assumptions: { ...p.assumptions, horizonYears: null } });
    const step = tco(project(started));
    expect(step).toMatchObject({ state: 'partial', badge: 'Figures started' });
    expect(step.detail).toContain('2 of 4 steps');
    expect(toolOnRecord(step)).toBe(false);
  });

  test('stored against another score: out of date, an amber dot, never a check', () => {
    const step = tco(project(record(complete(), 55), 62));
    expect(step).toMatchObject({ state: 'stale', done: false, badge: 'Out of date' });
    expect(step.detail).toContain('Clean Core Score of 55');
    expect(toolMark(step)).toMatchObject({ kind: 'dot', meaning: 'stale' });
    // A new run with the same score leaves the figures current.
    const same = { ...project(record(complete(), 62)), activeRunId: 'run-2' } as Project;
    expect(tco(same).state).toBe('done');
  });
});

test.describe('what Delivery and Management read', () => {
  test('the handover link names the scenario, never an amount, and keeps it out of the pack', () => {
    const p = project(record(complete())) as Project & Record<string, unknown>;
    const link = buildHandoverChain(p, workflowSteps(p)).find((l) => l.key === 'economics')!;
    expect(link).toMatchObject({ state: 'on-record', provenance: 'simulation' });
    expect(link.value).toBe('Scenario: 3 of 3 options priced from your figures');
    expect(link.missing).toMatch(/not a quote.*not part of the signed audit pack/);
    expect(JSON.stringify(link)).not.toMatch(/EUR\s?\d/);

    const none = project(null) as Project & Record<string, unknown>;
    const open = buildHandoverChain(none, workflowSteps(none)).find((l) => l.key === 'economics')!;
    expect(open.state).toBe('open');
  });

  test('the costs layer and the executive figure say how far the scenario is, without money', () => {
    const p = project(record(complete()));
    const layer = workspaceLayers(p).find((l) => l.key === 'costs')!;
    expect(layer.count).toBe('3 of 3 options priced · scenario');
    expect(layer.rows.map((r) => r.key)).toEqual(['scenario', 'priced', 'horizon', 'revision', 'basis', 'score']);
    expect(JSON.stringify(layer)).not.toMatch(/EUR\s?\d/);
    expect(workspaceLayers(project(null)).find((l) => l.key === 'costs')!.count).toBe('not priced yet');

    const costs = costsFromDecision({ state: 'loading' } as never, storedCostsOf(p, workflowSteps(p)));
    expect(costs).toMatchObject({ state: 'stored', priced: 3, total: 3, complete: true, stale: false });
    expect(costsFromDecision({ state: 'loading' } as never, null)).toMatchObject({ state: 'unknown' });
  });
});

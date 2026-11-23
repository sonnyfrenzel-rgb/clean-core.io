import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  KEEPS_FUNCTION_KINDS,
  cheapestAmong,
  costComparison,
  effortProposalFor,
  proposeEffort,
  proposeMaintenanceBaseline,
  type CostAssumptions,
  type CostOption,
} from '../lib/cost-assumptions';
import { formatMoneyRangeOutward, roundSignificant } from '../lib/format';
import {
  answerSentence,
  differenceExact,
  differenceToKeeping,
  economicsAnswer,
  howFirm,
  notPricedSentence,
  sharedMissing,
} from '../lib/economics-answer';
import { initialCostAssumptions, takeOverPatch } from '../components/tco/OptionComparison';
import { economicsGuardRail, outsidePricedRange, programDecisionOf } from '../lib/economics-guard-rail';
import { serializeEconomics, readEconomicsRecord, ECONOMICS_RECORD_FORMAT, ECONOMICS_START_INPUTS } from '../lib/economics-record';
import { economicsPassedOver, nextPhaseKey, workflowSummary, type PhaseKey, type PhaseState, type RailStep } from '../lib/workflow-steps';

/**
 * Economics answers first (ADR-128, mock-up `docs/roadmap/economics-next-mockup.html`): the cost of keeping, the
 * cheapest change that keeps what the program does, the lowest overall, each with its condition; amounts rounded
 * outward where the eye lands; *How firm is the answer?* in plain words; Design's guard rail; Economics the next step
 * after Analyze. Server-free.
 */
const LOC = 552;

/** The mock-up's "priced" state: EUR, 1,000 and 700 a day, 5 years, 2 releases a year, every proposal taken over. */
function priced(over: Partial<CostAssumptions> = {}): CostAssumptions {
  const base: CostAssumptions = { ...initialCostAssumptions(), currency: 'EUR', devDayRate: 1000, testDayRate: 700, horizonYears: 5, releaseCadence: { perYear: 2, confirmed: true } };
  const proposals = { effort: proposeEffort(LOC), baseline: proposeMaintenanceBaseline(LOC, 40) };
  const options = base.options.map((o) => {
    const p = { ...o, ...takeOverPatch(o, proposals) } as CostOption;
    return o.kind === 'do-nothing' ? { ...p, upgradeDelay: { state: 'stated' as const, value: { releasesDeferred: 0 } } } : p;
  });
  return { ...base, options, ...over };
}

test.describe('rounding where the eye lands (ADR-128 (4))', () => {
  test('two significant figures, outward: the lower bound down, the upper up', () => {
    expect(roundSignificant(4785, -1)).toBe(4700);
    expect(roundSignificant(6530, 1)).toBe(6600);
    expect(roundSignificant(29915, 0)).toBe(30000);
    expect(roundSignificant(4700, -1)).toBe(4700);
    expect(roundSignificant(4700, 1)).toBe(4700);
    expect(formatMoneyRangeOutward({ low: 4785, high: 6530 }, 'EUR')).toBe('EUR 4,700–6,600');
    expect(formatMoneyRangeOutward({ low: 29915, high: 29915 }, 'EUR')).toBe('about EUR 30,000');
    expect(formatMoneyRangeOutward({ low: 1, high: 2 }, '')).toBeNull();
  });

  test('a rounded range is never narrower than the computed one', () => {
    for (const [lo, hi] of [[123, 456], [9999, 10001], [87654, 123456], [0.5, 0.9]]) {
      expect(roundSignificant(lo, -1)).toBeLessThanOrEqual(lo);
      expect(roundSignificant(hi, 1)).toBeGreaterThanOrEqual(hi);
    }
  });
});

test.describe('the answer (ADR-128 (1))', () => {
  test('first visit: nothing stated, five figures named, no amount', () => {
    const a = initialCostAssumptions();
    const ans = economicsAnswer(a, costComparison(a), 4);
    expect(ans.state).toBe('first-visit');
    expect(sharedMissing(a)).toHaveLength(5);
    expect(notPricedSentence(ans, LOC)).toMatch(/^Not determined yet\. The costs need five figures/);
  });

  test('figures in, proposals waiting: the answer says what it waits on', () => {
    const a = { ...initialCostAssumptions(), currency: 'EUR', devDayRate: 1000, testDayRate: 700, horizonYears: 5, releaseCadence: { perYear: 2, confirmed: false } };
    const ans = economicsAnswer(a, costComparison(a), 4);
    expect(ans.state).toBe('needs-figures');
    expect(ans.missing).toEqual(['a confirmed release cadence']);
    expect(notPricedSentence(ans, LOC)).toBe('Not determined yet. The costs need a confirmed release cadence from you and your go on the effort proposed from the 552 lines.');
  });

  test('priced: keeping, the cheapest that keeps the function, and Retire with its condition', () => {
    const a = priced();
    const all = costComparison(a);
    const ans = economicsAnswer(a, all, 0);
    expect(ans.state).toBe('priced');
    // Retire wins on proposals — true, and of little use alone (mock-up E3): the second line is the one that keeps it.
    expect(all.winner).toBe('retire');
    expect(ans.keeps.winner).not.toBe('retire');
    const sentence = answerSentence(ans);
    // The mock-up's priced state, to the word: Keep is a point ("about"), the rest rounded outward.
    expect(sentence).toBe(
      'Keeping it costs about EUR 30,000 over 5 years. Moving it to SAP standard would cost EUR 4,700–6,600, if the standard covers it, which is not measured. Retiring it costs least, EUR 360–940, if nobody still needs it.',
    );
    expect(sentence).toContain('Retiring it costs least');
    expect(sentence).toContain('if nobody still needs it');
    // No em dash in the words a reader sees.
    expect(sentence).not.toContain('—');
  });

  test('the cheapest among some options is the same rule over fewer options', () => {
    const a = priced();
    const keeps = cheapestAmong(a, KEEPS_FUNCTION_KINDS);
    expect(keeps.costs.map((c) => c.kind)).not.toContain('retire');
    expect(keeps.costs).toHaveLength(3);
    expect(['do-nothing', 'rebuild', 'standard', null]).toContain(keeps.winner);
  });

  test('the difference to keeping, both ways', () => {
    expect(differenceToKeeping({ low: 10000, high: 10000 }, { low: 4000, high: 6000 })).toEqual({ kind: 'less', low: 4000, high: 6000 });
    expect(differenceToKeeping({ low: 10000, high: 10000 }, { low: 12000, high: 15000 })).toEqual({ kind: 'more', low: 2000, high: 5000 });
    expect(differenceToKeeping({ low: 10000, high: 10000 }, { low: 8000, high: 12000 }).kind).toBe('about');
    expect(differenceExact({ kind: 'less', low: 4000, high: 6000 }, 'EUR')).toBe('EUR 4,000 – 6,000 less');
  });
});

test.describe('how firm is the answer (ADR-128 (3))', () => {
  test('one plain row per figure, and the exact distances kept for the detail', () => {
    const a = priced();
    const ans = economicsAnswer(a, costComparison(a), 0);
    const f = howFirm(a, ans);
    expect(f.rows.map((r) => r.field)).toEqual(['devDayRate', 'testDayRate', 'releaseCadence', 'horizonYears']);
    expect(f.summary).toMatch(/^Firm/);
    expect(f.exact.length).toBeGreaterThanOrEqual(4);
    for (const r of f.rows) for (const w of r.words) expect(w).toMatch(/could cost as little as/);
  });

  test('nothing to tip before anything is priced', () => {
    const a = initialCostAssumptions();
    expect(howFirm(a, economicsAnswer(a, costComparison(a), 4))).toMatchObject({ summary: null, rows: [] });
  });
});

test.describe("Design's guard rail (ADR-128 (6), ECO-N5)", () => {
  const record = (a: CostAssumptions) =>
    readEconomicsRecord({
      ...JSON.parse(serializeEconomics({ assumptions: a, inputs: { ...ECONOMICS_START_INPUTS } })),
      formatVersion: ECONOMICS_RECORD_FORMAT,
      revision: 'r',
      basis: { runId: 'run', score: 40 },
      savedAt: '2026-11-23T10:00:00.000Z',
    });

  test('no decision: Design works as before and is told where the decision is taken', () => {
    expect(programDecisionOf({})).toBeNull();
    expect(economicsGuardRail({ _economics: record(priced()) })).toMatchObject({ state: 'no-decision', range: null });
  });

  test('a decision on priced figures: its range is the rail, and days outside it say re-price', () => {
    const rail = economicsGuardRail({ targetArchitecture: 'rap', approvedByArchitect: true, _economics: record(priced()) });
    expect(rail.state).toBe('priced');
    expect(rail.decision).toMatchObject({ option: 'rebuild', label: 'Rebuild', confirmed: true });
    expect(rail.sentence).toMatch(/^Economics priced Rebuild at EUR [\d,]+–[\d,]+ over 5 years/);
    expect(rail.days).not.toBeNull();
    expect(outsidePricedRange(rail, rail.days!.high + 1)).toBe(true);
    expect(outsidePricedRange(rail, rail.days!.low)).toBe(false);
    expect(outsidePricedRange(rail, null)).toBeNull();
  });

  test('a decision without figures, or with the option unpriced', () => {
    expect(economicsGuardRail({ targetArchitecture: 'retire' }).state).toBe('no-figures');
    expect(economicsGuardRail({ targetArchitecture: 'keep', _economics: record(initialCostAssumptions()) }).state).toBe('not-priced');
  });

  test('read-only: the slot computes no amount and stores nothing', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/economics/EconomicsGuardRail.tsx'), 'utf8');
    expect(src).not.toMatch(/fetch\(|setDoc|costComparison|optionCost/);
  });
});

test.describe('Economics is the next step after Analyze (ADR-128 (5))', () => {
  const ORDER: PhaseKey[] = ['analyze', 'tco', 'design', 'transformation', 'documentation', 'testing', 'delivery'];
  const rail = (states: Partial<Record<PhaseKey, PhaseState>>): RailStep[] =>
    ORDER.map((key, i) => {
      const state = states[key] ?? 'empty';
      return { n: i + 1, key, label: key, path: key, state, done: state === 'done' } as RailStep;
    });

  test('right after the analysis, the next step is Economics', () => {
    const steps = rail({ analyze: 'done', tco: 'partial' });
    expect(economicsPassedOver(steps)).toBe(false);
    expect(nextPhaseKey(steps)).toBe('tco');
    expect(workflowSummary(steps).next.key).toBe('tco');
  });

  test('once a later tool holds a record, Economics is passed over', () => {
    const steps = rail({ analyze: 'done', tco: 'partial', design: 'done' });
    expect(economicsPassedOver(steps)).toBe(true);
    expect(nextPhaseKey(steps)).toBe('transformation');
  });

  test('priced, it is done and the path goes on to Design', () => {
    expect(nextPhaseKey(rail({ analyze: 'done', tco: 'done' }))).toBe('design');
  });

  test('the effort proposal is still a proposal for every option it covers', () => {
    for (const kind of ['do-nothing', 'rebuild', 'standard', 'retire'] as const) expect(effortProposalFor(proposeEffort(LOC), kind)).not.toBeNull();
  });
});

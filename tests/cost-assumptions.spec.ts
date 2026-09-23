import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  COMPARISON_KIND,
  canonicalCostAssumptions,
  costAssumptionsCoverage,
  costAssumptionsFingerprint,
  costAssumptionsManifestInput,
  costAssumptionsRevision,
  costComparison,
  emptyCostAssumptions,
  formatAmount,
  formatAmountRange,
  optionCost,
  proposeEffort,
  SENSITIVITY_FACTOR,
  type CostAssumptions,
  type CostOption,
} from '../lib/cost-assumptions';
import { canonicalInputManifest, invalidatingInputs, unverifiedInputs, buildInputManifest } from '../lib/input-manifest';

/**
 * Roadmap 7.4, run rather than read.
 *
 * The step is about the honesty of figures, not about arithmetic, so most of
 * what is asserted here is a refusal: no amount without a revision of stated
 * assumptions, no cheapest option while one of them is incomplete, and "not
 * determined" as a statement with a reason rather than a zero.
 *
 * The one source-level assertion is at the bottom, and it is there because the
 * defect it guards is a coding pattern the page cannot be observed into
 * revealing: a default quietly reintroduced into the model.
 */

const option = (over: Partial<CostOption> & Pick<CostOption, 'id' | 'kind'>): CostOption => ({
  label: over.id,
  oneOff: { low: { devDays: 10, testDays: 4 }, high: { devDays: 14, testDays: 6 } },
  perRelease: { devDays: 2, testDays: 1 },
  maintenanceBaselinePerYear: null,
  upgradeDelay: null,
  effortSource: 'stated',
  ...over,
});

/** *Do nothing*, complete: a baseline, and a stated upgrade deferral. */
const doNothing = (over: Partial<CostOption> = {}): CostOption =>
  option({
    id: 'do-nothing',
    kind: COMPARISON_KIND,
    oneOff: { low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } },
    perRelease: { devDays: 1, testDays: 6 },
    maintenanceBaselinePerYear: { devDays: 2, testDays: 2 },
    upgradeDelay: { state: 'stated', value: { releasesDeferred: 2 } },
    ...over,
  });

const complete = (over: Partial<CostAssumptions> = {}): CostAssumptions => ({
  ...emptyCostAssumptions(),
  currency: 'EUR',
  devDayRate: 800,
  testDayRate: 600,
  horizonYears: 5,
  releaseCadence: { perYear: 2, confirmed: true },
  options: [doNothing(), option({ id: 'standard', kind: 'standard' })],
  ...over,
});

/* ── no amount without a revision that carries it ── */

test.describe('an amount needs a revision of assumptions behind it', () => {
  test('nothing stated prices nothing, and says which field is missing', () => {
    const coverage = costAssumptionsCoverage(emptyCostAssumptions());
    expect(coverage.state).toBe('rejected');
    const codes = coverage.gaps.map((g) => g.code);
    // The mandatory fields of ADR-035, each named separately. A single
    // "incomplete" would tell a reader nothing about what to do next.
    for (const code of ['currency-missing', 'dev-rate-missing', 'test-rate-missing', 'horizon-missing', 'cadence-missing', 'comparison-option-missing']) {
      expect(codes, code).toContain(code);
    }
    expect(costComparison(emptyCostAssumptions()).costs).toEqual([]);
  });

  test('there is no default currency, and no amount without one', () => {
    const a = complete({ currency: '' });
    expect(costAssumptionsCoverage(a).state).toBe('rejected');
    expect(optionCost(a, doNothing()).total).toBeNull();
    // Not "€0", not "0": the statement that there is none.
    expect(formatAmount(1000, '')).toBe('Not determined');
    expect(formatAmountRange({ low: 1, high: 2 }, '')).toBe('Not determined');
  });

  test('both day rates are mandatory, and the test rate is not optional decoration', () => {
    expect(costAssumptionsCoverage(complete({ devDayRate: null })).state).toBe('rejected');
    expect(costAssumptionsCoverage(complete({ testDayRate: null })).state).toBe('rejected');
    // And it actually prices something: the same option costs more at a higher test rate.
    const cheapTest = optionCost(complete({ testDayRate: 100 }), doNothing()).total!;
    const dearTest = optionCost(complete({ testDayRate: 1000 }), doNothing()).total!;
    expect(dearTest.low).toBeGreaterThan(cheapTest.low);
  });

  test('a release cadence nobody confirmed is not a field', () => {
    const unconfirmed = complete({ releaseCadence: { perYear: 2, confirmed: false } });
    expect(costAssumptionsCoverage(unconfirmed).state).toBe('rejected');
    expect(costAssumptionsCoverage(unconfirmed).gaps.map((g) => g.code)).toContain('cadence-unconfirmed');
    expect(optionCost(unconfirmed, doNothing()).total).toBeNull();
    expect(costAssumptionsCoverage(complete()).state).toBe('covered');
  });

  test('the effort factors per 1,000 lines are a proposal until they are confirmed', () => {
    const proposal = proposeEffort(8500);
    expect(proposal, 'a line count yields a proposal').not.toBeNull();
    expect(proposal!.sentence).toMatch(/only once you confirm them/);
    expect(proposeEffort(null), 'no lines, no proposal').toBeNull();

    const fromProposal = complete({
      options: [doNothing(), option({ id: 'standard', kind: 'standard', effortSource: 'proposal-unconfirmed' })],
    });
    expect(costAssumptionsCoverage(fromProposal).state).toBe('rejected');
    expect(optionCost(fromProposal, fromProposal.options[1]).total).toBeNull();

    const confirmed = complete({
      options: [doNothing(), option({ id: 'standard', kind: 'standard', effortSource: 'proposal-confirmed' })],
    });
    expect(costAssumptionsCoverage(confirmed).state).toBe('covered');
  });

  test('a negative amount and a non-finite one are refusals, not figures (CR-16)', () => {
    for (const a of [
      complete({ devDayRate: -1 }),
      complete({ testDayRate: Number.NaN }),
      complete({ horizonYears: 0 }),
      complete({ releaseCadence: { perYear: -2, confirmed: true } }),
      complete({ options: [doNothing({ perRelease: { devDays: -3, testDays: 1 } }), option({ id: 'standard', kind: 'standard' })] }),
    ]) {
      expect(costAssumptionsCoverage(a).state, canonicalCostAssumptions(a)).toBe('rejected');
    }
  });

  test('nothing is rounded before it is shown', () => {
    // A quarter of a day at 800 is 200 — a model that rounded days first would
    // lose it, which is how the forecast next door once turned a small project's
    // modernised side into zero (CR-16).
    const a = complete({
      options: [
        doNothing({ perRelease: { devDays: 0.25, testDays: 0 }, maintenanceBaselinePerYear: { devDays: 0, testDays: 0 }, oneOff: { low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } } }),
        option({ id: 'standard', kind: 'standard' }),
      ],
    });
    // 0.25 days x 800 x (2 releases x 5 years) = 2,000.
    expect(optionCost(a, a.options[0]).runningTotal).toBeCloseTo(2000, 6);
    expect(formatAmount(2000.4, 'EUR')).toBe('EUR 2,000');
  });
});

/* ── "Do nothing" is a comparison option, not an afterthought ── */

test.describe('"Do nothing" as the comparison option', () => {
  test('a comparison without it is refused', () => {
    const a = complete({ options: [option({ id: 'standard', kind: 'standard' }), option({ id: 'rebuild', kind: 'rebuild' })] });
    const coverage = costAssumptionsCoverage(a);
    expect(coverage.state).toBe('rejected');
    expect(coverage.gaps.map((g) => g.code)).toContain('comparison-option-missing');
    expect(costComparison(a).winner).toBeNull();
  });

  test('it carries a maintenance baseline, and so does Keep', () => {
    for (const kind of [COMPARISON_KIND, 'keep'] as const) {
      const bare = option({ id: `bare-${kind}`, kind, maintenanceBaselinePerYear: null, upgradeDelay: { state: 'stated', value: { releasesDeferred: 1 } } });
      expect(optionCost(complete(), bare).coverage.gaps.map((g) => g.code)).toContain('option-baseline-missing');
    }
    // And an option that has none must not carry one, or the running effort per
    // release and the baseline would both be counted.
    const doubled = option({ id: 'standard', kind: 'standard', maintenanceBaselinePerYear: { devDays: 1, testDays: 1 } });
    expect(optionCost(complete(), doubled).coverage.gaps.map((g) => g.code)).toContain('option-baseline-unexpected');
  });

  test('the regression test per release is what makes it cost anything', () => {
    const cheap = optionCost(complete(), doNothing({ perRelease: { devDays: 0, testDays: 1 } })).total!;
    const dear = optionCost(complete(), doNothing({ perRelease: { devDays: 0, testDays: 10 } })).total!;
    expect(dear.low - cheap.low).toBeCloseTo(9 * 600 * 2 * 5, 6);
  });

  test('an upgrade deferral is stated, declared undetermined with a reason, or the option is incomplete', () => {
    const silent = doNothing({ upgradeDelay: null });
    expect(optionCost(complete(), silent).total, 'silence is not a figure').toBeNull();
    expect(optionCost(complete(), silent).coverage.gaps.map((g) => g.code)).toContain('upgrade-delay-unstated');

    const undetermined = doNothing({
      upgradeDelay: { state: 'not-determined', reason: 'the upgrade window is not planned yet' },
    });
    const cost = optionCost(complete(), undetermined);
    // Not determined is a statement, with the reason in it — and it does not
    // stop the option being priced, because nothing here prices the deferral.
    expect(cost.coverage.state).toBe('unconfirmed');
    expect(cost.total).not.toBeNull();
    expect(cost.coverage.sentence).toContain('the upgrade window is not planned yet');
    expect(cost.coverage.sentence).not.toMatch(/\b0\b/);
  });
});

/* ── no cost winner while an option is incomplete ── */

test.describe('naming a cheapest option', () => {
  const cheapStandard = option({
    id: 'standard',
    kind: 'standard',
    oneOff: { low: { devDays: 1, testDays: 1 }, high: { devDays: 2, testDays: 2 } },
    perRelease: { devDays: 0, testDays: 0 },
  });
  const dearDoNothing = doNothing({
    perRelease: { devDays: 5, testDays: 5 },
    maintenanceBaselinePerYear: { devDays: 5, testDays: 5 },
  });

  test('it is named when one option is clear of the next', () => {
    const c = costComparison(complete({ options: [dearDoNothing, cheapStandard] }));
    expect(c.refusal).toBeNull();
    expect(c.winner).toBe('standard');
  });

  test('one incomplete option and there is no winner at all', () => {
    const c = costComparison(
      complete({ options: [dearDoNothing, cheapStandard, option({ id: 'rebuild', kind: 'rebuild', perRelease: null })] }),
    );
    expect(c.winner).toBeNull();
    expect(c.refusal?.code).toBe('option-incomplete');
    expect(c.refusal?.sentence).toContain('"rebuild"');
    // The two complete options keep their own figures — the refusal is about
    // the verdict, not about hiding what is known.
    expect(c.costs.find((x) => x.optionId === 'standard')?.total).not.toBeNull();
  });

  test('overlapping ranges name nobody', () => {
    // Two options whose one-off ranges are wide enough to swap places. The
    // cheaper midpoint is not an answer; the range is the answer.
    const wide = option({
      id: 'standard',
      kind: 'standard',
      oneOff: { low: { devDays: 1, testDays: 0 }, high: { devDays: 100, testDays: 0 } },
      perRelease: { devDays: 0, testDays: 0 },
    });
    const other = option({
      id: 'rebuild',
      kind: 'rebuild',
      oneOff: { low: { devDays: 2, testDays: 0 }, high: { devDays: 90, testDays: 0 } },
      perRelease: { devDays: 0, testDays: 0 },
    });
    const c = costComparison(complete({ options: [doNothing({ perRelease: { devDays: 50, testDays: 50 } }), wide, other] }));
    expect(c.winner).toBeNull();
    expect(c.refusal?.code).toBe('ranges-overlap');
  });

  test('a single priced option is not a comparison', () => {
    const c = costComparison(complete({ options: [dearDoNothing] }));
    expect(c.winner).toBeNull();
    expect(c.refusal?.code).toBe('too-few-options');
  });
});

/* ── the sensitivity of the assumptions ── */

test.describe('how much the answer depends on the assumptions', () => {
  test('nothing is varied while there is no answer to vary', () => {
    const c = costComparison(emptyCostAssumptions());
    expect(c.sensitivity).toEqual([]);
    expect(c.sensitivitySentence).not.toBe('');
  });

  test('it reports the assumption that decides the comparison', () => {
    // Two options that differ only in how the effort splits: one is almost all
    // development, the other almost all testing. Which is cheaper is then a
    // question about the two day rates and nothing else.
    const devHeavy = option({
      id: 'dev-heavy',
      kind: 'standard',
      oneOff: { low: { devDays: 100, testDays: 0 }, high: { devDays: 100, testDays: 0 } },
      perRelease: { devDays: 0, testDays: 0 },
    });
    const testHeavy = option({
      id: 'test-heavy',
      kind: 'rebuild',
      oneOff: { low: { devDays: 0, testDays: 127 }, high: { devDays: 0, testDays: 127 } },
      perRelease: { devDays: 0, testDays: 0 },
    });
    const a = complete({
      devDayRate: 800,
      testDayRate: 600,
      options: [doNothing({ perRelease: { devDays: 99, testDays: 99 } }), devHeavy, testHeavy],
    });
    const c = costComparison(a);
    // 100 x 800 = 80,000 against 127 x 600 = 76,200 — test-heavy is cheaper.
    expect(c.winner).toBe('test-heavy');
    const byField = Object.fromEntries(c.sensitivity.map((p) => [p.field, p]));
    // A quarter off the test rate and the other option wins; the observation
    // period scales both equally and decides nothing.
    expect(byField.testDayRate.changesWinner, byField.testDayRate.sentence).toBe(true);
    expect(byField.horizonYears.changesWinner, byField.horizonYears.sentence).toBe(false);
    expect(byField.testDayRate.sentence).toContain(`${Math.round(SENSITIVITY_FACTOR * 100)} %`);
    expect(c.sensitivity.map((p) => p.field)).toEqual(['devDayRate', 'testDayRate', 'releaseCadence', 'horizonYears']);
  });
});

/* ── one revision, and the seam into the signed manifest ── */

test.describe('the revision', () => {
  test('the same facts in a different order are the same revision', () => {
    const a = complete();
    const reordered = complete({ options: [...complete().options].reverse() });
    expect(costAssumptionsFingerprint(reordered)).toBe(costAssumptionsFingerprint(a));
    expect(costAssumptionsRevision(reordered)).toBe(costAssumptionsRevision(a));
  });

  test('any changed fact is a different revision', () => {
    const base = costAssumptionsFingerprint(complete());
    for (const a of [
      complete({ currency: 'CHF' }),
      complete({ devDayRate: 801 }),
      complete({ testDayRate: 601 }),
      complete({ horizonYears: 6 }),
      complete({ releaseCadence: { perYear: 3, confirmed: true } }),
      complete({ options: [doNothing({ perRelease: { devDays: 2, testDays: 6 } }), option({ id: 'standard', kind: 'standard' })] }),
    ]) {
      expect(costAssumptionsFingerprint(a), canonicalCostAssumptions(a)).not.toBe(base);
    }
  });

  test('a revision that does not carry an amount says so in front', () => {
    expect(costAssumptionsRevision(complete())).not.toMatch(/^unconfirmed:/);
    expect(costAssumptionsRevision(complete({ currency: '' }))).toMatch(/^unconfirmed:/);
    const undetermined = complete({
      options: [doNothing({ upgradeDelay: { state: 'not-determined', reason: 'not planned' } }), option({ id: 'standard', kind: 'standard' })],
    });
    expect(costAssumptionsRevision(undetermined)).toMatch(/^unconfirmed:/);
  });

  test('a refusal cannot be signed, and a change invalidates what was priced from it', () => {
    expect(() => costAssumptionsManifestInput(complete({ currency: '' }))).toThrow(/must not become a signed input/);

    const input = costAssumptionsManifestInput(complete());
    expect(input.dataClass).toBe('source-artefact');
    expect(input.binding).toBe('value');

    // Not a second invalidation mechanism: the entry goes into the manifest of
    // `lib/input-manifest.ts` and the path that already exists does the rest.
    const manifest = buildInputManifest([input]);
    expect(canonicalInputManifest(manifest.inputs)).toContain(input.id);
    const moved = costAssumptionsManifestInput(complete({ devDayRate: 900 }));
    const unverified = unverifiedInputs(manifest, { [input.id]: moved.sha256 });
    expect(unverified.map((u) => u.reason)).toEqual(['differs']);
    expect(invalidatingInputs(unverified), 'a changed rate invalidates what was priced with it').toHaveLength(1);
  });
});

/* ── the one source-level assertion ── */

test('no default is smuggled back into the model', () => {
  const src = fs
    .readFileSync(path.resolve(__dirname, '..', 'lib/cost-assumptions.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // `emptyCostAssumptions` is the only place the shape is created, and every
  // mandatory field in it is absent. A literal currency or a numeric day rate
  // assigned anywhere in this module is the defect this step exists to remove —
  // the page carried exactly that until E12-F01-US02. The fallbacks in the
  // canonical form are deliberately not caught here: `currency || 'none'`
  // writes the word "none" into a fingerprint, it does not price anything.
  expect(src).not.toMatch(/currency\s*[:=]\s*['"][A-Za-z]{2,}['"]/);
  expect(src).not.toMatch(/(devDayRate|testDayRate|horizonYears)\s*[:=]\s*[0-9]/);
  const empty = emptyCostAssumptions();
  expect([empty.currency, empty.devDayRate, empty.testDayRate, empty.horizonYears, empty.releaseCadence, empty.options.length])
    .toEqual(['', null, null, null, null, 0]);
});

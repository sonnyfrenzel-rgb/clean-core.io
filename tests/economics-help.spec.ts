import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  EFFORT_HELP,
  FIGURE_RULES,
  RATES_HELP,
  baselineDerivation,
  baselineUpliftText,
  combineSaves,
  costBlockers,
  effortDerivation,
  linesBasis,
  readFigure,
  releasesInHorizonText,
  savedStepState,
  savedTimeText,
  sectionKeys,
  sectionKeysOf,
  sectionSave,
  sectionsWithFigures,
} from '../lib/economics-help';
import { costComparison, proposeEffort, proposeMaintenanceBaseline, type CostAssumptions } from '../lib/cost-assumptions';
import { ECONOMICS_LIMITS, serializeEconomics, ECONOMICS_START_INPUTS, type EconomicsPayload } from '../lib/economics-record';
import {
  deferralWords,
  initialCostAssumptions,
  oneOffWords,
  pairWords,
  takeOverPatch,
} from '../components/tco/OptionComparison';
import { formatDays } from '../lib/format';
import { stepWord } from '../components/tco/EconomicsSteps';

/**
 * Economics helps a reader state their figures (owner, 11.10.2026): "give
 * more help here … and show clearly when something was saved", "proposal
 * values need explanations as well", and on the Keep card "you don't
 * understand at all what exactly is meant".
 *
 * Server-free. What only a browser shows — the combobox open, a card saying
 * "Saved · 14:05" — is in the rendered specs; here are the rules behind it and
 * the source shapes that carry them.
 */

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const PAGE = 'app/(app)/project/[projectId]/tco/page.tsx';

test.describe('a figure field', () => {
  test('takes what the fields always took — Number(), finite — inside the stored record’s bounds', () => {
    expect(readFigure('850', 'rate')).toEqual({ value: 850, problem: null });
    expect(readFigure(' 820.5 ', 'rate')).toEqual({ value: 820.5, problem: null });
    expect(readFigure('0', 'rate')).toEqual({ value: 0, problem: null });
    expect(readFigure('', 'rate')).toEqual({ value: null, problem: null });
    expect(FIGURE_RULES.rate.max).toBe(ECONOMICS_LIMITS.maxRate);
    expect(FIGURE_RULES.horizon.max).toBe(ECONOMICS_LIMITS.maxHorizonYears);
    expect(FIGURE_RULES.cadence.max).toBe(ECONOMICS_LIMITS.maxReleasesPerYear);
    expect(FIGURE_RULES.days.max).toBe(ECONOMICS_LIMITS.maxDays);
    expect(FIGURE_RULES.deferral.max).toBe(ECONOMICS_LIMITS.maxReleasesDeferred);
    expect(FIGURE_RULES.budget.max).toBe(ECONOMICS_LIMITS.maxBudget);
  });

  test('says what is wrong and what is allowed — and holds no figure for it', () => {
    const neg = readFigure('-5', 'rate');
    expect(neg.value).toBeNull();
    expect(neg.problem).toMatch(/Not below 0/);
    const zero = readFigure('0', 'horizon');
    expect(zero.value).toBeNull();
    expect(zero.problem).toMatch(/More than 0/);
    expect(readFigure('0', 'cadence').value).toBeNull();
    const big = readFigure('101', 'horizon');
    expect(big.value).toBeNull();
    expect(big.problem).toMatch(/At most 100\./);
    expect(readFigure('366', 'cadence').problem).toMatch(/At most 365\./);
    expect(readFigure('10000001', 'rate').problem).toMatch(/At most 10,000,000\./);
    // The browser's own verdict on text that is no number: the value reads empty, the message does not.
    expect(readFigure('', 'rate', true)).toEqual({ value: null, problem: expect.stringMatching(/Not a figure/) });
    expect(readFigure('abc', 'days').problem).toMatch(/Not a figure/);
  });
});

test.describe('the hints', () => {
  test('orient, never propose a figure: no number in the help of a day rate', () => {
    // A rate in a hint would be a default in disguise (ADR-035) — rates differ too much by country and contract.
    for (const key of ['devRate', 'testRate'] as const) expect(RATES_HELP[key], key).not.toMatch(/\d/);
    expect(RATES_HELP.devRate).toMatch(/use what you actually pay/);
    expect(RATES_HELP.confirm).toMatch(/Until then it counts as a proposal, and no option is priced on it\./);
  });

  test('explain every effort field: the range, the halves, and what multiplies them', () => {
    expect(EFFORT_HELP.oneOff).toMatch(/Low and High are the ends of the range/);
    expect(EFFORT_HELP.testDays).toMatch(/key-user day rate/);
    expect(EFFORT_HELP.perRelease).toMatch(/once per release in your time horizon/);
    expect(EFFORT_HELP.baseline).toMatch(/once per year of your time horizon/);
    // The upgrade deferral is what the model says it is: stated, never priced (lib/cost-assumptions.ts, upgradeDelay).
    expect(EFFORT_HELP.deferral).toMatch(/It is not priced/);
    expect(EFFORT_HELP.deferral).toMatch(/Keep is only priced once you state it, or say it is not determined/);
    expect(releasesInHorizonText(2, 5)).toBe('With your figures: 2 releases a year × 5 years = 10 releases.');
    expect(releasesInHorizonText(null, 5)).toMatch(/releases per year × time horizon in step 2/);
  });

  test('stand in the page and the cards', () => {
    const page = read(PAGE);
    for (const key of ['devRate', 'testRate', 'horizon']) expect(page).toContain(`hint={RATES_HELP.${key}}`);
    const fields = read('components/tco/EconomicsChecklist.tsx');
    expect(fields).toContain('hint={RATES_HELP.cadence}');
    expect(fields).toContain('label="I confirm this cadence"');
    const cards = read('components/tco/OptionComparison.tsx');
    for (const key of ['oneOff', 'perRelease', 'baseline', 'deferral']) expect(cards).toContain(`EFFORT_HELP.${key}`);
  });

  test('every figure input is a decimal input with its unit in the frame', () => {
    for (const rel of ['components/tco/EconomicsChecklist.tsx', 'components/tco/OptionComparison.tsx']) {
      const src = read(rel);
      const inputs = src.match(/type="number"/g) ?? [];
      expect(inputs.length, rel).toBeGreaterThan(0);
      expect((src.match(/inputMode="decimal"/g) ?? []).length, rel).toBe(inputs.length);
    }
    const page = read(PAGE);
    expect((page.match(/prefix=\{currency \|\| undefined\}/g) ?? []).length).toBe(3);
    expect((page.match(/suffix="\/ day"/g) ?? []).length).toBe(2);
    expect(page).toContain('suffix="years"');
    expect(read('components/tco/EconomicsChecklist.tsx')).toContain('suffix="per year"');
  });
});

test.describe('a proposal explains itself', () => {
  test('with the factors and the rounding the proposal used, and this project’s lines', () => {
    const p = proposeEffort(668)!;
    const lines = effortDerivation(668, p);
    expect(lines.map((l) => `${l.label}: ${l.formula} = ${l.result}`)).toEqual([
      'One-off, developer days: 668 lines ÷ 1,000 × 2–5 days = 1.3–3.3 days',
      'One-off, test days: 668 lines ÷ 1,000 × 1–2.5 days = 0.67–1.7 days',
      'Per release, developer days: 668 lines ÷ 1,000 × 2.5 days = 1.7 days',
      'Per release, test days: 668 lines ÷ 1,000 × 1.8 days = 1.2 days',
    ]);
    // The result is the proposal itself, not a second computation.
    expect(lines[0].result).toBe(`${formatDays(p.oneOff.low.devDays)}–${formatDays(p.oneOff.high.devDays)} days`);
  });

  test('the baseline names its uplift for the signed score, or that there is none', () => {
    const withScore = proposeMaintenanceBaseline(668, 62)!;
    expect(baselineDerivation(668, withScore).map((l) => `${l.formula} = ${l.result}`)).toEqual([
      '668 lines ÷ 1,000 × 1.5 days × 1.38 (Clean Core Score 62) = 1.4 days',
      '668 lines ÷ 1,000 × 0.8 days × 1.38 (Clean Core Score 62) = 0.74 days',
    ]);
    expect(baselineUpliftText(withScore)).toMatch(/×1\.38 — 1 \+ \(100 − 62\) ÷ 100/);
    const none = proposeMaintenanceBaseline(8500, null)!;
    expect(baselineDerivation(8500, none)[0].formula).toBe('8,500 lines ÷ 1,000 × 1.5 days');
    expect(baselineUpliftText(none)).toMatch(/no uplift is applied/);
  });

  test('says where its lines come from', () => {
    expect(linesBasis(668, 668)).toBe('668 lines — the lines of your source (step 1)');
    expect(linesBasis(5000, 668)).toBe('5,000 lines — the size you set in step 1');
  });

  test('stands beside the proposed figure on the card, behind "How is this proposed?"', () => {
    const cards = read('components/tco/OptionComparison.tsx');
    expect(cards).toContain('title="How is this proposed?"');
    expect(cards).toContain('lines={effortDerivation(loc as number, proposal)}');
    expect(cards).toContain('lines={baselineDerivation(loc as number, baselineProposal)}');
    expect(read(PAGE)).toMatch(/loc=\{loc\}\s+sourceLoc=\{sourceLoc\}/);
  });
});

test.describe('a card shows its figures, and why it has no cost', () => {
  test('a chip never stands without the value it qualifies', () => {
    const cards = read('components/tco/OptionComparison.tsx');
    const body = cards.slice(cards.indexOf('export default function OptionComparison'));
    // Each provenance chip is the `chip` of a value, once: effort and baseline.
    expect((body.match(/<EffortChip /g) ?? []).length).toBe(2);
    expect((body.match(/chip=\{<EffortChip /g) ?? []).length).toBe(2);
    for (const words of ['oneOffWords(option.oneOff)', "pairWords(option.perRelease, 'per release')", "pairWords(option.maintenanceBaselinePerYear, 'per year')", 'deferralWords(option.upgradeDelay)']) {
      expect(body).toContain(words);
    }
  });

  test('the values in words, a half not entered as a dash, never as 0', () => {
    expect(oneOffWords({ low: { devDays: 1.3, testDays: 0.67 }, high: { devDays: 3.3, testDays: 1.7 } })).toBe(
      '1.3–3.3 developer and 0.67–1.7 test days once',
    );
    expect(oneOffWords({ low: { devDays: 2, testDays: NaN }, high: { devDays: 4, testDays: NaN } })).toBe(
      '2–4 developer and —–— test days once',
    );
    expect(pairWords({ devDays: 1.4, testDays: 0.74 }, 'per year')).toBe('1.4 developer and 0.74 test days per year');
    expect(deferralWords(null)).toBeNull();
    expect(deferralWords({ state: 'stated', value: { releasesDeferred: 2 } })).toBe('2 releases deferred');
    expect(deferralWords({ state: 'stated', value: { releasesDeferred: 1 } })).toBe('1 release deferred');
    expect(deferralWords({ state: 'not-determined', reason: 'nobody knows' })).toBe('Not determined — nobody knows');
  });

  test('an open item names itself, says why, and offers its own action', () => {
    const cards = read('components/tco/OptionComparison.tsx');
    expect(cards).toContain("action: 'Enter the upgrade deferral'");
    expect(cards).toContain('data-cost-option-fill=');
    expect(cards).toContain('Mark as not determined');
    expect(cards).not.toContain('CircleDashed');
  });

  test('the reasons come from the comparison’s own gaps — step 2 first, with the field to go to', () => {
    const empty = costComparison(initialCostAssumptions());
    const keep = empty.costs.find((c) => c.optionId === 'do-nothing')!;
    const why = costBlockers(keep.coverage.gaps);
    expect(why.filter((b) => b.scope === 'shared').map((b) => b.field)).toEqual([
      'release-cadence',
      'currency',
      'dev-day-rate',
      'horizon-years',
      'test-day-rate',
    ]);
    expect(why.filter((b) => b.scope === 'own').map((b) => b.label)).toEqual([
      'the maintenance baseline per year',
      'the one-off effort range',
      'the effort per release',
      'the upgrade deferral',
    ]);
    // Shared before own, whatever order the gaps were sorted in.
    const firstOwn = why.findIndex((b) => b.scope === 'own');
    expect(why.slice(firstOwn).every((b) => b.scope === 'own')).toBe(true);

    // Everything in but the confirmation: the one thing it waits for, and where.
    const seed = initialCostAssumptions();
    const proposals = { effort: proposeEffort(668), baseline: proposeMaintenanceBaseline(668, 62) };
    const almost: CostAssumptions = {
      ...seed,
      currency: 'EUR',
      devDayRate: 820,
      testDayRate: 640,
      horizonYears: 5,
      releaseCadence: { perYear: 2, confirmed: false },
      options: seed.options.map((o) => ({
        ...o,
        ...takeOverPatch(o, proposals),
        upgradeDelay: o.kind === 'do-nothing' ? { state: 'stated' as const, value: { releasesDeferred: 2 } } : null,
      })),
    };
    const gaps = costComparison(almost).costs.find((c) => c.optionId === 'rebuild')!.coverage.gaps;
    expect(costBlockers(gaps)).toEqual([
      { scope: 'shared', label: 'your confirmation of the release cadence', field: 'release-cadence-confirmed' },
    ]);
    // Priced: nothing to explain.
    const done: CostAssumptions = { ...almost, releaseCadence: { perYear: 2, confirmed: true } };
    for (const c of costComparison(done).costs) expect(costBlockers(c.coverage.gaps), c.optionId).toEqual([]);
  });

  test('the chip "Not determined" keeps its own element, and the reason stands beside it', () => {
    const cards = read('components/tco/OptionComparison.tsx');
    expect(cards).toMatch(/<span data-cost-option-not-determined=\{option\.id\}>\s*<CcProvenanceChip value="not-determined" \/>\s*<\/span>/);
    expect(cards).toContain('data-cost-option-why={option.id}');
    expect(cards).toContain('onGoToField?.(b.field)');
  });
});

test.describe('saved or not, per section', () => {
  const payload = (a: CostAssumptions): EconomicsPayload => ({ assumptions: a, inputs: { ...ECONOMICS_START_INPUTS } });

  test('a section is keyed by what it holds, from the text the save sends', () => {
    const seed = initialCostAssumptions();
    const before = sectionKeysOf(serializeEconomics(payload(seed)));
    expect(Object.keys(before)).toEqual(['rates', 'option:do-nothing', 'option:rebuild', 'option:standard', 'option:retire']);
    const after = sectionKeysOf(serializeEconomics(payload({ ...seed, devDayRate: 820 })));
    expect(after.rates).not.toBe(before.rates);
    expect(after['option:rebuild']).toBe(before['option:rebuild']);
    expect(sectionKeys(payload(seed))).toEqual(before);
    expect(sectionKeysOf(null)).toEqual({});
    expect(sectionKeysOf('not json')).toEqual({});
  });

  test('only a section that holds a figure is called saved on load', () => {
    const seed = initialCostAssumptions();
    expect(sectionsWithFigures(serializeEconomics(payload(seed)))).toEqual([]);
    const some: CostAssumptions = {
      ...seed,
      currency: 'EUR',
      options: seed.options.map((o) => (o.id === 'rebuild' ? { ...o, perRelease: { devDays: 1, testDays: 1 } } : o)),
    };
    expect(sectionsWithFigures(serializeEconomics(payload(some)))).toEqual(['rates', 'option:rebuild']);
  });

  test('changed is "Saving…", a failed save "Not saved" with its reason, stored "Saved" with its time', () => {
    const at = '2026-10-11T12:05:00.000Z';
    expect(sectionSave({ dirty: true, savedAt: at, save: { state: 'idle' } })).toEqual({ state: 'saving' });
    expect(sectionSave({ dirty: true, savedAt: at, save: { state: 'saving' } })).toEqual({ state: 'saving' });
    expect(sectionSave({ dirty: true, savedAt: null, save: { state: 'failed', message: 'the server answered 500' } })).toEqual({
      state: 'failed',
      message: 'the server answered 500',
    });
    expect(sectionSave({ dirty: true, savedAt: null, save: { state: 'unread' } }).state).toBe('failed');
    expect(sectionSave({ dirty: false, savedAt: at, save: { state: 'saved' } })).toEqual({ state: 'saved', at });
    // A section the failed save did not touch is still saved.
    expect(sectionSave({ dirty: false, savedAt: at, save: { state: 'failed', message: 'x' } })).toEqual({ state: 'saved', at });
    expect(sectionSave({ dirty: false, savedAt: null, save: { state: 'idle' } })).toEqual({ state: 'none' });
    expect(sectionSave({ dirty: true, savedAt: at, save: { state: 'read-only' } })).toEqual({ state: 'none' });
  });

  test('four cards read as one step, and a complete step is done only once stored', () => {
    const a = '2026-10-11T12:05:00.000Z';
    const b = '2026-10-11T12:07:00.000Z';
    expect(combineSaves([{ state: 'saved', at: a }, { state: 'saved', at: b }, { state: 'none' }])).toEqual({ state: 'saved', at: b });
    expect(combineSaves([{ state: 'saved', at: a }, { state: 'saving' }])).toEqual({ state: 'saving' });
    expect(combineSaves([{ state: 'saving' }, { state: 'failed', message: 'm' }])).toEqual({ state: 'failed', message: 'm' });
    expect(combineSaves([])).toEqual({ state: 'none' });
    expect(savedStepState(false, { state: 'saved', at: a })).toBeNull();
    expect(savedStepState(true, { state: 'saving' })).toBe('saving');
    expect(savedStepState(true, { state: 'failed', message: 'm' })).toBe('unsaved');
    expect(savedStepState(true, { state: 'saved', at: a })).toBe('done');
    expect(savedStepState(true, { state: 'none' })).toBe('done');
    // The step's word: complete while saving, and only "Done" once stored.
    expect(stepWord({ state: 'saving' })).toBe('Complete');
    expect(stepWord({ state: 'unsaved' })).toBe('Complete, not saved');
    expect(stepWord({ state: 'done' })).toBe('Done');
    expect(stepWord({ state: 'input' })).toBe('Your input needed');
  });

  test('the time is the reader’s clock, with its zone named', () => {
    expect(savedTimeText('2026-10-11T12:05:00.000Z')).toBe('12:05 UTC');
    expect(savedTimeText('2026-10-11T12:05:00.000Z', 'Europe/Berlin')).toBe('14:05 GMT+2');
    expect(savedTimeText('not a date')).toBeNull();
  });

  test('the page shows it per step and per card, politely, with a retry', () => {
    const page = read(PAGE);
    expect(page).toContain('<SaveStatus status={ratesSave} onRetry={retry} live scope="rates" />');
    expect(page).toContain('<SaveStatus status={effortSave} onRetry={retry} live scope="effort" />');
    expect(page).toContain('<SaveStatus status={sectionStatus(`option:${id}`)} onRetry={retry} scope={`option:${id}`} />');
    expect(page).toMatch(/state: savedStepState\(ratesDone, ratesSave\) \?\? 'input'/);
    const status = read('components/tco/SaveStatus.tsx');
    expect(status).toContain("'aria-live': 'polite' as const");
    expect(status).toContain('Not saved — {status.message}');
    expect(status).toContain('Retry');
    expect(status).toContain('Saving…');
    expect(status).toMatch(/`Saved · \$\{time\}`/);
  });
});

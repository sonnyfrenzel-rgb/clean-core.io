import { test, expect } from './helpers/test';
import { initialCostAssumptions, withKeyUserOption, effortProvenance, baselineProvenance } from '../components/tco/OptionComparison';
import {
  canonicalCostAssumptions,
  costAssumptionsRevision,
  costComparison,
  proposeEffort,
  proposeMaintenanceBaseline,
  type CostAssumptions,
} from '../lib/cost-assumptions';
import {
  TYPICAL_SHARED,
  canUseTypical,
  figuresOwnerWords,
  typicalFill,
  typicalInWords,
  typicalPatch,
  usesTypical,
  withReaderOptionPatch,
  withReaderPatch,
} from '../lib/typical-assumptions';
import { economicsInWords, restoreAssumptions, serializeEconomics, validateEconomicsPayload, ECONOMICS_START_INPUTS } from '../lib/economics-record';

/**
 * "Use typical assumptions" (3.5.1, ADR-144; owner 24.11.2026): one click fills what Economics still misses with typical
 * values, so the four options are priced at once. What it must never do is overwrite a figure the reader stated, or
 * let a typical value pass as the reader's own. Server-free: the arithmetic and the marks; the page is in
 * `tests/economics-page-rendered-serverfree.spec.ts` and `tests/tco-page-rendered.spec.ts`.
 */
const LOC = 552;
const proposals = { effort: proposeEffort(LOC), baseline: proposeMaintenanceBaseline(LOC, 40) };
const apply = (a: CostAssumptions): CostAssumptions => ({ ...a, ...typicalPatch(a, proposals) });

test.describe('one click on an empty stage', () => {
  test('fills every shared figure and every option, marks each one, and prices all four options', () => {
    const a = apply(initialCostAssumptions());
    expect(a.currency).toBe(TYPICAL_SHARED.currency.value);
    expect(a.devDayRate).toBe(TYPICAL_SHARED.devDayRate.value);
    expect(a.testDayRate).toBe(TYPICAL_SHARED.testDayRate.value);
    expect(a.horizonYears).toBe(TYPICAL_SHARED.horizonYears.value);
    expect(a.releaseCadence).toEqual({ perYear: TYPICAL_SHARED.releasesPerYear.value, confirmed: true });
    expect([...(a.typical ?? [])].sort()).toEqual(['currency', 'devDayRate', 'horizonYears', 'releaseCadence', 'testDayRate']);
    const c = costComparison(a);
    expect(c.costs).toHaveLength(4);
    for (const cost of c.costs) expect(cost.total, cost.label).not.toBeNull();
    // The effort is the size proposal of each option, unchanged, marked typical — never "Yours".
    for (const o of a.options) {
      const own = proposeEffort(LOC, o.kind)!;
      expect(o.oneOff).toEqual(own.oneOff);
      expect(o.perRelease).toEqual(own.perRelease);
      expect(o.typical).toContain('effort');
      expect(effortProvenance(o, own)).toBe('typical');
    }
    const keep = a.options.find((o) => o.kind === 'do-nothing')!;
    expect(keep.maintenanceBaselinePerYear).toEqual(proposals.baseline!.perYear);
    expect(baselineProvenance(keep, proposals.baseline)).toBe('typical');
    // The deferral is not invented: it is stated as not determined, with the reason.
    expect(keep.upgradeDelay).toMatchObject({ state: 'not-determined' });
    expect(keep.typical).toEqual(['effort', 'baseline', 'deferral']);
    // Nothing left to fill.
    expect(canUseTypical(a, proposals)).toBe(false);
  });

  test('every typical value is round and says where it comes from', () => {
    for (const [key, v] of Object.entries(TYPICAL_SHARED)) {
      expect(v.why.length, key).toBeGreaterThan(20);
      if (typeof v.value === 'number') expect(v.value % 1, `${key} is a round value`).toBe(0);
    }
    expect(TYPICAL_SHARED.devDayRate.value % 100).toBe(0);
    expect(TYPICAL_SHARED.testDayRate.value % 100).toBe(0);
  });
});

test.describe('never over a figure the reader stated', () => {
  test('stated shared figures stay, only the missing ones are filled and marked', () => {
    const start: CostAssumptions = { ...initialCostAssumptions(), currency: 'CHF', devDayRate: 1350, releaseCadence: { perYear: 2, confirmed: true } };
    const a = apply(start);
    expect(a.currency).toBe('CHF');
    expect(a.devDayRate).toBe(1350);
    expect(a.releaseCadence).toEqual({ perYear: 2, confirmed: true });
    expect(a.testDayRate).toBe(TYPICAL_SHARED.testDayRate.value);
    expect(a.horizonYears).toBe(TYPICAL_SHARED.horizonYears.value);
    expect([...(a.typical ?? [])].sort()).toEqual(['horizonYears', 'testDayRate']);
  });

  test('a cadence typed but not confirmed is the reader’s: neither replaced nor confirmed for them', () => {
    const start: CostAssumptions = { ...initialCostAssumptions(), releaseCadence: { perYear: 3, confirmed: false } };
    const a = apply(start);
    expect(a.releaseCadence).toEqual({ perYear: 3, confirmed: false });
    expect(a.typical).not.toContain('releaseCadence');
  });

  test('an option’s typed effort, a half-entered pair and a taken-over proposal stay; only empty parts are filled', () => {
    const base = initialCostAssumptions();
    const start: CostAssumptions = {
      ...base,
      options: base.options.map((o) =>
        o.kind === 'rebuild'
          ? { ...o, oneOff: { low: { devDays: 9, testDays: 3 }, high: { devDays: 12, testDays: 4 } }, perRelease: { devDays: 1, testDays: 1 } }
          : o.kind === 'standard'
            ? { ...o, perRelease: { devDays: NaN, testDays: 2 } }
            : o.kind === 'do-nothing'
              ? { ...o, upgradeDelay: { state: 'stated' as const, value: { releasesDeferred: 2 } } }
              : o,
      ),
    };
    const fill = typicalFill(start, proposals);
    expect(fill.options.rebuild).toBeUndefined();
    expect(fill.options.standard).toBeUndefined();
    expect(fill.options['do-nothing']).toEqual(['effort', 'baseline']);
    const a = apply(start);
    const rebuild = a.options.find((o) => o.kind === 'rebuild')!;
    expect(rebuild.oneOff).toEqual(start.options.find((o) => o.kind === 'rebuild')!.oneOff);
    expect(rebuild.typical).toBeUndefined();
    expect(a.options.find((o) => o.kind === 'standard')!.perRelease!.testDays).toBe(2);
    expect(a.options.find((o) => o.kind === 'do-nothing')!.upgradeDelay).toEqual({ state: 'stated', value: { releasesDeferred: 2 } });
  });

  test('key-user extensibility gets no typical days: Clean-Core.io proposes none for it', () => {
    const a = apply(withKeyUserOption(initialCostAssumptions()));
    const ku = a.options.find((o) => o.kind === 'keyuser')!;
    expect(ku.oneOff).toBeNull();
    expect(ku.typical).toBeUndefined();
  });

  test('without a line count it fills the shared figures and leaves the effort to the reader', () => {
    const a = { ...initialCostAssumptions(), ...typicalPatch(initialCostAssumptions(), { effort: null, baseline: null }) };
    expect(a.typical).toHaveLength(5);
    for (const o of a.options) expect(o.oneOff).toBeNull();
  });
});

test.describe('a typical value stays marked until the reader changes it', () => {
  test('changing a figure in place makes that one the reader’s; the rest stay typical', () => {
    const a = apply(initialCostAssumptions());
    const p = withReaderPatch(a, { devDayRate: 1200 });
    const after = { ...a, ...p };
    expect(after.typical).not.toContain('devDayRate');
    expect(after.typical).toHaveLength(4);
    const keep = after.options.find((o) => o.kind === 'do-nothing')!;
    const op = withReaderOptionPatch(keep, { maintenanceBaselinePerYear: { devDays: 3, testDays: 1 }, baselineSource: 'stated' });
    expect(op.typical).toEqual(['effort', 'deferral']);
    // The last mark gone: no mark left at all, and the record is then the reader's own.
    let mine = after;
    for (const k of ['currency', 'testDayRate', 'horizonYears', 'releaseCadence'] as const) {
      mine = { ...mine, ...withReaderPatch(mine, { [k]: mine[k] }) };
    }
    expect(mine.typical).toBeUndefined();
  });

  test('the revision of a typical scenario is never the revision of the same figures stated by the reader', () => {
    const a = apply(initialCostAssumptions());
    const own: CostAssumptions = { ...a, typical: undefined, options: a.options.map((o) => ({ ...o, typical: undefined })) };
    expect(costAssumptionsRevision(a)).not.toBe(costAssumptionsRevision(own));
    expect(canonicalCostAssumptions(a)).toContain('|typical=');
    // Without marks the canonical form is what it always was: no segment added.
    expect(canonicalCostAssumptions(own)).not.toContain('typical');
  });

  test('the marks are stored and come back; a mark the record does not know is refused', () => {
    const a = apply(initialCostAssumptions());
    const body = JSON.parse(serializeEconomics({ assumptions: a, inputs: { ...ECONOMICS_START_INPUTS } }));
    const checked = validateEconomicsPayload(body);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const back = restoreAssumptions(checked.value.assumptions);
    expect(back.typical).toEqual(a.typical);
    expect(back.options.map((o) => o.typical)).toEqual(a.options.map((o) => o.typical));
    expect(validateEconomicsPayload({ ...body, assumptions: { ...body.assumptions, typical: ['salary'] } }).ok).toBe(false);
    expect(validateEconomicsPayload({ ...body, assumptions: { ...body.assumptions, typical: ['currency', 'currency'] } }).ok).toBe(false);
  });

  test('wherever the scenario is named, it says typical, never "your own figures"', () => {
    const a = apply(initialCostAssumptions());
    expect(usesTypical(a)).toBe(true);
    expect(figuresOwnerWords(a)).toBe('typical assumptions, not your own figures');
    expect(figuresOwnerWords(initialCostAssumptions())).toBe('your own figures');
    expect(typicalInWords(a)).toBe(
      'currency EUR, developer day rate EUR 1,000, key-user day rate EUR 700, 5 years, 1 release a year and the effort of Keep, Rebuild, Move to SAP standard and Retire',
    );
    const record = {
      formatVersion: 1 as const,
      assumptions: a,
      inputs: { ...ECONOMICS_START_INPUTS },
      revision: costAssumptionsRevision(a),
      basis: { runId: null, score: null },
      savedAt: '2026-11-24T10:00:00.000Z',
    };
    expect(economicsInWords(record)).toContain('on typical assumptions, not your own figures');
  });
});

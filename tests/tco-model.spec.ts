import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tcoForecast, TCO_TARGET_SCORE, type TcoInputs } from '../lib/tco-model';

/**
 * The Economics forecast, run — not a copy of it.
 *
 * `tests/tco-finite-guard.spec.ts` carried a hand-written reproduction of the
 * page's arithmetic and checked the page itself only for a few identifiers, so
 * every behavioural assertion proved something about the copy (QA review of
 * 33471220d6e9, f3428b0782a9). The copy drifted the first time the page changed.
 * Roadmap 0.17: the calculation is `lib/tco-model.ts`, the page calls it, and
 * this spec calls the same function.
 */

const base: TcoInputs = {
  loc: 5000,
  devRate: 800,
  userRate: 600,
  upgradeFreq: 1,
  fpFreq: 2,
  oneTimeCost: 50_000,
  scoreBefore: 40,
};
const at = (over: Partial<TcoInputs> = {}): TcoInputs => ({ ...base, ...over });

test.describe('when the model declines', () => {
  test('a project nothing scored gets no forecast', () => {
    // The page used to substitute 30 and present exact euro figures on top of it.
    expect(tcoForecast(at({ scoreBefore: null }))).toBeNull();
    expect(tcoForecast(at({ scoreBefore: undefined as unknown as number }))).toBeNull();
    expect(tcoForecast(at({ scoreBefore: NaN }))).toBeNull();
  });

  test('a rate or an investment nobody entered gets no forecast', () => {
    expect(tcoForecast(at({ devRate: null }))).toBeNull();
    expect(tcoForecast(at({ userRate: null }))).toBeNull();
    expect(tcoForecast(at({ oneTimeCost: null }))).toBeNull();
  });

  test('code already at or above the assumed target is not modelled', () => {
    // At 100 the divisor is zero and every figure downstream is Infinity; at 99
    // it is worse, because -749 % ROI looks like a measurement.
    expect(tcoForecast(at({ scoreBefore: 100 }))).toBeNull();
    expect(tcoForecast(at({ scoreBefore: 99 }))).toBeNull();
    expect(tcoForecast(at({ scoreBefore: TCO_TARGET_SCORE }))).toBeNull();
    expect(tcoForecast(at({ scoreBefore: TCO_TARGET_SCORE - 1 })), 'one below the target still models').not.toBeNull();
  });

  test('a codebase too small to cost anything is not modelled', () => {
    // Below a few hundred lines every figure rounds to a division by zero
    // wearing a euro sign.
    expect(tcoForecast(at({ loc: 100 }))).toBeNull();
  });
});

test.describe('what it computes when it does', () => {
  test('the first year pays for itself or it does not', () => {
    const cheap = tcoForecast(at({ oneTimeCost: 1_000 }))!;
    expect(cheap.roiYear1).toBe(Math.round(((cheap.annualSavings - 1_000) / 1_000) * 100));
    expect(cheap.roiYear1, 'savings well above a small investment are a positive return').toBeGreaterThan(0);

    const dear = tcoForecast(at({ oneTimeCost: 10_000_000 }))!;
    expect(dear.roiYear1, 'a first year that does not recover the investment is negative').toBeLessThan(0);
    expect(dear.cumulativeSavings5Yr[1]['Net Financial Benefit'], 'and the curve agrees with it').toBeLessThan(0);
  });

  test('a return needs something spent, and a payback needs something saved', () => {
    expect(tcoForecast(at({ oneTimeCost: 0 }))!.roiYear1, 'no investment, no return figure').toBeNull();
    const noSaving = tcoForecast(at({ scoreBefore: 94 }));
    if (noSaving && noSaving.annualSavings <= 0) expect(noSaving.paybackMonths).toBeNull();
  });

  test('the forecast starts at the investment and every row carries the chart keys', () => {
    const f = tcoForecast(at())!;
    expect(f.cumulativeSavings5Yr).toHaveLength(6);
    const yearZero = f.cumulativeSavings5Yr[0];
    expect(yearZero.year).toBe('Year 0');
    expect(yearZero['Net Financial Benefit'], 'Year 0 is the investment, drawn as a loss').toBe(-50_000);
    expect(yearZero['Modernized TCO']).toBe(50_000);
    for (const row of f.cumulativeSavings5Yr) {
      // Recharts drops a row that has no value under the series key — which is
      // how the investment stopped being drawn at all.
      expect(Object.keys(row).sort()).toEqual(['Legacy TCO', 'Modernized TCO', 'Net Financial Benefit', 'year']);
    }
  });

  test('no figure is ever non-finite, at any score the page can hold', () => {
    for (const scoreBefore of [0, 1, 30, 60, 80, 94]) {
      const f = tcoForecast(at({ scoreBefore }));
      if (f === null) continue; // declining is a valid outcome
      for (const row of f.cumulativeSavings5Yr) {
        for (const v of Object.values(row)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `a chart value at score ${scoreBefore} is not finite`).toBe(true);
        }
      }
      expect(Number.isFinite(f.overheadReductionPct)).toBe(true);
      expect(Number.isFinite(f.annualSavings)).toBe(true);
      if (f.roiYear1 !== null) expect(Number.isFinite(f.roiYear1)).toBe(true);
      if (f.paybackMonths !== null) expect(Number.isFinite(f.paybackMonths)).toBe(true);
    }
  });

  test('the modernised side is not pinned above the legacy side', () => {
    // The floors used to be asymmetric — legacy rounding to zero days while the
    // modernised side was pinned at one each — so the model reported that
    // modernising cost money every year and paid back in negative months.
    const f = tcoForecast(at({ loc: 1200, scoreBefore: 35 }))!;
    expect(f.modernAnnualTotal).toBeLessThan(f.legacyAnnualTotal);
    expect(f.annualSavings).toBeGreaterThan(0);
    expect(f.paybackMonths!).toBeGreaterThan(0);
  });
});

test.describe('the module carries the guards the page used to be grepped for', () => {
  test('the divisor is guarded before it is used', () => {
    const src = readFileSync(join(process.cwd(), 'lib/tco-model.ts'), 'utf8');
    const guardAt = src.indexOf('if (scoreBefore >= scoreAfter) return null;');
    const divisionAt = src.indexOf('const factor = (100 - scoreAfter) / (100 - scoreBefore)');
    expect(guardAt, 'the guard exists').toBeGreaterThan(-1);
    expect(guardAt, 'and comes before the division it protects').toBeLessThan(divisionAt);
  });

  test('a non-finite input is refused rather than drawn', () => {
    // The backstop the page was searched for (`everyFigureFinite`), exercised
    // instead of read: a chart is the one place Infinity renders quietly.
    expect(tcoForecast(at({ devRate: Infinity }))).toBeNull();
    expect(tcoForecast(at({ oneTimeCost: Infinity }))).toBeNull();
    expect(tcoForecast(at({ loc: Infinity }))).toBeNull();
    expect(tcoForecast(at({ upgradeFreq: NaN }))).toBeNull();
  });
});

test('the page runs this model and keeps no copy of it', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/project/[projectId]/tco/page.tsx'), 'utf8');
  expect(page).toContain("from '@/lib/tco-model'");
  expect(page).toContain('tcoForecast({');
  // The arithmetic that used to sit in the page's useMemo.
  expect(page, 'the adaptation factor lives in the model').not.toMatch(/const factor = \(100 - scoreAfter\)/);
  expect(page, 'and so does the ROI').not.toMatch(/const roiYear1 =/);
  // The refusal threshold is the model's, not a literal beside it.
  expect(page).toContain('TCO_TARGET_SCORE');
});

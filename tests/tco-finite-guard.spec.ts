/**
 * E12-F01-US01 — no chart receives a non-finite number.
 *
 * The acceptance names the cases: "Die Fälle Score100, Score99, Nullinvestition
 * und fehlender Score liefern valide, klar bezeichnete Ergebnisse oder nicht
 * berechenbar. Kein Diagramm erhält nicht endliche Zahlen."
 *
 * v2.8.6 guarded the ROI and payback divisions but not the one upstream of them.
 * `factor = (100 - scoreAfter) / (100 - scoreBefore)` divides by zero at a score
 * of 100, and Infinity then propagates into the ROI, the overhead-reduction
 * percentage and every modernised year of the five-year chart.
 *
 * Score 99 is the more interesting half: nothing divides by zero, so the output
 * is finite and therefore looks trustworthy — factor 5, "modernising costs 3.35x
 * more", ROI -749%, overhead reduction -235%. Both come from `scoreAfter` being
 * a fixed assumption of 95 that code at or above it cannot improve on.
 *
 * The model is inline in the page component, so this reproduces its arithmetic
 * rather than importing it. That is a real limit of this test: it pins the shape
 * of the bug and the rule, and a future extraction of the model into lib/ should
 * take this spec with it.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const PAGE = path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/tco/page.tsx');

const SCORE_AFTER = 95;

/** The page's model, with the guard under test applied. */
function model(scoreBefore: number, oneTimeCost = 15000) {
  const loc = 8500;
  const devRate = 900;
  const userRate = 650;

  const legacyDev = Math.round((loc / 1000) * 2.5 * 1) + Math.round((loc / 1000) * 0.8 * 2);
  const legacyTest = Math.round((loc / 1000) * 1.8 * 1) + Math.round((loc / 1000) * 0.6 * 2);
  const legacyAnnual = legacyDev * devRate + legacyTest * userRate;
  if (legacyAnnual <= 0) return null;

  // The guard this spec exists for.
  if (scoreBefore >= SCORE_AFTER) return null;

  const factor = (100 - SCORE_AFTER) / (100 - scoreBefore);
  const modernAnnual = Math.round(legacyDev * factor) * devRate + Math.round(legacyTest * 0.15) * userRate;
  const annualSavings = legacyAnnual - modernAnnual;

  const chart = Array.from({ length: 6 }, (_, i) =>
    i === 0 ? -oneTimeCost : Math.round(legacyAnnual * i - (oneTimeCost + modernAnnual * i)),
  );

  return {
    annualSavings,
    overheadReductionPct: Math.round((1 - modernAnnual / legacyAnnual) * 100),
    roiYear1: oneTimeCost > 0 ? Math.round((annualSavings / oneTimeCost) * 100) : null,
    paybackMonths: annualSavings > 0 ? Math.round((oneTimeCost / annualSavings) * 12 * 10) / 10 : null,
    chart,
  };
}

test.describe('the cases the acceptance criterion names', () => {
  test('a score of 100 is not modelled at all', () => {
    // Unguarded this is 5/0 — Infinity through the ROI, the overhead percentage
    // and every modernised year of the chart.
    expect(model(100)).toBeNull();
  });

  test('a score of 99 is not modelled either', () => {
    // Finite, and therefore the more dangerous of the two: it renders as a
    // confident negative business case rather than as an obvious error.
    expect(model(99)).toBeNull();
  });

  test('a score at the assumed target is not modelled', () => {
    expect(model(SCORE_AFTER)).toBeNull();
  });

  test('a zero investment yields no ROI figure rather than an infinite one', () => {
    const result = model(40, 0);
    expect(result).not.toBeNull();
    expect(result!.roiYear1, 'ROI against a zero investment is not a number').toBeNull();
  });

  test('a modellable score still produces a full, finite result', () => {
    const result = model(40);
    expect(result).not.toBeNull();
    expect(result!.annualSavings).toBeGreaterThan(0);
    expect(result!.paybackMonths).not.toBeNull();
    for (const v of result!.chart) expect(Number.isFinite(v)).toBe(true);
  });
});

test.describe('no chart value is ever non-finite', () => {
  for (const score of [0, 1, 30, 60, 94, 95, 99, 100]) {
    test(`score ${score}`, () => {
      const result = model(score);
      if (result === null) return; // declining to model is a valid outcome
      for (const v of result.chart) {
        expect(Number.isFinite(v), `chart value ${v} at score ${score} is not finite`).toBe(true);
      }
      expect(Number.isFinite(result.overheadReductionPct)).toBe(true);
      if (result.roiYear1 !== null) expect(Number.isFinite(result.roiYear1)).toBe(true);
    });
  }
});

test.describe('the page carries the guard, not just this spec', () => {
  test('the divisor is guarded before it is used', () => {
    const src = fs.readFileSync(PAGE, 'utf8');
    expect(
      /if\s*\(scoreBefore\s*>=\s*scoreAfter\)\s*return null;/.test(src),
      'the page must decline to model at or above the assumed target',
    ).toBe(true);

    const guardAt = src.indexOf('if (scoreBefore >= scoreAfter) return null;');
    const divisionAt = src.indexOf('const factor = (100 - scoreAfter) / (100 - scoreBefore)');
    expect(guardAt, 'the guard must come before the division it protects').toBeLessThan(divisionAt);
  });

  test('a finite backstop covers the inputs nobody thought of', () => {
    const src = fs.readFileSync(PAGE, 'utf8');
    expect(src).toContain('everyFigureFinite');
    expect(src).toContain('Number.isFinite');
  });
});

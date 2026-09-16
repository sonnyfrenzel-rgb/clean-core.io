/**
 * The maintenance forecast behind the Economics stage — the whole calculation,
 * in one place, so that what the page shows and what the tests check are the
 * same arithmetic.
 *
 * It used to live inside the stage's `useMemo`, and `tests/tco-finite-guard.spec.ts`
 * carried a hand-written copy of it: every behavioural assertion ran the copy,
 * and the page itself was only grepped for a few identifiers. The copy drifted
 * the first time the page changed — the Year-1 ROI was corrected in the page and
 * the spec still computed the old ratio (QA review of 33471220d6e9,
 * f3428b0782a9). Roadmap 0.17: tests that check what they claim.
 *
 * Every refusal in here is deliberate. The model declines rather than
 * manufacturing a figure, and `null` is its way of saying "not for these
 * inputs" — which is a different statement from zero, and the page makes it
 * separately.
 */

export interface TcoInputs {
  /** Lines of custom code the forecast is about. */
  loc: number;
  /** Day rate of a developer, in euro. `null` means nobody entered one. */
  devRate: number | null;
  /** Day rate of a business tester, in euro. */
  userRate: number | null;
  /** Major upgrades per year. */
  upgradeFreq: number;
  /** Feature packs per year. */
  fpFreq: number;
  /** One-time modernisation investment, in euro. */
  oneTimeCost: number | null;
  /**
   * The clean-core score of the analysed code. `null` when nothing measured it
   * — the page used to substitute 30 and present exact euro figures on top.
   */
  scoreBefore: number | null;
}

export interface TcoForecastRow {
  year: string;
  'Legacy TCO': number;
  'Modernized TCO': number;
  'Net Financial Benefit': number;
}

export interface TcoForecast {
  legacyDevDaysTotal: number;
  legacyTestDaysTotal: number;
  legacyAnnualTotal: number;
  modernDevDaysTotal: number;
  modernTestDaysTotal: number;
  modernAnnualTotal: number;
  annualSavings: number;
  overheadReductionPct: number;
  cumulativeSavings5Yr: TcoForecastRow[];
  /** `null` when nothing is saved per year — a payback period would be infinite. */
  paybackMonths: number | null;
  /** `null` against a zero investment — a return needs something spent. */
  roiYear1: number | null;
  scoreBefore: number;
  scoreAfter: number;
  devRate: number;
  userRate: number;
}

/** The score this model assumes modernised code reaches. An assumption, labelled as one. */
export const TCO_TARGET_SCORE = 95;

/**
 * The forecast, or `null` when the inputs do not support one.
 *
 * Refuses when: a rate or the investment is missing; nothing scored the code;
 * the code already scores at or above the assumed target (there is nothing this
 * model can offer, and computing anyway produced a negative case out of an
 * assumption); the legacy side rounds to no maintenance cost at all; or any
 * figure comes out non-finite.
 */
export function tcoForecast(inputs: TcoInputs): TcoForecast | null {
  const { loc, devRate, userRate, upgradeFreq, fpFreq, oneTimeCost, scoreBefore } = inputs;

  // No forecast from figures nobody entered.
  if (devRate === null || userRate === null || oneTimeCost === null) return null;
  if (!Number.isFinite(devRate) || !Number.isFinite(userRate) || !Number.isFinite(oneTimeCost)) return null;
  if (!Number.isFinite(loc) || !Number.isFinite(upgradeFreq) || !Number.isFinite(fpFreq)) return null;

  // Without a baseline there is no model. Returning null here is the whole
  // point: the page used to substitute 30 and then present exact euro figures,
  // payback months and an ROI percentage for a project nothing had measured.
  if (typeof scoreBefore !== 'number' || !Number.isFinite(scoreBefore)) return null;

  const scoreAfter = TCO_TARGET_SCORE;

  // 1. Pre-modernisation maintenance effort (days per year). Legacy custom code
  // is tightly coupled and needs substantial adaptation per upgrade.
  const legacyDevDaysTotal = Math.round((loc / 1000) * 2.5 * upgradeFreq) + Math.round((loc / 1000) * 0.8 * fpFreq);
  const legacyTestDaysTotal = Math.round((loc / 1000) * 1.8 * upgradeFreq) + Math.round((loc / 1000) * 0.6 * fpFreq);
  const legacyAnnualTotal = legacyDevDaysTotal * devRate + legacyTestDaysTotal * userRate;

  // 2. Post-modernisation effort.
  //
  // The divisor below is `100 - scoreBefore`. At a score of 100 it is zero:
  // `factor` becomes Infinity, and from there the ROI reads -Infinity, the
  // overhead reduction reads -Infinity, and the five-year chart is handed
  // Infinity for every modernised year. At 99 there is no division by zero and
  // the output is worse for it, because it looks like a number: factor 5, so
  // the model claims modernising costs 3.35x more, ROI -749 %, "overhead
  // reduction" -235 %. Both cases have the same cause — `scoreAfter` is a fixed
  // assumption, and code already at or above it has nothing this model can
  // offer. So the model declines instead of computing.
  if (scoreBefore >= scoreAfter) return null;

  const factor = (100 - scoreAfter) / (100 - scoreBefore);

  // No `Math.max(1, …)`. The floors were asymmetric: the legacy side rounds to
  // zero days for a small codebase while the modernised side was pinned at one
  // day each, so the model reported that modernising *costs* €1,550 a year and
  // pays back in −116 months.
  const modernDevDaysTotal = Math.round(legacyDevDaysTotal * factor);
  const modernTestDaysTotal = Math.round(legacyTestDaysTotal * 0.15); // 85 % automated coverage
  const modernAnnualTotal = modernDevDaysTotal * devRate + modernTestDaysTotal * userRate;

  // 3. Benefits.
  const annualSavings = legacyAnnualTotal - modernAnnualTotal;
  const cumulativeSavings5Yr: TcoForecastRow[] = Array.from({ length: 6 }, (_, i) => {
    // The Year-0 row once used its own key for the net benefit, so Recharts
    // found no value for it and drew the forecast from Year 1 — the investment,
    // the one negative point, was simply not in the picture.
    if (i === 0) {
      return { year: 'Year 0', 'Legacy TCO': 0, 'Modernized TCO': oneTimeCost, 'Net Financial Benefit': -oneTimeCost };
    }
    const legacyCum = legacyAnnualTotal * i;
    const modernCum = oneTimeCost + modernAnnualTotal * i;
    return {
      year: `Year ${i}`,
      'Legacy TCO': Math.round(legacyCum),
      'Modernized TCO': Math.round(modernCum),
      'Net Financial Benefit': Math.round(legacyCum - modernCum),
    };
  });

  // Below a few hundred lines the whole model rounds to nothing: there is no
  // legacy maintenance cost to save against, so every figure downstream is a
  // division by zero wearing a euro sign.
  if (legacyAnnualTotal <= 0) return null;

  // Two divisions with no guard on their divisor, both reachable from the
  // controls on the page: an investment of 0 made the ROI `Infinity`, and code
  // that already scores at the target saves nothing per year, which made the
  // payback period `Infinity` too. Neither is a number, so neither is shown as one.
  const paybackMonths = annualSavings > 0 ? Math.round((oneTimeCost / annualSavings) * 12 * 10) / 10 : null;
  // Year-1 ROI is the return after the investment, not the ratio of savings to
  // it: with €100k invested and €20k saved, the old figure printed "20 %"
  // beside its own Year-1 net benefit of -€80k.
  const roiYear1 = oneTimeCost > 0 ? Math.round(((annualSavings - oneTimeCost) / oneTimeCost) * 100) : null;
  const overheadReductionPct = Math.round((1 - modernAnnualTotal / legacyAnnualTotal) * 100);

  // Backstop rather than the primary defence. Every known path is guarded
  // above; this catches the next input nobody thought of, because a chart is
  // the one place a non-finite number renders without complaining.
  const everyFigureFinite = [
    legacyAnnualTotal, modernAnnualTotal, annualSavings, overheadReductionPct,
    ...cumulativeSavings5Yr.flatMap((r) => Object.values(r).filter((v) => typeof v === 'number') as number[]),
  ].every(Number.isFinite);
  if (!everyFigureFinite) return null;

  return {
    legacyDevDaysTotal,
    legacyTestDaysTotal,
    legacyAnnualTotal,
    modernDevDaysTotal,
    modernTestDaysTotal,
    modernAnnualTotal,
    annualSavings,
    overheadReductionPct,
    cumulativeSavings5Yr,
    paybackMonths,
    roiYear1,
    scoreBefore,
    scoreAfter,
    // The rates the figures were priced with — non-null here by the gate above.
    devRate,
    userRate,
  };
}

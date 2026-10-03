import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { fillEconomics } from './helpers/economics';
import { signInViaLanding } from './helpers/sign-in';
import {
  costComparison,
  proposeEffort,
  proposeMaintenanceBaseline,
  PROPOSED_MAINTENANCE_PER_1000_LINES,
  type CostAssumptions,
} from '../lib/cost-assumptions';
import {
  baselineProvenance,
  initialCostAssumptions,
  pendingProposals,
  takeOverPatch,
  type OptionProposals,
} from '../components/tco/OptionComparison';
import { formatDays, formatMoney, formatPercentValue, formatRatio, roundDays } from '../lib/format';

/**
 * Economics as a guided flow (owner, 03.10.2026): "the user doesn't find their
 * way here. You first have to find 'Take over the proposal, as my figure'.
 * Everything is unnecessarily complex, with very unnecessary figures like
 * 0.065999999."
 *
 *   1. No number on the stage carries more than two decimals — text or input.
 *   2. The next step is above the fold, and taking over the proposal is one
 *      action away from it.
 *   3. Taking over turns the proposal into the reader's own figure, and says so.
 *   4. Nothing scrolls sideways on a phone.
 *
 * 668 lines on purpose: 0.668 × 5 days came out as 3.3400000000000003 in the
 * effort inputs before the proposal was rounded where it is made.
 */

const STAMP = Date.now();
const EMAIL = `econ-guide-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT = `econ-guide-${STAMP}`;
const RUN_ID = `econ-guide-run-${STAMP}`;
const LOC = 668;
const RAW_FLOAT = /\d+\.\d{3,}/;

test.describe('the formatting rules', () => {
  test('money, days, percentages and ratios have a stated precision', () => {
    expect(formatMoney(12345.678, 'EUR')).toBe('EUR 12,346');
    expect(formatMoney(820.456, 'EUR')).toBe('EUR 820.46');
    expect(formatMoney(820, '')).toBeNull();
    expect(formatDays(3.3400000000000003)).toBe('3.3');
    expect(formatDays(0.06599999)).toBe('0.07');
    expect(formatPercentValue(85.66)).toBe('86%');
    expect(formatPercentValue(85.66, 1)).toBe('85.7%');
    expect(formatPercentValue(-0.2)).toBe('0%');
    expect(formatRatio(0.1499999)).toBe('0.15');
    expect(roundDays(0.668 * 5)).toBe(3.3);
  });

  test('the proposal is rounded where it is made, so an input never shows a float', () => {
    for (const loc of [33, 420, 668, 8500, 12345]) {
      const p = proposeEffort(loc)!;
      const all = [p.oneOff.low, p.oneOff.high, p.perRelease].flatMap((d) => [d.devDays, d.testDays]);
      for (const v of all) expect(String(v), `${loc} lines`).not.toMatch(RAW_FLOAT);
    }
  });
});

/**
 * The maintenance-baseline proposal for Keep and Do nothing (owner decision
 * 03.10.2026, ADR-035 addendum): derived from the lines and the signed run's
 * score, labelled a proposal, and never in the model until taken over.
 */
test.describe('the maintenance-baseline proposal', () => {
  test('is the lines times fixed factors, raised for the signed score, and rounded where it is made', () => {
    const f = PROPOSED_MAINTENANCE_PER_1000_LINES;
    const withScore = proposeMaintenanceBaseline(668, 62)!;
    expect(withScore.uplift).toBeCloseTo(1.38, 10);
    expect(withScore.perYear).toEqual({
      devDays: roundDays(0.668 * f.devPerYear * 1.38),
      testDays: roundDays(0.668 * f.testPerYear * 1.38),
    });
    expect(withScore.perYear).toEqual({ devDays: 1.4, testDays: 0.74 });
    expect(withScore.sentence).toMatch(/Clean Core Score of 62/);

    // No score, or a figure that is not one: no uplift, and the sentence says so.
    for (const score of [null, undefined, -1, 101, NaN]) {
      const p = proposeMaintenanceBaseline(8500, score)!;
      expect(p.score, String(score)).toBeNull();
      expect(p.uplift).toBe(1);
      expect(p.perYear).toEqual({ devDays: 12.8, testDays: 6.8 });
      expect(p.sentence).toMatch(/no Clean Core Score/);
    }
    for (const loc of [null, undefined, 0, -5, NaN]) expect(proposeMaintenanceBaseline(loc, 62)).toBeNull();

    for (const loc of [33, 420, 668, 8500, 12345]) {
      for (const score of [0, 7, 33, 62, 99, 100, null]) {
        const { devDays, testDays } = proposeMaintenanceBaseline(loc, score)!.perYear;
        for (const v of [devDays, testDays]) expect(String(v), `${loc} lines, score ${score}`).not.toMatch(RAW_FLOAT);
      }
    }
  });

  test('is offered for Keep and Do nothing only, and is not in the model before it is taken over', () => {
    const proposals: OptionProposals = { effort: proposeEffort(668), baseline: proposeMaintenanceBaseline(668, 62) };
    const seed = initialCostAssumptions();
    const states = Object.fromEntries(seed.options.map((o) => [o.id, baselineProvenance(o, proposals.baseline)]));
    expect(states).toEqual({ 'do-nothing': 'proposal', keep: 'proposal', standard: null });
    expect(baselineProvenance(seed.options[0], null), 'no line count, nothing to propose').toBe('not-entered');

    // A complete set of figures — except the baselines, which only the proposal offers.
    const base: CostAssumptions = {
      ...seed,
      currency: 'EUR',
      devDayRate: 820,
      testDayRate: 640,
      horizonYears: 5,
      releaseCadence: { perYear: 2, confirmed: true },
      options: seed.options.map((o) => ({
        ...o,
        ...takeOverPatch({ ...o, kind: 'standard' }, { ...proposals, baseline: null }),
        upgradeDelay: o.kind === 'do-nothing' ? { state: 'stated' as const, value: { releasesDeferred: 2 } } : null,
      })),
    };
    for (const o of base.options) expect(o.maintenanceBaselinePerYear, o.id).toBeNull();
    const before = costComparison(base);
    for (const id of ['do-nothing', 'keep']) {
      const cost = before.costs.find((c) => c.optionId === id)!;
      expect(cost.total, `${id} is not priced on a proposal nobody took over`).toBeNull();
      expect(cost.coverage.gaps.map((g) => g.code)).toContain('option-baseline-missing');
    }
    expect(before.winner).toBeNull();
    expect(pendingProposals(base.options, proposals).map((o) => o.id)).toEqual(['do-nothing', 'keep']);

    // Taken over: the figure lands in the option, its provenance says so, and only now is it priced.
    const after: CostAssumptions = {
      ...base,
      options: base.options.map((o) => ({ ...o, ...takeOverPatch(o, proposals) })),
    };
    for (const id of ['do-nothing', 'keep']) {
      const o = after.options.find((x) => x.id === id)!;
      expect(o.maintenanceBaselinePerYear).toEqual({ devDays: 1.4, testDays: 0.74 });
      expect(o.baselineSource).toBe('proposal-confirmed');
      expect(baselineProvenance(o, proposals.baseline)).toBe('from-proposal');
      // The effort the reader already had is not touched by the baseline's take-over.
      expect(o.effortSource).toBe('proposal-confirmed');
      expect(costComparison(after).costs.find((c) => c.optionId === id)!.total).not.toBeNull();
    }
    expect(after.options.find((o) => o.id === 'standard')!.maintenanceBaselinePerYear).toBeNull();
    expect(pendingProposals(after.options, proposals)).toEqual([]);

    // A figure typed over a taken-over one is the reader's own.
    const typed = { ...after.options[0], maintenanceBaselinePerYear: { devDays: 3, testDays: 1 }, baselineSource: 'stated' as const };
    expect(baselineProvenance(typed, proposals.baseline)).toBe('stated');
  });
});

test.describe('the guided stage', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Econ', lastName: 'Guide', email: EMAIL, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    const legacyCode = Array.from({ length: LOC }, (_, i) => `WRITE: / 'line ${i}'.`).join('\n');
    await adminSetDoc('projects', PROJECT, {
      name: 'Economics guidance fixture', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
      legacyCode, analysis: JSON.stringify({ cleanCoreScore: 62 }), cleanCoreScore: 62, activeRunId: RUN_ID,
    });
    await adminSetDoc(`projects/${PROJECT}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT, userId: cred.user.uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  async function open(page: Page, width: number, height: number) {
    await page.setViewportSize({ width, height });
    await signInViaLanding(page, EMAIL, SIGN_IN, { pauseMs: 3500 });
    await page.goto(`/project/${PROJECT}/tco`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-economics-steps]', { timeout: 60000 });
  }

  /** Every number the stage shows, as text and as the value of an input. */
  async function rawNumbers(page: Page): Promise<string[]> {
    return page.locator('[data-economics]').evaluate((root, pattern) => {
      const re = new RegExp(pattern, 'g');
      // Open every fold first, so what is one action deeper is checked too.
      const text = (root as HTMLElement).innerText + ' ' + (root.textContent ?? '');
      const values = Array.from(root.querySelectorAll('input')).map((i) => (i as HTMLInputElement).value);
      return [...(text.match(re) ?? []), ...values.filter((v) => new RegExp(pattern).test(v))];
    }, RAW_FLOAT.source);
  }

  async function fillRates(page: Page) {
    await fillEconomics(page, '[data-cost-field="currency"]', 'EUR');
    await fillEconomics(page, '[data-cost-field="dev-day-rate"]', '820');
    await fillEconomics(page, '[data-cost-field="test-day-rate"]', '640');
    await fillEconomics(page, '[data-cost-field="horizon-years"]', '5');
    await fillEconomics(page, '[data-cost-field="release-cadence"]', '2');
    await page.check('[data-cost-field="release-cadence-confirmed"] input[type="checkbox"]');
  }

  test('the next step is above the fold, and the proposal is one action away', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await open(page, 1440, 900);
    const next = page.locator('[data-economics-next]');
    await expect(next).toBeInViewport();
    await expect(next).toHaveAttribute('data-economics-next', '2');
    await expect(next.locator('[data-economics-next-action]')).toBeInViewport();

    // The take-over stands in the guide while the rates are still the next step.
    const takeOver = page.locator('[data-economics-steps] [data-economics-take-over-all]');
    await expect(takeOver).toBeInViewport();
    await expect(takeOver).toHaveText(/Take over all 3 proposals/);

    // Once the rates are in, the take-over is the next step itself.
    await fillRates(page);
    await expect(next).toHaveAttribute('data-economics-next', '3');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(next.locator('[data-economics-next-action]')).toHaveText(/Take over all 3 proposals/);
    await expect(next.locator('[data-economics-next-action]')).toBeInViewport();
    expect(await rawNumbers(page), 'a raw float on the stage').toEqual([]);
  });

  test('taking over makes the proposal the reader’s own figure, and says so', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await open(page, 1440, 900);
    const options = page.locator('[data-cost-option]');
    await expect(options).toHaveCount(3);
    for (const id of ['do-nothing', 'keep', 'standard']) {
      await expect(page.locator(`[data-cost-option="${id}"]`)).toHaveAttribute('data-effort-provenance', 'proposal');
      await expect(page.locator(`[data-cost-option="${id}"] [data-effort-chip="proposal"]`)).toContainText('Simulation');
    }

    // The maintenance baseline is proposed for Keep and Do nothing, and for nothing else.
    const baseline = proposeMaintenanceBaseline(LOC, 62)!;
    for (const id of ['do-nothing', 'keep']) {
      const card = page.locator(`[data-cost-option="${id}"]`);
      await expect(card).toHaveAttribute('data-baseline-provenance', 'proposal');
      await expect(card.locator('[data-baseline-chip="proposal"]')).toContainText('Simulation');
      await expect(card.locator(`[data-cost-baseline-proposal="${id}"]`)).toHaveText(
        `${formatDays(baseline.perYear.devDays)} developer and ${formatDays(baseline.perYear.testDays)} key-user days of maintenance per year.`,
      );
    }
    await expect(page.locator('[data-cost-option="standard"]')).not.toHaveAttribute('data-baseline-provenance', /.*/);
    await expect(page.locator('[data-cost-baseline-proposal]')).toHaveCount(2);
    // Not in the model before it is taken over: the field is empty, the option unpriced.
    await page.click('[data-cost-option-edit="keep"]');
    await expect(page.locator('[data-cost-field="keep-baseline-dev"]')).toHaveValue('');
    await page.click('[data-cost-option-edit="keep"]');

    // One option, by its own button — its effort and its baseline in one action.
    await page.click('[data-cost-apply-proposal="keep"]');
    const keep = page.locator('[data-cost-option="keep"]');
    await expect(keep).toHaveAttribute('data-effort-provenance', 'from-proposal');
    await expect(keep).toHaveAttribute('data-baseline-provenance', 'from-proposal');
    await expect(keep.locator('[data-effort-chip="from-proposal"]')).toContainText('your figure, from the proposal');
    await expect(keep.locator('[data-baseline-chip="from-proposal"]')).toContainText('your figure, from the proposal');
    await expect(keep.locator('[data-cost-apply-proposal]')).toHaveCount(0);

    // The rest in one action.
    await page.locator('[data-economics-steps] [data-economics-take-over-all]').click();
    for (const id of ['do-nothing', 'standard']) {
      await expect(page.locator(`[data-cost-option="${id}"]`)).toHaveAttribute('data-effort-provenance', 'from-proposal');
    }
    await expect(page.locator('[data-cost-option="do-nothing"]')).toHaveAttribute('data-baseline-provenance', 'from-proposal');
    await expect(page.locator('[data-economics-take-over-all]')).toHaveCount(0);

    // The taken-over baseline is in the input, rounded; typing over it makes it the reader's own.
    await page.click('[data-cost-option-edit="do-nothing"]');
    const baselineDev = page.locator('[data-cost-field="do-nothing-baseline-dev"]');
    await expect(baselineDev).toHaveValue(String(baseline.perYear.devDays));
    await baselineDev.fill('3');
    await expect(page.locator('[data-cost-option="do-nothing"]')).toHaveAttribute('data-baseline-provenance', 'stated');
    await expect(page.locator('[data-cost-option="do-nothing"]')).toHaveAttribute('data-effort-provenance', 'from-proposal');

    // The taken-over figures are rounded in the input too, and editing one makes it a typed figure.
    await page.click('[data-cost-option-edit="standard"]');
    const high = page.locator('[data-cost-field="standard-oneoff-high-dev"]');
    await expect(high).toHaveValue('3.3');
    await high.fill('4');
    await expect(page.locator('[data-cost-option="standard"]')).toHaveAttribute('data-effort-provenance', 'stated');
    await expect(page.locator('[data-cost-option="standard"] [data-effort-chip="stated"]')).toContainText('your figure');
    expect(await rawNumbers(page), 'a raw float on the stage').toEqual([]);
  });

  test('a complete scenario shows no raw float, folded parts included', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await open(page, 1440, 900);
    await fillRates(page);
    await page.locator('[data-economics-next] [data-economics-take-over-all]').click();
    for (const id of ['do-nothing', 'keep']) {
      await fillEconomics(page, `[data-cost-field="${id}-baseline-dev"]`, '3');
      await fillEconomics(page, `[data-cost-field="${id}-baseline-test"]`, '1');
    }
    await fillEconomics(page, '[data-cost-field="do-nothing-upgrade-delay"]', '2');
    await fillEconomics(page, '[data-tco-cost="investment"]', '40000');
    await expect(page.locator('[data-cost-winner], [data-cost-no-winner]')).toBeVisible();
    await expect(page.getByText('Annual Net Savings · Scenario')).toBeVisible();
    await expect(page.locator('[data-economics-next]')).toHaveAttribute('data-economics-next', 'none');
    await page.locator('[data-economics-how] [data-cc-disclosure] button').first().click();
    expect(await rawNumbers(page), 'a raw float on the stage').toEqual([]);
  });

  test('nothing scrolls sideways at 390 px', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await open(page, 390, 844);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow(), 'empty stage').toBeLessThanOrEqual(0);
    await expect(page.locator('[data-economics-next] [data-economics-next-action]')).toBeVisible();
    await fillRates(page);
    await page.locator('[data-economics-next] [data-economics-take-over-all]').click();
    await page.click('[data-cost-option-edit="keep"]');
    await fillEconomics(page, '[data-tco-cost="investment"]', '40000');
    expect(await overflow(), 'filled stage').toBeLessThanOrEqual(0);
    expect(await rawNumbers(page)).toEqual([]);
  });
});

test.describe('the demo stage', () => {
  test('guided the same way, no raw float, nothing sideways on a phone', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demo/tco', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    await expect(page.locator('[data-economics-next]')).toHaveAttribute('data-economics-next', '2');
    for (const [id, v] of [['demo-dev-rate', '800'], ['demo-user-rate', '600'], ['demo-investment', '40000']] as const) {
      await fillEconomics(page, `[data-testid="${id}"]`, v);
    }
    await expect(page.getByTestId('demo-forecast')).toBeVisible();
    const text = await page.locator('[data-demo-economics]').innerText();
    expect(text.match(RAW_FLOAT) ?? []).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

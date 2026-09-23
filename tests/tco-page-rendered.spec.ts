import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import { tcoForecast } from '../lib/tco-model';
import { formatAmount } from '../lib/cost-assumptions';

/**
 * The Economics stage, opened.
 *
 * `tests/tco-model.spec.ts` runs the forecast and checks the page only for the
 * call — which a change could keep while rendering something else entirely
 * (QA review of 10b1c3939600, 89642d985ff3). This signs in, opens the stage for
 * a seeded project and reads the figures off the screen, including the case the
 * model refuses: a project nothing scored gets no forecast at all.
 *
 * The expected numbers are not written down here. They come from the same
 * function the page calls, with the same inputs — a literal would have to be
 * updated by hand every time an effort coefficient moves, which is how the old
 * guard's copy of the arithmetic drifted in the first place.
 */

const EMAIL = `tco-page-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const SCORED = `tco-scored-${Date.now()}`;
const UNSCORED = `tco-unscored-${Date.now()}`;
const RUN_ID = `tco-run-${Date.now()}`;

/**
 * The stage has no default cost figures — it refuses to model until the reader
 * states their own, which is the point of the empty state below. The spec fills
 * in the same three the model is then run with.
 */
const LOC = 420;
const SCORE = 62;
const DEV_RATE = 900;
const USER_RATE = 650;
const INVESTMENT = 15_000;
/**
 * Deliberately not the euro (roadmap 7.11): this half of the page used to print
 * a euro sign it had no field for. The figures below are stated in whatever the
 * reader names, once, and both halves of the stage use that.
 */
const CURRENCY = 'CHF';

async function enterCostFigures(page: import('@playwright/test').Page) {
  await page.fill('[data-tco-cost="dev-rate"]', String(DEV_RATE));
  await page.fill('[data-tco-cost="user-rate"]', String(USER_RATE));
  await page.fill('[data-tco-cost="investment"]', String(INVESTMENT));
  // Three figures and no unit: the page has no currency of its own any more, so
  // it still shows no amount.
  await expect(page.locator('[data-tco-no-forecast]')).toBeVisible({ timeout: 15000 });
  await page.fill('[data-cost-field="currency"]', CURRENCY);
  // Not a sleep: wait for the state the figures produce. A fixed pause is a
  // guess about how fast the page recomputes, and it reads whatever is on
  // screen when it expires (QA review of 84f183b16761, c83ea117ce56).
  await expect(page.locator('body')).not.toContainText('No savings forecast yet', { timeout: 15000 });
}

test.describe.configure({ mode: 'serial' });

let uid = '';

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Tco', lastName: 'Page', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });

  const legacyCode = Array.from({ length: LOC }, (_, i) => `WRITE: / 'line ${i}'.`).join('\n');
  for (const [id, score] of [[SCORED, SCORE], [UNSCORED, null]] as const) {
    await adminSetDoc('projects', id, {
      name: `Economics fixture ${id}`, userId: uid, createdAt: new Date(), status: 'analyzed',
      legacyCode,
      analysis: JSON.stringify({ cleanCoreScore: score ?? undefined }),
      ...(score === null ? {} : { cleanCoreScore: score }),
      activeRunId: RUN_ID,
    });
    await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: id, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed',
      ...(score === null ? {} : { cleanCoreScore: score }),
    });
  }
});

async function openEconomics(page: import('@playwright/test').Page, projectId: string) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', SIGN_IN);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(3500);
  await page.goto(`/project/${projectId}/tco`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
}

test('a scored project shows the figures this model computes', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);

  // Before any figures are entered the stage refuses to model, and names what
  // it is missing rather than filling in €900 and €15,000 as it once did.
  const empty = await page.locator('body').innerText();
  expect(empty).toContain('No savings forecast yet');
  expect(empty).toContain('developer day rate');
  // And the unit is one of the things it is missing, rather than one it invents.
  expect(empty, 'the currency is asked for, not assumed').toContain('currency');

  await enterCostFigures(page);
  const body = await page.locator('body').innerText();

  const expected = tcoForecast({
    loc: LOC, devRate: DEV_RATE, userRate: USER_RATE,
    upgradeFreq: 1, fpFreq: 2, oneTimeCost: INVESTMENT, scoreBefore: SCORE,
  })!;
  expect(expected, 'the model produces a forecast for these inputs').not.toBeNull();

  // The figures on the screen are the model's, to the last unit. A page that
  // rendered its own arithmetic, or mapped a field wrongly, fails here. The
  // amounts are written by `formatAmount` because the page writes them with it
  // (roadmap 7.11) — the unit comes from the one source both use, and the
  // number is still the model's own, compared in full.
  expect(body, 'the Year-1 return').toContain(`${expected.roiYear1}%`);
  expect(body, 'the annual saving').toContain(formatAmount(expected.annualSavings, CURRENCY));
  expect(body, 'the overhead reduction').toContain(`${expected.overheadReductionPct}%`);
  expect(body, 'and the five-year net benefit').toContain(
    formatAmount(expected.cumulativeSavings5Yr[5]['Net Financial Benefit'], CURRENCY),
  );
  // The unit the reader named, and no other: the six fixed euro signs are gone.
  expect(body, 'no currency the reader did not name').not.toContain('€');
});

test('a project nothing scored gets no forecast, and says so', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, UNSCORED);
  const body = await page.locator('body').innerText();

  // The page used to substitute a score of 30 and print exact euro figures on
  // top of it. Now nothing any input could fix is said before the inputs: the
  // stage explains, and offers no cost fields to fill in at all.
  expect(body).toContain('No baseline to model against');
  expect(body).toContain('no Clean Core score from a signed run');
  expect(body, 'no ROI is offered for a project without a baseline').not.toContain('Year 1 ROI');
  expect(await page.locator('[data-tco-cost]').count(), 'and no figures are asked for').toBe(0);
});

test('code already at the target is not modelled either', async ({ page }) => {
  test.setTimeout(180 * 1000);
  // The stage reads the hydrated project, and hydration takes the score from
  // the active run — so the run is where a score has to be changed.
  await adminMergeDoc('projects', SCORED, { cleanCoreScore: 97 });
  await adminMergeDoc(`projects/${SCORED}/runs`, RUN_ID, { cleanCoreScore: 97 });
  await openEconomics(page, SCORED);
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/already scores 97/i);
  expect(body, 'and no financial case is derived from an assumption it cannot beat').not.toContain('Year 1 ROI');
  expect(await page.locator('[data-tco-cost]').count(), 'no figures are asked for either').toBe(0);
  await adminMergeDoc('projects', SCORED, { cleanCoreScore: SCORE });
  await adminMergeDoc(`projects/${SCORED}/runs`, RUN_ID, { cleanCoreScore: SCORE });
});

/**
 * Roadmap 7.4, on the screen rather than in `lib/cost-assumptions.ts`.
 *
 * `tests/cost-assumptions.spec.ts` runs the comparison itself; this opens the
 * stage and reads what the panel says, because a model that refuses correctly
 * while the page prints a figure anyway is the defect this step exists to
 * remove.
 */
test('the option comparison names nothing until every option is complete', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);
  await page.waitForSelector('[data-cost-comparison]');

  // Nothing entered: each option says "Not determined", and the panel says why
  // rather than showing a zero.
  for (const id of ['do-nothing', 'keep', 'standard']) {
    await expect(page.locator(`[data-cost-option-not-determined="${id}"]`)).toHaveText('Not determined');
  }
  await expect(page.locator('[data-cost-no-winner]')).toBeVisible();
  await expect(page.locator('[data-cost-revision]')).toContainText('unconfirmed:');

  // The shared assumptions, complete — including the cadence confirmation,
  // which is a mandatory field only once it is confirmed (ADR-035).
  await page.fill('[data-cost-field="currency"]', 'CHF');
  await page.fill('[data-cost-field="dev-day-rate"]', '800');
  await page.fill('[data-cost-field="test-day-rate"]', '600');
  await page.fill('[data-cost-field="horizon-years"]', '5');
  await page.fill('[data-cost-field="release-cadence"]', '2');
  await page.check('[data-cost-field="release-cadence-confirmed"]');

  // Still nothing: the day rates are there, the options are not, and the panel
  // refuses to call one cheapest instead of comparing what happens to be filled in.
  await expect(page.locator('[data-cost-no-winner]')).toBeVisible();
  await expect(page.locator('[data-cost-option-not-determined="do-nothing"]')).toBeVisible();
  const body = await page.locator('[data-cost-comparison]').innerText();
  expect(body, 'no amount is invented from the rates alone').not.toMatch(/CHF\s*0\b/);
  expect(body).toContain('one-off effort range');
});

/**
 * Roadmap 7.12, on the screen: what the panel says once there *is* a lead.
 *
 * The model spec solves the distances; this checks that the panel asks for them
 * and prints one statement per assumption. The old panel printed four sentences
 * about a set spread of ±25 %, so "four lines are there" is not enough — the
 * lines have to be the computed kind, and none of them may name a radius.
 */
test('once an option leads, the panel says how far each assumption may move', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);
  await page.waitForSelector('[data-cost-comparison]');

  await page.fill('[data-cost-field="currency"]', 'CHF');
  await page.fill('[data-cost-field="dev-day-rate"]', '800');
  await page.fill('[data-cost-field="test-day-rate"]', '600');
  await page.fill('[data-cost-field="horizon-years"]', '5');
  await page.fill('[data-cost-field="release-cadence"]', '2');
  await page.check('[data-cost-field="release-cadence-confirmed"]');

  // The same effort for every option, taken over from the proposal as the
  // reader's own figure, so what separates them is the maintenance baseline
  // that "Do nothing" and "Keep" carry and "Move to standard" does not.
  for (const id of ['do-nothing', 'keep', 'standard']) {
    await page.click(`[data-cost-apply-proposal="${id}"]`);
  }
  for (const id of ['do-nothing', 'keep']) {
    await page.fill(`[data-cost-field="${id}-baseline-dev"]`, '1');
    await page.fill(`[data-cost-field="${id}-baseline-test"]`, '0');
  }
  await page.fill('[data-cost-field="do-nothing-upgrade-delay"]', '2');

  await expect(page.locator('[data-cost-winner="standard"]')).toBeVisible({ timeout: 15000 });

  const points = page.locator('[data-cost-tipping-field]');
  await expect(points).toHaveCount(4);
  const sentences = await points.allInnerTexts();
  for (const sentence of sentences) {
    // Either a distance or the reason there is none — never a blank line.
    expect(sentence, 'a tipping point or a reason').toMatch(/(rises by|falls by|stays between|no tipping point)/);
    expect(sentence, 'and no set radius').not.toContain('25 %');
  }
  // At least one of the four is an actual distance; a panel that only ever
  // explains itself would satisfy the loop above.
  expect(sentences.join(' ')).toMatch(/(rises by|falls by|stays between)\s[\d.,]+\s%/);
});

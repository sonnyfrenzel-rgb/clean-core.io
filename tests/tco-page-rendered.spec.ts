import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import { tcoForecast } from '../lib/tco-model';

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

async function enterCostFigures(page: import('@playwright/test').Page) {
  await page.fill('[data-tco-cost="dev-rate"]', String(DEV_RATE));
  await page.fill('[data-tco-cost="user-rate"]', String(USER_RATE));
  await page.fill('[data-tco-cost="investment"]', String(INVESTMENT));
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

  await enterCostFigures(page);
  const body = await page.locator('body').innerText();

  const expected = tcoForecast({
    loc: LOC, devRate: DEV_RATE, userRate: USER_RATE,
    upgradeFreq: 1, fpFreq: 2, oneTimeCost: INVESTMENT, scoreBefore: SCORE,
  })!;
  expect(expected, 'the model produces a forecast for these inputs').not.toBeNull();

  // The figures on the screen are the model's, to the euro. A page that
  // rendered its own arithmetic, or mapped a field wrongly, fails here.
  expect(body, 'the Year-1 return').toContain(`${expected.roiYear1}%`);
  expect(body, 'the annual saving').toContain(`€${expected.annualSavings.toLocaleString('en-US')}`);
  expect(body, 'the overhead reduction').toContain(`${expected.overheadReductionPct}%`);
  expect(body, 'and the five-year net benefit').toContain(
    `€${expected.cumulativeSavings5Yr[5]['Net Financial Benefit'].toLocaleString('en-US')}`,
  );
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

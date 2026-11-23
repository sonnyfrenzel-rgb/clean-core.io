import { test, expect } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { formatAmount } from '../lib/cost-assumptions';
import { fillEconomics, revealEconomicsField } from './helpers/economics';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The Economics tool, opened (ADR-128): the answer first, the chart, the comparison, how firm the answer is.
 *
 * `tests/cost-assumptions.spec.ts` and `tests/economics-answer.spec.ts` run the arithmetic and the words; this signs
 * in, opens the tool for a seeded project and reads what the page says — because a model that refuses correctly while
 * the page prints a figure anyway is the defect these steps exist to remove.
 */

const EMAIL = `tco-page-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const SCORED = `tco-scored-${Date.now()}`;
const UNSCORED = `tco-unscored-${Date.now()}`;
const RUN_ID = `tco-run-${Date.now()}`;

const LOC = 420;
const SCORE = 62;
const DEV_RATE = 900;
const USER_RATE = 650;
/** Deliberately not the euro (roadmap 7.11): the unit is the one the reader names, once. */
const CURRENCY = 'CHF';

async function statedFigures(page: import('@playwright/test').Page) {
  await fillEconomics(page, '[data-cost-field="currency"]', CURRENCY);
  await fillEconomics(page, '[data-cost-field="dev-day-rate"]', String(DEV_RATE));
  await fillEconomics(page, '[data-cost-field="test-day-rate"]', String(USER_RATE));
  await fillEconomics(page, '[data-cost-field="horizon-years"]', '5');
  await fillEconomics(page, '[data-cost-field="release-cadence"]', '2');
  await page.check('[data-cost-field="release-cadence-confirmed"] input[type="checkbox"]');
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
  // The figures are stored with the project since 03.10.2026; every test here
  // starts from an empty stage, so what an earlier test stored is set aside.
  // A document that is not a record reads as nothing stored.
  await adminSetDoc(`projects/${projectId}/cost_assumptions`, 'current', { reset: true });
  await signInViaLanding(page, EMAIL, SIGN_IN, { pauseMs: 3500 });
  await page.goto(`/project/${projectId}/tco`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
}

test('the answer comes first and names nothing until every option is priced', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);
  await page.waitForSelector('[data-economics-page]');
  const answer = page.locator('[data-economics-answer]');
  await expect(answer).toContainText('Not determined yet');
  // The unit is one of the things it is missing, rather than one it invents.
  await expect(answer, 'the currency is asked for, not assumed').toContainText('currency');
  await expect(page.locator('[data-economics-chart="not-priced"]')).toBeVisible();

  await statedFigures(page);
  await revealEconomicsField(page, '[data-economics-take-over-all]');
  await page.locator('[data-answer-next] [data-economics-take-over-all]').first().click();
  await fillEconomics(page, '[data-cost-field="do-nothing-upgrade-delay"]', '2');
  await expect(page.locator('[data-economics-page]')).toHaveAttribute('data-economics-page', 'priced', { timeout: 15000 });

  // The answer, in the unit the reader named and no other.
  await expect(answer).toContainText(new RegExp(`Keeping it costs (about )?${CURRENCY}`));
  const body = await page.locator('body').innerText();
  expect(body, 'no currency the reader did not name').not.toContain('€');
  // ADR-128 (2): one money model — no payback, no ROI, no savings forecast.
  for (const gone of ['Year 1 ROI', 'Payback', 'Annual Net Savings', 'Savings from modernising']) expect(body).not.toContain(gone);
  // The chart has a row per option, Keep as the reference.
  await expect(page.locator('[data-economics-chart="priced"] [data-economics-chart-row]')).toHaveCount(4);
  // The table, in whole units, with the difference to keeping.
  await expect(page.locator('[data-cost-option-difference="do-nothing"]')).toHaveText('the reference');
  await expect(page.locator('[data-cost-option-total="rebuild"]')).toContainText(CURRENCY);
});

test('a project nothing scored still compares, and proposes Keep\'s upkeep without an uplift', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, UNSCORED);
  await page.waitForSelector('[data-economics-page]');
  await expect(page.locator('[data-economics-rest="score"]')).toContainText('No Clean Core Score');
  const body = await page.locator('body').innerText();
  expect(body, 'no ROI is offered').not.toContain('Year 1 ROI');
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
  await page.waitForSelector('[data-cost-result]');

  // Nothing entered: each option says "Not determined", and the panel says why
  // rather than showing a zero.
  // ADR-079: the four options of the decision, Keep stored under `do-nothing`.
  for (const id of ['do-nothing', 'rebuild', 'standard', 'retire']) {
    await expect(page.locator(`[data-cost-option-not-determined="${id}"]`)).toHaveText('Not determined');
  }
  await expect(page.locator('[data-cost-no-winner]')).toBeVisible();
  await expect(page.locator('[data-cost-revision]')).toContainText('unconfirmed:');

  // The shared assumptions, complete — including the cadence confirmation,
  // which is a mandatory field only once it is confirmed (ADR-035).
  await fillEconomics(page, '[data-cost-field="currency"]', 'CHF');
  await fillEconomics(page, '[data-cost-field="dev-day-rate"]', '800');
  await fillEconomics(page, '[data-cost-field="test-day-rate"]', '600');
  await fillEconomics(page, '[data-cost-field="horizon-years"]', '5');
  await fillEconomics(page, '[data-cost-field="release-cadence"]', '2');
  await page.check('[data-cost-field="release-cadence-confirmed"] input[type="checkbox"]'); // its row is open: the cadence was just filled in it

  // Still nothing: the day rates are there, the options are not, and the panel
  // refuses to call one cheapest instead of comparing what happens to be filled in.
  await expect(page.locator('[data-cost-no-winner]')).toBeVisible();
  await expect(page.locator('[data-cost-option-not-determined="do-nothing"]')).toBeVisible();
  const body = await page.locator('[data-cost-result]').innerText();
  expect(body, 'no amount is invented from the rates alone').not.toMatch(/CHF\s*0\b/);
  expect(await page.locator('[data-cost-comparison]').textContent()).toContain('one-off effort range');
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
  await page.waitForSelector('[data-cost-result]');

  await fillEconomics(page, '[data-cost-field="currency"]', 'CHF');
  await fillEconomics(page, '[data-cost-field="dev-day-rate"]', '800');
  await fillEconomics(page, '[data-cost-field="test-day-rate"]', '600');
  await fillEconomics(page, '[data-cost-field="horizon-years"]', '5');
  await fillEconomics(page, '[data-cost-field="release-cadence"]', '2');
  await page.check('[data-cost-field="release-cadence-confirmed"] input[type="checkbox"]'); // its row is open: the cadence was just filled in it

  // The same effort for every option, taken over from the proposal as the
  // reader's own figure, so what separates Keep from Move to SAP standard is
  // the maintenance baseline Keep carries; Rebuild and Retire are given a far
  // larger one-off effort, so the lead is not a tie (ADR-079: four options).
  for (const id of ['do-nothing', 'rebuild', 'standard', 'retire']) {
    await revealEconomicsField(page, `[data-cost-apply-proposal="${id}"]`);
    await page.click(`[data-cost-apply-proposal="${id}"]`);
  }
  for (const id of ['do-nothing']) {
    await fillEconomics(page, `[data-cost-field="${id}-baseline-dev"]`, '1');
    await fillEconomics(page, `[data-cost-field="${id}-baseline-test"]`, '0');
  }
  for (const id of ['rebuild', 'retire']) {
    await fillEconomics(page, `[data-cost-field="${id}-oneoff-high-dev"]`, '500');
    await fillEconomics(page, `[data-cost-field="${id}-oneoff-low-dev"]`, '400');
  }
  await fillEconomics(page, '[data-cost-field="do-nothing-upgrade-delay"]', '2');

  await expect(page.locator('[data-cost-winner="standard"]')).toBeVisible({ timeout: 15000 });

  // In plain words first (ADR-128 (3)); the exact distances in the detail under it.
  await expect(page.locator('[data-economics-firm-row]')).toHaveCount(4);
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

// QA 50585e6ab592: the printed estimate names the inputs it was priced with.
// `tco-cost-inputs-guard` reads the footer out of the source; this prints the
// page. The footer is `hidden print:block`, so on screen it is not there at all
// and in print it has to be — carrying the figures as entered, in the currency
// named, and "Not determined" for the one left empty rather than a zero.
test('the printed page carries the entered cost figures, and an empty one as "Not determined"', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);
  await fillEconomics(page, '[data-cost-field="dev-day-rate"]', String(DEV_RATE));
  await fillEconomics(page, '[data-cost-field="currency"]', CURRENCY);
  // The key-user rate stays empty.

  const footer = page.locator('[data-tco-print-inputs]');
  await expect(footer, 'the footer prints only').toBeHidden();

  await page.emulateMedia({ media: 'print' });
  await expect(footer).toBeVisible();
  await expect(footer).toContainText(`developer day rate ${formatAmount(DEV_RATE, CURRENCY)}`);
  await expect(footer).toContainText('key-user day rate Not determined');
  await expect(footer).toContainText(`${LOC} lines`);
  await expect(footer).toContainText('no period');
  expect(formatAmount(DEV_RATE, CURRENCY), 'the expected amount names the currency').toContain(CURRENCY);
  await page.emulateMedia({ media: 'screen' });
});

// Owner, 12.10.2026: "In Economics, also allow entering a new currency that is
// not in the list." Picked from the list's last entry, checked inline, and every
// amount then names it; a code the list has selects that entry instead.
test('a currency outside the list is entered under "Other currency…" and every amount names it', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);
  await fillEconomics(page, '[data-cost-field="dev-day-rate"]', String(DEV_RATE));
  await fillEconomics(page, '[data-cost-field="test-day-rate"]', String(USER_RATE));

  const combo = page.locator('[data-cost-field="currency"]');
  await revealEconomicsField(page, '[data-cost-field="currency"]');
  await combo.click();
  await page.locator('[data-economics-currency-option="other"]').click();
  const other = page.locator('[data-cost-field="currency-other"]');
  await expect(other, 'the input takes the focus').toBeFocused();

  // Not a code: said inline once the reader leaves it, with the fix, and nothing stated.
  await other.fill('kr');
  await other.press('Tab');
  await expect(page.locator('[data-economics-currency-other] [data-cc-value-state="error"]')).toContainText('exactly three letters A–Z');
  await expect(combo).toHaveValue('');

  await other.fill('nok');
  await expect(combo).toHaveValue('NOK');
  await expect(page.locator('[data-economics-currency-stated="NOK"]')).toContainText('Norwegian');
  await expect(page.locator('[data-economics-currency-other] [data-cc-value-state="error"]')).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  const footer = page.locator('[data-tco-print-inputs]');
  await expect(footer).toContainText(`developer day rate ${formatAmount(DEV_RATE, 'NOK')}`);
  await expect(footer).toContainText(`key-user day rate ${formatAmount(USER_RATE, 'NOK')}`);
  await page.emulateMedia({ media: 'screen' });

  // By keyboard: back to the list, the last entry is "Other currency…"; a listed code selects that entry.
  await page.locator('[data-economics-currency-other-close]').click();
  await expect(other).toHaveCount(0);
  await expect(combo).toBeFocused();
  await combo.press('ArrowUp');
  await expect(page.locator('[data-economics-currency-option="other"]')).toHaveAttribute('data-active', 'true');
  await combo.press('Enter');
  await expect(other).toBeFocused();
  await other.fill('eur');
  await expect(combo).toHaveValue('EUR');
  await expect(other).toHaveCount(0);
  await expect(page.locator('[data-economics-currency-listed-note]')).toContainText('EUR is in the list');
});

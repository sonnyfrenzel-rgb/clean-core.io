import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { fillEconomics, revealEconomicsField } from './helpers/economics';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { initialCostAssumptions } from '../components/tco/OptionComparison';

/**
 * No amount from figures nobody entered (roadmap E12-F01-US02, ADR-035).
 *
 * Before 3.0: the Economics page opened with a developer rate of €900, a key-user rate of €650 and an investment of
 * €15,000 already set, and showed annual savings, a payback period, an ROI and a five-year chart on them before the
 * reader had typed anything; its print button was labelled "Print Business Case". With ADR-128 (2) that forecast left
 * the product altogether — the page prices the options against each other, and nothing else.
 */
const PAGE = 'app/(app)/project/[projectId]/tco/page.tsx';
const OBJECT_PAGE = 'components/tco/EconomicsObjectPage.tsx';
const code = (rel: string) =>
  fs
    .readFileSync(path.resolve(__dirname, '..', rel), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the page', () => {
  test('starts every cost figure empty, not at a default', () => {
    const s = code(PAGE);
    expect(s).toMatch(/\[assumptions, setAssumptions\] = useState<CostAssumptions>\(initialCostAssumptions\)/);
    expect(s).not.toMatch(/useState\(900\)|useState\(650\)|useState\(15000\)/);
    const start = initialCostAssumptions();
    // The currency is a figure nobody may supply for the reader (roadmap 7.11, ADR-035).
    expect(start).toMatchObject({ currency: '', devDayRate: null, testDayRate: null, horizonYears: null, releaseCadence: null });
    for (const o of start.options) expect([o.oneOff, o.perRelease, o.maintenanceBaselinePerYear]).toEqual([null, null, null]);
    expect(s + code(OBJECT_PAGE), 'and no euro sign is printed beside an amount').not.toMatch(/€\$\{|€\{/);
  });

  test('one money model: the demonstration forecast is gone (ADR-128 (2))', () => {
    expect(fs.existsSync(path.resolve(__dirname, '..', 'lib', 'tco-model.ts'))).toBe(false);
    const all = code(PAGE) + code(OBJECT_PAGE) + code('lib/economics-record.ts');
    for (const gone of ['tcoForecast', 'TCO_TARGET_SCORE', 'Payback Period', 'Year 1 ROI', 'Annual Net Savings', 'Savings from modernising']) {
      expect(all, gone).not.toContain(gone);
    }
    expect(code(PAGE), 'the page prices the comparison').toContain('costComparison(assumptions)');
  });

  test('calls itself a comparison, never a business case', () => {
    const s = code(PAGE) + code(OBJECT_PAGE);
    expect(s).not.toContain('Print Business Case');
    expect(s).not.toContain('Print model estimate');
    expect(s).not.toContain('Business Value Report');
    expect(s).toContain('Print the comparison');
    expect(s).toContain('not a quote');
  });
});

test.describe('rendered', () => {
  const EMAIL = `tcocost-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'TcoCost123!';
  const PROJECT_ID = `tcocost-${Date.now()}`;
  const RUN_ID = `tcocost-run-${Date.now()}`;

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const uid = (await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)).user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Tco', lastName: 'Cost', email: EMAIL, tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    const legacy = Array.from({ length: 2000 }, (_, i) => `  SELECT * FROM vbak WHERE vbeln = ${i}.`).join('\n');
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'TCO cost fixture', userId: uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: legacy, activeRunId: RUN_ID,
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });
  });

  test('no amount until every shared figure is stated and the effort taken over', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}/tco`, { waitUntil: 'domcontentloaded' });

    const answer = page.locator('[data-economics-answer]');
    await expect(answer).toContainText('Not determined yet', { timeout: 30000 });
    await expect(page.locator('[data-economics-page]')).toHaveAttribute('data-economics-page', 'first-visit');
    await expect(page.locator('[data-economics-chart="not-priced"]')).toBeVisible();

    await fillEconomics(page, '[data-cost-field="dev-day-rate"]', '1000');
    await fillEconomics(page, '[data-cost-field="test-day-rate"]', '700');
    // Two rates and no unit: still no amount.
    await expect(answer).toContainText('the currency');
    await expect(page.locator('[data-cost-option-total]')).toHaveCount(0);

    await fillEconomics(page, '[data-cost-field="currency"]', 'CHF');
    await fillEconomics(page, '[data-cost-field="horizon-years"]', '5');
    await fillEconomics(page, '[data-cost-field="release-cadence"]', '2');
    await page.check('[data-cost-field="release-cadence-confirmed"] input[type="checkbox"]');
    // The shared figures are in, the proposals are not taken over: still no amount, and the answer says what it waits on.
    await expect(answer).toContainText('your go on the effort');
    await expect(page.locator('[data-cost-option-total]')).toHaveCount(0);

    await revealEconomicsField(page, '[data-economics-take-over-all]');
    await page.locator('[data-economics-take-over-all]').first().click();
    // Keep's upgrade deferral is the reader's figure as well (no proposal, no default): still no amount without it.
    await expect(answer).toContainText('the effort of one option');
    await expect(page.locator('[data-economics-page]')).toHaveAttribute('data-economics-page', 'needs-figures');
    await expect(page.locator('[data-cost-option-total]')).toHaveCount(0);
    await fillEconomics(page, '[data-cost-field="do-nothing-upgrade-delay"]', '2');
    await expect(page.locator('[data-economics-page]')).toHaveAttribute('data-economics-page', 'priced', { timeout: 15000 });
    await expect(answer).toContainText(/Keeping it costs (about )?CHF/);
  });
});

// Sonny, 30.09.2026: the printed comparison names the inputs it was priced with — the fields do not print. Amounts go
// through formatAmount, so an input left empty prints "Not determined", never a zero.
test('the printed comparison names the inputs it was priced with', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'tco', 'page.tsx'), 'utf8');
  const print = page.slice(page.indexOf('hidden border-t'), page.indexOf('</div>', page.indexOf('data-tco-print-inputs')));
  expect(print).toContain('data-tco-print-inputs');
  for (const input of ['formatAmount(assumptions.devDayRate, cur)', 'formatAmount(assumptions.testDayRate, cur)', 'formatNumber(loc)']) {
    expect(print, `the print footer does not name ${input}`).toContain(input);
  }
  expect(print).not.toContain('entered above');
});

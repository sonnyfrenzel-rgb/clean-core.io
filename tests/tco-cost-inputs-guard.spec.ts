import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';

/**
 * No savings forecast from figures nobody entered (roadmap E12-F01-US02).
 *
 * The acceptance: "Without suitable cost inputs no savings forecast is shown.
 * With negative annual benefits there is no negative payback period, but 'no
 * payback in the model'."
 *
 * Before: the Economics page opened with a developer rate of €900, a key-user
 * rate of €650 and an investment of €15,000 already set — "standard enterprise
 * SAP guidelines" — and showed annual savings, a payback period, an ROI and a
 * five-year chart on them before the reader had typed anything. Its print
 * button was labelled "Print Business Case".
 */
const PAGE = 'app/(app)/project/[projectId]/tco/page.tsx';
const src = () =>
  fs
    .readFileSync(path.resolve(__dirname, '..', PAGE), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** The calculation, which the page now calls instead of carrying. */
const model = () =>
  (require('fs') as typeof import('fs'))
    .readFileSync((require('path') as typeof import('path')).resolve(__dirname, '..', 'lib/tco-model.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the page', () => {
  test('starts every cost figure empty, not at a default', () => {
    const s = src();
    for (const setter of ['setDevRate', 'setUserRate', 'setOneTimeCost']) {
      expect(s, `${setter} starts from a number`).toMatch(new RegExp(`\\[\\w+, ${setter}\\] = useState<number \\| null>\\(null\\)`));
    }
    expect(s).not.toMatch(/useState\(900\)|useState\(650\)|useState\(15000\)/);
    // The currency is the fourth figure nobody may supply for the reader
    // (roadmap 7.11, ADR-035). It starts empty and there is no default.
    expect(s).toMatch(/\[currency, setCurrency\] = useState\(''\)/);
    expect(s, 'and no euro sign is printed beside an amount').not.toMatch(/€\$\{|€\{/);
  });

  test('computes nothing until all three are there', () => {
    // The refusal moved into `lib/tco-model.ts` with the rest of the
    // calculation (roadmap 0.17, QA finding f3428b0782a9); the behaviour it
    // guards is exercised in `tests/tco-model.spec.ts`.
    expect(model()).toMatch(/if \(devRate === null \|\| userRate === null \|\| oneTimeCost === null\) return null;/);
    expect(src(), 'and the page asks the model for it').toContain('tcoForecast({');
  });

  test('says "no payback in the model" rather than a negative period', () => {
    expect(src()).toContain('No payback in the model');
    expect(model()).toMatch(/annualSavings > 0\s*\?/);
  });

  test('calls itself a demonstration model, not a business case', () => {
    const s = src();
    expect(s).not.toContain('Print Business Case');
    expect(s).not.toContain('Business Value Report');
    expect(s).not.toContain('Better Practice Mapped');
    expect(s).toContain('A demonstration model, not a business case.');
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
      firstName: 'Tco', lastName: 'Cost', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    // Two thousand lines: large enough that the model has something to price.
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

  test('no forecast until the reader has entered all three figures', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);
    await page.goto(`/project/${PROJECT_ID}/tco`, { waitUntil: 'domcontentloaded' });

    const noForecast = page.locator('[data-tco-no-forecast]');
    await expect(noForecast).toBeVisible({ timeout: 30000 });
    await expect(noForecast).toContainText('developer day rate, key-user day rate, modernisation investment');
    await expect(page.getByText('Annual Net Savings')).toHaveCount(0);
    await expect(page.locator('[data-tco-model-notice]')).toBeVisible();

    // Two of three is still not enough.
    await page.locator('[data-tco-cost="dev-rate"]').fill('1000');
    await page.locator('[data-tco-cost="user-rate"]').fill('700');
    await expect(noForecast).toContainText('modernisation investment');
    await expect(page.getByText('Annual Net Savings')).toHaveCount(0);

    await page.locator('[data-tco-cost="investment"]').fill('20000');
    // Three of three and still nothing: the stage has no currency of its own
    // either (roadmap 7.11). It used to print a fixed euro sign at six places
    // with no field to state one.
    await expect(noForecast).toContainText('currency');
    await expect(page.getByText('Annual Net Savings')).toHaveCount(0);

    await page.locator('[data-cost-field="currency"]').fill('CHF');
    await expect(noForecast).toHaveCount(0);
    await expect(page.getByText('Annual Net Savings · Scenario')).toBeVisible();

    // Clearing a figure takes the forecast away again.
    await page.locator('[data-tco-cost="user-rate"]').fill('');
    await expect(page.locator('[data-tco-no-forecast]')).toBeVisible();
    await expect(page.getByText('Annual Net Savings')).toHaveCount(0);

    // And so does clearing the currency, for the same reason: an amount whose
    // unit nobody stated is not an amount.
    await page.locator('[data-tco-cost="user-rate"]').fill('700');
    await expect(page.locator('[data-tco-no-forecast]')).toHaveCount(0);
    await page.locator('[data-cost-field="currency"]').fill('');
    await expect(page.locator('[data-tco-no-forecast]')).toBeVisible();
    await expect(page.getByText('Annual Net Savings')).toHaveCount(0);
  });
});

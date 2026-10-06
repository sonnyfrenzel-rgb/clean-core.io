import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { fillEconomics } from './helpers/economics';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The Economics figures are stored with the project (owner report 03.10.2026,
 * translated: "4 of 4 done, but no green check; and if you go to another tool
 * and back to Economics, the values are gone"), rendered against the real
 * route and the emulators:
 *
 *   1. the four steps filled, another tool opened and Economics again: the
 *      figures are there; reloaded: still there;
 *   2. with all four steps done the Economics tool carries its check;
 *   3. an invited reader sees the figures, read-only;
 *   4. a save that fails says "Not saved", and a retry stores it.
 */

const STAMP = Date.now();
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const OWNER = `econ-persist-owner-${STAMP}@cleancore-test.io`;
const READER = `econ-persist-reader-${STAMP}@cleancore-test.io`;
const PROJECT = `econ-persist-${STAMP}`;
const FAILING = `econ-persist-fail-${STAMP}`;
const LOC = 668;

const tool = (page: Page, key: string) => page.locator(`[data-workspace-tool="${key}"]:visible`).first();

async function seedProject(id: string, ownerUid: string, readers: string[]) {
  const runId = `${id}-run`;
  const legacyCode = Array.from({ length: LOC }, (_, i) => `WRITE: / 'line ${i}'.`).join('\n');
  await adminSetDoc('projects', id, {
    name: 'Economics persistence fixture', userId: ownerUid, readers, createdAt: new Date(), status: 'analyzed',
    legacyCode, analysis: JSON.stringify({ cleanCoreScore: 62 }), cleanCoreScore: 62, activeRunId: runId,
  });
  await adminSetDoc(`projects/${id}/runs`, runId, {
    runId, projectId: id, userId: ownerUid, createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const uids: string[] = [];
  for (const email of [READER, OWNER]) {
    const cred = await createUserWithEmailAndPassword(auth, email, SIGN_IN);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Econ', lastName: 'Persist', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    uids.push(cred.user.uid);
  }
  const [readerUid, ownerUid] = uids;
  await seedProject(PROJECT, ownerUid, [readerUid]);
  await seedProject(FAILING, ownerUid, []);
});

async function openEconomics(page: Page, email: string, project = PROJECT) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInViaLanding(page, email, SIGN_IN, { pauseMs: 3500 });
  await page.goto(`/project/${project}/tco`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-economics-steps]', { timeout: 60000 });
}

async function fillFourSteps(page: Page) {
  await fillEconomics(page, '[data-cost-field="currency"]', 'EUR');
  await fillEconomics(page, '[data-cost-field="dev-day-rate"]', '820');
  await fillEconomics(page, '[data-cost-field="test-day-rate"]', '640');
  await fillEconomics(page, '[data-cost-field="horizon-years"]', '5');
  await fillEconomics(page, '[data-cost-field="release-cadence"]', '2');
  await page.check('[data-cost-field="release-cadence-confirmed"] input[type="checkbox"]');
  await page.locator('[data-economics-next] [data-economics-take-over-all]').click();
  await fillEconomics(page, '[data-cost-field="do-nothing-upgrade-delay"]', '2');
  await fillEconomics(page, '[data-tco-cost="investment"]', '40000');
}

/** The figures a reader would check, as the fields show them. */
async function expectFigures(page: Page) {
  await expect(page.locator('[data-cost-field="currency"]')).toHaveValue('EUR');
  await expect(page.locator('[data-cost-field="dev-day-rate"] input, input[data-cost-field="dev-day-rate"]').first()).toHaveValue('820');
  await expect(page.locator('[data-cost-field="test-day-rate"] input, input[data-cost-field="test-day-rate"]').first()).toHaveValue('640');
  await expect(page.locator('[data-tco-cost="investment"] input, input[data-tco-cost="investment"]').first()).toHaveValue('40000');
  await expect(page.locator('[data-cost-option="rebuild"]')).toHaveAttribute('data-effort-provenance', 'from-proposal');
  await expect(page.locator('[data-cost-option="rebuild"] [data-effort-chip="from-proposal"]')).toContainText('your figure, from the proposal');
  await expect(page.locator('[data-economics-next]')).toHaveAttribute('data-economics-next', 'none');
}

test('the four steps survive another tool and a reload, and Economics earns its check', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await openEconomics(page, OWNER);
  await expect(tool(page, 'tco')).toHaveAttribute('data-workspace-tool-mark-kind', 'none');

  await fillFourSteps(page);
  await expect(page.locator('[data-economics-next]')).toHaveAttribute('data-economics-next', 'none');
  await expect(page.locator('[data-economics-save="saved"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-economics-save="saved"]')).toHaveText(/Saved/);

  // All four steps done: the tool's own output is on record, and it says so.
  await expect(tool(page, 'tco')).toHaveAttribute('data-workspace-tool-mark-kind', 'check', { timeout: 15000 });
  await expect(tool(page, 'tco')).toHaveAttribute('data-phase-state', 'done');

  // Another tool, and back.
  await tool(page, 'analyze').click();
  await page.waitForURL(new RegExp(`/project/${PROJECT}/analyze`), { timeout: 60000 });
  await tool(page, 'tco').waitFor({ timeout: 60000 });
  await tool(page, 'tco').click();
  await page.waitForURL(new RegExp(`/project/${PROJECT}/tco`), { timeout: 60000 });
  await page.waitForSelector('[data-economics-steps]', { timeout: 60000 });
  await expectFigures(page);
  await expect(tool(page, 'tco')).toHaveAttribute('data-workspace-tool-mark-kind', 'check');

  // A reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-economics-steps]', { timeout: 60000 });
  await expectFigures(page);
  await expect(page.locator('[data-economics-save="saved"]')).toBeVisible();

  const stored = await adminGetDoc(`projects/${PROJECT}/cost_assumptions`, 'current');
  expect(stored?.assumptions?.options?.find((o: { id: string }) => o.id === 'rebuild')?.effortSource).toBe('proposal-confirmed');
});

test('an invited reader sees the stored figures, read-only', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, READER);
  await expect(page.locator('[data-economics-save="read-only"]')).toBeVisible();
  await expect(page.locator('[data-cost-field="currency"]')).toHaveValue('EUR');
  await expect(page.locator('[data-cost-field="currency"]')).toBeDisabled();
  await expect(page.locator('input[data-cost-field="dev-day-rate"], [data-cost-field="dev-day-rate"] input').first()).toHaveValue('820');
  await expect(page.locator('[data-economics-editable="false"]')).toHaveCount(1);
  await expect(page.locator('input[data-tco-cost="investment"], [data-tco-cost="investment"] input').first()).toBeDisabled();
  await expect(page.locator('[data-economics-next]')).toHaveAttribute('data-economics-next', 'none');
  await expect(tool(page, 'tco')).toHaveAttribute('data-workspace-tool-mark-kind', 'check');
});

test('a failed save says "Not saved", and a retry stores it', async ({ page }) => {
  test.setTimeout(180 * 1000);
  let fail = true;
  await page.route(`**/api/projects/${FAILING}/cost-assumptions`, async (route) => {
    if (route.request().method() === 'POST' && fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Could not store the cost figures.' }) });
      return;
    }
    await route.continue();
  });
  await openEconomics(page, OWNER, FAILING);
  await fillEconomics(page, '[data-cost-field="currency"]', 'CHF');
  const failed = page.locator('[data-economics-save="failed"]');
  await expect(failed).toBeVisible({ timeout: 15000 });
  await expect(failed).toContainText('Not saved');
  await expect(failed).toContainText('Could not store the cost figures.');

  fail = false;
  await failed.locator('[data-economics-save-retry]').click();
  await expect(page.locator('[data-economics-save="saved"]')).toBeVisible({ timeout: 15000 });
  const stored = await adminGetDoc(`projects/${FAILING}/cost_assumptions`, 'current');
  expect(stored?.assumptions?.currency).toBe('CHF');
});

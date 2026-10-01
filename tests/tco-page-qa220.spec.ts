import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The Economics stage, QA full review of v2.20.0 (fc787674705f):
 *
 *   - ffddf6b4fee6 — a project read that fails is not a project without a score;
 *   - b23daef11548 — a score from a run of a previous source is not modelled
 *     against the current source's line count;
 *   - 246b1ea24dbc — the LoC slider can hold the uploaded size (420 lines here);
 *   - 2289f335cbb4 — a year without an upgrade or a feature pack can be modelled.
 *
 * Needs the app and the emulators.
 */

const STAMP = Date.now();
const EMAIL = `tco-qa220-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const SCORED = `tco-qa220-scored-${STAMP}`;
const STALE = `tco-qa220-stale-${STAMP}`;
const FOREIGN = `tco-qa220-foreign-${STAMP}`;
const RUN_ID = `tco-qa220-run-${STAMP}`;
const LOC = 420;
const SCORE = 62;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  const uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Tco', lastName: 'Qa', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  const legacyCode = Array.from({ length: LOC }, (_, i) => `WRITE: / 'line ${i}'.`).join('\n');
  for (const [id, owner, stale] of [[SCORED, uid, false], [STALE, uid, true], [FOREIGN, 'someone-else', false]] as const) {
    await adminSetDoc('projects', id, {
      name: `Economics QA fixture ${id}`, userId: owner, createdAt: new Date(), status: 'analyzed',
      legacyCode,
      analysis: JSON.stringify({ cleanCoreScore: SCORE }),
      cleanCoreScore: SCORE,
      activeRunId: RUN_ID,
      // A fingerprint that is not the hash of `legacyCode`: the source was
      // written after the signed run.
      ...(stale ? { auditMetadata: { inputFingerprint: { sha256: '0'.repeat(64) } } } : {}),
    });
    await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: id, userId: owner,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: SCORE,
    });
  }
});

async function openEconomics(page: Page, projectId: string) {
  await signInViaLanding(page, EMAIL, SIGN_IN, { pauseMs: 3500 });
  await page.goto(`/project/${projectId}/tco`, { waitUntil: 'domcontentloaded' });
}

test('a project that cannot be read says so, not that it has no score (ffddf6b4fee6)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, FOREIGN);
  await expect(page.locator('[data-tco-load-error]')).toBeVisible({ timeout: 30000 });
  const body = await page.locator('body').innerText();
  expect(body, 'a failed read is not evidence that no score exists').not.toContain('no Clean Core score from a signed run');
});

test('a score from a previous source is not modelled against the current one (b23daef11548)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, STALE);
  await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
  await expect(page.locator('[data-tco-stale]')).toBeVisible();
  expect(await page.locator('[data-tco-cost]').count(), 'no figures are asked for').toBe(0);
  await expect(page.locator('body')).not.toContainText('Year 1 ROI');
});

test('the sliders hold the uploaded size and a year without updates (246b1ea24dbc, 2289f335cbb4)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);
  await page.waitForSelector('[data-tco-cost]', { timeout: 30000 });

  // A range input whose minimum is above its value draws — and reports — the
  // minimum. 420 lines used to become 1,000 on the slider.
  const loc = page.getByLabel('Legacy lines of code (LoC)');
  await expect(loc).toHaveValue(String(LOC));

  const upgrades = page.getByLabel('RISE major upgrades / yr');
  const packs = page.getByLabel('Feature pack updates / yr');
  await expect(upgrades).toHaveAttribute('min', '0');
  await expect(packs).toHaveAttribute('min', '0');
  await upgrades.fill('0');
  await expect(upgrades).toHaveValue('0');
  await expect(page.locator('body')).toContainText('0 Upgrades');
});

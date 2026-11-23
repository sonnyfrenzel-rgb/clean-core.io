import { test, expect, type Page } from './helpers/test';
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
 *   - 246b1ea24dbc — the line count holds the uploaded size (420 lines here), now under "Model another size";
 *   - 2289f335cbb4 belonged to the demonstration forecast's sliders, which left with ADR-128 (2).
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

/**
 * Since roadmap 3.0.21 (way in and way back, points 1 and 13) the project frame
 * (`components/ProjectFrame.tsx`) asks the server first and shows the one
 * no-access sentence for a project this account may not open — the stage is
 * not rendered at all. The stage's own read-failure path is still what a reader
 * meets when that answer does not come (`unknown`), so the guard checks both:
 * the frame's answer, and — with the access answer withheld — the stage's.
 */
async function withholdAccessAnswer(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/projects/') && url.searchParams.get('for') === 'access',
    (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
}

async function openEconomics(page: Page, projectId: string) {
  await signInViaLanding(page, EMAIL, SIGN_IN, { pauseMs: 3500 });
  await page.goto(`/project/${projectId}/tco`, { waitUntil: 'domcontentloaded' });
}

test('a project that cannot be read says so, not that it has no score (ffddf6b4fee6)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, FOREIGN);
  await expect(page.locator('[data-project-gate="no-access"]')).toBeVisible({ timeout: 30000 });
  expect(await page.locator('body').innerText(), 'a refused read is not evidence that no score exists').not.toContain('no Clean Core score from a signed run');

  await withholdAccessAnswer(page);
  await page.goto(`/project/${FOREIGN}/tco`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-tco-load-error]')).toBeVisible({ timeout: 30000 });
  const body = await page.locator('body').innerText();
  expect(body, 'a failed read is not evidence that no score exists').not.toContain('no Clean Core score from a signed run');
});

test('a score from a previous source is not modelled against the current one (b23daef11548)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, STALE);
  await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
  // The score is said to describe a previous source, and the upkeep proposal does not rest on it.
  await expect(page.locator('[data-economics-rest="score"]')).toContainText('previous source');
  await expect(page.locator('body')).not.toContainText('Year 1 ROI');
});

test('the line count holds the uploaded size (246b1ea24dbc)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openEconomics(page, SCORED);
  await page.waitForSelector('[data-economics-page]', { timeout: 30000 });
  // 420 lines used to become 1,000 on a slider with a higher minimum; the count is said as it is.
  await expect(page.locator('[data-economics-rest="lines"]')).toContainText(`${LOC} lines`);
  await page.locator('[data-economics-model-size-open]').click();
  await expect(page.locator('[data-economics-model-size]')).toHaveValue(String(LOC));
});

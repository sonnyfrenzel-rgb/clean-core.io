import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetCustomClaim, adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The rendered half of `tests/start-run-next-step.spec.ts` (owner, 09.10.2026;
 * roadmap 3.0.6): while the start run of a new project is with the server,
 * "Next step" says the analysis is running and offers no button — pressing
 * "Run the analysis" there could start a second run.
 *
 * Since v3.1.0 the start run is signed in Analyze, Business (plan AB-2,
 * ADR-109), the page a new project opens on; the workspace — IT and Management
 * only — starts none of its own, so the three-view walk of the workspace this
 * spec once made has no start run to watch. Held here: the Business "Next
 * step" below the map and the map's own place while the run is held, one
 * request, and the step moving on once it is signed.
 *
 * The start run is *held*, not raced: `/api/runs/create` is answered only when
 * the spec says so, so the running state lasts as long as the assertions need,
 * on a slow dev server and on CI's fast production build alike. Then it is let
 * through to the real route, the run is signed, and "Next step" moves on.
 *
 * Needs the emulators and a dev server (`npx playwright test` as in CI).
 */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const ROOT = path.resolve(__dirname, '..');
const PASSWORD = 'StartRunNext123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SOURCE = fs.readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8');

/** "Next step" in Analyze, Business is running, and nothing on the page offers to start the run. */
async function expectRunning(page: Page): Promise<void> {
  await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 60000 });
  const next = page.locator('[data-analyze-interim] [data-next-step]');
  const running = next.locator('[data-next-step-state="running"]');
  await expect(running, '"Next step" does not say the analysis is running').toBeVisible({ timeout: 60000 });
  await expect(running).toHaveAttribute('data-next-step-key', 'analyze');
  await expect(running).toContainText('The analysis is running');
  await expect(next.locator('[data-next-step-state="open"]'), 'an open step beside the running one').toHaveCount(0);
  // No primary button in "Next step" — the one that would start a second run.
  await expect(next.locator('[data-cc-button="primary"]'), '"Next step" still offers a button').toHaveCount(0);
  // The map's place says the reading is being signed, and offers no start either.
  const place = page.locator('[data-analyze-map] [data-workspace-process="signing"]');
  await expect(place).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-workspace-sign], [data-workspace-sign-retry]')).toHaveCount(0);
}

test.describe('a new project while its start run is with the server', () => {
  const OWNER = `${unique('start-next')}@cleancore-test.io`;
  const PROJECT_ID = unique('start-next');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Start', lastName: 'Next', email: OWNER,
      tier: 'pilot', status: 'approved', isAdmin: true, activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      // No model: the start is the engine-only run, and it begins as soon as
      // the account's model answer is in — no narrative wait to account for.
      modelStages: { analyze: false, naming: false, statements: false },
    });
    // Source and no run: what an own-code import or an example leaves behind
    // the moment before the workspace opens with `?first=1`.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Z_MM_PO_APPROVAL', userId: cred.user.uid,
      createdAt: new Date(), status: 'uploaded', s4Deployment: 'private',
      legacyCode: SOURCE,
    });
  });

  test('Analyze, Business says the analysis is running and offers no button; once signed, it moves on', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: string[] = [];
    await page.route('**/api/runs/create', async (route) => {
      requests.push(route.request().method());
      await held;
      await route.continue();
    });

    try {
      await signInViaLanding(page, OWNER, PASSWORD);
      // `first=1`: a first visit starts the run without a click. The workspace
      // address sends a Business arrival to Analyze, which signs it (AB-2).
      await page.goto(`/project/${PROJECT_ID}?first=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/analyze\?first=1/, { timeout: 90000 });
      // The start run has reached the route and is held there.
      await expect.poll(() => requests.length, { timeout: 90000 }).toBeGreaterThan(0);

      await expectRunning(page);

      // Still one request: nothing on the page started another.
      expect(requests, 'a second start run was sent while the first was held').toHaveLength(1);
    } finally {
      release();
    }

    // Signed: the project carries its run, and "Next step" is no longer Analyze.
    await expect
      .poll(async () => {
        const p = await adminGetDoc('projects', PROJECT_ID);
        return typeof p?.activeRunId === 'string' && p.activeRunId.length > 0;
      }, { timeout: 120000 })
      .toBe(true);
    await expect(page.locator('[data-next-step-state="running"]')).toHaveCount(0, { timeout: 120000 });
    await expect(page.locator('[data-next-step] [data-next-step-key="analyze"]')).toHaveCount(0);
    // The map stands, drawn from the signed run.
    await expect(page.locator('[data-analyze-map] [data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 120000 });
    expect(requests, 'the start sent more than one run').toHaveLength(1);
  });
});

import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The Design stage, QA full review of v2.20.0 (fc787674705f):
 *
 *   - 46b8c6352769 — a project read that fails ends the loading state with an
 *     error instead of a skeleton that never goes away;
 *   - f9aea437967e — a design for a previous source is neither regenerated from
 *     that source's analysis nor exported;
 *   - 6c4734f60aa8 — with the design stage switched off, opening the stage sends
 *     no model request and Regenerate is not offered as a working button.
 *
 * Needs the app and the emulators.
 */

const STAMP = Date.now();
const EMAIL = `design-qa220-${STAMP}@cleancore-test.io`;
/** A second account, whose design stage is switched off. */
const EMAIL_OFF = `design-qa220-off-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const STALE = `design-qa220-stale-${STAMP}`;
const UNDESIGNED = `design-qa220-undesigned-${STAMP}`;
const DESIGNED = `design-qa220-designed-${STAMP}`;
const FOREIGN = `design-qa220-foreign-${STAMP}`;
const RUN_ID = `design-qa220-run-${STAMP}`;
const SOURCE = "REPORT zqa220.\nWRITE: / 'hello'.";
const ANALYSIS = JSON.stringify({ summary: 'A report that writes a line.', cleanCoreScore: 60 });
const DESIGN_TEXT = '# Target design\n\nA design written for this fixture.';

test.describe.configure({ mode: 'serial' });

let uid = '';
let uidOff = '';

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const account = {
    firstName: 'Design', lastName: 'Qa', tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  };
  uidOff = (await createUserWithEmailAndPassword(auth, EMAIL_OFF, SIGN_IN)).user.uid;
  // The design stage is off for this account; `/api/model-stages` reads this.
  await adminSetDoc('users', uidOff, { ...account, email: EMAIL_OFF, modelStages: { design: false } });
  uid = (await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN)).user.uid;
  await adminSetDoc('users', uid, { ...account, email: EMAIL });
  const fixtures: Array<[string, string, Record<string, unknown>]> = [
    [STALE, uid, {
      solutionDesign: DESIGN_TEXT,
      // Not the hash of SOURCE: the source was written after the signed run.
      auditMetadata: { inputFingerprint: { sha256: '0'.repeat(64) } },
    }],
    [UNDESIGNED, uidOff, {}],
    [DESIGNED, uidOff, { solutionDesign: DESIGN_TEXT }],
    [FOREIGN, 'someone-else', {}],
  ];
  for (const [id, owner, extra] of fixtures) {
    await adminSetDoc('projects', id, {
      name: `Design QA fixture ${id}`, userId: owner, createdAt: new Date(), status: 'analyzed',
      legacyCode: SOURCE, analysis: ANALYSIS, activeRunId: RUN_ID, ...extra,
    });
    await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: id, userId: owner, analysis: ANALYSIS,
      createdAt: new Date().toISOString(), status: 'completed',
    });
  }
});

async function openDesign(page: Page, projectId: string, email = EMAIL) {
  await signInViaLanding(page, email, SIGN_IN, { pauseMs: 3500 });
  await page.goto(`/project/${projectId}/design`, { waitUntil: 'domcontentloaded' });
}

test('a project that cannot be read ends in an error, not an endless skeleton (46b8c6352769)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openDesign(page, FOREIGN);
  await expect(page.locator('body')).toContainText('Could not load the project', { timeout: 30000 });
  await expect(page.locator('body')).not.toContainText('Designing Solution...');
});

test('a design for a previous source is neither regenerated nor exported (f9aea437967e)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openDesign(page, STALE);
  await page.waitForSelector('[data-stage-output="solutionDesign"]', { timeout: 30000 });
  await expect(page.locator('[data-design-regenerate]')).toBeDisabled();
  await expect(page.locator('[data-design-export="view"]')).toBeDisabled();
  await expect(page.locator('[data-design-export="save"]')).toBeDisabled();
});

test('with the stage off, opening it sends no model request (6c4734f60aa8)', async ({ page }) => {
  test.setTimeout(180 * 1000);
  const modelCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/gemini')) modelCalls.push(req.url());
  });
  await openDesign(page, UNDESIGNED, EMAIL_OFF);
  // The stage names why nothing was generated.
  await expect(page.locator('body')).toContainText('Turn the design stage back on', { timeout: 30000 });
  expect(modelCalls, 'a request the proxy will refuse was sent').toEqual([]);

  // An existing design: Regenerate is there, and closed.
  await page.goto(`/project/${DESIGNED}/design`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-stage-output="solutionDesign"]', { timeout: 30000 });
  await expect(page.locator('[data-design-regenerate]')).toBeDisabled({ timeout: 15000 });
});

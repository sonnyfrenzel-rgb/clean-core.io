import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The route card on the Analyze stage, rendered.
 *
 * The recommendation carries a confidence and a rationale. When an architect
 * presses "Switch Track", those belong to the route that was *not* chosen, and
 * printing them beside the new one reads as support for the opposite decision
 * (QA review of 33471220d6e9, 210bafeb4c8b). The decision is a tested function
 * (`lib/route-override.ts`), and the label that follows from it was covered
 * only by a source grep — a conditional can be rewritten around both string
 * literals and leave them in the file (6f7a14516006, 8a965e15a584).
 * Roadmap 0.17: this opens the page and reads what is on it.
 */

const EMAIL = `override-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `override-project-${Date.now()}`;
const RUN_ID = `override-run-${Date.now()}`;

const ANALYSIS = JSON.stringify({
  cleanCoreScore: 62,
  extensibilityRouting: {
    recommendedRoute: 'Side-by-Side (SAP BTP)',
    // Not the signed figure: the card prints the run's
    // `recommendationConfidence` (88, below), never the narrative's number
    // (QA full review of 81810c8, d5a87a5db395).
    confidenceScore: 95,
    rationale: 'The report joins three tables that have released APIs.',
    targetArtifact: 'SAP BTP Node.js App (CAP)',
  },
  standardFit: { potential: 'Medium' },
});

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
    firstName: 'Route', lastName: 'Override', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Route override fixture', userId: uid, createdAt: new Date(), status: 'analyzed',
    legacyCode: 'REPORT z_override.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    analysis: ANALYSIS,
    cleanCoreScore: 62,
    // The stored route agrees with the recommendation to begin with.
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    activeRunId: RUN_ID,
  });
  await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
    runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
    createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    recommendationConfidence: 88,
  });
});

async function openAnalyze(page: import('@playwright/test').Page) {
  await signInViaLanding(page, EMAIL, SIGN_IN, { pauseMs: 3500 });
  await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-stage-title]', { timeout: 30000 });
}

test('a route that still matches the recommendation shows the recommendation', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await openAnalyze(page);

  const body = await page.locator('body').innerText();
  expect(body, 'the confidence belongs to the route that is shown').toContain('88% Conf.');
  expect(body, "the narrative's own confidence is not printed").not.toContain('95%');
  expect(body).toContain('The report joins three tables that have released APIs.');
  expect(body, 'nothing was changed, so nothing is labelled as changed').not.toContain('Chosen by you');
  expect(body).not.toContain('You changed this route');
});

test('a route the architect switched is labelled as theirs, with the recommendation named', async ({ page }) => {
  test.setTimeout(180 * 1000);
  // Exactly what "Switch Track" writes: the stored route moves, the analysis does not.
  await adminMergeDoc('projects', PROJECT_ID, { extensibilityRoute: 'In-App (ABAP Cloud)' });
  await openAnalyze(page);

  const body = await page.locator('body').innerText();
  expect(body, 'the card says the route is the reader\'s choice').toContain('Chosen by you');
  expect(body, 'and the recommendation is named as the other one').toContain('You changed this route. The recommendation was');
  expect(body).toContain('Side-by-Side (BAIP)');
  expect(body, 'the stored route value is not shown as it is (roadmap 3.0.15)').not.toContain('Side-by-Side (SAP BTP)');
  expect(body).toContain('88% confidence');
  // The confidence badge no longer stands beside the chosen route as if it were about it.
  expect(body, 'the badge is not confidence for a route nothing assessed').not.toContain('88% Conf.');
  // The recommended route's artefact is not the target of the route chosen
  // instead (QA full review of fc787674705f, 08fd882e60b3).
  const target = page.locator('[data-route-target]', { hasText: 'Target:' });
  await expect(target).toContainText('RAP Business Object');
  await expect(target).not.toContainText('SAP BTP Node.js App (CAP)');
});

test('an analysis without a recommendation claims no override', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await adminMergeDoc('projects', PROJECT_ID, {
    analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
    extensibilityRoute: 'In-App (ABAP Cloud)',
  });
  // A run that recommended nothing signed no confidence for it either.
  await adminMergeDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, { recommendationConfidence: null });
  await openAnalyze(page);

  const body = await page.locator('body').innerText();
  expect(body, 'nothing was changed — there was never a recommendation').not.toContain('Chosen by you');
  expect(body).not.toContain('You changed this route');
  expect(body, 'and the missing confidence says so').toContain('Confidence not computed');
});

test('a route switch the database refuses says so next to the button and changes nothing', async ({ page }) => {
  test.setTimeout(180 * 1000);
  // A document the rules refuse every browser update of: `exports` must be a
  // map (firestore.rules, isValidProject), and the update rule validates the
  // whole document the write would leave behind. The switch used to await the
  // write with no handler, so the refusal vanished and the button said nothing
  // (QA review of a88149856dcc).
  await adminMergeDoc('projects', PROJECT_ID, {
    analysis: ANALYSIS,
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    exports: 'not a map',
  });
  await adminMergeDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, { recommendationConfidence: 88 });
  await openAnalyze(page);

  await page.locator('[data-route-switch]').click();
  await expect(page.locator('[data-route-switch-error]')).toContainText('The route could not be changed. Nothing was saved');
  await expect(page.locator('[data-route-switch]')).toHaveText(/Switch to ABAP Cloud/);
  await expect(page.locator('body')).not.toContainText('Chosen by you');
});

import { test, expect, type Page } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The seam between the editor (3.1) and the revisions (3.2).
 *
 * Both were built, and nothing joined them: `saveProcessRevision` was called
 * from nowhere and `RevisionCompare` was mounted nowhere, so roadmap 3.2's
 * promise — *"every save an immutable revision"* — was a store with
 * no door (QA finding 54a73bb3bed2). A test that asserts the two functions exist
 * would have passed on the day the finding was written, so this one **presses
 * Save in the browser and then finds the revision**: in the history under the
 * map, and in the store through the route.
 *
 * The adapter itself lives in `app/(app)/project/[projectId]/documentation/page.tsx`
 * — the one place that knows the project id. `ProcessMap` and `BpmnEditor` are
 * handed a function and never learn where a revision goes.
 *
 * Deliberately a small program, not the 1.000-line example: this measures the
 * seam, and the editor's own behaviour on a large model is `process-editor.spec.ts`.
 */

const STAMP = Date.now();
const EMAIL = `revision-seam-${STAMP}@cleancore-test.io`;
const PASSWORD = 'RevisionSeam123!';
const PROJECT_ID = `revision-seam-${STAMP}`;
const RUN_ID = `revision-seam-run-${STAMP}`;

const PROGRAM = [
  'REPORT z_seam_demo.',
  'START-OF-SELECTION.',
  '  PERFORM check_access.',
  '  PERFORM release.',
  'FORM check_access.',
  "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02'.",
  '  IF sy-subrc <> 0.',
  '    MESSAGE e001(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM release.',
  "  UPDATE eban SET frgkz = 'X' WHERE banfn = gv_banfn.",
  'ENDFORM.',
].join('\n');

const FILE_NAME = 'z_seam_demo.abap';
const SOURCE_SHA = sha256Hex(PROGRAM);

let uid = '';

async function signIn(page: Page) {
  await signInViaLanding(page, EMAIL, PASSWORD);
}


test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  uid = cred.user.uid;
  await cred.user.getIdToken();

  await adminSetDoc('users', uid, {
    firstName: 'Revision', lastName: 'Seam', email: EMAIL,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    transformationsUsed: 1, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });

  const fingerprint = {
    sha256: SOURCE_SHA,
    fileName: FILE_NAME,
    lineCount: PROGRAM.split('\n').length,
    byteSize: Buffer.byteLength(PROGRAM, 'utf8'),
    objectType: 'Report',
    uploadedAt: new Date().toISOString(),
  };

  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Requisition release', userId: uid, createdAt: new Date(),
    status: 'documented', legacyCode: PROGRAM, s4Deployment: 'private',
    activeRunId: RUN_ID, inputFingerprint: fingerprint,
  });

  const unsignedRun = {
    runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
    createdAt: new Date().toISOString(), status: 'completed',
    inputFingerprint: fingerprint,
  };
  const runHash = recomputeStoredRunHash(unsignedRun);
  await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
    ...unsignedRun,
    runHash,
    signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
  });
});

// ADR-127: Documentation mounts no map editor (the editor stays in Analyze), so it saves no revision; the
// history is a fold of its appendix. The saving half of this seam is held on the workspace's map.

test('a history that cannot be read says so, and does not claim there are no revisions', async ({ page }) => {
  // Carried QA finding bea464e656f4: every non-OK answer came back as an empty
  // list, so a 500 or an expired session read as "no revisions yet" on a
  // project that has two.
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await signIn(page);
  await page.route('**/api/projects/*/process-revisions**', (route) =>
    route.request().method() === 'GET' && !new URL(route.request().url()).search
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Refused for the test.' }) })
      : route.continue(),
  );
  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  // The history is a fold of the appendix (ADR-127).
  await page.locator('[data-doc-fold="revisions"] summary').first().click({ timeout: 90000 });
  await expect(page.locator('[data-revision-compare="failed"]')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-revision]')).toHaveCount(0);
});

test('a baseline the server refuses is said, not shown as an empty history', async ({ page }) => {
  // Carried QA finding 5ab84bc9a713: the opening baseline's refusal was
  // dropped, and the history under the map read as if there were no revisions
  // to have. A project whose active run does not exist is refused.
  test.setTimeout(240 * 1000);
  const ghost = `${PROJECT_ID}-ghost`;
  await adminSetDoc('projects', ghost, {
    name: 'Requisition release, run missing', userId: uid, createdAt: new Date(),
    status: 'documented', legacyCode: PROGRAM, s4Deployment: 'private',
    activeRunId: `${RUN_ID}-missing`,
    inputFingerprint: { sha256: SOURCE_SHA, fileName: FILE_NAME },
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await signIn(page);
  await page.goto(`/project/${ghost}/documentation`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-revision-baseline-refused]')).toBeVisible({ timeout: 90000 });
});

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import type { ProcessRevisionRecord } from '../lib/process-revisions';

/**
 * The seam between the editor (3.1) and the revisions (3.2).
 *
 * Both were built, and nothing joined them: `saveProcessRevision` was called
 * from nowhere and `RevisionCompare` was mounted nowhere, so roadmap 3.2's
 * promise — *"jedes Speichern eine unveränderliche Revision"* — was a store with
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
let idToken = '';
const path = `/api/projects/${PROJECT_ID}/process-revisions`;

async function signIn(page: Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

/** One revision with its BPMN, straight out of the store. */
async function storedRevision(request: APIRequestContext, n: number): Promise<ProcessRevisionRecord | null> {
  const res = await request.get(`${path}?revision=${n}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status() !== 200) return null;
  return (await res.json()).record as ProcessRevisionRecord;
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
  idToken = await cred.user.getIdToken();

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

test('the documentation stage saves a drawn model as a revision and shows it', async ({ page, request }) => {
  test.setTimeout(300 * 1000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await signIn(page);

  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-process-map]').waitFor({ timeout: 90000 });

  // 1. The history panel is on the page at all. It was written in 3.2 and
  //    mounted nowhere, which is one half of the finding.
  const history = page.locator('[data-revision-compare]');
  await history.waitFor({ timeout: 60000 });

  // 2. Opening the stage reconstructs revision 1 and the list shows it.
  await expect(page.locator('[data-revision="1"]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-revision="1"]')).toHaveAttribute('data-revision-origin', 'reconstructed');
  await expect(page.locator('[data-revision="2"]')).toHaveCount(0);

  // 3. Into the editor, and draw one step.
  await page.locator('[data-process-edit-toggle]').click();
  await page.locator('[data-process-editor]').waitFor({ timeout: 60000 });
  await expect
    .poll(async () => page.locator('[data-draft-row]').count(), { timeout: 60000 })
    .toBeGreaterThan(1);
  // The list is built from the draft string and is there before the modeller
  // is. The palette is not: `add` needs the modeller, and a click that arrives
  // first is swallowed. So wait for the canvas to have drawn the copy.
  await expect
    .poll(async () => page.locator('[data-process-editor-canvas] .djs-shape').count(), { timeout: 60000 })
    .toBeGreaterThan(2);
  await page.locator('[data-draft-row]').first().click();
  await page.locator('[data-palette-item="user-task"]').click();
  const drawn = page.locator('[data-draft-row][data-drawn="true"]');
  await expect(drawn).toHaveCount(1);
  // The id bpmn-js gave it. Asserting on this rather than on the element type
  // makes the check independent of what the reconstruction happens to contain.
  const drawnId = await drawn.getAttribute('data-draft-row');
  expect(drawnId).toBeTruthy();

  // 4. Save. The footer says which revision it became — a sentence, not a code.
  await page.locator('[data-editor-save]').click();
  await expect(page.locator('[data-editor-saved]')).toHaveText('Saved as revision 2.', { timeout: 60000 });

  // 5. And the revision is **found**: in the list under the map, which reloads
  //    because the save moved the key it is given…
  await expect(page.locator('[data-revision="2"]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-revision="2"]')).toHaveAttribute('data-revision-origin', 'edited');

  // …and in the store, through the route, with the drawn element in its BPMN.
  const two = await storedRevision(request, 2);
  expect(two, 'Save answered with a revision that is not in the store').not.toBeNull();
  expect(two!.origin).toBe('edited');
  expect(two!.account.uid).toBe(uid);
  expect(two!.runId).toBe(RUN_ID);
  expect(two!.xml, 'the stored revision is not the draft that was drawn').toContain(drawnId!);

  // 6. The reconstruction it came from is untouched — phase 3's acceptance, now
  //    that something really writes.
  const one = await storedRevision(request, 1);
  expect(one!.origin).toBe('reconstructed');
  expect(one!.xml, 'the drawn element reached the reconstructed Ist').not.toContain(drawnId!);

  // 7. Saving again with nothing changed is not an error and writes nothing.
  await page.locator('[data-editor-save]').click();
  await expect(page.locator('[data-editor-saved]'))
    .toHaveText('Nothing has changed since revision 2, so no new revision was written.', { timeout: 60000 });
  expect(await storedRevision(request, 3), 'an unchanged save added a revision').toBeNull();
});


import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The Documentation stage draws the process map once.
 *
 * It used to draw it twice. `useProcessMap` built the model on first paint and
 * again when the model availability answer arrived (~0.3 s later on a
 * production build) — a new object, handed down to `BpmnCanvas`, whose viewer
 * was torn down and built again with every node button replaced. A reader who
 * had tabbed into the map was left on `<body>` (fixed in the canvas, CI
 * c25437ab). Worse, a reader who had already pressed *Edit model* got the new
 * model in the open editor: its modeller was destroyed and rebuilt while the
 * destroyed one was still in state, the minimap read its canvas, and the whole
 * stage fell to the error boundary ("Cannot read properties of undefined
 * (reading 'length')" in `getRootElement`). That is
 * `process-revisions-seam.spec.ts:122` waiting for an editor that was gone
 * (CI 36909060803, 36882571606) — four runs in eight locally.
 *
 * Counted, not timed: a MutationObserver installed before the page's own
 * scripts counts every bpmn-js container that appears inside the reading
 * canvas, and every process map section that is mounted.
 */

const STAMP = Date.now();
const EMAIL = `map-rebuilds-${STAMP}@cleancore-test.io`;
const PASSWORD = 'MapRebuilds123!';
const PROJECT_ID = `map-rebuilds-${STAMP}`;
const RUN_ID = `map-rebuilds-run-${STAMP}`;

const PROGRAM = [
  'REPORT z_rebuild_demo.',
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
const FILE_NAME = 'z_rebuild_demo.abap';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: 'Map', lastName: 'Rebuilds', email: EMAIL,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    transformationsUsed: 1, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  const fingerprint = {
    sha256: sha256Hex(PROGRAM), fileName: FILE_NAME,
    lineCount: PROGRAM.split('\n').length, byteSize: Buffer.byteLength(PROGRAM, 'utf8'),
    objectType: 'Report', uploadedAt: new Date().toISOString(),
  };
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Requisition release', userId: uid, createdAt: new Date(),
    status: 'documented', legacyCode: PROGRAM, s4Deployment: 'private',
    activeRunId: RUN_ID, inputFingerprint: fingerprint,
  });
  const unsignedRun = {
    runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
    createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
  };
  const runHash = recomputeStoredRunHash(unsignedRun);
  await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
    ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
  });
});

async function countBuilds(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __mapBuilds: number; __mapMounts: number };
    w.__mapBuilds = 0;
    w.__mapMounts = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const containers = [
            ...(node.matches('.djs-container') ? [node] : []),
            ...Array.from(node.querySelectorAll<HTMLElement>('.djs-container')),
          ];
          for (const c of containers) if (c.closest('[data-process-map-canvas]')) w.__mapBuilds += 1;
          const sections = [
            ...(node.matches('[data-process-map]') ? [node] : []),
            ...Array.from(node.querySelectorAll<HTMLElement>('[data-process-map]')),
          ];
          w.__mapMounts += sections.length;
        });
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

const read = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __mapBuilds: number; __mapMounts: number };
    return { builds: w.__mapBuilds, mounts: w.__mapMounts };
  });

test('an unchanged model draws the reading map once, and Edit model is not lost', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await signInViaLanding(page, EMAIL, PASSWORD);
  await countBuilds(page);

  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-process-map-canvas] [data-map-node]').first().waitFor({ timeout: 90_000 });
  // Long enough for every late answer the page waits on — the model
  // availability, the naming record, the stored quote, the handbook — to have
  // arrived and been handed down (the second build came 0.8–1 s after the
  // first). Not `networkidle`: Firestore keeps a channel open.
  await page.waitForTimeout(6000);

  const settled = await read(page);
  expect(settled.mounts, 'the process map section was mounted more than once').toBe(1);
  expect(settled.builds, 'the reading canvas built its viewer more than once for one model').toBe(1);

  // And a click on Edit model stays a click on Edit model.
  await page.locator('[data-process-edit-toggle]').click();
  await expect(page.locator('[data-process-editor]')).toBeVisible({ timeout: 30_000 });
  expect((await read(page)).mounts).toBe(1);
});

test('Edit model pressed the moment the map is there stays open', async ({ page }) => {
  test.setTimeout(240 * 1000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await signInViaLanding(page, EMAIL, PASSWORD);
  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-process-edit-toggle]').click({ timeout: 90_000 });
  await expect(page.locator('[data-process-editor]')).toBeVisible({ timeout: 30_000 });
  // The window the late model used to arrive in, and well past it.
  await page.waitForTimeout(4000);
  await expect(page.getByText('This stage could not be displayed')).toHaveCount(0);
  await expect(page.locator('[data-process-editor]')).toBeVisible();
  await expect(page.locator('[data-process-editor-canvas] .djs-shape').first()).toBeVisible({ timeout: 30_000 });
});

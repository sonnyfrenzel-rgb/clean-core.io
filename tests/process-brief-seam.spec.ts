import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import JSZip from 'jszip';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';

/**
 * The seam between the brief (4.4) and the stage that offers it.
 *
 * `tests/process-brief.spec.ts` proves what the brief says; this one proves
 * there is a door. The lesson is QA finding 54a73bb3bed2: roadmap 3.2's store
 * was built, its editor was built, and nothing called either — a test that
 * asserts the functions exist would have passed on the day the finding was
 * written. So this one **presses the button in the browser and opens what came
 * out**: two files, a PDF that a reader would open, and a `.bpmn` that is the
 * export byte for byte.
 *
 * Deliberately a small program: this measures the seam. What the brief contains
 * is the other spec, and it needs no server at all.
 */

const STAMP = Date.now();
const EMAIL = `brief-seam-${STAMP}@cleancore-test.io`;
const PASSWORD = 'BriefSeam123!';
const PROJECT_ID = `brief-seam-${STAMP}`;
const RUN_ID = `brief-seam-run-${STAMP}`;
const PROJECT_NAME = 'Requisition release';

const PROGRAM = [
  'REPORT z_brief_seam.',
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

const FILE_NAME = 'z_brief_seam.abap';
const SOURCE_SHA = sha256Hex(PROGRAM);

async function signIn(page: Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
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
  const uid = cred.user.uid;

  await adminSetDoc('users', uid, {
    firstName: 'Brief', lastName: 'Seam', email: EMAIL,
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
    name: PROJECT_NAME, userId: uid, createdAt: new Date(),
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

test('the documentation stage hands over a PDF and the BPMN in one archive', async ({ page }) => {
  test.setTimeout(300 * 1000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await signIn(page);
  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

  // The button waits for the map, because there is no process to describe
  // before the source has been read back.
  const button = page.locator('[data-export-brief]');
  await button.waitFor({ timeout: 120_000 });
  await expect(page.locator('[data-brief-caveat]')).toContainText('not a signed audit pack');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    button.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/-brief\.zip$/);
  const saved = await download.path();
  expect(saved, 'the download never landed').toBeTruthy();
  const zip = await JSZip.loadAsync(fs.readFileSync(saved as string));

  const names = Object.keys(zip.files).sort();
  expect(names.length, `two files, not ${names.join(', ')}`).toBe(2);
  const pdfName = names.find((n) => n.endsWith('-brief.pdf'));
  const bpmnName = names.find((n) => n.endsWith('.bpmn'));
  expect(pdfName, 'no PDF in the archive').toBeTruthy();
  expect(bpmnName, 'no BPMN in the archive').toBeTruthy();

  const pdf = await zip.file(pdfName as string)!.async('uint8array');
  expect(Array.from(pdf.slice(0, 5)).map((b) => String.fromCharCode(b)).join('')).toBe('%PDF-');
  expect(pdf.length, 'a PDF this small rendered nothing').toBeGreaterThan(2000);

  // The one thing the archive must not do: hand over a second reading of the
  // source. It is the file the export produced, unchanged.
  const bpmn = await zip.file(bpmnName as string)!.async('string');
  expect(bpmn).toBe(
    buildBpmnExportFromSource(PROGRAM, { processName: PROJECT_NAME, sourceFileName: FILE_NAME }).xml,
  );
});

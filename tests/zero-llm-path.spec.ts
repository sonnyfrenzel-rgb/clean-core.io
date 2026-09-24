import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { MODEL_STAGES, NOT_GENERATED, STAGE_DISABLED_CODE, offeredModelStages } from '../lib/model-stages';

/**
 * Roadmap 1.2 — the zero-LLM lock path, observed rather than grepped.
 *
 * Three claims, and each is checked where it is made rather than in the source
 * that makes it:
 *
 *   1. **A run without a key reaches a signed evidence state.** The run is
 *      created with no narrative at all and comes back with its own HMAC
 *      recomputed here from the stored document — so "signed" means the
 *      signature verifies, not that a field called `signature` exists.
 *   2. **"Not generated" instead of empty (V25-A12).** The Analyze stage is
 *      opened in a browser for that run. Before this step the same project
 *      rendered the upload form and a "Start Analysis" button — a signed run in
 *      the database and a screen saying nothing had happened. A source guard
 *      cannot see that: `return null` is a perfectly ordinary line. So the
 *      assertions below read the rendered page and fail on an empty one.
 *   3. **The stages are switchable one at a time.** Switching `design` off
 *      leaves `transformation` alone, and the refusal comes from the server,
 *      not from a disabled button.
 *
 * Nothing here waits for a state to appear mid-request. Every observation is of
 * a settled page or a completed HTTP response; the one place that needs to wait
 * for the browser to catch up uses a polling `expect`, not a sleep.
 */

const STAMP = Date.now();
const EMAIL = `zero-llm-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `zero-llm-${STAMP}`;

/** Real ABAP, so the deterministic engine has something to find. */
const PROGRAM = [
  'REPORT z_zero_llm_credit.',
  'DATA: ls_order TYPE vbak,',
  '      lv_flag  TYPE c LENGTH 1.',
  "SELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.",
  "UPDATE vbak SET cmgst = 'B' WHERE vbeln = p_vbeln.",
  "CALL FUNCTION 'Z_LEGACY_CREDIT_CHECK'",
  '  EXPORTING iv_vbeln = p_vbeln',
  '  IMPORTING ev_flag  = lv_flag.',
  "WRITE: / 'Credit status', lv_flag.",
].join('\n');

let uid = '';
let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
// Fail closed: throws unless the run targets the emulators (tests/helpers/emulator-guard.ts).
connectFirestoreToEmulator(clientDb);

test.describe.configure({ mode: 'serial' });

/** The stage switch, through the route that owns it. */
async function setStages(request: APIRequestContext, stages: Record<string, boolean>) {
  const res = await request.post('/api/model-stages', { headers: headers(), data: { stages } });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', SIGN_IN);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.beforeAll(async () => {
  // Several suites share one emulator on this machine; 30 s is not always
  // enough for a sign-up plus two seed writes.
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();

  await adminSetDoc('users', uid, {
    firstName: 'Zero', lastName: 'Llm', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });

  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Credit check without a model', userId: uid, createdAt: new Date(),
    status: 'uploaded', legacyCode: PROGRAM, s4Deployment: 'private',
  });
});

test('the server under test is the one that was changed', async ({ request }: { request: APIRequestContext }) => {
  // Several dev servers run on this machine. A suite that measured the wrong
  // one would report the old behaviour as a regression, or the new behaviour
  // as present when it is not. `/api/model-stages` exists only with 1.2.
  const res = await request.get('/api/model-stages', { headers: headers() });
  expect(res.status(), 'the app under test has no /api/model-stages — wrong server or stale build').toBe(200);
  const body = await res.json();
  expect(Object.keys(body.stages).sort()).toEqual([...MODEL_STAGES].sort());
  expect(typeof body.keyAvailable).toBe('boolean');
});

test('a run with no model part is created and its signature verifies', async ({ request }: { request: APIRequestContext }) => {
  // No `analysis` in the body at all — the shape a key-less browser produces.
  const res = await request.post('/api/runs/create', {
    headers: headers(),
    data: { projectId: PROJECT_ID, s4Deployment: 'private', uploadedFileName: 'z_zero_llm_credit.abap' },
  });
  expect(res.status(), await res.text()).toBe(200);
  const { runId, runHash, signature } = await res.json();
  expect(runId).toBeTruthy();

  const snap = await getDoc(doc(clientDb, 'projects', PROJECT_ID, 'runs', runId));
  expect(snap.exists(), 'the run was not written').toBe(true);
  const run = snap.data() as Record<string, unknown> & {
    model: { provider: string | null; modelId: string | null };
    aiNarrativeMeta: { responseHash: string | null };
    evidenceReport: unknown[];
    worklist: unknown[];
    inputManifest: { inputs: Array<{ id: string; revision: string }> };
  };

  // What the run says about itself.
  expect(run.modelParticipation, 'a run with no narrative must say so').toBe('none');
  expect(run.model.provider).toBeNull();
  expect(run.model.modelId).toBeNull();
  expect(run.aiNarrativeMeta.responseHash, 'there is no narrative to hash').toBeNull();
  expect(run.analysis).toBe('');

  // The evidence is there — this is the whole point of the path.
  expect(Array.isArray(run.evidenceReport)).toBe(true);
  expect(run.evidenceReport.length, 'the deterministic engine found nothing to sign').toBeGreaterThan(0);
  expect(typeof run.cleanCoreScore).toBe('number');
  expect(run.extensibilityRoute).toBeTruthy();
  expect(run.worklist.length, 'the worklist is built from the findings alone').toBeGreaterThan(0);

  // The input manifest names the absence rather than the default model.
  const modelInput = run.inputManifest.inputs.find((i) => i.id === 'model:narrative');
  expect(modelInput?.revision, 'the manifest claimed a model that never ran').toBe('none');

  // "Signed" checked as a signature, not as the presence of a field: the hash
  // is recomputed from the stored document and the HMAC re-derived from it.
  const key = process.env.AUDIT_SIGNING_KEY!;
  expect(key, 'AUDIT_SIGNING_KEY must match the server under test').toBeTruthy();
  expect(recomputeStoredRunHash(run)).toBe(runHash);
  expect(signRunHash(runHash, key)).toBe(signature);
  expect(run.signature).toBe(signature);
});

test('the Analyze stage says "not generated" and shows the evidence instead of an upload form', async ({ page, request }) => {
  test.setTimeout(180 * 1000);

  // Switched off, so a run without a narrative is produced on any machine —
  // with or without a community key in the environment.
  const availability = await setStages(request, { analyze: false });
  // Which of the two reasons is the true one here is the server's answer, not
  // this spec's guess, and the screen has to give that one. Asserting "some
  // reason appears" would pass on a page that always printed the same sentence.
  const expectedReason: RegExp = availability.keyAvailable ? /switched off/i : /No Gemini key/i;

  await signIn(page);
  await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });

  const report = page.locator('[data-evidence-only-report]');
  await expect(report, 'a signed run with no narrative rendered nothing at all').toBeVisible({ timeout: 60000 });

  const notGenerated = report.locator('[data-not-generated="Analysis narrative"]');
  await expect(notGenerated).toBeVisible();
  await expect(notGenerated).toContainText(NOT_GENERATED);
  await expect(notGenerated, 'the reason is missing or wrong — an unexplained absence teaches nobody anything')
    .toContainText(expectedReason);

  // The failure this step exists to remove: the page used to offer to start an
  // analysis that had already run and been signed.
  await expect(page.getByRole('button', { name: /Start Analysis/ })).toHaveCount(0);

  // Not an empty box with a caption. The evidence the run signed is on screen.
  // `innerText` is what the reader sees, so it carries `text-transform` — the
  // labels are rendered uppercase. Matched case-insensitively rather than
  // written out in capitals, which would break on the next styling change.
  const text = await report.innerText();
  expect(text.length, 'the evidence-only report is a caption over nothing').toBeGreaterThan(400);
  expect(text).toMatch(/Clean Core Score/i);
  expect(text).toMatch(/Extensibility route/i);
  // The signed figures are on the screen as figures, not as a placeholder.
  expect(text, 'the score is a percentage, not a dash').toMatch(/Clean Core Score\s*\n\s*\d+%/i);
  // A dash or a zero where a score belongs is exactly what V25-A12 forbids.
  expect(text).not.toMatch(/Clean Core Score\s*\n\s*[—–-]\s*\n/i);

  await setStages(request, { analyze: true });
});

test('a stage is switched off on its own, and the server is what refuses', async ({ request }: { request: APIRequestContext }) => {
  const off = await setStages(request, { design: false });
  expect(off.stages.design).toBe(false);
  expect(off.stages.transformation, 'switching one stage off switched another').toBe(true);

  const refused = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'Draft a solution design.', stage: 'design' },
  });
  expect(refused.status()).toBe(403);
  const refusedBody = await refused.json();
  expect(refusedBody.code).toBe(STAGE_DISABLED_CODE);

  // The neighbouring stage is untouched. It may still fail for want of a key on
  // this machine; what it must not do is fail for the other stage's switch.
  const neighbour = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'Transform this.', stage: 'transformation' },
  });
  expect((await neighbour.json()).code, 'one switch refused a different stage').not.toBe(STAGE_DISABLED_CODE);

  const nonsense = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'hello', stage: 'not-a-stage' },
  });
  expect(nonsense.status(), 'an unknown stage passed as a stage').toBe(400);

  // And the switch really is a switch: back on, the refusal is gone.
  await setStages(request, { design: true });
  const again = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'Draft a solution design.', stage: 'design' },
  });
  expect((await again.json()).code, 'the stage stayed refused after being switched on').not.toBe(STAGE_DISABLED_CODE);
});

test('the switch is written by the server and cannot be forged from the browser', async () => {
  // `firestore.rules` limits a client to `userClientUpdateKeys()`. If
  // `modelStages` were ever added there, an account could grant itself a stage
  // the server had refused — and this is the only place that would notice.
  await expect(
    updateDoc(doc(clientDb, 'users', uid), { modelStages: { design: false } }),
  ).rejects.toThrow(/permission|insufficient/i);
});

test('the settings screen offers one switch per stage and the click sticks', async ({ page }) => {
  test.setTimeout(180 * 1000);
  await signIn(page);
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  // One switch per stage this account can use. Roadmap 2.4's `naming` names a
  // process map that only the workspace preview shows, so an account without
  // the preview — this one — is offered the five it had, and not a sixth for a
  // screen it cannot open.
  const rows = page.locator('[data-model-stage]');
  await expect(rows).toHaveCount(offeredModelStages(false).length, { timeout: 60000 });
  await expect(page.locator('[data-model-stage="naming"]'), 'a preview stage was offered outside the preview')
    .toHaveCount(0);

  const documentation = page.locator('[data-model-stage="documentation"]');
  await expect(documentation).toHaveAttribute('data-model-stage-on', 'true');
  await documentation.getByRole('button').click();
  // Polls until the round trip settles rather than sampling after a guessed delay.
  await expect(documentation).toHaveAttribute('data-model-stage-on', 'false', { timeout: 30000 });

  // It is stored, not merely painted: a reload comes back off.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-model-stage="documentation"]'))
    .toHaveAttribute('data-model-stage-on', 'false', { timeout: 60000 });
  await expect(page.locator('[data-model-stage="testing"]'), 'the other four moved with it')
    .toHaveAttribute('data-model-stage-on', 'true');
});

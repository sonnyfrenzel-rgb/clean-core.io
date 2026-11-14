import { test, expect, type APIRequestContext } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { issueModelReceipt } from '../lib/model-receipt';
import { STAGE_DISABLED_CODE } from '../lib/model-stages';
import {
  NAMING_FORMAT_VERSION,
  NAMING_PAUSED_CODE,
  NAMING_PAUSED_REASON,
  applyNaming,
  namingContextOf,
  type ProcessNamingRecord,
} from '../lib/process-naming';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Roadmap 2.4 — the route that stores a project's business names, against the
 * emulators and the real route.
 *
 * The model is not called. The answers are written here and the receipts are
 * minted here with the `AUDIT_SIGNING_KEY` the server under test holds — the
 * same way `tests/model-receipt.spec.ts` proves the run route — because what
 * is under test is what the route does with an answer, not whether Gemini is
 * reachable from this machine.
 *
 * Five claims:
 *
 *   1. an answer with a verified receipt is validated against the skeleton the
 *      **server** reads from the stored source, stored, and read back — with
 *      the pieces that did not fit counted, not kept;
 *   2. an answer without a receipt that verifies for this text and this account
 *      is refused and stores nothing — a name typed by anyone must not wear the
 *      chip *AI-generated*;
 *   3. an answer for another reading of the source is refused with 409;
 *   4. only the owner reads or writes the names, and no browser reads them
 *      straight out of Firestore;
 *   5. the `naming` stage is switched on its own, and the proxy refuses it.
 *
 * 3.0.21 (owner decision 06.11.2026): business names are paused for a reading
 * without the engine's facts, which is every reading of this build. The route
 * refuses every POST with 403 `naming-paused` — a verified receipt as much as a
 * refused one — and writes nothing; a naming stored before is read back
 * untouched and not applied. Claims 1–3 are therefore held as refusals here;
 * the validation and the receipt check themselves stay in the route for a
 * naming built from the facts, and their rules are held server-free in
 * `tests/process-naming.spec.ts` and `tests/model-receipt.spec.ts`.
 *
 * From 3.1.0 the build reads with the engine's facts, so the pause holds for a
 * project whose run was signed before 3.1.0 and no longer for one read now. The
 * project here is therefore one with a run signed by 3.0.21 (the engine version
 * the run route mirrors onto the project document, `auditMetadata.modelCard`),
 * and the route has to keep answering it as 3.0.21 did. A run read by 3.1.0 is
 * named from the facts and stored: `tests/process-naming-route-310.spec.ts`.
 */

const STAMP = Date.now();
const EMAIL = `process-naming-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `process-naming-other-${STAMP}@cleancore-test.io`;
const PREVIEW_EMAIL = `process-naming-preview-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `process-naming-${STAMP}`;

const PROGRAM = [
  'REPORT z_naming_route.',
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
  "  CALL FUNCTION 'Z_NOTIFY_REQUESTER' EXPORTING iv_banfn = gv_banfn.",
  'ENDFORM.',
].join('\n');

/** The engine of the project's signed run: the route reads the source with it (`engineVersionOfProject`). */
const RUN_ENGINE = 'v3.0.21';
const CONTEXT = namingContextOf(PROGRAM, { engineVersion: RUN_ENGINE });
const node = (kind: string, label: string) => {
  const found = CONTEXT.skeleton.nodes.find((n) => n.kind === kind && n.label === label);
  if (!found) throw new Error(`fixture has no ${kind} ${label}`);
  return found.id;
};
const DENIED = node('gateway', 'IF sy-subrc <> 0');
const NOTIFY = node('service-task', 'Z_NOTIFY_REQUESTER');

/** One name that fits, one id the skeleton does not have, a lane "CFO", and a lane on the check. */
const ANSWER = JSON.stringify({
  names: [
    { id: DENIED, name: 'Access denied?' },
    { id: 'nd-999-0', name: 'Approve by phone' },
  ],
  lanes: [
    { name: 'CFO', authorityCheck: null, nodes: [NOTIFY] },
    { name: 'Approver', authorityCheck: 'ac-1', nodes: [DENIED] },
  ],
});

let uid = '';
let otherUid = '';
let idToken = '';
let otherToken = '';
const headers = (token = idToken) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const path = `/api/projects/${PROJECT_ID}/process-naming`;
const signingKey = () => {
  const key = process.env.AUDIT_SIGNING_KEY;
  if (!key) throw new Error('AUDIT_SIGNING_KEY must match the server under test');
  return key;
};

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
// Fail closed: throws unless the run targets the emulators (tests/helpers/emulator-guard.ts).
connectFirestoreToEmulator(clientDb);

test.describe.configure({ mode: 'serial' });

async function stored(request: APIRequestContext): Promise<ProcessNamingRecord | null> {
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).record;
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);

  const other = await createUserWithEmailAndPassword(auth, OTHER_EMAIL, SIGN_IN);
  otherUid = other.user.uid;
  otherToken = await other.user.getIdToken();
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();

  for (const [id, email] of [[uid, EMAIL], [otherUid, OTHER_EMAIL]]) {
    await adminSetDoc('users', id, {
      firstName: 'Process', lastName: 'Naming', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Requisition release', userId: uid, createdAt: new Date(),
    status: 'analyzed', legacyCode: PROGRAM, s4Deployment: 'private',
    // A run signed by 3.0.21, as the run route leaves it on the project document.
    activeRunId: `run-${STAMP}`,
    auditMetadata: { modelCard: { engineVersion: RUN_ENGINE } },
  });
});

test('the server under test has the route', async ({ request }) => {
  // Several dev servers run on this machine; one without 2.4 answers 404 here
  // and every refusal below would pass for the wrong reason.
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), 'no process-naming route — wrong server or stale build').toBe(200);
  expect((await res.json()).record, 'a project nobody named has no names').toBeNull();
});

/** A naming as the route stored it before 3.0.21 — no `madeFrom`: not built from the engine's facts. */
const EARLIER: ProcessNamingRecord = {
  formatVersion: NAMING_FORMAT_VERSION,
  digest: CONTEXT.digest,
  names: [{ id: DENIED, technicalName: 'IF sy-subrc <> 0', name: 'Access denied?' }],
  lanes: [{ key: 'lane-1', name: 'Approver', authorityCheck: 'ac-1', nodes: [DENIED] }],
  discarded: { total: 0, byRule: {} },
  origin: {
    source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-2.5-flash',
    byok: false, issuedAt: Date.parse('2026-10-22T09:30:00.000Z'), textSha256: 'a'.repeat(64),
  },
  namedAt: '2026-10-22T09:30:05.000Z',
};

test('3.0.21: an answer with a verified receipt is refused with naming-paused and nothing is stored', async ({ request }) => {
  const receipt = issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-2.5-flash', byok: false, stage: 'naming' }, signingKey());
  const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: ANSWER, receipt } });
  expect(res.status(), await res.text()).toBe(403);
  expect(await res.json()).toEqual({ error: NAMING_PAUSED_REASON, code: NAMING_PAUSED_CODE });
  expect(await stored(request), 'a paused naming was stored').toBeNull();
  expect(await adminGetDoc(`projects/${PROJECT_ID}/process_naming`, 'current')).toBeNull();
});

test('3.0.21: a naming stored before is read back untouched, and not applied', async ({ request }) => {
  await adminSetDoc(`projects/${PROJECT_ID}/process_naming`, 'current', { ...EARLIER, requestedBy: uid });
  const again = await stored(request);
  expect(again, 'the stored naming was changed or withheld').toEqual(EARLIER);

  const view = applyNaming(CONTEXT, again);
  expect(view.state).toBe('not-named');
  expect(view.counts.named).toBe(0);
  expect(view.lanes).toEqual([]);
  expect(view.origin).toBeNull();
  expect(view.nodes.every((n) => n.businessName === null && n.nameProvenance === null)).toBe(true);
  expect(view.notice).toContain(NAMING_PAUSED_REASON);
});

test('3.0.21: every other answer is refused the same way, and the stored naming stays as it was', async ({ request }) => {
  const before = await stored(request);
  expect(before, 'the previous test stored nothing to compare against').toEqual(EARLIER);
  const other = JSON.stringify({ names: [{ id: DENIED, name: 'Blocked for this buyer?' }] });
  const elsewhere = namingContextOf(`${PROGRAM}\nFORM spare.\n  PERFORM release.\nENDFORM.`.replace('START-OF-SELECTION.', 'START-OF-SELECTION.\n  CLEAR gv_banfn.'), { engineVersion: RUN_ENGINE });
  expect(elsewhere.digest).not.toBe(CONTEXT.digest);

  const cases: Array<[string, unknown, string, string]> = [
    ['absent receipt', undefined, other, CONTEXT.digest],
    ['text-mismatch', issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-2.5-flash', byok: false, stage: 'naming' }, signingKey()), other, CONTEXT.digest],
    ['wrong-account', issueModelReceipt({ uid: otherUid, text: other, provider: 'google-gemini', modelId: 'gemini-2.5-flash', byok: false, stage: 'naming' }, signingKey()), other, CONTEXT.digest],
    ['forged', issueModelReceipt({ uid, text: other, provider: 'google-gemini', modelId: 'gemini-2.5-flash', byok: false, stage: 'naming' }, 'not-the-signing-key'), other, CONTEXT.digest],
    ['another stage', issueModelReceipt({ uid, text: other, provider: 'google-gemini', modelId: 'gemini-2.5-flash', byok: false, stage: 'statements' }, signingKey()), other, CONTEXT.digest],
    ['another reading', issueModelReceipt({ uid, text: other, provider: 'google-gemini', modelId: 'gemini-2.5-flash', byok: false, stage: 'naming' }, signingKey()), other, elsewhere.digest],
  ];
  for (const [label, receipt, text, digest] of cases) {
    const res = await request.post(path, { headers: headers(), data: { digest, text, receipt } });
    expect(res.status(), `${label}: ${await res.text()}`).toBe(403);
    expect((await res.json()).code, label).toBe(NAMING_PAUSED_CODE);
  }
  expect(await stored(request), 'a refused answer replaced the stored names').toEqual(before);
});

test('only the owner reads or writes the names, and no browser reads them out of Firestore', async ({ request }) => {
  // 404, not 403: the route answers a non-owner exactly as it answers an id
  // that names nothing, so a refusal cannot be used to ask whether a project
  // exists (tests/project-access-matrix.spec.ts, '403-vs-404').
  const read = await request.get(path, { headers: headers(otherToken) });
  expect(read.status()).toBe(404);
  expect(JSON.stringify(await read.json())).not.toContain('Access denied?');

  const text = JSON.stringify({ names: [{ id: DENIED, name: 'Somebody else decides' }] });
  const receipt = issueModelReceipt({ uid: otherUid, text, provider: 'google-gemini', modelId: 'gemini-2.5-flash', byok: false, stage: 'naming' }, signingKey());
  const write = await request.post(path, { headers: headers(otherToken), data: { digest: CONTEXT.digest, text, receipt } });
  expect(write.status()).toBe(404);
  expect((await stored(request))?.names.map((n) => n.name)).toEqual(['Access denied?']);

  // Not even the owner reads the document directly: the route is the only way in.
  const auth = getAuth(app);
  expect(auth.currentUser?.uid, 'the client SDK is not signed in as the owner').toBe(uid);
  // The code, not the message: the emulator words a rules denial differently
  // from production ("No matching allow statements").
  await expect(getDoc(doc(clientDb, 'projects', PROJECT_ID, 'process_naming', 'current')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  // …while the same session reads the project itself, so the refusal above is
  // the rule and not a signed-out client.
  expect((await getDoc(doc(clientDb, 'projects', PROJECT_ID))).exists()).toBe(true);
});

test('the naming stage is switched on its own, and the proxy is what refuses it', async ({ request }) => {
  const off = await request.post('/api/model-stages', { headers: headers(), data: { stages: { naming: false } } });
  expect(off.status(), await off.text()).toBe(200);
  const offBody = await off.json();
  expect(offBody.stages.naming).toBe(false);
  expect(offBody.stages.analyze, 'switching the names off switched the narrative off').toBe(true);
  expect(offBody.stages.documentation).toBe(true);

  const refused = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'Name these steps.', stage: 'naming', jsonResponse: true },
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).code).toBe(STAGE_DISABLED_CODE);

  const on = await request.post('/api/model-stages', { headers: headers(), data: { stages: { naming: true } } });
  expect((await on.json()).stages.naming).toBe(true);
  const again = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'Name these steps.', stage: 'naming', jsonResponse: true },
  });
  const againBody = await again.json();
  expect(againBody.code, 'the stage stayed refused after being switched on').not.toBe(STAGE_DISABLED_CODE);
  // 3.0.21: switched on, a naming prompt without the engine's facts is still refused — before any key is loaded.
  expect(again.status()).toBe(403);
  expect(againBody.code).toBe(NAMING_PAUSED_CODE);
});

test('a JSON body of null is a 400 with the reason, not a 500', async ({ request }) => {
  // Carried QA finding 649f8b778f8e: `null` parsed fine and then threw on
  // `.stages`, and the catch answered 500.
  const res = await request.post('/api/model-stages', {
    headers: { ...headers(), 'Content-Type': 'application/json' },
    data: 'null',
  });
  expect(res.status(), await res.text()).toBe(400);
  expect((await res.json()).error).toContain('Missing required field: stages');
});

test('an account with the workspace preview is offered the switch — and the click sticks', async ({ page }) => {
  test.setTimeout(180 * 1000);
  // The other half of `tests/zero-llm-path.spec.ts`, which proves that an
  // account without the preview is offered five switches and no naming row.
  // Somebody has to be able to turn it off, or the switch is a dead setting.
  const cred = await createUserWithEmailAndPassword(getAuth(app), PREVIEW_EMAIL, SIGN_IN);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Preview', lastName: 'Admin', email: PREVIEW_EMAIL, tier: 'pilot', status: 'approved',
    isAdmin: true, activatedAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });

  await signInViaLanding(page, PREVIEW_EMAIL, SIGN_IN);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  const row = page.locator('[data-model-stage="naming"]');
  await expect(row, 'the preview account is not offered the naming switch').toHaveCount(1, { timeout: 60000 });
  await expect(row).toHaveAttribute('data-model-stage-on', 'true');

  await row.getByRole('switch').click();
  await expect(row).toHaveAttribute('data-model-stage-on', 'false', { timeout: 30000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-model-stage="naming"]'), 'the switch was painted, not stored')
    .toHaveAttribute('data-model-stage-on', 'false', { timeout: 60000 });
  await expect(page.locator('[data-model-stage="analyze"]'), 'the narrative moved with the names')
    .toHaveAttribute('data-model-stage-on', 'true');
});

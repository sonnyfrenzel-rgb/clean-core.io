import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { issueModelReceipt } from '../lib/model-receipt';
import { STAGE_DISABLED_CODE } from '../lib/model-stages';
import { applyNaming, namingContextOf, type ProcessNamingRecord } from '../lib/process-naming';

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
 *      chip *Model proposal*;
 *   3. an answer for another reading of the source is refused with 409;
 *   4. only the owner reads or writes the names, and no browser reads them
 *      straight out of Firestore;
 *   5. the `naming` stage is switched on its own, and the proxy refuses it.
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

const CONTEXT = namingContextOf(PROGRAM);
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
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  connectFirestoreEmulator(clientDb, host || '127.0.0.1', Number(port) || 8080);
}

test.describe.configure({ mode: 'serial' });

async function stored(request: APIRequestContext): Promise<ProcessNamingRecord | null> {
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).record;
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

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
  });
});

test('the server under test has the route', async ({ request }) => {
  // Several dev servers run on this machine; one without 2.4 answers 404 here
  // and every refusal below would pass for the wrong reason.
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), 'no process-naming route — wrong server or stale build').toBe(200);
  expect((await res.json()).record, 'a project nobody named has no names').toBeNull();
});

test('an answer with a verified receipt is validated against the stored source, stored and read back', async ({ request }) => {
  const receipt = issueModelReceipt({ uid, text: ANSWER, modelId: 'gemini-2.5-flash', byok: false }, signingKey());
  const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: ANSWER, receipt } });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: ProcessNamingRecord };

  expect(record.digest).toBe(CONTEXT.digest);
  expect(record.names).toEqual([{ id: DENIED, technicalName: 'IF sy-subrc <> 0', name: 'Access denied?' }]);
  expect(record.lanes).toEqual([{ key: 'lane-1', name: 'Approver', authorityCheck: 'ac-1', nodes: [DENIED] }]);
  expect(record.discarded).toEqual({ total: 2, byRule: { 'unknown-node': 1, 'lane-organisational': 1 } });
  // The model the receipt names, not a default — and no copy of the answer.
  expect(record.origin).toEqual({
    source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-2.5-flash',
    byok: false, issuedAt: receipt.iat, textSha256: receipt.textSha256,
  });
  expect(JSON.stringify(record)).not.toContain('Approve by phone');
  expect(JSON.stringify(record)).not.toContain('CFO');

  const again = await stored(request);
  expect(again, 'what GET returns is not what POST stored').toEqual(record);

  const view = applyNaming(CONTEXT, again);
  expect(view.state).toBe('named');
  expect(view.lanes[0]).toMatchObject({ name: 'Approver', evidence: 'anchored', anchor: { lineStart: 6, lineEnd: 6 } });
});

test('without a receipt that verifies for this text and this account, nothing is stored', async ({ request }) => {
  const before = await stored(request);
  expect(before, 'the previous test stored nothing to compare against').not.toBeNull();
  const other = JSON.stringify({ names: [{ id: DENIED, name: 'Blocked for this buyer?' }] });

  const cases: Array<[string, unknown, string]> = [
    ['absent', undefined, other],
    // A real receipt, over the answer of the previous test — not this one.
    ['text-mismatch', issueModelReceipt({ uid, text: ANSWER, modelId: 'gemini-2.5-flash', byok: false }, signingKey()), other],
    ['wrong-account', issueModelReceipt({ uid: otherUid, text: other, modelId: 'gemini-2.5-flash', byok: false }, signingKey()), other],
    ['forged', issueModelReceipt({ uid, text: other, modelId: 'gemini-2.5-flash', byok: false }, 'not-the-signing-key'), other],
  ];
  for (const [refusal, receipt, text] of cases) {
    const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text, receipt } });
    expect(res.status(), `${refusal}: ${await res.text()}`).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'receipt-refused', refusal });
  }
  expect(await stored(request), 'a refused answer replaced the stored names').toEqual(before);
});

test('an answer for another reading of the source is refused with 409', async ({ request }) => {
  const before = await stored(request);
  const elsewhere = namingContextOf(`${PROGRAM}\nFORM spare.\n  PERFORM release.\nENDFORM.`.replace('START-OF-SELECTION.', 'START-OF-SELECTION.\n  CLEAR gv_banfn.'));
  expect(elsewhere.digest).not.toBe(CONTEXT.digest);
  const text = JSON.stringify({ names: [{ id: DENIED, name: 'Access denied?' }] });
  const receipt = issueModelReceipt({ uid, text, modelId: 'gemini-2.5-flash', byok: false }, signingKey());

  const res = await request.post(path, { headers: headers(), data: { digest: elsewhere.digest, text, receipt } });
  expect(res.status(), await res.text()).toBe(409);
  expect((await res.json()).code).toBe('source-moved');
  expect(await stored(request)).toEqual(before);
});

test('only the owner reads or writes the names, and no browser reads them out of Firestore', async ({ request }) => {
  // 404, not 403: the route answers a non-owner exactly as it answers an id
  // that names nothing, so a refusal cannot be used to ask whether a project
  // exists (tests/project-access-matrix.spec.ts, '403-vs-404').
  const read = await request.get(path, { headers: headers(otherToken) });
  expect(read.status()).toBe(404);
  expect(JSON.stringify(await read.json())).not.toContain('Access denied?');

  const text = JSON.stringify({ names: [{ id: DENIED, name: 'Somebody else decides' }] });
  const receipt = issueModelReceipt({ uid: otherUid, text, modelId: 'gemini-2.5-flash', byok: false }, signingKey());
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
  expect((await again.json()).code, 'the stage stayed refused after being switched on').not.toBe(STAGE_DISABLED_CODE);
});

test('an account with the workspace preview is offered the switch — and the click sticks', async ({ page }) => {
  test.setTimeout(180 * 1000);
  // The other half of `tests/zero-llm-path.spec.ts`, which proves that an
  // account without the preview is offered five switches and no naming row.
  // Somebody has to be able to turn it off, or the switch is a dead setting.
  const cred = await createUserWithEmailAndPassword(getAuth(app), PREVIEW_EMAIL, SIGN_IN);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Preview', lastName: 'Admin', email: PREVIEW_EMAIL, tier: 'pilot', status: 'approved',
    isAdmin: true, workspaceShell: true, activatedAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });

  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', PREVIEW_EMAIL);
  await page.fill('input[type="password"]', SIGN_IN);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  const row = page.locator('[data-model-stage="naming"]');
  await expect(row, 'the preview account is not offered the naming switch').toHaveCount(1, { timeout: 60000 });
  await expect(row).toHaveAttribute('data-model-stage-on', 'true');

  await row.getByRole('button').click();
  await expect(row).toHaveAttribute('data-model-stage-on', 'false', { timeout: 30000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-model-stage="naming"]'), 'the switch was painted, not stored')
    .toHaveAttribute('data-model-stage-on', 'false', { timeout: 60000 });
  await expect(page.locator('[data-model-stage="analyze"]'), 'the narrative moved with the names')
    .toHaveAttribute('data-model-stage-on', 'true');
});

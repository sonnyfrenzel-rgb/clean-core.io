import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { adminSetDoc, adminMergeDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { coveringTestRunReceipt, isTestRunReceipt } from '../lib/test-receipt';
import { testEvidence, workflowSteps } from '../lib/workflow-steps';
import type { Project } from '../lib/types';

/**
 * What the chain is allowed to claim about its own inputs — the two ends of it,
 * from the QA full review of a19945ef01dc.
 *
 * 1. **A signed run is an ABAP analysis.** `looksLikeAbap()` existed and ran in
 *    the browser only, so a POST straight to `/api/runs/create` with prose
 *    passed a truthiness check, fell through `detectObjectType` to the catch-all
 *    `ABAP Source`, cost a unit of the community quota and produced a run with
 *    `status: 'completed'`.
 *
 * 2. **A test result belongs to the project it is reported for.** The runner
 *    took `code` and `tests` out of the request body, so the answer described
 *    whatever the caller sent — a trivial passing suite, or the project's suite
 *    against different code — and the client was free to present it as the
 *    project's. What runs now is what the project stores, and the run leaves a
 *    server-written receipt bound to the digests of what it executed.
 *
 * Both halves are measured against the real routes on the emulator, not read off
 * the source: the first one *was* implemented, in the half that does not decide.
 */

const ABAP = 'REPORT z_binding.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\nWRITE / lines( lt ).\n';
const PROSE =
  'Dear Sir or Madam,\n\nplease find attached our invoice for August. Payment is due within\nthirty days of receipt. Kind regards, Accounts Receivable.\n';

const SUITE = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert';",
  "import { total } from './app.js';",
  "test('TC_01: totals add up', () => { assert.strictEqual(total([1, 2]), 3); });",
  "test('TC_02: an empty basket is zero', () => { assert.strictEqual(total([]), 0); });",
].join('\n');

const APP = JSON.stringify([
  { path: 'app.ts', content: 'export const total = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);' },
]);

const CASES = [
  { id: 'TC_01', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' },
  { id: 'TC_02', name: 'Empty basket', category: 'Unit', description: 'd', priority: 'Medium' },
];

test.describe.configure({ mode: 'serial' });

const EMAIL = `binding-${Date.now()}@cleancore-test.io`;
const PASSWORD = 'TrustBinding123!';
const PROJECT_ID = `binding-${Date.now()}`;
let token = '';
let uid = '';
let db: Firestore;

const read = async (path: string) => (await db.doc(path).get()).data();

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const adminApp = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
  db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  uid = cred.user.uid;
  token = await cred.user.getIdToken();
  await adminSetDoc('users', uid, {
    firstName: 'Trust', lastName: 'Binding', email: EMAIL, tier: 'pilot', status: 'approved',
    transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
    mfaEnabled: false, createdAt: new Date(),
  });
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Trust binding fixture', userId: uid, createdAt: new Date(), status: 'uploaded', legacyCode: ABAP,
  });
});

test.describe('a signed run is an analysis of ABAP', () => {
  test('prose is refused, nothing is signed and no unit is spent', async ({ request }) => {
    const before = await read(`users/${uid}`);
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: PROSE, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'letter.txt' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('not-abap');

    const project = await read(`projects/${PROJECT_ID}`);
    expect(project?.activeRunId, 'a run was created for prose').toBeUndefined();
    // Refused before the reservation, so the community quota is untouched — the
    // gate is not "charge them and then say no".
    const after = await read(`users/${uid}`);
    expect(after?.transformationsUsed).toBe(before?.transformationsUsed ?? 0);
  });

  test('an administrator is not an owner — no signed run lands in a stranger\'s project', async ({ request }) => {
    test.setTimeout(120 * 1000);
    // The same shape f8bc33b closed on `DELETE /api/projects/{id}`: the claim
    // stood in for ownership, and the only gate behind it lets every token
    // through for an account that never enrolled a second factor.
    const adminEmail = `binding-admin-${Date.now()}@cleancore-test.io`;
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const cred = await createUserWithEmailAndPassword(getAuth(app), adminEmail, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Ops', lastName: 'Admin', email: adminEmail, tier: 'pilot', status: 'approved',
      isAdmin: true, transformationsUsed: 0, transformationsLimit: 10,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    // The claim has to be on the token, not only on the profile.
    const adminToken = await cred.user.getIdToken(true);

    const before = await read(`projects/${PROJECT_ID}`);
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        projectId: PROJECT_ID,
        legacyCode: 'REPORT z_not_yours.\nWRITE / 1.\n',
        s4Deployment: 'public',
        analysis: '{}',
        uploadedFileName: 'z.abap',
      },
    });
    expect(res.status(), await res.text()).toBe(403);
    const after = await read(`projects/${PROJECT_ID}`);
    expect(after?.legacyCode, 'a stranger\'s source was overwritten').toBe(before?.legacyCode);
    expect(after?.activeRunId, 'a stranger\'s active run was replaced').toBe(before?.activeRunId);
  });

  test('a fragment is still ABAP — the gate is not a parser', async ({ request }) => {
    const form = 'FORM calculate_total.\n  ADD 1 TO lv_x.\nENDFORM.\n';
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: form, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status(), await res.text()).toBe(200);
  });
});

test.describe('a test result belongs to the project it is reported for', () => {
  let runId = '';

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120 * 1000);
    await adminMergeDoc('projects', PROJECT_ID, { legacyCode: ABAP });
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: ABAP, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
    });
    expect(res.status(), await res.text()).toBe(200);
    runId = (await res.json()).runId;
    await adminMergeDoc('projects', PROJECT_ID, {
      generatedCode: APP,
      testSuite: { code: SUITE },
      testCases: CASES,
      documentation: '# Blueprint\n',
    });
  });

  test('a suite posted in the body is not what runs — the project\'s own is', async ({ request }) => {
    test.setTimeout(90 * 1000);
    // The shape of the attack: a trivial suite that cannot fail, naming the
    // project's case ids, with the code replaced by nothing.
    const forged = [
      "import { test } from 'node:test';",
      "test('TC_01: nothing at all', () => {});",
      "test('TC_02: nothing at all either', () => {});",
    ].join('\n');
    const res = await request.post('/api/run-tests', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, tests: { code: forged }, code: '', selectedTestIds: ['TC_01', 'TC_02'] },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    // The two suites name the same cases and describe them differently. What
    // came back is the stored suite's description, so the body was not executed.
    expect(body.output, JSON.stringify(body).slice(0, 800)).toContain('totals add up');
    expect(body.output, 'the body\'s suite was executed').not.toContain('nothing at all');
    const stored = await read(`projects/${PROJECT_ID}`);
    expect(isTestRunReceipt(stored?.testRunReceipt), 'no receipt was written').toBe(true);
    expect(stored?.testRunReceipt.runId).toBe(runId);
    // The receipt is taken over the project's artefacts, not the body's.
    expect(coveringTestRunReceipt(stored as Project), 'the receipt does not fit the project it was written on').toBeTruthy();
  });

  test('an administrator cannot put an execution receipt on a stranger\'s project', async ({ request }) => {
    test.setTimeout(120 * 1000);
    // The receipt is what turns Testing and Delivery green, so the route that
    // writes it has to be owner-only for the same reason `/api/runs/create` is.
    const adminEmail = `binding-runner-admin-${Date.now()}@cleancore-test.io`;
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const cred = await createUserWithEmailAndPassword(getAuth(app), adminEmail, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Ops', lastName: 'Runner', email: adminEmail, tier: 'pilot', status: 'approved',
      isAdmin: true, transformationsUsed: 0, transformationsLimit: 10,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    const adminToken = await cred.user.getIdToken(true);

    const before = await read(`projects/${PROJECT_ID}`);
    const res = await request.post('/api/run-tests', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { projectId: PROJECT_ID, selectedTestIds: ['TC_01', 'TC_02'] },
    });
    expect(res.status(), await res.text()).toBe(403);
    const after = await read(`projects/${PROJECT_ID}`);
    expect(after?.testRunReceipt?.executedAt, 'a stranger wrote an execution receipt').toBe(
      before?.testRunReceipt?.executedAt,
    );
  });

  test('the receipt is what makes Testing and Delivery green, and it retires with the code', async () => {
    const stored = (await read(`projects/${PROJECT_ID}`)) as Project;
    const evidence = testEvidence(stored);
    expect(evidence.total).toBe(2);
    expect(evidence.attestedPasses, 'the run did not report both cases as passed').toBe(2);

    // The project as stored carries no `status` on its cases — the executed
    // verdicts live in the receipt. The screen's own copy is what the testing
    // page writes; the phase contract reads both and needs both.
    const withVerdicts: Project = {
      ...stored,
      testCases: (stored.testCases || []).map((c) => ({ ...c, status: 'Passed' as const })),
    };
    const byKey = Object.fromEntries(workflowSteps(withVerdicts).map((s) => [s.key, s]));
    expect(byKey.testing).toMatchObject({ state: 'done', proven: true });
    expect(byKey.delivery).toMatchObject({ state: 'done', proven: true });

    // Rewrite the code the receipt was taken over and the green goes with it —
    // the verdicts are still there and they are no longer about this code.
    const rewritten: Project = { ...withVerdicts, generatedCode: '[{"path":"app.ts","content":"export const total = () => 99;"}]' };
    const after = Object.fromEntries(workflowSteps(rewritten).map((s) => [s.key, s]));
    expect(after.testing.proven).toBe(false);
    expect(after.delivery.proven).toBe(false);
  });
});

import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { repairBaseDigests } from '../lib/repair-draft';
import { coveringTestRunReceipt } from '../lib/test-receipt';

/**
 * Roadmap 8.7 (CR-10), the whole path through the running server:
 *
 *   stored code does not compile → a draft is cut on the server → the runner
 *   executes exactly that draft (and the project is untouched) → adoption by
 *   compare-and-swap → the project's receipt names the draft and covers it.
 *
 * Before 8.7 the retry after a repair ran the stored, broken code again,
 * because the runner — rightly — ignores code in the request body. The first
 * assertion that would have failed then is "the draft run compiles".
 *
 * Needs the server and both emulators (like `test-verdicts-guard`'s end-to-end half).
 */

test.describe('a repair draft, from cut to adoption', () => {
  const EMAIL = `repair-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'Repair123!';
  const PROJECT_ID = `repair-${Date.now()}`;
  const BROKEN = 'export const add = (a: number, b: number) => a + b:';
  const FIXED = 'export const add = (a: number, b: number) => a + b;';
  const SUITE = [
    "import { test } from 'node:test';",
    "import assert from 'node:assert';",
    "import { add } from './app';",
    "test('TC_01: adds', () => { assert.strictEqual(add(2, 3), 5); });",
  ].join('\n');
  let token = '';

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Repair', lastName: 'Draft', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Repair fixture', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
      activeRunId: 'run-repair-1',
      generatedCode: BROKEN,
      testSuite: { code: SUITE },
      testCases: [{ id: 'TC_01', name: 'adds', description: '', category: 'Unit', priority: 'High' }],
    });
  });

  test('the runner executes the draft, the project stays untouched until adoption, and the receipt names what ran', async ({ request }) => {
    test.setTimeout(120 * 1000);
    const auth = { Authorization: `Bearer ${token}` };

    // 1) The stored code does not compile.
    const first = await request.post('/api/run-tests', { headers: auth, data: { projectId: PROJECT_ID } });
    expect(first.status(), await first.text()).toBe(200);
    expect((await first.json()).buildError).toBe(true);

    // 2) A draft is cut from what the server holds.
    const stored = await adminGetDoc('projects', PROJECT_ID);
    const base = repairBaseDigests(stored!);
    const proposed = await request.post(`/api/projects/${PROJECT_ID}/repair-drafts`, {
      headers: auth,
      data: { action: 'propose', expectedCodeDigest: base.codeDigest, expectedSuiteDigest: base.suiteDigest, target: { kind: 'module' }, content: FIXED },
    });
    expect(proposed.status(), await proposed.text()).toBe(200);
    const draft = await proposed.json();
    expect(draft.draftId).toBeTruthy();

    // 3) The runner executes exactly that draft.
    const run = await request.post('/api/run-tests', { headers: auth, data: { projectId: PROJECT_ID, draftId: draft.draftId } });
    expect(run.status(), await run.text()).toBe(200);
    const ran = await run.json();
    expect(ran.buildError, 'the draft compiles — before 8.7 the retry ran the broken stored code').toBeFalsy();
    expect(ran.receipt, 'a draft run writes no project receipt').toBeNull();
    expect(ran.draftReceipt.draft).toEqual({ id: draft.draftId, digest: draft.draftDigest });
    expect(ran.draftReceipt.codeDigest).toBe(draft.codeDigest);

    const untouched = await adminGetDoc('projects', PROJECT_ID);
    expect(untouched!.generatedCode, 'running a draft writes nothing to the project').toBe(BROKEN);
    expect(untouched!.testRunReceipt).toBeUndefined();

    // 4) Adoption, compare-and-swap.
    const adopted = await request.post(`/api/projects/${PROJECT_ID}/repair-drafts`, {
      headers: auth,
      data: { action: 'adopt', draftId: draft.draftId, expectedDraftDigest: draft.draftDigest },
    });
    expect(adopted.status(), await adopted.text()).toBe(200);

    const after = await adminGetDoc('projects', PROJECT_ID);
    expect(after!.generatedCode).toBe(FIXED);
    const receipt = coveringTestRunReceipt(after!);
    expect(receipt, 'the adopted receipt covers the adopted code').not.toBeNull();
    expect(receipt!.draft).toEqual({ id: draft.draftId, digest: draft.draftDigest });
    expect(receipt!.verdicts).toEqual([{ id: 'TC_01', status: 'Passed' }]);

    // 5) Once adopted, the draft is spent.
    const again = await request.post(`/api/projects/${PROJECT_ID}/repair-drafts`, {
      headers: auth,
      data: { action: 'adopt', draftId: draft.draftId, expectedDraftDigest: draft.draftDigest },
    });
    expect(again.status()).toBe(409);
    const rerun = await request.post('/api/run-tests', { headers: auth, data: { projectId: PROJECT_ID, draftId: draft.draftId } });
    expect(rerun.status()).toBe(409);
  });

  test('a draft id is a name, not a path: anything else is refused before the runner starts', async ({ request }) => {
    const res = await request.post('/api/run-tests', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, draftId: '../../users/x' },
    });
    expect(res.status()).toBe(400);
  });
});

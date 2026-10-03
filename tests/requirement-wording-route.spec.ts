import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { issueModelReceipt } from '../lib/model-receipt';
import { buildRequirementSet } from '../lib/functional-requirements';
import type { RequirementWordingRecord } from '../lib/requirement-wording';

/**
 * v3.0.1 — the route that stores a model's wording for the functional
 * requirements, against the emulators and the real route. The model is not
 * called: answers are written here and receipts minted with the signing key the
 * server under test holds. What is under test is what the route does with an
 * answer — above all, that a sentence citing a line that is not in the source
 * is dropped and counted, never stored.
 */

const STAMP = Date.now();
const EMAIL = `req-wording-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `req-wording-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `req-wording-${STAMP}`;
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_SALES_ORDER_CREATOR.txt'), 'utf8').replace(/\r\n/g, '\n');
const SET = buildRequirementSet({ source: SOURCE });
const path_ = `/api/projects/${PROJECT_ID}/requirement-wording`;

let uid = '';
let token = '';
let otherToken = '';
const headers = (t = token) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
const key = () => {
  const k = process.env.AUDIT_SIGNING_KEY;
  if (!k) throw new Error('AUDIT_SIGNING_KEY must match the server under test');
  return k;
};
const receiptFor = (text: string, stage = 'design') =>
  issueModelReceipt({ uid, text, provider: 'google-gemini', modelId: 'gemini-test', byok: false, stage }, key());

/** A write the local emulator answers with "2 UNKNOWN" may still have landed; read back before failing. */
async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const other = await createUserWithEmailAndPassword(auth, OTHER_EMAIL, SIGN_IN);
  otherToken = await other.user.getIdToken();
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  token = await cred.user.getIdToken();
  for (const [id, email] of [[uid, EMAIL], [other.user.uid, OTHER_EMAIL]]) {
    await adminSetDoc('users', id, {
      firstName: 'Req', lastName: 'Wording', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 50, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Sales order creator', userId: uid, createdAt: new Date(), status: 'analyzed', legacyCode: SOURCE, s4Deployment: 'private',
  });
});

test('a verified answer is checked against the stored source: a line that is not in the source is dropped and counted', async ({ request }) => {
  const [first, second] = SET.requirements;
  const text = JSON.stringify({
    requirements: [
      { id: first.id, statement: 'The system shall ask for the customer and the material before every run.', anchors: [`L${first.anchors[0].lineStart}`] },
      { id: second.id, statement: 'The system shall fill in the fixed order values.', anchors: ['L4242'] },
    ],
  });
  const res = await request.post(path_, { headers: headers(), data: { digest: SET.sourceSha256, text, receipt: receiptFor(text) } });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: RequirementWordingRecord };
  expect(Object.keys(record.wording)).toEqual([first.id]);
  expect(record.discarded).toEqual([{ id: second.id, reason: 'anchor-not-in-source' }]);
  expect(record.origin).toMatchObject({ source: 'model', receipt: 'verified' });

  const read = await request.get(path_, { headers: headers() });
  expect(read.status()).toBe(200);
  expect(((await read.json()) as { record: RequirementWordingRecord }).record.wording[first.id]).toMatch(/^The system shall ask/);
});

test('without a receipt for this text, or with one from another stage, nothing is stored', async ({ request }) => {
  const text = JSON.stringify({ requirements: [] });
  const none = await request.post(path_, { headers: headers(), data: { digest: SET.sourceSha256, text, receipt: null } });
  expect(none.status()).toBe(422);
  const other = await request.post(path_, { headers: headers(), data: { digest: SET.sourceSha256, text, receipt: receiptFor(text, 'statements') } });
  expect(other.status()).toBe(422);
});

test('an answer for another source is refused with 409', async ({ request }) => {
  const text = JSON.stringify({ requirements: [] });
  const res = await request.post(path_, { headers: headers(), data: { digest: 'f'.repeat(64), text, receipt: receiptFor(text) } });
  expect(res.status()).toBe(409);
});

test('a stranger neither reads nor writes', async ({ request }) => {
  expect((await request.get(path_, { headers: headers(otherToken) })).status()).toBe(404);
  const text = JSON.stringify({ requirements: [] });
  expect((await request.post(path_, { headers: headers(otherToken), data: { digest: SET.sourceSha256, text, receipt: null } })).status()).toBe(404);
  expect((await request.get(path_)).status()).toBe(401);
});

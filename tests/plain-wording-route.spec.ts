import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc as seedDoc, adminMergeDoc } from './helpers/admin-seed';
import { issueModelReceipt } from '../lib/model-receipt';
import { plainDigestOf, plainItemsOf, type PlainItem, type PlainWordingRecord } from '../lib/plain-wording';

/**
 * Roadmap 3.0.20, owner decision 2 — the route that stores the plain wording,
 * against the emulators and the real route (QA review of 45ab7b5f6a4c,
 * c9fd6b215d05: the route was only read as source text). The model is not
 * called: answers are written here and receipts minted with the signing key the
 * server under test holds. Under test: a verified answer is guarded and stored
 * and read back; a missing or foreign-stage receipt, another source, sentences
 * that are not the digest's and a stranger are refused; a second write replaces
 * the first.
 */

const STAMP = Date.now();
const EMAIL = `plain-wording-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `plain-wording-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `plain-wording-${STAMP}`;
const SOURCE = [
  'REPORT zplain.',
  'DATA gv_amount TYPE p LENGTH 10 DECIMALS 2.',
  'START-OF-SELECTION.',
  '  IF gv_amount > 500000.',
  "    MESSAGE 'Too high' TYPE 'E'.",
  '  ENDIF.',
].join('\n');
const ITEMS: PlainItem[] = plainItemsOf([
  { text: 'Only cases with an amount at or below 500,000 go further; for every other amount the program stops here.', anchor: { lineStart: 4, lineEnd: 4 } },
  { text: 'Where it holds: the program stops with an error message.', anchor: { lineStart: 4, lineEnd: 6 } },
]);
const DIGEST = plainDigestOf('rules', SOURCE, ITEMS);
const path_ = `/api/projects/${PROJECT_ID}/plain-wording`;

let uid = '';
let token = '';
let otherToken = '';
const headers = (t = token) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
const key = () => {
  const k = process.env.AUDIT_SIGNING_KEY;
  if (!k) throw new Error('AUDIT_SIGNING_KEY must match the server under test');
  return k;
};
const receiptFor = (text: string, stage = 'statements') =>
  issueModelReceipt({ uid, text, provider: 'google-gemini', modelId: 'gemini-test', byok: false, stage }, key());
const answer = (first: string, second: string, secondAnchor = 'L4-6') =>
  JSON.stringify({ sentences: [{ id: 'S1', text: first, anchor: 'L4' }, { id: 'S2', text: second, anchor: secondAnchor }] });

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
      firstName: 'Plain', lastName: 'Wording', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 50, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT_ID, { name: 'Plain wording', userId: uid, createdAt: new Date(), status: 'analyzed', legacyCode: SOURCE });
});

test('a verified answer is guarded and stored: a changed anchor is dropped and counted, the rest read back', async ({ request }) => {
  const text = answer('Only amounts up to 500,000 go on; any higher amount stops here.', 'If it holds, the program stops with an error message.', 'L5');
  const res = await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: DIGEST, items: ITEMS, text, receipt: receiptFor(text) } });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: PlainWordingRecord };
  expect(Object.keys(record.wording)).toEqual([ITEMS[0].key]);
  expect(record.discarded.byReason).toEqual({ 'anchor-changed': 1 });
  expect(record.origin).toMatchObject({ source: 'model', receipt: 'verified' });
  const read = await request.get(`${path_}?scope=rules`, { headers: headers() });
  expect(read.status()).toBe(200);
  expect(((await read.json()) as { record: PlainWordingRecord }).record.wording[ITEMS[0].key]).toMatch(/^Only amounts up to 500,000/);
});

test('a second write replaces the first', async ({ request }) => {
  const text = answer('Only amounts up to 500,000 continue; anything higher stops here.', 'If it holds, the run stops with an error message.');
  const res = await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: DIGEST, items: ITEMS, text, receipt: receiptFor(text) } });
  expect(res.status(), await res.text()).toBe(200);
  const read = (await (await request.get(`${path_}?scope=rules`, { headers: headers() })).json()) as { record: PlainWordingRecord };
  expect(Object.keys(read.record.wording).sort()).toEqual(ITEMS.map((i) => i.key).sort());
});

test('no receipt, or one from another stage: nothing is stored', async ({ request }) => {
  const text = answer('x', 'y');
  expect((await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: DIGEST, items: ITEMS, text, receipt: null } })).status()).toBe(422);
  expect((await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: DIGEST, items: ITEMS, text, receipt: receiptFor(text, 'design') } })).status()).toBe(422);
});

test('sentences that are not the digest\'s, or a digest of another source, are refused', async ({ request }) => {
  const text = answer('x', 'y');
  const forged = [{ ...ITEMS[0], text: `${ITEMS[0].text} Forged.` }, ITEMS[1]];
  expect((await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: DIGEST, items: forged, text, receipt: receiptFor(text) } })).status()).toBe(400);
  expect((await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: DIGEST, items: ITEMS.slice(0, 1), text, receipt: receiptFor(text) } })).status()).toBe(400);
  const other = plainDigestOf('rules', `${SOURCE}\n* changed`, ITEMS);
  expect((await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: other, items: ITEMS, text, receipt: receiptFor(text) } })).status()).toBe(409);
});

test('after the source moved, an answer for the old one is refused', async ({ request }) => {
  await adminMergeDoc('projects', PROJECT_ID, { legacyCode: `${SOURCE}\n* edited` });
  const text = answer('Only amounts up to 500,000 go on; any higher amount stops here.', 'If it holds, the program stops with an error message.');
  expect((await request.post(path_, { headers: headers(), data: { scope: 'rules', digest: DIGEST, items: ITEMS, text, receipt: receiptFor(text) } })).status()).toBe(409);
  await adminMergeDoc('projects', PROJECT_ID, { legacyCode: SOURCE });
});

test('the first insights are a scope of their own (owner report 21.10.2026); an unknown scope is refused', async ({ request }) => {
  const read = await request.get(`${path_}?scope=firstlook`, { headers: headers() });
  expect(read.status(), await read.text()).toBe(200);
  expect(((await read.json()) as { record: PlainWordingRecord | null }).record).toBeNull();
  expect((await request.get(`${path_}?scope=overview`, { headers: headers() })).status()).toBe(400);
});

test('a stranger neither reads nor writes', async ({ request }) => {
  expect((await request.get(`${path_}?scope=rules`, { headers: headers(otherToken) })).status()).toBe(404);
  const text = answer('x', 'y');
  expect((await request.post(path_, { headers: headers(otherToken), data: { scope: 'rules', digest: DIGEST, items: ITEMS, text, receipt: null } })).status()).toBe(404);
  expect((await request.get(`${path_}?scope=rules`)).status()).toBe(401);
});

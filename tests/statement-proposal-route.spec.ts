import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { issueModelReceipt, verifyModelReceipt } from '../lib/model-receipt';
import { GEMINI_TEST_STUB_HEADER, GEMINI_TEST_STUB_TEXT } from '../lib/gemini-test-stub';
import { STAGE_DISABLED_CODE } from '../lib/model-stages';
import { namingContextOf } from '../lib/process-naming';
import {
  STATEMENT_SOURCE_NAME,
  applyStatementProposal,
  statementProposalContextOf,
  type StatementProposalRecord,
} from '../lib/statement-proposal';

/**
 * Roadmap 17.10 — the route that stores the model's business sentences,
 * against the emulators and the real route. Built on
 * `tests/process-naming-route.spec.ts`, because the route is built on the
 * naming route.
 *
 * The model is not called. Answers are written here, receipts minted with the
 * `AUDIT_SIGNING_KEY` the server under test holds: what is under test is what
 * the route does with an answer.
 *
 *   1. an answer with a verified receipt is validated against the source the
 *      **server** reads, stored and read back — nonsense dropped and counted;
 *   2. without a receipt that verifies for this text and this account, nothing
 *      is stored;
 *   3. an answer for another reading of the source is refused with 409;
 *   4. the owner writes, an invited reader only reads, a stranger neither, and
 *      no browser reads the document straight out of Firestore;
 *   5. nothing lands on the project, its run or its signature;
 *   6. the `statements` stage is switched on its own, and the proxy refuses it.
 */

const STAMP = Date.now();
const EMAIL = `statement-proposal-${STAMP}@cleancore-test.io`;
const READER_EMAIL = `statement-proposal-reader-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `statement-proposal-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `statement-proposal-${STAMP}`;

const PROGRAM = [
  'REPORT z_sperre_setzen.',                                // 1
  'START-OF-SELECTION.',                                    // 2
  '  SELECT SINGLE sperr FROM lfa1 INTO gv_sperr',          // 3
  '    WHERE lifnr = p_lifnr.',                             // 4
  "  IF gv_sperr = 'X'.",                                   // 5
  '    MESSAGE e002(zkr) INTO gv_dummy.',                   // 6
  '    RETURN.',                                            // 7
  '  ENDIF.',                                               // 8
  "  UPDATE lfa1 SET sperr = 'X' WHERE lifnr = p_lifnr.",   // 9
].join('\n');

const CONTEXT = statementProposalContextOf(PROGRAM);

/** Two sentences that fit, and three the validation must drop: a blank-line anchor, a file that is not there, a key outside the format. */
const ANSWER = JSON.stringify({
  statements: [
    { text: 'Das Sperrkennzeichen des Lieferanten wird gelesen.', anchors: [`${STATEMENT_SOURCE_NAME}:3`], element: null, uncertainty: null },
    { text: 'Ist der Lieferant schon gesperrt, wird die Fehlermeldung E002 angezeigt.', anchors: [`${STATEMENT_SOURCE_NAME}:5`], element: null, uncertainty: null },
    { text: 'Der Einkauf wird benachrichtigt.', anchors: [`${STATEMENT_SOURCE_NAME}:42`], element: null, uncertainty: null },
    { text: 'Die Sperre wird protokolliert.', anchors: ['audit.abap:9'], element: null, uncertainty: null },
    { text: 'Der Lieferant wird gesperrt.', anchors: [`${STATEMENT_SOURCE_NAME}:9`], element: null, uncertainty: null, confidence: 0.9 },
  ],
});

let uid = '';
let readerUid = '';
let otherUid = '';
let idToken = '';
let readerToken = '';
let otherToken = '';
const headers = (token = idToken) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const path = `/api/projects/${PROJECT_ID}/statement-proposal`;
const signingKey = () => {
  const key = process.env.AUDIT_SIGNING_KEY;
  if (!key) throw new Error('AUDIT_SIGNING_KEY must match the server under test');
  return key;
};

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
connectFirestoreToEmulator(clientDb);

test.describe.configure({ mode: 'serial' });

async function stored(request: APIRequestContext, token = idToken): Promise<StatementProposalRecord | null> {
  const res = await request.get(path, { headers: headers(token) });
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
  const reader = await createUserWithEmailAndPassword(auth, READER_EMAIL, SIGN_IN);
  readerUid = reader.user.uid;
  readerToken = await reader.user.getIdToken();
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();

  for (const [id, email] of [[uid, EMAIL], [readerUid, READER_EMAIL], [otherUid, OTHER_EMAIL]]) {
    await adminSetDoc('users', id, {
      firstName: 'Statement', lastName: 'Proposal', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Vendor block', userId: uid, createdAt: new Date(),
    status: 'analyzed', legacyCode: PROGRAM, s4Deployment: 'private',
    readers: [readerUid],
  });
});

test('the server under test has the route', async ({ request }) => {
  const res = await request.get(path, { headers: headers() });
  expect(res.status(), 'no statement-proposal route — wrong server or stale build').toBe(200);
  expect((await res.json()).record, 'a project nobody asked about has no proposal').toBeNull();
});

test('an answer with a verified receipt is validated against the stored source, stored and read back', async ({ request }) => {
  const receipt = issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey());
  const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: ANSWER, receipt } });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: StatementProposalRecord };

  expect(record.digest).toBe(CONTEXT.digest);
  expect(record.statements.map((s) => [s.text, s.anchors[0].lineStart, s.provenance])).toEqual([
    ['Das Sperrkennzeichen des Lieferanten wird gelesen.', 3, 'proposed'],
    ['Ist der Lieferant schon gesperrt, wird die Fehlermeldung E002 angezeigt.', 5, 'proposed'],
  ]);
  expect(record.discarded).toEqual({ total: 3, byRule: { 'line-out-of-range': 1, 'unknown-file': 1, 'unexpected-field': 1 } });
  expect(record.origin).toEqual({
    source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-3.8-flash',
    byok: false, issuedAt: receipt.iat, textSha256: receipt.textSha256,
  });
  // Nothing of the dropped sentences, and no copy of the answer.
  expect(JSON.stringify(record)).not.toContain('benachrichtigt');
  expect(JSON.stringify(record)).not.toContain('confidence');

  expect(await stored(request), 'what GET returns is not what POST stored').toEqual(record);

  // Applied to the same source, the MESSAGE … INTO sentence is marked.
  const view = applyStatementProposal(PROGRAM, record);
  expect(view.statements.find((s) => s.anchors[0].lineStart === 5)?.contradiction?.rule).toBe('message-into');
});

test('an answer that is not the format stores a proposal with nothing in it, counted', async ({ request }) => {
  const text = 'Here are the statements: ```json {"statements":[]}```';
  const receipt = issueModelReceipt({ uid, text, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey());
  const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text, receipt } });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: StatementProposalRecord };
  expect(record.statements).toEqual([]);
  expect(record.discarded).toEqual({ total: 1, byRule: { 'malformed-json': 1 } });
  expect(applyStatementProposal(PROGRAM, record).notice).toContain('No usable sentence');

  // Put the good one back for the tests below.
  const good = issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey());
  expect((await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: ANSWER, receipt: good } })).status()).toBe(200);
});

test('without a receipt that verifies for this text and this account, nothing is stored', async ({ request }) => {
  const before = await stored(request);
  expect(before).not.toBeNull();
  const other = JSON.stringify({ statements: [{ text: 'Der Lieferant wird gelöscht.', anchors: [`${STATEMENT_SOURCE_NAME}:9`], element: null, uncertainty: null }] });

  const cases: Array<[string, unknown]> = [
    ['absent', undefined],
    ['text-mismatch', issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey())],
    ['wrong-account', issueModelReceipt({ uid: otherUid, text: other, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey())],
    ['forged', issueModelReceipt({ uid, text: other, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, 'not-the-signing-key')],
  ];
  for (const [refusal, receipt] of cases) {
    const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: other, receipt } });
    expect(res.status(), `${refusal}: ${await res.text()}`).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'receipt-refused', refusal });
  }
  expect(await stored(request), 'a refused answer replaced the stored proposal').toEqual(before);
});

test('33a42c475f1a: a valid receipt from another stage is refused while the statements stage is off', async ({ request }) => {
  // QA review of 8f9ea35a000e: the store must not be a way around the switch.
  const before = await stored(request);
  const off = await request.post('/api/model-stages', { headers: headers(), data: { stages: { statements: false } } });
  expect(off.status(), await off.text()).toBe(200);
  try {
    const other = JSON.stringify({ statements: [{ text: 'Der Lieferant wird geprüft.', anchors: [`${STATEMENT_SOURCE_NAME}:3`], element: null, uncertainty: null }] });
    for (const stage of ['naming', 'documentation', undefined]) {
      const receipt = issueModelReceipt({ uid, text: other, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, ...(stage ? { stage } : {}) }, signingKey());
      const res = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: other, receipt } });
      expect(res.status(), `${stage ?? 'no stage'}: ${await res.text()}`).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'receipt-refused', refusal: 'wrong-stage' });
    }
    expect(await stored(request), 'a receipt of another stage replaced the proposal').toEqual(before);
  } finally {
    await request.post('/api/model-stages', { headers: headers(), data: { stages: { statements: true } } });
  }
});

test('an answer for another reading of the source is refused with 409', async ({ request }) => {
  const before = await stored(request);
  const elsewhere = statementProposalContextOf(`${PROGRAM}\n  COMMIT WORK.`);
  expect(elsewhere.digest).not.toBe(CONTEXT.digest);
  const receipt = issueModelReceipt({ uid, text: ANSWER, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey());
  const res = await request.post(path, { headers: headers(), data: { digest: elsewhere.digest, text: ANSWER, receipt } });
  expect(res.status(), await res.text()).toBe(409);
  expect((await res.json()).code).toBe('source-moved');
  expect(await stored(request)).toEqual(before);
});

test('the owner writes, the invited reader only reads, a stranger neither — and no browser reads Firestore directly', async ({ request }) => {
  const owners = await stored(request);
  expect(await stored(request, readerToken), 'the invited reader does not see what the owner asked for').toEqual(owners);

  const text = JSON.stringify({ statements: [{ text: 'Ein Leser schreibt mit.', anchors: [`${STATEMENT_SOURCE_NAME}:3`], element: null, uncertainty: null }] });
  const asReader = await request.post(path, {
    headers: headers(readerToken),
    data: { digest: CONTEXT.digest, text, receipt: issueModelReceipt({ uid: readerUid, text, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey()) },
  });
  expect(asReader.status(), 'the reader was allowed to write').toBe(404);

  const read = await request.get(path, { headers: headers(otherToken) });
  expect(read.status()).toBe(404);
  expect(JSON.stringify(await read.json())).not.toContain('Sperrkennzeichen');
  const write = await request.post(path, {
    headers: headers(otherToken),
    data: { digest: CONTEXT.digest, text, receipt: issueModelReceipt({ uid: otherUid, text, provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, signingKey()) },
  });
  expect(write.status()).toBe(404);
  expect(await stored(request)).toEqual(owners);

  const auth = getAuth(app);
  expect(auth.currentUser?.uid, 'the client SDK is not signed in as the owner').toBe(uid);
  await expect(getDoc(doc(clientDb, 'projects', PROJECT_ID, 'statement_proposal', 'current')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect((await getDoc(doc(clientDb, 'projects', PROJECT_ID))).exists()).toBe(true);
});

test('nothing lands on the project, its run or its signature', async () => {
  const project = (await adminGetDoc('projects', PROJECT_ID)) as Record<string, unknown> | null;
  expect(project).not.toBeNull();
  const serialised = JSON.stringify(project);
  expect(serialised).not.toContain('Sperrkennzeichen');
  expect(Object.keys(project ?? {}).filter((k) => /statement|proposal|signature|auditMetadata|activeRunId/i.test(k))).toEqual([]);
});

test('the statements stage is switched on its own, and the proxy is what refuses it', async ({ request }) => {
  const off = await request.post('/api/model-stages', { headers: headers(), data: { stages: { statements: false } } });
  expect(off.status(), await off.text()).toBe(200);
  const offBody = await off.json();
  expect(offBody.stages.statements).toBe(false);
  expect(offBody.stages.naming, 'switching the sentences off switched the names off').toBe(true);
  expect(offBody.stages.analyze).toBe(true);

  const refused = await request.post('/api/gemini', {
    headers: headers(),
    data: { prompt: 'Describe these statements.', stage: 'statements', jsonResponse: true },
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).code).toBe(STAGE_DISABLED_CODE);

  const on = await request.post('/api/model-stages', { headers: headers(), data: { stages: { statements: true } } });
  expect((await on.json()).stages.statements).toBe(true);
});

test('080cd5fce607: the proxy signs the stage it was called under — at the route, with the provider stubbed', async ({ request }) => {
  // QA review of 75b573cd22f0: until now only the source said so. The stub
  // replaces the provider call and nothing else (`lib/gemini-test-stub.ts`),
  // so the request passes every gate of `/api/gemini` and the receipt is minted
  // as for a real answer.
  const stubHeaders = { ...headers(), [GEMINI_TEST_STUB_HEADER]: process.env.PILOT_APPROVAL_SECRET ?? '' };
  const res = await request.post('/api/gemini', {
    headers: stubHeaders,
    data: { prompt: 'Describe these statements.', stage: 'statements', jsonResponse: true },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { text: string; receipt: Record<string, unknown> };
  expect(body.text).toBe(GEMINI_TEST_STUB_TEXT);
  expect(body.receipt.stage).toBe('statements');

  const key = signingKey();
  expect(verifyModelReceipt(body.receipt, { uid, text: body.text, key, stage: 'statements' }).ok).toBe(true);
  expect(verifyModelReceipt(body.receipt, { uid, text: body.text, key, stage: 'naming' })).toEqual({ ok: false, refusal: 'wrong-stage' });

  // And the store takes it: the real chain, proxy receipt into the statements route.
  const stored = await request.post(path, { headers: headers(), data: { digest: CONTEXT.digest, text: body.text, receipt: body.receipt } });
  expect(stored.status(), await stored.text()).toBe(200);
  // …while the naming store refuses the same receipt.
  const naming = await request.post(`/api/projects/${PROJECT_ID}/process-naming`, {
    headers: headers(),
    data: { digest: namingContextOf(PROGRAM).digest, text: body.text, receipt: body.receipt },
  });
  expect(naming.status(), await naming.text()).toBe(422);
  expect(await naming.json()).toMatchObject({ code: 'receipt-refused', refusal: 'wrong-stage' });

  // The stub sits behind the stage switch, not in front of it.
  await request.post('/api/model-stages', { headers: headers(), data: { stages: { statements: false } } });
  try {
    const off = await request.post('/api/gemini', {
      headers: stubHeaders,
      data: { prompt: 'Describe these statements.', stage: 'statements', jsonResponse: true },
    });
    expect(off.status()).toBe(403);
    expect((await off.json()).code).toBe(STAGE_DISABLED_CODE);
  } finally {
    await request.post('/api/model-stages', { headers: headers(), data: { stages: { statements: true } } });
  }

  // A wrong token changes nothing. Until 10.10.2026 it sent this request the
  // ordinary way — to the real model, in CI. The test server now stubs by
  // default (roadmap "before 3.0.7 — Tests never spend the production model
  // budget"), so a wrong token stays on the stub, and the only way off it is a
  // listed opt-in (tests/gemini-real-model-guard.spec.ts). That the token
  // alone never switches the stub on where there is no default is held without
  // a server, in tests/gemini-test-stub-guard.spec.ts.
  const wrong = await request.post('/api/gemini', {
    headers: { ...headers(), [GEMINI_TEST_STUB_HEADER]: 'not-the-secret' },
    data: { prompt: 'Describe these statements.', stage: 'statements', jsonResponse: true },
  });
  expect(wrong.status(), await wrong.text()).toBe(200);
  expect((await wrong.json()).text).toBe(GEMINI_TEST_STUB_TEXT);
});

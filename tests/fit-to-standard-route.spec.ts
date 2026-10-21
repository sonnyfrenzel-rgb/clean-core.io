import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminDocExists, adminGetDoc, adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { FIT_TO_STANDARD_COLLECTION } from '../lib/fit-to-standard-store';
import { readExample } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.20, F3 — the fit-to-standard route against the emulators
 * (QA review of 4ea0324a13cb, c79f2c9f35fb: the source guards alone would pass
 * a route that answered success and stored nothing).
 *
 *   1. making the design stores revision 1 and the project's summary;
 *   2. a confirmation read at an older revision is refused with 409 and writes
 *      nothing — no revision, no change to the summary;
 *   3. a valid confirmation stores the next revision with the server's account
 *      and time, and the summary says confirmed;
 *   4. once the source moved off the signed run, a confirmation is 409 and
 *      writes nothing;
 *   5. another account is told the project does not exist.
 *
 * Needs the emulators and the dev server (it is a route test).
 */

const STAMP = Date.now();
const EMAIL = `fit-route-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `fit-route-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `fit-route-${STAMP}`;
const RUN_ID = `run-${STAMP}`;
const FILE = 'Z_SD_DELIVERY_PRIORITY.abap';
const SOURCE = readExample(FILE);
const SHA = sha256Hex(SOURCE);
const path = `/api/projects/${PROJECT_ID}/fit-to-standard`;

let uid = '';
let idToken = '';
let otherToken = '';
const headers = (token = idToken) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const other = await createUserWithEmailAndPassword(auth, OTHER_EMAIL, SIGN_IN);
  otherToken = await other.user.getIdToken();
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  for (const [id, email] of [[uid, EMAIL], [other.user.uid, OTHER_EMAIL]]) {
    await adminSetDoc('users', id, {
      firstName: 'Mara', lastName: 'Weber', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Delivery priority', userId: uid, createdAt: new Date(), status: 'analyzed',
    legacyCode: SOURCE, s4Deployment: 'public', activeRunId: RUN_ID, analyzerVersion: 'v3.0.19',
    inputFingerprint: { sha256: SHA, fileName: FILE },
  });
});

test('making the design stores revision 1 and the summary', async ({ request }) => {
  const read = await request.get(path, { headers: headers() });
  expect(read.status(), await read.text()).toBe(200);
  expect((await read.json()).gate.outcome).toBe('offered');
  const made = await request.post(path, { headers: headers(), data: { action: 'make' } });
  expect(made.status(), await made.text()).toBe(201);
  expect(await adminDocExists(`projects/${PROJECT_ID}/${FIT_TO_STANDARD_COLLECTION}`, '1')).toBe(true);
  const project = await adminGetDoc('projects', PROJECT_ID);
  expect(project?.fitToStandard).toMatchObject({ revision: 1, confirmed: false, runId: RUN_ID, sourceSha256: SHA });
});

test('a confirmation read at an older revision is 409 and writes nothing', async ({ request }) => {
  const res = await request.post(path, { headers: headers(), data: { action: 'confirm', baseRevision: 0, choices: [] } });
  expect(res.status(), await res.text()).toBe(409);
  expect(await adminDocExists(`projects/${PROJECT_ID}/${FIT_TO_STANDARD_COLLECTION}`, '2')).toBe(false);
  expect((await adminGetDoc('projects', PROJECT_ID))?.fitToStandard).toMatchObject({ revision: 1, confirmed: false });
});

test('a valid confirmation stores the next revision with the server\'s account and time, and the summary says confirmed', async ({ request }) => {
  const before = Date.now();
  const res = await request.post(path, {
    headers: headers(),
    data: { action: 'confirm', baseRevision: 1, choices: [], createdAt: '1999-01-01T00:00:00.000Z', createdBy: { uid: 'someone-else', name: 'x' } },
  });
  expect(res.status(), await res.text()).toBe(201);
  const stored = await adminGetDoc(`projects/${PROJECT_ID}/${FIT_TO_STANDARD_COLLECTION}`, '2');
  expect(stored).toMatchObject({ revision: 2, kind: 'confirmation', runId: RUN_ID });
  expect(stored?.createdBy.uid).toBe(uid);
  expect(Date.parse(stored?.createdAt)).toBeGreaterThanOrEqual(before - 5_000);
  expect((await adminGetDoc('projects', PROJECT_ID))?.fitToStandard).toMatchObject({ revision: 2, confirmed: true });
});

test('once the source moved off the signed run, a confirmation is 409 and writes nothing', async ({ request }) => {
  await adminMergeDoc('projects', PROJECT_ID, { legacyCode: `${SOURCE}\n* edited` });
  const res = await request.post(path, { headers: headers(), data: { action: 'confirm', baseRevision: 2, choices: [] } });
  expect(res.status(), await res.text()).toBe(409);
  expect((await res.json()).code).toBe('run-not-current');
  expect(await adminDocExists(`projects/${PROJECT_ID}/${FIT_TO_STANDARD_COLLECTION}`, '3')).toBe(false);
});

test('another account is told the project does not exist', async ({ request }) => {
  const res = await request.post(path, { headers: headers(otherToken), data: { action: 'make' } });
  expect(res.status()).toBe(404);
});

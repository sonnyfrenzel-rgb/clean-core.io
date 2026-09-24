import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc, adminSetEmailVerified } from './helpers/admin-seed';

/**
 * The Admin-SDK half of roadmap 3.0.12 (QA full review of a12774cd2b7f,
 * finding b9e4726a0beb).
 *
 * `accountActive()` in firestore.rules refuses a suspended, deleted or
 * disabled account at once, with the ID token it still holds
 * (tests/firestore-rules-suspended.spec.ts). The routes under
 * `app/api/projects/[projectId]` answer from the Admin SDK, which the rules do
 * not see: before this, they authorised from membership alone and kept handing
 * a suspended owner or reader the project, its run and everything derived from
 * its source for as long as the token lived.
 *
 * Each account here keeps the token it was minted before the status changed —
 * exactly the window the finding describes. And a reader who is merely
 * *pending* still reads, because the rules do not refuse that either (CR-13).
 */

const STAMP = Date.now();
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `suspended-reads-${STAMP}`;
const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

const READS = ['', '/process-map', '/process-naming', '/process-revisions', '/process-states', '/findings', '/contract', '/decision'];

type Account = { uid: string; token: string };
let owner: Account;
let reader: Account;
let pendingReader: Account;

async function makeAccount(name: string, status: string): Promise<Account> {
  const email = `suspended-reads-${name}-${STAMP}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(getAuth(app), email, SIGN_IN);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Suspended',
    lastName: name,
    email,
    tier: 'pilot',
    status,
    activatedAt: new Date(),
    transformationsUsed: 0,
    transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION,
    mfaEnabled: false,
    createdAt: new Date(),
  });
  await adminSetEmailVerified(cred.user.uid, true);
  return { uid: cred.user.uid, token: await cred.user.getIdToken(true) };
}

const auth = (a: Account) => ({ Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  try {
    connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
  owner = await makeAccount('owner', 'approved');
  reader = await makeAccount('reader', 'approved');
  pendingReader = await makeAccount('pending', 'pending');
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Suspension spec',
    userId: owner.uid,
    readers: [reader.uid, pendingReader.uid],
    createdAt: new Date(),
    status: 'analyzed',
    legacyCode: "REPORT z_suspended_spec.\nWRITE / 'x'.",
  });
});

test('1 · while active, owner and readers are let through on every read', async ({ request }) => {
  test.setTimeout(180 * 1000);
  for (const who of [owner, reader, pendingReader]) {
    for (const suffix of READS) {
      const res = await request.get(`/api/projects/${PROJECT_ID}${suffix}`, { headers: auth(who) });
      expect([403, 404], `GET ${suffix || '/'} refused an active member (${res.status()})`).not.toContain(res.status());
    }
  }
});

test('2 · suspended, with the same token, owner and reader read nothing', async ({ request }) => {
  test.setTimeout(180 * 1000);
  await adminMergeDoc('users', owner.uid, { status: 'suspended' });
  await adminMergeDoc('users', reader.uid, { disabled: true });
  for (const who of [owner, reader]) {
    for (const suffix of READS) {
      const res = await request.get(`/api/projects/${PROJECT_ID}${suffix}`, { headers: auth(who) });
      expect(res.status(), `GET ${suffix || '/'} answered a suspended account`).toBe(403);
    }
  }
  // The contract's write shares the gate: a suspended owner records nothing.
  const post = await request.post(`/api/projects/${PROJECT_ID}/contract`, { headers: auth(owner), data: {} });
  expect(post.status()).toBe(403);
});

test('3 · a pending reader still reads — the rules do not refuse that either', async ({ request }) => {
  const res = await request.get(`/api/projects/${PROJECT_ID}`, { headers: auth(pendingReader) });
  expect(res.status()).toBe(200);
});

test('4 · reinstated, the owner reads again', async ({ request }) => {
  await adminMergeDoc('users', owner.uid, { status: 'approved' });
  const res = await request.get(`/api/projects/${PROJECT_ID}`, { headers: auth(owner) });
  expect(res.status()).toBe(200);
});

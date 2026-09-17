import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  connectAuthEmulator,
} from 'firebase/auth';
import { initializeFirestore, doc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';

/**
 * Roadmap 5.4 and 5.5, the server half.
 *
 * `firestore.rules` opens the project *document* to an invited reader; the
 * analysis narrative lives only in `projects/{id}/runs/{runId}`, which stays
 * owner-only, so the reader gets it from `GET /api/projects/{projectId}`. That
 * route reads the same `readers` list on the same document the rule reads, and
 * this file is what holds the two to each other: one revocation, both doors.
 *
 * `GET|DELETE /api/projects/{projectId}/readers` is the owner's overview and
 * the revocation itself. Neither answers a reader — the invitations carry other
 * people's addresses, and an account that can read a project has no business
 * with the list of who else was asked.
 */

const firebaseApp = initializeApp(firebaseConfig, 'access-routes');
const db = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);

const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, EMU_HOST, Number(EMU_PORT));
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

const PASSWORD = 'SecurityPassword123!';
const stamp = Date.now();
const OWNER = `access-owner-${stamp}@cleancore-test.io`;
const READER = `access-reader-${stamp}@cleancore-test.io`;
const STRANGER = `access-stranger-${stamp}@cleancore-test.io`;
const PROJECT = `access-project-${stamp}`;
const RUN_ID = `access-run-${stamp}`;
const INVITE = `access-invite-${stamp}`;

const uids: Record<string, string> = {};
const tokens: Record<string, string> = {};

async function account(key: string, email: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uids[key] = cred.user.uid;
  await adminSetDoc('users', cred.user.uid, {
    firstName: key, lastName: 'User', email, tier: 'pilot', status: 'approved',
  });
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  tokens[key] = await auth.currentUser!.getIdToken(true);
}

const as = (key: string) => ({ headers: { Authorization: `Bearer ${tokens[key]}` } });
const url = (suffix = '') => `/api/projects/${PROJECT}${suffix}`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await account('owner', OWNER);
  await account('reader', READER);
  await account('stranger', STRANGER);

  await adminSetDoc('projects', PROJECT, {
    name: 'Shared Case',
    userId: uids.owner,
    createdAt: new Date(),
    status: 'analyzed',
    legacyCode: 'REPORT z_access.',
    activeRunId: RUN_ID,
    readers: [uids.reader],
  });
  await adminSetDoc(`projects/${PROJECT}/runs`, RUN_ID, {
    runId: RUN_ID, projectId: PROJECT, userId: uids.owner,
    createdAt: new Date().toISOString(), status: 'completed',
    cleanCoreScore: 64, analysis: 'The narrative lives only in the run.',
  });
  await adminSetDoc(`projects/${PROJECT}/invitations`, INVITE, {
    projectId: PROJECT,
    email: READER,
    invitedBy: { uid: uids.owner, name: 'Owner User' },
    invitedAt: '2026-09-15T08:00:00.000Z',
    expiresAt: '2026-09-29T08:00:00.000Z',
    status: 'accepted',
    acceptedBy: { uid: uids.reader, email: READER },
    acceptedAt: '2026-09-16T11:22:33.000Z',
    revokedAt: null,
  });
});

test('the reader gets the run from the server; a stranger gets nothing, and not a hint either', async ({ request }: { request: APIRequestContext }) => {
  const mine = await request.get(url(), as('owner'));
  expect(mine.status()).toBe(200);
  expect((await mine.json()).role).toBe('owner');

  const theirs = await request.get(url(), as('reader'));
  expect(theirs.status(), 'an invited reader is answered').toBe(200);
  const body = await theirs.json();
  expect(body.role, 'and told what they are').toBe('reader');
  expect(body.run.analysis, 'the narrative that lives only in the run').toContain('lives only in the run');

  const nobody = await request.get(url(), as('stranger'));
  expect(nobody.status(), 'not 403 — a 403 that only happens for real ids is a way to enumerate them').toBe(404);

  const anonymous = await request.get(url());
  expect(anonymous.status()).toBe(401);
});

test('the owner sees who has Einsicht and since when; the reader sees no such list', async ({ request }: { request: APIRequestContext }) => {
  const list = await request.get(url('/readers'), as('owner'));
  expect(list.status()).toBe(200);
  const { entries } = await list.json();
  expect(entries).toHaveLength(1);
  expect(entries[0].email).toBe(READER);
  expect(entries[0].since, 'the date comes off the server\'s record of the acceptance').toBe('2026-09-16T11:22:33.000Z');
  expect(entries[0].uid).toBe(uids.reader);

  // The invitations carry other people's addresses. A reader is not shown them.
  expect((await request.get(url('/readers'), as('reader'))).status()).toBe(404);
  expect((await request.get(url('/readers'), as('stranger'))).status()).toBe(404);
});

test('only the owner revokes', async ({ request }: { request: APIRequestContext }) => {
  expect((await request.delete(url('/readers'), { ...as('reader'), data: { uid: uids.reader } })).status()).toBe(404);
  expect((await request.delete(url('/readers'), { ...as('stranger'), data: { uid: uids.reader } })).status()).toBe(404);
  // …and the reader is still in, so the refusals above were about the caller.
  expect((await request.get(url(), as('reader'))).status()).toBe(200);
});

test('the revocation closes the rule and the route in the same instant', async ({ request }: { request: APIRequestContext }) => {
  const gone = await request.delete(url('/readers'), { ...as('owner'), data: { uid: uids.reader } });
  expect(gone.status()).toBe(200);
  expect((await gone.json()).invitationsRevoked, 'the invitation is marked, not only the list').toBe(1);

  // The route, which re-reads the list on every request…
  expect((await request.get(url(), as('reader'))).status()).toBe(404);

  // …and the rules, with the same token that worked a moment ago.
  await signInWithEmailAndPassword(auth, READER, PASSWORD);
  let denied = false;
  try {
    await getDoc(doc(db, 'projects', PROJECT));
  } catch {
    denied = true;
  }
  expect(denied, 'after the revocation the read fails at the rules, not just on screen').toBe(true);

  // The overview agrees, and the owner still has their project.
  const list = await request.get(url('/readers'), as('owner'));
  expect((await list.json()).entries).toEqual([]);
  expect((await request.get(url(), as('owner'))).status()).toBe(200);
});

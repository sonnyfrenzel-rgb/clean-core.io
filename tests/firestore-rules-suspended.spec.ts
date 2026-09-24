import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * Roadmap 3.0.12 — a suspended account loses its data at the rules, at once
 * (QA findings 2a9864f3b52e, f71a57e2d326).
 *
 * `adminRevokeUser` revokes the refresh tokens and disables the sign-in, but an
 * ID token already in the browser stays valid for up to an hour. The Auth
 * emulator is exactly that situation here: the account's status is flipped to
 * `suspended` by the Admin SDK and the session is *not* renewed — the same
 * token asks again, and the rules must answer differently.
 *
 * Every assertion is a real client SDK call against the emulator, and every
 * refusal is paired with the same call succeeding while the account is active,
 * so none of them can pass because the call fails anyway.
 */

const firebaseApp = initializeApp(firebaseConfig, 'rules-suspended');
const db = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);

const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

// Fail closed: throws unless the run targets the emulators.
connectFirestoreToEmulator(db);
connectAuthToEmulator(auth);

/** Make the emulator serve this working copy's rules (see firestore-rules-readers.spec.ts). */
async function loadWorkingCopyRules() {
  const content = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  const body = JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } });
  for (const database of ['(default)', firebaseConfig.firestoreDatabaseId]) {
    const res = await fetch(
      `http://${EMU_HOST}:${EMU_PORT}/emulator/v1/projects/${firebaseConfig.projectId}/databases/${database}:securityRules`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (!res.ok) throw new Error(`The emulator refused the ruleset for ${database} (${res.status}): ${await res.text()}`);
  }
}

const PASSWORD = 'SecurityPassword123!';
const stamp = Date.now();
const OWNER = `suspended-owner-${stamp}@cleancore-test.io`;
const READER = `suspended-reader-${stamp}@cleancore-test.io`;
const OTHER = `suspended-other-${stamp}@cleancore-test.io`;

const PROJECT = `suspended-project-${stamp}`;
const OTHER_PROJECT = `suspended-other-project-${stamp}`;
const RUN_ID = `suspended-run-${stamp}`;

const uids: Record<string, string> = {};

async function denied(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return false;
  } catch {
    return true;
  }
}

/** Sign in once; later tests re-use the session, which is the point — no new token. */
async function signIn(email: string) {
  if (auth.currentUser?.email === email) return;
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await loadWorkingCopyRules();
  for (const [key, email] of [['owner', OWNER], ['reader', READER], ['other', OTHER]] as const) {
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    uids[key] = cred.user.uid;
    await adminSetDoc('users', cred.user.uid, {
      firstName: key, lastName: 'User', email, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT, {
    name: 'Suspension Project', userId: uids.owner, createdAt: new Date(), status: 'created',
    legacyCode: 'REPORT z_suspended.', readers: [uids.reader],
  });
  await adminSetDoc(`projects/${PROJECT}/runs`, RUN_ID, {
    runId: RUN_ID, projectId: PROJECT, userId: uids.owner,
    createdAt: new Date().toISOString(), status: 'completed',
  });
  await adminSetDoc('projects', OTHER_PROJECT, {
    name: 'Other Project', userId: uids.other, createdAt: new Date(), status: 'created',
    legacyCode: 'REPORT z_other.',
  });
});

test('1 · while the account is active, the owner reads and writes project, run and profile', async () => {
  await signIn(OWNER);
  expect((await getDoc(doc(db, 'projects', PROJECT))).exists(), 'project read').toBe(true);
  expect((await getDoc(doc(db, 'projects', PROJECT, 'runs', RUN_ID))).exists(), 'run read').toBe(true);
  expect((await getDoc(doc(db, 'users', uids.owner))).exists(), 'profile read').toBe(true);
  expect(
    (await getDocs(query(collection(db, 'projects'), where('userId', '==', uids.owner)))).size,
    'project list',
  ).toBe(1);
  expect(await denied(() => updateDoc(doc(db, 'projects', PROJECT), { solutionDesign: 'draft' })), 'project write').toBe(false);
  expect(await denied(() => updateDoc(doc(db, 'users', uids.owner), { firstName: 'Active' })), 'profile write').toBe(false);
  expect(
    await denied(() => setDoc(doc(db, 'projects', `suspended-create-a-${stamp}`), {
      name: 'New', status: 'uploaded', userId: uids.owner, createdAt: new Date(),
    })),
    'project create',
  ).toBe(false);
});

test('2 · an invited reader who is active reads the project', async () => {
  await signIn(READER);
  expect((await getDoc(doc(db, 'projects', PROJECT))).exists()).toBe(true);
});

test('3 · suspended, with the same still-valid token, the owner loses project, run and profile writes', async () => {
  await signIn(OWNER);
  const tokenBefore = await auth.currentUser!.getIdToken();
  // Exactly what adminRevokeUser writes on the profile.
  await adminMergeDoc('users', uids.owner, { status: 'suspended', transformationsLimit: 0 });

  expect(await denied(() => getDoc(doc(db, 'projects', PROJECT))), 'project read').toBe(true);
  expect(await denied(() => getDoc(doc(db, 'projects', PROJECT, 'runs', RUN_ID))), 'run read').toBe(true);
  expect(
    await denied(() => getDocs(query(collection(db, 'projects'), where('userId', '==', uids.owner)))),
    'project list',
  ).toBe(true);
  expect(await denied(() => updateDoc(doc(db, 'projects', PROJECT), { solutionDesign: 'still mine' })), 'project write').toBe(true);
  expect(
    await denied(() => setDoc(doc(db, 'projects', `suspended-create-b-${stamp}`), {
      name: 'New', status: 'uploaded', userId: uids.owner, createdAt: new Date(),
    })),
    'project create',
  ).toBe(true);
  expect(await denied(() => updateDoc(doc(db, 'users', uids.owner), { firstName: 'Suspended' })), 'profile write').toBe(true);

  // The own profile stays readable on purpose: it is how the dashboard learns
  // to show "This account is suspended" (firestore.rules, match /users/{userId}).
  const profile = await getDoc(doc(db, 'users', uids.owner));
  expect(profile.data()?.status, 'the profile tells the browser it is suspended').toBe('suspended');

  // None of this came from a new token.
  expect(await auth.currentUser!.getIdToken(), 'the same token throughout').toBe(tokenBefore);
});

test('4 · `deleted` and `disabled` are refused like `suspended`, and reinstating restores access', async () => {
  await signIn(OWNER);
  await adminMergeDoc('users', uids.owner, { status: 'deleted' });
  expect(await denied(() => getDoc(doc(db, 'projects', PROJECT))), 'deleted').toBe(true);
  await adminMergeDoc('users', uids.owner, { status: 'approved', disabled: true });
  expect(await denied(() => getDoc(doc(db, 'projects', PROJECT))), 'disabled').toBe(true);
  // What adminApproveUser writes: access comes back without a new sign-in.
  await adminMergeDoc('users', uids.owner, { status: 'approved', disabled: false });
  expect((await getDoc(doc(db, 'projects', PROJECT))).exists(), 'reinstated').toBe(true);
});

test('5 · an invited reader who is suspended loses the read', async () => {
  await signIn(READER);
  expect((await getDoc(doc(db, 'projects', PROJECT))).exists(), 'before').toBe(true);
  await adminMergeDoc('users', uids.reader, { status: 'suspended' });
  expect(await denied(() => getDoc(doc(db, 'projects', PROJECT))), 'after').toBe(true);
});

test('6 · somebody else\'s suspension changes nothing for an active owner', async () => {
  // Owner and reader are both suspended/reset by now; the third account is
  // untouched and must be unaffected.
  await adminMergeDoc('users', uids.owner, { status: 'suspended' });
  await signIn(OTHER);
  expect((await getDoc(doc(db, 'projects', OTHER_PROJECT))).exists()).toBe(true);
  expect(await denied(() => updateDoc(doc(db, 'projects', OTHER_PROJECT), { solutionDesign: 'fine' }))).toBe(false);
});

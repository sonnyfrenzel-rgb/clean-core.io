import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getApps, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * Security audit of v3.0.3 (b6716f0) — the rules half, asked of the rules as
 * a signed-in browser against the emulator. Every refusal is paired with the
 * write or read that must still work, so none passes because the call fails
 * anyway.
 *
 * - SEC-b6716f0-03/-29: `isAdmin()` honours a suspension even when the
 *   `isAdmin` mirror was not withdrawn (the app withdraws it since the same
 *   audit; this is the second line).
 * - SEC-b6716f0-04: no client deletes a profile, administrator included.
 * - SEC-b6716f0-20/-23/-38: the own-profile update holds the values to the
 *   bounds the create rule holds.
 * - SEC-b6716f0-24: an upload's creation time is the request time.
 *
 * Runs on Node 22 (the Admin SDK's auth module is ESM-only through jose).
 */

const firebaseApp = initializeApp(firebaseConfig, 'rules-b6716f0');
const db = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);
connectFirestoreToEmulator(db);
connectAuthToEmulator(auth);

const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

async function loadRules(file: string) {
  const content = fs.readFileSync(file, 'utf8');
  const body = JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } });
  for (const database of ['(default)', firebaseConfig.firestoreDatabaseId]) {
    const res = await fetch(
      `http://${EMU_HOST}:${EMU_PORT}/emulator/v1/projects/${firebaseConfig.projectId}/databases/${database}:securityRules`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (!res.ok) throw new Error(`The emulator refused the ruleset for ${database} (${res.status}): ${await res.text()}`);
  }
}

async function denied(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return false;
  } catch {
    return true;
  }
}

const RULES = process.env.RULES_UNDER_TEST || path.resolve(__dirname, '..', 'firestore.rules');
const PASSWORD = 'SecurityPassword123!';
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ADMIN = `rules-b6716f0-admin-${stamp}@cleancore-test.io`;
const USER = `rules-b6716f0-user-${stamp}@cleancore-test.io`;
const uids: Record<string, string> = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(60_000);
  if (getApps().length === 0) initAdmin({ projectId: firebaseConfig.projectId });
  await loadRules(RULES);
  const { db: adminDb } = await getAdminDb();
  for (const [key, email, extra] of [['user', USER, { isAdmin: false }], ['admin', ADMIN, { isAdmin: true }]] as const) {
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    uids[key] = cred.user.uid;
    await adminDb.collection('users').doc(cred.user.uid).set({
      firstName: key, lastName: 'Rules', email, tier: 'pilot', status: 'approved', ...extra,
    });
  }
  await (await getAdminAuth()).setCustomUserClaims(uids.admin, { admin: true });
});

test.afterAll(async () => {
  // Leave the emulator on the repository's rules for whoever runs next.
  await loadRules(path.resolve(__dirname, '..', 'firestore.rules'));
});

test('-04 · not even an active administrator deletes a profile from a browser', async () => {
  await signInWithEmailAndPassword(auth, ADMIN, PASSWORD);
  await auth.currentUser!.getIdToken(true);
  expect((await getDoc(doc(db, 'users', uids.user))).exists(), 'control: the admin reads the profile').toBe(true);
  expect(await denied(() => deleteDoc(doc(db, 'users', uids.user))), 'admin deletes a profile').toBe(true);
});

test('-03 · a suspended administrator whose mirror still says admin opens no admin branch', async () => {
  await signInWithEmailAndPassword(auth, ADMIN, PASSWORD);
  const token = await auth.currentUser!.getIdToken(true);
  const { db: adminDb } = await getAdminDb();
  await adminDb.collection('users').doc(uids.admin).set({ status: 'suspended' }, { merge: true });
  expect(await denied(() => getDoc(doc(db, 'users', uids.user))), 'read another profile').toBe(true);
  expect(await denied(() => updateDoc(doc(db, 'users', uids.admin), { status: 'approved' })), 'lift the own suspension').toBe(true);
  expect(await auth.currentUser!.getIdToken(), 'the same token throughout').toBe(token);
  await adminDb.collection('users').doc(uids.admin).set({ status: 'approved' }, { merge: true });
  expect((await getDoc(doc(db, 'users', uids.user))).exists(), 'reinstated: the admin reads again').toBe(true);
});

test('-20/-23/-38 · the own profile takes the values the create rule takes, and only those', async () => {
  await signInWithEmailAndPassword(auth, USER, PASSWORD);
  const own = doc(db, 'users', uids.user);
  expect(await denied(() => setDoc(own, { firstName: 'Ada', theme: 'dark', backupEnabled: true, updatedAt: serverTimestamp() }, { merge: true })), 'a normal settings save').toBe(false);
  expect(await denied(() => updateDoc(own, { firstName: 'x'.repeat(10_000) })), '10 000-character first name').toBe(true);
  expect(await denied(() => updateDoc(own, { firstName: '' })), 'empty first name').toBe(true);
  expect(await denied(() => updateDoc(own, { lastName: 42 })), 'numeric last name').toBe(true);
  expect(await denied(() => updateDoc(own, { backupEnabled: 'yes' })), 'non-boolean flag').toBe(true);
  expect(await denied(() => updateDoc(own, { updatedAt: Timestamp.fromDate(new Date('2000-01-01')) })), 'back-dated updatedAt').toBe(true);
});

test('-24 · an upload is created at the request time, and its owner can still rename it later', async () => {
  await signInWithEmailAndPassword(auth, USER, PASSWORD);
  const oldOne = doc(db, 'files', `rules-b6716f0-old-${stamp}`);
  expect(
    await denied(() => setDoc(oldOne, { name: 'z.abap', content: 'REPORT z.', userId: uids.user, createdAt: Timestamp.fromDate(new Date('2000-01-01')) })),
    'back-dated file',
  ).toBe(true);
  expect(
    await denied(() => setDoc(doc(db, 'abap_examples', `rules-b6716f0-old-${stamp}`), { name: 'z', code: 'REPORT z.', userId: uids.user, createdAt: Timestamp.fromDate(new Date('2000-01-01')) })),
    'back-dated example',
  ).toBe(true);
  const fresh = doc(db, 'files', `rules-b6716f0-new-${stamp}`);
  expect(await denied(() => setDoc(fresh, { name: 'z.abap', content: 'REPORT z.', userId: uids.user, createdAt: serverTimestamp() })), 'a normal upload').toBe(false);
  // The update rule validates the whole document; the stored createdAt is in
  // the past by then and must not be held to the creation window.
  const { db: adminDb } = await getAdminDb();
  await adminDb.collection('files').doc(fresh.id).set({ createdAt: new Date(Date.now() - 3_600_000) }, { merge: true });
  expect(await denied(() => updateDoc(fresh, { name: 'renamed.abap' })), 'rename an hour later').toBe(false);
});

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getApps, initializeApp as initAdmin } from 'firebase-admin/app';
import { adminRevokeUser, getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * SEC-b6716f0-03 — suspending an administrator ends the admin branches of the
 * rules at once, not when the ID token expires.
 *
 * `isAdmin()` in firestore.rules asks the `admin` claim and the `isAdmin`
 * mirror on the caller's profile; it does not ask `accountActive()`. An ID
 * token minted before the suspension still says `admin: true` for up to an
 * hour, so `adminRevokeUser` writes the mirror to `false` in the same batch as
 * `status: 'suspended'`. This spec calls the real `adminRevokeUser` against
 * the emulators and keeps the same browser token throughout, as
 * tests/firestore-rules-suspended.spec.ts does for an ordinary account.
 *
 * In process, no app server: the client SDK for the browser, the Admin SDK for
 * the seeding and for the revocation itself.
 */

const firebaseApp = initializeApp(firebaseConfig, 'suspended-admin-rules');
const db = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);
connectFirestoreToEmulator(db);
connectAuthToEmulator(auth);

const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

/** Make the emulator serve this working copy's rules (as firestore-rules-suspended.spec.ts does). */
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

async function denied(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return false;
  } catch {
    return true;
  }
}

const PASSWORD = 'SecurityPassword123!';
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ADMIN = `suspended-admin-rules-${stamp}@cleancore-test.io`;
const OTHER = `suspended-admin-other-${stamp}@cleancore-test.io`;
const FILE_ID = `suspended-admin-file-${stamp}`;

test('a suspended administrator loses the admin branches of the rules with the same still-valid token', async () => {
  test.setTimeout(60_000);
  if (getApps().length === 0) initAdmin({ projectId: firebaseConfig.projectId });
  await loadWorkingCopyRules();
  const { db: adminDb } = await getAdminDb();

  const other = await createUserWithEmailAndPassword(auth, OTHER, PASSWORD);
  const otherUid = other.user.uid;
  await adminDb.collection('users').doc(otherUid).set({
    firstName: 'Other', lastName: 'User', email: OTHER, tier: 'pilot', status: 'approved', isAdmin: false,
  });
  await adminDb.collection('files').doc(FILE_ID).set({
    name: 'z_other.abap', content: 'REPORT z_other.', userId: otherUid, createdAt: new Date(),
  });

  const created = await createUserWithEmailAndPassword(auth, ADMIN, PASSWORD);
  const adminUid = created.user.uid;
  await adminDb.collection('users').doc(adminUid).set({
    firstName: 'Ops', lastName: 'Admin', email: ADMIN, tier: 'pilot', status: 'approved', isAdmin: true,
  });
  await (await getAdminAuth()).setCustomUserClaims(adminUid, { admin: true });
  await signInWithEmailAndPassword(auth, ADMIN, PASSWORD);
  const result = await auth.currentUser!.getIdTokenResult(true);
  expect(result.claims.admin, 'the token carries the admin claim').toBe(true);
  const tokenBefore = result.token;

  // The control: while active, the claim opens another account's profile.
  expect((await getDoc(doc(db, 'users', otherUid))).exists(), 'before: an administrator reads another profile').toBe(true);

  await adminRevokeUser(`actor-${stamp}`, adminUid);

  expect(await denied(() => getDoc(doc(db, 'users', otherUid))), 'read another profile').toBe(true);
  expect(
    await denied(() => updateDoc(doc(db, 'users', adminUid), { status: 'approved' })),
    'lift the own suspension through the admin branch',
  ).toBe(true);
  expect(await denied(() => deleteDoc(doc(db, 'files', FILE_ID))), 'delete another account\'s upload').toBe(true);
  expect(await denied(() => deleteDoc(doc(db, 'users', otherUid))), 'delete another profile').toBe(true);

  const profile = (await adminDb.collection('users').doc(adminUid).get()).data();
  expect(profile?.status).toBe('suspended');
  expect(profile?.isAdmin, 'the suspension withdraws the admin mirror').toBe(false);
  expect((await adminDb.collection('files').doc(FILE_ID).get()).exists, 'the upload is still there').toBe(true);

  // None of this came from a new token.
  expect(await auth.currentUser!.getIdToken(), 'the same token throughout').toBe(tokenBefore);
  await auth.signOut();
});

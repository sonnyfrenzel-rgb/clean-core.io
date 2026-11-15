import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth, type Auth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { ERASED_MARKER_MS, deleteUserDataAndAccount } from '../lib/firebase-admin';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * An erased account's ID token stays valid for up to an hour after its sign-in
 * is deleted. The erasure leaves `erased_accounts/{uid}` with an expiry, and the
 * profile's create rule refuses while it holds — so the token cannot bring the
 * profile, and with it every write `accountActive()` guards, back.
 *
 * Staged exactly: the sign-in is kept (an Auth stub that deletes nothing), the
 * browser still holds its token, the erasure runs in this process against the
 * emulator, then the browser writes the profile the sign-up writes.
 */
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

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

function adminDb(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

const keepSignIn = { deleteUser: async () => {} } as unknown as Auth;

async function denied(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return false;
  } catch {
    return true;
  }
}

test('an erased account cannot create its profile again with the token it still holds; the marker is why', async () => {
  test.setTimeout(90 * 1000);
  await loadWorkingCopyRules();
  const db = adminDb();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `erased-${stamp}@cleancore-test.io`;
  const app = initializeApp(firebaseConfig, `erased-${stamp}`);
  const browserDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
  const auth = getAuth(app);
  connectFirestoreToEmulator(browserDb);
  connectAuthToEmulator(auth);
  const uid = (await createUserWithEmailAndPassword(auth, email, 'SecurityPassword123!')).user.uid;

  const profile = () => ({
    firstName: 'Erased',
    lastName: 'Account',
    email,
    tier: 'pilot',
    status: 'pending',
    transformationsUsed: 0,
    transformationsLimit: 5,
    maxTeamMembers: 1,
    orgId: null,
    identityProvider: 'password',
    createdAt: serverTimestamp(),
    isAdmin: false,
    authMethod: 'password',
  });

  try {
    await setDoc(doc(browserDb, 'users', uid), profile());
    await deleteUserDataAndAccount(uid, { db, auth: keepSignIn });
    expect((await db.collection('users').doc(uid).get()).exists, 'the erasure deleted the profile').toBe(false);

    const marker = (await db.collection('erased_accounts').doc(uid).get()).data();
    expect(Object.keys(marker ?? {}), 'the marker holds its expiry and nothing else').toEqual(['expiresAt']);
    const until = marker!.expiresAt.toDate().getTime();
    expect(until - Date.now()).toBeGreaterThan(ERASED_MARKER_MS - 60_000);
    expect(ERASED_MARKER_MS, 'the marker outlives an ID token').toBeGreaterThan(60 * 60 * 1000);

    expect(await denied(() => setDoc(doc(browserDb, 'users', uid), profile())), 'the profile came back').toBe(true);
    expect(await denied(() => setDoc(doc(browserDb, 'erased_accounts', uid), { expiresAt: new Date(0) })), 'a browser wrote the marker').toBe(true);

    // The marker is the reason: once it has expired, the same write passes.
    await db.collection('erased_accounts').doc(uid).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await denied(() => setDoc(doc(browserDb, 'users', uid), profile())), 'refused after the marker expired').toBe(false);
  } finally {
    await db.collection('users').doc(uid).delete().catch(() => {});
    await db.collection('erased_accounts').doc(uid).delete().catch(() => {});
    // The sign-in was kept on purpose (the stub above); the emulator gets it back here.
    await adminAuth(adminApps()[0]).deleteUser(uid).catch(() => {});
  }
});

import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { deleteField, doc, initializeFirestore, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import firebaseConfig from '../firebase-config.json';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * The usage-report objection marker (`usageReportObjectionAt`) is the operator's to set, never a browser's: an account
 * that could write it would take itself out of the weekly report. `tests/usage-report-objection.spec.ts` reads the
 * rules as text; this asks the rules, as a signed-in browser against the emulator with this working copy's
 * `firestore.rules` — on create and on update, set and cleared. Every refusal is paired with the same call without the
 * marker succeeding, so none can pass because the call fails anyway.
 *
 * Needs the Firestore and Auth emulators (no Next server; the operator's writes go through the Admin SDK directly).
 */

const ROOT = path.resolve(__dirname, '..');
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

async function loadWorkingCopyRules() {
  const content = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const body = JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } });
  for (const database of ['(default)', firebaseConfig.firestoreDatabaseId]) {
    const res = await fetch(
      `http://${EMU_HOST}:${EMU_PORT}/emulator/v1/projects/${firebaseConfig.projectId}/databases/${database}:securityRules`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (!res.ok) throw new Error(`The emulator refused the ruleset for ${database} (${res.status}): ${await res.text()}`);
  }
}

function client(name: string): Firestore {
  const app = initializeApp(firebaseConfig, name);
  const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
  connectFirestoreToEmulator(db);
  connectAuthToEmulator(getAuth(app));
  return db;
}

async function codeOf(op: () => Promise<unknown>): Promise<string> {
  try {
    await op();
    return 'allowed';
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
}

/** The operator's side: the Admin SDK against the emulator, bypassing the rules as the Admin Console's route does. */
async function adminMergeDoc(collection: string, id: string, data: Record<string, unknown>) {
  const app = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
  await adminFirestore(app, firebaseConfig.firestoreDatabaseId).collection(collection).doc(id).set(data, { merge: true });
}

const stamp = Date.now();
const db = client('usage-report-objection-rules');
let uid = '';
let email = '';
/** The profile a browser writes at sign-up (the keys `userClientCreateKeys` admits, the values the rule demands). */
const profile = () => ({
  firstName: 'Usage', lastName: 'Objection', email, tier: 'pilot', status: 'pending',
  transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1, orgId: null,
  identityProvider: 'password', authMethod: 'password', isAdmin: false, createdAt: serverTimestamp(),
});

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(90 * 1000);
  email = `usage-objection-${stamp}@cleancore-test.io`;
  uid = (await createUserWithEmailAndPassword(getAuth(db.app), email, 'SecurityPassword123!')).user.uid;
  await loadWorkingCopyRules();
});

test('a browser cannot create its profile with the marker; the same profile without it is created', async () => {
  const ref = doc(db, 'users', uid);
  expect(await codeOf(() => setDoc(ref, { ...profile(), usageReportObjectionAt: serverTimestamp() }))).toBe('permission-denied');
  expect(await codeOf(() => setDoc(ref, profile()))).toBe('allowed');
});

test('a browser cannot set the marker on its active profile; an allowed field in the same call is written', async () => {
  // Active, as the account is after its e-mail is confirmed (the Admin SDK writes it).
  await adminMergeDoc('users', uid, { status: 'approved' });
  const ref = doc(db, 'users', uid);
  expect(await codeOf(() => updateDoc(ref, { firstName: 'Changed', usageReportObjectionAt: serverTimestamp() }))).toBe('permission-denied');
  expect(await codeOf(() => updateDoc(ref, { firstName: 'Changed' }))).toBe('allowed');
});

test('a browser can neither clear nor move a marker the operator set', async () => {
  await adminMergeDoc('users', uid, { usageReportObjectionAt: new Date() });
  const ref = doc(db, 'users', uid);
  expect(await codeOf(() => updateDoc(ref, { usageReportObjectionAt: deleteField() }))).toBe('permission-denied');
  expect(await codeOf(() => updateDoc(ref, { usageReportObjectionAt: serverTimestamp() }))).toBe('permission-denied');
  expect(await codeOf(() => updateDoc(ref, { firstName: 'Again' }))).toBe('allowed');
});

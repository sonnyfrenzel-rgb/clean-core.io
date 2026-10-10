import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  type Firestore,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { adminSetDoc, adminSetCustomClaim, adminGetDoc, adminDocExists } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * SEC-2026-751, SEC-2026-752 — the admin claim opens reads in firestore.rules,
 * never writes.
 *
 * An administrator acts on another account's records only through the server
 * routes, which demand a recent sign-in with MFA and write the audit event
 * (`assertAdminStepUp`, lib/firebase-admin.ts). A browser holding an active
 * admin token must therefore be refused every direct write on records that are
 * not its own: profiles, support tickets, uploads, examples and both request
 * collections.
 *
 * Every refusal has a control that succeeds with the same token or the owner's
 * — the admin still reads the profile and the request, the owner still deletes
 * their own upload — so no assertion passes because the call fails anyway.
 *
 * In process, no app server: the client SDK for the browser, the Admin SDK for
 * the seeding. Needs the Auth and Firestore emulators.
 */

const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

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

function client(name: string): { db: Firestore; auth: Auth } {
  const app = initializeApp(firebaseConfig, name);
  const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
  const auth = getAuth(app);
  connectFirestoreToEmulator(db);
  connectAuthToEmulator(auth);
  return { db, auth };
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

const owner = client('rules-admin-writes-owner');
const operator = client('rules-admin-writes-operator');

const emails = {
  owner: `admin-writes-owner-${stamp}@cleancore-test.io`,
  operator: `admin-writes-operator-${stamp}@cleancore-test.io`,
};
const uids: Record<string, string> = {};

const FILE = `admin-writes-file-${stamp}`;
const OWN_FILE = `admin-writes-own-file-${stamp}`;
const EXAMPLE = `admin-writes-example-${stamp}`;
const TICKET = `admin-writes-ticket-${stamp}`;
const STRANGER = `admin-writes-stranger-${stamp}`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(90 * 1000);
  await loadWorkingCopyRules();

  uids.owner = (await createUserWithEmailAndPassword(owner.auth, emails.owner, PASSWORD)).user.uid;
  uids.operator = (await createUserWithEmailAndPassword(operator.auth, emails.operator, PASSWORD)).user.uid;

  await adminSetDoc('users', uids.owner, {
    firstName: 'Admin', lastName: 'Target', email: emails.owner, tier: 'pilot', status: 'approved', isAdmin: false,
  });
  await adminSetDoc('users', uids.operator, {
    firstName: 'Ops', lastName: 'Admin', email: emails.operator, tier: 'pilot', status: 'approved', isAdmin: true,
  });
  await adminSetCustomClaim(uids.operator, { admin: true });
  await operator.auth.currentUser!.getIdToken(true);

  for (const id of [FILE, OWN_FILE]) {
    await adminSetDoc('files', id, { name: 'z_report.abap', content: 'REPORT z_report.', userId: uids.owner, createdAt: new Date() });
  }
  await adminSetDoc('abap_examples', EXAMPLE, {
    name: 'z_example.abap', code: 'REPORT z_example.', userId: uids.owner, createdAt: new Date(),
  });
  await adminSetDoc('support_tickets', TICKET, {
    userId: uids.owner, subject: 'Question', message: 'Text', status: 'open', createdAt: new Date(),
  });
  const request = { email: emails.owner, name: 'Admin Target', status: 'pending', createdAt: new Date() };
  await adminSetDoc('registration_requests', uids.owner, request);
  await adminSetDoc('tenant_access_requests', uids.owner, request);
});

test('the admin token carries the claim and still reads (control)', async () => {
  const claims = await operator.auth.currentUser!.getIdTokenResult();
  expect(claims.claims.admin, 'the token carries the admin claim').toBe(true);
  expect((await getDoc(doc(operator.db, 'users', uids.owner))).exists(), 'admin reads another profile').toBe(true);
  expect((await getDoc(doc(operator.db, 'registration_requests', uids.owner))).exists(), 'admin reads a registration request').toBe(true);
  expect((await getDoc(doc(operator.db, 'tenant_access_requests', uids.owner))).exists(), 'admin reads a tenant request').toBe(true);
});

test('an admin token writes no other account\'s profile', async () => {
  const other = doc(operator.db, 'users', uids.owner);
  expect(await denied(() => updateDoc(other, { status: 'suspended' })), 'update status').toBe(true);
  expect(await denied(() => updateDoc(other, { transformationsLimit: 999 })), 'update quota').toBe(true);
  expect(await denied(() => updateDoc(other, { isAdmin: true })), 'grant the admin mirror').toBe(true);
  expect(await denied(() => setDoc(doc(operator.db, 'users', STRANGER), {
    firstName: 'X', lastName: 'Y', email: 'x@cleancore-test.io', tier: 'pilot', status: 'approved', isAdmin: true,
  })), 'create a profile for another uid').toBe(true);

  const stored = await adminGetDoc('users', uids.owner);
  expect(stored?.status, 'the profile is unchanged').toBe('approved');
  expect(stored?.isAdmin).toBe(false);
  expect(await adminDocExists('users', STRANGER), 'no profile was created').toBe(false);
});

test('an admin token neither moves nor deletes tickets, uploads, examples or requests', async () => {
  const db = operator.db;
  expect(await denied(() => updateDoc(doc(db, 'support_tickets', TICKET), { status: 'closed' })), 'ticket update').toBe(true);
  expect(await denied(() => deleteDoc(doc(db, 'support_tickets', TICKET))), 'ticket delete').toBe(true);
  expect(await denied(() => deleteDoc(doc(db, 'files', FILE))), 'file delete').toBe(true);
  expect(await denied(() => deleteDoc(doc(db, 'abap_examples', EXAMPLE))), 'example delete').toBe(true);
  for (const col of ['registration_requests', 'tenant_access_requests']) {
    expect(await denied(() => updateDoc(doc(db, col, uids.owner), { status: 'approved' })), `${col} update`).toBe(true);
    expect(await denied(() => deleteDoc(doc(db, col, uids.owner))), `${col} delete`).toBe(true);
  }
  expect(await denied(() => setDoc(doc(db, 'tenant_access_requests', STRANGER), {
    email: emails.operator, name: 'X', status: 'approved', createdAt: new Date(),
  })), 'tenant request created for another uid').toBe(true);

  expect((await adminGetDoc('support_tickets', TICKET))?.status, 'the ticket is unchanged').toBe('open');
  expect(await adminDocExists('files', FILE), 'the upload is still there').toBe(true);
  expect(await adminDocExists('abap_examples', EXAMPLE), 'the example is still there').toBe(true);
  expect((await adminGetDoc('registration_requests', uids.owner))?.status).toBe('pending');
  expect((await adminGetDoc('tenant_access_requests', uids.owner))?.status).toBe('pending');
  expect(await adminDocExists('tenant_access_requests', STRANGER)).toBe(false);
});

test('the owner still deletes their own upload (control)', async () => {
  expect(await denied(() => deleteDoc(doc(owner.db, 'files', OWN_FILE))), 'owner deletes own upload').toBe(false);
  expect(await adminDocExists('files', OWN_FILE)).toBe(false);
});

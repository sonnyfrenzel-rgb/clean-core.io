import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { createWithinCeiling, WRITE_CEILINGS, WriteCeilingReached } from '../lib/write-ceiling';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * SEC-2026-758, SEC-2026-764 — the per-account write ceiling on the documents a
 * browser creates for itself (projects, support tickets).
 *
 * Every refusal is paired with the app's own write succeeding — through
 * lib/write-ceiling.ts, the one path every create screen uses — so no assertion
 * can pass because the call fails anyway. Needs the Auth and Firestore
 * emulators only; the ceiling documents are seeded with the Admin SDK so the
 * window carries a real server timestamp.
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

function client(name: string): { db: Firestore; auth: ReturnType<typeof getAuth> } {
  const app = initializeApp(firebaseConfig, name);
  const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
  const auth = getAuth(app);
  connectFirestoreToEmulator(db);
  connectAuthToEmulator(auth);
  return { db, auth };
}

function admin() {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
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
const stamp = Date.now();
const owner = client('rules-ceiling-owner');
const other = client('rules-ceiling-other');
const uids: Record<string, string> = {};

const project = (uid: string) => ({ name: 'Ceiling project', status: 'uploaded', userId: uid, createdAt: serverTimestamp() });
const ticket = (uid: string) => ({ userId: uid, subject: 'A question', message: 'How?', status: 'open', createdAt: serverTimestamp() });

/** Seed the owner's ceiling as the server clock would have left it. */
async function seedCeiling(data: Record<string, unknown>) {
  await admin().collection('write_ceilings').doc(uids.owner).set(data);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(90 * 1000);
  await loadWorkingCopyRules();
  for (const [key, c] of [['owner', owner], ['other', other]] as const) {
    const email = `ceiling-${key}-${stamp}@cleancore-test.io`;
    uids[key] = (await createUserWithEmailAndPassword(c.auth, email, PASSWORD)).user.uid;
    // The profile the sign-up writes (an account pending approval is active).
    await setDoc(doc(c.db, 'users', uids[key]), {
      firstName: 'Ceiling', lastName: key, email, tier: 'pilot', status: 'pending',
      transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1, orgId: null,
      identityProvider: 'password', authMethod: 'password', isAdmin: false, createdAt: serverTimestamp(),
    });
  }
});

test('a project or ticket created without a step of the ceiling is refused; the app\'s create goes through', async () => {
  expect(await denied(() => setDoc(doc(collection(owner.db, 'projects')), project(uids.owner))), 'project alone').toBe(true);
  expect(await denied(() => setDoc(doc(collection(owner.db, 'support_tickets')), ticket(uids.owner))), 'ticket alone').toBe(true);

  const p = await createWithinCeiling(owner.db, 'projects', uids.owner, project(uids.owner));
  expect((await getDoc(p)).exists(), 'the project the app creates').toBe(true);
  const t = await createWithinCeiling(owner.db, 'support_tickets', uids.owner, ticket(uids.owner));
  expect((await getDoc(t)).exists(), 'the ticket the app creates').toBe(true);

  const ceiling = (await getDoc(doc(owner.db, 'write_ceilings', uids.owner))).data()!;
  expect(ceiling.projectCount).toBe(1);
  expect(ceiling.projectId).toBe(p.id);
  expect(ceiling.ticketCount).toBe(1);
  expect(ceiling.ticketId).toBe(t.id);

  // A second create in the same window counts on.
  await createWithinCeiling(owner.db, 'projects', uids.owner, project(uids.owner));
  expect((await getDoc(doc(owner.db, 'write_ceilings', uids.owner))).data()!.projectCount).toBe(2);
});

test('one step admits one document, not two', async () => {
  const ceilingRef = doc(owner.db, 'write_ceilings', uids.owner);
  const stored = (await getDoc(ceilingRef)).data()!;
  const a = doc(collection(owner.db, 'projects'));
  const b = doc(collection(owner.db, 'projects'));
  const batch = writeBatch(owner.db);
  batch.set(ceilingRef, { projectCount: stored.projectCount + 1, projectId: a.id }, { merge: true });
  batch.set(a, project(uids.owner));
  batch.set(b, project(uids.owner));
  expect(await denied(() => batch.commit()), 'two projects on one step').toBe(true);

  // An old step does not admit a later create either: its id is taken.
  expect(await denied(() => setDoc(doc(owner.db, 'projects', stored.projectId), project(uids.owner))), 'the id of an earlier step').toBe(true);
});

test('the count only moves up by one, inside its window, up to the ceiling', async () => {
  const { ceiling } = WRITE_CEILINGS.projects;
  const fresh = AdminTimestamp.fromMillis(Date.now() - 60 * 60 * 1000);
  await seedCeiling({ projectCount: ceiling - 1, projectWindow: fresh, projectId: 'seed' });

  const ceilingRef = doc(owner.db, 'write_ceilings', uids.owner);
  const step = async (fields: Record<string, unknown>) => {
    const ref = doc(collection(owner.db, 'projects'));
    const batch = writeBatch(owner.db);
    batch.set(ceilingRef, { projectId: ref.id, ...fields }, { merge: true });
    batch.set(ref, project(uids.owner));
    await batch.commit();
  };

  expect(await denied(() => step({ projectCount: 1, projectWindow: serverTimestamp() })), 'a new window while this one runs').toBe(true);
  expect(await denied(() => step({ projectCount: ceiling - 1 })), 'no step at all').toBe(true);
  expect(await denied(() => step({ projectCount: ceiling - 3 })), 'a step down').toBe(true);
  expect(await denied(() => step({ projectCount: ceiling + 1 })), 'two steps at once').toBe(true);
  expect(await denied(() => step({ projectCount: ceiling, projectWindow: Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000) })), 'a window moved back').toBe(true);
  expect(await denied(() => step({ projectCount: ceiling, extra: true })), 'a field of its own').toBe(true);

  // The last step inside the ceiling, as the app takes it.
  await createWithinCeiling(owner.db, 'projects', uids.owner, project(uids.owner));
  expect((await getDoc(ceilingRef)).data()!.projectCount).toBe(ceiling);

  // One more is refused — by the rules, and the app says so before it asks.
  expect(await denied(() => step({ projectCount: ceiling + 1 })), 'past the ceiling').toBe(true);
  await expect(createWithinCeiling(owner.db, 'projects', uids.owner, project(uids.owner))).rejects.toBeInstanceOf(WriteCeilingReached);
});

test('a window older than a day opens a new one, at one', async () => {
  const { ceiling } = WRITE_CEILINGS.projects;
  const stale = AdminTimestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await seedCeiling({ projectCount: ceiling, projectWindow: stale, projectId: 'seed' });

  const p = await createWithinCeiling(owner.db, 'projects', uids.owner, project(uids.owner));
  expect((await getDoc(p)).exists()).toBe(true);
  const after = (await getDoc(doc(owner.db, 'write_ceilings', uids.owner))).data()!;
  expect(after.projectCount).toBe(1);
  expect((after.projectWindow as Timestamp).toMillis()).toBeGreaterThan(stale.toMillis());
});

test('support tickets have a ceiling of their own', async () => {
  const { ceiling } = WRITE_CEILINGS.support_tickets;
  const fresh = AdminTimestamp.fromMillis(Date.now() - 60 * 1000);
  await seedCeiling({ ticketCount: ceiling - 2, ticketWindow: fresh, ticketId: 'seed' });
  const ceilingRef = doc(owner.db, 'write_ceilings', uids.owner);

  // A step of one kind does not admit a document of the other: the ticket
  // step below is valid on its own, the project beside it is not.
  const projectRef = doc(collection(owner.db, 'projects'));
  const cross = writeBatch(owner.db);
  cross.set(ceilingRef, { ticketCount: ceiling - 1, ticketId: projectRef.id }, { merge: true });
  cross.set(projectRef, project(uids.owner));
  expect(await denied(() => cross.commit()), 'a ticket step for a project').toBe(true);

  await createWithinCeiling(owner.db, 'support_tickets', uids.owner, ticket(uids.owner));
  await createWithinCeiling(owner.db, 'support_tickets', uids.owner, ticket(uids.owner));
  expect((await getDoc(ceilingRef)).data()!.ticketCount).toBe(ceiling);
  await expect(createWithinCeiling(owner.db, 'support_tickets', uids.owner, ticket(uids.owner))).rejects.toBeInstanceOf(WriteCeilingReached);

  const ref = doc(collection(owner.db, 'support_tickets'));
  const batch = writeBatch(owner.db);
  batch.set(ceilingRef, { ticketCount: ceiling + 1, ticketId: ref.id }, { merge: true });
  batch.set(ref, ticket(uids.owner));
  expect(await denied(() => batch.commit()), 'past the ticket ceiling').toBe(true);
});

test('the ceiling is the account\'s own: nobody else writes it, and nobody removes it', async () => {
  const theirs = doc(other.db, 'write_ceilings', uids.owner);
  expect(await denied(() => getDoc(theirs)), 'read another account\'s').toBe(true);
  expect(await denied(() => setDoc(theirs, { projectCount: 0, projectId: 'x' }, { merge: true })), 'write another account\'s').toBe(true);
  expect(await denied(() => deleteDoc(doc(owner.db, 'write_ceilings', uids.owner))), 'delete the own').toBe(true);

  // And the other account's own creates count on its own ceiling.
  const p = await createWithinCeiling(other.db, 'projects', uids.other, project(uids.other));
  expect((await getDoc(p)).exists()).toBe(true);
  expect((await getDoc(doc(other.db, 'write_ceilings', uids.other))).data()!.projectCount).toBe(1);
});

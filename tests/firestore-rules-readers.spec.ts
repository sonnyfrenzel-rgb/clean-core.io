import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  arrayUnion,
  query,
  where,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { adminSetDoc, adminMergeDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';

/**
 * Roadmap 5.4 and 5.5 — what the new read rule opens, and what it must not.
 *
 * `firestore.rules` gained one grant: a uid on `projects/{projectId}.readers`
 * may read that project document. Everything here is a real client SDK call
 * against the emulator, because a rule is only what the rules engine does with
 * it — an assertion about the *source* of a rule would have passed for every
 * one of the holes below.
 *
 * Nine questions, in the order they were asked of the change:
 *
 *   1. a project with no `readers` field behaves exactly as before;
 *   2. `readers: []` grants nobody anything;
 *   3. `readers: ['somebody-else']` does not let me in;
 *   4. no browser can write `readers` — by set, by update, by merge, by
 *      arrayUnion, or hidden inside a larger write that would otherwise pass;
 *   5. the invitations, which carry other people's e-mail addresses, are closed
 *      to an invited reader;
 *   6. a reader writes nothing, anywhere under the project;
 *   7. a revocation takes the read away at the rules, immediately;
 *   8. no reach beyond the one project — no list, no other project, no account;
 *   9. the owner's own path is untouched (the existing rules specs cover this,
 *      and are not adjusted here).
 */

const firebaseApp = initializeApp(firebaseConfig, 'rules-readers');
const db = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);

const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, EMU_HOST, Number(EMU_PORT));
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

/**
 * Make the emulator serve the rules in this working copy.
 *
 * In CI this is a no-op: the emulator is started from this checkout and is
 * already holding this text. On a developer's machine the emulator is often a
 * long-running process from another branch or another worktree, and a rules
 * spec that trusts whatever it happens to be holding is not testing the file in
 * front of you — it is testing the file somebody started it with, and it passes
 * or fails for reasons that are not in your change.
 */
async function loadWorkingCopyRules() {
  const content = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  const body = JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } });
  // Per *database*, not per project. The project-level endpoint answers 200 and
  // changes nothing for a named database, which is the worst possible answer:
  // this file passed for a while against whatever ruleset the emulator was
  // already holding, including one that had been overwritten with `if false`.
  // `clean-core-eu` is the database this app uses (`firebase-config.json`);
  // `(default)` is loaded too so the two cannot disagree.
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
const OWNER = `readers-owner-${stamp}@cleancore-test.io`;
const READER = `readers-reader-${stamp}@cleancore-test.io`;
const STRANGER = `readers-stranger-${stamp}@cleancore-test.io`;
const ADMIN = `readers-admin-${stamp}@cleancore-test.io`;

/** The project the reader is invited to. */
const SHARED = `readers-shared-${stamp}`;
/** Same owner, never shared — the reach test. */
const PRIVATE = `readers-private-${stamp}`;
/** Shared but with no `readers` field at all — the "absence widens nothing" test. */
const NO_FIELD = `readers-nofield-${stamp}`;
const RUN_ID = `readers-run-${stamp}`;

const uids: Record<string, string> = {};

/** True when the operation was refused. A rule test that cannot tell refusal from success is no test. */
async function denied(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return false;
  } catch {
    return true;
  }
}

async function signIn(email: string) {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await loadWorkingCopyRules();

  for (const [key, email] of [['owner', OWNER], ['reader', READER], ['stranger', STRANGER], ['admin', ADMIN]] as const) {
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    uids[key] = cred.user.uid;
    await adminSetDoc('users', cred.user.uid, {
      firstName: key, lastName: 'User', email, tier: 'pilot', status: 'approved',
      ...(key === 'admin' ? { isAdmin: true } : {}),
    });
  }
  await adminSetCustomClaim(uids.admin, { admin: true });

  const base = {
    name: 'Shared Project',
    userId: uids.owner,
    createdAt: new Date(),
    status: 'created',
    legacyCode: 'REPORT z_shared.\nWRITE: / 42.',
  };
  // The shared one starts with the reader on the list, as an accepted
  // invitation would have left it.
  await adminSetDoc('projects', SHARED, { ...base, readers: [uids.reader] });
  await adminSetDoc('projects', PRIVATE, { ...base, name: 'Private Project' });
  await adminSetDoc('projects', NO_FIELD, { ...base, name: 'No Readers Field' });

  await adminSetDoc(`projects/${SHARED}/runs`, RUN_ID, {
    runId: RUN_ID, projectId: SHARED, userId: uids.owner,
    createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 71,
  });
  // An invitation carries the address of the person it was sent to. This one is
  // addressed to a *third* party, so if the reader could read it they would be
  // reading somebody else's e-mail address.
  await adminSetDoc(`projects/${SHARED}/invitations`, `inv-${stamp}`, {
    projectId: SHARED,
    email: 'someone-else@example.org',
    invitedBy: { uid: uids.owner, name: 'Owner User' },
    invitedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    status: 'accepted',
    acceptedBy: { uid: uids.reader, email: READER },
    acceptedAt: new Date().toISOString(),
    revokedAt: null,
  });
});

test('1 · a project with no `readers` field at all behaves exactly as before', async () => {
  await signIn(READER);
  expect(await denied(() => getDoc(doc(db, 'projects', NO_FIELD))), 'absence must not widen').toBe(true);
  await signIn(OWNER);
  const owned = await getDoc(doc(db, 'projects', NO_FIELD));
  expect(owned.exists(), 'and the owner still reads it').toBe(true);
});

test('2 · an empty `readers` list grants nobody anything', async () => {
  await adminMergeDoc('projects', NO_FIELD, { readers: [] });
  await signIn(READER);
  expect(await denied(() => getDoc(doc(db, 'projects', NO_FIELD)))).toBe(true);
  await signIn(STRANGER);
  expect(await denied(() => getDoc(doc(db, 'projects', NO_FIELD)))).toBe(true);
});

test('3 · somebody else\'s uid on the list is not my uid', async () => {
  await adminMergeDoc('projects', NO_FIELD, { readers: [uids.stranger] });
  await signIn(READER);
  expect(await denied(() => getDoc(doc(db, 'projects', NO_FIELD)))).toBe(true);
  // …and the one it does name gets in, so the test above is not passing for
  // the wrong reason.
  await signIn(STRANGER);
  expect((await getDoc(doc(db, 'projects', NO_FIELD))).exists()).toBe(true);
  await adminMergeDoc('projects', NO_FIELD, { readers: [] });
});

test('4 · no browser writes `readers`, by any path', async () => {
  await signIn(OWNER);
  const ref = doc(db, 'projects', SHARED);

  expect(await denied(() => updateDoc(ref, { readers: [uids.owner, uids.stranger] })), 'update').toBe(true);
  expect(await denied(() => setDoc(ref, { readers: [uids.stranger] }, { merge: true })), 'set merge').toBe(true);
  expect(await denied(() => updateDoc(ref, { readers: arrayUnion(uids.stranger) })), 'arrayUnion').toBe(true);
  expect(
    await denied(() => setDoc(ref, { name: 'x', status: 'uploaded', userId: uids.owner, createdAt: new Date(), readers: [uids.owner] })),
    'a full set that replaces the document',
  ).toBe(true);
  // The one that is easy to forget: `readers` smuggled in beside a field the
  // allowlist does allow, in a single write.
  expect(
    await denied(() => setDoc(ref, { status: 'analyzed', readers: [uids.stranger] }, { merge: true })),
    'readers beside an allowed field',
  ).toBe(true);
  // And the allowed field on its own still goes through, so the assertions
  // above are about `readers` and not about the write failing anyway.
  expect(await denied(() => setDoc(ref, { status: 'analyzed' }, { merge: true })), 'the allowed field alone').toBe(false);

  // A stranger cannot create a project with a readers list either.
  await signIn(STRANGER);
  expect(
    await denied(() => setDoc(doc(db, 'projects', `readers-create-${stamp}`), {
      name: 'Mine', status: 'uploaded', userId: uids.stranger, createdAt: new Date(), readers: [uids.stranger],
    })),
    'create with readers',
  ).toBe(true);

  // The reader least of all — they would be writing their own key.
  await signIn(READER);
  expect(await denied(() => updateDoc(ref, { readers: arrayUnion(uids.reader, uids.stranger) })), 'reader writes readers').toBe(true);
});

test('5 · the invitations stay closed to the reader — they are other people\'s addresses', async () => {
  await signIn(READER);
  const invites = collection(db, 'projects', SHARED, 'invitations');
  expect(await denied(() => getDocs(invites)), 'a reader lists the invitations').toBe(true);
  expect(await denied(() => getDoc(doc(db, 'projects', SHARED, 'invitations', `inv-${stamp}`))), 'a reader opens one').toBe(true);
  expect(await denied(() => setDoc(doc(db, 'projects', SHARED, 'invitations', `forged-${stamp}`), { email: 'x@y.z' })), 'a reader forges one').toBe(true);
  // Not even the owner reads them from a browser: the addresses come through
  // GET /api/projects/{id}/readers, which hands out only the accepted ones.
  await signIn(OWNER);
  expect(await denied(() => getDocs(invites)), 'the owner lists them from a browser').toBe(true);
  expect(await denied(() => setDoc(doc(db, 'projects', SHARED, 'invitations', `owner-${stamp}`), { email: 'x@y.z' })), 'the owner writes one').toBe(true);
});

test('6 · a reader reads the project including its ABAP, and writes nothing anywhere under it', async () => {
  await signIn(READER);
  const snap = await getDoc(doc(db, 'projects', SHARED));
  expect(snap.exists(), 'the project opens').toBe(true);
  expect(snap.data()?.legacyCode, 'including the source code — that is what 5.4 promises').toContain('REPORT z_shared.');

  const ref = doc(db, 'projects', SHARED);
  expect(await denied(() => setDoc(ref, { status: 'documented' }, { merge: true })), 'the project document').toBe(true);
  expect(await denied(() => setDoc(ref, { legacyCode: 'REPORT z_theirs.' }, { merge: true })), 'the source code').toBe(true);
  expect(await denied(() => setDoc(ref, { solutionDesign: 'mine now' }, { merge: true })), 'a draft field').toBe(true);
  expect(await denied(() => setDoc(ref, { approvedByArchitect: true }, { merge: true })), 'a confirmation').toBe(true);

  // Every subcollection the product writes under a project, one by one. `runs`
  // is the only one with a rule of its own (`allow write: if false`); the rest
  // have no match block at all, which is a deny — asserted rather than assumed.
  for (const sub of ['runs', 'invitations', 'process_states', 'process_revisions', 'process_map', 'process_naming']) {
    expect(await denied(() => setDoc(doc(db, 'projects', SHARED, sub, `x-${stamp}`), { tampered: true })), `write ${sub}`).toBe(true);
    expect(await denied(() => getDocs(collection(db, 'projects', SHARED, sub))), `read ${sub}`).toBe(true);
  }
  // The run in particular: it carries the evidence, and it stays owner-only.
  expect(await denied(() => getDoc(doc(db, 'projects', SHARED, 'runs', RUN_ID))), 'the run').toBe(true);
});

test('7 · after the revocation the read fails at the rules, immediately', async () => {
  await signIn(READER);
  expect((await getDoc(doc(db, 'projects', SHARED))).exists(), 'before').toBe(true);

  // Exactly what DELETE /api/projects/{id}/readers writes: the uid off the one
  // list the read rule consults.
  await adminMergeDoc('projects', SHARED, { readers: [] });
  await adminMergeDoc(`projects/${SHARED}/invitations`, `inv-${stamp}`, {
    status: 'revoked', revokedAt: new Date().toISOString(),
  });

  // No sign-out, no new token, no reload: the same session, the next read.
  expect(await denied(() => getDoc(doc(db, 'projects', SHARED))), 'after').toBe(true);
  expect(await denied(() => getDoc(doc(db, 'projects', SHARED, 'runs', RUN_ID))), 'and the run with it').toBe(true);
});

test('8 · the grant reaches one project and nothing else', async () => {
  await adminMergeDoc('projects', SHARED, { readers: [uids.reader] });
  await signIn(READER);
  expect((await getDoc(doc(db, 'projects', SHARED))).exists(), 'the one project').toBe(true);

  expect(await denied(() => getDoc(doc(db, 'projects', PRIVATE))), 'another project of the same owner').toBe(true);
  expect(
    await denied(() => getDocs(query(collection(db, 'projects'), where('userId', '==', uids.owner)))),
    'the owner\'s project list',
  ).toBe(true);
  expect(await denied(() => getDocs(collection(db, 'projects'))), 'every project there is').toBe(true);
  expect(await denied(() => getDoc(doc(db, 'users', uids.owner))), 'the owner\'s account').toBe(true);
});

test('9 · the operator still gets nothing — 5.4 invites a person, not a kind of account', async () => {
  await signIn(ADMIN);
  await auth.currentUser!.getIdToken(true);
  const claims = await auth.currentUser!.getIdTokenResult(true);
  expect(claims.claims.admin, 'the admin claim is on the token').toBe(true);
  expect(await denied(() => getDoc(doc(db, 'projects', SHARED))), 'a shared project').toBe(true);
  expect(await denied(() => getDoc(doc(db, 'projects', PRIVATE))), 'a private one').toBe(true);
  expect(await denied(() => getDocs(collection(db, 'projects', SHARED, 'invitations'))), 'the invitations').toBe(true);
});

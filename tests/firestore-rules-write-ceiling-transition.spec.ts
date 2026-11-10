import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import firebaseConfig from '../firebase-config.json';
import { createWithinCeiling } from '../lib/write-ceiling';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * SEC-2026-758, SEC-2026-764 — the transition between the app deploy and the
 * manual rules deploy (QA review of b3d276e88aba).
 *
 * The app that writes the write ceiling goes live first; until Sonny deploys
 * the rules, production serves the ruleset recorded as `deployed` in
 * docs/registers/rules-deployment.json, which closes `write_ceilings` to the
 * browser. lib/write-ceiling.ts must then fall back to the plain create, or
 * nobody can create a project or send a support ticket in that window. This
 * spec loads that very ruleset — the text git holds at DEPLOYED_RULES_COMMIT,
 * checked against the recorded hash — and runs the app's create path against
 * it; then the working copy's rules, which refuse the plain create.
 *
 * Needs the commit in the clone: the e2e job checks out with fetch-depth 0
 * (see tests/terms-version-archive.spec.ts); a shallow clone skips with that
 * reason. Without a pending block there is no transition, and it skips too —
 * and so it does once the deployed ruleset already carries the write ceiling:
 * a later pending change (3.0.21) is not this transition, and its old rules no
 * longer close `write_ceilings`.
 */

// The commit whose rules are recorded as deployed (docs/registers/rules-deployment.json, 7247edb0…).
const DEPLOYED_RULES_COMMIT = '1b8066e3';
const ROOT = path.resolve(__dirname, '..');
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

const register = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/registers/rules-deployment.json'), 'utf8'));
const lfHash = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

function deployedRulesText(): string | null {
  try {
    return execFileSync('git', ['show', `${DEPLOYED_RULES_COMMIT}:firestore.rules`], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

async function loadRules(content: string) {
  const body = JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } });
  for (const database of ['(default)', firebaseConfig.firestoreDatabaseId]) {
    const res = await fetch(
      `http://${EMU_HOST}:${EMU_PORT}/emulator/v1/projects/${firebaseConfig.projectId}/databases/${database}:securityRules`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (!res.ok) throw new Error(`The emulator refused the ruleset for ${database} (${res.status}): ${await res.text()}`);
  }
}
const workingCopyRules = () => fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

function client(name: string): Firestore {
  const app = initializeApp(firebaseConfig, name);
  const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
  connectFirestoreToEmulator(db);
  connectAuthToEmulator(getAuth(app));
  return db;
}

async function denied(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return false;
  } catch {
    return true;
  }
}

const stamp = Date.now();
const db = client('rules-ceiling-transition');
let uid = '';
const project = () => ({ name: 'Transition project', status: 'uploaded', userId: uid, createdAt: serverTimestamp() });
const ticket = () => ({ userId: uid, subject: 'A question', message: 'How?', status: 'open', createdAt: serverTimestamp() });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(90 * 1000);
  const email = `ceiling-transition-${stamp}@cleancore-test.io`;
  const app = db.app;
  uid = (await createUserWithEmailAndPassword(getAuth(app), email, 'SecurityPassword123!')).user.uid;
  await loadRules(workingCopyRules());
  await setDoc(doc(db, 'users', uid), {
    firstName: 'Ceiling', lastName: 'Transition', email, tier: 'pilot', status: 'pending',
    transformationsUsed: 0, transformationsLimit: 5, maxTeamMembers: 1, orgId: null,
    identityProvider: 'password', authMethod: 'password', isAdmin: false, createdAt: serverTimestamp(),
  });
});

test.afterAll(async () => {
  // Leave the emulator serving the working copy, as every other rules spec expects.
  await loadRules(workingCopyRules());
});

test('with the rules live in production, the app still creates projects and tickets (fallback)', async () => {
  test.skip(!register.pending, 'no rules deploy is pending - there is no transition to test');
  const text = deployedRulesText();
  // CI checks out the whole history (fetch-depth: 0), so a missing commit there is
  // a broken fixture, not a shallow clone: fail rather than skip the one test that
  // proves the transition (QA 400bdb64f91a). Only a local shallow clone skips.
  if (process.env.CI) expect(text, `commit ${DEPLOYED_RULES_COMMIT} must be in the CI checkout`).not.toBeNull();
  test.skip(text === null, `commit ${DEPLOYED_RULES_COMMIT} is not in this clone (shallow checkout)`);
  expect(
    lfHash(text!),
    `firestore.rules at ${DEPLOYED_RULES_COMMIT} is not the ruleset recorded as deployed - pin DEPLOYED_RULES_COMMIT to the commit whose rules were deployed`,
  ).toBe(register.deployed.sha256OfLfNormalisedText);
  test.skip(/match \/write_ceilings\//.test(text!), 'the deployed rules already carry the write ceiling - the transition is behind us');

  await loadRules(text!);
  // The old rules close write_ceilings to the browser: that is what the fallback answers.
  expect(await denied(() => getDoc(doc(db, 'write_ceilings', uid))), 'old rules: the ceiling is closed').toBe(true);

  const p = await createWithinCeiling(db, 'projects', uid, project());
  expect((await getDoc(p)).exists(), 'the project the app creates under the old rules').toBe(true);
  const t = await createWithinCeiling(db, 'support_tickets', uid, ticket());
  expect((await getDoc(t)).exists(), 'the ticket the app creates under the old rules').toBe(true);
});

test('with the new rules, the plain create the fallback uses is refused, and the app\'s create goes through', async () => {
  await loadRules(workingCopyRules());
  expect(await denied(() => setDoc(doc(collection(db, 'projects')), project())), 'project alone').toBe(true);
  expect(await denied(() => setDoc(doc(collection(db, 'support_tickets')), ticket())), 'ticket alone').toBe(true);

  const p = await createWithinCeiling(db, 'projects', uid, project());
  expect((await getDoc(p)).exists()).toBe(true);
  const t = await createWithinCeiling(db, 'support_tickets', uid, ticket());
  expect((await getDoc(t)).exists()).toBe(true);
  const ceiling = (await getDoc(doc(db, 'write_ceilings', uid))).data()!;
  expect(ceiling.projectId).toBe(p.id);
  expect(ceiling.ticketId).toBe(t.id);
});

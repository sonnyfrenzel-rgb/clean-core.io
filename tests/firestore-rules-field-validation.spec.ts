import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  collection,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';

/**
 * Field validation of the client write paths in firestore.rules.
 *
 * Every refusal is paired with the write the app itself performs succeeding, in
 * the shape the app sends it (hooks/useUserProfile.ts, components/LandingModals.tsx,
 * app/(app)/settings/page.tsx, app/(app)/dashboard/page.tsx, the project stages;
 * for `files`, the shape the never-mounted `components/FileUpload.tsx` wrote
 * until D.22c removed it — the rule stays and so does its test), so no
 * assertion can pass because the call fails anyway.
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
const stamp = Date.now();
const DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);

const newcomer = client('rules-fields-newcomer');
const owner = client('rules-fields-owner');
const operator = client('rules-fields-operator');

const emails = {
  newcomer: `fields-newcomer-${stamp}@cleancore-test.io`,
  owner: `fields-owner-${stamp}@cleancore-test.io`,
  operator: `fields-operator-${stamp}@cleancore-test.io`,
};
const uids: Record<string, string> = {};

const PROJECT = `fields-project-${stamp}`;
const SEEDED_FILE = `fields-file-${stamp}`;
const SEEDED_EXAMPLE = `fields-example-${stamp}`;
const SEEDED_TICKET = `fields-ticket-${stamp}`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(90 * 1000);
  await loadWorkingCopyRules();

  uids.newcomer = (await createUserWithEmailAndPassword(newcomer.auth, emails.newcomer, PASSWORD)).user.uid;
  uids.owner = (await createUserWithEmailAndPassword(owner.auth, emails.owner, PASSWORD)).user.uid;
  uids.operator = (await createUserWithEmailAndPassword(operator.auth, emails.operator, PASSWORD)).user.uid;

  await adminSetDoc('users', uids.owner, {
    firstName: 'Field', lastName: 'Owner', email: emails.owner, tier: 'pilot', status: 'approved',
  });
  await adminSetDoc('users', uids.operator, {
    firstName: 'Field', lastName: 'Operator', email: emails.operator, tier: 'pilot', status: 'approved', isAdmin: true,
  });
  await adminSetCustomClaim(uids.operator, { admin: true });
  await operator.auth.currentUser!.getIdToken(true);

  await adminSetDoc('projects', PROJECT, {
    name: 'Field validation fixture', status: 'analyzed', userId: uids.owner, createdAt: new Date(),
    exports: { analysis_confluence_1: 'stored', design_confluence_2: 'stored' },
  });
  await adminSetDoc('files', SEEDED_FILE, {
    name: 'z_report.abap', content: 'REPORT z_report.', userId: uids.owner, createdAt: new Date(),
  });
  await adminSetDoc('abap_examples', SEEDED_EXAMPLE, {
    name: 'z_example.abap', code: 'REPORT z_example.', userId: uids.owner, createdAt: new Date(),
  });
  await adminSetDoc('support_tickets', SEEDED_TICKET, {
    userId: uids.owner, subject: 'Question', message: 'REPORT z_report.', status: 'open', createdAt: new Date(),
  });
});

test('a new profile carries a known sign-in method, a real name and the time of its creation', async () => {
  const ref = doc(newcomer.db, 'users', uids.newcomer);
  const profile = {
    firstName: 'New',
    lastName: 'Comer',
    email: emails.newcomer,
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
  };

  expect(await denied(() => setDoc(ref, { ...profile, identityProvider: 'saml', authMethod: 'saml' })), 'unknown method').toBe(true);
  expect(await denied(() => setDoc(ref, { ...profile, identityProvider: 'google', authMethod: 'password' })), 'two methods').toBe(true);
  expect(await denied(() => setDoc(ref, { ...profile, createdAt: 'today' })), 'createdAt as text').toBe(true);
  expect(await denied(() => setDoc(ref, { ...profile, createdAt: DAY_AGO })), 'createdAt a day ago').toBe(true);
  expect(await denied(() => setDoc(ref, { ...profile, firstName: '' })), 'empty first name').toBe(true);
  expect(await denied(() => setDoc(ref, { ...profile, lastName: 'x'.repeat(101) })), 'overlong last name').toBe(true);
  expect(await denied(() => setDoc(ref, { ...profile, firstName: 42 })), 'name not text').toBe(true);

  expect(await denied(() => setDoc(ref, profile)), 'the profile the sign-up writes').toBe(false);
});

test('a registration request is created only in its initial state, for the own address', async () => {
  const ref = doc(newcomer.db, 'registration_requests', uids.newcomer);
  const request = {
    email: emails.newcomer,
    name: 'New Comer',
    motivation: 'Evaluating the analysis',
    status: 'pending',
    createdAt: serverTimestamp(),
  };

  expect(await denied(() => setDoc(ref, { ...request, tier: 'premium' })), 'extra field').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, status: 'approved' })), 'status').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, email: 'somebody@else.example' })), 'address').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, motivation: 'x'.repeat(2001) })), 'motivation length').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, name: { first: 'New' } })), 'name not text').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, createdAt: DAY_AGO })), 'createdAt a day ago').toBe(true);

  expect(await denied(() => setDoc(ref, request)), 'the request the sign-up writes').toBe(false);
});

test('a tenant access request is created only in its initial state, for the own address', async () => {
  const ref = doc(newcomer.db, 'tenant_access_requests', uids.newcomer);
  const request = {
    email: emails.newcomer,
    name: 'New Comer',
    motivation: 'Live S/4HANA Public Cloud Sandbox Connection',
    status: 'pending',
    createdAt: serverTimestamp(),
  };

  expect(await denied(() => setDoc(ref, { ...request, s4TenantAccessAllowed: true })), 'extra field').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, status: 'approved' })), 'status').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, email: 'somebody@else.example' })), 'address').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, motivation: 'x'.repeat(5001) })), 'motivation length').toBe(true);
  expect(await denied(() => setDoc(ref, { ...request, createdAt: DAY_AGO })), 'createdAt a day ago').toBe(true);

  expect(await denied(() => setDoc(ref, request)), 'the request the app writes').toBe(false);
});

test('a support ticket is created open, with bounded text and no further fields', async () => {
  const tickets = collection(owner.db, 'support_tickets');
  const ticket = {
    userId: uids.owner,
    subject: 'A question',
    message: 'How do I export the audit pack?',
    status: 'open',
    createdAt: serverTimestamp(),
  };

  expect(await denied(() => addDoc(tickets, { ...ticket, status: 'closed' })), 'status').toBe(true);
  expect(await denied(() => addDoc(tickets, { ...ticket, priority: 'urgent' })), 'extra field').toBe(true);
  expect(await denied(() => addDoc(tickets, { ...ticket, subject: 'x'.repeat(501) })), 'subject length').toBe(true);
  expect(await denied(() => addDoc(tickets, { ...ticket, message: 'x'.repeat(20001) })), 'message length').toBe(true);
  expect(await denied(() => addDoc(tickets, { ...ticket, createdAt: DAY_AGO })), 'createdAt a day ago').toBe(true);

  expect(await denied(() => addDoc(tickets, ticket)), 'the ticket the settings page writes').toBe(false);
});

test('uploads carry only their own fields, on create and on update', async () => {
  const file = { name: 'z_upload.abap', content: 'REPORT z_upload.', userId: uids.owner, createdAt: serverTimestamp() };
  const example = { name: 'z_example.abap', code: 'REPORT z_example.', userId: uids.owner, createdAt: serverTimestamp() };

  expect(await denied(() => addDoc(collection(owner.db, 'files'), { ...file, shared: true })), 'file extra field').toBe(true);
  expect(await denied(() => addDoc(collection(owner.db, 'abap_examples'), { ...example, shared: true })), 'example extra field').toBe(true);
  // Created the way the app creates them, so the stored document carries a
  // real timestamp (the seed route passes JSON, where a Date becomes text).
  const fileRef = await addDoc(collection(owner.db, 'files'), file);
  const exampleRef = await addDoc(collection(owner.db, 'abap_examples'), example);

  const oversized = 'x'.repeat(1_000_001);
  expect(await denied(() => updateDoc(fileRef, { content: oversized })), 'file content size on update').toBe(true);
  expect(await denied(() => updateDoc(exampleRef, { code: oversized })), 'example code size on update').toBe(true);
  expect(await denied(() => updateDoc(fileRef, { name: '' })), 'file name on update').toBe(true);
  expect(await denied(() => updateDoc(fileRef, { shared: true })), 'file extra field on update').toBe(true);
  expect(await denied(() => updateDoc(exampleRef, { shared: true })), 'example extra field on update').toBe(true);

  expect(await denied(() => updateDoc(fileRef, { name: 'z_renamed.abap' })), 'a rename').toBe(false);
  expect(await denied(() => updateDoc(exampleRef, { code: 'REPORT z_example2.' })), 'a code change').toBe(false);
});

test('uploads and support tickets are read by their owner only', async () => {
  for (const [col, id] of [['files', SEEDED_FILE], ['abap_examples', SEEDED_EXAMPLE], ['support_tickets', SEEDED_TICKET]]) {
    expect(await denied(() => getDoc(doc(owner.db, col, id))), `${col}: owner`).toBe(false);
    expect(await denied(() => getDoc(doc(operator.db, col, id))), `${col}: administrator`).toBe(true);
  }
  expect(await denied(() => updateDoc(doc(operator.db, 'files', SEEDED_FILE), { name: 'renamed.abap' })), 'administrator update').toBe(true);
});

test('a new project is stamped with the time of its creation and typed source', async () => {
  const project = { name: 'Typed project', status: 'uploaded', userId: uids.owner, createdAt: serverTimestamp() };
  const fresh = () => doc(owner.db, 'projects', `fields-create-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  expect(await denied(() => setDoc(fresh(), { ...project, createdAt: 'now' })), 'createdAt as text').toBe(true);
  expect(await denied(() => setDoc(fresh(), { ...project, createdAt: DAY_AGO })), 'createdAt a day ago').toBe(true);
  expect(await denied(() => setDoc(fresh(), { ...project, legacyCode: 42 })), 'source not text').toBe(true);
  expect(await denied(() => setDoc(fresh(), { ...project, fromExample: 'yes' })), 'flag not boolean').toBe(true);

  expect(await denied(() => setDoc(fresh(), { ...project, legacyCode: 'REPORT z.', fromExample: true })), 'the project the dashboard writes').toBe(false);
});

test('client-writable project fields keep their type and size', async () => {
  const ref = doc(owner.db, 'projects', PROJECT);

  expect(await denied(() => updateDoc(ref, { status: 'shipped' })), 'status').toBe(true);
  expect(await denied(() => updateDoc(ref, { s4Environment: 'production' })), 's4Environment').toBe(true);
  expect(await denied(() => updateDoc(ref, { s4Deployment: 'hybrid' })), 's4Deployment').toBe(true);
  expect(await denied(() => updateDoc(ref, { worklist: 'none' })), 'worklist').toBe(true);
  expect(await denied(() => updateDoc(ref, { extensibilityRoute: 'x'.repeat(201) })), 'extensibilityRoute').toBe(true);
  expect(await denied(() => updateDoc(ref, { businessDocumentation: 42 })), 'businessDocumentation').toBe(true);
  expect(await denied(() => updateDoc(ref, { coverageEstimate: 'high' })), 'coverageEstimate').toBe(true);
  expect(await denied(() => updateDoc(ref, { manualTestingRequirements: 'none' })), 'manualTestingRequirements').toBe(true);
  expect(await denied(() => updateDoc(ref, { updatedAt: 'now' })), 'updatedAt').toBe(true);

  // 3.0.6: the worklist is written by POST /api/runs/create only.
  expect(await denied(() => updateDoc(ref, {
    worklist: [{ id: 'w1', title: 'Finding', status: 'open' }],
  })), 'worklist from the browser').toBe(true);
  // The labels the server writes, and the ones that exist only on create.
  for (const status of ['analyzed', 'transformed', 'completed', 'uploaded', 'created']) {
    expect(await denied(() => updateDoc(ref, { status })), `status ${status}`).toBe(true);
  }
  // updatedAt is the time of the write, not a chosen one.
  expect(await denied(() => updateDoc(ref, { updatedAt: Timestamp.fromDate(new Date('2000-01-01')) })), 'back-dated updatedAt').toBe(true);
  expect(await denied(() => updateDoc(ref, { updatedAt: serverTimestamp() })), 'updatedAt of the write').toBe(false);
  // The structured test fields hold their model's keys and types.
  expect(await denied(() => updateDoc(ref, { testSuite: { code: 'x', extra: { any: 'thing' } } })), 'testSuite extra key').toBe(true);
  expect(await denied(() => updateDoc(ref, { testSuite: { code: 42 } })), 'testSuite code not text').toBe(true);
  expect(await denied(() => updateDoc(ref, { coverageEstimate: { percentage: 150, explanation: 'x', missingCoverage: 'y' } })), 'coverage above 100').toBe(true);
  expect(await denied(() => updateDoc(ref, { coverageEstimate: { percentage: 10, note: 'x' } })), 'coverage extra key').toBe(true);
  expect(await denied(() => updateDoc(ref, { extensibilityRoute: 'In-App (ABAP Cloud)' })), 'analyze: route').toBe(false);
  expect(await denied(() => updateDoc(ref, {
    solutionDesign: '{"summary":"x"}', status: 'designed', nonFunctionalRequirements: { availability: '99.5%' },
  })), 'design').toBe(false);
  expect(await denied(() => updateDoc(ref, {
    solutionDesign: '{"summary":"y"}', status: 'designed', nonFunctionalRequirements: deleteField(),
  })), 'design without NFR').toBe(false);
  expect(await denied(() => updateDoc(ref, {
    testCases: [{ id: 't1', title: 'Case', status: 'pending' }],
    testSuite: { code: 'CLASS ltc DEFINITION FOR TESTING.' },
    coverageEstimate: { percentage: 0, explanation: 'n/a', missingCoverage: 'N/A' },
    manualTestingRequirements: [],
    status: 'testing',
  })), 'testing').toBe(false);
  expect(await denied(() => setDoc(ref, { s4Environment: 'live' }, { merge: true })), 'testing: environment').toBe(false);
  expect(await denied(() => updateDoc(ref, {
    businessDocumentation: '{"summary":"x"}', generatedCode: '[]',
  })), 'documentation: business').toBe(false);
  expect(await denied(() => updateDoc(ref, {
    documentation: '# Process', generatedCode: '[]', status: 'documented',
  })), 'documentation').toBe(false);

  // Exports: the browser only removes stale entries (Analyze and Design do).
  expect(await denied(() => updateDoc(ref, { 'exports.added_by_browser': 'x' })), 'exports: an added entry').toBe(true);
  expect(await denied(() => updateDoc(ref, { 'exports.design_confluence_2': 'changed' })), 'exports: a changed entry').toBe(true);
  expect(await denied(() => updateDoc(ref, { 'exports.analysis_confluence_1': deleteField() })), 'exports: a removed entry').toBe(false);
});

test('a stage label is set only on a project an analysis has run on', async () => {
  // Created the way the dashboard creates one: before any analysis.
  const ref = doc(owner.db, 'projects', `fields-fresh-${Date.now()}`);
  await setDoc(ref, { name: 'Fresh project', status: 'uploaded', userId: uids.owner, createdAt: serverTimestamp() });
  for (const status of ['designed', 'testing', 'documented']) {
    expect(await denied(() => updateDoc(ref, { status })), `${status} before an analysis`).toBe(true);
  }
  // Other client fields on the same project still update.
  expect(await denied(() => updateDoc(ref, { s4Deployment: 'public' })), 'an edition').toBe(false);
});

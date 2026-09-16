import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc } from './helpers/admin-seed';

/**
 * The MFA gate on the trust chain, executed — not grepped.
 *
 * `tests/mfa-coverage-guard.spec.ts` asserts that each protected route contains
 * a call shaped like `assertMfaSatisfied(`. That is worth keeping as a wiring
 * check, and it proves nothing about what happens: a check moved after the
 * write, put in an unreachable branch, or called without acting on its failure
 * leaves the string in place and the route open (QA review of 33471220d6e9,
 * d943e1fc71a5). Roadmap 0.17.
 *
 * What runs here is the real refusal, against the emulators, with the token the
 * emulator can actually mint: a first-factor ID token for an account whose
 * profile requires the second. The half that matters is the second assertion in
 * each case — that the refusal left the data alone — and the third, which
 * clears the requirement and shows the same request going through, so a route
 * that is simply broken cannot pass for a route that is guarded.
 */

const db = () => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

test.describe.configure({ mode: 'serial' });

const EMAIL = `mfa-chain-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
let uid = '';
let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });
const requireFactor = (on: boolean) => adminMergeDoc('users', uid, on ? { mfaEnabled: true, mfaFactor: 'totp' } : { mfaEnabled: false });

test.beforeAll(async () => {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  await adminSetDoc('users', uid, {
    firstName: 'Chain', lastName: 'Gate', email: EMAIL, tier: 'pilot', status: 'approved', activatedAt: new Date(),
    transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION,
    mfaEnabled: false, createdAt: new Date(),
  });
});

test('a project is not deleted by a token that never met the second factor', async ({ request }: { request: APIRequestContext }) => {
  const projectId = `mfa-chain-project-${Date.now()}`;
  await adminSetDoc('projects', projectId, {
    userId: uid, name: 'Evidence that must survive a refusal', status: 'analyzed',
    legacyCode: 'REPORT z_keep.', createdAt: new Date(),
  });
  await db().collection('projects').doc(projectId).collection('runs').doc('run-1').set({ runHash: 'abc', createdAt: new Date() });

  await requireFactor(true);
  const refused = await request.delete(`/api/projects/${projectId}`, { headers: headers() });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toContain('Multi-factor authentication required');

  // The half a source grep cannot see: nothing was destroyed on the way to the refusal.
  const still = await db().collection('projects').doc(projectId).get();
  expect(still.exists, 'the project survived the refused delete').toBe(true);
  const runs = await db().collection('projects').doc(projectId).collection('runs').get();
  expect(runs.size, 'and so did its runs').toBe(1);

  // And the route is not simply broken: without the requirement, the same
  // request from the same session deletes the project.
  await requireFactor(false);
  const allowed = await request.delete(`/api/projects/${projectId}`, { headers: headers() });
  expect(allowed.status()).toBe(200);
  expect((await db().collection('projects').doc(projectId).get()).exists).toBe(false);
});

test('no run is minted by a token that never met the second factor', async ({ request }: { request: APIRequestContext }) => {
  const projectId = `mfa-chain-run-${Date.now()}`;
  await adminSetDoc('projects', projectId, {
    userId: uid, name: 'Nothing may be signed here', status: 'draft', createdAt: new Date(),
  });

  await requireFactor(true);
  const refused = await request.post('/api/runs/create', {
    headers: headers(),
    data: { projectId, legacyCode: 'REPORT z_gate.', s4Deployment: 'public', analysis: '{}' },
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toContain('Multi-factor authentication required');

  const runs = await db().collection('projects').doc(projectId).collection('runs').get();
  expect(runs.size, 'no run was written before the refusal').toBe(0);
  const profile = (await db().collection('users').doc(uid).get()).data();
  expect(profile?.transformationsUsed, 'and no quota was spent').toBe(0);

  await db().collection('projects').doc(projectId).delete();
  await requireFactor(false);
});

test('no audit pack is created by a token that never met the second factor', async ({ request }: { request: APIRequestContext }) => {
  const projectId = `mfa-chain-pack-${Date.now()}`;
  await adminSetDoc('projects', projectId, {
    userId: uid, name: 'No pack from here', status: 'analyzed', createdAt: new Date(),
  });

  await requireFactor(true);
  const refused = await request.post('/api/audit-pack/create', { headers: headers(), data: { projectId } });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toContain('Multi-factor authentication required');

  const packs = await db().collection('projects').doc(projectId).collection('audit_packs').get().catch(() => null);
  expect(packs === null || packs.size === 0, 'nothing was sealed on the way to the refusal').toBe(true);

  await db().collection('projects').doc(projectId).delete();
  await requireFactor(false);
});

test('the model proxy refuses the same token', async ({ request }: { request: APIRequestContext }) => {
  await requireFactor(true);
  const refused = await request.post('/api/gemini', { headers: headers(), data: { prompt: 'hello' } });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toContain('Multi-factor authentication required');
  await requireFactor(false);
});

test.afterAll(async () => {
  await db().collection('users').doc(uid).delete().catch(() => {});
});

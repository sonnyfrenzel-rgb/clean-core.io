import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { connectAuthToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { hasNoReleasedApiPath, NO_PATH_OBJECTS } from '../lib/abap/catalog-service';
import '../lib/abap/catalog-snapshots';

/**
 * Confirmed findings of the QA review of e7372791c70d that are held here
 * rather than in the spec of the route they touch.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

const clientApp = initializeApp(firebaseConfig, 'qa-e7372791');
const clientAuth = getAuth(clientApp);
connectAuthToEmulator(clientAuth);

async function account(prefix: string) {
  const email = disposableEmail(prefix);
  const cred = await createUserWithEmailAndPassword(clientAuth, email, EMULATOR_PASSWORD);
  const uid = cred.user.uid;
  await adminSetDoc('users', uid, {
    firstName: prefix, lastName: 'QA', email, tier: 'pilot', status: 'approved',
    transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION, createdAt: new Date(),
  });
  const signed = await signInWithEmailAndPassword(clientAuth, email, EMULATOR_PASSWORD);
  return { uid, email, token: await signed.user.getIdToken(true) };
}

/* ------------------------------------------------------------------ */

test.describe('the path verdict is read from the snapshot the grade is read from (e58171cf457b)', () => {
  test('an object the two catalogs disagree on answers per snapshot', () => {
    // `deprecated` without a successor in the Public list, `released` in the
    // PCE 2023 FPS03 list.
    expect(NO_PATH_OBJECTS.has('CL_APJ_SCP_TOOLS')).toBe(true);
    expect(hasNoReleasedApiPath('CL_APJ_SCP_TOOLS')).toBe(true);
    expect(hasNoReleasedApiPath('CL_APJ_SCP_TOOLS', 'pce-2023-3')).toBe(false);
  });

  test('a snapshot this build does not ship is refused, not answered from another', () => {
    expect(() => hasNoReleasedApiPath('KNA1', 'btp-latest')).toThrow();
  });
});

test('a proposal is written only while its project still exists (0c928a97fa2c)', () => {
  // The window is synchronous work between the gate and the write, too short
  // to stage from a spec; what is held is that the write reads the project
  // again in its own transaction and refuses when it is gone.
  const src = read('app/api/projects/[projectId]/statement-proposal/route.ts');
  const post = src.slice(src.indexOf('export async function POST'));
  const tx = post.indexOf('db.runTransaction(');
  expect(tx, 'the proposal is no longer written in a transaction').toBeGreaterThan(-1);
  const body = post.slice(tx);
  const reread = body.indexOf('await tx.get(projectRef)');
  const write = body.indexOf('tx.set(projectRef.collection(COLLECTION).doc(DOC)');
  expect(reread).toBeGreaterThan(-1);
  expect(write).toBeGreaterThan(reread);
  expect(body.slice(reread, write)).toMatch(/fresh\.exists/);
  expect(post.slice(0, tx)).not.toMatch(/\.collection\(COLLECTION\)\.doc\(DOC\)\s*\.set\(/);
});

test('a source that is not text is a 400, not a 500 (224a74e39b40)', async ({ request }) => {
  const owner = await account('qa-e737-source');
  const projectId = `qa-e737-source-${Date.now()}`;
  await adminSetDoc('projects', projectId, {
    name: 'Non-string source', userId: owner.uid, createdAt: new Date(), status: 'uploaded',
  });
  const res = await request.post('/api/runs/create', {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { projectId, legacyCode: { report: 'REPORT z.' }, s4Deployment: 'public', analysis: '{}', uploadedFileName: 'z.abap' },
  });
  expect(res.status(), await res.text()).toBe(400);
});

test('the mailed tenant links carry the nonce the request stored (2a99c0abfa99, refuted)', () => {
  // The finding read a stale comment: the approval token signs the request's
  // nonce (`lib/approval-token.ts`, `createApprovalToken`, since UX-152), and
  // both mailed links are minted with the nonce this request just stored. The
  // round trip through the route is tests/security-compliance.spec.ts; this
  // holds the minting side.
  const src = read('app/api/request-tenant-access/route.ts');
  expect(src).toContain('const nonce = await issueTenantApprovalNonce(uid);');
  expect(src).toContain("createApprovalToken(uid, 'tenant', 'approve', undefined, nonce)");
  expect(src).toContain("createApprovalToken(uid, 'tenant', 'reject', undefined, nonce)");
  const token = read('lib/approval-token.ts');
  expect(token).toContain('`${uid}.${requestType}.${action}.${exp}.${nonce}`');
});

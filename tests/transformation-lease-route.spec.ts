import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminMergeDoc, adminGetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { LEASE_COLLECTION, LEASE_GATE_REPAIR_CALLS, LEASE_WINDOW_COLLECTION } from '../lib/transformation/lease';
import { bundleFills, parseFillAnswer } from '../lib/transformation/fill-prompt';
import type { FillRequestUnit } from '../lib/transformation/types';

/**
 * The generation lease at the routes (design §11, §19 rendered), against the
 * emulators and a production build with the provider stub: the lease route
 * hands out one lease per generation, and `/api/gemini` counts a leased call
 * against it — and refuses another account's lease, an expired one, a used-up
 * one and the 5th call in flight — while a call without a lease is unchanged.
 * The hourly model limit is skipped under the emulator (`assertRateLimit`), so
 * the one unit a lease costs is held by `tests/transformation-lease.spec.ts` in
 * the route's source.
 */

const STAMP = Date.now();
const P1 = `lease-route-${STAMP}`;
const P2 = `lease-route-b-${STAMP}`;

const PROGRAM = (name: string) =>
  [`REPORT ${name}.`, 'DATA lt_mara TYPE TABLE OF mara.', 'SELECT * FROM mara INTO TABLE lt_mara UP TO 10 ROWS.', "WRITE: / 'done'."].join('\n');

let owner = { uid: '', token: '', email: '' };
let stranger = { uid: '', token: '', email: '' };
const headers = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
// Fail closed: throws unless the run targets the emulators (tests/helpers/emulator-guard.ts).
connectFirestoreToEmulator(clientDb);

async function seedProject(id: string, uid: string) {
  const source = PROGRAM(`z_${id.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}`);
  const run = `run-${id}`;
  await adminSetDoc('projects', id, {
    name: 'Lease route', userId: uid, createdAt: new Date(), status: 'designed',
    legacyCode: source, s4Deployment: 'public', activeRunId: run,
    auditMetadata: { inputFingerprint: { fileName: `${id}.abap` } },
    analysis: 'Analysis v1', solutionDesign: 'Design v1',
  });
  const inputManifest = buildInputManifest(
    analysisRunInputs({
      sourceSha256: sha256Hex(source), deploymentTarget: 'public', catalogVersion: '2026.FPS01',
      rulesetVersion: 'rules-v1.0', engineVersion: '2.15.0', model: null,
    }),
    null,
  );
  await adminSetDoc(`projects/${id}/runs`, run, { runId: run, projectId: id, userId: uid, inputManifest });
}

async function tokenOf(request: APIRequestContext, projectId: string): Promise<string> {
  const res = await request.get(`/api/projects/${projectId}/contract?for=generation`, { headers: headers(owner.token) });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.generation?.token).toMatch(/^[0-9a-f]{64}$/);
  return body.generation.token as string;
}

const lease = (request: APIRequestContext, projectId: string, generationToken: string, as = owner.token) =>
  request.post('/api/transformation/lease', { headers: headers(as), data: { projectId, generationToken, plannedCalls: 9 } });

const unit: FillRequestUnit = {
  unitId: 'U01',
  function: { name: 'readMaterials', file: 'srv/steps/01-read.ts', signature: 'export function readMaterials(): Row[]', returns: 'Row[]' },
  abap: { ranges: [{ lineStart: 3, lineEnd: 3, routine: 'START-OF-SELECTION' }], text: '0003 SELECT * FROM mara INTO TABLE lt_mara UP TO 10 ROWS.' },
  rules: [],
  guards: [],
  facts: { decimals: [] },
  available: { helpers: [], callees: [] },
};
const FILL_PROMPT = bundleFills([unit], { track: 'node', program: 'Z', context: 'Route: side-by-side.' })[0].prompt;

const gemini = (request: APIRequestContext, data: Record<string, unknown>, as = owner.token) =>
  request.post('/api/gemini', { headers: headers(as), data });

test.describe.configure({ mode: 'serial' });

let leaseId = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const make = async (name: string) => {
    const email = disposableEmail(`lease-${name}`);
    const cred = await createUserWithEmailAndPassword(auth, email, EMULATOR_PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Lease', lastName: name, email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 50, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    return { uid: cred.user.uid, token: await cred.user.getIdToken(), email };
  };
  owner = await make('owner');
  stranger = await make('stranger');
  await seedProject(P1, owner.uid);
  await seedProject(P2, owner.uid);
});

test('a lease for the owner\'s current generation; asked again, the same lease for nothing', async ({ request }) => {
  const token = await tokenOf(request, P1);
  const res = await lease(request, P1, token);
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ reused: false, lease: { projectId: P1, budget: 26, used: 0, maxInFlight: 4 } });
  expect(Object.keys(body.lease).sort()).toEqual(['budget', 'expiresAt', 'gateRepairBudget', 'gateRepairUsed', 'leaseId', 'maxInFlight', 'projectId', 'used']);
  expect(body.lease).toMatchObject({ gateRepairBudget: LEASE_GATE_REPAIR_CALLS, gateRepairUsed: 0 });
  leaseId = body.lease.leaseId;
  const again = await (await lease(request, P1, token)).json();
  expect(again).toMatchObject({ reused: true, lease: { leaseId } });
});

test('no lease for another account, for a stale state, or without a token', async ({ request }) => {
  const token = await tokenOf(request, P1);
  expect((await lease(request, P1, token, stranger.token)).status()).toBe(404);
  const stale = await lease(request, P1, '0'.repeat(64));
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('generation-stale');
  expect((await request.post('/api/transformation/lease', { data: { projectId: P1, generationToken: token, plannedCalls: 1 } })).status()).toBe(401);
});

test('a call without a lease is unchanged; a leased fill call is answered and counted against the lease', async ({ request }) => {
  const plain = await gemini(request, { prompt: 'hello', stage: 'transformation' });
  expect(plain.status(), await plain.text()).toBe(200);

  const leased = await gemini(request, {
    prompt: FILL_PROMPT, stage: 'transformation', jsonResponse: true, responseShape: 'transformation-fill',
    lease: { projectId: P1, leaseId },
  });
  expect(leased.status(), await leased.text()).toBe(200);
  const answer = parseFillAnswer((await leased.json()).text, ['U01']);
  expect(answer.ok && answer.units.map((u) => u.unitId)).toEqual(['U01']);
  const stored = await adminGetDoc(`projects/${P1}/${LEASE_COLLECTION}`, leaseId);
  expect(stored).toMatchObject({ used: 1, inFlight: 0 });
});

test('another account\'s lease, a lease spent on another stage, a malformed lease: refused before the provider', async ({ request }) => {
  const other = await gemini(request, { prompt: FILL_PROMPT, stage: 'transformation', lease: { projectId: P1, leaseId } }, stranger.token);
  expect(other.status()).toBe(403);
  expect((await other.json()).code).toBe('lease-invalid');
  const stage = await gemini(request, { prompt: 'x', stage: 'design', lease: { projectId: P1, leaseId } });
  expect(stage.status()).toBe(400);
  expect((await stage.json()).code).toBe('lease-stage');
  const bad = await gemini(request, { prompt: 'x', stage: 'transformation', lease: { projectId: '../x', leaseId } });
  expect(bad.status()).toBe(400);
  expect((await adminGetDoc(`projects/${P1}/${LEASE_COLLECTION}`, leaseId))?.used).toBe(1);
});

test('the 5th call in flight, the call past the budget and a call after expiry are refused', async ({ request }) => {
  const call = () => gemini(request, { prompt: FILL_PROMPT, stage: 'transformation', lease: { projectId: P1, leaseId } });
  // Four live slots (13.10.2026: a lease counts its in-flight calls by their slot times).
  const now = Date.now();
  await adminMergeDoc(`projects/${P1}/${LEASE_COLLECTION}`, leaseId, { inFlight: 4, slots: [now, now, now, now] });
  const busy = await call();
  expect(busy.status()).toBe(429);
  expect((await busy.json()).code).toBe('lease-busy');

  await adminMergeDoc(`projects/${P1}/${LEASE_COLLECTION}`, leaseId, { inFlight: 0, slots: [], used: 26 });
  const spent = await call();
  expect(spent.status()).toBe(429);
  expect((await spent.json()).code).toBe('lease-exhausted');

  await adminMergeDoc(`projects/${P1}/${LEASE_COLLECTION}`, leaseId, { used: 2, expiresAt: Date.now() - 1 });
  const expired = await call();
  expect(expired.status()).toBe(403);
  expect((await expired.json()).code).toBe('lease-expired');
});

test('the 4th lease in an hour is refused', async ({ request }) => {
  const now = Date.now();
  await adminSetDoc(LEASE_WINDOW_COLLECTION, owner.uid, { issued: [now - 3000, now - 2000, now - 1000], expiresAt: new Date(now + 3_600_000) });
  const res = await lease(request, P2, await tokenOf(request, P2));
  expect(res.status()).toBe(429);
  expect((await res.json()).code).toBe('lease-hourly-limit');
});

test('a browser signed in as the owner reads and writes neither the lease nor the lease window', async () => {
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, owner.email, EMULATOR_PASSWORD);
  expect(auth.currentUser?.uid, 'the client SDK is not signed in as the owner').toBe(owner.uid);
  // Both records exist (the tests above wrote them), so a refusal is the rules and not a missing document.
  expect(await adminGetDoc(`projects/${P1}/${LEASE_COLLECTION}`, leaseId)).toBeTruthy();
  expect(await adminGetDoc(LEASE_WINDOW_COLLECTION, owner.uid)).toBeTruthy();

  const leaseDoc = doc(clientDb, 'projects', P1, LEASE_COLLECTION, leaseId);
  await expect(getDoc(leaseDoc)).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setDoc(leaseDoc, { used: 0, inFlight: 0 }, { merge: true })).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setDoc(doc(clientDb, 'projects', P1, LEASE_COLLECTION, 'forged'), { budget: 999 })).rejects.toMatchObject({ code: 'permission-denied' });
  const windowDoc = doc(clientDb, LEASE_WINDOW_COLLECTION, owner.uid);
  await expect(getDoc(windowDoc)).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(setDoc(windowDoc, { issued: [] })).rejects.toMatchObject({ code: 'permission-denied' });

  // …while the same session reads the project itself, so the refusals above are
  // the rules and not a signed-out client.
  expect((await getDoc(doc(clientDb, 'projects', P1))).exists()).toBe(true);
});

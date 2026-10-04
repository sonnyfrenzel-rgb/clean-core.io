import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { buildRequirementSet } from '../lib/functional-requirements';
import { buildNfrSet } from '../lib/non-functional-requirements';
import { answerDecision, buildSpecDraft, specForSave, SPEC_LIMITS, type SpecRecord } from '../lib/requirements-spec';

/**
 * The route that stores the requirements specification (ADR-078), against
 * the emulators and the real route: who may read and write, what is refused
 * before anything is stored, that who answered a decision and on which source
 * the document stands are the server's, and that two tabs cannot overwrite each
 * other. The MFA gate is knocked on by `tests/mfa-trust-chain-gate.spec.ts`
 * through `tests/helpers/gated-routes.ts`.
 */

const STAMP = Date.now();
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `reqspec-route-${STAMP}`;
const RUN_ID = `reqspec-route-run-${STAMP}`;
const route = `/api/projects/${PROJECT_ID}/requirements-spec`;
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
const SHA = sha256Hex(SOURCE);

let token = '';
let readerToken = '';
let strangerToken = '';
let ownerEmail = '';
let ownerUid = '';
const headers = (t = token) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

const SPEC = specForSave(buildSpecDraft({ projectName: 'Spec route', fr: buildRequirementSet({ source: SOURCE }), nfr: buildNfrSet({ source: SOURCE }) }));
const body = (over: Record<string, unknown> = {}) => ({ spec: SPEC, baseRevision: 0, derivedFrom: SHA, change: 'Started the specification from the code', ...over });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const make = async (name: string) => {
    const email = `reqspec-${name}-${STAMP}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(auth, email, SIGN_IN);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Spec', lastName: name, email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 50, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    return { uid: cred.user.uid, token: await cred.user.getIdToken(), email };
  };
  const stranger = await make('stranger');
  const reader = await make('reader');
  const owner = await make('owner');
  token = owner.token;
  readerToken = reader.token;
  strangerToken = stranger.token;
  ownerEmail = owner.email;
  ownerUid = owner.uid;
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Spec route', userId: owner.uid, readers: [reader.uid], createdAt: new Date(), status: 'analyzed',
    legacyCode: SOURCE, activeRunId: RUN_ID, auditMetadata: { inputFingerprint: { sha256: SHA, fileName: 'Z_MM_PO_APPROVAL.abap' } },
  });
  await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
    runId: RUN_ID, projectId: PROJECT_ID, userId: owner.uid, createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: { sha256: SHA },
  });
});

test('without a token, nothing', async ({ request }) => {
  expect((await request.get(route)).status()).toBe(401);
  expect((await request.post(route, { data: body() })).status()).toBe(401);
});

test('nothing stored yet reads as null, not as an error', async ({ request }) => {
  const res = await request.get(route, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  expect(await res.json()).toEqual({ record: null });
});

test('garbage, unknown keys, foreign values and oversized bodies are refused — and nothing is stored', async ({ request }) => {
  const raw = (text: string, contentType = 'application/json') =>
    request.post(route, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, data: text });
  expect((await raw('not json')).status()).toBe(400);
  expect((await raw(JSON.stringify(body()), 'text/plain')).status()).toBe(415);
  expect((await request.post(route, { headers: headers(), data: {} })).status()).toBe(400);
  const unknown = await request.post(route, { headers: headers(), data: body({ savedBy: 'me' }) });
  expect(unknown.status()).toBe(400);
  expect((await unknown.json()).field).toBe('savedBy');
  const status = await request.post(route, { headers: headers(), data: body({ spec: { ...SPEC, requirements: [{ ...SPEC.requirements[0], status: 'proven' }] } }) });
  expect(status.status()).toBe(400);
  expect((await status.json()).field).toBe('spec.requirements[0].status');
  const extraKey = await request.post(route, { headers: headers(), data: body({ spec: { ...SPEC, admin: true } }) });
  expect(extraKey.status()).toBe(400);
  const huge = await raw(JSON.stringify(body({ change: 'x' })).replace('"change":"x"', `"change":"x","pad":"${'x'.repeat(SPEC_LIMITS.maxBodyChars)}"`));
  expect(huge.status()).toBe(413);
  // A source nobody signed.
  const basis = await request.post(route, { headers: headers(), data: body({ derivedFrom: 'f'.repeat(64) }) });
  expect(basis.status()).toBe(409);
  expect((await basis.json()).code).toBe('basis');
  expect(await adminGetDoc(`projects/${PROJECT_ID}/requirements_spec`, 'current')).toBeFalsy();
});

test('the owner stores it; the revision, the time and the author are the server’s; the summary lands on the project', async ({ request }) => {
  const runBefore = await adminGetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID);
  const res = await request.post(route, { headers: headers(), data: body() });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: SpecRecord };
  expect(record.revision).toBe(1);
  expect(record.savedBy).toBe(ownerEmail);
  expect(record.derivedFrom).toBe(SHA);
  expect(record.history).toEqual([expect.objectContaining({ revision: 1, by: ownerEmail, change: 'Started the specification from the code' })]);
  const stored = await adminGetDoc(`projects/${PROJECT_ID}/requirements_spec`, 'current');
  expect(stored?.savedByUid).toBe(ownerUid);
  const project = await adminGetDoc('projects', PROJECT_ID);
  expect(project?.requirementsSpec).toMatchObject({ revision: 1, derivedFrom: SHA, functional: expect.any(Number), openDecisions: expect.any(Number) });
  // Not evidence: the signed run is untouched.
  expect(await adminGetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID)).toEqual(runBefore);
});

test('a decision is stamped with the account and the server’s clock, never with what the browser says', async ({ request }) => {
  const answered = answerDecision(SPEC, 'D-TBD-13', { kind: 'value', value: '95 % of cases within 2 s' });
  const forged = JSON.parse(JSON.stringify(answered));
  forged.decisions.find((d: { id: string }) => d.id === 'D-TBD-13').answer.by = 'ceo@example.com';
  const res = await request.post(route, { headers: headers(), data: body({ spec: forged, baseRevision: 1, change: 'Decided D-TBD-13' }) });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: SpecRecord };
  const d = record.spec.decisions.find((x) => x.id === 'D-TBD-13')!;
  expect(d.answer).toMatchObject({ kind: 'value', value: '95 % of cases within 2 s', by: ownerEmail });
  expect(Date.parse(d.answer!.at!)).toBeGreaterThan(Date.now() - 5 * 60_000);
  expect(record.revision).toBe(2);
});

test('a save over a newer revision is refused with 409 and stores nothing', async ({ request }) => {
  const stale = await request.post(route, { headers: headers(), data: body({ baseRevision: 1, change: 'From an old tab' }) });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ code: 'conflict', revision: 2 });
  const stored = await adminGetDoc(`projects/${PROJECT_ID}/requirements_spec`, 'current');
  expect(stored?.revision).toBe(2);
});

test('an invited reader reads it and cannot write it; a stranger gets 404 on both verbs', async ({ request }) => {
  const read = await request.get(route, { headers: headers(readerToken) });
  expect(read.status()).toBe(200);
  expect(((await read.json()) as { record: SpecRecord }).record.revision).toBe(2);
  expect((await request.post(route, { headers: headers(readerToken), data: body({ baseRevision: 2 }) })).status()).toBe(404);
  expect((await request.get(route, { headers: headers(strangerToken) })).status()).toBe(404);
  expect((await request.post(route, { headers: headers(strangerToken), data: body({ baseRevision: 2 }) })).status()).toBe(404);
  expect((await adminGetDoc(`projects/${PROJECT_ID}/requirements_spec`, 'current'))?.revision).toBe(2);
});

test('a client cannot write the summary on the project itself — only the route can', async () => {
  const app = initializeApp(firebaseConfig, `reqspec-rules-${Date.now()}`);
  const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
  const auth = getAuth(app);
  connectFirestoreToEmulator(db);
  connectAuthToEmulator(auth);
  await signInWithEmailAndPassword(auth, ownerEmail, SIGN_IN);
  await expect(updateDoc(doc(db, 'projects', PROJECT_ID), { requirementsSpec: { revision: 99 } })).rejects.toThrow();
  await expect(setDoc(doc(db, 'projects', PROJECT_ID, 'requirements_spec', 'current'), { revision: 99 })).rejects.toThrow();
  await expect(getDoc(doc(db, 'projects', PROJECT_ID, 'requirements_spec', 'current'))).rejects.toThrow();
});

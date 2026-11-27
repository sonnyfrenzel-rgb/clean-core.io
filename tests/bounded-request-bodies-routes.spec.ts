import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { oversizedRequests } from './helpers/oversized-request';
import { TERMS_VERSION } from '../lib/constants';
import { getAdminAuth, getAdminDb } from '../lib/firebase-admin';
import { SMALL_REQUEST_BODY_LIMITS } from '../lib/url-validation';
import { POST as ownKeySavePOST } from '../app/api/secrets/gemini/route';
import { POST as ownKeyTestPOST } from '../app/api/secrets/gemini/test/route';
import { DELETE as readersDELETE } from '../app/api/projects/[projectId]/readers/route';
import { POST as invitationsPOST } from '../app/api/projects/[projectId]/invitations/route';
import { POST as modelStagesPOST } from '../app/api/model-stages/route';
import { POST as abcdClassifyPOST } from '../app/api/abcd-classify/route';

/**
 * The signed-in routes that read their body under a bound answer an oversized one with 413 — a declared length over
 * the bound, and a stream without a length — and change nothing. The handlers run in this process against the
 * Firestore and Auth emulators (no app server): every one of them checks the account before it reads the body, so the
 * request carries a real emulator token of an account that passes those gates. The public routes are in
 * tests/bounded-request-bodies.spec.ts; the reader itself and the source guard over every named route are there too.
 */

const STAMP = Date.now();
const EMAIL = `bounded-bodies-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `bounded-bodies-${STAMP}`;

let uid = '';
let idToken = '';

test.describe.configure({ mode: 'serial' });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'no emulator host: this spec would reach a real database').toBeTruthy();
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  const { db } = await getAdminDb();
  await db.collection('users').doc(uid).set({
    firstName: 'Bounded', lastName: 'Bodies', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  await db.collection('projects').doc(PROJECT_ID).set({ userId: uid, name: 'Bounded bodies', readers: ['someone-else'], createdAt: new Date() });
});

test.afterAll(async () => {
  const { db } = await getAdminDb();
  await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
  await db.collection('projects').doc(PROJECT_ID).delete().catch(() => {});
  await db.collection('users').doc(uid).delete().catch(() => {});
  if (uid) await (await getAdminAuth()).deleteUser(uid).catch(() => {});
});

type Handler = (req: never, ctx: { params: Promise<{ projectId: string }> }) => Promise<Response>;

const ROUTES: Array<{ name: string; handler: Handler; url: string; method: string; maxBytes: number }> = [
  { name: 'POST /api/secrets/gemini', handler: ownKeySavePOST as unknown as Handler, url: 'http://localhost/api/secrets/gemini', method: 'POST', maxBytes: SMALL_REQUEST_BODY_LIMITS.maxBytes },
  { name: 'POST /api/secrets/gemini/test', handler: ownKeyTestPOST as unknown as Handler, url: 'http://localhost/api/secrets/gemini/test', method: 'POST', maxBytes: SMALL_REQUEST_BODY_LIMITS.maxBytes },
  { name: 'POST /api/model-stages', handler: modelStagesPOST as unknown as Handler, url: 'http://localhost/api/model-stages', method: 'POST', maxBytes: SMALL_REQUEST_BODY_LIMITS.maxBytes },
  { name: 'DELETE /api/projects/[id]/readers', handler: readersDELETE as unknown as Handler, url: `http://localhost/api/projects/${PROJECT_ID}/readers`, method: 'DELETE', maxBytes: SMALL_REQUEST_BODY_LIMITS.maxBytes },
  { name: 'POST /api/projects/[id]/invitations', handler: invitationsPOST as unknown as Handler, url: `http://localhost/api/projects/${PROJECT_ID}/invitations`, method: 'POST', maxBytes: SMALL_REQUEST_BODY_LIMITS.maxBytes },
  // Its own bound: 500 objects and 500 function modules fit (below).
  { name: 'POST /api/abcd-classify', handler: abcdClassifyPOST as unknown as Handler, url: 'http://localhost/api/abcd-classify', method: 'POST', maxBytes: 256 * 1024 },
];

for (const route of ROUTES) {
  test(`${route.name}: an oversized body is answered with 413, read no further than the bound, and changes nothing`, async () => {
    const { db } = await getAdminDb();
    for (const { kind, request, pulled, maxPulls } of oversizedRequests(route.url, route.maxBytes, {
      method: route.method,
      headers: { Authorization: `Bearer ${idToken}` },
    })) {
      const res = await route.handler(request() as never, { params: Promise.resolve({ projectId: PROJECT_ID }) });
      expect(res.status, `${route.name}, ${kind}: ${await res.clone().text()}`).toBe(413);
      expect(await res.json(), `${route.name}, ${kind}`).toMatchObject({ code: 'too-large' });
      expect(pulled(), `${route.name}, ${kind}: the body was read past the bound`).toBeLessThanOrEqual(maxPulls);
    }
    // Nothing the routes would write is there: no own key, no profile change, the project's readers as seeded.
    const secrets = await db.collection('user_secrets').doc(uid).collection('providers').get();
    expect(secrets.size, 'an own key was stored').toBe(0);
    const profile = (await db.collection('users').doc(uid).get()).data() ?? {};
    expect(profile.byokConfigured).toBeUndefined();
    const project = (await db.collection('projects').doc(PROJECT_ID).get()).data() ?? {};
    expect(project.readers).toEqual(['someone-else']);
  });
}

test('a body within the bound still reaches the route (the 413 above is the bound, not the gate)', async () => {
  const res = await readersDELETE(
    new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/readers`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ projectId: PROJECT_ID }) },
  );
  expect(res.status, await res.clone().text()).toBe(400);
  expect(await res.json()).toEqual({ error: 'Missing uid.' });
});

test('POST /api/abcd-classify: the largest batch it allows fits its bound, and a name no SAP object can have is skipped', async () => {
  const classify = (body: unknown) =>
    abcdClassifyPOST(
      new NextRequest('http://localhost/api/abcd-classify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  // 500 objects with a use and 500 function modules, every name at the longest length still looked up.
  const name = (i: number) => `Z${'N'.repeat(115)}${String(i).padStart(4, '0')}`;
  const full = await classify({
    objects: Array.from({ length: 500 }, (_, i) => ({ name: name(i), use: 'write' })),
    functionModules: Array.from({ length: 500 }, (_, i) => name(i)),
  });
  expect(full.status, await full.clone().text()).toBe(200);

  const long = 'Z'.repeat(121);
  const res = await classify({ objects: ['MARA', long, { name: long, use: 'read' }] });
  expect(res.status, await res.clone().text()).toBe(200);
  const answer = (await res.json()) as { grades: Record<string, unknown>; noPath: Record<string, unknown> };
  expect(Object.keys(answer.noPath)).toEqual(['MARA']);
  expect(Object.keys(answer.grades)).toEqual(['MARA']);
  // A body that is not JSON is refused as before.
  const bad = await abcdClassifyPOST(
    new NextRequest('http://localhost/api/abcd-classify', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, body: 'not json' }),
  );
  expect(bad.status).toBe(400);
});

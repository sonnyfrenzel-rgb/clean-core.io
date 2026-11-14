import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { emptyCustomerTexts, type CustomerTexts } from '../lib/abap/customer-texts';

/**
 * The route that stores a project's customer texts (`app/api/projects/[projectId]/customer-texts/route.ts`),
 * against the emulators and the real route: the owner's texts are stored and read back, a second write replaces
 * the first, and a body that is not texts, a stranger and a caller without a token are refused and leave what is
 * stored as it was. `tests/project-access-matrix.spec.ts` holds the refusal of every role on every verb; this
 * holds what lands in the store.
 */

const STAMP = Date.now();
const EMAIL = `customer-texts-${STAMP}@cleancore-test.io`;
const OTHER_EMAIL = `customer-texts-other-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `customer-texts-${STAMP}`;
const path_ = `/api/projects/${PROJECT_ID}/customer-texts`;

let token = '';
let otherToken = '';
const headers = (t = token) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

const FIRST: CustomerTexts = { ...emptyCustomerTexts(), tables: { zsd_minmenge: 'Minimum quantities per customer' }, fields: { profl: 'Dangerous goods profile' } };
const SECOND: CustomerTexts = { ...emptyCustomerTexts(), tables: { zsd_minmenge: 'Agreed minimum quantities' }, values: { zhold: { B: 'Blocking' } } };

async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

async function stored(): Promise<unknown> {
  return (await adminGetDoc(`projects/${PROJECT_ID}/customer_texts`, 'current'))?.texts ?? null;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const other = await createUserWithEmailAndPassword(auth, OTHER_EMAIL, SIGN_IN);
  otherToken = await other.user.getIdToken();
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  token = await cred.user.getIdToken();
  for (const [id, email] of [[cred.user.uid, EMAIL], [other.user.uid, OTHER_EMAIL]]) {
    await adminSetDoc('users', id, {
      firstName: 'Customer', lastName: 'Texts', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 50, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
  }
  await adminSetDoc('projects', PROJECT_ID, { name: 'Customer texts', userId: cred.user.uid, createdAt: new Date(), status: 'uploaded', legacyCode: 'REPORT z.' });
});

test('nothing stored reads as none; the owner\'s texts are stored and read back as sent', async ({ request }) => {
  const none = await request.get(path_, { headers: headers() });
  expect(none.status(), await none.text()).toBe(200);
  expect(await none.json()).toEqual({ texts: null });

  const res = await request.post(path_, { headers: headers(), data: { texts: FIRST } });
  expect(res.status(), await res.text()).toBe(200);
  expect(await res.json()).toEqual({ stored: true });
  expect(await stored()).toEqual(FIRST);
  const read = await request.get(path_, { headers: headers() });
  expect(await read.json()).toEqual({ texts: FIRST });
});

test('a second write replaces the first, it does not merge', async ({ request }) => {
  const res = await request.post(path_, { headers: headers(), data: { texts: SECOND } });
  expect(res.status(), await res.text()).toBe(200);
  expect(await stored()).toEqual(SECOND);
  expect(((await (await request.get(path_, { headers: headers() })).json()) as { texts: CustomerTexts }).texts.fields).toEqual({});
});

test('a body that is not texts, a stranger and no token are refused, and the stored texts stay as they were', async ({ request }) => {
  expect((await request.post(path_, { headers: headers(), data: {} })).status()).toBe(400);
  expect((await request.post(path_, { headers: headers(), data: { texts: { ...SECOND, version: 'x' } } })).status()).toBe(400);
  expect((await request.post(path_, { headers: headers(), data: { texts: { ...SECOND, tables: ['zsd_minmenge'] } } })).status()).toBe(400);
  expect((await request.post(path_, { headers: headers(otherToken), data: { texts: FIRST } })).status()).toBe(404);
  expect((await request.get(path_, { headers: headers(otherToken) })).status()).toBe(404);
  expect((await request.post(path_, { headers: { 'Content-Type': 'application/json' }, data: { texts: FIRST } })).status()).toBe(401);
  expect((await request.post(path_, { headers: headers('not-a-token'), data: { texts: FIRST } })).status()).toBe(401);
  expect(await stored(), 'a refused write changed the stored texts').toEqual(SECOND);
});

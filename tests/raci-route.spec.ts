import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { RACI_EDIT_COLLECTION, RACI_EDIT_DOC, type RaciEditRecord } from '../lib/raci-edit';
import { businessLayerFor, describedSteps, engineDocumentationOf, fixtureSource } from './helpers/business-layer-fixture';

/**
 * The owner's RACI write route against the emulators and the real route (QA
 * review of d939fb5b056b, b72552263793 / f7f44e4bf540): the revision, layer and
 * step checks were held by source text in tests/raci-guard.spec.ts. Here each
 * refusal is sent and the stored record is read back unchanged.
 */

const STAMP = Date.now();
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `raci-route-${STAMP}`;
const path_ = `/api/projects/${PROJECT_ID}/raci`;
const RECORD_PATH = `projects/${PROJECT_ID}/${RACI_EDIT_COLLECTION}`;

const SOURCE = fixtureSource();
const DOC = engineDocumentationOf(SOURCE);
const LAYER = JSON.stringify(businessLayerFor(DOC));
const LAYER_SHA = sha256Hex(LAYER);
const [STEP_A, STEP_B] = describedSteps(DOC).map((s) => s.id);

let token = '';
let readerToken = '';
const headers = (t = token) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

/** A write the local emulator answers with "2 UNKNOWN" may still have landed; read back before failing. */
async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

function payload(over: Record<string, unknown> = {}) {
  return {
    baseRevision: 0,
    layerSha256: LAYER_SHA,
    roles: ['Process Owner', 'Clerk'],
    steps: [{ stepId: STEP_A, cells: ['A', 'R'] }],
    ...over,
  };
}

const stored = async () => (await adminGetDoc(RECORD_PATH, RACI_EDIT_DOC)) as (RaciEditRecord & Record<string, unknown>) | null;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  expect(STEP_A && STEP_B, 'the fixture has at least two described steps').toBeTruthy();
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const make = async (name: string) => {
    const email = `raci-route-${name}-${STAMP}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(auth, email, SIGN_IN);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Raci', lastName: name, email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 50, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    return { uid: cred.user.uid, token: await cred.user.getIdToken() };
  };
  const reader = await make('reader');
  const owner = await make('owner');
  token = owner.token;
  readerToken = reader.token;
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'RACI route', userId: owner.uid, readers: [reader.uid], createdAt: new Date(), status: 'documented',
    legacyCode: SOURCE,
    documentation: JSON.stringify(DOC),
    businessDocumentation: LAYER,
  });
});

test('the owner saves on revision 0 and gets revision 1', async ({ request }) => {
  const res = await request.post(path_, { headers: headers(), data: payload() });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: RaciEditRecord };
  expect(record.revision).toBe(1);
  expect(record.steps).toEqual([{ stepId: STEP_A, cells: ['A', 'R'] }]);
  expect((await stored())?.revision).toBe(1);
});

test('a save on a revision that has moved is refused, and the stored RACI stays as it was', async ({ request }) => {
  const res = await request.post(path_, {
    headers: headers(),
    data: payload({ baseRevision: 0, steps: [{ stepId: STEP_A, cells: ['R', 'A'] }] }),
  });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ code: 'revision-moved', latest: 1 });
  const after = await stored();
  expect(after?.revision).toBe(1);
  expect(after?.steps).toEqual([{ stepId: STEP_A, cells: ['A', 'R'] }]);
});

test('a save on a proposal that was replaced is refused, and nothing is stored', async ({ request }) => {
  const res = await request.post(path_, {
    headers: headers(),
    data: payload({ baseRevision: 1, layerSha256: sha256Hex(`${LAYER} `), steps: [{ stepId: STEP_A, cells: ['R', 'A'] }] }),
  });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ code: 'layer-changed' });
  const after = await stored();
  expect(after?.revision).toBe(1);
  expect(after?.steps).toEqual([{ stepId: STEP_A, cells: ['A', 'R'] }]);
});

test('a step the process does not have is refused by name, and nothing is stored', async ({ request }) => {
  const res = await request.post(path_, {
    headers: headers(),
    data: payload({ baseRevision: 1, steps: [{ stepId: 'Task_not_in_process', cells: ['A', 'R'] }] }),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ code: 'unknown-step', field: 'steps' });
  expect((await stored())?.revision).toBe(1);
});

test('an invited reader reads the RACI and cannot write it', async ({ request }) => {
  const read = await request.get(path_, { headers: headers(readerToken) });
  expect(read.status()).toBe(200);
  expect(((await read.json()) as { record: RaciEditRecord }).record.revision).toBe(1);
  const write = await request.post(path_, { headers: headers(readerToken), data: payload({ baseRevision: 1 }) });
  expect(write.status()).toBe(404);
  expect((await stored())?.revision).toBe(1);
});

test('the current revision is accepted and moves on by one', async ({ request }) => {
  const res = await request.post(path_, {
    headers: headers(),
    data: payload({ baseRevision: 1, steps: [{ stepId: STEP_A, cells: ['R', 'A'] }, { stepId: STEP_B, cells: ['', 'I'] }] }),
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await stored())?.revision).toBe(2);
});

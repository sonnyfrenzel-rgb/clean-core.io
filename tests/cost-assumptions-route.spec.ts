import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { ECONOMICS_LIMITS, ECONOMICS_START_INPUTS, serializeEconomics, type EconomicsRecord } from '../lib/economics-record';
import { initialCostAssumptions } from '../components/tco/OptionComparison';

/**
 * The route that stores the Economics figures (owner report 03.10.2026),
 * against the emulators and the real route: who may read and write, what is
 * refused before anything is stored, and that the basis — the signed run and
 * its score — is the server's, not the browser's. The MFA gate is knocked on
 * by `tests/mfa-trust-chain-gate.spec.ts` through `tests/helpers/gated-routes.ts`.
 */

const STAMP = Date.now();
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `cost-route-${STAMP}`;
const RUN_ID = `cost-route-run-${STAMP}`;
const path_ = `/api/projects/${PROJECT_ID}/cost-assumptions`;

let token = '';
let readerToken = '';
let strangerToken = '';
const headers = (t = token) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

/** A write the local emulator answers with "2 UNKNOWN" may still have landed; read back before failing. */
async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

function payload(devDayRate: number | null = 820) {
  return JSON.parse(
    serializeEconomics({
      assumptions: { ...initialCostAssumptions(), currency: 'EUR', devDayRate, testDayRate: 640, horizonYears: 5 },
      inputs: { ...ECONOMICS_START_INPUTS, oneTimeBudget: 40000 },
    }),
  );
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const make = async (name: string) => {
    const email = `cost-route-${name}-${STAMP}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(auth, email, SIGN_IN);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Cost', lastName: name, email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      transformationsUsed: 0, transformationsLimit: 50, termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    return { uid: cred.user.uid, token: await cred.user.getIdToken() };
  };
  const stranger = await make('stranger');
  const reader = await make('reader');
  const owner = await make('owner');
  token = owner.token;
  readerToken = reader.token;
  strangerToken = stranger.token;
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Cost route', userId: owner.uid, readers: [reader.uid], createdAt: new Date(), status: 'analyzed',
    legacyCode: "REPORT z_cost.\nWRITE / 'x'.", activeRunId: RUN_ID,
  });
  await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
    runId: RUN_ID, projectId: PROJECT_ID, userId: owner.uid, createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
  });
});

test('without a token, nothing', async ({ request }) => {
  expect((await request.get(path_)).status()).toBe(401);
  expect((await request.post(path_, { data: payload() })).status()).toBe(401);
});

test('nothing stored yet reads as null, not as an error', async ({ request }) => {
  const res = await request.get(path_, { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  expect(await res.json()).toEqual({ record: null });
});

test('the owner stores the figures; the basis is the signed run, read by the server', async ({ request }) => {
  const runBefore = await adminGetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID);
  const res = await request.post(path_, { headers: headers(), data: payload() });
  expect(res.status(), await res.text()).toBe(200);
  const { record } = (await res.json()) as { record: EconomicsRecord };
  expect(record.assumptions.devDayRate).toBe(820);
  expect(record.inputs.oneTimeBudget).toBe(40000);
  expect(record.basis).toEqual({ runId: RUN_ID, score: 62 });
  expect(record.revision).toMatch(/^unconfirmed:EUR@5y/);

  const stored = await adminGetDoc(`projects/${PROJECT_ID}/cost_assumptions`, 'current');
  expect(stored?.assumptions?.currency).toBe('EUR');
  // Economics is a scenario, not evidence: the signed run is untouched.
  expect(await adminGetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID)).toEqual(runBefore);

  const read = await request.get(path_, { headers: headers() });
  expect(((await read.json()) as { record: EconomicsRecord }).record.assumptions.testDayRate).toBe(640);
});

test('an invited reader reads the figures and cannot write them', async ({ request }) => {
  const read = await request.get(path_, { headers: headers(readerToken) });
  expect(read.status()).toBe(200);
  expect(((await read.json()) as { record: EconomicsRecord }).record.assumptions.devDayRate).toBe(820);
  const write = await request.post(path_, { headers: headers(readerToken), data: payload(1) });
  expect(write.status()).toBe(404);
  const stored = await adminGetDoc(`projects/${PROJECT_ID}/cost_assumptions`, 'current');
  expect(stored?.assumptions?.devDayRate).toBe(820);
});

test('a stranger gets 404 on both verbs', async ({ request }) => {
  expect((await request.get(path_, { headers: headers(strangerToken) })).status()).toBe(404);
  expect((await request.post(path_, { headers: headers(strangerToken), data: payload() })).status()).toBe(404);
});

test('garbage, NaN, Infinity and out-of-bounds figures are refused and nothing is stored', async ({ request }) => {
  const raw = (text: string) => request.post(path_, { headers: headers(), data: text });
  expect((await raw('not json')).status()).toBe(400);
  // JSON has no NaN; a body that spells it is not JSON.
  expect((await raw(JSON.stringify(payload()).replace('"devDayRate":820', '"devDayRate":NaN'))).status()).toBe(400);
  // 1e999 parses to Infinity.
  const inf = await raw(JSON.stringify(payload()).replace('"devDayRate":820', '"devDayRate":1e999'));
  expect(inf.status()).toBe(400);
  expect((await inf.json()).field).toBe('devDayRate');
  const negative = await request.post(path_, { headers: headers(), data: payload(-5) });
  expect(negative.status()).toBe(400);
  expect(await negative.json()).toMatchObject({ field: 'devDayRate', code: 'invalid' });
  const text = await request.post(path_, { headers: headers(), data: { ...payload(), assumptions: { ...payload().assumptions, devDayRate: '820' } } });
  expect(text.status()).toBe(400);
  const extra = await request.post(path_, { headers: headers(), data: { ...payload(), admin: true } });
  expect(extra.status()).toBe(400);
  // The basis is the server's: a browser that sends one is refused.
  const basis = await request.post(path_, { headers: headers(), data: { ...payload(), basis: { runId: 'mine', score: 100 } } });
  expect(basis.status()).toBe(400);
  const huge = await raw(JSON.stringify({ ...payload(), pad: 'x'.repeat(ECONOMICS_LIMITS.maxBodyChars) }));
  expect(huge.status()).toBe(413);

  const stored = await adminGetDoc(`projects/${PROJECT_ID}/cost_assumptions`, 'current');
  expect(stored?.assumptions?.devDayRate, 'a refused body changed the stored figures').toBe(820);
});

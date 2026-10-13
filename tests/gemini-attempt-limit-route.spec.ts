import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, disposableEmail, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { LEASE_COLLECTION, LEASE_CODES } from '../lib/transformation/lease';
import { ATTEMPT_LIMIT_CODE, GEMINI_ATTEMPT_ALLOWANCES } from '../lib/attempt-limit';

/**
 * The request-attempt limit at the route (docs/design/gemini-attempt-limit.md
 * §4 item 2), against the emulators and the test server with the provider stub.
 *
 * One account sends each refused request in a loop — a body that is not JSON,
 * a lease in a bad shape, an unknown lease, a valid lease with an unknown
 * answer shape — and, for comparison, a request without a lease that the stub
 * answers. The first attempts get their own answer; every attempt past the
 * allowance gets 429 `attempt-limit` with a `Retry-After`; a second account in
 * the same loop is unaffected. The limiter is in memory and is not skipped
 * under the emulator flag, which is what makes it observable here.
 *
 * The real allowance is used — there is no test-only setting that could
 * change it — so each loop is 61 requests to a fresh account, which keeps it
 * short. If a slow machine stretches a loop past the minute window, the hour
 * still ends it (at most 301), and the assertion on the exact count is then
 * left out rather than made flaky.
 *
 * That a spent allowance costs no Firestore operation cannot be seen over
 * HTTP; `scripts/measure-gemini-refusals.ts` counts the RPCs in-process.
 */

const PER_MINUTE = GEMINI_ATTEMPT_ALLOWANCES[0].max;
const PER_HOUR = GEMINI_ATTEMPT_ALLOWANCES[GEMINI_ATTEMPT_ALLOWANCES.length - 1].max;
const STAMP = Date.now();
const PROJECT = `attempt-limit-${STAMP}`;
const LEASE_ID = `attemptLease${STAMP}`;

type Account = { uid: string; token: string };
let bystander: Account;

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

async function account(name: string): Promise<Account> {
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const email = disposableEmail(`attempt-${name}`);
  const cred = await createUserWithEmailAndPassword(auth, email, EMULATOR_PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Attempt', lastName: name, email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  return { uid: cred.user.uid, token: await cred.user.getIdToken() };
}

async function openLease(uid: string, leaseId: string) {
  const now = Date.now();
  await adminSetDoc(`projects/${PROJECT}/${LEASE_COLLECTION}`, leaseId, {
    v: 1, leaseId, projectId: PROJECT, uid, generationToken: 't', plannedCalls: 10, budget: 28,
    used: 0, inFlight: 0, status: 'open', createdAt: now, expiresAt: now + 60 * 60 * 1000,
  });
}

const post = (request: APIRequestContext, as: Account, data: string | Record<string, unknown>) =>
  request.post('/api/gemini', {
    headers: { Authorization: `Bearer ${as.token}`, 'Content-Type': 'application/json' },
    data,
  });

async function codeOf(res: APIResponse): Promise<unknown> {
  try {
    return ((await res.json()) as { code?: unknown }).code;
  } catch {
    return undefined;
  }
}

/** Send `send` until the attempt limit answers; check every answer before it. */
async function loopUntilLimited(
  request: APIRequestContext,
  send: () => Promise<APIResponse>,
  own: { status: number; code?: string },
): Promise<void> {
  const started = Date.now();
  let refusedAt = 0;
  for (let i = 1; i <= PER_HOUR + 1; i++) {
    const res = await send();
    const code = await codeOf(res);
    if (code === ATTEMPT_LIMIT_CODE) {
      refusedAt = i;
      expect(res.status()).toBe(429);
      const retryAfter = Number(res.headers()['retry-after']);
      expect(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 3600, `Retry-After ${retryAfter}`).toBe(true);
      break;
    }
    expect(res.status(), `attempt ${i} did not get its own answer`).toBe(own.status);
    if (own.code) expect(code, `attempt ${i}`).toBe(own.code);
  }
  expect(refusedAt, 'the attempt limit never answered').toBeGreaterThan(0);
  if (Date.now() - started < 60_000) expect(refusedAt, 'refused before or after the allowance').toBe(PER_MINUTE + 1);
  // Past the allowance it stays refused.
  for (let i = 0; i < 3; i++) {
    const again = await send();
    expect(again.status()).toBe(429);
    expect(await codeOf(again)).toBe(ATTEMPT_LIMIT_CODE);
  }
  // A second account in the same loop is unaffected.
  const other = await post(request, bystander, { prompt: 'hello' });
  expect(other.status(), await other.text()).toBe(200);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  bystander = await account('bystander');
});

test.beforeEach(() => {
  test.setTimeout(240_000);
});

test('a body that is not JSON: 400 until the allowance, then attempt-limit', async ({ request }) => {
  const a = await account('not-json');
  await loopUntilLimited(request, () => post(request, a, '{nope'), { status: 400 });
});

test('a lease in a bad shape: 400 lease-invalid until the allowance, then attempt-limit', async ({ request }) => {
  const a = await account('bad-lease');
  await loopUntilLimited(
    request,
    () => post(request, a, { prompt: 'x', stage: 'transformation', lease: { projectId: '../x', leaseId: 1 } }),
    { status: 400, code: LEASE_CODES.invalid },
  );
});

test('an unknown lease: 403 lease-invalid until the allowance, then attempt-limit', async ({ request }) => {
  const a = await account('unknown-lease');
  await loopUntilLimited(
    request,
    () => post(request, a, { prompt: 'x', stage: 'transformation', lease: { projectId: PROJECT, leaseId: 'noSuchLease001' } }),
    { status: 403, code: LEASE_CODES.invalid },
  );
});

test('a valid lease with an unknown answer shape: 400 until the allowance, then attempt-limit', async ({ request }) => {
  const a = await account('later-gate');
  await openLease(a.uid, LEASE_ID);
  await loopUntilLimited(
    request,
    () => post(request, a, { prompt: 'x', stage: 'transformation', responseShape: 'nope', lease: { projectId: PROJECT, leaseId: LEASE_ID } }),
    { status: 400 },
  );
});

test('a request without a lease counts too: answered until the allowance, then attempt-limit', async ({ request }) => {
  const a = await account('no-lease');
  await loopUntilLimited(request, () => post(request, a, { prompt: 'hello' }), { status: 200 });
});

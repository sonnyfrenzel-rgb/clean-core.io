import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { GEMINI_TEST_STUB_FINISH_HEADER, GEMINI_TEST_STUB_HEADER, GEMINI_TEST_STUB_TEXT } from '../lib/gemini-test-stub';
import { MODEL_INCOMPLETE_CODE } from '../lib/model-completion';
import { MODEL_PROVIDER_ID } from '../lib/model-receipt';

/**
 * Roadmap 3.0.13 — the route halves of the BYOK hardening, against the
 * emulators and the real routes. The pure halves are in
 * `tests/byok-hardening.spec.ts`.
 */

const STAMP = Date.now();
const EMAIL = `byok-hardening-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;

let uid = '';
let idToken = '';
const headers = () => ({ Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' });
const stub = (finish?: string) => ({
  ...headers(),
  [GEMINI_TEST_STUB_HEADER]: process.env.PILOT_APPROVAL_SECRET ?? '',
  ...(finish ? { [GEMINI_TEST_STUB_FINISH_HEADER]: finish } : {}),
});

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  await adminSetDoc('users', uid, {
    firstName: 'Byok', lastName: 'Hardening', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
});

// ── (a) ─────────────────────────────────────────────────────────────────────

test('(a) a finished answer is returned with a receipt that names the provider called', async ({ request }) => {
  const res = await request.post('/api/gemini', { headers: stub(), data: { prompt: 'Say something.', stage: 'analyze' } });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.text).toBe(GEMINI_TEST_STUB_TEXT);
  expect(body.receipt.provider).toBe(MODEL_PROVIDER_ID);
  expect(body.receipt.uid).toBe(uid);
});

test('(a) an answer cut off at the output limit is refused — no text, no receipt, an honest reason', async ({ request }) => {
  const res = await request.post('/api/gemini', { headers: stub('MAX_TOKENS'), data: { prompt: 'Say something.', stage: 'analyze' } });
  expect(res.status(), await res.text()).toBe(502);
  const body = await res.json();
  expect(body.code).toBe(MODEL_INCOMPLETE_CODE);
  expect(body.error).toMatch(/output limit/);
  expect(body.error).toContain('Nothing from this answer was used or recorded.');
  expect(body.receipt, 'a receipt was minted over a cut-off answer').toBeUndefined();
  expect(body.text, 'the cut-off text was handed on as a result').toBeUndefined();
});

test('(a) an answer the provider filter stopped is refused the same way', async ({ request }) => {
  const res = await request.post('/api/gemini', { headers: stub('SAFETY'), data: { prompt: 'Say something.' } });
  expect(res.status(), await res.text()).toBe(502);
  const body = await res.json();
  expect(body.code).toBe(MODEL_INCOMPLETE_CODE);
  expect(body.receipt).toBeUndefined();
  expect(body.text).toBeUndefined();
});

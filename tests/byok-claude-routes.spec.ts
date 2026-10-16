import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { getAdminDb, loadOwnModelKey, saveOwnModelKey, deleteOwnModelKey } from '../lib/firebase-admin';
import { OWN_KEY_MISSING_CODE, OWN_KEY_REJECTED_CODE, BYOK_KEY_VERSION, sealByokSecret } from '../lib/byok-key';
import { OWN_CLAUDE_MODEL, RECEIPT_PROVIDER_ID } from '../lib/model-providers';
import { POST as geminiPOST } from '../app/api/gemini/route';

/**
 * Roadmap 3.0.15 — the store and the proxy for an own Claude key, in this
 * process against the Firestore and Auth emulators (no app server): the real
 * `/api/gemini` handler, with `fetch` intercepted so a call to Anthropic is
 * answered here and a call to Google — the platform key — is counted and
 * refused. The pure halves are in `tests/byok-claude.spec.ts`.
 */

const STAMP = Date.now();
const EMAIL = `byok-claude-${STAMP}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const CLAUDE_KEY = ['sk', 'ant', 'spec', 'claude', String(STAMP)].join('-');

let uid = '';
let idToken = '';

test.describe.configure({ mode: 'serial' });

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const secretRef = async (provider: string) =>
  (await getAdminDb()).db.collection('user_secrets').doc(uid).collection('providers').doc(provider);

/** `fetch` for the duration of one call: Anthropic answered by `anthropic`, Google counted and refused. */
async function withProviders<T>(
  anthropic: (url: string, init: RequestInit) => Response,
  run: () => Promise<T>,
): Promise<{ result: T; anthropicCalls: Array<{ url: string; init: RequestInit }>; googleCalls: string[] }> {
  const original = globalThis.fetch;
  const anthropicCalls: Array<{ url: string; init: RequestInit }> = [];
  const googleCalls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.anthropic.com/')) {
      anthropicCalls.push({ url, init: init ?? {} });
      return anthropic(url, init ?? {});
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      googleCalls.push(url);
      return new Response(JSON.stringify({ error: { code: 500 } }), { status: 500 });
    }
    return original(input, init);
  }) as typeof fetch;
  try {
    return { result: await run(), anthropicCalls, googleCalls };
  } finally {
    globalThis.fetch = original;
  }
}

const post = (data: unknown) =>
  geminiPOST(
    new NextRequest('http://localhost:3000/api/gemini', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  );

const claudeAnswer = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 3, output_tokens: 2 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'no emulator host: this spec would reach a real database').toBeTruthy();
  // A platform key is configured, so a fallback would have something to spend — and is counted below.
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'byok-claude-spec-platform-key';
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
  uid = cred.user.uid;
  idToken = await cred.user.getIdToken();
  const { db } = await getAdminDb();
  await db.collection('users').doc(uid).set({
    firstName: 'Byok', lastName: 'Claude', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
});

test.afterAll(async () => {
  const { db } = await getAdminDb();
  await db.recursiveDelete(db.collection('user_secrets').doc(uid)).catch(() => {});
  await db.collection('users').doc(uid).delete().catch(() => {});
});

test('a key saved before 3.0.15 — no provider on record or profile — reads as Gemini', async () => {
  const { db } = await getAdminDb();
  const sealed = sealByokSecret('AIza-byok-claude-bridge-0000', { uid, provider: 'gemini' });
  await (await secretRef('gemini')).set({ encryptedApiKey: sealed.encryptedApiKey, keyVersion: sealed.keyVersion, last4: '0000' });
  await db.collection('users').doc(uid).update({ byokConfigured: true, byokLast4: '0000' });
  await expect(loadOwnModelKey(uid)).resolves.toEqual({ provider: 'gemini', apiKey: 'AIza-byok-claude-bridge-0000' });
  await deleteOwnModelKey(uid);
  await expect(loadOwnModelKey(uid)).resolves.toBeNull();
});

test('an Anthropic key is stored with its provider, replaces a Gemini key, and opens as Anthropic\'s', async () => {
  await saveOwnModelKey(uid, 'AIza-byok-claude-replaced-1111', 'gemini');
  expect((await (await secretRef('gemini')).get()).exists).toBe(true);
  await expect(saveOwnModelKey(uid, CLAUDE_KEY, 'anthropic')).resolves.toMatchObject({ byokConfigured: true, byokProvider: 'anthropic' });
  const record = (await (await secretRef('anthropic')).get()).data();
  expect(record).toMatchObject({ provider: 'anthropic', keyVersion: BYOK_KEY_VERSION });
  expect(JSON.stringify(record)).not.toContain(CLAUDE_KEY);
  expect((await (await secretRef('gemini')).get()).exists, 'two own keys are held at once').toBe(false);
  const profile = (await (await getAdminDb()).db.collection('users').doc(uid).get()).data();
  expect(profile).toMatchObject({ byokConfigured: true, byokProvider: 'anthropic' });
  await expect(loadOwnModelKey(uid)).resolves.toEqual({ provider: 'anthropic', apiKey: CLAUDE_KEY });
});

test('the proxy sends a call of an account with an own Claude key to Anthropic, never to Google, and receipts it so', async () => {
  const { result: res, anthropicCalls, googleCalls } = await withProviders(() => claudeAnswer('A design.'), () => post({ prompt: 'Design this.', stage: 'design' }));
  expect(res.status, await res.clone().text()).toBe(200);
  const body = await res.json();
  expect(body.text).toBe('A design.');
  expect(body.receipt).toMatchObject({ provider: RECEIPT_PROVIDER_ID.anthropic, modelId: OWN_CLAUDE_MODEL, byok: true, uid, stage: 'design' });
  expect(body.answeredBy).toEqual({ provider: 'anthropic', modelId: OWN_CLAUDE_MODEL, keyOwner: 'own' });
  expect(googleCalls, 'the platform key was used').toEqual([]);
  expect(anthropicCalls).toHaveLength(1);
  expect(anthropicCalls[0].url).toBe('https://api.anthropic.com/v1/messages');
  expect(new Headers(anthropicCalls[0].init.headers).get('x-api-key')).toBe(CLAUDE_KEY);
  expect(JSON.parse(String(anthropicCalls[0].init.body)).model).toBe(OWN_CLAUDE_MODEL);
  // Settings reads who answered, per stage.
  const profile = (await (await getAdminDb()).db.collection('users').doc(uid).get()).data();
  expect(profile?.modelAnswers?.design).toMatchObject({ provider: 'anthropic', modelId: OWN_CLAUDE_MODEL, keyOwner: 'own' });
});

test('Anthropic refusing the own key stops the step with its code — no retry on the platform key', async () => {
  const { result: res, anthropicCalls, googleCalls } = await withProviders(
    () => new Response(JSON.stringify({ error: { type: 'authentication_error' } }), { status: 401 }),
    () => post({ prompt: 'Design this.', stage: 'design' }),
  );
  expect(res.status).toBe(502);
  const body = await res.json();
  expect(body.code).toBe(OWN_KEY_REJECTED_CODE);
  expect(body.text).toBeUndefined();
  expect(body.receipt).toBeUndefined();
  expect(anthropicCalls).toHaveLength(1);
  expect(googleCalls, 'the platform key was used after the own key was refused').toEqual([]);
});

test('an own key the profile names and the store no longer holds stops the step — no platform key', async () => {
  await (await secretRef('anthropic')).delete();
  await expect(loadOwnModelKey(uid)).rejects.toMatchObject({ code: OWN_KEY_MISSING_CODE });
  const { result: res, anthropicCalls, googleCalls } = await withProviders(() => claudeAnswer('never'), () => post({ prompt: 'Design this.', stage: 'design' }));
  expect(res.status).toBe(503);
  expect((await res.json()).code).toBe(OWN_KEY_MISSING_CODE);
  expect(anthropicCalls).toEqual([]);
  expect(googleCalls, 'the platform key was used for an account with an own key').toEqual([]);
});

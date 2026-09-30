import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { TERMS_VERSION } from '../lib/constants';
import { adminDocExists, adminGetDoc, adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { GEMINI_TEST_STUB_FINISH_HEADER, GEMINI_TEST_STUB_HEADER, GEMINI_TEST_STUB_TEXT } from '../lib/gemini-test-stub';
import { MODEL_INCOMPLETE_CODE } from '../lib/model-completion';
import { MODEL_PROVIDER_ID } from '../lib/model-receipt';
import { BYOK_NOT_AVAILABLE_CODE } from '../lib/byok-eligibility';
import { BYOK_KEY_UNREADABLE_CODE, BYOK_KEY_VERSION, openByokSecret } from '../lib/byok-key';
import { encrypt as encryptWithS4Key, decrypt as decryptWithS4Key } from '../lib/s4-credentials';
import { spawn } from 'child_process';
import path from 'path';

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
let outsideUid = '';
let outsideToken = '';
const headers = (token = idToken) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
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
  // An active account on a tier outside the BYOK list (3.0.13 c).
  const outside = await createUserWithEmailAndPassword(auth, `byok-outside-${STAMP}@cleancore-test.io`, SIGN_IN);
  outsideUid = outside.user.uid;
  outsideToken = await outside.user.getIdToken();
  await adminSetDoc('users', outsideUid, {
    firstName: 'Byok', lastName: 'Outside', email: `byok-outside-${STAMP}@cleancore-test.io`, tier: 'enterprise', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
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

// ── (c) ─────────────────────────────────────────────────────────────────────

test('(c) an account outside the BYOK tiers cannot store or test a key — but can always delete one', async ({ request }) => {
  const save = await request.post('/api/secrets/gemini', { headers: headers(outsideToken), data: { apiKey: 'AIzaSy-not-a-real-key-000000000000' } });
  expect(save.status(), await save.text()).toBe(403);
  expect((await save.json()).error).toContain(BYOK_NOT_AVAILABLE_CODE);
  expect(await adminDocExists(`user_secrets/${outsideUid}/providers`, 'gemini'), 'the refused key was stored anyway').toBe(false);

  const probe = await request.post('/api/secrets/gemini/test', { headers: headers(outsideToken), data: { apiKey: 'AIzaSy-not-a-real-key-000000000000' } });
  expect(probe.status(), await probe.text()).toBe(403);
  expect((await probe.json()).error).toContain(BYOK_NOT_AVAILABLE_CODE);

  const withdraw = await request.delete('/api/secrets/gemini', { headers: headers(outsideToken) });
  expect(withdraw.status(), await withdraw.text()).toBe(200);
});

test('(c) an account on a BYOK tier stores its key as before', async ({ request }) => {
  const save = await request.post('/api/secrets/gemini', { headers: headers(), data: { apiKey: 'AIzaSy-not-a-real-key-111111111111' } });
  expect(save.status(), await save.text()).toBe(200);
  expect(await adminDocExists(`user_secrets/${uid}/providers`, 'gemini')).toBe(true);
  const withdraw = await request.delete('/api/secrets/gemini', { headers: headers() });
  expect(withdraw.status(), await withdraw.text()).toBe(200);
  expect(await adminDocExists(`user_secrets/${uid}/providers`, 'gemini')).toBe(false);
});

// ── (g) ─────────────────────────────────────────────────────────────────────

const PROVIDERS = (id: string) => `user_secrets/${id}/providers`;

async function keySource(request: import('@playwright/test').APIRequestContext): Promise<string | null> {
  const res = await request.get('/api/model-stages', { headers: headers() });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).keySource;
}

test('(g) a saved key is sealed with the BYOK key, with its version — not with the S/4 key', async ({ request }) => {
  const secret = 'AIzaSy-byok-save-222222222222222222';
  const save = await request.post('/api/secrets/gemini', { headers: headers(), data: { apiKey: secret } });
  expect(save.status(), await save.text()).toBe(200);
  const record = await adminGetDoc(PROVIDERS(uid), 'gemini');
  expect(record?.keyVersion).toBe(BYOK_KEY_VERSION);
  expect(() => decryptWithS4Key(record!.encryptedApiKey)).toThrow();
  expect(openByokSecret(record as { encryptedApiKey: string; keyVersion: number }, { uid, provider: 'gemini' })).toBe(secret);
  // And the app reads it back.
  expect(await keySource(request)).toBe('byok');
  await request.delete('/api/secrets/gemini', { headers: headers() });
});

test('(g) a stored key the server cannot open is refused — never replaced by the community key', async ({ request }) => {
  await adminSetDoc(PROVIDERS(uid), 'gemini', { encryptedApiKey: Buffer.alloc(64, 7).toString('base64'), keyVersion: BYOK_KEY_VERSION, last4: 'xxxx' });
  try {
    expect(await keySource(request), 'an unreadable key is reported as available').toBeNull();
    // No stub: the route loads the key, and must stop before any model call.
    const res = await request.post('/api/gemini', { headers: headers(), data: { prompt: 'Say something.' } });
    expect(res.status(), await res.text()).toBe(503);
    expect((await res.json()).code).toBe(BYOK_KEY_UNREADABLE_CODE);
    const probe = await request.post('/api/secrets/gemini/test', { headers: headers(), data: {} });
    expect(probe.status(), await probe.text()).toBe(503);
    expect((await probe.json()).code).toBe(BYOK_KEY_UNREADABLE_CODE);
  } finally {
    await request.delete('/api/secrets/gemini', { headers: headers() });
  }
});

test('(g) the re-key script moves a pre-3.0.13 record to the BYOK key — dry run first, confirmation required, nothing printed', async ({ request }) => {
  test.setTimeout(180 * 1000);
  const secret = 'AIzaSy-byok-legacy-333333333333333333';
  const legacyCipher = encryptWithS4Key(secret);
  await adminSetDoc(PROVIDERS(uid), 'gemini', { encryptedApiKey: legacyCipher, last4: secret.slice(-4), rotatedAt: new Date() });
  await adminMergeDoc('users', uid, { byokConfigured: true, byokLast4: secret.slice(-4) });
  // Version 0 is read as before.
  expect(await keySource(request)).toBe('byok');

  // Asynchronous on purpose: a synchronous spawn blocks this worker's event loop
  // while the script runs, the dev server closes the idle keep-alive socket in
  // the meantime, and the next seed call dies with ECONNRESET.
  const run = async (args: string[], extra: Record<string, string | undefined> = {}) => {
    const env: Record<string, string | undefined> = { ...process.env, ...extra };
    if (!('CI' in extra)) delete env.CI;
    if (!('GITHUB_ACTIONS' in extra)) delete env.GITHUB_ACTIONS;
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(__dirname, '..', 'scripts', 'byok-rekey.ts'), '--uid', uid, ...args], {
      env: env as NodeJS.ProcessEnv,
    });
    let text = '';
    child.stdout.on('data', (d) => { text += String(d); });
    child.stderr.on('data', (d) => { text += String(d); });
    const out = { status: await new Promise<number | null>((resolve) => child.on('close', resolve)) };
    // Only counts: never the account, the key, or a ciphertext.
    expect(text).not.toContain(uid);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(secret.slice(-8));
    expect(text).not.toContain(legacyCipher.slice(0, 16));
    return { status: out.status, text };
  };
  const stored = async () => (await adminGetDoc(PROVIDERS(uid), 'gemini'))!;

  // Refuses in CI.
  expect((await run(['--apply'], { CI: 'true', BYOK_REKEY_CONFIRM: firebaseConfig.firestoreDatabaseId })).status).toBe(2);
  // Dry run: counts, writes nothing.
  const dry = await run([]);
  expect(dry.status, dry.text).toBe(0);
  expect(dry.text).toMatch(/legacy {2}\(v0\) : 1 — readable 1/);
  expect((await stored()).encryptedApiKey).toBe(legacyCipher);
  // --apply without the confirmation naming the database: refused, nothing written.
  expect((await run(['--apply'])).status).toBe(2);
  expect((await run(['--apply'], { BYOK_REKEY_CONFIRM: 'yes' })).status).toBe(2);
  expect((await stored()).encryptedApiKey).toBe(legacyCipher);

  // The real run.
  const applied = await run(['--apply'], { BYOK_REKEY_CONFIRM: firebaseConfig.firestoreDatabaseId });
  expect(applied.status, applied.text).toBe(0);
  expect(applied.text).toMatch(/re-sealed {4}: 1/);
  const after = await stored();
  expect(after.keyVersion).toBe(BYOK_KEY_VERSION);
  expect(after.encryptedApiKey).not.toBe(legacyCipher);
  expect(() => decryptWithS4Key(after.encryptedApiKey), 'the S/4 key still opens the re-sealed key').toThrow();
  expect(openByokSecret(after as { encryptedApiKey: string; keyVersion: number }, { uid, provider: 'gemini' })).toBe(secret);
  expect(after.last4).toBe(secret.slice(-4));
  // The app reads the re-sealed record.
  expect(await keySource(request)).toBe('byok');

  // A second run finds nothing left to do.
  const again = await run(['--apply'], { BYOK_REKEY_CONFIRM: firebaseConfig.firestoreDatabaseId });
  expect(again.status, again.text).toBe(0);
  expect(again.text).toMatch(/current \(v1\) : 1/);
  expect(again.text).toMatch(/re-sealed {4}: 0/);

  await request.delete('/api/secrets/gemini', { headers: headers() });
});

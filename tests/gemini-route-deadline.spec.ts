import { test, expect } from '@playwright/test';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { build, type Plugin } from 'esbuild';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, PRODUCT_GEMINI_MODEL, TERMS_VERSION } from '../lib/constants';
import { FALLBACK_MODEL_ENV, LARGE_PROMPT_MODEL_ENV, STAGE_MODELS_ENV } from '../lib/model-combination';
import { GEMINI_TEST_STUB_DEFAULT_ENV } from '../lib/gemini-test-stub';
import { MODEL_TIMEOUT_CODE, modelTimeoutMessage } from '../lib/model-deadline';
import { AUTO_STEPS_NOTICE_FIELD, AUTO_STEPS_NOTICE_PENDING_CODE, AUTO_STEPS_NOTICE_WORDING, AUTO_STEPS_NOTICE_WORDING_FIELD } from '../lib/auto-steps-notice';
import { LEGAL_TEXTS_NAMES_AUTOMATIC } from '../lib/legal/names-wording';
import { NAMING_FACTS_PROMPT_MARK, NAMING_STAGE } from '../lib/process-naming';
import { verifyModelReceipt } from '../lib/model-receipt';

/**
 * The model-call deadline at the route — QA leftovers of hotfix 2 (roadmap
 * 3.0.13). `tests/model-deadline.spec.ts` holds the helper and reads the route's
 * source; this runs the route itself: `POST /api/gemini` handled in process,
 * against the Firestore and Auth emulators, with a provider that never answers.
 *
 * Two seams, both at the bundle and none in the product: the provider SDK is
 * a stand-in whose call waits until its abort signal fires (and records that it
 * fired), and the deadline module is the real one with a deadline of
 * `SHORT_MS` instead of 870 s. Everything between — auth, the attempt limit,
 * the hourly window, the profile gates, the retries — is the route as built.
 *
 * Server-free: no app server, only the emulators (127.0.0.1:9099 and :8080).
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'gemini-route-deadline', String(process.pid));
const SHORT_MS = 1_500;

const PROVIDER_STUB = `
const g = globalThis;
g.__deadlineProbe = g.__deadlineProbe || { calls: 0, aborted: 0 };
class GoogleGenAI {
  constructor() {
    this.models = {
      generateContent: (req) => new Promise((resolve, reject) => {
        g.__deadlineProbe.calls += 1;
        // A test that queued answers gets them in order, and the model each call asked for is noted.
        if (Array.isArray(g.__answers) && g.__answers.length) {
          (g.__asked = g.__asked || []).push(req && req.model);
          return resolve(g.__answers.shift());
        }
        const signal = req && req.config && req.config.abortSignal;
        if (!signal) return; // never answers: the route's own bound must end it
        const stop = () => { g.__deadlineProbe.aborted += 1; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); };
        if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
      }),
    };
  }
}
// The enum the route reaches through lib/model-thinking.ts (the model's thinking level, 3.0.13):
// the stand-in carries the SDK's values so the route builds its request as it does against the SDK.
const ThinkingLevel = { THINKING_LEVEL_UNSPECIFIED: 'THINKING_LEVEL_UNSPECIFIED', MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };
module.exports = { GoogleGenAI, ThinkingLevel };
`;

const DEADLINE_SHIM = `
export * from ${JSON.stringify(path.join(ROOT, 'lib', 'model-deadline.ts'))};
export const MODEL_CALL_DEADLINE_MS = ${SHORT_MS};
`;

type RouteModule = { POST: (req: unknown) => Promise<Response> };
let route: RouteModule;
let NextRequestCtor: new (url: string, init: Record<string, unknown>) => unknown;

async function emulatorsUp(): Promise<boolean> {
  const up = (port: number) => new Promise<boolean>((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.setTimeout(1000);
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
    s.once('timeout', () => (s.destroy(), resolve(false)));
  });
  return (await up(8080)) && (await up(9099));
}

test.describe('the Gemini route ends a call the provider never answers', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    const up = await emulatorsUp();
    if (!up && process.env.CI) throw new Error('The emulators do not answer on 127.0.0.1:8080 and :9099, and CI must run this test.');
    test.skip(!up, 'The emulators do not answer on 127.0.0.1:8080 and :9099.');
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'genai-stub.cjs'), PROVIDER_STUB);
    fs.writeFileSync(path.join(OUT, 'deadline-shim.ts'), DEADLINE_SHIM);
    const seams: Plugin = {
      name: 'deadline-seams',
      setup(b) {
        b.onResolve({ filter: /^@google\/genai$/ }, () => ({ path: path.join(OUT, 'genai-stub.cjs') }));
        b.onResolve({ filter: /^@\/lib\/model-deadline$/ }, () => ({ path: path.join(OUT, 'deadline-shim.ts') }));
      },
    };
    await build({
      entryPoints: [path.join(ROOT, 'app', 'api', 'gemini', 'route.ts')],
      outfile: path.join(OUT, 'route.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      packages: 'external',
      plugins: [seams],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    route = require(path.join(OUT, 'route.cjs')) as RouteModule;
    NextRequestCtor = require('next/server').NextRequest;
  });

  test('a provider that never answers is stopped at the deadline: 504, its code, the call aborted', async () => {
    test.setTimeout(120_000);
    // Not the stub: the provider stand-in above is what answers (or does not).
    delete process.env[GEMINI_TEST_STUB_DEFAULT_ENV];
    process.env.GEMINI_API_KEY = 'test-key-not-used-by-the-stand-in';

    const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
    const uid = `deadline-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `${uid}@example.test`;
    await adminAuth(app).createUser({ uid, email, password: 'emulator-only-password' });
    await adminFirestore(app, FIRESTORE_DB_ID).collection('users').doc(uid).set({
      firstName: 'Deadline', lastName: 'Route', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    // An ID token from the Auth emulator, for the custom token of this account.
    const custom = await adminAuth(app).createCustomToken(uid);
    const signIn = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    });
    const { idToken } = (await signIn.json()) as { idToken: string };
    expect(idToken).toBeTruthy();

    const probe = () => (globalThis as { __deadlineProbe?: { calls: number; aborted: number } }).__deadlineProbe ?? { calls: 0, aborted: 0 };
    const req = new NextRequestCtor('http://localhost/api/gemini', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Say hello.', stage: 'glossary' }),
    });
    const started = Date.now();
    const res = await route.POST(req);
    const took = Date.now() - started;

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: modelTimeoutMessage(), code: MODEL_TIMEOUT_CODE });
    // Ended by the route's own bound, not by a test timeout: soon after the deadline.
    expect(took).toBeGreaterThanOrEqual(SHORT_MS - 200);
    expect(took).toBeLessThan(SHORT_MS + 20_000);
    // The provider was asked, and its call was aborted — nothing keeps running for nobody.
    expect(probe().calls).toBeGreaterThanOrEqual(1);
    expect(probe().aborted).toBe(probe().calls);
  });

  /** A signed-in, approved account on the emulators, and its ID token. */
  async function signedInAccount(prefix: string, profile: Record<string, unknown> = {}): Promise<string> {
    const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
    const uid = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `${uid}@example.test`;
    await adminAuth(app).createUser({ uid, email, password: 'emulator-only-password' });
    await adminFirestore(app, FIRESTORE_DB_ID).collection('users').doc(uid).set({
      firstName: 'Budget', lastName: 'Route', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(), ...profile,
    });
    const custom = await adminAuth(app).createCustomToken(uid);
    const signIn = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    });
    return ((await signIn.json()) as { idToken: string }).idToken;
  }

  const probeCalls = () => ((globalThis as { __deadlineProbe?: { calls: number } }).__deadlineProbe ?? { calls: 0 }).calls;

  test('SEC-01: a call that names no stage is refused before the provider is asked', async () => {
    test.setTimeout(60_000);
    delete process.env[GEMINI_TEST_STUB_DEFAULT_ENV];
    process.env.GEMINI_API_KEY = 'test-key-not-used-by-the-stand-in';
    const idToken = await signedInAccount('stage');
    const before = probeCalls();
    for (const body of [{ prompt: 'Say hello.' }, { prompt: 'Say hello.', stage: 'anything' }]) {
      const res = await route.POST(new NextRequestCtor('http://localhost/api/gemini', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code?: string }).code).toBe('stage-required');
    }
    expect(probeCalls(), 'the provider was asked for a call without a stage').toBe(before);
  });

  test('a model under evaluation named by the client is refused before the provider is asked', async () => {
    test.setTimeout(60_000);
    delete process.env[GEMINI_TEST_STUB_DEFAULT_ENV];
    delete process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = 'test-key-not-used-by-the-stand-in';
    const idToken = await signedInAccount('evaluation-model');
    const before = probeCalls();
    const res = await route.POST(new NextRequestCtor('http://localhost/api/gemini', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Say hello.', stage: 'analyze', model: 'gemini-4-hydrogen' }),
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toContain('"gemini-4-hydrogen" is not permitted');
    expect(probeCalls(), 'the provider was asked for a model the deployment does not run').toBe(before);
  });

  test('an automatic naming call waits for the notice of this build: refused before the provider is asked', async () => {
    test.setTimeout(60_000);
    delete process.env[GEMINI_TEST_STUB_DEFAULT_ENV];
    process.env.GEMINI_API_KEY = 'test-key-not-used-by-the-stand-in';
    // The 3.1.0 build names by itself, so its notice says so (`lib/legal/names-wording.ts`).
    expect(LEGAL_TEXTS_NAMES_AUTOMATIC).toBe(true);
    const ask = (idToken: string, trigger?: string) =>
      route.POST(new NextRequestCtor('http://localhost/api/gemini', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        // With the facts mark, so the only gate that can hold the call is the notice's.
        body: JSON.stringify({ prompt: `Name the steps.\n${NAMING_FACTS_PROMPT_MARK}`, stage: NAMING_STAGE, ...(trigger ? { trigger } : {}) }),
      }));
    // Never answered, and an answer to the earlier wording (one step, plain sentences), which does not name them.
    for (const [label, profile] of [
      ['never answered', {}],
      ['the earlier wording', { [AUTO_STEPS_NOTICE_FIELD]: new Date(), [AUTO_STEPS_NOTICE_WORDING_FIELD]: 'C14-1' }],
    ] as const) {
      const idToken = await signedInAccount('notice', profile);
      const before = probeCalls();
      const res = await ask(idToken, 'automatic');
      expect(res.status, label).toBe(403);
      expect(((await res.json()) as { code?: string }).code, label).toBe(AUTO_STEPS_NOTICE_PENDING_CODE);
      expect(probeCalls(), `${label}: the provider was asked before the notice`).toBe(before);
    }
    // The wording of this build confirmed: the gate lets the call through to the provider (which never answers here).
    const confirmed = await signedInAccount('notice-ok', { [AUTO_STEPS_NOTICE_FIELD]: new Date(), [AUTO_STEPS_NOTICE_WORDING_FIELD]: AUTO_STEPS_NOTICE_WORDING });
    const before = probeCalls();
    const res = await ask(confirmed, 'automatic');
    const answer = (await res.json()) as { code?: string; error?: string };
    expect(answer.code).not.toBe(AUTO_STEPS_NOTICE_PENDING_CODE);
    expect(probeCalls(), 'the confirmed account\'s call did not reach the provider').toBeGreaterThan(before);
  });

  test('an unfinished answer of the statements stage is asked of the fallback once; its answer is returned and named', async () => {
    test.setTimeout(60_000);
    delete process.env[GEMINI_TEST_STUB_DEFAULT_ENV];
    process.env.GEMINI_API_KEY = 'test-key-not-used-by-the-stand-in';
    const saved = { fallback: process.env[FALLBACK_MODEL_ENV], stages: process.env[STAGE_MODELS_ENV], large: process.env[LARGE_PROMPT_MODEL_ENV], model: process.env.GEMINI_MODEL };
    const FALLBACK = 'gemini-3.6-flash';
    process.env[FALLBACK_MODEL_ENV] = FALLBACK;
    delete process.env[STAGE_MODELS_ENV];
    delete process.env[LARGE_PROMPT_MODEL_ENV];
    delete process.env.GEMINI_MODEL;
    const g = globalThis as { __answers?: unknown[]; __asked?: unknown[] };
    try {
      const idToken = await signedInAccount('fallback');
      g.__asked = [];
      g.__answers = [
        { text: 'Half a sente', candidates: [{ finishReason: 'MAX_TOKENS' }], usageMetadata: {} },
        { text: 'The whole sentence.', candidates: [{ finishReason: 'STOP' }], usageMetadata: {} },
      ];
      const res = await route.POST(new NextRequestCtor('http://localhost/api/gemini', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Word the statements.', stage: 'statements' }),
      }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { text?: string; answeredBy?: { modelId?: string }; receipt?: unknown };
      expect(g.__asked, 'the product model first, then the fallback, once').toEqual([PRODUCT_GEMINI_MODEL, FALLBACK]);
      expect(g.__answers, 'both answers were asked for').toEqual([]);
      expect(body.text).toBe('The whole sentence.');
      expect(body.answeredBy?.modelId, 'the answer names the model that answered').toBe(FALLBACK);
      // QA review of 49f4f7152c69: the receipt and the account's stage record name the fallback too.
      const uid = (JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as { user_id: string }).user_id;
      const verdict = verifyModelReceipt(body.receipt, { uid, text: 'The whole sentence.', key: process.env.AUDIT_SIGNING_KEY ?? '', stage: 'statements' });
      expect(verdict.ok, 'the receipt does not verify for the fallback\'s answer').toBe(true);
      expect(verdict.ok && verdict.receipt.modelId, 'the receipt names the model that answered').toBe(FALLBACK);
      const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
      const profile = (await adminFirestore(app, FIRESTORE_DB_ID).collection('users').doc(uid).get()).data() as { modelAnswers?: Record<string, { modelId?: string }> } | undefined;
      expect(profile?.modelAnswers?.statements?.modelId, 'the stage record names the model that answered').toBe(FALLBACK);
    } finally {
      delete g.__answers;
      delete g.__asked;
      for (const [env, value] of [[FALLBACK_MODEL_ENV, saved.fallback], [STAGE_MODELS_ENV, saved.stages], [LARGE_PROMPT_MODEL_ENV, saved.large], ['GEMINI_MODEL', saved.model]] as const) {
        if (value === undefined) delete process.env[env];
        else process.env[env] = value;
      }
    }
  });

  // Last in this file: the breaker it opens is remembered by the route module.
  test('SEC-01: the platform key\'s daily budget, once spent, refuses before the provider is asked', async () => {
    test.setTimeout(60_000);
    delete process.env[GEMINI_TEST_STUB_DEFAULT_ENV];
    process.env.GEMINI_API_KEY = 'test-key-not-used-by-the-stand-in';
    const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
    const day = new Date().toISOString().slice(0, 10);
    const budgetRef = adminFirestore(app, FIRESTORE_DB_ID).collection('platform_model_budget').doc(day);
    const previousCap = process.env.PLATFORM_MODEL_DAILY_CALLS;
    process.env.PLATFORM_MODEL_DAILY_CALLS = '1000000';
    await budgetRef.set({ calls: 1_000_000 }, { merge: true });
    try {
      const idToken = await signedInAccount('budget');
      const before = probeCalls();
      const res = await route.POST(new NextRequestCtor('http://localhost/api/gemini', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Say hello.', stage: 'glossary' }),
      }));
      expect(res.status).toBe(503);
      expect(((await res.json()) as { code?: string }).code).toBe('platform-model-budget-exhausted');
      expect(probeCalls(), 'the provider was asked past the day\'s budget').toBe(before);
      expect((await budgetRef.get()).data()?.open, 'the breaker did not record that it opened').toBe(true);
    } finally {
      if (previousCap === undefined) delete process.env.PLATFORM_MODEL_DAILY_CALLS;
      else process.env.PLATFORM_MODEL_DAILY_CALLS = previousCap;
      await budgetRef.delete().catch(() => {});
    }
  });
});

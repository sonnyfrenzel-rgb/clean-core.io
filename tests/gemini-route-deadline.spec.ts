import { test, expect } from '@playwright/test';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { build, type Plugin } from 'esbuild';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import { GEMINI_TEST_STUB_DEFAULT_ENV } from '../lib/gemini-test-stub';
import { MODEL_TIMEOUT_CODE, modelTimeoutMessage } from '../lib/model-deadline';

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
      body: JSON.stringify({ prompt: 'Say hello.' }),
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
});

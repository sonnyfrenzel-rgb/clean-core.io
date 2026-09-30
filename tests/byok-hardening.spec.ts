import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  issueModelReceipt,
  verifyModelReceipt,
  MODEL_PROVIDER_ID,
  type ModelReceipt,
} from '../lib/model-receipt';
import { modelCompletion, incompleteAnswerMessage, MODEL_INCOMPLETE_CODE } from '../lib/model-completion';
import { geminiTestStubAnswer, GEMINI_TEST_STUB_TEXT } from '../lib/gemini-test-stub';
import { byokAllowed, BYOK_TIERS } from '../lib/byok-eligibility';
import { providerErrorShape } from '../lib/logger';
import {
  BYOK_KEY_VERSION,
  ByokKeyUnavailableError,
  ByokKeyUnreadableError,
  byokEncryptionConfigured,
  openByokSecret,
  sealByokSecret,
} from '../lib/byok-key';
import { encrypt as encryptWithS4Key, decrypt as decryptWithS4Key } from '../lib/s4-credentials';
import { GET as healthGET } from '../app/api/health/route';
import { QuotaError, getAdminDb } from '../lib/firebase-admin';
import {
  BYOK_RATE_LIMITS,
  assertByokRateLimit,
  byokRateLimitKey,
  byokRateLimitMessage,
} from '../lib/byok-rate-limit';

/**
 * Roadmap 3.0.13 — the BYOK hardening before 3.0.
 *
 * One section per point of the roadmap line, each with the check that fails
 * without the change. Pure where the rule is pure; a source guard only where the
 * behaviour cannot be reached from a test run. The route-level halves that need a
 * signed-in account live in `tests/byok-hardening-routes.spec.ts`.
 */

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── (b) the receipt names the provider it was given ─────────────────────────

test.describe('(b) provider in the model receipt', () => {
  const KEY = 'golden-key-for-3.0.13-receipt-compatibility';
  const IAT = 1_790_000_000_000;

  test('a receipt is not issued without the provider that was called', () => {
    // Before 3.0.13 the module filled in `google-gemini` whenever a caller left
    // the field out; a forgotten argument then named Gemini inside a MAC.
    const args = { uid: 'u', text: 't', modelId: 'gemini-3.8-flash', byok: false } as unknown as Parameters<typeof issueModelReceipt>[0];
    expect(() => issueModelReceipt(args, KEY)).toThrow(/provider/);
    expect(() => issueModelReceipt({ ...args, provider: '' }, KEY)).toThrow(/provider/);
    expect(() => issueModelReceipt({ ...args, provider: '   ' }, KEY)).toThrow(/provider/);
  });

  test('what the caller names is what the receipt carries — no constant in between', () => {
    const r = issueModelReceipt({ uid: 'u', text: 't', provider: 'some-other-provider', modelId: 'm', byok: false }, KEY);
    expect(r.provider).toBe('some-other-provider');
    expect(verifyModelReceipt(r, { uid: 'u', text: 't', key: KEY })).toEqual({ ok: true, receipt: r });
  });

  test('receipts minted before the change still verify, byte for byte', () => {
    // Both MACs were produced by the module as it stood before 3.0.13
    // (`git show 507f3865:lib/model-receipt.ts`), with the provider defaulted.
    // The canonical form and the claim set must not move: a changed MAC here
    // means every receipt in flight at the deploy would be refused.
    const before: ModelReceipt = {
      v: 1,
      uid: 'golden-uid',
      textSha256: '5894146373b4ab081b0e2c3f1d95229654404f48f0d1ab51807db7f822b15cdb',
      provider: 'google-gemini',
      modelId: 'gemini-3.8-flash',
      byok: false,
      iat: IAT,
      mac: '6b5cced598a8c313a182b6073379f11e1dbe108e6906a2f32544a44686b3a3ec',
    };
    const withStage: ModelReceipt = {
      ...before,
      byok: true,
      stage: 'analyze',
      mac: 'a781fc8a3e2f4a7e07910a7ec6de8f31bb3ea7894aff7eb2ed9a8b3c72dc41d3',
    };
    for (const r of [before, withStage]) {
      expect(verifyModelReceipt(r, { uid: 'golden-uid', text: 'golden narrative', key: KEY, now: IAT + 1000 }).ok).toBe(true);
    }
    // And the same facts issued today, with the provider named, give the same MAC.
    const today = issueModelReceipt(
      { uid: 'golden-uid', text: 'golden narrative', provider: MODEL_PROVIDER_ID, modelId: 'gemini-3.8-flash', byok: false, issuedAt: IAT },
      KEY,
    );
    expect(today.mac).toBe(before.mac);
  });

  test('the proxy names the provider at the call, and the module keeps no fallback', () => {
    const route = read('app/api/gemini/route.ts');
    const call = route.slice(route.indexOf('issueModelReceipt('));
    expect(call.slice(0, call.indexOf('signingKey')), 'the proxy no longer names the provider it called').toMatch(/provider:\s*MODEL_PROVIDER_ID/);
    const receipt = read('lib/model-receipt.ts');
    expect(receipt, 'the receipt module defaults the provider again').not.toMatch(/provider\s*\?\?/);
    expect(receipt, 'the provider is optional again').not.toMatch(/provider\?:\s*string/);
  });
});

// ── (a) an incomplete answer is not a result ────────────────────────────────

test.describe('(a) the finish reason decides whether an answer is a result', () => {
  test('only a STOP with text is complete', () => {
    expect(modelCompletion({ text: 'done', finishReason: 'STOP' })).toEqual({ ok: true, text: 'done' });
  });

  test('cut off at the output limit, stopped by a filter, or with no reason at all — refused', () => {
    // The SDK hands back the text of all four; before 3.0.13 each became a
    // receipted result as long as it was not empty.
    expect(modelCompletion({ text: '{"statements":[{"te', finishReason: 'MAX_TOKENS' })).toMatchObject({ ok: false, reason: 'truncated' });
    for (const r of ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE']) {
      expect(modelCompletion({ text: 'partial', finishReason: r }), r).toMatchObject({ ok: false, reason: 'filtered', finishReason: r });
    }
    expect(modelCompletion({ text: 'partial', finishReason: null })).toMatchObject({ ok: false, reason: 'unfinished' });
    expect(modelCompletion({ text: 'partial', finishReason: undefined })).toMatchObject({ ok: false, reason: 'unfinished' });
    expect(modelCompletion({ text: 'partial', finishReason: 'FINISH_REASON_UNSPECIFIED' })).toMatchObject({ ok: false, reason: 'unfinished' });
    // A reason Google adds later is not read as "finished" because nobody listed it.
    expect(modelCompletion({ text: 'partial', finishReason: 'SOMETHING_NEW' })).toMatchObject({ ok: false, reason: 'unfinished' });
    // The prompt itself refused.
    expect(modelCompletion({ text: undefined, finishReason: null, blockReason: 'SAFETY' })).toMatchObject({ ok: false, reason: 'filtered' });
    // Finished, but nothing in it.
    expect(modelCompletion({ text: '', finishReason: 'STOP' })).toMatchObject({ ok: false, reason: 'empty' });
    expect(modelCompletion({ text: undefined, finishReason: 'STOP' })).toMatchObject({ ok: false, reason: 'empty' });
  });

  test('the sentence says what happened, carries the code, and says nothing was kept', () => {
    for (const r of ['truncated', 'filtered', 'empty', 'unfinished'] as const) {
      const m = incompleteAnswerMessage(r);
      expect(m).toContain(`(${MODEL_INCOMPLETE_CODE})`);
      expect(m).toContain('Nothing from this answer was used or recorded.');
    }
    expect(incompleteAnswerMessage('truncated')).toMatch(/output limit/);
  });

  test('the stub reports STOP unless a test names another reason, and then answers cut off', () => {
    expect(geminiTestStubAnswer(null)).toEqual({ text: GEMINI_TEST_STUB_TEXT, finishReason: 'STOP' });
    expect(geminiTestStubAnswer('not a reason')).toEqual({ text: GEMINI_TEST_STUB_TEXT, finishReason: 'STOP' });
    const cut = geminiTestStubAnswer('MAX_TOKENS');
    expect(cut.finishReason).toBe('MAX_TOKENS');
    expect(GEMINI_TEST_STUB_TEXT.startsWith(cut.text) && cut.text.length < GEMINI_TEST_STUB_TEXT.length).toBe(true);
  });

  test('the proxy checks completeness before it mints a receipt, and reads the finish reason from the SDK answer', () => {
    const route = read('app/api/gemini/route.ts');
    const checked = route.indexOf('modelCompletion(answer)');
    expect(checked, 'the proxy no longer checks whether the answer is complete').toBeGreaterThan(-1);
    expect(route.indexOf('issueModelReceipt(')).toBeGreaterThan(checked);
    expect(route).toContain('result.candidates?.[0]?.finishReason');
    expect(route).toContain('result.promptFeedback?.blockReason');
    // The stub goes through the same check — it is not a second path around it.
    expect(route).toMatch(/const answer: ModelAnswer = stubbed\s*\?\s*geminiTestStubAnswer\(/);
  });
});

// ── (c) one BYOK tier rule, for the page and the routes ─────────────────────

test.describe('(c) the BYOK tier rule', () => {
  test('is the list the settings page applied before 3.0.13, unchanged', () => {
    expect([...BYOK_TIERS].sort()).toEqual(['pilot', 'pilot_byok', 'starter', 'unlimited']);
    for (const tier of BYOK_TIERS) expect(byokAllowed({ tier }), tier).toBe(true);
    expect(byokAllowed({ isAdmin: true, tier: 'enterprise' })).toBe(true);
    expect(byokAllowed({ isAdmin: true })).toBe(true);
    for (const tier of ['enterprise', 'premium', 'free', '', undefined, null, 42]) {
      expect(byokAllowed({ tier }), String(tier)).toBe(false);
    }
    expect(byokAllowed({ isAdmin: false, tier: 'enterprise' })).toBe(false);
    expect(byokAllowed(null)).toBe(false);
    expect(byokAllowed(undefined)).toBe(false);
  });

  test('the page and the save and test routes read the same function; delete does not', () => {
    const page = read('app/(app)/settings/page.tsx');
    expect(page).toContain('byokAllowed(profile)');
    expect(page, 'the settings page keeps its own copy of the tier list again').not.toMatch(/\[\s*'pilot',\s*'pilot_byok'/);
    const save = read('app/api/secrets/gemini/route.ts');
    const post = save.slice(save.indexOf('export async function POST'), save.indexOf('export async function DELETE'));
    const del = save.slice(save.indexOf('export async function DELETE'));
    expect(post).toContain('assertByokAllowed(decodedToken.uid, decodedToken.admin === true)');
    expect(post.indexOf('assertByokAllowed(')).toBeLessThan(post.indexOf('saveGeminiApiKey('));
    expect(del, 'withdrawing a key must not depend on the tier').not.toContain('assertByokAllowed(');
    const testRoute = read('app/api/secrets/gemini/test/route.ts');
    expect(testRoute.indexOf('assertByokAllowed(decodedToken.uid, decodedToken.admin === true)')).toBeGreaterThan(-1);
    expect(testRoute.indexOf('assertByokAllowed(')).toBeLessThan(testRoute.indexOf('loadGeminiApiKey(decodedToken.uid)'));
    const admin = read('lib/firebase-admin.ts');
    expect(admin).toMatch(/byokAllowed\(\{ isAdmin: isAdminClaim === true, tier \}\)/);
  });
});

// ── (d) saving, removing and testing a key are limited per account ─────────

test.describe('(d) the key routes are limited per account, not per account and address', () => {
  const ROUTES = [
    { rel: 'app/api/secrets/gemini/route.ts', from: 'export async function POST', to: 'export async function DELETE', call: "assertByokRateLimit('save', decodedToken.uid)", work: 'saveGeminiApiKey(' },
    { rel: 'app/api/secrets/gemini/route.ts', from: 'export async function DELETE', to: null, call: "assertByokRateLimit('delete', decodedToken.uid)", work: 'deleteGeminiApiKey(' },
    { rel: 'app/api/secrets/gemini/test/route.ts', from: 'export async function POST', to: null, call: "assertByokRateLimit('test', decodedToken.uid)", work: 'loadGeminiApiKey(' },
  ] as const;

  test('every key route asks the shared limiter with the account alone, before it does the work', () => {
    for (const r of ROUTES) {
      const src = read(r.rel);
      const handler = src.slice(src.indexOf(r.from), r.to ? src.indexOf(r.to) : undefined);
      expect(handler, `${r.rel}: ${r.from} no longer limits per account`).toContain(r.call);
      expect(handler.indexOf(r.call), `${r.rel}: ${r.from} limits after the work`).toBeLessThan(handler.indexOf(r.work));
      // No second limiter beside it that could key on something else.
      expect(src, `${r.rel} calls the raw limiter again`).not.toMatch(/\bassertRateLimit\(/);
      // The address is not read at all, so it cannot become part of a key.
      expect(src, `${r.rel} reads the client address again`).not.toMatch(/getClientIp/);
    }
    // The helper takes the action and the account and nothing else: there is no
    // parameter through which an address, a header or a body field could reach
    // the key.
    expect(assertByokRateLimit.length).toBe(2);
    expect(read('lib/byok-rate-limit.ts'), 'the limiter module reads the request again').not.toMatch(/getClientIp|NextRequest|headers/);
  });

  test('the keys and the numbers', () => {
    expect(byokRateLimitKey('save', 'uid-1')).toBe('byok_save:uid-1');
    expect(byokRateLimitKey('delete', 'uid-1')).toBe('byok_delete:uid-1');
    // The key the test route has used since 3.0.13 (d), so its windows carry over.
    expect(byokRateLimitKey('test', 'uid-1')).toBe('byok_test:uid-1');
    expect(BYOK_RATE_LIMITS.save).toMatchObject({ max: 10, windowMs: 3_600_000 });
    expect(BYOK_RATE_LIMITS.delete).toMatchObject({ max: 10, windowMs: 3_600_000 });
    expect(BYOK_RATE_LIMITS.test).toMatchObject({ max: 5, windowMs: 900_000 });
  });

  /**
   * The limiter itself, against the Firestore emulator. It is switched off when
   * `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is `true` (`lib/rate-limit.ts`), which
   * is why no route test can observe it; here the flag is lifted for this test
   * process only, with `FIRESTORE_EMULATOR_HOST` still set, so every read and
   * write goes to the emulator and nowhere else.
   */
  test('one account runs out, a second account does not share its window, and the 429 says why', async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST, 'no emulator host: this test would reach a real database').toBeTruthy();
    await getAdminDb(); // initialised in emulator mode, before the flag is lifted
    const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const a = `byok-rl-a-${run}`;
    const b = `byok-rl-b-${run}`;
    const saved = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'false';
    try {
      for (const action of ['save', 'delete', 'test'] as const) {
        const { max } = BYOK_RATE_LIMITS[action];
        for (let i = 0; i < max; i++) await assertByokRateLimit(action, a);
        const refused = await assertByokRateLimit(action, a).then(() => null, (e: unknown) => e);
        expect(refused, `${action}: the account was not stopped after ${max}`).toBeInstanceOf(QuotaError);
        expect((refused as QuotaError).status).toBe(429);
        expect((refused as QuotaError).message).toMatch(/this account may do that at most \d+ times/);
        expect((refused as QuotaError).message).toMatch(/Please try again in \d+ seconds\.$/);
        // A second account starts with its own, full window.
        for (let i = 0; i < max; i++) await assertByokRateLimit(action, b);
        await expect(assertByokRateLimit(action, b)).rejects.toBeInstanceOf(QuotaError);
      }
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
      else process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = saved;
    }
  });

  test('the 429 names the action, the limit and what did not happen', () => {
    expect(byokRateLimitMessage('save', 42)).toBe(
      'Too many attempts to save an API key: this account may do that at most 10 times per hour. Nothing was saved. Please try again in 42 seconds.',
    );
    expect(byokRateLimitMessage('delete', 7)).toContain('Your stored key was not removed.');
    expect(byokRateLimitMessage('test', 7)).toContain('at most 5 times every 15 minutes. The key was not tested.');
  });
});

// ── (e) errors are reduced to codes before they are logged ──────────────────

test.describe('(e) the key paths log codes, not errors', () => {
  test('an error that quotes the key back is logged as its class and status only', () => {
    const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
    const err = Object.assign(new Error(`Incorrect API key provided: ${key}. You can find your API key at …`), {
      status: 401,
      response: { body: { error: { message: `key ${key} is invalid` } } },
    });
    const shape = providerErrorShape(err);
    expect(shape).toEqual({ name: 'Error', status: 401 });
    expect(JSON.stringify(shape)).not.toContain(key.slice(-8));
  });

  test('no route under app/api/secrets and no BYOK helper hands an error object to a log', () => {
    const files = [
      'app/api/secrets/gemini/route.ts',
      'app/api/secrets/gemini/test/route.ts',
      'app/api/secrets/gemini/status/route.ts',
    ];
    const admin = read('lib/firebase-admin.ts');
    const byok = admin.slice(admin.indexOf('export async function saveGeminiApiKey'), admin.indexOf('export async function deleteGeminiApiKey'));
    const sources: Array<[string, string]> = [...files.map((f) => [f, read(f)] as [string, string]), ['lib/firebase-admin.ts (BYOK)', byok]];
    for (const [name, src] of sources) {
      expect(src, `${name} writes to the console`).not.toMatch(/console\.(error|warn|log|info)\(/);
      // Every `error:` field handed to the logger is a reduced shape.
      for (const m of src.matchAll(/logger\.(error|warn|info|critical)\([^;]*?\berror:\s*([^,}\n]+)/g)) {
        expect(m[2].trim(), `${name} logs ${m[2].trim()}`).toMatch(/^(providerErrorShape|errMessage)\(/);
      }
    }
    // The model key paths — save and test — use the provider shape, not a message.
    for (const f of files.slice(0, 2)) expect(read(f)).toContain('providerErrorShape(err)');
  });
});

// ── (g) BYOK keys have their own, versioned key ─────────────────────────────

test.describe('(g) the BYOK key', () => {
  const BYOK = Buffer.alloc(32, 'byok-spec-key').toString('base64');
  const OTHER = Buffer.alloc(32, 'another-byok-key').toString('base64');
  const where = { uid: 'uid-a', provider: 'gemini' };
  const SECRET = 'AIzaSy-byok-spec-000000000000000000';

  test('a key is sealed with BYOK_ENCRYPTION_KEY, carries its version, and opens again', () => {
    const sealed = sealByokSecret(SECRET, where, { BYOK_ENCRYPTION_KEY: BYOK });
    expect(sealed.keyVersion).toBe(BYOK_KEY_VERSION);
    expect(sealed.encryptedApiKey).not.toContain(SECRET);
    expect(openByokSecret(sealed, where, { BYOK_ENCRYPTION_KEY: BYOK })).toBe(SECRET);
    // Not with another key, and not as the S/4 key's ciphertext.
    expect(() => openByokSecret(sealed, where, { BYOK_ENCRYPTION_KEY: OTHER })).toThrow(ByokKeyUnreadableError);
    expect(() => decryptWithS4Key(sealed.encryptedApiKey)).toThrow();
  });

  test('a sealed key is bound to its account, its provider and its version', () => {
    const sealed = sealByokSecret(SECRET, where, { BYOK_ENCRYPTION_KEY: BYOK });
    const env = { BYOK_ENCRYPTION_KEY: BYOK };
    expect(() => openByokSecret(sealed, { ...where, uid: 'uid-b' }, env)).toThrow(ByokKeyUnreadableError);
    expect(() => openByokSecret(sealed, { ...where, provider: 'openai' }, env)).toThrow(ByokKeyUnreadableError);
    // The version field removed or edited: unreadable, whatever it was changed to.
    expect(() => openByokSecret({ encryptedApiKey: sealed.encryptedApiKey }, where, env)).toThrow(ByokKeyUnreadableError);
    expect(() => openByokSecret({ ...sealed, keyVersion: 0 }, where, env)).toThrow(ByokKeyUnreadableError);
    expect(() => openByokSecret({ ...sealed, keyVersion: 7 }, where, env)).toThrow(ByokKeyUnreadableError);
    expect(() => openByokSecret({ ...sealed, keyVersion: '1' }, where, env)).toThrow(ByokKeyUnreadableError);
  });

  /**
   * The legacy read path is gone (owner decision 30.09.2026: a dry run against
   * both databases found no stored model key, so there was nothing to migrate).
   * A record in the pre-3.0.13 shape — no version, sealed with the S/4 key — is
   * unreadable, with a reason for the log, and the S/4 key is never tried.
   */
  const reasonOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(ByokKeyUnreadableError);
      return { reason: (e as ByokKeyUnreadableError).reason, keyVersion: (e as ByokKeyUnreadableError).keyVersion };
    }
    throw new Error('opened a record that must stay unreadable');
  };

  test('a record without a version is not read — the S/4 key that sealed it is never tried', () => {
    // playwright.config.ts supplies the test S/4 key to this process, so the
    // S/4 key *could* open this record; the point is that nothing asks it to.
    const legacy = { encryptedApiKey: encryptWithS4Key(SECRET) };
    expect(decryptWithS4Key(legacy.encryptedApiKey), 'fixture: the S/4 key opens it').toBe(SECRET);
    expect(reasonOf(() => openByokSecret(legacy, where, { BYOK_ENCRYPTION_KEY: BYOK }))).toEqual({ reason: 'unversioned', keyVersion: null });
    expect(reasonOf(() => openByokSecret(legacy, where, {}))).toEqual({ reason: 'unversioned', keyVersion: null });
    // Labelled version 0, it is a version outside the ring, not a way back in.
    expect(reasonOf(() => openByokSecret({ ...legacy, keyVersion: 0 }, where, { BYOK_ENCRYPTION_KEY: BYOK }))).toEqual({ reason: 'unknown-version', keyVersion: 0 });
    // And the other two reasons, for the log.
    const sealed = sealByokSecret(SECRET, where, { BYOK_ENCRYPTION_KEY: BYOK });
    expect(reasonOf(() => openByokSecret(sealed, where, {}))).toEqual({ reason: 'key-missing', keyVersion: BYOK_KEY_VERSION });
    expect(reasonOf(() => openByokSecret(sealed, where, { BYOK_ENCRYPTION_KEY: OTHER }))).toEqual({ reason: 'decrypt-failed', keyVersion: BYOK_KEY_VERSION });
  });

  test('no BYOK code can reach S4_ENCRYPTION_KEY', () => {
    const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // The sealing module imports nothing but crypto, so the S/4 helpers are not
    // reachable from it even indirectly.
    const imports = [...read('lib/byok-key.ts').matchAll(/^import[^;]*from '([^']+)';/gm)].map((m) => m[1]);
    expect(imports, 'lib/byok-key.ts imports more than crypto again').toEqual(['crypto']);
    for (const rel of [
      'lib/byok-key.ts',
      'lib/byok-rate-limit.ts',
      'lib/byok-eligibility.ts',
      'app/api/secrets/gemini/route.ts',
      'app/api/secrets/gemini/test/route.ts',
    ]) {
      const src = code(rel);
      expect(src, `${rel} names the S/4 key`).not.toContain('S4_ENCRYPTION_KEY');
      expect(src, `${rel} imports the S/4 credential helpers`).not.toMatch(/s4-credentials/);
    }
    // The store and the load in firebase-admin go through the sealing module only.
    const admin = code('lib/firebase-admin.ts');
    expect(admin).not.toContain('S4_ENCRYPTION_KEY');
    expect(admin).not.toMatch(/s4-credentials/);
    // And the re-key script that read with it is gone.
    expect(fs.existsSync(path.join(ROOT, 'scripts/byok-rekey.ts')), 'the legacy re-key script is back').toBe(false);
  });

  test('without a usable BYOK key nothing is sealed — and never with the S/4 key instead', () => {
    for (const env of [{}, { BYOK_ENCRYPTION_KEY: '' }, { BYOK_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }]) {
      expect(byokEncryptionConfigured(env)).toBe(false);
      expect(() => sealByokSecret(SECRET, where, env)).toThrow(ByokKeyUnavailableError);
    }
    // The error the save route turns into its answer names the reason and says nothing was stored.
    expect(new ByokKeyUnavailableError().message).toMatch(/byok-key-unavailable[\s\S]*Nothing was saved/);
    // A version-1 record cannot be read without the key either — thrown, not `null`,
    // so no caller mistakes it for "no key" and spends the community key.
    const sealed = sealByokSecret(SECRET, where, { BYOK_ENCRYPTION_KEY: BYOK });
    expect(() => openByokSecret(sealed, where, {})).toThrow(ByokKeyUnreadableError);
  });

  test('the store writes through the sealing module only, and the S/4 helpers are gone from it', () => {
    const admin = read('lib/firebase-admin.ts');
    const save = admin.slice(admin.indexOf('export async function saveGeminiApiKey'), admin.indexOf('export async function loadGeminiApiKey'));
    expect(save).toContain("sealByokSecret(apiKey, { uid, provider: 'gemini' })");
    expect(save).toContain('keyVersion: sealed.keyVersion');
    expect(admin, 'firebase-admin seals with the S/4 key again').not.toMatch(/from '\.\/s4-credentials'/);
    const load = admin.slice(admin.indexOf('export async function loadGeminiApiKey'), admin.indexOf('export async function deleteGeminiApiKey'));
    expect(load).toContain('openByokSecret(');
    expect(load, 'an unreadable key is answered with null again').not.toMatch(/catch[\s\S]*return null;\s*\n\s*\}\s*\n\}/);
  });

  test('/api/health reports degraded without a usable BYOK key, and ok with one', async () => {
    const saved = { byok: process.env.BYOK_ENCRYPTION_KEY, gemini: process.env.GEMINI_API_KEY };
    process.env.GEMINI_API_KEY = saved.gemini || 'health-spec-placeholder';
    try {
      delete process.env.BYOK_ENCRYPTION_KEY;
      let res = await healthGET(new Request('http://localhost:3000/api/health'));
      expect(res.status, 'a deployment that cannot store keys reports healthy').toBe(503);
      expect(((await res.json()) as { status: string }).status).toBe('degraded');
      process.env.BYOK_ENCRYPTION_KEY = BYOK;
      res = await healthGET(new Request('http://localhost:3000/api/health'));
      expect(res.status).toBe(200);
    } finally {
      if (saved.byok === undefined) delete process.env.BYOK_ENCRYPTION_KEY; else process.env.BYOK_ENCRYPTION_KEY = saved.byok;
      if (saved.gemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.gemini;
    }
  });

  test('the deploy maps the secret like the others, and the suite brings a test value', () => {
    const deploy = read('.github/workflows/deploy.yml');
    const job = deploy.slice(deploy.indexOf('\n  deploy:'));
    expect(job).toContain('BYOK_ENCRYPTION_KEY=${{ secrets.BYOK_ENCRYPTION_KEY }}');
    expect(read('playwright.config.ts')).toContain('process.env.BYOK_ENCRYPTION_KEY =');
  });

  test('the deploy stops, before it deploys, when the secret is missing or not 32 bytes', () => {
    const deploy = read('.github/workflows/deploy.yml');
    const job = deploy.slice(deploy.indexOf('\n  deploy:'));
    const step = job.slice(job.indexOf('- name: Assert Production Secrets Configured'), job.indexOf('- name: Authenticate with Google Cloud'));
    expect(step, 'the assertion step no longer comes before the deploy').not.toBe('');
    expect(job.indexOf('- name: Assert Production Secrets Configured')).toBeLessThan(job.indexOf('- name: Deploy to Google Cloud Run'));
    expect(step).toContain('BYOK_ENCRYPTION_KEY: ${{ secrets.BYOK_ENCRYPTION_KEY }}');
    expect(step, 'a missing BYOK key no longer stops the deploy').toMatch(/if \[ -z "\$BYOK_ENCRYPTION_KEY" \]; then\s+echo "::error::[^"]*BYOK_ENCRYPTION_KEY[^"]*"\s+exit 1/);
    expect(step, 'a malformed BYOK key no longer stops the deploy').toMatch(/base64 -d[^\n]*wc -c[\s\S]*!= "32" \]; then\s+echo "::error::[^"]*"\s+exit 1/);
    // Never printed: the value is only ever an input to a pipe.
    for (const line of step.split('\n').filter((l) => /echo|printf/.test(l))) {
      if (line.includes('$BYOK_ENCRYPTION_KEY')) expect(line, 'the key value is echoed').toMatch(/printf '%s' "\$BYOK_ENCRYPTION_KEY" \|/);
    }
    // The comment that called it "passed and not asserted" is gone with the behaviour.
    expect(job).not.toMatch(/BYOK_ENCRYPTION_KEY[^\n]*\n[^\n]*passed and not asserted/);
  });
});

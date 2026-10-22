import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ALLOWED_CLAUDE_MODELS,
  MODEL_KEY_PROVIDERS,
  OWN_CLAUDE_MODEL,
  PLATFORM_PROVIDER,
  PROVIDER_TERMS,
  RECEIPT_PROVIDER_ID,
  STAGE_ANSWER_REFRESH_MS,
  answeredByLine,
  offeredKeyProviders,
  ownKeyProviderOf,
  providerLabelOfReceiptId,
  stageAnswerNeedsWrite,
  storedKeyProviderOf,
  type StageAnswerRecord,
} from '../lib/model-providers';
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_MODELS_URL,
  ANTHROPIC_VERSION,
  AnthropicHttpError,
  callClaudeMessages,
  claudeAnswerOf,
  claudeEffortFor,
  claudeJsonSchema,
  claudeRequestBody,
  ownKeyRefused,
  testAnthropicKey,
} from '../lib/anthropic-messages';
import { modelCompletion } from '../lib/model-completion';
import { isTransientModelError } from '../lib/model-retry';
import { issueModelReceipt, verifyModelReceipt, MODEL_PROVIDER_ID } from '../lib/model-receipt';
import { ByokKeyUnreadableError, OwnModelKeyMissingError, OWN_KEY_MISSING_CODE, OWN_KEY_REJECTED_CODE, ownKeyRejectedMessage, openByokSecret, sealByokSecret } from '../lib/byok-key';
import { TESTING_RESPONSE_SCHEMA, TRANSFORMATION_RESPONSE_SCHEMA } from '../lib/model-response-schema';
import { analysisModelLine } from '../lib/delivery-package';
import { analysisModelFactsOf } from '../lib/delivery-facts';

/**
 * Roadmap 3.0.15 — data sovereignty over the model, part B: Claude as an own
 * key beside Gemini. Server-free: pure modules, the Anthropic client against a
 * mocked `fetch`, the provider choice rendered to a string, and source guards
 * for the proxy's routing. The halves that need Firestore and the real route
 * handlers are in `tests/byok-claude-routes.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

type Call = { url: string; init: RequestInit };
function mockFetch(answer: { status: number; json?: unknown }) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(answer.json === undefined ? null : JSON.stringify(answer.json), { status: answer.status });
  }) as typeof fetch;
  return { calls, impl };
}
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

// ── the provider field and its read bridge ──────────────────────────────────

test.describe('the provider of an own key — read bridge, no migration', () => {
  test('a profile from before 3.0.15 (no byokProvider) reads as Gemini; no key reads as none', () => {
    expect(ownKeyProviderOf({ byokConfigured: true })).toBe('gemini');
    expect(ownKeyProviderOf({ byokConfigured: true, byokProvider: 'anthropic' })).toBe('anthropic');
    expect(ownKeyProviderOf({ byokConfigured: true, byokProvider: 'gemini' })).toBe('gemini');
    expect(ownKeyProviderOf({})).toBeNull();
    expect(ownKeyProviderOf(null)).toBeNull();
    // A value this code does not know is not guessed into Gemini.
    expect(ownKeyProviderOf({ byokConfigured: true, byokProvider: 'openai' })).toBe('unknown');
  });

  test('a stored record without provider is a Gemini record, and only under the gemini document', () => {
    expect(storedKeyProviderOf({}, 'gemini')).toBe('gemini');
    expect(storedKeyProviderOf({}, 'anthropic')).toBeNull();
    expect(storedKeyProviderOf({ provider: 'anthropic' }, 'anthropic')).toBe('anthropic');
    expect(storedKeyProviderOf({ provider: 'anthropic' }, 'gemini')).toBeNull();
    expect(storedKeyProviderOf({ provider: 'openai' }, 'openai')).toBeNull();
  });

  test('a sealed Anthropic key opens only as Anthropic\'s, and a Gemini one only as Gemini\'s', () => {
    const env = { BYOK_ENCRYPTION_KEY: Buffer.alloc(32, 'byok-claude-spec').toString('base64') };
    const claude = sealByokSecret('sk-ant-spec-0000', { uid: 'u1', provider: 'anthropic' }, env);
    expect(openByokSecret(claude, { uid: 'u1', provider: 'anthropic' }, env)).toBe('sk-ant-spec-0000');
    expect(() => openByokSecret(claude, { uid: 'u1', provider: 'gemini' }, env)).toThrow(ByokKeyUnreadableError);
  });

  test('the store writes and reads the provider through the bridge, and the save keeps one key per account', () => {
    const admin = read('lib/firebase-admin.ts');
    const save = admin.slice(admin.indexOf('export async function saveOwnModelKey'), admin.indexOf('export async function loadOwnModelKey'));
    expect(save).toMatch(/keyVersion: sealed\.keyVersion,\s*provider,\s*last4,/);
    expect(save).toContain('byokProvider: provider,');
    expect(save).toContain('for (const other of MODEL_KEY_PROVIDERS) if (other !== provider) tx.delete(secrets.doc(other));');
    const load = admin.slice(admin.indexOf('export async function loadOwnModelKey'), admin.indexOf('export async function deleteOwnModelKey'));
    expect(load).toContain('ownKeyProviderOf(profile)');
    expect(load).toContain('storedKeyProviderOf(data, provider)');
    // The erasure batch deletes every provider's record.
    expect(admin).toContain("for (const provider of MODEL_KEY_PROVIDERS) batch.delete(db.collection('user_secrets').doc(uid).collection('providers').doc(provider));");
    expect([...MODEL_KEY_PROVIDERS]).toEqual(['gemini', 'anthropic']);
  });
});

// ── no fallback with an own key ─────────────────────────────────────────────

test.describe('with an own key, no call falls back to the platform key', () => {
  test('the loader throws — never answers "no key" — when the profile names a key that is not there', () => {
    const admin = read('lib/firebase-admin.ts');
    const load = admin.slice(admin.indexOf('export async function loadOwnModelKey'), admin.indexOf('export async function deleteOwnModelKey'));
    expect(load).toMatch(/if \(named === 'unknown'\) throw new OwnModelKeyMissingError\(\);/);
    expect(load).toMatch(/if \(named !== null\) throw new OwnModelKeyMissingError\(\);\s*return null;/);
    expect(new OwnModelKeyMissingError().message).toContain(OWN_KEY_MISSING_CODE);
    expect(new OwnModelKeyMissingError().message).toMatch(/nothing is sent with the platform key/);
  });

  test('the proxy refuses a missing or unreadable own key, and reaches the platform key only without one', () => {
    const route = read('app/api/gemini/route.ts');
    expect(route).toMatch(/keyErr instanceof ByokKeyUnreadableError \|\| keyErr instanceof OwnModelKeyMissingError/);
    // The platform client is chosen only for Gemini and only when there is no own key.
    expect(route).toMatch(/const ai = provider !== 'gemini'\s*\? null\s*: byokKey\s*\? new GoogleGenAI\(\{ apiKey: byokKey \}\)\s*: getDefaultAI\(\);/);
    expect(route.match(/getDefaultAI\(\)/g)?.length, 'the platform key is reached from a second place').toBe(2); // definition + the one use
    expect(route).toContain('const provider: ModelKeyProvider = ownKey ? ownKey.provider : PLATFORM_PROVIDER;');
    // A refused own key ends the call with its code — no retry with another key.
    expect(route).toMatch(/if \(calledWithOwnKey && ownKeyRefused\(error\)\) \{\s*return NextResponse\.json\(\s*\{ error: ownKeyRejectedMessage\(PROVIDER_LABEL\[calledWithOwnKey\]\), code: OWN_KEY_REJECTED_CODE \}/);
    // The model-stages answer does not promise a key the proxy would refuse.
    const stages = read('app/api/model-stages/route.ts');
    expect(stages).toContain('err instanceof ByokKeyUnreadableError || err instanceof OwnModelKeyMissingError');
  });

  test('a provider refusing the key is recognised by status, and said with its code', () => {
    expect(ownKeyRefused(new AnthropicHttpError(401))).toBe(true);
    expect(ownKeyRefused(new AnthropicHttpError(403))).toBe(true);
    expect(ownKeyRefused(Object.assign(new Error('API key not valid. Please pass a valid API key. API_KEY_INVALID'), { status: 400 }))).toBe(true);
    expect(ownKeyRefused(new AnthropicHttpError(429))).toBe(false);
    expect(ownKeyRefused(new AnthropicHttpError(500))).toBe(false);
    expect(ownKeyRefused(new Error('fetch failed'))).toBe(false);
    const m = ownKeyRejectedMessage('Anthropic Claude');
    expect(m).toContain(OWN_KEY_REJECTED_CODE);
    expect(m).toMatch(/nothing was sent with the platform key/);
  });
});

// ── the key test reads the Models API ───────────────────────────────────────

test.describe('the Anthropic key test', () => {
  test('is one GET of the Models API with the key and the version header — no body, no tokens', async () => {
    const { calls, impl } = mockFetch({ status: 200, json: { data: [{ id: OWN_CLAUDE_MODEL }] } });
    await testAnthropicKey('sk-ant-spec-1111', impl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ANTHROPIC_MODELS_URL);
    expect(calls[0].url.startsWith('https://api.anthropic.com/v1/models')).toBe(true);
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
    expect(header(calls[0].init, 'x-api-key')).toBe('sk-ant-spec-1111');
    expect(header(calls[0].init, 'anthropic-version')).toBe(ANTHROPIC_VERSION);
  });

  test('a refused key is an error carrying the status only — never the key or the provider\'s words', async () => {
    const { impl } = mockFetch({ status: 401, json: { error: { message: 'invalid x-api-key sk-ant-spec-2222' } } });
    const err = await testAnthropicKey('sk-ant-spec-2222', impl).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AnthropicHttpError);
    expect((err as AnthropicHttpError).status).toBe(401);
    expect((err as Error).message).not.toContain('sk-ant');
  });

  test('the test route sends an Anthropic key to the Models API and a Gemini key as before', () => {
    // 3.0.21: one key test for both routes (`lib/own-key-test.ts`): Anthropic's Models API, Gemini's models.get.
    const src = read('app/api/secrets/gemini/test/route.ts');
    expect(src).toContain('await testOwnModelKey(provider, apiKey!, { stubbed });');
    expect(src.indexOf('assertByokAllowed(')).toBeLessThan(src.indexOf('testOwnModelKey('));
    expect(src.indexOf("assertByokRateLimit('test', decodedToken.uid)")).toBeLessThan(src.indexOf('testOwnModelKey('));
    const one = read('lib/own-key-test.ts');
    expect(one).toMatch(/if \(provider === 'anthropic'\) \{\s*await testAnthropicKey\(key\);/);
    expect(one).toContain('ai.models.get({ model: PRODUCT_GEMINI_MODEL })');
    expect(one).not.toContain('generateContent');
  });
});

// ── the proxy's Anthropic path ──────────────────────────────────────────────

test.describe('the proxy routes by provider', () => {
  test('a Claude call is a Messages API POST with the own key, the one Claude model and the stage schema', async () => {
    const { calls, impl } = mockFetch({
      status: 200,
      json: { content: [{ type: 'text', text: '{"files":[],' }, { type: 'text', text: '"tests":{"config":"","spec":""}}' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } },
    });
    const out = await callClaudeMessages(
      { apiKey: 'sk-ant-spec-3333', model: OWN_CLAUDE_MODEL, prompt: 'Transform this.', jsonResponse: true, schema: TRANSFORMATION_RESPONSE_SCHEMA, effort: 'low' },
      impl,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(calls[0].init.method).toBe('POST');
    expect(header(calls[0].init, 'x-api-key')).toBe('sk-ant-spec-3333');
    expect(header(calls[0].init, 'anthropic-version')).toBe(ANTHROPIC_VERSION);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe(OWN_CLAUDE_MODEL);
    expect(body.messages).toEqual([{ role: 'user', content: 'Transform this.' }]);
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.output_config.format.schema.properties.files.items.additionalProperties).toBe(false);
    // Never a parameter a current Claude model refuses.
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) expect(body, k).not.toHaveProperty(k);
    expect(modelCompletion(out.answer)).toEqual({ ok: true, text: '{"files":[],"tests":{"config":"","spec":""}}' });
    expect(out.usage).toMatchObject({ promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 });
  });

  test('JSON without a schema asks for JSON in a system line; plain text asks for nothing extra', () => {
    const json = claudeRequestBody({ model: OWN_CLAUDE_MODEL, prompt: 'p', jsonResponse: true });
    expect(json.system).toMatch(/JSON value only/);
    expect(json).not.toHaveProperty('output_config');
    const text = claudeRequestBody({ model: OWN_CLAUDE_MODEL, prompt: 'p', jsonResponse: false });
    // 3.0.21: the data region travels on every call, plain text included.
    expect(Object.keys(text).sort()).toEqual(['inference_geo', 'max_tokens', 'messages', 'model']);
  });

  test('the schema adaptation adds additionalProperties:false everywhere and drops what structured outputs refuse', () => {
    const s = claudeJsonSchema({ type: 'object', properties: { a: { type: 'array', minItems: 1, items: { type: 'object', properties: { b: { type: 'string', maxLength: 3 } } } } } }) as Record<string, any>;
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.a).not.toHaveProperty('minItems');
    expect(s.properties.a.items.additionalProperties).toBe(false);
    expect(s.properties.a.items.properties.b).toEqual({ type: 'string' });
    // The testing schema's optional members stay optional; nothing is added to `required`.
    const t = claudeJsonSchema(TESTING_RESPONSE_SCHEMA) as Record<string, any>;
    expect(t.properties.testCases.items.required).toEqual(TESTING_RESPONSE_SCHEMA.properties.testCases.items.required);
  });

  test('stop reasons map onto the completeness rule: cut off and refused are not results', () => {
    expect(modelCompletion(claudeAnswerOf({ content: [{ type: 'text', text: 'x' }], stop_reason: 'max_tokens' }).answer)).toMatchObject({ ok: false, reason: 'truncated' });
    expect(modelCompletion(claudeAnswerOf({ content: [], stop_reason: 'refusal' }).answer)).toMatchObject({ ok: false, reason: 'filtered' });
    expect(modelCompletion(claudeAnswerOf({ content: [{ type: 'text', text: 'x' }], stop_reason: 'pause_turn' }).answer)).toMatchObject({ ok: false, reason: 'unfinished' });
    expect(modelCompletion(claudeAnswerOf({ content: [{ type: 'text', text: 'x' }] }).answer)).toMatchObject({ ok: false, reason: 'unfinished' });
  });

  test('a busy provider is retried like Gemini; a refused key is not', async () => {
    expect(isTransientModelError(new AnthropicHttpError(429).message)).toBe(true);
    expect(isTransientModelError(new AnthropicHttpError(529).message)).toBe(true);
    expect(isTransientModelError(new AnthropicHttpError(503).message)).toBe(true);
    expect(isTransientModelError(new AnthropicHttpError(401).message)).toBe(false);
    const { impl } = mockFetch({ status: 529 });
    await expect(callClaudeMessages({ apiKey: 'k', model: OWN_CLAUDE_MODEL, prompt: 'p', jsonResponse: false }, impl)).rejects.toBeInstanceOf(AnthropicHttpError);
  });

  test('thinking levels become effort words; no level, no effort', () => {
    expect(claudeEffortFor({ thinkingLevel: 'LOW' })).toBe('low');
    expect(claudeEffortFor({ thinkingLevel: 'MEDIUM' })).toBe('medium');
    expect(claudeEffortFor({ thinkingLevel: 'HIGH' })).toBe('high');
    expect(claudeEffortFor(undefined)).toBeUndefined();
  });

  test('the route sends an own Claude key to the Anthropic path, and only one Claude model, from one place', () => {
    const route = read('app/api/gemini/route.ts');
    expect(route).toMatch(/: provider === 'anthropic'\s*\? await callWithRetry\(async \(\) => \{[\s\S]*?await callClaudeMessages\(\{\s*apiKey: byokKey!,\s*model: servedModel,/);
    expect(route).toContain("const servedModel = provider === 'anthropic' ? OWN_CLAUDE_MODEL : model;");
    expect(route).toContain("if (provider === 'anthropic' && !ALLOWED_CLAUDE_MODELS.has(servedModel))");
    expect([...ALLOWED_CLAUDE_MODELS]).toEqual(['claude-sonnet-5-5']);
    expect(OWN_CLAUDE_MODEL).toBe('claude-sonnet-5-5');
    expect(PLATFORM_PROVIDER, 'part A (the platform on Claude) is not built in this step').toBe('gemini');
    // The completeness rule and the receipt come after both paths.
    expect(route.indexOf('modelCompletion(answer)')).toBeGreaterThan(route.indexOf('await callClaudeMessages('));
    // The Anthropic module reads no environment: the key is only ever a parameter.
    expect(read('lib/anthropic-messages.ts')).not.toMatch(/process\.env/);
  });
});

// ── the receipt, the audit pack and STATUS.md name provider, model and key owner ──

test.describe('who answered is recorded', () => {
  const KEY = 'byok-claude-spec-signing-key-000000000000';

  test('a receipt names Anthropic, the Claude model and the own key — and verifies like a Gemini one', () => {
    expect(RECEIPT_PROVIDER_ID.gemini, 'the Gemini id every earlier receipt carries changed').toBe(MODEL_PROVIDER_ID);
    expect(RECEIPT_PROVIDER_ID.anthropic).toBe('anthropic');
    const r = issueModelReceipt({ uid: 'u', text: 't', provider: RECEIPT_PROVIDER_ID.anthropic, modelId: OWN_CLAUDE_MODEL, byok: true, stage: 'design' }, KEY);
    const v = verifyModelReceipt(r, { uid: 'u', text: 't', key: KEY });
    expect(v.ok).toBe(true);
    expect(v.ok && v.receipt).toMatchObject({ provider: 'anthropic', modelId: OWN_CLAUDE_MODEL, byok: true });
    // The claim set is unchanged: the same eight keys as a Gemini receipt with a stage.
    expect(Object.keys(r).sort()).toEqual(['byok', 'iat', 'mac', 'modelId', 'provider', 'stage', 'textSha256', 'uid', 'v']);
  });

  test('STATUS.md names the provider, model and key owner of the signed analysis', () => {
    const facts = analysisModelFactsOf({ auditMetadata: { modelCard: { provider: 'anthropic', model: OWN_CLAUDE_MODEL, byokUsed: true, modelParticipation: 'narrative-attested', engineVersion: 'x' } } } as never);
    expect(analysisModelLine(facts)).toBe(`Anthropic Claude · ${OWN_CLAUDE_MODEL} · the account's own key (analysis narrative, from the signed run)`);
    const platform = analysisModelFactsOf({ auditMetadata: { modelCard: { provider: 'google-gemini', model: 'gemini-3.8-flash', byokUsed: false, modelParticipation: 'narrative-attested', engineVersion: 'x' } } } as never);
    expect(analysisModelLine(platform)).toBe('Google Gemini · gemini-3.8-flash · the platform key (analysis narrative, from the signed run)');
    const none = analysisModelFactsOf({ auditMetadata: { modelCard: { provider: null, model: null, byokUsed: false, modelParticipation: 'none', engineVersion: 'x' } } } as never);
    expect(analysisModelLine(none)).toMatch(/^None — /);
    expect(analysisModelLine(null)).toBe('Not recorded');
    const src = read('lib/delivery-package.ts');
    expect(src).toContain("if (facts.run.model !== undefined) row('Language model', analysisModelLine(facts.run.model));");
  });

  test('per stage, the account sees who answered last, and the record is written only when it changes', () => {
    const at = '2026-10-16T10:00:00.000Z';
    const rec: StageAnswerRecord = { provider: 'anthropic', modelId: OWN_CLAUDE_MODEL, keyOwner: 'own', at };
    expect(answeredByLine(rec)).toBe(`Anthropic Claude · ${OWN_CLAUDE_MODEL} · your own key`);
    expect(answeredByLine({ provider: 'google-gemini', modelId: 'gemini-3.8-flash', keyOwner: 'platform' })).toBe('Google Gemini · gemini-3.8-flash · the platform key');
    expect(stageAnswerNeedsWrite(undefined, rec)).toBe(true);
    expect(stageAnswerNeedsWrite(rec, { ...rec, at: '2026-10-16T10:01:00.000Z' })).toBe(false);
    expect(stageAnswerNeedsWrite(rec, { ...rec, keyOwner: 'platform' })).toBe(true);
    expect(stageAnswerNeedsWrite(rec, { ...rec, at: new Date(Date.parse(at) + STAGE_ANSWER_REFRESH_MS).toISOString() })).toBe(true);
    expect(providerLabelOfReceiptId('google-gemini')).toBe('Google Gemini');
    expect(providerLabelOfReceiptId('something-else')).toBe('something-else');
    const route = read('app/api/gemini/route.ts');
    expect(route).toContain('if (stageAnswerNeedsWrite(previous, record))');
    expect(route).toContain('await profile.ref.update({ [`modelAnswers.${stage}`]: record });');
  });
});

// ── Settings renders the provider choice ────────────────────────────────────

test.describe('Settings', () => {
  const OUT = path.resolve(ROOT, 'tmp', 'byok-claude-spec', String(process.pid));
  type Choice = (props: { value: 'gemini' | 'anthropic'; onChange: () => void; savedProvider?: 'gemini' | 'anthropic' | null }) => React.ReactElement;
  let OwnKeyProviderChoice: Choice;

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    fs.mkdirSync(OUT, { recursive: true });
    await build({
      entryPoints: [path.resolve(ROOT, 'components', 'settings', 'OwnKeyProviderChoice.tsx')],
      outfile: path.join(OUT, 'OwnKeyProviderChoice.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    OwnKeyProviderChoice = require(path.join(OUT, 'OwnKeyProviderChoice.cjs')).default as Choice;
  });

  test('the provider choice offers Gemini and Anthropic as radios, the chosen one checked', () => {
    const html = renderToStaticMarkup(React.createElement(OwnKeyProviderChoice, { value: 'anthropic', onChange: () => {}, savedProvider: 'gemini' }));
    expect(html).toContain('data-own-key-provider="anthropic"');
    expect(html).toContain('Provider of your key');
    expect(html).toContain('Google Gemini (saved)');
    expect(html.match(/type="radio"/g)).toHaveLength(offeredKeyProviders().length);
    // Anthropic is offered only once the owner's privacy policy, terms and DPA name it (ANTHROPIC_OWN_KEY_OFFERED).
    if (offeredKeyProviders().includes('anthropic')) {
      expect(html).toContain('Anthropic Claude');
      expect(html).toContain(OWN_CLAUDE_MODEL);
      expect(html).toMatch(/value="anthropic"[^>]*checked=""|checked=""[^>]*value="anthropic"/);
    } else {
      expect(html).not.toContain('Anthropic Claude');
    }
    expect(html).toMatch(/no step of this account uses the platform key/);
  });

  test('the page renders the choice in the key card and sends the provider with save and test', () => {
    const page = read('app/(app)/settings/page.tsx');
    expect(page).toContain('<OwnKeyProviderChoice');
    expect(page).toMatch(/body: JSON\.stringify\(\{\s*apiKey: geminiKey\.trim\(\),\s*provider: keyProvider,/);
    expect(page).toContain('body: JSON.stringify(enteredKey ? { apiKey: enteredKey, provider: keyProvider } : {}),');
    // The save route checks the same list the choice is drawn from.
    const save = read('app/api/secrets/gemini/route.ts');
    expect(save).toContain('!offeredKeyProviders().includes(provider)');
  });
});

// ── the Trust page ──────────────────────────────────────────────────────────

test('the Trust page says where code goes per provider, links the providers\' own terms, and names the engine-only path', () => {
  // Since Fassung 1.1 of the legal texts (3.0.21) the trust page renders its
  // words from lib/legal/texts/trust.en.ts — "Where your code goes" lists the
  // engine-only path first, then our key, an own Gemini key, an own Anthropic
  // key and other providers, each with the provider's own terms linked.
  const trust = read('lib/legal/texts/trust.en.ts');
  expect(read('app/(app)/trust/page.tsx')).toContain('TRUST_EN');
  expect(trust).toContain('## Where your code goes');
  expect(trust).toMatch(/\*\*No model — the engine only\.\*\*/);
  expect(trust).toMatch(/This is the choice for code that must not reach any model provider/);
  expect(trust).toMatch(/\*\*Your own Gemini key/);
  expect(trust).toMatch(/\*\*Your own Anthropic key/);
  expect(trust).toContain('https://ai.google.dev/gemini-api/terms');
  expect(trust).toContain('https://www.anthropic.com/legal/commercial-terms');
  expect(trust).toContain('https://www.anthropic.com/legal/privacy');
  for (const p of MODEL_KEY_PROVIDERS) {
    expect(PROVIDER_TERMS[p].length).toBeGreaterThan(0);
    for (const t of PROVIDER_TERMS[p]) expect(t.href).toMatch(/^https:\/\/(ai\.google\.dev|policies\.google\.com|www\.anthropic\.com)\//);
  }
});

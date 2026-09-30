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

/**
 * Roadmap 3.0.13 — the BYOK hardening before 3.0.
 *
 * One section per point of the roadmap line, each with the check that fails
 * without the change. Pure where the rule is pure; a source guard only where the
 * behaviour cannot be reached from a test run (the rate limiter is switched off
 * under the emulator, `lib/rate-limit.ts`). The route-level halves that need a
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

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  issueModelReceipt,
  verifyModelReceipt,
  MODEL_PROVIDER_ID,
  type ModelReceipt,
} from '../lib/model-receipt';

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

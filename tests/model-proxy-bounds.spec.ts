import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { isModelCallStage, STAGE_MAX_OUTPUT_TOKENS, PROXY_ONLY_STAGES } from '../lib/model-call-stage';
import { MODEL_STAGES } from '../lib/model-stages';
import {
  budgetAdmits,
  budgetDay,
  DEFAULT_PLATFORM_MODEL_DAILY_CALLS,
  platformDailyCallCap,
  reservePlatformModelCall,
  resetPlatformBudgetMemory,
  type BudgetStore,
} from '../lib/platform-model-budget';
import { issueModelReceipt, narrativeDigest, verifyModelReceipt, verifyModelReceiptIssuer } from '../lib/model-receipt';
import { claimReceiptUse, type ReceiptUseStore } from '../lib/model-receipt-uses';

/**
 * SEC-01 (app part) and CA-INT-02 — the model proxy names its stage, bounds
 * each answer, keeps the community key within a daily budget, and its receipts
 * bind the prompt and are used once by the stores that check them without
 * their text. The route itself is exercised against the emulators in
 * `tests/gemini-route-deadline.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const KEY = 'r'.repeat(48);

test.describe('the stage of a call (SEC-01)', () => {
  test('every model stage and the help chatbot are stages; nothing else is', () => {
    for (const s of [...MODEL_STAGES, ...PROXY_ONLY_STAGES]) expect(isModelCallStage(s), s).toBe(true);
    for (const s of [undefined, null, '', 'analysis', 'admin', 42]) expect(isModelCallStage(s), String(s)).toBe(false);
  });

  test('every stage has an output bound, within what the models produce', () => {
    for (const s of [...MODEL_STAGES, ...PROXY_ONLY_STAGES]) {
      const n = STAGE_MAX_OUTPUT_TOKENS[s];
      expect(n, s).toBeGreaterThan(0);
      expect(n, s).toBeLessThanOrEqual(65_536);
    }
    // At least twice the largest measured call (see lib/model-call-stage.ts).
    expect(STAGE_MAX_OUTPUT_TOKENS.transformation).toBeGreaterThanOrEqual(2 * 33_193 - 1000);
    expect(STAGE_MAX_OUTPUT_TOKENS.statements).toBeGreaterThanOrEqual(2 * 15_621);
  });

  test('the route refuses a call without a stage and bounds every Gemini call by it', () => {
    const route = read('app/api/gemini/route.ts');
    expect(route).toContain('if (!isModelCallStage(stage)) {');
    expect(route.indexOf('if (!isModelCallStage(stage)) {')).toBeLessThan(route.indexOf('loadOwnModelKey('));
    expect(route).toContain('const maxOutputTokens = STAGE_MAX_OUTPUT_TOKENS[stage];');
    const call = route.slice(route.indexOf('ai!.models.generateContent({'), route.indexOf('}).catch((providerErr', route.indexOf('ai!.models.generateContent({')));
    expect(call.match(/maxOutputTokens,/g) ?? [], 'both config branches carry the bound').toHaveLength(2);
    // The browser names a stage on every call, the help chatbot included.
    expect(read('lib/gemini.ts')).toMatch(/\n {2}stage: ModelCallStage,/);
    expect(read('components/GlossaryChatbot.tsx').match(/callGemini\([^)]*'glossary'\)/g) ?? []).toHaveLength(2);
  });
});

/** An in-memory stand-in for the one document the budget reads and writes. */
function memoryStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const store: BudgetStore = {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ data: () => docs.get(`${name}/${id}`) }),
        set: async (data) => {
          const prev = docs.get(`${name}/${id}`) ?? {};
          const next: Record<string, unknown> = { ...prev };
          for (const [k, v] of Object.entries(data)) {
            next[k] = v && typeof v === 'object' && 'inc' in (v as object) ? (Number(prev[k] ?? 0) + (v as { inc: number }).inc) : v;
          }
          docs.set(`${name}/${id}`, next);
        },
      }),
    }),
  };
  return { store, docs, increment: (n: number) => ({ inc: n }) };
}

test.describe('the community key\'s daily budget (SEC-01)', () => {
  test.beforeEach(() => resetPlatformBudgetMemory());

  test('the cap comes from the environment when it is a sane whole number, else the default', () => {
    expect(platformDailyCallCap({})).toBe(DEFAULT_PLATFORM_MODEL_DAILY_CALLS);
    expect(platformDailyCallCap({ PLATFORM_MODEL_DAILY_CALLS: '500' })).toBe(500);
    for (const bad of ['0', '-1', 'lots', '1e9', '2.5', '99999999']) {
      expect(platformDailyCallCap({ PLATFORM_MODEL_DAILY_CALLS: bad }), bad).toBe(DEFAULT_PLATFORM_MODEL_DAILY_CALLS);
    }
  });

  test('calls are admitted up to the cap and refused after it, the breaker remembered, the next day open again', async () => {
    const { store, docs, increment } = memoryStore();
    const now = new Date('2026-10-22T10:00:00Z');
    for (let i = 0; i < 3; i++) expect((await reservePlatformModelCall(store, increment, { now, cap: 3 })).ok).toBe(true);
    expect((await reservePlatformModelCall(store, increment, { now, cap: 3 })).ok).toBe(false);
    const doc = docs.get(`platform_model_budget/${budgetDay(now)}`)!;
    expect(doc.calls).toBe(3);
    expect(doc.open).toBe(true);
    // Remembered: refused without reading the store again.
    docs.clear();
    expect((await reservePlatformModelCall(store, increment, { now, cap: 3 })).ok).toBe(false);
    // A new UTC day starts with a closed breaker.
    expect((await reservePlatformModelCall(store, increment, { now: new Date('2026-10-23T00:00:01Z'), cap: 3 })).ok).toBe(true);
  });

  test('the count decides, so a cap raised by a redeploy admits calls again', () => {
    expect(budgetAdmits({ calls: 10, open: true } as { calls: number }, 11)).toBe(true);
    expect(budgetAdmits({ calls: 10 }, 10)).toBe(false);
    expect(budgetAdmits(undefined, 1)).toBe(true);
  });

  test('the route counts only calls the platform key pays for, before the lease counts them', () => {
    const route = read('app/api/gemini/route.ts');
    const at = route.indexOf('reservePlatformModelCall(db');
    expect(at).toBeGreaterThan(-1);
    const guard = route.lastIndexOf('if (!ownKey && !stubbed) {', at);
    expect(guard, 'the budget is asked for an own key too').toBeGreaterThan(-1);
    expect(at - guard).toBeLessThan(400);
    expect(at).toBeLessThan(route.indexOf('const counted = await acquireLeaseCall('));
    expect(at).toBeLessThan(route.indexOf('ai!.models.generateContent({'));
  });
});

test.describe('model receipts bind the prompt and are used once (CA-INT-02)', () => {
  test('a receipt carries the digest of the prompt and a random id, both under the MAC', () => {
    const r = issueModelReceipt({ uid: 'u', text: 'answer', provider: 'google-gemini', modelId: 'm', byok: false, stage: 'testing', prompt: 'the question' }, KEY);
    expect(r.promptSha256).toBe(narrativeDigest('the question'));
    expect(r.jti).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyModelReceipt(r, { uid: 'u', text: 'answer', key: KEY, stage: 'testing' }).ok).toBe(true);
    // Changing either claim breaks the MAC.
    expect(verifyModelReceipt({ ...r, promptSha256: narrativeDigest('another question') }, { uid: 'u', text: 'answer', key: KEY }).ok).toBe(false);
    expect(verifyModelReceipt({ ...r, jti: '0'.repeat(32) }, { uid: 'u', text: 'answer', key: KEY }).ok).toBe(false);
    // Two receipts never share an id.
    expect(issueModelReceipt({ uid: 'u', text: 'answer', provider: 'g', modelId: 'm', byok: false }, KEY).jti).not.toBe(r.jti);
  });

  test('the proxy passes the prompt it sent into the receipt', () => {
    const route = read('app/api/gemini/route.ts');
    const call = route.slice(route.indexOf('const receipt = issueModelReceipt('), route.indexOf('signingKey,\n    );', route.indexOf('const receipt = issueModelReceipt(')));
    expect(call).toMatch(/\n\s+prompt,\n/);
  });

  function memoryUses() {
    const docs = new Map<string, Record<string, unknown>>();
    const store: ReceiptUseStore = {
      collection: (name) => ({ doc: (id) => `${name}/${id}` }),
      runTransaction: async (fn) => fn({
        get: async (ref) => ({ exists: docs.has(ref as string), data: () => docs.get(ref as string) }),
        create: (ref, data) => { if (docs.has(ref as string)) throw new Error('exists'); docs.set(ref as string, data); },
      }),
    };
    return { store, docs };
  }

  test('a receipt marks the first artefact it is used for, a retry of that one, and no other', async () => {
    const { store } = memoryUses();
    const r = issueModelReceipt({ uid: 'u', text: 't', provider: 'g', modelId: 'm', byok: false, stage: 'testing' }, KEY);
    expect(verifyModelReceiptIssuer(r, { uid: 'u', key: KEY, stage: 'testing' }).ok).toBe(true);
    expect(await claimReceiptUse(store, r, { projectId: 'p1', artefact: 'test-suite' })).toBe(true);
    expect(await claimReceiptUse(store, r, { projectId: 'p1', artefact: 'test-suite' }), 'a retried store').toBe(true);
    expect(await claimReceiptUse(store, r, { projectId: 'p2', artefact: 'test-suite' }), 'another project').toBe(false);
    expect(await claimReceiptUse(store, r, { projectId: 'p1', artefact: 'business-layer' }), 'another artefact').toBe(false);
  });

  test('a receipt without an id marks nothing in those stores', async () => {
    const { store } = memoryUses();
    expect(await claimReceiptUse(store, { iat: Date.now() }, { projectId: 'p1', artefact: 'test-suite' })).toBe(false);
  });

  test('the stores that check a receipt without its text claim its use first', () => {
    const artefacts = read('app/api/projects/[projectId]/artefacts/route.ts');
    expect(artefacts).toContain('await claimReceiptUse(db, verdict.receipt, { projectId: gate.projectId, artefact: String(fields.action) })');
    const contract = read('app/api/projects/[projectId]/contract/route.ts');
    expect(contract).toContain("await claimReceiptUse(db, receiptVerdict.receipt, { projectId, artefact: 'transformation' })");
  });

  test('runs/create accepts a narrative receipt only under the analyze stage', () => {
    const runs = read('app/api/runs/create/route.ts');
    const call = runs.slice(runs.indexOf('verifyModelReceipt(body.modelReceipt'), runs.indexOf('const attested'));
    expect(call).toContain("stage: 'analyze',");
  });
});

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ThinkingLevel } from '@google/genai';
import {
  COMBINATION_STAGES,
  DEFAULT_LARGE_PROMPT_CHARS,
  FALLBACK_MODEL_ENV,
  LARGE_PROMPT_CHARS_ENV,
  LARGE_PROMPT_MODEL_ENV,
  deploymentModelOf,
  largePromptThreshold,
  planModelCall,
} from '../lib/model-combination';
import { thinkingConfigFor } from '../lib/model-thinking';
import { STAGE_MAX_OUTPUT_TOKENS } from '../lib/model-call-stage';

/**
 * The model combination of the statements stage (study of 13.11.2026,
 * docs/design/model-combination.md): a second model for large prompts and a
 * fallback for an answer the first model did not finish — both the
 * deployment's choice, both off unless set, both decided by the prompt's
 * length and the answer's finish reason and by nothing a client sent.
 *
 * Server-free: the planner is pure, the route is read in its source.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const REGISTER = new Set(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-4-hydrogen']);
const base = { stage: 'statements', promptLength: 20_000, model: 'gemini-3.8-flash', platformKey: true, register: REGISTER };

test.describe('the planner', () => {
  test('with nothing set, every call runs as asked and has no fallback', () => {
    expect(planModelCall({ ...base, env: {} })).toEqual({ model: 'gemini-3.8-flash', routed: false, fallback: null });
  });

  test('a large prompt of a combination stage goes to the named model; a small one stays', () => {
    const env = { [LARGE_PROMPT_MODEL_ENV]: 'gemini-4-hydrogen' };
    expect(planModelCall({ ...base, env })).toEqual({ model: 'gemini-4-hydrogen', routed: true, fallback: null });
    expect(planModelCall({ ...base, env, promptLength: DEFAULT_LARGE_PROMPT_CHARS })).toMatchObject({ model: 'gemini-3.8-flash', routed: false });
    expect(planModelCall({ ...base, env, promptLength: DEFAULT_LARGE_PROMPT_CHARS + 1 })).toMatchObject({ model: 'gemini-4-hydrogen', routed: true });
    // The threshold is the deployment's; a bad value falls back to the measured default.
    expect(largePromptThreshold({})).toBe(DEFAULT_LARGE_PROMPT_CHARS);
    expect(largePromptThreshold({ [LARGE_PROMPT_CHARS_ENV]: '30000' })).toBe(30_000);
    expect(largePromptThreshold({ [LARGE_PROMPT_CHARS_ENV]: 'lots' })).toBe(DEFAULT_LARGE_PROMPT_CHARS);
    expect(largePromptThreshold({ [LARGE_PROMPT_CHARS_ENV]: '-1' })).toBe(DEFAULT_LARGE_PROMPT_CHARS);
    expect(planModelCall({ ...base, env: { ...env, [LARGE_PROMPT_CHARS_ENV]: '30000' } })).toMatchObject({ routed: false });
  });

  test('the fallback is the named model, unless it is the model just asked', () => {
    const env = { [FALLBACK_MODEL_ENV]: 'gemini-4-hydrogen' };
    expect(planModelCall({ ...base, env })).toEqual({ model: 'gemini-3.8-flash', routed: false, fallback: 'gemini-4-hydrogen' });
    // Routed to the same model: a fallback that repeats the call into the same limit is no fallback.
    const both = { ...env, [LARGE_PROMPT_MODEL_ENV]: 'gemini-4-hydrogen' };
    expect(planModelCall({ ...base, env: both })).toEqual({ model: 'gemini-4-hydrogen', routed: true, fallback: null });
    expect(planModelCall({ ...base, env: both, promptLength: 100 })).toEqual({ model: 'gemini-3.8-flash', routed: false, fallback: 'gemini-4-hydrogen' });
    // The deployment already runs the fallback as its product model: nothing to fall back to.
    expect(planModelCall({ ...base, env, model: 'gemini-4-hydrogen' })).toMatchObject({ fallback: null });
  });

  test('a name outside the register is ignored, never trusted', () => {
    expect(deploymentModelOf('gemini-9-nope', REGISTER)).toBeNull();
    expect(deploymentModelOf('  gemini-4-hydrogen ', REGISTER)).toBe('gemini-4-hydrogen');
    expect(deploymentModelOf(undefined, REGISTER)).toBeNull();
    expect(deploymentModelOf('', REGISTER)).toBeNull();
    const env = { [LARGE_PROMPT_MODEL_ENV]: 'gemini-9-nope', [FALLBACK_MODEL_ENV]: 'gemini-2.5-pro' };
    expect(planModelCall({ ...base, env })).toEqual({ model: 'gemini-3.8-flash', routed: false, fallback: null });
  });

  test('only the platform key, only the stages the study measured', () => {
    const env = { [LARGE_PROMPT_MODEL_ENV]: 'gemini-4-hydrogen', [FALLBACK_MODEL_ENV]: 'gemini-4-hydrogen' };
    expect(planModelCall({ ...base, env, platformKey: false })).toEqual({ model: 'gemini-3.8-flash', routed: false, fallback: null });
    expect([...COMBINATION_STAGES]).toEqual(['statements']);
    for (const stage of ['analyze', 'naming', 'design', 'transformation', 'documentation', 'testing', 'glossary']) {
      expect(planModelCall({ ...base, env, stage }), stage).toEqual({ model: 'gemini-3.8-flash', routed: false, fallback: null });
    }
  });
});

test.describe('the thinking level per model and stage', () => {
  test('gemini-4-hydrogen thinks MEDIUM for the statements; the product model keeps its default; a shape rule wins', () => {
    expect(thinkingConfigFor(undefined, {}, { model: 'gemini-4-hydrogen', stage: 'statements' })).toEqual({ thinkingLevel: ThinkingLevel.MEDIUM });
    expect(thinkingConfigFor(undefined, {}, { model: 'gemini-3.8-flash', stage: 'statements' })).toBeUndefined();
    expect(thinkingConfigFor(undefined, {}, { model: 'gemini-4-hydrogen', stage: 'analyze' })).toBeUndefined();
    // Without the call the function is what it was: the shape alone decides.
    expect(thinkingConfigFor(undefined)).toBeUndefined();
    expect(thinkingConfigFor('plain-wording', {}, { model: 'gemini-4-hydrogen', stage: 'statements' })).toEqual({ thinkingLevel: ThinkingLevel.LOW });
    expect(thinkingConfigFor('transformation-fill', {}, { model: 'gemini-4-hydrogen', stage: 'transformation' })).toEqual({ thinkingLevel: ThinkingLevel.LOW });
  });

  test('the statements bound is the ceiling the models produce, so thinking cannot eat the sentences', () => {
    expect(STAGE_MAX_OUTPUT_TOKENS.statements).toBe(65_536);
  });
});

test.describe('the route', () => {
  const route = strip(read('app/api/gemini/route.ts'));

  test('plans the call after the register check, from the prompt length and the platform key, and asks the planned model', () => {
    const check = route.indexOf('if (!modelServable(model, productModel(), ALLOWED_MODELS, EVALUATION_ONLY_MODELS)) {');
    const plan = route.indexOf('planModelCall({ stage, promptLength: prompt.length, model: servedModel, platformKey: !ownKey, env: process.env, register: ALLOWED_MODELS })');
    expect(check).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(check);
    expect(route).toContain('let answeredModel = plan.model;');
    const call = route.slice(route.indexOf('const result = await ai!.models.generateContent({'), route.indexOf('}, undefined, undefined, callSignal);'));
    expect(call).toContain('model: plan.model,');
    expect(call).not.toMatch(/\n\s+model,\n/);
  });

  test('asks the fallback once, only for an unfinished answer the filter did not stop, under the same bound and deadline, and names who answered', () => {
    const at = route.indexOf("if (!completion.ok && completion.reason !== 'filtered' && plan.fallback && ai && !stubbed) {");
    expect(at).toBeGreaterThan(route.indexOf('const completion = modelCompletion(answer);'));
    const cascade = route.slice(at, route.indexOf('if (!outcome.ok) {', at));
    expect(cascade.match(/ai\.models\.generateContent\(\{/g)).toHaveLength(1);
    expect(cascade).toContain('model: fallbackModel,');
    expect(cascade.match(/maxOutputTokens,/g)).toHaveLength(2);
    expect(cascade.match(/abortSignal: callSignal/g)).toHaveLength(2);
    expect(cascade).toContain("thinkingConfigFor(shape, process.env, { model: fallbackModel, stage })");
    expect(cascade).toContain('answeredModel = fallbackModel;');
    expect(cascade).toContain('outcome = modelCompletion(second);');
    // Every call is a usage line, the fallback's too, with how it ended.
    expect(cascade.match(/modelUsageLog\(\{/g)).toHaveLength(2);
    expect(cascade).toContain('finishReason: result.candidates?.[0]?.finishReason ?? null,');
    // The receipt, the stage record and answeredBy name the model that answered.
    const receipt = route.slice(route.indexOf('const receipt = issueModelReceipt('), route.indexOf('signingKey,', route.indexOf('const receipt = issueModelReceipt(')));
    expect(receipt).toContain('modelId: answeredModel,');
    expect(route).toContain('const record: StageAnswerRecord = { provider: receiptProvider, modelId: answeredModel, keyOwner,');
    expect(route).toContain('const answeredBy = { provider: receiptProvider, modelId: answeredModel, keyOwner,');
    expect(route).not.toMatch(/modelId: servedModel/);
  });
});

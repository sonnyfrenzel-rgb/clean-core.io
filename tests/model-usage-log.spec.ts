import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { modelUsageLog } from '../lib/model-usage-log';

/**
 * One usage line per model call (`gemini usage`): token counts, duration,
 * stage, answer shape and whether a lease paid — never the prompt or the
 * answer. On 13.10.2026 fill calls of 9–292 s could not be explained from the
 * logs; the provider's `usageMetadata` says where the time went.
 *
 * Server-free: the field builder is pure, the route is read in its source.
 */

const ROOT = path.resolve(__dirname, '..');
const src = fs
  .readFileSync(path.join(ROOT, 'app/api/gemini/route.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the line carries the four counts, the duration, the stage, the shape and the lease — and nothing else', () => {
  const secret = 'FORM secret_source. SELECT * FROM zcustomer.';
  const fields = modelUsageLog({
    usage: {
      promptTokenCount: 3912,
      candidatesTokenCount: 2100,
      thoughtsTokenCount: 18_400,
      totalTokenCount: 24_412,
      // What else a provider may put there is not carried.
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 3912 }],
      text: secret,
    },
    model: 'gemini-3.8-flash',
    stage: 'transformation',
    responseShape: 'transformation-fill',
    leased: true,
    durationMs: 165_012.4,
  });
  expect(fields).toEqual({
    route: 'api/gemini',
    model: 'gemini-3.8-flash',
    stage: 'transformation',
    responseShape: 'transformation-fill',
    leased: true,
    durationMs: 165_012,
    promptTokenCount: 3912,
    candidatesTokenCount: 2100,
    thoughtsTokenCount: 18_400,
    totalTokenCount: 24_412,
    failed: false,
  });
  expect(JSON.stringify(fields)).not.toContain('secret');
});

test('missing or odd counts are null, never invented', () => {
  const fields = modelUsageLog({ usage: undefined, model: 'm', leased: false, durationMs: -5 });
  expect(fields).toMatchObject({ stage: null, responseShape: null, leased: false, durationMs: 0, promptTokenCount: null, candidatesTokenCount: null, thoughtsTokenCount: null, totalTokenCount: null });
  expect(modelUsageLog({ usage: { promptTokenCount: '12', thoughtsTokenCount: Number.NaN }, model: 'm', leased: false, durationMs: 1 })).toMatchObject({ promptTokenCount: null, thoughtsTokenCount: null });
});

test('the route logs it after every provider call, from usageMetadata, with neither the prompt nor the answer', () => {
  const call = src.slice(src.indexOf('const result = await ai!.models.generateContent({'), src.indexOf('}, undefined, undefined, callSignal);'));
  const at = call.indexOf("logger.info('gemini usage', modelUsageLog({");
  expect(at).toBeGreaterThan(-1);
  const args = call.slice(at, call.indexOf('}));', at));
  expect(args).toContain('usage: result.usageMetadata,');
  expect(args).toContain('stage: stage ?? null,');
  expect(args).toContain('responseShape: shape ?? null,');
  expect(args).toContain('leased: lease !== null,');
  expect(args).toContain('durationMs: Date.now() - attemptAt,');
  expect(args).not.toMatch(/\bprompt\b|\btext\b|contents/);
  expect(src).toMatch(/const attemptAt = Date\.now\(\);\s*const result = await ai!\.models\.generateContent\(\{/);
});

test('a provider call that throws is logged too, as failed, with its duration and no counts (QA review of 6500c65c81c7)', () => {
  expect(modelUsageLog({ usage: undefined, model: 'm', leased: true, durationMs: 270_000, failed: true })).toMatchObject({ failed: true, durationMs: 270_000, totalTokenCount: null });
  const call = src.slice(src.indexOf('const result = await ai!.models.generateContent({'), src.indexOf('}, undefined, undefined, callSignal);'));
  const caught = call.slice(call.indexOf('.catch((providerErr: unknown) => {'));
  expect(caught.indexOf("logger.warn('gemini usage', modelUsageLog({")).toBeGreaterThan(-1);
  expect(caught).toContain('failed: true,');
  expect(caught.indexOf('throw providerErr;')).toBeGreaterThan(caught.indexOf('failed: true,'));
  expect(caught.slice(0, caught.indexOf('throw providerErr;'))).not.toMatch(/prompt|text|contents/);
});

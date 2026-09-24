import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { isTransientModelError } from '../lib/model-retry';

// Gemini answered 503 "high demand … usually temporary" for over an hour on
// 24.09.2026; the route asked again only on 429, so every run in that window
// failed on the first refusal.
test.describe('a model error that clears on its own is asked again', () => {
  test('quota and overload are transient', () => {
    expect(isTransientModelError('[429 Too Many Requests] quota')).toBe(true);
    expect(isTransientModelError('RESOURCE_EXHAUSTED')).toBe(true);
    expect(
      isTransientModelError('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'),
    ).toBe(true);
  });

  test('a request that will fail again is not repeated', () => {
    expect(isTransientModelError('{"error":{"code":400,"status":"INVALID_ARGUMENT"}}')).toBe(false);
    expect(isTransientModelError('API key not valid. Please pass a valid API key.')).toBe(false);
    expect(isTransientModelError('[SAFETY] blocked')).toBe(false);
  });

  test('the Gemini route decides by it', () => {
    const route = readFileSync('app/api/gemini/route.ts', 'utf8');
    expect(route).toContain("import { isTransientModelError } from '@/lib/model-retry';");
    expect(route).toMatch(/if \(retries > 0 && isTransientModelError\(message\)\)/);
  });
});

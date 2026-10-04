import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Security audit of v3.0.3 (b6716f0) — the route findings fixed at the line.
 * Source guards in the shape of tests/api-routes-qa220.spec.ts and
 * tests/catalog-route-budget.spec.ts; the suspended administrator
 * (SEC-b6716f0-03) is asked of the rules in tests/suspended-admin-rules.spec.ts.
 */
const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('SEC-b6716f0-15 · runs/create takes the narrative as text or not at all', () => {
  const src = code('app/api/runs/create/route.ts');
  // `analysis || ''` kept a number or a boolean, which then reached `.trim()`
  // after the evidence was built and the unit reserved.
  expect(src).not.toMatch(/finalAnalysisText\s*=\s*analysis\s*\|\|/);
  expect(src).toMatch(/let finalAnalysisText: string = typeof analysis === 'string' \? analysis : '';/);
});

for (const rel of [
  'app/api/projects/[projectId]/cost-assumptions/route.ts', // SEC-b6716f0-33
  'app/api/test-s4-odata-read/route.ts', // SEC-b6716f0-19
]) {
  test(`${rel} reads its request through the bounded reader only`, () => {
    const src = code(rel);
    expect(src).toMatch(/readBoundedBody\(req, [A-Z_]+\)/);
    expect(src, `${rel} still buffers the whole request`).not.toMatch(/\b(req|request)\.(json|text)\(\)/);
  });
}

test('SEC-b6716f0-46 · the invitation mail budget is per account, not per account and address', () => {
  const src = code('app/api/projects/[projectId]/invitations/route.ts');
  const calls = [...src.matchAll(/assertRateLimit\(\s*`([^`]+)`/g)].map((m) => m[1]);
  expect(calls.length).toBeGreaterThan(0);
  for (const key of calls) {
    expect(key).toContain('${decodedToken.uid}');
    expect(key, 'the key holds something the caller can change').not.toContain('getClientIp');
  }
});

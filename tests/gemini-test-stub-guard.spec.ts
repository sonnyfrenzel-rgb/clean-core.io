import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { GEMINI_TEST_STUB_HEADER, geminiTestStubActive } from '../lib/gemini-test-stub';

/**
 * The provider stub of `/api/gemini` can never be switched on in a deployment
 * — QA review of 75b573cd22f0 (080cd5fce607).
 *
 * The stub exists so that a route test can prove what the proxy signs without
 * a provider key. Its price would be a way to get a signed model receipt over
 * a text no model wrote, so the gates are held here, one at a time, and so is
 * the place in the route where the stub is asked: after every gate, and in
 * place of the provider call only.
 */

const TEST_ENV = {
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true',
  PILOT_APPROVAL_SECRET: 'test-approval-secret',
};

test('on only with all three gates: no Cloud Run, the emulator build, and the per-request secret', () => {
  expect(geminiTestStubActive(TEST_ENV, 'test-approval-secret')).toBe(true);

  // Gate 1 alone keeps it out of every deployment.
  expect(geminiTestStubActive({ ...TEST_ENV, K_SERVICE: 'clean-core' }, 'test-approval-secret')).toBe(false);
  expect(geminiTestStubActive({ ...TEST_ENV, K_SERVICE: 'clean-core-dev' }, 'test-approval-secret')).toBe(false);
  // Gate 2: only the emulator build, and only the exact value.
  expect(geminiTestStubActive({ ...TEST_ENV, NEXT_PUBLIC_USE_FIREBASE_EMULATOR: undefined }, 'test-approval-secret')).toBe(false);
  expect(geminiTestStubActive({ ...TEST_ENV, NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'TRUE' }, 'test-approval-secret')).toBe(false);
  // Gate 3: the secret, per request — and an unset secret matches nothing.
  expect(geminiTestStubActive(TEST_ENV, null)).toBe(false);
  expect(geminiTestStubActive(TEST_ENV, '')).toBe(false);
  expect(geminiTestStubActive(TEST_ENV, 'guess')).toBe(false);
  expect(geminiTestStubActive({ ...TEST_ENV, PILOT_APPROVAL_SECRET: '' }, '')).toBe(false);
  expect(geminiTestStubActive({ ...TEST_ENV, PILOT_APPROVAL_SECRET: undefined }, 'undefined')).toBe(false);
});

test('the route asks after every gate, and replaces the provider call and nothing else', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'gemini', 'route.ts'), 'utf8');
  const asked = route.indexOf('geminiTestStubActive(process.env, request.headers.get(GEMINI_TEST_STUB_HEADER))');
  expect(asked, 'the route no longer asks the stub the way this guard knows').toBeGreaterThan(-1);
  for (const gate of [
    'verifyRequestAuth(request)',
    'assertRateLimit(',
    'assertMfaSatisfied(',
    'assertAccountActive(',
    'modelStageEnabled(',
    'ALLOWED_MODELS.has(model)',
    'prompt.length > MAX_PROMPT_LENGTH',
  ]) {
    const at = route.indexOf(gate);
    expect(at, `${gate} is missing from the route`).toBeGreaterThan(-1);
    expect(at, `${gate} runs after the stub is asked`).toBeLessThan(asked);
  }
  // The receipt is minted after the stub, the same way for both answers.
  expect(route.indexOf('issueModelReceipt(', asked)).toBeGreaterThan(asked);
  // One header name, from the module — not a second spelling in the route.
  expect(route).not.toContain(`'${GEMINI_TEST_STUB_HEADER}'`);
  // And the module stays free of imports, so nothing it reads is hidden elsewhere.
  const stub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'gemini-test-stub.ts'), 'utf8');
  expect(stub).not.toMatch(/^import /m);
});

test('the deploy job refuses the emulator flag, and never sets it', () => {
  const deploy = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
  const deployJob = deploy.slice(deploy.search(/^\s{2}deploy:/m));
  expect(deployJob.length, 'no deploy job found in deploy.yml').toBeGreaterThan(20);
  // The job stops the build with the flag on — gate 2 of the stub rests on that line.
  expect(deployJob).toContain("FATAL: NEXT_PUBLIC_USE_FIREBASE_EMULATOR must not be 'true' in deploy!");
  // …and no line of the job sets it.
  expect(deployJob).not.toMatch(/^\s*NEXT_PUBLIC_USE_FIREBASE_EMULATOR:\s*'?true'?\s*$/m);
});

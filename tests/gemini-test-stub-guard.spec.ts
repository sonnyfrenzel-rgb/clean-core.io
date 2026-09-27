import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
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
  // QA review of d126dcc4bd7e (8742b4804028): reading the text proved only that the
  // message is written somewhere in the job. Parse the workflow, find the step that
  // carries the check, and run that step's script — with the flag it must fail,
  // without it it must pass. A commented-out check, a step switched off with `if:`
  // or softened with `continue-on-error` no longer passes.
  // No YAML parser is a declared dependency, so the job is cut into its steps by
  // indentation — the one shape GitHub Actions gives a step list.
  const jobStart = deploy.search(/^ {2}deploy:\s*$/m);
  expect(jobStart, 'no deploy job in deploy.yml').toBeGreaterThan(-1);
  const rest = deploy.slice(jobStart).split(/\r?\n/);
  const jobLines = [rest[0], ...rest.slice(1).filter((_, i, all) => !all.slice(0, i + 1).some((l) => /^ {2}\S/.test(l)))];
  const steps: string[][] = [];
  for (const line of jobLines) {
    if (/^ {6}- /.test(line)) steps.push([line]);
    else if (steps.length && (/^ {7,}\S/.test(line) || line.trim() === '')) steps[steps.length - 1].push(line);
  }
  const runOf = (lines: string[]) => {
    const at = lines.findIndex((l) => /^\s*run:\s*\|\s*$/.test(l));
    if (at < 0) return null;
    const indent = (lines[at + 1] ?? '').match(/^ */)?.[0].length ?? 0;
    const body: string[] = [];
    for (const l of lines.slice(at + 1)) {
      if (l.trim() !== '' && (l.match(/^ */)?.[0].length ?? 0) < indent) break;
      body.push(l.slice(indent));
    }
    return body.join('\n');
  };
  const step = steps.find((lines) => (runOf(lines) ?? '').includes('NEXT_PUBLIC_USE_FIREBASE_EMULATOR'));
  expect(step, 'no step of the deploy job checks the emulator flag').toBeTruthy();
  expect(step!.some((l) => /^\s*(- )?if:/.test(l)), 'the check must not be conditional').toBe(false);
  expect(step!.some((l) => /^\s*continue-on-error:\s*true/.test(l)), 'the check must stop the job').toBe(false);
  const script = runOf(step!) as string;

  const run = (flag: string | undefined) => {
    const env = {
      PATH: process.env.PATH ?? '',
      ...(flag !== undefined ? { NEXT_PUBLIC_USE_FIREBASE_EMULATOR: flag } : {}),
    } as unknown as NodeJS.ProcessEnv;
    return spawnSync('bash', ['-c', script], { env, encoding: 'utf8' }).status;
  };
  expect(run('true'), 'with the flag on, the step must fail').not.toBe(0);
  expect(run(undefined), 'without the flag, the step must pass').toBe(0);
  expect(run('false')).toBe(0);

  // …and no line of the job sets it.
  expect(jobLines.join('\n')).not.toMatch(/^\s*NEXT_PUBLIC_USE_FIREBASE_EMULATOR:\s*['"]?true['"]?\s*$/m);
});

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  GEMINI_TEST_REAL_MODEL_HEADER,
  GEMINI_TEST_STUB_DEFAULT_ENV,
  GEMINI_TEST_STUB_HEADER,
  geminiTestStubActive,
} from '../lib/gemini-test-stub';

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

test('the test server stubs by default, behind the same two deployment gates, and only the secret leaves the stub', () => {
  // Roadmap "before 3.0.7 — Tests never spend the production model budget" (2).
  const DEFAULT_ENV = { ...TEST_ENV, [GEMINI_TEST_STUB_DEFAULT_ENV]: 'true' };
  expect(GEMINI_TEST_STUB_DEFAULT_ENV).toBe('GEMINI_TEST_STUB_DEFAULT');
  // On by default: no header at all is the stub…
  expect(geminiTestStubActive(DEFAULT_ENV, null)).toBe(true);
  expect(geminiTestStubActive(DEFAULT_ENV, null, null)).toBe(true);
  // …a wrong secret, under either header, stays on it…
  expect(geminiTestStubActive(DEFAULT_ENV, 'guess', 'guess')).toBe(true);
  expect(geminiTestStubActive(DEFAULT_ENV, null, '')).toBe(true);
  // …only the secret under the real-model header leaves it, and the stub asked by name wins over that.
  expect(geminiTestStubActive(DEFAULT_ENV, null, 'test-approval-secret')).toBe(false);
  expect(geminiTestStubActive(DEFAULT_ENV, 'test-approval-secret', 'test-approval-secret')).toBe(true);
  // Only the exact value switches the default on.
  for (const value of ['TRUE', '1', 'yes', '', undefined]) {
    expect(geminiTestStubActive({ ...TEST_ENV, [GEMINI_TEST_STUB_DEFAULT_ENV]: value }, null)).toBe(false);
  }
  // The default never replaces a deployment gate: Cloud Run, a non-emulator build,
  // or no secret at all switch the stub off whatever the variable says.
  expect(geminiTestStubActive({ ...DEFAULT_ENV, K_SERVICE: 'clean-core' }, null)).toBe(false);
  expect(geminiTestStubActive({ ...DEFAULT_ENV, K_SERVICE: 'clean-core' }, 'test-approval-secret')).toBe(false);
  expect(geminiTestStubActive({ ...DEFAULT_ENV, NEXT_PUBLIC_USE_FIREBASE_EMULATOR: undefined }, null)).toBe(false);
  expect(geminiTestStubActive({ ...DEFAULT_ENV, PILOT_APPROVAL_SECRET: undefined }, null)).toBe(false);
  expect(geminiTestStubActive({ ...DEFAULT_ENV, PILOT_APPROVAL_SECRET: '' }, null, '')).toBe(false);

  // The test server is the one place that sets it, and to exactly 'true'.
  const config = fs.readFileSync(path.join(__dirname, '..', 'playwright.config.ts'), 'utf8');
  expect(config).toMatch(/^\s+GEMINI_TEST_STUB_DEFAULT: 'true',\s*$/m);
  for (const rel of ['app', 'lib', 'middleware.ts', 'next.config.mjs', 'Dockerfile', '.github/workflows']) {
    const at = path.join(__dirname, '..', rel);
    if (!fs.existsSync(at)) continue;
    const files = fs.statSync(at).isDirectory() ? (fs.readdirSync(at, { recursive: true }) as string[]).map((f) => path.join(at, f)) : [at];
    for (const file of files) {
      if (!fs.statSync(file).isFile() || file.endsWith(`gemini-test-stub.ts`)) continue;
      expect(fs.readFileSync(file, 'utf8'), `${path.relative(path.join(__dirname, '..'), file)} names the stub default`).not.toContain(
        GEMINI_TEST_STUB_DEFAULT_ENV,
      );
    }
  }
});

test('the route asks after every gate, and replaces the provider call and nothing else', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'gemini', 'route.ts'), 'utf8');
  const asked = route.search(
    /geminiTestStubActive\(\s*process\.env,\s*request\.headers\.get\(GEMINI_TEST_STUB_HEADER\),\s*request\.headers\.get\(GEMINI_TEST_REAL_MODEL_HEADER\),?\s*\)/,
  );
  expect(asked, 'the route no longer asks the stub the way this guard knows').toBeGreaterThan(-1);
  expect(route.match(/geminiTestStubActive\(/g)?.length, 'the stub is asked in one place only').toBe(1);
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
  expect(route).not.toContain(`'${GEMINI_TEST_REAL_MODEL_HEADER}'`);
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
  // Any `continue-on-error`, whatever its value: `${{ true }}` is as fatal as `true`
  // (QA review of 29be9543e26a, 4362a7dbc9fd). The same for the job itself.
  expect(step!.some((l) => /^\s*(- )?continue-on-error\s*:/.test(l)), 'the check must stop the job').toBe(false);
  const jobHeader = jobLines.slice(0, jobLines.findIndex((l) => /^ {4}steps:/.test(l)));
  expect(jobHeader.some((l) => /^ {4}continue-on-error\s*:/.test(l)), 'the deploy job must not continue on error').toBe(false);
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

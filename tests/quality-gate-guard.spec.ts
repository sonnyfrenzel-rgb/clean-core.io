import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The deploy cannot pass on a tree that does not type-check (roadmap
 * E16-F01-US02: "typecheck, tests and required approvals are mandatory checks").
 *
 * `next build` type-checks the application and stops there. Nothing ran tsc over
 * the tests, and two type errors in tests/run-integrity-guard.spec.ts sat unseen
 * from 27 August until 11 September. The pipeline now runs `npm run typecheck`
 * — the whole tsconfig, tests included — as a step of the job the deploy needs.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test('package.json has a typecheck over the whole project', () => {
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.scripts.typecheck).toBe('tsc --noEmit -p .');
});

test('the validate job runs it, after the build and before the tests', () => {
  const wf = read('.github/workflows/deploy.yml');
  const validate = wf.slice(wf.indexOf('  validate:'), wf.indexOf('  security:'));
  const build = validate.indexOf('run: npm run build');
  const typecheck = validate.indexOf('run: npm run typecheck');
  const e2e = validate.indexOf('npx playwright test --shard=');
  expect(typecheck, 'no typecheck step in the validate job').toBeGreaterThan(-1);
  // A missing build is -1, which is "before" everything (QA full review of
  // fc787674705f, 4a2e26a0fa4a) — and so is a missing test run.
  expect(build, 'no build step in the validate job').toBeGreaterThan(-1);
  expect(e2e, 'no Playwright step in the validate job').toBeGreaterThan(-1);
  expect(build).toBeLessThan(typecheck);
  expect(typecheck).toBeLessThan(e2e);
  // And the deploy still waits for validate.
  expect(wf).toMatch(/needs:\s*\[validate,\s*security\]/);
});

test('the tsconfig still covers the tests', () => {
  const tsconfig = read('tsconfig.json');
  expect(tsconfig).toContain('"**/*.ts"');
  expect(tsconfig).not.toMatch(/"exclude":\s*\[[^\]]*"tests"/);
});

test('the deploy gate and Security CI block on the same severity', () => {
  expect(read('.github/workflows/deploy.yml')).toContain('npm audit --omit=dev --audit-level=high');
  const auditCi = read('audit-ci.jsonc');
  expect(auditCi).toMatch(/"high":\s*true/);
});

test('the E2E step runs every shard of the suite, each on fresh emulators, and fails when any shard fails', () => {
  // 04.10.2026: one emulator for the whole suite collapsed after an hour (abandoned
  // Firestore channels). Sharding must not drop a test or hide a red shard.
  const wf = read('.github/workflows/deploy.yml');
  const validate = wf.slice(wf.indexOf('  validate:'), wf.indexOf('  security:'));
  const step = validate.slice(validate.indexOf('- name: Run End-to-End Tests'), validate.indexOf('env:', validate.indexOf('- name: Run End-to-End Tests')));
  const shards = step.match(/for shard in ([\d ]+); do/);
  expect(shards, 'no shard loop').not.toBeNull();
  const list = shards![1].trim().split(/\s+/).map(Number);
  expect(step).toContain(`npx playwright test --shard="$shard/${list.length}"`);
  expect(list).toEqual(Array.from({ length: list.length }, (_, i) => i + 1));
  expect(step).toContain('|| status=1');
  expect(step).toMatch(/exit "\$status"\s*$/);
  expect(step).toContain('emulators:start --only auth,firestore --project=cleancore-491216');
  expect(step, 'a skipped or filtered shard').not.toMatch(/--grep|--last-failed|--only-changed|test\.skip/);
});

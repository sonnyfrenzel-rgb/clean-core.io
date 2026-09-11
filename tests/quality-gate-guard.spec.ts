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
  const e2e = validate.indexOf('run: npx playwright test');
  expect(typecheck, 'no typecheck step in the validate job').toBeGreaterThan(-1);
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

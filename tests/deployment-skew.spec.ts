import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * A tab opened before a deploy must not run two builds at once (owner,
 * 02./03.10.2026: "(0 , j.getAuth) is not a function" when starting an example,
 * then "Cannot read properties of undefined (reading 'call')" on /dashboard,
 * both on dev right after a deploy, neither reproducible on a fresh load).
 *
 * Two layers hold it: Next's skew protection, which needs a deployment id that
 * changes with every deploy, and the error boundary, which reloads once when
 * the mix shows up anyway.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test('the build carries a deployment id from the environment', () => {
  expect(read('next.config.mjs')).toMatch(/deploymentId:\s*process\.env\.NEXT_DEPLOYMENT_ID\s*\|\|\s*undefined/);
});

test('the deploy sets the deployment id at build time, to the commit', () => {
  const buildVars = read('.github/workflows/deploy.yml')
    .split('\n')
    .find((line) => line.includes('--set-build-env-vars='));
  expect(buildVars, 'no build variables in the deploy step').toBeTruthy();
  expect(buildVars).toContain('NEXT_DEPLOYMENT_ID=${{ github.sha }}');
});

test('the error boundary reloads once on the two mixed-build errors, and on nothing else new', async () => {
  const src = read('app/error.tsx');
  const m = src.match(/\/reading 'call'\\\)\|\^\\\(0\\s\*,\\s\*\[\\w\$\]\+\\\.\[\\w\$\]\+\\\) is not a function\//);
  expect(m, 'the mixed-build pattern is gone from app/error.tsx').toBeTruthy();
  const pattern = /reading 'call'\)|^\(0\s*,\s*[\w$]+\.[\w$]+\) is not a function/;
  expect(pattern.test("Cannot read properties of undefined (reading 'call')")).toBe(true);
  expect(pattern.test('(0 , j.getAuth) is not a function')).toBe(true);
  expect(pattern.test('(0 , $.xI) is not a function')).toBe(true);
  // An ordinary bug is not reloaded away.
  expect(pattern.test("Cannot read properties of undefined (reading 'name')")).toBe(false);
  expect(pattern.test('foo is not a function')).toBe(false);
  // The loop guard is still there.
  expect(src).toContain("const KEY = 'cc_chunk_reload_at';");
  expect(src).toMatch(/Date\.now\(\) - last > 10000/);
});

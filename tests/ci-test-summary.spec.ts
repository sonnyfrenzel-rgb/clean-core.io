import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Release 3.0.21, test-quality measure 1: every CI shard lists its skipped
 * tests with their reason and its tests that passed only on a retry in the job
 * summary (scripts/test/ci-test-summary.mjs, wired in .github/workflows/deploy.yml;
 * the step itself is held by tests/quality-gate-guard.spec.ts).
 *
 * Server-free: the script runs on a fixture JSON report shaped like Playwright's.
 */
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/test/ci-test-summary.mjs');
const FIXTURE = path.join(ROOT, 'tests/fixtures/ci-test-summary/report.json');

function runScript(args: string[]): { summary: string; stdout: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ci-summary-'));
  const target = path.join(dir, 'summary.md');
  fs.writeFileSync(target, '# earlier step\n');
  const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, GITHUB_STEP_SUMMARY: target },
    encoding: 'utf8',
  });
  const summary = fs.readFileSync(target, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { summary, stdout };
}

test('a shard summary lists every skipped test with its reason and every test that passed only on retry', () => {
  const { summary, stdout } = runScript([FIXTURE, '--shard', '3']);
  // Appended to the job summary, not printed, and not overwriting what an earlier step wrote.
  expect(stdout).toBe('');
  expect(summary.startsWith('# earlier step\n')).toBe(true);
  expect(summary).toContain('### E2E shard 3: 2 skipped, 1 passed only on retry');

  expect(summary).toContain('**Skipped (2)**');
  // The reason a runtime test.skip(cond, reason) gave, from the result's annotations.
  expect(summary).toContain('| `owner-sources.spec.ts:12` the reference programs parse | skip: CC_OWNER_SOURCES is not set |');
  // A test.fixme without a description still says what kind of skip it is, with its describe path.
  expect(summary).toContain('| `workspace.spec.ts:44` the tool bar › the old drawer | fixme |');

  expect(summary).toContain('**Passed only on retry (1)**');
  // A pipe in a title is escaped so the table holds; colour codes and line breaks are gone from the error.
  expect(summary).toContain("| `workspace.spec.ts:20` the tool bar › opens \\| closes the panel | 2 | Timeout 30000ms exceeded. waiting for getByRole('button') |");
  expect(summary).not.toContain('\u001b');

  // A test that simply passed is not listed.
  expect(summary).not.toContain('renders');
});

test('a clean report says so, and the script never fails the job', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ci-summary-clean-'));
  const clean = path.join(dir, 'clean.json');
  fs.writeFileSync(
    clean,
    JSON.stringify({
      suites: [{ title: 'a.spec.ts', file: 'a.spec.ts', specs: [{ title: 'ok', file: 'a.spec.ts', line: 3, tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] }],
    }),
  );
  expect(runScript([clean, '--shard', '1']).summary).toContain('### E2E shard 1: 0 skipped, 0 passed only on retry\n\nEvery test ran, and none needed a retry to pass.');

  // No report (the shard died before Playwright wrote one) and a broken report: exit 0, and the summary says why.
  const missing = runScript([path.join(dir, 'nope.json'), '--shard', '2']).summary;
  expect(missing).toContain('### E2E shard 2: no test report');
  expect(missing).toContain('ENOENT');
  const broken = path.join(dir, 'broken.json');
  fs.writeFileSync(broken, '{"suites": [');
  expect(runScript([broken, '--shard', '4']).summary).toContain('### E2E shard 4: no test report');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('in CI Playwright writes the JSON report the summary step reads', () => {
  const config = fs.readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
  expect(config).toContain("reporter: process.env.CI ? [['line'], ['json', { outputFile: 'playwright-report/e2e-results.json' }]] : 'line',");
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  expect(workflow).toContain('run: node scripts/test/ci-test-summary.mjs playwright-report/e2e-results.json --shard "$SHARD"');
});

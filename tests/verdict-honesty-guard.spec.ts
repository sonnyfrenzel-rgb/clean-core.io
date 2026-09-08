import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Nothing may report a verification that did not happen.
 *
 * An independent review of the v2.8.5 snapshot found three ways the product said
 * a test had been verified when nothing had run:
 *
 *   1. A TAP line carrying `# SKIP` or `# TODO` starts with `ok`. That is the
 *      protocol's way of writing "not executed", and a parser that decides on the
 *      first token read it as a pass.
 *   2. A test case the runner never mentioned inherited `exitCode === 0` and was
 *      labelled "Verified by Node.js Test Runner".
 *   3. The ABAP mock set every selected case to `Passed` and put `[SIMULATED]` in
 *      the message — which the delivery page did not read.
 *
 * All three ended on the delivery page, beside a green tick, in the artefact that
 * goes to a customer. These checks are cheap; rediscovering the problem is not.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test.describe('a verdict is only reported when there is one', () => {
  test('the TAP parser reads SKIP and TODO directives', () => {
    const src = read('app/api/run-tests/route.ts');
    expect(
      src,
      'the TAP parser no longer looks for a directive. `ok 1 - t # SKIP` is a ' +
        'test that did not run, and without this it is recorded as a pass.',
    ).toMatch(/skip\|todo/i);
    expect(src).toContain("'Not run'");
  });

  test('an unreported test does not inherit the exit code', () => {
    const src = read('hooks/useTestExecution.ts');
    expect(
      src,
      'the exit-code fallback is back: a test the runner never mentioned is being ' +
        'given the verdict of the whole run.',
    ).not.toMatch(/const passed = result\.exitCode === 0/);
  });

  test('a simulated run is not a pass', () => {
    const src = read('hooks/useTestExecution.ts');
    expect(
      src,
      'the ABAP mock marks its results Passed again. The message saying ' +
        '[SIMULATED] is not enough — every count and the delivery page read the ' +
        'status, not the message.',
    ).toContain("status: 'Simulated' as const");
  });

  test('the delivery page counts verdicts, not generated files', () => {
    const src = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(
      src,
      'the delivery summary is driven by testCaseCount again — that is the number ' +
        'of tests generated, which says nothing about whether any of them ran.',
    ).toContain('testsPassed');
    expect(src).not.toMatch(/\{testCaseCount > 0 \? \(\s*<CheckCircle2/);
  });

  test('the pass rate excludes tests that produced no verdict', () => {
    const src = read('app/(app)/project/[projectId]/testing/page.tsx');
    expect(
      src,
      'the pass rate is over every test again. Twenty skipped tests and four ' +
        'passes is not 17%, it is 100% of the four that ran — and the page has to ' +
        'say which it means.',
    ).toContain('const verdicts = passed + failed');
  });
});

test.describe('a figure that does not exist is not printed as one', () => {
  test('the TCO divisions are guarded', () => {
    const src = read('app/(app)/project/[projectId]/tco/page.tsx');
    // Both divisors are reachable from the controls on the page: an investment of
    // zero, and code that already scores at the target.
    expect(src).toMatch(/annualSavings > 0\s*\?/);
    expect(src).toMatch(/oneTimeCost > 0\s*\?/);
  });
});

test.describe('the promises in the repository are backed by files', () => {
  test('there is a licence, and it is the one package.json declares', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(
      fs.existsSync(path.join(ROOT, 'LICENSE')),
      'LICENSE is gone. Code without one is all rights reserved, whatever the ' +
        'README and the roadmap say about self-hosting.',
    ).toBe(true);
    expect(read('LICENSE')).toContain('Apache License');
    expect(pkg.license).toBe('Apache-2.0');
  });

  test('the README does not contradict the licence', () => {
    expect(
      read('README.md'),
      'the README calls the platform proprietary while LICENSE grants Apache-2.0.',
    ).not.toMatch(/is \*not\* open source/);
  });

  test('the deploy gate is no looser than the security gate', () => {
    const deploy = read('.github/workflows/deploy.yml');
    expect(
      deploy,
      'the deploy audit is back to --audit-level=critical while Security CI ' +
        'blocks at high. The looser of two gates is the only one that counts.',
    ).toContain('--audit-level=high');
  });
});

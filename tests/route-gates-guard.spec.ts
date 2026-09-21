/**
 * Two gates that were missing where their siblings have them.
 *
 * Both come from the security audit of b88c77b, and both survived verification
 * at the line on 21.09.2026 — which is worth saying, because that audit never
 * checked a single finding against the code and most of its ninety low findings
 * did not survive.
 *
 *   - SEC-b88c77b-13: of the four process routes, only `process-map` never
 *     called `assertAccountActive` on its mutating branch. A suspended account,
 *     or one that has not accepted the current terms, kept its write access to
 *     the process map while naming, revisions and states refused it. The
 *     measurement that found it is the one below: count the call in all four.
 *   - SEC-b88c77b-18: the test-run receipt writes `environment: 'mock'` as a
 *     constant. Today nothing else can reach it — a live run is refused at the
 *     lock — but the lock is a decision someone will reverse, and a receipt
 *     that then says "mock" about a run against a real tenant is a signed
 *     sentence that is false. The assumption is now checked where it is used.
 *
 * Source-level, on purpose: the account gate needs a suspended account and a
 * live run needs a lock that is not there, and a guard that cannot be run is
 * worth less than one that pins the shape.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROUTES = ['process-map', 'process-naming', 'process-revisions', 'process-states'] as const;
const routeSource = (name: string) =>
  fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'projects', '[projectId]', name, 'route.ts'), 'utf8');

test('all four process routes gate a write on the account being active', () => {
  for (const name of ROUTES) {
    const src = routeSource(name);
    expect(src, `${name} does not import assertAccountActive`).toContain('assertAccountActive');
    // Inside the mutating branch, not merely somewhere in the file: the whole
    // defect was a route that had the import nowhere and the call nowhere.
    const mutating = src.indexOf('if (mutating)');
    expect(mutating, `${name} has no mutating branch to gate`).toBeGreaterThan(-1);
    const branch = src.slice(mutating, mutating + 1800);
    expect(branch, `${name} does not check the account on its mutating branch`).toContain('assertAccountActive(');
    expect(branch, `${name} does not ask for current terms`).toContain('requireCurrentTerms: true');
  }
});

test('reading is not gated on it, because a reader may be invited rather than active', () => {
  // The gate belongs to writing. Putting it on the read path would refuse an
  // invited reader whose own account is in a different state, which is not what
  // the finding asked for and would undo CR-13.
  for (const name of ROUTES) {
    const src = routeSource(name);
    const mutating = src.indexOf('if (mutating)');
    const before = src.slice(0, mutating);
    expect(before, `${name} checks the account before it knows whether this is a write`).not.toContain('assertAccountActive(');
  }
});

test('the run-tests receipt refuses to describe a run it does not describe', () => {
  const lines = fs
    .readFileSync(path.join(__dirname, '..', 'app', 'api', 'run-tests', 'route.ts'), 'utf8')
    .split(/\r?\n/);
  // Line by line, and only lines that are code. The paragraph explaining the
  // constant quotes it, so a search over the whole text finds the explanation
  // instead of the thing explained — the third time that trap bit on
  // 21.09.2026, after the gitleaks allowlist and the credential guard. Blanking
  // block comments with a regex was the obvious fix and the wrong one: this
  // file contains `*/` inside string literals, so the blanking swallowed code.
  const isCode = (l: string) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  };
  const codeLine = (needle: string, from = 0) =>
    lines.findIndex((l, i) => i >= from && isCode(l) && l.includes(needle));

  const constant = codeLine("environment: 'mock',");
  expect(constant, 'the receipt no longer names an environment').toBeGreaterThan(-1);
  // The check has to stand *before* the constant, or it is not a precondition,
  // and after the verdicts are applied, or it guards the wrong stretch.
  const receiptSite = codeLine('applyRunnerVerdicts(storedCases');
  expect(receiptSite, 'the receipt is no longer built here').toBeGreaterThan(-1);
  const guard = codeLine("if (s4Environment === 'live') {", receiptSite);
  expect(guard, 'nothing checks the environment before the receipt claims one').toBeGreaterThan(-1);
  expect(guard, 'the environment is claimed before it is checked').toBeLessThan(constant);
  // And it refuses rather than correcting itself quietly.
  expect(lines.slice(guard, constant).join('\n')).toContain('No receipt was written');
});

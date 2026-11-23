import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { isStaleBuildError } from '../lib/stale-build';

/**
 * QA full review of fc787674705f (v2.20.0), stage 5 — the testing page.
 *
 * Source-level guards for the findings fixed in the page itself. They read the
 * file rather than render it: every one of these paths needs a signed-in
 * project, a tenant or a model key to reach in a browser, and what they pin is
 * an ordering or a condition in the code, which the source shows exactly.
 */

const SEGMENT = path.resolve(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'testing');
// Line endings normalised: a Windows checkout (core.autocrlf) has CRLF, CI has LF.
const page = () => fs.readFileSync(path.join(SEGMENT, 'page.tsx'), 'utf8').replace(/\r\n/g, '\n');
/** The rendered half only — comments above the handlers name the wording they replaced. */
const rendered = () => {
  const s = page();
  // The stage's main return — the one stage frame every stage renders in
  // (ADR-063), on the app main's own width and padding (mockup s8 rebuild).
  const start = s.indexOf('  return (\n    <StageFrame stage="testing" className="min-h-screen">');
  expect(start, 'the main return of the testing page was not found').toBeGreaterThan(-1);
  return s.slice(start);
};
/** The body of `const <name> = async (...) => { ... };` at component level. */
const handler = (name: string) => {
  const s = page();
  const start = s.indexOf(`const ${name} = async`);
  expect(start, `handler ${name} not found`).toBeGreaterThan(-1);
  return s.slice(start, s.indexOf('\n  };\n', start));
};

test.describe('testing page — QA full review of fc787674705f', () => {
  test('a stale suite cannot be run (a4439fbfd760)', () => {
    const run = handler('handleRun');
    const guard = run.indexOf('if (testRunBlocked(project)) return;');
    expect(guard, 'handleRun runs without checking staleness').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(run.indexOf('runTestCases('));
    // The predicate covers both halves: upstream blockers and a stale suite.
    const s = page();
    const pred = s.slice(s.indexOf('const testRunBlocked'), s.indexOf('const RAIL_GRID'));
    expect(pred.length, 'the predicate was not found where it stood').toBeGreaterThan(0);
    expect(pred.length).toBeLessThan(1200);
    expect(pred).toContain("generationBlockers(project, 'testing').length > 0");
    expect(pred).toContain("=== 'stale'");
    // And the button says so instead of accepting the click.
    expect(page()).toMatch(/const runDisabled = isRunning[^\n]*\|\| testRunBlocked\(project\);/);
    expect(rendered()).toContain('disabled={runDisabled}');
  });

  test('the tenant setup left Testing for Settings (ADR-131 (5); was 983d23ce4dad, b1458e593475, 229511ee85db, f0332e0eefbf)', () => {
    // The saved credential, the access request, the setup guide and the metadata read were findings on the tenant
    // form that stood inside Testing. That form is "Your SAP test system" in Settings now (ST-N3); Testing keeps one
    // line with the link, and writes, requests and reads nothing of the tenant itself.
    const s = page();
    for (const gone of ["'/api/s4-credentials'", "'/api/request-tenant-access'", "'/api/fetch-odata-metadata'", "'/api/test-s4-odata-read'", 'saveS4Config', 'handleRequestAccess', 'handleFetchServiceMetadata']) {
      expect(s, `Testing still holds ${gone}`).not.toContain(gone);
    }
    expect(rendered()).toContain('/settings#sap-test-system');
  });

  test('the ABAP path does not claim compilation or ADT execution (b372006ca6ad)', () => {
    const r = rendered();
    for (const claim of ['ABAP Unit Compiler', 'secure SAP ADT environment', 'execute aunit', 'View ADT Output']) {
      expect(r, `stage 5 renders "${claim}"`).not.toContain(claim);
    }
    expect(r).toContain('Nothing is compiled or executed in SAP ADT here');
  });

  test('regenerating respects the model stage (55b40120e11b)', () => {
    const gen = handler('handleGenerate');
    // Since the Testing rework (c79e041f) the guard also says why instead of
    // returning silently; it still stands before the request.
    const guard = gen.indexOf("if (!modelAvailability.enabled('testing')) {");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(gen.indexOf('generateTestCases()'));
    expect(gen.slice(guard, gen.indexOf('generateTestCases()'))).toMatch(/setGenError\([\s\S]*?\);\s*return;/);
    const r = rendered();
    const btn = r.slice(r.lastIndexOf('<CcButton', r.indexOf("'Write the scenarios again'")), r.indexOf("'Write the scenarios again'"));
    expect(btn).toContain("disabled={isGenerating || !modelAvailability.enabled('testing')");
    expect(r).toContain('data-regenerate-unavailable');
  });

  test("the model's coverage estimate is not on the page (ADR-131 S10; was c77988061654, 763f13273cb3)", () => {
    // The estimate was the largest figure on the side, beside a measured rule coverage hidden in step 2. The counted
    // rule coverage is the second facet of the answer now; the estimate stays on the project, unshown.
    expect(rendered()).not.toContain('coverageEstimate');
    expect(rendered()).not.toContain('Coverage estimate');
  });
});

test.describe('testing error boundary — stale chunk recovery (1ef3f93640d4)', () => {
  // Since 3.0.6 every boundary shares lib/stale-build.ts; the one that covers
  // this tool — the project's, since 3.0.21 (7) — must use it, and the shared
  // matcher must still know every message below.
  const matcher = () => {
    const src = fs.readFileSync(path.join(SEGMENT, '..', 'error.tsx'), 'utf8');
    expect(src, 'the boundary over the testing tool no longer uses the shared matcher').toContain("from '@/lib/stale-build'");
    return { test: (msg: string) => isStaleBuildError({ message: msg }) };
  };

  test("Chrome's native dynamic-import failure is recognised", () => {
    expect(matcher().test('Failed to fetch dynamically imported module: https://clean-core.io/_next/static/chunks/123.js')).toBe(true);
  });

  test('the messages it already recognised still are', () => {
    const re = matcher();
    for (const msg of [
      'Loading chunk 123 failed.',
      'ChunkLoadError: Loading chunk abc-def failed',
      'error loading dynamically imported module',
      'Importing a module script failed.',
    ]) {
      expect(re.test(msg), msg).toBe(true);
    }
    expect(re.test('Cannot read properties of undefined')).toBe(false);
  });
});

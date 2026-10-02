import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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
    expect(rendered()).toMatch(/disabled=\{isRunning[^\n]*\|\| testRunBlocked\(project\)\}/);
  });

  test('a saved credential is reported as saved — no optional write can fail it (983d23ce4dad)', () => {
    // The finding: an environment-preference write after the vault save failed
    // into the save's catch and reported a saved connection as a failed one.
    // Since 02.10.2026 that preference is gone with the tenant tab it
    // remembered, so the vault's answer is the last thing that can fail.
    const save = handler('saveS4Config');
    const vault = save.indexOf("fetch('/api/s4-credentials'");
    const cleared = save.indexOf("setS4Password('')");
    expect(vault).toBeGreaterThan(-1);
    expect(cleared).toBeGreaterThan(vault);
    const afterClear = save.slice(cleared, save.indexOf('} catch (err'));
    expect(afterClear, 'a write follows the vault save again').not.toMatch(/await |setDoc\(/);
    expect(save).not.toContain('s4Environment');
  });

  test('a failed tenant-access request is reported, and the log follows the request (b1458e593475)', () => {
    const req = handler('handleRequestAccess');
    expect(req).toMatch(/const res = await fetch\('\/api\/request-tenant-access'/);
    expect(req).toContain('if (!res.ok)');
    expect(req).toContain('setAccessRequestError(');
    expect(
      req.indexOf("fetch('/api/request-tenant-access'"),
      'the create-only request log is written before the request it logs',
    ).toBeLessThan(req.indexOf("doc(db, 'tenant_access_requests'"));
    expect(rendered()).toMatch(/\{accessRequestError && \(/);
    expect(rendered()).toContain('data-access-request-error');
  });

  test('the setup guide says save, then test (229511ee85db)', () => {
    const r = rendered();
    const save = r.indexOf('Save the Connection</p>');
    const tst = r.indexOf('Test the Connection</p>');
    expect(save).toBeGreaterThan(-1);
    expect(tst).toBeGreaterThan(-1);
    expect(save, 'the guide tells the reader to test before there is anything saved').toBeLessThan(tst);
  });

  test('the OData explorer names the saved tenant it queries (f0332e0eefbf)', () => {
    const cat = handler('handleFetchODataCatalog');
    expect(cat).toContain('useStoredCredentials: true');
    expect(cat, 'the log names the editable form URL').not.toContain('catalog from ${s4Url}');
    expect(cat).toContain('savedS4?.url');
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
    const guard = gen.indexOf("if (!modelAvailability.enabled('testing')) return;");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(gen.indexOf('generateTestCases()'));
    const r = rendered();
    const btn = r.slice(r.lastIndexOf('<CcButton', r.indexOf("'Regenerate Suite'")), r.indexOf("'Regenerate Suite'"));
    expect(btn).toContain("disabled={isGenerating || !modelAvailability.enabled('testing')}");
    expect(r).toContain('data-regenerate-unavailable');
  });

  test('a 0 % coverage estimate is shown, not N/A (c77988061654)', () => {
    const r = rendered();
    expect(r, 'truthiness turns 0 into N/A').not.toMatch(/coverageEstimate\?\.percentage \?/);
    expect(r).toContain("typeof project?.coverageEstimate?.percentage === 'number'");
  });

  test('a stale suite\'s coverage estimate says it was made for a previous source (763f13273cb3)', () => {
    const r = rendered();
    const card = r.slice(r.indexOf('<CcCard title="Coverage estimate"'), r.indexOf('How it was estimated'));
    expect(card).toContain("workflowSteps(project).find((p) => p.key === 'testing')?.state === 'stale'");
    expect(card).toContain('data-coverage-stale');
  });
});

test.describe('testing error boundary — stale chunk recovery (1ef3f93640d4)', () => {
  const matcher = () => {
    const src = fs.readFileSync(path.join(SEGMENT, 'error.tsx'), 'utf8');
    const m = src.match(/\/(Loading chunk [^\n]*?)\/i\.test\(msg\)/);
    expect(m, 'the chunk-error matcher was not found').not.toBeNull();
    return new RegExp(m![1], 'i');
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

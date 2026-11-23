import { test, expect, type Page } from './helpers/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminGetDoc, adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import fs from 'fs';
import path from 'path';
import { countVerdicts, countsLine, deliveryTestingTitle, lastRun, scenarios } from '../components/testing/testing-summary';
import { ABAP_UNIT_NOT_RUNNABLE } from '../lib/test-runnability';
import { receiptFor } from './helpers/test-receipt';

/**
 * The Testing tool as one guided flow (owner 02.10.2026, translated: "You get
 * lost in the menus here and don't know what to do … it is really a tool and
 * not a tab").
 *
 * It replaced two tabs with a segmented switch inside the first and cards
 * inside that, with the one thing to do — generate the scenarios — at the
 * bottom. What is held here:
 *
 *  - an empty project opens on step 1, its button the first action, above
 *    the fold, with no tiles and no counters of nothing;
 *  - with scenarios, step 2 is enabled and the tiles arrive;
 *  - Run is a real request to `/api/run-tests`, against mocks, and a refusal
 *    of it is said on the page — not a wall of "Not determined" (owner report
 *    02.10.2026: the ABAP Cloud route answered the click with a run made up in
 *    the browser, and nothing reached the server);
 *  - the ABAP Cloud route offers no run and says why before the click;
 *  - the tenant is a folded section, not a mode — opening it does not turn
 *    the run off, and a project an earlier build left on the tenant tab can
 *    still run.
 */

test.describe('where testing stands, from what is on record', () => {
  test('a verdict other than passed or failed is counted as without a result', () => {
    const c = countVerdicts(['Passed', 'Failed', 'Skipped', 'Not run', 'Passed', undefined]);
    expect(c).toEqual({ passed: 2, failed: 1, noResult: 3, total: 6 });
    expect(countsLine(c)).toBe('2 passed · 1 failed · 3 without a result');
    expect(countsLine(countVerdicts(['Passed']))).toBe('1 passed · 0 failed');
    expect(scenarios(1)).toBe('1 scenario');
    expect(scenarios(14)).toBe('14 scenarios');
  });

  test('no receipt and no session run is no run — a stored "Passed" is not one', () => {
    const project = { testCases: [{ id: 't1', status: 'Passed' }] };
    expect(lastRun(project, null)).toEqual({ kind: 'none' });
    expect(lastRun(project, [])).toEqual({ kind: 'none' });
  });

  test('a run of this session without a receipt is reported as not recorded', () => {
    const run = lastRun({}, [{ status: 'Passed' }, { status: 'Failed' }]);
    expect(run.kind).toBe('session');
    if (run.kind === 'session') expect(run.counts).toEqual({ passed: 1, failed: 1, noResult: 0, total: 2 });
  });
});

test.describe('Delivery and Testing read the same record', () => {
  // The seeded project: three cases, two of them stored as "Passed", no run.
  // Delivery said "2 of 3 Sandbox tests passed" while Testing said "3 scenarios
  // written, not run yet" — Delivery counted the client-writable status
  // strings, Testing the server's receipt. Both now read the receipt.
  const seeded = {
    activeRunId: 'run-1',
    generatedCode: 'export const ok = true;',
    testSuite: { code: 'test("t1", () => {});' },
    testCases: [
      { id: 't1', name: 'Credit limit within bounds', category: 'Unit', status: 'Passed' },
      { id: 't2', name: 'Credit limit exceeded', category: 'Unit', status: 'Passed' },
      { id: 't3', name: 'Missing customer master', category: 'Edge' },
    ],
  };

  test('stored "Passed" strings without a receipt: both say not run', () => {
    expect(lastRun(seeded, null)).toEqual({ kind: 'none' });
    expect(deliveryTestingTitle(seeded, false)).toBe('Test draft: 3 Sandbox tests, no run on record');
    expect(deliveryTestingTitle(seeded, true)).toBe('Test draft: 3 ABAP Unit tests, no run on record');
    expect(deliveryTestingTitle({ testCases: [] }, false)).toBe('No test suite generated');
  });

  test('a covering receipt: both report its verdicts, not the stored strings', () => {
    const receipt = receiptFor(seeded, [
      { id: 't1', status: 'Passed' },
      { id: 't2', status: 'Failed' },
      { id: 't3', status: 'Passed' },
    ]);
    const project = { ...seeded, testRunReceipt: receipt };
    const run = lastRun(project, null);
    expect(run.kind).toBe('recorded');
    if (run.kind === 'recorded') expect(run.counts).toEqual({ passed: 2, failed: 1, noResult: 0, total: 3 });
    expect(deliveryTestingTitle(project, false)).toBe('2 of 3 Sandbox tests passed');
    // A receipt for other code covers nothing: back to a draft on both screens.
    const rewritten = { ...project, generatedCode: 'export const ok = false;' };
    expect(lastRun(rewritten, null).kind).toBe('earlier');
    expect(deliveryTestingTitle(rewritten, false)).toBe('Test draft: 3 Sandbox tests, no run on record');
  });

  test('the delivery page takes its headline from that function', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app/(app)/project/[projectId]/delivery/page.tsx'), 'utf8');
    expect(src).toContain('deliveryTestingTitle(project, isAbapCloud)');
    expect(src, 'Delivery counts stored status strings for its headline again').not.toMatch(/\$\{testsPassed\} of \$\{testCaseCount\}/);
  });
});

// ── Rendered (emulators and a dev server) ─────────────────────────────────────

/** A suite the runner can execute against the base fixture's `export const ok = true;`. */
const RUNNABLE_SUITE = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert';",
  "test('t1: runs', () => { assert.ok(true); });",
].join('\n');

/** A second project of the same account, the base project's fields changed by `over`. */
async function cloneProject(account: SeededProject, suffix: string, over: Record<string, unknown>): Promise<string> {
  const base = await adminGetDoc('projects', account.projectId);
  const id = `${account.projectId}-${suffix}`;
  await adminSetDoc('projects', id, { ...base, ...over, activeRunId: account.runId, createdAt: new Date() });
  const run = await adminGetDoc(`projects/${account.projectId}/runs`, account.runId);
  await adminSetDoc(`projects/${id}/runs`, account.runId, { ...run, projectId: id });
  return id;
}

/** The stage must believe it may call a model; whether this machine has a key is not the subject. */
async function testingModelAvailable(page: Page) {
  await page.route('**/api/model-stages*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true },
        keyAvailable: true,
        keySource: 'community',
      }),
    }),
  );
}

async function openTesting(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/testing`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testing-flow]')).toBeVisible({ timeout: 90000 });
}

test.describe('the Testing tool as one guided flow', () => {
  test.describe.configure({ mode: 'serial' });
  let account: SeededProject;
  let emptyId = '';
  let abapId = '';
  let runnableId = '';

  test.beforeAll(async () => {
    // Seeding goes through the shared emulators; the default 30 s is not always enough.
    test.setTimeout(180 * 1000);
    // Rich: a side-by-side (CAP) project with three scenarios, two stored as Passed, no run.
    account = await seedStageProject({ prefix: 'tguided', acceptTerms: true, rich: true });
    emptyId = await cloneProject(account, 'empty', { testCases: [] });
    abapId = await cloneProject(account, 'abap', { extensibilityRoute: 'In-App Extension (ABAP Cloud)' });
    runnableId = await cloneProject(account, 'run', {
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
      generatedCode: 'export const ok = true;\n',
      testSuite: { code: RUNNABLE_SUITE },
      testCases: [{ id: 't1', name: 'Runs', category: 'Unit', status: 'Pending' }],
    });
  });

  test('an empty project opens on the answer: one action beside it, and no run before there is anything to run', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await testingModelAvailable(page);
    await signInThroughForm(page, account);
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await openTesting(page, emptyId);

      // What the tool does, in one sentence, and where every result runs (ADR-131).
      const lead = page.locator('[data-testing-lead]');
      await expect(lead).toContainText('isolated runner against SAP mocks');
      await expect(lead).not.toContainText(/simulat/i);

      // The answer first (S2): not tested, and the one next step beside it.
      await expect(page.locator('[data-testing-answer="not-started"]')).toContainText('Not tested yet');
      const generate = page.locator('[data-answer-card]').getByRole('button', { name: 'Write the scenarios' });
      await expect(generate).toBeVisible();
      await expect(generate).toHaveAttribute('data-cc-button', 'primary');
      const box = (await generate.boundingBox())!;
      expect(box.y + box.height, `${width}px: the first action is below the fold`).toBeLessThanOrEqual(height);
      await expect(page.locator('[data-facet="open"]')).toContainText('Everything');

      // No pipeline of zeros, no run button before there is anything to run.
      await expect(page.locator('[data-test-pipeline]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /against SAP mocks$/ })).toHaveCount(0);

      // No nested navigation: no tab list, no environment switch.
      await expect(page.getByRole('tablist')).toHaveCount(0);
      // Testing is one page for every reader (ADR-131, ADR-126 (1)): no view switch, the note in its place — and
      // no radio group of the tool's own.
      await expect(page.getByRole('radiogroup')).toHaveCount(0);
      await expect(page.locator('[data-stage-view-switch]')).toHaveCount(0);
      await expect(page.getByText('Check tenant connection', { exact: true })).toHaveCount(0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px: sideways scroll`).toBeLessThanOrEqual(0);
    }
  });

  test('with scenarios the answer offers the run, the facets count them, and the tenant is a place in Settings', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await testingModelAvailable(page);
    await signInThroughForm(page, account);
    await openTesting(page, account.projectId);

    // The facets, from the case list and the record: three written, not run —
    // whatever the stored "Passed" strings say.
    await expect(page.locator('[data-testing-answer="written"]')).toContainText('Not tested yet');
    await expect(page.locator('[data-facet="scenarios"]')).toContainText('3 written');
    await expect(page.locator('[data-facet="result"]')).toContainText('Not run');
    await expect(page.locator('[data-scenario-verdict="not-run"]')).toHaveCount(3);

    const run = page.locator('[data-answer-card]').getByRole('button', { name: 'Run the 3 scenarios against SAP mocks' });
    await expect(run).toBeEnabled();
    await expect(page.locator('[data-testing-ran] [data-test-place="here"][data-test-place-active]')).toBeVisible();
    // Still no counters: nothing has run.
    await expect(page.locator('[data-test-pipeline]')).toHaveCount(0);

    // The tenant: one of the three places, locked, its connection check in Settings (ADR-131 S9).
    await expect(page.locator('[data-test-place="tenant"]')).toContainText('Locked');
    await expect(page.locator('[data-live-test-lock]')).toHaveCount(1);
    await expect(page.locator('[data-live-test-lock] a')).toHaveAttribute('href', '/settings#sap-test-system');
    await expect(page.locator('[data-testing-panel="live"]')).toHaveCount(0);
  });

  test('Run asks /api/run-tests, against mocks, and a refusal is said on the page', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await testingModelAvailable(page);
    // The failure explanation goes to a model; not the subject here.
    await page.route('**/api/gemini', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"off"}' }));
    const refusal = 'No test runner is configured for this deployment.';
    await page.route('**/api/run-tests', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ output: '', error: refusal, exitCode: 1 }) }),
    );
    await signInThroughForm(page, account);
    await openTesting(page, account.projectId);

    const sent = page.waitForRequest((r) => r.url().includes('/api/run-tests') && r.method() === 'POST');
    await page.locator('[data-answer-card]').getByRole('button', { name: 'Run the 3 scenarios against SAP mocks' }).click();
    const body = (await sent).postDataJSON();
    expect(body.projectId).toBe(account.projectId);
    expect(body.selectedTestIds).toEqual(['t1', 't2', 't3']);
    expect(body.s4Environment ?? 'mock').toBe('mock');

    const error = page.locator('[data-test-run-error]');
    await expect(error).toBeVisible({ timeout: 30000 });
    await expect(error).toContainText(refusal);
    // No wall of "Not determined" for a run that never happened.
    await expect(page.getByText(/produced no result/)).toHaveCount(0);
    await expect(page.locator('[data-test-pipeline]')).toHaveCount(0);
  });

  test('a run through the real path comes back with verdicts, and the answer says where it ran', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await testingModelAvailable(page);
    await signInThroughForm(page, account);
    await openTesting(page, runnableId);

    const response = page.waitForResponse((r) => r.url().includes('/api/run-tests') && r.request().method() === 'POST', { timeout: 240000 });
    await page.locator('[data-answer-card]').getByRole('button', { name: 'Run the 1 scenario against SAP mocks' }).click();
    expect((await response).status(), 'the run was refused').toBe(200);

    await expect(page.locator('[data-scenario-verdict="pass"]')).toHaveCount(1, { timeout: 60000 });
    await expect(page.locator('[data-test-pipeline]')).toBeVisible();
    await expect(page.locator('[data-test-run-error]')).toHaveCount(0);
    await expect(page.locator('[data-testing-answer="passed"]')).toContainText('Passed against SAP mocks');
    await expect(page.locator('[data-facet="result"]')).toContainText('Not in your SAP system');
  });

  test('an ABAP Cloud project offers no run, and says why before the click', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await testingModelAvailable(page);
    const runRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/run-tests')) runRequests.push(r.method());
    });
    await signInThroughForm(page, account);
    await openTesting(page, abapId);

    const ran = page.locator('[data-testing-ran]');
    await expect(ran).toContainText('Nothing is compiled or executed in SAP ADT here');
    await expect(ran).not.toContainText(/simulat/i);
    await expect(ran.locator('[data-test-place="your-system"][data-test-place-active]')).toBeVisible();
    await expect(ran.locator('[data-test-place="here"]')).toContainText('Not for this route');
    // No run is offered; the next step is to record the result from your system.
    await expect(page.getByRole('button', { name: /against SAP mocks$/ })).toHaveCount(0);
    await expect(page.locator('[data-answer-card]').getByRole('link', { name: 'Record the result from your system' })).toBeVisible();
    // No result appears from nowhere either.
    await expect(page.locator('[data-scenario-verdict="none"]')).toHaveCount(0);
    expect(runRequests).toEqual([]);
  });
});

test.describe("a saved connection is not Testing's to show", () => {
  let account: SeededProject;

  test.beforeAll(async () => {
    // Seeding goes through the shared emulators; the default 30 s is not always enough.
    test.setTimeout(180 * 1000);
    account = await seedStageProject({ prefix: 'tguided-conn', acceptTerms: true });
    // An account with BYOT granted and a connection in the vault — only the
    // non-secret metadata the profile carries; nothing here reaches a tenant.
    await adminMergeDoc('users', account.uid, {
      s4TenantAccessRequested: true,
      s4TenantAccessAllowed: true,
      s4Meta: { configured: true, url: 'https://my000000-api.s4hana.cloud.sap', username: 'CC_TEST', authType: 'basic', tokenUrl: '' },
    });
    // Left on the tenant tab by an earlier build.
    await adminMergeDoc('projects', account.projectId, { s4Environment: 'live' });
  });

  test('a project an earlier build left on the tenant tab opens on the answer, and the run is still against mocks', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInThroughForm(page, account);
    await openTesting(page, account.projectId);

    // The connection lives in Settings (ADR-131 (5)); Testing shows no form and no saved URL.
    await expect(page.locator('[data-answer-card]')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('https://my000000-api.s4hana.cloud.sap')).toHaveCount(0);
    await expect(page.locator('[data-live-test-lock] a')).toHaveAttribute('href', '/settings#sap-test-system');
    // The stored 'live' is not a mode: the run of the scenarios is offered and enabled.
    await expect(page.locator('[data-testing-results]').getByRole('button', { name: /against SAP mocks$/ })).toBeEnabled();
  });
});

// ── Pictures for a before/after sheet (`TGUIDED_SHOT=<dir>`, `TGUIDED_PHASE=before|after`); off in CI ──
test.describe('pictures', () => {
  test.skip(!process.env.TGUIDED_SHOT, 'pictures only on request');

  test('empty, with scenarios and ABAP Cloud, desktop and phone', async ({ page }) => {
    test.setTimeout(600 * 1000);
    const dir = process.env.TGUIDED_SHOT!;
    const phase = process.env.TGUIDED_PHASE || 'after';
    const account = await seedStageProject({ prefix: 'tguided-shot', acceptTerms: true, rich: true });
    const ids = {
      empty: await cloneProject(account, 'empty', { testCases: [] }),
      scenarios: account.projectId,
      abap: await cloneProject(account, 'abap', { extensibilityRoute: 'In-App Extension (ABAP Cloud)' }),
    };
    await testingModelAvailable(page);
    await signInThroughForm(page, account);
    for (const [name, id] of Object.entries(ids)) {
      for (const [width, height] of [[1440, 900], [390, 844]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(`/project/${id}/testing`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-stage-title]').first()).toBeVisible({ timeout: 90000 });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${dir}/testing-guided-${phase}-${name}-${width}-fold.png` });
        await page.screenshot({ path: `${dir}/testing-guided-${phase}-${name}-${width}.png`, fullPage: true });
      }
    }
  });
});

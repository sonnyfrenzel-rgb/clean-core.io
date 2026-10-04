import { test, expect, type Page } from '@playwright/test';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';

/**
 * ADR-075, rendered: the ABAP Cloud route records its test result from the
 * reader's own SAP system, and the handover takes it.
 *
 *   - upload a JUnit XML → every scenario row wears *Imported · passed*, the
 *     test method that is not a scenario is listed as such, as text;
 *   - Delivery: the tests link is on record as *Imported*, and "What a real
 *     handover still needs" no longer asks for tests;
 *   - confirm without a file → *Confirmed · by you · self-declaration*, and
 *     Delivery says so;
 *   - a test name carrying markup is shown as text and never becomes an element.
 */

const SCENARIOS = [
  { id: 'TC_01', name: 'Accept a valid claim', category: 'Unit' },
  { id: 'TC_02', name: 'Reject a claim over the limit', category: 'Unit' },
];

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="ZCL_EXPENSE" tests="3">
    <testcase classname="ZCL_EXPENSE.LTCL_EXPENSE" name="TC_01_ACCEPT_VALID"/>
    <testcase classname="ZCL_EXPENSE.LTCL_EXPENSE" name="TC_02_REJECT_OVER_LIMIT"/>
    <testcase classname="ZCL_EXPENSE.LTCL_EXPENSE" name="HELPER &lt;img src=x onerror=&quot;window.__pwned=1&quot;&gt;"/>
  </testsuite>
</testsuites>`;

async function openTesting(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/testing`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testing-flow]')).toBeVisible({ timeout: 90000 });
}

async function openDelivery(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/delivery`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-chain-link="tests"]')).toBeAttached({ timeout: 90000 });
}

test.describe('the result from your SAP system, on the ABAP Cloud route', () => {
  test.describe.configure({ mode: 'serial' });
  let account: SeededProject;
  let importId = '';
  let confirmId = '';

  async function abapClone(suffix: string): Promise<string> {
    const base = await adminGetDoc('projects', account.projectId);
    const id = `${account.projectId}-${suffix}`;
    await adminSetDoc('projects', id, {
      ...base,
      extensibilityRoute: 'In-App Extension (ABAP Cloud)',
      approvedByArchitect: true,
      approvedBy: account.email,
      generatedCode: 'CLASS zcl_expense DEFINITION PUBLIC. ENDCLASS.\nCLASS zcl_expense IMPLEMENTATION. ENDCLASS.\n',
      testSuite: { code: 'CLASS ltcl_expense DEFINITION FOR TESTING. PRIVATE SECTION. METHODS tc_01_accept_valid FOR TESTING. METHODS tc_02_reject_over_limit FOR TESTING. ENDCLASS.' },
      testCases: SCENARIOS,
      activeRunId: account.runId,
      createdAt: new Date(),
    });
    const run = await adminGetDoc(`projects/${account.projectId}/runs`, account.runId);
    await adminSetDoc(`projects/${id}/runs`, account.runId, { ...run, projectId: id });
    return id;
  }

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    account = await seedStageProject({ prefix: 'sapres-ui', acceptTerms: true });
    importId = await abapClone('import');
    confirmId = await abapClone('confirm');
  });

  test('upload a JUnit XML: every row wears Imported · passed, and Delivery takes it', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);

    // Before: Delivery asks for an executed suite, and the item leads to the card.
    await openDelivery(page, importId);
    const item = page.locator('[data-still-needed-item="tests"]');
    await expect(item).toBeVisible();
    await expect(item.locator('a')).toHaveAttribute('href', `/project/${importId}/testing#testing-sap-result`);

    await openTesting(page, importId);
    const card = page.locator('[data-testing-sap-result]');
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Upload the ABAP Unit result (JUnit XML)' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Confirm without a file' })).toBeVisible();
    // Step 2 stays a step that cannot run here, with no button of its own.
    const runStep = page.locator('[data-testing-step="run"]');
    await expect(runStep).toHaveAttribute('data-step-state', 'unavailable');
    await expect(runStep.getByRole('button')).toHaveCount(0);

    const answered = page.waitForResponse((r) => r.url().includes('/test-results') && r.request().method() === 'POST');
    await card.locator('[data-sap-result-file]').setInputFiles({ name: 'aunit-result.xml', mimeType: 'application/xml', buffer: Buffer.from(JUNIT) });
    expect((await answered).status()).toBe(200);

    // The rows.
    for (const s of SCENARIOS) {
      const row = page.locator(`[data-scenario-row][data-scenario-id="${s.id}"]`);
      await expect(row.locator('[data-scenario-outside="passed"]')).toBeVisible({ timeout: 30000 });
      await expect(row.locator('[data-scenario-outside="passed"] [data-provenance="imported"]')).toContainText('Imported');
      await expect(row.locator('[data-scenario-outside="passed"]')).toContainText('passed');
    }
    // Nothing anywhere calls it proven.
    await expect(page.locator('[data-testing-flow] [data-provenance="proven"]')).toHaveCount(0);
    // Step 2 shows the result from outside instead of "Not run here".
    await expect(runStep).toHaveAttribute('data-step-state', 'done');
    await expect(runStep).toContainText('No failure in your SAP system');
    await expect(runStep.locator('[data-testing-run-outside="imported"]')).toBeVisible();

    // The method that is not a scenario is listed — its markup as text, inert.
    const unmatched = card.locator('[data-sap-result-unmatched]');
    await expect(unmatched).toContainText('1 test method is not one of the scenarios');
    await unmatched.getByRole('button').first().click();
    await expect(unmatched).toContainText('HELPER <img src=x onerror="window.__pwned=1">');
    await expect(unmatched.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

    // The tool mark: Testing is done now — a check, and not marked Next.
    const tool = page.locator('[data-stage-tools="open"] a[data-workspace-tool="testing"]');
    await expect(tool).toHaveAttribute('data-workspace-tool-mark-kind', 'check');
    await expect(tool).not.toHaveAttribute('data-workspace-tool-next', '');

    // Delivery.
    await openDelivery(page, importId);
    const link = page.locator('[data-chain-link="tests"]');
    await expect(link).toHaveAttribute('data-chain-state', 'on-record');
    await expect(link.locator('[data-provenance="imported"]')).toContainText('from your system');
    // The tests link shows Delivery's integrity line, not the bare chain value:
    // the title says where the result came from, the line says it did not run here.
    await expect(link.locator('[data-delivery-testing]')).toHaveText('2 of 2 scenarios passed — ABAP Unit, imported from your SAP system');
    await expect(link).toContainText('Not run here — the result was imported from your SAP system');
    await expect(link).not.toContainText('without a result');
    await expect(link).not.toContainText(/proven|verified/i);
    await expect(page.locator('[data-still-needed-item="tests"]')).toHaveCount(0);
  });

  test('confirm without a file: done, and labelled a self-declaration', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInThroughForm(page, account);
    await openTesting(page, confirmId);
    const card = page.locator('[data-testing-sap-result]');
    await card.getByRole('button', { name: 'Confirm without a file' }).click();
    const form = card.locator('[data-sap-result-confirm-form]');
    await expect(form).toBeVisible();
    await form.getByLabel(/^Tests passed/).fill('2');
    await form.getByLabel(/^Tests failed/).fill('0');
    await form.getByLabel(/^System \(SID/).fill('S4D / 100');
    await form.getByLabel(/^Date of the run/).fill('2026-10-02');
    const answered = page.waitForResponse((r) => r.url().includes('/test-results') && r.request().method() === 'POST');
    await form.getByRole('button', { name: /I ran these in my SAP system/ }).click();
    expect((await answered).status()).toBe(200);

    const current = card.locator('[data-sap-result-current="confirmed"]');
    await expect(current).toBeVisible({ timeout: 30000 });
    await expect(current.locator('[data-provenance="confirmed"]')).toContainText('by you · self-declaration');
    await expect(current).toHaveAttribute('data-sap-result-verifies', 'yes');
    await expect(page.locator(`[data-scenario-row][data-scenario-id="TC_01"] [data-scenario-outside="confirmed-passed"]`)).toBeVisible();
    // A phone: nothing scrolls sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await openDelivery(page, confirmId);
    const link = page.locator('[data-chain-link="tests"]');
    await expect(link).toHaveAttribute('data-chain-state', 'on-record');
    await expect(link.locator('[data-provenance="confirmed"]')).toContainText('self-declaration');
    await expect(link).toContainText('S4D / 100');
    await expect(link.locator('[data-delivery-testing]')).toContainText('confirmed by you');
    await expect(link).toContainText('Not run here — your statement that it ran in your SAP system');
    await expect(page.locator('[data-still-needed-item="tests"]')).toHaveCount(0);
  });
});
